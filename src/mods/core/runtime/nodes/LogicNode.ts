import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'

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

/**
 * LogicNode - 逻辑节点
 * 执行逻辑运算
 *
 * 入 Port: a (boolean), b (boolean) - NOT 操作只使用 a
 * 出 Port: result (boolean)
 * context: { operation: LogicOperation }
 */
export class LogicNode extends WebNode {
  static typeId: string = 'core.LogicNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Logic')

    // 入 Port
    this.addInPort('a', DataType.BOOLEAN)
    this.addInPort('b', DataType.BOOLEAN)

    // 出 Port
    this.addOutPort('result', DataType.BOOLEAN)

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

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const a = Boolean(inData.a)
    const b = Boolean(inData.b)
    const operation = this.getOperation()

    let result: boolean

    switch (operation) {
      case LogicOperation.And:
        result = a && b
        break
      case LogicOperation.Or:
        result = a || b
        break
      case LogicOperation.Not:
        result = !a
        break
      case LogicOperation.Xor:
        result = (a || b) && !(a && b)
        break
      case LogicOperation.Nand:
        result = !(a && b)
        break
      case LogicOperation.Nor:
        result = !(a || b)
        break
      default:
        result = false
    }

    return { result }
  }
}
