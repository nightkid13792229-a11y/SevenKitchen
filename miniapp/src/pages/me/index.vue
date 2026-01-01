<template>
  <view class="me-container">
    <!-- 未登录状态 -->
    <view v-if="!isLoggedIn" class="not-logged-in">
      <view class="login-avatar">👤</view>
      <text class="login-title">未登录</text>
      <button class="login-btn" @tap="goToLogin">微信一键登录</button>

      <view class="benefits-section">
        <text class="benefits-title">登录后可享受：</text>
        <view class="benefit-item">✓ 创建狗狗档案</view>
        <view class="benefit-item">✓ 个性化定制食谱</view>
        <view class="benefit-item">✓ 在线下单购买</view>
        <view class="benefit-item">✓ 查看订单状态</view>
      </view>
    </view>

    <!-- 已登录状态 -->
    <view v-else class="logged-in">
      <!-- 用户信息卡片（可点击） -->
      <view class="user-card" @tap="editUserInfo">
        <view class="user-avatar">
          <image v-if="userInfo.avatarUrl" :src="userInfo.avatarUrl" class="avatar-img" />
          <text v-else class="avatar-placeholder">👤</text>
        </view>
        <view class="user-info">
          <text class="user-name">{{ userInfo.nickname || '未设置昵称' }}</text>
          <text class="user-phone">{{ userInfo.phone || '未绑定手机' }}</text>
          <view v-if="isStaff" class="user-role-badge">
            <text class="role-text">{{ roleLabel }}</text>
          </view>
        </view>
        <text class="card-arrow">›</text>
      </view>

      <!-- 功能列表 -->
      <view class="function-list">
        <view class="function-item" @tap="goToDogList">
          <view class="function-icon">🐕</view>
          <text class="function-text">我的狗狗</text>
          <text class="function-count">({{ userInfo.dogCount || 0 }}只)</text>
          <text class="arrow">›</text>
        </view>

        <view class="function-item" @tap="goToOrderList">
          <view class="function-icon">📦</view>
          <text class="function-text">我的订单</text>
          <text class="function-count">({{ userInfo.orderCount || 0 }}笔)</text>
          <text class="arrow">›</text>
        </view>

        <view class="function-item" @tap="goToAddressList">
          <view class="function-icon">📍</view>
          <text class="function-text">收货地址</text>
          <text class="function-count">({{ userInfo.addressCount || 0 }}个)</text>
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 员工专属功能 -->
      <view v-if="isStaff" class="staff-section">
        <view class="section-title">员工功能</view>
        <view class="function-list">
          <view class="function-item" @tap="goToProduction">
            <view class="function-icon">🛠</view>
            <text class="function-text">生产管理</text>
            <text class="arrow">›</text>
          </view>
          <view class="function-item" @tap="goToInventory">
            <view class="function-icon">📊</view>
            <text class="function-text">库存管理</text>
            <text class="arrow">›</text>
          </view>
        </view>
      </view>

      <!-- 其他功能 -->
      <view class="function-list">
        <view class="function-item" @tap="contactService">
          <view class="function-icon">📞</view>
          <text class="function-text">联系客服</text>
          <text class="arrow">›</text>
        </view>
        <view class="function-item" @tap="showAbout">
          <view class="function-icon">ℹ️</view>
          <text class="function-text">关于我们</text>
          <text class="arrow">›</text>
        </view>
      </view>

      <!-- 退出登录 -->
      <view class="logout-section">
        <button class="logout-btn" @tap="handleLogout">退出登录</button>
      </view>
    </view>

    <!-- Loading -->
    <view v-if="isLoading" class="loading-overlay">
      <text class="loading-text">加载中...</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getToken, clearToken, request } from '../../utils/api'

interface UserInfo {
  id: string
  phone?: string
  nickname?: string
  avatarUrl?: string
  role: string
  dogCount: number
  orderCount: number
  addressCount: number
}

const isLoggedIn = ref(false)
const isLoading = ref(false)
const userInfo = ref<UserInfo>({
  id: '',
  role: 'CUSTOMER',
  dogCount: 0,
  orderCount: 0,
  addressCount: 0
})

// 是否为员工
const isStaff = computed(() => {
  return userInfo.value.role === 'STAFF' || userInfo.value.role === 'ADMIN'
})

// 角色标签
const roleLabel = computed(() => {
  const roleMap: Record<string, string> = {
    'STAFF': '员工',
    'ADMIN': '管理员'
  }
  return roleMap[userInfo.value.role] || ''
})

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
      isLoggedIn.value = true
    } else {
      // 未登录或加载失败
      isLoggedIn.value = false
    }
  } catch (error) {
    console.error('加载用户信息失败:', error)
    isLoggedIn.value = false
  } finally {
    isLoading.value = false
  }
}

// 跳转登录页
function goToLogin() {
  uni.navigateTo({
    url: '/pages/login/index'
  })
}

// 跳转狗狗列表
function goToDogList() {
  uni.navigateTo({
    url: '/pages/dog-profile-list/index'
  })
}

// 跳转订单列表
function goToOrderList() {
  uni.navigateTo({
    url: '/pages/orders-list/index'
  })
}

// 跳转地址列表
function goToAddressList() {
  uni.navigateTo({
    url: '/pages/address-list/index'
  })
}

// 跳转生产管理（员工功能）
function goToProduction() {
  uni.showToast({
    title: '生产管理功能开发中',
    icon: 'none'
  })
}

// 跳转库存管理（员工功能）
function goToInventory() {
  uni.showToast({
    title: '库存管理功能开发中',
    icon: 'none'
  })
}

// 编辑个人信息（点击顶部卡片）
function editUserInfo() {
  uni.navigateTo({
    url: '/pages/owner-info/index'
  })
}

// 联系客服
function contactService() {
  uni.showModal({
    title: '联系客服',
    content: '客服电话：400-123-4567\n工作时间：9:00-18:00',
    showCancel: false
  })
}

// 关于我们
function showAbout() {
  uni.showModal({
    title: '关于七号厨房',
    content: '七号厨房 v1.0.0\n\n专业的狗狗鲜食定制服务平台\n\n为您的爱犬提供\n科学、健康、定制化的饮食方案',
    showCancel: false
  })
}

// 退出登录
function handleLogout() {
  uni.showModal({
    title: '提示',
    content: '确定要退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        clearToken()
        isLoggedIn.value = false
        userInfo.value = {
          id: '',
          role: 'CUSTOMER',
          dogCount: 0,
          orderCount: 0,
          addressCount: 0
        }
        uni.showToast({
          title: '已退出登录',
          icon: 'success'
        })

        // 退出登录后切换到首页tab
        setTimeout(() => {
          uni.switchTab({
            url: '/pages/home/index'
          })
        }, 500)
      }
    }
  })
}

onMounted(() => {
  // 检查登录状态
  const token = getToken()
  if (token) {
    loadUserInfo()
  } else {
    isLoggedIn.value = false
  }
})
</script>

<style scoped>
.me-container {
  min-height: 100vh;
  background: #f5f5f5;
}

/* 未登录状态 */
.not-logged-in {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 120rpx;
}

.login-avatar {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 80rpx;
  margin-bottom: 32rpx;
}

.login-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 48rpx;
}

.login-btn {
  width: 600rpx;
  height: 88rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  border: none;
  margin-bottom: 80rpx;
}

.benefits-section {
  width: 600rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx;
}

.benefits-title {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 24rpx;
  display: block;
}

.benefit-item {
  font-size: 28rpx;
  color: #333;
  line-height: 48rpx;
}

/* 已登录状态 */
.user-card {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 48rpx 32rpx;
}

.user-avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #fff;
  margin-right: 24rpx;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-img {
  width: 100%;
  height: 100%;
}

.avatar-placeholder {
  font-size: 60rpx;
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #fff;
  margin-bottom: 8rpx;
}

.user-phone {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 8rpx;
}

.user-role-badge {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.2);
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}

.role-text {
  font-size: 24rpx;
  color: #fff;
}

.card-arrow {
  font-size: 48rpx;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 300;
}

.function-list {
  background: #fff;
  margin-top: 20rpx;
}

.function-item {
  display: flex;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.function-item:last-child {
  border-bottom: none;
}

.function-icon {
  font-size: 40rpx;
  margin-right: 24rpx;
}

.function-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.function-count {
  font-size: 24rpx;
  color: #999;
  margin-right: 16rpx;
}

.arrow {
  font-size: 32rpx;
  color: #999;
}

.staff-section {
  margin-top: 20rpx;
}

.section-title {
  padding: 24rpx 32rpx;
  font-size: 24rpx;
  color: #999;
}

.logout-section {
  padding: 40rpx 32rpx;
}

.logout-btn {
  width: 100%;
  height: 88rpx;
  background: #fff;
  color: #ff4d4f;
  border: 1rpx solid #ff4d4f;
  border-radius: 44rpx;
  font-size: 32rpx;
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
