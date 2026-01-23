<template>
  <view class="favorite-recipes">
    <!-- 空状态 -->
    <view v-if="isLoading" class="loading-state">
      <text class="loading-text">加载中...</text>
    </view>

    <view v-else-if="favorites.length === 0" class="empty-state">
      <text class="icon">⭐</text>
      <text class="title">还没有收藏的食谱</text>
      <text class="desc">去食谱列表逛逛吧</text>
      <button class="btn-browse" @tap="goToRecipeList">浏览食谱</button>
    </view>

    <!-- 食谱列表 -->
    <view v-else class="recipe-list">
      <view
        v-for="item in favorites"
        :key="item.id"
        class="recipe-card"
        @tap="goToRecipeDetail(item.recipe?.recipeId)"
      >
        <image
          v-if="item.recipe?.coverImageUrl"
          class="recipe-cover"
          :src="normalizeImageUrl(item.recipe.coverImageUrl)"
          mode="aspectFill"
        />
        <view v-else class="recipe-cover-placeholder">
          <text class="placeholder-icon">🍖</text>
        </view>

        <view class="recipe-info">
          <text class="recipe-name">{{ item.recipe?.name || '未知食谱' }}</text>
          <text v-if="item.recipe?.description" class="recipe-desc">
            {{ item.recipe.description }}
          </text>

          <view class="recipe-meta">
            <text class="meta-item">
              能量：{{ item.recipe?.energyDensityKcalPerKg || 0 }} kcal/kg
            </text>
          </view>

          <view class="recipe-tags">
            <text
              v-for="(tag, index) in parseHealthTags(item.recipe?.targetHealthTags)"
              :key="index"
              class="tag"
            >
              {{ tag }}
            </text>
          </view>
        </view>

        <view class="recipe-action" @tap.stop="removeFavorite(item.recipeId, item.recipe?.name)">
          <text class="action-icon">🗑️</text>
          <text class="action-text">取消收藏</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getFavorites, removeFavorite as apiRemoveFavorite } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'

interface FavoriteItem {
  id: string
  recipeId: string
  recipe: {
    id: string
    recipeId: string
    version: number
    name: string
    coverImageUrl?: string
    description?: string
    energyDensityKcalPerKg: number
    targetHealthTags: string[]
  } | null
  createdAt: string
}

const favorites = ref<FavoriteItem[]>([])
const isLoading = ref(true)
const currentPage = ref(1)
const pageSize = 20
const total = ref(0)

// 加载收藏列表
async function loadFavorites() {
  isLoading.value = true
  try {
    const result = await getFavorites(currentPage.value, pageSize)
    favorites.value = result.list
    total.value = result.total
  } catch (error) {
    console.error('[FavoriteRecipes] Failed to load favorites:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  } finally {
    isLoading.value = false
  }
}

// 解析健康标签
function parseHealthTags(tags: string[] | undefined): string[] {
  if (!tags || !Array.isArray(tags)) return []
  return tags.slice(0, 3) // 最多显示3个标签
}

// 取消收藏
async function removeFavorite(recipeId: string, recipeName?: string) {
  uni.showModal({
    title: '确认取消收藏',
    content: `确定要取消收藏"${recipeName || '该食谱'}"吗？`,
    success: async (res) => {
      if (res.confirm) {
        try {
          await apiRemoveFavorite(recipeId)
          uni.showToast({
            title: '已取消收藏',
            icon: 'success'
          })
          // 重新加载列表
          await loadFavorites()
        } catch (error) {
          console.error('[FavoriteRecipes] Failed to remove favorite:', error)
          uni.showToast({
            title: (error as Error).message || '取消收藏失败',
            icon: 'none'
          })
        }
      }
    }
  })
}

// 跳转到食谱详情
function goToRecipeDetail(recipeId: string) {
  uni.navigateTo({
    url: `/pages/recipe-detail/index?recipeId=${recipeId}`
  })
}

// 跳转到食谱列表
function goToRecipeList() {
  uni.switchTab({
    url: '/pages/home/index'
  })
}

onMounted(() => {
  loadFavorites()
})

// 页面显示时重新加载（从其他页面返回时）
onShow(() => {
  loadFavorites()
})
</script>

<style scoped>
.favorite-recipes {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}

/* 加载状态 */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
}

.loading-text {
  font-size: 28rpx;
  color: #999;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
}

.icon {
  font-size: 120rpx;
  margin-bottom: 32rpx;
}

.title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
}

.desc {
  font-size: 28rpx;
  color: #999;
  margin-bottom: 48rpx;
}

.btn-browse {
  width: 300rpx;
  height: 72rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 36rpx;
  font-size: 28rpx;
  border: none;
}

/* 食谱列表 */
.recipe-list {
  padding: 20rpx;
}

.recipe-card {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
}

.recipe-cover {
  width: 100%;
  height: 360rpx;
  background: #f0f0f0;
}

.recipe-cover-placeholder {
  width: 100%;
  height: 360rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 100rpx;
}

.recipe-info {
  padding: 24rpx;
}

.recipe-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
  display: block;
}

.recipe-desc {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
  margin-bottom: 16rpx;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.recipe-meta {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}

.meta-item {
  font-size: 24rpx;
  color: #999;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
  font-size: 22rpx;
  color: #667eea;
  background: rgba(102, 126, 234, 0.1);
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
}

.recipe-action {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx;
  border-top: 1rpx solid #f0f0f0;
  background: #fafafa;
}

.action-icon {
  font-size: 32rpx;
  margin-right: 8rpx;
}

.action-text {
  font-size: 28rpx;
  color: #ff4d4f;
}
</style>
