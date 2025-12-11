import { BaseNode } from './BaseNode'
import type { NodeInput, NodeOutput, NodeControl } from './BaseNode'
import type { ExecutorContext } from '../types'

/**
 * WebNode - 可以直接在浏览器环境中运行的节点
 * 其子类大多是预置的通用节点
 */
export abstract class WebNode<
  TInput = NodeInput,
  TOutput = NodeOutput,
  TControl = NodeControl,
  TContext = unknown,
> extends BaseNode<TInput, TOutput, TControl, TContext> {
  static override typeId: string = 'WebNode'
}

/**
 * BackendNode - 需要调用后端功能的节点
 * 从 executorContext 获取 IPC 类型，然后使用对应的逻辑与后端通信
 */
export abstract class BackendNode<
  TInput = NodeInput,
  TOutput = NodeOutput,
  TControl = NodeControl,
  TContext = unknown,
> extends BaseNode<TInput, TOutput, TControl, TContext> {
  static override typeId: string = 'BackendNode'

  /**
   * 获取 IPC 通信方法
   */
  protected getIpcMethod(executorContext: ExecutorContext): string {
    return executorContext.ipcTypeId
  }

  /**
   * 发送 IPC 消息到后端
   */
  protected async sendIpcMessage(
    executorContext: ExecutorContext,
    message: unknown,
  ): Promise<unknown> {
    const ipcType = this.getIpcMethod(executorContext)

    switch (ipcType) {
      case 'wry':
        return this.sendWryMessage(message)
      case 'postMessage':
        return this.sendPostMessage(message)
      default:
        throw new Error(`Unknown IPC type: ${ipcType}`)
    }
  }

  /**
   * 通过 WRY (godot-wry) 发送消息
   */
  protected async sendWryMessage(message: unknown): Promise<unknown> {
    // 检查 ipc 是否可用
    if (typeof window !== 'undefined' && 'ipc' in window) {
      const ipc = (window as { ipc: { postMessage: (msg: string) => void } }).ipc
      ipc.postMessage(JSON.stringify(message))
      // WRY 是单向的，需要通过事件监听响应
      return new Promise((resolve) => {
        const handler = (event: Event) => {
          const customEvent = event as CustomEvent
          resolve(JSON.parse(customEvent.detail))
          document.removeEventListener('message', handler)
        }
        document.addEventListener('message', handler)
      })
    }
    throw new Error('WRY IPC not available')
  }

  /**
   * 通过 postMessage 发送消息
   */
  protected async sendPostMessage(message: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        resolve(event.data)
        window.removeEventListener('message', handler)
      }
      window.addEventListener('message', handler)
      window.parent.postMessage(message, '*')
    })
  }
}
