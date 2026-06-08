<template>
  <view class="container">
    <view class="content">
      <view class="title">隐私政策</view>
      <view class="update-time">更新日期：2026年5月23日</view>
      <view class="update-time">生效日期：2026年5月23日</view>

      <view class="section">
        <text class="section-title">引言</text>
        <text class="section-content">
          旧版小程序目前仅作为资料迁移入口使用。我们会按照法律法规要求保护您的个人信息安全。
        </text>
      </view>

      <view class="section">
        <text class="section-title">一、我们收集的信息</text>
        <text class="section-content">
          1. 登录所需的账号识别信息，用于确认您是否为旧版账号用户。
        </text>
        <text class="section-content">
          2. 您主动填写的手机号，用于在新版小程序中核验同一用户身份，并完成旧版资料迁移确认。
        </text>
        <text class="section-content">
          3. 您在旧版账号中留存的宠物档案、制作记录等历史资料，用于迁移确认和资料同步。
        </text>
      </view>

      <view class="section">
        <text class="section-title">二、信息使用目的</text>
        <text class="section-content">1. 完成旧版账号身份识别与迁移线索提交。</text>
        <text class="section-content">
          2. 在新版小程序中展示历史资料摘要，并由您二次确认是否同步。
        </text>
        <text class="section-content">
          3. 保障账号与资料安全，排查异常登录或异常迁移请求。
        </text>
        <text class="section-content">
          4. 手机号不会用于营销推广或与资料迁移无关的用途。
        </text>
      </view>

      <view class="section">
        <text class="section-title">三、信息的存储与保护</text>
        <text class="section-content">
          我们采取访问控制和日志审计等措施保护您的资料。旧版小程序仅保留资料迁移说明与确认入口。
        </text>
      </view>

      <view class="section">
        <text class="section-title">四、信息共享</text>
        <text class="section-content">
          未经您同意，我们不会向无关第三方共享您的个人信息。法律法规另有规定的除外。
        </text>
      </view>

      <view class="section">
        <text class="section-title">五、您的权利</text>
        <text class="section-content">
          您可以拒绝迁移、暂缓迁移，或在新版小程序中根据提示确认是否同步历史资料。
        </text>
      </view>

      <view class="section">
        <text class="section-title">六、联系我们</text>
        <text class="section-content">如您对本政策有疑问，请联系管理员。</text>
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
