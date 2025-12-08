import { ActivationReadyStatus, DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { ForwardNodePorts } from './PortNames'

/**
 * ForwardNode - 中继节点
 * 用于转换数据类型，本质上是一个通透节点
 *
 * 入 Port: value (任意类型)
 * 出 Port: value (可配置类型)
 *
 * 支持直通模式：当入 Port 有数据时立即传播到出 Port
 */
export class ForwardNode extends WebNode {
  static typeId: string = 'core.ForwardNode'

  /** 是否启用直通模式 */
  directThrough: boolean = true

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Forward')

    // 入 Port - 接受任意类型
    this.addInPort(ForwardNodePorts.IN.VALUE, DataType.STRING)
    // 出 Port - 默认输出字符串
    this.addOutPort(ForwardNodePorts.OUT.VALUE, DataType.STRING)
  }

  /**
   * 设置出 Port 的数据类型
   */
  setOutputType(dataType: DataType): void {
    // 重新创建出 Port
    this.outPorts.delete(ForwardNodePorts.OUT.VALUE)
    this.addOutPort(ForwardNodePorts.OUT.VALUE, dataType)
  }

  /**
   * 设置入 Port 的数据类型
   */
  setInputType(dataType: DataType): void {
    // 重新创建入 Port
    this.inPorts.delete(ForwardNodePorts.IN.VALUE)
    this.addInPort(ForwardNodePorts.IN.VALUE, dataType)
  }

  /**
   * 覆盖激活就绪检查
   * 支持直通模式
   */
  override checkActivationReady(connectedPorts: Set<string>): ActivationReadyStatus {
    if (this.directThrough) {
      const inPort = this.getInPort('value')
      if (inPort?.hasData) {
        return ActivationReadyStatus.DirectThrough
      }
      return ActivationReadyStatus.NotReadyUntilAnyPortsFilled
    }
    return super.isReadyToActivate(connectedPorts)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // 直接传递数据
    return {
      [ForwardNodePorts.OUT.VALUE]: inData[ForwardNodePorts.IN.VALUE],
    }
  }
}
