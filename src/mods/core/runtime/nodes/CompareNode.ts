import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { CompareNodePorts } from './PortNames'

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

/** CompareNode 入 Port 类型 */
interface CompareInput {
  [CompareNodePorts.IN.LEFT]: unknown
  [CompareNodePorts.IN.RIGHT]: unknown
}

/** CompareNode 出 Port 类型 */
interface CompareOutput {
  [CompareNodePorts.OUT.RESULT]: boolean
}

/**
 * CompareNode - 比较节点
 * 比较两个值
 *
 * 入 Port: left (any), right (any)
 * 出 Port: result (boolean)
 * context: { operation: CompareOperation }
 */
@AnoraRegister('core.CompareNode')
export class CompareNode extends WebNode<CompareInput, CompareOutput> {
  constructor(id?: string, label?: string) {
    super(id, label ?? 'Compare')

    // 入 Port
    this.addInPort(CompareNodePorts.IN.LEFT, DataType.STRING)
    this.addInPort(CompareNodePorts.IN.RIGHT, DataType.STRING)

    // 出 Port
    this.addOutPort(CompareNodePorts.OUT.RESULT, DataType.BOOLEAN)

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
    inData: CompareInput,
  ): Promise<CompareOutput> {
    const left = inData[CompareNodePorts.IN.LEFT]
    const right = inData[CompareNodePorts.IN.RIGHT]
    const operation = this.getOperation()

    let result: boolean

    switch (operation) {
      case CompareOperation.Equal:
        result = left == right
        break
      case CompareOperation.NotEqual:
        result = left != right
        break
      case CompareOperation.GreaterThan:
        result = (left as number) > (right as number)
        break
      case CompareOperation.GreaterThanOrEqual:
        result = (left as number) >= (right as number)
        break
      case CompareOperation.LessThan:
        result = (left as number) < (right as number)
        break
      case CompareOperation.LessThanOrEqual:
        result = (left as number) <= (right as number)
        break
      case CompareOperation.StrictEqual:
        result = left === right
        break
      case CompareOperation.StrictNotEqual:
        result = left !== right
        break
      default:
        result = false
    }

    return { [CompareNodePorts.OUT.RESULT]: result }
  }
}
