/**
 * EditCommands - 编辑命令数据类型
 *
 * 提供编辑命令的数据结构定义
 * 实际的执行/撤销逻辑在 CoreEventHandlers.ts 中
 */

/**
 * 节点序列化数据（用于撤销恢复）
 */
export interface SerializedNodeData {
  /** 节点序列化数据 */
  nodeData: import('@/base/runtime/types').SerializedNode
  /** 节点位置 */
  position: { x: number; y: number }
  /** 节点尺寸 */
  size?: { width: number; height: number }
  /** 关联的边（用于删除节点时一并记录） */
  connectedEdges: Array<{ fromPortId: string; toPortId: string }>
}

/**
 * 边数据
 */
export interface EdgeData {
  fromPortId: string
  toPortId: string
  disabled?: boolean
}

/**
 * 节点位置变更数据
 */
export interface NodePositionChange {
  nodeId: string
  oldPosition: { x: number; y: number }
  newPosition: { x: number; y: number }
}

/**
 * 节点尺寸变更数据
 */
export interface NodeSizeChange {
  nodeId: string
  oldSize: { width: number; height: number }
  newSize: { width: number; height: number }
}
