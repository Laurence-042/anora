import { BasePort } from '../../../../base/runtime/ports'
import { DataType } from '../../../../base/runtime/types'
import type { RealDataType, ConversionResult } from '../../../../base/runtime/types'
import { AnoraRegister } from '../../../../base/runtime/registry'

/**
 * StringPort - 字符串类型 Port
 */
@AnoraRegister('core.StringPort')
export class StringPort extends BasePort {
  get dataType(): DataType {
    return DataType.STRING
  }

  protected convert(value: RealDataType): ConversionResult<string> {
    if (value === null) {
      return { success: true, value: null }
    }

    const valueType = this.getValueType(value)

    switch (valueType) {
      case DataType.STRING:
        return { success: true, value: value as string }

      case DataType.NUMBER:
      case DataType.INTEGER:
        return { success: true, value: String(value) }

      case DataType.BOOLEAN:
        return { success: true, value: String(value) }

      case DataType.ARRAY:
      case DataType.OBJECT:
        try {
          return { success: true, value: JSON.stringify(value) }
        } catch (e) {
          return {
            success: false,
            value: null,
            error: `Failed to stringify value: ${e}`,
          }
        }

      default:
        return {
          success: false,
          value: null,
          error: `Cannot convert ${valueType} to string`,
        }
    }
  }
}

/**
 * NumberPort - 浮点数类型 Port
 */
@AnoraRegister('core.NumberPort')
export class NumberPort extends BasePort {
  get dataType(): DataType {
    return DataType.NUMBER
  }

  protected convert(value: RealDataType): ConversionResult<number> {
    if (value === null) {
      return { success: true, value: null }
    }

    const valueType = this.getValueType(value)

    switch (valueType) {
      case DataType.STRING: {
        const num = Number.parseFloat(value as string)
        if (Number.isNaN(num)) {
          return {
            success: false,
            value: null,
            error: `Cannot parse "${value}" as number`,
          }
        }
        return { success: true, value: num }
      }

      case DataType.NUMBER:
      case DataType.INTEGER:
        return { success: true, value: value as number }

      case DataType.BOOLEAN:
        return { success: true, value: value ? 1 : 0 }

      default:
        return {
          success: false,
          value: null,
          error: `Cannot convert ${valueType} to number`,
        }
    }
  }
}

/**
 * IntegerPort - 整数类型 Port
 */
@AnoraRegister('core.IntegerPort')
export class IntegerPort extends BasePort {
  get dataType(): DataType {
    return DataType.INTEGER
  }

  protected convert(value: RealDataType): ConversionResult<number> {
    if (value === null) {
      return { success: true, value: null }
    }

    const valueType = this.getValueType(value)

    switch (valueType) {
      case DataType.STRING: {
        const num = Number.parseInt(value as string, 10)
        if (Number.isNaN(num)) {
          return {
            success: false,
            value: null,
            error: `Cannot parse "${value}" as integer`,
          }
        }
        return { success: true, value: num }
      }

      case DataType.NUMBER:
        return { success: true, value: Math.floor(value as number) }

      case DataType.INTEGER:
        return { success: true, value: value as number }

      case DataType.BOOLEAN:
        return { success: true, value: value ? 1 : 0 }

      default:
        return {
          success: false,
          value: null,
          error: `Cannot convert ${valueType} to integer`,
        }
    }
  }
}

/**
 * BooleanPort - 布尔类型 Port
 */
@AnoraRegister('core.BooleanPort')
export class BooleanPort extends BasePort {
  get dataType(): DataType {
    return DataType.BOOLEAN
  }

  protected convert(value: RealDataType): ConversionResult<boolean> {
    if (value === null) {
      return { success: true, value: null }
    }

    const valueType = this.getValueType(value)

    switch (valueType) {
      case DataType.STRING:
        return { success: true, value: (value as string).toLowerCase() === 'true' }

      case DataType.NUMBER:
      case DataType.INTEGER:
        return { success: true, value: !!(value as number) }

      case DataType.BOOLEAN:
        return { success: true, value: value as boolean }

      default:
        return {
          success: false,
          value: null,
          error: `Cannot convert ${valueType} to boolean`,
        }
    }
  }
}
