import { useIPC } from './useIPC'
import type { ReplayExecutor } from '@/base/runtime/demo'

/**
 * Replay IPC composable
 * - Registers replay-related IPC handlers on top of the base IPC controller
 * - Consumers must provide callbacks to operate on the local ReplayExecutor / UI state
 */
export function useReplayIPC(options: {
  getExecutor: () => unknown | null
  applyStateAtIndex: (idx: number) => void
  loadRecordingFromText?: (text: string) => Promise<void>
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
      const ex = options.getExecutor() as unknown as ReplayExecutor | null
      if (!ex) return
      if (ex.isPaused) ex.resume()
      postMessage('replay.played')
    }),
  )

  // pause
  unsubscribers.push(
    on('replay.pause', async () => {
      const ex = options.getExecutor() as unknown as ReplayExecutor | null
      ex?.pause()
      postMessage('replay.paused')
    }),
  )

  // toggle
  unsubscribers.push(
    on('replay.toggle', async () => {
      const ex = options.getExecutor() as unknown as ReplayExecutor | null
      if (!ex) return
      if (ex.isPlaying) ex.pause()
      else if (ex.isPaused) ex.resume()
      postMessage('replay.toggled')
    }),
  )

  // seek by time
  unsubscribers.push(
    on('replay.seek', async (msg) => {
      const ex = options.getExecutor() as unknown as ReplayExecutor | null
      type SeekPayload = { time?: number; index?: number }
      const payload = (msg as unknown as { payload?: SeekPayload })?.payload ?? ({} as SeekPayload)
      const time = typeof payload.time === 'number' ? payload.time : undefined
      const index = typeof payload.index === 'number' ? payload.index : undefined
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
      postMessage('replay.seeked', { error: 'invalid-payload' })
    }),
  )

  // seek to keyframe
  unsubscribers.push(
    on('replay.seekToKeyframe', async (msg) => {
      type KfPayload = { keyframeIndex?: number; before?: boolean }
      const payload = (msg as unknown as { payload?: KfPayload })?.payload ?? ({} as KfPayload)
      const kfIndex = typeof payload.keyframeIndex === 'number' ? payload.keyframeIndex : -1
      const before = !!payload.before
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
      const ex = options.getExecutor() as unknown as ReplayExecutor | null
      if (!ex) {
        postMessage('replay.seekToKeyframe', { error: 'no-executor' })
        return
      }
      const targetIndex = ex.seekToTime(time)
      options.applyStateAtIndex(targetIndex)
      postMessage('replay.seekToKeyframe', { keyframeIndex: kfIndex, index: targetIndex, time })
    }),
  )

  // play for duration (ms)
  const playForTimers = new Map<number, number>()
  unsubscribers.push(
    on('replay.playFor', async (msg) => {
      type PlayForPayload = { duration?: number }
      const payload =
        (msg as unknown as { payload?: PlayForPayload })?.payload ?? ({} as PlayForPayload)
      const duration = Number(payload.duration || 0) || 0
      const ex = options.getExecutor() as unknown as ReplayExecutor | null
      if (!ex) {
        postMessage('replay.playFor', { error: 'no-executor' })
        return
      }
      // start playback
      if (ex.isPaused) ex.resume()
      else if (!ex.isPlaying) {
        // consumer might have to call execute externally
      }
      // set timeout to pause
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
  if (options.loadRecordingFromText) {
    unsubscribers.push(
      on('replay.importRecording', async (msg) => {
        const payload = (msg as unknown as { payload?: { content?: string } })?.payload ?? {
          content: '',
        }
        const text = String(payload.content || '')
        try {
          await options.loadRecordingFromText!(text)
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
  }

  return {
    destroy,
    postMessage,
  }
}
