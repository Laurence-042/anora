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
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import AnoraGraphView from '@/base/ui/components/AnoraGraphView.vue'
import LocaleSwitcher from '@/base/ui/editor/LocaleSwitcher.vue'
import { ReplayExecutor } from '@/base/runtime/demo'
import { useGraphStore } from '@/stores/graph'
import type { DemoRecording } from '@/base/runtime/demo'
import { ExecutorEventType, ExecutorState, type ExecutorEvent } from '@/base/runtime/executor'

const router = useRouter()
const { t } = useI18n()
const graphStore = useGraphStore()

// ==================== 状态 ====================

/** 录制数据 */
const recording = ref<DemoRecording | null>(null)

/** 回放执行器 */
const replayExecutor = ref<ReplayExecutor | null>(null)

/** 当前事件索引 */
const currentEventIndex = ref(0)

/** 播放速度 */
const playbackSpeed = ref(1)

/** AnoraGraphView 引用 */
const graphViewRef = ref<InstanceType<typeof AnoraGraphView>>()

// ==================== 计算属性 ====================

const isLoaded = computed(
  () => recording.value !== null && graphStore.currentGraph.getAllNodes().length > 0,
)
const isPlaying = computed(() => replayExecutor.value?.isPlaying ?? false)
const isPaused = computed(() => replayExecutor.value?.isPaused ?? false)
const isIdle = computed(() => replayExecutor.value?.executorState === ExecutorState.Idle)
const totalEvents = computed(() => recording.value?.events.length ?? 0)
const progress = computed(() =>
  totalEvents.value > 0 ? Math.round((currentEventIndex.value / totalEvents.value) * 100) : 0,
)
const isCompleted = computed(
  () => isIdle.value && currentEventIndex.value >= totalEvents.value && totalEvents.value > 0,
)

const speedOptions = [0.5, 1, 1.5, 2, 4]

// ==================== 文件加载 ====================

const fileInput = ref<HTMLInputElement>()

function handleUpload(): void {
  fileInput.value?.click()
}

function handleFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    loadRecordingFile(file)
    target.value = ''
  }
}

async function loadRecordingFile(file: File): Promise<void> {
  const content = await file.text()

  try {
    const data = JSON.parse(content) as DemoRecording

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

    // 设置进度回调
    executor.onProgressChange = (current: number, _total: number) => {
      currentEventIndex.value = current
    }

    // 监听事件
    executor.on(handleExecutorEvent)

    replayExecutor.value = executor
    currentEventIndex.value = 0

    console.log('[ReplayView] Recording loaded:', {
      nodes: graphStore.currentGraph.getAllNodes().length,
      events: data.events.length,
    })

    // 自动适应视图
    setTimeout(() => graphViewRef.value?.fitView(), 100)
  } catch (err) {
    console.error('Failed to load recording:', err)
    alert(t('errors.invalidDemoFile'))
  }
}

// ==================== 执行器事件处理 ====================

function handleExecutorEvent(event: ExecutorEvent): void {
  switch (event.type) {
    case ExecutorEventType.NodeStart:
      graphStore.executingNodeIds.add(event.node.id)
      graphStore.executingNodeIds = new Set(graphStore.executingNodeIds)
      break

    case ExecutorEventType.NodeComplete:
      graphStore.executingNodeIds.delete(event.node.id)
      graphStore.executingNodeIds = new Set(graphStore.executingNodeIds)
      break

    case ExecutorEventType.DataPropagate:
      // 显示数据在边上传输
      for (const transfer of event.transfers) {
        const edgeId = `${transfer.fromPortId}->${transfer.toPortId}`
        graphStore.edgeDataTransfers.set(edgeId, transfer)
      }
      graphStore.edgeDataTransfers = new Map(graphStore.edgeDataTransfers)

      // 短暂显示后清除
      setTimeout(() => {
        for (const transfer of event.transfers) {
          const edgeId = `${transfer.fromPortId}->${transfer.toPortId}`
          graphStore.edgeDataTransfers.delete(edgeId)
        }
        graphStore.edgeDataTransfers = new Map(graphStore.edgeDataTransfers)
      }, 500)
      break

    case ExecutorEventType.Complete:
    case ExecutorEventType.Cancelled:
      // 播放结束，清除执行状态
      graphStore.executingNodeIds = new Set()
      break

    case ExecutorEventType.Start:
    case ExecutorEventType.Iteration:
    case ExecutorEventType.Error:
      // 这些事件可用于 UI 显示，暂不处理
      break
  }
}

// ==================== 播放控制 ====================

function play(): void {
  if (!replayExecutor.value) return

  replayExecutor.value.playbackSpeed = playbackSpeed.value

  if (replayExecutor.value.isPaused) {
    // 如果是暂停状态，恢复播放
    replayExecutor.value.resume()
  } else if (replayExecutor.value.executorState === ExecutorState.Idle) {
    // 如果是空闲状态，开始执行
    replayExecutor.value.execute(graphStore.currentGraph)
  }
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

  // 取消当前执行
  replayExecutor.value.cancel()

  // 重置状态
  graphStore.clearExecutionState()
  currentEventIndex.value = 0

  // 重新加载录制数据
  replayExecutor.value.loadRecording(recording.value, graphStore.currentGraph)
}

function setSpeed(speed: number): void {
  playbackSpeed.value = speed
  if (replayExecutor.value) {
    replayExecutor.value.playbackSpeed = speed
  }
}

// ==================== 导航 ====================

function goToEditor(): void {
  router.push('/editor')
}

// ==================== 清理 ====================

function cleanup(): void {
  if (replayExecutor.value) {
    replayExecutor.value.cancel()
    replayExecutor.value = null
  }
  recording.value = null
  graphStore.clearExecutionState()
  currentEventIndex.value = 0
}

onUnmounted(cleanup)
</script>

<template>
  <div class="replay-view">
    <!-- 顶部工具栏 -->
    <div class="replay-toolbar">
      <button class="toolbar-btn back-btn" @click="goToEditor">
        ← {{ t('demo.backToEditor') }}
      </button>

      <div class="toolbar-title">
        {{ t('demo.replayMode') }}
      </div>

      <div class="toolbar-spacer" />

      <!-- 文件加载 -->
      <button class="toolbar-btn upload-btn" @click="handleUpload">
        📂 {{ t('demo.loadRecording') }}
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleFileChange"
      />

      <LocaleSwitcher />
    </div>

    <!-- 主内容区 -->
    <div class="replay-content">
      <!-- 未加载时的占位 -->
      <div v-if="!isLoaded" class="empty-state">
        <div class="empty-icon">📂</div>
        <div class="empty-text">{{ t('demo.noRecordingLoaded') }}</div>
        <button class="upload-action-btn" @click="handleUpload">
          {{ t('demo.loadRecording') }}
        </button>
      </div>

      <!-- 图展示 -->
      <AnoraGraphView
        v-else
        ref="graphViewRef"
        :graph="graphStore.currentGraph!"
        :node-positions="graphStore.nodePositions"
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
        <input
          type="range"
          :min="0"
          :max="totalEvents"
          :value="currentEventIndex"
          class="progress-slider"
          disabled
        />
        <div class="progress-text">
          {{ currentEventIndex }} / {{ totalEvents }} ({{ progress }}%)
        </div>
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

.progress-slider {
  flex: 1;
  height: 4px;
  cursor: pointer;
}

.progress-text {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
  min-width: 120px;
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
