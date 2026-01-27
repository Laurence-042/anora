/**
 * Timeline - 统一的时间线管理器
 *
 * 时间线是录制、编辑历史和回放的共同底层结构，提供：
 * - 事件存储和索引
 * - 游标机制（支持前进/后退，用于 undo/redo 和回放）
 * - 时间戳管理
 * - 事件监听机制
 * - 序列化/反序列化
 *
 * 设计原则：
 * - Timeline 是唯一的事件存储
 * - 游标(cursor)指向当前位置，支持双向遍历
 * - 上层系统（EditHistory、ReplayController）只操作游标
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  TimelineEvent,
  TimelineRecording,
  TimelineMetadata,
  TimelineSystemEvent,
  TimelineSystemEventListener,
  TimelineEventCategoryType,
} from './types'
import { TimelineSystemEventType } from './types'
import type { SerializedGraph } from '../types'

/**
 * 时间线管理器
 *
 * 内部使用环形缓冲区实现，支持有限和无限模式：
 * - 有限模式（maxEvents > 0）：固定容量，超出时覆盖最旧事件
 * - 无限模式（maxEvents <= 0）：动态扩展，永不覆盖
 *
 * 三指针设计：
 * - head: 有效数据起点（物理索引）
 * - tail: 下一个写入位置（物理索引）
 * - cursor: 当前回放/编辑位置（逻辑偏移，-1 表示起点之前）
 */
export class Timeline {
  /** 环形缓冲区 */
  private buffer: (TimelineEvent | null)[] = []

  /** 有效数据起点（物理索引） */
  private head: number = 0

  /** 下一个写入位置（物理索引） */
  private tail: number = 0

  /** 有效事件数量 */
  private _size: number = 0

  /** 游标位置（逻辑偏移，-1 表示在起点之前，_size-1 表示末尾） */
  private _cursor: number = -1

  /** 初始图状态 */
  private initialGraph: SerializedGraph | null = null

  /** 元数据 */
  private metadata: TimelineMetadata = {}

  /** 最大事件数量（0 表示无限制，构造后不可变） */
  private readonly maxEvents: number

  /** 事件监听器 */
  private listeners: TimelineSystemEventListener[] = []

  /**
   * @param maxEvents 最大事件数量（0 或负数表示无限制，正数表示有限容量）
   */
  constructor(maxEvents: number = 0) {
    this.maxEvents = maxEvents
  }

  // ============ 内部工具 ============

  /** 是否为有限模式 */
  private get isFiniteMode(): boolean {
    return this.maxEvents > 0
  }

  /** 当前容量 */
  private get capacity(): number {
    return this.buffer.length
  }

  /** 逻辑索引 → 物理索引 */
  private toPhysical(logicalIndex: number): number {
    if (this._size === 0 || logicalIndex < 0 || logicalIndex >= this._size) return -1
    return (this.head + logicalIndex) % this.capacity
  }

  // ============ 状态查询 ============

  /** 事件数量 */
  get eventCount(): number {
    return this._size
  }

  /** 当前游标位置（逻辑偏移） */
  get cursor(): number {
    return this._cursor
  }

  /** 是否可以前进 */
  get canMoveForward(): boolean {
    return this._cursor < this._size - 1
  }

  /** 是否可以后退 */
  get canMoveBackward(): boolean {
    return this._cursor >= 0
  }

  /** 获取当前游标指向的事件 */
  getCurrentEvent(): TimelineEvent | undefined {
    return this.buffer[this.toPhysical(this._cursor)] ?? undefined
  }

  /** 获取所有事件（只读，O(n) 展开环形缓冲区，索引与逻辑索引一致） */
  getEvents(): readonly TimelineEvent[] {
    const result: TimelineEvent[] = []
    for (let i = 0; i < this._size; i++) {
      // 信任数据完整性：有效范围内不应有 null
      result.push(this.buffer[this.toPhysical(i)]!)
    }
    return result
  }

  /** 按分类获取事件 */
  getEventsByCategory(category: TimelineEventCategoryType): TimelineEvent[] {
    return this.getEvents().filter((e) => e.category === category)
  }

  /** 获取指定逻辑索引的事件 */
  getEvent(index: number): TimelineEvent | undefined {
    return this.buffer[this.toPhysical(index)] ?? undefined
  }

  /** 获取指定 ID 的事件 */
  getEventById(id: string): TimelineEvent | undefined {
    for (let i = 0; i < this._size; i++) {
      const event = this.buffer[this.toPhysical(i)]
      if (event?.id === id) return event
    }
    return undefined
  }

  /** 获取时间范围内的事件 */
  getEventsInRange(startTime: number, endTime: number): TimelineEvent[] {
    return this.getEvents().filter((e) => e.timestamp >= startTime && e.timestamp <= endTime)
  }

  /** 获取第一个事件的时间戳（作为基准时间） */
  getBaseTime(): number {
    if (this._size === 0) return 0
    return this.buffer[this.head]?.timestamp ?? 0
  }

  /** 获取当前录制时长（毫秒，相对时间） */
  getDuration(): number {
    if (this._size === 0) return 0
    const baseTime = this.getBaseTime()
    const lastIndex = this.toPhysical(this._size - 1)
    return (this.buffer[lastIndex]?.timestamp ?? 0) - baseTime
  }

  /** 获取游标位置的相对时间 */
  getCurrentTime(): number {
    const event = this.getCurrentEvent()
    if (!event) return 0
    return event.timestamp - this.getBaseTime()
  }

  // ============ 游标操作 ============

  /**
   * 移动游标到指定逻辑位置
   * @returns 游标位置的事件（如果有）
   */
  setCursor(position: number): TimelineEvent | undefined {
    const oldCursor = this._cursor
    this._cursor = Math.max(-1, Math.min(position, this._size - 1))

    if (oldCursor !== this._cursor) {
      const event = this.getCurrentEvent()
      this.emit({
        type: TimelineSystemEventType.PLAYBACK_POSITION,
        position: this._cursor,
        event,
      })
      return event
    }
    return this.getCurrentEvent()
  }

  /**
   * 游标前进一步
   * @returns 前进后的事件（如果有）
   */
  moveForward(): TimelineEvent | undefined {
    if (!this.canMoveForward) return undefined
    return this.setCursor(this._cursor + 1)
  }

  /**
   * 游标后退一步
   * @returns 后退前的事件（用于 undo）
   */
  moveBackward(): TimelineEvent | undefined {
    if (!this.canMoveBackward) return undefined
    const event = this.getCurrentEvent()
    this.setCursor(this._cursor - 1)
    return event
  }

  /**
   * 重置游标到起点
   */
  resetCursor(): void {
    this.setCursor(-1)
  }

  /**
   * 移动游标到末尾
   */
  moveCursorToEnd(): void {
    this.setCursor(this._size - 1)
  }

  /**
   * 跳转到指定时间（基于 getEvents 线性展开后二分查找）
   * @returns 跳转到的事件索引
   */
  seekToTime(timeMs: number): number {
    if (this._size === 0) return -1

    const events = this.getEvents()
    let left = 0
    let right = events.length - 1
    let targetIndex = -1

    while (left <= right) {
      const mid = (left + right) >>> 1
      const event = events[mid]
      if (!event) break

      if (event.timestamp <= timeMs) {
        targetIndex = mid
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    this.setCursor(targetIndex)
    return targetIndex
  }

  // ============ 事件监听 ============

  /** 添加事件监听器 */
  on(listener: TimelineSystemEventListener): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /** 触发事件 */
  private emit(event: TimelineSystemEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  // ============ 事件操作 ============

  /**
   * 添加事件（O(1) 均摊）
   * timestamp 使用绝对时间 Date.now()，导出时会转换为相对时间
   * @param event 事件（不含 timestamp 和 id，由 Timeline 自动添加）
   * @param truncate 是否截断游标之后的事件（默认 true，用于编辑历史；false 用于纯录制）
   */
  addEvent(
    event: Omit<TimelineEvent, 'timestamp' | 'id'>,
    truncate: boolean = true,
  ): TimelineEvent {
    const timestamp = Date.now()

    const fullEvent: TimelineEvent = {
      ...event,
      timestamp,
      id: uuidv4(),
    } as TimelineEvent

    // 如果开启截断且游标不在末尾，逻辑上丢弃游标之后的事件
    if (truncate && this._cursor < this._size - 1) {
      this._size = this._cursor + 1
      this.tail = (this.head + this._size) % this.capacity
    }

    // 无限模式 或 有限模式未满：直接 push
    if (!this.isFiniteMode || this._size < this.maxEvents) {
      this.buffer.push(fullEvent)
      this._size++
      this.tail = this._size
    } else {
      // 有限模式已满：环形覆盖最旧事件
      this.head = (this.head + 1) % this.capacity
      this._cursor = Math.max(-1, this._cursor - 1)
      // 写入 tail 位置（不增加 _size）
      this.buffer[this.tail] = fullEvent
      this.tail = (this.tail + 1) % this.capacity
    }

    // 游标移到新事件
    this._cursor = this._size - 1

    this.emit({ type: TimelineSystemEventType.EVENT_ADDED, event: fullEvent })

    return fullEvent
  }

  // ============ 序列化 ============

  /**
   * 导出为录制格式
   * 事件的 timestamp 会转换为相对于第一个事件的偏移量
   */
  export(): TimelineRecording | null {
    if (!this.initialGraph) {
      console.warn('[Timeline] No initial graph set')
      return null
    }

    const baseTime = this.getBaseTime()
    // 导出时将绝对时间转换为相对时间
    const events = this.getEvents()
    const relativeEvents = events.map((e) => ({
      ...e,
      timestamp: e.timestamp - baseTime,
    }))

    return {
      version: '2.0.0',
      initialGraph: this.initialGraph,
      events: relativeEvents,
      metadata: {
        ...this.metadata,
        createdAt: this.metadata.createdAt ?? new Date().toISOString(),
      },
    }
  }

  /**
   * 从录制格式导入
   * 支持旧格式（无 category/id）自动转换
   */
  import(recording: TimelineRecording): void {
    this.clear()
    this.initialGraph = recording.initialGraph

    // 转换旧格式事件为新格式并填充缓冲区
    const events = recording.events.map((evt) => {
      if (!('category' in evt)) {
        const legacyEvt = evt as { timestamp: number; event: unknown }
        return {
          category: 'execution' as const,
          timestamp: legacyEvt.timestamp,
          id: uuidv4(),
          event: legacyEvt.event,
        } as TimelineEvent
      }
      return evt
    })

    // 直接分配缓冲区（导入的数据不需要环形处理）
    this.buffer = events
    this.head = 0
    this.tail = events.length
    this._size = events.length
    this.metadata = recording.metadata ?? {}
    // 导入后游标在起点（准备回放）
    this._cursor = -1
  }

  /**
   * 获取初始图状态
   */
  getInitialGraph(): SerializedGraph | null {
    return this.initialGraph
  }

  /**
   * 设置初始图状态
   */
  setInitialGraph(graph: SerializedGraph): void {
    this.initialGraph = graph
  }

  /**
   * 设置元数据
   */
  setMetadata(metadata: TimelineMetadata): void {
    this.metadata = { ...this.metadata, ...metadata }
  }

  /**
   * 获取元数据
   */
  getMetadata(): TimelineMetadata {
    return { ...this.metadata }
  }

  // ============ 清理 ============

  /**
   * 清空时间线
   */
  clear(): void {
    this.buffer = []
    this.head = 0
    this.tail = 0
    this._size = 0
    this._cursor = -1
    this.initialGraph = null
    this.metadata = {}

    this.emit({ type: TimelineSystemEventType.CLEAR })
  }
}
