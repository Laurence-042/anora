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

/** ForwardNode context 类型 */
interface ForwardContext {
  directThrough: boolean
}

/**
 * ForwardNode - 中继节点
 * 接受任意数据类型并原样输出
 *
 * 入 Port: value (任意类型)
 * 出 Port: value (任意类型)
 *
 * 直通模式（directThrough）：由 Executor 特殊处理，
 * 在数据传播阶段立即执行而非等待下一迭代
 */
@AnoraRegister('core.ForwardNode')
export class ForwardNode extends WebNode<ForwardInput, ForwardOutput, object, ForwardContext> {
  static override meta = { icon: '➡️', category: 'core' }

  /** 是否启用直通模式（存储在 context 中，由 Executor 检查并特殊处理） */
  get directThrough(): boolean {
    return this.getContextField('directThrough') ?? true
  }

  set directThrough(value: boolean) {
    this.setContextField('directThrough', value)
  }

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Forward')

    // 初始化 context 默认值
    this.context = { directThrough: true }

    // 入 Port - 接受任意类型（使用 NullPort）
    this.addInPort(ForwardNodePorts.IN.VALUE, new NullPort(this))
    // 出 Port - 输出任意类型（使用 NullPort）
    this.addOutPort(ForwardNodePorts.OUT.VALUE, new NullPort(this))
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
