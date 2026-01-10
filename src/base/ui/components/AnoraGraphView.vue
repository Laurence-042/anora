<script setup lang="ts">
/**
 * AnoraGraphView - Anora 图展示组件
 *
 * 纯展示层，提供 Vue-Flow 和 Anora 体系的映射
 * - 接收 AnoraGraph + nodePositions 渲染图
 * - 响应 Executor 事件更新 UI 状态（节点高亮、边数据流等）
 * - 不关心是编辑还是回放
 *
 * 使用方：
 * - GraphEditor: 编辑模式，启用拖拽/连线
 * - ReplayView: 回放模式，只读展示
 */
import { computed, watch, markRaw, type PropType } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import type { AnoraGraph } from '@/base/runtime/graph'
import type { EdgeDataTransfer } from '@/base/runtime/executor'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'

import BaseNodeView from '../components/BaseNodeView.vue'
import EdgeView from '../components/EdgeView.vue'
import { NodeViewRegistry } from '../registry'

// 初始化时设置默认视图
NodeViewRegistry.setDefaultView(BaseNodeView)

// ==================== Props ====================
const props = defineProps({
  /** Anora 图实例 */
  graph: {
    type: Object as PropType<AnoraGraph>,
    required: true,
  },
  /** 节点位置映射 */
  nodePositions: {
    type: Object as PropType<Map<string, { x: number; y: number }>>,
    required: true,
  },
  /** 是否只读模式（禁用拖拽、连线等） */
  readonly: {
    type: Boolean,
    default: false,
  },
  /** 当前正在执行的节点 ID 集合 */
  executingNodeIds: {
    type: Object as PropType<Set<string>>,
    default: () => new Set(),
  },
  /** 不兼容的边集合 */
  incompatibleEdges: {
    type: Object as PropType<Set<string>>,
    default: () => new Set(),
  },
  /** 边数据传递（用于显示数据流） */
  edgeDataTransfers: {
    type: Object as PropType<Map<string, EdgeDataTransfer>>,
    default: () => new Map(),
  },
  /** 选中的节点 ID 集合 */
  selectedNodeIds: {
    type: Object as PropType<Set<string>>,
    default: () => new Set(),
  },
  /** 图版本计数器（用于触发响应式更新） */
  graphRevision: {
    type: Number,
    default: 0,
  },
})

// ==================== Emits ====================
const emit = defineEmits<{
  /** 连接创建 */
  connect: [connection: Connection]
  /** 节点双击 */
  nodeDoubleClick: [nodeId: string, node: SubGraphNode | null]
  /** 画布点击 */
  paneClick: []
  /** 节点拖拽结束 */
  nodeDragStop: [nodeId: string, position: { x: number; y: number }]
  /** 节点变更（选择、删除） */
  nodesChange: [changes: unknown[]]
  /** 边变更（删除） */
  edgesChange: [changes: unknown[]]
}>()

// ==================== Vue-Flow ====================
const { onConnect, onNodeDoubleClick, onPaneClick, fitView, getEdges } = useVueFlow()

/** 根据节点 typeId 获取对应的视图组件类型 */
function getNodeViewType(typeId: string): string {
  return NodeViewRegistry.getViewType(typeId)
}

/** 将 AnoraGraph 转换为 Vue-Flow 节点 */
const vfNodes = computed<Node[]>(() => {
  // 依赖 graphRevision 来触发重新计算
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  props.graphRevision

  const nodes: Node[] = []
  const allNodes = props.graph.getAllNodes()

  for (const node of allNodes) {
    const pos = props.nodePositions.get(node.id) ?? { x: 0, y: 0 }
    const isSelected = props.selectedNodeIds?.has(node.id) ?? false
    nodes.push({
      id: node.id,
      type: getNodeViewType(node.typeId),
      position: pos,
      data: { node: markRaw(node) },
      draggable: !props.readonly,
      selectable: !props.readonly,
      class: isSelected ? 'selected' : undefined,
    })
  }
  return nodes
})

/** 将 AnoraGraph 边转换为 Vue-Flow 边 */
const vfEdges = computed<Edge[]>(() => {
  const edges: Edge[] = []

  for (const node of props.graph.getAllNodes()) {
    for (const port of node.getOutputPorts()) {
      const connectedPorts = props.graph.getConnectedPorts(port)
      for (const targetPort of connectedPorts) {
        const edgeId = `${port.id}->${targetPort.id}`

        edges.push({
          id: edgeId,
          source: node.id,
          target: props.graph.getNodeByPort(targetPort)?.id ?? '',
          sourceHandle: port.id,
          targetHandle: targetPort.id,
          type: 'default',
        })
      }
    }
  }

  return edges
})

/** 自定义节点类型 */
const nodeTypes = computed(() => NodeViewRegistry.getNodeTypes())

/** 自定义边类型 */
const edgeTypes = {
  default: markRaw(EdgeView),
}

// ==================== 边样式 ====================
const incompatibleEdgeStyle = { stroke: '#ef4444', strokeWidth: 2 }
const normalEdgeStyle = { stroke: '#64748b', strokeWidth: 2 }

/** 监听 incompatibleEdges 变化，更新边样式 */
watch(
  () => props.incompatibleEdges,
  (newIncompatible, oldIncompatible) => {
    const edges = getEdges.value

    for (const edgeId of newIncompatible) {
      if (!oldIncompatible?.has(edgeId)) {
        const edge = edges.find((e) => e.id === edgeId)
        if (edge) {
          edge.style = incompatibleEdgeStyle
          edge.animated = true
        }
      }
    }

    if (oldIncompatible) {
      for (const edgeId of oldIncompatible) {
        if (!newIncompatible.has(edgeId)) {
          const edge = edges.find((e) => e.id === edgeId)
          if (edge) {
            edge.style = normalEdgeStyle
            edge.animated = false
          }
        }
      }
    }
  },
  { deep: true },
)

// ==================== 事件处理 ====================
onConnect((connection: Connection) => {
  if (props.readonly) return
  emit('connect', connection)
})

onNodeDoubleClick(({ node }) => {
  const anoraNode = props.graph.getNode(node.id)
  const subGraphNode = anoraNode instanceof SubGraphNode ? anoraNode : null
  emit('nodeDoubleClick', node.id, subGraphNode)
})

onPaneClick(() => {
  emit('paneClick')
})

function onNodeDragStop(event: { node: Node }): void {
  if (props.readonly) return
  emit('nodeDragStop', event.node.id, { ...event.node.position })
}

function onNodesChange(changes: unknown[]): void {
  emit('nodesChange', changes)
}

function onEdgesChange(changes: unknown[]): void {
  if (props.readonly) return
  emit('edgesChange', changes)
}

// ==================== 公开方法 ====================
defineExpose({
  fitView: () => fitView({ padding: 0.2 }),
})
</script>

<template>
  <div class="anora-graph-view">
    <VueFlow
      :nodes="vfNodes"
      :edges="vfEdges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :default-edge-options="{ type: 'default' }"
      :snap-to-grid="true"
      :snap-grid="[20, 20]"
      fit-view-on-init
      @node-drag-stop="onNodeDragStop"
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
    >
      <Background :variant="BackgroundVariant.Dots" :gap="20" :size="1" pattern-color="#3a3a5c" />
      <slot />
    </VueFlow>
  </div>
</template>

<style scoped>
.anora-graph-view {
  width: 100%;
  height: 100%;
}

/* Vue-Flow 主题覆盖 */
:deep(.vue-flow) {
  background: var(--vf-bg, #0f0f1a);
}

:deep(.vue-flow__edge-path) {
  stroke: #64748b;
  stroke-width: 2;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: #60a5fa;
}

:deep(.vue-flow__connection-line) {
  stroke: #60a5fa;
  stroke-width: 2;
  stroke-dasharray: 5, 5;
}

:deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
}

:deep(.vue-flow__minimap) {
  background: var(--vf-minimap-bg, #1a1a2e);
}

:deep(.vue-flow__controls) {
  background: var(--vf-controls-bg, #1a1a2e);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 8px;
}

:deep(.vue-flow__controls-button) {
  background: var(--vf-btn-bg, #252542);
  border-color: var(--vf-border, #3a3a5c);
  color: var(--vf-text, #e2e8f0);
}

:deep(.vue-flow__controls-button:hover) {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}
</style>
