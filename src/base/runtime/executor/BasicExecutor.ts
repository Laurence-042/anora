import { ActivationReadyStatus, ExecutorStatus } from '../types'
import type { ExecutorContext } from '../types'
import { BaseNode } from '../nodes/BaseNode'
import { AnoraGraph } from '../graph/AnoraGraph'
import { DEFAULT_EXECUTOR_CONTEXT } from '../types'

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

  /** 最大迭代次数（防止无限循环） */
  maxIterations: number = 10000

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
   */
  async execute(graph: AnoraGraph, context?: ExecutorContext): Promise<ExecutionResult> {
    if (this._status === ExecutorStatus.Running) {
      throw new Error('Executor is already running')
    }

    const startTime = Date.now()
    this._status = ExecutorStatus.Running
    this.cancelled = false

    const execContext: ExecutorContext = context ?? DEFAULT_EXECUTOR_CONTEXT

    this.emit({ type: 'start' })

    let iterations = 0

    try {
      // 初始化阶段：激活所有初始就绪的节点
      const initialReadyNodes = this.findReadyNodes(graph)
      if (initialReadyNodes.length > 0) {
        await this.executeNodes(initialReadyNodes, graph, execContext)
      }

      // 迭代阶段：循环直到没有就绪节点或达到最大迭代次数
      while (!this.cancelled && iterations < this.maxIterations) {
        iterations++
        this.emit({ type: 'iteration', iteration: iterations })

        const readyNodes = this.findReadyNodes(graph)

        if (readyNodes.length === 0) {
          // 没有就绪节点，执行完成
          break
        }

        const results = await this.executeNodes(readyNodes, graph, execContext)

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

      if (iterations >= this.maxIterations) {
        throw new Error(`Max iterations (${this.maxIterations}) exceeded. Possible infinite loop.`)
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
      const status = node.checkActivationReady(connectedPorts)
      if (
        status === ActivationReadyStatus.Ready ||
        status === ActivationReadyStatus.DirectThrough
      ) {
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
   * 并行执行一组节点
   */
  private async executeNodes(
    nodes: BaseNode[],
    graph: AnoraGraph,
    context: ExecutorContext,
  ): Promise<NodeExecutionResult[]> {
    // 分离直通节点和普通节点
    const directThroughNodes: BaseNode[] = []
    const normalNodes: BaseNode[] = []

    for (const node of nodes) {
      const connectedPorts = this.getConnectedInPortIds(node, graph)
      if (node.checkActivationReady(connectedPorts) === ActivationReadyStatus.DirectThrough) {
        directThroughNodes.push(node)
      } else {
        normalNodes.push(node)
      }
    }

    const results: NodeExecutionResult[] = []

    // 先同步处理直通节点（立即传播数据）
    for (const node of directThroughNodes) {
      try {
        this.emit({ type: 'node-start', node })
        await node.activate(context)
        this.propagateData(node, graph)
        this.emit({ type: 'node-complete', node, success: true })
        results.push({ node, success: true })
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.emit({ type: 'node-complete', node, success: false, error: err })
        results.push({ node, success: false, error: err })
      }
    }

    // 并行执行普通节点
    if (normalNodes.length > 0) {
      const promises = normalNodes.map(async (node) => {
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

      const normalResults = await Promise.allSettled(promises)

      for (let i = 0; i < normalResults.length; i++) {
        const result = normalResults[i]!
        if (result.status === 'fulfilled') {
          results.push(result.value)
          // 成功执行后传播数据
          if (result.value.success) {
            this.propagateData(result.value.node, graph)
          }
        } else {
          // Promise 本身 rejected（不太可能，因为我们在上面 catch 了）
          const node = normalNodes[i]!
          results.push({
            node,
            success: false,
            error: result.reason as Error,
          })
        }
      }
    }

    return results
  }

  /**
   * 传播节点的输出数据到连接的下游端口
   */
  private propagateData(node: BaseNode, graph: AnoraGraph): void {
    const outputPorts = node.getOutputPorts()

    for (const outPort of outputPorts) {
      const connectedPorts = graph.getConnectedPorts(outPort)

      for (const targetPort of connectedPorts) {
        // 获取输出端口的数据
        const data = outPort.read()

        if (data !== undefined) {
          // 写入目标端口（会自动进行类型转换）
          targetPort.write(data)
        }
      }
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
