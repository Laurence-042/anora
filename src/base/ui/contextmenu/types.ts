/**
 * Context Menu Types
 * 可扩展的右键菜单系统类型定义
 */

/**
 * 菜单触发目标类型
 */
export enum ContextMenuTarget {
  /** 空白处 */
  PANE = 'pane',
  /** 节点 */
  NODE = 'node',
  /** 边 */
  EDGE = 'edge',
}

/**
 * 菜单项定义
 */
export interface ContextMenuItem {
  /** 唯一标识（用于覆盖/移除） */
  id: string

  /** 菜单项标签（支持 i18n key） */
  label: string

  /** 图标（emoji 或图标类名） */
  icon?: string

  /** 快捷键提示文本 */
  shortcut?: string

  /** 是否禁用 */
  disabled?: boolean | ((context: ContextMenuContext) => boolean)

  /** 是否可见 */
  visible?: boolean | ((context: ContextMenuContext) => boolean)

  /** 分隔线（放在此项之后） */
  divided?: boolean

  /** 点击回调 */
  onClick?: (context: ContextMenuContext) => void

  /** 子菜单 */
  children?: ContextMenuItem[]

  /** 排序优先级（数字越小越靠前） */
  priority?: number
}

/**
 * 右键菜单上下文
 * 包含触发菜单时的相关信息
 */
export interface ContextMenuContext {
  /** 触发目标类型 */
  target: ContextMenuTarget

  /** 鼠标位置（屏幕坐标） */
  mousePosition: { x: number; y: number }

  /** 画布坐标（用于粘贴等操作） */
  canvasPosition?: { x: number; y: number }

  /** 目标节点 ID（当 target 为 NODE 时） */
  nodeId?: string

  /** 目标边 ID（当 target 为 EDGE 时，格式: fromPortId->toPortId） */
  edgeId?: string

  /** 选中的节点 ID 集合 */
  selectedNodeIds: Set<string>

  /** 选中的边 ID 集合 */
  selectedEdges: Set<string>

  /** Graph Store 引用（用于执行操作） */
  graphStore: ReturnType<typeof import('@/stores/graph').useGraphStore>

  /** EditHistory 引用（用于撤销/重做） */
  editHistory?: import('@/base/ui/history').EditHistory

  /** Clipboard 引用（用于复制/粘贴） */
  clipboard?: import('@/base/ui/clipboard').Clipboard
}

/**
 * 菜单项注册选项
 */
export interface ContextMenuItemRegistration {
  /** 目标类型 */
  target: ContextMenuTarget | ContextMenuTarget[]

  /** 菜单项定义 */
  item: ContextMenuItem
}

/**
 * 菜单项组（用于批量注册）
 */
export interface ContextMenuGroup {
  /** 组 ID（用于管理） */
  groupId: string

  /** 菜单项列表 */
  items: ContextMenuItemRegistration[]
}
