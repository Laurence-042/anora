/**
 * ExecutorTypes - 执行器事件和类型定义
 *
 * 统一定义所有执行器（BasicExecutor, ReplayExecutor 等）共用的事件类型
 * 前端组件只需监听这些事件即可响应执行状态变化
 */

import type { BaseNode } from '../nodes/BaseNode'
import { ExecutorStatus } from '../types'

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 执行状态 */
  status: ExecutorStatus
  /** 错误信息（如果有） */
  error?: Error
  /** 执行的迭代次数 */
  iterations: number
  /** 执行时间（毫秒） */
  duration: number
}

/**
 * 节点执行结果
 */
export interface NodeExecutionResult {
  node: BaseNode
  success: boolean
  error?: Error
}

/**
 * 边数据传递记录
 */
export interface EdgeDataTransfer {
  /** 源 Port ID */
  fromPortId: string
  /** 目标 Port ID */
  toPortId: string
  /** 传递的数据 */
  data: unknown
}

/**
 * 执行器事件枚举
 * 用于类型安全的事件类型判断
 */
export enum ExecutorEventType {
  /** 执行开始 */
  Start = 'start',
  /** 迭代开始 */
  Iteration = 'iteration',
  /** 节点开始执行 */
  NodeStart = 'node-start',
  /** 节点执行完成 */
  NodeComplete = 'node-complete',
  /** 数据传播 */
  DataPropagate = 'data-propagate',
  /** 执行完成 */
  Complete = 'complete',
  /** 执行被取消 */
  Cancelled = 'cancelled',
  /** 执行错误 */
  Error = 'error',
}

/**
 * 执行器事件
 * 所有执行器（包括回放执行器）都发送相同格式的事件
 */
export type ExecutorEvent =
  | { type: ExecutorEventType.Start }
  | { type: ExecutorEventType.Iteration; iteration: number }
  | { type: ExecutorEventType.NodeStart; node: BaseNode }
  | { type: ExecutorEventType.NodeComplete; node: BaseNode; success: boolean; error?: Error }
  | { type: ExecutorEventType.DataPropagate; transfers: EdgeDataTransfer[] }
  | { type: ExecutorEventType.Complete; result: ExecutionResult }
  | { type: ExecutorEventType.Cancelled }
  | { type: ExecutorEventType.Error; error: Error }

/**
 * 事件监听器
 */
export type ExecutorEventListener = (event: ExecutorEvent) => void
