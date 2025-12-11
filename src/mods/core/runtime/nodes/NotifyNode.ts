import type { ExecutorContext } from '../../../../base/runtime/types'
import { WebNode } from '../../../../base/runtime/nodes'
import { AnoraRegister } from '../../../../base/runtime/registry'
import { ConsoleLogNodePorts } from './PortNames'
import { StringPort } from '../ports'
import { ElNotification } from 'element-plus'

/** NotifyNode 入 Port 类型 */
interface NotifyInput {
  [ConsoleLogNodePorts.IN.MESSAGE]: string
}

/** 通知类型 */
export type NotifyType = 'success' | 'warning' | 'info' | 'error'

/** NotifyNode Context 类型 */
interface NotifyContext {
  title: string
  type: NotifyType
  duration: number
}

/**
 * NotifyNode - 通知节点
 * 使用 Element Plus ElNotification 显示通知
 * 适合无编程经验的用户进行可视化调试
 *
 * 入 Port: message (string)
 * context: { title: string, type: NotifyType, duration: number }
 */
@AnoraRegister('core.NotifyNode')
export class NotifyNode extends WebNode<
  NotifyInput,
  Record<string, never>,
  Record<string, never>,
  NotifyContext
> {
  static override meta = { icon: '🔔', category: 'io' }

  constructor(id?: string, label?: string) {
    super(id, label ?? 'Notify')

    // 入 Port
    this.addInPort(ConsoleLogNodePorts.IN.MESSAGE, new StringPort(this))

    // 默认配置
    this.context = {
      title: '调试信息',
      type: 'info',
      duration: 3000,
    }
  }

  /**
   * 设置标题
   */
  setTitle(title: string): void {
    this.setContextField('title', title)
  }

  /**
   * 获取标题
   */
  getTitle(): string {
    return this.context?.title ?? '调试信息'
  }

  /**
   * 设置通知类型
   */
  setType(type: NotifyType): void {
    this.setContextField('type', type)
  }

  /**
   * 获取通知类型
   */
  getType(): NotifyType {
    return this.context?.type ?? 'info'
  }

  /**
   * 设置显示时长
   */
  setDuration(duration: number): void {
    this.setContextField('duration', duration)
  }

  /**
   * 获取显示时长
   */
  getDuration(): number {
    return this.context?.duration ?? 3000
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: NotifyInput,
  ): Promise<Record<string, never>> {
    const message = inData[ConsoleLogNodePorts.IN.MESSAGE] ?? ''
    const title = this.getTitle()
    const type = this.getType()
    const duration = this.getDuration()

    // 同时输出到控制台
    console.log(`[Notify:${type}] ${title}: ${message}`)

    // 显示通知
    ElNotification({
      title,
      message,
      type,
      duration,
      position: 'bottom-right',
    })

    return {}
  }
}
