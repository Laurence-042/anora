<script setup lang="ts">
/**
 * StringFormatNodeView - 字符串格式化节点视图
 * 基于 BaseNodeView 扩展，提供模板编辑控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { StringFormatNode } from '@/mods/core/runtime/nodes/StringFormatNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElInput } from 'element-plus'

interface StringFormatNodeProps extends NodeProps {
  data: {
    node: StringFormatNode
  }
}

const props = defineProps<StringFormatNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/**
 * 使用 useContextField 创建 template 字段的双向绑定
 * context 变更时会自动触发边兼容性检查
 */
const { value: currentTemplate } = useContextField(node, {
  field: 'template',
  defaultValue: '',
})
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls="{ readonly }">
      <ElInput
        v-model="currentTemplate"
        type="textarea"
        placeholder="模板字符串，使用 {key} 插入参数"
        :rows="3"
        :disabled="readonly"
        :class="['template-input', inputClass]"
        @keydown="onKeydown"
      />
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* StringFormatNode 特有样式 */
.template-input {
  width: 100%;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
}
</style>
