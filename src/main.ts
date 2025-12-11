import './assets/main.css'
import './assets/node-theme.css'
import 'element-plus/dist/index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'

import App from './App.vue'
import router from './router'
import i18n from './locales'

// 导入并初始化所有 mods（触发装饰器注册 + UI 视图注册）
import { initAllMods } from './mods'
initAllMods()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(i18n)

app.mount('#app')
