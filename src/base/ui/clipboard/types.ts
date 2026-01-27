/**
 * Clipboard Types
 * 剪贴板系统类型定义
 */

import type { SerializedNode, SerializedEdge } from '@/base/runtime/types'

/**
 * 剪贴板数据格式
 */
export interface ClipboardData {
  /** 复制的节点（含相对位置） */
  nodes: Array<{
    /** 节点序列化数据 */
    node: SerializedNode
    /** 相对于选区中心的偏移 */
    offset: { x: number; y: number }
  }>

  /** 选中节点之间的内部边 */
  edges: SerializedEdge[]
}

/**
 * 剪贴板事件类型
 */
export enum ClipboardEventType {
  COPY = 'copy',
  PASTE = 'paste',
  CLEAR = 'clear',
}

/**
 * 剪贴板事件
 */
export interface ClipboardEvent {
  type: ClipboardEventType
  data?: ClipboardData
}

/**
 * 剪贴板事件监听器
 */
export type ClipboardEventListener = (event: ClipboardEvent) => void
