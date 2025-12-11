import './assets/main.css'
import './assets/node-theme.css'
import 'element-plus/dist/index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'

import App from './App.vue'
import router from './router'

// 先导入 mods，触发所有 mod 注册到 ModRegistry
// 这样 i18n 才能获取到所有 mod 的 locale
import '@/mods'

// 然后创建 i18n（会从 ModRegistry 获取 locale）
import i18n from './locales'

// 初始化所有 mods（调用 init 函数注册视图等）
import { initAllMods } from './mods'
initAllMods()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(i18n)

app.mount('#app')
