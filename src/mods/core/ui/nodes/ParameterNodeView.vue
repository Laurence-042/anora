<script setup lang="ts">
/**
 * ParameterNodeView - 参数节点视图
 * 提供参数值的可视化编辑界面
 */
import { computed, ref, watch, nextTick } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import type { ParameterNode } from '@/mods/core/runtime/nodes/ParameterNode'
import { NodeExecutionStatus } from '@/base/runtime/types'
import { useGraphStore } from '@/stores/graph'
import { ElInput } from 'element-plus'

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

/** 值编辑 */
const editValue = ref('')

/** 初始化编辑值 */
watch(
  () => node.value.getRawValue(),
  (newVal) => {
    editValue.value = newVal
  },
  { immediate: true },
)

/** 解析后的值预览 */
const parsedPreview = computed(() => {
  const parsed = node.value.getValue()
  const type = typeof parsed
  if (type === 'object') {
    return Array.isArray(parsed) ? 'array' : 'object'
  }
  return type
})

/** 保存值 */
function saveValue(): void {
  node.value.setValue(editValue.value)
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
      <div class="header-info">
        <span class="node-type">core.ParameterNode</span>
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

    <!-- 值编辑区域 -->
    <div class="value-section">
      <ElInput
        v-model="editValue"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 8 }"
        placeholder="输入参数值"
        class="value-textarea"
        @blur="saveValue"
        @keyup.ctrl.enter="saveValue"
      />
      <div class="value-hint">
        <span class="type-badge">{{ parsedPreview }}</span>
        <span class="hint-text">Ctrl+Enter 确认</span>
      </div>
    </div>

    <!-- 出 Port -->
    <div class="port-row">
      <Handle
        :id="node.outPorts.get('value')?.id ?? ''"
        type="source"
        :position="Position.Right"
        class="port-handle data-handle"
      />
      <span class="port-label">value</span>
    </div>

    <!-- 执行 Port -->
    <div class="exec-ports">
      <div class="exec-port-left">
        <Handle
          :id="node.inExecPort.id"
          type="target"
          :position="Position.Left"
          class="port-handle exec-handle"
        />
        <span class="exec-label">exec</span>
      </div>
      <div class="exec-port-right">
        <span class="exec-label">exec</span>
        <Handle
          :id="node.outExecPort.id"
          type="source"
          :position="Position.Right"
          class="port-handle exec-handle"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ParameterNode 特有样式 - 通用样式由 node-theme.css 提供 */
.parameter-node {
  max-width: 280px;
}
</style>
