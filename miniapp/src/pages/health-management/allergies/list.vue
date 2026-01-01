<template>
  <view class="container">
    <!-- 过敏记录列表 -->
    <view v-if="allergies.length > 0" class="allergy-list">
      <view
        v-for="allergy in allergies"
        :key="allergy.id"
        class="allergy-card"
        @tap="goToEdit(allergy.id)"
      >
        <view class="allergy-header">
          <text class="allergen">{{ allergy.allergen }}</text>
          <view class="allergy-severity" :class="getSeverityClass(allergy.severity)">
            {{ getSeverityText(allergy.severity) }}
          </view>
        </view>

        <view class="allergy-info">
          <view class="info-row">
            <text class="info-label">过敏类型：</text>
            <text class="info-value">{{ getTypeText(allergy.allergenType) }}</text>
          </view>

          <view class="info-row">
            <text class="info-label">发现日期：</text>
            <text class="info-value">{{ allergy.discoveryDate }}</text>
          </view>

          <view class="info-row">
            <text class="info-label">症状表现：</text>
            <text class="info-value">{{ allergy.symptoms }}</text>
          </view>

          <view v-if="allergy.treatment" class="info-row">
            <text class="info-label">处理方式：</text>
            <text class="info-value">{{ allergy.treatment }}</text>
          </view>

          <view v-if="allergy.notes" class="info-row">
            <text class="info-label">备注：</text>
            <text class="info-value">{{ allergy.notes }}</text>
          </view>
        </view>

        <view class="allergy-actions">
          <text class="delete-btn" @tap.stop="deleteAllergy(allergy.id)">删除</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <view class="empty-icon">⚠️</view>
      <text class="empty-title">暂无过敏记录</text>
      <text class="empty-desc">记录过敏信息，避免接触过敏原</text>
    </view>

    <!-- 添加按钮 -->
    <view class="add-btn-wrapper">
      <button class="add-btn" @tap="goToAdd">
        <text class="add-icon">+</text>
        <text>添加过敏记录</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getToken, healthApi } from '../../../utils/api'

interface AllergyRecord {
  id: string
  allergen: string
  allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION'
  discoveryDate: string
  symptoms: string
  severity: 'MILD' | 'MODERATE' | 'SEVERE'
  treatment?: string
  confirmedBy: 'VET' | 'OWNER'
  notes?: string
}

const allergies = ref<AllergyRecord[]>([])
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
    await loadAllergies()
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

async function loadAllergies() {
  try {
    const res = await healthApi.getAllergies(dogId.value)
    if (res.code === 0) {
      allergies.value = res.data.records || []
    }
  } catch (err) {
    console.error('[AllergyList] Failed to load allergies:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function getSeverityClass(severity: string): string {
  if (severity === 'SEVERE') return 'severity-severe'
  if (severity === 'MODERATE') return 'severity-moderate'
  return 'severity-mild'
}

function getSeverityText(severity: string): string {
  if (severity === 'SEVERE') return '重度'
  if (severity === 'MODERATE') return '中度'
  return '轻度'
}

function getTypeText(type: string): string {
  if (type === 'FOOD') return '食物过敏'
  if (type === 'ENVIRONMENTAL') return '环境过敏'
  if (type === 'MEDICATION') return '药物过敏'
  return '其他'
}

function goToAdd() {
  uni.navigateTo({
    url: `/pages/health-management/allergies/edit?dogId=${dogId.value}`
  })
}

function goToEdit(id: string) {
  uni.navigateTo({
    url: `/pages/health-management/allergies/edit?dogId=${dogId.value}&id=${id}`
  })
}

function deleteAllergy(id: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条过敏记录吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          // TODO: 删除API待实现
          // await healthApi.deleteAllergy(id)

          await loadAllergies()

          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
        } catch (err) {
          console.error('[AllergyList] Failed to delete allergy:', err)
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

.allergy-list {
  padding: 20rpx;
}

.allergy-card {
  background: white;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.allergy-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid #f0f0f0;
}

.allergen {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.allergy-severity {
  font-size: 24rpx;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  font-weight: bold;
}

.severity-mild {
  background: #e8f5e9;
  color: #27ae60;
}

.severity-moderate {
  background: #fff3e0;
  color: #ff9800;
}

.severity-severe {
  background: #ffebee;
  color: #e74c3c;
}

.allergy-info {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.info-row {
  display: flex;
  align-items: flex-start;
  font-size: 26rpx;
}

.info-label {
  color: #666;
  flex-shrink: 0;
}

.info-value {
  color: #333;
  flex: 1;
  word-break: break-all;
}

.allergy-actions {
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
  background: linear-gradient(135deg, #d63031 0%, #ff7675 100%);
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
