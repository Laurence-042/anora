/**
 * ANORA 核心类型定义
 */

// ==================== 数据类型 ====================

/**
 * Port 支持的数据类型枚举
 * 对标 OpenAPI 3.0，但有适应性修改
 */
export enum DataType {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  NULL = 'null',
}

/**
 * 实际运行时的数据类型
 */
export type RealDataType = string | number | boolean | object | Array<unknown> | null

// ==================== 执行状态 ====================

/**
 * 节点激活就绪状态
 */
export enum ActivationReadyStatus {
  /** 需要 Executor 下一轮迭代再次询问 */
  NotReady = 'NOT_READY',
  /** 至少一个入 Port 被新写入数据后再询问 */
  NotReadyUntilAnyPortsFilled = 'NOT_READY_UNTIL_ANY_PORTS_FILLED',
  /** 至少一个入 Port 被写入，且所有有入边的入 Port 都被填写后再询问 */
  NotReadyUntilAllPortsFilled = 'NOT_READY_UNTIL_ALL_PORTS_FILLED',
  /** 已准备好，Executor 下一轮迭代中可执行 */
  Ready = 'READY',
}

/**
 * 节点执行状态
 */
export enum NodeExecutionStatus {
  IDLE = 'idle',
  EXECUTING = 'executing',
  SUCCESS = 'success',
  FAILED = 'failed',
}

// ==================== 抽象接口（用于 Registry，避免循环依赖） ====================

/**
 * 节点抽象接口
 * Registry 依赖此接口而非具体的 BaseNode 类
 */
export interface INode {
  readonly id: string
  label: string
  readonly typeId: string
  executionStatus: NodeExecutionStatus
  readonly inPorts: Map<string, IPort>
  readonly outPorts: Map<string, IPort>
}

/**
 * Port 抽象接口
 * Registry 依赖此接口而非具体的 BasePort 类
 */
export interface IPort {
  readonly id: string
  readonly dataType: DataType
  readonly data: RealDataType
  readonly hasData: boolean
  parentNode: INode
}

/**
 * 执行器抽象接口
 * Registry 依赖此接口而非具体的 BasicExecutor 类
 */
export interface IExecutor {
  readonly executorState: string // 使用 string 避免循环依赖
}

/**
 * 节点构造函数类型
 */
export type INodeConstructor = (new (id?: string, label?: string) => INode) & {
  typeId: string
}

/**
 * Port 构造函数类型
 */
export type IPortConstructor = new (parentNode: INode, ...args: unknown[]) => IPort

/**
 * 执行器构造函数类型
 */
export type IExecutorConstructor = new (...args: unknown[]) => IExecutor

// ==================== Context ====================

/**
 * 执行器上下文类型
 * 用于在执行过程中传递全局状态给节点
 */
export type ExecutorContext = {
  /** 后端 IPC 类型标识 */
  ipcTypeId: string
  /** 迭代间延迟（毫秒，用于调试） */
  iterationDelay?: number
  /** 其他的可能由节点访问的属性 */
  [key: string]: unknown
}

/**
 * 默认执行器上下文
 */
export const DEFAULT_EXECUTOR_CONTEXT: ExecutorContext = {
  ipcTypeId: 'postMessage',
  iterationDelay: 0,
}

// ==================== 序列化 ====================

/**
 * Port 序列化格式
 */
export interface SerializedPort {
  id: string
  dataType: DataType
  data: RealDataType
  keyInParent?: string | number
  children?: SerializedPort[]
}

/**
 * Node 序列化格式
 */
export interface SerializedNode {
  id: string
  typeId: string
  label: string
  context: unknown
  position: { x: number; y: number }
  inExecPort: SerializedPort
  outExecPort: SerializedPort
  inControlPorts: Record<string, SerializedPort>
  outControlPorts: Record<string, SerializedPort>
  inPorts: Record<string, SerializedPort>
  outPorts: Record<string, SerializedPort>
}

/**
 * Edge 序列化格式
 */
export interface SerializedEdge {
  fromPortId: string
  toPortId: string
}

/**
 * Graph 序列化格式
 */
export interface SerializedGraph {
  schemaVersion: number
  nodes: SerializedNode[]
  edges: SerializedEdge[]
}

// ==================== IPC ====================

/**
 * IPC 消息类型
 */
export type IPCMessageType =
  | 'execute'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'snapshot'
  | 'loadSnapshot'
  | 'getState'

/**
 * IPC 消息接口
 */
export interface IPCMessage {
  type: IPCMessageType
  payload?: unknown
}

// ==================== 定义类型 ====================

/**
 * 定义类型枚举（用于注册机制）
 */
export enum DefType {
  NODE = 'NODE',
  PORT = 'PORT',
  EXECUTOR = 'EXECUTOR',
}

// ==================== 类型转换 ====================

/**
 * 类型转换结果
 */
export interface ConversionResult<T = RealDataType> {
  success: boolean
  value: T | null
  error?: string
}

/**
 * 类型兼容性矩阵
 * 行: 输入类型, 列: 目标 Port 类型
 * true: 可转换, false: 不兼容
 */
export const TYPE_COMPATIBILITY_MATRIX: Record<DataType, Record<DataType, boolean>> = {
  [DataType.STRING]: {
    [DataType.STRING]: true,
    [DataType.NUMBER]: true,
    [DataType.INTEGER]: true,
    [DataType.BOOLEAN]: true,
    [DataType.ARRAY]: true,
    [DataType.OBJECT]: false,
    [DataType.NULL]: true,
  },
  [DataType.NUMBER]: {
    [DataType.STRING]: true,
    [DataType.NUMBER]: true,
    [DataType.INTEGER]: true,
    [DataType.BOOLEAN]: true,
    [DataType.ARRAY]: false,
    [DataType.OBJECT]: false,
    [DataType.NULL]: true,
  },
  [DataType.INTEGER]: {
    [DataType.STRING]: true,
    [DataType.NUMBER]: true,
    [DataType.INTEGER]: true,
    [DataType.BOOLEAN]: true,
    [DataType.ARRAY]: false,
    [DataType.OBJECT]: false,
    [DataType.NULL]: true,
  },
  [DataType.BOOLEAN]: {
    [DataType.STRING]: true,
    [DataType.NUMBER]: true,
    [DataType.INTEGER]: true,
    [DataType.BOOLEAN]: true,
    [DataType.ARRAY]: false,
    [DataType.OBJECT]: false,
    [DataType.NULL]: true,
  },
  [DataType.ARRAY]: {
    [DataType.STRING]: true,
    [DataType.NUMBER]: false,
    [DataType.INTEGER]: false,
    [DataType.BOOLEAN]: false,
    [DataType.ARRAY]: true,
    [DataType.OBJECT]: false,
    [DataType.NULL]: true,
  },
  [DataType.OBJECT]: {
    [DataType.STRING]: true,
    [DataType.NUMBER]: false,
    [DataType.INTEGER]: false,
    [DataType.BOOLEAN]: false,
    [DataType.ARRAY]: false,
    [DataType.OBJECT]: true,
    [DataType.NULL]: true,
  },
  [DataType.NULL]: {
    [DataType.STRING]: true,
    [DataType.NUMBER]: true,
    [DataType.INTEGER]: true,
    [DataType.BOOLEAN]: true,
    [DataType.ARRAY]: true,
    [DataType.OBJECT]: true,
    [DataType.NULL]: true,
  },
}

/**
 * 检查两个 Port 类型是否兼容（可以建立连接）
 */
export function areTypesCompatible(sourceType: DataType, targetType: DataType): boolean {
  // null 类型可以接受任何类型
  if (targetType === DataType.NULL) return true

  // 任何类型都可以输出到 null 类型
  if (sourceType === DataType.NULL) return true

  // 查询兼容性矩阵
  return TYPE_COMPATIBILITY_MATRIX[sourceType]?.[targetType] ?? false
}
