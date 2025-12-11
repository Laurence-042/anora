/**
 * ANORA Mods 入口
 *
 * 自动加载机制：
 * - 每个 mod 在导入时自动注册到 ModRegistry
 * - 只需在此文件 import mod 即可完成加载
 * - 新增 mod 时只需添加一行 import
 */

// Mod 注册表
export { ModRegistry, type ModDefinition, type ModLocales } from './ModRegistry'

// ============ 加载所有 Mods ============
// 每个 mod 在导入时会自动注册到 ModRegistry
import './core'
import './godot-wry'
// 新增 mod 时在此添加 import
// import './your-new-mod'

// Re-export mods
export * from './core'
export * from './godot-wry'

import { ModRegistry } from './ModRegistry'

/**
 * 初始化所有 Mods
 * 调用每个 mod 的 init 函数
 */
export function initAllMods(): void {
  ModRegistry.initAll()
}
