<template>
  <view class="container">
    <view class="content">
      <view class="title">隐私政策</view>
      <view class="update-time">更新日期：2026年5月21日</view>
      <view class="update-time">生效日期：2026年5月21日</view>

      <view class="section">
        <text class="section-title">引言</text>
        <text class="section-content"
          >欢迎使用"Seven的厨房"小程序（以下简称"我们"）。我们深知个人信息对您的重要性，您的信赖是我们最宝贵的财富。我们将按照法律法规要求，采取相应安全保护措施，尽力保护您的个人信息安全可控。</text
        >
        <text class="section-content"
          >本隐私政策旨在向您说明我们如何收集、使用、存储、共享和保护您的个人信息，以及您享有的相关权利。</text
        >
      </view>

      <view class="section">
        <text class="section-title">一、我们收集的信息</text>
        <text class="section-content"
          >为了向您提供宠物鲜食订购及相关服务，我们需要收集以下信息：</text
        >
        <text class="section-content"
          >1.
          账号信息：当您使用微信登录时，我们会获取您的微信昵称、头像、openid/unionid等用于识别账号的必要信息。</text
        >
        <text class="section-content"
          >2.
          手机号信息：当您使用下单、支付、查看订单、售后等核心功能时，我们会通过微信授权手机号或您主动填写的方式收集手机号，用于账号识别、历史资料同步、订单履约及售后联系。</text
        >
        <text class="section-content"
          >3.
          收货地址信息：为了向您配送商品，我们需要您提供收货人姓名、联系电话、收货地址等信息。</text
        >
        <text class="section-content"
          >4.
          宠物信息：为了给您提供个性化的食谱推荐，您可以选择性地提供宠物名称、品种、体重、年龄等信息。</text
        >
        <text class="section-content"
          >5.
          订单信息：包括您订购的商品信息、支付金额、下单时间等交易记录。</text
        >
      </view>

      <view class="section">
        <text class="section-title">二、我们如何使用收集的信息</text>
        <text class="section-content">我们收集的信息将用于以下目的：</text>
        <text class="section-content">1. 处理您的订单并安排配送；</text>
        <text class="section-content">2. 为您提供个性化的宠物食谱推荐；</text>
        <text class="section-content"
          >3. 与您沟通订单状态、配送进度等信息；</text
        >
        <text class="section-content"
          >4.
          使用手机号帮助您识别并同步历史订单、宠物资料、收货地址、售后记录等资料；</text
        >
        <text class="section-content">5. 改进我们的产品和服务；</text>
        <text class="section-content">6. 遵守法律法规的要求。</text>
      </view>

      <view class="section">
        <text class="section-title">三、信息的存储与保护</text>
        <text class="section-content"
          >1. 我们将在中华人民共和国境内收集和产生的个人信息存储在境内。</text
        >
        <text class="section-content"
          >2.
          我们采用业界领先的技术保护措施，包括但不限于数据加密、访问控制、安全审计等，以保护您的个人信息安全。</text
        >
        <text class="section-content"
          >3. 我们会采取合理可行的措施，尽力避免收集无关的个人信息。</text
        >
      </view>

      <view class="section">
        <text class="section-title">四、信息的共享</text>
        <text class="section-content"
          >除以下情形外，未经您同意，我们不会与任何第三方分享您的个人信息：</text
        >
        <text class="section-content"
          >1. 为完成配送服务，我们需要将收货信息提供给物流配送服务商；</text
        >
        <text class="section-content"
          >2.
          为完成支付服务，我们需要将支付相关信息提供给微信支付等支付服务商；</text
        >
        <text class="section-content">3. 法律法规规定的其他情形。</text>
      </view>

      <view class="section">
        <text class="section-title">五、您的权利</text>
        <text class="section-content">您对您的个人信息享有以下权利：</text>
        <text class="section-content"
          >1. 访问权：您可以随时在小程序中查看您的个人信息；</text
        >
        <text class="section-content"
          >2. 更正权：您可以随时更正您的个人信息；</text
        >
        <text class="section-content"
          >3. 删除权：您可以要求我们删除您的个人信息；</text
        >
        <text class="section-content"
          >4. 注销账号：您可以申请注销您的账号。</text
        >
      </view>

      <view class="section">
        <text class="section-title">六、联系我们</text>
        <text class="section-content"
          >如果您对本隐私政策有任何疑问、意见或建议，请通过以下方式联系我们：</text
        >
        <text class="section-content">客服微信：zhaochengccc</text>
      </view>

      <view class="section">
        <text class="section-title">七、隐私政策的更新</text>
        <text class="section-content"
          >我们可能会适时修订本隐私政策。当隐私政策发生变更时，我们会在小程序内以弹窗、推送通知等形式向您展示变更后的内容。</text
        >
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
// 静态页面，无需额外逻辑
</script>

<style scoped>
.container {
  padding: 30rpx;
  background-color: #fff;
  min-height: 100vh;
}

.content {
  max-width: 100%;
}

.title {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  text-align: center;
  margin-bottom: 20rpx;
}

.update-time {
  font-size: 24rpx;
  color: #999;
  text-align: center;
  margin-bottom: 10rpx;
}

.section {
  margin-top: 40rpx;
}

.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.section-content {
  display: block;
  font-size: 26rpx;
  color: #666;
  line-height: 1.8;
  margin-bottom: 16rpx;
}
</style>
