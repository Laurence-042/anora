/**
 * useRecording - 录制/回放状态管理 Composable
 *
 * 完全独立于 graph store，管理录制/回放相关的所有状态和逻辑
 * 通过 provide/inject 在组件树中共享状态
 */
import { ref, computed, inject, provide, type InjectionKey, type Ref } from 'vue'
import { useGraphStore } from '@/stores/graph'
import { AnoraGraph } from '@/base/runtime/graph'
import { DemoRecorder, ReplayExecutor, ReplayState } from '@/base/runtime/demo'
import type { DemoRecording } from '@/base/runtime/demo'

/**
 * 录制/回放上下文类型
 */
export interface RecordingContext {
  // 状态
  isRecording: Ref<boolean>
  recordedEventCount: Ref<number>
  isReplayMode: Ref<boolean>
  replayState: Ref<ReplayState>
  replayProgress: Ref<{ current: number; total: number }>
  isPlaying: Ref<boolean>

  // 录制操作
  startRecording: () => void
  stopRecording: () => void
  exportRecording: () => DemoRecording

  // 回放操作
  loadRecording: (data: DemoRecording) => void
  exitReplay: () => void
  togglePlayPause: () => void
  stepForward: () => void
  setSpeed: (speed: number) => void
}

const RecordingContextKey: InjectionKey<RecordingContext> = Symbol('RecordingContext')

/**
 * 创建录制/回放上下文（在根组件调用）
 */
export function createRecordingContext(): RecordingContext {
  const graphStore = useGraphStore()

  // ========== 实例 ==========
  const recorder = new DemoRecorder()
  const replayExec = new ReplayExecutor()

  // ========== 状态 ==========
  const isRecording = ref(false)
  const recordedEventCount = ref(0)
  const isReplayMode = ref(false)
  const replayState = ref<ReplayState>(ReplayState.Idle)
  const replayProgress = ref({ current: 0, total: 0 })

  // 保存进入回放前的图，用于退出时恢复
  let savedGraph: AnoraGraph | null = null
  let savedPositions: Map<string, { x: number; y: number }> | null = null
  let replayUnsubscribe: (() => void) | null = null

  // ========== 计算属性 ==========
  const isPlaying = computed(() => replayState.value === ReplayState.Playing)

  // ========== 回调设置 ==========
  recorder.onRecordingChange = (recording, count) => {
    isRecording.value = recording
    recordedEventCount.value = count
  }

  replayExec.onStateChange = (state) => {
    replayState.value = state
  }

  replayExec.onProgressChange = (current, total) => {
    replayProgress.value = { current, total }
  }

  // ========== 录制操作 ==========
  function startRecording(): void {
    if (isRecording.value || isReplayMode.value) return

    recorder.bindExecutor(graphStore.executor)
    recorder.bindGraph(graphStore.currentGraph)
    recorder.startRecording(graphStore.nodePositions)
  }

  function stopRecording(): void {
    if (!isRecording.value) return
    recorder.stopRecording()
  }

  function exportRecording(): DemoRecording {
    return recorder.exportRecording({
      iterationDelay: graphStore.iterationDelay,
    })
  }

  // ========== 回放操作 ==========
  function loadRecording(data: DemoRecording): void {
    if (isRecording.value || graphStore.isRunning) return

    // 保存当前图状态
    savedGraph = graphStore.currentGraph
    savedPositions = new Map(graphStore.nodePositions)

    // 反序列化并加载回放图
    const graph = new AnoraGraph()
    graph.deserialize(data.initialGraph)
    graphStore.replaceGraph(graph)
    graphStore.setNodePositions(data.nodePositions)

    // 加载录制数据到回放执行器
    replayExec.loadRecording(data, graphStore.currentGraph)

    // 注册事件监听
    replayUnsubscribe = replayExec.on(graphStore.handleExecutorEvent)

    isReplayMode.value = true
  }

  function exitReplay(): void {
    if (!isReplayMode.value) return

    replayExec.stop()
    replayUnsubscribe?.()
    replayUnsubscribe = null

    // 恢复之前的图
    if (savedGraph) {
      graphStore.replaceGraph(savedGraph)
      if (savedPositions) {
        const positions: Record<string, { x: number; y: number }> = {}
        for (const [k, v] of savedPositions) {
          positions[k] = v
        }
        graphStore.setNodePositions(positions)
      }
      savedGraph = null
      savedPositions = null
    } else {
      graphStore.initializeRootGraph()
    }

    isReplayMode.value = false
    replayState.value = ReplayState.Idle
    replayProgress.value = { current: 0, total: 0 }
  }

  function togglePlayPause(): void {
    if (!isReplayMode.value) return

    if (replayState.value === ReplayState.Playing) {
      replayExec.pause()
    } else {
      replayExec.play()
    }
  }

  function stepForward(): void {
    if (!isReplayMode.value) return
    replayExec.stepForward()
  }

  function setSpeed(speed: number): void {
    replayExec.playbackSpeed = speed
  }

  // ========== 创建上下文 ==========
  const context: RecordingContext = {
    isRecording,
    recordedEventCount,
    isReplayMode,
    replayState,
    replayProgress,
    isPlaying,
    startRecording,
    stopRecording,
    exportRecording,
    loadRecording,
    exitReplay,
    togglePlayPause,
    stepForward,
    setSpeed,
  }

  // 提供给子组件
  provide(RecordingContextKey, context)

  return context
}

/**
 * 使用录制/回放上下文（在子组件调用）
 */
export function useRecording(): RecordingContext {
  const context = inject(RecordingContextKey)
  if (!context) {
    throw new Error(
      'useRecording must be used within a component that has called createRecordingContext',
    )
  }
  return context
}
