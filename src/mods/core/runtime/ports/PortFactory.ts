import { BasePort, ContainerPort, NullPort } from '../../../../base/runtime/ports'
import { DataType } from '../../../../base/runtime/types'
import type { RealDataType } from '../../../../base/runtime/types'
import { StringPort, NumberPort, IntegerPort, BooleanPort } from './PrimitivePorts'
import { ArrayPort, ObjectPort } from './ContainerPorts'

// Re-export areTypesCompatible from base
export { areTypesCompatible } from '../../../../base/runtime/types'

import type { BaseNode } from '../../../../base/runtime/nodes/BaseNode'

/** Port 可以关联的节点类型 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = BaseNode<any, any, any>

/**
 * 根据数据类型创建对应的 Port（便利工厂函数）
 */
export function createPort(
  dataType: DataType,
  parentNode: AnyNode,
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
  parentNode: AnyNode,
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
