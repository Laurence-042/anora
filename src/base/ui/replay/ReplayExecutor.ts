/**
 * ReplayExecutor - 回放执行器（基于 Timeline 重构版）
 *
 * 使用 Timeline 的游标机制进行回放
 * 通过 EventHandlerRegistry 处理不同类型的事件
 *
 * 使用方式：
 * 1. loadRecording(recording, graph) - 加载录制数据
 * 2. play() - 开始回放
 * 3. pause() / resume() - 暂停/恢复
 * 4. stepForward() / stepBackward() - 单步
 * 5. seekToTime(ms) - 跳转到指定时间
 */

import type { AnoraGraph } from '@/base/runtime/graph'
import {
  Timeline,
  TimelineEventCategory,
  type TimelineRecording,
  type TimelineEvent,
  type ExecutionTimelineEvent,
} from '@/base/runtime/timeline'
import { ExecutorEventType } from '@/base/runtime/executor'
import type { ExecutorEvent } from '@/base/runtime/executor'
import { EventHandlerRegistry } from './EventHandlerRegistry'
import type { EventReplayContext, GraphStore } from './types'

/**
 * 回放状态
 */
export enum ReplayState {
  /** 未加载 */
  Idle = 'idle',
  /** 已加载，准备播放 */
  Ready = 'ready',
  /** 正在播放 */
  Playing = 'playing',
  /** 已暂停 */
  Paused = 'paused',
  /** 播放完成 */
  Completed = 'completed',
}

/**
 * 回放事件类型
 */
export enum ReplayEventType {
  /** 状态变更 */
  StateChange = 'state_change',
  /** 位置变更 */
  PositionChange = 'position_change',
  /** 事件播放 */
  EventPlay = 'event_play',
}

/**
 * 回放事件
 */
export type ReplayEvent =
  | { type: ReplayEventType.StateChange; oldState: ReplayState; newState: ReplayState }
  | { type: ReplayEventType.PositionChange; index: number; time: number; total: number }
  | { type: ReplayEventType.EventPlay; event: TimelineEvent; executorEvent?: ExecutorEvent }

/**
 * 回放事件监听器
 */
export type ReplayEventListener = (event: ReplayEvent) => void

/**
 * 回放执行器
 */
export class ReplayExecutor {
  /** Timeline 实例 */
  private timeline: Timeline

  /** 当前图 */
  private graph: AnoraGraph | null = null

  /** 回放上下文 */
  private context: EventReplayContext | null = null

  /** 当前状态 */
  private _state: ReplayState = ReplayState.Idle

  /** 回放速度倍率 */
  playbackSpeed: number = 1.0

  /** 事件监听器 */
  private listeners: ReplayEventListener[] = []

  /** 播放定时器 */
  private playTimer: ReturnType<typeof setTimeout> | null = null

  /** 是否请求取消 */
  private cancelRequested: boolean = false

  constructor() {
    this.timeline = new Timeline()
  }

  // ============ 状态查询 ============

  get state(): ReplayState {
    return this._state
  }

  get isPlaying(): boolean {
    return this._state === ReplayState.Playing
  }

  get isPaused(): boolean {
    return this._state === ReplayState.Paused
  }

  get currentIndex(): number {
    return this.timeline.cursor
  }

  get totalEvents(): number {
    return this.timeline.eventCount
  }

  get totalDuration(): number {
    return this.timeline.getDuration()
  }

  get currentTime(): number {
    return this.timeline.getCurrentTime()
  }

  get progress(): number {
    if (this.totalDuration === 0) return 0
    return this.currentTime / this.totalDuration
  }

  // ============ 加载 ============

  /**
   * 加载录制数据
   * @param recording 录制数据
   * @param graph 图实例
   * @param graphStore 可选，用于回放编辑事件
   */
  loadRecording(recording: TimelineRecording, graph: AnoraGraph, graphStore?: GraphStore): void {
    console.log('[ReplayExecutor] loadRecording - raw events sample:', recording.events.slice(0, 3))
    this.timeline.import(recording)
    console.log(
      '[ReplayExecutor] loadRecording - imported events sample:',
      Array.from({ length: 3 }, (_, i) => this.timeline.getEvent(i)),
    )
    this.timeline.resetCursor() // 游标回到起点
    this.graph = graph

    this.context = {
      graph,
      graphStore, // 传递 graphStore 以支持编辑事件回放
      emitExecutorEvent: (event: ExecutorEvent) => {
        // 将执行器事件发射给监听器
        const timelineEvent = this.timeline.getCurrentEvent()
        if (timelineEvent) {
          this.emit({
            type: ReplayEventType.EventPlay,
            event: timelineEvent,
            executorEvent: event,
          })
        }
      },
    }

    this.setState(ReplayState.Ready)
  }

  /**
   * 获取初始图数据
   */
  getInitialGraph() {
    return this.timeline.getInitialGraph()
  }

  // ============ 播放控制 ============

  /**
   * 开始/恢复播放
   */
  play(): void {
    if (this._state === ReplayState.Idle) {
      console.warn('[ReplayExecutor] No recording loaded')
      return
    }

    if (this._state === ReplayState.Completed) {
      // 如果已完成，从头开始
      this.timeline.resetCursor()
    }

    this.cancelRequested = false
    this.setState(ReplayState.Playing)
    this.scheduleNextEvent()
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (this._state !== ReplayState.Playing) return

    this.cancelRequested = true
    if (this.playTimer) {
      clearTimeout(this.playTimer)
      this.playTimer = null
    }
    this.setState(ReplayState.Paused)
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (this._state !== ReplayState.Paused) return
    this.play()
  }

  /**
   * 停止并重置
   */
  stop(): void {
    this.cancelRequested = true
    if (this.playTimer) {
      clearTimeout(this.playTimer)
      this.playTimer = null
    }
    this.timeline.resetCursor()
    this.setState(ReplayState.Ready)
    this.emitPositionChange()
  }

  /**
   * 单步前进
   */
  stepForward(): boolean {
    if (!this.timeline.canMoveForward) {
      if (this._state !== ReplayState.Completed) {
        this.setState(ReplayState.Completed)
      }
      return false
    }

    const event = this.timeline.moveForward()
    if (event) {
      this.playEvent(event)
    }

    this.emitPositionChange()

    // 检查是否到达末尾
    if (!this.timeline.canMoveForward) {
      this.setState(ReplayState.Completed)
    } else if (this._state === ReplayState.Playing) {
      // 保持播放状态
    } else {
      this.setState(ReplayState.Paused)
    }

    return true
  }

  /**
   * 单步后退（只移动游标，不执行 undo）
   * 注意：对于执行事件，后退只是视觉上的，不会真正撤销节点执行
   */
  stepBackward(): boolean {
    if (!this.timeline.canMoveBackward) return false

    this.timeline.moveBackward()
    this.emitPositionChange()

    if (this._state === ReplayState.Completed) {
      this.setState(ReplayState.Paused)
    }

    return true
  }

  /**
   * 跳转到指定时间
   */
  seekToTime(timeMs: number): number {
    const index = this.timeline.seekToTime(timeMs)
    this.emitPositionChange()

    if (this._state === ReplayState.Completed && this.timeline.canMoveForward) {
      this.setState(ReplayState.Paused)
    }

    return index
  }

  /**
   * 跳转到指定索引
   */
  seekToIndex(index: number): void {
    this.timeline.setCursor(index)
    this.emitPositionChange()

    if (this._state === ReplayState.Completed && this.timeline.canMoveForward) {
      this.setState(ReplayState.Paused)
    }
  }

  // ============ 内部方法 ============

  /**
   * 调度下一个事件
   */
  private scheduleNextEvent(): void {
    if (this.cancelRequested || this._state !== ReplayState.Playing) return

    if (!this.timeline.canMoveForward) {
      this.setState(ReplayState.Completed)
      return
    }

    // 计算到下一个事件的延迟
    // 注意：getCurrentTime() 返回的是相对于第一个事件的时间
    // nextEvent.timestamp 是绝对时间戳，需要减去 baseTime 转换为相对时间
    const currentTime = this.timeline.getCurrentTime()
    const baseTime = this.timeline.getBaseTime()
    const nextEvent = this.timeline.getEvent(this.timeline.cursor + 1)
    if (!nextEvent) {
      this.setState(ReplayState.Completed)
      return
    }

    const nextRelativeTime = nextEvent.timestamp - baseTime
    const delay = (nextRelativeTime - currentTime) / this.playbackSpeed

    console.log(
      `[ReplayExecutor] scheduleNextEvent: cursor=${this.timeline.cursor}, currentTime=${currentTime}, nextRelativeTime=${nextRelativeTime}, delay=${delay}ms`,
    )

    this.playTimer = setTimeout(
      () => {
        if (this.cancelRequested) return

        this.stepForward()

        // 如果还在播放，调度下一个
        if (this._state === ReplayState.Playing) {
          this.scheduleNextEvent()
        }
      },
      Math.max(0, delay),
    )
  }

  /**
   * 播放单个事件
   */
  private playEvent(event: TimelineEvent): void {
    if (!this.context) return

    // 对于执行事件，直接使用（ExecutorEvent 已经是最终格式）
    if (event.category === TimelineEventCategory.EXECUTION) {
      const execEvent = event as ExecutionTimelineEvent
      // ExecutorEvent 已经是可序列化格式，直接使用
      const executorEvent = execEvent.event as ExecutorEvent

      this.emit({
        type: ReplayEventType.EventPlay,
        event,
        executorEvent,
      })
    } else {
      // 其他事件通过 EventHandlerRegistry 处理
      EventHandlerRegistry.replay(event, this.context)

      this.emit({
        type: ReplayEventType.EventPlay,
        event,
      })
    }
  }

  /**
   * 设置状态
   */
  private setState(newState: ReplayState): void {
    if (this._state === newState) return

    const oldState = this._state
    this._state = newState

    this.emit({
      type: ReplayEventType.StateChange,
      oldState,
      newState,
    })
  }

  /**
   * 发射位置变更事件
   */
  private emitPositionChange(): void {
    this.emit({
      type: ReplayEventType.PositionChange,
      index: this.timeline.cursor,
      time: this.timeline.getCurrentTime(),
      total: this.timeline.eventCount,
    })
  }

  // ============ 事件监听 ============

  on(listener: ReplayEventListener): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  private emit(event: ReplayEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  // ============ 状态重建（用于 seek）============

  /**
   * 恢复边到初始状态并重放编辑事件到当前位置
   * 用于 seek 时重建图的完整编辑状态
   *
   * 流程：
   * 1. 将所有边恢复到 initialGraph 中的状态（如 disabled）
   * 2. 按顺序重放从开始到当前位置的所有编辑事件
   */
  async restoreEdgeStateAndReplayEditEvents(): Promise<void> {
    if (!this.context || !this.graph) return

    // 1. 恢复边到初始状态
    const initialGraph = this.timeline.getInitialGraph()
    if (initialGraph) {
      // 构建初始边状态的映射: edgeKey -> disabled
      const initialEdgeStates = new Map<string, boolean>()
      for (const edge of initialGraph.edges) {
        const key = `${edge.fromPortId}->${edge.toPortId}`
        initialEdgeStates.set(key, edge.disabled ?? false)
      }

      // 将当前图的边恢复到初始状态
      for (const edge of this.graph.getAllEdges()) {
        const key = `${edge.fromPortId}->${edge.toPortId}`
        const initialDisabled = initialEdgeStates.get(key) ?? false
        const currentDisabled = this.graph.isEdgeDisabled(edge.fromPortId, edge.toPortId)
        if (currentDisabled !== initialDisabled) {
          this.graph.setEdgeDisabled(edge.fromPortId, edge.toPortId, initialDisabled)
        }
      }
    }

    // 2. 重放编辑事件到当前位置
    const events = this.timeline.getEvents()
    const currentIndex = this.timeline.cursor

    for (let i = 0; i <= currentIndex && i < events.length; i++) {
      const event = events[i]
      if (!event || event.category !== TimelineEventCategory.EDIT) continue

      // 使用 EventHandlerRegistry 重放编辑事件
      await EventHandlerRegistry.replay(event, this.context)
    }
  }

  /**
   * 重放从开始到当前位置的所有编辑事件（旧方法，保留兼容）
   * @deprecated 使用 restoreEdgeStateAndReplayEditEvents 代替
   */
  async replayEditEventsToCursor(): Promise<void> {
    await this.restoreEdgeStateAndReplayEditEvents()
  }

  /**
   * 获取回放上下文（用于外部访问）
   */
  getContext(): EventReplayContext | null {
    return this.context
  }

  // ============ 状态快照（用于 UI 渲染）============

  /**
   * 获取从开始到当前位置的状态快照
   */
  getStateSnapshot(): {
    executingNodeIds: Set<string>
    completedNodeIds: Map<string, { success: boolean; error?: string }>
    dataTransfers: Map<string, { fromPortId: string; toPortId: string; data: unknown }>
  } {
    const executingNodeIds = new Set<string>()
    const completedNodeIds = new Map<string, { success: boolean; error?: string }>()
    const dataTransfers = new Map<string, { fromPortId: string; toPortId: string; data: unknown }>()

    const events = this.timeline.getEvents()
    const currentIndex = this.timeline.cursor

    for (let i = 0; i <= currentIndex && i < events.length; i++) {
      const event = events[i]
      if (!event || event.category !== TimelineEventCategory.EXECUTION) continue

      const execEvent = (event as ExecutionTimelineEvent).event as ExecutorEvent

      switch (execEvent.type) {
        case ExecutorEventType.Start:
          executingNodeIds.clear()
          completedNodeIds.clear()
          dataTransfers.clear()
          break
        case ExecutorEventType.Iteration:
          executingNodeIds.clear()
          dataTransfers.clear() // 新迭代开始时清空边数据，与 graph.ts handleExecutorEvent 保持一致
          break
        case ExecutorEventType.NodeStart:
          executingNodeIds.add(execEvent.nodeId)
          break
        case ExecutorEventType.NodeComplete:
          executingNodeIds.delete(execEvent.nodeId)
          completedNodeIds.set(execEvent.nodeId, {
            success: execEvent.success,
            error: execEvent.error,
          })
          break
        case ExecutorEventType.DataPropagate:
          for (const transfer of execEvent.transfers) {
            const edgeId = `${transfer.fromPortId}->${transfer.toPortId}`
            dataTransfers.set(edgeId, transfer)
          }
          break
        case ExecutorEventType.Complete:
        case ExecutorEventType.Cancelled:
        case ExecutorEventType.Error:
          executingNodeIds.clear()
          dataTransfers.clear()
          break
      }
    }

    return { executingNodeIds, completedNodeIds, dataTransfers }
  }

  /**
   * 获取关键帧列表
   */
  getKeyframes(intervalMs: number = 13): Array<{
    time: number
    startIndex: number
    endIndex: number
    percentage: number
  }> {
    const events = this.timeline.getEvents()
    if (events.length === 0) return []

    const keyframes: Array<{
      time: number
      startIndex: number
      endIndex: number
      percentage: number
    }> = []

    const totalDuration = this.totalDuration
    if (totalDuration === 0) return []

    const baseTime = this.timeline.getBaseTime()
    let currentKeyframeStart = 0
    let currentKeyframeTime = 0

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!
      // 转换为相对时间
      const eventTime = event.timestamp - baseTime

      if (eventTime >= currentKeyframeTime + intervalMs || i === 0) {
        if (i > 0) {
          keyframes.push({
            time: currentKeyframeTime,
            startIndex: currentKeyframeStart,
            endIndex: i - 1,
            percentage: (currentKeyframeTime / totalDuration) * 100,
          })
        }
        currentKeyframeTime = eventTime
        currentKeyframeStart = i
      }
    }

    keyframes.push({
      time: currentKeyframeTime,
      startIndex: currentKeyframeStart,
      endIndex: events.length - 1,
      percentage: (currentKeyframeTime / totalDuration) * 100,
    })

    return keyframes
  }
}
