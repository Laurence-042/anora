import { v4 as uuidv4 } from 'uuid'
import { DataType, ActivationReadyStatus, NodeExecutionStatus } from '../types'
import type { ExecutorContext, SerializedNode, RealDataType } from '../types'
import { BasePort, NullPort, createPort } from '../ports'

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
 * 节点基类
 * 节点本质上是函数的抽象
 *
 * @template TInput 入 Port 数据类型，键为 Port 名称
 * @template TOutput 出 Port 数据类型，键为 Port 名称
 * @template TControl 控制 Port 数据类型，键为 Port 名称
 */
export abstract class BaseNode<TInput = NodeInput, TOutput = NodeOutput, TControl = NodeControl> {
  /** 节点类型标识（子类需要覆盖） */
  static typeId: string = 'BaseNode'

  /** 子类列表（用于注册机制） */
  static subclasses: (typeof BaseNode)[] = []

  /** UUID */
  readonly id: string

  /** 节点标签/名称 */
  label: string

  /** 执行 Port：用于不需要传递数据但需要顺序执行的情况，数据类型是 null */
  readonly inExecPort: BasePort
  readonly outExecPort: BasePort

  /** 控制 Port：用于特定情况下的额外流程控制 */
  readonly inControlPorts: Map<string, BasePort> = new Map()
  readonly outControlPorts: Map<string, BasePort> = new Map()

  /** 数据 Port：相当于入/出参 */
  readonly inPorts: Map<string, BasePort> = new Map()
  readonly outPorts: Map<string, BasePort> = new Map()

  /** 上下文：便于节点在多次工作中实现差异行为，也可用于静态配置 */
  context: unknown = null

  /** 节点执行状态 */
  executionStatus: NodeExecutionStatus = NodeExecutionStatus.IDLE

  /** 最后一次执行的错误信息 */
  lastError?: string

  constructor(id?: string, label?: string) {
    this.id = id ?? uuidv4()
    this.label = label ?? this.constructor.name

    // 创建执行 Port
    this.inExecPort = new NullPort(this)
    this.outExecPort = new NullPort(this)
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
   * 添加入 Port
   */
  protected addInPort(name: string, dataType: DataType): BasePort {
    const port = createPort(dataType, this)
    this.inPorts.set(name, port)
    return port
  }

  /**
   * 添加出 Port
   */
  protected addOutPort(name: string, dataType: DataType): BasePort {
    const port = createPort(dataType, this)
    this.outPorts.set(name, port)
    return port
  }

  /**
   * 添加入控制 Port
   */
  protected addInControlPort(name: string, dataType: DataType = DataType.NULL): BasePort {
    const port = createPort(dataType, this)
    this.inControlPorts.set(name, port)
    return port
  }

  /**
   * 添加出控制 Port
   */
  protected addOutControlPort(name: string, dataType: DataType = DataType.NULL): BasePort {
    const port = createPort(dataType, this)
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
   * 检查入 Port 是否都被填入数据
   * @param connectedPorts Executor 传入的已连接 Port ID 集合
   */
  protected areConnectedInPortsFilled(connectedPorts: Set<string>): boolean {
    // 检查 inExecPort
    if (connectedPorts.has(this.inExecPort.id) && !this.inExecPort.hasData) {
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
   * 检查是否有任何入 Port 被连接
   * @param connectedPorts Executor 传入的已连接 Port ID 集合
   */
  protected hasAnyConnectedInPort(connectedPorts: Set<string>): boolean {
    if (connectedPorts.has(this.inExecPort.id)) {
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
   * 表示节点是否可以激活并运行
   * Executor 会在 activate 节点后询问其是否还可以运行，可实现"一次激活，多次输出"
   * 基类实现：所有"被连接的" inExecPort 和 inPorts 都被填入数据才会 READY
   * 如果没有任何 inExecPort 和 inPorts 被连接也算 READY
   * 其他时候都是 NOT_READY_UNTIL_ALL_PORTS_FILLED
   * @param connectedPorts Executor 传入的当前被连接的 Ports 的 ID 集合
   */
  isReadyToActivate(connectedPorts: Set<string>): ActivationReadyStatus {
    // 如果没有任何入 Port 被连接，直接 READY
    if (!this.hasAnyConnectedInPort(connectedPorts)) {
      return ActivationReadyStatus.Ready
    }

    // 检查所有被连接的入 Port 是否都有数据
    if (this.areConnectedInPortsFilled(connectedPorts)) {
      return ActivationReadyStatus.Ready
    }

    return ActivationReadyStatus.NotReadyUntilAllPortsFilled
  }

  /**
   * 检查激活就绪状态（由 Executor 调用）
   * 子类可以覆盖此方法实现特殊行为
   * @param connectedPorts Executor 传入的当前被连接的 Ports 的 ID 集合
   */
  checkActivationReady(connectedPorts: Set<string>): ActivationReadyStatus {
    return this.isReadyToActivate(connectedPorts)
  }

  /**
   * 节点激活逻辑
   * 流程: 从入 Port 读取并清空数据 - 调用 activateCore - 把结果填到出 Port
   */
  async activate(executorContext: ExecutorContext): Promise<void> {
    this.executionStatus = NodeExecutionStatus.EXECUTING
    this.lastError = undefined

    try {
      // 收集入 Port 数据
      const inData: Record<string, unknown> = {}
      for (const [name, port] of this.inPorts) {
        inData[name] = port.read()
      }

      // 读取 inExecPort（清空数据）
      this.inExecPort.read()

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

      // 激活 outExecPort
      this.outExecPort.write(null)

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
    this.inExecPort.clear()
    for (const [, port] of this.inPorts) {
      port.clear()
    }
  }

  /**
   * 获取所有 Port（用于 Graph 查询）
   */
  getAllPorts(): BasePort[] {
    return [
      this.inExecPort,
      this.outExecPort,
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
   * 获取所有入 Port（包括 inEx和 inControlPorts）
   */
  getInputPorts(): BasePort[] {
    return [this.inExecPort, ...this.inControlPorts.values(), ...this.inPorts.values()]
  }

  /**
   * 获取所有出 Port（包括 outExecPort 和 outControlPorts）
   */
  getOutputPorts(): BasePort[] {
    return [this.outExecPort, ...this.outControlPorts.values(), ...this.outPorts.values()]
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
      inExecPort: this.inExecPort.serialize(),
      outExecPort: this.outExecPort.serialize(),
      inControlPorts: serializePorts(this.inControlPorts) as Record<string, never>,
      outControlPorts: serializePorts(this.outControlPorts) as Record<string, never>,
      inPorts: serializePorts(this.inPorts) as Record<string, never>,
      outPorts: serializePorts(this.outPorts) as Record<string, never>,
    }
  }
}
