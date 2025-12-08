import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import {
  ObjectAccessNodePorts,
  ObjectSetNodePorts,
  ArrayAccessNodePorts,
  ArrayPushNodePorts,
  ArrayLengthNodePorts,
} from './PortNames'

/** ObjectAccessNode 入 Port 类型 */
interface ObjectAccessInput {
  [ObjectAccessNodePorts.IN.OBJECT]: Record<string, unknown>
  [ObjectAccessNodePorts.IN.KEY]: string
}

/** ObjectAccessNode 出 Port 类型 */
interface ObjectAccessOutput {
  [ObjectAccessNodePorts.OUT.VALUE]: unknown
}

/**
 * ObjectAccessNode - 对象访问节点
 * 访问对象的属性
 *
 * 入 Port: object (object), key (string)
 * 出 Port: value (any)
 */
export class ObjectAccessNode extends WebNode<ObjectAccessInput, ObjectAccessOutput> {
  static typeId: string = 'core.ObjectAccessNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ObjectAccess')

    // 入 Port
    this.addInPort(ObjectAccessNodePorts.IN.OBJECT, DataType.OBJECT)
    this.addInPort(ObjectAccessNodePorts.IN.KEY, DataType.STRING)

    // 出 Port
    this.addOutPort(ObjectAccessNodePorts.OUT.VALUE, DataType.STRING)
  }

  /**
   * 设置输出类型
   */
  setOutputType(dataType: DataType): void {
    this.outPorts.delete(ObjectAccessNodePorts.OUT.VALUE)
    this.addOutPort(ObjectAccessNodePorts.OUT.VALUE, dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: ObjectAccessInput,
  ): Promise<ObjectAccessOutput> {
    const obj = inData[ObjectAccessNodePorts.IN.OBJECT]
    const key = inData[ObjectAccessNodePorts.IN.KEY]

    if (obj && typeof obj === 'object') {
      return { [ObjectAccessNodePorts.OUT.VALUE]: obj[key] }
    }

    return { [ObjectAccessNodePorts.OUT.VALUE]: undefined }
  }
}

/** ObjectSetNode 入 Port 类型 */
interface ObjectSetInput {
  [ObjectSetNodePorts.IN.OBJECT]: Record<string, unknown>
  [ObjectSetNodePorts.IN.KEY]: string
  [ObjectSetNodePorts.IN.VALUE]: unknown
}

/** ObjectSetNode 出 Port 类型 */
interface ObjectSetOutput {
  [ObjectSetNodePorts.OUT.OBJECT]: Record<string, unknown>
}

/**
 * ObjectSetNode - 对象设置节点
 * 设置对象的属性
 *
 * 入 Port: object (object), key (string), value (any)
 * 出 Port: object (object)
 */
export class ObjectSetNode extends WebNode<ObjectSetInput, ObjectSetOutput> {
  static typeId: string = 'core.ObjectSetNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ObjectSet')

    // 入 Port
    this.addInPort(ObjectSetNodePorts.IN.OBJECT, DataType.OBJECT)
    this.addInPort(ObjectSetNodePorts.IN.KEY, DataType.STRING)
    this.addInPort(ObjectSetNodePorts.IN.VALUE, DataType.STRING)

    // 出 Port
    this.addOutPort(ObjectSetNodePorts.OUT.OBJECT, DataType.OBJECT)
  }

  /**
   * 设置值类型
   */
  setValueType(dataType: DataType): void {
    this.inPorts.delete(ObjectSetNodePorts.IN.VALUE)
    this.addInPort(ObjectSetNodePorts.IN.VALUE, dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: ObjectSetInput,
  ): Promise<ObjectSetOutput> {
    const obj = inData[ObjectSetNodePorts.IN.OBJECT] || {}
    const key = inData[ObjectSetNodePorts.IN.KEY]
    const value = inData[ObjectSetNodePorts.IN.VALUE]

    // 创建新对象（不变性）
    const newObj = { ...obj, [key]: value }

    return { [ObjectSetNodePorts.OUT.OBJECT]: newObj }
  }
}

/** ArrayAccessNode 入 Port 类型 */
interface ArrayAccessInput {
  [ArrayAccessNodePorts.IN.ARRAY]: unknown[]
  [ArrayAccessNodePorts.IN.INDEX]: number
}

/** ArrayAccessNode 出 Port 类型 */
interface ArrayAccessOutput {
  [ArrayAccessNodePorts.OUT.VALUE]: unknown
}

/**
 * ArrayAccessNode - 数组访问节点
 * 访问数组的元素
 *
 * 入 Port: array (array), index (integer)
 * 出 Port: value (any)
 */
export class ArrayAccessNode extends WebNode<ArrayAccessInput, ArrayAccessOutput> {
  static typeId: string = 'core.ArrayAccessNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ArrayAccess')

    // 入 Port
    this.addInPort(ArrayAccessNodePorts.IN.ARRAY, DataType.ARRAY)
    this.addInPort(ArrayAccessNodePorts.IN.INDEX, DataType.INTEGER)

    // 出 Port
    this.addOutPort(ArrayAccessNodePorts.OUT.VALUE, DataType.STRING)
  }

  /**
   * 设置输出类型
   */
  setOutputType(dataType: DataType): void {
    this.outPorts.delete(ArrayAccessNodePorts.OUT.VALUE)
    this.addOutPort(ArrayAccessNodePorts.OUT.VALUE, dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: ArrayAccessInput,
  ): Promise<ArrayAccessOutput> {
    const arr = inData[ArrayAccessNodePorts.IN.ARRAY]
    const index = inData[ArrayAccessNodePorts.IN.INDEX]

    if (Array.isArray(arr) && index >= 0 && index < arr.length) {
      return { [ArrayAccessNodePorts.OUT.VALUE]: arr[index] }
    }

    return { [ArrayAccessNodePorts.OUT.VALUE]: undefined }
  }
}

/** ArrayPushNode 入 Port 类型 */
interface ArrayPushInput {
  [ArrayPushNodePorts.IN.ARRAY]: unknown[]
  [ArrayPushNodePorts.IN.VALUE]: unknown
}

/** ArrayPushNode 出 Port 类型 */
interface ArrayPushOutput {
  [ArrayPushNodePorts.OUT.ARRAY]: unknown[]
}

/**
 * ArrayPushNode - 数组添加节点
 * 向数组末尾添加元素
 *
 * 入 Port: array (array), value (any)
 * 出 Port: array (array)
 */
export class ArrayPushNode extends WebNode<ArrayPushInput, ArrayPushOutput> {
  static typeId: string = 'core.ArrayPushNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ArrayPush')

    // 入 Port
    this.addInPort(ArrayPushNodePorts.IN.ARRAY, DataType.ARRAY)
    this.addInPort(ArrayPushNodePorts.IN.VALUE, DataType.STRING)

    // 出 Port
    this.addOutPort(ArrayPushNodePorts.OUT.ARRAY, DataType.ARRAY)
  }

  /**
   * 设置值类型
   */
  setValueType(dataType: DataType): void {
    this.inPorts.delete(ArrayPushNodePorts.IN.VALUE)
    this.addInPort(ArrayPushNodePorts.IN.VALUE, dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: ArrayPushInput,
  ): Promise<ArrayPushOutput> {
    const arr = inData[ArrayPushNodePorts.IN.ARRAY] || []
    const value = inData[ArrayPushNodePorts.IN.VALUE]

    // 创建新数组（不变性）
    const newArr = [...arr, value]

    return { [ArrayPushNodePorts.OUT.ARRAY]: newArr }
  }
}

/** ArrayLengthNode 入 Port 类型 */
interface ArrayLengthInput {
  [ArrayLengthNodePorts.IN.ARRAY]: unknown[]
}

/** ArrayLengthNode 出 Port 类型 */
interface ArrayLengthOutput {
  [ArrayLengthNodePorts.OUT.LENGTH]: number
}

/**
 * ArrayLengthNode - 数组长度节点
 * 获取数组长度
 *
 * 入 Port: array (array)
 * 出 Port: length (integer)
 */
export class ArrayLengthNode extends WebNode<ArrayLengthInput, ArrayLengthOutput> {
  static typeId: string = 'core.ArrayLengthNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ArrayLength')

    // 入 Port
    this.addInPort(ArrayLengthNodePorts.IN.ARRAY, DataType.ARRAY)

    // 出 Port
    this.addOutPort(ArrayLengthNodePorts.OUT.LENGTH, DataType.INTEGER)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: ArrayLengthInput,
  ): Promise<ArrayLengthOutput> {
    const arr = inData[ArrayLengthNodePorts.IN.ARRAY]

    if (Array.isArray(arr)) {
      return { [ArrayLengthNodePorts.OUT.LENGTH]: arr.length }
    }

    return { [ArrayLengthNodePorts.OUT.LENGTH]: 0 }
  }
}
