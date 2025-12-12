<script setup lang="ts">
/**
 * ForwardNodeView - 中继节点视图
 * 扩展 BaseNodeView，添加直通模式切换控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { ForwardNode } from '@/mods/core/runtime/nodes/ForwardNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useContextField } from '@/base/ui/composables'

interface ForwardNodeProps extends NodeProps {
  data: {
    node: ForwardNode
  }
}

const props = defineProps<ForwardNodeProps>()

const node = computed(() => props.data.node)

/**
 * 使用 useContextField 创建 directThrough 字段的双向绑定
 */
const { value: directThrough } = useContextField(node, {
  field: 'directThrough',
  defaultValue: true,
})
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入直通模式控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls>
      <div class="control-section direct-through-control">
        <label class="direct-through-label">
          <input type="checkbox" v-model="directThrough" class="direct-through-checkbox" />
          <span class="direct-through-icon" :class="{ active: directThrough }">⚡</span>
          <span class="direct-through-text">直通模式</span>
        </label>
      </div>
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* ForwardNode 特有样式 */
.control-section {
  padding: 6px 12px;
  border-bottom: 1px solid var(--node-border, #3a3a5c);
}

.direct-through-control {
  display: flex;
  align-items: center;
}

.direct-through-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 11px;
  color: var(--node-text-muted, #94a3b8);
  user-select: none;
}

.direct-through-label:hover {
  color: var(--node-text, #e2e8f0);
}

.direct-through-checkbox {
  display: none;
}

.direct-through-icon {
  font-size: 14px;
  opacity: 0.4;
  transition: all 0.2s;
}

.direct-through-icon.active {
  opacity: 1;
  color: var(--node-warning, #fbbf24);
}

.direct-through-text {
  transition: color 0.2s;
}
</style>
