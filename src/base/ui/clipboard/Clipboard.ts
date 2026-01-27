/**
 * Clipboard - 剪贴板管理器
 *
 * 提供节点的复制/粘贴功能
 */

import type { ClipboardData, ClipboardEvent, ClipboardEventListener } from './types'
import { ClipboardEventType } from './types'
import type { useGraphStore } from '@/stores/graph'
import type { BaseNode } from '@/base/runtime/nodes'
import type { SerializedEdge } from '@/base/runtime/types'
import { NodeRegistry } from '@/base/runtime/registry'
import type { EditHistory } from '../history/EditHistory'
import { EditCommandType, type SerializedEditCommand } from '@/base/runtime/timeline'

type GraphStore = ReturnType<typeof useGraphStore>

/**
 * 剪贴板管理器
 */
export class Clipboard {
  /** 剪贴板数据 */
  private data: ClipboardData | null = null

  /** 事件监听器 */
  private listeners: ClipboardEventListener[] = []

  /**
   * 添加事件监听器
   */
  on(listener: ClipboardEventListener): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * 触发事件
   */
  private emit(event: ClipboardEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  /**
   * 是否有数据
   */
  hasData(): boolean {
    return this.data !== null && this.data.nodes.length > 0
  }

  /**
   * 获取剪贴板数据
   */
  getData(): ClipboardData | null {
    return this.data
  }

  /**
   * 复制选中的节点
   * @param graphStore - 图存储
   */
  copy(graphStore: GraphStore): void {
    const selectedNodeIds = [...graphStore.selectedNodeIds]
    if (selectedNodeIds.length === 0) return

    const nodes: ClipboardData['nodes'] = []
    const nodeIds = new Set<string>(selectedNodeIds)

    // 计算选区中心
    let centerX = 0
    let centerY = 0
    let count = 0

    for (const nodeId of selectedNodeIds) {
      const pos = graphStore.nodePositions.get(nodeId)
      if (pos) {
        centerX += pos.x
        centerY += pos.y
        count++
      }
    }

    if (count > 0) {
      centerX /= count
      centerY /= count
    }

    // 收集节点数据
    for (const nodeId of selectedNodeIds) {
      const node = graphStore.currentGraph.getNode(nodeId)
      if (!node) continue

      const pos = graphStore.nodePositions.get(nodeId) ?? { x: 0, y: 0 }
      nodeIds.add(nodeId)

      nodes.push({
        node: node.serialize(),
        offset: {
          x: pos.x - centerX,
          y: pos.y - centerY,
        },
      })
    }

    // 收集内部边（两端都在选中节点中的边）
    const edges: SerializedEdge[] = []
    const allEdges = graphStore.currentGraph.getAllEdges()

    for (const edge of allEdges) {
      const fromNode = graphStore.currentGraph.getNodeByPortId(edge.fromPortId)
      const toNode = graphStore.currentGraph.getNodeByPortId(edge.toPortId)

      if (fromNode && toNode && nodeIds.has(fromNode.id) && nodeIds.has(toNode.id)) {
        edges.push({
          fromPortId: edge.fromPortId,
          toPortId: edge.toPortId,
        })
      }
    }

    this.data = { nodes, edges }
    this.emit({ type: ClipboardEventType.COPY, data: this.data })
  }

  /**
   * 粘贴节点到指定位置
   * @param graphStore Graph Store
   * @param position 粘贴位置（画布坐标）
   * @param editHistory 编辑历史（可选，用于记录撤销）
   */
  paste(
    graphStore: GraphStore,
    position: { x: number; y: number },
    editHistory?: EditHistory,
  ): void {
    if (!this.data || this.data.nodes.length === 0) return

    // 生成 ID 映射（旧 ID -> 新 ID）
    const nodeIdMap = new Map<string, string>()
    const portIdMap = new Map<string, string>()

    // 创建新节点
    const createdNodes: BaseNode[] = []
    const commands: SerializedEditCommand[] = []

    for (const nodeData of this.data.nodes) {
      // 直接反序列化得到节点
      const node = NodeRegistry.createNode(
        nodeData.node.typeId,
        nodeData.node.id,
        nodeData.node.label,
      ) as BaseNode | undefined
      if (!node) {
        console.error(`[Clipboard] Failed to create node of type: ${nodeData.node.typeId}`)
        continue
      }
      node.deserialize(nodeData.node)

      // 重新生成 ID
      const { oldNodeId, newNodeId, portIdMap: pMap } = node.regenerateIds()

      // 合并 ID 映射
      nodeIdMap.set(oldNodeId, newNodeId)
      for (const [oldId, newId] of pMap) {
        portIdMap.set(oldId, newId)
      }

      createdNodes.push(node)

      // 计算新位置
      const newPosition = {
        x: position.x + nodeData.offset.x,
        y: position.y + nodeData.offset.y,
      }

      if (editHistory) {
        commands.push({
          type: EditCommandType.ADD_NODE,
          nodeData: node.serialize(),
          position: newPosition,
          connectedEdges: [],
        })
      } else {
        graphStore.addNode(node)
        graphStore.updateNodePosition(node.id, newPosition)
      }
    }

    // 创建边（使用新的 Port ID）
    for (const edge of this.data.edges) {
      const newFromPortId = portIdMap.get(edge.fromPortId)
      const newToPortId = portIdMap.get(edge.toPortId)

      if (newFromPortId && newToPortId) {
        if (editHistory) {
          commands.push({
            type: EditCommandType.ADD_EDGE,
            fromPortId: newFromPortId,
            toPortId: newToPortId,
          })
        } else {
          graphStore.addEdge(newFromPortId, newToPortId)
        }
      }
    }

    // 如果有编辑历史，使用批量命令
    if (editHistory && commands.length > 0) {
      const batchData: SerializedEditCommand = {
        type: EditCommandType.BATCH,
        commands,
        description: `Paste ${this.data.nodes.length} node(s)`,
      }
      editHistory.push(EditCommandType.BATCH, batchData, `Paste ${this.data.nodes.length} node(s)`)
    }

    // 选中新粘贴的节点
    graphStore.selectNodesByIds(createdNodes.map((n) => n.id))

    this.emit({ type: ClipboardEventType.PASTE, data: this.data })
  }

  /**
   * 清空剪贴板
   */
  clear(): void {
    this.data = null
    this.emit({ type: ClipboardEventType.CLEAR })
  }
}
