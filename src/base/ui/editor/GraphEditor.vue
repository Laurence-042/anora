<script setup lang="ts">
/**
 * GraphEditor - 图编辑器主组件
 * 整合 Vue-Flow、节点、边、控制面板等
 * 支持录制操作序列供演示模式使用
 */
import { ref, computed, watch, onMounted, onUnmounted, markRaw } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { useI18n } from 'vue-i18n'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { useGraphStore } from '@/stores/graph'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'

import BaseNodeView from '../components/BaseNodeView.vue'
import ExecutorControls from './ExecutorControls.vue'
import Breadcrumb from './Breadcrumb.vue'
import NodePalette from './NodePalette.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'
import RecordingControls from './RecordingControls.vue'

// Demo 录制
import { DemoRecorder } from '@/base/runtime/demo'

// 节点视图注册表
import { NodeViewRegistry } from '../registry'

// 初始化时设置默认视图
NodeViewRegistry.setDefaultView(BaseNodeView)

const { t } = useI18n()
const graphStore = useGraphStore()

// Vue-Flow 实例
const { onConnect, onNodeDoubleClick, onPaneClick, fitView, getEdges } = useVueFlow()

/** 节点位置存储（独立于 AnoraNode） */
const nodePositions = ref<Map<string, { x: number; y: number }>>(new Map())

// ========== 录制功能 ==========
const recorder = new DemoRecorder()
const isRecording = ref(false)
const operationCount = ref(0)

function startRecording(): void {
  recorder.clear()
  isRecording.value = true
  operationCount.value = 0
  // 连接执行器录制
  graphStore.executor.setDemoRecorder(recorder)
}

function stopRecording(): void {
  isRecording.value = false
  graphStore.executor.setDemoRecorder(undefined)
}

function downloadRecording(): void {
  const data = recorder.exportRecording()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `anora-demo-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function uploadRecording(file: File): void {
  // 上传后跳转到演示页面
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    try {
      const data = JSON.parse(content)
      // 存储到 sessionStorage，演示页面读取
      sessionStorage.setItem('anora-demo-data', JSON.stringify(data))
      // 跳转到演示页面
      window.location.href = '/demo'
    } catch (err) {
      console.error('Failed to parse demo file:', err)
      alert(t('errors.invalidOperation'))
    }
  }
  reader.readAsText(file)
}

/** 录制：节点添加 */
function recordNodeAdded(nodeId: string, typeId: string, position: { x: number; y: number }): void {
  if (isRecording.value) {
    const node = graphStore.currentGraph.getNode(nodeId)
    recorder.recordNodeAdded(nodeId, typeId, position, node?.context)
    operationCount.value = recorder.getOperationCount()
  }
}

/** 录制：节点移除 */
function recordNodeRemoved(nodeId: string): void {
  if (isRecording.value) {
    recorder.recordNodeRemoved(nodeId)
    operationCount.value = recorder.getOperationCount()
  }
}

/** 录制：边添加 */
function recordEdgeAdded(
  fromNodeId: string,
  fromPortName: string,
  toNodeId: string,
  toPortName: string,
): void {
  if (isRecording.value) {
    recorder.recordEdgeAdded(fromNodeId, fromPortName, toNodeId, toPortName)
    operationCount.value = recorder.getOperationCount()
  }
}

/** 录制：节点移动 */
function recordNodeMoved(nodeId: string, position: { x: number; y: number }): void {
  if (isRecording.value) {
    recorder.recordNodeMoved(nodeId, position)
    operationCount.value = recorder.getOperationCount()
  }
}

/** 根据节点 typeId 获取对应的视图组件类型 */
function getNodeViewType(typeId: string): string {
  return NodeViewRegistry.getViewType(typeId)
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
        const edgeId = `${port.id}->${targetPort.id}`

        edges.push({
          id: edgeId,
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

/** 不兼容边的默认样式 */
const incompatibleEdgeStyle = {
  stroke: '#ef4444',
  strokeWidth: 2,
}

/** 正常边的默认样式 */
const normalEdgeStyle = {
  stroke: '#64748b',
  strokeWidth: 2,
}

/**
 * 监听 incompatibleEdges 变化，增量更新受影响边的样式
 * 直接修改边对象的响应式属性
 */
watch(
  () => graphStore.incompatibleEdges,
  (newIncompatible, oldIncompatible) => {
    const edges = getEdges.value

    // 找出新增的不兼容边，设为红色
    for (const edgeId of newIncompatible) {
      if (!oldIncompatible?.has(edgeId)) {
        const edge = edges.find((e) => e.id === edgeId)
        if (edge) {
          edge.style = incompatibleEdgeStyle
          edge.animated = true
        }
      }
    }

    // 找出恢复兼容的边，恢复正常样式
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

/** 自定义节点类型（从注册表获取） */
const nodeTypes = computed(() => NodeViewRegistry.getNodeTypes())

/** 处理连接 */
onConnect((connection: Connection) => {
  if (connection.sourceHandle && connection.targetHandle) {
    const success = graphStore.addEdge(connection.sourceHandle, connection.targetHandle)
    if (success) {
      // 录制边添加
      const sourceNode = graphStore.nodes.find((n) =>
        Array.from(n.outPorts.values()).some((p) => p.id === connection.sourceHandle),
      )
      const targetNode = graphStore.nodes.find((n) =>
        Array.from(n.inPorts.values()).some((p) => p.id === connection.targetHandle),
      )
      if (sourceNode && targetNode) {
        const sourcePortName = Array.from(sourceNode.outPorts.entries()).find(
          ([, p]) => p.id === connection.sourceHandle,
        )?.[0]
        const targetPortName = Array.from(targetNode.inPorts.entries()).find(
          ([, p]) => p.id === connection.targetHandle,
        )?.[0]
        if (sourcePortName && targetPortName) {
          recordEdgeAdded(sourceNode.id, sourcePortName, targetNode.id, targetPortName)
        }
      }
    } else {
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
  const newPos = { ...event.node.position }
  nodePositions.value.set(event.node.id, newPos)
  recordNodeMoved(event.node.id, newPos)
}

/** 处理节点变更（选择、删除等） */
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
    // 处理节点删除
    if (c.type === 'remove' && c.id !== undefined) {
      recordNodeRemoved(c.id)
      graphStore.removeNode(c.id)
      nodePositions.value.delete(c.id)
    }
  }
}

/** 处理边变更（删除等） */
function onEdgesChange(changes: unknown[]): void {
  for (const change of changes) {
    const c = change as { id?: string; type?: string }
    // 处理边删除
    if (c.type === 'remove' && c.id !== undefined) {
      // 边 ID 格式: "fromPortId->toPortId"
      const [fromPortId, toPortId] = c.id.split('->')
      if (fromPortId && toPortId) {
        graphStore.removeEdge(fromPortId, toPortId)
        // TODO: 录制边删除操作
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
    recordNodeRemoved(nodeId)
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
        const pos = {
          x: 100 + (existingCount % 5) * 250,
          y: 100 + Math.floor(existingCount / 5) * 180,
        }
        nodePositions.value.set(node.id, pos)
        // 录制节点添加
        recordNodeAdded(node.id, node.typeId, pos)
      }
    }
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  // 清理录制状态
  if (isRecording.value) {
    stopRecording()
  }
})
</script>

<template>
  <div class="graph-editor">
    <!-- 顶部工具栏 -->
    <div class="editor-toolbar">
      <Breadcrumb />
      <div class="toolbar-spacer" />

      <!-- 录制控制 -->
      <RecordingControls
        :is-recording="isRecording"
        :operation-count="operationCount"
        @start-recording="startRecording"
        @stop-recording="stopRecording"
        @download="downloadRecording"
        @upload="uploadRecording"
      />

      <div class="toolbar-divider" />

      <ExecutorControls />
      <button class="toolbar-btn" @click="autoLayout" :title="t('editor.autoLayout')">
        ⊞ {{ t('editor.layout') }}
      </button>
      <LocaleSwitcher />
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
        @edges-change="onEdgesChange"
      >
        <!-- 网格背景（跟随画布移动） -->
        <Background :variant="BackgroundVariant.Dots" :gap="20" :size="1" pattern-color="#3a3a5c" />
      </VueFlow>

      <!-- 节点面板 -->
      <NodePalette />
    </div>

    <!-- 底部状态栏 -->
    <div class="editor-statusbar">
      <span>{{ t('editor.nodes') }}: {{ graphStore.nodes.length }}</span>
      <span>{{ t('editor.selected') }}: {{ graphStore.selectedNodeIds.size }}</span>
      <span>{{ t('editor.level') }}: {{ graphStore.subGraphStack.length + 1 }}</span>
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

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--vf-border, #3a3a5c);
  margin: 0 8px;
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
