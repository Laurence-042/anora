import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { BranchNodePorts } from './PortNames'

/** BranchNode 入 Port 类型 */
interface BranchInput {
  [BranchNodePorts.IN.CONDITION]: boolean
}

/**
 * BranchNode - 分支节点
 * 根据条件选择执行路径
 *
 * 入 Port: condition (boolean)
 * 出控制 Port: onTrue (null), onFalse (null)
 */
@AnoraRegister('core.BranchNode')
export class BranchNode extends WebNode<BranchInput, Record<string, never>> {
  constructor(id?: string, label?: string) {
    super(id, label ?? 'Branch')

    // 入 Port
    this.addInPort(BranchNodePorts.IN.CONDITION, DataType.BOOLEAN)

    // 出控制 Port
    this.addOutControlPort(BranchNodePorts.OUT_CONTROL.ON_TRUE, DataType.NULL)
    this.addOutControlPort(BranchNodePorts.OUT_CONTROL.ON_FALSE, DataType.NULL)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: BranchInput,
  ): Promise<Record<string, never>> {
    const condition = inData[BranchNodePorts.IN.CONDITION]

    // 根据条件激活对应的控制 Port
    if (condition) {
      const onTruePort = this.outControlPorts.get(BranchNodePorts.OUT_CONTROL.ON_TRUE)
      if (onTruePort) {
        onTruePort.write(null)
      }
    } else {
      const onFalsePort = this.outControlPorts.get(BranchNodePorts.OUT_CONTROL.ON_FALSE)
      if (onFalsePort) {
        onFalsePort.write(null)
      }
    }

    return {}
  }
}
