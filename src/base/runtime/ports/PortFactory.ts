import { BasePort, ContainerPort } from './BasePort'
import { DataType, TYPE_COMPATIBILITY_MATRIX } from '../types'
import type { RealDataType } from '../types'
import { StringPort, NumberPort, IntegerPort, BooleanPort, NullPort } from './PrimitivePorts'
import { ArrayPort, ObjectPort } from './ContainerPorts'

import type { BaseNode } from '../nodes/BaseNode'

/**
 * 根据数据类型创建对应的 Port
 */
export function createPort(
  dataType: DataType,
  parentNode: BaseNode,
  parentPort?: ContainerPort,
  keyInParent?: string | number,
): BasePort {
  switch (dataType) {
    case DataType.STRING:
      return new StringPort(parentNode, parentPort, keyInParent)
    case DataType.NUMBER:
      return new NumberPort(parentNode, parentPort, keyInParent)
    case DataType.INTEGER:
      return new IntegerPort(parentNode, parentPort, keyInParent)
    case DataType.BOOLEAN:
      return new BooleanPort(parentNode, parentPort, keyInParent)
    case DataType.ARRAY:
      return new ArrayPort(parentNode, parentPort, keyInParent)
    case DataType.OBJECT:
      return new ObjectPort(parentNode, parentPort, keyInParent)
    case DataType.NULL:
    default:
      return new NullPort(parentNode, parentPort, keyInParent)
  }
}

/**
 * 根据值推断类型并创建 Port
 */
export function createPortFromValue(
  parentNode: BaseNode,
  value: RealDataType,
  parentPort?: ContainerPort,
  keyInParent?: string | number,
): BasePort {
  const dataType = inferDataType(value)
  const port = createPort(dataType, parentNode, parentPort, keyInParent)
  port.write(value)
  return port
}

/**
 * 推断值的数据类型
 */
export function inferDataType(value: RealDataType): DataType {
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
 * 检查两个 Port 类型是否兼容（可以建立连接）
 */
export function areTypesCompatible(sourceType: DataType, targetType: DataType): boolean {
  // null 类型可以接受任何类型
  if (targetType === DataType.NULL) return true

  // 任何类型都可以输出到 null 类型
  if (sourceType === DataType.NULL) return true

  // 使用兼容性矩阵检查
  return TYPE_COMPATIBILITY_MATRIX[sourceType]?.[targetType] ?? false
}
