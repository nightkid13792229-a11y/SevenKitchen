<template>
  <view class="container">
    <!-- 体检记录列表 -->
    <view v-if="checkups.length > 0" class="checkup-list">
      <view
        v-for="checkup in checkups"
        :key="checkup.id"
        class="checkup-card"
        @tap="goToEdit(checkup.id)"
      >
        <view class="checkup-header">
          <text class="checkup-type">{{ checkup.checkupType }}</text>
          <text class="checkup-date">{{ checkup.checkupDate }}</text>
        </view>

        <view class="checkup-metrics">
          <view class="metric-item" v-if="checkup.weightKg">
            <text class="metric-label">体重</text>
            <text class="metric-value">{{ checkup.weightKg }}kg</text>
          </view>

          <view class="metric-item" v-if="checkup.bcsScore">
            <text class="metric-label">BCS</text>
            <text class="metric-value">{{ checkup.bcsScore }}分</text>
          </view>

          <view class="metric-item" v-if="checkup.heartRate">
            <text class="metric-label">心率</text>
            <text class="metric-value">{{ checkup.heartRate }}bpm</text>
          </view>

          <view class="metric-item" v-if="checkup.temperature">
            <text class="metric-label">体温</text>
            <text class="metric-value">{{ checkup.temperature }}℃</text>
          </view>
        </view>

        <view v-if="checkup.findings" class="checkup-findings">
          <text class="findings-label">检查发现：</text>
          <text class="findings-text">{{ checkup.findings }}</text>
        </view>

        <view v-if="checkup.recommendations" class="checkup-recommendations">
          <text class="recommendations-label">医生建议：</text>
          <text class="recommendations-text">{{ checkup.recommendations }}</text>
        </view>

        <view class="checkup-actions">
          <text class="delete-btn" @tap.stop="deleteCheckup(checkup.id)">删除</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <view class="empty-icon">🏥</view>
      <text class="empty-title">暂无体检记录</text>
      <text class="empty-desc">定期体检，及时了解爱犬健康状况</text>
    </view>

    <!-- 添加按钮 -->
    <view class="add-btn-wrapper">
      <button class="add-btn" @tap="goToAdd">
        <text class="add-icon">+</text>
        <text>添加体检记录</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getToken, healthApi } from '../../../utils/api'

interface CheckupRecord {
  id: string
  checkupType: string
  checkupDate: string
  weightKg?: number
  bcsScore?: number
  heartRate?: number
  temperature?: number
  findings?: string
  recommendations?: string
  veterinarian?: string
}

const checkups = ref<CheckupRecord[]>([])
const dogId = ref<string>('')

onMounted(async () => {
  const token = getToken()
  if (!token) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
    return
  }

  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  if (options.dogId) {
    dogId.value = options.dogId
    await loadCheckups()
  } else {
    uni.showToast({
      title: '参数错误',
      icon: 'none'
    })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  }
})

async function loadCheckups() {
  try {
    const res = await healthApi.getCheckups(dogId.value)
    if (res.code === 0) {
      checkups.value = res.data.records || []
    }
  } catch (err) {
    console.error('[CheckupList] Failed to load checkups:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function goToAdd() {
  uni.navigateTo({
    url: `/pages/health-management/checkups/edit?dogId=${dogId.value}`
  })
}

function goToEdit(id: string) {
  uni.navigateTo({
    url: `/pages/health-management/checkups/edit?dogId=${dogId.value}&id=${id}`
  })
}

function deleteCheckup(id: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条体检记录吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          // TODO: 删除API待实现
          // await healthApi.deleteCheckup(id)

          await loadCheckups()

          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
        } catch (err) {
          console.error('[CheckupList] Failed to delete checkup:', err)
          uni.showToast({
            title: '删除失败',
            icon: 'none'
          })
        }
      }
    }
  })
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.checkup-list {
  padding: 20rpx;
}

.checkup-card {
  background: white;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.checkup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid #f0f0f0;
}

.checkup-type {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.checkup-date {
  font-size: 26rpx;
  color: #999;
}

.checkup-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.metric-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f8f8f8;
  padding: 16rpx;
  border-radius: 8rpx;
}

.metric-label {
  font-size: 22rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.metric-value {
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
}

.checkup-findings,
.checkup-recommendations {
  background: #f8f8f8;
  border-radius: 8rpx;
  padding: 16rpx;
  margin-bottom: 12rpx;
}

.findings-label,
.recommendations-label {
  display: block;
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
  font-weight: bold;
}

.findings-text,
.recommendations-text {
  display: block;
  font-size: 26rpx;
  color: #333;
  line-height: 1.6;
}

.checkup-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1px solid #f0f0f0;
}

.delete-btn {
  font-size: 26rpx;
  color: #e74c3c;
}

.empty-state {
  background: white;
  border-radius: 12rpx;
  padding: 80rpx 40rpx;
  text-align: center;
  margin: 20rpx;
}

.empty-icon {
  font-size: 96rpx;
  margin-bottom: 24rpx;
}

.empty-title {
  display: block;
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
}

.empty-desc {
  display: block;
  font-size: 26rpx;
  color: #999;
}

.add-btn-wrapper {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20rpx;
  background: white;
  box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.05);
}

.add-btn {
  width: 100%;
  height: 88rpx;
  background: linear-gradient(135deg, #0984e3 0%, #74b9ff 100%);
  color: white;
  border: none;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.add-btn::after {
  border: none;
}

.add-icon {
  font-size: 36rpx;
}
</style>
