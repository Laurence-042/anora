/**
 * godot-wry UI 导出
 */
import { registerNodeView } from '@/base/ui/registry'

// 节点视图组件
import { WryIpcNodeView } from './nodes'

// 导出组件
export { WryIpcNodeView }
export * from './nodes'

/**
 * 注册 godot-wry Mod 的节点视图
 */
export function registerGodotWryNodeViews(): void {
  registerNodeView('wry-ipc-node', WryIpcNodeView, ['godot-wry.WryIpcNode'])
}
