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
/* ArithmeticNode 特有样式 - 通用样式由 node-theme.css 提供 */
.operation-select {
  width: 100%;
}
</style>
