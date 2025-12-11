// ANORA Mods
export * from './core'
export * from './godot-wry'

import { initCoreMod } from './core'
import { initGodotWryMod } from './godot-wry'
import { registerBaseNodeMetas } from '@/base/runtime'

/**
 * 初始化所有 Mods
 * 在应用启动时调用，注册所有 mod 的运行时组件和 UI 视图
 */
export function initAllMods(): void {
  // 注册 base 模块节点元数据
  registerBaseNodeMetas()

  // 初始化各个 mod
  initCoreMod()
  initGodotWryMod()
}
