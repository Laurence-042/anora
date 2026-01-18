<script setup lang="ts">
/**
 * LogicNodeView - 逻辑节点视图
 * 基于 BaseNodeView 扩展，提供逻辑运算符选择控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { LogicNode, LogicOperation } from '@/mods/core/runtime/nodes/LogicNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElSelect, ElOption } from 'element-plus'

interface LogicNodeProps extends NodeProps {
  data: {
    node: LogicNode
  }
}

const props = defineProps<LogicNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/**
 * 使用 useContextField 创建 operation 字段的双向绑定
 * context 变更时会自动触发边兼容性检查
 */
const { value: currentOperation } = useContextField(node, {
  field: 'operation',
  defaultValue: LogicOperation.And,
})

/** 逻辑运算符选项 */
const operationOptions = [
  { value: LogicOperation.And, label: 'AND (与)' },
  { value: LogicOperation.Or, label: 'OR (或)' },
  { value: LogicOperation.Not, label: 'NOT (非)' },
  { value: LogicOperation.Xor, label: 'XOR (异或)' },
  { value: LogicOperation.Nand, label: 'NAND (与非)' },
  { value: LogicOperation.Nor, label: 'NOR (或非)' },
]
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls="{ readonly }">
      <ElSelect
        v-model="currentOperation"
        placeholder="选择逻辑运算"
        size="small"
        :disabled="readonly"
        :class="['operation-select', inputClass]"
        @keydown="onKeydown"
      >
        <ElOption
          v-for="op in operationOptions"
          :key="op.value"
          :label="op.label"
          :value="op.value"
        />
      </ElSelect>
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* LogicNode 特有样式 */
.operation-select {
  min-width: 100px;
}
</style>
