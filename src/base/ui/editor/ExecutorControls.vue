<script setup lang="ts">
/**
 * ExecutorControls - 执行器控制面板
 * 提供执行/停止按钮、迭代信息、延迟设置等
 */
import { ref, computed } from 'vue'
import { useGraphStore } from '@/stores/graph'
import { ExecutorStatus } from '@/base/runtime/types'

const graphStore = useGraphStore()

/** 是否正在执行 */
const isRunning = computed(() => graphStore.isRunning)

/** 执行器状态 */
const status = computed(() => graphStore.executorStatus)

/** 当前迭代 */
const currentIteration = computed(() => graphStore.currentIteration)

/** 延迟设置（本地状态） */
const delayInput = ref(graphStore.iterationDelay)

/** 状态文本 */
const statusText = computed(() => {
  switch (status.value) {
    case ExecutorStatus.Idle:
      return '空闲'
    case ExecutorStatus.Running:
      return `执行中 (迭代 ${currentIteration.value})`
    case ExecutorStatus.Completed:
      return `完成 (${currentIteration.value} 次迭代)`
    case ExecutorStatus.Cancelled:
      return '已取消'
    case ExecutorStatus.Error:
      return '错误'
    default:
      return status.value
  }
})

/** 状态颜色 */
const statusColor = computed(() => {
  switch (status.value) {
    case ExecutorStatus.Running:
      return '#fbbf24'
    case ExecutorStatus.Completed:
      return '#22c55e'
    case ExecutorStatus.Cancelled:
      return '#f59e0b'
    case ExecutorStatus.Error:
      return '#ef4444'
    default:
      return '#6b7280'
  }
})

/** 开始执行 */
async function handleStart(): Promise<void> {
  graphStore.iterationDelay = delayInput.value
  await graphStore.startExecution()
}

/** 停止执行 */
function handleStop(): void {
  graphStore.stopExecution()
}
</script>

<template>
  <div class="executor-controls">
    <!-- 状态显示 -->
    <div class="status-section">
      <span class="status-dot" :style="{ backgroundColor: statusColor }"></span>
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- 控制按钮 -->
    <div class="button-section">
      <button
        v-if="!isRunning"
        class="control-btn start-btn"
        @click="handleStart"
        title="开始执行 (F5)"
      >
        ▶ 执行
      </button>
      <button v-else class="control-btn stop-btn" @click="handleStop" title="停止执行 (Shift+F5)">
        ■ 停止
      </button>
    </div>

    <!-- 延迟设置 -->
    <div class="delay-section">
      <label class="delay-label">
        迭代延迟:
        <input
          v-model.number="delayInput"
          type="number"
          min="0"
          max="10000"
          step="100"
          class="delay-input"
          :disabled="isRunning"
        />
        <span class="delay-unit">ms</span>
      </label>
    </div>

    <!-- 执行节点数 -->
    <div v-if="isRunning" class="executing-info">
      执行中: {{ graphStore.executingNodeIds.size }} 个节点
    </div>
  </div>
</template>

<style scoped>
.executor-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--vf-controls-bg, #1a1a2e);
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.status-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-text {
  font-size: 12px;
  color: var(--vf-text, #e2e8f0);
  min-width: 120px;
}

.button-section {
  display: flex;
  gap: 8px;
}

.control-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.start-btn {
  background: #22c55e;
  color: white;
}

.start-btn:hover {
  background: #16a34a;
}

.stop-btn {
  background: #ef4444;
  color: white;
}

.stop-btn:hover {
  background: #dc2626;
}

.delay-section {
  display: flex;
  align-items: center;
}

.delay-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vf-text-muted, #94a3b8);
}

.delay-input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  background: var(--vf-input-bg, #252542);
  color: var(--vf-text, #e2e8f0);
  font-size: 12px;
}

.delay-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delay-unit {
  color: var(--vf-text-muted, #6b7280);
}

.executing-info {
  font-size: 11px;
  color: #fbbf24;
  padding: 4px 8px;
  background: rgba(251, 191, 36, 0.1);
  border-radius: 4px;
}
</style>
