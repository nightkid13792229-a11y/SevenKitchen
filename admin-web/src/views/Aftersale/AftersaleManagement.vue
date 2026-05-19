<template>
  <div class="aftersale-management">
    <div class="page-header">
      <div>
        <h2>售后工单</h2>
        <p>处理小程序用户提交的退款、重做、投诉建议，并可对微信支付订单发起线上退款。</p>
      </div>
      <el-button type="primary" :loading="loading" @click="loadAftersales">刷新</el-button>
    </div>

    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">待处理</div>
          <div class="stat-value pending">{{ stats.pending }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">退款申请</div>
          <div class="stat-value refund">{{ stats.refund }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">重做申请</div>
          <div class="stat-value remake">{{ stats.remake }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">投诉建议</div>
          <div class="stat-value complaint">{{ stats.complaint }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="table-card" shadow="never">
      <el-table :data="aftersales" v-loading="loading" stripe>
        <el-table-column prop="id" label="订单号" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">
            <router-link class="order-link" :to="`/orders/${row.id}`">
              {{ row.id }}
            </router-link>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="150">
          <template #default="{ row }">
            <div class="customer-cell">
              <div class="primary-text">{{ getCustomerName(row) }}</div>
              <div class="muted-text">{{ getCustomerPhone(row) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="购买内容" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="item-cell">
              <div class="primary-text">{{ getOrderItemsSummary(row) }}</div>
              <div class="muted-text">{{ getFirstDogName(row) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="aftersaleType" label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="getAftersaleTypeTag(row.aftersaleType)">
              {{ getAftersaleTypeText(row.aftersaleType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amountTotal" label="订单金额" width="120">
          <template #default="{ row }">¥{{ formatAmount(row.amountTotal) }}</template>
        </el-table-column>
        <el-table-column prop="aftersaleReason" label="售后原因" min-width="220" show-overflow-tooltip />
        <el-table-column prop="aftersaleSince" label="申请时间" width="170">
          <template #default="{ row }">{{ formatTime(row.aftersaleSince) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="handleResolve(row)">处理</el-button>
            <el-button size="small" @click="viewDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="resolveDialogVisible"
      title="处理售后工单"
      width="680px"
      :close-on-click-modal="false"
      @closed="resetResolveForm"
    >
      <el-form :model="resolveForm" label-width="120px">
        <el-form-item label="订单ID">
          <router-link v-if="currentOrder" class="order-link" :to="`/orders/${currentOrder.id}`">
            {{ currentOrder.id }}
          </router-link>
        </el-form-item>
        <el-form-item label="客户信息">
          <div class="detail-stack">
            <span>{{ getCustomerName(currentOrder) }}</span>
            <span>{{ getCustomerPhone(currentOrder) }}</span>
          </div>
        </el-form-item>
        <el-form-item label="收货地址">
          <div class="reason-text">{{ getAddressText(currentOrder) }}</div>
        </el-form-item>
        <el-form-item label="购买内容">
          <div class="detail-stack">
            <span>{{ getOrderItemsSummary(currentOrder) }}</span>
            <span>{{ getFirstDogName(currentOrder) }}</span>
          </div>
        </el-form-item>
        <el-form-item label="售后类型">
          <el-tag :type="getAftersaleTypeTag(currentOrder?.aftersaleType)">
            {{ getAftersaleTypeText(currentOrder?.aftersaleType) }}
          </el-tag>
        </el-form-item>
        <el-form-item label="订单金额">
          <span>¥{{ formatAmount(currentOrder?.amountTotal) }}</span>
        </el-form-item>
        <el-form-item label="支付方式">
          <span>{{ getPaymentMethodText(currentOrder?.paymentMethod) }}</span>
        </el-form-item>
        <el-form-item label="售后原因">
          <div class="reason-text">{{ currentOrder?.aftersaleReason || '-' }}</div>
        </el-form-item>
        <el-form-item v-if="currentOrder?.aftersalePhotos?.length" label="凭证图片">
          <el-image
            v-for="photo in currentOrder.aftersalePhotos"
            :key="photo"
            class="photo-thumb"
            :src="photo"
            :preview-src-list="currentOrder.aftersalePhotos"
            fit="cover"
          />
        </el-form-item>
        <el-form-item label="处理方式" required>
          <el-select v-model="resolveForm.resolutionType" placeholder="请选择处理方式">
            <el-option label="同意退款" value="refunded" />
            <el-option label="安排重做" value="remade" />
            <el-option label="已解决" value="resolved" />
          </el-select>
        </el-form-item>

        <template v-if="showRefundOptions">
          <el-alert
            class="refund-alert"
            type="warning"
            :closable="false"
            show-icon
            title="微信线上退款会调用微信支付接口；如果支付配置未开启退款，系统会阻止处理并提示需要补充配置。"
          />
          <el-form-item label="线上退款">
            <el-checkbox
              v-model="resolveForm.createWechatRefund"
              :disabled="currentOrder?.paymentMethod !== 'WECHAT_PAY'"
            >
              同时发起微信线上退款
            </el-checkbox>
          </el-form-item>
          <el-form-item v-if="resolveForm.createWechatRefund" label="退款金额" required>
            <el-input-number
              v-model="resolveForm.refundAmount"
              :min="0.01"
              :max="Number(currentOrder?.amountTotal || 0)"
              :precision="2"
              :step="1"
            />
          </el-form-item>
        </template>

        <el-form-item label="处理备注">
          <el-input
            v-model="resolveForm.adminNote"
            type="textarea"
            :rows="4"
            maxlength="300"
            show-word-limit
            placeholder="请输入处理备注，用户争议、退款原因、重做安排都建议写清楚"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmResolve">
          确认处理
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { orderApi } from '@/api/orders'
import type { Order } from '@/types/order'

type AftersaleOrder = Order & {
  aftersaleType?: string
  aftersaleReason?: string
  aftersaleSince?: string | null
  aftersalePhotos?: string[]
}

const loading = ref(false)
const submitting = ref(false)
const aftersales = ref<AftersaleOrder[]>([])
const resolveDialogVisible = ref(false)
const currentOrder = ref<AftersaleOrder | null>(null)

const stats = computed(() => ({
  pending: aftersales.value.length,
  refund: aftersales.value.filter((order) => order.aftersaleType === 'REFUND').length,
  remake: aftersales.value.filter((order) => order.aftersaleType === 'REMAKE').length,
  complaint: aftersales.value.filter((order) => order.aftersaleType === 'COMPLAINT').length
}))

const resolveForm = reactive({
  resolutionType: '' as '' | 'refunded' | 'remade' | 'resolved',
  adminNote: '',
  createWechatRefund: false,
  refundAmount: 0
})

const showRefundOptions = computed(() => {
  return currentOrder.value?.aftersaleType === 'REFUND' && resolveForm.resolutionType === 'refunded'
})

onMounted(() => {
  loadAftersales()
})

async function loadAftersales() {
  loading.value = true
  try {
    aftersales.value = await orderApi.listPendingAftersales()
  } catch (error) {
    console.error('Load aftersales error:', error)
  } finally {
    loading.value = false
  }
}

function handleResolve(row: AftersaleOrder) {
  currentOrder.value = row
  resetResolveForm()
  resolveForm.refundAmount = Number(row.amountTotal || 0)
  resolveForm.createWechatRefund = row.aftersaleType === 'REFUND' && row.paymentMethod === 'WECHAT_PAY'
  resolveDialogVisible.value = true
}

function resetResolveForm() {
  resolveForm.resolutionType = ''
  resolveForm.adminNote = ''
  resolveForm.createWechatRefund = false
  resolveForm.refundAmount = 0
}

function viewDetail(row: AftersaleOrder) {
  const photos = row.aftersalePhotos?.length
    ? `<p><strong>凭证图片:</strong> ${row.aftersalePhotos.length} 张</p>`
    : ''

  ElMessageBox.alert(
    `
    <div>
      <p><strong>订单ID:</strong> ${escapeHtml(row.id)}</p>
      <p><strong>客户:</strong> ${escapeHtml(getCustomerName(row))}</p>
      <p><strong>联系方式:</strong> ${escapeHtml(getCustomerPhone(row))}</p>
      <p><strong>购买内容:</strong> ${escapeHtml(getOrderItemsSummary(row))}</p>
      <p><strong>狗狗:</strong> ${escapeHtml(getFirstDogName(row))}</p>
      <p><strong>收货地址:</strong> ${escapeHtml(getAddressText(row))}</p>
      <p><strong>订单状态:</strong> ${getStatusText(row.status)}</p>
      <p><strong>售后类型:</strong> ${getAftersaleTypeText(row.aftersaleType)}</p>
      <p><strong>订单金额:</strong> ¥${formatAmount(row.amountTotal)}</p>
      <p><strong>支付方式:</strong> ${getPaymentMethodText(row.paymentMethod)}</p>
      <p><strong>申请时间:</strong> ${formatTime(row.aftersaleSince)}</p>
      <p><strong>售后原因:</strong> ${escapeHtml(row.aftersaleReason || '-')}</p>
      ${photos}
    </div>
    `,
    '售后详情',
    {
      dangerouslyUseHTMLString: true,
      confirmButtonText: '关闭'
    }
  )
}

async function confirmResolve() {
  if (!currentOrder.value) return

  if (!resolveForm.resolutionType) {
    ElMessage.warning('请选择处理方式')
    return
  }

  if (resolveForm.createWechatRefund && resolveForm.refundAmount <= 0) {
    ElMessage.warning('请输入正确的退款金额')
    return
  }

  submitting.value = true
  try {
    const noteParts = [resolveForm.adminNote.trim()].filter(Boolean)

    if (resolveForm.createWechatRefund) {
      const refund = await orderApi.createWechatRefund(currentOrder.value.id, {
        amount: resolveForm.refundAmount,
        reason: resolveForm.adminNote.trim() || currentOrder.value.aftersaleReason || '售后退款'
      })
      noteParts.push(`微信退款单号：${refund.outRefundNo}`)
    }

    await orderApi.resolveAftersale(currentOrder.value.id, {
      resolutionType: resolveForm.resolutionType,
      adminNote: noteParts.join('\n')
    })

    ElMessage.success('售后工单已处理')
    resolveDialogVisible.value = false
    await loadAftersales()
  } catch (error) {
    console.error('Resolve aftersale error:', error)
  } finally {
    submitting.value = false
  }
}

function getStatusText(status?: string): string {
  const statusMap: Record<string, string> = {
    FREEZING: '急冻中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    AFTERSALE: '售后中',
    CANCELLED: '已取消'
  }
  return statusMap[status || ''] || status || '-'
}

function getAftersaleTypeText(type?: string): string {
  const typeMap: Record<string, string> = {
    REFUND: '申请退款',
    REMAKE: '申请重做',
    COMPLAINT: '投诉建议',
    RESOLVED: '已解决'
  }
  return typeMap[type || ''] || '-'
}

function getPaymentMethodText(method?: string): string {
  const methodMap: Record<string, string> = {
    WECHAT_PAY: '微信支付',
    WECHAT: '微信支付',
    OFFLINE: '线下支付'
  }
  return methodMap[method || ''] || method || '未记录'
}

function getCustomerName(order?: AftersaleOrder | null): string {
  return order?.address?.recipientName || '未记录客户'
}

function getCustomerPhone(order?: AftersaleOrder | null): string {
  return order?.address?.phone || '未记录电话'
}

function getFirstDogName(order?: AftersaleOrder | null): string {
  const dogNames = (order?.items || [])
    .map((item) => item.dog?.name)
    .filter(Boolean)
  if (dogNames.length > 0) {
    return `狗狗：${Array.from(new Set(dogNames)).join('、')}`
  }
  return '狗狗：未记录'
}

function getOrderItemsSummary(order?: AftersaleOrder | null): string {
  const items = order?.items || []
  if (items.length === 0) {
    return '未记录商品'
  }

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

function getAddressText(order?: AftersaleOrder | null): string {
  const address = order?.address
  if (!address) {
    return '未记录地址'
  }

  const region = address.regionText || [
    address.region?.province,
    address.region?.city,
    address.region?.district
  ].filter(Boolean).join(' ')
  return [region, address.detailAddress].filter(Boolean).join(' ') || '未记录地址'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getStatusTagType(status?: string): 'success' | 'warning' | 'info' | 'danger' {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    FREEZING: 'warning',
    SHIPPED: 'success',
    COMPLETED: 'info',
    AFTERSALE: 'danger',
    CANCELLED: 'info'
  }
  return typeMap[status || ''] || 'info'
}

function getAftersaleTypeTag(type?: string): 'success' | 'warning' | 'info' | 'danger' {
  const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    REFUND: 'danger',
    REMAKE: 'warning',
    COMPLAINT: 'info',
    RESOLVED: 'success'
  }
  return typeMap[type || ''] || 'info'
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
.aftersale-management {
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

  .stat-card {
    border-radius: 8px;

    .stat-label {
      color: #667085;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      line-height: 1;

      &.pending {
        color: #2563eb;
      }

      &.refund {
        color: #dc2626;
      }

      &.remake {
        color: #d97706;
      }

      &.complaint {
        color: #475467;
      }
    }
  }

  .table-card {
    border-radius: 8px;
  }

  .order-link {
    color: #1677ff;
    font-weight: 600;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  .customer-cell,
  .item-cell,
  .detail-stack {
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

  .photo-thumb {
    width: 72px;
    height: 72px;
    border-radius: 6px;
    margin-right: 8px;
    border: 1px solid #ebeef5;
  }

  .refund-alert {
    margin-bottom: 18px;
  }
}
</style>
