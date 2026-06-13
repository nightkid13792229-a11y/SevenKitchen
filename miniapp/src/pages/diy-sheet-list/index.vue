<template>
  <view class="diy-sheet-list-page">
    <!-- 页面标题 -->
    <view class="page-header">
      <text class="page-title">我的制作单</text>
    </view>

    <!-- 列表内容 -->
    <view class="list-content">
      <!-- 空状态 -->
      <view v-if="sheetList.length === 0 && !isLoading" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">暂无制作单</text>
        <text class="empty-hint">去DIY食谱页面生成您的第一个制作单吧</text>
        <button class="btn-explore" @tap="goToRecipeList">浏览食谱</button>
      </view>

      <!-- 制作单列表 -->
      <view v-else class="sheet-list">
        <view
          v-for="sheet in sheetList"
          :key="sheet.id"
          class="sheet-card"
          @tap="viewSheet(sheet.id)"
        >
          <!-- 卡片头部 -->
          <view class="card-header">
            <view class="header-left">
              <text class="recipe-emoji">🍖</text>
              <view class="recipe-info">
                <text class="recipe-name">{{ sheet.recipeName }}</text>
                <text class="sheet-meta">{{ sheet.cycleDays }}天周期</text>
              </view>
            </view>
            <text class="card-arrow">›</text>
          </view>

          <!-- 卡片内容 -->
          <view class="card-content">
            <view class="content-row">
              <text class="content-label">用于：</text>
              <text class="content-value">{{ sheet.dogName }}</text>
            </view>
            <view class="content-row">
              <text class="content-label">每餐：</text>
              <text class="content-value">{{ sheet.perMealG }}g</text>
            </view>
            <view class="content-row">
              <text class="content-label">每日：</text>
              <text class="content-value">{{ sheet.dailyIntakeG }}g</text>
            </view>
            <view class="content-row">
              <text class="content-label">创建时间：</text>
              <text class="content-value">{{ formatDate(sheet.createdAt) }}</text>
            </view>
          </view>

          <!-- 卡片底部操作 -->
          <view class="card-actions">
            <button class="action-btn view-btn" @tap.stop="viewSheet(sheet.id)">
              <text class="btn-text">查看</text>
            </button>
            <button class="action-btn delete-btn" @tap.stop="deleteSheet(sheet.id)">
              <text class="btn-text">删除</text>
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- Loading -->
    <view v-if="isLoading" class="loading-overlay">
      <text class="loading-text">加载中...</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'

type PackagePlanItem = {
  packageSpecG: number
  packageCount: number
}

interface DIYSheet {
  id: string
  recipeId: string
  recipeName: string
  dogId: string
  dogName: string
  cycleDays: number
  perMealG: number
  dailyIntakeG: number
  packagePlan?: PackagePlanItem[]
  purchaseList: any
  productionSteps: string
  createdAt: string
}

const sheetList = ref<DIYSheet[]>([])
const isLoading = ref(false)

onMounted(() => {
  loadSheetList()
})

async function loadSheetList() {
  isLoading.value = true

  try {
    const res = await request({
      url: '/user/diy-sheets',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      sheetList.value = res.data
    }
  } catch (error) {
    console.error('[DiySheetList] Load error:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  } finally {
    isLoading.value = false
  }
}

function viewSheet(sheetId: string) {
  // 查找对应的制作单
  const sheet = sheetList.value.find(s => s.id === sheetId)

  if (!sheet) {
    uni.showToast({
      title: '制作单不存在',
      icon: 'none'
    })
    return
  }

  // 跳转到DIY制作单页面，传递必要的参数
  const params = {
    recipeId: sheet.recipeId,
    dogId: sheet.dogId,
    cycleDays: String(sheet.cycleDays),
    perMealG: String(sheet.perMealG),
    dailyIntakeG: String(sheet.dailyIntakeG),
    packagePlan: JSON.stringify(sheet.packagePlan || []),
  }

  uni.navigateTo({
    url: `/pages/diy-sheet/index?recipeId=${encodeURIComponent(params.recipeId)}&dogId=${encodeURIComponent(params.dogId)}&cycleDays=${encodeURIComponent(params.cycleDays)}&perMealG=${encodeURIComponent(params.perMealG)}&dailyIntakeG=${encodeURIComponent(params.dailyIntakeG)}&packagePlan=${encodeURIComponent(params.packagePlan)}`
  })
}

async function deleteSheet(sheetId: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这个制作单吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const deleteRes = await request({
            url: `/user/diy-sheets/${sheetId}`,
            method: 'DELETE'
          })

          if (deleteRes.code === 0) {
            sheetList.value = sheetList.value.filter(s => s.id !== sheetId)
            uni.showToast({
              title: '删除成功',
              icon: 'success'
            })
          } else {
            uni.showToast({
              title: deleteRes.message || '删除失败',
              icon: 'none'
            })
          }
        } catch (error) {
          console.error('[DiySheetList] Delete error:', error)
          uni.showToast({
            title: '删除失败',
            icon: 'none'
          })
        }
      }
    }
  })
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function goToRecipeList() {
  uni.switchTab({
    url: '/pages/home/index'
  })
}
</script>

<style scoped>
.diy-sheet-list-page {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.page-header {
  background-color: #fff;
  padding: 24rpx;
  text-align: center;
  border-bottom: 1rpx solid #e5e5e5;
}

.page-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
}

.list-content {
  padding: 20rpx;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 40rpx;
  background-color: #fff;
  border-radius: 16rpx;
}

.empty-icon {
  font-size: 120rpx;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 32rpx;
  color: #333;
  font-weight: bold;
  margin-bottom: 12rpx;
}

.empty-hint {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 40rpx;
  text-align: center;
}

.btn-explore {
  padding: 20rpx 60rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
}

/* 制作单列表 */
.sheet-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.sheet-card {
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.recipe-emoji {
  font-size: 48rpx;
}

.recipe-info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.recipe-name {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.sheet-meta {
  font-size: 24rpx;
  color: #999;
}

.card-arrow {
  font-size: 32rpx;
  color: #ccc;
}

.card-content {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.content-row {
  display: flex;
  align-items: center;
}

.content-label {
  font-size: 26rpx;
  color: #666;
  width: 140rpx;
  flex-shrink: 0;
}

.content-value {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.card-actions {
  display: flex;
  gap: 12rpx;
  padding: 0 24rpx 24rpx;
}

.action-btn {
  flex: 1;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8rpx;
  font-size: 26rpx;
  border: none;
}

.view-btn {
  background-color: #1890ff;
  color: #fff;
}

.delete-btn {
  background-color: #fff;
  color: #ff4d4f;
  border: 1rpx solid #ff4d4f;
}

.btn-text {
  font-size: 26rpx;
}

/* Loading */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-text {
  font-size: 28rpx;
  color: #666;
}
</style>
