<script setup lang="ts">
/**
 * Breadcrumb - 子图导航面包屑
 * 显示当前子图层级路径，支持点击导航
 */
import { computed } from 'vue'
import { useGraphStore } from '@/stores/graph'

const graphStore = useGraphStore()

/** 面包屑路径 */
const breadcrumbPath = computed(() => graphStore.breadcrumbPath)

/** 导航到指定层级 */
function navigateTo(index: number): void {
  graphStore.navigateToLevel(index)
}

/** 返回上一级 */
function goBack(): void {
  graphStore.exitSubGraph()
}

/** 是否可以返回 */
const canGoBack = computed(() => graphStore.subGraphStack.length > 0)
</script>

<template>
  <div class="breadcrumb">
    <!-- 返回按钮 -->
    <button v-if="canGoBack" class="back-btn" @click="goBack" title="返回上一级 (Backspace)">
      ←
    </button>

    <!-- 路径项 -->
    <div class="breadcrumb-items">
      <template v-for="(item, index) in breadcrumbPath" :key="index">
        <button
          class="breadcrumb-item"
          :class="{ 'item-current': index === breadcrumbPath.length - 1 }"
          @click="navigateTo(index)"
        >
          {{ item.label }}
        </button>
        <span v-if="index < breadcrumbPath.length - 1" class="separator">/</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--vf-breadcrumb-bg, #1a1a2e);
  border-radius: 8px;
}

.back-btn {
  padding: 4px 8px;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text, #e2e8f0);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}

.breadcrumb-items {
  display: flex;
  align-items: center;
  gap: 4px;
}

.breadcrumb-item {
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--vf-text-muted, #94a3b8);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.breadcrumb-item:hover {
  background: var(--vf-btn-hover-bg, #252542);
  color: var(--vf-text, #e2e8f0);
}

.breadcrumb-item.item-current {
  color: var(--vf-text, #e2e8f0);
  font-weight: 600;
  cursor: default;
}

.breadcrumb-item.item-current:hover {
  background: transparent;
}

.separator {
  color: var(--vf-text-muted, #6b7280);
  font-size: 12px;
}
</style>
