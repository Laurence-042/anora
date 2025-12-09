<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
/* 全局样式变量 - ANORA 主题 */
:root {
  /* 背景色 */
  --vf-bg: #0f0f1a;
  --vf-toolbar-bg: #1a1a2e;
  --vf-statusbar-bg: #1a1a2e;
  --vf-controls-bg: #1a1a2e;
  --vf-breadcrumb-bg: #1a1a2e;
  --vf-minimap-bg: #1a1a2e;

  /* 节点颜色 */
  --vf-node-bg: #1a1a2e;
  --vf-node-header-bg: #252542;
  --vf-node-border: #3a3a5c;

  /* 文字颜色 */
  --vf-text: #e2e8f0;
  --vf-text-muted: #94a3b8;
  --vf-node-text: #e2e8f0;
  --vf-node-text-muted: #6b7280;

  /* 边框和按钮 */
  --vf-border: #3a3a5c;
  --vf-btn-bg: #252542;
  --vf-btn-hover-bg: #3a3a5c;
  --vf-input-bg: #252542;

  /* 边颜色 */
  --vf-edge: #64748b;
  --vf-edge-selected: #60a5fa;
  --vf-connection-line: #60a5fa;
}

/* 全局重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#app {
  width: 100%;
  height: 100%;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
