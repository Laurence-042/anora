import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'

/**
 * ConsoleLogNode - 控制台日志节点
 * 将输入数据输出到控制台
 *
 * 入 Port: message (string)
 * context: { prefix: string }
 */
export class ConsoleLogNode extends WebNode {
  static typeId: string = 'core.ConsoleLogNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'ConsoleLog')

    // 入 Port
    this.addInPort('message', DataType.STRING)

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
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const message = String(inData.message ?? '')
    const prefix = this.getPrefix()

    console.log(`${prefix} ${message}`)

    return {}
  }
}
