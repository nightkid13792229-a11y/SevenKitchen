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
        v-model="filterType"
        placeholder="筛选类型"
        clearable
        style="width: 150px"
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

      <el-button @click="loadData" :icon="Refresh">刷新</el-button>
    </div>

    <!-- Table -->
    <el-card v-loading="loading">
      <el-table
        :data="filteredData"
        stripe
        style="width: 100%"
      >
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

        <el-table-column prop="baseUnit" label="基准单位" width="100" align="center">
          <template #default="{ row }">
            {{ BaseUnitLabels[row.baseUnit] }}
          </template>
        </el-table-column>

        <el-table-column prop="currentPricePerPurchaseUnit" label="采购单价" width="120" align="right">
          <template #default="{ row }">
            ¥{{ formatPrice(row.currentPricePerPurchaseUnit) }} / {{ row.purchaseUnit }}
          </template>
        </el-table-column>

        <el-table-column prop="unitCost" label="单位成本" width="120" align="right">
          <template #default="{ row }">
            ¥{{ formatPrice(row.unitCost) }} / {{ BaseUnitLabels[row.baseUnit] }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              link
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Empty State -->
      <div v-if="filteredData.length === 0 && !loading" class="empty-state">
        <el-empty :description="searchText || filterType ? '未找到匹配的原料' : '暂无原料数据'" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
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
const filterType = ref<string>('')
const dialogVisible = ref(false)
const currentIngredient = ref<IngredientForm | undefined>(undefined)

// Computed
const dialogTitle = computed(() => {
  return currentIngredient.value?.id ? '编辑原料' : '新增原料'
})

const filteredData = computed(() => {
  let result = ingredients.value

  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(item =>
      item.name.toLowerCase().includes(search) ||
      (item.brand && item.brand.toLowerCase().includes(search))
    )
  }

  if (filterType.value) {
    result = result.filter(item => item.type === filterType.value)
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
  // Search is reactive via computed
}

const handleFilter = () => {
  // Filter is reactive via computed
}

const handleCreate = () => {
  currentIngredient.value = undefined
  dialogVisible.value = true
}

const handleEdit = (ingredient: Ingredient) => {
  currentIngredient.value = { ...ingredient }
  dialogVisible.value = true
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
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}
</style>
