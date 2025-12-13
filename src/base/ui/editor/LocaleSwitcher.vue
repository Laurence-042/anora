<script setup lang="ts">
/**
 * LocaleSwitcher - 语言切换组件
 */
import { useI18n } from 'vue-i18n'
import { availableLocales, setLocale, type LocaleType } from '@/locales'

const { locale } = useI18n()

function switchLocale(code: LocaleType): void {
  setLocale(code)
}
</script>

<template>
  <div class="locale-switcher">
    <button
      v-for="loc in availableLocales"
      :key="loc.code"
      class="locale-btn"
      :class="{ active: locale === loc.code }"
      @click="switchLocale(loc.code)"
      :title="loc.name"
    >
      {{ loc.code === 'zh-CN' ? '中' : 'EN' }}
    </button>
  </div>
</template>

<style scoped>
.locale-switcher {
  display: flex;
  align-items: center;
  gap: 4px;
}

.locale-btn {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--vf-border, #3a3a5c);
  border-radius: 4px;
  color: var(--vf-text-muted, #94a3b8);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.2s;
}

.locale-btn:hover {
  background: var(--vf-btn-hover-bg, #252542);
  color: var(--vf-text, #e2e8f0);
}

.locale-btn.active {
  background: var(--vf-accent, #6366f1);
  border-color: var(--vf-accent, #6366f1);
  color: white;
}
</style>
