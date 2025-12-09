import { BaseRegistry } from './BaseRegistry'
import type { IExecutor, IExecutorConstructor } from '../types'

/**
 * Executor 构造函数类型（从 types.ts 重导出）
 */
export type ExecutorConstructor = IExecutorConstructor

/**
 * Executor 注册表
 */
class ExecutorRegistryClass extends BaseRegistry<ExecutorConstructor> {
  /**
   * 创建 Executor 实例
   */
  createExecutor(typeId: string, ...args: unknown[]): IExecutor | undefined {
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
