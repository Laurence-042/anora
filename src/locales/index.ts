/**
 * i18n 配置
 *
 * Locale 来源：
 * 1. base locale - 基础 UI 翻译
 * 2. mod locales - 从 ModRegistry 自动获取各 mod 的翻译
 */
import { createI18n } from 'vue-i18n'
import { baseLocales, type BaseMessageSchema } from '@/base/locales'
import { ModRegistry } from '@/mods/ModRegistry'

export type MessageSchema = BaseMessageSchema
export type LocaleType = 'zh-CN' | 'en'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObject = Record<string, any>

/**
 * 深度合并对象
 */
function deepMerge(target: AnyObject, source: AnyObject): AnyObject {
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
      target[key] = deepMerge({ ...targetVal }, sourceVal)
    } else {
      target[key] = sourceVal
    }
  }
  return target
}

/**
 * 合并 base locale 和所有 mod 的 locale
 */
function mergeLocales(locale: LocaleType): MessageSchema {
  const base = { ...baseLocales[locale] }
  const modLocales = ModRegistry.getMergedLocales(locale)
  return deepMerge(base, modLocales) as MessageSchema
}

/**
 * 获取浏览器语言
 */
function getBrowserLocale(): LocaleType {
  const lang = navigator.language || 'en'
  if (lang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en'
}

/**
 * 获取存储的语言设置
 */
function getStoredLocale(): LocaleType | null {
  const stored = localStorage.getItem('anora-locale')
  if (stored === 'zh-CN' || stored === 'en') {
    return stored
  }
  return null
}

/**
 * 保存语言设置
 */
export function setLocale(locale: LocaleType): void {
  localStorage.setItem('anora-locale', locale)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(i18n.global.locale as any).value = locale
}

/**
 * 获取当前语言
 */
export function getLocale(): LocaleType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (i18n.global.locale as any).value as LocaleType
}

/**
 * 切换语言
 */
export function toggleLocale(): void {
  const current = getLocale()
  const next = current === 'zh-CN' ? 'en' : 'zh-CN'
  setLocale(next)
}

/**
 * 可用语言列表
 */
export const availableLocales: { code: LocaleType; name: string }[] = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'en', name: 'English' },
]

/**
 * 创建 i18n 实例
 */
export const i18n = createI18n<[MessageSchema], 'zh-CN' | 'en'>({
  legacy: false,
  locale: getStoredLocale() || getBrowserLocale(),
  fallbackLocale: 'en',
  messages: {
    'zh-CN': mergeLocales('zh-CN'),
    en: mergeLocales('en'),
  },
})

export default i18n
