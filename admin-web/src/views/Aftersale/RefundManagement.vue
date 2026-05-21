<template>
  <div class="refund-management">
    <div class="page-header">
      <div>
        <h2>退款管理</h2>
        <p>集中审核客户退款申请，并保留已退款记录。</p>
      </div>
      <el-button type="primary" :loading="loading" @click="loadRefunds">刷新</el-button>
    </div>

    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">退款记录</div>
          <div class="stat-value">{{ refunds.length }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">微信支付</div>
          <div class="stat-value accent">{{ wechatRefundCount }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="table-card" shadow="never">
      <el-table :data="refunds" v-loading="loading" stripe>
        <el-table-column prop="id" label="订单号" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">
            <router-link class="order-link" :to="`/orders/${row.id}`">{{ row.id }}</router-link>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="150">
          <template #default="{ row }">
            <div class="stack">
              <span class="primary-text">{{ getCustomerName(row) }}</span>
              <span class="muted-text">{{ getCustomerPhone(row) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="订单内容" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ getOrderItemsSummary(row) }}</template>
        </el-table-column>
        <el-table-column label="支付方式" width="110">
          <template #default="{ row }">{{ getPaymentMethodText(row.paymentMethod) }}</template>
        </el-table-column>
        <el-table-column label="订单金额" width="120" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.amountTotal) }}</template>
        </el-table-column>
        <el-table-column prop="aftersaleReason" label="退款理由" min-width="230" show-overflow-tooltip />
        <el-table-column label="状态" width="150">
          <template #default="{ row }">
            <el-tag :type="canReviewRefund(row) ? 'warning' : 'success'">
              {{ canReviewRefund(row) ? '待审核' : '已退款（钱款原路退回）' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">{{ formatTime(row.aftersaleSince) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <template v-if="canReviewRefund(row)">
              <el-button size="small" type="primary" @click="openReview(row, 'approve')">审核</el-button>
              <el-button size="small" @click="openReview(row, 'reject')">驳回</el-button>
            </template>
            <el-button v-else-if="canRetryWechatRefund(row)" size="small" type="warning" @click="retryWechatRefund(row)">
              补发退款
            </el-button>
            <span v-else class="muted-text">已处理</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="reviewDialogVisible"
      :title="reviewMode === 'approve' ? '审核通过退款' : '驳回退款申请'"
      width="660px"
      :close-on-click-modal="false"
    >
      <el-form :model="reviewForm" label-width="120px">
        <el-form-item label="订单ID">
          <router-link v-if="currentOrder" class="order-link" :to="`/orders/${currentOrder.id}`">
            {{ currentOrder.id }}
          </router-link>
        </el-form-item>
        <el-form-item label="客户">
          <span>{{ getCustomerName(currentOrder) }} / {{ getCustomerPhone(currentOrder) }}</span>
        </el-form-item>
        <el-form-item label="退款理由">
          <div class="reason-text">{{ currentOrder?.aftersaleReason || '-' }}</div>
        </el-form-item>
        <el-form-item label="订单金额">
          <span>¥{{ formatAmount(currentOrder?.amountTotal) }}</span>
        </el-form-item>

        <template v-if="reviewMode === 'approve'">
          <el-alert
            class="refund-alert"
            type="warning"
            :closable="false"
            show-icon
            title="确认通过后，系统会自动发起微信原路退款；退款受理成功后才会将订单标记为已退款。"
          />
        </template>

        <el-form-item label="审核备注">
          <el-input
            v-model="reviewForm.adminNote"
            type="textarea"
            :rows="4"
            maxlength="300"
            show-word-limit
            :placeholder="reviewMode === 'approve' ? '请输入退款审核备注' : '请输入驳回原因'"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button
          :type="reviewMode === 'approve' ? 'primary' : 'danger'"
          :loading="submitting"
          @click="submitReview"
        >
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { orderApi } from '@/api/orders'
import type { Order } from '@/types/order'

type RefundOrder = Order & {
  aftersaleType?: string
  aftersaleReason?: string
  aftersaleSince?: string | null
}

const loading = ref(false)
const submitting = ref(false)
const refunds = ref<RefundOrder[]>([])
const reviewDialogVisible = ref(false)
const reviewMode = ref<'approve' | 'reject'>('approve')
const currentOrder = ref<RefundOrder | null>(null)

const reviewForm = reactive({
  adminNote: '',
  refundAmount: 0
})

const wechatRefundCount = computed(() => {
  return refunds.value.filter((order) => order.paymentMethod === 'WECHAT_PAY').length
})

onMounted(() => {
  loadRefunds()
})

async function loadRefunds() {
  loading.value = true
  try {
    refunds.value = await orderApi.listRefundAftersales()
  } finally {
    loading.value = false
  }
}

function openReview(row: RefundOrder, mode: 'approve' | 'reject') {
  if (!canReviewRefund(row)) return
  currentOrder.value = row
  reviewMode.value = mode
  reviewForm.adminNote = ''
  reviewForm.refundAmount = Number(row.amountTotal || 0)
  reviewDialogVisible.value = true
}

function canReviewRefund(row: RefundOrder): boolean {
  return row.status === 'AFTERSALE' && row.aftersaleType === 'REFUND'
}

function canRetryWechatRefund(row: RefundOrder): boolean {
  return row.status === 'CANCELLED' && row.paymentMethod === 'WECHAT_PAY'
}

async function retryWechatRefund(row: RefundOrder) {
  submitting.value = true
  try {
    const refund = await orderApi.createWechatRefund(row.id, {
      amount: Number(row.amountTotal || 0),
      reason: row.aftersaleReason || '售后退款补发'
    })
    ElMessage.success(`微信原路退款已发起：${refund.outRefundNo}`)
    await loadRefunds()
  } finally {
    submitting.value = false
  }
}

async function submitReview() {
  if (!currentOrder.value) return
  if (reviewMode.value === 'reject' && !reviewForm.adminNote.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  submitting.value = true
  try {
    await orderApi.resolveAftersale(currentOrder.value.id, {
      resolutionType: reviewMode.value === 'approve' ? 'refunded' : 'resolved',
      adminNote: reviewForm.adminNote.trim() || (reviewMode.value === 'approve' ? '退款审核通过' : '退款申请已驳回')
    })

    ElMessage.success(reviewMode.value === 'approve' ? '退款审核已通过' : '退款申请已驳回')
    reviewDialogVisible.value = false
    await loadRefunds()
  } finally {
    submitting.value = false
  }
}

function getCustomerName(order?: RefundOrder | null): string {
  return order?.address?.recipientName || '未记录客户'
}

function getCustomerPhone(order?: RefundOrder | null): string {
  return order?.address?.phone || '未记录电话'
}

function getOrderItemsSummary(order?: RefundOrder | null): string {
  const items = order?.items || []
  if (items.length === 0) return '未记录商品'
  return items
    .map((item) => {
      const recipeName = item.recipeSnapshot?.name || '未命名食谱'
      const packageText = item.packageCount && item.packageSpecG
        ? `${item.packageCount}袋 x ${item.packageSpecG}g`
        : `${item.quantityG || 0}g`
      return `${recipeName}（${packageText}）`
    })
    .join('；')
}

function getPaymentMethodText(method?: string): string {
  const methodMap: Record<string, string> = {
    WECHAT_PAY: '微信支付',
    WECHAT: '微信支付',
    OFFLINE: '线下支付'
  }
  return methodMap[method || ''] || method || '未记录'
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return '-'
  return new Date(timeStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatAmount(amount?: number | string | null): string {
  return Number(amount || 0).toFixed(2)
}
</script>

<style scoped lang="scss">
.refund-management {
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;

    h2 {
      margin: 0 0 6px;
      font-size: 22px;
      color: #1f2937;
    }

    p {
      margin: 0;
      color: #667085;
      font-size: 14px;
    }
  }

  .stats-row {
    margin-bottom: 16px;
  }

  .stat-card,
  .table-card {
    border-radius: 8px;
  }

  .stat-label {
    color: #667085;
    font-size: 14px;
    margin-bottom: 8px;
  }

  .stat-value {
    color: #dc2626;
    font-size: 28px;
    font-weight: 700;
    line-height: 1;

    &.accent {
      color: #1677ff;
    }
  }

  .order-link {
    color: #1677ff;
    font-weight: 600;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
    line-height: 1.4;
  }

  .primary-text {
    color: #1f2937;
    font-weight: 500;
  }

  .muted-text {
    color: #667085;
    font-size: 12px;
  }

  .reason-text {
    line-height: 1.6;
    white-space: pre-wrap;
    color: #344054;
  }

  .refund-alert {
    margin-bottom: 18px;
  }
}
</style>
