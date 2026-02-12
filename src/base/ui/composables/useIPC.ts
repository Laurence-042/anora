/**
 * Modern IPC composable
 * - Provides a lightweight window.postMessage / godot-wry ipc wrapper
 * - Consumers can register handlers and post messages
 * - Does not assume any particular commands; replay-specific commands should
 *   be implemented by a higher-level composable (see useReplayIPC.ts)
 */
import type { IPCMessage } from '@/base/runtime/types'

type IPCHandler = (msg: IPCMessage) => void | Promise<void>

/**
 * IPC Channel abstraction for different communication transports
 */
interface IPCChannel {
  readonly name: string
  send(message: IPCMessage): void
  startListening(handler: (msg: IPCMessage) => Promise<void>): void
  stopListening(): void
}

/**
 * Standard window.postMessage channel (for iframe, parent frame, testing)
 */
class WindowPostMessageChannel implements IPCChannel {
  readonly name = 'window.postMessage'
  private handler: ((event: MessageEvent) => Promise<void>) | null = null

  send(message: IPCMessage): void {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*')
    }
  }

  startListening(handler: (msg: IPCMessage) => Promise<void>): void {
    this.handler = async (event: MessageEvent) => {
      console.log(`[IPC:${this.name}] received:`, JSON.stringify(event.data))
      const data = event.data as IPCMessage
      if (!data || !data.type) {
        console.warn(`[IPC:${this.name}] ignored invalid message (no type):`, event.data)
        return
      }
      await handler(data)
    }
    window.addEventListener('message', this.handler)
  }

  stopListening(): void {
    if (this.handler) {
      window.removeEventListener('message', this.handler)
      this.handler = null
    }
  }
}

/**
 * Godot-WRY channel (for Godot integration via WRY webview)
 * - Receives messages via document.dispatchEvent (CustomEvent)
 * - Sends messages via window.ipc.postMessage
 */
class GodotWryChannel implements IPCChannel {
  readonly name = 'godot-wry'
  private handler: ((event: Event) => Promise<void>) | null = null

  send(message: IPCMessage): void {
    try {
      const winAny = window as unknown as { ipc?: { postMessage: (msg: string) => void } }
      if (winAny.ipc && typeof winAny.ipc.postMessage === 'function') {
        winAny.ipc.postMessage(JSON.stringify(message))
      }
    } catch {
      // ignore - godot-wry bridge not available
    }
  }

  startListening(handler: (msg: IPCMessage) => Promise<void>): void {
    this.handler = async (event: Event) => {
      const customEvent = event as CustomEvent
      console.log(`[IPC:${this.name}] received:`, JSON.stringify(customEvent.detail))

      // Parse godot-wry message format
      let data: IPCMessage
      if (typeof customEvent.detail === 'string') {
        try {
          data = JSON.parse(customEvent.detail)
        } catch (err) {
          console.error(`[IPC:${this.name}] failed to parse message`, err)
          return
        }
      } else {
        data = customEvent.detail
      }

      if (!data || !data.type) {
        console.warn(`[IPC:${this.name}] ignored invalid message (no type):`, data)
        return
      }
      await handler(data)
    }
    document.addEventListener('message', this.handler)
  }

  stopListening(): void {
    if (this.handler) {
      document.removeEventListener('message', this.handler)
      this.handler = null
    }
  }
}

/**
 * IPC message types for internal use
 */
export const IPCMessageTypes = {
  /** Sent when IPC is ready to receive messages */
  IPC_READY: 'ipc:ready',
} as const

class IPCController {
  private handlers = new Map<string, IPCHandler[]>()
  private listening = false

  /** Registered IPC channels - add new channels here for future adapters */
  private channels: IPCChannel[] = [new WindowPostMessageChannel(), new GodotWryChannel()]

  start(): void {
    if (this.listening) return
    console.log('[IPC] started listening')

    // Start listening on all channels
    const boundDispatch = this.dispatchToHandlers.bind(this)
    for (const channel of this.channels) {
      channel.startListening(boundDispatch)
    }

    this.listening = true

    // Broadcast ready message to all channels
    console.log('[IPC] broadcasting ready message to all channels')
    this.postMessage(IPCMessageTypes.IPC_READY, { timestamp: Date.now() })
  }

  stop(): void {
    if (!this.listening) return

    // Stop listening on all channels
    for (const channel of this.channels) {
      channel.stopListening()
    }

    this.listening = false
    this.handlers.clear()
  }

  private async dispatchToHandlers(data: IPCMessage): Promise<void> {
    const handlers = this.handlers.get(data.type) ?? []
    if (handlers.length === 0) {
      console.warn(`[IPC] no handlers for message type: ${data.type}`, data)
    }
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

    // Send message through all channels
    for (const channel of this.channels) {
      try {
        channel.send(message)
      } catch (err) {
        console.warn(`[IPC:${channel.name}] failed to send message`, err)
      }
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
