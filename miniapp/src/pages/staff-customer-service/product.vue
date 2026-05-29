<template>
  <view class="cs-product-page">
    <view v-if="loading" class="state-card">正在加载商品咨询...</view>
    <view v-else-if="errorText" class="state-card">
      <text class="state-title">无法打开商品咨询</text>
      <text class="state-copy">{{ errorText }}</text>
      <button class="primary-btn" @tap="goStaffLogin">员工登录</button>
      <button class="ghost-btn" @tap="goHome">返回首页</button>
    </view>
    <view v-else-if="recipe" class="content">
      <view class="hero">
        <image
          v-if="recipe.coverImageUrl"
          class="cover"
          :src="recipe.coverImageUrl"
          mode="aspectFill"
        />
        <view class="hero-info">
          <text class="eyebrow">售前客服视角</text>
          <text class="title">{{ recipe.name || '商品咨询' }}</text>
          <text class="subtitle">客户从商品页发起咨询，当前还没有订单，不能改价或改地址。</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">客服处理建议</text>
        <view class="step-row">
          <text class="step-index">1</text>
          <text class="step-copy">先在企业微信里确认客户咨询的是这个商品。</text>
        </view>
        <view class="step-row">
          <text class="step-index">2</text>
          <text class="step-copy">如需优惠或改地址，让客户先提交订单到待支付状态。</text>
        </view>
        <view class="step-row">
          <text class="step-index">3</text>
          <text class="step-copy">订单生成后，从订单咨询卡片进入客服订单处理页操作。</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">商品信息</text>
        <view class="info-row">
          <text class="label">商品编号</text>
          <text class="value wrap">{{ recipe.id }}</text>
        </view>
        <view class="info-row">
          <text class="label">状态</text>
          <text class="value">{{ recipe.status || '-' }}</text>
        </view>
        <view class="info-row" v-if="recipe.description">
          <text class="label">说明</text>
          <text class="value wrap">{{ recipe.description }}</text>
        </view>
      </view>

      <button class="primary-btn" @tap="openCustomerProductPage">查看客户商品页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

const productId = ref('')
const loading = ref(false)
const errorText = ref('')
const recipe = ref<any>(null)

onLoad((options: any) => {
  productId.value = String(options?.productId || options?.recipeId || '')
  if (!ensureStaff()) return
  if (!productId.value) {
    errorText.value = '缺少商品编号，无法定位客户咨询的商品。'
    return
  }
  loadRecipe()
})

onPullDownRefresh(async () => {
  await loadRecipe()
  uni.stopPullDownRefresh()
})

function ensureStaff() {
  try {
    const user = uni.getStorageSync('userInfo') || uni.getStorageSync('user')
    if (user?.role === 'STAFF' || user?.role === 'ADMIN') return true
  } catch (error) {
    // Continue to the login prompt.
  }
  errorText.value = '请先使用员工或管理员账号登录，再处理商品咨询。'
  return false
}

async function loadRecipe() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await request({
      url: `/recipes/${productId.value}`,
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    })
    recipe.value = res.data
  } catch (error: any) {
    errorText.value = error?.message || '商品加载失败'
  } finally {
    loading.value = false
  }
}

function openCustomerProductPage() {
  uni.navigateTo({
    url: `/pages/recipe-detail/index?recipeId=${encodeURIComponent(productId.value)}`,
  })
}

function goStaffLogin() {
  uni.navigateTo({ url: '/pages/login/staff' })
}

function goHome() {
  uni.switchTab({
    url: '/pages/home/index',
    fail: () => uni.reLaunch({ url: '/pages/home/index' }),
  })
}
</script>

<style scoped>
.cs-product-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f4f6f8;
  box-sizing: border-box;
  color: #1f2933;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.hero,
.section,
.state-card {
  padding: 24rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  background: #ffffff;
  box-sizing: border-box;
}

.hero {
  display: flex;
  gap: 20rpx;
}

.cover {
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  background: #f1f5f9;
  flex-shrink: 0;
}

.hero-info {
  min-width: 0;
  flex: 1;
}

.eyebrow {
  display: block;
  color: #1f7a5a;
  font-size: 24rpx;
  font-weight: 700;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: #111827;
  font-size: 34rpx;
  font-weight: 800;
  line-height: 1.25;
}

.subtitle,
.state-copy {
  display: block;
  margin-top: 10rpx;
  color: #6b7280;
  font-size: 24rpx;
  line-height: 1.5;
}

.section-title,
.state-title {
  display: block;
  margin-bottom: 18rpx;
  color: #111827;
  font-size: 30rpx;
  font-weight: 800;
}

.step-row,
.info-row {
  display: flex;
  gap: 14rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #edf0f2;
}

.step-row:last-child,
.info-row:last-child {
  border-bottom: none;
}

.step-index {
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  background: #e8f5ef;
  color: #157347;
  text-align: center;
  line-height: 40rpx;
  font-size: 24rpx;
  font-weight: 800;
  flex-shrink: 0;
}

.step-copy,
.value {
  flex: 1;
  color: #344054;
  font-size: 26rpx;
  line-height: 1.5;
}

.label {
  width: 150rpx;
  color: #667085;
  font-size: 25rpx;
  line-height: 1.5;
  flex-shrink: 0;
}

.wrap {
  word-break: break-all;
}

.primary-btn,
.ghost-btn {
  width: 100%;
  min-height: 76rpx;
  margin: 0;
  border-radius: 8rpx;
  font-size: 27rpx;
  font-weight: 700;
  line-height: 76rpx;
}

.primary-btn {
  background: #1677ff;
  color: #ffffff;
}

.ghost-btn {
  margin-top: 14rpx;
  background: #ffffff;
  color: #475467;
  border: 1rpx solid #d0d5dd;
}

button::after {
  border: none;
}
</style>
