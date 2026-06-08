<template>
  <view class="container">
    <view v-if="snapshot" class="snapshot-detail">
      <view class="snapshot-header">
        <text class="snapshot-title">食谱快照 (只读)</text>
        <text class="snapshot-note">⚠️ 此快照为下单时的配方版本，不可编辑。这是历史数据，不代表当前最新配方。</text>
      </view>

      <view class="snapshot-content">
        <view class="info-section">
          <view class="info-item" v-if="snapshot.name">
            <text class="label">食谱名称:</text>
            <text class="value">{{ snapshot.name }}</text>
          </view>
          <view class="info-item" v-if="snapshot.version">
            <text class="label">版本:</text>
            <text class="value">v{{ snapshot.version }}</text>
          </view>
          <view class="info-item" v-if="snapshot.energyDensityKcalPerKg">
            <text class="label">能量密度:</text>
            <text class="value">{{ snapshot.energyDensityKcalPerKg }} kcal/kg</text>
          </view>
        </view>

        <view class="raw-data">
          <view class="section-title">完整快照数据 (只读)</view>
          <view class="json-view">
            <text>{{ JSON.stringify(snapshot, null, 2) }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { request } from '../../utils/api'

const snapshot = ref<any>(null)
const itemId = ref('')

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  itemId.value = currentPage.options?.itemId || ''
  
  if (itemId.value) {
    loadSnapshot()
  }
})

function loadSnapshot() {
  uni.showLoading({ title: '加载中...' })
  
  request({
    url: `/orders/items/${itemId.value}/snapshot`,
    method: 'GET'
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      snapshot.value = res.data
    }
  }).catch((err: any) => {
    console.error('Load snapshot error:', err)
  }).finally(() => {
    uni.hideLoading()
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.snapshot-detail {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.snapshot-header {
  margin-bottom: 30rpx;
  padding-bottom: 20rpx;
  border-bottom: 1px solid #eee;
}

.snapshot-title {
  font-size: 36rpx;
  font-weight: bold;
  display: block;
  margin-bottom: 10rpx;
  color: #333;
}

.snapshot-note {
  font-size: 24rpx;
  color: #ff9800;
  display: block;
  line-height: 1.6;
}

.info-section {
  margin-bottom: 30rpx;
}

.info-item {
  display: flex;
  margin-bottom: 15rpx;
  font-size: 28rpx;
}

.label {
  color: #666;
  margin-right: 20rpx;
  width: 200rpx;
}

.value {
  color: #333;
  flex: 1;
}

.raw-data {
  margin-top: 30rpx;
  padding-top: 30rpx;
  border-top: 1px solid #eee;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 20rpx;
  color: #333;
}

.json-view {
  background-color: #f5f5f5;
  padding: 20rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  color: #666;
  word-break: break-all;
  max-height: 600rpx;
  overflow-y: auto;
  font-family: monospace;
}
</style>


