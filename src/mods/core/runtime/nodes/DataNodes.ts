import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'

/**
 * ObjectAccessNode - 对象访问节点
 * 访问对象的属性
 *
 * 入 Port: object (object), key (string)
 * 出 Port: value (any)
 */
export class ObjectAccessNode extends WebNode {
  static typeId: string = 'core.ObjectAccessNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ObjectAccess')

    // 入 Port
    this.addInPort('object', DataType.OBJECT)
    this.addInPort('key', DataType.STRING)

    // 出 Port
    this.addOutPort('value', DataType.STRING)
  }

  /**
   * 设置输出类型
   */
  setOutputType(dataType: DataType): void {
    this.outPorts.delete('value')
    this.addOutPort('value', dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const obj = inData.object as Record<string, unknown>
    const key = String(inData.key)

    if (obj && typeof obj === 'object') {
      return { value: obj[key] }
    }

    return { value: undefined }
  }
}

/**
 * ObjectSetNode - 对象设置节点
 * 设置对象的属性
 *
 * 入 Port: object (object), key (string), value (any)
 * 出 Port: object (object)
 */
export class ObjectSetNode extends WebNode {
  static typeId: string = 'core.ObjectSetNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ObjectSet')

    // 入 Port
    this.addInPort('object', DataType.OBJECT)
    this.addInPort('key', DataType.STRING)
    this.addInPort('value', DataType.STRING)

    // 出 Port
    this.addOutPort('object', DataType.OBJECT)
  }

  /**
   * 设置值类型
   */
  setValueType(dataType: DataType): void {
    this.inPorts.delete('value')
    this.addInPort('value', dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const obj = (inData.object as Record<string, unknown>) || {}
    const key = String(inData.key)
    const value = inData.value

    // 创建新对象（不变性）
    const newObj = { ...obj, [key]: value }

    return { object: newObj }
  }
}

/**
 * ArrayAccessNode - 数组访问节点
 * 访问数组的元素
 *
 * 入 Port: array (array), index (integer)
 * 出 Port: value (any)
 */
export class ArrayAccessNode extends WebNode {
  static typeId: string = 'core.ArrayAccessNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ArrayAccess')

    // 入 Port
    this.addInPort('array', DataType.ARRAY)
    this.addInPort('index', DataType.INTEGER)

    // 出 Port
    this.addOutPort('value', DataType.STRING)
  }

  /**
   * 设置输出类型
   */
  setOutputType(dataType: DataType): void {
    this.outPorts.delete('value')
    this.addOutPort('value', dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const arr = inData.array as unknown[]
    const index = Number(inData.index)

    if (Array.isArray(arr) && index >= 0 && index < arr.length) {
      return { value: arr[index] }
    }

    return { value: undefined }
  }
}

/**
 * ArrayPushNode - 数组添加节点
 * 向数组末尾添加元素
 *
 * 入 Port: array (array), value (any)
 * 出 Port: array (array)
 */
export class ArrayPushNode extends WebNode {
  static typeId: string = 'core.ArrayPushNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ArrayPush')

    // 入 Port
    this.addInPort('array', DataType.ARRAY)
    this.addInPort('value', DataType.STRING)

    // 出 Port
    this.addOutPort('array', DataType.ARRAY)
  }

  /**
   * 设置值类型
   */
  setValueType(dataType: DataType): void {
    this.inPorts.delete('value')
    this.addInPort('value', dataType)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const arr = (inData.array as unknown[]) || []
    const value = inData.value

    // 创建新数组（不变性）
    const newArr = [...arr, value]

    return { array: newArr }
  }
}

/**
 * ArrayLengthNode - 数组长度节点
 * 获取数组长度
 *
 * 入 Port: array (array)
 * 出 Port: length (integer)
 */
export class ArrayLengthNode extends WebNode {
  static typeId: string = 'core.ArrayLengthNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ArrayLength')

    // 入 Port
    this.addInPort('array', DataType.ARRAY)

    // 出 Port
    this.addOutPort('length', DataType.INTEGER)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const arr = inData.array as unknown[]

    if (Array.isArray(arr)) {
      return { length: arr.length }
    }

    return { length: 0 }
  }
}
