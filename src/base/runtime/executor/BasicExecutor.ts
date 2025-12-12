import { ActivationReadyStatus, ExecutorStatus } from '../types'
import type { ExecutorContext } from '../types'
import { BaseNode } from '../nodes/BaseNode'
import { AnoraGraph } from '../graph/AnoraGraph'
import { DEFAULT_EXECUTOR_CONTEXT } from '../types'
import type { DemoRecorder } from '../demo/DemoRecorder'
import Bluebird from 'bluebird'

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
 * 执行结果
 */
export interface ExecutionResult {
  /** 执行状态 */
  status: ExecutorStatus
  /** 错误信息（如果有） */
  error?: Error
  /** 执行的迭代次数 */
  iterations: number
  /** 执行时间（毫秒） */
  duration: number
}

/**
 * 节点执行结果
 */
export interface NodeExecutionResult {
  node: BaseNode
  success: boolean
  error?: Error
}

/**
 * 边数据传递记录
 */
export interface EdgeDataTransfer {
  /** 源 Port ID */
  fromPortId: string
  /** 目标 Port ID */
  toPortId: string
  /** 传递的数据 */
  data: unknown
}

/**
 * 执行器事件
 */
export type ExecutorEvent =
  | { type: 'start' }
  | { type: 'iteration'; iteration: number }
  | { type: 'node-start'; node: BaseNode }
  | { type: 'node-complete'; node: BaseNode; success: boolean; error?: Error }
  | { type: 'data-propagate'; transfers: EdgeDataTransfer[] }
  | { type: 'complete'; result: ExecutionResult }
  | { type: 'cancelled' }
  | { type: 'error'; error: Error }

/**
 * 事件监听器
 */
export type ExecutorEventListener = (event: ExecutorEvent) => void

/**
 * 基础执行器
 * 负责执行 AnoraGraph 中的节点
 *
 * 设计原则：
 * - 迭代间使用同步，支持环结构（如周期性触发器）
 * - 不使用最大迭代次数限制，用户可自行取消执行
 * - 直通节点在数据传播时立即执行
 */
export class BasicExecutor {
  /** 执行状态 */
  private _status: ExecutorStatus = ExecutorStatus.Idle

  /** 当前执行的 Bluebird Promise（用于取消） */
  private currentExecution: Bluebird<ExecutionResult> | null = null

  /** 事件监听器 */
  private listeners: Set<ExecutorEventListener> = new Set()

  /** Demo recorder (optional) */
  private demoRecorder?: DemoRecorder

  /**
   * Set demo recorder for recording execution
   */
  setDemoRecorder(recorder: DemoRecorder | undefined): void {
    this.demoRecorder = recorder
  }

  /**
   * 获取当前状态
   */
  get status(): ExecutorStatus {
    return this._status
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
   * 发送事件
   */
  private emit(event: ExecutorEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (e) {
        console.error('Event listener error:', e)
      }
    }
  }

  /**
   * 执行图
   *
   * 流程：
   * 1. 初始化：查询所有节点的可运行状态
   * 2. 执行已准备好的节点（并行），然后传播数据
   * 3. 重复直到没有节点可以执行或用户取消
   *
   * 支持环结构，不限制最大迭代次数
   */
  async execute(graph: AnoraGraph, context?: ExecutorContext): Promise<ExecutionResult> {
    if (this._status === ExecutorStatus.Running) {
      throw new Error('Executor is already running')
    }

    const startTime = Date.now()
    this._status = ExecutorStatus.Running

    const execContext: ExecutorContext = context ?? DEFAULT_EXECUTOR_CONTEXT

    // 重置所有节点的激活状态
    for (const node of graph.getAllNodes()) {
      node.resetActivationState()
    }

    this.emit({ type: 'start' })

    let iterations = 0
    let cancelled = false

    // 创建可取消的执行 Promise
    this.currentExecution = new Bluebird<ExecutionResult>(async (resolve, reject, onCancel) => {
      // 设置取消回调
      onCancel?.(() => {
        cancelled = true
      })

      try {
        // 迭代阶段：循环直到没有就绪节点或用户取消
        while (!cancelled) {
          iterations++
          this.emit({ type: 'iteration', iteration: iterations })

          // 迭代开始前的延迟（跳过第一次迭代）- 移到数据传播后
          // if (iterations > 1 && execContext.iterationDelay && execContext.iterationDelay > 0) {
          //   ...
          // }

          // 检查取消状态
          if (cancelled) break

          const readyNodes = this.findReadyNodes(graph)

          if (readyNodes.length === 0) {
            // 没有就绪节点，执行完成
            break
          }

          const results = await this.executeNodes(readyNodes, graph, execContext, cancelled)

          // 检查取消状态
          if (cancelled) break

          // Record iteration if demo recorder is active
          if (this.demoRecorder?.isActive()) {
            const activatedNodeIds = readyNodes.map((n) => n.id)
            this.demoRecorder.recordIteration(graph.getAllNodes(), activatedNodeIds)
          }

          // 检查是否有节点失败
          const failed = results.filter((r) => !r.success)
          if (failed.length > 0) {
            const errorMessages = failed.map((f) => f.error?.message || 'Unknown error').join('; ')
            throw new Error(`Nodes failed: ${errorMessages}`)
          }
        }

        if (cancelled) {
          this._status = ExecutorStatus.Cancelled
          this.emit({ type: 'cancelled' })
          resolve({
            status: ExecutorStatus.Cancelled,
            iterations,
            duration: Date.now() - startTime,
          })
          return
        }

        this._status = ExecutorStatus.Completed
        const result: ExecutionResult = {
          status: ExecutorStatus.Completed,
          iterations,
          duration: Date.now() - startTime,
        }
        this.emit({ type: 'complete', result })
        resolve(result)
      } catch (error) {
        this._status = ExecutorStatus.Error
        const err = error instanceof Error ? error : new Error(String(error))
        this.emit({ type: 'error', error: err })
        resolve({
          status: ExecutorStatus.Error,
          error: err,
          iterations,
          duration: Date.now() - startTime,
        })
      }
    })

    try {
      return await this.currentExecution
    } finally {
      this.currentExecution = null
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    if (this._status === ExecutorStatus.Running && this.currentExecution) {
      this.currentExecution.cancel()
    }
  }

  /**
   * 重置执行器状态
   */
  reset(): void {
    if (this._status === ExecutorStatus.Running) {
      throw new Error('Cannot reset while running')
    }
    this._status = ExecutorStatus.Idle
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
   * 5. 如果有延迟设置，等待延迟后再发送 node-complete 事件
   */
  private async executeNodes(
    nodes: BaseNode[],
    graph: AnoraGraph,
    context: ExecutorContext,
    cancelled: boolean,
  ): Promise<NodeExecutionResult[]> {
    const results: NodeExecutionResult[] = []

    // 并行执行所有节点（先只发送 node-start，暂不发送 node-complete）
    const promises = nodes.map(async (node) => {
      try {
        this.emit({ type: 'node-start', node })
        await node.activate(context)
        // 暂不发送 node-complete，等数据传播和延迟后再发送
        return { node, success: true, error: undefined } as NodeExecutionResult
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        // 失败时立即发送 node-complete
        this.emit({ type: 'node-complete', node, success: false, error: err })
        // 录制节点激活失败
        this.demoRecorder?.recordNodeActivated(node.id, false, err.message)
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
    if (cancelled) {
      return results
    }

    // 对成功执行的节点：清空入 Port，传播出 Port 数据
    for (const result of results) {
      if (result.success) {
        // 清空执行后节点的入 Port（避免下一次激活时残留脏数据）
        this.clearNodeInputPorts(result.node)

        // 传播数据到下游，并处理直通节点
        await this.propagateDataWithDirectThrough(result.node, graph, context)
      }
    }

    // 数据传播后的延迟（用于调试/演示，让用户看到执行状态和边数据）
    if (context.iterationDelay && context.iterationDelay > 0) {
      try {
        await cancellableDelay(context.iterationDelay)
      } catch {
        // 延迟被取消，忽略
      }
    }

    // 延迟结束后，发送成功节点的 node-complete 事件
    for (const result of results) {
      if (result.success) {
        this.emit({ type: 'node-complete', node: result.node, success: true })
        // 录制节点激活
        this.demoRecorder?.recordNodeActivated(result.node.id, true)
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
      this.emit({ type: 'data-propagate', transfers })
      // 录制数据传播
      this.demoRecorder?.recordDataPropagate(
        transfers.map((t) => ({
          sourcePortId: t.fromPortId,
          targetPortId: t.toPortId,
          data: t.data,
        })),
      )
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
      this.emit({ type: 'node-start', node })
      await node.activate(context)
      this.emit({ type: 'node-complete', node, success: true })
      // 录制直通节点激活
      this.demoRecorder?.recordNodeActivated(node.id, true)

      // 清空入 Port
      this.clearNodeInputPorts(node)

      // 递归传播数据（可能触发更多直通节点）
      await this.propagateDataWithDirectThrough(node, graph, context)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: 'node-complete', node, success: false, error: err })
      // 录制直通节点激活失败
      this.demoRecorder?.recordNodeActivated(node.id, false, err.message)
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
