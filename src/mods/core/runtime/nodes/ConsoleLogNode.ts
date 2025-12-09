import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { ConsoleLogNodePorts } from './PortNames'

/** ConsoleLogNode 入 Port 类型 */
interface ConsoleLogInput {
  [ConsoleLogNodePorts.IN.MESSAGE]: string
}

/**
 * ConsoleLogNode - 控制台日志节点
 * 将输入数据输出到控制台
 *
 * 入 Port: message (string)
 * context: { prefix: string }
 */
@AnoraRegister('core.ConsoleLogNode')
export class ConsoleLogNode extends WebNode<ConsoleLogInput, Record<string, never>> {
  constructor(id?: string, label?: string) {
    super(id, label ?? 'ConsoleLog')

    // 入 Port
    this.addInPort(ConsoleLogNodePorts.IN.MESSAGE, DataType.STRING)

    // 默认前缀
    this.context = { prefix: '[ANORA]' }
  }

  /**
   * 设置前缀
   */
  setPrefix(prefix: string): void {
    this.context = { prefix }
  }

  /**
   * 获取前缀
   */
  getPrefix(): string {
    return (this.context as { prefix: string })?.prefix ?? ''
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: ConsoleLogInput,
  ): Promise<Record<string, never>> {
    const message = inData[ConsoleLogNodePorts.IN.MESSAGE] ?? ''
    const prefix = this.getPrefix()

    console.log(`${prefix} ${message}`)

    return {}
  }
}
