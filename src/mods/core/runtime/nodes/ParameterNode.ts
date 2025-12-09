import { ActivationReadyStatus } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { ParameterNodePorts } from './PortNames'
import { NullPort } from '../ports'

/** ParameterNode 出 Port 类型 */
interface ParameterOutput {
  [ParameterNodePorts.OUT.VALUE]: unknown
}

/**
 * ParameterNode - 参数节点
 * 在 context 中配置固定值，激活时直接输出
 *
 * 出 Port: value (可配置类型)
 * context: { value: string } - 字符串形式的值
 *
 * 值解析规则：
 * - 可解析为 JSON 时：使用解析后的值
 * - 否则：作为字符串使用
 * - 特殊情况需传递 json-string：使用双引号包裹强制作为 string（如 "\"hello\""）
 */
@AnoraRegister('core.ParameterNode')
export class ParameterNode extends WebNode<Record<string, never>, ParameterOutput> {
  constructor(id?: string, label?: string) {
    super(id, label ?? 'Parameter')

    // 出 Port - 输出任意类型
    this.addOutPort(ParameterNodePorts.OUT.VALUE, new NullPort(this))

    // 默认上下文（字符串形式）
    this.context = { value: '' }
  }

  /**
   * 设置参数值（字符串形式）
   * @param valueString 字符串形式的值，会尝试 JSON 解析
   */
  setValue(valueString: string): void {
    this.context = { value: valueString }
  }

  /**
   * 设置原始值（直接存储，不经过字符串转换）
   * @param value 要存储的值
   */
  setRawValue(value: unknown): void {
    // 将值序列化为 JSON 字符串存储
    this.context = { value: JSON.stringify(value) }
  }

  /**
   * 获取解析后的参数值
   * 尝试将 context.value 解析为 JSON，失败则返回原字符串
   */
  getValue(): unknown {
    const valueString = (this.context as { value: string })?.value ?? ''

    // 空字符串直接返回
    if (valueString === '') {
      return ''
    }

    // 尝试 JSON 解析
    try {
      return JSON.parse(valueString)
    } catch {
      // JSON 解析失败，返回原字符串
      return valueString
    }
  }

  /**
   * 获取原始字符串值
   */
  getRawValue(): string {
    return (this.context as { value: string })?.value ?? ''
  }

  /**
   * 覆盖激活就绪检查
   * 参数节点只需要被触发即可
   */
  override isReadyToActivate(connectedPorts: Set<string>): ActivationReadyStatus {
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
    _inData: Record<string, never>,
  ): Promise<ParameterOutput> {
    // 直接输出 context 中的值
    return {
      [ParameterNodePorts.OUT.VALUE]: this.getValue(),
    }
  }
}
