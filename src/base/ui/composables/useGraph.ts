/**
 * useGraph - 图操作组合式函数
 * 提供常用的图操作封装
 */
import { computed } from 'vue'
import { useGraphStore } from '@/stores/graph'
import type { BaseNode } from '@/base/runtime/nodes'
import { NodeRegistry } from '@/base/runtime/registry'

/**
 * 图操作组合式函数
 */
export function useGraph() {
  const store = useGraphStore()

  /** 当前图 */
  const graph = computed(() => store.currentGraph)

  /** 所有节点 */
  const nodes = computed(() => store.nodes)

  /** 选中的节点 */
  const selectedNodes = computed(() => {
    return nodes.value.filter((node) => store.isNodeSelected(node.id))
  })

  /**
   * 创建节点并添加到图中
   * @param typeId 节点类型 ID
   * @param position 节点位置（可选）
   */
  function createNode(typeId: string, position?: { x: number; y: number }): BaseNode | null {
    const NodeClass = NodeRegistry.get(typeId)
    if (!NodeClass) {
      console.error(`Unknown node type: ${typeId}`)
      return null
    }

    const node = new NodeClass()
    store.addNode(node)

    // TODO: 如果提供了 position，需要在 GraphEditor 中处理
    return node
  }

  /**
   * 删除节点
   */
  function deleteNode(nodeId: string): void {
    store.removeNode(nodeId)
  }

  /**
   * 删除选中的节点
   */
  function deleteSelectedNodes(): void {
    for (const nodeId of store.selectedNodeIds) {
      store.removeNode(nodeId)
    }
  }

  /**
   * 复制选中的节点（返回 JSON 字符串）
   */
  function copySelectedNodes(): string {
    const nodesToCopy = selectedNodes.value.map((node) => node.serialize())
    return JSON.stringify(nodesToCopy)
  }

  /**
   * 获取可用的节点类型列表
   */
  function getAvailableNodeTypes(): { typeId: string; name: string }[] {
    const types: { typeId: string; name: string }[] = []

    for (const [typeId] of NodeRegistry.getAll()) {
      types.push({
        typeId,
        name: typeId.split('.').pop() ?? typeId,
      })
    }

    return types
  }

  /**
   * 检查两个 Port 是否可以连接
   * @param fromPortId 出 Port ID
   * @param toPortId 入 Port ID
   */
  function canConnect(fromPortId: string, toPortId: string): boolean {
    // 需要从图中获取 Port 实例
    const allNodes = graph.value.getAllNodes()

    let fromPort = null
    let toPort = null

    for (const node of allNodes) {
      if (!fromPort) {
        fromPort = node.getPortById(fromPortId)
      }
      if (!toPort) {
        toPort = node.getPortById(toPortId)
      }
      if (fromPort && toPort) break
    }

    if (!fromPort || !toPort) return false

    return graph.value.canConnect(fromPort, toPort)
  }

  return {
    graph,
    nodes,
    selectedNodes,
    createNode,
    deleteNode,
    deleteSelectedNodes,
    copySelectedNodes,
    getAvailableNodeTypes,
    canConnect,
  }
}
