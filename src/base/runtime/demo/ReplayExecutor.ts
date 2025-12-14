/**
 * ReplayExecutor - 回放执行器
 *
 * 继承 BasicExecutor，使用相同的步进模型
 * 不执行实际节点逻辑，而是按录制的事件序列 emit 事件
 *
 * 使用方式：
 * 1. loadRecording(recording, graph) - 加载录制数据
 * 2. execute(graph) - 开始回放（与 BasicExecutor 相同接口）
 * 3. pause() / resume() / cancel() - 控制回放（继承自 BasicExecutor）
 * 4. stepForward() - 单步前进（覆盖基类，播放一个事件）
 *
 * 执行模型与 BasicExecutor 相同：
 * - execute() 循环调用步进单元
 * - stepForward() 手动调用一次
 * - 暂停 = 停止循环，恢复 = 继续循环
 */

import { ExecutorStatus } from '../types'
import type { ExecutorContext } from '../types'
import {
  BasicExecutor,
  ExecutorEventType,
  ExecutionMode,
  PlaybackState,
} from '../executor/BasicExecutor'
import type { ExecutorEvent, ExecutionResult, ExecuteOptions } from '../executor/ExecutorTypes'
import type { AnoraGraph } from '../graph'
import type { DemoRecording, SerializedExecutorEvent } from './types'

/**
 * 回放执行器
 */
export class ReplayExecutor extends BasicExecutor {
  private recording: DemoRecording | null = null
  private currentEventIndex: number = -1
  private graph: AnoraGraph | null = null

  /** 回放速度倍率 */
  playbackSpeed: number = 1.0

  /** 进度变化回调 */
  onProgressChange?: (current: number, total: number) => void

  get currentIndex(): number {
    return this.currentEventIndex
  }

  get totalEvents(): number {
    return this.recording?.events.length ?? 0
  }

  loadRecording(recording: DemoRecording, graph: AnoraGraph): void {
    this.recording = recording
    this.graph = graph
    this.currentEventIndex = -1
    this.cancelRequested = false
    this.notifyProgress()
  }

  override async execute(
    _graph: AnoraGraph,
    _context?: ExecutorContext,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult> {
    if (!this.recording || !this.graph) {
      throw new Error('No recording loaded. Call loadRecording() first.')
    }

    if (this._status === ExecutorStatus.Running) {
      throw new Error('Executor is already running')
    }

    this._startTime = Date.now()
    this._status = ExecutorStatus.Running
    this.currentEventIndex = -1
    this.cancelRequested = false

    this.emit({ type: ExecutorEventType.Start })

    const startPaused = options?.mode === ExecutionMode.StepByStep
    this._playbackState = startPaused ? PlaybackState.Paused : PlaybackState.Playing

    return new Promise<ExecutionResult>((resolve) => {
      this._executeResolve = resolve
      if (!startPaused) {
        this.runReplayLoop()
      }
    })
  }

  override resume(): void {
    if (this._playbackState !== PlaybackState.Paused || !this.recording) return
    this._playbackState = PlaybackState.Playing
    this.runReplayLoop()
  }

  override async stepForward(): Promise<void> {
    if (this._playbackState !== PlaybackState.Paused || !this.recording) return
    await this.playOneEvent()
  }

  override cancel(): void {
    if (this._status !== ExecutorStatus.Running) return
    this.cancelRequested = true
    this.finishReplay(ExecutorStatus.Cancelled)
  }

  /**
   * 播放一个事件（步进单元）
   * @returns true 表示还有更多事件，false 表示已完成或取消
   */
  private async playOneEvent(): Promise<boolean> {
    if (!this.recording || !this.graph || this.cancelRequested) return false

    // 检查是否已到达末尾
    if (this.currentEventIndex >= this.recording.events.length - 1) {
      this.finishReplay(ExecutorStatus.Completed)
      return false
    }

    // 如果是连续播放模式，需要等待延迟
    if (this._playbackState === PlaybackState.Playing) {
      const currentTimestamp =
        this.currentEventIndex >= 0 ? this.recording.events[this.currentEventIndex]!.timestamp : 0
      const nextEvent = this.recording.events[this.currentEventIndex + 1]!
      const delay = (nextEvent.timestamp - currentTimestamp) / this.playbackSpeed

      if (delay > 0) {
        await this.interruptibleDelay(delay)
      }
    }

    // 延迟后重新检查状态（可能在延迟期间被暂停/取消）
    if (this.cancelRequested) return false
    if (this._playbackState === PlaybackState.Paused) return true

    // 播放下一个事件
    this.currentEventIndex++
    const timestampedEvent = this.recording.events[this.currentEventIndex]!
    const executorEvent = this.deserializeEvent(timestampedEvent.event)

    if (executorEvent) {
      this.emit(executorEvent)
    }

    this.notifyProgress()
    return true
  }

  /**
   * 连续播放循环
   */
  private async runReplayLoop(): Promise<void> {
    while (this._playbackState === PlaybackState.Playing && !this.cancelRequested) {
      const hasMore = await this.playOneEvent()
      if (!hasMore) break
    }
  }

  /**
   * 完成回放
   */
  private finishReplay(status: ExecutorStatus, error?: Error): void {
    this._status = status
    this._playbackState = PlaybackState.Idle

    const result: ExecutionResult = {
      status,
      error,
      iterations: this.recording?.events.filter((e) => e.event.type === 'iteration').length ?? 0,
      duration: Date.now() - this._startTime,
    }

    if (status === ExecutorStatus.Completed) {
      this.emit({ type: ExecutorEventType.Complete, result })
    } else if (status === ExecutorStatus.Cancelled) {
      this.emit({ type: ExecutorEventType.Cancelled })
    } else if (status === ExecutorStatus.Error && error) {
      this.emit({ type: ExecutorEventType.Error, error })
    }

    if (this._executeResolve) {
      this._executeResolve(result)
      this._executeResolve = null
    }
  }

  /**
   * 可中断的延迟
   * 在延迟期间检查取消/暂停状态
   */
  private interruptibleDelay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      const checkInterval = setInterval(() => {
        if (this.cancelRequested || this._playbackState === PlaybackState.Paused) {
          clearTimeout(timer)
          clearInterval(checkInterval)
          resolve()
        }
      }, 16)
      setTimeout(() => clearInterval(checkInterval), ms + 100)
    })
  }

  /**
   * 反序列化事件
   * 将录制的序列化事件转换为 ExecutorEvent
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
        if (!node) return null
        return { type: ExecutorEventType.NodeStart, node }
      }
      case 'node-complete': {
        const node = this.graph.getNode(serialized.nodeId)
        if (!node) return null
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

  /**
   * 通知进度变化
   */
  private notifyProgress(): void {
    this.onProgressChange?.(this.currentEventIndex + 1, this.totalEvents)
  }
}
