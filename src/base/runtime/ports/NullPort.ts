import { BasePort } from './BasePort'
import { DataType } from '../types'
import type { RealDataType, ConversionResult } from '../types'

/**
 * NullPort - 空类型 Port（可接受任意类型）
 * 这是基础类型，保留在 base 中，用于 ExecPort 等基础功能
 */
export class NullPort extends BasePort {
  get dataType(): DataType {
    return DataType.NULL
  }

  protected convert(value: RealDataType): ConversionResult {
    // NullPort 接受任何类型
    return { success: true, value }
  }
}
