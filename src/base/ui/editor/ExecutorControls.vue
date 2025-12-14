<script setup lang="ts">
/**
 * ExecutorControls - 执行器控制面板
 * 提供执行/停止/暂停/步进按钮、迭代信息、延迟设置等
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/stores/graph'
import { ExecutorState } from '@/base/runtime/executor'

const { t } = useI18n()
const graphStore = useGraphStore()

/** 状态机状态 */
const state = computed(() => graphStore.stateMachineState)

/** 当前迭代 */
const currentIteration = computed(() => graphStore.currentIteration)

/** 延迟设置（本地状态） */
const delayInput = ref(graphStore.iterationDelay)

/** 状态文本 */
const statusText = computed(() => {
  switch (state.value) {
    case ExecutorState.Idle:
      return t('executor.idle')
    case ExecutorState.Running:
      return `${t('executor.running')} (${t('executor.iteration')} ${currentIteration.value})`
    case ExecutorState.Paused:
      return `${t('executor.paused')} (${t('executor.iteration')} ${currentIteration.value})`
    case ExecutorState.Stepping:
      return `${t('executor.stepping')} (${t('executor.iteration')} ${currentIteration.value})`
    default:
      return state.value
  }
})

/** 状态颜色 */
const statusColor = computed(() => {
  switch (state.value) {
    case ExecutorState.Running:
    case ExecutorState.Stepping:
      return '#fbbf24' // 黄色 - 执行中
    case ExecutorState.Paused:
      return '#f59e0b' // 橙色 - 暂停
    case ExecutorState.Idle:
    default:
      return '#6b7280' // 灰色 - 空闲
  }
})

/** 开始执行（连续模式） */
async function handleStart(): Promise<void> {
  graphStore.iterationDelay = delayInput.value
  await graphStore.startExecution(false)
}

/** 开始执行（步进模式） */
async function handleStartStep(): Promise<void> {
  graphStore.iterationDelay = delayInput.value
  await graphStore.startExecution(true)
}

/** 停止执行 */
function handleStop(): void {
  graphStore.stopExecution()
}

/** 暂停执行 */
function handlePause(): void {
  graphStore.pauseExecution()
}

/** 恢复执行 */
function handleResume(): void {
  graphStore.resumeExecution()
}

/** 单步执行 */
function handleStep(): void {
  graphStore.stepExecution()
}

// 暴露状态枚举给模板
const State = ExecutorState
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
      <!-- 空闲时：显示运行和步进启动按钮 -->
      <template v-if="state === State.Idle">
        <button
          class="control-btn start-btn"
          @click="handleStart"
          :title="`${t('executor.run')} (F5)`"
        >
          ▶ {{ t('executor.run') }}
        </button>
        <button
          class="control-btn step-btn"
          @click="handleStartStep"
          :title="`${t('executor.stepRun')} (F10)`"
        >
          ⏭ {{ t('executor.stepRun') }}
        </button>
      </template>

      <!-- 执行中时：显示暂停/恢复、步进、停止按钮 -->
      <template v-else>
        <button
          v-if="state === State.Running"
          class="control-btn pause-btn"
          @click="handlePause"
          :title="`${t('executor.pause')} (F6)`"
        >
          ⏸ {{ t('executor.pause') }}
        </button>
        <button
          v-else-if="state === State.Paused"
          class="control-btn resume-btn"
          @click="handleResume"
          :title="`${t('executor.resume')} (F5)`"
        >
          ▶ {{ t('executor.resume') }}
        </button>
        <button
          class="control-btn step-btn"
          @click="handleStep"
          :disabled="state !== State.Paused"
          :title="`${t('executor.step')} (F10)`"
        >
          ⏭ {{ t('executor.step') }}
        </button>
        <button
          class="control-btn stop-btn"
          @click="handleStop"
          :title="`${t('executor.stop')} (Shift+F5)`"
        >
          ■ {{ t('executor.stop') }}
        </button>
      </template>
    </div>

    <!-- 延迟设置 -->
    <div class="delay-section">
      <label class="delay-label">
        {{ t('executor.delay') }}:
        <input
          v-model.number="delayInput"
          type="number"
          min="0"
          max="10000"
          step="100"
          class="delay-input"
          :disabled="state !== State.Idle"
        />
      </label>
    </div>

    <!-- 执行节点数 -->
    <div v-if="state === State.Running || state === State.Stepping" class="executing-info">
      {{ t('executor.running') }}: {{ graphStore.executingNodeIds.size }} {{ t('editor.nodes') }}
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

.pause-btn {
  background: #f59e0b;
  color: white;
}

.pause-btn:hover {
  background: #d97706;
}

.resume-btn {
  background: #22c55e;
  color: white;
}

.resume-btn:hover {
  background: #16a34a;
}

.step-btn {
  background: #3b82f6;
  color: white;
}

.step-btn:hover {
  background: #2563eb;
}

.step-btn:disabled {
  background: #6b7280;
  cursor: not-allowed;
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
