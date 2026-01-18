<script setup lang="ts">
/**
 * WryIpcNodeView - WRY IPC 节点视图
 * 提供后端方法名和参数列表配置控件
 */
import { computed, ref, watch } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import type { WryIpcNode, WryIpcParam } from '@/mods/godot-wry/runtime/nodes/WryIpcNode'
import BaseNodeView from '@/base/ui/components/BaseNodeView.vue'
import { useNodeInput, useContextField } from '@/base/ui/composables'
import { ElInput, ElButton } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'

interface WryIpcNodeProps extends NodeProps {
  data: {
    node: WryIpcNode
  }
}

const props = defineProps<WryIpcNodeProps>()

const node = computed(() => props.data.node)
const { inputClass, onKeydown } = useNodeInput()

/**
 * method 字段绑定
 */
const { value: method } = useContextField(node, {
  field: 'method',
  defaultValue: '',
})

/**
 * params 需要特殊处理（会影响 Port 结构）
 * 使用本地状态 + 手动同步
 */
const localParams = ref<WryIpcParam[]>([])

// 初始化和同步
watch(
  () => node.value.getParams(),
  (newParams) => {
    localParams.value = [...newParams]
  },
  { immediate: true },
)

/**
 * 添加参数
 */
function addParam(): void {
  const newName = `arg${localParams.value.length}`
  localParams.value.push({ name: newName })
  syncParams()
}

/**
 * 删除参数
 */
function removeParam(index: number): void {
  localParams.value.splice(index, 1)
  syncParams()
}

/**
 * 更新参数名
 */
function updateParamName(index: number, name: string): void {
  if (localParams.value[index]) {
    localParams.value[index].name = name
    syncParams()
  }
}

/**
 * 同步参数到节点
 */
function syncParams(): void {
  node.value.setParams([...localParams.value])
}
</script>

<template>
  <BaseNodeView v-bind="props as any">
    <template #controls="{ readonly }">
      <div class="config-section">
        <!-- Method 输入 -->
        <div class="field-row">
          <label class="field-label">Method</label>
          <ElInput
            v-model="method"
            placeholder="后端方法名"
            size="small"
            :disabled="readonly"
            :class="inputClass"
            @keydown="onKeydown"
          />
        </div>

        <!-- Params 列表 -->
        <div class="params-section">
          <div class="params-header">
            <label class="field-label">Params (入Port)</label>
            <ElButton
              type="primary"
              size="small"
              :icon="Plus"
              circle
              :disabled="readonly"
              @click="addParam"
            />
          </div>

          <div v-if="localParams.length === 0" class="no-params">无参数</div>

          <div v-for="(param, index) in localParams" :key="index" class="param-item">
            <ElInput
              :model-value="param.name"
              placeholder="参数名"
              size="small"
              :disabled="readonly"
              :class="inputClass"
              @keydown="onKeydown"
              @update:model-value="updateParamName(index, $event as string)"
            />
            <ElButton
              type="danger"
              size="small"
              :icon="Delete"
              circle
              :disabled="readonly"
              @click="removeParam(index)"
            />
          </div>
        </div>
      </div>
    </template>
  </BaseNodeView>
</template>

<style scoped>
.config-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--node-border, #3a3a5c);
}

.field-row {
  margin-bottom: 8px;
}

.field-label {
  display: block;
  font-size: 10px;
  color: var(--node-text-dim, #6b7280);
  margin-bottom: 4px;
}

.params-section {
  margin-top: 8px;
}

.params-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.no-params {
  font-size: 11px;
  color: var(--node-text-dim, #6b7280);
  text-align: center;
  padding: 4px 0;
}

.param-item {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
  align-items: center;
}

.param-item .el-input {
  flex: 1;
}
</style>
