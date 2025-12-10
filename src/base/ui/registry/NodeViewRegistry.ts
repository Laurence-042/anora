/**
 * NodeViewRegistry - 节点视图组件注册表
 *
 * 用于注册自定义节点视图组件，使 mod 层的视图能够被 base 层的 GraphEditor 使用
 * 而无需在 base 层直接 import mod 层代码
 */
import { markRaw, type Component } from 'vue'

/**
 * 节点视图注册信息
 */
export interface NodeViewEntry {
  /**
   * Vue-Flow 节点类型名（用于 nodeTypes 映射）
   */
  vfType: string

  /**
   * Vue 组件
   */
  component: Component

  /**
   * 匹配的节点 typeId 列表
   * 一个视图可以用于多个节点类型
   */
  nodeTypeIds: string[]
}

/**
 * 节点视图注册表
 */
class NodeViewRegistryClass {
  /**
   * vfType -> Component 的映射（用于 Vue-Flow nodeTypes）
   */
  private viewComponents: Map<string, Component> = new Map()

  /**
   * nodeTypeId -> vfType 的映射（用于根据节点类型查找视图类型）
   */
  private nodeTypeToView: Map<string, string> = new Map()

  /**
   * 默认视图类型名
   */
  private defaultViewType: string = 'anora-node'

  /**
   * 默认视图组件（懒加载设置）
   */
  private defaultComponent: Component | null = null

  /**
   * 注册节点视图
   *
   * @param vfType Vue-Flow 节点类型名（如 'parameter-node'）
   * @param component Vue 组件
   * @param nodeTypeIds 匹配的节点 typeId 列表（如 ['core.ParameterNode']）
   */
  register(vfType: string, component: Component, nodeTypeIds: string[]): void {
    // 使用 markRaw 避免组件被 Vue 代理
    this.viewComponents.set(vfType, markRaw(component))

    for (const typeId of nodeTypeIds) {
      if (this.nodeTypeToView.has(typeId)) {
        console.warn(
          `[NodeViewRegistry] Node type "${typeId}" already has a view registered, overwriting...`,
        )
      }
      this.nodeTypeToView.set(typeId, vfType)
    }
  }

  /**
   * 设置默认视图组件
   */
  setDefaultView(component: Component): void {
    this.defaultComponent = markRaw(component)
    this.viewComponents.set(this.defaultViewType, this.defaultComponent)
  }

  /**
   * 根据节点 typeId 获取对应的 Vue-Flow 类型名
   */
  getViewType(nodeTypeId: string): string {
    return this.nodeTypeToView.get(nodeTypeId) ?? this.defaultViewType
  }

  /**
   * 获取所有注册的视图组件（用于 Vue-Flow nodeTypes）
   * @returns Record<vfType, Component>
   */
  getNodeTypes(): Record<string, Component> {
    const result: Record<string, Component> = {}
    for (const [vfType, component] of this.viewComponents) {
      result[vfType] = component
    }
    return result
  }

  /**
   * 检查是否有针对特定节点类型的自定义视图
   */
  hasCustomView(nodeTypeId: string): boolean {
    return this.nodeTypeToView.has(nodeTypeId)
  }

  /**
   * 获取所有已注册的节点类型
   */
  getRegisteredNodeTypes(): string[] {
    return Array.from(this.nodeTypeToView.keys())
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.viewComponents.clear()
    this.nodeTypeToView.clear()
    // 保留默认视图
    if (this.defaultComponent) {
      this.viewComponents.set(this.defaultViewType, this.defaultComponent)
    }
  }
}

/**
 * 全局节点视图注册表实例
 */
export const NodeViewRegistry = new NodeViewRegistryClass()

/**
 * 注册节点视图的便捷函数
 *
 * @example
 * ```ts
 * registerNodeView('parameter-node', ParameterNodeView, ['core.ParameterNode'])
 * ```
 */
export function registerNodeView(
  vfType: string,
  component: Component,
  nodeTypeIds: string[],
): void {
  NodeViewRegistry.register(vfType, component, nodeTypeIds)
}
