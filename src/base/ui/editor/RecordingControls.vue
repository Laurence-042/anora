<script setup lang="ts">
/**
 * RecordingControls - 录制控制组件
 * 录制操作序列，导出供演示模式使用
 * 自包含录制逻辑，通过 props 接收外部事件
 */
import { ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/stores/graph'
import { DemoRecorder } from '@/base/runtime/demo'

const props = defineProps<{
  /** 节点位置映射（用于录制节点位置） */
  nodePositions: Map<string, { x: number; y: number }>
}>()

const { t } = useI18n()
const graphStore = useGraphStore()

// ========== 录制状态 ==========
const recorder = new DemoRecorder()
const isRecording = ref(false)
const operationCount = ref(0)

// 设置录制回调，实时更新操作计数
recorder.onOperationRecorded = (count: number) => {
  operationCount.value = count
}

/** 开始录制 */
function startRecording(): void {
  recorder.clear()
  recorder.startRecording()
  isRecording.value = true
  operationCount.value = 0
  graphStore.executor.setDemoRecorder(recorder)

  // 记录初始图状态
  const graph = graphStore.currentGraph
  const nodes = graph.getAllNodes().map((node) => {
    const pos = props.nodePositions.get(node.id) || { x: 0, y: 0 }
    return {
      nodeId: node.id,
      nodeType: node.typeId,
      label: node.label,
      position: pos,
      context: node.context,
    }
  })

  // 构建 portId -> { node, portName } 的映射
  const portIdToInfo = new Map<string, { nodeId: string; portName: string }>()
  for (const node of graph.getAllNodes()) {
    for (const [name, port] of node.inPorts) {
      portIdToInfo.set(port.id, { nodeId: node.id, portName: name })
    }
    for (const [name, port] of node.outPorts) {
      portIdToInfo.set(port.id, { nodeId: node.id, portName: name })
    }
    // exec ports
    if (node.inExecPort) {
      portIdToInfo.set(node.inExecPort.id, { nodeId: node.id, portName: 'exec' })
    }
    if (node.outExecPort) {
      portIdToInfo.set(node.outExecPort.id, { nodeId: node.id, portName: 'exec' })
    }
  }

  const edges = graph.getAllEdges().map((edge) => {
    const fromInfo = portIdToInfo.get(edge.fromPortId)
    const toInfo = portIdToInfo.get(edge.toPortId)
    return {
      fromNodeId: fromInfo?.nodeId || '',
      fromPortName: fromInfo?.portName || '',
      toNodeId: toInfo?.nodeId || '',
      toPortName: toInfo?.portName || '',
    }
  })

  recorder.recordInitialState(nodes, edges)
}

/** 停止录制 */
function stopRecording(): void {
  recorder.stopRecording()
  isRecording.value = false
  // 更新操作计数（确保最终值同步）
  operationCount.value = recorder.getOperationCount()
  graphStore.executor.setDemoRecorder(undefined)
}

/** 下载录制文件 */
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

/** 上传录制文件并跳转到演示页面 */
function uploadRecording(file: File): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    try {
      const data = JSON.parse(content)
      sessionStorage.setItem('anora-demo-data', JSON.stringify(data))
      window.location.href = '/demo'
    } catch (err) {
      console.error('Failed to parse demo file:', err)
      alert(t('errors.invalidOperation'))
    }
  }
  reader.readAsText(file)
}

// ========== 录制方法（供外部调用） ==========

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

// 暴露录制方法给父组件
defineExpose({
  isRecording,
  recordNodeAdded,
  recordNodeRemoved,
  recordEdgeAdded,
  recordNodeMoved,
})

// ========== UI ==========
const fileInput = ref<HTMLInputElement>()

function handleUpload(): void {
  fileInput.value?.click()
}

function handleFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    uploadRecording(file)
    target.value = ''
  }
}

// 清理
onUnmounted(() => {
  if (isRecording.value) {
    stopRecording()
  }
})
</script>

<template>
  <div class="recording-controls">
    <!-- 录制状态指示 -->
    <div v-if="isRecording" class="recording-indicator">
      <span class="recording-dot"></span>
      <span class="recording-text">{{ t('demo.recording') }}</span>
      <span class="operation-count">{{ operationCount }}</span>
    </div>

    <!-- 控制按钮 -->
    <button
      v-if="!isRecording"
      class="control-btn record-btn"
      @click="startRecording"
      :title="t('demo.startRecording')"
    >
      <span class="icon">⏺</span>
    </button>

    <template v-else>
      <button class="control-btn stop-btn" @click="stopRecording" :title="t('demo.stopRecording')">
        <span class="icon">⏹</span>
      </button>
      <button
        class="control-btn download-btn"
        @click="downloadRecording"
        :title="t('demo.export')"
        :disabled="operationCount === 0"
      >
        <span class="icon">💾</span>
      </button>
    </template>

    <!-- 加载录制文件 -->
    <button
      v-if="!isRecording"
      class="control-btn upload-btn"
      @click="handleUpload"
      :title="t('demo.loadRecording')"
    >
      <span class="icon">📂</span>
    </button>

    <input
      ref="fileInput"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleFileChange"
    />
  </div>
</template>

<style scoped>
.recording-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(220, 38, 38, 0.15);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: 4px;
}

.recording-dot {
  width: 8px;
  height: 8px;
  background: #dc2626;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.recording-text {
  font-size: 11px;
  color: #dc2626;
  font-weight: 500;
}

.operation-count {
  font-size: 10px;
  color: #94a3b8;
  background: rgba(0, 0, 0, 0.2);
  padding: 1px 6px;
  border-radius: 10px;
}

.control-btn {
  padding: 6px 10px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover:not(:disabled) {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.record-btn:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.2);
  border-color: rgba(220, 38, 38, 0.4);
}

.stop-btn {
  background: rgba(220, 38, 38, 0.15);
  border-color: rgba(220, 38, 38, 0.3);
}

.stop-btn:hover {
  background: rgba(220, 38, 38, 0.25);
}

.icon {
  font-size: 14px;
}
</style>
