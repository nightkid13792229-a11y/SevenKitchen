<template>
  <view class="container">
    <view class="content">
      <view class="title">用户协议</view>
      <view class="update-time">更新日期：2025年1月1日</view>
      <view class="update-time">生效日期：2025年1月1日</view>

      <view class="section">
        <text class="section-title">引言</text>
        <text class="section-content">欢迎您使用"Seven的厨房"小程序！为使用"Seven的厨房"小程序服务（以下简称"本服务"），您应当阅读并遵守《用户协议》（以下简称"本协议"）。请您务必审慎阅读、充分理解各条款内容，特别是免除或限制责任的相应条款。</text>
        <text class="section-content">除非您已阅读并接受本协议所有条款，否则您无权使用本服务。您使用本服务即视为您已阅读并同意上述协议的约束。</text>
      </view>

      <view class="section">
        <text class="section-title">一、服务内容</text>
        <text class="section-content">1. 本服务是"Seven的厨房"为您提供的宠物鲜食订购及相关服务平台。</text>
        <text class="section-content">2. 您可以通过本服务浏览、选购宠物鲜食产品，管理宠物信息，查看订单状态等。</text>
        <text class="section-content">3. 我们保留随时变更、中断或终止部分或全部服务的权利。</text>
      </view>

      <view class="section">
        <text class="section-title">二、用户账号</text>
        <text class="section-content">1. 您需要通过微信授权登录才能使用本服务的完整功能。</text>
        <text class="section-content">2. 您应妥善保管您的账号信息，因您保管不当可能造成的损失由您自行承担。</text>
        <text class="section-content">3. 您不得将账号转让、出售或出借给他人使用。</text>
      </view>

      <view class="section">
        <text class="section-title">三、用户行为规范</text>
        <text class="section-content">您在使用本服务时应遵守以下规范：</text>
        <text class="section-content">1. 遵守中华人民共和国相关法律法规；</text>
        <text class="section-content">2. 不得利用本服务从事任何违法或不当活动；</text>
        <text class="section-content">3. 不得干扰或破坏本服务的正常运行；</text>
        <text class="section-content">4. 不得侵害他人合法权益。</text>
      </view>

      <view class="section">
        <text class="section-title">四、订单与支付</text>
        <text class="section-content">1. 您在下单时请仔细核对商品信息、收货地址等，确认无误后提交订单。</text>
        <text class="section-content">2. 订单提交后，您需要完成支付才算下单成功。</text>
        <text class="section-content">3. 如需取消订单或申请退款，请根据订单状态联系客服处理。</text>
        <text class="section-content">4. 商品价格如有调整，以您下单时的价格为准。</text>
      </view>

      <view class="section">
        <text class="section-title">五、配送服务</text>
        <text class="section-content">1. 我们将按照您提供的收货地址进行配送。</text>
        <text class="section-content">2. 请确保您提供的收货信息准确无误，因收货信息错误导致的配送失败由您自行承担。</text>
        <text class="section-content">3. 配送时效可能因地区、天气等因素有所差异，敬请理解。</text>
      </view>

      <view class="section">
        <text class="section-title">六、知识产权</text>
        <text class="section-content">1. 本服务中的所有内容，包括但不限于文字、图片、音频、视频、软件、程序等，均为"Seven的厨房"或其许可方所有。</text>
        <text class="section-content">2. 未经书面授权，您不得复制、修改、传播上述内容。</text>
      </view>

      <view class="section">
        <text class="section-title">七、免责声明</text>
        <text class="section-content">1. 因不可抗力或非我们原因导致的服务中断，我们不承担责任。</text>
        <text class="section-content">2. 我们不对第三方链接的内容负责。</text>
        <text class="section-content">3. 在法律允许的范围内，我们的责任以您支付的商品价款为限。</text>
      </view>

      <view class="section">
        <text class="section-title">八、协议修改</text>
        <text class="section-content">我们有权随时修改本协议，修改后的协议将在小程序内公布。您继续使用本服务即视为您接受修改后的协议。</text>
      </view>

      <view class="section">
        <text class="section-title">九、联系我们</text>
        <text class="section-content">如您对本协议有任何疑问，请通过以下方式联系我们：</text>
        <text class="section-content">客服微信：zhaochengccc</text>
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
