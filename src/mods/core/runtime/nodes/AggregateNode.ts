import { ActivationReadyStatus, DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AggregateNodePorts } from './PortNames'

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
 * 入控制 Port: aggregate (null) - 当激活时，输出收集的数组并清空
 * 出 Port: array (array)
 *
 * 两种激活模式：
 * 1. aggregate 控制 Port 被激活：输出当前收集的数组
 * 2. inExecPort 被激活：添加元素到收集器
 */
export class AggregateNode extends WebNode<AggregateInput, AggregateOutput, AggregateControl> {
  static typeId: string = 'core.AggregateNode'

  /** 收集器 */
  private collector: unknown[] = []

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Aggregate')

    // 入 Port
    this.addInPort(AggregateNodePorts.IN.ITEM, DataType.STRING)

    // 入控制 Port - 触发输出
    this.addInControlPort(AggregateNodePorts.IN_CONTROL.AGGREGATE, DataType.NULL)

    // 出 Port
    this.addOutPort(AggregateNodePorts.OUT.ARRAY, DataType.ARRAY)
  }

  /**
   * 设置输入元素的类型
   */
  setItemType(dataType: DataType): void {
    this.inPorts.delete(AggregateNodePorts.IN.ITEM)
    this.addInPort(AggregateNodePorts.IN.ITEM, dataType)
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
   */
  override checkActivationReady(connectedPorts: Set<string>): ActivationReadyStatus {
    // 检查 aggregate 控制 Port
    const aggregatePort = this.inControlPorts.get(AggregateNodePorts.IN_CONTROL.AGGREGATE)
    if (aggregatePort?.hasData) {
      return ActivationReadyStatus.Ready
    }

    // 正常检查
    return super.isReadyToActivate(connectedPorts)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: AggregateInput,
    controlData: AggregateControl,
  ): Promise<AggregateOutput> {
    // 检查是否是聚集触发
    if (controlData[AggregateNodePorts.IN_CONTROL.AGGREGATE] !== undefined) {
      // 输出当前收集的数组
      const result = [...this.collector]
      this.collector = []
      return {
        [AggregateNodePorts.OUT.ARRAY]: result,
      }
    }

    // 添加元素到收集器
    const item = inData[AggregateNodePorts.IN.ITEM]
    if (item !== undefined) {
      this.collector.push(item)
    }

    // 不输出任何数据（继续收集）
    return {}
  }
}
