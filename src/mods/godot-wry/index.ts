/**
 * godot-wry 模块
 * 提供通过 WRY (godot-wry) 与 Godot 后端交互的节点
 */
export * from './runtime'
export * from './ui'

import { registerGodotWryNodeViews } from './ui'

/**
 * 初始化 godot-wry Mod
 */
export function initGodotWryMod(): void {
  // runtime 部分通过装饰器自动注册

  // 注册 UI 视图
  registerGodotWryNodeViews()
}
