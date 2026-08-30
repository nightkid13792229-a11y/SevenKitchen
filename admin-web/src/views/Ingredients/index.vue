<template>
  <div class="ingredients-page">
    <el-tabs
      v-model="activeCenterTab"
      class="ingredient-center-tabs"
      @tab-change="handleCenterTabChange"
    >
      <el-tab-pane label="标准原料" name="standard">
    <!-- Header -->
    <div class="page-header">
      <h2>原料管理</h2>
      <div class="header-actions">
        <el-button :icon="Plus" @click="openSupplementDialog">新增补剂</el-button>
        <el-button type="primary" @click="handleCreate" :icon="Plus">
          新增标准原料
        </el-button>
      </div>
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

      <el-select
        v-model="filterStrategies"
        placeholder="筛选采购策略"
        clearable
        multiple
        collapse-tags
        collapse-tags-tooltip
        style="width: 220px"
        @change="handleFilter"
      >
        <el-option label="日采" :value="IngredientProcurementStrategy.DAILY_PURCHASE" />
        <el-option label="库存补货" :value="IngredientProcurementStrategy.STOCK_REPLENISHMENT" />
        <el-option label="混合" :value="IngredientProcurementStrategy.HYBRID" />
      </el-select>

      <el-input
        v-model="searchText"
        placeholder="搜索标准原料名称"
        clearable
        style="width: 250px"
        @input="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
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
      <el-divider direction="vertical" />
      <div class="stat-item">
        <span class="stat-label">缺少 DIY SKU:</span>
        <span class="stat-value stat-warning">{{ missingRecommendedSkuCount }} 条</span>
      </div>
      <el-divider direction="vertical" />
      <div class="stat-item">
        <span class="stat-label">缺少采购 SKU:</span>
        <span class="stat-value stat-warning">{{ missingProcurementSkuCount }} 条</span>
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
              {{ getIngredientTypeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="采购策略" width="120">
          <template #default="{ row }">
            <el-tag :type="getProcurementStrategyTagType(row.procurementStrategy)">
              {{ getProcurementStrategyLabel(row.procurementStrategy) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="SKU状态" width="160">
          <template #default="{ row }">
            <div class="sku-status-cell">
              <template v-if="row.type === IngredientType.FOOD">
                <el-tag :type="row.hasActiveRecommendedProduct ? 'success' : 'warning'" size="small">
                  DIY {{ row.hasActiveRecommendedProduct ? '已配' : '缺失' }}
                </el-tag>
                <el-tag :type="row.hasActiveProcurementSku ? 'success' : 'danger'" size="small">
                  采购 {{ row.hasActiveProcurementSku ? '已配' : '缺失' }}
                </el-tag>
              </template>
              <template v-else-if="row.type === IngredientType.SUPPLEMENT">
                <el-tag :type="row.diyEnabled ? 'success' : 'info'" size="small">
                  DIY {{ row.diyEnabled ? '启用' : '关闭' }}
                </el-tag>
                <el-tag :type="row.procurementEnabled ? 'success' : 'info'" size="small">
                  采购 {{ row.procurementEnabled ? '启用' : '关闭' }}
                </el-tag>
              </template>
              <template v-else>
                <el-tag :type="row.procurementEnabled ? 'success' : 'info'" size="small">
                  采购 {{ row.procurementEnabled ? '启用' : '关闭' }}
                </el-tag>
              </template>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="tags" label="标签分类" width="180">
          <template #default="{ row }">
            <el-tag
              v-for="tag in (row.tags || [])"
              :key="tag.id"
              size="small"
              style="margin-right: 4px; margin-bottom: 2px;"
            >
              {{ tag.name }}
            </el-tag>
            <span v-if="!row.tags || row.tags.length === 0" style="color: #909399;">-</span>
          </template>
        </el-table-column>

        <el-table-column prop="cfct_class" label="CFCT分类" width="140">
          <template #default="{ row }">
            <span v-if="row.type === 'FOOD' && row.properties?.cfct_class">
              {{ row.properties.cfct_class }}
            </span>
            <span v-else style="color: #909399;">-</span>
          </template>
        </el-table-column>

        <el-table-column label="DIY推荐" width="120" align="center">
          <template #default="{ row }">
            <template v-if="row.type === IngredientType.FOOD">
              <el-tag :type="row.hasActiveRecommendedProduct ? 'success' : 'info'" size="small">
                {{ row.activeRecommendedProductCount ?? 0 }}/{{ row.recommendedProductCount ?? 0 }}
              </el-tag>
            </template>
            <template v-else-if="row.type === IngredientType.SUPPLEMENT">
              <el-tag :type="row.diyEnabled ? 'success' : 'info'" size="small">
                {{ row.diyEnabled ? '启用' : '关闭' }}
              </el-tag>
            </template>
            <span v-else style="color: #909399;">-</span>
          </template>
        </el-table-column>

        <el-table-column label="采购SKU" width="120" align="center">
          <template #default="{ row }">
            <template v-if="row.type === IngredientType.FOOD">
              <el-tag :type="row.hasActiveProcurementSku ? 'success' : 'info'" size="small">
                {{ row.activeProcurementSkuCount ?? 0 }}/{{ row.procurementSkuCount ?? 0 }}
              </el-tag>
            </template>
            <template v-else>
              <el-tag :type="row.procurementEnabled ? 'success' : 'info'" size="small">
                {{ row.procurementEnabled ? '启用' : '关闭' }}
              </el-tag>
            </template>
          </template>
        </el-table-column>

        <el-table-column prop="notes" label="备注" width="150">
          <template #default="{ row }">
            {{ row.notes || '-' }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button
              type="success"
              size="small"
              link
              @click="handleDuplicate(row)"
            >
              复制新增
            </el-button>
            <el-button
              type="primary"
              size="small"
              link
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canEditNutrition(row.type)"
              type="warning"
              size="small"
              link
              @click="handleEditNutrition(row)"
            >
              营养数据
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
      @close="handleDialogClose"
    >
      <IngredientFormComponent
        :ingredient="currentIngredient"
        :copy-source-name="copySourceName || undefined"
        @submit="handleSubmit"
        @cancel="handleDialogClose"
      />
    </el-dialog>

    <IngredientNutritionDialog
      v-model="nutritionDialogVisible"
      :ingredient="currentIngredientForNutrition"
      @saved="handleNutritionSaved"
    />

    <!-- Usage Dialog -->
    <el-dialog
      v-model="usageDialogVisible"
      title="原料使用情况"
      width="700px"
    >
      <div v-loading="loadingUsage">
        <div class="usage-header">
          <h3>{{ currentIngredientForUsage?.name }}</h3>
          <el-tag :type="getTypeTagType(currentIngredientForUsage?.type)">
            {{ getIngredientTypeLabel(currentIngredientForUsage?.type) }}
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
      </el-tab-pane>

      <el-tab-pane label="营养档案" name="nutrition" lazy>
        <IngredientNutritionGovernancePanel />
      </el-tab-pane>

      <el-tab-pane label="标签体系" name="tags" lazy>
        <IngredientTagsPanel />
      </el-tab-pane>
    </el-tabs>

    <!-- 新增补剂（含拍照识别标签；补剂数据与食谱设计器共用） -->
    <SupplementOptionForm v-model="supplementDialogVisible" @saved="handleSupplementSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ElTable } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import { ingredientApi } from '@/api/ingredients'
import {
  IngredientType,
  IngredientProcurementStrategy,
  IngredientTypeLabels,
  IngredientProcurementStrategyLabels,
  BaseUnitLabels,
  type Ingredient,
  type IngredientForm
} from '@/types/ingredient'
import IngredientFormComponent from './IngredientForm.vue'
import IngredientNutritionDialog from './components/IngredientNutritionDialog.vue'
import IngredientNutritionGovernancePanel from './components/IngredientNutritionGovernancePanel.vue'
import IngredientTagsPanel from './components/IngredientTagsPanel.vue'
import SupplementOptionForm from './components/SupplementOptionForm.vue'
import { getIngredientTypeCapabilities } from '@/utils/ingredientTypeCapabilities'

// Data
type IngredientCenterTab = 'standard' | 'nutrition' | 'tags'

const route = useRoute()
const router = useRouter()
const centerTabs: IngredientCenterTab[] = ['standard', 'nutrition', 'tags']
const loading = ref(false)
const ingredients = ref<Ingredient[]>([])
const searchText = ref('')
const filterTypes = ref<string[]>([])
const filterStrategies = ref<string[]>([])
const dateRange = ref<[Date, Date] | null>(null)
const dialogVisible = ref(false)
const currentIngredient = ref<Ingredient | IngredientForm | undefined>(undefined)
const copySourceName = ref('')
const tableRef = ref<InstanceType<typeof ElTable>>()
const selectedIngredients = ref<Ingredient[]>([])
const usageDialogVisible = ref(false)
const loadingUsage = ref(false)
const currentIngredientForUsage = ref<Ingredient | null>(null)
const usageRecipes = ref<any[]>([])
const nutritionDialogVisible = ref(false)
const currentIngredientForNutrition = ref<Ingredient | null>(null)
const activeCenterTab = ref<IngredientCenterTab>('standard')

// Pagination
const currentPage = ref(1)
const pageSize = ref(20)
const pageSizes = [20, 50, 100]

// Computed
const dialogTitle = computed(() => {
  if (copySourceName.value) {
    return '复制新增标准原料'
  }
  return currentIngredient.value?.id ? '编辑标准原料' : '新增标准原料'
})

const normalizeCenterTab = (value: unknown): IngredientCenterTab => {
  if (value === 'agent') {
    return 'nutrition'
  }

  return typeof value === 'string' && centerTabs.includes(value as IngredientCenterTab)
    ? value as IngredientCenterTab
    : 'standard'
}

watch(
  () => route.query.tab,
  (tab) => {
    activeCenterTab.value = normalizeCenterTab(tab)
  },
  { immediate: true }
)

const handleCenterTabChange = async (tab: string | number) => {
  const nextTab = normalizeCenterTab(String(tab))
  if (route.query.tab === nextTab || (nextTab === 'standard' && !route.query.tab)) {
    return
  }

  await router.replace({
    path: '/ingredients',
    query: nextTab === 'standard' ? {} : { ...route.query, tab: nextTab }
  })
}

// 总数统计
const totalCount = computed(() => ingredients.value.length)

// 各类型统计
const typeStats = computed(() => ({
  FOOD: ingredients.value.filter(item => item.type === IngredientType.FOOD).length,
  SUPPLEMENT: ingredients.value.filter(item => item.type === IngredientType.SUPPLEMENT).length,
  PACKAGING: ingredients.value.filter(item => item.type === IngredientType.PACKAGING).length
}))

const missingRecommendedSkuCount = computed(() => (
  ingredients.value.filter(
    item => item.type === IngredientType.FOOD && !item.hasActiveRecommendedProduct
  ).length
))
const missingProcurementSkuCount = computed(() => (
  ingredients.value.filter(
    item => item.type === IngredientType.FOOD && !item.hasActiveProcurementSku
  ).length
))

// 筛选结果数量
const filteredCount = computed(() => filteredData.value.length)

// 是否有激活的筛选条件
const hasActiveFilters = computed(() => {
  return !!(
    searchText.value ||
    (filterTypes.value && filterTypes.value.length > 0) ||
    (filterStrategies.value && filterStrategies.value.length > 0) ||
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

  // 文本搜索（标准原料名称）
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(item => item.name.toLowerCase().includes(search))
  }

  // 类型筛选（多选）
  if (filterTypes.value && filterTypes.value.length > 0) {
    result = result.filter(item => filterTypes.value.includes(item.type))
  }

  if (filterStrategies.value && filterStrategies.value.length > 0) {
    result = result.filter(item => filterStrategies.value.includes(item.procurementStrategy))
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
  filterStrategies.value = []
  searchText.value = ''
  dateRange.value = null
  currentPage.value = 1
}

const handleCreate = () => {
  copySourceName.value = ''
  currentIngredient.value = undefined
  dialogVisible.value = true
}

// 新增补剂（合并自食谱设计器补剂库，数据与设计器共用）
const supplementDialogVisible = ref(false)

const openSupplementDialog = () => {
  supplementDialogVisible.value = true
}

const handleSupplementSaved = () => {
  // 补剂也是原料（type=SUPPLEMENT），保存后刷新标准原料列表
  if (filterTypes.value.length > 0 && !filterTypes.value.includes(IngredientType.SUPPLEMENT)) {
    filterTypes.value = [...filterTypes.value, IngredientType.SUPPLEMENT]
  }
  handleFilter()
}

const handleDialogClose = () => {
  dialogVisible.value = false
  copySourceName.value = ''
  currentIngredient.value = undefined  // 重置状态，避免污染
}

const handleEdit = async (ingredient: Ingredient) => {
  // Fetch full ingredient details including properties
  try {
    loading.value = true
    copySourceName.value = ''
    const fullIngredient = await ingredientApi.getDetail(ingredient.id)

    // Open dialog first
    dialogVisible.value = true

    // Then set the ingredient data after dialog is mounted
    await nextTick()
    currentIngredient.value = fullIngredient
  } catch (error: any) {
    ElMessage.error(error.message || '获取原料详情失败')
  } finally {
    loading.value = false
  }
}

const handleEditNutrition = async (ingredient: Ingredient) => {
  try {
    loading.value = true
    const fullIngredient = await ingredientApi.getDetail(ingredient.id)
    currentIngredientForNutrition.value = fullIngredient
    nutritionDialogVisible.value = true
  } catch (error: any) {
    ElMessage.error(error.message || '获取原料详情失败')
  } finally {
    loading.value = false
  }
}

const buildDuplicateName = (sourceName: string) => {
  const suffix = '（副本）'
  const maxLength = 50
  const existingNames = new Set(ingredients.value.map(item => item.name))

  const trimBaseName = (name: string, currentSuffix: string) => {
    const allowedLength = Math.max(maxLength - currentSuffix.length, 1)
    return name.slice(0, allowedLength)
  }

  let candidate = `${trimBaseName(sourceName, suffix)}${suffix}`
  if (!existingNames.has(candidate)) {
    return candidate
  }

  let index = 2
  while (index < 1000) {
    const indexedSuffix = `（副本${index}）`
    candidate = `${trimBaseName(sourceName, indexedSuffix)}${indexedSuffix}`
    if (!existingNames.has(candidate)) {
      return candidate
    }
    index += 1
  }

  return `${trimBaseName(sourceName, '（复制）')}（复制）`
}

const cloneIngredientValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const buildDuplicateDraft = (ingredient: Ingredient): IngredientForm => ({
  name: buildDuplicateName(ingredient.name),
  type: ingredient.type,
  procurementStrategy: ingredient.procurementStrategy,
  brand: ingredient.brand || '',
  productModel: ingredient.productModel || '',
  purchaseChannel: ingredient.purchaseChannel || '',
  diyEnabled: ingredient.diyEnabled ?? false,
  procurementEnabled: ingredient.procurementEnabled ?? false,
  notes: ingredient.notes || '',
  baseUnit: ingredient.baseUnit,
  baseUnitDisplayName: ingredient.baseUnitDisplayName || ingredient.unitDisplayLabel || '',
  weightG: ingredient.weightG ?? undefined,
  maxCapacityG: ingredient.maxCapacityG ?? undefined,
  properties: cloneIngredientValue(ingredient.properties),
  nutritionProfile: cloneIngredientValue(ingredient.nutritionProfile),
  tagIds: ingredient.tagIds ? [...ingredient.tagIds] : [],
  tags: ingredient.tags ? cloneIngredientValue(ingredient.tags) : [],
  purchaseUnit: ingredient.purchaseUnit || '',
  purchaseToBaseRatio: ingredient.purchaseToBaseRatio ?? undefined,
  currentPricePerPurchaseUnit: ingredient.currentPricePerPurchaseUnit ?? undefined,
  effectivePricePerPurchaseUnit: ingredient.effectivePricePerPurchaseUnit ?? undefined,
  safetyStock: ingredient.safetyStock ?? undefined,
  reorderPoint: ingredient.reorderPoint ?? undefined,
  targetStock: ingredient.targetStock ?? undefined
})

const canEditNutrition = (type: IngredientType) =>
  getIngredientTypeCapabilities(type).supportsNutritionEditing

const handleDuplicate = async (ingredient: Ingredient) => {
  try {
    loading.value = true
    copySourceName.value = ''

    const fullIngredient = await ingredientApi.getDetail(ingredient.id)
    const duplicateDraft = buildDuplicateDraft(fullIngredient)

    dialogVisible.value = true
    copySourceName.value = fullIngredient.name

    await nextTick()
    currentIngredient.value = duplicateDraft
  } catch (error: any) {
    ElMessage.error(error.message || '复制原料失败')
  } finally {
    loading.value = false
  }
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
  const headers = ['ID', '名称', '类型', '采购策略', 'DIY SKU', '采购 SKU', '标准单位', '标准单位展示名']
  const rows = selectedIngredients.value.map(ing => [
    ing.id,
    ing.name,
    IngredientTypeLabels[ing.type],
    getProcurementStrategyLabel(ing.procurementStrategy),
    String(ing.activeRecommendedProductCount || 0),
    String(ing.activeProcurementSkuCount || 0),
    BaseUnitLabels[ing.baseUnit],
    ing.baseUnitDisplayName || ''
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
    const isCopyCreate = !data.id && !!copySourceName.value
    if (data.id) {
      await ingredientApi.update(data.id, data)
      ElMessage.success('更新成功')
      dialogVisible.value = false
      copySourceName.value = ''
      currentIngredient.value = undefined  // 重置状态，避免污染
    } else {
      const createdIngredient = await ingredientApi.create(data)
      copySourceName.value = ''
      if (
        createdIngredient.type === IngredientType.FOOD ||
        createdIngredient.type === IngredientType.SUPPLEMENT
      ) {
        currentIngredient.value = createdIngredient
        await nextTick()
        if (createdIngredient.type === IngredientType.FOOD) {
          ElMessage.success(isCopyCreate ? '复制新增成功，可继续补充采购 SKU' : '标准原料已创建，可继续补充采购 SKU')
        } else {
          ElMessage.success(isCopyCreate ? '复制新增成功，可继续上传产品图片' : '标准原料已创建，可继续上传产品图片')
        }
      } else {
        dialogVisible.value = false
        currentIngredient.value = undefined
        ElMessage.success(isCopyCreate ? '复制新增成功' : '标准原料已创建')
      }
    }
    await loadData()
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  } finally {
    loading.value = false
  }
}

const handleNutritionSaved = async () => {
  await loadData()
  if (currentIngredientForNutrition.value?.id) {
    currentIngredientForNutrition.value = await ingredientApi.getDetail(currentIngredientForNutrition.value.id)
  }
}

const getIngredientTypeLabel = (type?: string) => {
  return (type && IngredientTypeLabels[type]) || '未知类型'
}

const getProcurementStrategyLabel = (strategy?: string) => {
  return (strategy && IngredientProcurementStrategyLabels[strategy]) || '未设置'
}

const getTypeTagType = (type?: string) => {
  const typeMap: Record<string, any> = {
    [IngredientType.FOOD]: 'success',
    [IngredientType.SUPPLEMENT]: 'warning',
    [IngredientType.PACKAGING]: 'info'
  }
  return (type && typeMap[type]) || ''
}

const getProcurementStrategyTagType = (strategy?: string) => {
  const typeMap: Record<string, any> = {
    [IngredientProcurementStrategy.DAILY_PURCHASE]: 'info',
    [IngredientProcurementStrategy.STOCK_REPLENISHMENT]: 'success',
    [IngredientProcurementStrategy.HYBRID]: 'warning'
  }
  return (strategy && typeMap[strategy]) || 'info'
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

.ingredient-center-tabs {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 0 16px 16px;
}

.ingredient-center-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
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

.sku-status-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
