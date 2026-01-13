<script setup lang="ts">
/**
 * ReplayView - 回放视图（重构版）
 *
 * 职责：
 * - 渲染图视图和播放控制 UI
 * - 处理用户交互（点击按钮、拖动进度条等）
 * - 所有业务逻辑委托给 ReplayController
 *
 * 改进：
 * - 不再维护本地状态（currentTime、currentEventIndex 等）
 * - 不再处理复杂的播放逻辑和状态同步
 * - 不再手动管理进度动画
 * - 通过 controller 的响应式属性直接绑定 UI
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElUpload } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import AnoraGraphView from '@/base/ui/components/AnoraGraphView.vue'
import { ReplayController } from '@/base/runtime/demo'
import { useGraphStore } from '@/stores/graph'
import type { DemoRecording } from '@/base/runtime/demo'
import { useReplayIPC } from '@/base/ui/composables/useReplayIPC'
import { useIPC } from '@/base/ui/composables/useIPC'

const { t } = useI18n()
const graphStore = useGraphStore()

// ==================== 调试模式 ====================

const isDev = import.meta.env.DEV
const isDebugMode = ref(isDev)
const debugDurationMs = ref(-1)
const debugSeekKeyframeIndex = ref(0)
const debugLog = ref<string[]>([])

function addDebugLog(message: string) {
  const timestamp = new Date().toLocaleTimeString()
  debugLog.value.unshift(`[${timestamp}] ${message}`)
  if (debugLog.value.length > 20) debugLog.value.pop()
}

function sendDebugMessage(type: string, data?: unknown) {
  const { postMessage } = useIPC()
  addDebugLog(`Send: ${type} ${JSON.stringify(data || {})}`)
  postMessage(type, data)

  const message = { type: type, data }
  window.postMessage(message, '*')
}

function clearDebugLog() {
  debugLog.value = []
}

// ==================== 核心控制器 ====================

const controller = new ReplayController()

// 绑定控制器事件到 graphStore
controller.onExecutorEvent = (event) => {
  if (isDebugMode.value) {
    addDebugLog(`Event: ${event.type}`)
  }
  graphStore.handleExecutorEvent(event)
}

// ==================== UI 引用 ====================

const graphViewRef = ref<InstanceType<typeof AnoraGraphView>>()

// ==================== UI 配置 ====================

const speedOptions = [0.5, 1, 1.5, 2, 4]

// ==================== 文件加载 ====================

async function handleUploadRequest(options: UploadRequestOptions): Promise<void> {
  const file = options.file as File
  const content = await file.text()
  await loadRecordingText(content)
}

async function loadRecordingText(text: string): Promise<void> {
  try {
    const data = JSON.parse(text) as DemoRecording
    await loadRecording(data)
  } catch (err) {
    console.error('Failed to load recording:', err)
    alert(t('errors.invalidDemoFile'))
  }
}

async function loadRecording(data: DemoRecording): Promise<void> {
  // 版本检查
  if (data.version !== '2.0.0') {
    alert(t('demo.unsupportedVersion', { version: data.version }))
    return
  }

  // 加载图到 graphStore
  graphStore.loadFromSerialized(data.initialGraph)

  // 加载到控制器
  await controller.loadRecording(data, graphStore.currentGraph)

  console.log('[ReplayView] Recording loaded')

  // 自动适应视图
  setTimeout(() => graphViewRef.value?.fitView(), 100)
}

// ==================== 播放控制 ====================

function togglePlayPause(): void {
  controller.togglePlayPause()
}

function stepForward(): void {
  controller.stepForward()
}

function restart(): void {
  controller.restart()
}

function setSpeed(speed: number): void {
  controller.setPlaybackSpeed(speed)
}

function handleProgressChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const timeMs = Number(target.value)
  controller.seekToTime(timeMs)
}

// ==================== 工具函数 ====================

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

// ==================== IPC（如果需要） ====================

let ipcHandle: { destroy: () => void } | null = null
onMounted(() => {
  // 初始化 IPC（用于外部控制，如 Godot）
  ipcHandle = useReplayIPC({
    controller,
    loadRecording,
  })

  // 调试模式：监听 IPC 消息
  if (isDebugMode.value) {
    const { on } = useIPC()
    on('*', (msg) => {
      addDebugLog(`Received: ${msg.type}`)
    })
  }
})

onUnmounted(() => {
  controller.dispose()
  ipcHandle?.destroy()
})
</script>

<template>
  <div class="replay-view">
    <!-- 主内容区 -->
    <div class="replay-content">
      <!-- 未加载时的占位 -->
      <div v-if="!controller.isLoaded.value" class="empty-state">
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
        :graph="controller.graph.value!"
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
    <div v-if="controller.isLoaded.value" class="replay-controls">
      <!-- 进度条 -->
      <div class="progress-section">
        <div class="time-display">{{ formatTime(controller.currentTime.value) }}</div>
        <div class="progress-wrapper">
          <input
            type="range"
            :min="0"
            :max="controller.totalDuration.value"
            :value="controller.currentTime.value"
            class="progress-slider"
            @input="handleProgressChange"
          />
          <!-- 关键帧标记 -->
          <div class="keyframe-markers">
            <div
              v-for="(kf, idx) in controller.keyframes.value"
              :key="idx"
              class="keyframe-marker"
              :style="{ left: kf.percentage + '%' }"
              :title="`${formatTime(kf.time)} (${kf.endIndex - kf.startIndex + 1} events)`"
            />
          </div>
        </div>
        <div class="time-display">{{ formatTime(controller.totalDuration.value) }}</div>
        <div class="progress-text">{{ controller.progress.value.toFixed(1) }}%</div>
      </div>

      <!-- 播放控制 -->
      <div class="playback-controls">
        <button class="control-btn" @click="restart" :title="t('demo.restart')">
          <span class="icon">⏮</span>
        </button>

        <button
          class="control-btn play-btn"
          @click="togglePlayPause"
          :title="controller.isPlaying.value ? t('demo.pause') : t('demo.play')"
        >
          <span class="icon">{{ controller.isPlaying.value ? '⏸' : '▶' }}</span>
        </button>

        <button
          class="control-btn"
          @click="stepForward"
          :disabled="controller.isPlaying.value || controller.isCompleted.value"
          :title="t('demo.stepForward')"
        >
          <span class="icon">⏭</span>
        </button>

        <!-- 速度选择 -->
        <select
          class="speed-select"
          :value="controller.playbackSpeed.value"
          @change="setSpeed(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="speed in speedOptions" :key="speed" :value="speed">{{ speed }}x</option>
        </select>
      </div>

      <!-- 状态指示 -->
      <div class="status-section">
        <span v-if="controller.isPlaying.value" class="status playing"
          >▶ {{ t('demo.playing') }}</span
        >
        <span v-else-if="controller.isPaused.value" class="status paused"
          >⏸ {{ t('demo.paused') }}</span
        >
        <span v-else-if="controller.isCompleted.value" class="status completed"
          >✓ {{ t('demo.completed') }}</span
        >
      </div>
    </div>

    <!-- 调试面板 -->
    <div v-if="isDebugMode && controller.isLoaded.value" class="debug-panel">
      <div class="debug-header">
        <h3>🛠️ Debug Panel</h3>
        <button class="debug-toggle" @click="isDebugMode = !isDebugMode">✕</button>
      </div>

      <div class="debug-section">
        <h4>Controller State</h4>
        <div class="debug-info">
          <div>Index: {{ controller.currentIndex.value }} / {{ controller.totalEvents.value }}</div>
          <div>
            Time: {{ formatTime(controller.currentTime.value) }} /
            {{ formatTime(controller.totalDuration.value) }}
          </div>
          <div>
            State:
            {{
              controller.isPlaying.value
                ? 'Playing'
                : controller.isPaused.value
                  ? 'Paused'
                  : controller.isCompleted.value
                    ? 'Completed'
                    : 'Idle'
            }}
          </div>
        </div>
      </div>

      <div class="debug-section">
        <h4>IPC Commands</h4>
        <div class="debug-buttons">
          <button @click="sendDebugMessage('replay.play')">Play</button>
          <button @click="sendDebugMessage('replay.pause')">Pause</button>
          <button @click="sendDebugMessage('replay.toggle')">Toggle</button>
          <button @click="sendDebugMessage('replay.restart')">Restart</button>
          <button @click="sendDebugMessage('replay.stepForward')">Step</button>
        </div>
        <div class="debug-buttons">
          <button @click="sendDebugMessage('replay.setSpeed', { speed: 0.5 })">0.5x</button>
          <button @click="sendDebugMessage('replay.setSpeed', { speed: 1 })">1x</button>
          <button @click="sendDebugMessage('replay.setSpeed', { speed: 2 })">2x</button>
        </div>
        <div class="debug-input-group">
          <label>PlayFor (ms):</label>
          <input v-model.number="debugDurationMs" type="number" />
          <button @click="sendDebugMessage('replay.playFor', { durationMs: debugDurationMs })">
            Send PlayFor
          </button>
        </div>
        <div class="debug-input-group">
          <label>SeekToKeyframe (index):</label>
          <input v-model.number="debugSeekKeyframeIndex" type="number" />
          <button
            @click="
              sendDebugMessage('replay.seekToKeyframe', { keyframeIndex: debugSeekKeyframeIndex })
            "
          >
            Send SeekToKeyframe
          </button>
        </div>
      </div>

      <div class="debug-section">
        <h4>Event Log <button class="debug-clear" @click="clearDebugLog">Clear</button></h4>
        <div class="debug-log">
          <div v-for="(log, idx) in debugLog" :key="idx" class="debug-log-entry">{{ log }}</div>
        </div>
      </div>
    </div>

    <!-- 调试面板开启按钮 -->
    <button
      v-if="isDev && !isDebugMode && controller.isLoaded.value"
      class="debug-trigger"
      @click="isDebugMode = true"
      title="Open Debug Panel"
    >
      🛠️
    </button>
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

/* 调试面板 */
.debug-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 350px;
  height: 100vh;
  background: rgba(15, 15, 26, 0.98);
  border-left: 1px solid var(--vf-border, #3a3a5c);
  padding: 16px;
  overflow-y: auto;
  z-index: 1000;
  font-size: 12px;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.debug-header h3 {
  margin: 0;
  font-size: 14px;
  color: #60a5fa;
}

.debug-toggle {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
}

.debug-toggle:hover {
  color: #e2e8f0;
}

.debug-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vf-border, #3a3a5c);
}

.debug-section h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
}

.debug-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #e2e8f0;
  font-family: monospace;
}

.debug-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.debug-buttons button {
  padding: 6px 12px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
}

.debug-buttons button:hover {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}

.debug-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.debug-input-group label {
  color: #94a3b8;
  font-size: 11px;
  white-space: nowrap;
}

.debug-input-group input {
  flex: 1;
  padding: 4px 8px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  font-size: 11px;
  width: 80px;
}

.debug-input-group button {
  padding: 4px 12px;
  background: #3b82f6;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
}

.debug-input-group button:hover {
  background: #2563eb;
}

.debug-clear {
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 3px;
  color: #94a3b8;
  cursor: pointer;
  font-size: 10px;
  margin-left: 8px;
}

.debug-clear:hover {
  background: var(--vf-btn-bg, #252542);
  color: #e2e8f0;
}

.debug-log {
  max-height: 200px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 8px;
}

.debug-log-entry {
  padding: 4px 0;
  color: #94a3b8;
  font-family: monospace;
  font-size: 10px;
  border-bottom: 1px solid rgba(58, 58, 92, 0.3);
}

.debug-log-entry:last-child {
  border-bottom: none;
}

.debug-trigger {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 48px;
  height: 48px;
  background: #3b82f6;
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  z-index: 999;
  transition: all 0.2s;
}

.debug-trigger:hover {
  background: #2563eb;
  transform: scale(1.1);
}
</style>
