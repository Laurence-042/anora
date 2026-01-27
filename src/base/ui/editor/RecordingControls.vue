<script setup lang="ts">
/**
 * RecordingControls - 录制控制组件
 *
 * 只负责录制功能：
 * - 开始/停止录制
 * - 导出录制文件
 * - 通过 addTimeline 录制其他 Timeline 的事件
 *
 * 回放功能由独立的 ReplayView 页面处理
 */
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/stores/graph'
import { DemoRecorder } from '@/base/ui/replay'
import type { Timeline } from '@/base/runtime/timeline'
import type { ExecutorEventListener } from '@/base/runtime/executor'

/** Executor 接口 */
interface IExecutorForRecording {
  on(listener: ExecutorEventListener): () => void
}

const props = defineProps<{
  executor: IExecutorForRecording
  /** 额外的 Timeline 事件源列表（事件已经是 TimelineEvent，无需转换） */
  eventTimelines?: Timeline[]
}>()

const { t } = useI18n()
const graphStore = useGraphStore()

// ========== 录制状态 ==========

const recorder = ref<DemoRecorder | null>(null)

/** 是否正在录制（从 recorder 派生） */
const isRecording = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  updateTrigger.value // 依赖 updateTrigger 以触发响应式更新
  return recorder.value?.isRecording ?? false
})

/** 已录制的事件数量（从 recorder 派生） */
const recordedEventCount = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  updateTrigger.value // 依赖 updateTrigger 以触发响应式更新
  return recorder.value?.eventCount ?? 0
})

/** 用于触发 UI 更新的计数器 */
const updateTrigger = ref(0)

// ========== 录制操作 ==========

function startRecording(): void {
  // 如果已有录制器且正在录制，不允许重复开始
  if (recorder.value && isRecording.value) return

  // 如果有旧的录制器，先清理
  if (recorder.value) {
    recorder.value.stopRecording()
  }

  const newRecorder = new DemoRecorder()

  // 绑定执行器（默认事件源）
  newRecorder.bindExecutor(props.executor)

  // 添加额外的 Timeline 事件源
  if (props.eventTimelines) {
    for (const timeline of props.eventTimelines) {
      newRecorder.addTimeline(timeline)
    }
  }

  // 绑定 graph
  const graph = graphStore.currentGraph
  newRecorder.bindGraph(graph)

  // 设置状态变更回调（用于触发 UI 更新）
  newRecorder.onRecordingChange = () => {
    updateTrigger.value++
  }

  // 开始录制（传入节点位置和尺寸）
  newRecorder.startRecording(graphStore.nodePositions, graphStore.nodeSizes)

  recorder.value = newRecorder
  console.log('[RecordingControls] Recording started')
}

function stopRecording(): void {
  if (!recorder.value) return

  recorder.value.stopRecording()
  console.log('[RecordingControls] Recording stopped, events:', recorder.value.eventCount)
  // 注意：不清空 recorder.value，保留数据以便导出
}

function downloadRecording(): void {
  if (!recorder.value) return

  const data = recorder.value.exportRecording()
  if (!data) {
    console.warn('[RecordingControls] No recording data to export')
    return
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `anora-demo-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)

  // 下载后清理录制器
  recorder.value = null
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
