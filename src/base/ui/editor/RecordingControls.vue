<script setup lang="ts">
/**
 * RecordingControls - 录制与回放控制组件
 *
 * 使用 useRecording composable 获取录制/回放状态和操作
 * 本组件只负责 UI 展示和用户交互
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRecording } from '../composables'
import { ReplayState } from '@/base/runtime/demo'
import type { DemoRecording } from '@/base/runtime/demo'
import { useGraphStore } from '@/stores/graph'

const { t } = useI18n()
const graphStore = useGraphStore()
const recording = useRecording()

// ========== 状态 ==========
const isRecording = computed(() => recording.isRecording.value)
const recordedEventCount = computed(() => recording.recordedEventCount.value)
const isReplayMode = computed(() => recording.isReplayMode.value)
const replayState = computed(() => recording.replayState.value)
const replayProgress = computed(() => recording.replayProgress.value)
const isRunning = computed(() => graphStore.isRunning)
const isPlaying = computed(() => replayState.value === ReplayState.Playing)

// ========== 录制操作 ==========

function startRecording(): void {
  recording.startRecording()
}

function stopRecording(): void {
  recording.stopRecording()
}

function downloadRecording(): void {
  const data = recording.exportRecording()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `anora-demo-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ========== 回放操作 ==========

function loadRecordingFromFile(file: File): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    try {
      const data = JSON.parse(content) as DemoRecording

      // 检查版本
      if (data.version !== '2.0.0') {
        alert(t('demo.unsupportedVersion', { version: data.version }))
        return
      }

      recording.loadRecording(data)
    } catch (err) {
      console.error('Failed to parse demo file:', err)
      alert(t('errors.invalidDemoFile'))
    }
  }
  reader.readAsText(file)
}

function exitReplay(): void {
  recording.exitReplay()
}

function togglePlayPause(): void {
  recording.togglePlayPause()
}

function stepForward(): void {
  recording.stepForward()
}

// ========== UI ==========
const fileInput = ref<HTMLInputElement>()

function handleUpload(): void {
  fileInput.value?.click()
}

function handleFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    loadRecordingFromFile(file)
    target.value = ''
  }
}

// 回放速度选项
const speedOptions = [0.5, 1, 1.5, 2, 4]
const currentSpeed = ref(1)

function setSpeed(speed: number): void {
  currentSpeed.value = speed
  recording.setSpeed(speed)
}
</script>

<template>
  <div class="recording-controls">
    <!-- 回放模式 UI -->
    <template v-if="isReplayMode">
      <div class="replay-controls">
        <!-- 进度显示 -->
        <div class="replay-progress">
          <span class="progress-text">
            {{ replayProgress.current }} / {{ replayProgress.total }}
          </span>
        </div>

        <!-- 播放控制 -->
        <button
          class="control-btn"
          @click="togglePlayPause"
          :title="isPlaying ? t('demo.pause') : t('demo.play')"
        >
          <span class="icon">{{ isPlaying ? '⏸' : '▶' }}</span>
        </button>

        <button
          class="control-btn"
          @click="stepForward"
          :disabled="isPlaying"
          :title="t('demo.stepForward')"
        >
          <span class="icon">⏭</span>
        </button>

        <!-- 速度控制 -->
        <select
          class="speed-select"
          :value="currentSpeed"
          @change="setSpeed(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="speed in speedOptions" :key="speed" :value="speed">{{ speed }}x</option>
        </select>

        <!-- 退出回放 -->
        <button class="control-btn exit-btn" @click="exitReplay" :title="t('demo.exitReplay')">
          <span class="icon">✕</span>
        </button>
      </div>
    </template>

    <!-- 正常模式 UI -->
    <template v-else>
      <!-- 录制状态指示 -->
      <div v-if="isRecording" class="recording-indicator">
        <span class="recording-dot"></span>
        <span class="recording-text">{{ t('demo.recording') }}</span>
        <span class="event-count">{{ recordedEventCount }}</span>
      </div>

      <!-- 控制按钮 -->
      <button
        v-if="!isRecording"
        class="control-btn record-btn"
        @click="startRecording"
        :disabled="isRunning"
        :title="t('demo.startRecording')"
      >
        <span class="icon">⏺</span>
      </button>

      <template v-else>
        <button
          class="control-btn stop-btn"
          @click="stopRecording"
          :title="t('demo.stopRecording')"
        >
          <span class="icon">⏹</span>
        </button>
        <button
          class="control-btn download-btn"
          @click="downloadRecording"
          :title="t('demo.export')"
          :disabled="recordedEventCount === 0"
        >
          <span class="icon">💾</span>
        </button>
      </template>

      <!-- 加载录制文件 -->
      <button
        v-if="!isRecording"
        class="control-btn upload-btn"
        @click="handleUpload"
        :disabled="isRunning"
        :title="t('demo.loadRecording')"
      >
        <span class="icon">📂</span>
      </button>

      <input
        ref="fileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleFileChange"
      />
    </template>
  </div>
</template>

<style scoped>
.recording-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.replay-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 4px;
}

.replay-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-text {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
}

.speed-select {
  padding: 2px 6px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #e2e8f0;
  cursor: pointer;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: 4px;
}

.recording-dot {
  width: 8px;
  height: 8px;
  background: #dc2626;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.recording-text {
  font-size: 11px;
  color: #dc2626;
  font-weight: 500;
}

.event-count {
  font-size: 10px;
  color: #94a3b8;
  background: rgba(0, 0, 0, 0.2);
  padding: 1px 6px;
  border-radius: 10px;
}

.control-btn {
  padding: 6px 10px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover:not(:disabled) {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.record-btn:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.2);
  border-color: rgba(220, 38, 38, 0.4);
}

.stop-btn {
  background: rgba(220, 38, 38, 0.15);
  border-color: rgba(220, 38, 38, 0.3);
}

.stop-btn:hover {
  background: rgba(220, 38, 38, 0.25);
}

.exit-btn:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.2);
  border-color: rgba(220, 38, 38, 0.4);
}

.icon {
  font-size: 14px;
}
</style>
