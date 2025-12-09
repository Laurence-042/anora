import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 导入所有 mods，触发装饰器注册
import './mods'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
