import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '仪表盘' }
      },
      {
        path: 'dogs',
        name: 'Dogs',
        component: () => import('@/views/Dogs/index.vue'),
        meta: { title: '档案管理' }
      },
      {
        path: 'dogs/create',
        name: 'DogCreate',
        component: () => import('@/views/Dogs/DogDetail.vue'),
        meta: { title: '新增档案' }
      },
      {
        path: 'dogs/:id',
        name: 'DogDetail',
        component: () => import('@/views/Dogs/DogDetail.vue'),
        meta: { title: '档案详情' }
      },
      {
        path: 'dogs/:id/edit',
        name: 'DogEdit',
        component: () => import('@/views/Dogs/DogDetail.vue'),
        meta: { title: '编辑档案' }
      },
      {
        path: 'breeds',
        name: 'Breeds',
        component: () => import('@/views/Breeds/index.vue'),
        meta: { title: '品种管理' }
      },
      {
        path: 'ingredients',
        name: 'Ingredients',
        component: () => import('@/views/Ingredients/index.vue'),
        meta: { title: '原料管理' }
      },
      {
        path: 'ingredient-tags',
        name: 'IngredientTags',
        component: () => import('@/views/IngredientTags/index.vue'),
        meta: { title: '原料标签管理' }
      },
      {
        path: 'recipes',
        name: 'Recipes',
        component: () => import('@/views/Recipes.vue'),
        meta: { title: '食谱管理' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/Orders.vue'),
        meta: { title: '订单管理' }
      },
      {
        path: 'orders/:id',
        name: 'OrderDetail',
        component: () => import('@/views/OrderDetail.vue'),
        meta: { title: '订单详情' }
      },
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('@/views/Inventory.vue'),
        meta: { title: '库存管理' }
      },
      {
        path: 'production',
        name: 'Production',
        component: () => import('@/views/Production.vue'),
        meta: { title: '生产管理' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard for authentication
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('admin_token')
  const requiresAuth = to.meta.requiresAuth !== false

  if (requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
