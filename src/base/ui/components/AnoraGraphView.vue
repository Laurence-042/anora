<script setup lang="ts">
/**
 * AnoraGraphView - Anora 图展示组件
 *
 * 纯展示层，从 graphStore 读取 Vue-Flow 数据进行渲染
 * - 不直接调用 useVueFlow()，只依赖 graphStore
 * - 事件通过 emit 上报给父组件处理
 *
 * 使用方：
 * - GraphEditor: 编辑模式，启用拖拽/连线
 * - ReplayView: 回放模式，只读展示
 */
import { computed, watch, markRaw } from 'vue'
import { VueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'
import { useGraphStore } from '@/stores/graph'

import EdgeView from './EdgeView.vue'

// 获取 graphStore
const graphStore = useGraphStore()

// ==================== Emits ====================
const emit = defineEmits<{
  connect: [connection: Connection]
  nodeDoubleClick: [nodeId: string, node: SubGraphNode | null]
  edgeDoubleClick: [edgeId: string]
  paneClick: []
  nodeDragStart: [nodes: Array<{ id: string; position: { x: number; y: number } }>]
  nodeDragStop: [nodes: Array<{ id: string; position: { x: number; y: number } }>]
  nodesChange: [changes: unknown[]]
  edgesChange: [changes: unknown[]]
  drop: [data: { event: DragEvent; position: { x: number; y: number } }]
  paneContextMenu: [event: MouseEvent]
  nodeContextMenu: [event: MouseEvent | TouchEvent, nodeId: string]
  edgeContextMenu: [event: MouseEvent | TouchEvent, edgeId: string]
}>()

// ==================== 从 Store 读取数据 ====================
const vfNodes = computed(() => graphStore.vfNodes)
const vfEdges = computed(() => graphStore.vfEdges)
const nodeTypes = computed(() => graphStore.vfNodeTypes)
const readonly = computed(() => graphStore.readonly)

/** 自定义边类型 */
const edgeTypes = {
  default: markRaw(EdgeView),
}

// ==================== 边样式 ====================
const incompatibleEdgeStyle = { stroke: '#ef4444', strokeWidth: 2 }
const normalEdgeStyle = { stroke: '#64748b', strokeWidth: 2 }

/** 监听 incompatibleEdges 变化，更新边样式 */
watch(
  () => graphStore.incompatibleEdges,
  () => {
    // 遍历所有边，根据 incompatibleEdges 更新样式
    for (const edge of graphStore.vfEdges) {
      const [fromPortId, toPortId] = edge.id.split('->')
      if (fromPortId && toPortId && graphStore.isEdgeIncompatible(fromPortId, toPortId)) {
        edge.style = incompatibleEdgeStyle
        edge.animated = true
      } else {
        edge.style = normalEdgeStyle
        edge.animated = false
      }
    }
  },
  { deep: true },
)

// ==================== 事件处理 ====================
function onConnect(connection: Connection): void {
  if (readonly.value) return
  emit('connect', connection)
}

function onNodeDoubleClick({ node }: { node: Node }): void {
  const anoraNode = graphStore.currentGraph.getNode(node.id)
  const subGraphNode = anoraNode instanceof SubGraphNode ? anoraNode : null
  emit('nodeDoubleClick', node.id, subGraphNode)
}

function onEdgeDoubleClick({ edge }: { edge: Edge }): void {
  if (readonly.value) return
  emit('edgeDoubleClick', edge.id)
}

function onPaneClick(): void {
  emit('paneClick')
}

// ==================== 右键菜单事件 ====================
function onNodeContextMenu({ event, node }: { event: MouseEvent | TouchEvent; node: Node }): void {
  if (readonly.value) return
  event.preventDefault()
  emit('nodeContextMenu', event, node.id)
}

function onPaneContextMenu(event: MouseEvent): void {
  if (readonly.value) return
  event.preventDefault()
  emit('paneContextMenu', event)
}

function onEdgeContextMenu({ event, edge }: { event: MouseEvent | TouchEvent; edge: Edge }): void {
  if (readonly.value) return
  event.preventDefault()
  emit('edgeContextMenu', event, edge.id)
}

function onNodeDragStart(event: { node: Node; nodes: Node[] }): void {
  if (readonly.value) return
  const draggedNodes = event.nodes.map((n) => ({
    id: n.id,
    position: { ...n.position },
  }))
  emit('nodeDragStart', draggedNodes)
}

function onNodeDragStop(event: { node: Node; nodes: Node[] }): void {
  if (readonly.value) return
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
  if (readonly.value) return
  emit('edgesChange', changes)
}

/** 处理画布拖放 */
function onPaneDrop(event: DragEvent): void {
  if (readonly.value) return
  event.preventDefault()

  // 获取画布坐标
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
  if (readonly.value) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

// ==================== 公开方法（通过 store 实现） ====================
defineExpose({
  fitView: () => graphStore.fitView({ padding: 0.2 }),
  /** 获取选中的节点 ID 列表 */
  getSelectedNodeIds: () => Array.from(graphStore.selectedNodeIds),
  /** 获取选中的边 ID 列表 */
  getSelectedEdgeIds: () => Array.from(graphStore.selectedEdges),
  /** 通过 ID 选中节点 */
  addSelectedNodes: (nodeIds: string[]) => graphStore.selectNodesByIds(nodeIds, true),
  /** 取消选中节点（清空所有选中） */
  removeSelectedNodes: () => graphStore.clearSelection(),
})
</script>

<template>
  <div class="anora-graph-view">
    <VueFlow
      :id="graphStore.vfFlowId"
      :nodes="vfNodes"
      :edges="vfEdges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :default-edge-options="{ type: 'default' }"
      :snap-to-grid="true"
      :snap-grid="[20, 20]"
      :multi-selection-key-code="'Shift'"
      fit-view-on-init
      @connect="onConnect"
      @node-double-click="onNodeDoubleClick"
      @edge-double-click="onEdgeDoubleClick"
      @pane-click="onPaneClick"
      @node-context-menu="onNodeContextMenu"
      @pane-context-menu="onPaneContextMenu"
      @edge-context-menu="onEdgeContextMenu"
      @node-drag-start="onNodeDragStart"
      @node-drag-stop="onNodeDragStop"
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
      @drop="onPaneDrop"
      @dragover="onPaneDragOver"
    >
      <Background variant="dots" :gap="20" :size="1" pattern-color="#3a3a5c" />
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
