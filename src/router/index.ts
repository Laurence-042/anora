import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'editor',
      component: () => import('../views/EditorView.vue'),
    },
    {
      path: '/editor',
      redirect: '/',
    },
    {
      path: '/demo',
      name: 'demo',
      component: () => import('../views/ReplayView.vue'),
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
  ],
})

export default router
