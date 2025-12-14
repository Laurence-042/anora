/**
 * ReplayExecutor - 回放执行器
 *
 * 继承 BasicExecutor，覆盖 execute() 方法
 * 不执行实际节点逻辑，而是按录制的事件序列 emit 事件
 *
 * 使用方式：
 * 1. loadRecording(recording, graph) - 加载录制数据
 * 2. execute(graph) - 开始回放（与 BasicExecutor 相同接口）
 * 3. pause() / resume() / cancel() - 控制回放
 *
 * 这样前端组件在回放模式和正常模式下使用完全相同的事件监听代码
 */

import { ExecutorStatus } from '../types'
import type { ExecutorContext } from '../types'
import { BasicExecutor } from '../executor/BasicExecutor'
import { ExecutorEventType } from '../executor/ExecutorTypes'
import type { ExecutorEvent, ExecutionResult } from '../executor/ExecutorTypes'
import type { AnoraGraph } from '../graph'
import type { DemoRecording, SerializedExecutorEvent } from './types'

/**
 * 回放状态（内部使用）
 */
enum PlaybackState {
  Idle = 'idle',
  Playing = 'playing',
  Paused = 'paused',
}

/**
 * 回放执行器
 * 继承 BasicExecutor，覆盖 execute() 以实现事件回放
 */
export class ReplayExecutor extends BasicExecutor {
  private recording: DemoRecording | null = null
  private currentEventIndex: number = -1
  private playbackState: PlaybackState = PlaybackState.Idle
  private graph: AnoraGraph | null = null

  /** 回放速度倍率（1.0 = 正常速度） */
  playbackSpeed: number = 1.0

  /** 暂停时的 resolve 回调（用于恢复执行） */
  private pauseResolve: (() => void) | null = null

  /** 是否已请求取消 */
  private cancelRequested: boolean = false

  /** 进度变化回调 */
  onProgressChange?: (current: number, total: number) => void

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
   * 是否正在播放
   */
  get isPlaying(): boolean {
    return this.playbackState === PlaybackState.Playing
  }

  /**
   * 是否已暂停
   */
  get isPaused(): boolean {
    return this.playbackState === PlaybackState.Paused
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
    this.playbackState = PlaybackState.Idle
    this.cancelRequested = false
    this.notifyProgress()
  }

  /**
   * 执行回放（覆盖 BasicExecutor.execute）
   *
   * 与 BasicExecutor 相同的接口，但内部逻辑是回放事件序列
   * @param _graph 图（实际使用 loadRecording 时传入的图）
   * @param _context 执行上下文（回放模式下忽略）
   */
  override async execute(_graph: AnoraGraph, _context?: ExecutorContext): Promise<ExecutionResult> {
    if (!this.recording || !this.graph) {
      throw new Error('No recording loaded. Call loadRecording() first.')
    }

    if (this._status === ExecutorStatus.Running) {
      throw new Error('Executor is already running')
    }

    const startTime = Date.now()
    this._status = ExecutorStatus.Running
    this.playbackState = PlaybackState.Playing
    this.currentEventIndex = -1
    this.cancelRequested = false

    this.emit({ type: ExecutorEventType.Start })

    try {
      // 按事件序列回放
      while (this.currentEventIndex < this.recording.events.length - 1) {
        // 检查取消
        if (this.cancelRequested) {
          this._status = ExecutorStatus.Cancelled
          this.playbackState = PlaybackState.Idle
          this.emit({ type: ExecutorEventType.Cancelled })
          return {
            status: ExecutorStatus.Cancelled,
            iterations: 0,
            duration: Date.now() - startTime,
          }
        }

        // 检查暂停（playbackState 可能被外部 pause() 修改）
        if (this.playbackState !== PlaybackState.Playing) {
          await this.waitForResume()
          continue
        }

        // 计算延迟
        const currentTimestamp =
          this.currentEventIndex >= 0 ? this.recording.events[this.currentEventIndex]!.timestamp : 0
        const nextEvent = this.recording.events[this.currentEventIndex + 1]!
        const delay = (nextEvent.timestamp - currentTimestamp) / this.playbackSpeed

        // 等待延迟
        if (delay > 0) {
          await this.interruptibleDelay(delay)
        }

        // 再次检查取消/暂停（延迟期间可能状态改变）
        if (this.cancelRequested) continue
        if (this.playbackState !== PlaybackState.Playing) continue

        // 播放下一个事件
        this.playNextEvent()
      }

      this._status = ExecutorStatus.Completed
      this.playbackState = PlaybackState.Idle

      const result: ExecutionResult = {
        status: ExecutorStatus.Completed,
        iterations: this.recording.events.filter((e) => e.event.type === 'iteration').length,
        duration: Date.now() - startTime,
      }

      return result
    } catch (error) {
      this._status = ExecutorStatus.Error
      this.playbackState = PlaybackState.Idle
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: ExecutorEventType.Error, error: err })
      return {
        status: ExecutorStatus.Error,
        error: err,
        iterations: 0,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * 暂停回放
   */
  pause(): void {
    if (this.playbackState === PlaybackState.Playing) {
      this.playbackState = PlaybackState.Paused
    }
  }

  /**
   * 恢复回放
   */
  resume(): void {
    if (this.playbackState === PlaybackState.Paused) {
      this.playbackState = PlaybackState.Playing
      // 如果有等待中的 Promise，resolve 它
      if (this.pauseResolve) {
        this.pauseResolve()
        this.pauseResolve = null
      }
    }
  }

  /**
   * 取消回放（覆盖 BasicExecutor.cancel）
   */
  override cancel(): void {
    this.cancelRequested = true
    // 如果正在暂停等待，也要唤醒
    if (this.pauseResolve) {
      this.pauseResolve()
      this.pauseResolve = null
    }
  }

  /**
   * 单步前进（仅在暂停时有效）
   */
  stepForward(): void {
    if (this.playbackState !== PlaybackState.Paused) return
    if (!this.recording || this.currentEventIndex >= this.recording.events.length - 1) return

    this.playNextEvent()
  }

  /**
   * 播放下一个事件（内部）
   */
  private playNextEvent(): void {
    if (!this.recording || !this.graph) return

    this.currentEventIndex++
    const timestampedEvent = this.recording.events[this.currentEventIndex]!
    const executorEvent = this.deserializeEvent(timestampedEvent.event)

    if (executorEvent) {
      this.emit(executorEvent)
    }

    this.notifyProgress()
  }

  /**
   * 等待恢复（暂停时）
   */
  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      this.pauseResolve = resolve
    })
  }

  /**
   * 可中断的延迟
   */
  private interruptibleDelay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)

      // 保存原始的 pauseResolve
      const checkInterval = setInterval(() => {
        if (this.cancelRequested || this.playbackState === PlaybackState.Paused) {
          clearTimeout(timer)
          clearInterval(checkInterval)
          resolve()
        }
      }, 16) // 约 60fps 检查频率

      // 延迟完成后清理
      setTimeout(() => clearInterval(checkInterval), ms + 100)
    })
  }

  /**
   * 反序列化事件
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

  private notifyProgress(): void {
    this.onProgressChange?.(this.currentEventIndex + 1, this.totalEvents)
  }
}
