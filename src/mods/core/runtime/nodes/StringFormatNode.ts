import { DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'

/**
 * StringFormatNode - 字符串格式化节点
 * 使用模板字符串格式化输出
 *
 * 入 Port: args (object) - 格式化参数
 * 出 Port: result (string)
 * context: { template: string }
 *
 * 模板格式: "Hello, {name}! You are {age} years old."
 */
export class StringFormatNode extends WebNode {
  static typeId: string = 'core.StringFormatNode'

  constructor(id?: string, label?: string) {
    super(id, label ?? 'StringFormat')

    // 入 Port
    this.addInPort('args', DataType.OBJECT)

    // 出 Port
    this.addOutPort('result', DataType.STRING)

    // 默认模板
    this.context = { template: '' }
  }

  /**
   * 设置模板
   */
  setTemplate(template: string): void {
    this.context = { template }
  }

  /**
   * 获取模板
   */
  getTemplate(): string {
    return (this.context as { template: string })?.template ?? ''
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const template = this.getTemplate()
    const args = (inData.args as Record<string, unknown>) || {}

    // 简单的模板替换
    const result = template.replace(/\{(\w+)\}/g, (match, key) => {
      if (key in args) {
        return String(args[key])
      }
      return match
    })

    return { result }
  }
}
