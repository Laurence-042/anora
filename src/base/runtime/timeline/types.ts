/**
 * Timeline Types - 统一的时间线系统类型定义
 *
 * 时间线是录制(Demo)和编辑历史(EditHistory)的共同底层结构
 * - 录制：记录执行器事件，用于回放演示
 * - 编辑历史：记录编辑操作，用于撤销/重做
 * - 扩展事件：其他 mod 可以注册自己的事件类型
 *
 * 设计原则：
 * - 所有事件都是 TimelineEvent 的子类型
 * - 事件类型通过 category 字段区分
 * - category 是可扩展的字符串，而非固定枚举
 * - 核心分类：execution（执行）、edit（编辑）
 * - mod 可以添加自定义分类：如 'mymod.custom'
 */

// ============ 核心事件分类 ============

/**
 * 时间线事件分类（核心分类）
 * 注意：这只是核心分类，其他 mod 可以使用字符串添加自定义分类
 */
export const TimelineEventCategory = {
  /** 执行事件（Executor 产生的事件） */
  EXECUTION: 'execution',
  /** 编辑事件（用户编辑操作产生的事件） */
  EDIT: 'edit',
} as const

/** 核心事件分类类型 */
export type CoreTimelineEventCategory =
  (typeof TimelineEventCategory)[keyof typeof TimelineEventCategory]

/** 事件分类类型（支持扩展） */
export type TimelineEventCategoryType = CoreTimelineEventCategory | string

// ============ 基础事件接口 ============

/**
 * 时间线事件基础接口
 */
export interface BaseTimelineEvent {
  /** 事件分类（可扩展的字符串） */
  category: TimelineEventCategoryType
  /** 事件发生的相对时间（毫秒，Unix时间戳） */
  timestamp: number
  /** 事件唯一 ID */
  id: string
}

/**
 * 执行事件
 * event 字段存储 ExecutorEvent，但 timeline 模块不依赖 executor 模块
 * 具体类型由使用方（如 DemoRecorder、ReplayExecutor）负责
 */
export interface ExecutionTimelineEvent extends BaseTimelineEvent {
  category: typeof TimelineEventCategory.EXECUTION
  /** 执行器事件（具体类型由 executor 模块定义） */
  event: unknown
}

/**
 * 编辑事件
 */
export interface EditTimelineEvent extends BaseTimelineEvent {
  category: typeof TimelineEventCategory.EDIT
  /** 编辑命令类型 */
  commandType: EditCommandType
  /** 编辑命令数据（用于序列化/反序列化） */
  commandData: SerializedEditCommand
  /** 命令描述 */
  description: string
}

/**
 * 自定义扩展事件（用于 mod 扩展）
 */
export interface CustomTimelineEvent extends BaseTimelineEvent {
  /** 自定义分类（不能是核心分类） */
  category: string
  /** 扩展数据（由 mod 定义） */
  data: unknown
}

/**
 * 时间线事件联合类型
 */
export type TimelineEvent = ExecutionTimelineEvent | EditTimelineEvent | CustomTimelineEvent

// ============ 编辑命令类型 ============

/**
 * 编辑命令类型
 */
export enum EditCommandType {
  /** 添加节点 */
  ADD_NODE = 'add_node',
  /** 删除节点 */
  REMOVE_NODE = 'remove_node',
  /** 添加边 */
  ADD_EDGE = 'add_edge',
  /** 删除边 */
  REMOVE_EDGE = 'remove_edge',
  /** 移动节点 */
  MOVE_NODE = 'move_node',
  /** 调整节点大小 */
  RESIZE_NODE = 'resize_node',
  /** 切换边启用状态 */
  TOGGLE_EDGE = 'toggle_edge',
  /** 批量操作 */
  BATCH = 'batch',
}

/**
 * 序列化的编辑命令数据
 */
export type SerializedEditCommand =
  | {
      type: EditCommandType.ADD_NODE | EditCommandType.REMOVE_NODE
      nodeData: import('../types').SerializedNode
      position: { x: number; y: number }
      size?: { width: number; height: number }
      connectedEdges: Array<{ fromPortId: string; toPortId: string }>
    }
  | {
      type: EditCommandType.ADD_EDGE | EditCommandType.REMOVE_EDGE
      fromPortId: string
      toPortId: string
    }
  | {
      type: EditCommandType.MOVE_NODE
      nodeId: string
      oldPosition: { x: number; y: number }
      newPosition: { x: number; y: number }
    }
  | {
      type: EditCommandType.RESIZE_NODE
      nodeId: string
      oldSize: { width: number; height: number }
      newSize: { width: number; height: number }
    }
  | {
      type: EditCommandType.TOGGLE_EDGE
      fromPortId: string
      toPortId: string
      oldDisabled: boolean
      newDisabled: boolean
    }
  | {
      type: EditCommandType.BATCH
      commands: SerializedEditCommand[]
      description: string
    }

// ============ 时间线录制格式 ============

import type { SerializedGraph } from '../types'

/**
 * 时间线录制文件格式
 * 所有事件通过 category 字段区分类型，录制文件本身不分类
 */
export interface TimelineRecording {
  /** 格式版本（语义化版本，如 '2.0.0'） */
  version: string
  /** 初始图状态 */
  initialGraph: SerializedGraph
  /** 事件序列 */
  events: TimelineEvent[]
  /** 元数据 */
  metadata?: TimelineMetadata
}

/**
 * 时间线元数据
 */
export interface TimelineMetadata {
  title?: string
  description?: string
  createdAt?: string
  /** 录制时的迭代延迟设置（用于执行回放） */
  iterationDelay?: number
  /** 自定义扩展数据 */
  [key: string]: unknown
}

// ============ 事件总线类型 ============

/**
 * 时间线系统事件类型
 */
export enum TimelineSystemEventType {
  /** 事件被添加 */
  EVENT_ADDED = 'event_added',
  /** 录制开始 */
  RECORDING_START = 'recording_start',
  /** 录制停止 */
  RECORDING_STOP = 'recording_stop',
  /** 回放位置变更 */
  PLAYBACK_POSITION = 'playback_position',
  /** 时间线被清空 */
  CLEAR = 'clear',
}

/**
 * 时间线系统事件
 */
export type TimelineSystemEvent =
  | { type: TimelineSystemEventType.EVENT_ADDED; event: TimelineEvent }
  | { type: TimelineSystemEventType.RECORDING_START }
  | { type: TimelineSystemEventType.RECORDING_STOP; eventCount: number }
  | { type: TimelineSystemEventType.PLAYBACK_POSITION; position: number; event?: TimelineEvent }
  | { type: TimelineSystemEventType.CLEAR }

/**
 * 时间线系统事件监听器
 */
export type TimelineSystemEventListener = (event: TimelineSystemEvent) => void
