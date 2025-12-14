<script setup lang="ts">
/**
 * BaseNodeView - 节点基础视图组件
 * 作为 Vue-Flow 的自定义节点组件
 */
import { computed, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElTooltip } from 'element-plus'
import type { NodeProps } from '@vue-flow/core'
import type { BaseNode } from '@/base/runtime/nodes'
import { NodeExecutionStatus } from '@/base/runtime/types'
import { NodeViewRegistry } from '@/base/ui/registry'
import BasePortView from './BasePortView.vue'
import { useGraphStore } from '@/stores/graph'
import { useNodeInput } from '@/base/ui/composables'

// Vue-Flow 节点 Props
interface AnoraNodeProps extends NodeProps {
  data: {
    node: BaseNode
  }
}

const props = defineProps<AnoraNodeProps>()

const { t } = useI18n()
const graphStore = useGraphStore()
const { inputClass, onKeydown } = useNodeInput()

/** 获取节点实例 */
const node = computed(() => props.data.node)

/** 节点元数据 */
const nodeMeta = computed(() => NodeViewRegistry.getNodeMeta(node.value.typeId))

/**
 * 获取节点 i18n 名称
 * typeId 格式: 'mod.NodeName' -> i18n key: 'nodes.mod.NodeName'
 */
function getNodeName(typeId: string): string {
  const [mod, nodeName] = typeId.split('.')
  return t(`nodes.${mod}.${nodeName}`, nodeName ?? typeId)
}

/** 本地 label 状态（用于响应式更新，避免 markRaw 导致的不响应） */
const localLabel = ref(node.value.label)

/** Label 编辑状态 */
const isEditingLabel = ref(false)
const editLabelInput = ref<HTMLInputElement | null>(null)
const editingLabelValue = ref('')

/** 开始编辑 label */
function startEditLabel(): void {
  editingLabelValue.value = localLabel.value
  isEditingLabel.value = true
  nextTick(() => {
    editLabelInput.value?.focus()
    editLabelInput.value?.select()
  })
}

/** 完成编辑 label */
function finishEditLabel(): void {
  if (editingLabelValue.value.trim()) {
    const newLabel = editingLabelValue.value.trim()
    node.value.label = newLabel
    localLabel.value = newLabel
  }
  isEditingLabel.value = false
}

/** 取消编辑 label */
function cancelEditLabel(): void {
  isEditingLabel.value = false
}

/** 节点显示名称 (i18n) */
const nodeDisplayName = computed(() => {
  // 如果用户已自定义 label 且不等于 typeId，使用用户定义的
  if (localLabel.value && localLabel.value !== node.value.typeId) {
    return localLabel.value
  }
  return getNodeName(node.value.typeId)
})

/** 节点图标 */
const nodeIcon = computed(() => nodeMeta.value.icon)

/** 是否被选中 */
const isSelected = computed(() => graphStore.isNodeSelected(node.value.id))

/** 是否正在执行 */
const isExecuting = computed(() => graphStore.isNodeExecuting(node.value.id))

/** 节点执行状态 */
const executionStatus = computed(() => node.value.executionStatus)

/** 展开的 ContainerPort ID 集合 */
const expandedPorts = ref<Set<string>>(new Set())

/** 切换 Port 展开状态 */
function togglePortExpand(portId: string): void {
  if (expandedPorts.value.has(portId)) {
    expandedPorts.value.delete(portId)
  } else {
    expandedPorts.value.add(portId)
  }
}

/** 状态边框颜色 */
const statusBorderColor = computed(() => {
  if (isExecuting.value) return '#fbbf24' // amber - executing
  switch (executionStatus.value) {
    case NodeExecutionStatus.SUCCESS:
      return '#22c55e' // green
    case NodeExecutionStatus.FAILED:
      return '#ef4444' // red
    default:
      return isSelected.value ? '#60a5fa' : 'transparent' // blue when selected
  }
})

/** 警告信息 */
const warnings = computed(() => node.value.getConfigurationWarnings())
</script>

<template>
  <div
    class="anora-node"
    :class="{
      'node-selected': isSelected,
      'node-executing': isExecuting,
      'node-success': executionStatus === NodeExecutionStatus.SUCCESS,
      'node-failed': executionStatus === NodeExecutionStatus.FAILED,
    }"
    :style="{ borderColor: statusBorderColor }"
  >
    <!-- 节点头部 -->
    <div class="node-header">
      <div class="header-info">
        <el-tooltip :content="node.typeId" placement="top" :show-after="500">
          <span class="node-icon-wrapper">{{ nodeIcon }}</span>
        </el-tooltip>
        <!-- Label 显示/编辑 -->
        <input
          v-if="isEditingLabel"
          ref="editLabelInput"
          v-model="editingLabelValue"
          type="text"
          :class="['label-input', inputClass]"
          @blur="finishEditLabel"
          @keydown="onKeydown"
          @keyup.enter="finishEditLabel"
          @keyup.escape="cancelEditLabel"
        />
        <span v-else class="node-label" @dblclick="startEditLabel">{{ nodeDisplayName }}</span>
        <!-- 执行状态指示器（固定宽度占位） -->
        <span class="status-indicator-slot">
          <span v-if="isExecuting" class="status-indicator executing">⟳</span>
          <span
            v-else-if="executionStatus === NodeExecutionStatus.SUCCESS"
            class="status-indicator success"
            >✓</span
          >
          <span
            v-else-if="executionStatus === NodeExecutionStatus.FAILED"
            class="status-indicator failed"
            >✗</span
          >
        </span>
      </div>
    </div>

    <!-- 警告信息 -->
    <div v-if="warnings.length > 0" class="node-warnings">
      <div v-for="(warning, index) in warnings" :key="index" class="warning-item">
        ⚠ {{ warning }}
      </div>
    </div>

    <!-- 节点主体：三栏布局（左 Ports / 中 Controls / 右 Ports） -->
    <div class="node-body">
      <!-- 左侧：输入 Ports -->
      <div class="ports-column ports-left">
        <!-- 执行入 Port -->
        <BasePortView :port="node.inExecPort" name="exec" :is-input="true" :is-exec="true" />

        <!-- 控制入 Ports -->
        <BasePortView
          v-for="[name, port] in node.inControlPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="true"
          :is-control="true"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />

        <!-- 数据入 Ports -->
        <BasePortView
          v-for="[name, port] in node.inPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="true"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />
      </div>

      <!-- 中间：控制区域（供子组件覆盖使用的插槽） -->
      <div class="node-controls">
        <slot name="controls" :node="node"></slot>
      </div>

      <!-- 右侧：输出 Ports -->
      <div class="ports-column ports-right">
        <!-- 执行出 Port -->
        <BasePortView :port="node.outExecPort" name="exec" :is-input="false" :is-exec="true" />

        <!-- 控制出 Ports -->
        <BasePortView
          v-for="[name, port] in node.outControlPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="false"
          :is-control="true"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />

        <!-- 数据出 Ports -->
        <BasePortView
          v-for="[name, port] in node.outPorts"
          :key="port.id"
          :port="port"
          :name="name"
          :is-input="false"
          :expanded="expandedPorts.has(port.id)"
          @toggle-expand="togglePortExpand(port.id)"
        />
      </div>
    </div>

    <!-- 错误信息 -->
    <div v-if="node.lastError" class="node-error">
      {{ node.lastError }}
    </div>
  </div>
</template>

<style scoped>
/* BaseNodeView 特有样式 - 通用样式由 node-theme.css 提供 */

/* 节点最大宽度限制 */
.anora-node {
  max-width: 320px;
}

/* 节点图标 */
.node-icon-wrapper {
  font-size: 14px;
  margin-right: 6px;
  cursor: help;
  opacity: 0.9;
}

.node-icon-wrapper:hover {
  opacity: 1;
}

/* 状态指示器占位槽 */
.status-indicator-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-left: 4px;
}

/* 状态指示器动画 */
.status-indicator {
  font-size: 14px;
}

.status-indicator.executing {
  color: var(--node-warning, #fbbf24);
  animation: spin 1s linear infinite;
}

.status-indicator.success {
  color: var(--node-success, #22c55e);
}

.status-indicator.failed {
  color: var(--node-error, #ef4444);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 警告信息 */
.node-warnings {
  background: rgba(251, 191, 36, 0.1);
  padding: 4px 8px;
  border-bottom: 1px solid var(--node-border, #3a3a5c);
}

.warning-item {
  font-size: 10px;
  color: var(--node-warning, #fbbf24);
}

/* 控制区域 - 位于中间列 */
.node-controls {
  flex: 1;
  min-width: 0;
  padding: 0 8px;
}

.node-controls:empty {
  display: none;
  padding: 0;
}

/* 节点主体 - 三栏布局 */
.node-body {
  display: flex;
  align-items: flex-start; /* 顶部对齐 */
  padding: 8px 0;
  min-height: 40px;
  gap: 4px;
}

.ports-column {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0; /* 防止 ports 被压缩 */
}

.ports-left {
  align-items: flex-start;
}

.ports-right {
  align-items: flex-end;
  margin-left: auto; /* 推到右边 */
}

/* 错误信息 */
.node-error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--node-error, #ef4444);
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 0 0 6px 6px;
  border-top: 1px solid rgba(239, 68, 68, 0.3);
}
</style>
