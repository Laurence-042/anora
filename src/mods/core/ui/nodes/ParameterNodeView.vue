<script setup lang="ts">
/**
 * ParameterNodeView - 参数节点视图
 * 基于 BaseNodeView 扩展，提供参数值编辑控件
 */
import { computed, ref, watch } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { ParameterNode } from '@/mods/core/runtime/nodes/ParameterNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { ElInput } from 'element-plus'

interface ParameterNodeProps extends NodeProps {
  data: {
    node: ParameterNode
  }
}

const props = defineProps<ParameterNodeProps>()

const node = computed(() => props.data.node)

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
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls>
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
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* ParameterNode 特有样式 */
.value-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--node-border, #3a3a5c);
}

.value-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}

.type-badge {
  font-size: 10px;
  color: #a78bfa !important;
  background: rgba(139, 92, 246, 0.2) !important;
  padding: 2px 6px;
  border-radius: 4px;
}

.hint-text {
  font-size: 10px;
  color: var(--node-text-dim, #6b7280);
}
</style>
