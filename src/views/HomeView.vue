<script setup lang="ts">
// HomeView - 首页
</script>

<template>
  <main class="home-view">
    <h1>ANORA</h1>
    <p>Visual Node-Based Programming Environment</p>
    <router-link to="/editor" class="enter-btn">进入编辑器</router-link>
  </main>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
}

.home-view h1 {
  font-size: 3rem;
  font-weight: 700;
  color: var(--vf-text, #e2e8f0);
}

.home-view p {
  color: var(--vf-text-muted, #94a3b8);
}

.enter-btn {
  margin-top: 2rem;
  padding: 0.75rem 2rem;
  background: var(--vf-btn-bg, #252542);
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 6px;
  color: var(--vf-text, #e2e8f0);
  text-decoration: none;
  transition: background 0.2s;
}

.enter-btn:hover {
  background: var(--vf-btn-hover-bg, #3a3a5c);
}
</style>
