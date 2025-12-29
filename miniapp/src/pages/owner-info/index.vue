<template>
  <view class="container">
    <!-- 基本信息卡片 -->
    <view class="card">
      <view class="card-header">基本信息</view>

      <view class="info-row" @tap="editNickname">
        <view class="info-label">昵称</view>
        <view class="info-value-wrapper">
          <text class="info-value">{{ userInfo.nickname || '未设置' }}</text>
          <text class="arrow">›</text>
        </view>
      </view>

      <view class="info-row" @tap="editPhone">
        <view class="info-label">手机号</view>
        <view class="info-value-wrapper">
          <text class="info-value">{{ userInfo.phone || '未设置' }}</text>
          <text class="arrow">›</text>
        </view>
      </view>

      <view class="info-row">
        <view class="info-label">账户ID</view>
        <view class="info-value-wrapper">
          <text class="info-value info-id">{{ userInfo.id }}</text>
        </view>
      </view>
    </view>

    <!-- 统计信息卡片 -->
    <view class="card">
      <view class="card-header">统计信息</view>

      <view class="stats-row">
        <view class="stat-item">
          <text class="stat-value">{{ userInfo.dogCount }}</text>
          <text class="stat-label">只</text>
        </view>
        <view class="stat-text">当前养犬</view>
      </view>

      <view class="stats-row">
        <view class="stat-item">
          <text class="stat-value">{{ userInfo.orderCount }}</text>
          <text class="stat-label">笔</text>
        </view>
        <view class="stat-text">累计订单</view>
      </view>

      <view class="stats-row">
        <view class="stat-item">
          <text class="stat-value">{{ userInfo.addressCount }}</text>
          <text class="stat-label">个</text>
        </view>
        <view class="stat-text">收货地址</view>
      </view>
    </view>

    <!-- 地址管理 -->
    <view class="card">
      <view class="card-header">地址管理</view>
      <view class="action-row" @tap="goToAddresses">
        <text class="action-text">查看/编辑地址</text>
        <text class="arrow">›</text>
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

interface UserInfo {
  id: string
  phone?: string
  nickname?: string
  role: string
  createdAt: string
  updatedAt: string
  dogCount: number
  orderCount: number
  addressCount: number
}

const userInfo = ref<UserInfo>({
  id: '',
  role: 'CUSTOMER',
  createdAt: '',
  updatedAt: '',
  dogCount: 0,
  orderCount: 0,
  addressCount: 0
})

const isLoading = ref(false)

// 加载用户信息
async function loadUserInfo() {
  isLoading.value = true
  try {
    const res = await request({
      url: '/users/me',
      method: 'GET'
    })

    if (res.code === 0 && res.data) {
      userInfo.value = res.data
    } else {
      uni.showToast({
        title: res.message || '加载失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('加载用户信息失败:', error)
    uni.showToast({
      title: '网络错误',
      icon: 'none'
    })
  } finally {
    isLoading.value = false
  }
}

// 编辑昵称
function editNickname() {
  uni.showModal({
    title: '修改昵称',
    editable: true,
    placeholderText: userInfo.value.nickname || '请输入昵称',
    success: async (res) => {
      if (res.confirm && res.content) {
        const nickname = res.content.trim()
        if (nickname.length < 1 || nickname.length > 20) {
          uni.showToast({
            title: '昵称长度必须在1-20个字符之间',
            icon: 'none'
          })
          return
        }

        await updateUserInfo({ nickname })
      }
    }
  })
}

// 编辑手机号
function editPhone() {
  uni.showModal({
    title: '修改手机号',
    editable: true,
    placeholderText: userInfo.value.phone || '请输入手机号',
    success: async (res) => {
      if (res.confirm && res.content) {
        const phone = res.content.trim()
        const phoneRegex = /^1[3-9]\d{9}$/

        if (!phoneRegex.test(phone)) {
          uni.showToast({
            title: '手机号格式不正确',
            icon: 'none'
          })
          return
        }

        await updateUserInfo({ phone })
      }
    }
  })
}

// 更新用户信息
async function updateUserInfo(data: { nickname?: string; phone?: string }) {
  isLoading.value = true
  try {
    const res = await request({
      url: '/users/me',
      method: 'PUT',
      data
    })

    if (res.code === 0) {
      userInfo.value = { ...userInfo.value, ...data }
      uni.showToast({
        title: '更新成功',
        icon: 'success'
      })
    } else {
      uni.showToast({
        title: res.message || '更新失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('更新用户信息失败:', error)
    uni.showToast({
      title: '网络错误',
      icon: 'none'
    })
  } finally {
    isLoading.value = false
  }
}

// 跳转到地址管理
function goToAddresses() {
  uni.navigateTo({
    url: '/pages/address-list/index'
  })
}

onMounted(() => {
  loadUserInfo()
})
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 20rpx;
}

.card {
  background: #fff;
  border-radius: 12rpx;
  margin-bottom: 20rpx;
  overflow: hidden;
}

.card-header {
  padding: 24rpx 32rpx;
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  border-bottom: 1rpx solid #f0f0f0;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 28rpx;
  color: #666;
}

.info-value-wrapper {
  display: flex;
  align-items: center;
}

.info-value {
  font-size: 28rpx;
  color: #333;
  margin-right: 8rpx;
}

.info-id {
  font-size: 24rpx;
  color: #999;
}

.arrow {
  font-size: 32rpx;
  color: #999;
}

.stats-row {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.stats-row:last-child {
  border-bottom: none;
}

.stat-item {
  display: flex;
  align-items: baseline;
  margin-right: 16rpx;
}

.stat-value {
  font-size: 48rpx;
  font-weight: bold;
  color: #667eea;
}

.stat-label {
  font-size: 24rpx;
  color: #999;
  margin-left: 4rpx;
}

.stat-text {
  font-size: 28rpx;
  color: #666;
}

.action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
}

.action-text {
  font-size: 28rpx;
  color: #333;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.loading-text {
  color: #fff;
  font-size: 28rpx;
}
</style>
