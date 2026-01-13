import { useIPC } from './useIPC'
import type { DemoRecording, ReplayExecutor } from '@/base/runtime/demo'
import type { IPCMessage } from '@/base/runtime/types'
import { ExecutorEventType } from '@/base/runtime/executor'

// IPC 消息数据类型
interface SeekData {
  time?: number
  index?: number
}

interface KeyframeData {
  keyframeIndex?: number
  before?: boolean
}

interface PlayForData {
  duration?: number
}

/**
 * Replay IPC composable
 * - Registers replay-related IPC handlers on top of the base IPC controller
 * - Consumers must provide callbacks to operate on the local ReplayExecutor / UI state
 */
export function useReplayIPC(options: {
  getExecutor: () => unknown | null
  applyStateAtIndex: (idx: number) => void
  loadRecording?: (data: DemoRecording) => Promise<void>
  play: () => void
  getKeyframes?: () => Array<{
    time: number
    startIndex: number
    endIndex: number
    percentage: number
  }>
}) {
  const { on, postMessage } = useIPC()
  const unsubscribers: Array<() => void> = []

  // play
  unsubscribers.push(
    on('replay.play', async () => {
      const ex = options.getExecutor() as ReplayExecutor | null
      if (!ex) return
      if (ex.isPaused) ex.resume()
      postMessage('replay.played')
    }),
  )

  // pause
  unsubscribers.push(
    on('replay.pause', async () => {
      const ex = options.getExecutor() as ReplayExecutor | null
      ex?.pause()
      postMessage('replay.paused')
    }),
  )

  // toggle
  unsubscribers.push(
    on('replay.toggle', async () => {
      const ex = options.getExecutor() as ReplayExecutor | null
      if (!ex) return
      if (ex.isPlaying) ex.pause()
      else if (ex.isPaused) ex.resume()
      postMessage('replay.toggled')
    }),
  )

  // seek by time
  unsubscribers.push(
    on('replay.seek', async (msg) => {
      const ex = options.getExecutor() as ReplayExecutor | null
      const data = (msg as IPCMessage<SeekData>).data ?? {}
      const time = typeof data.time === 'number' ? data.time : undefined
      const index = typeof data.index === 'number' ? data.index : undefined
      if (time !== undefined && ex) {
        const targetIndex = ex.seekToTime(time)
        options.applyStateAtIndex?.(targetIndex)
        postMessage('replay.seeked', { time, index: targetIndex })
        return
      }
      if (index !== undefined && ex) {
        // rebuild UI state at index
        options.applyStateAtIndex(index)
        postMessage('replay.seeked', { index })
        return
      }
      postMessage('replay.seeked', { error: 'invalid-data' })
    }),
  )

  // seek to keyframe
  unsubscribers.push(
    on('replay.seekToKeyframe', async (msg) => {
      const data = (msg as IPCMessage<KeyframeData>).data ?? {}
      const kfIndex = typeof data.keyframeIndex === 'number' ? data.keyframeIndex : -1
      const before = !!data.before
      const keyframes = options.getKeyframes ? options.getKeyframes() : []
      if (kfIndex < 0 || kfIndex >= keyframes.length) {
        postMessage('replay.seekToKeyframe', { error: 'out-of-range' })
        return
      }
      const kf = keyframes[kfIndex]
      if (!kf) {
        postMessage('replay.seekToKeyframe', { error: 'invalid-keyframe' })
        return
      }
      const time = before ? Math.max(0, kf.time - 1) : kf.time
      const ex = options.getExecutor() as ReplayExecutor | null
      if (!ex) {
        postMessage('replay.seekToKeyframe', { error: 'no-executor' })
        return
      }
      const targetIndex = ex.seekToTime(time)
      options.applyStateAtIndex(targetIndex)
      postMessage('replay.seekToKeyframe', { keyframeIndex: kfIndex, index: targetIndex, time })
    }),
  )

  // play for duration (ms), or play to end if duration is -1
  const playForTimers = new Map<number, number>()
  const playToEndHandlers = new Map<number, () => void>()
  let playToEndCounter = 0

  unsubscribers.push(
    on('replay.playFor', async (msg) => {
      const data = (msg as IPCMessage<PlayForData>).data ?? {}
      const duration = Number(data.duration) || 0
      const ex = options.getExecutor() as ReplayExecutor | null
      if (!ex) {
        postMessage('replay.playFor', { error: 'no-executor' })
        return
      }

      // start playback
      if (ex.isPaused) {
        ex.resume()
      } else if (!ex.isPlaying) {
        // Idle state - need to start execution
        if (options.play) {
          options.play()
        }
      }

      // Special case: duration === -1 means play to end
      if (duration === -1) {
        const handlerId = ++playToEndCounter
        const unsubscribe = ex.on((event) => {
          if (
            event.type === ExecutorEventType.Complete ||
            event.type === ExecutorEventType.Cancelled
          ) {
            postMessage('replay.playFor.completed', { duration: -1, playedToEnd: true })
            const handler = playToEndHandlers.get(handlerId)
            if (handler) {
              handler()
              playToEndHandlers.delete(handlerId)
            }
          }
        })
        playToEndHandlers.set(handlerId, unsubscribe)
        postMessage('replay.playFor.started', { duration: -1, playToEnd: true })
        return
      }

      // Normal case: set timeout to pause after duration
      const id = window.setTimeout(() => {
        ex.pause()
        postMessage('replay.playFor.completed', { duration })
        playForTimers.delete(id)
      }, duration)
      playForTimers.set(id, id)
      postMessage('replay.playFor.started', { duration, timerId: id })
    }),
  )

  // import recording text
  if (options.loadRecording) {
    unsubscribers.push(
      on('replay.importRecording', async (msg) => {
        const data = (msg as IPCMessage<DemoRecording>).data

        if (!data) {
          postMessage('replay.importRecording.error', { error: 'no-data' })
          return
        }

        try {
          await options.loadRecording!(data)
          postMessage('replay.importRecording.ok')
        } catch (err) {
          postMessage('replay.importRecording.error', { error: String(err) })
        }
      }),
    )
  }

  function destroy() {
    for (const u of unsubscribers) u()
    for (const id of playForTimers.keys()) window.clearTimeout(id)

    // Clean up play-to-end handlers
    for (const unsubscribe of playToEndHandlers.values()) {
      unsubscribe()
    }
    playToEndHandlers.clear()
  }

  return {
    destroy,
    postMessage,
  }
}
