<script setup lang="ts">
/**
 * CompareNodeView - 比较节点视图
 * 基于 BaseNodeView 扩展，提供比较运算符选择控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { CompareNode, CompareOperation } from '@/mods/core/runtime/nodes/CompareNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElSelect, ElOption } from 'element-plus'

interface CompareNodeProps extends NodeProps {
  data: {
    node: CompareNode
  }
}

const props = defineProps<CompareNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/**
 * 使用 useContextField 创建 operation 字段的双向绑定
 * context 变更时会自动触发边兼容性检查
 */
const { value: currentOperation } = useContextField(node, {
  field: 'operation',
  defaultValue: CompareOperation.Equal,
})

/** 比较运算符选项 */
const operationOptions = [
  { value: CompareOperation.Equal, label: '== (等于)' },
  { value: CompareOperation.NotEqual, label: '!= (不等于)' },
  { value: CompareOperation.GreaterThan, label: '> (大于)' },
  { value: CompareOperation.GreaterThanOrEqual, label: '>= (大于等于)' },
  { value: CompareOperation.LessThan, label: '< (小于)' },
  { value: CompareOperation.LessThanOrEqual, label: '<= (小于等于)' },
  { value: CompareOperation.StrictEqual, label: '=== (严格等于)' },
  { value: CompareOperation.StrictNotEqual, label: '!== (严格不等于)' },
]
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls="{ readonly }">
      <ElSelect
        v-model="currentOperation"
        placeholder="选择比较运算"
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
/* CompareNode 特有样式 */
.operation-select {
  min-width: 120px;
}
</style>
