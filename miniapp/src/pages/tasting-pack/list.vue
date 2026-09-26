<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>

    <view v-else-if="!enabled || packs.length === 0" class="state">
      <text class="state-title">试吃装暂未开放</text>
      <text class="state-desc">我们正在准备中，稍后再来看看</text>
    </view>

    <view v-else class="list">
      <view
        v-for="pack in packs"
        :key="pack.id"
        class="card"
        @tap="goDetail(pack)"
      >
        <image
          v-if="pack.coverImageUrl"
          class="cover"
          :src="pack.coverImageUrl"
          mode="aspectFill"
        />
        <view class="body">
          <text class="name">{{ pack.name }}</text>
          <text v-if="pack.subtitle" class="subtitle">{{ pack.subtitle }}</text>

          <view class="dishes">
            <text
              v-for="dish in pack.items"
              :key="dish.id"
              class="dish"
              >{{ dish.name }}</text
            >
          </view>

          <view class="meta">
            <text class="meta-text"
              >{{ pack.items.length }} 道 · 共
              {{ pack.totalNetWeightG }}g</text
            >
            <text class="stock" :class="{ out: pack.soldOut }">
              {{ pack.soldOut ? '已售罄' : `现货 ${pack.availableSets} 套` }}
            </text>
          </view>

          <view class="price-row">
            <text class="price">¥{{ pack.unitPrice }}</text>
            <text v-if="pack.unitListPrice > pack.unitPrice" class="list-price"
              >¥{{ pack.unitListPrice }}</text
            >
            <text v-if="pack.unitListPrice > pack.unitPrice" class="save"
              >立省 ¥{{ round2(pack.unitListPrice - pack.unitPrice) }}</text
            >
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad, onPullDownRefresh, onShareAppMessage } from '@dcloudio/uni-app';
import { ref } from 'vue';
import {
  fetchTastingPacks,
  type TastingPack,
} from '../../api/tastingPack';

const loading = ref(true);
const enabled = ref(false);
const packs = ref<TastingPack[]>([]);

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function load() {
  loading.value = true;
  try {
    const res = await fetchTastingPacks();
    if (res.code === 0 && res.data) {
      enabled.value = res.data.enabled !== false;
      packs.value = res.data.items || [];
    } else {
      enabled.value = false;
      packs.value = [];
    }
  } catch (error) {
    console.error('[TastingPackList] 加载失败:', error);
    enabled.value = false;
  } finally {
    loading.value = false;
  }
}

function goDetail(pack: TastingPack) {
  uni.navigateTo({
    url: `/pages/tasting-pack/index?packId=${encodeURIComponent(pack.code)}`,
  });
}

onLoad(load);

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

onShareAppMessage(() => ({
  title: '多种口味一次尝遍 · 试吃装',
  path: '/pages/tasting-pack/list',
}));
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f0f3e9;
  padding: 24rpx;
  box-sizing: border-box;
}

.state {
  padding: 160rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.state-title {
  font-size: 32rpx;
  color: #1e3a2f;
  font-weight: 600;
}

.state-desc {
  font-size: 26rpx;
  color: #8a8f86;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.card {
  background: #ffffff;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(30, 58, 47, 0.06);
}

.cover {
  width: 100%;
  height: 320rpx;
  background: #e8ece2;
}

.body {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.name {
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.subtitle {
  font-size: 26rpx;
  color: #6b7269;
}

.dishes {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 4rpx;
}

.dish {
  font-size: 22rpx;
  color: #1e3a2f;
  background: #eef3e8;
  border-radius: 8rpx;
  padding: 6rpx 14rpx;
}

.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8rpx;
}

.meta-text {
  font-size: 24rpx;
  color: #8a8f86;
}

.stock {
  font-size: 24rpx;
  color: #2f7a4d;
}

.stock.out {
  color: #b04a3a;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-top: 8rpx;
}

.price {
  font-size: 40rpx;
  font-weight: 700;
  color: #c0392b;
}

.list-price {
  font-size: 24rpx;
  color: #a8ada4;
  text-decoration: line-through;
}

.save {
  font-size: 22rpx;
  color: #c0392b;
  background: #fdecea;
  border-radius: 6rpx;
  padding: 4rpx 10rpx;
}
</style>
