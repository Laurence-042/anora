/**
 * Base 模块节点元数据定义
 */
import { NodeMetaRegistry, ModMetaRegistry, type NodeMeta } from '../registry'

/**
 * Base Mod 元数据
 */
export const baseModMeta = {
  id: 'base',
  i18nKey: 'mods.base',
  icon: '📦',
  version: '1.0.0',
}

/**
 * Base 节点元数据列表
 */
export const baseNodeMetas: NodeMeta[] = [
  {
    typeId: 'base.SubGraphNode',
    i18nKey: 'nodes.base.subGraph',
    icon: '📁',
    category: 'base',
    categoryI18nKey: 'nodeCategories.base',
  },
  {
    typeId: 'base.SubGraphEntryNode',
    i18nKey: 'nodes.base.subGraphEntry',
    icon: '📥',
    category: 'base',
    categoryI18nKey: 'nodeCategories.base',
  },
  {
    typeId: 'base.SubGraphExitNode',
    i18nKey: 'nodes.base.subGraphExit',
    icon: '📤',
    category: 'base',
    categoryI18nKey: 'nodeCategories.base',
  },
]

/**
 * 注册 Base 模块元数据
 */
export function registerBaseNodeMetas(): void {
  ModMetaRegistry.register(baseModMeta)
  NodeMetaRegistry.registerMany(baseNodeMetas)
}
