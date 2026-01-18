/**
 * NodeViewRegistry - 节点视图注册表（合并了 Meta 功能）
 *
 * 统一管理节点的视图组件和元数据：
 * 1. 视图组件注册 - 用于 Vue-Flow 自定义节点渲染
 * 2. 元数据获取 - 从节点类静态属性读取 icon、category 和 defaultSize
 *
 * 设计原则：
 * - 节点固有属性（icon、category、defaultSize）定义在节点类的 static meta 中
 * - i18n 在使用处直接调用 t()，key 格式为 nodes.{mod}.{NodeName}
 * - 视图层统一从此注册表获取所需信息
 */
import { markRaw, type Component } from 'vue'
import { NodeRegistry } from '@/base/runtime/registry'
import type { NodeStaticMeta, NodeSize } from '@/base/runtime/nodes'

/**
 * 节点元数据
 */
export interface NodeMeta {
  /** 节点类型ID，如 'core.ForwardNode' */
  typeId: string
  /** 图标 */
  icon: string
  /** 分类 */
  category: string
  /** 默认尺寸（可选） */
  defaultSize?: NodeSize
}

/**
 * 节点视图注册信息
 */
export interface NodeViewEntry {
  /** Vue-Flow 节点类型名 */
  vfType: string
  /** Vue 组件 */
  component: Component
  /** 匹配的节点 typeId 列表 */
  nodeTypeIds: string[]
}

/**
 * 节点视图注册表类
 */
class NodeViewRegistryClass {
  /** vfType -> Component */
  private viewComponents: Map<string, Component> = new Map()

  /** nodeTypeId -> vfType */
  private nodeTypeToView: Map<string, string> = new Map()

  /** 默认视图类型名 */
  private defaultViewType: string = 'anora-node'

  /** 默认视图组件 */
  private defaultComponent: Component | null = null

  // ==================== 视图注册 ====================

  /**
   * 注册节点视图
   */
  register(vfType: string, component: Component, nodeTypeIds: string[]): void {
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

  // ==================== 元数据获取 ====================

  /**
   * 获取节点元数据
   * 从节点类的 static meta 读取
   */
  getNodeMeta(typeId: string): NodeMeta {
    const NodeClass = NodeRegistry.get(typeId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staticMeta: NodeStaticMeta = (NodeClass as any)?.meta ?? {}

    // 从 typeId 推导分类（如果静态 meta 未指定）
    const parts = typeId.split('.')
    const defaultCategory = parts.length > 1 ? parts[0]! : 'other'

    return {
      typeId,
      icon: staticMeta.icon ?? '◇',
      category: staticMeta.category ?? defaultCategory,
      defaultSize: staticMeta.defaultSize,
    }
  }

  /**
   * 获取所有已注册节点的元数据
   */
  getAllNodeMetas(): NodeMeta[] {
    const metas: NodeMeta[] = []
    for (const [typeId] of NodeRegistry.getAll()) {
      metas.push(this.getNodeMeta(typeId))
    }
    return metas
  }

  /**
   * 按分类获取节点元数据
   */
  getNodeMetasByCategory(category: string): NodeMeta[] {
    return this.getAllNodeMetas().filter((m) => m.category === category)
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set<string>()
    for (const meta of this.getAllNodeMetas()) {
      categories.add(meta.category)
    }
    return Array.from(categories)
  }

  // ==================== 工具方法 ====================

  /**
   * 清空注册表
   */
  clear(): void {
    this.viewComponents.clear()
    this.nodeTypeToView.clear()
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
 */
export function registerNodeView(
  vfType: string,
  component: Component,
  nodeTypeIds: string[],
): void {
  NodeViewRegistry.register(vfType, component, nodeTypeIds)
}
