<template>
  <div class="purchase-history-page">
    <!-- 页面标题 -->
    <el-page-header @back="$router.back()" class="page-header">
      <template #content>
        <div class="page-title">采购历史记录</div>
      </template>
    </el-page-header>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <el-statistic title="采购清单总数" :value="stats.totalLists" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card success">
          <el-statistic title="原料种类总数" :value="stats.totalItems" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card warning">
          <el-statistic title="采购总成本" :value="`¥${stats.totalCost.toFixed(2)}`" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card info">
          <el-statistic title="平均清单成本" :value="`¥${stats.averageCostPerList.toFixed(2)}`" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选和搜索 -->
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="原料">
          <el-select
            v-model="filterForm.ingredientId"
            placeholder="全部原料"
            clearable
            filterable
            style="width: 200px"
            @change="handleFilter"
          >
            <el-option
              v-for="ingredient in ingredientOptions"
              :key="ingredient.value"
              :label="ingredient.label"
              :value="ingredient.value"
            />
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
          <el-button type="primary" @click="handleFilter">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button :icon="Download" @click="handleExport">导出Excel</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 采购历史列表 -->
    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="card-header">
          <span class="title">采购明细列表</span>
        </div>
      </template>

      <el-table
        v-loading="loading"
        :data="purchaseHistory"
        style="width: 100%"
        stripe
        :default-sort="{ prop: 'targetDate', order: 'descending' }"
      >
        <el-table-column label="日期" width="120" sortable="custom">
          <template #default="{ row }">
            {{ formatDate(row.targetDate) }}
          </template>
        </el-table-column>

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

        <el-table-column prop="purchaseChannel" label="采购渠道" width="180" />

        <el-table-column label="预估成本" width="120" align="right" sortable="custom">
          <template #default="{ row }">
            ¥{{ row.estimatedCost.toFixed(2) }}
          </template>
        </el-table-column>

        <el-table-column prop="notes" label="备注" min-width="200" show-overflow-tooltip />

        <el-table-column label="清单状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getListStatusType(row.listStatus)" size="small">
              {{ getListStatusText(row.listStatus) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[20, 50, 100, 200]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { purchasingApi } from '@/api/purchasing'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'

// 状态管理
const loading = ref(false)
const purchaseHistory = ref<any[]>([])

// 统计数据
const stats = reactive({
  totalLists: 0,
  totalItems: 0,
  totalCost: 0,
  averageCostPerList: 0
})

// 筛选表单
const filterForm = reactive({
  ingredientId: ''
})

const dateRange = ref<[string, string] | null>(null)

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 原料选项（后续可以从API获取）
const ingredientOptions = ref<Array<{ value: string; label: string }>>([])

// 获取清单状态文本
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

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 加载采购历史
const loadPurchaseHistory = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize
    }

    if (filterForm.ingredientId) {
      params.ingredientId = filterForm.ingredientId
    }

    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }

    const res = await purchasingApi.getPurchaseHistory(params)
    purchaseHistory.value = res.list
    pagination.total = res.total
  } catch (error) {
    console.error('加载采购历史失败', error)
  } finally {
    loading.value = false
  }
}

// 加载统计数据
const loadStatistics = async () => {
  try {
    const params: any = {}
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }

    const res = await purchasingApi.getPurchaseStatistics(params)
    stats.totalLists = res.totalLists
    stats.totalItems = res.totalItems
    stats.totalCost = res.totalCost
    stats.averageCostPerList = res.averageCostPerList
  } catch (error) {
    console.error('加载统计数据失败', error)
  }
}

// 筛选
const handleFilter = () => {
  pagination.page = 1
  loadPurchaseHistory()
  loadStatistics()
}

// 重置
const handleReset = () => {
  filterForm.ingredientId = ''
  dateRange.value = null
  pagination.page = 1
  loadPurchaseHistory()
  loadStatistics()
}

// 日期范围变更
const handleDateChange = () => {
  handleFilter()
}

// 分页变更
const handleSizeChange = (size: number) => {
  pagination.pageSize = size
  pagination.page = 1
  loadPurchaseHistory()
}

const handleCurrentChange = (page: number) => {
  pagination.page = page
  loadPurchaseHistory()
}

// 导出Excel
const handleExport = async () => {
  try {
    const params: any = {}
    if (filterForm.ingredientId) {
      params.ingredientId = filterForm.ingredientId
    }
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }

    const blob = await purchasingApi.exportPurchaseReport(params)

    // 创建下载链接
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `采购报表_${dateRange.value?.[0] || 'all'}_${dateRange.value?.[1] || 'all'}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出失败', error)
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  loadPurchaseHistory()
  loadStatistics()
})
</script>

<style scoped lang="scss">
.purchase-history-page {
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
  &.success :deep(.el-statistic__number) {
    color: #67c23a;
  }

  &.warning :deep(.el-statistic__number) {
    color: #e6a23c;
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
  .card-header {
    .title {
      font-size: 16px;
      font-weight: bold;
      color: #303133;
    }
  }
}

.pagination-wrapper {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
}
</style>
