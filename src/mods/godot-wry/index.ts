/**
 * godot-wry 模块
 * 提供通过 WRY (godot-wry) 与 Godot 后端交互的节点
 */
export * from './runtime'
export * from './ui'

import { registerGodotWryNodeViews } from './ui'
import { registerGodotWryNodeMetas } from './runtime'

/**
 * 初始化 godot-wry Mod
 */
export function initGodotWryMod(): void {
  // 注册节点元数据 (i18n, icons)
  registerGodotWryNodeMetas()

  // runtime 部分通过装饰器自动注册

  // 注册 UI 视图
  registerGodotWryNodeViews()
}
