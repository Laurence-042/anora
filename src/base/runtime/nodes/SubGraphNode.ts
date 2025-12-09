import type { ExecutorContext } from '../types'
import { WebNode } from './NodeTypes'
import { NullPort } from '../ports'
import { BasePort } from '../ports'
import { AnoraGraph } from '../graph'
import { BasicExecutor } from '../executor'
import { AnoraRegister } from '../registry'

import type { NodeInput, NodeOutput } from './BaseNode'

/**
 * SubGraphNode - 子图节点
 * 将一个完整的图作为一个节点执行
 *
 * 入 Port: 动态，基于子图的入口节点
 * 出 Port: 动态，基于子图的出口节点
 *
 * context: { graph: AnoraGraph }
 */
@AnoraRegister('base.SubGraphNode')
export class SubGraphNode extends WebNode<NodeInput, NodeOutput> {
  /** 内部图 */
  private _graph: AnoraGraph | null = null

  /** 内部执行器 */
  private _executor: BasicExecutor | null = null

  /** 入口节点 ID 到入 Port 名称的映射 */
  private entryMappings: Map<string, string> = new Map()

  /** 出口节点 ID 到出 Port 名称的映射 */
  private exitMappings: Map<string, string> = new Map()

  constructor(id?: string, label?: string) {
    super(id, label ?? 'SubGraph')
  }

  /**
   * 获取内部图
   */
  get graph(): AnoraGraph | null {
    return this._graph
  }

  /**
   * 设置内部图
   */
  setGraph(graph: AnoraGraph): void {
    this._graph = graph
    this._executor = new BasicExecutor()

    // 重建 Port 映射
    this.rebuildPortMappings()
  }

  /**
   * 添加入口映射
   * @param entryNodeId 入口节点 ID
   * @param portName 对外暴露的 Port 名称
   * @param port Port 实例
   */
  addEntryMapping(entryNodeId: string, portName: string, port: BasePort): void {
    this.entryMappings.set(entryNodeId, portName)
    this.addInPort(portName, port)
  }

  /**
   * 添加出口映射
   * @param exitNodeId 出口节点 ID
   * @param portName 对外暴露的 Port 名称
   * @param port Port 实例
   */
  addExitMapping(exitNodeId: string, portName: string, port: BasePort): void {
    this.exitMappings.set(exitNodeId, portName)
    this.addOutPort(portName, port)
  }

  /**
   * 重建 Port 映射
   * 根据子图中的特殊标记节点自动创建 Port
   */
  private rebuildPortMappings(): void {
    if (!this._graph) return

    // 清空现有映射和 Port
    this.entryMappings.clear()
    this.exitMappings.clear()
    this.inPorts.clear()
    this.outPorts.clear()

    // 遍历图中的节点，寻找入口和出口节点
    // 这里假设有特殊的 EntryNode 和 ExitNode
    // 实际实现可能需要根据具体需求调整
    const nodes = this._graph.getAllNodes()

    for (const node of nodes) {
      // 检查是否是入口节点（假设 typeId 以 'Entry' 结尾）
      if (node.typeId.endsWith('Entry') || node.typeId.includes('SubGraphEntry')) {
        const portName = node.label || `entry_${node.id}`
        // 获取节点的第一个出 Port，使用 NullPort 作为默认
        const firstOutPort = Array.from(node.outPorts.values())[0]
        this.addEntryMapping(node.id, portName, firstOutPort ?? new NullPort(this))
      }

      // 检查是否是出口节点（假设 typeId 以 'Exit' 结尾）
      if (node.typeId.endsWith('Exit') || node.typeId.includes('SubGraphExit')) {
        const portName = node.label || `exit_${node.id}`
        // 获取节点的第一个入 Port，使用 NullPort 作为默认
        const firstInPort = Array.from(node.inPorts.values())[0]
        this.addExitMapping(node.id, portName, firstInPort ?? new NullPort(this))
      }
    }
  }

  async activateCore(executorContext: ExecutorContext, inData: NodeInput): Promise<NodeOutput> {
    if (!this._graph || !this._executor) {
      throw new Error('SubGraph not initialized')
    }

    // 将入数据写入入口节点
    for (const [entryNodeId, portName] of this.entryMappings) {
      const value = inData[portName]
      if (value !== undefined) {
        const entryNode = this._graph.getNode(entryNodeId)
        if (entryNode) {
          // 假设入口节点有一个 'value' 入 Port
          const inPort = entryNode.getInPort('value')
          if (inPort) {
            inPort.write(value as never)
          }
        }
      }
    }

    // 执行子图（共享 executorContext）
    const result = await this._executor.execute(this._graph, executorContext)

    if (result.error) {
      throw result.error
    }

    // 收集出口节点的输出
    const outData: Record<string, unknown> = {}

    for (const [exitNodeId, portName] of this.exitMappings) {
      const exitNode = this._graph.getNode(exitNodeId)
      if (exitNode) {
        // 假设出口节点有一个 'value' 出 Port
        const outPort = exitNode.getOutPort('value')
        if (outPort) {
          outData[portName] = outPort.peek()
        }
      }
    }

    return outData
  }

  /**
   * 序列化时包含子图
   */
  override serialize() {
    const base = super.serialize()
    return {
      ...base,
      context: {
        graph: this._graph?.serialize(),
        entryMappings: Array.from(this.entryMappings.entries()),
        exitMappings: Array.from(this.exitMappings.entries()),
      },
    }
  }
}

/** SubGraphEntryNode 入出 Port 类型 */
interface EntryExitPorts {
  value: unknown
}

/**
 * SubGraphEntryNode - 子图入口节点
 * 用于标记子图的输入点
 */
@AnoraRegister('base.SubGraphEntryNode')
export class SubGraphEntryNode extends WebNode<EntryExitPorts, EntryExitPorts> {
  constructor(id?: string, label?: string) {
    super(id, label ?? 'Entry')

    // 入 Port - 接收外部数据 (任意类型)
    this.addInPort('value', new NullPort(this))
    // 出 Port - 传递给子图内部 (任意类型)
    this.addOutPort('value', new NullPort(this))
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: EntryExitPorts,
  ): Promise<EntryExitPorts> {
    // 直接传递数据
    return { value: inData.value }
  }
}

/**
 * SubGraphExitNode - 子图出口节点
 * 用于标记子图的输出点
 */
@AnoraRegister('base.SubGraphExitNode')
export class SubGraphExitNode extends WebNode<EntryExitPorts, EntryExitPorts> {
  constructor(id?: string, label?: string) {
    super(id, label ?? 'Exit')

    // 入 Port - 接收子图内部数据 (任意类型)
    this.addInPort('value', new NullPort(this))
    // 出 Port - 传递给外部 (任意类型)
    this.addOutPort('value', new NullPort(this))
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: EntryExitPorts,
  ): Promise<EntryExitPorts> {
    // 直接传递数据
    return { value: inData.value }
  }
}
