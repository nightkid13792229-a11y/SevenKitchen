<template>
  <div class="common-breeds-manager">
    <!-- Current Common Breeds -->
    <div class="section">
      <div class="section-header">
        <h3>当前常见品种列表 ({{ commonBreeds.length }})</h3>
        <el-tag type="info" size="small">从数据库加载 isCommon=true 的品种</el-tag>
      </div>
      <div v-if="loading" v-loading="true" style="min-height: 100px" />
      <div v-else-if="commonBreeds.length === 0" class="empty-state">
        <el-empty description="暂无常见品种，请在下方品种列表中点击「加入常见」" />
      </div>
      <div v-else class="common-breeds-list">
        <div
          v-for="breed in commonBreeds"
          :key="breed.id"
          class="breed-item"
        >
          <el-icon class="breed-icon"><StarFilled /></el-icon>
          <span class="breed-name">{{ breed.name }}</span>
          <el-tag size="small" :type="getSizeTagType(breed.sizeCategory)">
            {{ getSizeLabel(breed.sizeCategory) }}
          </el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { StarFilled } from '@element-plus/icons-vue'
import type { DogBreed } from '@/types/breed'
import { DogSizeCategory } from '@/types/breed'

interface Props {
  allBreeds: DogBreed[]
  loading: boolean
}

const props = defineProps<Props>()

// Filter breeds where isCommon is true
const commonBreeds = computed(() => {
  return props.allBreeds.filter(breed => breed.isCommon === true)
})

// Get size tag type
const getSizeTagType = (sizeCategory: string) => {
  const typeMap: Record<string, string> = {
    'SMALL': 'success',
    'MEDIUM': 'warning',
    'LARGE': 'danger',
    'GIANT': 'info'
  }
  return typeMap[sizeCategory] || 'info'
}

// Get size label
const getSizeLabel = (sizeCategory: string) => {
  const labelMap: Record<string, string> = {
    'SMALL': '小型',
    'MEDIUM': '中型',
    'LARGE': '大型',
    'GIANT': '巨型'
  }
  return labelMap[sizeCategory] || sizeCategory
}
</script>

<style scoped>
.common-breeds-manager {
  padding: 8px 0;
}

.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e4e7ed;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.common-breeds-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.breed-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background-color: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  transition: all 0.3s;
}

.breed-item:hover {
  background-color: #ecf5ff;
  border-color: #409eff;
}

.breed-icon {
  color: #f59e0b;
  font-size: 18px;
}

.breed-name {
  flex: 1;
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}
</style>
