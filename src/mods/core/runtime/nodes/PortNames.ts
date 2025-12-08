/**
 * Port 名称常量定义
 *
 * 使用常量而非硬编码字符串，便于：
 * 1. 统一管理 Port 名称
 * 2. 避免拼写错误
 * 3. 方便后续重构和重命名
 * 4. 支持继承关系（子类复用父类的 Port 名称）
 */

// ==================== 通用 Port 名称 ====================

/**
 * 通用数据 Port 名称
 * 用于单输入单输出的简单节点
 */
export const CommonPorts = {
  /** 通用值 Port（ForwardNode, ParameterNode 等） */
  VALUE: 'value',
  /** 通用结果 Port */
  RESULT: 'result',
  /** 左操作数 */
  LEFT: 'left',
  /** 右操作数 */
  RIGHT: 'right',
} as const

// ==================== 数组相关 Port 名称 ====================

/**
 * 数组操作相关 Port 名称
 */
export const ArrayPorts = {
  /** 数组 Port */
  ARRAY: 'array',
  /** 数组元素 Port */
  ITEM: 'item',
  /** 数组索引 Port */
  INDEX: 'index',
  /** 数组长度 Port */
  LENGTH: 'length',
} as const

// ==================== 对象相关 Port 名称 ====================

/**
 * 对象操作相关 Port 名称
 */
export const ObjectPorts = {
  /** 对象 Port */
  OBJECT: 'object',
  /** 键 Port */
  KEY: 'key',
  /** 值 Port（复用 CommonPorts.VALUE） */
  VALUE: CommonPorts.VALUE,
} as const

// ==================== 控制流相关 Port 名称 ====================

/**
 * 控制流相关 Port 名称
 */
export const ControlPorts = {
  /** 条件 Port */
  CONDITION: 'condition',
  /** 为真时触发 */
  ON_TRUE: 'onTrue',
  /** 为假时触发 */
  ON_FALSE: 'onFalse',
  /** 完成时触发 */
  DONE: 'done',
  /** 聚集触发 */
  AGGREGATE: 'aggregate',
} as const

// ==================== 字符串相关 Port 名称 ====================

/**
 * 字符串操作相关 Port 名称
 */
export const StringPorts = {
  /** 消息 Port */
  MESSAGE: 'message',
  /** 参数对象 Port */
  ARGS: 'args',
  /** 结果 Port（复用 CommonPorts.RESULT） */
  RESULT: CommonPorts.RESULT,
} as const

// ==================== 节点特定 Port 名称 ====================

/**
 * ForwardNode Port 名称
 */
export const ForwardNodePorts = {
  IN: { VALUE: CommonPorts.VALUE },
  OUT: { VALUE: CommonPorts.VALUE },
} as const

/**
 * ParameterNode Port 名称
 */
export const ParameterNodePorts = {
  OUT: { VALUE: CommonPorts.VALUE },
} as const

/**
 * ArithmeticNode Port 名称
 */
export const ArithmeticNodePorts = {
  IN: { LEFT: CommonPorts.LEFT, RIGHT: CommonPorts.RIGHT },
  OUT: { RESULT: CommonPorts.RESULT },
} as const

/**
 * LogicNode Port 名称
 */
export const LogicNodePorts = {
  IN: { LEFT: CommonPorts.LEFT, RIGHT: CommonPorts.RIGHT },
  OUT: { RESULT: CommonPorts.RESULT },
} as const

/**
 * CompareNode Port 名称
 */
export const CompareNodePorts = {
  IN: { LEFT: CommonPorts.LEFT, RIGHT: CommonPorts.RIGHT },
  OUT: { RESULT: CommonPorts.RESULT },
} as const

/**
 * BranchNode Port 名称
 */
export const BranchNodePorts = {
  IN: { CONDITION: ControlPorts.CONDITION },
  OUT_CONTROL: { ON_TRUE: ControlPorts.ON_TRUE, ON_FALSE: ControlPorts.ON_FALSE },
} as const

/**
 * DistributeNode Port 名称
 */
export const DistributeNodePorts = {
  IN: { ARRAY: ArrayPorts.ARRAY },
  OUT: { ITEM: ArrayPorts.ITEM, INDEX: ArrayPorts.INDEX },
  OUT_CONTROL: { DONE: ControlPorts.DONE },
} as const

/**
 * AggregateNode Port 名称
 */
export const AggregateNodePorts = {
  IN: { ITEM: ArrayPorts.ITEM },
  IN_CONTROL: { AGGREGATE: ControlPorts.AGGREGATE },
  OUT: { ARRAY: ArrayPorts.ARRAY },
} as const

/**
 * ConsoleLogNode Port 名称
 */
export const ConsoleLogNodePorts = {
  IN: { MESSAGE: StringPorts.MESSAGE },
} as const

/**
 * StringFormatNode Port 名称
 */
export const StringFormatNodePorts = {
  IN: { ARGS: StringPorts.ARGS },
  OUT: { RESULT: StringPorts.RESULT },
} as const

/**
 * ObjectAccessNode Port 名称
 */
export const ObjectAccessNodePorts = {
  IN: { OBJECT: ObjectPorts.OBJECT, KEY: ObjectPorts.KEY },
  OUT: { VALUE: ObjectPorts.VALUE },
} as const

/**
 * ObjectSetNode Port 名称
 */
export const ObjectSetNodePorts = {
  IN: { OBJECT: ObjectPorts.OBJECT, KEY: ObjectPorts.KEY, VALUE: ObjectPorts.VALUE },
  OUT: { OBJECT: ObjectPorts.OBJECT },
} as const

/**
 * ArrayAccessNode Port 名称
 */
export const ArrayAccessNodePorts = {
  IN: { ARRAY: ArrayPorts.ARRAY, INDEX: ArrayPorts.INDEX },
  OUT: { VALUE: CommonPorts.VALUE },
} as const

/**
 * ArrayPushNode Port 名称
 */
export const ArrayPushNodePorts = {
  IN: { ARRAY: ArrayPorts.ARRAY, VALUE: CommonPorts.VALUE },
  OUT: { ARRAY: ArrayPorts.ARRAY },
} as const

/**
 * ArrayLengthNode Port 名称
 */
export const ArrayLengthNodePorts = {
  IN: { ARRAY: ArrayPorts.ARRAY },
  OUT: { LENGTH: ArrayPorts.LENGTH },
} as const
