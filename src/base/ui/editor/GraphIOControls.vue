<script setup lang="ts">
/**
 * GraphIOControls - 图导入/导出控制组件
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/stores/graph'
import { NodeRegistry } from '@/base/runtime/registry'
import { BaseNode } from '@/base/runtime/nodes'
import type { SerializedGraph } from '@/base/runtime/types'

const props = defineProps<{
  /** 节点位置映射（用于导出时保存位置） */
  nodePositions: Map<string, { x: number; y: number }>
}>()

const emit = defineEmits<{
  /** 导入完成后触发，传递新的位置映射 */
  imported: [positions: Map<string, { x: number; y: number }>]
}>()

const { t } = useI18n()
const graphStore = useGraphStore()

/** 文件输入 ref */
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 导出图到 JSON 文件 */
function exportGraph(): void {
  const graph = graphStore.currentGraph
  const serialized = graph.serialize()

  // 将节点位置加入序列化数据
  for (const nodeData of serialized.nodes) {
    const pos = props.nodePositions.get(nodeData.id)
    if (pos) {
      nodeData.position = { x: pos.x, y: pos.y }
    }
  }

  const blob = new Blob([JSON.stringify(serialized, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `anora-graph-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** 触发文件选择 */
function triggerImport(): void {
  fileInputRef.value?.click()
}

/** 处理文件选择 */
function onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    importGraph(input.files[0])
    input.value = '' // 清空以便再次选择同一文件
  }
}

/** 导入图 */
function importGraph(file: File): void {
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    try {
      const data = JSON.parse(content) as SerializedGraph
      if (!data.schemaVersion || !data.nodes || !data.edges) {
        throw new Error('Invalid graph format')
      }
      loadGraphFromData(data)
    } catch (err) {
      console.error('Failed to parse graph file:', err)
      alert(t('errors.invalidGraph') || 'Invalid graph file')
    }
  }
  reader.readAsText(file)
}

/** 从序列化数据加载图 */
function loadGraphFromData(data: SerializedGraph): void {
  // 清空当前图
  graphStore.currentGraph.clear()
  const newPositions = new Map<string, { x: number; y: number }>()

  // 创建节点并恢复 Port ID
  for (const nodeData of data.nodes) {
    const node = NodeRegistry.createNode(nodeData.typeId, nodeData.id, nodeData.label) as
      | BaseNode
      | undefined
    if (node) {
      // 恢复 context
      if (nodeData.context !== undefined) {
        node.context = nodeData.context
      }

      // 恢复端口 ID（确保边连接能正确恢复）
      node.restorePortIds(nodeData)

      graphStore.currentGraph.addNode(node)

      // 恢复位置
      if (nodeData.position) {
        newPositions.set(nodeData.id, { x: nodeData.position.x, y: nodeData.position.y })
      }
    } else {
      console.warn(`[GraphIOControls] Unknown node type during import: ${nodeData.typeId}`)
    }
  }

  // 创建边（直接使用原始 Port ID，因为已恢复）
  for (const edgeData of data.edges) {
    graphStore.currentGraph.addEdge(edgeData.fromPortId, edgeData.toPortId)
  }

  // 刷新视图并通知父组件更新位置
  graphStore.notifyNodeChanged()
  emit('imported', newPositions)
}
</script>

<template>
  <div class="graph-io-controls">
    <button class="toolbar-btn" @click="exportGraph" :title="t('editor.exportGraph')">
      📤 {{ t('editor.export') }}
    </button>
    <button class="toolbar-btn" @click="triggerImport" :title="t('editor.importGraph')">
      📥 {{ t('editor.import') }}
    </button>
    <input
      ref="fileInputRef"
      type="file"
      accept=".json"
      style="display: none"
      @change="onFileSelected"
    />
  </div>
</template>

<style scoped>
.graph-io-controls {
  display: flex;
  gap: 8px;
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
</style>
