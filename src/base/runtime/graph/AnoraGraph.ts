import { BaseNode } from '../nodes/BaseNode'
import { BasePort, ContainerPort } from '../ports'
import { areTypesCompatible } from '../types'
import type { SerializedGraph, SerializedEdge, SerializedNode } from '../types'
import { NodeRegistry } from '../registry'

/**
 * 边的内部表示
 */
interface Edge {
  fromPortId: string
  toPortId: string
}

/**
 * 反序列化结果
 */
export interface DeserializeResult {
  graph: AnoraGraph
  nodePositions: Map<string, { x: number; y: number }>
}

/**
 * AnoraGraph - 图管理类
 * 维护 Port 之间的连接关系，支持序列化/反序列化
 */
export class AnoraGraph {
  /** 图中的所有节点 */
  private nodes: Map<string, BaseNode> = new Map()

  /** 所有边（连接关系） */
  private edges: Edge[] = []

  /** 不兼容的边（类型不匹配的连接） */
  private incompatibleEdges: Set<string> = new Set()

  /** Port ID 到 Node 的映射（用于 O(1) 查询） */
  private portToNode: Map<string, BaseNode> = new Map()

  /** 出 Port ID 到连接的入 Port ID 列表的映射 */
  private outPortConnections: Map<string, string[]> = new Map()

  /** 入 Port ID 到连接的出 Port ID 列表的映射 */
  private inPortConnections: Map<string, string[]> = new Map()

  /** 图更新监听器列表 */
  private updateListeners: Array<() => void> = []

  /**
   * 添加图更新监听器
   * @returns 取消监听的函数
   */
  onUpdate(callback: () => void): () => void {
    this.updateListeners.push(callback)
    // 返回取消监听函数
    return () => {
      const index = this.updateListeners.indexOf(callback)
      if (index > -1) {
        this.updateListeners.splice(index, 1)
      }
    }
  }

  /**
   * 移除所有更新监听器
   */
  clearUpdateListeners(): void {
    this.updateListeners = []
  }

  /**
   * 触发更新回调
   */
  private notifyUpdate(): void {
    for (const listener of this.updateListeners) {
      listener()
    }
  }

  // ==================== 节点操作 ====================

  /**
   * 添加节点
   */
  addNode(node: BaseNode): void {
    this.nodes.set(node.id, node)

    // 建立 Port 到 Node 的映射
    for (const port of node.getAllPorts()) {
      this.portToNode.set(port.id, node)
      this.registerContainerPortChildren(port, node)
    }

    this.notifyUpdate()
  }

  /**
   * 递归注册 ContainerPort 的子 Port
   */
  private registerContainerPortChildren(port: BasePort, node: BaseNode): void {
    if (port instanceof ContainerPort) {
      for (const child of port.getChildren()) {
        this.portToNode.set(child.id, node)
        this.registerContainerPortChildren(child, node)
      }
    }
  }

  /**
   * 移除节点
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId)
    if (!node) return

    // 移除与该节点相关的所有边
    const portsToRemove = node.getAllPorts().map((p) => p.id)
    this.edges = this.edges.filter(
      (edge) => !portsToRemove.includes(edge.fromPortId) && !portsToRemove.includes(edge.toPortId),
    )

    // 更新连接映射
    for (const portId of portsToRemove) {
      this.outPortConnections.delete(portId)
      this.inPortConnections.delete(portId)
      this.portToNode.delete(portId)
    }

    this.nodes.delete(nodeId)
    this.notifyUpdate()
  }

  /**
   * 获取节点
   */
  getNode(nodeId: string): BaseNode | undefined {
    return this.nodes.get(nodeId)
  }

  /**
   * 获取所有节点
   */
  getAllNodes(): BaseNode[] {
    return Array.from(this.nodes.values())
  }

  // ==================== 边操作 ====================

  /**
   * 获取所有边
   */
  getAllEdges(): Array<{ fromPortId: string; toPortId: string }> {
    return [...this.edges]
  }

  /**
   * 添加边（连接两个 Port）
   */
  addEdge(fromPortId: string, toPortId: string): boolean {
    const fromNode = this.portToNode.get(fromPortId)
    const toNode = this.portToNode.get(toPortId)

    if (!fromNode || !toNode) {
      console.error('[Graph] Cannot add edge: port not found')
      return false
    }

    const fromPort = fromNode.getPortById(fromPortId)
    const toPort = toNode.getPortById(toPortId)

    if (!fromPort || !toPort) {
      console.error('[Graph] Cannot add edge: port not found in node')
      return false
    }

    // 验证连接
    if (!this.canConnect(fromPort, toPort)) {
      console.error('[Graph] Cannot add edge: ports are not compatible')
      return false
    }

    // 添加边
    this.edges.push({ fromPortId, toPortId })

    // 更新连接映射
    if (!this.outPortConnections.has(fromPortId)) {
      this.outPortConnections.set(fromPortId, [])
    }
    this.outPortConnections.get(fromPortId)!.push(toPortId)

    if (!this.inPortConnections.has(toPortId)) {
      this.inPortConnections.set(toPortId, [])
    }
    this.inPortConnections.get(toPortId)!.push(fromPortId)

    this.notifyUpdate()
    return true
  }

  /**
   * 移除边
   */
  removeEdge(fromPortId: string, toPortId: string): void {
    this.edges = this.edges.filter(
      (edge) => !(edge.fromPortId === fromPortId && edge.toPortId === toPortId),
    )

    // 更新连接映射
    const outConnections = this.outPortConnections.get(fromPortId)
    if (outConnections) {
      const index = outConnections.indexOf(toPortId)
      if (index > -1) {
        outConnections.splice(index, 1)
      }
    }

    const inConnections = this.inPortConnections.get(toPortId)
    if (inConnections) {
      const index = inConnections.indexOf(fromPortId)
      if (index > -1) {
        inConnections.splice(index, 1)
      }
    }

    this.notifyUpdate()
  }

  /**
   * 验证两个 Port 是否可以连接
   */
  canConnect(fromPort: BasePort, toPort: BasePort): boolean {
    // 检查类型兼容性
    if (!areTypesCompatible(fromPort.dataType, toPort.dataType)) {
      return false
    }

    // TODO: 检查直通 ForwardNode 环
    // 这需要在添加边后进行深度优先搜索检测环

    return true
  }

  /**
   * 检查节点相关的所有边是否兼容
   * 当节点 Port 类型变更时调用
   * @param nodeId 要检查的节点 ID
   * @returns 不兼容边的数组 [fromPortId, toPortId][]
   */
  checkNodeEdgesCompatibility(nodeId: string): Array<[string, string]> {
    const node = this.nodes.get(nodeId)
    if (!node) return []

    const incompatible: Array<[string, string]> = []
    const nodePorts = new Set(node.getAllPorts().map((p) => p.id))

    // 检查所有与该节点相关的边
    for (const edge of this.edges) {
      if (nodePorts.has(edge.fromPortId) || nodePorts.has(edge.toPortId)) {
        const fromNode = this.portToNode.get(edge.fromPortId)
        const toNode = this.portToNode.get(edge.toPortId)

        if (!fromNode || !toNode) continue

        const fromPort = fromNode.getPortById(edge.fromPortId)
        const toPort = toNode.getPortById(edge.toPortId)

        if (!fromPort || !toPort) continue

        // 检查类型兼容性
        if (!areTypesCompatible(fromPort.dataType, toPort.dataType)) {
          incompatible.push([edge.fromPortId, edge.toPortId])
          this.incompatibleEdges.add(`${edge.fromPortId}->${edge.toPortId}`)
        } else {
          // 如果之前不兼容现在兼容了，移除标记
          this.incompatibleEdges.delete(`${edge.fromPortId}->${edge.toPortId}`)
        }
      }
    }

    return incompatible
  }

  /**
   * 获取所有不兼容的边
   */
  getIncompatibleEdges(): Set<string> {
    return new Set(this.incompatibleEdges)
  }

  /**
   * 检查边是否不兼容
   */
  isEdgeIncompatible(fromPortId: string, toPortId: string): boolean {
    return this.incompatibleEdges.has(`${fromPortId}->${toPortId}`)
  }

  // ==================== O(1) 查询 ====================

  /**
   * 根据 Port 获取所属 Node
   */
  getNodeByPort(port: BasePort): BaseNode | undefined {
    return this.portToNode.get(port.id)
  }

  /**
   * 根据 Port ID 获取所属 Node
   */
  getNodeByPortId(portId: string): BaseNode | undefined {
    return this.portToNode.get(portId)
  }

  /**
   * 获取与指定 Port 连接的 Port 列表
   */
  getConnectedPorts(port: BasePort): BasePort[] {
    const result: BasePort[] = []

    // 检查作为出 Port 的连接
    const outConnections = this.outPortConnections.get(port.id)
    if (outConnections) {
      for (const toPortId of outConnections) {
        const toNode = this.portToNode.get(toPortId)
        if (toNode) {
          const toPort = toNode.getPortById(toPortId)
          if (toPort) {
            result.push(toPort)
          }
        }
      }
    }

    // 检查作为入 Port 的连接
    const inConnections = this.inPortConnections.get(port.id)
    if (inConnections) {
      for (const fromPortId of inConnections) {
        const fromNode = this.portToNode.get(fromPortId)
        if (fromNode) {
          const fromPort = fromNode.getPortById(fromPortId)
          if (fromPort) {
            result.push(fromPort)
          }
        }
      }
    }

    return result
  }

  /**
   * 获取与指定 Port 及其子 Port 连接的 Port 列表
   */
  getConnectedPortsIncludingChildren(port: BasePort): BasePort[] {
    const result = this.getConnectedPorts(port)

    if (port instanceof ContainerPort) {
      for (const child of port.getChildren()) {
        result.push(...this.getConnectedPortsIncludingChildren(child))
      }
    }

    return result
  }

  /**
   * 获取节点的上游节点列表（入 Port 连接的节点）
   */
  getUpstreamNodes(node: BaseNode): BaseNode[] {
    const result: Set<BaseNode> = new Set()

    for (const port of node.getAllPorts()) {
      const inConnections = this.inPortConnections.get(port.id)
      if (inConnections) {
        for (const fromPortId of inConnections) {
          const fromNode = this.portToNode.get(fromPortId)
          if (fromNode && fromNode !== node) {
            result.add(fromNode)
          }
        }
      }
    }

    return Array.from(result)
  }

  /**
   * 获取节点的下游节点列表（出 Port 连接的节点）
   */
  getDownstreamNodes(node: BaseNode): BaseNode[] {
    const result: Set<BaseNode> = new Set()

    for (const port of node.getAllPorts()) {
      const outConnections = this.outPortConnections.get(port.id)
      if (outConnections) {
        for (const toPortId of outConnections) {
          const toNode = this.portToNode.get(toPortId)
          if (toNode && toNode !== node) {
            result.add(toNode)
          }
        }
      }
    }

    return Array.from(result)
  }

  /**
   * 获取出 Port 连接的入 Port 列表
   */
  getOutPortConnections(outPortId: string): BasePort[] {
    const connections = this.outPortConnections.get(outPortId) ?? []
    const result: BasePort[] = []

    for (const toPortId of connections) {
      const toNode = this.portToNode.get(toPortId)
      if (toNode) {
        const toPort = toNode.getPortById(toPortId)
        if (toPort) {
          result.push(toPort)
        }
      }
    }

    return result
  }

  // ==================== 序列化 ====================

  /**
   * 序列化图
   * @param nodePositions 可选的节点位置映射（从 UI 层传入）
   */
  serialize(nodePositions?: Map<string, { x: number; y: number }>): SerializedGraph {
    const serializedEdges: SerializedEdge[] = this.edges.map((edge) => ({
      fromPortId: edge.fromPortId,
      toPortId: edge.toPortId,
    }))

    return {
      schemaVersion: 1,
      nodes: Array.from(this.nodes.values()).map((node) => {
        const serialized = node.serialize()
        // 如果提供了位置映射，使用 UI 层的位置
        if (nodePositions) {
          const pos = nodePositions.get(node.id)
          if (pos) {
            serialized.position = { x: pos.x, y: pos.y }
          }
        }
        return serialized
      }),
      edges: serializedEdges,
    }
  }

  /**
   * 从序列化数据创建新图（静态工厂方法）
   * 返回图实例和节点位置映射
   */
  static fromSerialized(data: SerializedGraph): DeserializeResult {
    const graph = new AnoraGraph()
    const nodePositions = new Map<string, { x: number; y: number }>()

    // 恢复节点
    for (const nodeData of data.nodes) {
      const node = graph.deserializeNode(nodeData)
      if (node) {
        graph.addNode(node)
        // 提取位置信息
        if (nodeData.position) {
          nodePositions.set(node.id, { x: nodeData.position.x, y: nodeData.position.y })
        }
      }
    }

    // 恢复边
    for (const edgeData of data.edges) {
      graph.addEdge(edgeData.fromPortId, edgeData.toPortId)
    }

    return { graph, nodePositions }
  }

  /**
   * 从序列化数据恢复图（实例方法，就地修改）
   */
  deserialize(data: SerializedGraph): void {
    // 清空当前图
    this.clear()

    // 恢复节点
    for (const nodeData of data.nodes) {
      const node = this.deserializeNode(nodeData)
      if (node) {
        this.addNode(node)
      }
    }

    // 恢复边
    for (const edgeData of data.edges) {
      this.addEdge(edgeData.fromPortId, edgeData.toPortId)
    }
  }

  /**
   * 反序列化单个节点
   */
  private deserializeNode(data: SerializedNode): BaseNode | null {
    const node = NodeRegistry.createNode(data.typeId, data.id, data.label)
    if (!node) {
      console.warn(`[AnoraGraph] Failed to create node of type: ${data.typeId}`)
      return null
    }

    const baseNode = node as BaseNode

    // 恢复 context
    if (data.context && baseNode.context) {
      baseNode.context = data.context
    }

    // 恢复端口数据
    this.deserializePorts(baseNode, data)

    return baseNode
  }

  /**
   * 反序列化节点的端口数据
   */
  private deserializePorts(node: BaseNode, data: SerializedNode): void {
    // 恢复端口 ID（必须在恢复端口数据之前，这样边连接才能正确恢复）
    node.restorePortIds(data)

    // 恢复入端口数据
    for (const [portName, portData] of Object.entries(data.inPorts)) {
      const port = node.inPorts.get(portName)
      if (port && portData.data !== null) {
        try {
          port.deserialize(portData)
        } catch (e) {
          console.warn(`[AnoraGraph] Failed to deserialize inPort ${portName}:`, e)
        }
      }
    }

    // 恢复出端口数据
    for (const [portName, portData] of Object.entries(data.outPorts)) {
      const port = node.outPorts.get(portName)
      if (port && portData.data !== null) {
        try {
          port.deserialize(portData)
        } catch (e) {
          console.warn(`[AnoraGraph] Failed to deserialize outPort ${portName}:`, e)
        }
      }
    }
  }

  /**
   * 清空图
   */
  clear(): void {
    this.nodes.clear()
    this.edges = []
    this.portToNode.clear()
    this.outPortConnections.clear()
    this.inPortConnections.clear()
  }
}
