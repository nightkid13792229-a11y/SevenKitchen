<template>
  <div class="breed-table-section">
    <div class="section-header">
      <h3>系统预定义品种</h3>
      <el-button type="primary" @click="handleCreate" :icon="Plus">
        新增品种
      </el-button>
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

      <el-input
        v-model="searchText"
        placeholder="搜索品种名称/体重"
        clearable
        style="width: 250px"
        @input="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- Table -->
    <el-card v-loading="loading" shadow="never">
      <el-table :data="displayData" stripe style="width: 100%">
        <el-table-column prop="name" label="品种名称" width="150" fixed="left" />

        <el-table-column prop="sizeCategory" label="体型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getSizeTagType(row.sizeCategory)">
              {{ getSizeLabel(row.sizeCategory) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="adultAgeMonths" label="成年月龄" width="100" align="center">
          <template #default="{ row }">
            {{ row.adultAgeMonths }}个月
          </template>
        </el-table-column>

        <el-table-column prop="seniorAgeYears" label="老年年龄" width="100" align="center">
          <template #default="{ row }">
            {{ row.seniorAgeYears }}岁
          </template>
        </el-table-column>

        <el-table-column prop="averageAdultWeightKg" label="平均体重" width="120" align="right">
          <template #default="{ row }">
            {{ row.averageAdultWeightKg ? row.averageAdultWeightKg.toFixed(1) + 'kg' : '-' }}
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="创建时间" width="120">
          <template #default="{ row }">
            {{ isSystemBreed(row) ? '系统预设' : formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="250" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              type="success"
              size="small"
              link
              @click="handleToggleCommonBreed(row)"
            >
              <el-icon><StarFilled v-if="isCommonBreed(row.name)" /><Star v-else /></el-icon>
              {{ isCommonBreed(row.name) ? '已在常见' : '加入常见' }}
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
      <div v-if="filteredData.length > 0" class="pagination-container">
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

      <!-- Empty State -->
      <div v-if="displayData.length === 0 && !loading" class="empty-state">
        <el-empty :description="searchText || sizeFilter ? '未找到匹配的品种' : '暂无品种数据'" />
      </div>
    </el-card>

    <!-- Breed Form Dialog -->
    <BreedFormComponent
      v-model:visible="dialogVisible"
      :breed="currentBreed"
      @submit="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Star, StarFilled } from '@element-plus/icons-vue'
import { DogSizeCategory, DogSizeLabels } from '@/types/dog'
import type { DogBreed, BreedForm } from '@/types/breed'
import { breedApi } from '@/api'
import BreedFormComponent from './BreedForm.vue'

interface Props {
  data: DogBreed[]
  loading: boolean
}

interface Emits {
  (e: 'refresh'): void
}

const STORAGE_KEY = 'sevenkitchen_common_breeds'

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const searchText = ref('')
const sizeFilter = ref<string>('')
const dialogVisible = ref(false)
const currentBreed = ref<DogBreed | null>(null)
const currentPage = ref(1)
const pageSize = ref(10)
const commonBreeds = ref<string[]>([])

// Load common breeds from localStorage
const loadCommonBreeds = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      commonBreeds.value = JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load common breeds:', error)
  }
}

// Save common breeds to localStorage
const saveCommonBreeds = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(commonBreeds.value))
  } catch (error) {
    console.error('Failed to save common breeds:', error)
  }
}

// Check if breed is in common list
const isCommonBreed = (breedName: string) => {
  return commonBreeds.value.includes(breedName)
}

// Toggle breed in common list
const handleToggleCommonBreed = (breed: DogBreed) => {
  const index = commonBreeds.value.indexOf(breed.name)
  if (index > -1) {
    // Remove
    commonBreeds.value.splice(index, 1)
    ElMessage.success(`已从常见品种移除"${breed.name}"`)
  } else {
    // Add
    if (commonBreeds.value.length >= 20) {
      ElMessage.warning('常见品种最多只能添加20个')
      return
    }
    commonBreeds.value.push(breed.name)
    ElMessage.success(`已将"${breed.name}"加入常见品种`)
  }
  saveCommonBreeds()
  // Notify parent to refresh common breeds manager
  emit('refresh')
}

// Load on mount
loadCommonBreeds()

// 计算筛选后的数据
const filteredData = computed(() => {
  let result = props.data

  // 按体型筛选
  if (sizeFilter.value) {
    result = result.filter(item => item.sizeCategory === sizeFilter.value)
  }

  // 按搜索文本筛选
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    result = result.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(search)
      const weightMatch = item.averageAdultWeightKg?.toString().includes(search)
      return nameMatch || weightMatch
    })
  }

  return result
})

// 计算分页后的数据
const displayData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredData.value.slice(start, end)
})

// 计算总数
const total = computed(() => filteredData.value.length)

// 处理页码变化
const handlePageChange = (page: number) => {
  currentPage.value = page
}

// 处理每页数量变化
const handleSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1 // 重置到第一页
}

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

const isSystemBreed = (breed: DogBreed) => {
  // 假设2024年之前创建的是系统预设品种
  return new Date(breed.createdAt).getFullYear() < 2024
}

const handleFilter = () => {
  // 筛选改变时重置到第一页
  currentPage.value = 1
}

const handleSearch = () => {
  // 搜索改变时重置到第一页
  currentPage.value = 1
}

const handleCreate = () => {
  currentBreed.value = null
  dialogVisible.value = true
}

const handleEdit = (breed: DogBreed) => {
  currentBreed.value = breed
  dialogVisible.value = true
}

const handleSubmit = async (data: BreedForm) => {
  try {
    if (data.id) {
      await breedApi.update(data.id, data)
      ElMessage.success('品种更新成功')
    } else {
      await breedApi.create(data)
      ElMessage.success('品种创建成功')
    }
    dialogVisible.value = false
    emit('refresh')
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  }
}

const handleDelete = async (breed: DogBreed) => {
  try {
    // 检查品种使用情况
    const usage = await breedApi.checkUsage(breed.id)

    if (usage.count > 0) {
      // 有狗狗在使用该品种，显示警告
      const dogList = usage.dogs
        .map(d => `- ${d.name} (ID: ${d.id})`)
        .join('\n')

      await ElMessageBox.alert(
        `该品种正在被 ${usage.count} 只狗狗使用，无法删除。\n\n使用该品种的狗狗：\n${dogList}`,
        '无法删除',
        {
          type: 'warning',
          confirmButtonText: '我知道了'
        }
      )
      return
    }

    // 无狗狗使用，显示确认对话框
    await ElMessageBox.confirm(
      `确定要删除品种"${breed.name}"吗？此操作不可恢复。`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消'
      }
    )

    // 用户确认后执行删除
    await breedApi.delete(breed.id)
    ElMessage.success('品种删除成功')
    emit('refresh')
  } catch (error: any) {
    // 用户取消操作不显示错误
    if (error === 'cancel') {
      return
    }
    ElMessage.error(error.message || '删除失败')
  }
}
</script>

<style scoped>
.breed-table-section {
  margin-bottom: 40px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0;
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

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding: 16px 0;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
}
</style>
