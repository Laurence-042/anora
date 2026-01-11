/**
 * ReplayExecutor - 回放执行器
 *
 * 继承 BasicExecutor，复用其执行流程和状态机
 * 仅覆盖 executeOneIteration() 来播放录制的事件
 *
 * 使用方式：
 * 1. loadRecording(recording, graph) - 加载录制数据
 * 2. execute(graph) - 开始回放（继承自 BasicExecutor）
 * 3. pause() / resume() / cancel() - 控制回放（继承自 BasicExecutor）
 * 4. stepForward() - 单步前进（继承自 BasicExecutor）
 *
 * 执行模型与 BasicExecutor 完全一致，仅 executeOneIteration() 不同：
 * - BasicExecutor.executeOneIteration(): 执行就绪节点
 * - ReplayExecutor.executeOneIteration(): 播放下一个录制事件
 */

import type { ExecutorContext } from '../types'
import { BasicExecutor, ExecutorEventType, ExecutorState, FinishReason } from '../executor'
import type { ExecutorEvent, ExecutionResult, ExecuteOptions } from '../executor/ExecutorTypes'
import type { AnoraGraph } from '../graph'
import type { DemoRecording, SerializedExecutorEvent } from './types'

/**
 * 回放执行器
 */
export class ReplayExecutor extends BasicExecutor {
  private recording: DemoRecording | null = null
  private currentEventIndex: number = -1

  /** 回放速度倍率 */
  playbackSpeed: number = 1.0

  /** 进度变化回调 */
  onProgressChange?: (
    current: number,
    total: number,
    currentTime: number,
    totalTime: number,
  ) => void

  get currentIndex(): number {
    return this.currentEventIndex
  }

  get totalEvents(): number {
    return this.recording?.events.length ?? 0
  }

  /** 获取录制的总时长（毫秒） */
  get totalDuration(): number {
    if (!this.recording || this.recording.events.length === 0) return 0
    return this.recording.events[this.recording.events.length - 1]!.timestamp
  }

  /** 获取当前播放时间（毫秒） */
  get currentTime(): number {
    if (!this.recording || this.currentEventIndex < 0) return 0
    if (this.currentEventIndex >= this.recording.events.length) {
      return this.totalDuration
    }
    return this.recording.events[this.currentEventIndex]!.timestamp
  }

  /**
   * 加载录制数据
   */
  loadRecording(recording: DemoRecording, graph: AnoraGraph): void {
    this.recording = recording
    // 保存 graph 引用到基类的 _graph（通过 execute 时设置）
    this._graph = graph
    this.currentEventIndex = -1
    this.cancelRequested = false
    this.notifyProgress()
  }

  /**
   * 覆盖 execute 以初始化回放状态
   */
  override async execute(
    graph: AnoraGraph,
    context?: ExecutorContext,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult> {
    if (!this.recording) {
      throw new Error('No recording loaded. Call loadRecording() first.')
    }

    // 重置回放索引
    this.currentEventIndex = -1

    // 调用基类的 execute，它会处理状态机转换和执行循环
    return super.execute(graph, context, options)
  }

  /**
   * 覆盖核心步进单元
   * 播放一个事件而不是执行节点
   */
  protected override async executeOneIteration(): Promise<boolean> {
    if (!this.recording || !this._graph || this.cancelRequested) return false

    // 检查是否已到达末尾
    if (this.currentEventIndex >= this.recording.events.length - 1) {
      this.finishExecution(FinishReason.Completed)
      return false
    }

    // 如果是连续播放模式，需要等待延迟
    if (this.stateMachine.state === ExecutorState.Running) {
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
    if (this.stateMachine.isPaused) return true

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
   * 可中断的延迟
   * 在延迟期间检查取消/暂停状态
   */
  private interruptibleDelay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      const checkInterval = setInterval(() => {
        if (this.cancelRequested || this.stateMachine.isPaused) {
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
    if (!this._graph) return null

    switch (serialized.type) {
      case 'start':
        return { type: ExecutorEventType.Start }
      case 'iteration':
        return { type: ExecutorEventType.Iteration, iteration: serialized.iteration }
      case 'node-start': {
        const node = this._graph.getNode(serialized.nodeId)
        if (!node) return null
        return { type: ExecutorEventType.NodeStart, node }
      }
      case 'node-complete': {
        const node = this._graph.getNode(serialized.nodeId)
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
            finishReason: serialized.result.finishReason as FinishReason,
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
   * 跳转到指定时间点
   * @param timeMs 目标时间（毫秒）
   * @returns 跳转到的事件索引
   */
  seekToTime(timeMs: number): number {
    if (!this.recording || this.recording.events.length === 0) return -1

    // 二分查找找到目标时间点之前最近的事件
    let left = 0
    let right = this.recording.events.length - 1
    let targetIndex = -1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const event = this.recording.events[mid]!

      if (event.timestamp <= timeMs) {
        targetIndex = mid
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    // 设置当前索引（减1是因为 executeOneIteration 会先 ++）
    this.currentEventIndex = targetIndex
    this.notifyProgress()
    return targetIndex
  }

  /**
   * 重放从开始到指定索引的所有事件（用于 seek 后重建状态）
   * 不发出事件，只返回最终状态
   */
  getStateAtIndex(targetIndex: number): {
    executingNodeIds: Set<string>
    edgeDataTransfers: Map<string, { fromPortId: string; toPortId: string; data: unknown }>
  } {
    const executingNodeIds = new Set<string>()
    const edgeDataTransfers = new Map<
      string,
      { fromPortId: string; toPortId: string; data: unknown }
    >()

    if (!this.recording) return { executingNodeIds, edgeDataTransfers }

    for (let i = 0; i <= targetIndex && i < this.recording.events.length; i++) {
      const event = this.recording.events[i]!.event

      switch (event.type) {
        case 'start':
        case 'iteration':
          executingNodeIds.clear()
          edgeDataTransfers.clear()
          break
        case 'node-start':
          executingNodeIds.add(event.nodeId)
          break
        case 'node-complete':
          executingNodeIds.delete(event.nodeId)
          break
        case 'data-propagate':
          for (const transfer of event.transfers) {
            const edgeId = `${transfer.fromPortId}->${transfer.toPortId}`
            edgeDataTransfers.set(edgeId, transfer)
          }
          break
        case 'complete':
        case 'cancelled':
        case 'error':
          executingNodeIds.clear()
          edgeDataTransfers.clear()
          break
      }
    }

    return { executingNodeIds, edgeDataTransfers }
  }

  /**
   * 通知进度变化
   */
  private notifyProgress(): void {
    this.onProgressChange?.(
      this.currentEventIndex + 1,
      this.totalEvents,
      this.currentTime,
      this.totalDuration,
    )
  }

  /**
   * 获取关键帧列表（按指定间隔聚合事件）
   * @param intervalMs 聚合间隔（毫秒），默认 13ms（约一帧）
   * @returns 关键帧数组，每个关键帧包含时间和事件索引范围
   */
  getKeyframes(intervalMs: number = 13): Array<{
    time: number
    startIndex: number
    endIndex: number
    percentage: number
  }> {
    if (!this.recording || this.recording.events.length === 0) return []

    const keyframes: Array<{
      time: number
      startIndex: number
      endIndex: number
      percentage: number
    }> = []

    const totalDuration = this.totalDuration
    if (totalDuration === 0) return []

    let currentKeyframeStart = 0
    let currentKeyframeTime = 0

    for (let i = 0; i < this.recording.events.length; i++) {
      const event = this.recording.events[i]!
      const eventTime = event.timestamp

      // 如果事件时间超过当前关键帧的结束时间，创建新关键帧
      if (eventTime >= currentKeyframeTime + intervalMs || i === 0) {
        if (i > 0) {
          // 保存上一个关键帧
          keyframes.push({
            time: currentKeyframeTime,
            startIndex: currentKeyframeStart,
            endIndex: i - 1,
            percentage: (currentKeyframeTime / totalDuration) * 100,
          })
        }
        // 使用实际事件的时间戳作为关键帧时间，而不是对齐到间隔倍数
        currentKeyframeTime = eventTime
        currentKeyframeStart = i
      }
    }

    // 添加最后一个关键帧
    keyframes.push({
      time: currentKeyframeTime,
      startIndex: currentKeyframeStart,
      endIndex: this.recording.events.length - 1,
      percentage: (currentKeyframeTime / totalDuration) * 100,
    })

    return keyframes
  }
}
