/**
 * Edit History Module
 */

// 从 EditHistory 导出类型和类
export {
  EditHistory,
  EditHistoryEventType,
  type EditHistoryEvent,
  type EditHistoryEventListener,
  type EditHistoryOptions,
} from './EditHistory'

// 从 Timeline 导出核心类型
export { EditCommandType, type SerializedEditCommand } from '@/base/runtime/timeline'

// 从 EditOperations 导出便捷操作函数
export {
  removeNodesWithHistory,
  removeEdgesWithHistory,
  recordNodeMove,
  recordNodeMoves,
} from './EditOperations'
