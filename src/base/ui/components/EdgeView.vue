<script setup lang="ts">
/**
 * EdgeView - 自定义边组件
 * 使用贝塞尔曲线，支持动画效果和数据传递显示
 *
 * 视觉效果：
 * - 两端 Port 都可见：实线，选中时高亮，小圆形周期性从出 Port 沿实线运动到入 Port
 * - 任一 Port 被折叠不可见：虚线，选中时高亮，线段从出 Port 到入 Port 移动
 */
import { computed, ref } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@vue-flow/core'
import { useGraphStore } from '@/stores/graph'
import { storeToRefs } from 'pinia'

const props = defineProps<EdgeProps>()

const graphStore = useGraphStore()
const { edgeDataTransfers, expandedPorts, graphRevision } = storeToRefs(graphStore)

/** 从边 ID 解析出 sourceHandleId 和 targetHandleId */
const parsedHandleIds = computed(() => {
  // 边的 ID 格式: ${sourcePortId}->${targetPortId}
  const parts = props.id.split('->')
  if (parts.length === 2) {
    return { sourceHandleId: parts[0], targetHandleId: parts[1] }
  }
  return { sourceHandleId: undefined, targetHandleId: undefined }
})

/** 源 Port 是否可见 */
const isSourcePortVisible = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  graphRevision.value // 依赖 graphRevision 触发更新
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  expandedPorts.value // 依赖 expandedPorts 触发更新
  const { sourceHandleId } = parsedHandleIds.value
  if (!sourceHandleId) return true
  return graphStore.isPortVisible(sourceHandleId)
})

/** 目标 Port 是否可见 */
const isTargetPortVisible = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  graphRevision.value // 依赖 graphRevision 触发更新
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  expandedPorts.value // 依赖 expandedPorts 触发更新
  const { targetHandleId } = parsedHandleIds.value
  if (!targetHandleId) return true
  return graphStore.isPortVisible(targetHandleId)
})

/** 两端 Port 是否都可见 */
const areBothPortsVisible = computed(() => {
  return isSourcePortVisible.value && isTargetPortVisible.value
})

/** 是否正在执行（用于动画） */
const isActive = computed(() => {
  // 检查源节点是否正在执行
  const sourceNodeId = props.sourceNode?.id
  return sourceNodeId ? graphStore.isNodeExecuting(sourceNodeId) : false
})

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
const edgeStyle = computed(() => {
  const baseStyle: Record<string, string | number> = {
    stroke: hasDataTransfer.value ? '#22c55e' : isActive.value ? '#fbbf24' : '#64748b',
    strokeWidth: hasDataTransfer.value ? 3 : isActive.value ? 3 : 2,
  }

  // 任一 Port 不可见时使用虚线
  if (!areBothPortsVisible.value) {
    baseStyle.strokeDasharray = '8 4'
  }

  return baseStyle
})

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

/** 计算边的长度（用于动画） */
const pathLength = computed(() => {
  // 使用两点间的直线距离作为近似值
  const dx = props.targetX - props.sourceX
  const dy = props.targetY - props.sourceY
  // 贝塞尔曲线的长度约为直线距离的 1.2 倍
  return Math.sqrt(dx * dx + dy * dy) * 1.2
})

/** 动画时长（基于路径长度，保持一致的速度感） */
const animationDuration = computed(() => {
  // 基础速度：每 100px 需要 0.5s
  const baseDuration = (pathLength.value / 100) * 0.5
  // 限制在 0.5s - 3s 之间
  return Math.max(0.5, Math.min(3, baseDuration))
})
</script>

<template>
  <!-- 主边路径 -->
  <BaseEdge
    :id="id"
    :style="edgeStyle"
    :path="pathData[0]"
    :class="{
      'edge-active': isActive,
      'edge-data-transfer': hasDataTransfer,
      'edge-both-visible': areBothPortsVisible,
      'edge-port-hidden': !areBothPortsVisible,
    }"
  />

  <!-- 小圆形动画标记（仅当两端 Port 都可见时显示） -->
  <circle
    v-if="areBothPortsVisible && !hasDataTransfer"
    class="edge-flow-marker"
    r="4"
    :style="{ '--animation-duration': `${animationDuration}s` }"
  >
    <animateMotion :dur="`${animationDuration}s`" repeatCount="indefinite" :path="pathData[0]" />
  </circle>

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
/* 边的基础样式 */
.vue-flow__edge path {
  transition:
    stroke 0.2s,
    stroke-width 0.2s;
}

/* 选中/焦点状态高亮 */
.vue-flow__edge.selected path,
.vue-flow__edge:focus path,
.vue-flow__edge:focus-visible path {
  stroke: #60a5fa !important;
  stroke-width: 3;
}

/* 数据传递状态 */
.vue-flow__edge.edge-data-transfer path {
  filter: drop-shadow(0 0 3px #22c55e);
}

/* 任一 Port 不可见时的虚线动画（线段移动效果） */
.vue-flow__edge.edge-port-hidden path {
  animation: dashed-flow 1s linear infinite;
}

@keyframes dashed-flow {
  from {
    stroke-dashoffset: 24;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* 小圆形流动标记 */
.edge-flow-marker {
  fill: #94a3b8;
  pointer-events: none;
  filter: drop-shadow(0 0 2px rgba(148, 163, 184, 0.5));
}

/* 选中状态时小圆形变色 */
.vue-flow__edge.selected .edge-flow-marker,
.vue-flow__edge:focus .edge-flow-marker,
.vue-flow__edge:focus-visible .edge-flow-marker {
  fill: #60a5fa;
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
