<template>
  <div class="custom-breed-section">
    <div class="section-header">
      <h3>用户自定义品种</h3>
      <el-alert
        type="info"
        :closable="false"
        show-icon
      >
        以下品种由用户在创建档案时手动输入，仅供查看
      </el-alert>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <el-radio-group v-model="sizeFilter" @change="handleFilter">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button :value="DogSizeCategory.SMALL">小型</el-radio-button>
        <el-radio-button :value="DogSizeCategory.MEDIUM">中型</el-radio-button>
        <el-radio-button :value="DogSizeCategory.LARGE">大型</el-radio-button>
        <el-radio-button :value="DogSizeCategory.GIANT">巨型</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Table -->
    <el-card v-loading="loading" shadow="never">
      <el-table :data="displayData" stripe style="width: 100%">
        <el-table-column prop="breedName" label="品种名称" width="200" fixed="left">
          <template #default="{ row }">
            <el-icon style="vertical-align: middle; margin-right: 4px">
              <Document />
            </el-icon>
            {{ row.breedName }}
          </template>
        </el-table-column>

        <el-table-column prop="estimatedSizeCategory" label="体型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getSizeTagType(row.estimatedSizeCategory)">
              {{ getSizeLabel(row.estimatedSizeCategory) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="usageCount" label="使用次数" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.usageCount }} 个档案</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="firstUsedAt" label="首次使用" width="120">
          <template #default="{ row }">
            {{ formatDate(row.firstUsedAt) }}
          </template>
        </el-table-column>

        <el-table-column prop="avgWeight" label="平均体重" width="120" align="right">
          <template #default="{ row }">
            {{ row.avgWeight.toFixed(1) }} kg
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              link
              @click="handleViewDogs(row)"
            >
              查看档案
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Empty State -->
      <div v-if="displayData.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无用户自定义品种" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Document } from '@element-plus/icons-vue'
import { DogSizeCategory, DogSizeLabels } from '@/types/dog'
import type { CustomBreedStats } from '@/types/breed'

interface Props {
  data: CustomBreedStats[]
  loading: boolean
}

const props = defineProps<Props>()
const router = useRouter()
const sizeFilter = ref<string>('')

// 计算显示的数据
const displayData = computed(() => {
  let result = props.data

  // 按体型筛选
  if (sizeFilter.value) {
    result = result.filter(item => item.estimatedSizeCategory === sizeFilter.value)
  }

  return result
})

const getSizeTagType = (size: string) => {
  const typeMap: Record<string, any> = {
    SMALL: 'success',
    MEDIUM: 'primary',
    LARGE: 'warning',
    GIANT: 'danger'
  }
  return typeMap[size] || ''
}

const getSizeLabel = (size: string) => {
  return DogSizeLabels[size as DogSizeCategory] || size
}

const formatDate = (dateStr: string) => {
  return dateStr.slice(0, 10)
}

const handleFilter = () => {
  // 筛选是响应式的，无需额外处理
}

const handleViewDogs = (row: CustomBreedStats) => {
  // 跳转到档案管理页面，并传递筛选参数
  router.push({
    path: '/dogs',
    query: {
      customBreedName: row.breedName
    }
  })
}
</script>

<style scoped>
.custom-breed-section {
  margin-bottom: 20px;
}

.section-header {
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.filter-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  align-items: center;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
}
</style>
