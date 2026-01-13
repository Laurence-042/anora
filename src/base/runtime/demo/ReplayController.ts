/**
 * ReplayController - 回放控制器
 *
 * 职责：
 * - 管理回放的完整生命周期（加载、播放、暂停、跳转、清理）
 * - 维护播放状态（播放进度、速度、关键帧）
 * - 协调 ReplayExecutor 和 UI 状态同步
 * - 提供统一的播放控制接口
 *
 * 设计原则：
 * - 控制器是回放功能的唯一真相源
 * - UI 层（ReplayView）只负责展示和用户交互，所有逻辑委托给控制器
 * - IPC 层只做消息转发，逻辑委托给控制器
 * - 使用响应式状态，便于 Vue 绑定
 */

import { ref, computed, type Ref } from 'vue'
import type { AnoraGraph } from '../graph'
import type { DemoRecording } from './types'
import { ReplayExecutor } from './ReplayExecutor'
import { ExecutorState, ExecutorEventType, type ExecutorEvent, ExecutionMode } from '../executor'

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
 * 回放状态快照（用于 seek）
 */
export interface ReplayStateSnapshot {
  executingNodeIds: Set<string>
  edgeDataTransfers: Map<string, { fromPortId: string; toPortId: string; data: unknown }>
  nodeStatus: Map<string, { success: boolean; error?: string }>
}

/**
 * 回放控制器
 */
export class ReplayController {
  // ==================== 核心状态 ====================

  /** 录制数据 */
  private _recording: Ref<DemoRecording | null> = ref(null)

  /** 回放执行器 */
  private _executor: Ref<ReplayExecutor | null> = ref(null)

  /** 当前图引用 */
  private _graph: Ref<AnoraGraph | null> = ref(null)

  /** 播放速度 */
  private _playbackSpeed = ref(1.0)

  /** 关键帧列表 */
  private _keyframes = ref<Keyframe[]>([])

  /** 执行器事件监听器（用于清理） */
  private executorEventUnsubscribe: (() => void) | null = null

  // ==================== 只读属性（响应式） ====================

  /** 是否已加载录制 */
  readonly isLoaded = computed(() => this._recording.value !== null && this._graph.value !== null)

  /** 是否正在播放 */
  readonly isPlaying = computed(() => this._executor.value?.isPlaying ?? false)

  /** 是否已暂停 */
  readonly isPaused = computed(() => this._executor.value?.isPaused ?? false)

  /** 是否空闲 */
  readonly isIdle = computed(() => this._executor.value?.executorState === ExecutorState.Idle)

  /** 总事件数 */
  readonly totalEvents = computed(() => this._recording.value?.events.length ?? 0)

  /** 总时长（毫秒） */
  readonly totalDuration = computed(() => this._executor.value?.totalDuration ?? 0)

  /** 当前事件索引 */
  readonly currentIndex = computed(() => (this._executor.value?.currentIndex ?? -1) + 1)

  /** 当前时间（毫秒） */
  readonly currentTime = computed(() => this._executor.value?.currentTime ?? 0)

  /** 播放进度（百分比） */
  readonly progress = computed(() =>
    this.totalDuration.value > 0 ? (this.currentTime.value / this.totalDuration.value) * 100 : 0,
  )

  /** 是否播放完成 */
  readonly isCompleted = computed(
    () =>
      this.isIdle.value &&
      this.currentIndex.value >= this.totalEvents.value &&
      this.totalEvents.value > 0,
  )

  /** 播放速度 */
  readonly playbackSpeed = computed(() => this._playbackSpeed.value)

  /** 关键帧列表 */
  readonly keyframes = computed(() => this._keyframes.value)

  /** 当前录制数据 */
  readonly recording = computed(() => this._recording.value)

  /** 当前图 */
  readonly graph = computed(() => this._graph.value)

  // ==================== 事件回调 ====================

  /** 执行器事件回调（传递给外部处理，如 graphStore.handleExecutorEvent） */
  onExecutorEvent?: (event: ExecutorEvent) => void

  /** 播放状态变更回调 */
  onPlayStateChange?: (isPlaying: boolean) => void

  // ==================== 生命周期 ====================

  /**
   * 订阅执行器事件
   * 允许多个订阅者同时监听事件，不会互相干扰
   * @returns 取消订阅的函数
   */
  subscribeToExecutorEvents(listener: (event: ExecutorEvent) => void): () => void {
    if (!this._executor.value) {
      console.warn('[ReplayController] No executor to subscribe to')
      return () => {}
    }
    return this._executor.value.on(listener)
  }

  /**
   * 加载录制数据
   */
  async loadRecording(recording: DemoRecording, graph: AnoraGraph): Promise<void> {
    // 清理现有状态
    this.dispose()

    // 保存录制和图引用
    this._recording.value = recording
    this._graph.value = graph

    // 创建回放执行器
    const executor = new ReplayExecutor()
    executor.loadRecording(recording, graph)
    executor.playbackSpeed = this._playbackSpeed.value

    // 订阅执行器事件
    this.executorEventUnsubscribe = executor.on((event) => {
      this.onExecutorEvent?.(event)
    })

    this._executor.value = executor

    // 生成关键帧（100ms 间隔）
    this._keyframes.value = executor.getKeyframes(100)

    console.log('[ReplayController] Recording loaded:', {
      nodes: graph.getAllNodes().length,
      events: recording.events.length,
      duration: executor.totalDuration,
      keyframes: this._keyframes.value.length,
    })
  }

  // ==================== 播放控制 ====================

  /**
   * 播放
   */
  async play(): Promise<void> {
    if (!this._executor.value || !this._graph.value) return

    // 如果已暂停，恢复播放
    if (this._executor.value.isPaused) {
      this._executor.value.resume()
      this.onPlayStateChange?.(true)
      return
    }

    // 如果不是空闲状态，不处理
    if (this._executor.value.executorState !== ExecutorState.Idle) return

    // 如果已完成，重新开始
    if (this.isCompleted.value) {
      await this.restart()
      // 重新加载后需要重新获取 executor
      if (!this._executor.value) return
    }

    // 开始执行
    this._executor.value.execute(this._graph.value)
    this.onPlayStateChange?.(true)
  }

  /**
   * 暂停
   */
  pause(): void {
    if (!this._executor.value) return
    this._executor.value.pause()
    this.onPlayStateChange?.(false)
  }

  /**
   * 切换播放/暂停
   */
  togglePlayPause(): void {
    if (this.isPlaying.value) {
      this.pause()
    } else {
      this.play()
    }
  }

  /**
   * 单步前进
   */
  async stepForward(): Promise<void> {
    if (!this._executor.value || !this._graph.value) return

    // 如果还没开始，使用 StepByStep 模式启动（进入 Paused 状态而不是 Running）
    if (this._executor.value.executorState === ExecutorState.Idle) {
      await this._executor.value.execute(this._graph.value, undefined, {
        mode: ExecutionMode.StepByStep,
      })
    }

    // 执行一步
    this._executor.value.stepForward()
  }

  /**
   * 重新开始
   */
  async restart(): Promise<void> {
    if (!this._recording.value || !this._graph.value) return

    // 取消当前执行
    this._executor.value?.cancel()

    // 重新加载录制（会重置所有状态）
    await this.loadRecording(this._recording.value, this._graph.value)
  }

  /**
   * 设置播放速度
   */
  setPlaybackSpeed(speed: number): void {
    this._playbackSpeed.value = speed
    if (this._executor.value) {
      this._executor.value.playbackSpeed = speed
    }
  }

  // ==================== 跳转控制 ====================

  /**
   * 跳转到指定时间
   * @returns 跳转到的事件索引
   */
  seekToTime(timeMs: number): number {
    if (!this._executor.value) return -1

    // 暂停播放
    const wasPlaying = this.isPlaying.value
    if (wasPlaying) {
      this._executor.value.pause()
    }

    // 跳转到目标时间
    const targetIndex = this._executor.value.seekToTime(timeMs)

    // 重建 UI 状态
    this.applyStateAtIndex(targetIndex)

    return targetIndex
  }

  /**
   * 跳转到指定索引
   */
  seekToIndex(index: number): void {
    if (!this._executor.value || !this._recording.value) return
    if (index < 0 || index >= this._recording.value.events.length) return

    const timeMs = this._recording.value.events[index]!.timestamp
    this.seekToTime(timeMs)
  }

  /**
   * 跳转到关键帧
   */
  seekToKeyframe(keyframeIndex: number, before: boolean = false): void {
    const kf = this._keyframes.value[keyframeIndex]
    if (!kf || !this._recording.value) return

    // 获取关键帧结束位置的时间（即 endIndex 事件的时间戳）
    const endTime = this._recording.value.events[kf.endIndex]?.timestamp ?? kf.time
    const time = before ? Math.max(0, kf.time - 1) : endTime
    this.seekToTime(time)
  }

  /**
   * 应用指定索引的状态到 UI
   * 委托给外部的 onExecutorEvent 处理器（通常是 graphStore）
   */
  private applyStateAtIndex(targetIndex: number): void {
    if (!this._executor.value || !this._graph.value) return

    const state = this._executor.value.getStateAtIndex(targetIndex)

    // 通过模拟事件来更新状态，而不是直接操作 graphStore
    // 这样保持统一的状态更新路径

    // 1. 清空状态（模拟 start 事件）
    this.onExecutorEvent?.({ type: ExecutorEventType.Start })

    // 2. 应用节点状态
    for (const [nodeId, status] of state.nodeStatus) {
      const node = this._graph.value.getNode(nodeId)
      if (node) {
        this.onExecutorEvent?.({
          type: ExecutorEventType.NodeComplete,
          node,
          success: status.success,
          error: status.error ? new Error(status.error) : undefined,
        })
      }
    }

    // 3. 应用数据传输
    if (state.edgeDataTransfers.size > 0) {
      const transfers = Array.from(state.edgeDataTransfers.values())
      this.onExecutorEvent?.({
        type: ExecutorEventType.DataPropagate,
        transfers,
      })
    }

    // 4. 应用正在执行的节点
    for (const nodeId of state.executingNodeIds) {
      const node = this._graph.value.getNode(nodeId)
      if (node) {
        this.onExecutorEvent?.({ type: ExecutorEventType.NodeStart, node })
      }
    }
  }

  // ==================== 清理 ====================

  /**
   * 清理资源
   */
  dispose(): void {
    // 取消执行
    this._executor.value?.cancel()

    // 取消事件订阅
    this.executorEventUnsubscribe?.()
    this.executorEventUnsubscribe = null

    // 清空状态
    this._recording.value = null
    this._executor.value = null
    this._graph.value = null
    this._keyframes.value = []
  }
}
