/**
 * Demo 录制器
 * 负责录制图的执行过程，将执行器事件序列化保存
 *
 * 设计原则：DemoRecorder 主动控制录制流程
 * - 持有对 executor 的引用
 * - 自行管理事件订阅
 * - 外部只需调用 startRecording / stopRecording
 */
import type { AnoraGraph } from '../graph'
import type { SerializedGraph } from '../types'
import type { ExecutorEvent, ExecutorEventListener } from '../executor'
import { ExecutorEventType } from '../executor'
import type { DemoRecording, SerializedExecutorEvent, TimestampedEvent } from './types'

/** Executor 接口 - DemoRecorder 需要的方法 */
interface IExecutorForRecording {
  on(listener: ExecutorEventListener): () => void
}

/** Demo 格式版本 */
const DEMO_FORMAT_VERSION = '2.0.0' as const

export class DemoRecorder {
  /** 录制的事件列表 */
  private events: TimestampedEvent[] = []

  /** 录制开始时间 */
  private startTime: number = 0

  /** 是否正在录制 */
  private _isRecording: boolean = false

  /** 初始图状态（包含节点位置） */
  private initialGraph: SerializedGraph | null = null

  /** 被绑定的执行器 */
  private executor: IExecutorForRecording | null = null

  /** 被绑定的图 */
  private graph: AnoraGraph | null = null

  /** 事件订阅取消函数 */
  private unsubscribe: (() => void) | null = null

  /** 录制状态变更回调 */
  onRecordingChange?: (isRecording: boolean, eventCount: number) => void

  /** 获取是否正在录制 */
  get isRecording(): boolean {
    return this._isRecording
  }

  /** 获取已录制的事件数量 */
  get eventCount(): number {
    return this.events.length
  }

  /**
   * 绑定执行器
   * 录制器需要知道要监听哪个执行器的事件
   * 如果正在录制，会重新订阅新的执行器
   */
  bindExecutor(executor: IExecutorForRecording): void {
    const wasRecording = this._isRecording

    // 如果正在录制，先取消旧的订阅
    if (wasRecording && this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    this.executor = executor

    // 如果之前在录制，立即重新订阅新的执行器
    if (wasRecording && this.executor) {
      this.unsubscribe = this.executor.on((event) => {
        this.recordEvent(event)
      })
      console.log('[DemoRecorder] Rebound to new executor while recording')
    }
  }

  /**
   * 绑定图
   * 录制器需要知道要序列化哪个图
   */
  bindGraph(graph: AnoraGraph): void {
    this.graph = graph
  }

  /**
   * 开始录制
   * @param nodePositions 节点位置映射（从外部传入，因为位置信息在 UI 层）
   * @param nodeSizes 节点尺寸映射（从外部传入，因为尺寸信息在 UI 层）
   */
  startRecording(
    nodePositions: Map<string, { x: number; y: number }>,
    nodeSizes?: Map<string, { width: number; height: number }>,
  ): void {
    if (this._isRecording) return
    if (!this.executor) {
      console.warn('[DemoRecorder] No executor bound, call bindExecutor first')
      return
    }
    if (!this.graph) {
      console.warn('[DemoRecorder] No graph bound, call bindGraph first')
      return
    }

    // 清空之前的录制
    this.clear()

    // 保存初始状态（包含节点位置和尺寸）
    console.log(
      '[DemoRecorder] nodePositions received:',
      nodePositions.size,
      Array.from(nodePositions.entries()),
    )
    this.initialGraph = this.graph.serialize(nodePositions, nodeSizes)
    console.log(
      '[DemoRecorder] serialized nodes positions:',
      this.initialGraph.nodes.map((n) => ({ id: n.id, pos: n.position })),
    )

    // 订阅执行器事件
    this.unsubscribe = this.executor.on((event) => {
      this.recordEvent(event)
    })

    this._isRecording = true
    this.startTime = Date.now()
    this.onRecordingChange?.(true, 0)

    console.log('[DemoRecorder] Recording started')
  }

  /**
   * 停止录制
   */
  stopRecording(): void {
    if (!this._isRecording) return

    // 取消事件订阅
    this.unsubscribe?.()
    this.unsubscribe = null

    this._isRecording = false
    this.onRecordingChange?.(false, this.events.length)

    console.log(`[DemoRecorder] Recording stopped, ${this.events.length} events captured`)
  }

  /**
   * 记录执行器事件（内部使用）
   */
  private recordEvent(event: ExecutorEvent): void {
    if (!this._isRecording) return

    const timestamp = Date.now() - this.startTime
    const serialized = this.serializeEvent(event)

    if (!serialized) {
      console.error('[DemoRecorder] Failed to serialize event, skipping:', event.type, event)
      return
    }

    this.events.push({
      timestamp,
      event: serialized,
    })

    this.onRecordingChange?.(true, this.events.length)
  }

  /**
   * 序列化执行器事件
   */
  private serializeEvent(event: ExecutorEvent): SerializedExecutorEvent {
    switch (event.type) {
      case ExecutorEventType.StateChange:
        return {
          type: ExecutorEventType.StateChange,
          oldState: event.oldState,
          newState: event.newState,
        }

      case ExecutorEventType.Start:
        return { type: ExecutorEventType.Start }

      case ExecutorEventType.Iteration:
        return {
          type: ExecutorEventType.Iteration,
          iteration: event.iteration,
        }

      case ExecutorEventType.NodeStart:
        return {
          type: ExecutorEventType.NodeStart,
          nodeId: event.node.id,
        }

      case ExecutorEventType.NodeComplete:
        return {
          type: ExecutorEventType.NodeComplete,
          nodeId: event.node.id,
          success: event.success,
          error: event.error?.message,
        }

      case ExecutorEventType.DataPropagate:
        return {
          type: ExecutorEventType.DataPropagate,
          transfers: event.transfers.map((t) => ({
            fromPortId: t.fromPortId,
            toPortId: t.toPortId,
            data: t.data,
          })),
        }

      case ExecutorEventType.Complete:
        return {
          type: ExecutorEventType.Complete,
          result: {
            finishReason: event.result.finishReason,
            iterations: event.result.iterations,
            duration: event.result.duration,
            error: event.result.error?.message,
          },
        }

      case ExecutorEventType.Cancelled:
        return { type: ExecutorEventType.Cancelled }

      case ExecutorEventType.Error:
        return {
          type: ExecutorEventType.Error,
          error: event.error.message,
        }

      default: {
        // 捕获未处理的事件类型
        console.warn('[DemoRecorder] Unknown event type:', (event as { type: string }).type, event)
        // 返回一个带有原始 type 的对象，避免丢失事件
        return { type: (event as { type: string }).type } as SerializedExecutorEvent
      }
    }
  }

  /**
   * 导出录制数据
   */
  exportRecording(metadata?: {
    title?: string
    description?: string
    iterationDelay?: number
  }): DemoRecording {
    if (!this.initialGraph) {
      throw new Error('No recording data available')
    }

    const lastEvent = this.events[this.events.length - 1]
    return {
      version: DEMO_FORMAT_VERSION,
      initialGraph: this.initialGraph,
      events: [...this.events],
      metadata: {
        title: metadata?.title ?? 'Untitled Recording',
        description: metadata?.description ?? '',
        createdAt: new Date().toISOString(),
        iterationDelay: metadata?.iterationDelay ?? 0,
        duration: lastEvent ? lastEvent.timestamp : 0,
      },
    }
  }

  /**
   * 清空录制数据
   */
  clear(): void {
    this.events = []
    this.startTime = 0
    this.initialGraph = null
  }
}
