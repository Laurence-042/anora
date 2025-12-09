import { BaseRegistry } from './BaseRegistry'
import type { INode, INodeConstructor } from '../types'

/**
 * 节点构造函数类型（从 types.ts 重导出）
 */
export type NodeConstructor = INodeConstructor

/**
 * 节点注册表
 */
class NodeRegistryClass extends BaseRegistry<NodeConstructor> {
  /**
   * 创建节点实例
   */
  createNode(typeId: string, id?: string, label?: string): INode | undefined {
    const Constructor = this.get(typeId)
    if (!Constructor) {
      console.error(`[NodeRegistry] Unknown node type: ${typeId}`)
      return undefined
    }
    return new Constructor(id, label)
  }

  /**
   * 获取节点类型的元数据
   */
  getNodeMeta(typeId: string): { typeId: string; name: string } | undefined {
    const Constructor = this.get(typeId)
    if (!Constructor) return undefined

    return {
      typeId: Constructor.typeId,
      name: Constructor.name,
    }
  }
}

/**
 * 全局节点注册表实例
 */
export const NodeRegistry = new NodeRegistryClass()
