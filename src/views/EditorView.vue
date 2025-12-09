<script setup lang="ts">
/**
 * EditorView - 图编辑器页面
 * 主要的编辑界面
 */
import GraphEditor from '@/base/ui/editor/GraphEditor.vue'
</script>

<template>
  <div class="editor-view">
    <GraphEditor />
  </div>
</template>

<style scoped>
.editor-view {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
