<template>
  <view class="webview-container">
    <web-view :src="url" @message="handleMessage"></web-view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

const url = ref('');

onLoad((options: any) => {
  if (options.url) {
    url.value = decodeURIComponent(options.url);
  }
});

// 处理H5页面发送的消息
const handleMessage = (e: any) => {
  console.log('收到webview消息:', e.detail);
};
</script>

<style scoped lang="scss">
.webview-container {
  width: 100%;
  height: 100vh;
}
</style>
