<template>
  <div class="breeds-page">
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h2>品种管理</h2>
        <p class="page-description">新增档案页的快捷品种区已改为按真实建档数据自动显示热门标准品种，无需手动维护；下方标准品种列表默认按建档数降序展示。</p>
      </div>
    </div>

    <!-- System Breeds Section -->
    <el-card class="section-card" style="margin-bottom: 24px">
      <template #header>
        <div class="card-header">
          <span class="card-title">系统预定义品种</span>
          <el-button type="primary" size="small" @click="loadSystemBreeds" :loading="systemBreedsLoading">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      <BreedTable
        :data="systemBreeds"
        :loading="systemBreedsLoading"
        @refresh="handleBreedTableRefresh"
      />
    </el-card>

    <!-- Custom Breeds Section -->
    <el-card class="section-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">自定义品种统计</span>
        </div>
      </template>
      <CustomBreedTable
        :data="customBreeds"
        :loading="customBreedsLoading"
        :system-breeds="systemBreeds"
        @refresh="handleCustomBreedTableRefresh"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import type { DogBreed, CustomBreedStats } from '@/types/breed'
import { breedApi } from '@/api'
import BreedTable from './BreedTable.vue'
import CustomBreedTable from './CustomBreedTable.vue'

const systemBreeds = ref<DogBreed[]>([])
const systemBreedsLoading = ref(false)
const customBreeds = ref<CustomBreedStats[]>([])
const customBreedsLoading = ref(false)

const loadSystemBreeds = async () => {
  systemBreedsLoading.value = true
  try {
    systemBreeds.value = await breedApi.list()
  } catch (error: any) {
    ElMessage.error(error.message || '加载品种列表失败')
  } finally {
    systemBreedsLoading.value = false
  }
}

const loadCustomBreeds = async () => {
  customBreedsLoading.value = true
  try {
    customBreeds.value = await breedApi.getCustomBreeds()
  } catch (error: any) {
    // 如果API不存在，显示空列表而不是错误
    console.warn('加载自定义品种统计失败:', error)
    customBreeds.value = []
  } finally {
    customBreedsLoading.value = false
  }
}

const handleBreedTableRefresh = () => {
  // Reload system breeds
  loadSystemBreeds()
}

const handleCustomBreedTableRefresh = () => {
  loadSystemBreeds()
  loadCustomBreeds()
}

onMounted(() => {
  loadSystemBreeds()
  loadCustomBreeds()
})
</script>

<style scoped>
.breeds-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.page-description {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: #606266;
}

.section-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-subtitle {
  font-size: 13px;
  color: #909399;
  font-weight: normal;
}
</style>
