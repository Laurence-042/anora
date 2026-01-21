import { ActivationReadyStatus } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { NullPort } from '../../../../base/runtime/ports'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { DistributeNodePorts } from './PortNames'
import { ArrayPort, IntegerPort } from '../ports'

/** DistributeNode 入 Port 类型 */
interface DistributeInput {
  [DistributeNodePorts.IN.ARRAY]?: unknown[]
}

/** DistributeNode 出 Port 类型 */
interface DistributeOutput {
  [DistributeNodePorts.OUT.ITEM]?: unknown
  [DistributeNodePorts.OUT.INDEX]?: number
}

/**
 * DistributeNode - 分配节点 (For-Each)
 * 从一个数组中依次输出每个元素
 *
 * 入 Port: array (array)
 * 出 Port: item (动态类型), index (integer)
 * 出控制 Port: done (null) - 所有元素输出完毕后激活
 *
 * context: { currentIndex: number, total: number }
 */
@AnoraRegister('core.DistributeNode')
export class DistributeNode extends WebNode<DistributeInput, DistributeOutput> {
  static override meta = { icon: '🔀', category: 'core' }

  /** 当前正在处理的数组 */
  private currentArray: unknown[] = []

  /** 当前索引 */
  private currentIndex: number = 0

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Distribute')

    // 入 Port
    this.addInPort(DistributeNodePorts.IN.ARRAY, new ArrayPort(this))

    // 出 Port - item 使用 NullPort 接受任意类型
    this.addOutPort(DistributeNodePorts.OUT.ITEM, new NullPort(this))
    this.addOutPort(DistributeNodePorts.OUT.INDEX, new IntegerPort(this))

    // 出控制 Port - 完成时激活
    this.addOutControlPort(DistributeNodePorts.OUT_CONTROL.DONE, new NullPort(this))
  }

  /**
   * 重置分发状态
   */
  reset(): void {
    this.currentArray = []
    this.currentIndex = 0
  }

  /**
   * 覆盖激活就绪检查
   * 需要处理多次激活的情况：
   * - 正在分发中：继续分发，返回 Ready
   * - 已完成或未开始：使用基类逻辑检查是否有新数组输入
   */
  override isReadyToActivate(connectedPorts: Set<string>): ActivationReadyStatus {
    // 如果正在分发中（有未完成的元素），继续分发
    if (this.currentArray.length > 0 && this.currentIndex < this.currentArray.length) {
      return ActivationReadyStatus.Ready
    }

    // 已完成或未开始：使用基类默认逻辑检查是否有新数组输入
    // 基类会检查入 Port 是否有新数据
    return super.isReadyToActivate(connectedPorts)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: DistributeInput,
  ): Promise<DistributeOutput> {
    // 只有当前没有正在分发的数组时，才接受新数组输入
    // 如果正在分发中，丢弃新输入，继续当前输出
    const inputArray = inData[DistributeNodePorts.IN.ARRAY]
    if (this.currentIndex >= this.currentArray.length && inputArray !== undefined) {
      if (Array.isArray(inputArray)) {
        this.currentArray = inputArray
        this.currentIndex = 0
      } else {
        throw new Error('Input must be an array')
      }
    }

    // 如果数组为空，激活 done
    if (this.currentArray.length === 0) {
      const donePort = this.outControlPorts.get(DistributeNodePorts.OUT_CONTROL.DONE)
      if (donePort) {
        donePort.write(null)
      }
      return {}
    }

    // 输出当前元素
    const item = this.currentArray[this.currentIndex]
    const index = this.currentIndex

    // 检查是否是最后一个元素，如果是则同步激活 done
    if (this.currentIndex === this.currentArray.length - 1) {
      const donePort = this.outControlPorts.get(DistributeNodePorts.OUT_CONTROL.DONE)
      if (donePort) {
        donePort.write(null)
      }
    }

    // 移动到下一个
    this.currentIndex++

    return {
      [DistributeNodePorts.OUT.ITEM]: item,
      [DistributeNodePorts.OUT.INDEX]: index,
    }
  }
}
