import { ActivationReadyStatus, ExecutorStatus } from '../types'
import type { ExecutorContext } from '../types'
import { BaseNode } from '../nodes/BaseNode'
import { AnoraGraph } from '../graph/AnoraGraph'
import { DEFAULT_EXECUTOR_CONTEXT } from '../types'
import type { DemoRecorder } from '../demo/DemoRecorder'

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
 * 执行器事件
 */
export type ExecutorEvent =
  | { type: 'start' }
  | { type: 'iteration'; iteration: number }
  | { type: 'node-start'; node: BaseNode }
  | { type: 'node-complete'; node: BaseNode; success: boolean; error?: Error }
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

  /** 是否已取消 */
  private cancelled: boolean = false

  /** 事件监听器 */
  private listeners: Set<ExecutorEventListener> = new Set()

  /** 当前执行的 Promise（用于取消） */
  private currentExecution: Promise<ExecutionResult> | null = null

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
    this.cancelled = false

    const execContext: ExecutorContext = context ?? DEFAULT_EXECUTOR_CONTEXT

    // 重置所有节点的激活状态
    for (const node of graph.getAllNodes()) {
      node.resetActivationState()
    }

    this.emit({ type: 'start' })

    let iterations = 0

    try {
      // 迭代阶段：循环直到没有就绪节点或用户取消
      // 不使用最大迭代次数限制，支持环结构做周期性触发器
      while (!this.cancelled) {
        iterations++
        this.emit({ type: 'iteration', iteration: iterations })

        const readyNodes = this.findReadyNodes(graph)

        if (readyNodes.length === 0) {
          // 没有就绪节点，执行完成
          break
        }

        const results = await this.executeNodes(readyNodes, graph, execContext)

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

      if (this.cancelled) {
        this._status = ExecutorStatus.Cancelled
        this.emit({ type: 'cancelled' })
        return {
          status: ExecutorStatus.Cancelled,
          iterations,
          duration: Date.now() - startTime,
        }
      }

      this._status = ExecutorStatus.Completed
      const result: ExecutionResult = {
        status: ExecutorStatus.Completed,
        iterations,
        duration: Date.now() - startTime,
      }
      this.emit({ type: 'complete', result })
      return result
    } catch (error) {
      this._status = ExecutorStatus.Error
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: 'error', error: err })
      return {
        status: ExecutorStatus.Error,
        error: err,
        iterations,
        duration: Date.now() - startTime,
      }
    } finally {
      this.currentExecution = null
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    if (this._status === ExecutorStatus.Running) {
      this.cancelled = true
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
    this.cancelled = false
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
        this.emit({ type: 'node-start', node })
        await node.activate(context)
        this.emit({ type: 'node-complete', node, success: true })
        return { node, success: true } as NodeExecutionResult
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.emit({ type: 'node-complete', node, success: false, error: err })
        return { node, success: false, error: err } as NodeExecutionResult
      }
    })

    const settledResults = await Promise.allSettled(promises)

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

    // 对成功执行的节点：清空入 Port，传播出 Port 数据
    for (const result of results) {
      if (result.success) {
        // 清空执行后节点的入 Port（避免下一次激活时残留脏数据）
        this.clearNodeInputPorts(result.node)

        // 传播数据到下游，并处理直通节点
        await this.propagateDataWithDirectThrough(result.node, graph, context)
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

    for (const outPort of outputPorts) {
      const connectedPorts = graph.getConnectedPorts(outPort)

      for (const targetPort of connectedPorts) {
        // 使用 peek() 获取数据（不清空出 Port）
        const data = outPort.peek()

        // 即使值为 null 也要填入
        if (data !== undefined) {
          targetPort.write(data)

          // 记录受影响的节点
          const targetNode = graph.getNodeByPort(targetPort)
          if (targetNode) {
            affectedNodes.add(targetNode)
          }
        }
      }
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

      // 清空入 Port
      this.clearNodeInputPorts(node)

      // 递归传播数据（可能触发更多直通节点）
      await this.propagateDataWithDirectThrough(node, graph, context)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit({ type: 'node-complete', node, success: false, error: err })
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
