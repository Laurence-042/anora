/**
 * Replay Types - 回放相关类型定义
 *
 * 包含回放上下文、事件处理器等类型
 * 这些是 UI 层概念，依赖于 GraphStore 等 UI 组件
 */

import type { AnoraGraph } from '@/base/runtime/graph'
import type {
  TimelineEvent,
  TimelineEventCategoryType,
  TimelineRecording,
} from '@/base/runtime/timeline'
import type { useGraphStore } from '@/stores/graph'

// 重新导出基础类型（向后兼容）
export {
  type TimelineRecording,
  type TimelineMetadata,
  TimelineEventCategory,
  type ExecutionTimelineEvent,
} from '@/base/runtime/timeline'

// 类型别名（向后兼容）
export type DemoRecording = TimelineRecording

// ============ 事件回放上下文 ============

/**
 * GraphStore 接口（用于类型安全）
 */
export type GraphStore = ReturnType<typeof useGraphStore>

/**
 * 事件回放处理器基础上下文
 */
export interface EventReplayContext {
  /** 当前图 */
  graph: AnoraGraph
  /** GraphStore（可选） */
  graphStore?: GraphStore
  /** 额外上下文 */
  [key: string]: unknown
}

/**
 * 执行事件的回放上下文（扩展）
 * 注意：emitExecutorEvent 的参数类型由调用方定义（通常是 ExecutorEvent）
 */
export interface ExecutionReplayContext extends EventReplayContext {
  /** 执行器事件发射器（用于通知 UI） */
  emitExecutorEvent?: (event: unknown) => void
}

/**
 * 编辑事件的回放上下文（扩展）
 */
export interface EditReplayContext extends EventReplayContext {
  /** GraphStore（必需） */
  graphStore: GraphStore
}

// ============ 事件处理器类型 ============

/**
 * 事件回放处理器
 * 负责在回放时执行对应的操作
 */
export type EventReplayHandler<T extends TimelineEvent = TimelineEvent> = (
  event: T,
  context: EventReplayContext,
) => void | Promise<void>

/**
 * 事件逆向处理器（用于 undo）
 */
export type EventUndoHandler<T extends TimelineEvent = TimelineEvent> = (
  event: T,
  context: EventReplayContext,
) => void | Promise<void>

/**
 * 事件处理器定义
 */
export interface EventHandlerDefinition<T extends TimelineEvent = TimelineEvent> {
  /** 事件分类 */
  category: TimelineEventCategoryType
  /** 回放处理器 */
  replay: EventReplayHandler<T>
  /** 逆向处理器（可选，用于 undo） */
  undo?: EventUndoHandler<T>
  /** 描述 */
  description?: string
}
