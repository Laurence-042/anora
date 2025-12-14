import { ActivationReadyStatus, ExecutorStatus } from '../types'
import type { ExecutorContext } from '../types'
import { BaseNode } from '../nodes/BaseNode'
import { AnoraGraph } from '../graph/AnoraGraph'
import { DEFAULT_EXECUTOR_CONTEXT } from '../types'
import Bluebird from 'bluebird'

import {
  ExecutorEventType,
  ExecutionMode,
  PlaybackState,
  type ExecutorEvent,
  type ExecutorEventListener,
  type ExecutionResult,
  type NodeExecutionResult,
  type EdgeDataTransfer,
  type ExecuteOptions,
} from './ExecutorTypes'
import { ExecutorStateMachine, ExecutorState } from './ExecutorStateMachine'

// Re-export types for convenience
export {
  ExecutorEventType,
  ExecutionMode,
  PlaybackState,
  type ExecutorEvent,
  type ExecutorEventListener,
  type ExecutionResult,
  type NodeExecutionResult,
  type EdgeDataTransfer,
  type ExecuteOptions,
} from './ExecutorTypes'
export { ExecutorStateMachine, ExecutorState } from './ExecutorStateMachine'

// 启用 Bluebird 的取消功能
Bluebird.config({ cancellation: true })

/**
 * 创建可取消的延迟 Promise
 * 使用 Bluebird 的取消机制，不需要轮询检查
 */
function cancellableDelay(ms: number): Bluebird<void> {
  return new Bluebird<void>((resolve, _reject, onCancel) => {
    const timer = setTimeout(resolve, ms)
    onCancel?.(() => {
      clearTimeout(timer)
    })
  })
}

/**
 * 可取消的 Promise.allSettled
 * 当 Promise 被取消时，所有待处理的 Promise 也会被取消
 */
function cancellableAllSettled<T>(promises: Promise<T>[]): Bluebird<PromiseSettledResult<T>[]> {
  // 将普通 Promise 包装为 Bluebird Promise
  const bluebirdPromises = promises.map((p) => Bluebird.resolve(p).reflect())

  return new Bluebird<PromiseSettledResult<T>[]>((resolve, _reject, onCancel) => {
    onCancel?.(() => {
      // 取消所有子 Promise
      bluebirdPromises.forEach((p) => p.cancel())
    })

    Bluebird.all(bluebirdPromises).then((inspections) => {
      const results: PromiseSettledResult<T>[] = inspections.map((inspection) => {
        if (inspection.isFulfilled()) {
          return { status: 'fulfilled' as const, value: inspection.value() }
        } else {
          return { status: 'rejected' as const, reason: inspection.reason() }
        }
      })
      resolve(results)
    })
  })
}

/**
 * 检查节点是否为开启直通模式的 ForwardNode
 * 通过 typeId 和 directThrough 属性判断，避免循环依赖
 */
function isDirectThroughForwardNode(node: BaseNode): boolean {
  // 检查是否是 ForwardNode 类型（通过 typeId）
  if (node.typeId !== 'core.ForwardNode') {
    return false
  }
  // 检查是否开启了直通模式
  return (node as BaseNode & { directThrough?: boolean }).directThrough === true
}

/**
 * 基础执行器
 * 负责执行 AnoraGraph 中的节点
 *
 * 设计原则：
 * - 迭代间使用同步，支持环结构（如周期性触发器）
 * - 不使用最大迭代次数限制，用户可自行取消执行
 * - 直通节点在数据传播时立即执行
 * - 子类（如 ReplayExecutor）可通过继承共享事件机制和步进控制
 *
 * 执行模型：
 * - execute() 内部循环调用 executeOneIteration()
 * - stepForward() 手动调用一次 executeOneIteration()
 * - 暂停 = 停止循环，恢复 = 继续循环
 *
 * 使用状态机管理状态转换：
 * - Idle: 空闲
 * - Running: 连续执行中
 * - Paused: 已暂停
 * - Stepping: 单步执行中
 */
export class BasicExecutor {
  /** 状态机 */
  protected stateMachine: ExecutorStateMachine = new ExecutorStateMachine()

  /** 事件监听器 */
  protected listeners: Set<ExecutorEventListener> = new Set()

  /** 是否已请求取消 */
  protected cancelRequested: boolean = false

  // ==================== 执行上下文（execute 期间有效） ====================

  /** 当前执行的图 */
  protected _graph: AnoraGraph | null = null

  /** 当前执行上下文 */
  protected _context: ExecutorContext = DEFAULT_EXECUTOR_CONTEXT

  /** 当前迭代次数 */
  protected _iterations: number = 0

  /** 执行开始时间 */
  protected _startTime: number = 0

  /** 当前执行的 Promise resolve（用于完成执行） */
  protected _executeResolve: ((result: ExecutionResult) => void) | null = null

  /**
   * 获取状态机状态
   */
  get executorState(): ExecutorState {
    return this.stateMachine.state
  }

  /**
   * 获取当前状态（兼容旧 API）
   * @deprecated 使用 executorState 代替
   */
  get status(): ExecutorStatus {
    // 映射状态机状态到旧的 ExecutorStatus
    switch (this.stateMachine.state) {
      case ExecutorState.Idle:
        return ExecutorStatus.Idle
      case ExecutorState.Running:
      case ExecutorState.Paused:
      case ExecutorState.Stepping:
        return ExecutorStatus.Running
      default:
        return ExecutorStatus.Idle
    }
  }

  /**
   * 获取播放状态（兼容旧 API）
   * @deprecated 使用 executorState 代替
   */
  get playbackState(): PlaybackState {
    // 映射状态机状态到旧的 PlaybackState
    switch (this.stateMachine.state) {
      case ExecutorState.Idle:
        return PlaybackState.Idle
      case ExecutorState.Running:
      case ExecutorState.Stepping:
        return PlaybackState.Playing
      case ExecutorState.Paused:
        return PlaybackState.Paused
      default:
        return PlaybackState.Idle
    }
  }

  /**
   * 是否正在执行
   */
  get isPlaying(): boolean {
    return this.stateMachine.state === ExecutorState.Running
  }

  /**
   * 是否已暂停
   */
  get isPaused(): boolean {
    return this.stateMachine.state === ExecutorState.Paused
  }

  /**
   * 是否正在单步执行
   */
  get isStepping(): boolean {
    return this.stateMachine.state === ExecutorState.Stepping
  }

  /**
   * 获取当前迭代次数
   */
  get iterations(): number {
    return this._iterations
  }

  /**
   * 添加事件监听器
   */
  on(listener: ExecutorEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 移除事件监听器
   */
  off(listener: ExecutorEventListener): void {
    this.listeners.delete(listener)
  }

  /**
   * 发送事件（protected 允许子类使用）
   */
  protected emit(event: ExecutorEvent): void {
    console.log(new Date().toISOString(), 'Emitting event:', event)
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (e) {
        console.error('Event listener error:', e)
      }
    }
  }

  /**
   * 暂停执行
   */
  pause(): void {
    const result = this.stateMachine.transition({ type: 'PAUSE' })
    if (!result.allowed) {
      console.warn('Cannot pause:', result.reason)
    }
  }

  /**
   * 恢复执行（继续循环执行）
   */
  resume(): void {
    if (!this._graph) return

    const result = this.stateMachine.transition({ type: 'RESUME' })
    if (!result.allowed) {
      console.warn('Cannot resume:', result.reason)
      return
    }

    // 继续执行循环
    this.runExecutionLoop()
  }

  /**
   * 单步前进（执行一次迭代）
   * 仅在暂停状态下有效
   */
  async stepForward(): Promise<void> {
    if (!this._graph) return

    const result = this.stateMachine.transition({ type: 'STEP' })
    if (!result.allowed) {
      console.warn('Cannot step:', result.reason)
      return
    }

    await this.executeOneIteration()

    // 单步完成，回到暂停状态
    this.stateMachine.transition({ type: 'STEP_COMPLETE' })
  }

  /**
   * 执行一次迭代（核心步进单元）
   * 返回 true 表示还有更多迭代，false 表示执行结束
   */
  protected async executeOneIteration(): Promise<boolean> {
    if (!this._graph || this.cancelRequested) return false

    const readyNodes = this.findReadyNodes(this._graph)

    if (readyNodes.length === 0) {
      // 没有就绪节点，执行完成
      this.finishExecution(ExecutorStatus.Completed)
      return false
    }

    this._iterations++
    this.emit({ type: ExecutorEventType.Iteration, iteration: this._iterations })

    try {
      const results = await this.executeNodes(readyNodes, this._graph, this._context)

      if (this.cancelRequested) {
        this.finishExecution(ExecutorStatus.Cancelled)
        return false
      }

      // 检查是否有节点失败
      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        const errorMessages = failed.map((f) => f.error?.message || 'Unknown error').join('; ')
        throw new Error(`Nodes failed: ${errorMessages}`)
      }

      return true // 还有更多迭代
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.finishExecution(ExecutorStatus.Error, err)
      return false
    }
  }

  /**
   * 执行循环（连续执行直到暂停、取消或完成）
   */
  private async runExecutionLoop(): Promise<void> {
    // 只在 Running 状态下继续执行
    while (this.stateMachine.state === ExecutorState.Running && !this.cancelRequested) {
      const hasMore = await this.executeOneIteration()
      if (!hasMore) break
    }
  }

  /**
   * 完成执行（内部方法）
   */
  protected finishExecution(status: ExecutorStatus, error?: Error): void {
    // 转换状态机到 Idle
    if (status === ExecutorStatus.Completed) {
      this.stateMachine.transition({ type: 'COMPLETE' })
    } else if (status === ExecutorStatus.Cancelled) {
      this.stateMachine.transition({ type: 'CANCEL' })
    } else if (status === ExecutorStatus.Error) {
      this.stateMachine.transition({ type: 'ERROR' })
    }

    const result: ExecutionResult = {
      status,
      error,
      iterations: this._iterations,
      duration: Date.now() - this._startTime,
    }

    if (status === ExecutorStatus.Completed) {
      this.emit({ type: ExecutorEventType.Complete, result })
    } else if (status === ExecutorStatus.Cancelled) {
      this.emit({ type: ExecutorEventType.Cancelled })
    } else if (status === ExecutorStatus.Error && error) {
      this.emit({ type: ExecutorEventType.Error, error })
    }

    // resolve execute() 的 Promise
    if (this._executeResolve) {
      this._executeResolve(result)
      this._executeResolve = null
    }

    // 清理执行上下文
    this._graph = null
  }

  /**
   * 执行图
   *
   * 流程：
   * 1. 初始化：重置节点状态
   * 2. 循环执行 executeOneIteration() 直到完成
   * 3. 支持暂停（停止循环）和恢复（继续循环）
   *
   * @param graph 要执行的图
   * @param context 执行上下文
   * @param options 执行选项（可选，startPaused 表示开始后立即暂停）
   */
  async execute(
    graph: AnoraGraph,
    context?: ExecutorContext,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult> {
    // 使用状态机检查是否可以启动
    const stepMode = options?.mode === ExecutionMode.StepByStep
    const result = this.stateMachine.transition({ type: 'START', stepMode })
    if (!result.allowed) {
      throw new Error(`Cannot start execution: ${result.reason}`)
    }

    // 初始化执行上下文
    this._graph = graph
    this._context = context ?? DEFAULT_EXECUTOR_CONTEXT
    this._iterations = 0
    this._startTime = Date.now()
    this.cancelRequested = false

    // 重置所有节点的激活状态
    for (const node of graph.getAllNodes()) {
      node.resetActivationState()
    }

    this.emit({ type: ExecutorEventType.Start })

    // 返回 Promise，在 finishExecution 时 resolve
    return new Promise<ExecutionResult>((resolve) => {
      this._executeResolve = resolve

      // 如果不是步进模式，开始执行循环
      if (!stepMode) {
        this.runExecutionLoop()
      }
    })
  }

  /**
   * 取消执行
   */
  cancel(): void {
    const result = this.stateMachine.transition({ type: 'CANCEL' })
    if (!result.allowed) {
      console.warn('Cannot cancel:', result.reason)
      return
    }

    this.cancelRequested = true
    this.finishExecution(ExecutorStatus.Cancelled)
  }

  /**
   * 重置执行器状态
   */
  reset(): void {
    if (!this.stateMachine.isIdle) {
      throw new Error('Cannot reset while running')
    }
    this.stateMachine.reset()
  }

  /**
   * 查找所有就绪的节点
   */
  private findReadyNodes(graph: AnoraGraph): BaseNode[] {
    const readyNodes: BaseNode[] = []
    const nodes = graph.getAllNodes()

    for (const node of nodes) {
      // 获取该节点所有入 Port 的已连接 Port ID 集合
      const connectedPorts = this.getConnectedInPortIds(node, graph)
      const status = node.isReadyToActivate(connectedPorts)
      if (status === ActivationReadyStatus.Ready) {
        readyNodes.push(node)
      }
    }

    return readyNodes
  }

  /**
   * 获取节点所有入 Port 中已被连接的 Port ID 集合
   */
  private getConnectedInPortIds(node: BaseNode, graph: AnoraGraph): Set<string> {
    const connectedIds = new Set<string>()
    const inputPorts = node.getInputPorts()

    for (const port of inputPorts) {
      const connected = graph.getConnectedPorts(port)
      if (connected.length > 0) {
        connectedIds.add(port.id)
      }
    }

    return connectedIds
  }

  /**
   * 执行一组节点
   *
   * 流程：
   * 1. 并行执行所有普通节点
   * 2. 执行后清空节点的入 Port
   * 3. 传播出 Port 数据到下游入 Port
   * 4. 如果下游入 Port 是直通节点，立即执行并继续传播
   * 5. 等待延迟后再发送 node-complete 事件
   */
  private async executeNodes(
    nodes: BaseNode[],
    graph: AnoraGraph,
    context: ExecutorContext,
  ): Promise<NodeExecutionResult[]> {
    const results: NodeExecutionResult[] = []

    // 并行执行所有节点
    const promises = nodes.map(async (node) => {
      try {
        this.emit({ type: ExecutorEventType.NodeStart, node })
        await node.activate(context)
        // 暂不发送 node-complete，等数据传播和延迟后再发送
        return { node, success: true, error: undefined } as NodeExecutionResult
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        // 失败时立即发送 node-complete
        this.emit({ type: ExecutorEventType.NodeComplete, node, success: false, error: err })
        return { node, success: false, error: err } as NodeExecutionResult
      }
    })

    // 使用可取消的 allSettled
    const settledResults = await cancellableAllSettled(promises)

    // 收集执行结果
    for (let i = 0; i < settledResults.length; i++) {
      const result = settledResults[i]!
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        const node = nodes[i]!
        results.push({
          node,
          success: false,
          error: result.reason as Error,
        })
      }
    }

    // 如果已取消，直接返回
    if (this.cancelRequested) {
      return results
    }

    // 对成功执行的节点：清空入 Port，然后传播出 Port 数据
    for (const result of results) {
      if (result.success) {
        // 清空执行后节点的入 Port（避免下一次激活时残留脏数据）
        this.clearNodeInputPorts(result.node)

        // 传播数据到下游，并处理直通节点
        await this.propagateDataWithDirectThrough(result.node, graph, context)

        // 发送成功节点的 node-complete 事件
        this.emit({ type: ExecutorEventType.NodeComplete, node: result.node, success: true })
      }
    }

    // 数据传播后的延迟（用于调试/演示，让用户看到执行状态和边数据）
    const delay = context.iterationDelay ?? 0
    if (delay > 0) {
      try {
        await cancellableDelay(delay)
      } catch {
        // 延迟被取消，忽略
      }
    }

    return results
  }

  /**
   * 清空节点的入 Port 数据
   */
  private clearNodeInputPorts(node: BaseNode): void {
    for (const port of node.getInputPorts()) {
      port.clear()
    }
  }

  /**
   * 传播节点的输出数据到连接的下游端口，并处理直通节点
   *
   * 直通机制：
   * - 推完数据后检查目标入 Port 是否属于直通 Forward 节点
   * - 如果是，立即执行该直通节点并继续传播
   * - 直到没有任何直通 Forward 的入 Port 被推数据
   */
  private async propagateDataWithDirectThrough(
    node: BaseNode,
    graph: AnoraGraph,
    context: ExecutorContext,
  ): Promise<void> {
    const outputPorts = node.getOutputPorts()

    // 收集所有被写入数据的目标节点
    const affectedNodes = new Set<BaseNode>()

    // 收集数据传递记录（用于调试/演示）
    const transfers: EdgeDataTransfer[] = []

    for (const outPort of outputPorts) {
      const connectedPorts = graph.getConnectedPorts(outPort)

      for (const targetPort of connectedPorts) {
        // 使用 peek() 获取数据（不清空出 Port）
        const data = outPort.peek()

        // 即使值为 null 也要填入
        if (data !== undefined) {
          targetPort.write(data)

          // 记录数据传递
          transfers.push({
            fromPortId: outPort.id,
            toPortId: targetPort.id,
            data,
          })

          // 记录受影响的节点
          const targetNode = graph.getNodeByPort(targetPort)
          if (targetNode) {
            affectedNodes.add(targetNode)
          }
        }
      }
    }

    // 发送数据传播事件
    if (transfers.length > 0) {
      this.emit({ type: ExecutorEventType.DataPropagate, transfers })
    }

    // 检查受影响的节点是否有直通节点需要立即执行
    for (const targetNode of affectedNodes) {
      await this.executeDirectThroughIfReady(targetNode, graph, context)
    }
  }

  /**
   * 检查节点是否为直通 ForwardNode，如果是则立即执行并递归传播
   * 直通机制仅针对 ForwardNode，不是通用机制
   */
  private async executeDirectThroughIfReady(
    node: BaseNode,
    graph: AnoraGraph,
    context: ExecutorContext,
  ): Promise<void> {
    // 仅开启直通模式的 ForwardNode 支持直通
    if (!isDirectThroughForwardNode(node)) {
      return
    }

    // 检查是否有数据可传播
    const inPort = node.getInPort('value')
    if (!inPort?.hasData) {
      return
    }

    // 直通节点：立即执行
    try {
      this.emit({ type: ExecutorEventType.NodeStart, node })
      await node.activate(context)
      this.emit({ type: ExecutorEventType.NodeComplete, node, success: true })

      // 清空入 Port
      this.clearNodeInputPorts(node)

      // 递归传播数据（可能触发更多直通节点）
      await this.propagateDataWithDirectThrough(node, graph, context)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: ExecutorEventType.NodeComplete, node, success: false, error: err })
      throw err
    }
  }

  /**
   * 清理图中所有节点的端口数据
   */
  clearAllPorts(graph: AnoraGraph): void {
    const nodes = graph.getAllNodes()
    for (const node of nodes) {
      for (const port of node.getInputPorts()) {
        port.clear()
      }
      for (const port of node.getOutputPorts()) {
        port.clear()
      }
    }
  }
}

/**
 * 执行器工厂函数
 */
export function createExecutor(): BasicExecutor {
  return new BasicExecutor()
}

/**
 * 快速执行图的便捷函数
 */
export async function executeGraph(
  graph: AnoraGraph,
  context?: ExecutorContext,
): Promise<ExecutionResult> {
  const executor = createExecutor()
  return executor.execute(graph, context)
}
