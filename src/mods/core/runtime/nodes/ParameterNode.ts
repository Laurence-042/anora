import { ActivationReadyStatus, DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { ParameterNodePorts } from './PortNames'

/**
 * ParameterNode - 参数节点
 * 在 context 中配置固定值，激活时直接输出
 *
 * 出 Port: value (可配置类型)
 * context: { value: any }
 */
export class ParameterNode extends WebNode {
  static typeId: string = 'core.ParameterNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Parameter')

    // 出 Port - 默认输出字符串
    this.addOutPort(ParameterNodePorts.OUT.VALUE, DataType.STRING)

    // 默认上下文
    this.context = { value: '' }
  }

  /**
   * 设置参数值和类型
   */
  setValue(value: unknown, dataType?: DataType): void {
    this.context = { value }

    if (dataType) {
      this.outPorts.delete(ParameterNodePorts.OUT.VALUE)
      this.addOutPort(ParameterNodePorts.OUT.VALUE, dataType)
    }
  }

  /**
   * 获取参数值
   */
  getValue(): unknown {
    return (this.context as { value: unknown })?.value
  }

  /**
   * 覆盖激活就绪检查
   * 参数节点只需要被触发即可
   */
  override checkActivationReady(connectedPorts: Set<string>): ActivationReadyStatus {
    // 如果有入 Exec 连接，则需要等待触发
    if (connectedPorts.has(this.inExecPort.id)) {
      if (this.inExecPort.hasData) {
        return ActivationReadyStatus.Ready
      }
      return ActivationReadyStatus.NotReadyUntilAnyPortsFilled
    }

    // 没有入 Exec 连接时，直接就绪（只执行一次）
    return ActivationReadyStatus.Ready
  }

  async activateCore(
    _executorContext: ExecutorContext,
    _inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // 直接输出 context 中的值
    return {
      [ParameterNodePorts.OUT.VALUE]: this.getValue(),
    }
  }
}
