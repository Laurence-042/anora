// ANORA Core Mod
export * from './runtime'
export * from './ui'

import { registerCoreNodeViews } from './ui'
import { registerCoreNodeMetas } from './runtime'

/**
 * 初始化 Core Mod
 * 注册所有运行时组件和 UI 视图
 */
export function initCoreMod(): void {
  // 注册节点元数据 (i18n, icons)
  registerCoreNodeMetas()

  // runtime 部分通过装饰器自动注册

  // 注册 UI 视图
  registerCoreNodeViews()
}
