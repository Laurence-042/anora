import { v4 as uuidv4 } from 'uuid'
import { DataType, TYPE_COMPATIBILITY_MATRIX } from '../types'
import type { RealDataType, SerializedPort, ConversionResult } from '../types'

// 前向声明类型 - 使用 any 泛型以避免循环依赖问题

import type { BaseNode } from '../nodes/BaseNode'

/** Port 可以关联的节点类型 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = BaseNode<any, any, any>

/**
 * Port 基类
 * Port 是节点接收/发出数据的主要途径
 */
export abstract class BasePort {
  /** UUID */
  private _id: string

  /** 获取 Port ID */
  get id(): string {
    return this._id
  }

  /**
   * 恢复 Port ID（仅用于反序列化）
   * @param id 要恢复的 ID
   */
  restoreId(id: string): void {
    this._id = id
  }

  /** 反查所属节点 */
  parentNode: AnyNode

  /** 反查父 Port（如果是 ContainerPort 的子 Port） */
  parentPort?: ContainerPort

  /** 在父 Port 中的 key */
  keyInParent?: string | number

  /** 当前存储的数据 */
  protected _data: RealDataType = null

  /** 版本号：每次 write 时递增 */
  protected _version: number = 0

  /** 上次 read 时记录的版本号 */
  protected _lastReadVersion: number = 0

  constructor(parentNode: AnyNode, parentPort?: ContainerPort, keyInParent?: string | number) {
    this._id = uuidv4()
    this.parentNode = parentNode
    this.parentPort = parentPort
    this.keyInParent = keyInParent
  }

  /**
   * 获取此 Port 的数据类型
   */
  abstract get dataType(): DataType

  /**
   * 获取当前数据
   */
  get data(): RealDataType {
    return this._data
  }

  /**
   * 是否有数据（包括旧数据）
   */
  get hasData(): boolean {
    return this._data !== null || this._version > 0
  }

  /**
   * 是否有新数据（write 后未被 read 过）
   */
  get hasNewData(): boolean {
    return this._version > this._lastReadVersion
  }

  /**
   * 写入数据（带类型转换）
   * @param value 要写入的值
   * @returns 转换结果
   */
  write(value: RealDataType): ConversionResult {
    if (value === null) {
      this._data = null
      this._version++
      return { success: true, value: null }
    }

    const result = this.convert(value)
    if (result.success) {
      this._data = result.value
      this._version++
    }
    return result
  }

  /**
   * 读取数据并标记为已消费（不清空数据）
   */
  read(): RealDataType {
    this._lastReadVersion = this._version
    return this._data
  }

  /**
   * 仅读取数据（不改变版本号）
   */
  peek(): RealDataType {
    return this._data
  }

  /**
   * 清空数据并重置版本号
   */
  clear(): void {
    this._data = null
    this._version = 0
    this._lastReadVersion = 0
  }

  /**
   * 类型转换（子类需要实现）
   * @param value 输入值
   * @returns 转换结果
   */
  protected abstract convert(value: RealDataType): ConversionResult

  /**
   * 检查是否可以从指定类型转换
   */
  canConvertFrom(sourceType: DataType): boolean {
    return TYPE_COMPATIBILITY_MATRIX[sourceType][this.dataType]
  }

  /**
   * 获取输入值的数据类型
   */
  protected getValueType(value: RealDataType): DataType {
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
   * 序列化
   */
  serialize(): SerializedPort {
    return {
      id: this.id,
      dataType: this.dataType,
      data: this._data,
      keyInParent: this.keyInParent,
    }
  }

  /**
   * 反序列化
   */
  deserialize(data: SerializedPort): void {
    if (data.data !== null && data.data !== undefined) {
      this.write(data.data as string | number | boolean | object | null)
    }
  }

  /**
   * 复制序列化数据并生成新 ID
   * @returns { data: 序列化数据, idMap: ID 映射 }
   */
  duplicate(): { data: SerializedPort; idMap: Map<string, string> } {
    const oldId = this.id
    const newId = uuidv4()
    const idMap = new Map<string, string>()
    idMap.set(oldId, newId)
    return { data: { ...this.serialize(), id: newId }, idMap }
  }

  /**
   * 重新生成 ID
   * @returns { oldId, newId }
   */
  regenerateId(): { oldId: string; newId: string } {
    const oldId = this._id
    this._id = uuidv4()
    return { oldId, newId: this._id }
  }
}

/**
 * ContainerPort 基类
 * ArrayPort 和 ObjectPort 的共同基类
 */
export abstract class ContainerPort extends BasePort {
  /** 子 Port 映射 */
  protected _children: Map<string | number, BasePort> = new Map()

  /**
   * 获取子 Port
   */
  getChild(key: string | number): BasePort | undefined {
    return this._children.get(key)
  }

  /**
   * 获取子 Port 映射（key -> Port）
   */
  getChildren(): Map<string | number, BasePort> {
    return new Map(this._children)
  }

  /**
   * 深度优先遍历所有子孙 Port（包含自身）
   * @param handler 处理函数，返回 false 则停止遍历
   */
  traverseDeep(handler: (port: BasePort) => boolean | void): void {
    if (handler(this) === false) return
    for (const child of this._children.values()) {
      if (child instanceof ContainerPort) {
        child.traverseDeep(handler)
      } else {
        if (handler(child) === false) return
      }
    }
  }

  /**
   * 子 Port 数量
   */
  get childCount(): number {
    return this._children.size
  }

  /**
   * 检查是否有子 Port 或子孙有连接
   * 这个方法需要 Graph 的支持，暂时返回 false
   */
  hasConnectionsRecursively(): boolean {
    // TODO: 需要 Graph 支持来检查连接
    return false
  }

  /**
   * 清空数据时只保留有连接或子孙有连接的 Port
   */
  override clear(): void {
    super.clear()
    // 清理没有连接的子 Port
    for (const [key, child] of this._children) {
      if (child instanceof ContainerPort) {
        child.clear()
        if (!child.hasConnectionsRecursively() && child.childCount === 0) {
          this._children.delete(key)
        }
      } else {
        // TODO: 检查连接，如果没有连接则删除
        child.clear()
      }
    }
  }

  /**
   * 序列化（包含子 Port）
   */
  override serialize(): SerializedPort {
    const base = super.serialize()
    const children: SerializedPort[] = []

    for (const child of this._children.values()) {
      children.push(child.serialize())
    }

    return {
      ...base,
      children,
    }
  }

  /**
   * 复制序列化数据并生成新 ID（递归处理子 Port）
   * @returns { data: 序列化数据, idMap: 所有 Port 的 ID 映射 }
   */
  override duplicate(): { data: SerializedPort; idMap: Map<string, string> } {
    const idMap = new Map<string, string>()
    const oldId = this.id
    const newId = uuidv4()
    idMap.set(oldId, newId)

    const result: SerializedPort = { ...this.serialize(), id: newId }

    if (this._children.size > 0) {
      result.children = []
      for (const child of this._children.values()) {
        const { data, idMap: childIdMap } = child.duplicate()
        result.children.push(data)
        for (const [k, v] of childIdMap) idMap.set(k, v)
      }
    }

    return { data: result, idMap }
  }
}
