<script setup lang="ts">
/**
 * ForwardNodeView - 中继节点视图
 * 简洁的中继节点显示，支持直通模式切换
 */
import { computed, ref } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { Handle, Position } from '@vue-flow/core'
import type { ForwardNode } from '@/mods/core/runtime/nodes/ForwardNode'
import { NodeExecutionStatus } from '@/base/runtime/types'
import { useGraphStore } from '@/stores/graph'

interface ForwardNodeProps extends NodeProps {
  data: {
    node: ForwardNode
  }
}

const props = defineProps<ForwardNodeProps>()
const graphStore = useGraphStore()

const node = computed(() => props.data.node)
const isSelected = computed(() => graphStore.isNodeSelected(node.value.id))
const isExecuting = computed(() => graphStore.isNodeExecuting(node.value.id))

/** 直通模式 */
const directThrough = computed({
  get: () => node.value.directThrough,
  set: (value: boolean) => {
    node.value.directThrough = value
  },
})

/** 数据预览 */
const dataPreview = computed(() => {
  const inPort = node.value.inPorts.get('value')
  const outPort = node.value.outPorts.get('value')
  const data = outPort?.peek() ?? inPort?.peek()

  if (data === null || data === undefined) return null

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

/** 状态边框颜色 */
const borderColor = computed(() => {
  if (isExecuting.value) return '#fbbf24'
  if (node.value.executionStatus === NodeExecutionStatus.SUCCESS) return '#22c55e'
  if (node.value.executionStatus === NodeExecutionStatus.FAILED) return '#ef4444'
  return isSelected.value ? '#60a5fa' : 'transparent'
})
</script>

<template>
  <div
    class="forward-node"
    :class="{
      'node-selected': isSelected,
      'node-executing': isExecuting,
      'direct-through': directThrough,
    }"
    :style="{ borderColor }"
  >
    <!-- 头部 -->
    <div class="node-header">
      <span class="node-type">Forward</span>
      <span class="node-label">{{ node.label }}</span>
      <!-- 直通模式指示器 -->
      <button
        class="direct-through-btn"
        :class="{ active: directThrough }"
        @click="directThrough = !directThrough"
        title="直通模式"
      >
        ⚡
      </button>
    </div>

    <!-- 数据流显示 -->
    <div class="data-flow">
      <!-- 入 Port -->
      <div class="port-side port-left">
        <Handle
          :id="node.inPorts.get('value')?.id ?? ''"
          type="target"
          :position="Position.Left"
          class="port-handle"
        />
        <span class="port-name">in</span>
      </div>

      <!-- 数据预览 -->
      <div v-if="dataPreview" class="data-preview">
        {{ dataPreview }}
      </div>
      <div v-else class="data-arrow">→</div>

      <!-- 出 Port -->
      <div class="port-side port-right">
        <span class="port-name">out</span>
        <Handle
          :id="node.outPorts.get('value')?.id ?? ''"
          type="source"
          :position="Position.Right"
          class="port-handle"
        />
      </div>
    </div>

    <!-- 执行 Port -->
    <div class="exec-row">
      <Handle
        :id="node.inExecPort.id"
        type="target"
        :position="Position.Left"
        class="exec-handle"
      />
      <Handle
        :id="node.outExecPort.id"
        type="source"
        :position="Position.Right"
        class="exec-handle"
      />
    </div>
  </div>
</template>

<style scoped>
.forward-node {
  background: #1a1a2e;
  border: 2px solid transparent;
  border-radius: 8px;
  min-width: 140px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.forward-node.direct-through {
  background: linear-gradient(135deg, #1a1a2e 0%, #1e3a5f 100%);
}

.node-selected {
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.5);
}

.node-executing {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(251, 191, 36, 0);
  }
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 6px 6px 0 0;
}

.node-type {
  font-size: 9px;
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

.node-label {
  font-size: 11px;
  font-weight: 600;
  color: #e2e8f0;
  flex: 1;
}

.direct-through-btn {
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.4;
  transition: all 0.2s;
  padding: 2px 4px;
  border-radius: 4px;
}

.direct-through-btn:hover {
  opacity: 0.7;
  background: rgba(255, 255, 255, 0.1);
}

.direct-through-btn.active {
  opacity: 1;
  color: #fbbf24;
}

.data-flow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  position: relative;
}

.port-side {
  display: flex;
  align-items: center;
  gap: 4px;
}

.port-left {
  padding-left: 8px;
}

.port-right {
  padding-right: 8px;
}

.port-name {
  font-size: 10px;
  color: #6b7280;
}

.port-handle {
  width: 10px;
  height: 10px;
  background: #6b7280;
  border: 2px solid #1a1a2e;
}

.port-left .port-handle {
  position: absolute;
  left: -5px;
}

.port-right .port-handle {
  position: absolute;
  right: -5px;
}

.data-preview {
  font-size: 10px;
  color: #94a3b8;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-arrow {
  color: #4b5563;
  font-size: 14px;
}

.exec-row {
  position: relative;
  height: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.exec-handle {
  width: 8px;
  height: 12px;
  background: #94a3b8;
  border: 2px solid #1a1a2e;
  border-radius: 2px;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}

.exec-handle[data-handlepos='left'] {
  left: -4px;
}

.exec-handle[data-handlepos='right'] {
  right: -4px;
}
</style>
