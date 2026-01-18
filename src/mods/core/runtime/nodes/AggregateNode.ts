import { ActivationReadyStatus } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { NullPort } from '../../../../base/runtime/ports'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { AggregateNodePorts } from './PortNames'
import { ArrayPort } from '../ports'

/** AggregateNode 入 Port 类型 */
interface AggregateInput {
  [AggregateNodePorts.IN.ITEM]?: unknown
}

/** AggregateNode 出 Port 类型 */
interface AggregateOutput {
  [AggregateNodePorts.OUT.ARRAY]?: unknown[]
}

/** AggregateNode 控制 Port 类型 */
interface AggregateControl {
  [AggregateNodePorts.IN_CONTROL.AGGREGATE]?: null
}

/**
 * AggregateNode - 聚集节点
 * 收集多个元素组成数组
 *
 * 入 Port: item (动态类型)
 * 入控制 Port: aggregate (null) - 触发时将 inPort 数据加进缓存
 * 出 Port: array (array)
 *
 * 两种激活模式：
 * 1. inControlPort `aggregate` 被写入：将 inPort 数据加进缓存数组（null 也缓存）
 * 2. inDependsOnPort 被写入：输出缓存数组，然后清空缓存
 */
@AnoraRegister('core.AggregateNode')
export class AggregateNode extends WebNode<AggregateInput, AggregateOutput, AggregateControl> {
  static override meta = { icon: '🔗', category: 'core' }

  /** 收集器 */
  private collector: unknown[] = []

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Aggregate')

    // 入 Port - 接受任意类型
    this.addInPort(AggregateNodePorts.IN.ITEM, new NullPort(this))

    // 入控制 Port - 触发收集
    this.addInControlPort(AggregateNodePorts.IN_CONTROL.AGGREGATE, new NullPort(this))

    // 出 Port
    this.addOutPort(AggregateNodePorts.OUT.ARRAY, new ArrayPort(this))
  }

  /**
   * 清空收集器
   */
  clear(): void {
    this.collector = []
  }

  /**
   * 获取当前收集的元素数量
   */
  get count(): number {
    return this.collector.length
  }

  /**
   * 覆盖激活就绪检查
   * 两种激活条件：aggregate 控制端口有新数据，或 inDependsOnPort 有新数据
   */
  override isReadyToActivate(_connectedPorts: Set<string>): ActivationReadyStatus {
    // 检查 aggregate 控制 Port
    const aggregatePort = this.inControlPorts.get(AggregateNodePorts.IN_CONTROL.AGGREGATE)
    if (aggregatePort?.hasNewData) {
      return ActivationReadyStatus.Ready
    }

    // 检查 inDependsOnPort（输出模式）
    if (this.inDependsOnPort.hasNewData) {
      return ActivationReadyStatus.Ready
    }

    // 等待任一端口被填写
    return ActivationReadyStatus.NotReadyUntilAnyPortsFilled
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: AggregateInput,
    controlData: AggregateControl,
  ): Promise<AggregateOutput> {
    // 检查是否是 inDependsOnPort 触发（输出模式）
    // 注意：inDependsOnPort 的数据已在 activate() 中被 read()，所以这里检查 aggregate 控制端口
    // 如果 aggregate 没有数据，说明是 inDependsOnPort 触发的
    if (controlData[AggregateNodePorts.IN_CONTROL.AGGREGATE] === undefined) {
      // 输出当前收集的数组并清空
      const result = [...this.collector]
      this.collector = []
      return {
        [AggregateNodePorts.OUT.ARRAY]: result,
      }
    }

    // aggregate 控制端口触发：添加元素到收集器（null 也缓存）
    const item = inData[AggregateNodePorts.IN.ITEM]
    this.collector.push(item)

    // 不输出任何数据（继续收集）
    return {}
  }
}
