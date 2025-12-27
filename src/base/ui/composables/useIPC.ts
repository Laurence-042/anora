/**
 * Modern IPC composable
 * - Provides a lightweight window.postMessage / godot-wry ipc wrapper
 * - Consumers can register handlers and post messages
 * - Does not assume any particular commands; replay-specific commands should
 *   be implemented by a higher-level composable (see useReplayIPC.ts)
 */
import type { IPCMessage } from '@/base/runtime/types'

type IPCHandler = (msg: IPCMessage) => void | Promise<void>

class IPCController {
  private handlers = new Map<string, IPCHandler[]>()
  private boundHandle = this.handleMessage.bind(this)
  private boundDocumentHandle = this.handleDocumentMessage.bind(this)
  private listening = false

  start(): void {
    if (this.listening) return
    console.log('[IPC] started listening')

    // Standard window.postMessage (for iframe, parent frame, testing)
    window.addEventListener('message', this.boundHandle)

    // godot-wry compatibility: listens to document.dispatchEvent
    document.addEventListener('message', this.boundDocumentHandle)

    this.listening = true
  }

  stop(): void {
    if (!this.listening) return
    window.removeEventListener('message', this.boundHandle)
    document.removeEventListener('message', this.boundDocumentHandle)
    this.listening = false
    this.handlers.clear()
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    console.log('[IPC] received window.postMessage:', JSON.stringify(event.data))
    const data = event.data as IPCMessage
    if (!data || !data.type) return
    await this.dispatchToHandlers(data)
  }

  private async handleDocumentMessage(event: Event): Promise<void> {
    const customEvent = event as CustomEvent
    console.log('[IPC] received document.dispatchEvent:', JSON.stringify(customEvent.detail))

    // Parse godot-wry message format
    let data: IPCMessage
    if (typeof customEvent.detail === 'string') {
      try {
        data = JSON.parse(customEvent.detail)
      } catch (err) {
        console.error('[IPC] failed to parse document message', err)
        return
      }
    } else {
      data = customEvent.detail
    }

    if (!data || !data.type) return
    await this.dispatchToHandlers(data)
  }

  private async dispatchToHandlers(data: IPCMessage): Promise<void> {
    const handlers = this.handlers.get(data.type) ?? []
    for (const h of handlers) {
      try {
        await h(data)
      } catch (err) {
        console.error('[IPC] handler error', err)
      }
    }
  }

  on(type: string, handler: IPCHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, [])
    this.handlers.get(type)!.push(handler)
    return () => {
      const arr = this.handlers.get(type)!
      const idx = arr.indexOf(handler)
      if (idx >= 0) arr.splice(idx, 1)
    }
  }

  postMessage(type: string, data?: unknown): void {
    const message: IPCMessage = { type: type as IPCMessage['type'], data }

    // godot-wry ipc bridge
    try {
      const winAny = window as unknown as { ipc?: { postMessage: (msg: string) => void } }
      if (winAny.ipc && typeof winAny.ipc.postMessage === 'function') {
        winAny.ipc.postMessage(JSON.stringify(message))
      }
    } catch {
      // ignore
    }

    // parent frame
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*')
    }
  }
}

const ipcController = new IPCController()

export function useIPC() {
  // Start listening on first use
  ipcController.start()

  return {
    on: ipcController.on.bind(ipcController),
    postMessage: ipcController.postMessage.bind(ipcController),
    stop: ipcController.stop.bind(ipcController),
  }
}

export { ipcController }
