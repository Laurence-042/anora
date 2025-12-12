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
import { ElIcon } from 'element-plus'
import { Promotion, Sort } from '@element-plus/icons-vue'

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

/** 切换模式 */
function toggleMode(): void {
  directThrough.value = !directThrough.value
}
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入直通模式控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls>
      <div class="direct-through-control" @click="toggleMode">
        <ElIcon class="mode-icon" :class="{ active: directThrough }">
          <Promotion v-if="directThrough" />
          <Sort v-else />
        </ElIcon>
        <span class="mode-text" :class="{ active: directThrough }">
          {{ directThrough ? '直通模式' : '队列模式' }}
        </span>
      </div>
    </template>
  </BaseNodeView>
</template>

<style scoped>
/* ForwardNode 特有样式 */
.direct-through-control {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.2s;
}

.direct-through-control:hover {
  background: rgba(255, 255, 255, 0.05);
}

.mode-icon {
  font-size: 16px;
  color: var(--node-text-dim, #6b7280);
  transition: all 0.2s;
}

.mode-icon.active {
  color: var(--node-warning, #fbbf24);
}

.mode-text {
  font-size: 11px;
  color: var(--node-text-dim, #6b7280);
  transition: color 0.2s;
}

.mode-text.active {
  color: var(--node-warning, #fbbf24);
}
</style>
