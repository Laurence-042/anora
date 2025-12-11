/**
 * 节点元数据定义
 * 用于节点 i18n 名称、图标、分类等信息
 */

/**
 * 节点元数据接口
 */
export interface NodeMeta {
  /** 节点类型ID (如 'core.ForwardNode') */
  typeId: string
  /** i18n key (如 'nodes.core.forward') */
  i18nKey: string
  /** 图标名称 (Element Plus icon 或 emoji) */
  icon?: string
  /** 分类 (用于节点面板分组) */
  category: string
  /** 分类的 i18n key */
  categoryI18nKey: string
  /** 描述的 i18n key */
  descriptionI18nKey?: string
}

/**
 * Mod 元数据接口
 */
export interface ModMeta {
  /** Mod ID */
  id: string
  /** i18n key */
  i18nKey: string
  /** 图标 */
  icon?: string
  /** 版本 */
  version?: string
}

/**
 * 节点元数据注册表
 */
class NodeMetaRegistryClass {
  private metas = new Map<string, NodeMeta>()

  /**
   * 注册节点元数据
   */
  register(meta: NodeMeta): void {
    this.metas.set(meta.typeId, meta)
  }

  /**
   * 批量注册节点元数据
   */
  registerMany(metas: NodeMeta[]): void {
    for (const meta of metas) {
      this.register(meta)
    }
  }

  /**
   * 获取节点元数据
   */
  get(typeId: string): NodeMeta | undefined {
    return this.metas.get(typeId)
  }

  /**
   * 获取所有节点元数据
   */
  getAll(): Map<string, NodeMeta> {
    return this.metas
  }

  /**
   * 按分类获取节点
   */
  getByCategory(category: string): NodeMeta[] {
    return Array.from(this.metas.values()).filter((m) => m.category === category)
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set<string>()
    for (const meta of this.metas.values()) {
      categories.add(meta.category)
    }
    return Array.from(categories)
  }

  /**
   * 检查是否已注册
   */
  has(typeId: string): boolean {
    return this.metas.has(typeId)
  }

  /**
   * 生成默认元数据（用于未注册的节点）
   */
  generateDefault(typeId: string): NodeMeta {
    const parts = typeId.split('.')
    const category = parts.length > 1 ? parts[0]! : 'other'

    return {
      typeId,
      i18nKey: `nodes.${typeId.replace(/\./g, '_')}`,
      category,
      categoryI18nKey: `nodeCategories.${category}`,
    }
  }

  /**
   * 获取或生成元数据
   */
  getOrDefault(typeId: string): NodeMeta {
    return this.get(typeId) ?? this.generateDefault(typeId)
  }
}

/**
 * 全局节点元数据注册表
 */
export const NodeMetaRegistry = new NodeMetaRegistryClass()

/**
 * Mod 元数据注册表
 */
class ModMetaRegistryClass {
  private metas = new Map<string, ModMeta>()

  register(meta: ModMeta): void {
    this.metas.set(meta.id, meta)
  }

  get(id: string): ModMeta | undefined {
    return this.metas.get(id)
  }

  getAll(): Map<string, ModMeta> {
    return this.metas
  }
}

export const ModMetaRegistry = new ModMetaRegistryClass()
