/**
 * Demo Recording Types
 *
 * 新架构：直接记录 Executor 事件，回放时 emit 相同的事件给前端组件
 * 这样录制和回放共用同一套前端组件逻辑，避免重复实现
 */

import type { SerializedGraph } from '../types'
import { ExecutorEventType } from '../executor'

/**
 * 带时间戳的执行器事件
 */
export interface TimestampedEvent {
  /** 事件发生的相对时间（毫秒，从录制开始） */
  timestamp: number
  /** 执行器事件（序列化版本，不含对象引用） */
  event: SerializedExecutorEvent
}

/**
 * 序列化的执行器事件
 * 将 BaseNode 引用替换为 nodeId，便于存储和传输
 * 使用 ExecutorEventType 枚举值确保类型安全
 */
export type SerializedExecutorEvent =
  | { type: ExecutorEventType.StateChange; oldState: string; newState: string }
  | { type: ExecutorEventType.Start }
  | { type: ExecutorEventType.Iteration; iteration: number }
  | { type: ExecutorEventType.NodeStart; nodeId: string }
  | { type: ExecutorEventType.NodeComplete; nodeId: string; success: boolean; error?: string }
  | {
      type: ExecutorEventType.DataPropagate
      transfers: Array<{
        fromPortId: string
        toPortId: string
        data: unknown
      }>
    }
  | {
      type: ExecutorEventType.Complete
      result: {
        finishReason: string
        error?: string
        iterations: number
        duration: number
      }
    }
  | { type: ExecutorEventType.Cancelled }
  | { type: ExecutorEventType.Error; error: string }

/**
 * Demo 录制文件格式
 */
export interface DemoRecording {
  /** 格式版本 */
  version: '2.0.0'
  /** 初始图状态（使用标准序列化格式，包含节点位置） */
  initialGraph: SerializedGraph
  /** 事件序列 */
  events: TimestampedEvent[]
  /** 元数据 */
  metadata?: {
    title?: string
    description?: string
    createdAt?: string
    /** 录制时的迭代延迟设置 */
    iterationDelay?: number
    [key: string]: unknown
  }
}
