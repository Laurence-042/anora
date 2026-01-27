/**
 * Clipboard Types
 * 剪贴板系统类型定义
 */

import type { SerializedGraph } from '@/base/runtime/types'

/**
 * 剪贴板数据标识符
 * 用于在系统剪贴板中识别 ANORA 数据
 */
export const CLIPBOARD_MARKER = 'ANORA_GRAPH_CLIPBOARD_V1'

/**
 * 系统剪贴板数据格式
 * 直接序列化为 JSON 字符串存入系统剪贴板
 */
export interface ClipboardData {
  /** 数据标识符 */
  marker: typeof CLIPBOARD_MARKER
  /** 序列化的子图数据 */
  graph: SerializedGraph
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
