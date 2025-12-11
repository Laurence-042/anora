/**
 * Demo mode IPC controller for Godot-wry integration
 * Allows external control of demo playback via IPC messages
 */

import type { DemoControlCommand } from '@/base/runtime/demo'

export interface DemoIPCMessage {
  action: 'demo_control'
  command: DemoControlCommand
  payload?: unknown
}

export interface DemoIPCHandler {
  /** Execute a demo control command */
  executeCommand: (command: DemoControlCommand, payload?: unknown) => Promise<void>
  /** Get current demo state */
  getState: () => {
    isPlaying: boolean
    currentStep: number
    totalSteps: number
  }
}

/**
 * Setup IPC listener for demo control from Godot
 */
export function setupDemoIPC(handler: DemoIPCHandler): () => void {
  const messageHandler = async (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as DemoIPCMessage

      if (data.action === 'demo_control') {
        await handler.executeCommand(data.command, data.payload)

        // Send response back to Godot
        sendDemoResponse({
          success: true,
          state: handler.getState(),
        })
      }
    } catch (error) {
      console.error('Demo IPC error:', error)
      sendDemoResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Listen for messages from Godot
  window.addEventListener('message', messageHandler)

  // Return cleanup function
  return () => {
    window.removeEventListener('message', messageHandler)
  }
}

/**
 * Send response back to Godot via IPC
 */
function sendDemoResponse(response: Record<string, unknown>): void {
  if (typeof (window as unknown as { ipc?: unknown }).ipc !== 'undefined') {
    ;(window as unknown as { ipc: { postMessage: (msg: string) => void } }).ipc.postMessage(
      JSON.stringify({
        type: 'demo_response',
        ...response,
      }),
    )
  }
}

/**
 * Example Godot integration code (GDScript):
 *
 * ```gdscript
 * extends Node
 *
 * @onready var webview = $WebView
 * var current_step = 0
 *
 * func _ready():
 *     webview.connect("ipc_message", self, "_on_ipc_message")
 *     # Start demo in paused mode, ready for control
 *
 * func _on_ipc_message(message):
 *     var data = JSON.parse_string(message)
 *     if data.type == "demo_response":
 *         current_step = data.state.currentStep
 *         print("Demo at step: %d / %d" % [data.state.currentStep, data.state.totalSteps])
 *
 * func advance_demo():
 *     var message = {
 *         "action": "demo_control",
 *         "command": "next"
 *     }
 *     webview.post_message(JSON.stringify(message))
 *
 * func retreat_demo():
 *     var message = {
 *         "action": "demo_control",
 *         "command": "previous"
 *     }
 *     webview.post_message(JSON.stringify(message))
 *
 * func play_demo():
 *     var message = {
 *         "action": "demo_control",
 *         "command": "play"
 *     }
 *     webview.post_message(JSON.stringify(message))
 *
 * func pause_demo():
 *     var message = {
 *         "action": "demo_control",
 *         "command": "pause"
 *     }
 *     webview.post_message(JSON.stringify(message))
 *
 * func goto_step(step: int):
 *     var message = {
 *         "action": "demo_control",
 *         "command": "goto",
 *         "payload": step
 *     }
 *     webview.post_message(JSON.stringify(message))
 *
 * # Example: Advance demo when spacebar is pressed
 * func _input(event):
 *     if event is InputEventKey and event.pressed:
 *         if event.keycode == KEY_SPACE:
 *             advance_demo()
 *         elif event.keycode == KEY_LEFT:
 *             retreat_demo()
 *         elif event.keycode == KEY_P:
 *             if is_playing:
 *                 pause_demo()
 *             else:
 *                 play_demo()
 * ```
 */
