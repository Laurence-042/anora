import { BaseRegistry } from './BaseRegistry'
import { BasicExecutor } from '../executor/BasicExecutor'

/**
 * Executor 类型定义
 */
export type ExecutorConstructor = new (...args: unknown[]) => BasicExecutor

/**
 * Executor 注册表
 */
class ExecutorRegistryClass extends BaseRegistry<ExecutorConstructor> {
  /**
   * 创建 Executor 实例
   */
  createExecutor(typeId: string, ...args: unknown[]): BasicExecutor | undefined {
    const Constructor = this.get(typeId)
    if (!Constructor) {
      console.error(`[ExecutorRegistry] Unknown executor type: ${typeId}`)
      return undefined
    }
    return new Constructor(...args)
  }
}

/**
 * 全局 Executor 注册表实例
 */
export const ExecutorRegistry = new ExecutorRegistryClass()
