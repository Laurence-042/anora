import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { LogicNodePorts } from './PortNames'

/**
 * 逻辑操作类型
 */
export enum LogicOperation {
  And = 'AND',
  Or = 'OR',
  Not = 'NOT',
  Xor = 'XOR',
  Nand = 'NAND',
  Nor = 'NOR',
}

/** LogicNode 入 Port 类型 */
interface LogicInput {
  [LogicNodePorts.IN.LEFT]: boolean
  [LogicNodePorts.IN.RIGHT]: boolean
}

/** LogicNode 出 Port 类型 */
interface LogicOutput {
  [LogicNodePorts.OUT.RESULT]: boolean
}

/**
 * LogicNode - 逻辑节点
 * 执行逻辑运算
 *
 * 入 Port: left (boolean), right (boolean) - NOT 操作只使用 left
 * 出 Port: result (boolean)
 * context: { operation: LogicOperation }
 */
export class LogicNode extends WebNode<LogicInput, LogicOutput> {
  static typeId: string = 'core.LogicNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Logic')

    // 入 Port
    this.addInPort(LogicNodePorts.IN.LEFT, DataType.BOOLEAN)
    this.addInPort(LogicNodePorts.IN.RIGHT, DataType.BOOLEAN)

    // 出 Port
    this.addOutPort(LogicNodePorts.OUT.RESULT, DataType.BOOLEAN)

    // 默认操作
    this.context = { operation: LogicOperation.And }
  }

  /**
   * 设置逻辑操作
   */
  setOperation(operation: LogicOperation): void {
    this.context = { operation }
  }

  /**
   * 获取当前操作
   */
  getOperation(): LogicOperation {
    return (this.context as { operation: LogicOperation })?.operation ?? LogicOperation.And
  }

  async activateCore(_executorContext: ExecutorContext, inData: LogicInput): Promise<LogicOutput> {
    const left = inData[LogicNodePorts.IN.LEFT]
    const right = inData[LogicNodePorts.IN.RIGHT]
    const operation = this.getOperation()

    let result: boolean

    switch (operation) {
      case LogicOperation.And:
        result = left && right
        break
      case LogicOperation.Or:
        result = left || right
        break
      case LogicOperation.Not:
        result = !left
        break
      case LogicOperation.Xor:
        result = (left || right) && !(left && right)
        break
      case LogicOperation.Nand:
        result = !(left && right)
        break
      case LogicOperation.Nor:
        result = !(left || right)
        break
      default:
        result = false
    }

    return { [LogicNodePorts.OUT.RESULT]: result }
  }
}
