/**
 * IPC 消息处理器
 * 提供从外部（如 Godot-WRY）控制执行器的接口
 */
import { useGraphStore } from '@/stores/graph'
import type { IPCMessage } from '@/base/runtime/types'

/**
 * IPC 消息处理回调
 */
type IPCHandler = (message: IPCMessage) => void | Promise<void>

/**
 * IPC 控制器类
 * 监听 window message 事件，处理执行控制命令
 */
export class IPCController {
  private store: ReturnType<typeof useGraphStore> | null = null
  private handlers: Map<string, IPCHandler[]> = new Map()
  private isListening: boolean = false

  /**
   * 初始化 IPC 控制器
   */
  initialize(store: ReturnType<typeof useGraphStore>): void {
    this.store = store

    if (!this.isListening) {
      window.addEventListener('message', this.handleMessage.bind(this))
      this.isListening = true
    }

    // 注册默认处理器
    this.registerDefaultHandlers()
  }

  /**
   * 销毁 IPC 控制器
   */
  destroy(): void {
    if (this.isListening) {
      window.removeEventListener('message', this.handleMessage.bind(this))
      this.isListening = false
    }
    this.handlers.clear()
  }

  /**
   * 处理收到的消息
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    // 安全检查：可以添加 origin 验证
    const data = event.data as IPCMessage

    if (!data || !data.type) {
      return
    }

    console.log('[IPC] Received message:', data.type, data.payload)

    const handlers = this.handlers.get(data.type) ?? []
    for (const handler of handlers) {
      try {
        await handler(data)
      } catch (error) {
        console.error(`[IPC] Handler error for ${data.type}:`, error)
      }
    }
  }

  /**
   * 注册消息处理器
   */
  on(type: string, handler: IPCHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, [])
    }
    this.handlers.get(type)!.push(handler)

    // 返回取消订阅函数
    return () => {
      const handlers = this.handlers.get(type)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    }
  }

  /**
   * 发送消息到外部
   */
  postMessage(type: string, payload?: unknown): void {
    const message: IPCMessage = { type: type as IPCMessage['type'], payload }

    // 尝试 godot-wry 的 ipc
    if (
      typeof (window as Window & { ipc?: { postMessage: (msg: string) => void } }).ipc
        ?.postMessage === 'function'
    ) {
      ;(window as Window & { ipc?: { postMessage: (msg: string) => void } }).ipc!.postMessage(
        JSON.stringify(message),
      )
    }

    // 也可以通过 postMessage 发送给 parent（如果在 iframe 中）
    if (window.parent !== window) {
      window.parent.postMessage(message, '*')
    }
  }

  /**
   * 注册默认的 IPC 处理器
   */
  private registerDefaultHandlers(): void {
    if (!this.store) return

    // 执行命令
    this.on('execute', async () => {
      await this.store!.startExecution()
      this.postMessage('execution-started')
    })

    // 停止命令
    this.on('stop', () => {
      this.store!.stopExecution()
      this.postMessage('execution-stopped')
    })

    // 获取状态
    this.on('getState', () => {
      const state = {
        status: this.store!.executorStatus,
        iteration: this.store!.currentIteration,
        nodeCount: this.store!.nodes.length,
        executingNodes: Array.from(this.store!.executingNodeIds),
      }
      this.postMessage('state', state)
    })

    // 快照（暂未实现）
    this.on('snapshot', () => {
      // TODO: 实现图快照
      this.postMessage('snapshot', { error: 'Not implemented' })
    })

    // 加载快照（暂未实现）
    this.on('loadSnapshot', () => {
      // TODO: 实现加载快照
      this.postMessage('loadSnapshot', { error: 'Not implemented' })
    })
  }
}

// 单例实例
export const ipcController = new IPCController()

/**
 * 组合式函数：使用 IPC
 */
export function useIPC() {
  const store = useGraphStore()

  // 确保初始化
  ipcController.initialize(store)

  return {
    /**
     * 注册消息处理器
     */
    on: ipcController.on.bind(ipcController),

    /**
     * 发送消息
     */
    postMessage: ipcController.postMessage.bind(ipcController),

    /**
     * 销毁（在组件卸载时调用）
     */
    destroy: ipcController.destroy.bind(ipcController),
  }
}
