<script setup lang="ts">
/**
 * DemoView - 演示模式页面（只读）
 * 仅用于回放已录制的操作序列，不支持编辑
 * 支持 Godot-wry IPC 外部控制
 */
import { ref, computed, onMounted, onUnmounted, markRaw } from 'vue'
import { VueFlow, type Node, type Edge } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import { useGraphStore } from '@/stores/graph'
import { BaseNode } from '@/base/runtime/nodes'
import { useDemo, setupDemoIPC } from '@/base/ui/composables'
import type { AnyDemoOperation } from '@/base/runtime/demo'
import { DemoOperationType } from '@/base/runtime/demo'

import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import LocaleSwitcher from '@/base/ui/editor/LocaleSwitcher.vue'

import { NodeViewRegistry } from '@/base/ui/registry'
import { NodeRegistry } from '@/base/runtime/registry'

// 设置默认视图
NodeViewRegistry.setDefaultView(BaseNodeView)

const { t } = useI18n()
const router = useRouter()
const graphStore = useGraphStore()

/** 节点位置存储 */
const nodePositions = ref<Map<string, { x: number; y: number }>>(new Map())

/** 高亮的节点 ID 列表 */
const highlightedNodeIds = ref<Set<string>>(new Set())

/** 是否有有效的演示数据 */
const hasValidDemo = ref(false)

// ========== Demo 回放 ==========

const demo = useDemo({
  onApplyOperation: applyDemoOperation,
  autoPlayDelay: 1200,
})

/** 应用演示操作到图 */
async function applyDemoOperation(operation: AnyDemoOperation): Promise<void> {
  highlightedNodeIds.value.clear()

  switch (operation.type) {
    case DemoOperationType.INITIAL_STATE: {
      // 清空当前图
      for (const node of [...graphStore.nodes]) {
        graphStore.removeNode(node.id)
      }
      nodePositions.value.clear()

      // 添加所有节点
      for (const nodeData of operation.nodes) {
        const node = NodeRegistry.createNode(nodeData.nodeType, nodeData.nodeId)
        if (node) {
          const baseNode = node as BaseNode
          baseNode.label = nodeData.label
          if (nodeData.context && baseNode.context) {
            Object.assign(baseNode.context, nodeData.context)
          }
          graphStore.addNode(baseNode)
          nodePositions.value.set(nodeData.nodeId, { ...nodeData.position })
        }
      }

      // 添加所有边
      for (const edgeData of operation.edges) {
        const fromNode = graphStore.currentGraph.getNode(edgeData.fromNodeId)
        const toNode = graphStore.currentGraph.getNode(edgeData.toNodeId)
        if (fromNode && toNode) {
          const fromPort = fromNode.outPorts.get(edgeData.fromPortName)
          const toPort = toNode.inPorts.get(edgeData.toPortName)
          if (fromPort && toPort) {
            graphStore.currentGraph.addEdge(fromPort.id, toPort.id)
          }
        }
      }
      break
    }

    case DemoOperationType.ITERATION:
      for (const nodeState of operation.nodeStates) {
        const node = graphStore.currentGraph.getNode(nodeState.nodeId)
        if (node) {
          for (const [portName, value] of Object.entries(nodeState.outPorts)) {
            const port = node.outPorts.get(portName)
            if (port && value !== null && value !== undefined) {
              try {
                port.write(value as string | number | boolean | object | null)
              } catch (e) {
                console.warn(`Failed to restore port ${portName}:`, e)
              }
            }
          }
        }
      }
      for (const nodeId of operation.activatedNodeIds) {
        highlightedNodeIds.value.add(nodeId)
      }
      break

    case DemoOperationType.NODE_ADDED: {
      const node = NodeRegistry.createNode(operation.nodeType, operation.nodeId)
      if (node) {
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

    case DemoOperationType.NODE_ACTIVATED:
      // 高亮激活的节点
      highlightedNodeIds.value.add(operation.nodeId)
      break

    case DemoOperationType.DATA_PROPAGATE:
      // 数据传播 - 高亮涉及的节点
      for (const transfer of operation.transfers) {
        // 找到源端口和目标端口所属的节点并高亮
        const sourceNode = graphStore.currentGraph.getNodeByPortId(transfer.sourcePortId)
        const targetNode = graphStore.currentGraph.getNodeByPortId(transfer.targetPortId)
        if (sourceNode) highlightedNodeIds.value.add(sourceNode.id)
        if (targetNode) highlightedNodeIds.value.add(targetNode.id)
      }
      break
  }
}

// ========== IPC 外部控制（Godot-wry 集成） ==========

let cleanupIPC: (() => void) | null = null

onMounted(() => {
  // 尝试从 sessionStorage 加载演示数据
  const storedData = sessionStorage.getItem('anora-demo-data')
  if (storedData) {
    try {
      const data = JSON.parse(storedData)
      demo.importRecording(data)
      hasValidDemo.value = true
      sessionStorage.removeItem('anora-demo-data')
    } catch (e) {
      console.error('Failed to load demo data:', e)
    }
  }

  // 设置 IPC 监听
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

// ========== Vue-Flow 只读显示 ==========

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
      draggable: false, // 只读
      selectable: false, // 只读
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

/** 进度百分比 */
const progressPercent = computed(() => {
  if (demo.totalSteps.value === 0) return 0
  return ((demo.currentStep.value + 1) / demo.totalSteps.value) * 100
})

/** 键盘快捷键 */
function handleKeydown(event: KeyboardEvent): void {
  if (!demo.hasRecording.value) return

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    demo.next()
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    demo.previous()
  }

  if (event.key === ' ') {
    event.preventDefault()
    if (demo.isPlaying.value) {
      demo.pause()
    } else {
      demo.play()
    }
  }

  if (event.key === 'Escape') {
    router.push('/')
  }
}

function goToEditor(): void {
  router.push('/')
}

function handleUpload(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    demo.uploadRecording(file)
    hasValidDemo.value = true
    target.value = ''
  }
}
</script>

<template>
  <div class="demo-view">
    <!-- 顶部工具栏 -->
    <div class="demo-toolbar">
      <button class="back-btn" @click="goToEditor" :title="t('breadcrumb.back')">
        ← {{ t('editor.title') }}
      </button>

      <div class="demo-title">
        <span class="demo-icon">🎬</span>
        {{ t('demo.title') }}
      </div>

      <div class="toolbar-spacer" />
      <LocaleSwitcher />
    </div>

    <!-- 主体区域 -->
    <div class="demo-main">
      <!-- 无演示数据时的提示 -->
      <div v-if="!demo.hasRecording.value" class="empty-state">
        <div class="empty-icon">📂</div>
        <div class="empty-title">{{ t('demo.loadRecording') }}</div>
        <div class="empty-desc">{{ t('demo.ipcInfo') }}</div>
        <label class="upload-btn">
          <input type="file" accept=".json" @change="handleUpload" style="display: none" />
          <span class="icon">📁</span> {{ t('demo.loadRecording') }}
        </label>
      </div>

      <!-- 演示画布 -->
      <template v-else>
        <VueFlow
          :nodes="vfNodes"
          :edges="vfEdges"
          :node-types="nodeTypes"
          :default-edge-options="{ type: 'default' }"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :elements-selectable="false"
          :pan-on-drag="true"
          :zoom-on-scroll="true"
          fit-view-on-init
        >
          <Background
            :variant="BackgroundVariant.Dots"
            :gap="20"
            :size="1"
            pattern-color="#3a3a5c"
          />
        </VueFlow>

        <!-- 播放控制条 -->
        <div class="playback-bar">
          <!-- 进度条 -->
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>

          <!-- 控制按钮 -->
          <div class="playback-controls">
            <button @click="demo.previous()" :disabled="!demo.canGoPrevious.value" class="ctrl-btn">
              ⏮
            </button>
            <button v-if="!demo.isPlaying.value" @click="demo.play()" class="ctrl-btn play-btn">
              ▶️
            </button>
            <button v-else @click="demo.pause()" class="ctrl-btn pause-btn">⏸</button>
            <button @click="demo.stop()" :disabled="demo.isIdle.value" class="ctrl-btn">⏹</button>
            <button @click="demo.next()" :disabled="!demo.canGoNext.value" class="ctrl-btn">
              ⏭
            </button>
          </div>

          <!-- 步骤信息 -->
          <div class="step-info">
            {{ t('demo.step') }} {{ demo.currentStep.value + 1 }} / {{ demo.totalSteps.value }}
          </div>
        </div>

        <!-- 快捷键提示 -->
        <div class="shortcuts-hint">
          <span><kbd>Space</kbd> {{ t('demo.shortcutPlayPause') }}</span>
          <span
            ><kbd>←</kbd><kbd>→</kbd> {{ t('demo.shortcutPrev') }}/{{
              t('demo.shortcutNext')
            }}</span
          >
          <span><kbd>Esc</kbd> {{ t('breadcrumb.back') }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.demo-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #0a0a14;
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

.back-btn {
  padding: 6px 12px;
  background: #252542;
  border: 1px solid #3a3a5c;
  border-radius: 4px;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.back-btn:hover {
  background: #3a3a5c;
}

.demo-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #a78bfa;
}

.demo-icon {
  font-size: 18px;
}

.toolbar-spacer {
  flex: 1;
}

.demo-main {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  opacity: 0.5;
}

.empty-title {
  font-size: 20px;
  font-weight: 600;
  color: #94a3b8;
}

.empty-desc {
  font-size: 14px;
  color: #64748b;
  max-width: 400px;
}

.upload-btn {
  padding: 12px 24px;
  background: #6366f1;
  border: none;
  border-radius: 8px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.upload-btn:hover {
  background: #7c7ff7;
  transform: translateY(-2px);
}

/* 播放控制条 */
.playback-bar {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: rgba(26, 26, 46, 0.95);
  border: 1px solid #3a3a5c;
  border-radius: 12px;
  backdrop-filter: blur(8px);
  min-width: 360px;
}

.progress-track {
  width: 100%;
  height: 6px;
  background: #252542;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #a78bfa);
  transition: width 0.3s ease;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctrl-btn {
  padding: 8px 16px;
  background: #252542;
  border: 1px solid #3a3a5c;
  border-radius: 6px;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.ctrl-btn:hover:not(:disabled) {
  background: #3a3a5c;
  transform: translateY(-1px);
}

.ctrl-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.play-btn {
  background: #22c55e;
  border-color: #22c55e;
}

.play-btn:hover:not(:disabled) {
  background: #16a34a;
}

.pause-btn {
  background: #f59e0b;
  border-color: #f59e0b;
}

.step-info {
  font-size: 12px;
  color: #94a3b8;
}

/* 快捷键提示 */
.shortcuts-hint {
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: rgba(26, 26, 46, 0.8);
  border-radius: 8px;
  font-size: 11px;
  color: #64748b;
}

.shortcuts-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  background: #252542;
  border: 1px solid #3a3a5c;
  border-radius: 3px;
  font-family: monospace;
  font-size: 10px;
  margin-right: 4px;
}

/* 高亮节点样式 */
:deep(.highlighted-node) {
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.6);
}

/* Vue-Flow 样式 */
:deep(.vue-flow) {
  background: #0a0a14;
}

:deep(.vue-flow__edge-path) {
  stroke: #64748b;
  stroke-width: 2;
}
</style>
