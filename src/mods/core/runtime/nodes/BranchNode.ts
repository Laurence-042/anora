import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'

/**
 * BranchNode - 分支节点
 * 根据条件选择执行路径
 *
 * 入 Port: condition (boolean)
 * 出控制 Port: onTrue (null), onFalse (null)
 */
export class BranchNode extends WebNode {
  static typeId: string = 'core.BranchNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Branch')

    // 入 Port
    this.addInPort('condition', DataType.BOOLEAN)

    // 出控制 Port
    this.addOutControlPort('onTrue', DataType.NULL)
    this.addOutControlPort('onFalse', DataType.NULL)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const condition = Boolean(inData.condition)

    // 根据条件激活对应的控制 Port
    if (condition) {
      const onTruePort = this.outControlPorts.get('onTrue')
      if (onTruePort) {
        onTruePort.write(null)
      }
    } else {
      const onFalsePort = this.outControlPorts.get('onFalse')
      if (onFalsePort) {
        onFalsePort.write(null)
      }
    }

    return {}
  }
}
