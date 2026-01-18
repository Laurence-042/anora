<script setup lang="ts">
/**
 * ParameterNodeView - 参数节点视图
 * 基于 BaseNodeView 扩展，提供参数值编辑控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { ParameterNode } from '@/mods/core/runtime/nodes/ParameterNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElInput, ElBadge } from 'element-plus'

interface ParameterNodeProps extends NodeProps {
  data: {
    node: ParameterNode
  }
}

const props = defineProps<ParameterNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/**
 * 使用 useContextField 创建 value 字段的双向绑定
 * context 变更时会自动触发边兼容性检查
 */
const { value: editValue } = useContextField(node, {
  field: 'value',
  defaultValue: '',
})

/** 解析后的值预览 */
const parsedPreview = computed(() => {
  const parsed = node.value.getValue()
  const type = typeof parsed
  if (type === 'object') {
    return Array.isArray(parsed) ? 'array' : 'object'
  }
  return type
})
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls="{ readonly }">
      <ElBadge :value="parsedPreview" class="type-badge" type="primary">
        <ElInput
          v-model="editValue"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 8 }"
          placeholder="输入参数值"
          :disabled="readonly"
          :class="['value-textarea', inputClass]"
          @keydown="onKeydown"
        />
      </ElBadge>
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* ParameterNode 特有样式 */
.value-textarea {
  min-width: 100px;
}

.type-badge {
  margin-top: 4px;
}

/* Badge 样式覆盖 */
.type-badge :deep(.el-badge__content) {
  background: rgba(139, 92, 246, 0.8);
  border: none;
  right: calc(0px + var(--el-badge-size) * 2);
}
</style>
