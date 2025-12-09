<script setup lang="ts">
/**
 * BaseNodeView - 节点基础视图组件
 * 作为 Vue-Flow 的自定义节点组件
 */
import { computed, ref, nextTick } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { BaseNode } from '@/base/runtime/nodes'
import { NodeExecutionStatus } from '@/base/runtime/types'
import BasePortView from './BasePortView.vue'
import { useGraphStore } from '@/stores/graph'

// Vue-Flow 节点 Props
interface AnoraNodeProps extends NodeProps {
  data: {
    node: BaseNode
  }
}

const props = defineProps<AnoraNodeProps>()

const graphStore = useGraphStore()

/** 获取节点实例 */
const node = computed(() => props.data.node)

/** 是否被选中 */
const isSelected = computed(() => graphStore.isNodeSelected(node.value.id))

/** 是否正在执行 */
const isExecuting = computed(() => graphStore.isNodeExecuting(node.value.id))

/** 节点执行状态 */
const executionStatus = computed(() => node.value.executionStatus)

/** 展开的 ContainerPort ID 集合 */
const expandedPorts = ref<Set<string>>(new Set())

/** 切换 Port 展开状态 */
function togglePortExpand(portId: string): void {
  if (expandedPorts.value.has(portId)) {
    expandedPorts.value.delete(portId)
  } else {
    expandedPorts.value.add(portId)
  }
}

/** Label 编辑状态 */
const isEditingLabel = ref(false)
const editLabelInput = ref<HTMLInputElement | null>(null)
const editingLabelValue = ref('')

/** 开始编辑 label */
function startEditLabel(): void {
  editingLabelValue.value = node.value.label
  isEditingLabel.value = true
  nextTick(() => {
    editLabelInput.value?.focus()
    editLabelInput.value?.select()
  })
}

/** 完成编辑 label */
function finishEditLabel(): void {
  if (editingLabelValue.value.trim()) {
    node.value.label = editingLabelValue.value.trim()
  }
  isEditingLabel.value = false
}

/** 取消编辑 label */
function cancelEditLabel(): void {
  isEditingLabel.value = false
}

/** 状态边框颜色 */
const statusBorderColor = computed(() => {
  if (isExecuting.value) return '#fbbf24' // amber - executing
  switch (executionStatus.value) {
    case NodeExecutionStatus.SUCCESS:
      return '#22c55e' // green
    case NodeExecutionStatus.FAILED:
      return '#ef4444' // red
    default:
      return isSelected.value ? '#60a5fa' : 'transparent' // blue when selected
  }
})

/** 获取 Port 的名称（从 Map 中反查） */
function getPortName(map: Map<string, unknown>, port: unknown): string {
  for (const [name, p] of map) {
    if (p === port) return name
  }
  return ''
}

/** 警告信息 */
const warnings = computed(() => node.value.getConfigurationWarnings())
</script>

<template>
  <div
    class="anora-node"
    :class="{
      'node-selected': isSelected,
      'node-executing': isExecuting,
      'node-success': executionStatus === NodeExecutionStatus.SUCCESS,
      'node-failed': executionStatus === NodeExecutionStatus.FAILED,
    }"
    :style="{ borderColor: statusBorderColor }"
  >
    <!-- 节点头部 -->
    <div class="node-header">
      <div class="header-info">
        <span class="node-type">{{ node.typeId }}</span>
        <!-- Label 显示/编辑 -->
        <div class="label-row">
          <input
            v-if="isEditingLabel"
            ref="editLabelInput"
            v-model="editingLabelValue"
            type="text"
            class="label-input"
            @blur="finishEditLabel"
            @keyup.enter="finishEditLabel"
            @keyup.escape="cancelEditLabel"
          />
          <span v-else class="node-label" @dblclick="startEditLabel">{{ node.label }}</span>
        </div>
      </div>
      <!-- 执行状态指示器 -->
      <span v-if="isExecuting" class="status-indicator executing">⟳</span>
      <span
        v-else-if="executionStatus === NodeExecutionStatus.SUCCESS"
        class="status-indicator success"
        >✓</span
      >
      <span
        v-else-if="executionStatus === NodeExecutionStatus.FAILED"
        class="status-indicator failed"
        >✗</span
      >
    </div>

    <!-- 警告信息 -->
    <div v-if="warnings.length > 0" class="node-warnings">
      <div v-for="(warning, index) in warnings" :key="index" class="warning-item">
        ⚠ {{ warning }}
      </div>
    </div>

    <!-- 节点控制区域（供子组件覆盖使用的插槽） -->
    <div class="node-controls">
      <slot name="controls" :node="node"></slot>
    </div>

    <!-- 节点主体：Ports -->
    <div class="node-body">
      <!-- 左侧：输入 Ports -->
      <div class="ports-column ports-left">
        <!-- 执行入 Port -->
        <BasePortView :port="node.inExecPort" name="exec" :is-input="true" :is-exec="true" />

        <!-- 控制入 Ports -->
        <BasePortView
          v-for="[name, port] in node.inControlPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="true"
          :is-control="true"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />

        <!-- 数据入 Ports -->
        <BasePortView
          v-for="[name, port] in node.inPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="true"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />
      </div>

      <!-- 右侧：输出 Ports -->
      <div class="ports-column ports-right">
        <!-- 执行出 Port -->
        <BasePortView :port="node.outExecPort" name="exec" :is-input="false" :is-exec="true" />

        <!-- 控制出 Ports -->
        <BasePortView
          v-for="[name, port] in node.outControlPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="false"
          :is-control="true"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />

        <!-- 数据出 Ports -->
        <BasePortView
          v-for="[name, port] in node.outPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="false"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />
      </div>
    </div>

    <!-- 错误信息 -->
    <div v-if="node.lastError" class="node-error">
      {{ node.lastError }}
    </div>
  </div>
</template>

<style scoped>
.anora-node {
  background: var(--vf-node-bg, #1a1a2e);
  border: 2px solid transparent;
  border-radius: 8px;
  min-width: 200px;
  max-width: 320px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.node-selected {
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.5);
}

.node-executing {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(251, 191, 36, 0);
  }
}

.node-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--vf-node-header-bg, #252542);
  border-radius: 6px 6px 0 0;
  border-bottom: 1px solid var(--vf-node-border, #3a3a5c);
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.node-type {
  font-size: 10px;
  color: var(--vf-text-muted, #94a3b8);
  font-family: monospace;
}

.label-row {
  display: flex;
  align-items: center;
}

.node-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--vf-node-text, #e2e8f0);
  cursor: text;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 4px;
  transition: background 0.2s;
}

.node-label:hover {
  background: rgba(255, 255, 255, 0.1);
}

.label-input {
  font-size: 14px;
  font-weight: 600;
  color: var(--vf-node-text, #e2e8f0);
  background: var(--vf-input-bg, #252542);
  border: 1px solid #60a5fa;
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  width: 100%;
}

.status-indicator {
  font-size: 14px;
  margin-left: 8px;
}

.status-indicator.executing {
  color: #fbbf24;
  animation: spin 1s linear infinite;
}

.status-indicator.success {
  color: #22c55e;
}

.status-indicator.failed {
  color: #ef4444;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.node-warnings {
  background: rgba(251, 191, 36, 0.1);
  padding: 4px 8px;
  border-bottom: 1px solid var(--vf-node-border, #3a3a5c);
}

.warning-item {
  font-size: 10px;
  color: #fbbf24;
}

.node-controls {
  /* 控制区域，供特定节点添加编辑控件 */
}

.node-controls:empty {
  display: none;
}

.node-body {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  min-height: 40px;
}

.ports-column {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ports-left {
  align-items: flex-start;
}

.ports-right {
  align-items: flex-end;
}

.node-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 0 0 6px 6px;
  border-top: 1px solid rgba(239, 68, 68, 0.3);
}
</style>
