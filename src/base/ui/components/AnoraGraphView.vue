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
  /** 节点尺寸映射 */
  nodeSizes: {
    type: Object as PropType<Map<string, { width: number; height: number }>>,
    default: () => new Map(),
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
  connect: [connection: Connection]
  nodeDoubleClick: [nodeId: string, node: SubGraphNode | null]
  paneClick: []
  nodeDragStop: [nodes: Array<{ id: string; position: { x: number; y: number } }>]
  nodesChange: [changes: unknown[]]
  edgesChange: [changes: unknown[]]
  drop: [data: { event: DragEvent; position: { x: number; y: number } }]
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
    const size = props.nodeSizes.get(node.id)
    const isSelected = props.selectedNodeIds?.has(node.id) ?? false
    nodes.push({
      id: node.id,
      type: getNodeViewType(node.typeId),
      position: pos,
      data: { node: markRaw(node), readonly: props.readonly, size },
      draggable: !props.readonly,
      selectable: !props.readonly,
      ...(isSelected ? { selected: true } : {}),
    } as Node)
  }
  return nodes
})

/** 将 AnoraGraph 边转换为 Vue-Flow 边 */
const vfEdges = computed<Edge[]>(() => {
  // 依赖 graphRevision 以触发更新
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  props.graphRevision

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

function onNodeDragStop(event: { node: Node; nodes: Node[] }): void {
  if (props.readonly) return
  // 处理所有被拖动的节点（多选拖动时 nodes 包含所有选中的节点）
  const draggedNodes = event.nodes.map((n) => ({
    id: n.id,
    position: { ...n.position },
  }))
  emit('nodeDragStop', draggedNodes)
}

function onNodesChange(changes: unknown[]): void {
  emit('nodesChange', changes)
}

function onEdgesChange(changes: unknown[]): void {
  if (props.readonly) return
  emit('edgesChange', changes)
}

/** 处理画布拖放 */
function onPaneDrop(event: DragEvent): void {
  if (props.readonly) return
  event.preventDefault()

  // 获取画布坐标（Vue Flow 会自动处理坐标转换）
  const vueFlowElement = event.currentTarget as HTMLElement
  const rect = vueFlowElement.getBoundingClientRect()

  // 相对于画布的坐标
  const position = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }

  emit('drop', { event, position })
}

/** 阻止默认拖放行为 */
function onPaneDragOver(event: DragEvent): void {
  if (props.readonly) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
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
      :multi-selection-key-code="'Shift'"
      fit-view-on-init
      @node-drag-stop="onNodeDragStop"
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
      @drop="onPaneDrop"
      @dragover="onPaneDragOver"
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
