/**
 * Core Mod - Context Menu Registration
 *
 * 注册核心右键菜单项
 */

import {
  ContextMenuRegistry,
  ContextMenuTarget,
  type ContextMenuItem,
  type ContextMenuGroup,
  type ContextMenuContext,
} from '@/base/ui/contextmenu'
import { removeNodesWithHistory, removeEdgesWithHistory } from '@/base/ui/history'
import { EditCommandType } from '@/base/runtime/timeline'

/**
 * 核心菜单项 ID 常量
 */
export const CoreMenuItemIds = {
  // 节点菜单
  NODE_DELETE: 'core.node.delete',
  NODE_COPY: 'core.node.copy',

  // 边菜单
  EDGE_DELETE: 'core.edge.delete',
  EDGE_TOGGLE: 'core.edge.toggle',

  // 空白处菜单
  PANE_COPY: 'core.pane.copy',
  PANE_PASTE: 'core.pane.paste',
  PANE_UNDO: 'core.pane.undo',
  PANE_REDO: 'core.pane.redo',
} as const

/**
 * 删除选中节点
 */
function deleteSelectedNodes(context: ContextMenuContext): void {
  const { graphStore, editHistory, selectedNodeIds } = context
  const nodeIds = [...selectedNodeIds]
  removeNodesWithHistory(graphStore, nodeIds, editHistory)
}

/**
 * 删除选中边
 */
function deleteSelectedEdges(context: ContextMenuContext): void {
  const { graphStore, editHistory, selectedEdges } = context

  const edges: Array<{ fromPortId: string; toPortId: string }> = []
  for (const edgeId of selectedEdges) {
    const [fromPortId, toPortId] = edgeId.split('->')
    if (fromPortId && toPortId) {
      edges.push({ fromPortId, toPortId })
    }
  }

  removeEdgesWithHistory(graphStore, edges, editHistory)
}

/**
 * 核心菜单项定义
 */
const coreNodeMenuItems: ContextMenuItem[] = [
  {
    id: CoreMenuItemIds.NODE_COPY,
    label: 'contextMenu.copy',
    icon: '📋',
    shortcut: 'Ctrl+C',
    priority: 10,
    onClick(context) {
      void context.clipboard?.copy(context.graphStore)
    },
  },
  {
    id: CoreMenuItemIds.NODE_DELETE,
    label: 'contextMenu.delete',
    icon: '🗑️',
    shortcut: 'Delete',
    priority: 100,
    divided: true,
    onClick: deleteSelectedNodes,
  },
]

const coreEdgeMenuItems: ContextMenuItem[] = [
  {
    id: CoreMenuItemIds.EDGE_TOGGLE,
    label: 'contextMenu.toggleEdge',
    icon: '🔌',
    shortcut: 'Double Click',
    priority: 50,
    onClick(context) {
      const { graphStore, editHistory, selectedEdges, edgeId } = context

      // 确定要操作的边：优先使用选中的边，如果没有选中则使用右键点击的边
      const edgesToToggle: string[] = []
      if (selectedEdges.size > 0) {
        edgesToToggle.push(...selectedEdges)
      } else if (edgeId) {
        edgesToToggle.push(edgeId)
      }

      if (edgesToToggle.length === 0) return

      // 收集所有边的状态切换操作
      const toggleCommands: Array<{
        fromPortId: string
        toPortId: string
        oldDisabled: boolean
        newDisabled: boolean
      }> = []

      for (const eid of edgesToToggle) {
        const [fromPortId, toPortId] = eid.split('->')
        if (fromPortId && toPortId) {
          const oldDisabled = graphStore.isEdgeDisabled(fromPortId, toPortId)
          const newDisabled = !oldDisabled
          toggleCommands.push({ fromPortId, toPortId, oldDisabled, newDisabled })
          // 执行切换
          graphStore.setEdgeDisabled(fromPortId, toPortId, newDisabled)
        }
      }

      // 记录到编辑历史（批量操作）
      if (editHistory && toggleCommands.length > 0) {
        if (toggleCommands.length === 1) {
          const cmd = toggleCommands[0]!
          editHistory.push(
            EditCommandType.TOGGLE_EDGE,
            {
              type: EditCommandType.TOGGLE_EDGE,
              fromPortId: cmd.fromPortId,
              toPortId: cmd.toPortId,
              oldDisabled: cmd.oldDisabled,
              newDisabled: cmd.newDisabled,
            },
            cmd.newDisabled ? 'Disable edge' : 'Enable edge',
          )
        } else {
          // 批量操作
          editHistory.push(
            EditCommandType.BATCH,
            {
              type: EditCommandType.BATCH,
              description: 'Toggle edges',
              commands: toggleCommands.map((cmd) => ({
                type: EditCommandType.TOGGLE_EDGE,
                fromPortId: cmd.fromPortId,
                toPortId: cmd.toPortId,
                oldDisabled: cmd.oldDisabled,
                newDisabled: cmd.newDisabled,
              })),
            },
            `Toggle ${toggleCommands.length} edges`,
          )
        }
      }
    },
  },
  {
    id: CoreMenuItemIds.EDGE_DELETE,
    label: 'contextMenu.delete',
    icon: '🗑️',
    shortcut: 'Delete',
    priority: 100,
    onClick: deleteSelectedEdges,
  },
]

const corePaneMenuItems: ContextMenuItem[] = [
  {
    id: CoreMenuItemIds.PANE_COPY,
    label: 'contextMenu.copy',
    icon: '📋',
    shortcut: 'Ctrl+C',
    priority: 5,
    // 只在有选中节点时显示
    visible: (context) => context.selectedNodeIds.size > 0,
    onClick(context) {
      void context.clipboard?.copy(context.graphStore)
    },
  },
  {
    id: CoreMenuItemIds.PANE_PASTE,
    label: 'contextMenu.paste',
    icon: '📋',
    shortcut: 'Ctrl+V',
    priority: 10,
    // 由于系统剪贴板检查是异步的，这里不做禁用检查
    // 实际粘贴操作会在没有有效数据时静默失败
    disabled: false,
    onClick(context) {
      if (context.clipboard && context.canvasPosition) {
        // clipboard.paste 是异步的，但 onClick 不支持 async
        // 直接调用，内部会处理无数据的情况
        void context.clipboard.paste(
          context.graphStore,
          context.canvasPosition,
          context.editHistory,
        )
      }
    },
  },
  {
    id: CoreMenuItemIds.PANE_UNDO,
    label: 'contextMenu.undo',
    icon: '↩️',
    shortcut: 'Ctrl+Z',
    priority: 50,
    divided: true,
    disabled: (context) => !context.editHistory?.canUndo(),
    onClick(context) {
      context.editHistory?.undo()
    },
  },
  {
    id: CoreMenuItemIds.PANE_REDO,
    label: 'contextMenu.redo',
    icon: '↪️',
    shortcut: 'Ctrl+Y',
    priority: 51,
    disabled: (context) => !context.editHistory?.canRedo(),
    onClick(context) {
      context.editHistory?.redo()
    },
  },
]

/**
 * 核心右键菜单组
 */
export const coreContextMenuGroup: ContextMenuGroup = {
  groupId: 'core',
  items: [
    // 节点菜单
    ...coreNodeMenuItems.map((item) => ({
      target: ContextMenuTarget.NODE,
      item,
    })),
    // 边菜单
    ...coreEdgeMenuItems.map((item) => ({
      target: ContextMenuTarget.EDGE,
      item,
    })),
    // 空白处菜单
    ...corePaneMenuItems.map((item) => ({
      target: ContextMenuTarget.PANE,
      item,
    })),
  ],
}

/**
 * 注册核心右键菜单
 */
export function registerCoreContextMenu(): void {
  ContextMenuRegistry.registerGroup(coreContextMenuGroup)
}
