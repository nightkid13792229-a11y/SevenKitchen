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
                      {{ row.purchaseChannel || '-' }}
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

      <!-- 发票照片 -->
      <el-card shadow="never" class="section-card" v-if="reimbursement.receiptUrls && reimbursement.receiptUrls.length > 0">
        <template #header>
          <div class="card-header">
            <span class="title">发票照片</span>
          </div>
        </template>

        <div class="photos-grid">
          <el-image
            v-for="(url, index) in reimbursement.receiptUrls"
            :key="index"
            :src="url"
            :preview-src-list="reimbursement.receiptUrls"
            :initial-index="index"
            fit="cover"
            class="photo-item"
          />
        </div>
      </el-card>

      <el-card
        shadow="never"
        class="section-card"
        v-if="reimbursement.paymentProofUrls && reimbursement.paymentProofUrls.length > 0"
      >
        <template #header>
          <div class="card-header">
            <span class="title">付款凭证</span>
          </div>
        </template>

        <div class="photos-grid">
          <el-image
            v-for="(url, index) in reimbursement.paymentProofUrls"
            :key="`payment-${index}`"
            :src="url"
            :preview-src-list="reimbursement.paymentProofUrls"
            :initial-index="index"
            fit="cover"
            class="photo-item"
          />
        </div>
      </el-card>

      <!-- 审核信息 -->
      <el-card shadow="never" class="section-card" v-if="reimbursement.status !== 'PENDING_REVIEW'">
        <template #header>
          <div class="card-header">
            <span class="title">审核信息</span>
          </div>
        </template>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="审核人">
            {{ reimbursement.reviewedBy?.nickname || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="审核时间">
            {{ formatDateTime(reimbursement.reviewedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="审核结果" :span="2">
            <el-tag :type="getStatusType(reimbursement.status)">
              {{ getStatusText(reimbursement.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="审核意见" :span="2" v-if="reimbursement.reviewComment">
            {{ reimbursement.reviewComment }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 审核操作 -->
      <el-card shadow="never" class="action-card" v-if="reimbursement.status === 'PENDING_REVIEW'">
        <el-alert
          title="待审核报销只有两条路径：驳回/要求重提，或上传付款凭证后确认已报销。"
          type="warning"
          :closable="false"
          show-icon
          class="action-alert"
        />

        <el-form :model="reviewForm" label-width="100px">
          <el-form-item label="审核决定">
            <el-radio-group v-model="reviewForm.decision">
              <el-radio label="REJECT">
                <el-text type="danger">驳回</el-text>
              </el-radio>
              <el-radio label="REQUIRES_RESUBMIT">
                <el-text type="warning">要求重新提交</el-text>
              </el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="审核意见">
            <el-input
              v-model="reviewForm.comment"
              type="textarea"
              :rows="4"
              placeholder="请输入审核意见（驳回时必填）"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="danger" @click="submitReview" :loading="submitting">
              提交处理意见
            </el-button>
            <el-button @click="$router.back()">返回</el-button>
          </el-form-item>
        </el-form>

        <el-divider />

        <div class="payment-proof-block">
          <div class="payment-proof-title">上传付款凭证并确认已报销</div>
          <el-upload
            v-model:file-list="paymentProofFiles"
            action=""
            :auto-upload="false"
            :limit="10"
            list-type="picture-card"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>

          <el-button type="primary" :loading="paymentSubmitting" @click="submitPaymentProof">
            确认已报销
          </el-button>
        </div>
      </el-card>

      <!-- 返回按钮（非待审核状态） -->
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
import { ElMessage } from 'element-plus'
import { Loading, Plus } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()

// 状态管理
const loading = ref(true)
const submitting = ref(false)
const paymentSubmitting = ref(false)
const reimbursement = ref<any>(null)
const activeLists = ref<number[]>([])
const paymentProofFiles = ref<any[]>([])

// 审核表单
const reviewForm = ref({
  decision: 'REJECT' as 'REJECT' | 'REQUIRES_RESUBMIT',
  comment: ''
})

// 计算属性
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

const getCostDiffClass = computed(() => {
  if (costDiff.value > 0) return 'cost-positive'
  if (costDiff.value < 0) return 'cost-negative'
  return ''
})

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    'PENDING_REVIEW': '待审核',
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

// 加载详情
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

// 提交审核
const submitReview = async () => {
  if (!reviewForm.value.comment) {
    ElMessage.warning('请填写审核意见')
    return
  }

  submitting.value = true
  try {
    await purchasingApi.reviewReimbursement(reimbursement.value.id, {
      decision: reviewForm.value.decision,
      comment: reviewForm.value.comment
    })

    ElMessage.success('审核成功')
    setTimeout(() => {
      router.back()
    }, 1500)
  } catch (error) {
    console.error('审核失败', error)
  } finally {
    submitting.value = false
  }
}

const submitPaymentProof = async () => {
  if (!reimbursement.value?.id) return
  if (!paymentProofFiles.value.length) {
    ElMessage.warning('请先上传至少一张付款凭证')
    return
  }

  const formData = new FormData()
  paymentProofFiles.value.forEach((file) => {
    if (file.raw) {
      formData.append('files', file.raw)
    }
  })

  paymentSubmitting.value = true
  try {
    await purchasingApi.confirmReimbursed(reimbursement.value.id, formData)
    ElMessage.success('已确认报销付款')
    paymentProofFiles.value = []
    await loadDetail()
  } catch (error) {
    console.error('确认已报销失败', error)
  } finally {
    paymentSubmitting.value = false
  }
}

onMounted(() => {
  loadDetail()
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

.action-alert {
  margin-bottom: 20px;
}

.payment-proof-block {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.payment-proof-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
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
  .el-form {
    max-width: 800px;
  }
}

.back-actions {
  text-align: center;
  padding: 24px 0;
}
</style>
