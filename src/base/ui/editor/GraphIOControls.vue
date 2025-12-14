<script setup lang="ts">
/**
 * GraphIOControls - 图导入/导出控制组件
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGraphStore } from '@/stores/graph'
import { AnoraGraph } from '@/base/runtime/graph'
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
  // 序列化时传入节点位置
  const serialized = graph.serialize(props.nodePositions)

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

      // 使用 AnoraGraph.fromSerialized 反序列化
      const { graph, nodePositions } = AnoraGraph.fromSerialized(data)

      // 替换当前图
      graphStore.replaceGraph(graph)

      // 通知父组件更新位置
      emit('imported', nodePositions)
    } catch (err) {
      console.error('Failed to parse graph file:', err)
      alert(t('errors.invalidGraph') || 'Invalid graph file')
    }
  }
  reader.readAsText(file)
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
