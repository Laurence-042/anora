import type { ExecutorContext } from '../../../../base/runtime/types'
import { BackendNode } from '../../../../base/runtime/nodes'
import { NullPort } from '../../../../base/runtime/ports'
import { AnoraRegister } from '../../../../base/runtime/registry'

/**
 * WRY IPC 消息结构
 */
interface WryMessage {
  /** 消息类型/方法名 */
  type: string
  /** 消息 ID，用于匹配响应 */
  id: string
  /** 消息负载 */
  payload: unknown
}

/**
 * WRY IPC 响应结构
 */
interface WryResponse {
  /** 对应的消息 ID */
  id: string
  /** 是否成功 */
  success: boolean
  /** 响应数据 */
  data?: unknown
  /** 错误信息 */
  error?: string
}

/** WryIpcNode 入 Port 类型（动态） */
type WryIpcInput = Record<string, unknown>

/** WryIpcNode 出 Port 类型 */
interface WryIpcOutput {
  /** 后端返回的响应数据 */
  response: unknown
  /** 是否成功 */
  success: boolean
}

/** 参数定义 */
export interface WryIpcParam {
  /** 参数名（也是 Port 名） */
  name: string
  /** 参数类型提示（可选，用于 UI 显示） */
  type?: string
}

/** WryIpcNode context 类型 */
export interface WryIpcContext {
  /** 要调用的方法名 */
  method: string
  /** 参数列表（动态生成入 Port） */
  params: WryIpcParam[]
}

/**
 * 生成唯一消息 ID
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * WryIpcNode - 通过 WRY 与 Godot 后端通信的节点
 *
 * 使用 godot-wry 提供的 IPC 机制与 Godot 后端进行双向通信
 *
 * context:
 *   - method (string): 要调用的后端方法名
 *   - params (WryIpcParam[]): 参数列表，动态生成入 Port
 *
 * 入 Port: 根据 params 动态生成
 *
 * 出 Port:
 *   - response (any): 后端返回的响应数据
 *   - success (boolean): 调用是否成功
 *
 * 出控制 Port:
 *   - done (null): 调用完成后激活
 *   - error (null): 调用失败时激活
 */
@AnoraRegister('godot-wry.WryIpcNode')
export class WryIpcNode extends BackendNode<WryIpcInput, WryIpcOutput> {
  /** 超时时间（毫秒） */
  private timeout: number = 30000

  /** 等待中的响应回调 */
  private static pendingResponses: Map<string, (response: WryResponse) => void> = new Map()

  /** 是否已初始化事件监听 */
  private static isListenerInitialized: boolean = false

  constructor(id?: string, label?: string) {
    super(id, label ?? 'WryIpc')

    // 出 Port
    this.addOutPort('response', new NullPort(this))
    this.addOutPort('success', new NullPort(this))

    // 出控制 Port
    this.addOutControlPort('done', new NullPort(this))
    this.addOutControlPort('error', new NullPort(this))

    // 默认 context（无参数）
    this._context = { method: '', params: [] } as WryIpcContext

    // 初始化全局事件监听器
    WryIpcNode.initializeListener()
  }

  /**
   * 获取当前方法名
   */
  getMethod(): string {
    return (this._context as WryIpcContext)?.method ?? ''
  }

  /**
   * 获取当前参数列表
   */
  getParams(): WryIpcParam[] {
    return (this._context as WryIpcContext)?.params ?? []
  }

  /**
   * 设置方法名和参数
   * 会根据 params 动态更新入 Port
   */
  setMethodAndParams(method: string, params: WryIpcParam[]): void {
    const oldParams = this.getParams()

    // 更新 context
    this._context = { method, params }

    // 同步入 Port
    this._syncInPorts(oldParams, params)

    // 触发变更事件
    this._emitContextChange('method', (this._context as WryIpcContext).method, method)
    this._emitContextChange('params', oldParams, params)
  }

  /**
   * 仅设置方法名
   */
  setMethod(method: string): void {
    this.setContextField('method', method)
  }

  /**
   * 设置参数列表（会同步更新入 Port）
   */
  setParams(params: WryIpcParam[]): void {
    const oldParams = this.getParams()

    // 更新 context 中的 params
    this._context = {
      ...((this._context as WryIpcContext) ?? { method: '' }),
      params,
    }

    // 同步入 Port
    this._syncInPorts(oldParams, params)

    // 触发变更事件
    this._emitContextChange('params', oldParams, params)
  }

  /**
   * 同步入 Port 与 params 定义
   */
  private _syncInPorts(oldParams: WryIpcParam[], newParams: WryIpcParam[]): void {
    const oldNames = new Set(oldParams.map((p) => p.name))
    const newNames = new Set(newParams.map((p) => p.name))

    // 移除不再需要的 Port
    for (const name of oldNames) {
      if (!newNames.has(name)) {
        this.inPorts.delete(name)
      }
    }

    // 添加新的 Port
    for (const param of newParams) {
      if (!this.inPorts.has(param.name)) {
        this.addInPort(param.name, new NullPort(this))
      }
    }
  }

  /**
   * 设置超时时间
   */
  setTimeout(ms: number): void {
    this.timeout = ms
  }

  /**
   * 初始化全局事件监听器（只执行一次）
   */
  private static initializeListener(): void {
    if (WryIpcNode.isListenerInitialized) return
    if (typeof document === 'undefined') return

    // 监听来自 Godot 后端的响应
    document.addEventListener('wry-response', ((event: CustomEvent<string>) => {
      try {
        const response: WryResponse = JSON.parse(event.detail)
        const callback = WryIpcNode.pendingResponses.get(response.id)
        if (callback) {
          callback(response)
          WryIpcNode.pendingResponses.delete(response.id)
        }
      } catch (e) {
        console.error('[WryIpcNode] Failed to parse response:', e)
      }
    }) as EventListener)

    WryIpcNode.isListenerInitialized = true
  }

  /**
   * 检查 WRY IPC 是否可用
   */
  private isWryAvailable(): boolean {
    return typeof window !== 'undefined' && 'ipc' in window
  }

  /**
   * 发送消息到 Godot 后端
   */
  private async sendToGodot(method: string, payload: unknown): Promise<WryResponse> {
    if (!this.isWryAvailable()) {
      return {
        id: '',
        success: false,
        error: 'WRY IPC not available. Make sure running in godot-wry environment.',
      }
    }

    const messageId = generateMessageId()
    const message: WryMessage = {
      type: method,
      id: messageId,
      payload,
    }

    return new Promise<WryResponse>((resolve) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        WryIpcNode.pendingResponses.delete(messageId)
        resolve({
          id: messageId,
          success: false,
          error: `Request timeout after ${this.timeout}ms`,
        })
      }, this.timeout)

      // 注册响应回调
      WryIpcNode.pendingResponses.set(messageId, (response) => {
        clearTimeout(timeoutId)
        resolve(response)
      })

      // 发送消息
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ipc = (window as any).ipc as { postMessage: (msg: string) => void }
        ipc.postMessage(JSON.stringify(message))
      } catch (e) {
        clearTimeout(timeoutId)
        WryIpcNode.pendingResponses.delete(messageId)
        resolve({
          id: messageId,
          success: false,
          error: `Failed to send message: ${e}`,
        })
      }
    })
  }

  async activateCore(
    _executorContext: ExecutorContext,
    inData: WryIpcInput,
  ): Promise<WryIpcOutput> {
    // 从 context 获取方法名
    const method = this.getMethod()

    // 从动态入 Port 组装 payload
    const params = this.getParams()
    const payload: Record<string, unknown> = {}
    for (const param of params) {
      payload[param.name] = inData[param.name]
    }

    if (!method) {
      // 激活 error 控制 Port
      const errorPort = this.outControlPorts.get('error')
      if (errorPort) {
        errorPort.write(null)
      }
      return {
        response: 'Method not specified',
        success: false,
      }
    }

    const response = await this.sendToGodot(method, payload)

    if (response.success) {
      // 激活 done 控制 Port
      const donePort = this.outControlPorts.get('done')
      if (donePort) {
        donePort.write(null)
      }
    } else {
      // 激活 error 控制 Port
      const errorPort = this.outControlPorts.get('error')
      if (errorPort) {
        errorPort.write(null)
      }
    }

    return {
      response: response.success ? response.data : response.error,
      success: response.success,
    }
  }
}

/**
 * WryEventNode - 监听来自 Godot 后端的事件
 *
 * 当 Godot 后端主动发送事件时，此节点会被激活
 *
 * context: { eventType: string } - 监听的事件类型
 *
 * 出 Port:
 *   - eventData (any): 事件携带的数据
 *   - eventType (string): 事件类型
 */
@AnoraRegister('godot-wry.WryEventNode')
export class WryEventNode extends BackendNode<
  Record<string, never>,
  { eventData: unknown; eventType: string }
> {
  /** 事件处理器 */
  private eventHandler: ((event: Event) => void) | null = null

  /** 监听的事件类型 */
  private eventType: string = ''

  /** 待处理的事件队列 */
  private pendingEvents: { type: string; data: unknown }[] = []

  constructor(id?: string, label?: string) {
    super(id, label ?? 'WryEvent')

    // 出 Port
    this.addOutPort('eventData', new NullPort(this))
    this.addOutPort('eventType', new NullPort(this))

    // 出控制 Port
    this.addOutControlPort('triggered', new NullPort(this))
  }

  /**
   * 设置监听的事件类型
   */
  setEventType(eventType: string): void {
    // 移除旧的监听器
    if (this.eventHandler && this.eventType) {
      document.removeEventListener(`wry-event-${this.eventType}`, this.eventHandler)
    }

    this.eventType = eventType
    this.context = { eventType }

    // 添加新的监听器
    if (eventType && typeof document !== 'undefined') {
      this.eventHandler = ((event: CustomEvent<string>) => {
        try {
          const data = JSON.parse(event.detail)
          this.pendingEvents.push({ type: eventType, data })
        } catch {
          this.pendingEvents.push({ type: eventType, data: event.detail })
        }
      }) as EventListener

      document.addEventListener(`wry-event-${eventType}`, this.eventHandler)
    }
  }

  /**
   * 获取监听的事件类型
   */
  getEventType(): string {
    return this.eventType
  }

  /**
   * 检查是否有待处理的事件
   */
  hasPendingEvent(): boolean {
    return this.pendingEvents.length > 0
  }

  async activateCore(
    _executorContext: ExecutorContext,
  ): Promise<{ eventData: unknown; eventType: string }> {
    const event = this.pendingEvents.shift()

    if (event) {
      // 激活 triggered 控制 Port
      const triggeredPort = this.outControlPorts.get('triggered')
      if (triggeredPort) {
        triggeredPort.write(null)
      }

      return {
        eventData: event.data,
        eventType: event.type,
      }
    }

    return {
      eventData: null,
      eventType: '',
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.eventHandler && this.eventType) {
      document.removeEventListener(`wry-event-${this.eventType}`, this.eventHandler)
      this.eventHandler = null
    }
    this.pendingEvents = []
  }
}
