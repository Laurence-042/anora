/**
 * ContextMenuRegistry - 可扩展的右键菜单注册表
 *
 * 设计思路：
 * - 类似 NodeRegistry，支持 Mod 扩展
 * - 菜单项按 target 分组，支持优先级排序
 * - 支持动态 visible/disabled 计算
 */

import type {
  ContextMenuItem,
  ContextMenuItemRegistration,
  ContextMenuGroup,
  ContextMenuContext,
  ContextMenuTarget,
} from './types'

/**
 * 内部菜单项存储结构
 */
interface StoredMenuItem {
  target: ContextMenuTarget
  item: ContextMenuItem
  groupId?: string
}

class ContextMenuRegistryClass {
  /** 按 target 分组的菜单项 */
  private items: Map<ContextMenuTarget, StoredMenuItem[]> = new Map()

  /** 已注册的组 */
  private groups: Set<string> = new Set()

  /**
   * 注册单个菜单项
   */
  register(registration: ContextMenuItemRegistration, groupId?: string): void {
    const targets = Array.isArray(registration.target) ? registration.target : [registration.target]

    for (const target of targets) {
      if (!this.items.has(target)) {
        this.items.set(target, [])
      }

      // 检查是否已存在相同 ID 的项
      const existing = this.items.get(target)!
      const existingIndex = existing.findIndex((s) => s.item.id === registration.item.id)

      const storedItem: StoredMenuItem = {
        target,
        item: registration.item,
        groupId,
      }

      if (existingIndex >= 0) {
        // 覆盖已存在的项
        existing[existingIndex] = storedItem
        console.warn(
          `[ContextMenuRegistry] Item "${registration.item.id}" already exists for target "${target}", overwriting...`,
        )
      } else {
        existing.push(storedItem)
      }
    }
  }

  /**
   * 批量注册一组菜单项
   */
  registerGroup(group: ContextMenuGroup): void {
    if (this.groups.has(group.groupId)) {
      console.warn(
        `[ContextMenuRegistry] Group "${group.groupId}" already registered, items will be merged...`,
      )
    }
    this.groups.add(group.groupId)

    for (const registration of group.items) {
      this.register(registration, group.groupId)
    }
  }

  /**
   * 移除指定组的所有菜单项
   */
  unregisterGroup(groupId: string): void {
    if (!this.groups.has(groupId)) return

    for (const [target, items] of this.items.entries()) {
      this.items.set(
        target,
        items.filter((s) => s.groupId !== groupId),
      )
    }

    this.groups.delete(groupId)
  }

  /**
   * 移除指定 ID 的菜单项
   */
  unregister(itemId: string, target?: ContextMenuTarget): void {
    if (target) {
      const items = this.items.get(target)
      if (items) {
        this.items.set(
          target,
          items.filter((s) => s.item.id !== itemId),
        )
      }
    } else {
      // 从所有 target 中移除
      for (const [t, items] of this.items.entries()) {
        this.items.set(
          t,
          items.filter((s) => s.item.id !== itemId),
        )
      }
    }
  }

  /**
   * 获取指定目标的菜单项（已排序、已过滤）
   */
  getItems(target: ContextMenuTarget, context: ContextMenuContext): ContextMenuItem[] {
    const items = this.items.get(target) || []

    // 过滤可见项
    const visibleItems = items.filter((s) => {
      const visible = s.item.visible
      if (typeof visible === 'function') {
        return visible(context)
      }
      return visible !== false
    })

    // 按优先级排序（数字越小越靠前）
    visibleItems.sort((a, b) => (a.item.priority ?? 100) - (b.item.priority ?? 100))

    // 处理 disabled 状态
    return visibleItems.map((s) => {
      const item = { ...s.item }
      if (typeof item.disabled === 'function') {
        item.disabled = item.disabled(context)
      }
      return item
    })
  }

  /**
   * 清空所有注册项
   */
  clear(): void {
    this.items.clear()
    this.groups.clear()
  }
}

/**
 * 全局右键菜单注册表实例
 */
export const ContextMenuRegistry = new ContextMenuRegistryClass()
