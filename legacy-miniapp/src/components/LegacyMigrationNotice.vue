<template>
  <view class="legacy-notice-page">
    <view class="notice-card">
      <view class="badge">迁移</view>
      <text class="title">{{ title }}</text>
      <text class="desc">{{ description }}</text>

      <view class="steps">
        <text class="step">1. 登录旧版账号并填写迁移手机号</text>
        <text class="step">2. 前往新版小程序授权同一个手机号</text>
        <text class="step">3. 查看资料摘要并二次确认同步</text>
      </view>

      <button class="primary-btn" @tap="goMigration">前往迁移确认</button>
      <button class="secondary-btn" @tap="goHome">返回首页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { openLegacyMigrationEntry } from '../utils/legacy-migration';

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
  }>(),
  {
    title: '旧版小程序仅保留资料迁移入口',
    description:
      '旧版仅用于账号识别和资料迁移确认。请按提示填写迁移手机号，并在新版小程序中完成授权和二次确认。',
  },
);

function goMigration() {
  openLegacyMigrationEntry();
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' });
}
</script>

<style scoped>
.legacy-notice-page {
  min-height: 100vh;
  padding: 56rpx 32rpx;
  box-sizing: border-box;
  background: #f6f7fb;
}

.notice-card {
  padding: 48rpx 36rpx;
  border-radius: 18rpx;
  background: #fff;
  box-shadow: 0 8rpx 28rpx rgba(15, 23, 42, 0.08);
}

.badge {
  width: 96rpx;
  height: 96rpx;
  margin: 0 auto 28rpx;
  border-radius: 50%;
  background: #1677ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 700;
}

.title {
  display: block;
  text-align: center;
  color: #1f2937;
  font-size: 38rpx;
  font-weight: 700;
  line-height: 1.4;
  margin-bottom: 18rpx;
}

.desc {
  display: block;
  color: #667085;
  font-size: 28rpx;
  line-height: 1.7;
  margin-bottom: 34rpx;
}

.steps {
  padding: 24rpx;
  border: 1rpx solid #b7d7ff;
  border-radius: 12rpx;
  background: #f0f7ff;
  margin-bottom: 32rpx;
}

.step {
  display: block;
  color: #344054;
  font-size: 26rpx;
  line-height: 1.8;
}

.primary-btn,
.secondary-btn {
  width: 100%;
  height: 88rpx;
  margin-top: 20rpx;
  border-radius: 10rpx;
  font-size: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.primary-btn {
  background: #1677ff;
  color: #fff;
}

.secondary-btn {
  background: #fff;
  color: #1677ff;
  border: 2rpx solid #1677ff;
}
</style>
