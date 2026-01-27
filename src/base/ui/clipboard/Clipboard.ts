/**
 * Clipboard - 剪贴板管理器
 *
 * 使用系统剪贴板存储 ANORA 图数据
 * 支持跨图、跨窗口、跨应用复制粘贴
 */

import type { ClipboardData, ClipboardEvent, ClipboardEventListener } from './types'
import { ClipboardEventType, CLIPBOARD_MARKER } from './types'
import type { useGraphStore } from '@/stores/graph'
import type { BaseNode } from '@/base/runtime/nodes'
import type { SerializedGraph } from '@/base/runtime/types'
import { NodeRegistry } from '@/base/runtime/registry'
import type { EditHistory } from '../history/EditHistory'
import { EditCommandType, type SerializedEditCommand } from '@/base/runtime/timeline'
import { AnoraGraph } from '@/base/runtime/graph'

type GraphStore = ReturnType<typeof useGraphStore>

/**
 * 剪贴板管理器
 */
export class Clipboard {
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
   * 从系统剪贴板读取 ANORA 数据
   * @returns 剪贴板数据或 null
   */
  async readFromSystemClipboard(): Promise<ClipboardData | null> {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return null

      const parsed = JSON.parse(text)
      // 验证是否为 ANORA 剪贴板数据
      if (parsed?.marker !== CLIPBOARD_MARKER) {
        return null
      }

      return parsed as ClipboardData
    } catch (e) {
      // 解析失败或剪贴板无权限
      console.warn('[Clipboard] Failed to read from system clipboard:', e)
      return null
    }
  }

  /**
   * 写入数据到系统剪贴板
   */
  private async writeToSystemClipboard(data: ClipboardData): Promise<void> {
    const json = JSON.stringify(data, null, 2)
    await navigator.clipboard.writeText(json)
  }

  /**
   * 是否有数据（异步检查系统剪贴板）
   */
  async hasData(): Promise<boolean> {
    const data = await this.readFromSystemClipboard()
    return data !== null && data.graph.nodes.length > 0
  }

  /**
   * 获取剪贴板数据（异步）
   */
  async getData(): Promise<ClipboardData | null> {
    return await this.readFromSystemClipboard()
  }

  /**
   * 复制选中的节点到系统剪贴板
   * @param graphStore - 图存储
   */
  async copy(graphStore: GraphStore): Promise<void> {
    const selectedNodeIds = [...graphStore.selectedNodeIds]
    if (selectedNodeIds.length === 0) return

    const nodeIds = new Set<string>(selectedNodeIds)

    // 创建临时图来收集选中的节点和边
    const tempGraph = new AnoraGraph()
    const tempPositions = new Map<string, { x: number; y: number }>()
    const tempSizes = new Map<string, { width: number; height: number }>()

    // 添加选中的节点
    for (const nodeId of selectedNodeIds) {
      const node = graphStore.currentGraph.getNode(nodeId)
      if (!node) continue

      tempGraph.addNode(node)

      // 记录位置和尺寸
      const pos = graphStore.nodePositions.get(nodeId)
      if (pos) {
        tempPositions.set(nodeId, { x: pos.x, y: pos.y })
      }
      const size = graphStore.nodeSizes.get(nodeId)
      if (size) {
        tempSizes.set(nodeId, { width: size.width, height: size.height })
      }
    }

    // 添加内部边（两端都在选中节点中的边）
    const allEdges = graphStore.currentGraph.getAllEdges()
    for (const edge of allEdges) {
      const fromNode = graphStore.currentGraph.getNodeByPortId(edge.fromPortId)
      const toNode = graphStore.currentGraph.getNodeByPortId(edge.toPortId)

      if (fromNode && toNode && nodeIds.has(fromNode.id) && nodeIds.has(toNode.id)) {
        // 使用 AnoraGraph 的 addEdge，会进行有效性检查
        tempGraph.addEdge(edge.fromPortId, edge.toPortId)
      }
    }

    // 使用 AnoraGraph 的 serialize 方法
    const graphData: SerializedGraph = tempGraph.serialize(tempPositions, tempSizes)

    const clipboardData: ClipboardData = {
      marker: CLIPBOARD_MARKER,
      graph: graphData,
    }

    // 写入系统剪贴板
    await this.writeToSystemClipboard(clipboardData)

    this.emit({ type: ClipboardEventType.COPY, data: clipboardData })
  }

  /**
   * 从系统剪贴板粘贴节点到指定位置
   * @param graphStore Graph Store
   * @param position 粘贴位置（画布坐标）
   * @param editHistory 编辑历史（可选，用于记录撤销）
   */
  async paste(
    graphStore: GraphStore,
    position: { x: number; y: number },
    editHistory?: EditHistory,
  ): Promise<void> {
    const clipboardData = await this.readFromSystemClipboard()
    if (!clipboardData || clipboardData.graph.nodes.length === 0) return

    const { graph } = clipboardData

    // 计算原始节点的中心点
    let centerX = 0
    let centerY = 0
    let count = 0

    for (const nodeData of graph.nodes) {
      if (nodeData.position) {
        centerX += nodeData.position.x
        centerY += nodeData.position.y
        count++
      }
    }

    if (count > 0) {
      centerX /= count
      centerY /= count
    }

    // 生成 ID 映射（旧 ID -> 新 ID）
    const nodeIdMap = new Map<string, string>()
    const portIdMap = new Map<string, string>()

    // 创建新节点
    const createdNodes: BaseNode[] = []
    const commands: SerializedEditCommand[] = []

    for (const nodeData of graph.nodes) {
      // 直接反序列化得到节点
      const node = NodeRegistry.createNode(nodeData.typeId, nodeData.id, nodeData.label) as
        | BaseNode
        | undefined
      if (!node) {
        console.error(`[Clipboard] Failed to create node of type: ${nodeData.typeId}`)
        continue
      }
      node.deserialize(nodeData)

      // 重新生成 ID
      const { oldNodeId, newNodeId, portIdMap: pMap } = node.regenerateIds()

      // 合并 ID 映射
      nodeIdMap.set(oldNodeId, newNodeId)
      for (const [oldId, newId] of pMap) {
        portIdMap.set(oldId, newId)
      }

      createdNodes.push(node)

      // 计算新位置：相对于原中心的偏移 + 粘贴位置
      const originalPos = nodeData.position ?? { x: 0, y: 0 }
      const newPosition = {
        x: position.x + (originalPos.x - centerX),
        y: position.y + (originalPos.y - centerY),
      }

      // 先执行添加操作
      graphStore.addNode(node)
      graphStore.updateNodePosition(node.id, newPosition)

      // 如果有编辑历史，记录命令用于撤销
      if (editHistory) {
        commands.push({
          type: EditCommandType.ADD_NODE,
          nodeData: node.serialize(),
          position: newPosition,
          connectedEdges: [],
        })
      }
    }

    // 创建边（使用新的 Port ID）
    for (const edge of graph.edges) {
      const newFromPortId = portIdMap.get(edge.fromPortId)
      const newToPortId = portIdMap.get(edge.toPortId)

      if (newFromPortId && newToPortId) {
        // 先执行添加边操作
        graphStore.addEdge(newFromPortId, newToPortId)

        // 如果有编辑历史，记录命令用于撤销
        if (editHistory) {
          commands.push({
            type: EditCommandType.ADD_EDGE,
            fromPortId: newFromPortId,
            toPortId: newToPortId,
          })
        }
      }
    }

    // 如果有编辑历史，使用批量命令
    if (editHistory && commands.length > 0) {
      const batchData: SerializedEditCommand = {
        type: EditCommandType.BATCH,
        commands,
        description: `Paste ${graph.nodes.length} node(s)`,
      }
      editHistory.push(EditCommandType.BATCH, batchData, `Paste ${graph.nodes.length} node(s)`)
    }

    // 选中新粘贴的节点
    graphStore.selectNodesByIds(createdNodes.map((n) => n.id))

    this.emit({ type: ClipboardEventType.PASTE, data: clipboardData })
  }

  /**
   * 清空剪贴板（清除系统剪贴板中的 ANORA 数据）
   */
  async clear(): Promise<void> {
    // 检查当前剪贴板是否是 ANORA 数据，如果是则清空
    const data = await this.readFromSystemClipboard()
    if (data) {
      await navigator.clipboard.writeText('')
    }
    this.emit({ type: ClipboardEventType.CLEAR })
  }
}
