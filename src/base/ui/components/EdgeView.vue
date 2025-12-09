<script setup lang="ts">
/**
 * EdgeView - 自定义边组件
 * 使用贝塞尔曲线，支持动画效果
 */
import { computed } from 'vue'
import { BezierEdge, type EdgeProps } from '@vue-flow/core'
import { useGraphStore } from '@/stores/graph'

const props = defineProps<EdgeProps>()

const graphStore = useGraphStore()

/** 是否正在执行（用于动画） */
const isActive = computed(() => {
  // 检查源节点是否正在执行
  const sourceNodeId = props.sourceNode?.id
  return sourceNodeId ? graphStore.isNodeExecuting(sourceNodeId) : false
})

/** 边的唯一标识 */
const edgeKey = computed(() => `${props.sourceHandleId}->${props.targetHandleId}`)

/** 是否被选中 */
const isSelected = computed(() => graphStore.selectedEdges.has(edgeKey.value))
</script>

<template>
  <BezierEdge
    v-bind="props"
    :style="{
      stroke: isActive ? '#fbbf24' : isSelected ? '#60a5fa' : '#64748b',
      strokeWidth: isActive ? 3 : 2,
    }"
    :class="{ 'edge-active': isActive }"
  />
</template>

<style>
/* 边动画 - 在全局样式中定义 */
.vue-flow__edge.edge-active path {
  stroke-dasharray: 5;
  animation: edge-flow 0.5s linear infinite;
}

@keyframes edge-flow {
  from {
    stroke-dashoffset: 10;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
