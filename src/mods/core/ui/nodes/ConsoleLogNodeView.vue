<script setup lang="ts">
/**
 * ConsoleLogNodeView - 控制台输出节点视图
 * 基于 BaseNodeView 扩展，提供前缀编辑控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { ConsoleLogNode } from '@/mods/core/runtime/nodes/ConsoleLogNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElInput } from 'element-plus'

interface ConsoleLogNodeProps extends NodeProps {
  data: {
    node: ConsoleLogNode
  }
}

const props = defineProps<ConsoleLogNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/**
 * 使用 useContextField 创建 prefix 字段的双向绑定
 * context 变更时会自动触发边兼容性检查
 */
const { value: currentPrefix } = useContextField(node, {
  field: 'prefix',
  defaultValue: '[ANORA]',
})
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls="{ readonly }">
      <ElInput
        v-model="currentPrefix"
        placeholder="输出前缀"
        size="small"
        :disabled="readonly"
        :class="['prefix-input', inputClass]"
        @keydown="onKeydown"
      />
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* ConsoleLogNode 特有样式 */
.prefix-input {
  width: 100%;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
}
</style>
