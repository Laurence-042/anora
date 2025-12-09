import { ContainerPort, BasePort, NullPort } from '../../../../base/runtime/ports'
import { DataType } from '../../../../base/runtime/types'
import type { RealDataType, ConversionResult } from '../../../../base/runtime/types'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { StringPort, NumberPort, IntegerPort, BooleanPort } from './PrimitivePorts'

/**
 * 推断值的数据类型（局部实现避免循环依赖）
 */
function inferDataTypeLocal(value: RealDataType): DataType {
  if (value === null) return DataType.NULL
  if (typeof value === 'string') return DataType.STRING
  if (typeof value === 'boolean') return DataType.BOOLEAN
  if (typeof value === 'number') {
    return Number.isInteger(value) ? DataType.INTEGER : DataType.NUMBER
  }
  if (Array.isArray(value)) return DataType.ARRAY
  if (typeof value === 'object') return DataType.OBJECT
  return DataType.NULL
}

/**
 * ArrayPort - 数组类型 Port
 */
@AnoraRegister('core.ArrayPort')
export class ArrayPort extends ContainerPort {
  get dataType(): DataType {
    return DataType.ARRAY
  }

  protected convert(value: RealDataType): ConversionResult<Array<unknown>> {
    if (value === null) {
      return { success: true, value: null }
    }

    const valueType = this.getValueType(value)

    switch (valueType) {
      case DataType.STRING:
        // string -> array: split("")
        return { success: true, value: (value as string).split('') }

      case DataType.ARRAY:
        return this.handleArrayValue(value as Array<unknown>)

      default:
        return {
          success: false,
          value: null,
          error: `Cannot convert ${valueType} to array`,
        }
    }
  }

  /**
   * 创建子 Port（局部实现）
   */
  private createChildPort(value: RealDataType, keyInParent: number): BasePort {
    const dataType = inferDataTypeLocal(value)
    let port: BasePort

    switch (dataType) {
      case DataType.STRING:
        port = new StringPort(this.parentNode, this, keyInParent)
        break
      case DataType.NUMBER:
        port = new NumberPort(this.parentNode, this, keyInParent)
        break
      case DataType.INTEGER:
        port = new IntegerPort(this.parentNode, this, keyInParent)
        break
      case DataType.BOOLEAN:
        port = new BooleanPort(this.parentNode, this, keyInParent)
        break
      case DataType.ARRAY:
        port = new ArrayPort(this.parentNode, this, keyInParent)
        break
      case DataType.OBJECT:
        port = new ObjectPort(this.parentNode, this, keyInParent)
        break
      case DataType.NULL:
      default:
        port = new NullPort(this.parentNode, this, keyInParent)
        break
    }

    port.write(value)
    return port
  }

  /**
   * 处理数组值的写入
   */
  private handleArrayValue(arr: Array<unknown>): ConversionResult<Array<unknown>> {
    const newKeys = new Set<number>()

    // 处理每个元素
    for (let i = 0; i < arr.length; i++) {
      newKeys.add(i)
      const element = arr[i]
      const existingChild = this._children.get(i)

      if (existingChild) {
        // 已存在子 Port
        const result = existingChild.write(element as RealDataType)
        if (!result.success) {
          // 类型不兼容，创建新的 Port
          const newChild = this.createChildPort(element as RealDataType, i)
          this._children.set(i, newChild)
        }
      } else {
        // 创建新的子 Port
        const newChild = this.createChildPort(element as RealDataType, i)
        this._children.set(i, newChild)
      }
    }

    // 处理不再存在的 key
    for (const [key] of this._children) {
      if (!newKeys.has(key as number)) {
        const child = this._children.get(key)!
        child.write(null)
        this._children.delete(key)
      }
    }

    this._data = arr
    return { success: true, value: arr }
  }

  /**
   * 获取数组长度
   */
  get length(): number {
    return this._children.size
  }

  /**
   * 按索引获取子 Port
   */
  getAt(index: number): BasePort | undefined {
    return this._children.get(index)
  }
}

/**
 * ObjectPort - 对象类型 Port
 */
@AnoraRegister('core.ObjectPort')
export class ObjectPort extends ContainerPort {
  get dataType(): DataType {
    return DataType.OBJECT
  }

  protected convert(value: RealDataType): ConversionResult<object> {
    if (value === null) {
      return { success: true, value: null }
    }

    const valueType = this.getValueType(value)

    switch (valueType) {
      case DataType.OBJECT:
        return this.handleObjectValue(value as Record<string, unknown>)

      default:
        return {
          success: false,
          value: null,
          error: `Cannot convert ${valueType} to object`,
        }
    }
  }

  /**
   * 创建子 Port（局部实现）
   */
  private createChildPort(value: RealDataType, keyInParent: string): BasePort {
    const dataType = inferDataTypeLocal(value)
    let port: BasePort

    switch (dataType) {
      case DataType.STRING:
        port = new StringPort(this.parentNode, this, keyInParent)
        break
      case DataType.NUMBER:
        port = new NumberPort(this.parentNode, this, keyInParent)
        break
      case DataType.INTEGER:
        port = new IntegerPort(this.parentNode, this, keyInParent)
        break
      case DataType.BOOLEAN:
        port = new BooleanPort(this.parentNode, this, keyInParent)
        break
      case DataType.ARRAY:
        port = new ArrayPort(this.parentNode, this, keyInParent)
        break
      case DataType.OBJECT:
        port = new ObjectPort(this.parentNode, this, keyInParent)
        break
      case DataType.NULL:
      default:
        port = new NullPort(this.parentNode, this, keyInParent)
        break
    }

    port.write(value)
    return port
  }

  /**
   * 处理对象值的写入
   */
  private handleObjectValue(obj: Record<string, unknown>): ConversionResult<object> {
    const newKeys = new Set<string>(Object.keys(obj))

    // 处理每个属性
    for (const [key, element] of Object.entries(obj)) {
      const existingChild = this._children.get(key)

      if (existingChild) {
        // 已存在子 Port
        const result = existingChild.write(element as RealDataType)
        if (!result.success) {
          // 类型不兼容，创建新的 Port
          const newChild = this.createChildPort(element as RealDataType, key)
          this._children.set(key, newChild)
        }
      } else {
        // 创建新的子 Port
        const newChild = this.createChildPort(element as RealDataType, key)
        this._children.set(key, newChild)
      }
    }

    // 处理不再存在的 key
    for (const [key] of this._children) {
      if (!newKeys.has(key as string)) {
        const child = this._children.get(key)!
        child.write(null)
        this._children.delete(key)
      }
    }

    this._data = obj
    return { success: true, value: obj }
  }

  /**
   * 按键获取子 Port
   */
  getByKey(key: string): BasePort | undefined {
    return this._children.get(key)
  }

  /**
   * 获取所有键
   */
  get keys(): string[] {
    return Array.from(this._children.keys()) as string[]
  }
}
