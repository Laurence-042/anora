/**
 * useNodeInput - 节点内输入元素的通用处理
 * 提供 Vue-Flow 兼容的类名和事件处理
 */

/**
 * Vue-Flow 输入元素需要的类名
 * - nowheel: 阻止滚轮事件被 Vue-Flow 拦截
 * - nopan: 阻止拖拽平移
 * - nodrag: 阻止节点拖拽
 */
export const NODE_INPUT_CLASS = 'nowheel nopan nodrag'

/**
 * 阻止键盘事件冒泡到 Vue-Flow
 * 使 Ctrl+A, Ctrl+C, Ctrl+V 等快捷键正常工作
 */
export function stopKeydown(event: Event | KeyboardEvent): void {
  event.stopPropagation()
}

/**
 * useNodeInput composable
 * 提供节点内输入元素所需的类和事件处理器
 */
export function useNodeInput() {
  return {
    /** 输入元素需要添加的类名 */
    inputClass: NODE_INPUT_CLASS,
    /** 键盘事件处理器，阻止冒泡 */
    onKeydown: stopKeydown,
  }
}
