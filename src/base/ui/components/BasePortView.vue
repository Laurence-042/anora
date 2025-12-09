<script setup lang="ts">
/**
 * BasePortView - Port 基础视图组件
 * 显示节点的输入/输出端口
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { BasePort } from '@/base/runtime/ports'
import { DataType } from '@/base/runtime/types'

const props = defineProps<{
  /** Port 实例 */
  port: BasePort
  /** Port 名称（用于显示） */
  name: string
  /** 是否为输入 Port */
  isInput: boolean
  /** 是否为执行 Port */
  isExec?: boolean
  /** 是否为控制 Port */
  isControl?: boolean
  /** 是否展开（仅 ContainerPort） */
  expanded?: boolean
}>()

const emit = defineEmits<{
  /** 点击展开/收起 */
  (e: 'toggle-expand'): void
}>()

/** Port 类型对应的颜色 */
const typeColors: Record<DataType, string> = {
  [DataType.STRING]: '#22c55e', // green
  [DataType.NUMBER]: '#3b82f6', // blue
  [DataType.INTEGER]: '#8b5cf6', // purple
  [DataType.BOOLEAN]: '#ef4444', // red
  [DataType.ARRAY]: '#f59e0b', // amber
  [DataType.OBJECT]: '#06b6d4', // cyan
  [DataType.NULL]: '#6b7280', // gray
}

/** Port 颜色 */
const portColor = computed(() => {
  if (props.isExec) return '#94a3b8' // slate for exec
  if (props.isControl) return '#f97316' // orange for control
  return typeColors[props.port.dataType] ?? '#6b7280'
})

/** Handle 位置 */
const handlePosition = computed(() => (props.isInput ? Position.Left : Position.Right))

/** 是否为 ContainerPort */
const isContainer = computed(() => {
  return props.port.dataType === DataType.ARRAY || props.port.dataType === DataType.OBJECT
})

/** 格式化显示数据 */
const displayValue = computed(() => {
  const data = props.port.peek()
  if (data === null) return 'null'
  if (data === undefined) return ''

  if (typeof data === 'object') {
    try {
      const str = JSON.stringify(data)
      return str.length > 30 ? str.substring(0, 27) + '...' : str
    } catch {
      return '[Object]'
    }
  }

  const str = String(data)
  return str.length > 30 ? str.substring(0, 27) + '...' : str
})

/** 是否有数据 */
const hasData = computed(() => props.port.hasData)
</script>

<template>
  <div
    class="port-view"
    :class="{
      'port-input': isInput,
      'port-output': !isInput,
      'port-exec': isExec,
      'port-control': isControl,
      'port-has-data': hasData,
    }"
  >
    <!-- Handle（连接点） -->
    <Handle
      :id="port.id"
      :type="isInput ? 'target' : 'source'"
      :position="handlePosition"
      :style="{ backgroundColor: portColor }"
      class="port-handle"
      :class="{ 'handle-exec': isExec }"
    />

    <!-- Port 内容 -->
    <div class="port-content" :class="{ 'content-input': isInput, 'content-output': !isInput }">
      <!-- 展开按钮（仅 ContainerPort） -->
      <button v-if="isContainer" class="expand-btn" @click="emit('toggle-expand')">
        {{ expanded ? '▼' : '▶' }}
      </button>

      <!-- Port 名称 -->
      <span class="port-name">{{ name }}</span>

      <!-- 类型标签 -->
      <span class="port-type" :style="{ color: portColor }">
        {{ port.dataType }}
      </span>

      <!-- 数据预览（仅有数据时显示） -->
      <span v-if="hasData && !isExec" class="port-value" :title="String(port.peek())">
        = {{ displayValue }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* BasePortView 特有样式 - 通用样式由 node-theme.css 提供 */

.port-view {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  min-height: 20px;
  position: relative;
}

.port-input {
  flex-direction: row;
}

.port-output {
  flex-direction: row-reverse;
}

.port-handle {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--node-bg, #1a1a2e);
  position: absolute;
}

.port-input .port-handle {
  left: -5px;
}

.port-output .port-handle {
  right: -5px;
}

.handle-exec {
  border-radius: 2px;
  width: 8px;
  height: 12px;
}

.port-content {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.content-input {
  flex-direction: row;
  padding-left: 8px;
}

.content-output {
  flex-direction: row-reverse;
  padding-right: 8px;
}

.expand-btn {
  background: none;
  border: none;
  color: var(--node-text, #e2e8f0);
  cursor: pointer;
  padding: 0 2px;
  font-size: 8px;
  opacity: 0.7;
}

.expand-btn:hover {
  opacity: 1;
}

.port-name {
  color: var(--node-text, #e2e8f0);
  font-weight: 500;
}

.port-type {
  font-size: 9px;
  opacity: 0.7;
}

.port-value {
  color: var(--node-text-muted, #94a3b8);
  font-size: 10px;
  opacity: 0.8;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.port-has-data .port-name {
  font-weight: 600;
}

.port-exec {
  opacity: 0.8;
}

.port-control {
  font-style: italic;
}
</style>
