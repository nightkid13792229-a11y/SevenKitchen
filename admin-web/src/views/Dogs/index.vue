<template>
  <div class="dogs-list-page">
    <!-- Header -->
    <div class="page-header">
      <h2>档案管理</h2>
      <el-button type="primary" @click="handleCreate">
        <el-icon><Plus /></el-icon>
        新增档案
      </el-button>
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
      <el-table-column prop="id" label="ID" width="120">
        <template #default="{ row }">
          <el-tooltip :content="row.id" placement="top">
            <span class="id-text">{{ row.id.slice(0, 8) }}...</span>
          </el-tooltip>
        </template>
      </el-table-column>

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

      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            link
            @click="handleView(row)"
          >
            详情
          </el-button>
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
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { dogApi } from '@/api/dogs'
import type { DogProfile, DogBreed } from '@/types/dog'
import { calculateAge } from '@/types/dog'

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

const formatDate = (dateStr: string) => {
  return dateStr.slice(0, 10)
}

const getBCSType = (score: number) => {
  if (score <= 3) return 'info'
  if (score <= 5) return 'success'
  return 'warning'
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
