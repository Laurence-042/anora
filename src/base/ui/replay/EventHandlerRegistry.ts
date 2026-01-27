/**
 * EventHandlerRegistry - 事件处理器注册表
 *
 * 允许 mod 注册自定义事件类型的处理器
 * 用于统一的回放和撤销机制
 *
 * 使用示例：
 * ```typescript
 * // 在 mod 的 init() 中注册
 * EventHandlerRegistry.register({
 *   category: 'mymod.custom',
 *   replay: (event, ctx) => { ... },
 *   undo: (event, ctx) => { ... },
 *   description: 'My custom event handler'
 * })
 * ```
 */

import type { TimelineEvent, TimelineEventCategoryType } from '@/base/runtime/timeline'
import type {
  EventHandlerDefinition,
  EventReplayContext,
  EventReplayHandler,
  EventUndoHandler,
} from './types'

/**
 * 事件处理器注册表
 */
export class EventHandlerRegistry {
  /** 注册的处理器 */
  private static handlers: Map<TimelineEventCategoryType, EventHandlerDefinition> = new Map()

  /**
   * 注册事件处理器
   */
  static register<T extends TimelineEvent>(handler: EventHandlerDefinition<T>): void {
    if (this.handlers.has(handler.category)) {
      console.warn(
        `[EventHandlerRegistry] Handler for category '${handler.category}' already exists, overwriting`,
      )
    }
    this.handlers.set(handler.category, handler as EventHandlerDefinition)
  }

  /**
   * 注销事件处理器
   */
  static unregister(category: TimelineEventCategoryType): boolean {
    return this.handlers.delete(category)
  }

  /**
   * 获取事件处理器
   */
  static getHandler(category: TimelineEventCategoryType): EventHandlerDefinition | undefined {
    return this.handlers.get(category)
  }

  /**
   * 检查是否有处理器
   */
  static hasHandler(category: TimelineEventCategoryType): boolean {
    return this.handlers.has(category)
  }

  /**
   * 获取所有已注册的分类
   */
  static getRegisteredCategories(): TimelineEventCategoryType[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * 执行回放
   */
  static async replay(event: TimelineEvent, context: EventReplayContext): Promise<boolean> {
    const handler = this.handlers.get(event.category)
    if (!handler) {
      console.warn(`[EventHandlerRegistry] No handler for category '${event.category}'`)
      return false
    }

    try {
      await handler.replay(event, context)
      return true
    } catch (error) {
      console.error(`[EventHandlerRegistry] Replay error for '${event.category}':`, error)
      return false
    }
  }

  /**
   * 执行撤销
   */
  static async undo(event: TimelineEvent, context: EventReplayContext): Promise<boolean> {
    const handler = this.handlers.get(event.category)
    if (!handler) {
      console.warn(`[EventHandlerRegistry] No handler for category '${event.category}'`)
      return false
    }

    if (!handler.undo) {
      console.warn(`[EventHandlerRegistry] No undo handler for category '${event.category}'`)
      return false
    }

    try {
      await handler.undo(event, context)
      return true
    } catch (error) {
      console.error(`[EventHandlerRegistry] Undo error for '${event.category}':`, error)
      return false
    }
  }

  /**
   * 批量回放事件
   */
  static async replayEvents(
    events: TimelineEvent[],
    context: EventReplayContext,
  ): Promise<{ success: number; failed: number }> {
    let success = 0
    let failed = 0

    for (const event of events) {
      const result = await this.replay(event, context)
      if (result) {
        success++
      } else {
        failed++
      }
    }

    return { success, failed }
  }

  /**
   * 批量撤销事件（逆序）
   */
  static async undoEvents(
    events: TimelineEvent[],
    context: EventReplayContext,
  ): Promise<{ success: number; failed: number }> {
    let success = 0
    let failed = 0

    // 逆序撤销
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]
      if (!event) continue

      const result = await this.undo(event, context)
      if (result) {
        success++
      } else {
        failed++
      }
    }

    return { success, failed }
  }

  /**
   * 清空所有处理器
   */
  static clear(): void {
    this.handlers.clear()
  }
}

// ============ 快捷注册函数 ============

/**
 * 注册回放处理器
 */
export function registerReplayHandler<T extends TimelineEvent>(
  category: TimelineEventCategoryType,
  replay: EventReplayHandler<T>,
  undo?: EventUndoHandler<T>,
  description?: string,
): void {
  EventHandlerRegistry.register({
    category,
    replay: replay as EventReplayHandler,
    undo: undo as EventUndoHandler | undefined,
    description,
  })
}
