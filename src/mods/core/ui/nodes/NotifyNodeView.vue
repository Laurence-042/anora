<script setup lang="ts">
/**
 * NotifyNodeView - 通知节点视图
 * 提供通知类型选择和标题编辑控件
 */
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { NotifyNode, NotifyType } from '@/mods/core/runtime/nodes/NotifyNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElInput, ElSelect, ElOption, ElInputNumber } from 'element-plus'

interface NotifyNodeProps extends NodeProps {
  data: {
    node: NotifyNode
  }
}

const props = defineProps<NotifyNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/** 通知标题 */
const { value: title } = useContextField(node, {
  field: 'title',
  defaultValue: '调试信息',
})

/** 通知类型 */
const { value: notifyType } = useContextField(node, {
  field: 'type',
  defaultValue: 'info' as NotifyType,
})

/** 显示时长 */
const { value: duration } = useContextField(node, {
  field: 'duration',
  defaultValue: 3000,
})

/** 通知类型选项 */
const typeOptions: Array<{ value: NotifyType; label: string; color: string }> = [
  { value: 'info', label: '信息', color: '#409eff' },
  { value: 'success', label: '成功', color: '#67c23a' },
  { value: 'warning', label: '警告', color: '#e6a23c' },
  { value: 'error', label: '错误', color: '#f56c6c' },
]

/** 获取当前类型颜色 */
const currentTypeColor = computed(() => {
  return typeOptions.find((o) => o.value === notifyType.value)?.color ?? '#409eff'
})
</script>

<template>
  <!-- 复用 BaseNodeView，通过 slot 插入特有控件 -->
  <BaseNodeView v-bind="props as any">
    <template #controls>
      <div class="notify-controls">
        <!-- 标题输入 -->
        <div class="control-row">
          <label class="control-label">标题</label>
          <ElInput
            v-model="title"
            size="small"
            placeholder="通知标题"
            :class="inputClass"
            @keydown="onKeydown"
          />
        </div>

        <!-- 类型选择 -->
        <div class="control-row">
          <label class="control-label">类型</label>
          <ElSelect v-model="notifyType" size="small" class="type-select">
            <ElOption
              v-for="opt in typeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            >
              <span class="type-option">
                <span class="type-dot" :style="{ background: opt.color }"></span>
                {{ opt.label }}
              </span>
            </ElOption>
          </ElSelect>
        </div>

        <!-- 时长设置 -->
        <div class="control-row">
          <label class="control-label">时长</label>
          <ElInputNumber
            v-model="duration"
            size="small"
            :min="0"
            :max="30000"
            :step="500"
            controls-position="right"
            class="duration-input"
          />
          <span class="duration-unit">ms</span>
        </div>

        <!-- 类型指示器 -->
        <div class="type-indicator" :style="{ borderColor: currentTypeColor }">
          <span class="indicator-dot" :style="{ background: currentTypeColor }"></span>
          <span class="indicator-text">{{
            typeOptions.find((o) => o.value === notifyType)?.label
          }}</span>
        </div>
      </div>
    </template>
  </BaseNodeView>
</template>

<style scoped>
.notify-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 110px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-label {
  font-size: 11px;
  color: var(--node-text-muted, #94a3b8);
  min-width: 32px;
  flex-shrink: 0;
}

.type-select {
  flex: 1;
  min-width: 80px;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.duration-input {
  flex: 1;
  min-width: 60px;
}

.duration-unit {
  font-size: 10px;
  color: var(--node-text-dim, #6b7280);
  flex-shrink: 0;
}

.type-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid;
  background: rgba(0, 0, 0, 0.2);
}

.indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.indicator-text {
  font-size: 10px;
  color: var(--node-text, #e2e8f0);
}

/* Element Plus 样式覆盖 */
:deep(.el-input-number) {
  width: 100%;
}

:deep(.el-input-number .el-input__inner) {
  text-align: left;
}
</style>
