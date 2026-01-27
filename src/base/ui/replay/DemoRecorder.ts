/**
 * Demo 录制器
 *
 * 使用私有 Timeline 存储录制事件
 *
 * 设计原则：
 * - 私有 Timeline（maxEvents: -1，永不清理）存储录制期间的事件
 * - 两种事件源：
 *   1. Timeline（直接监听，事件已经是 TimelineEvent）
 *   2. Executor（ExecutorEvent 已经是可序列化的，直接包装为 ExecutionTimelineEvent）
 * - 所有事件类型一视同仁，通过 category 区分
 */
import type { AnoraGraph } from '@/base/runtime/graph'
import type { ExecutorEvent, ExecutorEventListener } from '@/base/runtime/executor'
import {
  Timeline,
  TimelineEventCategory,
  type ExecutionTimelineEvent,
  type TimelineRecording,
} from '@/base/runtime/timeline'

export class DemoRecorder {
  /** 私有 Timeline（存储录制事件，永不清理） */
  private timeline: Timeline

  /** 被绑定的图 */
  private graph: AnoraGraph | null = null

  /** 事件源订阅列表 */
  private subscriptions: Array<() => void> = []

  /** 是否正在录制 */
  private _isRecording: boolean = false

  /** 待绑定的 Timeline 事件源 */
  private pendingTimelines: Timeline[] = []

  /** 待绑定的 Executor */
  private pendingExecutor: { on(listener: ExecutorEventListener): () => void } | null = null

  /** 录制状态变更回调 */
  onRecordingChange?: (isRecording: boolean, eventCount: number) => void

  constructor() {
    // 私有 Timeline，永不自动清理
    this.timeline = new Timeline(-1)
  }

  /** 获取是否正在录制 */
  get isRecording(): boolean {
    return this._isRecording
  }

  /** 获取已录制的事件数量 */
  get eventCount(): number {
    return this.timeline.eventCount
  }

  /**
   * 获取 Timeline（用于回放）
   */
  getTimeline(): Timeline {
    return this.timeline
  }

  /**
   * 绑定图
   */
  bindGraph(graph: AnoraGraph): void {
    this.graph = graph
  }

  /**
   * 添加 Timeline 事件源（事件已经是 TimelineEvent，无需转换）
   */
  addTimeline(source: Timeline): void {
    this.pendingTimelines.push(source)

    // 如果已经在录制，立即订阅
    if (this._isRecording) {
      this.subscribeTimeline(source)
    }
  }

  /**
   * 绑定执行器（ExecutorEvent 需要转换为 TimelineEvent）
   */
  bindExecutor(executor: { on(listener: ExecutorEventListener): () => void }): void {
    this.pendingExecutor = executor

    // 如果已经在录制，立即订阅
    if (this._isRecording) {
      this.subscribeExecutor(executor)
    }
  }

  /**
   * 开始录制
   */
  startRecording(
    nodePositions: Map<string, { x: number; y: number }>,
    nodeSizes?: Map<string, { width: number; height: number }>,
  ): void {
    if (this._isRecording) return
    if (!this.graph) {
      console.warn('[DemoRecorder] No graph bound, call bindGraph first')
      return
    }

    // 序列化当前图状态
    const initialGraph = this.graph.serialize(nodePositions, nodeSizes)

    // 清空 Timeline 并设置初始图
    this.timeline.clear()
    this.timeline.setInitialGraph(initialGraph)

    this._isRecording = true

    // 订阅所有 Timeline 事件源
    for (const source of this.pendingTimelines) {
      this.subscribeTimeline(source)
    }

    // 订阅 Executor
    if (this.pendingExecutor) {
      this.subscribeExecutor(this.pendingExecutor)
    }

    this.onRecordingChange?.(true, 0)
    console.log('[DemoRecorder] Recording started')
  }

  /**
   * 订阅 Timeline 事件源
   */
  private subscribeTimeline(source: Timeline): void {
    const unsubscribe = source.on((systemEvent) => {
      if (!this._isRecording) return

      // 只处理 EVENT_ADDED 事件
      if (systemEvent.type !== 'event_added') return

      const event = systemEvent.event
      // 直接复制事件（不含 timestamp 和 id，让目标 Timeline 生成新的）
      const { timestamp: _, id: __, ...eventData } = event
      this.timeline.addEvent(eventData, false)
      this.onRecordingChange?.(true, this.eventCount)
    })
    this.subscriptions.push(unsubscribe)
  }

  /**
   * 订阅 Executor 事件源
   * ExecutorEvent 已经是可序列化的，直接包装为 ExecutionTimelineEvent
   */
  private subscribeExecutor(executor: { on(listener: ExecutorEventListener): () => void }): void {
    const unsubscribe = executor.on((event: ExecutorEvent) => {
      if (!this._isRecording) return

      // ExecutorEvent 已经是可序列化格式，直接包装
      const timelineEvent: Omit<ExecutionTimelineEvent, 'timestamp' | 'id'> = {
        category: TimelineEventCategory.EXECUTION,
        event: event,
      }
      this.timeline.addEvent(timelineEvent, false)
      this.onRecordingChange?.(true, this.eventCount)
    })
    this.subscriptions.push(unsubscribe)
  }

  /**
   * 停止录制
   */
  stopRecording(): void {
    if (!this._isRecording) return

    // 取消所有订阅
    for (const unsubscribe of this.subscriptions) {
      unsubscribe()
    }
    this.subscriptions = []

    this._isRecording = false

    this.onRecordingChange?.(false, this.eventCount)
    console.log(`[DemoRecorder] Recording stopped, ${this.eventCount} events captured`)
  }

  /**
   * 导出录制数据
   */
  exportRecording(metadata?: {
    title?: string
    description?: string
    iterationDelay?: number
  }): TimelineRecording | null {
    this.timeline.setMetadata({
      title: metadata?.title ?? 'Untitled Recording',
      description: metadata?.description ?? '',
      iterationDelay: metadata?.iterationDelay ?? 0,
    })
    return this.timeline.export()
  }

  /**
   * 清空录制数据
   */
  clear(): void {
    this.timeline.clear()
  }
}
