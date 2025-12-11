/**
 * Core Mod 节点元数据定义
 */
import { NodeMetaRegistry, ModMetaRegistry, type NodeMeta } from '@/base/runtime/registry'

/**
 * Core Mod 元数据
 */
export const coreModMeta = {
  id: 'core',
  i18nKey: 'mods.core',
  icon: '⚙️',
  version: '1.0.0',
}

/**
 * Core 节点元数据列表
 */
export const coreNodeMetas: NodeMeta[] = [
  // 数据流节点
  {
    typeId: 'core.ForwardNode',
    i18nKey: 'nodes.core.forward',
    icon: '➡️',
    category: 'core',
    categoryI18nKey: 'nodeCategories.core',
    descriptionI18nKey: 'nodeDescriptions.core.forward',
  },
  {
    typeId: 'core.ParameterNode',
    i18nKey: 'nodes.core.parameter',
    icon: '📝',
    category: 'core',
    categoryI18nKey: 'nodeCategories.core',
  },
  {
    typeId: 'core.DistributeNode',
    i18nKey: 'nodes.core.distribute',
    icon: '🔀',
    category: 'core',
    categoryI18nKey: 'nodeCategories.core',
  },
  {
    typeId: 'core.AggregateNode',
    i18nKey: 'nodes.core.aggregate',
    icon: '🔗',
    category: 'core',
    categoryI18nKey: 'nodeCategories.core',
  },

  // 逻辑节点
  {
    typeId: 'core.CompareNode',
    i18nKey: 'nodes.core.compare',
    icon: '⚖️',
    category: 'logic',
    categoryI18nKey: 'nodeCategories.logic',
  },
  {
    typeId: 'core.BranchNode',
    i18nKey: 'nodes.core.branch',
    icon: '🔀',
    category: 'logic',
    categoryI18nKey: 'nodeCategories.logic',
  },
  {
    typeId: 'core.LogicNode',
    i18nKey: 'nodes.core.logic',
    icon: '🔣',
    category: 'logic',
    categoryI18nKey: 'nodeCategories.logic',
  },

  // 运算节点
  {
    typeId: 'core.ArithmeticNode',
    i18nKey: 'nodes.core.arithmetic',
    icon: '🔢',
    category: 'math',
    categoryI18nKey: 'nodeCategories.math',
  },

  // 字符串节点
  {
    typeId: 'core.StringFormatNode',
    i18nKey: 'nodes.core.stringFormat',
    icon: '📄',
    category: 'string',
    categoryI18nKey: 'nodeCategories.string',
  },

  // 输出节点
  {
    typeId: 'core.ConsoleLogNode',
    i18nKey: 'nodes.core.consoleLog',
    icon: '📤',
    category: 'io',
    categoryI18nKey: 'nodeCategories.io',
  },
  {
    typeId: 'core.NotifyNode',
    i18nKey: 'nodes.core.notify',
    icon: '🔔',
    category: 'io',
    categoryI18nKey: 'nodeCategories.io',
  },

  // 数据结构节点
  {
    typeId: 'core.ObjectAccessNode',
    i18nKey: 'nodes.core.objectAccess',
    icon: '📦',
    category: 'data',
    categoryI18nKey: 'nodeCategories.data',
  },
  {
    typeId: 'core.ObjectSetNode',
    i18nKey: 'nodes.core.objectSet',
    icon: '📦',
    category: 'data',
    categoryI18nKey: 'nodeCategories.data',
  },
  {
    typeId: 'core.ArrayAccessNode',
    i18nKey: 'nodes.core.arrayAccess',
    icon: '📋',
    category: 'data',
    categoryI18nKey: 'nodeCategories.data',
  },
  {
    typeId: 'core.ArrayPushNode',
    i18nKey: 'nodes.core.arrayPush',
    icon: '📋',
    category: 'data',
    categoryI18nKey: 'nodeCategories.data',
  },
  {
    typeId: 'core.ArrayLengthNode',
    i18nKey: 'nodes.core.arrayLength',
    icon: '📋',
    category: 'data',
    categoryI18nKey: 'nodeCategories.data',
  },
]

/**
 * 注册 Core Mod 元数据
 */
export function registerCoreNodeMetas(): void {
  ModMetaRegistry.register(coreModMeta)
  NodeMetaRegistry.registerMany(coreNodeMetas)
}
