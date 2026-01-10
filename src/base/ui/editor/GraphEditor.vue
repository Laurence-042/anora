<script setup lang="ts">
/**
 * GraphEditor - 图编辑器主组件
 *
 * 组合 AnoraGraphView + 编辑功能 + 工具栏
 * - 节点拖拽、连线、删除
 * - 执行控制
 * - 录制功能
 * - 图导入/导出
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Connection } from '@vue-flow/core'

import { useGraphStore } from '@/stores/graph'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'
import { ExecutorState } from '@/base/runtime/executor'

import AnoraGraphView from '../components/AnoraGraphView.vue'
import ExecutorControls from './ExecutorControls.vue'
import Breadcrumb from './Breadcrumb.vue'
import NodePalette from './NodePalette.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'
import RecordingControls from './RecordingControls.vue'
import GraphIOControls from './GraphIOControls.vue'

const { t } = useI18n()
const graphStore = useGraphStore()

// ==================== 状态 ====================

/** AnoraGraphView 组件引用 */
const graphViewRef = ref<InstanceType<typeof AnoraGraphView>>()

// ==================== 事件处理 ====================

/** 处理连接 */
function onConnect(connection: Connection): void {
  if (connection.sourceHandle && connection.targetHandle) {
    const success = graphStore.addEdge(connection.sourceHandle, connection.targetHandle)
    if (!success) {
      console.warn('Failed to create edge: incompatible types')
    }
  }
}

/** 处理节点双击（进入子图） */
function onNodeDoubleClick(_nodeId: string, subGraphNode: SubGraphNode | null): void {
  if (subGraphNode) {
    graphStore.enterSubGraph(subGraphNode)
  }
}

/** 处理画布点击 */
function onPaneClick(): void {
  graphStore.clearSelection()
}

/** 处理节点拖拽结束 */
function onNodeDragStop(nodeId: string, position: { x: number; y: number }): void {
  graphStore.updateNodePosition(nodeId, position)
}

/** 处理节点变更 */
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
    if (c.type === 'remove' && c.id !== undefined) {
      graphStore.removeNode(c.id)
      graphStore.nodePositions.delete(c.id)
    }
  }
}

/** 处理边变更 */
function onEdgesChange(changes: unknown[]): void {
  for (const change of changes) {
    const c = change as { id?: string; type?: string }
    if (c.type === 'remove' && c.id !== undefined) {
      const [fromPortId, toPortId] = c.id.split('->')
      if (fromPortId && toPortId) {
        graphStore.removeEdge(fromPortId, toPortId)
      }
    }
  }
}

// ==================== 工具栏操作 ====================

/** 自动布局 */
function autoLayout(): void {
  const nodes = graphStore.nodes
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const nodeWidth = 220
  const nodeHeight = 150
  const padding = 40

  nodes.forEach((node, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    graphStore.updateNodePosition(node.id, {
      x: col * (nodeWidth + padding) + padding,
      y: row * (nodeHeight + padding) + padding,
    })
  })

  setTimeout(() => graphViewRef.value?.fitView(), 100)
}

/** 删除选中的节点 */
function deleteSelected(): void {
  for (const nodeId of graphStore.selectedNodeIds) {
    graphStore.removeNode(nodeId)
    graphStore.nodePositions.delete(nodeId)
  }
}

// ==================== 键盘快捷键 ====================

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Delete') {
    deleteSelected()
  }

  if (event.key === 'F5' && !event.shiftKey) {
    event.preventDefault()
    if (graphStore.stateMachineState === ExecutorState.Idle) {
      graphStore.startExecution()
    }
  }

  if (event.key === 'F5' && event.shiftKey) {
    event.preventDefault()
    graphStore.stopExecution()
  }

  if (event.key === 'Backspace' && graphStore.subGraphStack.length > 0) {
    if (document.activeElement?.tagName !== 'INPUT') {
      event.preventDefault()
      graphStore.exitSubGraph()
    }
  }

  if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    for (const node of graphStore.nodes) {
      graphStore.selectNode(node.id, true)
    }
  }
}

// ==================== 生命周期 ====================

/** 监听图变化，为新节点设置默认位置 */
watch(
  () => graphStore.nodes,
  (nodes) => {
    for (const node of nodes) {
      if (!graphStore.nodePositions.has(node.id)) {
        const existingCount = graphStore.nodePositions.size
        graphStore.updateNodePosition(node.id, {
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

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="graph-editor">
    <!-- 顶部工具栏 -->
    <div class="editor-toolbar">
      <Breadcrumb />
      <div class="toolbar-spacer" />

      <!-- 图导出/导入 -->
      <GraphIOControls />

      <div class="toolbar-divider" />

      <!-- 录制控制 -->
      <RecordingControls />

      <div class="toolbar-divider" />

      <ExecutorControls />
      <button class="toolbar-btn" @click="autoLayout" :title="t('editor.autoLayout')">
        ⊞ {{ t('editor.layout') }}
      </button>
      <LocaleSwitcher />
    </div>

    <!-- 图展示区域 -->
    <div class="editor-canvas">
      <AnoraGraphView
        ref="graphViewRef"
        :graph="graphStore.currentGraph"
        :node-positions="graphStore.nodePositions"
        :graph-revision="graphStore.graphRevision"
        :readonly="false"
        :executing-node-ids="graphStore.executingNodeIds"
        :incompatible-edges="graphStore.incompatibleEdges"
        :edge-data-transfers="graphStore.edgeDataTransfers"
        :selected-node-ids="graphStore.selectedNodeIds"
        @connect="onConnect"
        @node-double-click="onNodeDoubleClick"
        @pane-click="onPaneClick"
        @node-drag-stop="onNodeDragStop"
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
      >
        <!-- 节点面板 -->
        <NodePalette />
      </AnoraGraphView>
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
</style>
