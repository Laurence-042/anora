/**
 * ReplayExecutor - 回放执行器
 *
 * 继承 BasicExecutor，共享事件机制和基础设施
 * 不执行实际逻辑，而是按录制的事件序列 emit 事件
 *
 * 这样前端组件在回放模式和正常模式下使用完全相同的代码
 */

import { ExecutorStatus } from '../types'
import { BasicExecutor } from '../executor/BasicExecutor'
import { ExecutorEventType } from '../executor/ExecutorTypes'
import type { ExecutorEvent } from '../executor/ExecutorTypes'
import type { AnoraGraph } from '../graph'
import type { DemoRecording, SerializedExecutorEvent, ReplayState } from './types'
import { ReplayState as RS } from './types'

/**
 * 回放执行器
 * 继承 BasicExecutor 以复用事件机制（on/off/emit）
 */
export class ReplayExecutor extends BasicExecutor {
  private _replayState: ReplayState = RS.Idle

  private recording: DemoRecording | null = null
  private currentEventIndex: number = -1
  private playbackTimer: number | null = null
  private graph: AnoraGraph | null = null

  /** 回放速度倍率（1.0 = 正常速度） */
  playbackSpeed: number = 1.0

  /** 状态变化回调 */
  onStateChange?: (state: ReplayState) => void
  /** 进度变化回调 */
  onProgressChange?: (current: number, total: number) => void

  /**
   * 获取回放状态
   */
  get replayState(): ReplayState {
    return this._replayState
  }

  /**
   * 获取当前事件索引
   */
  get currentIndex(): number {
    return this.currentEventIndex
  }

  /**
   * 获取总事件数
   */
  get totalEvents(): number {
    return this.recording?.events.length ?? 0
  }

  /**
   * 加载录制
   * @param recording 录制数据
   * @param graph 当前图（用于反序列化事件中的节点引用）
   */
  loadRecording(recording: DemoRecording, graph: AnoraGraph): void {
    this.recording = recording
    this.graph = graph
    this.currentEventIndex = -1
    this.setReplayState(RS.Idle)
    this.notifyProgress()
  }

  /**
   * 开始/继续播放
   */
  play(): void {
    if (!this.recording || !this.graph) return
    if (this._replayState === RS.Playing) return

    this.setReplayState(RS.Playing)
    this._status = ExecutorStatus.Running

    // 如果是从头开始
    if (this.currentEventIndex < 0) {
      this.emit({ type: ExecutorEventType.Start })
    }

    this.scheduleNextEvent()
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (this._replayState !== RS.Playing) return

    this.clearTimer()
    this.setReplayState(RS.Paused)
  }

  /**
   * 停止播放（重置到开始）
   */
  stop(): void {
    this.clearTimer()
    this.currentEventIndex = -1
    this._status = ExecutorStatus.Idle
    this.setReplayState(RS.Idle)
    this.notifyProgress()
  }

  /**
   * 单步前进
   */
  stepForward(): void {
    if (!this.recording || !this.graph) return
    if (this.currentEventIndex >= this.recording.events.length - 1) return

    this.pause()
    this.playNextEvent()
  }

  /**
   * 跳转到指定位置
   * 通过从头重放事件到目标位置来实现
   */
  async seekTo(targetIndex: number): Promise<void> {
    if (!this.recording || !this.graph) return
    if (targetIndex < 0 || targetIndex >= this.recording.events.length) return

    const wasPlaying = this._replayState === RS.Playing
    this.pause()

    // 如果目标在当前位置之前，需要重置
    if (targetIndex <= this.currentEventIndex) {
      // 重置图状态
      this.emit({ type: ExecutorEventType.Cancelled })
      this.currentEventIndex = -1
    }

    // 快速重放到目标位置（不等待延迟）
    while (this.currentEventIndex < targetIndex) {
      this.playNextEvent()
    }

    this.notifyProgress()

    if (wasPlaying) {
      this.play()
    }
  }

  /**
   * 播放下一个事件
   */
  private playNextEvent(): void {
    if (!this.recording || !this.graph) return
    if (this.currentEventIndex >= this.recording.events.length - 1) {
      this.onPlaybackComplete()
      return
    }

    this.currentEventIndex++
    const timestampedEvent = this.recording.events[this.currentEventIndex]!
    const executorEvent = this.deserializeEvent(timestampedEvent.event)

    if (executorEvent) {
      this.emit(executorEvent)
    }

    this.notifyProgress()

    // 检查是否播放完成
    if (
      timestampedEvent.event.type === 'complete' ||
      timestampedEvent.event.type === 'cancelled' ||
      timestampedEvent.event.type === 'error'
    ) {
      this.onPlaybackComplete()
    }
  }

  /**
   * 安排下一个事件的播放
   */
  private scheduleNextEvent(): void {
    if (!this.recording || this._replayState !== RS.Playing) return
    if (this.currentEventIndex >= this.recording.events.length - 1) {
      this.onPlaybackComplete()
      return
    }

    const currentTimestamp =
      this.currentEventIndex >= 0 ? this.recording.events[this.currentEventIndex]!.timestamp : 0

    const nextEvent = this.recording.events[this.currentEventIndex + 1]!
    const delay = (nextEvent.timestamp - currentTimestamp) / this.playbackSpeed

    this.playbackTimer = window.setTimeout(
      () => {
        this.playNextEvent()
        this.scheduleNextEvent()
      },
      Math.max(0, delay),
    )
  }

  /**
   * 播放完成处理
   */
  private onPlaybackComplete(): void {
    this.clearTimer()
    this._status = ExecutorStatus.Completed
    this.setReplayState(RS.Idle)
  }

  /**
   * 反序列化事件
   * 将 nodeId 转换回 BaseNode 引用
   */
  private deserializeEvent(serialized: SerializedExecutorEvent): ExecutorEvent | null {
    if (!this.graph) return null

    switch (serialized.type) {
      case 'start':
        return { type: ExecutorEventType.Start }

      case 'iteration':
        return { type: ExecutorEventType.Iteration, iteration: serialized.iteration }

      case 'node-start': {
        const node = this.graph.getNode(serialized.nodeId)
        if (!node) {
          console.warn(`ReplayExecutor: Node ${serialized.nodeId} not found`)
          return null
        }
        return { type: ExecutorEventType.NodeStart, node }
      }

      case 'node-complete': {
        const node = this.graph.getNode(serialized.nodeId)
        if (!node) {
          console.warn(`ReplayExecutor: Node ${serialized.nodeId} not found`)
          return null
        }
        return {
          type: ExecutorEventType.NodeComplete,
          node,
          success: serialized.success,
          error: serialized.error ? new Error(serialized.error) : undefined,
        }
      }

      case 'data-propagate':
        return {
          type: ExecutorEventType.DataPropagate,
          transfers: serialized.transfers.map((t) => ({
            fromPortId: t.fromPortId,
            toPortId: t.toPortId,
            data: t.data,
          })),
        }

      case 'complete':
        return {
          type: ExecutorEventType.Complete,
          result: {
            status: serialized.result.status as ExecutorStatus,
            error: serialized.result.error ? new Error(serialized.result.error) : undefined,
            iterations: serialized.result.iterations,
            duration: serialized.result.duration,
          },
        }

      case 'cancelled':
        return { type: ExecutorEventType.Cancelled }

      case 'error':
        return { type: ExecutorEventType.Error, error: new Error(serialized.error) }
    }
  }

  private setReplayState(state: ReplayState): void {
    this._replayState = state
    this.onStateChange?.(state)
  }

  private notifyProgress(): void {
    this.onProgressChange?.(this.currentEventIndex + 1, this.totalEvents)
  }

  private clearTimer(): void {
    if (this.playbackTimer !== null) {
      clearTimeout(this.playbackTimer)
      this.playbackTimer = null
    }
  }
}
