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
        path: 'users',
        name: 'Users',
        component: () => import('@/views/Users/index.vue'),
        meta: { title: '用户管理' }
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
        component: () => import('@/views/Recipes/index.vue'),
        meta: { title: '食谱管理' }
      },
      {
        path: 'recipes/create',
        name: 'RecipeCreate',
        component: () => import('@/views/Recipes/RecipeForm.vue'),
        meta: { title: '新建食谱' }
      },
      {
        path: 'recipes/:id',
        name: 'RecipeDetail',
        component: () => import('@/views/Recipes/RecipeForm.vue'),
        meta: { title: '查看食谱' }
      },
      {
        path: 'recipes/:id/edit',
        name: 'RecipeEdit',
        component: () => import('@/views/Recipes/RecipeForm.vue'),
        meta: { title: '编辑食谱' }
      },
      {
        path: 'reviews',
        name: 'Reviews',
        component: () => import('@/views/Reviews/index.vue'),
        meta: { title: '评价管理' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/Orders/index.vue'),
        meta: { title: '订单管理' }
      },
      {
        path: 'orders/:id',
        name: 'OrderDetail',
        component: () => import('@/views/Orders/Detail.vue'),
        meta: { title: '订单详情' }
      },
      {
        path: 'aftersale',
        name: 'AftersaleManagement',
        component: () => import('@/views/Aftersale/AftersaleManagement.vue'),
        meta: { title: '售后工单' }
      },
      {
        path: 'refunds',
        name: 'RefundManagement',
        component: () => import('@/views/Aftersale/RefundManagement.vue'),
        meta: { title: '退款管理' }
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
      },
      {
        path: 'global-config',
        name: 'GlobalConfig',
        component: () => import('@/views/GlobalConfig.vue'),
        meta: { title: '全局配置' }
      },
      {
        path: 'payment-config',
        name: 'PaymentConfig',
        component: () => import('@/views/PaymentConfig.vue'),
        meta: { title: '支付配置' }
      },
      {
        path: 'customer-service-config',
        name: 'CustomerServiceConfig',
        component: () => import('@/views/CustomerServiceConfig.vue'),
        meta: { title: '客服配置' }
      },
      {
        path: 'customer-service',
        name: 'CustomerServiceConversations',
        component: () => import('@/views/CustomerServiceConversations.vue'),
        meta: { title: '客服会话' }
      },
      {
        path: 'purchasing',
        name: 'Purchasing',
        redirect: '/purchasing/lists',
        meta: { title: '采购管理' },
        children: [
          {
            path: 'lists',
            name: 'PurchaseLists',
            component: () => import('@/views/Purchasing/PurchaseLists.vue'),
            meta: { title: '采购单管理' }
          },
          {
            path: 'reimbursements',
            name: 'ReimbursementList',
            component: () => import('@/views/Purchasing/ReimbursementList.vue'),
            meta: { title: '报销管理' }
          },
          {
            path: 'reimbursements/detail',
            name: 'ReimbursementDetail',
            component: () => import('@/views/Purchasing/ReimbursementDetail.vue'),
            meta: { title: '报销单详情' }
          },
          {
            path: 'history',
            name: 'PurchaseHistory',
            component: () => import('@/views/Purchasing/PurchaseHistory.vue'),
            meta: { title: '采购历史' }
          }
        ]
      },
      {
        path: 'finance',
        name: 'Finance',
        redirect: '/finance/overview',
        meta: { title: '财务中心' },
        children: [
          {
            path: 'overview',
            name: 'FinanceOverview',
            component: () => import('@/views/Finance/Overview.vue'),
            meta: { title: '财务总览' }
          },
          {
            path: 'expense-bills',
            name: 'FinanceExpenseBills',
            component: () => import('@/views/Finance/ExpenseBills.vue'),
            meta: { title: '费用与待支付' }
          },
          {
            path: 'expense-analysis',
            name: 'FinanceExpenseAnalysis',
            component: () => import('@/views/Finance/ExpenseAnalysis.vue'),
            meta: { title: '费用分析' }
          },
          {
            path: 'contribution-analysis',
            name: 'FinanceContributionAnalysis',
            component: () => import('@/views/Finance/ContributionAnalysis.vue'),
            meta: { title: '经营贡献分析' }
          }
        ]
      },
      {
        path: 'custom-recipes',
        name: 'CustomRecipes',
        component: () => import('@/views/CustomRecipes/OrderList.vue'),
        meta: { title: '定制食谱订单' }
      },
      {
        path: 'analytics/dog-profile',
        name: 'DogProfileAnalytics',
        component: () => import('@/views/Analytics/DogProfileAnalytics.vue'),
        meta: { title: '狗档案转化分析' }
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
