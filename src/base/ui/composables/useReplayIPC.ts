/**
 * useReplayIPC - 回放 IPC 接口（重构版）
 *
 * 职责：
 * - 注册 IPC 消息处理器
 * - 将 IPC 消息转发给 ReplayController
 * - 发送响应消息
 *
 * 改进：
 * - 不再直接操作 executor 和状态
 * - 所有逻辑委托给 ReplayController
 * - 简化消息处理流程
 */

import { useIPC } from './useIPC'
import type { ReplayController } from '@/base/ui/replay'
import type { DemoRecording } from '@/base/ui/replay'
import type { IPCMessage } from '@/base/runtime/types'
import { ExecutorEventType } from '@/base/runtime/executor'

interface SeekData {
  timeMs?: number
  eventIndex?: number
}

interface KeyframeData {
  keyframeIndex?: number
  before?: boolean
}

interface PlayForData {
  durationMs?: number
}

interface PlayToKeyframeData {
  keyframeIndex?: number
}

/**
 * useReplayIPC
 * @param options.controller - ReplayController 实例
 * @param options.loadRecording - 加载录制的回调函数
 */
export function useReplayIPC(options: {
  controller: ReplayController
  loadRecording?: (data: DemoRecording) => Promise<void>
}) {
  const { on, postMessage } = useIPC()
  const unsubscribers: Array<() => void> = []
  const { controller } = options

  // ==================== 播放控制 ====================

  // play
  unsubscribers.push(
    on('replay.play', async () => {
      await controller.play()
      postMessage('replay.played')
    }),
  )

  // pause
  unsubscribers.push(
    on('replay.pause', async () => {
      controller.pause()
      postMessage('replay.paused')
    }),
  )

  // toggle
  unsubscribers.push(
    on('replay.toggle', async () => {
      controller.togglePlayPause()
      postMessage('replay.toggled')
    }),
  )

  // step forward
  unsubscribers.push(
    on('replay.stepForward', async () => {
      await controller.stepForward()
      postMessage('replay.stepped')
    }),
  )

  // restart
  unsubscribers.push(
    on('replay.restart', async () => {
      await controller.restart()
      postMessage('replay.restarted')
    }),
  )

  // ==================== 跳转控制 ====================

  // seek by time or index
  unsubscribers.push(
    on('replay.seek', async (msg) => {
      const data = (msg as IPCMessage<SeekData>).data ?? {}
      const timeMs = typeof data.timeMs === 'number' ? data.timeMs : undefined
      const eventIndex = typeof data.eventIndex === 'number' ? data.eventIndex : undefined

      if (timeMs !== undefined) {
        const targetIndex = controller.seekToTime(timeMs)
        postMessage('replay.seeked', { timeMs, eventIndex: targetIndex })
        return
      }

      if (eventIndex !== undefined) {
        controller.seekToIndex(eventIndex)
        postMessage('replay.seeked', { eventIndex })
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

      if (kfIndex < 0) {
        postMessage('replay.seekToKeyframe', { error: 'invalid-keyframe-index' })
        return
      }

      await controller.seekToKeyframe(kfIndex, before)
      postMessage('replay.seekToKeyframe', { keyframeIndex: kfIndex })
    }),
  )

  // ==================== 播放速度 ====================

  // set speed
  unsubscribers.push(
    on('replay.setSpeed', async (msg) => {
      const data = (msg as IPCMessage<{ speed: number }>).data
      const speed = typeof data?.speed === 'number' ? data.speed : 1.0

      controller.setPlaybackSpeed(speed)
      postMessage('replay.speedSet', { speed })
    }),
  )

  // ==================== 定时播放 ====================

  // play for duration (or play to end if duration === -1)
  const playForTimers = new Map<number, number>()
  const playToEndHandlers = new Map<number, () => void>()
  let playToEndCounter = 0

  unsubscribers.push(
    on('replay.playFor', async (msg) => {
      const data = (msg as IPCMessage<PlayForData>).data ?? {}
      const durationMs = typeof data.durationMs === 'number' ? data.durationMs : 0

      if (!controller.isLoaded.value) {
        postMessage('replay.playFor', { error: 'not-loaded' })
        return
      }

      // start playback
      await controller.play()

      // Special case: durationMs === -1 means play to end
      if (durationMs < 0) {
        const handlerId = ++playToEndCounter

        // 使用 controller.onExecutorEvent 回调，保存原有回调并在完成后恢复
        const originalCallback = controller.onExecutorEvent
        const unsubscribe = () => {
          controller.onExecutorEvent = originalCallback
        }

        controller.onExecutorEvent = (event) => {
          // 先调用原有回调
          originalCallback?.(event)
          // 检查是否完成
          if (
            event.type === ExecutorEventType.Complete ||
            event.type === ExecutorEventType.Cancelled
          ) {
            postMessage('replay.playFor.completed', { durationMs: -1, playedToEnd: true })
            // 取消订阅
            unsubscribe()
            playToEndHandlers.delete(handlerId)
          }
        }

        playToEndHandlers.set(handlerId, unsubscribe)
        postMessage('replay.playFor.started', { durationMs: -1, playToEnd: true })
        return
      }

      // Normal case: set timeout to pause after duration
      const id = window.setTimeout(() => {
        controller.pause()
        postMessage('replay.playFor.completed', { durationMs })
        playForTimers.delete(id)
      }, durationMs)
      playForTimers.set(id, id)
      postMessage('replay.playFor.started', { durationMs, timerId: id })
    }),
  )

  // playToKeyframe - play until reaching a specific keyframe then pause
  const playToKeyframeHandlers = new Map<number, () => void>()
  let playToKeyframeCounter = 0

  unsubscribers.push(
    on('replay.playToKeyframe', async (msg) => {
      const data = (msg as IPCMessage<PlayToKeyframeData>).data ?? {}
      const keyframeIndex = typeof data.keyframeIndex === 'number' ? data.keyframeIndex : -1

      if (!controller.isLoaded.value) {
        postMessage('replay.playToKeyframe', { error: 'not-loaded' })
        return
      }

      const keyframes = controller.keyframes.value
      if (keyframeIndex < 0 || keyframeIndex >= keyframes.length) {
        postMessage('replay.playToKeyframe', { error: 'invalid-keyframe-index' })
        return
      }

      const targetKeyframe = keyframes[keyframeIndex]
      if (!targetKeyframe) {
        postMessage('replay.playToKeyframe', { error: 'invalid-keyframe-index' })
        return
      }

      const targetTime = targetKeyframe.time
      const currentTime = controller.currentTime.value

      // If we're already past or at the target keyframe, just seek to it
      if (currentTime >= targetTime) {
        await controller.seekToKeyframe(keyframeIndex, false)
        postMessage('replay.playToKeyframe.completed', { keyframeIndex, alreadyPast: true })
        return
      }

      // Start playback
      await controller.play()

      const handlerId = ++playToKeyframeCounter

      // Set up event listener to detect when we reach the target keyframe
      const originalCallback = controller.onExecutorEvent
      const unsubscribe = () => {
        controller.onExecutorEvent = originalCallback
      }

      controller.onExecutorEvent = (event) => {
        // Call original callback first
        originalCallback?.(event)

        // Check if we've reached or passed the target time
        const nowTime = controller.currentTime.value
        if (nowTime >= targetTime) {
          controller.pause()
          // Unsubscribe BEFORE seeking to avoid infinite loop
          unsubscribe()
          playToKeyframeHandlers.delete(handlerId)
          // Seek exactly to the keyframe position (fire and forget since we're in event callback)
          controller.seekToKeyframe(keyframeIndex, false)
          postMessage('replay.playToKeyframe.completed', { keyframeIndex })
          return
        }

        // Also stop if playback completes or is cancelled
        if (
          event.type === ExecutorEventType.Complete ||
          event.type === ExecutorEventType.Cancelled
        ) {
          unsubscribe()
          playToKeyframeHandlers.delete(handlerId)
          postMessage('replay.playToKeyframe.completed', { keyframeIndex, endedEarly: true })
        }
      }

      playToKeyframeHandlers.set(handlerId, unsubscribe)
      postMessage('replay.playToKeyframe.started', { keyframeIndex, targetTime })
    }),
  )

  // ==================== 导入录制 ====================

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

  // ==================== 清理 ====================

  function destroy() {
    for (const u of unsubscribers) u()
    for (const id of playForTimers.keys()) window.clearTimeout(id)

    // Clean up play-to-end handlers
    for (const unsubscribe of playToEndHandlers.values()) {
      unsubscribe()
    }
    playToEndHandlers.clear()

    // Clean up play-to-keyframe handlers
    for (const unsubscribe of playToKeyframeHandlers.values()) {
      unsubscribe()
    }
    playToKeyframeHandlers.clear()
  }

  return {
    destroy,
    postMessage,
  }
}
