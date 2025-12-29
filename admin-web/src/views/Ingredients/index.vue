<template>
  <div class="ingredients-page">
    <!-- Header -->
    <div class="page-header">
      <h2>原料管理</h2>
      <el-button type="primary" @click="handleCreate" :icon="Plus">
        新增原料
      </el-button>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <el-select
        v-model="filterTypes"
        placeholder="筛选类型"
        clearable
        multiple
        collapse-tags
        collapse-tags-tooltip
        style="width: 200px"
        @change="handleFilter"
      >
        <el-option label="食材" :value="IngredientType.FOOD" />
        <el-option label="补剂" :value="IngredientType.SUPPLEMENT" />
        <el-option label="包材" :value="IngredientType.PACKAGING" />
      </el-select>

      <el-input
        v-model="searchText"
        placeholder="搜索原料名称或品牌"
        clearable
        style="width: 250px"
        @input="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-input
        v-model="minPrice"
        placeholder="最低单价"
        clearable
        style="width: 130px"
        type="number"
        @input="handleFilter"
      >
        <template #prefix>¥</template>
      </el-input>

      <el-input
        v-model="maxPrice"
        placeholder="最高单价"
        clearable
        style="width: 130px"
        type="number"
        @input="handleFilter"
      >
        <template #prefix>¥</template>
      </el-input>

      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        clearable
        style="width: 260px"
        @change="handleFilter"
      />

      <el-button @click="resetFilters">重置</el-button>
      <el-button @click="loadData" :icon="Refresh">刷新</el-button>
    </div>

    <!-- Statistics Panel -->
    <div class="stats-panel">
      <div class="stat-item">
        <span class="stat-label">总计:</span>
        <span class="stat-value">{{ totalCount }} 条</span>
      </div>
      <el-divider direction="vertical" />
      <div class="stat-item">
        <span class="stat-label">食材:</span>
        <span class="stat-value stat-food">{{ typeStats.FOOD }} 条</span>
      </div>
      <el-divider direction="vertical" />
      <div class="stat-item">
        <span class="stat-label">补剂:</span>
        <span class="stat-value stat-supplement">{{ typeStats.SUPPLEMENT }} 条</span>
      </div>
      <el-divider direction="vertical" />
      <div class="stat-item">
        <span class="stat-label">包材:</span>
        <span class="stat-value stat-packaging">{{ typeStats.PACKAGING }} 条</span>
      </div>
      <el-divider direction="vertical" v-if="hasActiveFilters" />
      <div class="stat-item" v-if="hasActiveFilters">
        <span class="stat-label">筛选结果:</span>
        <span class="stat-value stat-filtered">{{ filteredCount }} 条</span>
      </div>
    </div>

    <!-- Table -->
    <el-card v-loading="loading">
      <!-- 批量操作栏 -->
      <div v-if="selectedIngredients.length > 0" class="batch-actions">
        <span class="selected-count">已选择 {{ selectedIngredients.length }} 项</span>
        <el-button type="danger" size="small" @click="handleBatchDelete">
          批量删除
        </el-button>
        <el-button type="primary" size="small" @click="handleExport">
          导出选中
        </el-button>
        <el-button size="small" @click="clearSelection">
          取消选择
        </el-button>
      </div>

      <el-table
        ref="tableRef"
        :data="paginatedData"
        stripe
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="name" label="原料名称" width="180" />

        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getTypeTagType(row.type)">
              {{ IngredientTypeLabels[row.type] }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="brand" label="品牌" width="120">
          <template #default="{ row }">
            {{ row.brand || '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="purchaseUnit" label="采购单位" width="100" align="center">
          <template #default="{ row }">
            {{ row.purchaseUnit }}
          </template>
        </el-table-column>

        <el-table-column prop="currentPricePerPurchaseUnit" label="采购单价" width="120" align="right">
          <template #default="{ row }">
            ¥{{ formatPrice(row.currentPricePerPurchaseUnit) }} / {{ row.purchaseUnit }}
          </template>
        </el-table-column>

        <el-table-column prop="purchaseChannel" label="采购渠道" width="120">
          <template #default="{ row }">
            {{ row.purchaseChannel || '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="notes" label="备注" width="150">
          <template #default="{ row }">
            {{ row.notes || '-' }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              link
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              type="info"
              size="small"
              link
              @click="handleViewUsage(row)"
            >
              使用情况
            </el-button>
            <el-button
              type="danger"
              size="small"
              link
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Empty State -->
      <div v-if="filteredData.length === 0 && !loading" class="empty-state">
        <el-empty :description="searchText || filterTypes.length > 0 ? '未找到匹配的原料' : '暂无原料数据'" />
      </div>

      <!-- Pagination -->
      <div v-if="filteredData.length > 0" class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="pageSizes"
          :total="filteredCount"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- Ingredient Form Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="800px"
      :close-on-click-modal="false"
    >
      <IngredientFormComponent
        :ingredient="currentIngredient"
        @submit="handleSubmit"
        @cancel="dialogVisible = false"
      />
    </el-dialog>

    <!-- Usage Dialog -->
    <el-dialog
      v-model="usageDialogVisible"
      title="原料使用情况"
      width="700px"
    >
      <div v-loading="loadingUsage">
        <div class="usage-header">
          <h3>{{ currentIngredientForUsage?.name }}</h3>
          <el-tag :type="getTypeTagType(currentIngredientForUsage?.type || '')">
            {{ IngredientTypeLabels[currentIngredientForUsage?.type || ''] }}
          </el-tag>
        </div>

        <el-divider />

        <!-- 配方使用情况 -->
        <div class="usage-section">
          <h4>配方使用情况</h4>
          <p v-if="usageRecipes.length === 0" class="empty-usage">
            该原料未被任何配方使用
          </p>
          <el-table v-else :data="usageRecipes" style="width: 100%">
            <el-table-column prop="recipeId" label="配方ID" width="150" />
            <el-table-column prop="recipeName" label="配方名称" width="200" />
            <el-table-column prop="ratioPercent" label="用量比例" width="120">
              <template #default="{ row }">
                {{ row.ratioPercent ? `${row.ratioPercent.toFixed(1)}%` : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="isPrimarySource" label="是否主料" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.isPrimarySource" type="success" size="small">主料</el-tag>
                <el-tag v-else type="info" size="small">辅料</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-divider />

        <!-- 警告提示 -->
        <el-alert
          v-if="usageRecipes.length > 0"
          title="无法删除"
          type="warning"
          :closable="false"
          show-icon
        >
          该原料被 {{ usageRecipes.length }} 个配方使用，删除前需要先修改配方
        </el-alert>
        <el-alert
          v-else
          title="可以删除"
          type="success"
          :closable="false"
          show-icon
        >
          该原料未被任何配方使用，可以安全删除
        </el-alert>
      </div>

      <template #footer>
        <el-button @click="usageDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ElTable } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import { ingredientApi } from '@/api/ingredients'
import {
  IngredientType,
  BaseUnit,
  IngredientTypeLabels,
  BaseUnitLabels,
  type Ingredient,
  type IngredientForm
} from '@/types/ingredient'
import IngredientFormComponent from './IngredientForm.vue'

// Data
const loading = ref(false)
const ingredients = ref<Ingredient[]>([])
const searchText = ref('')
const filterTypes = ref<string[]>([])
const minPrice = ref<number | null>(null)
const maxPrice = ref<number | null>(null)
const dateRange = ref<[Date, Date] | null>(null)
const dialogVisible = ref(false)
const currentIngredient = ref<IngredientForm | undefined>(undefined)
const tableRef = ref<InstanceType<typeof ElTable>>()
const selectedIngredients = ref<Ingredient[]>([])
const usageDialogVisible = ref(false)
const loadingUsage = ref(false)
const currentIngredientForUsage = ref<Ingredient | null>(null)
const usageRecipes = ref<any[]>([])

// Pagination
const currentPage = ref(1)
const pageSize = ref(20)
const pageSizes = [20, 50, 100]

// Computed
const dialogTitle = computed(() => {
  return currentIngredient.value?.id ? '编辑原料' : '新增原料'
})

// 总数统计
const totalCount = computed(() => ingredients.value.length)

// 各类型统计
const typeStats = computed(() => ({
  FOOD: ingredients.value.filter(item => item.type === IngredientType.FOOD).length,
  SUPPLEMENT: ingredients.value.filter(item => item.type === IngredientType.SUPPLEMENT).length,
  PACKAGING: ingredients.value.filter(item => item.type === IngredientType.PACKAGING).length
}))

// 筛选结果数量
const filteredCount = computed(() => filteredData.value.length)

// 是否有激活的筛选条件
const hasActiveFilters = computed(() => {
  return !!(
    searchText.value ||
    (filterTypes.value && filterTypes.value.length > 0) ||
    minPrice.value !== null ||
    maxPrice.value !== null ||
    dateRange.value
  )
})

// 分页数据
const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredData.value.slice(start, end)
})

const filteredData = computed(() => {
  let result = ingredients.value

  // 文本搜索（名称或品牌）
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(item =>
      item.name.toLowerCase().includes(search) ||
      (item.brand && item.brand.toLowerCase().includes(search))
    )
  }

  // 类型筛选（多选）
  if (filterTypes.value && filterTypes.value.length > 0) {
    result = result.filter(item => filterTypes.value.includes(item.type))
  }

  // 价格范围筛选
  if (minPrice.value !== null && minPrice.value !== undefined) {
    result = result.filter(item => item.currentPricePerPurchaseUnit >= minPrice.value!)
  }

  if (maxPrice.value !== null && maxPrice.value !== undefined) {
    result = result.filter(item => item.currentPricePerPurchaseUnit <= maxPrice.value!)
  }

  // 日期范围筛选
  if (dateRange.value && dateRange.value.length === 2) {
    const [startDate, endDate] = dateRange.value
    result = result.filter(item => {
      if (!item.createdAt) return false
      const itemDate = new Date(item.createdAt)
      return itemDate >= startDate && itemDate <= endDate
    })
  }

  return result
})

// Methods
const loadData = async () => {
  loading.value = true
  try {
    ingredients.value = await ingredientApi.list()
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  // 重置到第一页
  currentPage.value = 1
}

const handleFilter = () => {
  // 重置到第一页
  currentPage.value = 1
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  // 滚动到表格顶部
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const handleSizeChange = (size: number) => {
  pageSize.value = size
  // 重置到第一页
  currentPage.value = 1
}

const resetFilters = () => {
  filterTypes.value = []
  searchText.value = ''
  minPrice.value = null
  maxPrice.value = null
  dateRange.value = null
  currentPage.value = 1
}

const handleCreate = () => {
  currentIngredient.value = undefined
  dialogVisible.value = true
}

const handleEdit = (ingredient: Ingredient) => {
  currentIngredient.value = { ...ingredient }
  dialogVisible.value = true
}

const handleViewUsage = async (ingredient: Ingredient) => {
  currentIngredientForUsage.value = ingredient
  usageDialogVisible.value = true
  loadingUsage.value = true

  try {
    const usage = await ingredientApi.getUsage(ingredient.id)
    usageRecipes.value = usage
  } catch (error: any) {
    ElMessage.error(error.message || '获取使用情况失败')
    usageRecipes.value = []
  } finally {
    loadingUsage.value = false
  }
}

const handleDelete = async (ingredient: Ingredient) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除原料"${ingredient.name}"吗？此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    loading.value = true
    await ingredientApi.delete(ingredient.id)
    ElMessage.success('删除成功')
    await loadData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  } finally {
    loading.value = false
  }
}

const handleSelectionChange = (selection: Ingredient[]) => {
  selectedIngredients.value = selection
}

const clearSelection = () => {
  tableRef.value?.clearSelection()
}

const handleBatchDelete = async () => {
  if (selectedIngredients.value.length === 0) {
    ElMessage.warning('请先选择要删除的原料')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIngredients.value.length} 个原料吗？此操作不可恢复。`,
      '批量删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    loading.value = true
    const deletePromises = selectedIngredients.value.map(ing => ingredientApi.delete(ing.id))
    await Promise.all(deletePromises)

    ElMessage.success(`成功删除 ${selectedIngredients.value.length} 个原料`)
    clearSelection()
    await loadData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '批量删除失败')
    }
  } finally {
    loading.value = false
  }
}

const handleExport = () => {
  if (selectedIngredients.value.length === 0) {
    ElMessage.warning('请先选择要导出的原料')
    return
  }

  // 简单CSV导出
  const headers = ['ID', '名称', '类型', '品牌', '采购单位', '采购单价', '单位成本']
  const rows = selectedIngredients.value.map(ing => [
    ing.id,
    ing.name,
    IngredientTypeLabels[ing.type],
    ing.brand || '',
    ing.purchaseUnit,
    ing.currentPricePerPurchaseUnit.toFixed(2),
    ing.unitCost.toFixed(4)
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `ingredients_${new Date().toISOString().slice(0, 10)}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  ElMessage.success(`成功导出 ${selectedIngredients.value.length} 个原料`)
}

const handleSubmit = async (data: IngredientForm) => {
  try {
    loading.value = true
    if (data.id) {
      await ingredientApi.update(data.id, data)
      ElMessage.success('更新成功')
    } else {
      await ingredientApi.create(data)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    await loadData()
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    loading.value = false
  }
}

const formatPrice = (price: number) => {
  return price.toFixed(2)
}

const getTypeTagType = (type: IngredientType) => {
  const typeMap: Record<IngredientType, any> = {
    [IngredientType.FOOD]: 'success',
    [IngredientType.SUPPLEMENT]: 'warning',
    [IngredientType.PACKAGING]: 'info'
  }
  return typeMap[type] || ''
}

// Lifecycle
onMounted(() => {
  loadData()
})
</script>

<style scoped>
.ingredients-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.stats-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 20px;
  background-color: #f5f7fa;
  border-radius: 4px;
  border-left: 4px solid #409eff;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.stat-food {
  color: #67c23a;
}

.stat-supplement {
  color: #e6a23c;
}

.stat-packaging {
  color: #909399;
}

.stat-filtered {
  color: #409eff;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 16px;
}

.selected-count {
  color: #606266;
  font-size: 14px;
  font-weight: 500;
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}

.usage-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.usage-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.usage-section {
  margin: 20px 0;
}

.usage-section h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #606266;
}

.empty-usage {
  color: #909399;
  font-size: 14px;
  text-align: center;
  padding: 20px 0;
}
</style>
