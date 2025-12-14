<script setup lang="ts">
/**
 * RecordingControls - 录制控制组件
 *
 * 只负责录制功能：
 * - 开始/停止录制
 * - 导出录制文件
 *
 * 回放功能由独立的 ReplayView 页面处理
 */
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/stores/graph'
import { DemoRecorder } from '@/base/runtime/demo'
import type { DemoRecording } from '@/base/runtime/demo'

const props = defineProps<{
  nodePositions: Map<string, { x: number; y: number }>
}>()

const { t } = useI18n()
const graphStore = useGraphStore()

// ========== 录制状态 ==========

const recorder = ref<DemoRecorder | null>(null)
const isRecording = computed(() => recorder.value?.isRecording ?? false)
const recordedEventCount = computed(() => recorder.value?.eventCount ?? 0)
const isRunning = computed(() => graphStore.isRunning)

// ========== 录制操作 ==========

function startRecording(): void {
  if (recorder.value) return

  const newRecorder = new DemoRecorder()

  // 绑定 executor
  const executor = graphStore.executor
  if (executor) {
    newRecorder.bindExecutor(executor)
  }

  // 绑定 graph
  const graph = graphStore.currentGraph
  newRecorder.bindGraph(graph)

  // 开始录制（传入节点位置）
  newRecorder.startRecording(props.nodePositions)

  recorder.value = newRecorder
  console.log('[RecordingControls] Recording started')
}

function stopRecording(): void {
  if (!recorder.value) return

  recorder.value.stopRecording()
  console.log('[RecordingControls] Recording stopped, events:', recorder.value.eventCount)
}

function downloadRecording(): void {
  if (!recorder.value) return

  const data: DemoRecording = recorder.value.exportRecording()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `anora-demo-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function clearRecording(): void {
  if (recorder.value) {
    recorder.value.stopRecording()
    recorder.value = null
  }
}

// ========== 清理 ==========

onUnmounted(() => {
  if (recorder.value) {
    recorder.value.stopRecording()
  }
})
</script>

<template>
  <div class="recording-controls">
    <!-- 录制状态指示 -->
    <div v-if="isRecording" class="recording-indicator">
      <span class="recording-dot"></span>
      <span class="recording-text">{{ t('demo.recording') }}</span>
      <span class="event-count">{{ recordedEventCount }}</span>
    </div>

    <!-- 开始录制按钮 -->
    <button
      v-if="!isRecording"
      class="control-btn record-btn"
      @click="startRecording"
      :disabled="isRunning"
      :title="t('demo.startRecording')"
    >
      <span class="icon">⏺</span>
    </button>

    <!-- 录制中的控制按钮 -->
    <template v-else>
      <button class="control-btn stop-btn" @click="stopRecording" :title="t('demo.stopRecording')">
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
      <button class="control-btn clear-btn" @click="clearRecording" :title="t('demo.clear')">
        <span class="icon">🗑</span>
      </button>
    </template>
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

.icon {
  font-size: 14px;
}
</style>
