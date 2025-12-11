/**
 * Godot-WRY Mod 节点元数据定义
 */
import { NodeMetaRegistry, ModMetaRegistry, type NodeMeta } from '@/base/runtime/registry'

/**
 * Godot-WRY Mod 元数据
 */
export const godotWryModMeta = {
  id: 'godot-wry',
  i18nKey: 'mods.godotWry',
  icon: '🎮',
  version: '1.0.0',
}

/**
 * Godot-WRY 节点元数据列表
 */
export const godotWryNodeMetas: NodeMeta[] = [
  {
    typeId: 'godot-wry.WryIpcNode',
    i18nKey: 'nodes.godotWry.wryIpc',
    icon: '🎮',
    category: 'backend',
    categoryI18nKey: 'nodeCategories.backend',
  },
]

/**
 * 注册 Godot-WRY Mod 元数据
 */
export function registerGodotWryNodeMetas(): void {
  ModMetaRegistry.register(godotWryModMeta)
  NodeMetaRegistry.registerMany(godotWryNodeMetas)
}
