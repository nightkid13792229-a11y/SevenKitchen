<template>
  <view class="container">
    <!-- 筛选Tab -->
    <view class="tab-filter">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        :class="['tab-item', { active: activeTab === tab.value }]"
        @tap="switchTab(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- 疫苗记录列表 -->
    <view v-if="filteredVaccines.length > 0" class="vaccine-list">
      <view
        v-for="vaccine in filteredVaccines"
        :key="vaccine.id"
        class="vaccine-card"
        @tap="goToEdit(vaccine.id)"
      >
        <view class="vaccine-header">
          <text class="vaccine-name">{{ vaccine.vaccineName }}</text>
          <view class="vaccine-status" :class="getVaccineStatusClass(vaccine)">
            {{ getVaccineStatusText(vaccine) }}
          </view>
        </view>

        <view class="vaccine-info">
          <view class="info-row">
            <text class="info-label">接种日期：</text>
            <text class="info-value">{{ vaccine.vaccinationDate }}</text>
          </view>

          <view v-if="vaccine.nextDueDate" class="info-row">
            <text class="info-label">下次接种：</text>
            <text class="info-value">{{ vaccine.nextDueDate }}</text>
          </view>

          <view v-if="vaccine.veterinarian" class="info-row">
            <text class="info-label">接种机构：</text>
            <text class="info-value">{{ vaccine.veterinarian }}</text>
          </view>

          <view v-if="vaccine.notes" class="info-row notes">
            <text class="info-label">备注：</text>
            <text class="info-value">{{ vaccine.notes }}</text>
          </view>
        </view>

        <view class="vaccine-actions">
          <text class="delete-btn" @tap.stop="deleteVaccine(vaccine.id)">删除</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <view class="empty-icon">💉</view>
      <text class="empty-title">暂无疫苗记录</text>
      <text class="empty-desc">记录疫苗接种情况，不再错过接种时间</text>
    </view>

    <!-- 添加按钮 -->
    <view class="add-btn-wrapper">
      <button class="add-btn" @tap="goToAdd">
        <text class="add-icon">+</text>
        <text>添加疫苗记录</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getToken, healthApi } from '../../../utils/api'

interface VaccineRecord {
  id: string
  vaccineName: string
  vaccinationDate: string
  nextDueDate?: string
  veterinarian?: string
  batchNumber?: string
  notes?: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
}

const tabs = [
  { label: '全部', value: 'all' },
  { label: '已接种', value: 'COMPLETED' },
  { label: '待接种', value: 'SCHEDULED' },
  { label: '已过期', value: 'OVERDUE' }
]

const activeTab = ref<string>('all')
const vaccines = ref<VaccineRecord[]>([])
const dogId = ref<string>('')

const filteredVaccines = computed(() => {
  if (activeTab.value === 'all') {
    return vaccines.value
  }
  return vaccines.value.filter(v => v.status === activeTab.value)
})

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

  // 获取从上一页传递的dogId
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  if (options.dogId) {
    dogId.value = options.dogId
    await loadVaccines()
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

async function loadVaccines() {
  try {
    const res = await healthApi.getVaccines(dogId.value)
    if (res.code === 0) {
      vaccines.value = res.data.records || []
    }
  } catch (err) {
    console.error('[VaccineList] Failed to load vaccines:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function switchTab(value: string) {
  activeTab.value = value
}

function getVaccineStatusClass(vaccine: VaccineRecord): string {
  if (vaccine.status === 'OVERDUE') return 'status-overdue'
  if (vaccine.status === 'SCHEDULED') return 'status-scheduled'
  return 'status-completed'
}

function getVaccineStatusText(vaccine: VaccineRecord): string {
  if (vaccine.status === 'OVERDUE') return '已过期'
  if (vaccine.status === 'SCHEDULED') return '待接种'
  return '已接种'
}

function goToAdd() {
  uni.navigateTo({
    url: `/pages/health-management/vaccines/edit?dogId=${dogId.value}`
  })
}

function goToEdit(id: string) {
  uni.navigateTo({
    url: `/pages/health-management/vaccines/edit?dogId=${dogId.value}&id=${id}`
  })
}

function deleteVaccine(id: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条疫苗记录吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          // TODO: 删除API待实现
          // await healthApi.deleteVaccine(id)

          await loadVaccines()

          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
        } catch (err) {
          console.error('[VaccineList] Failed to delete vaccine:', err)
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

/* Tab筛选 */
.tab-filter {
  display: flex;
  background: white;
  padding: 20rpx;
  gap: 10rpx;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  font-size: 26rpx;
  color: #666;
  border-radius: 8rpx;
  background: #f5f5f5;
}

.tab-item.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: bold;
}

/* 疫苗列表 */
.vaccine-list {
  padding: 20rpx;
}

.vaccine-card {
  background: white;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.vaccine-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid #f0f0f0;
}

.vaccine-name {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.vaccine-status {
  font-size: 24rpx;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  font-weight: bold;
}

.status-completed {
  background: #e8f5e9;
  color: #27ae60;
}

.status-scheduled {
  background: #fff3e0;
  color: #ff9800;
}

.status-overdue {
  background: #ffebee;
  color: #e74c3c;
}

.vaccine-info {
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

.info-row.notes {
  padding-top: 12rpx;
  border-top: 1px solid #f5f5f5;
}

.vaccine-actions {
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

/* 空状态 */
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

/* 添加按钮 */
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
