/**
 * ANORA Core Mod
 */
import type { ModDefinition } from '../ModRegistry'
import { ModRegistry } from '../ModRegistry'
import { registerNodeView } from '@/base/ui/registry'

// Runtime exports
export * from './runtime'

// Locales
import { coreLocales } from './locales'
export * from './locales'

// UI Components
import ParameterNodeView from './ui/nodes/ParameterNodeView.vue'
import ForwardNodeView from './ui/nodes/ForwardNodeView.vue'
import ArithmeticNodeView from './ui/nodes/ArithmeticNodeView.vue'
import LogicNodeView from './ui/nodes/LogicNodeView.vue'
import CompareNodeView from './ui/nodes/CompareNodeView.vue'
import NotifyNodeView from './ui/nodes/NotifyNodeView.vue'
import StringFormatNodeView from './ui/nodes/StringFormatNodeView.vue'
import ConsoleLogNodeView from './ui/nodes/ConsoleLogNodeView.vue'

export {
  ParameterNodeView,
  ForwardNodeView,
  ArithmeticNodeView,
  LogicNodeView,
  CompareNodeView,
  NotifyNodeView,
  StringFormatNodeView,
  ConsoleLogNodeView,
}

/**
 * Core Mod 定义
 */
export const coreModDef: ModDefinition = {
  id: 'core',
  locales: coreLocales,
  init() {
    // 注册节点视图
    registerNodeView('parameter-node', ParameterNodeView, ['core.ParameterNode'])
    registerNodeView('arithmetic-node', ArithmeticNodeView, ['core.ArithmeticNode'])
    registerNodeView('logic-node', LogicNodeView, ['core.LogicNode'])
    registerNodeView('compare-node', CompareNodeView, ['core.CompareNode'])
    registerNodeView('forward-node', ForwardNodeView, ['core.ForwardNode'])
    registerNodeView('notify-node', NotifyNodeView, ['core.NotifyNode'])
    registerNodeView('string-format-node', StringFormatNodeView, ['core.StringFormatNode'])
    registerNodeView('console-log-node', ConsoleLogNodeView, ['core.ConsoleLogNode'])
  },
}

// 自动注册到 ModRegistry
ModRegistry.register(coreModDef)
