/**
 * 通用注册表基类
 */
export abstract class BaseRegistry<T> {
  protected registry: Map<string, T> = new Map()

  /**
   * 注册一个项目
   */
  register(typeId: string, item: T): void {
    if (this.registry.has(typeId)) {
      console.warn(`[Registry] Type "${typeId}" is already registered, overwriting...`)
    }
    this.registry.set(typeId, item)
  }

  /**
   * 获取已注册的项目
   */
  get(typeId: string): T | undefined {
    return this.registry.get(typeId)
  }

  /**
   * 检查是否已注册
   */
  has(typeId: string): boolean {
    return this.registry.has(typeId)
  }

  /**
   * 获取所有已注册的 typeId
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.registry.keys())
  }

  /**
   * 获取所有已注册的项目
   */
  getAll(): Map<string, T> {
    return new Map(this.registry)
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.registry.clear()
  }
}
