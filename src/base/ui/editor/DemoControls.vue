<template>
  <div class="demo-controls">
    <!-- Recording Controls -->
    <div v-if="!hasRecording" class="demo-section recording-section">
      <div class="demo-title">{{ t('demo.recording') }}</div>
      <div class="demo-buttons">
        <button v-if="!isRecording" @click="startRecording" class="btn btn-record">
          <span class="icon">⏺</span> {{ t('demo.startRecording') }}
        </button>
        <button v-else @click="stopRecording" class="btn btn-stop">
          <span class="icon">⏹</span> {{ t('demo.stopRecording') }}
        </button>
        <button
          v-if="!isRecording"
          @click="handleUpload"
          class="btn btn-upload"
          :disabled="isRecording"
        >
          <span class="icon">📂</span> {{ t('demo.loadRecording') }}
        </button>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleFileChange"
      />
    </div>

    <!-- Playback Controls -->
    <div v-else class="demo-section playback-section">
      <div class="demo-title">{{ t('demo.playback') }}</div>

      <!-- Progress Bar -->
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="progress-text">
          {{ t('demo.step') }} {{ currentStep + 1 }} / {{ totalSteps }}
        </div>
      </div>

      <!-- Transport Controls -->
      <div class="demo-buttons transport-controls">
        <button @click="previous" :disabled="!canGoPrevious" class="btn btn-icon">
          <span class="icon">⏮</span>
        </button>
        <button v-if="!isPlaying" @click="play" class="btn btn-play">
          <span class="icon">▶️</span>
        </button>
        <button v-else @click="pause" class="btn btn-pause">
          <span class="icon">⏸</span>
        </button>
        <button @click="stop" :disabled="isIdle" class="btn btn-icon">
          <span class="icon">⏹</span>
        </button>
        <button @click="next" :disabled="!canGoNext" class="btn btn-icon">
          <span class="icon">⏭</span>
        </button>
      </div>

      <!-- Additional Controls -->
      <div class="demo-buttons secondary-controls">
        <button @click="handleDownload" class="btn btn-download">
          <span class="icon">💾</span> {{ t('demo.export') }}
        </button>
        <button @click="handleClear" class="btn btn-clear">
          <span class="icon">🗑</span> {{ t('demo.clear') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface DemoControlsProps {
  isRecording: boolean
  isPlaying: boolean
  isPaused: boolean
  isIdle: boolean
  currentStep: number
  totalSteps: number
  hasRecording: boolean
  canGoNext: boolean
  canGoPrevious: boolean
}

interface DemoControlsEmits {
  (e: 'start-recording'): void
  (e: 'stop-recording'): void
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'stop'): void
  (e: 'next'): void
  (e: 'previous'): void
  (e: 'download'): void
  (e: 'upload', file: File): void
  (e: 'clear'): void
}

const props = defineProps<DemoControlsProps>()
const emit = defineEmits<DemoControlsEmits>()

const fileInput = ref<HTMLInputElement>()

const progressPercent = computed(() => {
  if (props.totalSteps === 0) return 0
  return ((props.currentStep + 1) / props.totalSteps) * 100
})

function startRecording() {
  emit('start-recording')
}

function stopRecording() {
  emit('stop-recording')
}

function play() {
  emit('play')
}

function pause() {
  emit('pause')
}

function stop() {
  emit('stop')
}

function next() {
  emit('next')
}

function previous() {
  emit('previous')
}

function handleDownload() {
  emit('download')
}

function handleUpload() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('upload', file)
    // Reset input so the same file can be selected again
    target.value = ''
  }
}

function handleClear() {
  if (confirm(t('demo.clearConfirm'))) {
    emit('clear')
  }
}
</script>

<style scoped>
.demo-controls {
  background: #2a2a3a;
  border-radius: 8px;
  padding: 16px;
  color: #e0e0e0;
}

.demo-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.demo-title {
  font-size: 14px;
  font-weight: 600;
  color: #a0a0c0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.demo-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #3a3a5a;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn:hover:not(:disabled) {
  background: #4a4a6a;
  transform: translateY(-1px);
}

.btn:active:not(:disabled) {
  transform: translateY(0);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-record {
  background: #c43030;
}

.btn-record:hover:not(:disabled) {
  background: #d44040;
}

.btn-stop {
  background: #555555;
}

.btn-play {
  background: #30c430;
}

.btn-play:hover:not(:disabled) {
  background: #40d440;
}

.btn-pause {
  background: #c49030;
}

.btn-icon {
  padding: 8px 12px;
}

.icon {
  font-size: 16px;
}

.progress-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #1a1a2a;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a90e2, #5aa0f2);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: #808090;
  text-align: center;
}

.transport-controls {
  justify-content: center;
}

.secondary-controls {
  padding-top: 8px;
  border-top: 1px solid #3a3a4a;
}
</style>
