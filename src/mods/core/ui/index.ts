/**
 * Core Mod UI 导出
 */
import { registerNodeView } from '@/base/ui/registry'

// 节点视图组件
import ParameterNodeView from './nodes/ParameterNodeView.vue'
import ForwardNodeView from './nodes/ForwardNodeView.vue'
import ArithmeticNodeView from './nodes/ArithmeticNodeView.vue'
import NotifyNodeView from './nodes/NotifyNodeView.vue'

// 导出组件（供其他 mod 扩展使用）
export { ParameterNodeView, ForwardNodeView, ArithmeticNodeView, NotifyNodeView }

/**
 * 注册 Core Mod 的节点视图
 * 在应用启动时调用
 */
export function registerCoreNodeViews(): void {
  registerNodeView('parameter-node', ParameterNodeView, ['core.ParameterNode'])
  registerNodeView('arithmetic-node', ArithmeticNodeView, ['core.ArithmeticNode'])
  registerNodeView('forward-node', ForwardNodeView, ['core.ForwardNode'])
  registerNodeView('notify-node', NotifyNodeView, ['core.NotifyNode'])
}
