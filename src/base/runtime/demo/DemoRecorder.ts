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
import type { BasicExecutor, ExecutorEvent } from '../executor'
import type { DemoRecording, SerializedExecutorEvent, TimestampedEvent } from './types'

/** Demo 格式版本 */
const DEMO_FORMAT_VERSION = '2.0.0' as const

export class DemoRecorder {
  /** 录制的事件列表 */
  private events: TimestampedEvent[] = []

  /** 录制开始时间 */
  private startTime: number = 0

  /** 是否正在录制 */
  private _isRecording: boolean = false

  /** 初始图状态 */
  private initialGraph: SerializedGraph | null = null

  /** 节点位置快照 */
  private nodePositions: Record<string, { x: number; y: number }> = {}

  /** 被绑定的执行器 */
  private executor: BasicExecutor | null = null

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
   */
  bindExecutor(executor: BasicExecutor): void {
    // 如果正在录制，先停止
    if (this._isRecording) {
      this.stopRecording()
    }
    this.executor = executor
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
   */
  startRecording(nodePositions: Map<string, { x: number; y: number }>): void {
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

    // 保存初始状态
    this.initialGraph = this.graph.serialize()

    // 转换节点位置为普通对象
    this.nodePositions = {}
    for (const [nodeId, pos] of nodePositions) {
      this.nodePositions[nodeId] = { x: pos.x, y: pos.y }
    }

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
      case 'start':
        return { type: 'start' }

      case 'iteration':
        return {
          type: 'iteration',
          iteration: event.iteration,
        }

      case 'node-start':
        return {
          type: 'node-start',
          nodeId: event.node.id,
        }

      case 'node-complete':
        return {
          type: 'node-complete',
          nodeId: event.node.id,
          success: event.success,
          error: event.error?.message,
        }

      case 'data-propagate':
        return {
          type: 'data-propagate',
          transfers: event.transfers.map((t) => ({
            fromPortId: t.fromPortId,
            toPortId: t.toPortId,
            data: t.data,
          })),
        }

      case 'complete':
        return {
          type: 'complete',
          result: {
            status: event.result.status,
            iterations: event.result.iterations,
            duration: event.result.duration,
            error: event.result.error?.message,
          },
        }

      case 'cancelled':
        return { type: 'cancelled' }

      case 'error':
        return {
          type: 'error',
          error: event.error.message,
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
      nodePositions: this.nodePositions,
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
    this.nodePositions = {}
  }
}
