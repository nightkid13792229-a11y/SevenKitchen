<template>
  <div class="dogs-list-page">
    <!-- Header -->
    <div class="page-header">
      <h2>档案管理</h2>
      <div class="header-actions">
        <el-button type="primary" @click="handleCreate">
          <el-icon><Plus /></el-icon>
          新增档案
        </el-button>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <el-input
        v-model="searchText"
        placeholder="搜索姓名 / ID"
        clearable
        style="width: 200px"
        @input="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-select
        v-model="filterBreed"
        placeholder="筛选品种"
        clearable
        style="width: 200px"
        @change="handleFilter"
      >
        <el-option
          v-for="breed in breeds"
          :key="breed.id"
          :label="breed.name"
          :value="breed.id"
        />
      </el-select>
    </div>

    <!-- Table -->
    <el-table
      :data="tableData"
      v-loading="loading"
      stripe
      style="width: 100%"
    >
      <el-table-column prop="name" label="姓名" width="120" />

      <el-table-column prop="breedName" label="品种" width="150">
        <template #default="{ row }">
          {{ row.customBreedName || row.breedName }}
        </template>
      </el-table-column>

      <el-table-column prop="gender" label="性别" width="80" align="center">
        <template #default="{ row }">
          <span :class="`gender-${row.gender.toLowerCase()}`">
            {{ row.gender === 'MALE' ? '♂' : '♀' }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="currentWeightKg" label="体重" width="100" align="right">
        <template #default="{ row }">
          {{ row.currentWeightKg.toFixed(1) }} kg
        </template>
      </el-table-column>

      <el-table-column prop="birthday" label="年龄" width="100">
        <template #default="{ row }">
          {{ calculateAge(row.birthday) }}
        </template>
      </el-table-column>

      <el-table-column prop="bcsScore" label="BCS" width="80" align="center">
        <template #default="{ row }">
          <el-tag
            :type="getBCSType(row.bcsScore)"
            size="small"
          >
            {{ row.bcsScore }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="activityLevel" label="活动水平" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="getActivityLevelType(row.activityLevel)" size="small">
            {{ getActivityLevelLabel(row.activityLevel) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="lifeStageOverride" label="生命阶段" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="getLifeStageType(row.lifeStageOverride)" size="small">
            {{ getLifeStageLabel(row.lifeStageOverride) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="ownerId" label="客户 ID" width="120">
        <template #default="{ row }">
          <el-tooltip :content="row.ownerId" placement="top">
            <span class="id-text">{{ row.ownerId.slice(0, 8) }}...</span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column prop="createdAt" label="创建时间" width="120">
        <template #default="{ row }">
          {{ row.createdAt ? formatDate(row.createdAt) : '-' }}
        </template>
      </el-table-column>

      <el-table-column label="操作" width="240" fixed="right" align="center">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            link
            @click="handleView(row)"
          >
            详情
          </el-button>
          <el-divider direction="vertical" />
          <el-button
            type="primary"
            size="small"
            link
            @click="handleEdit(row)"
          >
            编辑
          </el-button>
          <el-divider direction="vertical" />
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

    <!-- Pagination -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { dogApi } from '@/api/dogs'
import type { DogProfile, DogBreed } from '@/types/dog'
import { calculateAge, ActivityLevelLabels, LifeStageLabels } from '@/types/dog'
import { ActivityLevel, LifeStageOverride } from '@/types/dog'

const router = useRouter()

// Data
const loading = ref(false)
const tableData = ref<DogProfile[]>([])
const breeds = ref<DogBreed[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const searchText = ref('')
const filterBreed = ref<string>('')

// Methods
const loadData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: currentPage.value,
      pageSize: pageSize.value
    }
    if (searchText.value) {
      params.search = searchText.value
    }
    if (filterBreed.value) {
      params.breedId = filterBreed.value
    }

    const response = await dogApi.list(params)
    tableData.value = response.data
    total.value = response.total
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadBreeds = async () => {
  try {
    breeds.value = await dogApi.getBreeds()
  } catch (error: any) {
    console.error('Failed to load breeds:', error)
  }
}

const handleSearch = () => {
  currentPage.value = 1
  loadData()
}

const handleFilter = () => {
  currentPage.value = 1
  loadData()
}

const handlePageChange = () => {
  loadData()
}

const handleSizeChange = () => {
  currentPage.value = 1
  loadData()
}

const handleCreate = () => {
  router.push('/dogs/create')
}

const handleView = (row: DogProfile) => {
  router.push(`/dogs/${row.id}`)
}

const handleEdit = (row: DogProfile) => {
  router.push(`/dogs/${row.id}/edit`)
}

const handleDelete = async (row: DogProfile) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除狗狗档案"${row.name}"吗？此操作不可恢复。`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消'
      }
    )

    await dogApi.delete(row.id)
    ElMessage.success('档案删除成功')

    // Reload data
    if (tableData.value.length === 1 && currentPage.value > 1) {
      currentPage.value -= 1
    }
    loadData()
  } catch (error: any) {
    // 用户取消操作不显示错误
    if (error === 'cancel') {
      return
    }
    ElMessage.error(error.message || '删除失败')
  }
}

const formatDate = (dateStr: string) => {
  return dateStr.slice(0, 10)
}

const getBCSType = (score: number) => {
  if (score <= 3) return 'info'
  if (score <= 5) return 'success'
  return 'warning'
}

const getActivityLevelLabel = (level: string) => {
  return ActivityLevelLabels[level as ActivityLevel] || level
}

const getActivityLevelType = (level: string) => {
  const typeMap: Record<string, any> = {
    [ActivityLevel.RESTING]: 'info',
    [ActivityLevel.LOW]: 'info',
    [ActivityLevel.NORMAL]: 'success',
    [ActivityLevel.HIGH]: 'warning',
    [ActivityLevel.WORKING]: 'danger'
  }
  return typeMap[level] || 'info'
}

const getLifeStageLabel = (stage: string) => {
  if (stage === LifeStageOverride.NONE) return '自动'
  return LifeStageLabels[stage as LifeStageOverride] || stage
}

const getLifeStageType = (stage: string) => {
  const typeMap: Record<string, any> = {
    [LifeStageOverride.NONE]: 'info',
    [LifeStageOverride.PUPPY]: 'success',
    [LifeStageOverride.ADULT]: 'primary',
    [LifeStageOverride.SENIOR]: 'warning',
    [LifeStageOverride.PREGNANCY]: 'danger',
    [LifeStageOverride.LACTATION]: 'danger'
  }
  return typeMap[stage] || 'info'
}

// Lifecycle
onMounted(() => {
  loadData()
  loadBreeds()
})
</script>

<style scoped>
.dogs-list-page {
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

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.id-text {
  color: #606266;
  font-size: 12px;
  cursor: help;
}

.gender-male {
  color: #409eff;
  font-weight: bold;
}

.gender-female {
  color: #f56c6c;
  font-weight: bold;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
