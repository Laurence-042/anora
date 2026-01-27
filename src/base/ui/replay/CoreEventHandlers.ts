/**
 * CoreEventHandlers - 核心事件处理器
 *
 * 为 execution 和 edit 分类注册默认的 replay/undo 处理器
 *
 * 使用方式：在应用初始化时调用 registerCoreEventHandlers()
 */

import { EventHandlerRegistry } from './EventHandlerRegistry'
import {
  TimelineEventCategory,
  type ExecutionTimelineEvent,
  type EditTimelineEvent,
  EditCommandType,
  type SerializedEditCommand,
} from '@/base/runtime/timeline'
import { NodeRegistry } from '@/base/runtime/registry'
import type { BaseNode } from '@/base/runtime/nodes'
import type { EventReplayContext, ExecutionReplayContext, EditReplayContext } from './types'

// ============ Execution 事件处理器 ============

/**
 * 执行事件回放处理器
 * 直接将事件传递给 UI，不关心具体类型
 */
function executionReplayHandler(
  event: ExecutionTimelineEvent,
  context: ExecutionReplayContext,
): void {
  // 直接发射给 UI，类型由调用方负责
  if (context.emitExecutorEvent) {
    context.emitExecutorEvent(event.event)
  }
}

// ============ Edit 事件处理器 ============

/**
 * 从序列化数据恢复节点
 */
function restoreNode(nodeData: import('@/base/runtime/types').SerializedNode): BaseNode | null {
  const node = NodeRegistry.createNode(nodeData.typeId, nodeData.id, nodeData.label) as
    | BaseNode
    | undefined
  if (!node) {
    console.warn(`[CoreEventHandlers] Failed to create node of type: ${nodeData.typeId}`)
    return null
  }
  node.deserialize(nodeData)
  return node
}

/**
 * 执行编辑命令（正向）
 */
function executeEditCommand(data: SerializedEditCommand, context: EditReplayContext): void {
  const { graphStore } = context

  switch (data.type) {
    case EditCommandType.ADD_NODE: {
      const node = restoreNode(data.nodeData)
      if (node) {
        graphStore.addNode(node)
        graphStore.updateNodePosition(node.id, data.position)
        if (data.size) {
          graphStore.updateNodeSize(node.id, data.size)
        }
      }
      break
    }

    case EditCommandType.REMOVE_NODE: {
      graphStore.removeNode(data.nodeData.id)
      break
    }

    case EditCommandType.ADD_EDGE: {
      graphStore.addEdge(data.fromPortId, data.toPortId)
      break
    }

    case EditCommandType.REMOVE_EDGE: {
      graphStore.removeEdge(data.fromPortId, data.toPortId)
      break
    }

    case EditCommandType.MOVE_NODE: {
      graphStore.updateNodePosition(data.nodeId, data.newPosition)
      break
    }

    case EditCommandType.RESIZE_NODE: {
      graphStore.updateNodeSize(data.nodeId, data.newSize)
      break
    }

    case EditCommandType.BATCH: {
      for (const cmd of data.commands) {
        executeEditCommand(cmd, context)
      }
      break
    }
  }
}

/**
 * 撤销编辑命令（逆向）
 */
function undoEditCommand(data: SerializedEditCommand, context: EditReplayContext): void {
  const { graphStore } = context

  switch (data.type) {
    case EditCommandType.ADD_NODE: {
      // 添加的逆操作是删除
      graphStore.removeNode(data.nodeData.id)
      break
    }

    case EditCommandType.REMOVE_NODE: {
      // 删除的逆操作是添加
      const node = restoreNode(data.nodeData)
      if (node) {
        graphStore.addNode(node)
        graphStore.updateNodePosition(node.id, data.position)
        if (data.size) {
          graphStore.updateNodeSize(node.id, data.size)
        }
        // 恢复关联的边
        for (const edge of data.connectedEdges) {
          graphStore.addEdge(edge.fromPortId, edge.toPortId)
        }
      }
      break
    }

    case EditCommandType.ADD_EDGE: {
      // 添加边的逆操作是删除边
      graphStore.removeEdge(data.fromPortId, data.toPortId)
      break
    }

    case EditCommandType.REMOVE_EDGE: {
      // 删除边的逆操作是添加边
      graphStore.addEdge(data.fromPortId, data.toPortId)
      break
    }

    case EditCommandType.MOVE_NODE: {
      // 移动的逆操作是移回原位置
      graphStore.updateNodePosition(data.nodeId, data.oldPosition)
      break
    }

    case EditCommandType.RESIZE_NODE: {
      // 调整大小的逆操作是恢复原大小
      graphStore.updateNodeSize(data.nodeId, data.oldSize)
      break
    }

    case EditCommandType.BATCH: {
      // 批量的逆操作是逆序撤销
      for (let i = data.commands.length - 1; i >= 0; i--) {
        const cmd = data.commands[i]
        if (cmd) {
          undoEditCommand(cmd, context)
        }
      }
      break
    }
  }
}

/**
 * 编辑事件回放处理器
 */
function editReplayHandler(event: EditTimelineEvent, context: EventReplayContext): void {
  if (!isEditReplayContext(context)) {
    console.error('[EditReplayHandler] Missing graphStore in context')
    return
  }
  executeEditCommand(event.commandData, context)
}

/**
 * 编辑事件撤销处理器
 */
function editUndoHandler(event: EditTimelineEvent, context: EventReplayContext): void {
  if (!isEditReplayContext(context)) {
    console.error('[EditUndoHandler] Missing graphStore in context')
    return
  }
  undoEditCommand(event.commandData, context)
}

/**
 * 类型守卫：检查是否有 graphStore
 */
function isEditReplayContext(context: EventReplayContext): context is EditReplayContext {
  return context.graphStore !== undefined
}

// ============ 注册函数 ============

/**
 * 注册核心事件处理器
 * 应在应用初始化时调用
 */
export function registerCoreEventHandlers(): void {
  // 注册执行事件处理器
  EventHandlerRegistry.register({
    category: TimelineEventCategory.EXECUTION,
    replay: executionReplayHandler,
    // 执行事件没有 undo（执行过程不可逆）
    description: 'Executor event handler',
  })

  // 注册编辑事件处理器
  EventHandlerRegistry.register({
    category: TimelineEventCategory.EDIT,
    replay: editReplayHandler,
    undo: editUndoHandler,
    description: 'Edit command handler',
  })
}

// ============ 导出工具函数 ============

export { executeEditCommand, undoEditCommand }
