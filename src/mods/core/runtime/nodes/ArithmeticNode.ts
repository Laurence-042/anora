import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { ArithmeticNodePorts } from './PortNames'

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

/** ArithmeticNode 入 Port 类型 */
interface ArithmeticInput {
  [ArithmeticNodePorts.IN.LEFT]: number
  [ArithmeticNodePorts.IN.RIGHT]: number
}

/** ArithmeticNode 出 Port 类型 */
interface ArithmeticOutput {
  [ArithmeticNodePorts.OUT.RESULT]: number
}

/**
 * ArithmeticNode - 算术节点
 * 执行两个数值的算术运算
 *
 * 入 Port: left (number), right (number)
 * 出 Port: result (number)
 * context: { operation: ArithmeticOperation }
 */
@AnoraRegister('core.ArithmeticNode')
export class ArithmeticNode extends WebNode<ArithmeticInput, ArithmeticOutput> {
  constructor(id?: string, label?: string) {
    super(id, label ?? 'Arithmetic')

    // 入 Port
    this.addInPort(ArithmeticNodePorts.IN.LEFT, DataType.NUMBER)
    this.addInPort(ArithmeticNodePorts.IN.RIGHT, DataType.NUMBER)

    // 出 Port
    this.addOutPort(ArithmeticNodePorts.OUT.RESULT, DataType.NUMBER)

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
    inData: ArithmeticInput,
  ): Promise<ArithmeticOutput> {
    const left = inData[ArithmeticNodePorts.IN.LEFT]
    const right = inData[ArithmeticNodePorts.IN.RIGHT]
    const operation = this.getOperation()

    let result: number

    switch (operation) {
      case ArithmeticOperation.Add:
        result = left + right
        break
      case ArithmeticOperation.Subtract:
        result = left - right
        break
      case ArithmeticOperation.Multiply:
        result = left * right
        break
      case ArithmeticOperation.Divide:
        if (right === 0) {
          throw new Error('Division by zero')
        }
        result = left / right
        break
      case ArithmeticOperation.Modulo:
        if (right === 0) {
          throw new Error('Modulo by zero')
        }
        result = left % right
        break
      case ArithmeticOperation.Power:
        result = Math.pow(left, right)
        break
      default:
        result = 0
    }

    return { [ArithmeticNodePorts.OUT.RESULT]: result }
  }
}
