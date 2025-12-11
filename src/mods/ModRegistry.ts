/**
 * Mod 定义接口
 * 每个 mod 必须导出一个符合此接口的 modDef 对象
 */

import type { Component } from 'vue'

/**
 * Mod 的 locale 定义
 */
export interface ModLocales {
  en: Record<string, unknown>
  'zh-CN': Record<string, unknown>
}

/**
 * Mod 定义
 */
export interface ModDefinition {
  /** Mod ID，唯一标识 */
  id: string

  /** Mod 的 locale 翻译 */
  locales: ModLocales

  /**
   * 初始化函数
   * 用于注册节点视图等，在 mod 加载时调用
   */
  init?: () => void

  /**
   * 节点视图注册
   * key: Vue-Flow 节点类型名
   * value: { component, nodeTypeIds }
   */
  nodeViews?: Record<string, { component: Component; nodeTypeIds: string[] }>
}

/**
 * Mod 注册表
 */
class ModRegistryClass {
  private mods: Map<string, ModDefinition> = new Map()

  /**
   * 注册一个 mod
   */
  register(mod: ModDefinition): void {
    if (this.mods.has(mod.id)) {
      console.warn(`[ModRegistry] Mod "${mod.id}" already registered, overwriting...`)
    }
    this.mods.set(mod.id, mod)
  }

  /**
   * 获取所有已注册的 mods
   */
  getAll(): ModDefinition[] {
    return Array.from(this.mods.values())
  }

  /**
   * 获取指定 mod
   */
  get(id: string): ModDefinition | undefined {
    return this.mods.get(id)
  }

  /**
   * 初始化所有 mods
   */
  initAll(): void {
    for (const mod of this.mods.values()) {
      mod.init?.()
    }
  }

  /**
   * 获取合并后的 locale
   */
  getMergedLocales(locale: 'en' | 'zh-CN'): Record<string, unknown> {
    const merged: Record<string, unknown> = {}

    for (const mod of this.mods.values()) {
      const modLocale = mod.locales[locale]
      deepMerge(merged, modLocale)
    }

    return merged
  }
}

/**
 * 深度合并对象
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: Record<string, any>, source: Record<string, any>): void {
  for (const key in source) {
    const targetVal = target[key]
    const sourceVal = source[key]
    if (
      targetVal &&
      sourceVal &&
      typeof targetVal === 'object' &&
      typeof sourceVal === 'object' &&
      !Array.isArray(targetVal) &&
      !Array.isArray(sourceVal)
    ) {
      deepMerge(targetVal, sourceVal)
    } else {
      target[key] = sourceVal
    }
  }
}

/**
 * 全局 Mod 注册表
 */
export const ModRegistry = new ModRegistryClass()
