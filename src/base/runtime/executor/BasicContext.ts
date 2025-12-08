import type { ExecutorContext, ExecutorBasicContext } from '../types'

/**
 * 基础执行上下文
 */
export class BasicContext implements ExecutorBasicContext {
  /** 后端 IPC 类型标识 */
  ipcTypeId: string = 'postMessage'

  /** 额外的扩展属性 */
  private extensions: Map<string, unknown> = new Map()

  constructor(ipcTypeId: string = 'postMessage') {
    this.ipcTypeId = ipcTypeId
  }

  /**
   * 设置扩展属性
   */
  set(key: string, value: unknown): void {
    this.extensions.set(key, value)
  }

  /**
   * 获取扩展属性
   */
  get<T>(key: string): T | undefined {
    return this.extensions.get(key) as T | undefined
  }

  /**
   * 检查是否有扩展属性
   */
  has(key: string): boolean {
    return this.extensions.has(key)
  }

  /**
   * 转换为 ExecutorContext
   */
  toExecutorContext(): ExecutorContext {
    const context: ExecutorContext = {
      ipcTypeId: this.ipcTypeId,
    }

    for (const [key, value] of this.extensions) {
      context[key] = value
    }

    return context
  }

  /**
   * 克隆上下文
   */
  clone(): BasicContext {
    const cloned = new BasicContext(this.ipcTypeId)
    for (const [key, value] of this.extensions) {
      cloned.set(key, value)
    }
    return cloned
  }
}
