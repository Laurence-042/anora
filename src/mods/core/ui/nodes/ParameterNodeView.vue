<script setup lang="ts">
/**
 * ParameterNodeView - 参数节点视图
 * 提供参数值的可视化编辑界面
 */
import { computed, ref, watch } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import type { ParameterNode } from '@/mods/core/runtime/nodes/ParameterNode'
import { NodeExecutionStatus } from '@/base/runtime/types'
import { useGraphStore } from '@/stores/graph'

interface ParameterNodeProps extends NodeProps {
  data: {
    node: ParameterNode
  }
}

const props = defineProps<ParameterNodeProps>()
const graphStore = useGraphStore()

const node = computed(() => props.data.node)
const isSelected = computed(() => graphStore.isNodeSelected(node.value.id))
const isExecuting = computed(() => graphStore.isNodeExecuting(node.value.id))

/** 编辑模式 */
const isEditing = ref(false)

/** 本地编辑值 */
const editValue = ref('')

/** 显示值（格式化后） */
const displayValue = computed(() => {
  const raw = node.value.getRawValue()
  if (raw.length > 50) {
    return raw.substring(0, 47) + '...'
  }
  return raw || '(空)'
})

/** 解析后的值预览 */
const parsedPreview = computed(() => {
  const parsed = node.value.getValue()
  const type = typeof parsed
  if (type === 'object') {
    return `[${Array.isArray(parsed) ? 'array' : 'object'}]`
  }
  return `(${type})`
})

/** 开始编辑 */
function startEdit(): void {
  editValue.value = node.value.getRawValue()
  isEditing.value = true
}

/** 保存编辑 */
function saveEdit(): void {
  node.value.setValue(editValue.value)
  isEditing.value = false
}

/** 取消编辑 */
function cancelEdit(): void {
  isEditing.value = false
}

/** 处理键盘事件 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    saveEdit()
  }
  if (event.key === 'Escape') {
    cancelEdit()
  }
}

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
    class="parameter-node"
    :class="{
      'node-selected': isSelected,
      'node-executing': isExecuting,
    }"
    :style="{ borderColor }"
  >
    <!-- 头部 -->
    <div class="node-header">
      <span class="node-type">Parameter</span>
      <span class="node-label">{{ node.label }}</span>
    </div>

    <!-- 值编辑区域 -->
    <div class="value-section">
      <div v-if="isEditing" class="edit-mode">
        <textarea
          v-model="editValue"
          class="value-input"
          rows="3"
          autofocus
          @keydown="handleKeydown"
          @blur="saveEdit"
        />
        <div class="edit-hint">Enter 保存，Esc 取消</div>
      </div>
      <div v-else class="display-mode" @dblclick="startEdit">
        <div class="value-display">{{ displayValue }}</div>
        <div class="value-type">{{ parsedPreview }}</div>
      </div>
    </div>

    <!-- 出 Port -->
    <div class="port-row">
      <Handle
        :id="node.outPorts.get('value')?.id ?? ''"
        type="source"
        :position="Position.Right"
        class="port-handle"
      />
      <span class="port-label">value</span>
    </div>

    <!-- 执行 Port -->
    <div class="exec-ports">
      <Handle
        :id="node.inExecPort.id"
        type="target"
        :position="Position.Left"
        class="exec-handle"
      />
      <Handle
        :id="node.outExecPort.id"
        type="source"
        :position="Position.Right"
        class="exec-handle"
      />
    </div>
  </div>
</template>

<style scoped>
.parameter-node {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 2px solid transparent;
  border-radius: 8px;
  min-width: 160px;
  max-width: 250px;
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(139, 92, 246, 0.2);
  border-radius: 6px 6px 0 0;
}

.node-type {
  font-size: 9px;
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

.node-label {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.value-section {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.value-input {
  width: 100%;
  padding: 8px;
  background: #0f0f1a;
  border: 1px solid #3a3a5c;
  border-radius: 4px;
  color: #e2e8f0;
  font-family: monospace;
  font-size: 11px;
  resize: vertical;
}

.value-input:focus {
  outline: none;
  border-color: #60a5fa;
}

.edit-hint {
  font-size: 9px;
  color: #6b7280;
  text-align: right;
}

.display-mode {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
}

.display-mode:hover {
  background: rgba(255, 255, 255, 0.05);
}

.value-display {
  font-family: monospace;
  font-size: 11px;
  color: #22c55e;
  word-break: break-all;
}

.value-type {
  font-size: 9px;
  color: #6b7280;
  margin-top: 2px;
}

.port-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 12px;
  position: relative;
}

.port-label {
  font-size: 11px;
  color: #94a3b8;
  margin-right: 8px;
}

.port-handle {
  width: 10px;
  height: 10px;
  background: #22c55e;
  border: 2px solid #1a1a2e;
  position: absolute;
  right: -5px;
}

.exec-ports {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  position: relative;
}

.exec-handle {
  width: 8px;
  height: 12px;
  background: #94a3b8;
  border: 2px solid #1a1a2e;
  border-radius: 2px;
}

.exec-handle[data-handlepos='left'] {
  position: absolute;
  left: -4px;
}

.exec-handle[data-handlepos='right'] {
  position: absolute;
  right: -4px;
}
</style>
