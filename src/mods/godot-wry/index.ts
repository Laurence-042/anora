/**
 * godot-wry 模块
 * 提供通过 WRY (godot-wry) 与 Godot 后端交互的节点
 */
import type { ModDefinition } from '../ModRegistry'
import { ModRegistry } from '../ModRegistry'
import { registerNodeView } from '@/base/ui/registry'

// Runtime exports
export * from './runtime'

// Locales
import { godotWryLocales } from './locales'
export * from './locales'

// UI Components
import { WryIpcNodeView } from './ui/nodes'
export { WryIpcNodeView }
export * from './ui/nodes'

/**
 * Godot-WRY Mod 定义
 */
export const godotWryModDef: ModDefinition = {
  id: 'godot-wry',
  locales: godotWryLocales,
  init() {
    // 注册节点视图
    registerNodeView('wry-ipc-node', WryIpcNodeView, ['godot-wry.WryIpcNode'])
  },
}

// 自动注册到 ModRegistry
ModRegistry.register(godotWryModDef)
