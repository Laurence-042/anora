<script setup lang="ts">
/**
 * RecordingControls - 录制控制组件
 * 用于在主编辑器中录制操作序列，导出供演示模式使用
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  isRecording: boolean
  operationCount: number
}

interface Emits {
  (e: 'start-recording'): void
  (e: 'stop-recording'): void
  (e: 'download'): void
  (e: 'upload', file: File): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const fileInput = ref<HTMLInputElement>()

function handleUpload() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('upload', file)
    target.value = ''
  }
}
</script>

<template>
  <div class="recording-controls">
    <!-- 录制状态指示 -->
    <div v-if="isRecording" class="recording-indicator">
      <span class="recording-dot"></span>
      <span class="recording-text">{{ t('demo.recording') }}</span>
      <span class="operation-count">{{ operationCount }}</span>
    </div>

    <!-- 控制按钮 -->
    <button
      v-if="!isRecording"
      class="control-btn record-btn"
      @click="emit('start-recording')"
      :title="t('demo.startRecording')"
    >
      <span class="icon">⏺</span>
    </button>

    <template v-else>
      <button
        class="control-btn stop-btn"
        @click="emit('stop-recording')"
        :title="t('demo.stopRecording')"
      >
        <span class="icon">⏹</span>
      </button>
      <button
        class="control-btn download-btn"
        @click="emit('download')"
        :title="t('demo.export')"
        :disabled="operationCount === 0"
      >
        <span class="icon">💾</span>
      </button>
    </template>

    <!-- 加载录制文件（非录制状态可用） -->
    <button
      v-if="!isRecording"
      class="control-btn upload-btn"
      @click="handleUpload"
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
  </div>
</template>

<style scoped>
.recording-controls {
  display: flex;
  align-items: center;
  gap: 8px;
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

.operation-count {
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

.icon {
  font-size: 14px;
}
</style>
