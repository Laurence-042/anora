/**
 * Base module locales
 */
import en from './en'
import zhCN from './zh-CN'

export const baseLocales = {
  en,
  'zh-CN': zhCN,
}

export type BaseMessageSchema = typeof en
