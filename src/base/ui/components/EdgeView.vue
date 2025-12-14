<script setup lang="ts">
/**
 * EdgeView - 自定义边组件
 * 使用贝塞尔曲线，支持动画效果和数据传递显示
 */
import { computed, ref } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@vue-flow/core'
import { useGraphStore } from '@/stores/graph'
import { storeToRefs } from 'pinia'

const props = defineProps<EdgeProps>()

const graphStore = useGraphStore()
const { edgeDataTransfers, iterationDelay } = storeToRefs(graphStore)

/** 从边 ID 解析出 sourceHandleId 和 targetHandleId */
const parsedHandleIds = computed(() => {
  // 边的 ID 格式: ${sourcePortId}->${targetPortId}
  const parts = props.id.split('->')
  if (parts.length === 2) {
    return { sourceHandleId: parts[0], targetHandleId: parts[1] }
  }
  return { sourceHandleId: undefined, targetHandleId: undefined }
})

/** 是否正在执行（用于动画） */
const isActive = computed(() => {
  // 检查源节点是否正在执行
  const sourceNodeId = props.sourceNode?.id
  return sourceNodeId ? graphStore.isNodeExecuting(sourceNodeId) : false
})

/** 边的唯一标识 */
const edgeKey = computed(() => props.id)

/** 是否被选中 */
const isSelected = computed(() => graphStore.selectedEdges.has(edgeKey.value))

/** 是否有数据传递 */
const hasDataTransfer = computed(() => {
  const { sourceHandleId, targetHandleId } = parsedHandleIds.value
  if (!sourceHandleId || !targetHandleId) return false
  const edgeKey = `${sourceHandleId}->${targetHandleId}`
  return edgeDataTransfers.value.has(edgeKey)
})

/** 传递的数据 */
const transferData = computed(() => {
  const { sourceHandleId, targetHandleId } = parsedHandleIds.value
  if (!sourceHandleId || !targetHandleId) return undefined
  const edgeKey = `${sourceHandleId}->${targetHandleId}`
  return edgeDataTransfers.value.get(edgeKey)
})

/** 格式化显示的数据 */
const displayData = computed(() => {
  if (!transferData.value) return ''
  const data = transferData.value.data
  if (data === null) return 'null'
  if (data === undefined) return 'undefined'
  if (typeof data === 'string') {
    // 截断长字符串
    return data.length > 20 ? `"${data.slice(0, 17)}..."` : `"${data}"`
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data)
  }
  if (Array.isArray(data)) {
    return `[${data.length}]`
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data)
    return `{${keys.length}}`
  }
  return String(data)
})

/** 是否显示标签（有数据传递时显示） */
const showLabel = computed(() => {
  return hasDataTransfer.value
})

/** 计算贝塞尔路径 */
const pathData = computed(() => {
  return getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  })
})

/** 边的样式 */
const edgeStyle = computed(() => ({
  stroke: hasDataTransfer.value
    ? '#22c55e'
    : isActive.value
      ? '#fbbf24'
      : isSelected.value
        ? '#60a5fa'
        : '#64748b',
  strokeWidth: hasDataTransfer.value ? 3 : isActive.value ? 3 : 2,
}))

/** 标签是否悬浮显示完整内容 */
const isHovered = ref(false)

/** 完整数据内容（用于悬浮提示） */
const fullDataContent = computed(() => {
  if (!transferData.value) return ''
  try {
    return JSON.stringify(transferData.value.data, null, 2)
  } catch {
    return String(transferData.value.data)
  }
})
</script>

<template>
  <BaseEdge
    :id="id"
    :style="edgeStyle"
    :path="pathData[0]"
    :class="{ 'edge-active': isActive, 'edge-data-transfer': hasDataTransfer }"
  />

  <!-- 数据传递标签 -->
  <EdgeLabelRenderer v-if="showLabel">
    <div
      class="edge-data-label"
      :style="{
        transform: `translate(-50%, -50%) translate(${pathData[1]}px, ${pathData[2]}px)`,
        pointerEvents: 'all',
      }"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <span class="data-value">{{ displayData }}</span>
      <!-- 悬浮提示 -->
      <div v-if="isHovered && fullDataContent.length > displayData.length" class="data-tooltip">
        <pre>{{ fullDataContent }}</pre>
      </div>
    </div>
  </EdgeLabelRenderer>
</template>

<style>
/* 边动画 - 在全局样式中定义 */
.vue-flow__edge.edge-active path {
  stroke-dasharray: 5;
  animation: edge-flow 0.5s linear infinite;
}

.vue-flow__edge.edge-data-transfer path {
  stroke-dasharray: none;
  filter: drop-shadow(0 0 3px #22c55e);
}

@keyframes edge-flow {
  from {
    stroke-dashoffset: 10;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* 数据传递标签样式 */
.edge-data-label {
  position: absolute;
  background: rgba(34, 197, 94, 0.9);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-family: monospace;
  white-space: nowrap;
  z-index: 100;
  cursor: default;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.data-value {
  font-weight: 500;
}

.data-tooltip {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 4px;
  background: rgba(30, 30, 46, 0.95);
  color: #e0e0e0;
  padding: 8px;
  border-radius: 6px;
  font-size: 11px;
  max-width: 300px;
  max-height: 200px;
  overflow: auto;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.data-tooltip pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
