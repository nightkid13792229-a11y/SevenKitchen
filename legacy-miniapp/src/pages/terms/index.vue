<template>
  <view class="container">
    <view class="content">
      <view class="title">用户协议</view>
      <view class="update-time">更新日期：2026年5月23日</view>
      <view class="update-time">生效日期：2026年5月23日</view>

      <view class="section">
        <text class="section-title">一、服务内容</text>
        <text class="section-content">
          旧版小程序目前仅保留资料迁移入口，用于登录旧版账号、填写迁移手机号、在新版小程序完成资料同步确认。
        </text>
      </view>

      <view class="section">
        <text class="section-title">二、迁移确认</text>
        <text class="section-content">
          系统会在新版小程序中展示可同步资料摘要。是否同步由您自行确认，未确认前不会进行资料合并。
        </text>
      </view>

      <view class="section">
        <text class="section-title">三、用户行为规范</text>
        <text class="section-content">您应遵守法律法规，不得利用迁移入口从事违法或不当活动。</text>
        <text class="section-content">您应妥善保管账号信息，避免他人冒用。</text>
      </view>

      <view class="section">
        <text class="section-title">四、服务调整</text>
        <text class="section-content">
          由于旧版小程序功能调整，我们可能根据运营安排变更、暂停或终止旧版迁移入口。
        </text>
      </view>

      <view class="section">
        <text class="section-title">五、联系我们</text>
        <text class="section-content">如您对本协议有疑问，请联系管理员。</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
</script>

<style scoped>
.container {
  min-height: 100vh;
  padding: 30rpx;
  background: #fff;
}

.title {
  margin-bottom: 20rpx;
  text-align: center;
  color: #333;
  font-size: 40rpx;
  font-weight: 700;
}

.update-time {
  margin-bottom: 10rpx;
  text-align: center;
  color: #999;
  font-size: 24rpx;
}

.section {
  margin-top: 40rpx;
}

.section-title {
  display: block;
  margin-bottom: 20rpx;
  color: #333;
  font-size: 30rpx;
  font-weight: 700;
}

.section-content {
  display: block;
  margin-bottom: 16rpx;
  color: #666;
  font-size: 26rpx;
  line-height: 1.8;
}
</style>
