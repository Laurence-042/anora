// ANORA Mods
export * from './core'
export * from './godot-wry'

import { initCoreMod } from './core'
import { initGodotWryMod } from './godot-wry'

/**
 * 初始化所有 Mods
 * 在应用启动时调用，注册所有 mod 的运行时组件和 UI 视图
 * 注：节点元数据现在定义在各节点类的 static meta 属性中，无需手动注册
 */
export function initAllMods(): void {
  // 初始化各个 mod
  initCoreMod()
  initGodotWryMod()
}
