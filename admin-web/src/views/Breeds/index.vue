<template>
  <div class="breeds-page">
    <!-- Page Header -->
    <div class="page-header">
      <el-button @click="handleBack" :icon="ArrowLeft">返回</el-button>
      <h2>品种管理</h2>
    </div>

    <!-- System Breeds Section -->
    <BreedTable
      :data="systemBreeds"
      :loading="systemBreedsLoading"
      @refresh="loadSystemBreeds"
    />

    <!-- Custom Breeds Section -->
    <CustomBreedTable
      :data="customBreeds"
      :loading="customBreedsLoading"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import type { DogBreed, CustomBreedStats } from '@/types/breed'
import { breedApi } from '@/api'
import BreedTable from './BreedTable.vue'
import CustomBreedTable from './CustomBreedTable.vue'

const router = useRouter()

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

const handleBack = () => {
  router.push('/dogs')
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
</style>
