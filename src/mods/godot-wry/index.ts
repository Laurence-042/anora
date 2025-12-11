/**
 * godot-wry 模块
 * 提供通过 WRY (godot-wry) 与 Godot 后端交互的节点
 */
export * from './runtime'
export * from './ui'
export * from './locales'

import { registerGodotWryNodeViews } from './ui'

/**
 * 初始化 godot-wry Mod
 * 注：节点元数据现在定义在各节点类的 static meta 属性中，无需手动注册
 */
export function initGodotWryMod(): void {
  // runtime 部分通过装饰器自动注册

  // 注册 UI 视图
  registerGodotWryNodeViews()
}
