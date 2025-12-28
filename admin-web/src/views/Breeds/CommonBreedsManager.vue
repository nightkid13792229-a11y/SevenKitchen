<template>
  <div class="common-breeds-manager">
    <!-- Current Common Breeds -->
    <div class="section">
      <div class="section-header">
        <h3>当前常见品种列表 ({{ commonBreeds.length }})</h3>
        <el-tag type="info" size="small">按住拖拽可调整顺序</el-tag>
      </div>
      <div v-if="commonBreeds.length === 0" class="empty-state">
        <el-empty description="暂无常见品种，请从下方添加" />
      </div>
      <div v-else class="common-breeds-list">
        <div
          v-for="(breed, index) in commonBreeds"
          :key="breed"
          class="breed-item"
          draggable="true"
          @dragstart="handleDragStart(index)"
          @dragover.prevent
          @drop="handleDrop(index)"
          @dragend="handleDragEnd"
        >
          <el-icon class="drag-handle"><Rank /></el-icon>
          <span class="breed-name">{{ breed }}</span>
          <el-button
            type="danger"
            size="small"
            link
            @click="handleRemoveCommonBreed(index)"
          >
            <el-icon><Close /></el-icon>
            移除
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Rank, Close } from '@element-plus/icons-vue'

// Default common breeds (fallback if localStorage is empty)
const DEFAULT_COMMON_BREEDS = [
  '拉布拉多', '泰迪', '贵宾犬(小型)', '贵宾犬(标准)', '金毛',
  '比熊', '哈士奇', '德牧', '边牧', '柯基',
  '萨摩耶', '法国斗牛犬', '吉娃娃', '博美', '雪纳瑞(小型)',
  '约克夏', '马尔济斯', '腊肠犬', '阿拉斯加', '杜宾'
]

interface Props {
  allBreeds: any[] // Not used anymore, kept for compatibility
  loading: boolean
}

interface Emits {
  (e: 'refresh'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Local storage key
const STORAGE_KEY = 'sevenkitchen_common_breeds'

// Data
const commonBreeds = ref<string[]>([])

// Load common breeds from localStorage
const loadCommonBreeds = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      commonBreeds.value = JSON.parse(stored)
    } else {
      commonBreeds.value = [...DEFAULT_COMMON_BREEDS]
    }
  } catch (error) {
    console.error('Failed to load common breeds:', error)
    commonBreeds.value = [...DEFAULT_COMMON_BREEDS]
  }
}

// Save common breeds to localStorage
const saveCommonBreeds = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(commonBreeds.value))
    emit('refresh')
  } catch (error) {
    console.error('Failed to save common breeds:', error)
    ElMessage.error('保存失败，请检查浏览器存储权限')
  }
}

// Expose loadCommonBreeds for parent component to call
defineExpose({
  loadCommonBreeds
})

// Remove breed from common list
const handleRemoveCommonBreed = (index: number) => {
  const breed = commonBreeds.value[index]
  commonBreeds.value.splice(index, 1)
  saveCommonBreeds()
  ElMessage.success(`已移除"${breed}"`)
}

// Drag and drop handlers
let draggedIndex: number | null = null

const handleDragStart = (index: number) => {
  draggedIndex = index
}

const handleDrop = (dropIndex: number) => {
  if (draggedIndex === null || draggedIndex === dropIndex) return

  const item = commonBreeds.value.splice(draggedIndex, 1)[0]
  commonBreeds.value.splice(dropIndex, 0, item)

  draggedIndex = null
  saveCommonBreeds()
}

const handleDragEnd = () => {
  draggedIndex = null
}

// Load on mount
loadCommonBreeds()
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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

.drag-handle {
  cursor: grab;
  color: #909399;
}

.drag-handle:active {
  cursor: grabbing;
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
