<template>
  <div class="refund-management">
    <div class="page-header">
      <div>
        <h2>退款管理</h2>
        <p>保存每次微信退款尝试，按微信成功记录确认钱款是否已原路退回。</p>
      </div>
      <el-button type="primary" :loading="loading" @click="loadRefunds">刷新</el-button>
    </div>

    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">退款工单</div>
          <div class="stat-value">{{ refunds.length }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">微信支付</div>
          <div class="stat-value accent">{{ wechatRefundCount }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">待处理/待确认</div>
          <div class="stat-value warning">{{ needsRefundAttentionCount }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">退款成功</div>
          <div class="stat-value success">{{ successRefundCount }}</div>
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
        <el-table-column label="订单金额" width="120" align="right">
          <template #default="{ row }">¥{{ formatAmount(row.amountTotal) }}</template>
        </el-table-column>
        <el-table-column prop="aftersaleReason" label="退款理由" min-width="210" show-overflow-tooltip />
        <el-table-column label="退款状态" width="220">
          <template #default="{ row }">
            <el-tag :type="getRefundTagType(row)">
              {{ getRefundStatusText(row) }}
            </el-tag>
            <div v-if="latestRefundRecord(row)" class="refund-no">
              {{ latestRefundRecord(row)?.outRefundNo }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近处理人" width="150">
          <template #default="{ row }">
            <span>{{ getLatestOperatorText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">{{ formatTime(row.aftersaleSince) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <template v-if="canReviewRefund(row)">
                <el-button size="small" type="primary" @click="openReview(row, 'approve')">审核</el-button>
                <el-button size="small" @click="openReview(row, 'reject')">驳回</el-button>
              </template>
              <el-button size="small" @click="openRefundDetail(row)">查看记录</el-button>
              <el-button
                v-if="canRetryWechatRefund(row)"
                size="small"
                type="warning"
                @click="retryWechatRefund(row)"
              >
                补发退款
              </el-button>
            </div>
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
            title="确认通过后，系统会直接发起微信原路退款；只有微信返回成功记录时，系统才会显示钱款已退回。"
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

    <el-drawer
      v-model="detailDrawerVisible"
      title="退款记录详情"
      size="720px"
      :destroy-on-close="true"
    >
      <template v-if="detailOrder">
        <div class="detail-section">
          <div class="section-title">订单信息</div>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="订单号">
              <router-link class="order-link" :to="`/orders/${detailOrder.id}`">{{ detailOrder.id }}</router-link>
            </el-descriptions-item>
            <el-descriptions-item label="客户">
              {{ getCustomerName(detailOrder) }} / {{ getCustomerPhone(detailOrder) }}
            </el-descriptions-item>
            <el-descriptions-item label="商品" :span="2">
              {{ getOrderItemsSummary(detailOrder) }}
            </el-descriptions-item>
            <el-descriptions-item label="订单金额">¥{{ formatAmount(detailOrder.amountTotal) }}</el-descriptions-item>
            <el-descriptions-item label="退款理由">{{ detailOrder.aftersaleReason || '-' }}</el-descriptions-item>
            <el-descriptions-item label="当前状态" :span="2">
              <el-tag :type="getRefundTagType(detailOrder)">{{ getRefundStatusText(detailOrder) }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="detail-section">
          <div class="section-title">微信退款记录</div>
          <el-empty v-if="detailRefundRecords.length === 0" description="暂无微信退款记录" />
          <el-table v-else :data="detailRefundRecords" border>
            <el-table-column label="状态" width="150">
              <template #default="{ row }">
                <el-tag :type="row.success ? 'success' : getRecordTagType(row.status)">
                  {{ row.statusText || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="退款金额" width="110" align="right">
              <template #default="{ row }">¥{{ formatAmount(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="处理人" width="140">
              <template #default="{ row }">{{ getRecordOperatorText(row) }}</template>
            </el-table-column>
            <el-table-column prop="outRefundNo" label="商户退款单号" min-width="210" show-overflow-tooltip />
            <el-table-column label="发起时间" width="170">
              <template #default="{ row }">{{ formatTime(row.requestedAt || row.createdAt) }}</template>
            </el-table-column>
          </el-table>

          <div v-for="record in detailRefundRecords" :key="record.id" class="record-detail">
            <div class="record-title">
              {{ record.outRefundNo }}
              <el-tag size="small" :type="record.success ? 'success' : getRecordTagType(record.status)">
                {{ record.statusText || record.status }}
              </el-tag>
            </div>
            <div class="record-grid">
              <span>微信退款单号</span><strong>{{ record.refundId || '微信暂未返回' }}</strong>
              <span>处理人</span><strong>{{ getRecordOperatorText(record) }}</strong>
              <span>来源</span><strong>{{ getRecordSourceText(record.source) }}</strong>
              <span>退款金额</span><strong>¥{{ formatAmount(record.amount) }}</strong>
              <span>发起时间</span><strong>{{ formatTime(record.requestedAt || record.createdAt) }}</strong>
              <span>微信通知时间</span><strong>{{ formatTime(record.notifiedAt) }}</strong>
              <span>到账时间</span><strong>{{ formatTime(record.successTime) }}</strong>
              <span>失败原因</span><strong>{{ record.errorMessage || '-' }}</strong>
            </div>
          </div>
        </div>

        <div v-if="canRetryWechatRefund(detailOrder)" class="drawer-footer">
          <el-button type="warning" :loading="submitting" @click="retryWechatRefund(detailOrder)">
            补发微信原路退款
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { orderApi } from '@/api/orders'
import type { Order, OrderRefundRecord } from '@/types/order'

type RefundOrder = Order & {
  aftersaleType?: string
  aftersaleReason?: string
  aftersaleSince?: string | null
}

const loading = ref(false)
const submitting = ref(false)
const refunds = ref<RefundOrder[]>([])
const reviewDialogVisible = ref(false)
const detailDrawerVisible = ref(false)
const reviewMode = ref<'approve' | 'reject'>('approve')
const currentOrder = ref<RefundOrder | null>(null)
const detailOrder = ref<RefundOrder | null>(null)

const reviewForm = reactive({
  adminNote: '',
  refundAmount: 0
})

const wechatRefundCount = computed(() => {
  return refunds.value.filter((order) => order.paymentMethod === 'WECHAT_PAY').length
})

const needsRefundAttentionCount = computed(() => {
  return refunds.value.filter((order) => needsRefundAttention(order)).length
})

const successRefundCount = computed(() => {
  return refunds.value.filter((order) => order.refundStatus?.success).length
})

const detailRefundRecords = computed(() => {
  return detailOrder.value?.refundRecords || []
})

onMounted(() => {
  loadRefunds()
})

async function loadRefunds() {
  loading.value = true
  try {
    refunds.value = await orderApi.listRefundAftersales()
    if (detailOrder.value) {
      detailOrder.value = refunds.value.find((order) => order.id === detailOrder.value?.id) || detailOrder.value
    }
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

function openRefundDetail(row: RefundOrder) {
  detailOrder.value = row
  detailDrawerVisible.value = true
}

function canReviewRefund(row: RefundOrder): boolean {
  return row.status === 'AFTERSALE' && row.aftersaleType === 'REFUND'
}

function canRetryWechatRefund(row: RefundOrder): boolean {
  if (!isResolvedWechatRefundOrder(row)) return false
  if (row.refundStatus?.success) return false
  if (hasInFlightRefund(row)) return false
  const latest = latestRefundRecord(row)
  return !latest || ['FAILED', 'ABNORMAL', 'CLOSED'].includes(latest.status)
}

async function retryWechatRefund(row: RefundOrder) {
  try {
    await confirmRetryWechatRefund(row)
  } catch {
    return
  }

  submitting.value = true
  try {
    const refund = await orderApi.createWechatRefund(row.id, {
      amount: Number(row.amountTotal || 0),
      reason: row.aftersaleReason || '售后退款补发'
    })
    const statusText = refund.status === 'SUCCESS'
      ? '微信退款已成功'
      : refund.reused
        ? '已有退款正在处理'
        : '微信退款已发起，等待微信确认'
    ElMessage.success(`${statusText}：${refund.outRefundNo}`)
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
  if (reviewMode.value === 'approve') {
    try {
      await confirmRefundIrreversible(currentOrder.value)
    } catch {
      return
    }
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

async function confirmRefundIrreversible(order: RefundOrder) {
  await ElMessageBox.confirm(
    [
      '该退款操作不可撤销。',
      '确认后系统将直接发起微信原路退款，钱款会退回客户原支付账户。',
      '只有微信返回成功通知后，系统才会显示已退款到账。',
      `订单：${order.id}`,
      `客户：${getCustomerName(order)} / ${getCustomerPhone(order)}`,
      `金额：¥${formatAmount(order.amountTotal)}`
    ].join('\n'),
    '二次确认退款',
    {
      confirmButtonText: '确认退款',
      cancelButtonText: '再想想',
      type: 'warning',
      distinguishCancelAndClose: true
    }
  )
}

async function confirmRetryWechatRefund(order: RefundOrder) {
  await ElMessageBox.confirm(
    [
      '系统没有查询到该订单的微信退款成功记录。',
      '确认后会补发微信原路退款；该操作不可撤销，请先核对订单、客户和金额。',
      `订单：${order.id}`,
      `客户：${getCustomerName(order)} / ${getCustomerPhone(order)}`,
      `金额：¥${formatAmount(order.amountTotal)}`
    ].join('\n'),
    '补发微信原路退款',
    {
      confirmButtonText: '确认补发',
      cancelButtonText: '取消',
      type: 'warning',
      distinguishCancelAndClose: true
    }
  )
}

function getRefundStatusText(row: RefundOrder): string {
  if (canReviewRefund(row)) return '待审核'
  if (row.paymentMethod !== 'WECHAT_PAY') return '非微信支付，需人工核对'
  if (!row.refundStatus) return '未发起微信退款'
  return row.refundStatus.statusText
}

function getRefundTagType(row: RefundOrder): 'success' | 'warning' | 'info' | 'danger' {
  if (canReviewRefund(row)) return 'warning'
  if (row.refundStatus?.success) return 'success'
  if (!row.refundStatus) return 'danger'
  if (['ABNORMAL', 'CLOSED', 'FAILED'].includes(row.refundStatus.status)) return 'danger'
  return 'warning'
}

function getRecordTagType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'SUCCESS') return 'success'
  if (['ABNORMAL', 'CLOSED', 'FAILED'].includes(status)) return 'danger'
  if (['PENDING', 'PROCESSING'].includes(status)) return 'warning'
  return 'info'
}

function isResolvedWechatRefundOrder(row: RefundOrder): boolean {
  return row.status === 'CANCELLED' &&
    row.paymentMethod === 'WECHAT_PAY' &&
    (row.cancellationReason || '').includes('售后退款')
}

function hasInFlightRefund(row: RefundOrder): boolean {
  return (row.refundRecords || []).some((record) => ['PENDING', 'PROCESSING'].includes(record.status))
}

function needsRefundAttention(row: RefundOrder): boolean {
  if (canReviewRefund(row)) return true
  if (!isResolvedWechatRefundOrder(row)) return false
  return !row.refundStatus?.success
}

function latestRefundRecord(order?: RefundOrder | null): OrderRefundRecord | null {
  return order?.refundRecords?.[0] || null
}

function getLatestOperatorText(row: RefundOrder): string {
  const latest = latestRefundRecord(row)
  if (!latest) return '-'
  return getRecordOperatorText(latest)
}

function getRecordOperatorText(record: OrderRefundRecord): string {
  return record.operatorName || record.operatorPhone || record.operatorRole || record.operatorId || '系统记录'
}

function getRecordSourceText(source: string): string {
  const sourceMap: Record<string, string> = {
    AFTERSALE_APPROVE: '售后审核通过',
    ADMIN_RETRY: '管理员补发',
    LEGACY_ADJUSTMENT: '历史退款记录'
  }
  return sourceMap[source] || source
}

function getCustomerName(order?: RefundOrder | null): string {
  return order?.address?.recipientName || order?.customer?.nickname || '未记录客户'
}

function getCustomerPhone(order?: RefundOrder | null): string {
  return order?.address?.phone || order?.customer?.phone || '未记录电话'
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
      return `${recipeName}：${packageText}`
    })
    .join('；')
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

    &.warning {
      color: #d97706;
    }

    &.success {
      color: #059669;
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

  .refund-no {
    margin-top: 4px;
    color: #667085;
    font-size: 12px;
    line-height: 1.3;
  }

  .action-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .reason-text {
    line-height: 1.6;
    white-space: pre-wrap;
    color: #344054;
  }

  .refund-alert {
    margin-bottom: 18px;
  }

  .detail-section {
    margin-bottom: 22px;
  }

  .section-title {
    margin-bottom: 10px;
    color: #1f2937;
    font-size: 15px;
    font-weight: 700;
  }

  .record-detail {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fafafa;
  }

  .record-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    color: #1f2937;
    font-weight: 700;
  }

  .record-grid {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 8px 12px;
    color: #667085;
    font-size: 13px;

    strong {
      color: #1f2937;
      font-weight: 500;
      word-break: break-word;
    }
  }

  .drawer-footer {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    padding: 14px 0 0;
    background: #fff;
  }
}
</style>
