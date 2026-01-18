import { v4 as uuidv4 } from 'uuid'
import { ActivationReadyStatus, NodeExecutionStatus } from '../types'
import type { ExecutorContext, SerializedNode, SerializedPort, RealDataType } from '../types'
import { BasePort, NullPort } from '../ports'

/**
 * 节点输入数据类型
 */
export type NodeInput = { [key: string]: unknown }

/**
 * 节点输出数据类型
 */
export type NodeOutput = { [key: string]: unknown }

/**
 * 节点控制数据类型
 */
export type NodeControl = { [key: string]: unknown }

/**
 * Context 变更事件
 */
export interface NodeContextChangeEvent {
  nodeId: string
  field: string
  oldValue: unknown
  newValue: unknown
}

/**
 * Context 变更监听器类型
 */
export type NodeContextChangeListener = (event: NodeContextChangeEvent) => void

/**
 * 节点尺寸
 */
export interface NodeSize {
  width: number
  height: number
}

/**
 * 节点静态元数据接口
 * 定义节点的固有属性（图标、分类等）
 */
export interface NodeStaticMeta {
  /** 图标 (emoji 或图标名) */
  icon?: string
  /** 分类 (用于节点面板分组) */
  category?: string
  /** 默认尺寸（宽高），不设置则使用自动尺寸 */
  defaultSize?: NodeSize
}

/**
 * 节点基类
 * 节点本质上是函数的抽象
 *
 * @template TInput 入 Port 数据类型，键为 Port 名称
 * @template TOutput 出 Port 数据类型，键为 Port 名称
 * @template TControl 控制 Port 数据类型，键为 Port 名称
 * @template TContext Context 数据类型，子类可指定具体类型
 */
export abstract class BaseNode<
  TInput = NodeInput,
  TOutput = NodeOutput,
  TControl = NodeControl,
  TContext = unknown,
> {
  /** 节点类型标识（子类需要覆盖） */
  static typeId: string = 'BaseNode'

  /** 节点静态元数据（子类可覆盖） */
  static meta: NodeStaticMeta = {}

  /** 子类列表（用于注册机制） */
  static subclasses: (typeof BaseNode)[] = []

  /** UUID */
  readonly id: string

  /** 节点标签/名称 */
  label: string

  /** 依赖 Port：用于不需要传递数据但需要顺序执行的情况，数据类型是 null，连接后节点必须等待此 Port 被写入才能激活 */
  readonly inDependsOnPort: BasePort
  readonly outDependsOnPort: BasePort

  /** 激活 Port：用于可选的激活触发，不参与首次激活条件判断，主要用于环结构中的反馈激活 */
  readonly inActivateOnPort: BasePort
  readonly outActivateOnPort: BasePort

  /** 控制 Port：用于特定情况下的额外流程控制 */
  readonly inControlPorts: Map<string, BasePort> = new Map()
  readonly outControlPorts: Map<string, BasePort> = new Map()

  /** 数据 Port：相当于入/出参 */
  readonly inPorts: Map<string, BasePort> = new Map()
  readonly outPorts: Map<string, BasePort> = new Map()

  /** 上下文：便于节点在多次工作中实现差异行为，也可用于静态配置 */
  protected _context: TContext | null = null

  /** 节点执行状态 */
  executionStatus: NodeExecutionStatus = NodeExecutionStatus.IDLE

  /** 最后一次执行的错误信息 */
  lastError?: string

  /** 标记是否已执行过（无入边时只执行一次） */
  private _hasActivatedOnce: boolean = false

  /** Context 变更监听器 */
  private _contextChangeListeners: Set<NodeContextChangeListener> = new Set()

  constructor(id?: string, label?: string) {
    this.id = id ?? uuidv4()
    this.label = label ?? this.constructor.name

    // 创建依赖 Port
    this.inDependsOnPort = new NullPort(this)
    this.outDependsOnPort = new NullPort(this)

    // 创建激活 Port
    this.inActivateOnPort = new NullPort(this)
    this.outActivateOnPort = new NullPort(this)
  }

  /**
   * 获取 context
   * 子类可重写此方法以提供类型安全的访问
   */
  get context(): TContext | null {
    return this._context
  }

  /**
   * 设置整个 context
   * 注意：直接设置整个 context 不会触发变更事件
   * 如需触发事件，请使用 setContextField
   * 子类可重写此方法以提供类型安全的赋值
   */
  set context(value: TContext | null) {
    this._context = value
  }

  /**
   * 设置单个 context 字段，触发变更事件
   * @param field 字段名
   * @param value 新值
   */
  setContextField<K extends keyof TContext>(field: K, value: TContext[K]): void {
    const oldContext = this._context as TContext | null
    const oldValue = oldContext?.[field]

    // 值相同则不触发
    if (oldValue === value) return

    // 更新 context
    this._context = {
      ...((this._context as object) ?? {}),
      [field]: value,
    } as TContext

    // 触发变更事件
    this._emitContextChange(field as string, oldValue, value)
  }

  /**
   * 获取单个 context 字段
   */
  getContextField<K extends keyof TContext>(field: K): TContext[K] | undefined {
    return this._context?.[field]
  }

  /**
   * 添加 context 变更监听器
   * @returns 取消监听的函数
   */
  onContextChange(listener: NodeContextChangeListener): () => void {
    this._contextChangeListeners.add(listener)
    return () => this._contextChangeListeners.delete(listener)
  }

  /**
   * 触发 context 变更事件
   */
  protected _emitContextChange(field: string, oldValue: unknown, newValue: unknown): void {
    const event: NodeContextChangeEvent = {
      nodeId: this.id,
      field,
      oldValue,
      newValue,
    }
    for (const listener of this._contextChangeListeners) {
      listener(event)
    }
  }

  /**
   * 获取节点类型标识
   */
  get typeId(): string {
    return (this.constructor as typeof BaseNode).typeId
  }

  /**
   * 注册子类
   */
  static registerSubclass(subclass: typeof BaseNode): void {
    this.subclasses.push(subclass)
  }

  /**
   * 获取所有后代子类
   */
  static getAllDescendants(): (typeof BaseNode)[] {
    return this.subclasses.flatMap((sub) => [sub, ...sub.getAllDescendants()])
  }

  /**
   * 添加入 Port（子类直接传入已创建的 Port 实例）
   */
  protected addInPort(name: string, port: BasePort): BasePort {
    this.inPorts.set(name, port)
    return port
  }

  /**
   * 添加出 Port（子类直接传入已创建的 Port 实例）
   */
  protected addOutPort(name: string, port: BasePort): BasePort {
    this.outPorts.set(name, port)
    return port
  }

  /**
   * 添加入控制 Port（子类直接传入已创建的 Port 实例）
   */
  protected addInControlPort(name: string, port: BasePort): BasePort {
    this.inControlPorts.set(name, port)
    return port
  }

  /**
   * 添加出控制 Port（子类直接传入已创建的 Port 实例）
   */
  protected addOutControlPort(name: string, port: BasePort): BasePort {
    this.outControlPorts.set(name, port)
    return port
  }

  /**
   * 显示 context 配置问题、Port 数据类型无法转换等节点特有的警告信息
   */
  getConfigurationWarnings(): string[] {
    return []
  }

  /**
   * 检查被连接的入 Port 是否都有新数据
   * 如果没有任何入 Port 被连接，返回 true
   * 注意：inActivateOnPort 不参与首次激活条件检查
   * @param connectedPorts Executor 传入的已连接 Port ID 集合
   */
  protected areConnectedInPortsFilledWithNewData(connectedPorts: Set<string>): boolean {
    // 检查 inDependsOnPort
    if (connectedPorts.has(this.inDependsOnPort.id) && !this.inDependsOnPort.hasNewData) {
      return false
    }

    // 检查所有 inPorts
    for (const [, port] of this.inPorts) {
      if (connectedPorts.has(port.id) && !port.hasNewData) {
        return false
      }
    }

    return true
  }

  /**
   * 检查被连接的入 Port 是否都有数据（不管新旧）
   * 用于 activateOn 触发时的检查
   * @param connectedPorts Executor 传入的已连接 Port ID 集合
   */
  protected areConnectedInPortsFilledWithAnyData(connectedPorts: Set<string>): boolean {
    // 检查 inDependsOnPort
    if (connectedPorts.has(this.inDependsOnPort.id) && !this.inDependsOnPort.hasData) {
      return false
    }

    // 检查所有 inPorts
    for (const [, port] of this.inPorts) {
      if (connectedPorts.has(port.id) && !port.hasData) {
        return false
      }
    }

    return true
  }

  /**
   * 检查是否有任何入 Port 被连接（包括 inDependsOnPort 和 inPorts，不包括 inActivateOnPort）
   */
  protected hasAnyInPortConnected(connectedPorts: Set<string>): boolean {
    if (connectedPorts.has(this.inDependsOnPort.id)) {
      return true
    }
    for (const [, port] of this.inPorts) {
      if (connectedPorts.has(port.id)) {
        return true
      }
    }
    return false
  }

  /**
   * 表示节点是否可以激活并运行（由 Executor 调用）
   *
   * 基类逻辑（版本号机制）：
   * - 有入边连接（不含 inActivateOnPort）：所有被连接的入 Port 都有**新数据**时 READY
   * - 无入边连接（不含 inActivateOnPort）：只执行一次
   * - inActivateOnPort 有新数据时：忽略"新数据"检查，只要有数据就 READY
   *
   * "新数据"定义：Port 的 version > lastReadVersion（即 write 后未被 read）
   *
   * 子类可以覆盖此方法实现特殊激活规则
   * @param connectedPorts Executor 传入的当前被连接的 Ports 的 ID 集合
   */
  isReadyToActivate(connectedPorts: Set<string>): ActivationReadyStatus {
    // 检查是否有任何入 Port 被连接（不含 inActivateOnPort）
    const hasNormalConnections = this.hasAnyInPortConnected(connectedPorts)

    // 检查 inActivateOnPort 是否有新数据
    const activateOnTriggered = this.inActivateOnPort.hasNewData

    if (hasNormalConnections) {
      if (activateOnTriggered) {
        // activateOn 触发：忽略"新数据"检查，只要有数据（不管新旧）就 READY
        if (this.areConnectedInPortsFilledWithAnyData(connectedPorts)) {
          return ActivationReadyStatus.Ready
        }
        // 即使 activateOn 触发，如果连入 Port 数据都没有，也无法执行
        return ActivationReadyStatus.NotReadyUntilAllPortsFilled
      }

      // 正常流程：所有被连接的入 Port 都有新数据时才 READY
      if (this.areConnectedInPortsFilledWithNewData(connectedPorts)) {
        return ActivationReadyStatus.Ready
      }
      return ActivationReadyStatus.NotReadyUntilAllPortsFilled
    }

    // 无正常连接的情况：
    // - 如果 inActivateOnPort 有新数据，可以触发再次激活
    // - 否则只执行一次
    if (activateOnTriggered) {
      return ActivationReadyStatus.Ready
    }

    if (this._hasActivatedOnce) {
      return ActivationReadyStatus.NotReady
    }
    return ActivationReadyStatus.Ready
  }

  /**
   * 重置激活状态（由 Executor 在执行开始前调用）
   * 完整重置节点状态，包括：
   * - 激活标志
   * - 执行状态
   * - 所有 Port 的数据
   */
  resetActivationState(): void {
    this._hasActivatedOnce = false
    this.executionStatus = NodeExecutionStatus.IDLE
    this.lastError = undefined

    // 清空所有 Port 数据
    for (const port of this.inPorts.values()) {
      port.clear()
    }
    for (const port of this.outPorts.values()) {
      port.clear()
    }
    for (const port of this.inControlPorts.values()) {
      port.clear()
    }
    for (const port of this.outControlPorts.values()) {
      port.clear()
    }
    this.inDependsOnPort.clear()
    this.outDependsOnPort.clear()
    this.inActivateOnPort.clear()
    this.outActivateOnPort.clear()
  }

  /**
   * 节点激活逻辑
   * 流程: 从入 Port read 数据（标记为已消费但不清空）→ 调用 activateCore → 把结果填到出 Port
   */
  async activate(executorContext: ExecutorContext): Promise<void> {
    this.executionStatus = NodeExecutionStatus.EXECUTING
    this.lastError = undefined
    this._hasActivatedOnce = true

    try {
      // 收集入 Port 数据
      const inData: Record<string, unknown> = {}
      for (const [name, port] of this.inPorts) {
        inData[name] = port.read()
      }

      // 读取 inDependsOnPort 和 inActivateOnPort（清空数据）
      this.inDependsOnPort.read()
      this.inActivateOnPort.read()

      // 读取 inControlPorts
      const controlData: Record<string, unknown> = {}
      for (const [name, port] of this.inControlPorts) {
        controlData[name] = port.peek() // 控制 Port 只 peek 不 read
      }

      // 执行核心逻辑（类型断言：运行时数据会匹配泛型约束）
      const outData = await this.activateCore(
        executorContext,
        inData as TInput,
        controlData as TControl,
      )

      // 填充出 Port
      for (const [name, value] of Object.entries(outData as Record<string, unknown>)) {
        const port = this.outPorts.get(name)
        if (port) {
          const result = port.write(value as RealDataType)
          if (!result.success) {
            throw new Error(`Failed to write to out port "${name}": ${result.error}`)
          }
        }
      }

      // 激活 outDependsOnPort 和 outActivateOnPort
      this.outDependsOnPort.write(null)
      this.outActivateOnPort.write(null)

      this.executionStatus = NodeExecutionStatus.SUCCESS
    } catch (error) {
      this.executionStatus = NodeExecutionStatus.FAILED
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  /**
   * 节点激活核心逻辑（子类需要实现）
   * @param executorContext 执行器上下文
   * @param inData 入 Port 数据，类型由泛型 TInput 约束
   * @param controlData 控制 Port 数据，类型由泛型 TControl 约束
   * @returns 出 Port 数据，类型由泛型 TOutput 约束
   */
  abstract activateCore(
    executorContext: ExecutorContext,
    inData: TInput,
    controlData: TControl,
  ): Promise<TOutput>

  /**
   * 清空所有入 Port
   */
  clearInPorts(): void {
    this.inDependsOnPort.clear()
    this.inActivateOnPort.clear()
    for (const [, port] of this.inPorts) {
      port.clear()
    }
  }

  /**
   * 获取所有 Port（用于 Graph 查询）
   */
  getAllPorts(): BasePort[] {
    return [
      this.inDependsOnPort,
      this.outDependsOnPort,
      this.inActivateOnPort,
      this.outActivateOnPort,
      ...this.inControlPorts.values(),
      ...this.outControlPorts.values(),
      ...this.inPorts.values(),
      ...this.outPorts.values(),
    ]
  }

  /**
   * 获取单个入 Port
   */
  getInPort(name: string): BasePort | undefined {
    return this.inPorts.get(name)
  }

  /**
   * 获取单个出 Port
   */
  getOutPort(name: string): BasePort | undefined {
    return this.outPorts.get(name)
  }

  /**
   * 获取所有入 Port（包括 inDependsOnPort、inActivateOnPort 和 inControlPorts）
   */
  getInputPorts(): BasePort[] {
    return [
      this.inDependsOnPort,
      this.inActivateOnPort,
      ...this.inControlPorts.values(),
      ...this.inPorts.values(),
    ]
  }

  /**
   * 获取所有出 Port（包括 outDependsOnPort、outActivateOnPort 和 outControlPorts）
   */
  getOutputPorts(): BasePort[] {
    return [
      this.outDependsOnPort,
      this.outActivateOnPort,
      ...this.outControlPorts.values(),
      ...this.outPorts.values(),
    ]
  }

  /**
   * 根据 Port ID 查找 Port
   */
  getPortById(portId: string): BasePort | undefined {
    for (const port of this.getAllPorts()) {
      if (port.id === portId) {
        return port
      }
    }
    return undefined
  }

  /**
   * 序列化
   */
  serialize(): SerializedNode {
    const serializePorts = (ports: Map<string, BasePort>): Record<string, unknown> => {
      const result: Record<string, unknown> = {}
      for (const [name, port] of ports) {
        result[name] = port.serialize()
      }
      return result
    }

    return {
      id: this.id,
      typeId: this.typeId,
      label: this.label,
      context: this.context,
      position: { x: 0, y: 0 }, // 位置由 UI 层管理
      inDependsOnPort: this.inDependsOnPort.serialize(),
      outDependsOnPort: this.outDependsOnPort.serialize(),
      inActivateOnPort: this.inActivateOnPort.serialize(),
      outActivateOnPort: this.outActivateOnPort.serialize(),
      inControlPorts: serializePorts(this.inControlPorts) as Record<string, never>,
      outControlPorts: serializePorts(this.outControlPorts) as Record<string, never>,
      inPorts: serializePorts(this.inPorts) as Record<string, never>,
      outPorts: serializePorts(this.outPorts) as Record<string, never>,
    }
  }

  /**
   * 从序列化数据恢复端口 ID
   * @param serialized 序列化的节点数据
   */
  restorePortIds(serialized: SerializedNode): void {
    const restorePortMapIds = (
      portMap: Map<string, BasePort>,
      serializedPorts: Record<string, SerializedPort>,
    ) => {
      for (const [name, port] of portMap) {
        const serializedPort = serializedPorts[name]
        if (serializedPort?.id) {
          port.restoreId(serializedPort.id)
        }
      }
    }

    // 恢复 dependsOn 和 activateOn ports
    if (serialized.inDependsOnPort?.id) {
      this.inDependsOnPort.restoreId(serialized.inDependsOnPort.id)
    }
    if (serialized.outDependsOnPort?.id) {
      this.outDependsOnPort.restoreId(serialized.outDependsOnPort.id)
    }
    if (serialized.inActivateOnPort?.id) {
      this.inActivateOnPort.restoreId(serialized.inActivateOnPort.id)
    }
    if (serialized.outActivateOnPort?.id) {
      this.outActivateOnPort.restoreId(serialized.outActivateOnPort.id)
    }

    // 恢复各类 ports
    if (serialized.inControlPorts) {
      restorePortMapIds(
        this.inControlPorts,
        serialized.inControlPorts as Record<string, SerializedPort>,
      )
    }
    if (serialized.outControlPorts) {
      restorePortMapIds(
        this.outControlPorts,
        serialized.outControlPorts as Record<string, SerializedPort>,
      )
    }
    if (serialized.inPorts) {
      restorePortMapIds(this.inPorts, serialized.inPorts as Record<string, SerializedPort>)
    }
    if (serialized.outPorts) {
      restorePortMapIds(this.outPorts, serialized.outPorts as Record<string, SerializedPort>)
    }
  }
}
