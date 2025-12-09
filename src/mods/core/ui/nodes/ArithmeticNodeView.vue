<script setup lang="ts">
/**
 * ArithmeticNodeView - 算术节点视图
 * 提供运算符选择功能
 */
import { computed, ref, nextTick } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import { ArithmeticNode, ArithmeticOperation } from '@/mods/core/runtime/nodes/ArithmeticNode'
import { NodeExecutionStatus } from '@/base/runtime/types'
import { useGraphStore } from '@/stores/graph'
import { ElSelect, ElOption } from 'element-plus'

interface ArithmeticNodeProps extends NodeProps {
  data: {
    node: ArithmeticNode
  }
}

const props = defineProps<ArithmeticNodeProps>()
const graphStore = useGraphStore()

const node = computed(() => props.data.node)
const isSelected = computed(() => graphStore.isNodeSelected(node.value.id))
const isExecuting = computed(() => graphStore.isNodeExecuting(node.value.id))

/** Label 编辑 */
const isEditingLabel = ref(false)
const labelInput = ref<HTMLInputElement | null>(null)
const editingLabel = ref('')

function startEditLabel(): void {
  editingLabel.value = node.value.label
  isEditingLabel.value = true
  nextTick(() => {
    labelInput.value?.focus()
    labelInput.value?.select()
  })
}

function saveLabel(): void {
  if (editingLabel.value.trim()) {
    node.value.label = editingLabel.value.trim()
  }
  isEditingLabel.value = false
}

/** 当前运算符 */
const currentOperation = computed({
  get: () => node.value.getOperation(),
  set: (val) => node.value.setOperation(val),
})

/** 运算符选项 */
const operationOptions = [
  { value: ArithmeticOperation.Add, label: '加 (+)' },
  { value: ArithmeticOperation.Subtract, label: '减 (-)' },
  { value: ArithmeticOperation.Multiply, label: '乘 (×)' },
  { value: ArithmeticOperation.Divide, label: '除 (÷)' },
  { value: ArithmeticOperation.Modulo, label: '取余 (%)' },
  { value: ArithmeticOperation.Power, label: '幂 (**)' },
]

/** 状态边框颜色 */
const borderColor = computed(() => {
  if (isExecuting.value) return '#fbbf24'
  if (node.value.executionStatus === NodeExecutionStatus.SUCCESS) return '#22c55e'
  if (node.value.executionStatus === NodeExecutionStatus.FAILED) return '#ef4444'
  return isSelected.value ? '#60a5fa' : 'transparent'
})
</script>

<template>
  <div
    class="arithmetic-node"
    :class="{
      'node-selected': isSelected,
      'node-executing': isExecuting,
    }"
    :style="{ borderColor }"
  >
    <!-- 头部 -->
    <div class="node-header">
      <div class="header-info">
        <span class="node-type">core.ArithmeticNode</span>
        <div class="label-row">
          <input
            v-if="isEditingLabel"
            ref="labelInput"
            v-model="editingLabel"
            type="text"
            class="label-input"
            @blur="saveLabel"
            @keyup.enter="saveLabel"
            @keyup.escape="isEditingLabel = false"
          />
          <span v-else class="node-label" @dblclick="startEditLabel">{{ node.label }}</span>
        </div>
      </div>
    </div>

    <!-- 运算符选择 -->
    <div class="control-section">
      <ElSelect v-model="currentOperation" placeholder="选择运算" class="operation-select">
        <ElOption
          v-for="op in operationOptions"
          :key="op.value"
          :label="op.label"
          :value="op.value"
        />
      </ElSelect>
    </div>

    <!-- Ports -->
    <div class="ports-section">
      <!-- 左侧入 Port -->
      <div class="ports-left">
        <div class="port-row">
          <Handle
            :id="node.inExecPort.id"
            type="target"
            :position="Position.Left"
            class="port-handle exec-handle"
          />
          <span class="port-name">exec</span>
        </div>
        <div class="port-row">
          <Handle
            :id="node.inPorts.get('left')?.id ?? ''"
            type="target"
            :position="Position.Left"
            class="port-handle data-handle"
          />
          <span class="port-name">left</span>
        </div>
        <div class="port-row">
          <Handle
            :id="node.inPorts.get('right')?.id ?? ''"
            type="target"
            :position="Position.Left"
            class="port-handle data-handle"
          />
          <span class="port-name">right</span>
        </div>
      </div>

      <!-- 右侧出 Port -->
      <div class="ports-right">
        <div class="port-row">
          <span class="port-name">exec</span>
          <Handle
            :id="node.outExecPort.id"
            type="source"
            :position="Position.Right"
            class="port-handle exec-handle"
          />
        </div>
        <div class="port-row">
          <span class="port-name">result</span>
          <Handle
            :id="node.outPorts.get('result')?.id ?? ''"
            type="source"
            :position="Position.Right"
            class="port-handle data-handle"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arithmetic-node {
  background: var(--vf-node-bg, #1a1a2e);
  border: 2px solid transparent;
  border-radius: 8px;
  min-width: 200px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
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
  padding: 10px 12px;
  background: var(--vf-node-header-bg, #252542);
  border-radius: 6px 6px 0 0;
  border-bottom: 1px solid var(--vf-node-border, #3a3a5c);
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.control-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--vf-node-border, #3a3a5c);
}

.operation-select {
  width: 100%;
}

.operation-select :deep(.el-input__wrapper) {
  background: rgba(37, 37, 66, 0.6);
  border: 1px solid var(--vf-border, #3a3a5c);
  box-shadow: none;
}

.operation-select :deep(.el-input__inner) {
  color: var(--vf-text, #e2e8f0);
  font-size: 12px;
}

.operation-select :deep(.el-input__wrapper:hover) {
  border-color: #60a5fa;
}

.operation-select :deep(.el-select__suffix) {
  color: var(--vf-text-muted, #6b7280);
}

.ports-section {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.ports-left,
.ports-right {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.port-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  position: relative;
}

.ports-left .port-row {
  padding-left: 0;
}

.ports-right .port-row {
  padding-right: 0;
  justify-content: flex-end;
}

.port-name {
  font-size: 11px;
  color: var(--vf-text-muted, #94a3b8);
}

.port-handle {
  width: 12px;
  height: 12px;
  border: 2px solid var(--vf-node-bg, #1a1a2e);
}

.data-handle {
  background: #3b82f6;
  border-radius: 50%;
}

.exec-handle {
  background: #94a3b8;
  border-radius: 2px;
  width: 10px;
  height: 10px;
}

.ports-left .port-handle {
  position: absolute;
  left: -6px;
}

.ports-right .port-handle {
  position: absolute;
  right: -6px;
}
</style>
