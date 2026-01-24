<template>
  <view class="me-container">
    <!-- 未登录状态 -->
    <view v-if="!isLoggedIn" class="not-logged-in">
      <view class="login-avatar">未登录</view>
      <text class="login-title">未登录</text>
      <button class="login-btn" @tap="goToLogin">微信一键登录</button>

      <view class="benefits-section">
        <text class="benefits-title">登录后可享受：</text>
        <view class="benefit-item">创建狗狗档案</view>
        <view class="benefit-item">个性化定制食谱</view>
        <view class="benefit-item">在线下单购买</view>
        <view class="benefit-item">查看订单状态</view>
      </view>
    </view>

    <!-- 已登录状态 -->
    <view v-else class="logged-in">
      <!-- 基本信息板块 -->
      <view class="info-section">
        <view class="section-header">基本信息</view>

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

      <!-- 功能列表 -->
      <view class="function-list">
        <view class="function-item" @tap="goToDogList">
          <text class="function-text">我的狗狗</text>
          <text class="function-count">({{ userInfo.dogCount || 0 }}只)</text>
        </view>

        <view class="function-item" @tap="goToOrderList">
          <text class="function-text">我的订单</text>
          <text class="function-count">({{ userInfo.orderCount || 0 }}笔)</text>
        </view>

        <view class="function-item" @tap="goToAddressList">
          <text class="function-text">收货地址</text>
          <text class="function-count">({{ userInfo.addressCount || 0 }}个)</text>
        </view>

        <view class="function-item" @tap="goToDiySheetList">
          <text class="function-text">我的制作单</text>
          <text class="function-count">({{ userInfo.diySheetCount || 0 }}张)</text>
        </view>

        <view class="function-item" @tap="goToFavoriteRecipes">
          <text class="function-text">收藏的食谱</text>
          <text class="function-count">({{ userInfo.favoriteRecipeCount || 0 }}个)</text>
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
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
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
  diySheetCount: number
  favoriteRecipeCount: number
}

const isLoggedIn = ref(false)
const isLoading = ref(false)
const userInfo = ref<UserInfo>({
  id: '',
  role: 'CUSTOMER',
  dogCount: 0,
  orderCount: 0,
  addressCount: 0,
  diySheetCount: 0,
  favoriteRecipeCount: 0
})

// 标志位：防止更新后立即重新加载
let isJustUpdated = false
let updateTimer: NodeJS.Timeout | null = null

// 加载用户信息
async function loadUserInfo() {
  // 如果刚刚更新过，跳过这次加载
  if (isJustUpdated) {
    return
  }

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

// 跳转我的制作单列表
function goToDiySheetList() {
  uni.navigateTo({
    url: '/pages/diy-sheet-list/index'
  })
}

// 跳转收藏的食谱列表
function goToFavoriteRecipes() {
  uni.navigateTo({
    url: '/pages/favorite-recipes/index'
  })
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
      // 使用后端返回的完整用户信息更新本地状态
      userInfo.value = res.data

      // 设置标志位，防止 onShow 触发的 loadUserInfo 覆盖刚更新的数据
      isJustUpdated = true

      // 清除之前的定时器
      if (updateTimer) {
        clearTimeout(updateTimer)
      }

      // 2秒后重置标志位，允许正常加载
      updateTimer = setTimeout(() => {
        isJustUpdated = false
        updateTimer = null
      }, 2000)

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
          addressCount: 0,
          diySheetCount: 0,
          favoriteRecipeCount: 0
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

onShow(() => {
  // 检查登录状态（每次显示页面时都会执行）
  const token = getToken()
  if (token) {
    loadUserInfo()
  } else {
    isLoggedIn.value = false
  }

  // 更新自定义 TabBar 状态
  // 注意：自定义TabBar会在页面切换时自动检测当前页面路径并更新selected状态
  // 不需要页面主动调用更新方法
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
  font-size: 28rpx;
  color: #999;
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
.info-section {
  background: #fff;
  margin-top: 20rpx;
}

.section-header {
  padding: 24rpx 32rpx;
  font-size: 28rpx;
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

.function-list {
  background: #fff;
  margin-top: 20rpx;
}

.function-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.function-item:last-child {
  border-bottom: none;
}

.function-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.function-count {
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
