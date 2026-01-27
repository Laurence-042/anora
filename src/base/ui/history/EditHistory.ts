/**
 * EditHistory - 编辑历史管理器（基于 Timeline + EventHandlerRegistry）
 *
 * 基于 Timeline 的游标机制实现撤销/重做
 * - undo = 游标后退 + EventHandlerRegistry.undo()
 * - redo = 游标前进 + EventHandlerRegistry.replay()
 *
 * 设计原则：
 * - EditHistory 是 Timeline 的薄封装
 * - 所有状态由 Timeline 管理
 * - 使用 EventHandlerRegistry 执行 undo/redo
 */

import {
  Timeline,
  TimelineEventCategory,
  type EditTimelineEvent,
  type TimelineRecording,
  type SerializedEditCommand,
  EditCommandType,
} from '@/base/runtime/timeline'
import { EventHandlerRegistry, type EventReplayContext } from '@/base/ui/replay'
import type { AnoraGraph } from '@/base/runtime/graph'

// ============ 类型定义 ============

/**
 * EditHistory 配置选项
 */
export interface EditHistoryOptions {
  /** 历史记录上限（默认 50） */
  maxSize?: number
  /** 使用外部 Timeline（用于与 DemoRecorder 共享） */
  timeline?: Timeline
}

/**
 * 编辑历史事件类型
 */
export enum EditHistoryEventType {
  PUSH = 'push',
  UNDO = 'undo',
  REDO = 'redo',
  CLEAR = 'clear',
}

/**
 * 编辑历史事件
 */
export interface EditHistoryEvent {
  type: EditHistoryEventType
  description?: string
}

/**
 * 编辑历史事件监听器
 */
export type EditHistoryEventListener = (event: EditHistoryEvent) => void

// ============ EditHistory 类 ============

/**
 * 编辑历史管理器
 */
export class EditHistory {
  /** Timeline 实例 */
  private timeline: Timeline

  /** 回放上下文（包含 graph 和 graphStore） */
  private context: EventReplayContext | null = null

  /** 事件监听器 */
  private listeners: EditHistoryEventListener[] = []

  /** 是否正在执行撤销/重做（防止嵌套记录） */
  private isExecuting: boolean = false

  constructor(options: EditHistoryOptions = {}) {
    this.timeline = options.timeline ?? new Timeline(options.maxSize ?? 50)
  }

  // ============ 初始化 ============

  /**
   * 绑定上下文（必须在使用前调用）
   */
  bindContext(graph: AnoraGraph, graphStore: EventReplayContext['graphStore']): void {
    this.context = {
      graph,
      graphStore,
    }
  }

  /**
   * 获取 Timeline 实例
   */
  getTimeline(): Timeline {
    return this.timeline
  }

  /**
   * 导出编辑会话
   */
  exportSession(): TimelineRecording | null {
    return this.timeline.export()
  }

  // ============ 事件监听 ============

  on(listener: EditHistoryEventListener): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  private emit(event: EditHistoryEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  // ============ 命令操作 ============

  /**
   * 推入一个编辑事件（数据已执行，仅记录）
   */
  push(
    commandType: EditCommandType,
    commandData: SerializedEditCommand,
    description: string,
  ): void {
    if (this.isExecuting) return

    this.timeline.addEvent({
      category: TimelineEventCategory.EDIT,
      commandType,
      commandData,
      description,
    } as Omit<EditTimelineEvent, 'timestamp' | 'id'>)

    this.emit({ type: EditHistoryEventType.PUSH, description })
  }

  /**
   * 撤销
   */
  async undo(): Promise<boolean> {
    if (!this.timeline.canMoveBackward || !this.context) return false

    this.isExecuting = true
    try {
      // 获取当前事件
      const event = this.timeline.getCurrentEvent() as EditTimelineEvent | undefined
      if (!event || event.category !== TimelineEventCategory.EDIT) {
        this.timeline.moveBackward()
        return false
      }

      // 使用 EventHandlerRegistry 执行撤销
      const success = await EventHandlerRegistry.undo(event, this.context)
      if (!success) {
        console.error('[EditHistory] Failed to undo')
      }

      // 游标后退
      this.timeline.moveBackward()

      this.emit({ type: EditHistoryEventType.UNDO, description: event.description })
      return true
    } finally {
      this.isExecuting = false
    }
  }

  /**
   * 重做
   */
  async redo(): Promise<boolean> {
    if (!this.timeline.canMoveForward || !this.context) return false

    this.isExecuting = true
    try {
      // 游标前进
      const event = this.timeline.moveForward() as EditTimelineEvent | undefined
      if (!event || event.category !== TimelineEventCategory.EDIT) {
        return false
      }

      // 使用 EventHandlerRegistry 执行重做
      const success = await EventHandlerRegistry.replay(event, this.context)
      if (!success) {
        console.error('[EditHistory] Failed to redo')
      }

      this.emit({ type: EditHistoryEventType.REDO, description: event.description })
      return true
    } finally {
      this.isExecuting = false
    }
  }

  // ============ 状态查询 ============

  canUndo(): boolean {
    return this.timeline.canMoveBackward
  }

  canRedo(): boolean {
    return this.timeline.canMoveForward
  }

  get undoCount(): number {
    return this.timeline.cursor + 1
  }

  get redoCount(): number {
    return this.timeline.eventCount - this.timeline.cursor - 1
  }

  clear(): void {
    this.timeline.clear()
    this.emit({ type: EditHistoryEventType.CLEAR })
  }

  getUndoDescription(): string | undefined {
    const event = this.timeline.getCurrentEvent() as EditTimelineEvent | undefined
    return event?.description
  }

  getRedoDescription(): string | undefined {
    const nextIndex = this.timeline.cursor + 1
    const event = this.timeline.getEvent(nextIndex) as EditTimelineEvent | undefined
    return event?.description
  }
}
