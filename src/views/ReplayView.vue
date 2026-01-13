<script setup lang="ts">
/**
 * ReplayView - 独立的录制回放页面
 *
 * 功能：
 * - 加载 .json 录制文件
 * - 使用 ReplayExecutor 回放事件（与 BasicExecutor 相同的 execute() 接口）
 * - 使用 graphStore 管理所有状态
 * - 回放进度控制
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
// import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElUpload } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import AnoraGraphView from '@/base/ui/components/AnoraGraphView.vue'
import { useReplayIPC } from '@/base/ui/composables/useReplayIPC'
import { ReplayExecutor } from '@/base/runtime/demo'
import { useGraphStore } from '@/stores/graph'
import type { DemoRecording } from '@/base/runtime/demo'
import { ExecutorState, type ExecutorEvent } from '@/base/runtime/executor'
import { NodeExecutionStatus } from '@/base/runtime/types'

// router not used in embedded replay
const { t } = useI18n()
const graphStore = useGraphStore()

// ==================== 状态 ====================

/** 录制数据 */
const recording = ref<DemoRecording | null>(null)

/** 回放执行器 */
const replayExecutor = ref<ReplayExecutor | null>(null)

/** 当前事件索引 */
const currentEventIndex = ref(0)

/** 当前播放时间（毫秒） */
const currentTime = ref(0)

/** 总时长（毫秒） */
const totalDuration = ref(0)

/** 播放速度 */
const playbackSpeed = ref(1)

/** 关键帧列表 */
const keyframes = ref<
  Array<{ time: number; startIndex: number; endIndex: number; percentage: number }>
>([])

/** 播放开始的真实时间 */
const playStartRealTime = ref(0)

/** 播放开始时的录制时间 */
const playStartRecordTime = ref(0)

/** 动画帧 ID */
let animationFrameId: number | null = null

/** AnoraGraphView 引用 */
const graphViewRef = ref<InstanceType<typeof AnoraGraphView>>()

// IPC - 组件挂载时初始化，确保外部可以立即发送命令
let replayIpcHandle: {
  destroy: () => void
  postMessage?: (t: string, p?: unknown) => void
} | null = null

// ==================== 计算属性 ====================

const isLoaded = computed(
  () =>
    recording.value !== null &&
    graphStore.currentGraph !== null &&
    graphStore.currentGraph.getAllNodes().length > 0,
)
const isPlaying = computed(() => replayExecutor.value?.isPlaying ?? false)
const isPaused = computed(() => replayExecutor.value?.isPaused ?? false)
const isIdle = computed(() => replayExecutor.value?.executorState === ExecutorState.Idle)
const totalEvents = computed(() => recording.value?.events.length ?? 0)
const progress = computed(() =>
  totalDuration.value > 0 ? (currentTime.value / totalDuration.value) * 100 : 0,
)
const isCompleted = computed(
  () => isIdle.value && currentEventIndex.value >= totalEvents.value && totalEvents.value > 0,
)

/** 格式化时间显示 */
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  const remainingMs = Math.floor((ms % 1000) / 10)
  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${remainingMs.toString().padStart(2, '0')}`
  }
  return `${remainingSeconds}.${remainingMs.toString().padStart(2, '0')}s`
}

const speedOptions = [0.5, 1, 1.5, 2, 4]

// ==================== 文件加载 ====================

/** 自定义上传处理 */
async function handleUploadRequest(options: UploadRequestOptions): Promise<void> {
  const file = options.file as File
  const content = await file.text()
  await loadRecordingText(content)
}

async function loadRecordingText(text: string): Promise<void> {
  try {
    const data = JSON.parse(text) as DemoRecording
    await processLoadedRecording(data)
  } catch (err) {
    console.error('Failed to load recording:', err)
    console.error(text)
    alert(t('errors.invalidDemoFile'))
  }
}

async function processLoadedRecording(data: DemoRecording): Promise<void> {
  // 版本检查
  if (data.version !== '2.0.0') {
    alert(t('demo.unsupportedVersion', { version: data.version }))
    return
  }

  // 清理现有状态
  cleanup()

  // 保存录制数据
  recording.value = data

  // 加载图到 graphStore（包含位置信息）
  graphStore.loadFromSerialized(data.initialGraph)

  // 创建回放执行器
  const executor = new ReplayExecutor()
  executor.loadRecording(data, graphStore.currentGraph)

  // 设置进度回调（仅用于 UI 进度显示）
  executor.onProgressChange = (current: number, _total: number, time: number, duration: number) => {
    currentEventIndex.value = current
    currentTime.value = time
    totalDuration.value = duration
  }

  // 初始化总时长
  totalDuration.value = executor.totalDuration

  // 生成关键帧
  keyframes.value = executor.getKeyframes(100)

  // 手动绑定执行器事件到 graphStore 的处理器
  // 这样 ReplayExecutor 和 BasicExecutor 使用相同的事件处理逻辑
  const handleEvent = (event: ExecutorEvent) => {
    graphStore.handleExecutorEvent(event)
  }
  executor.on(handleEvent)

  replayExecutor.value = executor

  currentEventIndex.value = 0
  currentTime.value = 0

  console.log('[ReplayView] Recording loaded:', {
    nodes: graphStore.currentGraph.getAllNodes().length,
    events: data.events.length,
  })

  // 自动适应视图
  setTimeout(() => graphViewRef.value?.fitView(), 100)
}

// ==================== 执行器事件处理 ====================
// 注意：ReplayExecutor 的事件由 graphStore 统一处理（通过 setExecutor）
// 这里只需监听播放结束事件来停止进度动画

function handleExecutorComplete(): void {
  stopProgressAnimation()
}

// 监听播放完成
watch(isCompleted, (completed) => {
  if (completed) {
    handleExecutorComplete()
  }
})

// ==================== 进度动画 ====================

function startProgressAnimation(): void {
  if (animationFrameId !== null) return

  playStartRealTime.value = performance.now()
  playStartRecordTime.value = currentTime.value

  const animate = () => {
    if (!replayExecutor.value || !isPlaying.value) {
      animationFrameId = null
      return
    }

    // 根据真实时间和播放速度计算当前录制时间
    const elapsed = performance.now() - playStartRealTime.value
    const recordElapsed = elapsed * playbackSpeed.value
    const newTime = Math.min(playStartRecordTime.value + recordElapsed, totalDuration.value)

    currentTime.value = newTime

    animationFrameId = requestAnimationFrame(animate)
  }

  animationFrameId = requestAnimationFrame(animate)
}

function stopProgressAnimation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// 监听播放状态变化，启动/停止动画
watch(isPlaying, (playing) => {
  if (playing) {
    startProgressAnimation()
  } else {
    stopProgressAnimation()
  }
})

// ==================== 状态应用 ====================

/**
 * 应用指定索引处的回放状态到 UI
 * 统一的状态应用逻辑，避免重复代码
 */
function applyReplayState(targetIndex: number): void {
  if (!replayExecutor.value) return

  const state = replayExecutor.value.getStateAtIndex(targetIndex)

  console.log('[applyReplayState]', {
    targetIndex,
    executingNodeIds: Array.from(state.executingNodeIds),
    edgeDataTransfers: Array.from(state.edgeDataTransfers.entries()),
    nodeStatus: Array.from(state.nodeStatus.entries()),
  })

  // 应用执行节点集合
  graphStore.executingNodeIds = state.executingNodeIds

  // 应用边数据传输
  graphStore.edgeDataTransfers = state.edgeDataTransfers

  // 应用节点的执行状态
  for (const node of graphStore.currentGraph.getAllNodes()) {
    const status = state.nodeStatus.get(node.id)
    if (status) {
      // 节点已完成执行
      node.executionStatus = status.success
        ? NodeExecutionStatus.SUCCESS
        : NodeExecutionStatus.FAILED
      if (status.error) node.lastError = status.error
    } else if (state.executingNodeIds.has(node.id)) {
      // 节点正在执行
      node.executionStatus = NodeExecutionStatus.EXECUTING
    } else {
      // 节点空闲
      node.executionStatus = NodeExecutionStatus.IDLE
    }
  }

  // 触发 graphRevision 更新，确保节点执行状态显示同步
  graphStore.graphRevision++
}

// ==================== 播放控制 ====================

function play(): void {
  if (!replayExecutor.value) return

  replayExecutor.value.playbackSpeed = playbackSpeed.value

  // 如果是暂停状态，恢复播放
  if (replayExecutor.value.isPaused) {
    replayExecutor.value.resume()
    return
  }

  // 如果不是空闲状态，不处理
  if (replayExecutor.value.executorState !== ExecutorState.Idle) return

  // 如果已经播放完成（在末尾），先重启
  if (isCompleted.value) {
    restart()
    // restart 会重新加载录制，需要等待下一帧再播放
    setTimeout(() => {
      if (replayExecutor.value) {
        replayExecutor.value.execute(graphStore.currentGraph)
      }
    }, 0)
    return
  }

  // 否则直接开始执行
  replayExecutor.value.execute(graphStore.currentGraph)
}

function pause(): void {
  if (!replayExecutor.value) return
  replayExecutor.value.pause()
}

function togglePlayPause(): void {
  if (isPlaying.value) {
    pause()
  } else {
    play()
  }
}

function stepForward(): void {
  if (!replayExecutor.value) return

  // 如果还没开始，先暂停启动
  if (replayExecutor.value.executorState === ExecutorState.Idle) {
    replayExecutor.value.execute(graphStore.currentGraph)
    replayExecutor.value.pause()
  }

  replayExecutor.value.stepForward()
}

function restart(): void {
  if (!replayExecutor.value || !recording.value) return

  // 停止动画
  stopProgressAnimation()

  // 取消当前执行
  replayExecutor.value.cancel()

  // 重置状态
  graphStore.clearExecutionState()
  currentEventIndex.value = 0
  currentTime.value = 0

  // 重新加载录制数据
  replayExecutor.value.loadRecording(recording.value, graphStore.currentGraph)
}

function setSpeed(speed: number): void {
  playbackSpeed.value = speed
  if (replayExecutor.value) {
    replayExecutor.value.playbackSpeed = speed
  }
  // 如果正在播放，重新校准动画起点
  if (isPlaying.value) {
    playStartRealTime.value = performance.now()
    playStartRecordTime.value = currentTime.value
  }
}

/**
 * 拖动进度条到指定时间
 */
function seekToTime(timeMs: number): void {
  if (!replayExecutor.value) return

  // 暂停当前播放
  const wasPlaying = isPlaying.value
  if (wasPlaying) {
    replayExecutor.value.pause()
  }

  // 跳转到目标时间
  const targetIndex = replayExecutor.value.seekToTime(timeMs)

  // 重建该时间点的 UI 状态
  applyReplayState(targetIndex)

  // 更新本地状态
  currentEventIndex.value = targetIndex + 1
  currentTime.value = timeMs
}

/**
 * 处理进度条拖动
 */
function handleProgressChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const timeMs = Number(target.value)
  seekToTime(timeMs)
}

// ==================== 导航 ====================

// navigation handled externally in embedded scenarios

// ==================== 清理 ====================

function cleanup(): void {
  stopProgressAnimation()
  if (replayExecutor.value) {
    replayExecutor.value.cancel()
    replayExecutor.value = null
  }
  recording.value = null
  keyframes.value = []
  graphStore.clearExecutionState()
  currentEventIndex.value = 0
  currentTime.value = 0
  totalDuration.value = 0
}

// ==================== 生命周期 ====================

onMounted(() => {
  // 组件挂载时立即初始化 IPC，确保外部系统可以发送命令（如 replay.importRecording）
  replayIpcHandle = useReplayIPC({
    getExecutor: () => replayExecutor.value,
    applyStateAtIndex: (idx: number) => {
      applyReplayState(idx)
    },
    loadRecording: async (data: DemoRecording) => {
      await processLoadedRecording(data)
    },
    play: () => {
      play()
    },
    getKeyframes: () => keyframes.value,
  })
})

onUnmounted(() => {
  cleanup()
  if (replayIpcHandle) {
    try {
      replayIpcHandle.destroy()
    } catch (e) {
      console.warn('replayIpc destroy failed', e)
    }
    replayIpcHandle = null
  }
})
</script>

<template>
  <div class="replay-view">
    <!-- 顶部工具栏 已移除（回放嵌入场景时通常由外部提供控制） -->

    <!-- 主内容区 -->
    <div class="replay-content">
      <!-- 未加载时的占位 -->
      <div v-if="!isLoaded" class="empty-state">
        <div class="empty-icon">📂</div>
        <div class="empty-text">{{ t('demo.noRecordingLoaded') }}</div>
        <el-upload
          :http-request="handleUploadRequest"
          :show-file-list="false"
          accept=".json"
          :auto-upload="true"
        >
          <button class="upload-action-btn">
            {{ t('demo.loadRecording') }}
          </button>
        </el-upload>
      </div>

      <!-- 图展示 -->
      <AnoraGraphView
        v-else
        ref="graphViewRef"
        :graph="graphStore.currentGraph!"
        :node-positions="graphStore.nodePositions"
        :graph-revision="graphStore.graphRevision"
        :readonly="true"
        :executing-node-ids="graphStore.executingNodeIds"
        :incompatible-edges="new Set()"
        :edge-data-transfers="graphStore.edgeDataTransfers"
        :selected-node-ids="new Set()"
      />
    </div>

    <!-- 底部控制栏 -->
    <div v-if="isLoaded" class="replay-controls">
      <!-- 进度条 -->
      <div class="progress-section">
        <div class="time-display">{{ formatTime(currentTime) }}</div>
        <div class="progress-wrapper">
          <input
            type="range"
            :min="0"
            :max="totalDuration"
            :value="currentTime"
            class="progress-slider"
            @input="handleProgressChange"
          />
          <!-- 关键帧标记 -->
          <div class="keyframe-markers">
            <div
              v-for="(kf, idx) in keyframes"
              :key="idx"
              class="keyframe-marker"
              :style="{ left: kf.percentage + '%' }"
              :title="`${formatTime(kf.time)} (${kf.endIndex - kf.startIndex + 1} events)`"
            />
          </div>
        </div>
        <div class="time-display">{{ formatTime(totalDuration) }}</div>
        <div class="progress-text">{{ progress.toFixed(1) }}%</div>
      </div>

      <!-- 播放控制 -->
      <div class="playback-controls">
        <button class="control-btn" @click="restart" :title="t('demo.restart')">
          <span class="icon">⏮</span>
        </button>

        <button
          class="control-btn play-btn"
          @click="togglePlayPause"
          :title="isPlaying ? t('demo.pause') : t('demo.play')"
        >
          <span class="icon">{{ isPlaying ? '⏸' : '▶' }}</span>
        </button>

        <button
          class="control-btn"
          @click="stepForward"
          :disabled="isPlaying || isCompleted"
          :title="t('demo.stepForward')"
        >
          <span class="icon">⏭</span>
        </button>

        <!-- 速度选择 -->
        <select
          class="speed-select"
          :value="playbackSpeed"
          @change="setSpeed(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="speed in speedOptions" :key="speed" :value="speed">{{ speed }}x</option>
        </select>
      </div>

      <!-- 状态指示 -->
      <div class="status-section">
        <span v-if="isPlaying" class="status playing">▶ {{ t('demo.playing') }}</span>
        <span v-else-if="isPaused" class="status paused">⏸ {{ t('demo.paused') }}</span>
        <span v-else-if="isCompleted" class="status completed">✓ {{ t('demo.completed') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.replay-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--vf-bg, #0f0f1a);
  color: var(--vf-text, #e2e8f0);
}

.replay-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--vf-toolbar-bg, #1a1a2e);
  border-bottom: 1px solid var(--vf-border, #3a3a5c);
  z-index: 10;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 500;
  color: #60a5fa;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-btn {
  padding: 6px 12px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}

.back-btn {
  color: #94a3b8;
}

.replay-content {
  flex: 1;
  position: relative;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
}

.empty-icon {
  font-size: 64px;
  opacity: 0.3;
}

.empty-text {
  font-size: 16px;
  color: #6b7280;
}

.upload-action-btn {
  padding: 12px 24px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.upload-action-btn:hover {
  background: #2563eb;
}

.replay-controls {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 24px;
  background: var(--vf-toolbar-bg, #1a1a2e);
  border-top: 1px solid var(--vf-border, #3a3a5c);
}

.progress-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-wrapper {
  flex: 1;
  position: relative;
}

.progress-slider {
  width: 100%;
  height: 6px;
  cursor: pointer;
  appearance: none;
  background: #3a3a5c;
  border-radius: 3px;
  outline: none;
}

.progress-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: #60a5fa;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}

.progress-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.progress-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #60a5fa;
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.keyframe-markers {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 0;
  pointer-events: none;
}

.keyframe-marker {
  position: absolute;
  width: 4px;
  height: 10px;
  background: rgba(251, 191, 36, 0.7);
  border-radius: 2px;
  transform: translate(-50%, -50%);
  transition: background 0.2s;
}

.keyframe-marker:hover {
  background: #fbbf24;
}

.time-display {
  font-size: 12px;
  color: #94a3b8;
  font-family: monospace;
  min-width: 60px;
  text-align: center;
}

.progress-text {
  font-size: 11px;
  color: #6b7280;
  font-family: monospace;
  min-width: 40px;
  text-align: right;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  padding: 8px 12px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.control-btn:hover:not(:disabled) {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.play-btn {
  background: #3b82f6;
  border-color: #3b82f6;
}

.play-btn:hover {
  background: #2563eb;
}

.icon {
  font-size: 16px;
}

.speed-select {
  padding: 6px 10px;
  font-size: 12px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
}

.status-section {
  min-width: 100px;
}

.status {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
}

.status.playing {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.status.paused {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.status.completed {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}
</style>
