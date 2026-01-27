/**
 * ReplayController - 回放控制器（基于 Timeline 重构版）
 *
 * 职责：
 * - 管理回放的完整生命周期
 * - 维护播放状态（进度、速度、关键帧）
 * - 协调 ReplayExecutor 和 UI 状态同步
 * - 提供统一的播放控制接口
 */

import { ref, computed, type Ref } from 'vue'
import type { AnoraGraph } from '@/base/runtime/graph'
import type { TimelineRecording } from '@/base/runtime/timeline'
import { ReplayExecutor, ReplayState, ReplayEventType, type ReplayEvent } from './ReplayExecutor'
import { ExecutorEventType, type ExecutorEvent } from '@/base/runtime/executor'
import type { GraphStore } from './types'

/**
 * 关键帧信息
 */
export interface Keyframe {
  time: number
  startIndex: number
  endIndex: number
  percentage: number
}

/**
 * 回放控制器
 */
export class ReplayController {
  // ==================== 核心状态 ====================

  /** 录制数据 */
  private _recording: Ref<TimelineRecording | null> = ref(null)

  /** 回放执行器 */
  private _executor: Ref<ReplayExecutor | null> = ref(null)

  /** 当前图引用 */
  private _graph: Ref<AnoraGraph | null> = ref(null)

  /** 播放速度 */
  private _playbackSpeed = ref(1.0)

  /** 关键帧列表 */
  private _keyframes = ref<Keyframe[]>([])

  /** 当前事件索引（响应式） */
  private _currentIndex = ref(-1)

  /** 当前时间（响应式） */
  private _currentTime = ref(0)

  /** 播放状态（响应式） */
  private _state = ref<ReplayState>(ReplayState.Idle)

  /** 事件监听器取消函数 */
  private unsubscribe: (() => void) | null = null

  // ==================== 只读属性（响应式） ====================

  readonly isLoaded = computed(() => this._recording.value !== null && this._graph.value !== null)
  readonly isPlaying = computed(() => this._state.value === ReplayState.Playing)
  readonly isPaused = computed(() => this._state.value === ReplayState.Paused)
  readonly isIdle = computed(
    () => this._state.value === ReplayState.Idle || this._state.value === ReplayState.Ready,
  )
  readonly isCompleted = computed(() => this._state.value === ReplayState.Completed)

  readonly totalEvents = computed(() => this._executor.value?.totalEvents ?? 0)
  readonly totalDuration = computed(() => this._executor.value?.totalDuration ?? 0)
  readonly currentIndex = computed(() => this._currentIndex.value + 1)
  readonly currentTime = computed(() => this._currentTime.value)

  readonly progress = computed(() =>
    this.totalDuration.value > 0 ? (this._currentTime.value / this.totalDuration.value) * 100 : 0,
  )

  readonly playbackSpeed = computed(() => this._playbackSpeed.value)
  readonly keyframes = computed(() => this._keyframes.value)
  readonly recording = computed(() => this._recording.value)
  readonly graph = computed(() => this._graph.value)

  // ==================== 事件回调 ====================

  /** 执行器事件回调 */
  onExecutorEvent?: (event: ExecutorEvent) => void

  /** 播放状态变更回调 */
  onPlayStateChange?: (isPlaying: boolean) => void

  // ==================== 生命周期 ====================

  /**
   * 加载录制数据
   * @param recording 录制数据
   * @param graph 图实例
   * @param graphStore 可选，用于回放编辑事件
   */
  async loadRecording(
    recording: TimelineRecording,
    graph: AnoraGraph,
    graphStore?: GraphStore,
  ): Promise<void> {
    this.dispose()

    this._recording.value = recording
    this._graph.value = graph

    const executor = new ReplayExecutor()
    executor.loadRecording(recording, graph, graphStore)
    executor.playbackSpeed = this._playbackSpeed.value

    // 订阅回放事件
    this.unsubscribe = executor.on((event: ReplayEvent) => {
      this.handleReplayEvent(event)
    })

    this._executor.value = executor
    this._keyframes.value = executor.getKeyframes(100)
    this._state.value = ReplayState.Ready
    this._currentIndex.value = -1
    this._currentTime.value = 0

    console.log('[ReplayController] Recording loaded:', {
      nodes: graph.getAllNodes().length,
      events: recording.events.length,
      duration: executor.totalDuration,
      keyframes: this._keyframes.value.length,
    })
  }

  /**
   * 处理回放事件
   */
  private handleReplayEvent(event: ReplayEvent): void {
    switch (event.type) {
      case ReplayEventType.StateChange:
        this._state.value = event.newState
        this.onPlayStateChange?.(event.newState === ReplayState.Playing)
        break

      case ReplayEventType.PositionChange:
        this._currentIndex.value = event.index
        this._currentTime.value = event.time
        break

      case ReplayEventType.EventPlay:
        // 将执行器事件传递给外部
        if (event.executorEvent) {
          this.onExecutorEvent?.(event.executorEvent)
        }
        break
    }
  }

  // ==================== 播放控制 ====================

  async play(): Promise<void> {
    if (!this._executor.value) return
    this._executor.value.play()
  }

  pause(): void {
    if (!this._executor.value) return
    this._executor.value.pause()
  }

  togglePlayPause(): void {
    if (this.isPlaying.value) {
      this.pause()
    } else {
      this.play()
    }
  }

  async stepForward(): Promise<void> {
    if (!this._executor.value) return

    const success = this._executor.value.stepForward()
    if (!success) {
      console.log('[ReplayController] No more events to step forward')
    }
  }

  async stepBackward(): Promise<void> {
    if (!this._executor.value || !this._graph.value) return

    const success = this._executor.value.stepBackward()
    if (success) {
      // 后退后需要重建 UI 状态
      this.applyStateSnapshot()
    }
  }

  async restart(): Promise<void> {
    if (!this._recording.value || !this._graph.value) return
    await this.loadRecording(this._recording.value, this._graph.value)
  }

  setPlaybackSpeed(speed: number): void {
    this._playbackSpeed.value = speed
    if (this._executor.value) {
      this._executor.value.playbackSpeed = speed
    }
  }

  // ==================== 跳转控制 ====================

  seekToTime(timeMs: number): number {
    if (!this._executor.value) return -1

    const wasPlaying = this.isPlaying.value
    if (wasPlaying) {
      this._executor.value.pause()
    }

    const targetIndex = this._executor.value.seekToTime(timeMs)
    this.applyStateSnapshot()

    return targetIndex
  }

  seekToIndex(index: number): void {
    if (!this._executor.value) return

    const wasPlaying = this.isPlaying.value
    if (wasPlaying) {
      this._executor.value.pause()
    }

    this._executor.value.seekToIndex(index)
    this.applyStateSnapshot()
  }

  seekToKeyframe(keyframeIndex: number, before: boolean = false): void {
    const kf = this._keyframes.value[keyframeIndex]
    if (!kf || !this._recording.value) return

    const events = this._recording.value.events
    const endEvent = events[kf.endIndex]
    const endTime = endEvent?.timestamp ?? kf.time
    const time = before ? Math.max(0, kf.time - 1) : endTime

    this.seekToTime(time)
  }

  /**
   * 应用当前位置的状态快照到 UI
   */
  private applyStateSnapshot(): void {
    if (!this._executor.value || !this._graph.value) return

    const snapshot = this._executor.value.getStateSnapshot()

    // 1. 清空状态
    this.onExecutorEvent?.({ type: ExecutorEventType.Start })

    // 2. 应用已完成节点
    for (const [nodeId, status] of snapshot.completedNodeIds) {
      this.onExecutorEvent?.({
        type: ExecutorEventType.NodeComplete,
        nodeId,
        success: status.success,
        error: status.error,
      })
    }

    // 3. 应用数据传输
    if (snapshot.dataTransfers.size > 0) {
      const transfers = Array.from(snapshot.dataTransfers.values())
      this.onExecutorEvent?.({
        type: ExecutorEventType.DataPropagate,
        transfers,
      })
    }

    // 4. 应用正在执行的节点
    for (const nodeId of snapshot.executingNodeIds) {
      this.onExecutorEvent?.({ type: ExecutorEventType.NodeStart, nodeId })
    }
  }

  // ==================== 清理 ====================

  dispose(): void {
    this._executor.value?.stop()
    this.unsubscribe?.()
    this.unsubscribe = null

    this._recording.value = null
    this._executor.value = null
    this._graph.value = null
    this._keyframes.value = []
    this._state.value = ReplayState.Idle
    this._currentIndex.value = -1
    this._currentTime.value = 0
  }
}
