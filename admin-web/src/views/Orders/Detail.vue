<template>
  <div class="order-detail-page">
    <el-page-header @back="goBack" title="返回">
      <template #content>
        <span class="page-title">订单详情 #{{ orderId }}</span>
      </template>
    </el-page-header>

    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="10" animated />
    </div>

    <div v-else-if="order" class="detail-content">
      <!-- 订单状态进度条 -->
      <el-card class="status-card" shadow="never">
        <el-steps :active="getStepActive()" align-center finish-status="success">
          <el-step title="已付款" :description="order.paidAt ? formatTime(order.paidAt) : ''" />
          <el-step title="生产中" :description="getProductionDescription()" />
          <el-step title="急冻中待发货" />
          <el-step
            title="已发货"
            :description="order.shippedAt ? formatTime(order.shippedAt) : ''"
          />
          <el-step
            title="已完成"
            :description="order.completedAt ? formatTime(order.completedAt) : ''"
          />
        </el-steps>
      </el-card>

      <!-- 基本信息 -->
      <el-card class="info-card" shadow="never">
        <template #header>
          <span class="card-title">基本信息</span>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号" :span="2">
            {{ order.id }}
          </el-descriptions-item>
          <el-descriptions-item label="订单类型">
            <el-tag :type="order.type === OrderTypeEnum.FRESH_FOOD ? 'success' : 'warning'">
              {{ order.type === OrderTypeEnum.FRESH_FOOD ? '鲜食制作' : '定制服务' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="订单状态">
            <el-tag :type="getStatusType(order.status)">
              {{ getStatusText(order.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间" :span="2">
            {{ formatTime(order.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="目标生产日期">
            {{ order.targetProductionDate ? formatDate(order.targetProductionDate) : '未设置' }}
          </el-descriptions-item>
          <el-descriptions-item label="支付方式">
            {{ order.paymentMethod || '-' }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.cancelledAt" label="取消时间" :span="2">
            {{ formatTime(order.cancelledAt) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.cancellationReason" label="取消原因" :span="2">
            {{ order.cancellationReason }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.cancelledBy" label="取消操作者">
            {{ getCancelledByText(order.cancelledBy) }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 客户和狗狗信息 -->
      <el-card class="info-card" shadow="never">
        <template #header>
          <span class="card-title">客户和狗狗信息</span>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="客户ID">
            {{ order.customerId }}
          </el-descriptions-item>
          <el-descriptions-item label="狗狗ID">
            {{ order.dogId || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="收货地址ID">
            {{ order.addressId || '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 支付信息 -->
      <el-card v-if="order.paidAt" class="info-card" shadow="never">
        <template #header>
          <span class="card-title">支付信息</span>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="支付方式">
            {{ order.paymentMethod || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="支付状态">
            <el-tag
              :type="order.paymentStatus === PaymentStatusEnum.SUCCESS ? 'success' : 'warning'"
            >
              {{ getPaymentStatusText(order.paymentStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="交易单号" :span="2">
            {{ order.transactionId || '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 物流信息 -->
      <el-card v-if="order.shippedAt" class="info-card" shadow="never">
        <template #header>
          <div class="card-header-with-action">
            <span class="card-title">物流信息</span>
            <el-button
              v-if="canEditShipping"
              type="primary"
              size="small"
              @click="handleEditShipping"
            >
              修改物流信息
            </el-button>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="快递公司">
            {{ getCarrierName(order.carrierCode) }}
          </el-descriptions-item>
          <el-descriptions-item label="物流单号">
            {{ order.trackingNumber || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="发货时间" :span="2">
            {{ order.shippedAt ? formatTime(order.shippedAt) : '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 商品信息 -->
      <el-card class="info-card" shadow="never">
        <template #header>
          <span class="card-title">商品信息</span>
        </template>
        <el-table :data="order.items" style="width: 100%">
          <el-table-column prop="recipeSnapshot.name" label="食谱名称" width="200" />
          <el-table-column label="版本号" width="80">
            <template #default="{ row }">
              v{{ row.recipeSnapshot.version }}
            </template>
          </el-table-column>
          <el-table-column prop="quantityG" label="总净重" width="100">
            <template #default="{ row }">
              {{ row.quantityG }}g
            </template>
          </el-table-column>
          <el-table-column prop="packageCount" label="包装数量" width="100">
            <template #default="{ row }">
              {{ row.packageCount }}袋
            </template>
          </el-table-column>
          <el-table-column prop="packageSpecG" label="每袋规格" width="100">
            <template #default="{ row }">
              {{ row.packageSpecG }}g
            </template>
          </el-table-column>
          <el-table-column prop="dailyIntakeG" label="日摄入" width="100">
            <template #default="{ row }">
              {{ row.dailyIntakeG }}g
            </template>
          </el-table-column>
          <el-table-column label="定制要求" width="150">
            <template #default="{ row }">
              {{ row.customRequirements || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button
                type="primary"
                size="small"
                link
                @click="handleViewSnapshot(row.recipeSnapshot)"
              >
                查看快照
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 价格明细 -->
      <el-card v-if="order.pricingBreakdownSnapshot" class="info-card" shadow="never">
        <template #header>
          <span class="card-title">价格明细</span>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="原料成本">
            ¥{{ order.pricingBreakdownSnapshot.costIngredients.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="包装成本">
            ¥{{ order.pricingBreakdownSnapshot.costPackaging.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="人工成本">
            ¥{{ order.pricingBreakdownSnapshot.costLabor.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="分摊费用">
            ¥{{ order.pricingBreakdownSnapshot.costOverhead.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="总成本">
            ¥{{ order.pricingBreakdownSnapshot.totalProductCost.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="产品价格">
            ¥{{ order.pricingBreakdownSnapshot.productPrice.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="运费">
            ¥{{ order.pricingBreakdownSnapshot.shippingFee.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="订单总价">
            <span class="total-price">
              ¥{{ order.pricingBreakdownSnapshot.totalPrice.toFixed(2) }}
            </span>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 操作记录 -->
      <el-card class="info-card" shadow="never">
        <template #header>
          <span class="card-title">操作记录</span>
        </template>
        <order-timeline v-if="orderHistory.length > 0" :history="orderHistory" />
        <el-empty v-else description="暂无操作记录" />
      </el-card>

      <!-- 操作按钮区域 -->
      <el-card class="action-card" shadow="never">
        <div class="action-buttons">
          <!-- PENDING_PAYMENT状态：管理员确认收款或取消订单 -->
          <template v-if="order.status === OrderStatusEnum.PENDING_PAYMENT">
            <el-button type="success" @click="handleConfirmPayment">确认收款</el-button>
            <el-button type="danger" @click="handleCancelOrder">取消订单</el-button>
            <el-alert
              title="等待用户完成线下支付后，点击确认收款按钮"
              type="info"
              :closable="false"
              style="margin-top: 10px"
            />
          </template>

          <!-- PAID状态：管理员可以取消订单（等待生产批次系统自动处理） -->
          <template v-if="order.status === OrderStatusEnum.PAID">
            <el-button type="danger" @click="handleCancelOrder">取消订单</el-button>
            <el-alert
              title="生产批次系统将自动处理此订单"
              type="info"
              :closable="false"
              style="margin-top: 10px"
            />
          </template>

          <!-- 内部生产状态（PURCHASING, IN_PRODUCTION, FREEZING） -->
          <!-- 生产批次系统自动流转，管理员无需操作 -->
          <template
            v-else-if="
              order.status === OrderStatusEnum.PURCHASING ||
              order.status === OrderStatusEnum.IN_PRODUCTION
            "
          >
            <el-button type="danger" @click="handleCancelOrder">取消订单</el-button>
            <el-alert
              title="订单正在生产批次系统中自动流转"
              type="info"
              :closable="false"
              style="margin-top: 10px"
            />
          </template>

          <!-- FREEZING状态：可以发货 -->
          <template v-else-if="order.status === OrderStatusEnum.FREEZING">
            <el-button type="primary" @click="handleShip">发货</el-button>
            <el-button type="danger" @click="handleCancelOrder">取消订单</el-button>
          </template>

          <!-- SHIPPED状态：确认收货 -->
          <template v-else-if="order.status === OrderStatusEnum.SHIPPED">
            <el-button type="success" @click="handleComplete">确认收货</el-button>
          </template>

          <!-- COMPLETED状态 -->
          <template v-else-if="order.status === OrderStatusEnum.COMPLETED">
            <el-button disabled>订单已完成</el-button>
          </template>

          <!-- CANCELLED状态 -->
          <template v-else-if="order.status === OrderStatusEnum.CANCELLED">
            <el-button disabled>订单已取消</el-button>
          </template>
        </div>
      </el-card>
    </div>

    <!-- 对话框组件 -->
    <cancel-dialog
      v-model="cancelDialogVisible"
      :order-id="order?.id"
      @submit="handleCancelSubmit"
    />

    <shipping-dialog
      v-model="shippingDialogVisible"
      :order-id="order?.id"
      @submit="handleShippingSubmit"
    />

    <!-- 确认收款对话框 -->
    <confirm-payment-dialog
      v-model="confirmPaymentDialogVisible"
      :order="order"
      @submit="handleConfirmPaymentSubmit"
    />

    <recipe-snapshot-dialog
      v-model="snapshotDialogVisible"
      :snapshot="currentSnapshot"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import OrderTimeline from './components/OrderTimeline.vue'
import CancelDialog from './components/CancelDialog.vue'
import ShippingDialog from './components/ShippingDialog.vue'
import ConfirmPaymentDialog from './components/ConfirmPaymentDialog.vue'
import RecipeSnapshotDialog from './components/RecipeSnapshotDialog.vue'
import { orderApi } from '@/api/orders'
import {
  OrderStatus,
  OrderType,
  PaymentStatus
} from '@/types/order'
import type {
  Order,
  CancelledBy,
  OrderHistory,
  RecipeSnapshot
} from '@/types/order'

// 使枚举在模板中可用
const OrderStatusEnum = OrderStatus
const OrderTypeEnum = OrderType
const PaymentStatusEnum = PaymentStatus

const route = useRoute()
const router = useRouter()

const orderId = computed(() => route.params.id as string)

const loading = ref(false)
const order = ref<Order | null>(null)
const orderHistory = ref<OrderHistory[]>([])

// 对话框
const cancelDialogVisible = ref(false)
const shippingDialogVisible = ref(false)
const confirmPaymentDialogVisible = ref(false)
const snapshotDialogVisible = ref(false)
const currentSnapshot = ref<RecipeSnapshot | undefined>(undefined)

// 快递公司配置
const carriers: Record<string, string> = {
  SF: '顺丰速运',
  YTO: '圆通速递',
  STO: '申通快递',
  ZTO: '中通快递',
  YD: '韵达速递',
  EMS: 'EMS',
  JD: '京东快递',
  POSTB: '邮政包裹'
}

// 加载订单详情
const loadOrder = async () => {
  loading.value = true
  try {
    const data = await orderApi.getDetail(orderId.value)
    order.value = data
  } catch (error) {
    ElMessage.error('加载订单详情失败')
  } finally {
    loading.value = false
  }
}

// 加载订单历史
const loadHistory = async () => {
  try {
    const data = await orderApi.getHistory(orderId.value)
    orderHistory.value = data
  } catch (error) {
    console.error('加载订单历史失败:', error)
  }
}

// 获取进度条激活步骤
const getStepActive = () => {
  if (!order.value) return 0

  const status = order.value.status

  if (status === OrderStatusEnum.COMPLETED) return 4
  if (status === OrderStatusEnum.SHIPPED) return 3
  if (
    status === OrderStatusEnum.FREEZING ||
    status === OrderStatusEnum.IN_PRODUCTION ||
    status === OrderStatusEnum.PURCHASING
  ) {
    return 1
  }
  if (status === OrderStatusEnum.PAID) return 0
  // INIT 和 PENDING_PAYMENT 状态对管理员来说几乎看不到，也显示为已完成第一步
  if (status === OrderStatusEnum.PENDING_PAYMENT || status === OrderStatusEnum.INIT) return 0

  return 0
}

// 获取生产阶段的详细描述
const getProductionDescription = () => {
  if (!order.value) return ''

  const status = order.value.status

  if (status === OrderStatusEnum.PURCHASING) return '待采购'
  if (status === OrderStatusEnum.IN_PRODUCTION) return '生产中'
  if (status === OrderStatusEnum.FREEZING) return '急冻中待发货'

  return ''
}

// 返回
const goBack = () => {
  router.back()
}

// 格式化时间
const formatTime = (time: string | null | undefined) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

const formatDate = (date: string | null | undefined) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('zh-CN')
}

// 获取状态类型
const getStatusType = (status: OrderStatus) => {
  const typeMap: Record<OrderStatus, any> = {
    INIT: 'info',
    PENDING_PAYMENT: 'warning',
    PAID: 'success',
    PURCHASING: 'primary',
    IN_PRODUCTION: 'primary',
    FREEZING: 'warning',
    SHIPPED: 'info',
    COMPLETED: 'success',
    CANCELLED: 'danger',
    AFTERSALE: 'danger'
  }
  return typeMap[status] || ''
}

// 获取状态文本
const getStatusText = (status: OrderStatus) => {
  const textMap: Record<OrderStatus, string> = {
    INIT: '订单创建',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    PURCHASING: '待采购',
    IN_PRODUCTION: '生产中',
    FREEZING: '急冻中待发货',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中'
  }
  return textMap[status] || status
}

// 获取支付状态文本
const getPaymentStatusText = (status?: PaymentStatus) => {
  if (!status) return '-'
  const map = {
    [PaymentStatus.PENDING]: '待支付',
    [PaymentStatus.SUCCESS]: '支付成功',
    [PaymentStatus.FAILED]: '支付失败'
  }
  return map[status] || status
}

// 获取取消操作者文本
const getCancelledByText = (by?: CancelledBy) => {
  if (!by) return '-'
  const map = {
    customer: '客户',
    admin: '管理员',
    system: '系统'
  }
  return map[by] || by
}

// 获取快递公司名称
const getCarrierName = (code?: string) => {
  if (!code) return '-'
  return carriers[code] || code
}

// 是否可以编辑物流信息
const canEditShipping = computed(() => {
  return order.value?.status === OrderStatusEnum.SHIPPED
})

// 发货
const handleShip = () => {
  shippingDialogVisible.value = true
}

// 发货提交
const handleShippingSubmit = async (data: { carrierCode: string; trackingNumber: string }) => {
  try {
    await orderApi.ship(orderId.value, data)
    ElMessage.success('发货成功')
    loadOrder()
    loadHistory()
  } catch (error) {
    ElMessage.error('发货失败')
  }
}

// 编辑物流信息
const handleEditShipping = () => {
  shippingDialogVisible.value = true
}

// 完成订单
const handleComplete = async () => {
  try {
    await ElMessageBox.confirm('确认订单已完成？', '确认操作', {
      type: 'warning'
    })
    await orderApi.complete(orderId.value)
    ElMessage.success('操作成功')
    loadOrder()
    loadHistory()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败')
    }
  }
}

// 取消订单
const handleCancelOrder = () => {
  cancelDialogVisible.value = true
}

// 取消订单提交
const handleCancelSubmit = async (reason: string) => {
  try {
    await orderApi.cancel(orderId.value, { reason })
    ElMessage.success('订单已取消')
    loadOrder()
    loadHistory()
  } catch (error) {
    ElMessage.error('取消订单失败')
  }
}

// 确认收款
const handleConfirmPayment = () => {
  confirmPaymentDialogVisible.value = true
}

// 确认收款提交
const handleConfirmPaymentSubmit = async (data: { actualAmount?: number }) => {
  try {
    await orderApi.confirmOfflinePayment(orderId.value, data)
    ElMessage.success('确认收款成功')
    confirmPaymentDialogVisible.value = false
    loadOrder()
    loadHistory()
  } catch (error: any) {
    ElMessage.error(error.message || '确认收款失败')
  }
}

// 查看食谱快照
const handleViewSnapshot = (snapshot: RecipeSnapshot) => {
  currentSnapshot.value = snapshot
  snapshotDialogVisible.value = true
}

onMounted(() => {
  loadOrder()
  loadHistory()
})
</script>

<style scoped>
.order-detail-page {
  padding: 0;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.loading-container {
  padding: 40px 0;
}

.detail-content {
  margin-top: 20px;
}

.status-card {
  margin-bottom: 20px;
}

.info-card {
  margin-bottom: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-header-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total-price {
  font-size: 16px;
  font-weight: bold;
  color: #f56c6c;
}

.action-card {
  margin-bottom: 20px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

:deep(.el-descriptions) {
  margin: 0;
}

:deep(.el-page-header__content) {
  display: flex;
  align-items: center;
}
</style>
