<template>
  <view class="favorite-recipes">
    <view class="empty-state">
      <text class="icon">⭐</text>
      <text class="title">收藏的食谱</text>
      <text class="desc">收藏功能开发中，敬请期待</text>
    </view>
  </view>
</template>

<script setup lang="ts">
</script>

<style scoped>
.favorite-recipes {
  min-height: 100vh;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx;
}

.icon {
  font-size: 120rpx;
  margin-bottom: 32rpx;
}

.title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
}

.desc {
  font-size: 28rpx;
  color: #999;
}
</style>
