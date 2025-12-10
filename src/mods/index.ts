// ANORA Mods
export * from './core'
export * from './godot-wry'

import { initCoreMod } from './core'

/**
 * 初始化所有 Mods
 * 在应用启动时调用，注册所有 mod 的运行时组件和 UI 视图
 */
export function initAllMods(): void {
  initCoreMod()
  // 其他 mod 的初始化...
}
