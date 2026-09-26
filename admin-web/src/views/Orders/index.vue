<template>
  <div class="orders-page">
    <!--
      鲜食与补剂是两条独立的履约链路，操作差异大，所以用标签页分开而不是混在一张表里；
      默认停在鲜食订单，保持原来的使用习惯不变。
    -->
    <el-tabs v-model="activeTab" class="order-type-tabs">
      <el-tab-pane name="fresh">
        <template #label><span class="order-type-tab-label">鲜食订单</span></template>
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
                <el-badge
                  v-if="wechatShippingPending.pendingCount > 0"
                  :value="wechatShippingPending.pendingCount > 99 ? '99+' : wechatShippingPending.pendingCount"
                >
                  <el-button
                    type="warning"
                    :icon="RefreshRight"
                    :loading="wechatShippingRetrying"
                    @click="handleRetryPendingWechatShipping"
                  >
                    一键重试微信发货同步
                  </el-button>
                </el-badge>
                <el-button
                  v-else
                  type="success"
                  plain
                  :icon="CircleCheck"
                  :loading="wechatShippingLoading"
                  @click="loadWechatShippingPending"
                >
                  微信发货同步正常
                </el-button>
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

          <el-alert
            v-if="wechatShippingPending.pendingCount > 0"
            class="wechat-shipping-alert"
            type="warning"
            show-icon
            :closable="false"
          >
            <template #title>
              有 {{ wechatShippingPending.pendingCount }} 笔微信支付已发货订单需要同步或重试发货信息
            </template>
            <template #default>
              系统发货时会自动上传；这里仅处理自动上传失败、历史订单未记录等异常情况。
            </template>
          </el-alert>

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
                <el-option label="试吃装" :value="OrderTypeEnum.TASTING_PACK" />
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
                <el-tag :type="getStatusType(row)">
                  {{ getStatusText(row) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column prop="type" label="类型" width="90">
              <template #default="{ row }">
                <el-tag :type="orderTypeTagType(row.type)" size="small">
                  {{ orderTypeLabel(row.type, true) }}
                </el-tag>
                <!-- 免费补发单：0 元补寄，别被当成"又卖了一单" -->
                <el-tag
                  v-if="row.reshipFromOrderId"
                  type="warning"
                  size="small"
                  class="reship-tag"
                >
                  补发
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

            <el-table-column label="操作" width="300" fixed="right">
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
                <el-button
                  v-if="isWechatShippingPending(row.id)"
                  type="warning"
                  size="small"
                  plain
                  :loading="wechatShippingRetrying"
                  @click="handleRetrySingleWechatShipping(row)"
                >
                  重试同步
                </el-button>
                <!-- 试吃装是现货：出问题不用重做，直接从成品库存再寄一份 -->
                <el-button
                  v-if="canReshipOrder(row)"
                  type="warning"
                  size="small"
                  plain
                  @click="handleReship(row)"
                >
                  免费补发
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

        <!-- 免费补发对话框（试吃装现货专用） -->
        <reship-dialog
          v-model="reshipDialogVisible"
          :order-id="currentOrder?.id"
          :original-sets="reshipOriginalSets"
          @submit="handleReshipSubmit"
        />

        <!-- 确认收款对话框 -->
        <confirm-payment-dialog
          v-model="confirmPaymentDialogVisible"
          :order="currentOrder"
          @submit="handleConfirmPaymentSubmit"
        />
      </el-tab-pane>

      <!--
        补剂订单直接复用补剂商城的现成页面组件，避免两处各维护一套补剂订单逻辑；
        lazy 让它在第一次切到该标签时才加载，不拖慢鲜食订单的打开速度。
      -->
      <el-tab-pane name="supplement" lazy>
        <template #label><span class="order-type-tab-label">补剂订单</span></template>
        <supplement-orders-panel embedded />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import {
  orderTypeLabel,
  orderTypeTagType,
} from './orderType';

import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Document,
  Clock,
  Setting,
  Box,
  Van,
  CircleCheck,
  Download,
  RefreshRight,
  Search
} from '@element-plus/icons-vue'
import OrderStatCard from './components/OrderStatCard.vue'
import CancelDialog from './components/CancelDialog.vue'
import ShippingDialog from './components/ShippingDialog.vue'
import ConfirmPaymentDialog from './components/ConfirmPaymentDialog.vue'
import ReshipDialog from './components/ReshipDialog.vue'
import SupplementOrdersPanel from '@/views/SupplementShop/components/SupplementOrdersPanel.vue'
import { orderApi } from '@/api/orders'
import { OrderStatus, OrderType } from '@/types/order'
import type {
  OrderListItem,
  OrderStats,
  WechatShippingUploadPendingSummary
} from '@/types/order'
import { formatDateTime, formatDate } from '@/utils/date'

// 使枚举在模板中可用
const OrderStatusEnum = OrderStatus
const OrderTypeEnum = OrderType

const router = useRouter()
const route = useRoute()

// 顶层标签页：鲜食订单（默认，保持原行为）/ 补剂订单（复用补剂商城组件）
type OrderBusinessTab = 'fresh' | 'supplement'
const SUPPLEMENT_TAB: OrderBusinessTab = 'supplement'

const normalizeQueryValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return String(value[0] || '')
  }
  return typeof value === 'string' ? value : ''
}

// 标签状态存进 URL：补剂订单里的「打印标签」是独立路由，返回时组件会重建，
// 只靠内存状态会掉回鲜食标签，用户会以为自己点错了地方。
const activeTab = ref<OrderBusinessTab>(
  normalizeQueryValue(route.query.tab) === SUPPLEMENT_TAB ? SUPPLEMENT_TAB : 'fresh'
)

watch(activeTab, (tab) => {
  const nextTabValue = tab === SUPPLEMENT_TAB ? SUPPLEMENT_TAB : ''
  if (normalizeQueryValue(route.query.tab) === nextTabValue) return

  // 用 replace 而不是 push：切标签不该在浏览器历史里堆出一串记录，
  // 否则用户在补剂标签里连点几次后会退不出去。
  const query = { ...route.query }
  if (nextTabValue) {
    query.tab = nextTabValue
  } else {
    delete query.tab
  }
  router.replace({ path: route.path, query })
})

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
const wechatShippingLoading = ref(false)
const wechatShippingRetrying = ref(false)
const wechatShippingPending = ref<WechatShippingUploadPendingSummary>({
  pendingCount: 0,
  candidates: []
})

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
  { label: '已取消/退款', value: OrderStatusEnum.CANCELLED }
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
const loadWechatShippingPending = async () => {
  wechatShippingLoading.value = true
  try {
    wechatShippingPending.value = await orderApi.getWechatShippingUploadPending()
  } catch (error) {
    console.error('加载微信发货同步状态失败:', error)
  } finally {
    wechatShippingLoading.value = false
  }
}

const isWechatShippingPending = (orderId: string) => {
  return wechatShippingPending.value.candidates.some((item) => item.orderId === orderId)
}

const handleRetryPendingWechatShipping = async () => {
  if (wechatShippingPending.value.pendingCount <= 0) {
    await loadWechatShippingPending()
    return
  }

  try {
    await ElMessageBox.confirm(
      `系统会重新上传 ${wechatShippingPending.value.pendingCount} 笔微信支付已发货订单的发货信息。正常发货会自动上传，这里只处理异常或历史漏传记录。确认继续吗？`,
      '一键重试微信发货同步',
      {
        type: 'warning',
        confirmButtonText: '确认重试',
        cancelButtonText: '取消'
      }
    )
  } catch (error) {
    return
  }

  wechatShippingRetrying.value = true
  try {
    const result = await orderApi.retryPendingWechatShippingUploads()
    if (result.failed > 0) {
      ElMessage.warning(`已处理 ${result.total} 笔，成功 ${result.success} 笔，失败 ${result.failed} 笔`)
    } else {
      ElMessage.success(`微信发货同步完成，成功 ${result.success} 笔`)
    }
    await loadWechatShippingPending()
    loadOrders()
  } catch (error: any) {
    ElMessage.error(error?.message || '微信发货同步重试失败')
  } finally {
    wechatShippingRetrying.value = false
  }
}

const handleRetrySingleWechatShipping = async (order: OrderListItem) => {
  wechatShippingRetrying.value = true
  try {
    const result = await orderApi.uploadWechatShippingInfo(order.id)
    if (result.success && !result.skipped) {
      ElMessage.success(result.message || '微信发货信息已同步')
    } else {
      ElMessage.warning(result.message || '微信发货信息未同步成功')
    }
    await loadWechatShippingPending()
  } catch (error: any) {
    ElMessage.error(error?.message || '微信发货同步失败')
  } finally {
    wechatShippingRetrying.value = false
  }
}

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
    loadWechatShippingPending()
  } catch (error) {
    ElMessage.error('取消订单失败')
  }
}

// 发货
const handleShip = (order: OrderListItem) => {
  currentOrder.value = order
  shippingDialogVisible.value = true
}

// 免费补发（试吃装现货）：只对已付款之后的现货单开放
const reshipDialogVisible = ref(false)
const reshipOriginalSets = ref(1)

/**
 * 原单套数：按"每套袋数 = 菜品数 × 每道菜袋数"反推。
 * 试吃装订单明细的 recipeSnapshot 里存着这两个值，拿不到时退回 1。
 */
const resolveOriginalSets = (order: OrderListItem): number => {
  const item: any = (order as any).items?.[0]
  const snapshot = item?.recipeSnapshot
  const dishCount = Array.isArray(snapshot?.dishes) ? snapshot.dishes.length : 0
  const bagsPerRecipe = Number(snapshot?.bagsPerRecipe)
  const packageCount = Number(item?.packageCount)
  if (dishCount > 0 && bagsPerRecipe > 0 && packageCount > 0) {
    return Math.max(1, Math.round(packageCount / (dishCount * bagsPerRecipe)))
  }
  return 1
}

const canReshipOrder = (order: OrderListItem): boolean => {
  if ((order as any).type !== OrderType.TASTING_PACK) return false
  // 现货付款即可发货，所以 PAID / SHIPPED / COMPLETED 都还能补发；取消的不行
  return ['PAID', 'SHIPPED', 'COMPLETED'].includes(order.status)
}

const handleReship = (order: OrderListItem) => {
  currentOrder.value = order
  reshipOriginalSets.value = resolveOriginalSets(order)
  reshipDialogVisible.value = true
}

const handleReshipSubmit = async (data: { sets: number; reason: string }) => {
  if (!currentOrder.value) return

  try {
    const reship = await orderApi.reshipOrder(currentOrder.value.id, data)
    ElMessage.success(
      `已生成 0 元补发单 ${reship?.orderNo || ''}，扣减 ${data.sets} 套库存，接下来正常发货即可`
    )
    reshipDialogVisible.value = false
    loadOrders()
    loadStats()
  } catch (error: any) {
    ElMessage.error(error.message || '补发失败')
  }
}

// 发货提交
const handleShippingSubmit = async (data: { carrierCode: string; trackingNumber: string }) => {
  if (!currentOrder.value) return

  try {
    await orderApi.ship(currentOrder.value.id, data)
    ElMessage.success('发货成功')
    loadOrders()
    loadStats()
    loadWechatShippingPending()
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
const getStatusType = (orderOrStatus: OrderListItem | OrderStatus) => {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string' && isRefundedOrder(orderOrStatus)) return 'success'
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
const getStatusText = (orderOrStatus: OrderListItem | OrderStatus) => {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string' && isRefundedOrder(orderOrStatus)) {
    return '已退款（钱款原路退回）'
  }
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

const isRefundedOrder = (order: OrderListItem) => {
  return order.status === OrderStatusEnum.CANCELLED && order.refundStatus?.success === true
}

onMounted(() => {
  applyRouteFilters()
  loadOrders()
  loadStats()
  loadWechatShippingPending()
})
</script>

<style scoped>
.orders-page {
  padding: 0;
}

/* 补剂标签里还套了一层状态标签，把外层压得更醒目一些，避免两层标签看起来一样重。
   类名挂在标签文字上而不是用 :deep 命中所有 .el-tabs__item，否则里层那套也会被改粗 */
/* 补发标记：紧跟在类型标签后面，颜色区分开，避免看成同一个标签 */
.reship-tag {
  margin-left: 4px;
}

.order-type-tab-label {
  font-size: 15px;
  font-weight: 600;
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
  align-items: center;
  gap: 10px;
}

.wechat-shipping-alert {
  margin-bottom: 16px;
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
