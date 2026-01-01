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

    <!-- 病历记录列表 -->
    <view v-if="filteredRecords.length > 0" class="record-list">
      <view
        v-for="record in filteredRecords"
        :key="record.id"
        class="record-card"
        @tap="goToEdit(record.id)"
      >
        <view class="record-header">
          <text class="record-diagnosis">{{ record.diagnosis }}</text>
          <view class="record-status" :class="getStatusClass(record.status)">
            {{ getStatusText(record.status) }}
          </view>
        </view>

        <view class="record-info">
          <view class="info-row">
            <text class="info-label">就诊日期：</text>
            <text class="info-value">{{ record.visitDate }}</text>
          </view>

          <view class="info-row">
            <text class="info-label">主诉症状：</text>
            <text class="info-value">{{ record.chiefComplaint }}</text>
          </view>

          <view v-if="record.treatment" class="info-row">
            <text class="info-label">治疗方案：</text>
            <text class="info-value">{{ record.treatment }}</text>
          </view>

          <view v-if="record.followUpDate" class="info-row">
            <text class="info-label">复查日期：</text>
            <text class="info-value">{{ record.followUpDate }}</text>
          </view>

          <view v-if="record.veterinarian" class="info-row">
            <text class="info-label">就诊机构：</text>
            <text class="info-value">{{ record.veterinarian }}</text>
          </view>
        </view>

        <view class="record-actions">
          <text class="delete-btn" @tap.stop="deleteRecord(record.id)">删除</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty-state">
      <view class="empty-icon">📋</view>
      <text class="empty-title">暂无病历记录</text>
      <text class="empty-desc">记录就诊病历，方便跟踪治疗情况</text>
    </view>

    <!-- 添加按钮 -->
    <view class="add-btn-wrapper">
      <button class="add-btn" @tap="goToAdd">
        <text class="add-icon">+</text>
        <text>添加病历记录</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getToken, healthApi } from '../../../utils/api'

interface MedicalRecord {
  id: string
  diagnosis: string
  visitDate: string
  chiefComplaint: string
  treatment?: string
  status: 'TREATING' | 'RECOVERED' | 'CHRONIC'
  followUpDate?: string
  veterinarian?: string
}

const tabs = [
  { label: '全部', value: 'all' },
  { label: '治疗中', value: 'TREATING' },
  { label: '已痊愈', value: 'RECOVERED' },
  { label: '慢性病', value: 'CHRONIC' }
]

const activeTab = ref<string>('all')
const records = ref<MedicalRecord[]>([])
const dogId = ref<string>('')

const filteredRecords = computed(() => {
  if (activeTab.value === 'all') {
    return records.value
  }
  return records.value.filter(r => r.status === activeTab.value)
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

  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  if (options.dogId) {
    dogId.value = options.dogId
    await loadRecords()
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

async function loadRecords() {
  try {
    const res = await healthApi.getMedicalRecords(dogId.value)
    if (res.code === 0) {
      records.value = res.data.records || []
    }
  } catch (err) {
    console.error('[MedicalRecordList] Failed to load records:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }
}

function switchTab(value: string) {
  activeTab.value = value
}

function getStatusClass(status: string): string {
  if (status === 'TREATING') return 'status-treating'
  if (status === 'CHRONIC') return 'status-chronic'
  return 'status-recovered'
}

function getStatusText(status: string): string {
  if (status === 'TREATING') return '治疗中'
  if (status === 'CHRONIC') return '慢性病'
  return '已痊愈'
}

function goToAdd() {
  uni.navigateTo({
    url: `/pages/health-management/medical-records/edit?dogId=${dogId.value}`
  })
}

function goToEdit(id: string) {
  uni.navigateTo({
    url: `/pages/health-management/medical-records/edit?dogId=${dogId.value}&id=${id}`
  })
}

function deleteRecord(id: string) {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这条病历记录吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          // TODO: 删除API待实现
          // await healthApi.deleteMedicalRecord(id)

          await loadRecords()

          uni.showToast({
            title: '删除成功',
            icon: 'success'
          })
        } catch (err) {
          console.error('[MedicalRecordList] Failed to delete record:', err)
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
  background: linear-gradient(135deg, #e17055 0%, #fab1a0 100%);
  color: white;
  font-weight: bold;
}

.record-list {
  padding: 20rpx;
}

.record-card {
  background: white;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20rpx;
  padding-bottom: 16rpx;
  border-bottom: 1px solid #f0f0f0;
}

.record-diagnosis {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
  margin-right: 12rpx;
}

.record-status {
  font-size: 24rpx;
  padding: 4rpx 12rpx;
  border-radius: 4rpx;
  font-weight: bold;
  flex-shrink: 0;
}

.status-recovered {
  background: #e8f5e9;
  color: #27ae60;
}

.status-treating {
  background: #e3f2fd;
  color: #2196f3;
}

.status-chronic {
  background: #f3e5f5;
  color: #9c27b0;
}

.record-info {
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

.record-actions {
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
  background: linear-gradient(135deg, #e17055 0%, #fab1a0 100%);
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
