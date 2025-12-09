import { ActivationReadyStatus } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { ForwardNodePorts } from './PortNames'
import { NullPort } from '../ports'

/** ForwardNode 入 Port 类型 */
interface ForwardInput {
  [ForwardNodePorts.IN.VALUE]: unknown
}

/** ForwardNode 出 Port 类型 */
interface ForwardOutput {
  [ForwardNodePorts.OUT.VALUE]: unknown
}

/**
 * ForwardNode - 中继节点
 * 用于转换数据类型，本质上是一个通透节点
 *
 * 入 Port: value (任意类型)
 * 出 Port: value (可配置类型)
 *
 * 支持直通模式：当入 Port 有数据时立即传播到出 Port
 */
@AnoraRegister('core.ForwardNode')
export class ForwardNode extends WebNode<ForwardInput, ForwardOutput> {
  /** 是否启用直通模式 */
  directThrough: boolean = true

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Forward')

    // 入 Port - 接受任意类型（使用 NullPort）
    this.addInPort(ForwardNodePorts.IN.VALUE, new NullPort(this))
    // 出 Port - 输出任意类型（使用 NullPort）
    this.addOutPort(ForwardNodePorts.OUT.VALUE, new NullPort(this))
  }

  /**
   * 覆盖激活就绪检查
   * 支持直通模式
   */
  override isReadyToActivate(_connectedPorts: Set<string>): ActivationReadyStatus {
    if (this.directThrough) {
      const inPort = this.getInPort('value')
      if (inPort?.hasData) {
        return ActivationReadyStatus.DirectThrough
      }
      return ActivationReadyStatus.NotReadyUntilAnyPortsFilled
    }
    // 非直通模式：只要有数据就 Ready
    const inPort = this.getInPort('value')
    if (inPort?.hasData) {
      return ActivationReadyStatus.Ready
    }
    return ActivationReadyStatus.NotReadyUntilAnyPortsFilled
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: ForwardInput,
  ): Promise<ForwardOutput> {
    // 直接传递数据
    return {
      [ForwardNodePorts.OUT.VALUE]: inData[ForwardNodePorts.IN.VALUE],
    }
  }
}
