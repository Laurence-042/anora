<script setup lang="ts">
/**
 * DemoView - 演示模式页面
 * 提供图的录制和回放功能，同时支持 Godot-wry IPC 外部控制
 */
import { ref, computed, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type Connection } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { useI18n } from 'vue-i18n'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { useGraphStore } from '@/stores/graph'
import { SubGraphNode } from '@/base/runtime/nodes/SubGraphNode'
import { BaseNode } from '@/base/runtime/nodes'
import { useDemo, setupDemoIPC } from '@/base/ui/composables'
import type { AnyDemoOperation } from '@/base/runtime/demo'
import { DemoOperationType } from '@/base/runtime/demo'

import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import DemoControls from '@/base/ui/editor/DemoControls.vue'
import Breadcrumb from '@/base/ui/editor/Breadcrumb.vue'
import NodePalette from '@/base/ui/editor/NodePalette.vue'

import { NodeViewRegistry } from '@/base/ui/registry'
import { NodeRegistry } from '@/base/runtime/registry'

// 设置默认视图
NodeViewRegistry.setDefaultView(BaseNodeView)

const { t } = useI18n()
const graphStore = useGraphStore()

// Vue-Flow 实例
const { onConnect, onNodeDoubleClick, onPaneClick } = useVueFlow()

/** 节点位置存储 */
const nodePositions = ref<Map<string, { x: number; y: number }>>(new Map())

/** 高亮的节点 ID 列表 */
const highlightedNodeIds = ref<Set<string>>(new Set())

// ========== Demo 模式集成 ==========

const demo = useDemo({
  onApplyOperation: applyDemoOperation,
  autoPlayDelay: 1200,
})

/** 应用演示操作到图 */
async function applyDemoOperation(operation: AnyDemoOperation): Promise<void> {
  // 清除之前的高亮
  highlightedNodeIds.value.clear()

  switch (operation.type) {
    case DemoOperationType.ITERATION:
      // 恢复节点输出端口状态
      for (const nodeState of operation.nodeStates) {
        const node = graphStore.currentGraph.getNode(nodeState.nodeId)
        if (node) {
          for (const [portName, value] of Object.entries(nodeState.outPorts)) {
            const port = node.outPorts.get(portName)
            if (port && value !== null && value !== undefined) {
              try {
                // 直接设置端口值
                port.write(value as string | number | boolean | object | null)
              } catch (e) {
                console.warn(`Failed to restore port ${portName}:`, e)
              }
            }
          }
        }
      }
      // 高亮被激活的节点
      for (const nodeId of operation.activatedNodeIds) {
        highlightedNodeIds.value.add(nodeId)
      }
      break

    case DemoOperationType.NODE_ADDED: {
      // 使用 NodeRegistry.createNode 来创建节点
      const node = NodeRegistry.createNode(operation.nodeType, operation.nodeId)
      if (node) {
        // INode 可能没有 context 类型定义，但实际的 BaseNode 有
        const baseNode = node as BaseNode
        if (operation.context && baseNode.context) {
          Object.assign(baseNode.context, operation.context)
        }
        graphStore.addNode(baseNode)
        nodePositions.value.set(operation.nodeId, { ...operation.position })
        highlightedNodeIds.value.add(operation.nodeId)
      }
      break
    }

    case DemoOperationType.NODE_REMOVED:
      graphStore.removeNode(operation.nodeId)
      nodePositions.value.delete(operation.nodeId)
      break

    case DemoOperationType.EDGE_ADDED: {
      const fromNode = graphStore.currentGraph.getNode(operation.fromNodeId)
      const toNode = graphStore.currentGraph.getNode(operation.toNodeId)
      if (fromNode && toNode) {
        const fromPort = fromNode.outPorts.get(operation.fromPortName)
        const toPort = toNode.inPorts.get(operation.toPortName)
        if (fromPort && toPort) {
          graphStore.currentGraph.addEdge(fromPort.id, toPort.id)
        }
      }
      break
    }

    case DemoOperationType.EDGE_REMOVED: {
      const fromNode = graphStore.currentGraph.getNode(operation.fromNodeId)
      const toNode = graphStore.currentGraph.getNode(operation.toNodeId)
      if (fromNode && toNode) {
        const fromPort = fromNode.outPorts.get(operation.fromPortName)
        const toPort = toNode.inPorts.get(operation.toPortName)
        if (fromPort && toPort) {
          graphStore.currentGraph.removeEdge(fromPort.id, toPort.id)
        }
      }
      break
    }

    case DemoOperationType.NODE_MOVED:
      nodePositions.value.set(operation.nodeId, { ...operation.position })
      highlightedNodeIds.value.add(operation.nodeId)
      break
  }
}

/** 录制图操作的钩子 */
function recordNodeAdded(
  nodeId: string,
  typeId: string,
  position: { x: number; y: number },
  context?: unknown,
): void {
  if (demo.isRecording.value) {
    demo.recorder.recordNodeAdded(nodeId, typeId, position, context)
  }
}

function recordNodeRemoved(nodeId: string): void {
  if (demo.isRecording.value) {
    demo.recorder.recordNodeRemoved(nodeId)
  }
}

function recordEdgeAdded(
  fromNodeId: string,
  fromPortName: string,
  toNodeId: string,
  toPortName: string,
): void {
  if (demo.isRecording.value) {
    demo.recorder.recordEdgeAdded(fromNodeId, fromPortName, toNodeId, toPortName)
  }
}

function recordNodeMoved(nodeId: string, position: { x: number; y: number }): void {
  if (demo.isRecording.value) {
    demo.recorder.recordNodeMoved(nodeId, position)
  }
}

// ========== IPC 外部控制（Godot-wry 集成） ==========

let cleanupIPC: (() => void) | null = null

onMounted(() => {
  // 设置 IPC 监听，允许外部控制演示回放
  cleanupIPC = setupDemoIPC({
    executeCommand: demo.executeCommand,
    getState: () => ({
      isPlaying: demo.isPlaying.value,
      currentStep: demo.currentStep.value,
      totalSteps: demo.totalSteps.value,
    }),
  })

  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  cleanupIPC?.()
  document.removeEventListener('keydown', handleKeydown)
})

// ========== Vue-Flow 逻辑 ==========

function getNodeViewType(typeId: string): string {
  return NodeViewRegistry.getViewType(typeId)
}

const vfNodes = computed<Node[]>(() => {
  const nodes: Node[] = []
  for (const node of graphStore.nodes) {
    const pos = nodePositions.value.get(node.id) ?? { x: 0, y: 0 }
    const isHighlighted = highlightedNodeIds.value.has(node.id)
    nodes.push({
      id: node.id,
      type: getNodeViewType(node.typeId),
      position: pos,
      data: { node: markRaw(node) },
      class: isHighlighted ? 'highlighted-node' : '',
    })
  }
  return nodes
})

const vfEdges = computed<Edge[]>(() => {
  const edges: Edge[] = []
  const graph = graphStore.currentGraph

  for (const node of graphStore.nodes) {
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

const nodeTypes = computed(() => NodeViewRegistry.getNodeTypes())

/** 处理连接 - 同时录制 */
onConnect((connection: Connection) => {
  if (connection.sourceHandle && connection.targetHandle) {
    const success = graphStore.addEdge(connection.sourceHandle, connection.targetHandle)
    if (success) {
      // 获取端口名称用于录制
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
    }
  }
})

onNodeDoubleClick(({ node }) => {
  const anoraNode = graphStore.currentGraph.getNode(node.id)
  if (anoraNode instanceof SubGraphNode) {
    graphStore.enterSubGraph(anoraNode)
  }
})

onPaneClick(() => {
  graphStore.clearSelection()
})

/** 处理节点拖拽停止 - 同时录制 */
function onNodeDragStop(event: { node: Node }): void {
  const newPos = { ...event.node.position }
  nodePositions.value.set(event.node.id, newPos)
  recordNodeMoved(event.node.id, newPos)
}

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

/** 删除选中节点 - 同时录制 */
function deleteSelected(): void {
  for (const nodeId of graphStore.selectedNodeIds) {
    recordNodeRemoved(nodeId)
    graphStore.removeNode(nodeId)
    nodePositions.value.delete(nodeId)
  }
}

/** 执行图 - 连接录制器 */
async function executeGraph(): Promise<void> {
  if (demo.isRecording.value) {
    graphStore.executor.setDemoRecorder(demo.recorder)
  } else {
    graphStore.executor.setDemoRecorder(undefined)
  }
  await graphStore.startExecution()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Delete') {
    deleteSelected()
  }

  if (event.key === 'F5' && !event.shiftKey) {
    event.preventDefault()
    if (!graphStore.isRunning) {
      executeGraph()
    }
  }

  if (event.key === 'F5' && event.shiftKey) {
    event.preventDefault()
    graphStore.stopExecution()
  }

  // 演示模式快捷键
  if (event.key === 'ArrowRight' && demo.hasRecording.value) {
    event.preventDefault()
    demo.next()
  }

  if (event.key === 'ArrowLeft' && demo.hasRecording.value) {
    event.preventDefault()
    demo.previous()
  }

  if (event.key === ' ' && demo.hasRecording.value) {
    event.preventDefault()
    if (demo.isPlaying.value) {
      demo.pause()
    } else {
      demo.play()
    }
  }
}

// 监听图变化，设置新节点位置
watch(
  () => graphStore.nodes,
  (nodes) => {
    for (const node of nodes) {
      if (!nodePositions.value.has(node.id)) {
        const existingCount = nodePositions.value.size
        const pos = {
          x: 100 + (existingCount % 5) * 250,
          y: 100 + Math.floor(existingCount / 5) * 180,
        }
        nodePositions.value.set(node.id, pos)
        recordNodeAdded(node.id, node.typeId, pos, node.context)
      }
    }
  },
  { immediate: true },
)

function handleUpload(file: File): void {
  demo.uploadRecording(file)
}
</script>

<template>
  <div class="demo-view">
    <!-- 顶部工具栏 -->
    <div class="demo-toolbar">
      <Breadcrumb />
      <div class="toolbar-spacer" />

      <!-- 执行按钮 -->
      <button
        class="toolbar-btn"
        @click="executeGraph"
        :disabled="graphStore.isRunning || demo.hasRecording.value"
      >
        ▶ {{ t('executor.run') }}
      </button>
      <button
        class="toolbar-btn"
        @click="graphStore.stopExecution"
        :disabled="!graphStore.isRunning"
      >
        ⏹ {{ t('executor.stop') }}
      </button>
    </div>

    <!-- 主体区域 -->
    <div class="demo-main">
      <!-- 左侧：Demo 控制面板 -->
      <div class="demo-sidebar">
        <DemoControls
          :is-recording="demo.isRecording.value"
          :is-playing="demo.isPlaying.value"
          :is-paused="demo.isPaused.value"
          :is-idle="demo.isIdle.value"
          :current-step="demo.currentStep.value"
          :total-steps="demo.totalSteps.value"
          :has-recording="demo.hasRecording.value"
          :can-go-next="demo.canGoNext.value"
          :can-go-previous="demo.canGoPrevious.value"
          @start-recording="demo.startRecording()"
          @stop-recording="demo.stopRecording()"
          @play="demo.play()"
          @pause="demo.pause()"
          @stop="demo.stop()"
          @next="demo.next()"
          @previous="demo.previous()"
          @download="demo.downloadRecording('anora-demo.json')"
          @upload="handleUpload"
          @clear="demo.clearRecording()"
        />

        <!-- 快捷键说明 -->
        <div class="shortcuts-help">
          <div class="help-title">{{ t('demo.shortcuts') }}</div>
          <div class="help-item"><kbd>Space</kbd> {{ t('demo.shortcutPlayPause') }}</div>
          <div class="help-item"><kbd>←</kbd> {{ t('demo.shortcutPrev') }}</div>
          <div class="help-item"><kbd>→</kbd> {{ t('demo.shortcutNext') }}</div>
          <div class="help-item"><kbd>F5</kbd> {{ t('demo.shortcutExecute') }}</div>
          <div class="help-item"><kbd>Delete</kbd> {{ t('demo.shortcutDelete') }}</div>
        </div>

        <!-- IPC 状态 -->
        <div class="ipc-status">
          <div class="help-title">{{ t('demo.ipcTitle') }}</div>
          <div class="ipc-info">{{ t('demo.ipcInfo') }}</div>
          <div class="ipc-commands">
            <code>play</code> <code>pause</code> <code>next</code> <code>previous</code>
            <code>goto</code>
          </div>
        </div>
      </div>

      <!-- 右侧：图编辑器 -->
      <div class="demo-canvas">
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
          <Background
            :variant="BackgroundVariant.Dots"
            :gap="20"
            :size="1"
            pattern-color="#3a3a5c"
          />
        </VueFlow>

        <!-- 节点面板 -->
        <NodePalette v-if="!demo.hasRecording.value" />

        <!-- 演示模式提示 -->
        <div v-if="demo.hasRecording.value" class="demo-overlay-hint">
          {{ t('demo.modeTip') }}
        </div>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="demo-statusbar">
      <span>{{ t('editor.nodes') }}: {{ graphStore.nodes.length }}</span>
      <span v-if="demo.isRecording.value" class="recording-indicator"
        >⏺ {{ t('demo.recording') }}</span
      >
      <span v-if="demo.hasRecording.value"
        >{{ t('demo.step') }}: {{ demo.currentStep.value + 1 }} / {{ demo.totalSteps.value }}</span
      >
      <span>{{ t('editor.selected') }}: {{ graphStore.selectedNodeIds.size }}</span>
    </div>
  </div>
</template>

<style scoped>
.demo-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #0f0f1a;
  color: #e2e8f0;
}

.demo-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #3a3a5c;
  z-index: 10;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-btn {
  padding: 6px 12px;
  background: #252542;
  border: 1px solid #3a3a5c;
  border-radius: 4px;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.toolbar-btn:hover:not(:disabled) {
  background: #3a3a5c;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.demo-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.demo-sidebar {
  width: 280px;
  padding: 16px;
  background: #1a1a2e;
  border-right: 1px solid #3a3a5c;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.shortcuts-help,
.ipc-status {
  background: #252542;
  border-radius: 8px;
  padding: 12px;
}

.help-title {
  font-size: 12px;
  font-weight: 600;
  color: #a0a0c0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.help-item {
  font-size: 12px;
  color: #808090;
  margin: 4px 0;
}

.help-item kbd {
  background: #1a1a2e;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
}

.ipc-info {
  font-size: 11px;
  color: #808090;
  margin-bottom: 8px;
}

.ipc-commands {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ipc-commands code {
  background: #1a1a2e;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  color: #60a5fa;
}

.demo-canvas {
  flex: 1;
  position: relative;
}

.demo-overlay-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(96, 165, 250, 0.9);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  z-index: 100;
  pointer-events: none;
}

.demo-statusbar {
  display: flex;
  gap: 24px;
  padding: 4px 16px;
  background: #1a1a2e;
  border-top: 1px solid #3a3a5c;
  font-size: 11px;
  color: #6b7280;
}

.recording-indicator {
  color: #ef4444;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 高亮节点样式 */
:deep(.highlighted-node) {
  --vf-node-bg: #2a4a6a !important;
}

:deep(.highlighted-node .vue-flow__node) {
  box-shadow: 0 0 20px rgba(96, 165, 250, 0.5);
}

/* Vue-Flow 主题 */
:deep(.vue-flow) {
  background: #0f0f1a;
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
</style>
