import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'

/**
 * 比较操作类型
 */
export enum CompareOperation {
  Equal = '==',
  NotEqual = '!=',
  GreaterThan = '>',
  GreaterThanOrEqual = '>=',
  LessThan = '<',
  LessThanOrEqual = '<=',
  StrictEqual = '===',
  StrictNotEqual = '!==',
}

/**
 * CompareNode - 比较节点
 * 比较两个值
 *
 * 入 Port: a (any), b (any)
 * 出 Port: result (boolean)
 * context: { operation: CompareOperation }
 */
export class CompareNode extends WebNode {
  static typeId: string = 'core.CompareNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Compare')

    // 入 Port
    this.addInPort('a', DataType.STRING)
    this.addInPort('b', DataType.STRING)

    // 出 Port
    this.addOutPort('result', DataType.BOOLEAN)

    // 默认比较操作
    this.context = { operation: CompareOperation.Equal }
  }

  /**
   * 设置比较操作
   */
  setOperation(operation: CompareOperation): void {
    this.context = { operation }
  }

  /**
   * 获取当前比较操作
   */
  getOperation(): CompareOperation {
    return (this.context as { operation: CompareOperation })?.operation ?? CompareOperation.Equal
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const a = inData.a
    const b = inData.b
    const operation = this.getOperation()

    let result: boolean

    switch (operation) {
      case CompareOperation.Equal:
        result = a == b
        break
      case CompareOperation.NotEqual:
        result = a != b
        break
      case CompareOperation.GreaterThan:
        result = (a as number) > (b as number)
        break
      case CompareOperation.GreaterThanOrEqual:
        result = (a as number) >= (b as number)
        break
      case CompareOperation.LessThan:
        result = (a as number) < (b as number)
        break
      case CompareOperation.LessThanOrEqual:
        result = (a as number) <= (b as number)
        break
      case CompareOperation.StrictEqual:
        result = a === b
        break
      case CompareOperation.StrictNotEqual:
        result = a !== b
        break
      default:
        result = false
    }

    return { result }
  }
}
