/**
 * ANORA Mods 入口
 *
 * 自动加载机制：
 * - 使用 Vite glob import 自动发现并加载所有 mod
 * - 每个 mod 目录必须包含 index.ts，其中调用 ModRegistry.register()
 * - 新增 mod 只需在 src/mods/ 下创建目录，无需修改此文件
 */

// Mod 注册表
export { ModRegistry, type ModDefinition, type ModLocales } from './ModRegistry'

// ============ 自动发现并加载所有 Mods ============
// Vite glob import: 自动导入 src/mods/*/index.ts
// 每个 mod 的 index.ts 在导入时会自动执行 ModRegistry.register()
const _modModules = import.meta.glob('./*/index.ts', { eager: true })

import { ModRegistry } from './ModRegistry'

/**
 * 初始化所有 Mods
 * 调用每个 mod 的 init 函数
 */
export function initAllMods(): void {
  ModRegistry.initAll()
}
