<template>
  <view class="staff-recipes-page">
    <!-- 状态筛选 -->
    <view class="filter-bar">
      <view
        v-for="option in statusOptions"
        :key="option.value"
        class="filter-item"
        :class="{ active: currentStatus === option.value }"
        @tap="filterByStatus(option.value)"
      >
        <text>{{ option.label }}</text>
      </view>
    </view>

    <!-- 食谱列表 -->
    <view v-if="loading" class="loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="recipes.length === 0" class="empty">
      <text class="empty-text">暂无食谱</text>
    </view>

    <view v-else class="recipe-list">
      <view
        v-for="recipe in recipes"
        :key="recipe.id"
        class="recipe-card"
        @tap="goToDetail(recipe.id)"
      >
        <!-- 封面图 -->
        <view class="recipe-cover">
          <image
            v-if="recipe.coverImageUrl"
            :src="recipe.coverImageUrl"
            mode="aspectFill"
            class="cover-image"
          />
          <view v-else class="cover-placeholder">
            <text class="placeholder-text">{{ recipe.name.charAt(0) }}</text>
          </view>
          <!-- 状态标签 -->
          <view class="status-badge" :class="getStatusClass(recipe.status)">
            <text class="status-text">{{ getStatusLabel(recipe.status) }}</text>
          </view>
        </view>

        <!-- 食谱信息 -->
        <view class="recipe-info">
          <text class="recipe-name">{{ recipe.name }}</text>
          <view class="recipe-tags">
            <text
              v-for="stage in (recipe.applicableLifeStages || []).slice(0, 3)"
              :key="stage"
              class="tag life-stage"
            >
              {{ getLifeStageLabel(stage) }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'
import { getLifeStageLabel } from '../../utils/label-mapping'

interface StaffRecipe {
  id: string
  version: number
  name: string
  status: string
  coverImageUrl?: string
  applicableLifeStages: string[]
  targetHealthTags: string[]
  createdAt: string
}

const recipes = ref<StaffRecipe[]>([])
const loading = ref(false)
const currentStatus = ref('')

const statusOptions = [
  { label: '全部', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '公开', value: 'PUBLIC' },
  { label: '私密定制', value: 'PRIVATE_CUSTOM' },
]

onMounted(() => {
  loadRecipes()
})

async function loadRecipes() {
  loading.value = true
  try {
    const data: any = {}
    if (currentStatus.value) data.status = currentStatus.value
    const res: any = await request({
      url: '/recipes/staff/all',
      method: 'GET',
      data,
    })
    recipes.value = res.data || []
  } catch (error) {
    console.error('[StaffRecipes] Failed to load recipes:', error)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function filterByStatus(status: string) {
  currentStatus.value = status
  loadRecipes()
}

function goToDetail(recipeId: string) {
  uni.navigateTo({
    url: `/pages/recipe-detail/index?recipeId=${recipeId}`
  })
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    'DRAFT': '草稿',
    'PUBLIC': '公开',
    'PRIVATE_CUSTOM': '私密定制',
  }
  return map[status] || status
}

function getStatusClass(status: string): string {
  const map: Record<string, string> = {
    'DRAFT': 'badge-draft',
    'PUBLIC': 'badge-public',
    'PRIVATE_CUSTOM': 'badge-private',
  }
  return map[status] || ''
}

</script>

<style scoped lang="scss">
.staff-recipes-page {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.filter-bar {
  display: flex;
  padding: 24rpx 32rpx;
  background-color: #fff;
  gap: 16rpx;
  border-bottom: 1rpx solid #eee;
}

.filter-item {
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  font-size: 26rpx;
  background-color: #f5f5f5;
  color: #666;

  &.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
  }
}

.loading,
.empty {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 120rpx 0;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
}

.recipe-list {
  padding: 24rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.recipe-card {
  display: flex;
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

  &:active {
    transform: scale(0.98);
  }
}

.recipe-cover {
  width: 200rpx;
  height: 200rpx;
  flex-shrink: 0;
  position: relative;
}

.cover-image {
  width: 100%;
  height: 100%;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.placeholder-text {
  font-size: 64rpx;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
}

.status-badge {
  position: absolute;
  top: 8rpx;
  left: 8rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;

  .status-text {
    font-size: 20rpx;
    color: #fff;
  }
}

.badge-draft {
  background-color: rgba(158, 158, 158, 0.85);
}

.badge-public {
  background-color: rgba(7, 193, 96, 0.85);
}

.badge-private {
  background-color: rgba(255, 107, 107, 0.85);
}

.recipe-info {
  flex: 1;
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12rpx;
}

.recipe-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.tag {
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
  font-size: 20rpx;
}

.life-stage {
  background-color: #e3f2fd;
  color: #1976d2;
}
</style>
