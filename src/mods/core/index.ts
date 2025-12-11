// ANORA Core Mod
export * from './runtime'
export * from './ui'

import { registerCoreNodeViews } from './ui'

/**
 * 初始化 Core Mod
 * 注册所有运行时组件和 UI 视图
 * 注：节点元数据现在定义在各节点类的 static meta 属性中，无需手动注册
 */
export function initCoreMod(): void {
  // runtime 部分通过装饰器自动注册

  // 注册 UI 视图
  registerCoreNodeViews()
}
