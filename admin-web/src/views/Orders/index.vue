<template>
  <div class="orders-page">
    <!-- 统计卡片区域 -->
    <!-- Phase 9: Simplified statistics aligned with e-commerce standards -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="4">
        <order-stat-card
          label="我的订单"
          :value="stats.total"
          type="primary"
          :icon="Document"
          @click="handleStatCardClick"
        />
      </el-col>
      <el-col :span="4">
        <order-stat-card
          label="已付款"
          :value="stats.paid"
          type="success"
          :icon="CircleCheck"
          @click="handleStatCardClick"
        />
      </el-col>
      <el-col :span="4">
        <order-stat-card
          label="待付款"
          :value="stats.pendingPayment"
          type="warning"
          :icon="Clock"
          @click="handleStatCardClick"
        />
      </el-col>
      <el-col :span="4">
        <order-stat-card
          label="生产中"
          :value="stats.inProduction"
          type="warning"
          :icon="Setting"
          @click="handleStatCardClick"
        />
      </el-col>
      <el-col :span="4">
        <order-stat-card
          label="待收货"
          :value="stats.shipped"
          type="success"
          :icon="Van"
          @click="handleStatCardClick"
        />
      </el-col>
      <el-col :span="4">
        <order-stat-card
          label="已收货"
          :value="stats.completed"
          type="success"
          :icon="CircleCheck"
          @click="handleStatCardClick"
        />
      </el-col>
    </el-row>

    <!-- 订单列表 -->
    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="title">订单列表</span>
          <div class="header-actions">
            <el-button type="primary" :icon="Download" @click="handleExport">
              导出Excel
            </el-button>
          </div>
        </div>
      </template>

      <div class="order-scope-tabs">
        <el-radio-group v-model="activeOrderScope" size="large" @change="handleOrderScopeChange">
          <el-radio-button
            v-for="item in orderScopeOptions"
            :key="item.key"
            :label="item.key"
          >
            <span>{{ item.label }}</span>
            <span class="scope-count">{{ item.count }}</span>
          </el-radio-button>
        </el-radio-group>
      </div>

      <!-- 筛选和搜索区域 -->
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="搜索">
          <el-input
            v-model="filterForm.keyword"
            placeholder="订单号/客户/狗狗/地址"
            clearable
            style="width: 200px"
            @clear="handleSearch"
          >
            <template #append>
              <el-button :icon="Search" @click="handleSearch" />
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            multiple
            collapse-tags
            collapse-tags-tooltip
            style="width: 200px"
            @change="handleFilter"
          >
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="订单类型">
          <el-select
            v-model="filterForm.type"
            placeholder="全部类型"
            clearable
            style="width: 150px"
            @change="handleFilter"
          >
            <el-option label="鲜食制作" :value="OrderTypeEnum.FRESH_FOOD" />
            <el-option label="定制服务" :value="OrderTypeEnum.CUSTOM_SERVICE" />
          </el-select>
        </el-form-item>

        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 240px"
            @change="handleDateChange"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleFilter">筛选</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 订单表格 -->
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="orderList"
        style="width: 100%"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />

        <el-table-column prop="id" label="订单号" width="150" fixed>
          <template #default="{ row }">
            <el-link type="primary" @click="handleViewDetail(row.id)">
              {{ row.id }}
            </el-link>
          </template>
        </el-table-column>

        <el-table-column prop="customerName" label="客户" width="100" />

        <el-table-column label="狗狗" width="100">
          <template #default="{ row }">
            {{ row.firstItem?.dog?.name || '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="type" label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.type === OrderTypeEnum.FRESH_FOOD ? 'success' : 'warning'" size="small">
              {{ row.type === OrderTypeEnum.FRESH_FOOD ? '鲜食' : '定制' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="amountTotal" label="总金额" width="100" align="right">
          <template #default="{ row }">
            ¥{{ Number(row.amountTotal).toFixed(2) }}
          </template>
        </el-table-column>

        <el-table-column label="收货地址" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.address?.regionText }} {{ row.address?.detailAddress }}
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="下单时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="目标生产日期" width="120">
          <template #default="{ row }">
            {{ row.targetProductionDate ? formatDate(row.targetProductionDate) : '-' }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleViewDetail(row.id)">
              详情
            </el-button>
            <el-button
              v-if="row.status === 'PENDING_PAYMENT'"
              type="success"
              size="small"
              @click="handleConfirmPayment(row)"
            >
              确认收款
            </el-button>
            <el-button
              v-if="canCancelOrder(row.status)"
              type="danger"
              size="small"
              @click="handleCancel(row)"
            >
              取消
            </el-button>
            <el-button
              v-if="canShipOrder(row.status)"
              type="success"
              size="small"
              @click="handleShip(row)"
            >
              发货
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end"
        @size-change="handlePageSizeChange"
        @current-change="handlePageChange"
      />
    </el-card>

    <!-- 取消订单对话框 -->
    <cancel-dialog
      v-model="cancelDialogVisible"
      :order-id="currentOrder?.id"
      @submit="handleCancelSubmit"
    />

    <!-- 发货对话框 -->
    <shipping-dialog
      v-model="shippingDialogVisible"
      :order-id="currentOrder?.id"
      @submit="handleShippingSubmit"
    />

    <!-- 确认收款对话框 -->
    <confirm-payment-dialog
      v-model="confirmPaymentDialogVisible"
      :order="currentOrder"
      @submit="handleConfirmPaymentSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Document,
  Clock,
  Setting,
  Box,
  Van,
  CircleCheck,
  Download,
  Search
} from '@element-plus/icons-vue'
import OrderStatCard from './components/OrderStatCard.vue'
import CancelDialog from './components/CancelDialog.vue'
import ShippingDialog from './components/ShippingDialog.vue'
import ConfirmPaymentDialog from './components/ConfirmPaymentDialog.vue'
import { orderApi } from '@/api/orders'
import { OrderStatus, OrderType } from '@/types/order'
import type { OrderListItem, OrderStats } from '@/types/order'
import { formatDateTime, formatDate } from '@/utils/date'

// 使枚举在模板中可用
const OrderStatusEnum = OrderStatus
const OrderTypeEnum = OrderType

const router = useRouter()
const route = useRoute()

// 数据
const loading = ref(false)
const orderList = ref<OrderListItem[]>([])
const selectedOrders = ref<OrderListItem[]>([])

// 统计数据
// Phase 9: Simplified statistics aligned with e-commerce standards
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

// 筛选表单
const filterForm = reactive({
  keyword: '',
  status: [] as OrderStatus[],
  type: undefined as OrderType | undefined,
  startDate: '',
  endDate: ''
})

const dateRange = ref<[string, string] | null>(null)
type OrderScopeKey = 'all' | 'pendingReceive' | 'received' | 'aftersale'
const activeOrderScope = ref<OrderScopeKey>('all')

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 对话框
const cancelDialogVisible = ref(false)
const shippingDialogVisible = ref(false)
const confirmPaymentDialogVisible = ref(false)
const currentOrder = ref<OrderListItem | null>(null)

// 状态选项（仅显示管理员需要关注的状态）
// Phase 9: Simplified status options aligned with e-commerce standards
const statusOptions = [
  { label: '待付款', value: OrderStatusEnum.PENDING_PAYMENT },
  { label: '已付款', value: OrderStatusEnum.PAID },
  { label: '采购中', value: OrderStatusEnum.PURCHASING },
  { label: '生产中', value: OrderStatusEnum.IN_PRODUCTION },
  { label: '急冻中', value: OrderStatusEnum.FREEZING },
  { label: '待收货', value: OrderStatusEnum.SHIPPED },
  { label: '已收货', value: OrderStatusEnum.COMPLETED },
  { label: '售后中', value: OrderStatusEnum.AFTERSALE },
  { label: '已取消', value: OrderStatusEnum.CANCELLED }
]

const orderScopeOptions = computed(() => [
  {
    key: 'all' as const,
    label: '我的订单',
    count: stats.value.total,
    statuses: [] as OrderStatus[]
  },
  {
    key: 'pendingReceive' as const,
    label: '待收货',
    count: stats.value.shipped,
    statuses: [OrderStatusEnum.SHIPPED]
  },
  {
    key: 'received' as const,
    label: '已收货',
    count: stats.value.completed,
    statuses: [OrderStatusEnum.COMPLETED]
  },
  {
    key: 'aftersale' as const,
    label: '售后中',
    count: stats.value.aftersale,
    statuses: [OrderStatusEnum.AFTERSALE]
  }
])

const hasSameStatuses = (left: OrderStatus[], right: OrderStatus[]) => {
  if (left.length !== right.length) return false
  return left.every((status) => right.includes(status))
}

const syncActiveOrderScopeFromStatus = () => {
  const match = orderScopeOptions.value.find((item) =>
    hasSameStatuses(filterForm.status, item.statuses)
  )
  activeOrderScope.value = match?.key || 'all'
}

// 状态卡片点击筛选映射
// Phase 9: Simplified status mapping aligned with e-commerce standards
const statCardStatusMap: Record<string, OrderStatus[]> = {
  '全部订单': [],
  '我的订单': [],
  '已付款': [OrderStatusEnum.PAID],
  '生产中': [
    OrderStatusEnum.PURCHASING,
    OrderStatusEnum.IN_PRODUCTION,
    OrderStatusEnum.FREEZING
  ],
  '已发货': [OrderStatusEnum.SHIPPED],
  '待收货': [OrderStatusEnum.SHIPPED],
  '已完成': [OrderStatusEnum.COMPLETED],
  '已收货': [OrderStatusEnum.COMPLETED],
  '售后中': [OrderStatusEnum.AFTERSALE]
}

const handleOrderScopeChange = (key: OrderScopeKey) => {
  const option = orderScopeOptions.value.find((item) => item.key === key)
  filterForm.status = option ? [...option.statuses] : []
  pagination.page = 1
  loadOrders()
}

const normalizeQueryValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return String(value[0] || '')
  }
  return typeof value === 'string' ? value : ''
}

const applyRouteFilters = () => {
  const statusParam = normalizeQueryValue(route.query.status)
  const startDate = normalizeQueryValue(route.query.startDate)
  const endDate = normalizeQueryValue(route.query.endDate)

  if (statusParam) {
    filterForm.status = statusParam
      .split(',')
      .map((status) => status.trim())
      .filter((status): status is OrderStatus =>
        Object.values(OrderStatusEnum).includes(status as OrderStatus)
      )
  }

  if (startDate || endDate) {
    filterForm.startDate = startDate
    filterForm.endDate = endDate || startDate
    dateRange.value = [filterForm.startDate, filterForm.endDate]
  }

  syncActiveOrderScopeFromStatus()
}

// 加载订单列表
const loadOrders = async () => {
  loading.value = true
  try {
    const params = {
      keyword: filterForm.keyword || undefined,
      status: filterForm.status.length > 0 ? filterForm.status : undefined,
      type: filterForm.type,
      startDate: filterForm.startDate || undefined,
      endDate: filterForm.endDate || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize
    }

    const response = await orderApi.list(params)
    orderList.value = response.list
    pagination.total = response.total
    pagination.page = response.page || pagination.page
    pagination.pageSize = response.pageSize || pagination.pageSize

    if (orderList.value.length === 0 && pagination.total > 0 && pagination.page > 1) {
      pagination.page = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
      await loadOrders()
    }
  } catch (error) {
    ElMessage.error('加载订单列表失败')
  } finally {
    loading.value = false
  }
}

// 加载统计数据
const loadStats = async () => {
  try {
    const data = await orderApi.getStats()
    stats.value = data
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

// 搜索
const handleSearch = () => {
  pagination.page = 1
  loadOrders()
}

const handlePageChange = () => {
  loadOrders()
}

const handlePageSizeChange = () => {
  pagination.page = 1
  loadOrders()
}

// 筛选
const handleFilter = () => {
  syncActiveOrderScopeFromStatus()
  pagination.page = 1
  loadOrders()
}

// 日期范围变化
const handleDateChange = (value: [string, string] | null) => {
  if (value) {
    filterForm.startDate = value[0]
    filterForm.endDate = value[1]
  } else {
    filterForm.startDate = ''
    filterForm.endDate = ''
  }
  handleFilter()
}

// 重置筛选
const handleReset = () => {
  filterForm.keyword = ''
  filterForm.status = []
  filterForm.type = undefined
  filterForm.startDate = ''
  filterForm.endDate = ''
  dateRange.value = null
  activeOrderScope.value = 'all'
  pagination.page = 1
  loadOrders()
}

// 状态卡片点击筛选
const handleStatCardClick = (label: string) => {
  const statuses = statCardStatusMap[label]
  if (statuses) {
    filterForm.status = statuses
    syncActiveOrderScopeFromStatus()
    pagination.page = 1
    loadOrders()
  }
}

// 选择变化
const handleSelectionChange = (selection: OrderListItem[]) => {
  selectedOrders.value = selection
}

// 查看详情
const handleViewDetail = (id: string) => {
  router.push(`/orders/${id}`)
}

// 判断是否可以取消订单
const canCancelOrder = (status: OrderStatus) => {
  return [
    OrderStatusEnum.INIT,
    OrderStatusEnum.PENDING_PAYMENT,
    OrderStatusEnum.PAID,
    OrderStatusEnum.PURCHASING,
    OrderStatusEnum.IN_PRODUCTION,
    OrderStatusEnum.FREEZING
  ].includes(status)
}

// 判断是否可以发货
const canShipOrder = (status: OrderStatus) => {
  return status === OrderStatusEnum.FREEZING
}

// 取消订单
const handleCancel = (order: OrderListItem) => {
  currentOrder.value = order
  cancelDialogVisible.value = true
}

// 取消订单提交
const handleCancelSubmit = async (reason: string) => {
  if (!currentOrder.value) return

  try {
    await orderApi.cancel(currentOrder.value.id, { reason })
    ElMessage.success('订单已取消')
    loadOrders()
    loadStats()
  } catch (error) {
    ElMessage.error('取消订单失败')
  }
}

// 发货
const handleShip = (order: OrderListItem) => {
  currentOrder.value = order
  shippingDialogVisible.value = true
}

// 发货提交
const handleShippingSubmit = async (data: { carrierCode: string; trackingNumber: string }) => {
  if (!currentOrder.value) return

  try {
    await orderApi.ship(currentOrder.value.id, data)
    ElMessage.success('发货成功')
    loadOrders()
    loadStats()
  } catch (error) {
    ElMessage.error('发货失败')
  }
}

// 确认收款
const handleConfirmPayment = (order: OrderListItem) => {
  currentOrder.value = order
  confirmPaymentDialogVisible.value = true
}

// 确认收款提交
const handleConfirmPaymentSubmit = async (data: { actualAmount?: number }) => {
  if (!currentOrder.value) return

  try {
    await orderApi.confirmOfflinePayment(currentOrder.value.id, data)
    ElMessage.success('确认收款成功')
    confirmPaymentDialogVisible.value = false
    loadOrders()
    loadStats()
  } catch (error: any) {
    ElMessage.error(error.message || '确认收款失败')
  }
}

// 导出Excel
const handleExport = async () => {
  try {
    const params = {
      keyword: filterForm.keyword || undefined,
      status: filterForm.status.length > 0 ? filterForm.status : undefined,
      type: filterForm.type,
      startDate: filterForm.startDate || undefined,
      endDate: filterForm.endDate || undefined
    }

    const blob = await orderApi.export(params)

    // 创建下载链接
    const url = window.URL.createObjectURL(blob as any)
    const link = document.createElement('a')
    link.href = url
    link.download = `订单列表_${new Date().getTime()}.xlsx`
    link.click()

    // 清理
    window.URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

// 获取状态类型
// Phase 9: Simplified status types aligned with e-commerce standards
const getStatusType = (status: OrderStatus) => {
  const typeMap: Record<string, any> = {
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
  return typeMap[status] || ''
}

// 获取状态文本（仅显示管理员需要的状态）
// Phase 9: Simplified status text aligned with e-commerce standards
const getStatusText = (status: OrderStatus) => {
  const textMap: Record<string, string> = {
    INIT: '订单创建',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
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

onMounted(() => {
  applyRouteFilters()
  loadOrders()
  loadStats()
})
</script>

<style scoped>
.orders-page {
  padding: 0;
}

.order-scope-tabs {
  margin-bottom: 16px;
}

.order-scope-tabs :deep(.el-radio-button__inner) {
  min-width: 104px;
}

.scope-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  margin-left: 8px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.12);
  color: #409eff;
  font-size: 12px;
  font-weight: 600;
}

:deep(.el-radio-button.is-active .scope-count) {
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
}

.stats-row {
  margin-bottom: 20px;
}

.table-card {
  min-height: calc(100vh - 280px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header .title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.filter-form {
  margin-bottom: 20px;
  padding: 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

:deep(.el-form-item) {
  margin-bottom: 0;
}
</style>
