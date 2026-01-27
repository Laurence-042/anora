<script setup lang="ts">
/**
 * GraphEditor - 图编辑器主组件
 *
 * 组合 AnoraGraphView + 编辑功能 + 工具栏
 * - 节点拖拽、连线、删除
 * - 执行控制
 * - 录制功能
 * - 图导入/导出
 * - 右键菜单
 * - 撤销/重做
 * - 复制/粘贴
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Connection } from '@vue-flow/core'

import { useGraphStore } from '@/stores/graph'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'
import { BaseNode } from '@/base/runtime/nodes'
import { NodeRegistry } from '@/base/runtime/registry'
import { BasicExecutor, ExecutorState } from '@/base/runtime/executor'
import { autoLayoutGraph } from '@/base/ui/utils/layout'

// Context Menu, Edit History, Clipboard
import { useContextMenu } from '../contextmenu'
import {
  EditHistory,
  removeNodesWithHistory,
  removeEdgesWithHistory,
  recordNodeMoves,
} from '../history'
import { Clipboard } from '../clipboard'

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

/** 执行器实例（EditorView 维护） */
const executor = ref(new BasicExecutor())

/** 编辑历史 */
const editHistory = new EditHistory({ maxSize: 50 })

/** 剪贴板 */
const clipboard = new Clipboard()

/** 拖拽开始前的节点位置（用于记录移动命令） */
const dragStartPositions = ref<Map<string, { x: number; y: number }>>(new Map())

/** 可撤销状态 */
const canUndo = ref(false)
const canRedo = ref(false)

// 监听编辑历史变化
editHistory.on(() => {
  canUndo.value = editHistory.canUndo()
  canRedo.value = editHistory.canRedo()
})

// ==================== 右键菜单 ====================

/** 屏幕坐标转画布坐标 */
function screenToCanvas(x: number, y: number): { x: number; y: number } {
  return graphStore.screenToFlowCoordinate({ x, y })
}

const { onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu } = useContextMenu({
  graphStore,
  editHistory,
  clipboard,
  screenToCanvas,
})

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

/** 处理画布点击（Vue Flow 自动处理选中清除） */
function onPaneClick(): void {
  // Vue Flow 在点击空白处时会自动取消所有选中
  // 此回调保留以便将来扩展其他逻辑
}

/** 处理节点拖拽开始（记录起始位置） */
function onNodeDragStart(nodes: Array<{ id: string; position: { x: number; y: number } }>): void {
  dragStartPositions.value.clear()
  for (const node of nodes) {
    dragStartPositions.value.set(node.id, { ...node.position })
  }
}

/** 处理节点拖拽结束（支持多选拖动，记录撤销命令） */
function onNodeDragStop(nodes: Array<{ id: string; position: { x: number; y: number } }>): void {
  const changes: Array<{
    nodeId: string
    oldPosition: { x: number; y: number }
    newPosition: { x: number; y: number }
  }> = []

  for (const node of nodes) {
    const oldPosition = dragStartPositions.value.get(node.id)
    if (oldPosition && (oldPosition.x !== node.position.x || oldPosition.y !== node.position.y)) {
      changes.push({
        nodeId: node.id,
        oldPosition,
        newPosition: { ...node.position },
      })
    }
    graphStore.updateNodePosition(node.id, node.position)
  }

  // 如果有位置变化，记录撤销命令
  if (changes.length > 0) {
    recordNodeMoves(changes, editHistory)
  }

  dragStartPositions.value.clear()
}

/** 处理节点变更 */
function onNodesChange(changes: unknown[]): void {
  for (const change of changes) {
    const c = change as { id?: string; type?: string; selected?: boolean }
    // Vue Flow 自己管理选中状态，不再同步到 graphStore
    if (c.type === 'remove' && c.id !== undefined) {
      graphStore.removeNode(c.id)
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
    const newPositions = await autoLayoutGraph(
      graphStore.currentGraph,
      graphStore.nodePositions,
      graphStore.nodeSizes,
      {
        direction: 'RIGHT', // 从左到右布局
        spacing: 100, // 增大间距以确保边可见
        alignPorts: true,
      },
    )

    // 批量更新节点位置
    for (const [nodeId, position] of newPositions) {
      graphStore.updateNodePosition(nodeId, position)
    }

    // 等待 Vue 更新 DOM 后调整视图
    await nextTick()
    graphStore.fitView()
  } catch (error) {
    console.error('[GraphEditor] Auto layout failed:', error)
  }
}

/** 删除选中的节点（带撤销支持） */
function deleteSelected(): void {
  const nodeIds = [...graphStore.selectedNodeIds]
  removeNodesWithHistory(graphStore, nodeIds, editHistory)
}

/** 删除选中的边（带撤销支持） */
function deleteSelectedEdges(): void {
  const edges: Array<{ fromPortId: string; toPortId: string }> = []

  for (const edgeId of graphStore.selectedEdges) {
    const [fromPortId, toPortId] = edgeId.split('->')
    if (fromPortId && toPortId) {
      edges.push({ fromPortId, toPortId })
    }
  }

  removeEdgesWithHistory(graphStore, edges, editHistory)
}

/** 处理复制 */
function handleCopy(): void {
  clipboard.copy(graphStore)
}

/** 处理粘贴 */
function handlePaste(position?: { x: number; y: number }): void {
  // 默认粘贴位置：视口中心
  const pastePosition = position ?? { x: 200, y: 200 }
  clipboard.paste(graphStore, pastePosition, editHistory)
}

/** 处理撤销 */
function handleUndo(): void {
  editHistory.undo()
}

/** 处理重做 */
function handleRedo(): void {
  editHistory.redo()
}

// ==================== 键盘快捷键 ====================

function handleKeydown(event: KeyboardEvent): void {
  // 如果焦点在输入框中，不处理快捷键
  const activeTag = document.activeElement?.tagName
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
    return
  }

  // Delete / Backspace - 删除选中
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const hasSelectedNodes = graphStore.selectedNodeIds.size > 0
    const hasSelectedEdges = graphStore.selectedEdges.size > 0
    if (hasSelectedNodes) {
      event.preventDefault()
      deleteSelected()
    } else if (hasSelectedEdges) {
      event.preventDefault()
      deleteSelectedEdges()
    } else if (event.key === 'Backspace' && graphStore.subGraphStack.length > 0) {
      event.preventDefault()
      graphStore.exitSubGraph()
    }
    return
  }

  // Ctrl+C - 复制
  if (event.key === 'c' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    handleCopy()
    return
  }

  // Ctrl+V - 粘贴
  if (event.key === 'v' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    handlePaste()
    return
  }

  // Ctrl+Z - 撤销
  if (event.key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    event.preventDefault()
    handleUndo()
    return
  }

  // Ctrl+Y / Ctrl+Shift+Z - 重做
  if (
    (event.key === 'y' && (event.ctrlKey || event.metaKey)) ||
    (event.key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey)
  ) {
    event.preventDefault()
    handleRedo()
    return
  }

  // F5 - 执行
  if (event.key === 'F5' && !event.shiftKey) {
    event.preventDefault()
    if (graphStore.stateMachineState === ExecutorState.Idle) {
      graphStore.startExecution(executor.value)
    }
    return
  }

  // Shift+F5 - 停止执行
  if (event.key === 'F5' && event.shiftKey) {
    event.preventDefault()
    executor.value.cancel()
    graphStore.syncExecutorState(executor.value)
    return
  }

  // Ctrl+A - 全选
  if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    const allNodeIds = graphStore.nodes.map((n) => n.id)
    graphStore.selectNodesByIds(allNodeIds)
    return
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // 绑定 EditHistory 上下文
  editHistory.bindContext(graphStore.currentGraph, graphStore)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// ==================== 公开实例 ====================
defineExpose({
  editHistory,
  clipboard,
  executor,
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
      <RecordingControls :executor="executor" :event-timelines="[editHistory.getTimeline()]" />

      <div class="toolbar-divider" />

      <ExecutorControls :executor="executor" />
      <button class="toolbar-btn" @click="autoLayout" :title="t('editor.autoLayout')">
        ⊞ {{ t('editor.layout') }}
      </button>
      <LocaleSwitcher />
    </div>

    <!-- 图展示区域 -->
    <div class="editor-canvas">
      <AnoraGraphView
        @connect="onConnect"
        @node-double-click="onNodeDoubleClick"
        @pane-click="onPaneClick"
        @node-drag-start="onNodeDragStart"
        @node-drag-stop="onNodeDragStop"
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
        @drop="onDrop"
        @pane-context-menu="onPaneContextMenu"
        @node-context-menu="onNodeContextMenu"
        @edge-context-menu="onEdgeContextMenu"
      >
        <!-- 节点面板 -->
        <NodePalette @add-node="onNodePaletteAdd" />
      </AnoraGraphView>
    </div>

    <!-- 底部状态栏 -->
    <div class="editor-statusbar">
      <span>{{ t('editor.nodes') }}: {{ graphStore.nodes.length }}</span>
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
