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
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Connection } from '@vue-flow/core'

import { useGraphStore } from '@/stores/graph'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'
import { BaseNode } from '@/base/runtime/nodes'
import { NodeRegistry } from '@/base/runtime/registry'
import { ExecutorState } from '@/base/runtime/executor'
import { autoLayoutGraph } from '@/base/ui/utils/layout'

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

// ==================== 节点操作 ====================

/**
 * 统一的节点创建和添加方法
 * @param typeId 节点类型 ID
 * @param position 可选的位置参数（屏幕坐标），如果不提供则自动计算
 */
function createAndAddNode(typeId: string, position?: { x: number; y: number }): void {
  const NodeClass = NodeRegistry.get(typeId)
  if (!NodeClass) {
    console.error(`Unknown node type: ${typeId}`)
    return
  }

  // 创建节点实例
  const node = new NodeClass() as BaseNode
  graphStore.addNode(node)

  // 设置位置
  if (position) {
    // 使用提供的位置（已经是画布坐标）
    graphStore.updateNodePosition(node.id, position)
  } else {
    // 自动计算位置（堆叠式布局）
    const existingCount = graphStore.nodePositions.size
    graphStore.updateNodePosition(node.id, {
      x: 100 + (existingCount % 5) * 250,
      y: 100 + Math.floor(existingCount / 5) * 180,
    })
  }
}

/**
 * 处理拖放添加节点
 */
function onDrop(event: { event: DragEvent; position: { x: number; y: number } }): void {
  const typeId = event.event.dataTransfer?.getData('application/anora-node')
  if (typeId) {
    createAndAddNode(typeId, event.position)
  }
}

/**
 * 处理从面板点击添加节点
 */
function onNodePaletteAdd(typeId: string): void {
  createAndAddNode(typeId)
}

// ==================== 工具栏操作 ====================

/** 自动布局 */
async function autoLayout(): Promise<void> {
  try {
    const newPositions = await autoLayoutGraph(graphStore.currentGraph, graphStore.nodePositions, {
      direction: 'RIGHT', // 从左到右布局
      spacing: 100, // 增大间距以确保边可见
      alignPorts: true,
    })

    // 批量更新节点位置
    for (const [nodeId, position] of newPositions) {
      graphStore.updateNodePosition(nodeId, position)
    }

    // 等待 Vue 更新 DOM 后调整视图
    await nextTick()
    graphViewRef.value?.fitView()
  } catch (error) {
    console.error('[GraphEditor] Auto layout failed:', error)
  }
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
        @drop="onDrop"
      >
        <!-- 节点面板 -->
        <NodePalette @add-node="onNodePaletteAdd" />
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
