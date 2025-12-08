import { ActivationReadyStatus, DataType } from '../../../../base/runtime/types'
import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { DistributeNodePorts } from './PortNames'

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
export class DistributeNode extends WebNode<DistributeInput, DistributeOutput> {
  static typeId: string = 'core.DistributeNode'

  /** 当前正在处理的数组 */
  private currentArray: unknown[] = []

  /** 当前索引 */
  private currentIndex: number = 0

  /** 是否已完成所有元素分发 */
  private isCompleted: boolean = false

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Distribute')

    // 入 Port
    this.addInPort(DistributeNodePorts.IN.ARRAY, DataType.ARRAY)

    // 出 Port
    this.addOutPort(DistributeNodePorts.OUT.ITEM, DataType.STRING)
    this.addOutPort(DistributeNodePorts.OUT.INDEX, DataType.INTEGER)

    // 出控制 Port - 完成时激活
    this.addOutControlPort(DistributeNodePorts.OUT_CONTROL.DONE, DataType.NULL)
  }

  /**
   * 设置输出元素的类型
   */
  setItemType(dataType: DataType): void {
    this.outPorts.delete(DistributeNodePorts.OUT.ITEM)
    this.addOutPort(DistributeNodePorts.OUT.ITEM, dataType)
  }

  /**
   * 重置分发状态
   */
  reset(): void {
    this.currentArray = []
    this.currentIndex = 0
    this.isCompleted = false
  }

  /**
   * 覆盖激活就绪检查
   * 需要处理多次激活的情况
   */
  override checkActivationReady(connectedPorts: Set<string>): ActivationReadyStatus {
    // 如果正在分发中，继续分发
    if (this.currentArray.length > 0 && this.currentIndex < this.currentArray.length) {
      return ActivationReadyStatus.Ready
    }

    // 如果已完成，不再就绪
    if (this.isCompleted) {
      return ActivationReadyStatus.NotReady
    }

    // 等待新数组输入
    return super.isReadyToActivate(connectedPorts)
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: DistributeInput,
  ): Promise<DistributeOutput> {
    // 如果有新的数组输入，重新开始
    const inputArray = inData[DistributeNodePorts.IN.ARRAY]
    if (inputArray !== undefined) {
      if (Array.isArray(inputArray)) {
        this.currentArray = inputArray
        this.currentIndex = 0
        this.isCompleted = false
      } else {
        throw new Error('Input must be an array')
      }
    }

    // 如果数组为空或已分发完毕
    if (this.currentIndex >= this.currentArray.length) {
      this.isCompleted = true
      // 激活 done 控制 Port
      const donePort = this.outControlPorts.get(DistributeNodePorts.OUT_CONTROL.DONE)
      if (donePort) {
        donePort.write(null)
      }
      return {}
    }

    // 输出当前元素
    const item = this.currentArray[this.currentIndex]
    const index = this.currentIndex

    // 移动到下一个
    this.currentIndex++

    return {
      [DistributeNodePorts.OUT.ITEM]: item,
      [DistributeNodePorts.OUT.INDEX]: index,
    }
  }
}
