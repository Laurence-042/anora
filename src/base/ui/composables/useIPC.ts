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
  private listening = false

  start(): void {
    if (this.listening) return
    window.addEventListener('message', this.boundHandle)
    this.listening = true
  }

  stop(): void {
    if (!this.listening) return
    window.removeEventListener('message', this.boundHandle)
    this.listening = false
    this.handlers.clear()
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const data = event.data as IPCMessage
    if (!data || !data.type) return
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

  postMessage(type: string, payload?: unknown): void {
    const message: IPCMessage = { type: type as IPCMessage['type'], payload }

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
