import { BaseRegistry } from './BaseRegistry'
import { BasePort } from '../ports/BasePort'
import { DataType } from '../types'

/**
 * Port 类型定义
 */
export type PortConstructor = new (...args: unknown[]) => BasePort

/**
 * Port 注册表
 */
class PortRegistryClass extends BaseRegistry<PortConstructor> {
  /**
   * 获取 Port 的数据类型
   */
  getDataType(typeId: string): DataType | undefined {
    // 基于 typeId 推断数据类型
    const typeMap: Record<string, DataType> = {
      StringPort: DataType.STRING,
      NumberPort: DataType.NUMBER,
      IntegerPort: DataType.INTEGER,
      BooleanPort: DataType.BOOLEAN,
      ArrayPort: DataType.ARRAY,
      ObjectPort: DataType.OBJECT,
      NullPort: DataType.NULL,
    }
    return typeMap[typeId]
  }
}

/**
 * 全局 Port 注册表实例
 */
export const PortRegistry = new PortRegistryClass()
