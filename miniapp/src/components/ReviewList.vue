<template>
  <view class="review-section">
    <view class="section-header">
      <text class="section-title">食谱评分</text>
      <text v-if="totalCount > 0" class="review-count">({{ totalCount }}条评价)</text>
    </view>

    <!-- 评分汇总卡 -->
    <view v-if="totalCount > 0" class="summary-card">
      <view class="summary-row" v-for="dim in summaryDimensions" :key="dim.key">
        <text class="summary-label">{{ dim.label }}</text>
        <view class="summary-stars">
          <text
            v-for="star in 5"
            :key="star"
            class="summary-star"
            :class="{ active: avgRating[dim.key] >= star }"
          >{{ avgRating[dim.key] >= star ? '★' : '☆' }}</text>
        </view>
        <text class="summary-score">{{ avgRating[dim.key].toFixed(1) }}</text>
      </view>
    </view>

    <!-- 用户评价标题 -->
    <view v-if="reviews.length > 0" class="review-sub-header">
      <text class="review-sub-title">用户评价</text>
    </view>

    <!-- 评论列表 -->
    <view v-if="reviews.length > 0" class="review-list">
      <view v-for="review in reviews" :key="review.id" class="review-card">
        <!-- 用户信息行 -->
        <view class="review-user-row">
          <image
            v-if="review.user?.avatarUrl"
            :src="normalizeImageUrl(review.user.avatarUrl)"
            class="user-avatar"
            mode="aspectFill"
          />
          <view v-else class="user-avatar avatar-placeholder">
            <text class="avatar-text">{{ (review.user?.nickname || '用户').charAt(0) }}</text>
          </view>
          <view class="user-info">
            <view class="user-name-row">
              <text class="user-name">{{ review.user?.nickname || '匿名用户' }}</text>
              <text v-if="review.source === 'PURCHASED'" class="source-tag source-purchased">已购买</text>
              <text v-else-if="review.source === 'DIY'" class="source-tag source-diy">DIY制作</text>
            </view>
          </view>
          <!-- 发布日期（右上角） -->
          <text class="review-date">{{ formatDate(review.createdAt) }}</text>
          <!-- 删除按钮：只有自己的评论才显示 -->
          <view
            v-if="currentUserId && review.userId === currentUserId"
            class="btn-delete"
            @tap="handleDelete(review.id)"
          >
            <text class="delete-text">删除</text>
          </view>
        </view>

        <!-- 评分 -->
        <view class="review-ratings">
          <DimensionRating
            :model-value="{ ease: review.ratingEase, value: review.ratingValue, taste: review.ratingTaste }"
            :readonly="true"
          />
        </view>

        <!-- 评论内容 -->
        <text class="review-content">{{ review.content }}</text>

        <!-- 图片 -->
        <view v-if="getPhotos(review.photos).length > 0" class="review-photos">
          <image
            v-for="(photo, idx) in getPhotos(review.photos)"
            :key="idx"
            :src="normalizeImageUrl(photo)"
            class="review-photo"
            mode="aspectFill"
            @tap="previewPhotos(getPhotos(review.photos), idx)"
          />
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && reviews.length === 0 && loaded" class="empty-state">
      <text class="empty-icon">📝</text>
      <text class="empty-text">暂无评价，快来分享你的制作体验吧</text>
    </view>

    <!-- 加载更多 -->
    <view v-if="hasMore" class="load-more" @tap="loadMore">
      <text class="load-more-text">{{ loading ? '加载中...' : '加载更多' }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { reviewApi } from '../utils/api'
import { normalizeImageUrl } from '../utils/config'
import DimensionRating from './DimensionRating.vue'

const props = defineProps<{
  recipeId: string
}>()

const reviews = ref<any[]>([])
const avgRating = ref({ ease: 0, value: 0, taste: 0 })
const totalCount = ref(0)
const currentPage = ref(1)
const totalPages = ref(0)
const loading = ref(false)
const loaded = ref(false)
const currentUserId = ref<string | null>(null)

const hasMore = computed(() => currentPage.value < totalPages.value)

const summaryDimensions = [
  { key: 'ease' as const, label: '容易制作' },
  { key: 'value' as const, label: '性价比高' },
  { key: 'taste' as const, label: '小狗爱吃' },
]

onMounted(() => {
  const user = uni.getStorageSync('user')
  currentUserId.value = user?.id || null
})

// 等待父组件传入 recipeId 后再加载评论
watch(() => props.recipeId, (newVal) => {
  if (newVal) {
    loadReviews(1)
  }
}, { immediate: true })

async function loadReviews(page: number = 1) {
  if (loading.value) return
  if (!props.recipeId) return
  loading.value = true

  try {
    const result = await reviewApi.getReviews(props.recipeId, page, 10)
    if (result) {
      avgRating.value = result.avgRating || { ease: 0, value: 0, taste: 0 }
      totalCount.value = result.totalCount || 0
      totalPages.value = result.totalPages || 0
      currentPage.value = result.page || page

      if (page === 1) {
        reviews.value = result.list || []
      } else {
        reviews.value.push(...(result.list || []))
      }
    }
  } catch (error) {
    console.error('Load reviews error:', error)
  } finally {
    loading.value = false
    loaded.value = true
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  loadReviews(currentPage.value + 1)
}

async function handleDelete(reviewId: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条评价吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await reviewApi.deleteReview(reviewId)
          uni.showToast({ title: '已删除', icon: 'success' })
          // 重新加载评论列表
          loadReviews(1)
        } catch (error: any) {
          uni.showToast({ title: error.message || '删除失败', icon: 'none' })
        }
      }
    },
  })
}

function getPhotos(photos: any): string[] {
  if (!photos) return []
  if (Array.isArray(photos)) return photos
  try {
    return JSON.parse(String(photos))
  } catch {
    return []
  }
}

function previewPhotos(urls: string[], index: number) {
  const normalizedUrls = urls.map((u: string) => normalizeImageUrl(u))
  uni.previewImage({
    urls: normalizedUrls,
    current: normalizedUrls[index],
  })
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`

  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 暴露刷新方法
defineExpose({ refresh: () => loadReviews(1) })
</script>

<style scoped>
.review-section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.review-count {
  font-size: 24rpx;
  color: #999;
  margin-left: 8rpx;
}

/* 汇总卡片 */
.summary-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.summary-row {
  display: flex;
  align-items: center;
  padding: 8rpx 0;
}

.summary-label {
  font-size: 26rpx;
  color: #666;
  min-width: 140rpx;
}

.summary-stars {
  flex: 1;
  display: flex;
  gap: 4rpx;
}

.summary-star {
  font-size: 28rpx;
  color: #d0d0d0;
}

.summary-star.active {
  color: #FFB800;
}

.summary-score {
  font-size: 28rpx;
  font-weight: bold;
  color: #FFB800;
  min-width: 60rpx;
  text-align: right;
}

/* 评论列表 */
.review-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.review-card {
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.review-card:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.review-user-row {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.user-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  margin-right: 16rpx;
}

.avatar-placeholder {
  background-color: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-text {
  font-size: 28rpx;
  color: #999;
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.user-name {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.source-tag {
  font-size: 20rpx;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
  font-weight: normal;
}

.source-purchased {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.source-diy {
  background-color: #fff3e0;
  color: #ef6c00;
}

.review-time {
  font-size: 22rpx;
  color: #999;
  margin-top: 4rpx;
}

.review-date {
  font-size: 22rpx;
  color: #bbb;
  margin-left: auto;
  white-space: nowrap;
}

/* 评价子标题 */
.review-sub-header {
  margin-top: 24rpx;
  margin-bottom: 16rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.review-sub-title {
  font-size: 28rpx;
  font-weight: 500;
  color: #666;
}

.btn-delete {
  padding: 8rpx 16rpx;
}

.delete-text {
  font-size: 24rpx;
  color: #999;
}

.review-ratings {
  margin-bottom: 12rpx;
}

.review-content {
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  display: block;
  margin-bottom: 12rpx;
}

.review-photos {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}

.review-photo {
  width: 160rpx;
  height: 160rpx;
  border-radius: 8rpx;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 0;
}

.empty-icon {
  font-size: 80rpx;
  margin-bottom: 16rpx;
}

.empty-text {
  font-size: 26rpx;
  color: #999;
}

/* 加载更多 */
.load-more {
  display: flex;
  justify-content: center;
  padding: 24rpx 0 8rpx;
}

.load-more-text {
  font-size: 26rpx;
  color: #1890ff;
}
</style>
