<template>
  <div class="reimbursement-list-page">
    <!-- 页面标题 -->
    <el-page-header @back="$router.back()" class="page-header">
      <template #content>
        <div class="page-title">报销审核管理</div>
      </template>
    </el-page-header>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="全部报销单" :value="stats.totalReimbursements" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card warning">
          <el-statistic title="待审核" :value="stats.pendingReimbursements" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card success">
          <el-statistic title="报销总额" :value="`¥${stats.totalReimbursementAmount.toFixed(2)}`" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card info">
          <el-statistic title="本月报销单" :value="stats.thisMonthCount" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选和搜索 -->
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            style="width: 150px"
            @change="handleFilter"
          >
            <el-option label="待审核" value="PENDING_REVIEW" />
            <el-option label="已报销" value="REIMBURSED" />
            <el-option label="已驳回" value="REJECTED" />
            <el-option label="需重新提交" value="REQUIRES_RESUBMIT" />
          </el-select>
        </el-form-item>

        <el-form-item label="提交日期">
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
          <el-button type="primary" @click="handleFilter">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 报销单列表 -->
    <el-card shadow="never" class="table-card">
      <el-table
        v-loading="loading"
        :data="reimbursementList"
        style="width: 100%"
        stripe
      >
        <el-table-column prop="claimNumber" label="报销单号" width="150" fixed>
          <template #default="{ row }">
            <el-link type="primary" @click="handleViewDetail(row.id)">
              {{ row.claimNumber }}
            </el-link>
          </template>
        </el-table-column>

        <el-table-column prop="submittedBy.nickname" label="提交人" width="120" />

        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.submittedAt) }}
          </template>
        </el-table-column>

        <el-table-column label="预估金额" width="120" align="right">
          <template #default="{ row }">
            ¥{{ row.totalEstimatedCost.toFixed(2) }}
          </template>
        </el-table-column>

        <el-table-column label="实际金额" width="120" align="right">
          <template #default="{ row }">
            <span :class="{ 'cost-diff': row.totalActualCost !== row.totalEstimatedCost }">
              ¥{{ row.totalActualCost.toFixed(2) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="成本差异" width="120" align="right">
          <template #default="{ row }">
            <span
              :class="getCostDiffClass(row)"
            >
              {{ getCostDifference(row) > 0 ? '+' : '' }}¥{{ Math.abs(getCostDifference(row)).toFixed(2) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="采购清单数" width="100" align="center">
          <template #default="{ row }">
            {{ row.purchaseLists?.length || 0 }}
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="审核信息" width="180">
          <template #default="{ row }">
            <div v-if="row.status !== 'PENDING_REVIEW'">
              <div>{{ row.reviewedBy?.nickname || '-' }}</div>
              <div class="review-time">{{ formatDateTime(row.reviewedAt) }}</div>
            </div>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              @click="handleViewDetail(row.id)"
            >
              查看详情
            </el-button>
            <el-button
              v-if="row.status === 'PENDING_REVIEW'"
              type="primary"
              size="small"
              @click="handleViewDetail(row.id)"
            >
              确认已报销
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 审核对话框 -->
    <el-dialog
      v-model="reviewDialogVisible"
      title="处理报销单"
      width="600px"
    >
      <el-form :model="reviewForm" label-width="100px">
        <el-form-item label="报销单号">
          <el-input v-model="currentReimbursement.claimNumber" disabled />
        </el-form-item>

        <el-form-item label="预估金额">
          <el-input :value="`¥${currentReimbursement.totalEstimatedCost}`" disabled />
        </el-form-item>

        <el-form-item label="实际金额">
          <el-input :value="`¥${currentReimbursement.totalActualCost}`" disabled />
        </el-form-item>

        <el-form-item label="成本差异">
          <el-input
            :value="`${getCostDifference(currentReimbursement) > 0 ? '+' : ''}¥${Math.abs(getCostDifference(currentReimbursement)).toFixed(2)}`"
            disabled
          />
        </el-form-item>

        <el-form-item label="审核决定" required>
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
      </el-form>

      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReview" :loading="submitting">
          提交处理意见
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { purchasingApi } from '@/api/purchasing'
import { ElMessage } from 'element-plus'

const router = useRouter()

// 状态管理
const loading = ref(false)
const submitting = ref(false)
const reimbursementList = ref<any[]>([])
const reviewDialogVisible = ref(false)
const currentReimbursement = ref<any>({})

// 统计数据
const stats = reactive({
  totalReimbursements: 0,
  pendingReimbursements: 0,
  totalReimbursementAmount: 0,
  thisMonthCount: 0
})

// 筛选表单
const filterForm = reactive({
  status: ''
})

const dateRange = ref<[string, string] | null>(null)

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 审核表单
const reviewForm = reactive({
  decision: 'REJECT' as 'REJECT' | 'REQUIRES_RESUBMIT',
  comment: ''
})

// 计算属性
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

const getCostDifference = (row: any) => {
  return row.totalActualCost - row.totalEstimatedCost
}

const getCostDiffClass = (row: any) => {
  const diff = getCostDifference(row)
  if (diff > 0) return 'cost-positive'
  if (diff < 0) return 'cost-negative'
  return ''
}

// 格式化日期时间
const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

// 加载报销单列表
const loadReimbursements = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize
    }

    if (filterForm.status) {
      params.status = filterForm.status
    }

    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }

    const res = await purchasingApi.getReimbursements(params)
    reimbursementList.value = res.list
    pagination.total = res.total
  } catch (error) {
    console.error('加载报销单列表失败', error)
  } finally {
    loading.value = false
  }
}

// 加载统计数据
const loadStatistics = async () => {
  try {
    const res = await purchasingApi.getPurchaseStatistics()
    stats.totalReimbursements = res.totalReimbursements
    stats.pendingReimbursements = res.pendingReimbursements
    stats.totalReimbursementAmount = res.totalReimbursementAmount
    stats.thisMonthCount = res.totalReimbursements // 临时使用总数，后续可添加本月统计
  } catch (error) {
    console.error('加载统计数据失败', error)
  }
}

// 筛选
const handleFilter = () => {
  pagination.page = 1
  loadReimbursements()
}

// 重置
const handleReset = () => {
  filterForm.status = ''
  dateRange.value = null
  pagination.page = 1
  loadReimbursements()
}

// 日期范围变更
const handleDateChange = () => {
  handleFilter()
}

// 分页变更
const handleSizeChange = (size: number) => {
  pagination.pageSize = size
  pagination.page = 1
  loadReimbursements()
}

const handleCurrentChange = (page: number) => {
  pagination.page = page
  loadReimbursements()
}

// 查看详情
const handleViewDetail = (id: string) => {
  router.push({
    path: '/purchasing/reimbursements/detail',
    query: { id }
  })
}

// 提交审核
const submitReview = async () => {
  if (!reviewForm.comment) {
    ElMessage.warning('请填写审核意见')
    return
  }

  submitting.value = true
  try {
    await purchasingApi.reviewReimbursement(currentReimbursement.value.id, {
      decision: reviewForm.decision,
      comment: reviewForm.comment
    })

    ElMessage.success('审核成功')
    reviewDialogVisible.value = false
    loadReimbursements()
    loadStatistics()
  } catch (error) {
    console.error('审核失败', error)
  } finally {
    submitting.value = false
  }
}

// 页面加载
onMounted(() => {
  loadReimbursements()
  loadStatistics()
})
</script>

<style scoped lang="scss">
.reimbursement-list-page {
  padding: 24px;
  background-color: #f5f7fa;
  min-height: 100vh;
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

.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  &.warning :deep(.el-statistic__number) {
    color: #e6a23c;
  }

  &.success :deep(.el-statistic__number) {
    color: #67c23a;
  }

  &.info :deep(.el-statistic__number) {
    color: #409eff;
  }
}

.filter-card {
  margin-bottom: 24px;
}

.filter-form {
  margin-bottom: 0;
}

.table-card {
  .cost-diff {
    color: #e6a23c;
    font-weight: bold;
  }

  .cost-positive {
    color: #f56c6c;
    font-weight: bold;
  }

  .cost-negative {
    color: #67c23a;
    font-weight: bold;
  }

  .review-time {
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
  }

  .text-muted {
    color: #909399;
  }
}

.pagination-wrapper {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
}
</style>
