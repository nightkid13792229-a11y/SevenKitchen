<template>
  <div class="reimbursement-detail-page">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中...</span>
    </div>

    <!-- 详情内容 -->
    <div v-else-if="reimbursement">
      <!-- 页面标题 -->
      <el-page-header @back="$router.back()" class="page-header">
        <template #content>
          <div class="page-title">报销单详情</div>
        </template>
      </el-page-header>

      <!-- 状态卡片 -->
      <el-card shadow="never" class="status-card">
        <el-row :gutter="20">
          <el-col :span="12">
            <div class="info-item">
              <span class="label">报销单号:</span>
              <span class="value">{{ reimbursement.claimNumber }}</span>
            </div>
            <div class="info-item">
              <span class="label">状态:</span>
              <el-tag :type="getStatusType(reimbursement.status)" size="large">
                {{ getStatusText(reimbursement.status) }}
              </el-tag>
            </div>
            <div class="info-item">
              <span class="label">提交人:</span>
              <span class="value">{{ reimbursement.submittedBy?.nickname || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="label">提交时间:</span>
              <span class="value">{{ formatDateTime(reimbursement.submittedAt) }}</span>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="info-item">
              <span class="label">预估总额:</span>
              <span class="value estimated">¥{{ reimbursement.totalEstimatedCost.toFixed(2) }}</span>
            </div>
            <div class="info-item">
              <span class="label">实际总额:</span>
              <span class="value actual">¥{{ reimbursement.totalActualCost.toFixed(2) }}</span>
            </div>
            <div class="info-item">
              <span class="label">成本差异:</span>
              <span class="value" :class="getCostDiffClass">
                {{ costDiff > 0 ? '+' : '' }}¥{{ Math.abs(costDiff).toFixed(2) }}
              </span>
            </div>
            <div class="info-item">
              <span class="label">差异率:</span>
              <span class="value" :class="getCostDiffClass">
                {{ costDiffPercentage > 0 ? '+' : '' }}{{ Math.abs(costDiffPercentage).toFixed(1) }}%
              </span>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-header">
            <span class="title">费用明细</span>
          </div>
        </template>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="采购记录金额">
            ¥{{ purchaseListsActualTotal.toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="平台运费">
            ¥{{ Number(reimbursement.platformShippingFee || 0).toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="平台打包费">
            ¥{{ Number(reimbursement.platformPackagingFee || 0).toFixed(2) }}
          </el-descriptions-item>
          <el-descriptions-item label="费用构成">
            {{ getExpenseSummary(reimbursement) || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div
          v-if="reimbursement.customFees && reimbursement.customFees.length > 0"
          class="custom-fee-list"
        >
          <div
            v-for="(fee, index) in reimbursement.customFees"
            :key="index"
            class="custom-fee-item"
          >
            <div class="custom-fee-copy">
              <el-tag size="small" effect="plain">
                {{ getCustomFeeCategoryLabel(fee.category) }}
              </el-tag>
              <span class="custom-fee-title">
                {{ getCustomFeeDescription(fee) || formatCustomFeeTitle(fee) }}
              </span>
            </div>
            <span class="custom-fee-amount">¥{{ Number(fee.amount || 0).toFixed(2) }}</span>
          </div>
        </div>
      </el-card>

      <!-- 采购清单 -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-header">
            <span class="title">包含采购清单 ({{ reimbursement.purchaseLists?.length || 0 }})</span>
          </div>
        </template>

        <div class="purchase-lists">
          <el-collapse v-model="activeLists">
            <el-collapse-item
              v-for="(list, index) in reimbursement.purchaseLists"
              :key="index"
              :name="index"
            >
              <template #title>
                <div class="list-header">
                  <span class="date">{{ formatDate(list.targetDate) }}</span>
                  <el-tag :type="getListStatusType(list.status)" size="small">
                    {{ getListStatusText(list.status) }}
                  </el-tag>
                  <span class="cost">预估: ¥{{ list.totalEstimatedCost.toFixed(2) }}</span>
                </div>
              </template>

              <div class="list-info">
                <el-descriptions :column="2" border>
                  <el-descriptions-item label="原料种类">
                    {{ list.itemCount }} 种
                  </el-descriptions-item>
                  <el-descriptions-item label="预估成本">
                    ¥{{ list.totalEstimatedCost.toFixed(2) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="订单数量">
                    {{ list.sourceOrderIds?.length || 0 }} 个
                  </el-descriptions-item>
                  <el-descriptions-item label="创建时间">
                    {{ formatDateTime(list.createdAt) }}
                  </el-descriptions-item>
                </el-descriptions>
              </div>

              <!-- 原料明细 -->
              <div class="items-section">
                <h4>原料明细</h4>
                <el-table
                  :data="list.items"
                  style="width: 100%"
                  size="small"
                >
                  <el-table-column prop="ingredientName" label="原料名称" width="200" />
                  <el-table-column prop="productModel" label="规格" width="150">
                    <template #default="{ row }">
                      {{ row.productModel || '标准规格' }}
                    </template>
                  </el-table-column>
                  <el-table-column label="采购数量" width="150" align="right">
                    <template #default="{ row }">
                      {{ row.quantityNeeded }} {{ row.quantityUnit }}
                    </template>
                  </el-table-column>
                  <el-table-column label="采购渠道" width="150">
                    <template #default="{ row }">
                      {{ row.purchaseChannelName || row.purchaseChannel || '-' }}
                    </template>
                  </el-table-column>
                  <el-table-column label="预估成本" width="120" align="right">
                    <template #default="{ row }">
                      ¥{{ row.estimatedCost.toFixed(2) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="notes" label="备注" show-overflow-tooltip />
                </el-table>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-card>

      <el-card
        shadow="never"
        class="section-card"
        v-if="reimbursement.priceChanges && reimbursement.priceChanges.length > 0"
      >
        <template #header>
          <div class="card-header">
            <span class="title">原料价格变更 ({{ reimbursement.priceChanges.length }})</span>
            <el-tag v-if="heldPriceChangeCount > 0" type="warning" size="small">
              {{ heldPriceChangeCount }} 项待确认
            </el-tag>
          </div>
        </template>

        <el-table :data="reimbursement.priceChanges" size="small" style="width: 100%">
          <el-table-column prop="ingredientName" label="原料" min-width="160" />
          <el-table-column label="原单价" width="130" align="right">
            <template #default="{ row }">
              {{ formatUnitPrice(row.previousEffectivePrice) }}/{{ row.purchaseUnit || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="采购折算价" width="140" align="right">
            <template #default="{ row }">
              {{ formatUnitPrice(row.sourcePricePerPurchaseUnit) }}/{{ row.purchaseUnit || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="拟定价" width="130" align="right">
            <template #default="{ row }">
              {{ formatUnitPrice(row.proposedEffectivePrice) }}/{{ row.purchaseUnit || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="涨跌幅" width="100" align="right">
            <template #default="{ row }">
              {{ formatDeltaRate(row.deltaRate) }}
            </template>
          </el-table-column>
          <el-table-column label="校验结果" width="120">
            <template #default="{ row }">
              <el-tag :type="getGateTagType(row)" size="small">
                {{ getGateText(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getPriceChangeStatusType(row.status)" size="small">
                {{ getPriceChangeStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.gateReason || formatReviewReasons(row.reviewReasons, row.reviewComment) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="isHeldChange(row)"
                type="primary"
                link
                size="small"
                :loading="applyingPriceChangeId === row.id"
                @click="handleApplyHeldPriceChange(row)"
              >
                确认应用
              </el-button>
              <span v-else class="muted-text">—</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 凭证与差额（2026-11-04 采购-报销 AI 接入） -->
      <el-card
        shadow="never"
        class="section-card"
        v-if="reimbursement.voucherAmount !== null && reimbursement.voucherAmount !== undefined"
      >
        <template #header>
          <div class="card-header">
            <span class="title">凭证与差额</span>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="凭证金额">¥{{ money(reimbursement.voucherAmount) }}</el-descriptions-item>
          <el-descriptions-item label="报销金额">¥{{ money(reimbursement.totalActualCost) }}</el-descriptions-item>
          <el-descriptions-item label="差额">¥{{ money(reimbursement.differenceAmount) }}</el-descriptions-item>
          <el-descriptions-item label="差额原因">{{ reimbursement.differenceNote || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 发票照片 -->
      <el-card shadow="never" class="section-card" v-if="receiptImages.length > 0">
        <template #header>
          <div class="card-header">
            <span class="title">发票照片</span>
          </div>
        </template>

        <div class="photos-grid">
          <el-image
            v-for="(url, index) in receiptImages"
            :key="index"
            :src="url"
            :preview-src-list="receiptImages"
            :initial-index="index"
            fit="cover"
            class="photo-item"
          />
        </div>
      </el-card>

      <!-- 智能审核建议（2026-11-04 阶段 E） -->
      <el-card shadow="never" class="section-card review-card">
        <template #header>
          <div class="card-header">
            <span class="title">智能审核建议</span>
            <div class="review-head-actions">
              <el-tag v-if="agentReview" :type="riskTagType(agentReview.riskLevel)">
                {{ riskText(agentReview.riskLevel) }}
              </el-tag>
              <el-tag v-if="agentReview" size="small" effect="plain">
                {{ agentReview.model ? `模型：${agentReview.model}` : '规则兜底（模型未参与）' }}
              </el-tag>
              <el-button
                v-if="reimbursement.status === 'PENDING_REVIEW'"
                link
                type="primary"
                :loading="reviewLoading"
                @click="runReview"
              >
                {{ agentReview ? '重新生成' : '生成建议' }}
              </el-button>
            </div>
          </div>
        </template>

        <template v-if="agentReview">
          <p class="review-summary">{{ agentReview.summary }}</p>
          <p v-if="agentReview.advice" class="review-advice">{{ agentReview.advice }}</p>
          <ul class="review-findings">
            <li v-for="(item, index) in agentReview.findings" :key="index">
              <el-tag size="small" :type="findingTagType(item.level)">{{ findingLevelText(item.level) }}</el-tag>
              <span>{{ item.message }}</span>
            </li>
          </ul>
        </template>
        <el-empty v-else description="暂无审核建议" :image-size="60" />

        <!-- 审核动作不受 AI 建议是否可用影响（R11：Agent 只建议，人做决定） -->
        <template v-if="reimbursement.status === 'PENDING_REVIEW'">
          <el-alert
            v-if="!agentReview"
            title="AI 建议暂不可用，仍可人工审核"
            type="warning"
            :closable="false"
            show-icon
            class="review-alert"
          />
          <div class="review-buttons">
            <el-button type="primary" :loading="actionLoading" @click="triggerProofUpload">
              通过并上传付款凭证
            </el-button>
            <el-button :disabled="actionLoading" @click="requireResubmit">要求补充说明</el-button>
            <el-button type="danger" plain :disabled="actionLoading" @click="rejectClaim">驳回</el-button>
            <input
              ref="proofInputRef"
              type="file"
              accept="image/*,.pdf"
              multiple
              class="hidden-file"
              @change="onProofSelected"
            />
          </div>
        </template>
        <p v-else class="review-muted">审核建议仅供复核；当前状态：{{ getStatusText(reimbursement.status) }}。</p>
      </el-card>

      <!-- 报销信息 -->
      <el-card shadow="never" class="section-card" v-if="reimbursement.status !== 'PENDING_REVIEW'">
        <template #header>
          <div class="card-header">
            <span class="title">报销信息</span>
          </div>
        </template>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="处理人">
            {{ reimbursement.reviewedBy?.nickname || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="处理时间">
            {{ formatDateTime(reimbursement.reviewedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="报销状态" :span="2">
            <el-tag :type="getStatusType(reimbursement.status)">
              {{ getStatusText(reimbursement.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="处理备注" :span="2" v-if="reimbursement.reviewComment">
            {{ reimbursement.reviewComment }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 报销处理提示 -->
      <el-card shadow="never" class="action-card" v-if="reimbursement.status === 'PENDING_REVIEW'">
        <div class="pending-reimbursement-note">
          <el-tag type="warning">待报销</el-tag>
          <span>上传报销凭证后将完成报销并确认本次价格变更。</span>
        </div>
        <el-button @click="$router.back()">返回列表</el-button>
      </el-card>

      <!-- 返回按钮（非待报销状态） -->
      <div v-else class="back-actions">
        <el-button @click="$router.back()">返回列表</el-button>
      </div>
    </div>

    <!-- 错误状态 -->
    <el-empty v-else description="加载失败" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { purchasingApi } from '@/api/purchasing'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
  formatReimbursementCustomFeeTitle,
  getReimbursementCustomFeeCategoryLabel,
  summarizeReimbursementCustomFees,
} from '@/constants/reimbursement'

const router = useRouter()
const route = useRoute()

// 状态管理
const loading = ref(true)
const reimbursement = ref<any>(null)
const agentReview = ref<any>(null)
const reviewLoading = ref(false)
const actionLoading = ref(false)
const proofInputRef = ref<HTMLInputElement | null>(null)
const activeLists = ref<number[]>([])

// 计算属性
const receiptImages = computed<string[]>(() => {
  const urls = (reimbursement.value?.receiptUrls || []) as string[]
  const signed = (reimbursement.value?.receiptSignedUrls || []) as string[]
  return [...urls, ...signed]
})

const money = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00'
}

const costDiff = computed(() => {
  if (!reimbursement.value) return 0
  return reimbursement.value.totalActualCost - reimbursement.value.totalEstimatedCost
})

const costDiffPercentage = computed(() => {
  if (!reimbursement.value) return 0
  const diff = costDiff.value
  const estimated = reimbursement.value.totalEstimatedCost
  return estimated > 0 ? (diff / estimated) * 100 : 0
})

const purchaseListsActualTotal = computed(() => {
  if (!reimbursement.value?.purchaseLists) return 0

  return reimbursement.value.purchaseLists.reduce((sum: number, list: any) => {
    return sum + Number(list.totalActualCost ?? list.totalEstimatedCost ?? 0)
  }, 0)
})

const getCostDiffClass = computed(() => {
  if (costDiff.value > 0) return 'cost-positive'
  if (costDiff.value < 0) return 'cost-negative'
  return ''
})

const formatCustomFeeTitle = (fee: any) => {
  return formatReimbursementCustomFeeTitle(fee)
}

const getCustomFeeCategoryLabel = (category?: string | null) => {
  return getReimbursementCustomFeeCategoryLabel(category)
}

const getCustomFeeDescription = (fee: any) => {
  if (!fee?.category || !fee?.description) return ''

  const categoryLabel = getReimbursementCustomFeeCategoryLabel(fee.category)
  return fee.description.trim() === categoryLabel ? '' : fee.description.trim()
}

const getExpenseSummary = (target: any) => {
  if (!target) return ''

  const parts: string[] = []
  const customFeeSummary = summarizeReimbursementCustomFees(target.customFees)

  if (target.purchaseLists?.length) {
    parts.push(`${target.purchaseLists.length}张采购清单`)
  }

  if (customFeeSummary) {
    parts.push(customFeeSummary)
  }

  if (target.platformShippingFee > 0) {
    parts.push('平台运费')
  }

  if (target.platformPackagingFee > 0) {
    parts.push('平台打包费')
  }

  return parts.join('、')
}

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'PENDING_REVIEW': '待报销',
    'REIMBURSED': '已报销',
    'REJECTED': '已驳回',
    'REQUIRES_RESUBMIT': '需重新提交'
  }
  return statusMap[status] || status
}

const getStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    'PENDING_REVIEW': 'warning',
    'REIMBURSED': 'success',
    'REJECTED': 'danger',
    'REQUIRES_RESUBMIT': 'info'
  }
  return typeMap[status] || ''
}

const getPriceChangeStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'PENDING': '待生效',
    'APPROVED': '已生效',
    'REJECTED': '已拒绝'
  }
  return statusMap[status] || status
}

const getPriceChangeStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    'PENDING': 'warning',
    'APPROVED': 'success',
    'REJECTED': 'danger'
  }
  return typeMap[status] || ''
}

const getApprovalModeText = (approvalMode?: string | null) => {
  const modeMap: Record<string, string> = {
    'AUTO': '自动生效',
    'MANUAL': '凭证确认',
    'MANUAL_REQUIRED': '凭证确认'
  }
  return approvalMode ? modeMap[approvalMode] || approvalMode : '-'
}

const getApprovalModeType = (approvalMode?: string | null) => {
  const typeMap: Record<string, any> = {
    'AUTO': 'success',
    'MANUAL': 'info',
    'MANUAL_REQUIRED': 'warning'
  }
  return approvalMode ? typeMap[approvalMode] || 'info' : 'info'
}

const getListStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'DRAFT': '草稿',
    'PENDING': '待采购',
    'COMPLETED': '已完成',
    'CANCELLED': '已取消'
  }
  return statusMap[status] || status
}

const getListStatusType = (status: string) => {
  const typeMap: Record<string, any> = {
    'DRAFT': 'info',
    'PENDING': 'warning',
    'COMPLETED': 'success',
    'CANCELLED': 'danger'
  }
  return typeMap[status] || ''
}

// 格式化日期时间
const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const formatDeltaRate = (deltaRate?: number | null) => {
  if (deltaRate === undefined || deltaRate === null) {
    return '-'
  }

  const percentage = deltaRate * 100
  const prefix = percentage > 0 ? '+' : ''
  return `${prefix}${percentage.toFixed(1)}%`
}

const formatReviewReasons = (
  reviewReasons?: string[] | null,
  reviewComment?: string | null
) => {
  if (Array.isArray(reviewReasons) && reviewReasons.length > 0) {
    return reviewReasons.join('；')
  }

  return reviewComment || '-'
}

/**
 * 单价按数量级自适应小数位（2026-11-06）。
 *
 * 很多食材的采购单位就是 1 克，单价只有 0.00278 元，
 * 固定两位小数会全部显示成 ¥0.00，看起来像免费。
 */
const formatUnitPrice = (value?: number | null) => {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return '¥0'
  const abs = Math.abs(num)
  if (abs >= 1) return `¥${num.toFixed(2)}`
  if (abs >= 0.01) return `¥${num.toFixed(4)}`
  return `¥${num.toFixed(6)}`
}

/** 被价格闸挂起、等人工放行的条目 */
const isHeldChange = (row: any) =>
  row?.gateAction === 'HOLD' && row?.status === 'PENDING'

const heldPriceChangeCount = computed(
  () =>
    (reimbursement.value?.priceChanges || []).filter((row: any) =>
      isHeldChange(row)
    ).length
)

const getGateText = (row: any) => {
  if (isHeldChange(row)) return '待确认'
  if (row?.gateAction === 'REJECT' || row?.status === 'REJECTED') return '已拒绝'
  if (row?.gateAction === 'APPLY') return '已通过'
  return '—'
}

const getGateTagType = (row: any) => {
  if (isHeldChange(row)) return 'warning'
  if (row?.gateAction === 'REJECT' || row?.status === 'REJECTED') return 'danger'
  if (row?.gateAction === 'APPLY') return 'success'
  return 'info'
}

const applyingPriceChangeId = ref<string | null>(null)

const handleApplyHeldPriceChange = async (row: any) => {
  if (!row?.id) return
  applyingPriceChangeId.value = row.id
  try {
    await purchasingApi.applyHeldPriceChange(String(row.id), '后台人工确认')
    ElMessage.success('价格变更已应用')
    await loadDetail()
  } catch (error: any) {
    ElMessage.error(
      error?.response?.data?.message || error?.message || '应用失败'
    )
  } finally {
    applyingPriceChangeId.value = null
  }
}

// 加载详情
const riskTagType = (risk: string) =>
  risk === 'HIGH' ? 'danger' : risk === 'MEDIUM' ? 'warning' : 'success'
const riskText = (risk: string) =>
  risk === 'HIGH' ? '高风险' : risk === 'MEDIUM' ? '中风险' : '低风险'
const findingTagType = (level: string) =>
  level === 'HIGH' ? 'danger' : level === 'WARN' ? 'warning' : 'info'
const findingLevelText = (level: string) =>
  level === 'HIGH' ? '必须处理' : level === 'WARN' ? '建议复核' : '提示'

const loadReview = async () => {
  try {
    agentReview.value = await purchasingApi.getAgentReview(route.query.id as string)
  } catch {
    agentReview.value = null
  }
}

const runReview = async () => {
  reviewLoading.value = true
  try {
    agentReview.value = await purchasingApi.runAgentReview(route.query.id as string)
  } catch (error) {
    console.error('生成审核建议失败', error)
    ElMessage.error('生成审核建议失败')
  } finally {
    reviewLoading.value = false
  }
}

const triggerProofUpload = () => proofInputRef.value?.click()

const onProofSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确认通过并上传 ${files.length} 张付款凭证？上传后报销即完成，不可撤销。`,
      '确认完成报销',
      { confirmButtonText: '确认通过', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    input.value = ''
    return
  }

  actionLoading.value = true
  try {
    const result: any = await purchasingApi.uploadPaymentProofFiles(
      route.query.id as string,
      files,
    )
    if (result?.status && result.status !== 'REIMBURSED') {
      ElMessage.warning('凭证已上传，但单据状态不是「已报销」，请刷新检查')
    } else {
      ElMessage.success('已上传付款凭证，报销完成')
    }
    await loadDetail()
    await loadReview()
  } catch (error) {
    console.error('上传付款凭证失败', error)
    ElMessage.error('上传失败')
  } finally {
    actionLoading.value = false
    input.value = ''
  }
}

const requireResubmit = async () => {
  try {
    const { value } = await ElMessageBox.prompt('请说明需要补充什么（员工会看到）', '要求补充说明', {
      inputPlaceholder: '例如：请补充 10-31 那笔的支付记录',
      confirmButtonText: '退回补充',
      cancelButtonText: '取消',
    })
    actionLoading.value = true
    await purchasingApi.reviewReimbursement(route.query.id as string, {
      decision: 'REQUIRES_RESUBMIT',
      comment: value,
    })
    ElMessage.success('已退回，等待员工补充')
    await loadDetail()
    await loadReview()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('退回失败', error)
      ElMessage.error('操作失败')
    }
  } finally {
    actionLoading.value = false
  }
}

const rejectClaim = async () => {
  try {
    const { value } = await ElMessageBox.prompt('驳回原因（员工会看到）', '驳回报销单', {
      inputPlaceholder: '例如：凭证金额与订单不一致',
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
    })
    actionLoading.value = true
    await purchasingApi.reviewReimbursement(route.query.id as string, {
      decision: 'REJECT',
      comment: value,
    })
    ElMessage.success('已驳回')
    await loadDetail()
    await loadReview()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('驳回失败', error)
      ElMessage.error('操作失败')
    }
  } finally {
    actionLoading.value = false
  }
}

const loadDetail = async () => {
  const id = route.query.id as string
  if (!id) {
    ElMessage.error('缺少报销单ID')
    router.back()
    return
  }

  loading.value = true
  try {
    const res = await purchasingApi.getReimbursementDetail(id)
    reimbursement.value = res
  } catch (error) {
    console.error('加载报销单详情失败', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadDetail()
  await loadReview()
  // 不自动生成：模型调用慢且要花钱，由管理员点「生成建议」触发。
})
</script>

<style scoped lang="scss">
.reimbursement-detail-page {
  padding: 24px;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 24px;
  color: #909399;

  .el-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
}

.page-header {
  margin-bottom: 24px;
  background-color: #fff;
  padding: 16px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  color: #303133;
}

.status-card {
  margin-bottom: 24px;

  .info-item {
    display: flex;
    align-items: center;
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      font-size: 14px;
      color: #606266;
      margin-right: 12px;
      min-width: 80px;
    }

    .value {
      font-size: 16px;
      font-weight: 500;
      color: #303133;

      &.estimated {
        color: #909399;
      }

      &.actual {
        color: #f56c6c;
      }

      &.cost-positive {
        color: #f56c6c;
        font-weight: bold;
      }

      &.cost-negative {
        color: #67c23a;
        font-weight: bold;
      }
    }
  }
}

.section-card {
  margin-bottom: 24px;

  .card-header {
    .title {
      font-size: 16px;
      font-weight: bold;
      color: #303133;
    }
  }
}

.custom-fee-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .custom-fee-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-radius: 8px;
    background: #faf6eb;
  }

  .custom-fee-copy {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #606266;
  }

  .custom-fee-title {
    line-height: 1.4;
  }

  .custom-fee-amount {
    color: #d46b08;
    font-weight: 600;
  }
}

.purchase-lists {
  .list-header {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;

    .date {
      font-size: 15px;
      font-weight: bold;
      color: #303133;
    }

    .cost {
      margin-left: auto;
      font-size: 14px;
      color: #f56c6c;
      font-weight: bold;
    }
  }

  .list-info {
    margin-bottom: 24px;
  }

  .items-section {
    h4 {
      font-size: 14px;
      font-weight: bold;
      color: #303133;
      margin-bottom: 12px;
    }
  }
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;

  .photo-item {
    width: 100%;
    height: 200px;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.3s;

    &:hover {
      transform: scale(1.05);
    }
  }
}

.action-card {
  .pending-reimbursement-note {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    color: #606266;
  }
}

.back-actions {
  text-align: center;
  padding: 24px 0;
}

.review-card :deep(.card-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.review-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-summary {
  font-size: 14px;
  color: #2b2b26;
  margin: 0 0 6px;
  font-weight: 600;
}

.review-advice {
  font-size: 13px;
  color: #6b6653;
  margin: 0 0 10px;
}

.review-findings {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review-findings li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #3c3a30;
}

.review-alert {
  margin-bottom: 12px;
}

.review-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.review-muted {
  font-size: 12px;
  color: #8a8574;
  margin: 0;
}

.hidden-file {
  display: none;
}
</style>
