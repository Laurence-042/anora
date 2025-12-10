<script setup lang="ts">
/**
 * ArithmeticNodeView - 算术节点视图
 * 基于 BaseNodeView 扩展，提供运算符选择控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { ArithmeticNode, ArithmeticOperation } from '@/mods/core/runtime/nodes/ArithmeticNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElSelect, ElOption } from 'element-plus'

interface ArithmeticNodeProps extends NodeProps {
  data: {
    node: ArithmeticNode
  }
}

const props = defineProps<ArithmeticNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/**
 * 使用 useContextField 创建 operation 字段的双向绑定
 * context 变更时会自动触发边兼容性检查
 */
const { value: currentOperation } = useContextField(node, {
  field: 'operation',
  defaultValue: ArithmeticOperation.Add,
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
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls>
      <div class="control-section">
        <ElSelect
          v-model="currentOperation"
          placeholder="选择运算"
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
      </div>
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* ArithmeticNode 特有样式 */
.control-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--node-border, #3a3a5c);
}

.operation-select {
  width: 100%;
}
</style>
