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
            <el-tag :type="getStatusType(order)">
              {{ getStatusText(order) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间" :span="2">
            {{ formatTime(order.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="目标生产日期">
            {{ order.targetProductionDate ? formatDate(order.targetProductionDate) : '未设置' }}
          </el-descriptions-item>
          <el-descriptions-item label="支付方式">
            {{ getPaymentMethodText(order.paymentMethod) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.cancelledAt" label="取消时间" :span="2">
            {{ formatTime(order.cancelledAt) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.cancellationReason" :label="isRefundedOrder(order) ? '退款说明' : '取消原因'" :span="2">
            {{ order.cancellationReason }}
          </el-descriptions-item>
          <el-descriptions-item v-if="order.cancelledBy" label="取消操作者">
            {{ getCancelledByText(order.cancelledBy) }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card class="info-card" shadow="never">
        <template #header>
          <div class="card-header-with-action">
            <span class="card-title">管理员备注</span>
            <div class="remark-actions">
              <el-button
                :disabled="savingRemark || !remarkDraft.trim()"
                @click="handleClearRemark"
              >
                清空
              </el-button>
              <el-button
                type="primary"
                :loading="savingRemark"
                :disabled="!isRemarkDirty"
                @click="handleSaveRemark"
              >
                保存备注
              </el-button>
            </div>
          </div>
        </template>
        <el-input
          v-model="remarkDraft"
          type="textarea"
          :rows="4"
          maxlength="200"
          show-word-limit
          resize="vertical"
          placeholder="填写给生产制作单的内部备注，例如分装要求、制作顺序、特殊提醒"
        />
        <div class="remark-hint">该备注仅供内部使用，会同步到生产制作单和打印版。</div>
      </el-card>

      <!-- 客户和狗狗信息 -->
      <el-card class="info-card" shadow="never">
        <template #header>
          <span class="card-title">客户和收货信息</span>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="客户">
            {{ getCustomerName() }}
          </el-descriptions-item>
          <el-descriptions-item label="联系电话">
            {{ getCustomerPhone() }}
          </el-descriptions-item>
          <el-descriptions-item label="狗狗">
            {{ getDogSummary() }}
          </el-descriptions-item>
          <el-descriptions-item label="收货地址">
            {{ getAddressText() }}
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
            {{ getPaymentMethodText(order.paymentMethod) }}
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
            <el-button
              v-if="canUploadWechatShipping"
              type="warning"
              size="small"
              :loading="wechatShippingUploading"
              @click="handleUploadWechatShipping"
            >
              补传微信发货信息
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
          <el-table-column label="狗狗" width="120">
            <template #default="{ row }">
              {{ row.dog?.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="recipeSnapshot.name" label="食谱名称" width="200" />
          <el-table-column label="版本号" width="80">
            <template #default="{ row }">
              {{ row.recipeSnapshot.version ? `v${row.recipeSnapshot.version}` : '-' }}
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

      <!-- 财务结算 -->
      <el-card class="info-card" shadow="never">
        <template #header>
          <div class="card-header-with-action">
            <span class="card-title">财务结算</span>
            <div class="financial-actions">
              <el-button size="small" @click="openAdjustmentDialog">
                新增调整
              </el-button>
              <el-button
                size="small"
                :loading="financialLoading"
                @click="loadFinancialSummary"
              >
                刷新
              </el-button>
            </div>
          </div>
        </template>

        <el-skeleton v-if="financialLoading && !financialSummary" :rows="4" animated />
        <template v-else-if="financialSummary">
          <el-alert
            v-if="financialSummary.settlementStatus === 'PENDING'"
            title="该订单尚未完成生产成本结算，实际成本和差价建议会在生产批次完成后生成。"
            type="info"
            :closable="false"
            class="financial-alert"
          />
          <el-alert
            v-else-if="getPendingAdjustmentAmount(financialSummary.adjustmentSummary) !== 0"
            :title="getPendingAdjustmentText(financialSummary.adjustmentSummary)"
            :type="getPendingAdjustmentTagType(financialSummary.adjustmentSummary)"
            :closable="false"
            class="financial-alert"
          />
          <el-alert
            v-if="financialSummary.refundStatus"
            :title="financialSummary.refundStatus.statusText"
            :type="financialSummary.refundStatus.success ? 'success' : 'warning'"
            :closable="false"
            class="financial-alert"
          />

          <el-descriptions :column="2" border>
            <el-descriptions-item label="结算状态">
              <el-tag :type="financialSummary.settlementStatus === 'SETTLED' ? 'success' : 'info'">
                {{ financialSummary.settlementStatus === 'SETTLED' ? '已结算' : '待结算' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="订单收入">
              {{ formatFinancialAmount(financialSummary.revenue) }}
            </el-descriptions-item>
            <el-descriptions-item label="预计成本">
              {{ formatFinancialAmount(financialSummary.estimatedCost) }}
            </el-descriptions-item>
            <el-descriptions-item label="预计毛利">
              {{ formatFinancialAmount(financialSummary.estimatedMargin) }}
            </el-descriptions-item>
            <el-descriptions-item label="实际成本">
              {{ formatFinancialAmount(financialSummary.actualCost) }}
            </el-descriptions-item>
            <el-descriptions-item label="实际毛利">
              {{ formatFinancialAmount(financialSummary.actualMargin) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="financialSummary.refundStatus" label="退款状态" :span="2">
              <el-tag :type="financialSummary.refundStatus.success ? 'success' : 'warning'">
                {{ financialSummary.refundStatus.statusText }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="financialSummary.refundStatus" label="退款单号">
              {{ financialSummary.refundStatus.outRefundNo || '-' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="financialSummary.refundStatus" label="退款金额">
              {{ formatFinancialAmount(financialSummary.refundStatus.amount) }}
            </el-descriptions-item>
            <el-descriptions-item label="差价建议">
              <el-tag :type="getAdjustmentTagType(financialSummary.shortageAdjustmentAmount)">
                {{ getAdjustmentText(financialSummary.shortageAdjustmentAmount) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="需要补收">
              <el-tag :type="financialSummary.requiresCustomerPayment ? 'danger' : 'success'">
                {{ financialSummary.requiresCustomerPayment ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="待补差价">
              {{ formatFinancialAmount(financialSummary.adjustmentSummary?.pendingExtraPaymentAmount) }}
            </el-descriptions-item>
            <el-descriptions-item label="待退差价">
              {{ formatFinancialAmount(financialSummary.adjustmentSummary?.pendingRefundAmount) }}
            </el-descriptions-item>
            <el-descriptions-item label="净收入">
              {{ formatFinancialAmount(financialSummary.netRevenue) }}
            </el-descriptions-item>
            <template v-if="financialSummary.latestSettlement">
              <el-descriptions-item label="生产批次">
                {{ financialSummary.latestSettlement.productionBatchId }}
              </el-descriptions-item>
              <el-descriptions-item label="结算时间">
                {{
                  financialSummary.latestSettlement.settledAt
                    ? formatTime(financialSummary.latestSettlement.settledAt)
                    : '-'
                }}
              </el-descriptions-item>
              <el-descriptions-item label="计划成品">
                {{ financialSummary.latestSettlement.plannedOutputG }}g
              </el-descriptions-item>
              <el-descriptions-item label="实际成品">
                {{ financialSummary.latestSettlement.actualOutputG }}g
              </el-descriptions-item>
              <el-descriptions-item label="成品缺口">
                {{ financialSummary.latestSettlement.shortageG }}g
              </el-descriptions-item>
            </template>
          </el-descriptions>
          <el-table
            v-if="financialSummary.adjustments?.length"
            :data="financialSummary.adjustments"
            class="adjustment-table"
            size="small"
            border
          >
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                {{ getAdjustmentTypeText(row.adjustmentType) }}
              </template>
            </el-table-column>
            <el-table-column label="金额" width="120">
              <template #default="{ row }">
                {{ formatFinancialAmount(row.amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="原因" min-width="180" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getAdjustmentStatusType(row.status)">
                  {{ getAdjustmentStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="顾客可见" width="95">
              <template #default="{ row }">
                {{ row.visibleToCustomer ? '是' : '否' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'PENDING'"
                  link
                  type="success"
                  @click="updateAdjustmentStatus(row, 'SETTLED')"
                >
                  标记已处理
                </el-button>
                <el-button
                  v-if="row.status === 'PENDING'"
                  link
                  type="danger"
                  @click="updateAdjustmentStatus(row, 'CANCELLED')"
                >
                  取消
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
        <el-empty v-else description="暂无财务结算数据" />
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
            <el-button
              v-if="canUploadWechatShipping"
              type="warning"
              :loading="wechatShippingUploading"
              @click="handleUploadWechatShipping"
            >
              补传微信发货信息
            </el-button>
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

    <el-dialog
      v-model="adjustmentDialogVisible"
      title="新增结算调整"
      width="520px"
    >
      <el-form label-width="110px">
        <el-form-item label="调整金额">
          <el-input-number
            v-model="adjustmentForm.amount"
            :precision="2"
            :step="1"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="调整类型">
          <el-select v-model="adjustmentForm.adjustmentType">
            <el-option label="补收差价" value="EXTRA_PAYMENT" />
            <el-option label="退款/退差价" value="REFUND" />
            <el-option label="人工优惠" value="DISCOUNT" />
            <el-option label="人工修正" value="MANUAL_CORRECTION" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因">
          <el-input
            v-model="adjustmentForm.reason"
            maxlength="200"
            show-word-limit
            placeholder="例如补收定制分装差价、退生产缺口差价"
          />
        </el-form-item>
        <el-form-item label="顾客可见">
          <el-switch v-model="adjustmentForm.visibleToCustomer" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustmentDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="savingAdjustment"
          @click="submitAdjustment"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
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
import { formatDateTime, formatDate } from '@/utils/date'
import type {
  Order,
  CancelledBy,
  OrderHistory,
  OrderFinancialSummary,
  OrderSettlementAdjustment,
  RecipeSnapshot
} from '@/types/order'
import {
  formatFinancialAmount,
  getAdjustmentTagType,
  getAdjustmentText,
  getPendingAdjustmentAmount,
  getPendingAdjustmentTagType,
  getPendingAdjustmentText
} from './orderFinancialSummary'

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
const financialSummary = ref<OrderFinancialSummary | null>(null)
const financialLoading = ref(false)
const remarkDraft = ref('')
const savingRemark = ref(false)
const wechatShippingUploading = ref(false)
const adjustmentDialogVisible = ref(false)
const savingAdjustment = ref(false)
const adjustmentForm = reactive({
  amount: 0,
  adjustmentType: 'EXTRA_PAYMENT' as
    | 'REFUND'
    | 'EXTRA_PAYMENT'
    | 'DISCOUNT'
    | 'MANUAL_CORRECTION',
  reason: '',
  visibleToCustomer: true
})

// 对话框
const cancelDialogVisible = ref(false)
const shippingDialogVisible = ref(false)
const confirmPaymentDialogVisible = ref(false)
const snapshotDialogVisible = ref(false)
const currentSnapshot = ref<RecipeSnapshot | undefined>(undefined)
const normalizedRemarkDraft = computed(() => remarkDraft.value.trim())
const isRemarkDirty = computed(() => {
  const currentRemark = (order.value?.adminRemark ?? '').trim()
  return normalizedRemarkDraft.value !== currentRemark
})

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
    remarkDraft.value = data.adminRemark || ''
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

const loadFinancialSummary = async () => {
  financialLoading.value = true
  try {
    financialSummary.value = await orderApi.getFinancialSummary(orderId.value)
  } catch (error) {
    console.error('加载订单财务结算失败:', error)
    financialSummary.value = null
    ElMessage.error('加载订单财务结算失败')
  } finally {
    financialLoading.value = false
  }
}

const openAdjustmentDialog = () => {
  adjustmentForm.amount = 0
  adjustmentForm.adjustmentType = 'EXTRA_PAYMENT'
  adjustmentForm.reason = ''
  adjustmentForm.visibleToCustomer = true
  adjustmentDialogVisible.value = true
}

const submitAdjustment = async () => {
  if (!adjustmentForm.amount) {
    ElMessage.warning('调整金额不能为0')
    return
  }
  if (!adjustmentForm.reason.trim()) {
    ElMessage.warning('请填写调整原因')
    return
  }

  savingAdjustment.value = true
  try {
    await orderApi.createSettlementAdjustment(orderId.value, {
      amount: adjustmentForm.amount,
      adjustmentType: adjustmentForm.adjustmentType,
      reason: adjustmentForm.reason.trim(),
      visibleToCustomer: adjustmentForm.visibleToCustomer
    })
    ElMessage.success('结算调整已创建')
    adjustmentDialogVisible.value = false
    await loadFinancialSummary()
  } catch (error: any) {
    ElMessage.error(error.message || '创建结算调整失败')
  } finally {
    savingAdjustment.value = false
  }
}

const updateAdjustmentStatus = async (
  adjustment: OrderSettlementAdjustment,
  status: 'SETTLED' | 'CANCELLED'
) => {
  try {
    await orderApi.updateSettlementAdjustmentStatus(orderId.value, adjustment.id, {
      status
    })
    ElMessage.success(status === 'SETTLED' ? '已标记处理完成' : '已取消调整')
    await loadFinancialSummary()
  } catch (error: any) {
    ElMessage.error(error.message || '更新结算调整失败')
  }
}

const getAdjustmentTypeText = (type: string) => {
  const textMap: Record<string, string> = {
    REFUND: '退款/退差价',
    EXTRA_PAYMENT: '补收差价',
    DISCOUNT: '人工优惠',
    MANUAL_CORRECTION: '人工修正'
  }
  return textMap[type] || type
}

const getAdjustmentStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    PENDING: '待处理',
    SETTLED: '已处理',
    CANCELLED: '已取消'
  }
  return textMap[status] || status
}

const getAdjustmentStatusType = (status: string) => {
  if (status === 'SETTLED') return 'success'
  if (status === 'CANCELLED') return 'info'
  return 'warning'
}

// 获取进度条激活步骤
const getStepActive = () => {
  if (!order.value) return 0

  const status = order.value.status

  if (status === OrderStatusEnum.COMPLETED) return 4
  if (status === OrderStatusEnum.SHIPPED) return 3
  if (status === OrderStatusEnum.FREEZING) return 2
  if (
    [
      OrderStatusEnum.IN_PRODUCTION,
      OrderStatusEnum.PURCHASING
    ].includes(status)
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

  if (status === OrderStatusEnum.PURCHASING) return '采购中'
  if (status === OrderStatusEnum.IN_PRODUCTION) return '生产中'
  if (status === OrderStatusEnum.FREEZING) return '急冻中'

  return ''
}

// 返回
const goBack = () => {
  router.back()
}

// 格式化时间
const formatTime = (time: string | Date) => formatDateTime(time)

// 获取状态类型
const getStatusType = (orderOrStatus: Order | OrderStatus) => {
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

// 获取状态文本
const getStatusText = (orderOrStatus: Order | OrderStatus) => {
  const status = typeof orderOrStatus === 'string' ? orderOrStatus : orderOrStatus.status
  if (typeof orderOrStatus !== 'string' && isRefundedOrder(orderOrStatus)) {
    return '已退款（钱款原路退回）'
  }
  const textMap: Record<string, string> = {
    INIT: '订单创建',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    PURCHASING: '采购中',
    IN_PRODUCTION: '生产中',
    FREEZING: '急冻中待发货',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    AFTERSALE: '售后中'
  }
  return textMap[status] || status
}

const isRefundedOrder = (currentOrder: Order) => {
  return currentOrder.status === OrderStatusEnum.CANCELLED && currentOrder.refundStatus?.success === true
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

const getPaymentMethodText = (method?: string | null) => {
  if (!method) return '-'
  const map: Record<string, string> = {
    WECHAT_PAY: '微信支付',
    WECHAT: '微信支付',
    OFFLINE: '线下支付',
    CASH: '现金',
    BANK_TRANSFER: '银行转账'
  }
  return map[method] || method
}

const getCustomerName = () => {
  return order.value?.address?.recipientName || '未记录'
}

const getCustomerPhone = () => {
  return order.value?.address?.phone || '未记录'
}

const getAddressText = () => {
  const address = order.value?.address
  if (!address) return '未记录'

  const region = address.regionText || [
    address.region?.province,
    address.region?.city,
    address.region?.district
  ].filter(Boolean).join(' ')

  return [region, address.detailAddress].filter(Boolean).join(' ') || '未记录'
}

const getDogSummary = () => {
  const dogNames = (order.value?.items || [])
    .map((item) => item.dog?.name)
    .filter(Boolean)

  if (dogNames.length > 0) {
    return Array.from(new Set(dogNames)).join('、')
  }

  return '未记录'
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

const canUploadWechatShipping = computed(() => {
  return Boolean(
    order.value &&
      order.value.status === OrderStatusEnum.SHIPPED &&
      order.value.trackingNumber &&
      order.value.carrierCode &&
      order.value.paymentMethod === 'WECHAT_PAY'
  )
})

// 发货
const handleShip = () => {
  shippingDialogVisible.value = true
}

// 发货提交
const handleShippingSubmit = async (data: { carrierCode: string; trackingNumber: string }) => {
  try {
    await orderApi.ship(orderId.value, data)
    try {
      const result = await orderApi.uploadWechatShippingInfo(orderId.value)
      if (result.success) {
        ElMessage.success('发货成功，微信发货信息已上传')
      } else {
        ElMessage.warning(`发货成功，但微信发货信息未上传：${result.message}`)
      }
    } catch (uploadError: any) {
      ElMessage.warning(uploadError?.message || '发货成功，但微信发货信息上传失败')
    }
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

const handleUploadWechatShipping = async () => {
  if (!order.value) return

  try {
    await ElMessageBox.confirm(
      '将把该订单的物流公司、运单号、收货手机号等发货信息补传给微信公众平台，用于微信订单结算校验。确认补传吗？',
      '补传微信发货信息',
      {
        type: 'warning',
        confirmButtonText: '确认补传',
        cancelButtonText: '取消'
      }
    )
  } catch (error) {
    return
  }

  wechatShippingUploading.value = true
  try {
    const result = await orderApi.uploadWechatShippingInfo(order.value.id)
    if (result.success) {
      ElMessage.success(result.message || '微信发货信息已补传')
    } else {
      ElMessage.warning(result.message || '微信发货信息补传未成功，请检查订单和支付配置')
    }
    loadHistory()
  } catch (error: any) {
    ElMessage.error(error?.message || '补传失败')
  } finally {
    wechatShippingUploading.value = false
  }
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

const handleSaveRemark = async () => {
  if (!isRemarkDirty.value) return

  savingRemark.value = true
  try {
    const updatedOrder = await orderApi.updateRemark(orderId.value, {
      adminRemark: normalizedRemarkDraft.value || null
    })
    order.value = updatedOrder
    remarkDraft.value = updatedOrder.adminRemark || ''
    ElMessage.success('备注已保存')
  } catch (error: any) {
    ElMessage.error(error.message || '保存备注失败')
  } finally {
    savingRemark.value = false
  }
}

const handleClearRemark = async () => {
  if (!remarkDraft.value.trim()) return

  try {
    await ElMessageBox.confirm('确认清空管理员备注？', '提示', {
      type: 'warning'
    })
    remarkDraft.value = ''
    await handleSaveRemark()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '清空备注失败')
    }
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
  loadFinancialSummary()
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

.financial-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.adjustment-table {
  margin-top: 16px;
}

.remark-actions {
  display: flex;
  gap: 12px;
}

.remark-hint {
  margin-top: 10px;
  font-size: 13px;
  color: #909399;
}

.financial-alert {
  margin-bottom: 16px;
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
