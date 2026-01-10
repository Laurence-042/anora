<script setup lang="ts">
/**
 * NodePalette - 节点面板
 * 显示可用的节点类型，支持拖放添加
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElTooltip } from 'element-plus'
import { NodeRegistry } from '@/base/runtime/registry'
import { NodeViewRegistry } from '@/base/ui/registry'

const { t } = useI18n()

// ==================== Emits ====================
const emit = defineEmits<{
  'add-node': [typeId: string]
}>()

/** 搜索关键字 */
const searchQuery = ref('')

/** 是否展开面板 */
const isExpanded = ref(true)

/** 节点类型信息 */
interface NodeTypeInfo {
  typeId: string
  name: string
  icon: string
  category: string
  categoryName: string
}

/**
 * 获取节点 i18n 名称
 * typeId 格式: 'mod.NodeName' -> i18n key: 'nodes.mod.NodeName'
 */
function getNodeName(typeId: string): string {
  const [mod, nodeName] = typeId.split('.')
  // 尝试翻译，如果没有则用 nodeName 作为 fallback
  return t(`nodes.${mod}.${nodeName}`, nodeName ?? typeId)
}

/**
 * 获取分类 i18n 名称
 */
function getCategoryName(category: string): string {
  return t(`nodeCategories.${category}`, category)
}

/** 可用的节点类型 */
const nodeTypes = computed<NodeTypeInfo[]>(() => {
  const types: NodeTypeInfo[] = []

  for (const [typeId] of NodeRegistry.getAll()) {
    const meta = NodeViewRegistry.getNodeMeta(typeId)

    types.push({
      typeId,
      name: getNodeName(typeId),
      icon: meta.icon,
      category: meta.category,
      categoryName: getCategoryName(meta.category),
    })
  }

  // 按分类排序
  return types.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category)
    }
    return a.name.localeCompare(b.name)
  })
})

/** 过滤后的节点类型 */
const filteredTypes = computed(() => {
  if (!searchQuery.value) return nodeTypes.value

  const query = searchQuery.value.toLowerCase()
  return nodeTypes.value.filter(
    (t) =>
      t.name.toLowerCase().includes(query) ||
      t.typeId.toLowerCase().includes(query) ||
      t.categoryName.toLowerCase().includes(query),
  )
})

/** 按分类分组 */
const groupedTypes = computed(() => {
  const groups: Record<string, { categoryName: string; items: NodeTypeInfo[] }> = {}

  for (const type of filteredTypes.value) {
    if (!groups[type.category]) {
      groups[type.category] = { categoryName: type.categoryName, items: [] }
    }
    groups[type.category]!.items.push(type)
  }

  return groups
})

/** 触发添加节点事件 */
function addNode(typeId: string): void {
  emit('add-node', typeId)
}

/** 处理拖放开始 */
function onDragStart(event: DragEvent, typeId: string): void {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/anora-node', typeId)
    event.dataTransfer.effectAllowed = 'copy'
  }
}
</script>

<template>
  <div class="node-palette" :class="{ collapsed: !isExpanded }">
    <!-- 头部 -->
    <div class="palette-header" @click="isExpanded = !isExpanded">
      <span class="header-title">{{ t('nodePalette.title') }}</span>
      <span class="toggle-icon">{{ isExpanded ? '◀' : '▶' }}</span>
    </div>

    <!-- 内容区域 -->
    <div v-show="isExpanded" class="palette-content">
      <!-- 搜索框 -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('nodePalette.search')"
          class="search-input"
        />
      </div>

      <!-- 节点列表 -->
      <div class="node-list">
        <div v-for="(group, category) in groupedTypes" :key="category" class="category-group">
          <div class="category-header">{{ group.categoryName }}</div>
          <el-tooltip
            v-for="type in group.items"
            :key="type.typeId"
            :content="type.typeId"
            placement="right"
            :show-after="500"
          >
            <div
              class="node-item"
              draggable="true"
              @click="addNode(type.typeId)"
              @dragstart="onDragStart($event, type.typeId)"
            >
              <span class="node-icon">{{ type.icon }}</span>
              <span class="node-name">{{ type.name }}</span>
            </div>
          </el-tooltip>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredTypes.length === 0" class="empty-state">
          {{ t('nodePalette.noResults') }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-palette {
  position: absolute;
  left: 16px;
  top: 80px;
  width: 200px;
  background: rgba(15, 15, 26, 0.95);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 8px;
  overflow: hidden;
  z-index: 10;
  transition: width 0.2s;
  backdrop-filter: blur(8px);
}

.node-palette.collapsed {
  width: 40px;
}

.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(37, 37, 66, 0.8);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--vf-border, #3a3a5c);
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vf-text, #e2e8f0);
}

.collapsed .header-title {
  display: none;
}

.toggle-icon {
  font-size: 10px;
  color: var(--vf-text-muted, #94a3b8);
}

.palette-content {
  max-height: 500px;
  overflow-y: auto;
}

.palette-content::-webkit-scrollbar {
  width: 6px;
}

.palette-content::-webkit-scrollbar-track {
  background: transparent;
}

.palette-content::-webkit-scrollbar-thumb {
  background: var(--vf-border, #3a3a5c);
  border-radius: 3px;
}

.search-box {
  padding: 8px;
  border-bottom: 1px solid var(--vf-border, #3a3a5c);
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  background: rgba(37, 37, 66, 0.6);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  font-size: 12px;
}

.search-input::placeholder {
  color: var(--vf-text-muted, #6b7280);
}

.search-input:focus {
  outline: none;
  border-color: #60a5fa;
}

.node-list {
  padding: 8px 0;
}

.category-group {
  margin-bottom: 4px;
}

.category-header {
  padding: 6px 12px 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--vf-text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.node-item:hover {
  background: rgba(96, 165, 250, 0.15);
}

.node-icon {
  font-size: 12px;
  color: var(--vf-text-muted, #64748b);
}

.node-name {
  font-size: 12px;
  color: var(--vf-text, #e2e8f0);
}

.empty-state {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--vf-text-muted, #6b7280);
}
</style>
