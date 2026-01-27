/**
 * EditOperations - 编辑操作辅助函数
 *
 * 提供常用的编辑操作，自动记录到 EditHistory
 * 这些函数会：
 * 1. 执行实际操作
 * 2. 记录到 EditHistory（如果提供）
 */

import { EditCommandType, type SerializedEditCommand } from '@/base/runtime/timeline'
import type { EditHistory } from './EditHistory'

// GraphStore 类型
interface GraphStore {
  currentGraph: {
    getNode(nodeId: string): import('@/base/runtime/nodes').BaseNode | undefined
    getNodeByPortId(portId: string): import('@/base/runtime/nodes').BaseNode | undefined
    getAllEdges(): Array<{ fromPortId: string; toPortId: string }>
  }
  addNode(node: import('@/base/runtime/nodes').BaseNode): void
  removeNode(nodeId: string): void
  addEdge(fromPortId: string, toPortId: string): boolean
  removeEdge(fromPortId: string, toPortId: string): void
  updateNodePosition(nodeId: string, position: { x: number; y: number }): void
  updateNodeSize(nodeId: string, size: { width: number; height: number }): void
  nodePositions: Map<string, { x: number; y: number }>
  nodeSizes: Map<string, { width: number; height: number }>
}

// ============ 节点操作 ============

/**
 * 批量删除节点
 */
export function removeNodesWithHistory(
  graphStore: GraphStore,
  nodeIds: string[],
  editHistory?: EditHistory,
): void {
  if (nodeIds.length === 0) return

  const commands: SerializedEditCommand[] = []

  for (const nodeId of nodeIds) {
    const node = graphStore.currentGraph.getNode(nodeId)
    if (!node) continue

    // 收集关联的边
    const connectedEdges: Array<{ fromPortId: string; toPortId: string }> = []
    const allEdges = graphStore.currentGraph.getAllEdges()
    for (const edge of allEdges) {
      const fromNode = graphStore.currentGraph.getNodeByPortId(edge.fromPortId)
      const toNode = graphStore.currentGraph.getNodeByPortId(edge.toPortId)
      if (fromNode?.id === nodeId || toNode?.id === nodeId) {
        connectedEdges.push(edge)
      }
    }

    const position = graphStore.nodePositions.get(nodeId) ?? { x: 0, y: 0 }
    const size = graphStore.nodeSizes.get(nodeId)

    commands.push({
      type: EditCommandType.REMOVE_NODE,
      nodeData: node.serialize(),
      position,
      size,
      connectedEdges,
    })

    // 执行删除（removeNode 已自动清理 nodePositions 和 nodeSizes）
    graphStore.removeNode(nodeId)
  }

  // 记录到历史
  if (editHistory && commands.length > 0) {
    if (commands.length === 1) {
      editHistory.push(EditCommandType.REMOVE_NODE, commands[0]!, `Remove node`)
    } else {
      const batchData: SerializedEditCommand = {
        type: EditCommandType.BATCH,
        commands,
        description: `Remove ${commands.length} nodes`,
      }
      editHistory.push(EditCommandType.BATCH, batchData, `Remove ${commands.length} nodes`)
    }
  }
}

// ============ 边操作 ============

/**
 * 批量删除边
 */
export function removeEdgesWithHistory(
  graphStore: GraphStore,
  edges: Array<{ fromPortId: string; toPortId: string }>,
  editHistory?: EditHistory,
): void {
  if (edges.length === 0) return

  const commands: SerializedEditCommand[] = []

  for (const edge of edges) {
    commands.push({
      type: EditCommandType.REMOVE_EDGE,
      fromPortId: edge.fromPortId,
      toPortId: edge.toPortId,
    })

    // 执行删除
    graphStore.removeEdge(edge.fromPortId, edge.toPortId)
  }

  // 记录到历史
  if (editHistory && commands.length > 0) {
    if (commands.length === 1) {
      editHistory.push(EditCommandType.REMOVE_EDGE, commands[0]!, `Remove edge`)
    } else {
      const batchData: SerializedEditCommand = {
        type: EditCommandType.BATCH,
        commands,
        description: `Remove ${commands.length} edges`,
      }
      editHistory.push(EditCommandType.BATCH, batchData, `Remove ${commands.length} edges`)
    }
  }
}

// ============ 移动操作 ============

/**
 * 记录节点移动（仅记录，不执行 - 因为移动已经由拖拽完成）
 */
export function recordNodeMove(
  nodeId: string,
  oldPosition: { x: number; y: number },
  newPosition: { x: number; y: number },
  editHistory?: EditHistory,
): void {
  if (!editHistory) return

  const data: SerializedEditCommand = {
    type: EditCommandType.MOVE_NODE,
    nodeId,
    oldPosition,
    newPosition,
  }
  editHistory.push(EditCommandType.MOVE_NODE, data, `Move node`)
}

/**
 * 批量记录节点移动
 */
export function recordNodeMoves(
  changes: Array<{
    nodeId: string
    oldPosition: { x: number; y: number }
    newPosition: { x: number; y: number }
  }>,
  editHistory?: EditHistory,
): void {
  if (!editHistory || changes.length === 0) return

  if (changes.length === 1) {
    const change = changes[0]!
    const data: SerializedEditCommand = {
      type: EditCommandType.MOVE_NODE,
      nodeId: change.nodeId,
      oldPosition: change.oldPosition,
      newPosition: change.newPosition,
    }
    editHistory.push(EditCommandType.MOVE_NODE, data, `Move node`)
  } else {
    const commands: SerializedEditCommand[] = changes.map((change) => ({
      type: EditCommandType.MOVE_NODE as const,
      nodeId: change.nodeId,
      oldPosition: change.oldPosition,
      newPosition: change.newPosition,
    }))
    const batchData: SerializedEditCommand = {
      type: EditCommandType.BATCH,
      commands,
      description: `Move ${changes.length} nodes`,
    }
    editHistory.push(EditCommandType.BATCH, batchData, `Move ${changes.length} nodes`)
  }
}
