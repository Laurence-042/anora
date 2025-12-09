<script setup lang="ts">
/**
 * GraphEditor - 图编辑器主组件
 * 整合 Vue-Flow、节点、边、控制面板等
 */
import { ref, computed, watch, onMounted, markRaw } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { useGraphStore } from '@/stores/graph'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'

import BaseNodeView from '../components/BaseNodeView.vue'
import ExecutorControls from './ExecutorControls.vue'
import Breadcrumb from './Breadcrumb.vue'
import NodePalette from './NodePalette.vue'

// 自定义节点视图
import { ParameterNodeView, ArithmeticNodeView } from '@/mods/core/ui'

const graphStore = useGraphStore()

// Vue-Flow 实例
const { onConnect, onNodeDoubleClick, onPaneClick, fitView } = useVueFlow()

/** 节点位置存储（独立于 AnoraNode） */
const nodePositions = ref<Map<string, { x: number; y: number }>>(new Map())

/** 根据节点 typeId 获取对应的视图组件 */
function getNodeViewType(typeId: string): string {
  // 特定节点使用自定义视图
  const customViews: Record<string, string> = {
    'core.ParameterNode': 'parameter-node',
    'core.ArithmeticNode': 'arithmetic-node',
  }
  return customViews[typeId] ?? 'anora-node'
}

/** 将 AnoraGraph 转换为 Vue-Flow 节点 */
const vfNodes = computed<Node[]>(() => {
  const nodes: Node[] = []
  for (const node of graphStore.nodes) {
    const pos = nodePositions.value.get(node.id) ?? { x: 0, y: 0 }
    nodes.push({
      id: node.id,
      type: getNodeViewType(node.typeId),
      position: pos,
      data: { node: markRaw(node) },
    })
  }
  return nodes
})

/** 将 AnoraGraph 边转换为 Vue-Flow 边 */
const vfEdges = computed<Edge[]>(() => {
  const edges: Edge[] = []
  const graph = graphStore.currentGraph

  for (const node of graphStore.nodes) {
    // 遍历所有出 Port（使用 getOutputPorts）
    for (const port of node.getOutputPorts()) {
      const connectedPorts = graph.getConnectedPorts(port)
      for (const targetPort of connectedPorts) {
        edges.push({
          id: `${port.id}->${targetPort.id}`,
          source: node.id,
          target: graph.getNodeByPort(targetPort)?.id ?? '',
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
const nodeTypes = {
  'anora-node': markRaw(BaseNodeView),
  'parameter-node': markRaw(ParameterNodeView),
  'arithmetic-node': markRaw(ArithmeticNodeView),
}

/** 处理连接 */
onConnect((connection: Connection) => {
  if (connection.sourceHandle && connection.targetHandle) {
    const success = graphStore.addEdge(connection.sourceHandle, connection.targetHandle)
    if (!success) {
      console.warn('Failed to create edge: incompatible types')
    }
  }
})

/** 处理节点双击（进入子图） */
onNodeDoubleClick(({ node }) => {
  const anoraNode = graphStore.currentGraph.getNode(node.id)
  if (anoraNode instanceof SubGraphNode) {
    graphStore.enterSubGraph(anoraNode)
  }
})

/** 处理画布点击（清空选择） */
onPaneClick(() => {
  graphStore.clearSelection()
})

/** 处理节点位置变化 */
function onNodeDragStop(event: { node: Node }): void {
  nodePositions.value.set(event.node.id, { ...event.node.position })
}

/** 处理节点选择 */
function onNodesChange(changes: unknown[]): void {
  for (const change of changes) {
    const c = change as { id?: string; type?: string; selected?: boolean }
    if (c.type === 'select' && c.id !== undefined) {
      if (c.selected) {
        graphStore.selectNode(c.id)
      } else {
        graphStore.deselectNode(c.id)
      }
    }
  }
}

/** 自动布局（简单的网格布局，后续可接入 ELK） */
function autoLayout(): void {
  const nodes = graphStore.nodes
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const nodeWidth = 220
  const nodeHeight = 150
  const padding = 40

  nodes.forEach((node, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    nodePositions.value.set(node.id, {
      x: col * (nodeWidth + padding) + padding,
      y: row * (nodeHeight + padding) + padding,
    })
  })

  // 触发视图更新
  setTimeout(() => fitView({ padding: 0.2 }), 100)
}

/** 删除选中的节点 */
function deleteSelected(): void {
  for (const nodeId of graphStore.selectedNodeIds) {
    graphStore.removeNode(nodeId)
    nodePositions.value.delete(nodeId)
  }
}

/** 键盘快捷键 */
function handleKeydown(event: KeyboardEvent): void {
  // Delete: 删除选中节点
  if (event.key === 'Delete') {
    deleteSelected()
  }

  // F5: 开始执行
  if (event.key === 'F5' && !event.shiftKey) {
    event.preventDefault()
    if (!graphStore.isRunning) {
      graphStore.startExecution()
    }
  }

  // Shift+F5: 停止执行
  if (event.key === 'F5' && event.shiftKey) {
    event.preventDefault()
    graphStore.stopExecution()
  }

  // Backspace: 返回上一级子图
  if (event.key === 'Backspace' && graphStore.subGraphStack.length > 0) {
    // 仅当没有输入框聚焦时
    if (document.activeElement?.tagName !== 'INPUT') {
      event.preventDefault()
      graphStore.exitSubGraph()
    }
  }

  // Ctrl+A: 全选
  if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    for (const node of graphStore.nodes) {
      graphStore.selectNode(node.id, true)
    }
  }
}

/** 监听图变化，更新节点位置 */
watch(
  () => graphStore.nodes,
  (nodes) => {
    // 为新节点设置默认位置
    for (const node of nodes) {
      if (!nodePositions.value.has(node.id)) {
        // 简单的默认位置：稍微偏移
        const existingCount = nodePositions.value.size
        nodePositions.value.set(node.id, {
          x: 100 + (existingCount % 5) * 250,
          y: 100 + Math.floor(existingCount / 5) * 180,
        })
      }
    }
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="graph-editor">
    <!-- 顶部工具栏 -->
    <div class="editor-toolbar">
      <Breadcrumb />
      <div class="toolbar-spacer" />
      <ExecutorControls />
      <button class="toolbar-btn" @click="autoLayout" title="自动布局">⊞ 布局</button>
    </div>

    <!-- Vue-Flow 画布 -->
    <div class="editor-canvas">
      <VueFlow
        :nodes="vfNodes"
        :edges="vfEdges"
        :node-types="nodeTypes"
        :default-edge-options="{ type: 'default' }"
        :snap-to-grid="true"
        :snap-grid="[20, 20]"
        fit-view-on-init
        @node-drag-stop="onNodeDragStop"
        @nodes-change="onNodesChange"
      >
        <!-- 背景 -->
        <template #default>
          <div class="canvas-background" />
        </template>
      </VueFlow>

      <!-- 节点面板 -->
      <NodePalette />
    </div>

    <!-- 底部状态栏 -->
    <div class="editor-statusbar">
      <span>节点: {{ graphStore.nodes.length }}</span>
      <span>选中: {{ graphStore.selectedNodeIds.size }}</span>
      <span>层级: {{ graphStore.subGraphStack.length + 1 }}</span>
    </div>
  </div>
</template>

<style scoped>
.graph-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--vf-bg, #0f0f1a);
  color: var(--vf-text, #e2e8f0);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--vf-toolbar-bg, #1a1a2e);
  border-bottom: 1px solid var(--vf-border, #3a3a5c);
  z-index: 10;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-btn {
  padding: 6px 12px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}

.editor-canvas {
  flex: 1;
  position: relative;
}

.canvas-background {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, #2a2a4a 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
}

.editor-statusbar {
  display: flex;
  gap: 24px;
  padding: 4px 16px;
  background: var(--vf-statusbar-bg, #1a1a2e);
  border-top: 1px solid var(--vf-border, #3a3a5c);
  font-size: 11px;
  color: var(--vf-text-muted, #6b7280);
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
