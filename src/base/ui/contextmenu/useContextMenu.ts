/**
 * useContextMenu - 右键菜单 composable
 *
 * 提供在 Vue 组件中使用右键菜单的功能
 */

import { ref } from 'vue'
import ContextMenu from '@imengyu/vue3-context-menu'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'
import { useI18n } from 'vue-i18n'

import { ContextMenuRegistry } from './ContextMenuRegistry'
import { ContextMenuTarget, type ContextMenuContext, type ContextMenuItem } from './types'
import type { useGraphStore } from '@/stores/graph'
import type { EditHistory } from '@/base/ui/history'
import type { Clipboard } from '@/base/ui/clipboard'

/**
 * useContextMenu 选项
 */
export interface UseContextMenuOptions {
  /** Graph Store */
  graphStore: ReturnType<typeof useGraphStore>

  /** EditHistory 实例（可选） */
  editHistory?: EditHistory

  /** Clipboard 实例（可选） */
  clipboard?: Clipboard

  /** 坐标转换函数：屏幕坐标 -> 画布坐标 */
  screenToCanvas?: (x: number, y: number) => { x: number; y: number }
}

/**
 * 右键菜单 composable
 */
export function useContextMenu(options: UseContextMenuOptions) {
  const { graphStore, editHistory, clipboard, screenToCanvas } = options
  const { t, te } = useI18n()

  /** 当前菜单上下文 */
  const currentContext = ref<ContextMenuContext | null>(null)

  /**
   * 将 ContextMenuItem 转换为 vue3-context-menu 格式
   */
  function convertToMenuItems(
    items: ContextMenuItem[],
    context: ContextMenuContext,
  ): Array<Record<string, unknown>> {
    return items.map((item) => {
      const menuItem: Record<string, unknown> = {
        label: te(item.label) ? t(item.label) : item.label,
        icon: item.icon,
        disabled: item.disabled === true,
        divided: item.divided,
        onClick: item.onClick ? () => item.onClick!(context) : undefined,
      }

      // 快捷键提示
      if (item.shortcut) {
        menuItem.shortcut = item.shortcut
      }

      // 子菜单
      if (item.children && item.children.length > 0) {
        menuItem.children = convertToMenuItems(item.children, context)
      }

      return menuItem
    })
  }

  /**
   * 创建菜单上下文
   */
  function createContext(
    target: ContextMenuTarget,
    coords: { clientX: number; clientY: number },
    nodeId?: string,
    edgeId?: string,
  ): ContextMenuContext {
    const mousePosition = { x: coords.clientX, y: coords.clientY }
    const canvasPosition = screenToCanvas
      ? screenToCanvas(coords.clientX, coords.clientY)
      : mousePosition

    return {
      target,
      mousePosition,
      canvasPosition,
      nodeId,
      edgeId,
      selectedNodeIds: graphStore.selectedNodeIds,
      selectedEdges: graphStore.selectedEdges,
      graphStore,
      editHistory,
      clipboard,
    }
  }

  /**
   * 显示右键菜单
   */
  function showMenu(
    target: ContextMenuTarget,
    event: MouseEvent | TouchEvent,
    nodeId?: string,
    edgeId?: string,
  ): void {
    event.preventDefault()
    event.stopPropagation()

    // 获取坐标（兼容 Touch 事件）
    const clientX = 'clientX' in event ? event.clientX : (event.touches[0]?.clientX ?? 0)
    const clientY = 'clientY' in event ? event.clientY : (event.touches[0]?.clientY ?? 0)

    const context = createContext(target, { clientX, clientY }, nodeId, edgeId)
    currentContext.value = context

    const items = ContextMenuRegistry.getItems(target, context)

    if (items.length === 0) {
      return // 没有菜单项则不显示
    }

    const menuItems = convertToMenuItems(items, context)

    ContextMenu.showContextMenu({
      x: clientX,
      y: clientY,
      items: menuItems,
      theme: 'mac dark',
      zIndex: 1000,
    })
  }

  /**
   * 空白处右键菜单
   */
  function onPaneContextMenu(event: MouseEvent | TouchEvent): void {
    showMenu(ContextMenuTarget.PANE, event)
  }

  /**
   * 节点右键菜单
   */
  function onNodeContextMenu(event: MouseEvent | TouchEvent, nodeId: string): void {
    // 如果点击的节点不在选中列表中，则单选该节点
    if (!graphStore.isNodeSelected(nodeId)) {
      graphStore.selectNodesByIds([nodeId])
    }
    showMenu(ContextMenuTarget.NODE, event, nodeId)
  }

  /**
   * 边右键菜单
   */
  function onEdgeContextMenu(event: MouseEvent | TouchEvent, edgeId: string): void {
    // 边的选中由 Vue Flow 自动处理，这里只显示菜单
    // 如果需要单选该边，可通过 Vue Flow 的 addSelectedEdges 实现
    showMenu(ContextMenuTarget.EDGE, event, undefined, edgeId)
  }

  return {
    currentContext,
    showMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
  }
}
