import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'

/**
 * 算术操作类型
 */
export enum ArithmeticOperation {
  Add = '+',
  Subtract = '-',
  Multiply = '*',
  Divide = '/',
  Modulo = '%',
  Power = '**',
}

/**
 * ArithmeticNode - 算术节点
 * 执行两个数值的算术运算
 *
 * 入 Port: a (number), b (number)
 * 出 Port: result (number)
 * context: { operation: ArithmeticOperation }
 */
export class ArithmeticNode extends WebNode {
  static typeId: string = 'core.ArithmeticNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Arithmetic')

    // 入 Port
    this.addInPort('a', DataType.NUMBER)
    this.addInPort('b', DataType.NUMBER)

    // 出 Port
    this.addOutPort('result', DataType.NUMBER)

    // 默认操作
    this.context = { operation: ArithmeticOperation.Add }
  }

  /**
   * 设置算术操作
   */
  setOperation(operation: ArithmeticOperation): void {
    this.context = { operation }
  }

  /**
   * 获取当前操作
   */
  getOperation(): ArithmeticOperation {
    return (
      (this.context as { operation: ArithmeticOperation })?.operation ?? ArithmeticOperation.Add
    )
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const a = Number(inData.a)
    const b = Number(inData.b)
    const operation = this.getOperation()

    let result: number

    switch (operation) {
      case ArithmeticOperation.Add:
        result = a + b
        break
      case ArithmeticOperation.Subtract:
        result = a - b
        break
      case ArithmeticOperation.Multiply:
        result = a * b
        break
      case ArithmeticOperation.Divide:
        if (b === 0) {
          throw new Error('Division by zero')
        }
        result = a / b
        break
      case ArithmeticOperation.Modulo:
        if (b === 0) {
          throw new Error('Modulo by zero')
        }
        result = a % b
        break
      case ArithmeticOperation.Power:
        result = Math.pow(a, b)
        break
      default:
        result = 0
    }

    return { result }
  }
}
