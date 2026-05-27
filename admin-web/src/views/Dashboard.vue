<template>
  <div class="dashboard">
    <el-row :gutter="16" class="stats-row">
      <el-col
        v-for="card in statCards"
        :key="card.label"
        :xs="24"
        :sm="12"
        :md="8"
        :lg="6"
      >
        <el-card class="stat-card" @click="handleStatCardClick(card)">
          <div class="stat-content">
            <div class="stat-icon" :style="{ background: card.color }">
              <el-icon :size="24">
                <component :is="card.icon" />
              </el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ card.label }}</div>
              <div class="stat-value">{{ card.value }}</div>
              <div v-if="card.note" class="stat-note">{{ card.note }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近订单</span>
            </div>
          </template>
          <el-table :data="recentOrders" style="width: 100%">
            <el-table-column prop="id" label="订单号" width="132">
              <template #default="{ row }">
                {{ formatOrderId(row.id) }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amountTotal" label="金额" width="110" align="right">
              <template #default="{ row }">
                {{ formatCurrency(row.amountTotal) }}
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="下单时间">
              <template #default="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>生产批次</span>
            </div>
          </template>
          <el-table :data="recentBatches" style="width: 100%">
            <el-table-column prop="id" label="批次ID" width="120" />
            <el-table-column prop="productionDate" label="生产日期" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getBatchStatusType(row.status)">
                  {{ getBatchStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="totalProductionG" label="产量(g)" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Box,
  Calendar,
  CircleCheck,
  Clock,
  ForkSpoon,
  List,
  Money,
  Service,
  ShoppingCart,
  Van
} from '@element-plus/icons-vue'
import { productionApi } from '@/api'
import { orderApi } from '@/api/orders'
import { OrderStatus } from '@/types/order'
import type { OrderListItem, OrderStats } from '@/types/order'

type DashboardCard = {
  label: string
  value: string | number
  icon: any
  color: string
  note?: string
  route?: {
    path: string
    query?: Record<string, string>
  }
}

const router = useRouter()
const stats = ref<OrderStats>({
  total: 0,
  todayNew: 0,
  paidRevenue: 0,
  pendingPayment: 0,
  paid: 0,
  purchasing: 0,
  inProduction: 0,
  freezing: 0,
  shipped: 0,
  completed: 0,
  cancelled: 0,
  aftersale: 0
})

const recentOrders = ref<OrderListItem[]>([])
const recentBatches = ref<any[]>([])

const statCards = computed<DashboardCard[]>(() => [
  {
    label: '总订单数',
    value: stats.value.total,
    icon: List,
    color: '#409eff',
    route: {
      path: '/orders'
    }
  },
  {
    label: '今日新增订单',
    value: stats.value.todayNew,
    icon: Calendar,
    color: '#00a870',
    route: {
      path: '/orders',
      query: getTodayOrderQuery()
    }
  },
  {
    label: '已付款订单金额',
    value: formatCurrency(stats.value.paidRevenue),
    icon: Money,
    color: '#67c23a',
    note: '未扣除售后退款',
    route: {
      path: '/orders',
      query: {
        status: [
          OrderStatus.PAID,
          OrderStatus.PURCHASING,
          OrderStatus.IN_PRODUCTION,
          OrderStatus.FREEZING,
          OrderStatus.SHIPPED,
          OrderStatus.COMPLETED,
          OrderStatus.AFTERSALE
        ].join(',')
      }
    }
  },
  {
    label: '待付款',
    value: stats.value.pendingPayment,
    icon: Clock,
    color: '#e6a23c',
    route: {
      path: '/orders',
      query: { status: OrderStatus.PENDING_PAYMENT }
    }
  },
  {
    label: '待采购',
    value: stats.value.paid,
    icon: ShoppingCart,
    color: '#7c3aed',
    route: {
      path: '/orders',
      query: { status: OrderStatus.PAID }
    }
  },
  {
    label: '采购中',
    value: stats.value.purchasing,
    icon: Box,
    color: '#0f766e',
    route: {
      path: '/orders',
      query: { status: OrderStatus.PURCHASING }
    }
  },
  {
    label: '制作中',
    value: stats.value.inProduction,
    icon: ForkSpoon,
    color: '#f97316',
    route: {
      path: '/orders',
      query: { status: OrderStatus.IN_PRODUCTION }
    }
  },
  {
    label: '急冻中',
    value: stats.value.freezing,
    icon: Box,
    color: '#2563eb',
    route: {
      path: '/orders',
      query: { status: OrderStatus.FREEZING }
    }
  },
  {
    label: '待收货',
    value: stats.value.shipped,
    icon: Van,
    color: '#0ea5e9',
    route: {
      path: '/orders',
      query: { status: OrderStatus.SHIPPED }
    }
  },
  {
    label: '已完成',
    value: stats.value.completed,
    icon: CircleCheck,
    color: '#16a34a',
    route: {
      path: '/orders',
      query: { status: OrderStatus.COMPLETED }
    }
  },
  {
    label: '售后中',
    value: stats.value.aftersale,
    icon: Service,
    color: '#dc2626',
    route: {
      path: '/aftersale'
    }
  }
])

function getTodayOrderQuery() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const date = `${yyyy}-${mm}-${dd}`

  return {
    startDate: date,
    endDate: date
  }
}

function handleStatCardClick(card: DashboardCard) {
  if (!card.route) return
  router.push(card.route)
}

const getStatusType = (status: string): '' | 'success' | 'warning' | 'info' | 'danger' | 'primary' | undefined => {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    INIT: 'info',
    PENDING_PAYMENT: 'warning',
    PAID: 'success',
    PURCHASING: 'primary',
    IN_PRODUCTION: 'primary',
    FREEZING: 'primary',
    SHIPPED: 'info',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    AFTERSALE: 'warning'
  }
  return typeMap[status]
}

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    INIT: '订单创建',
    PENDING_PAYMENT: '待付款',
    PAID: '待采购',
    PURCHASING: '采购中',
    IN_PRODUCTION: '制作中',
    FREEZING: '急冻中',
    SHIPPED: '待收货',
    COMPLETED: '已收货',
    CANCELLED: '已取消',
    AFTERSALE: '售后中'
  }
  return textMap[status] || status
}

const getBatchStatusType = (status: string): '' | 'success' | 'warning' | 'info' | 'danger' | 'primary' | undefined => {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    PLANNED: 'info',
    IN_PRODUCTION: 'warning',
    COMPLETED: 'success'
  }
  return typeMap[status]
}

const getBatchStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    PLANNED: '待生产',
    IN_PRODUCTION: '生产中',
    COMPLETED: '已完成'
  }
  return textMap[status] || status
}

const formatCurrency = (value: number | string | null | undefined) => {
  return `¥${Number(value || 0).toFixed(2)}`
}

const formatOrderId = (id: string) => {
  if (!id) return ''
  return id.length > 12 ? `${id.slice(0, 8)}...` : id
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const loadData = async () => {
  try {
    const [orderStats, ordersData, batchesData] = await Promise.all([
      orderApi.getStats(),
      orderApi.list({ page: 1, pageSize: 5 }),
      productionApi.getBatches()
    ])

    stats.value = {
      ...stats.value,
      ...orderStats
    }
    recentOrders.value = ordersData.list || []
    recentBatches.value = batchesData.slice(0, 5)
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stats-row {
  row-gap: 16px;
}

.stat-card {
  cursor: pointer;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 72px;
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex: 0 0 auto;
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 8px;
  line-height: 1.2;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
  word-break: break-all;
}

.stat-note {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.2;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
