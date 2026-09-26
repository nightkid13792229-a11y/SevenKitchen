<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>

    <view v-else-if="!pack" class="state">
      <text class="state-title">{{ errorMessage || '试吃装不存在或已下架' }}</text>
      <view class="state-action" @tap="goList">看看其它试吃装</view>
    </view>

    <template v-else>
      <image
        v-if="pack.coverImageUrl"
        class="hero"
        :src="pack.coverImageUrl"
        mode="aspectFill"
      />

      <view class="section">
        <text class="name">{{ pack.name }}</text>
        <text v-if="pack.subtitle" class="subtitle">{{ pack.subtitle }}</text>

        <view class="price-row">
          <text class="price">¥{{ unitPrice }}</text>
          <text v-if="unitListPrice > unitPrice" class="list-price"
            >¥{{ unitListPrice }}</text
          >
          <text v-if="unitListPrice > unitPrice" class="save"
            >立省 ¥{{ round2(unitListPrice - unitPrice) }}</text
          >
        </view>

        <view class="badges">
          <text class="badge">现货 · 付款后尽快发出</text>
          <text class="badge">免凑 {{ 1000 }}g 起订量</text>
          <text class="badge">只付一次运费</text>
        </view>
      </view>

      <view class="section">
        <view class="section-title">这一套有 {{ pack.items.length }} 道菜</view>
        <view
          v-for="dish in pack.items"
          :key="dish.id"
          class="dish"
        >
          <image
            v-if="dish.coverImageUrl"
            class="dish-cover"
            :src="dish.coverImageUrl"
            mode="aspectFill"
          />
          <view class="dish-body">
            <text class="dish-name">{{ dish.name }}</text>
            <text v-if="dish.sellingPoint" class="dish-point">{{
              dish.sellingPoint
            }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <view class="section-title">规格</view>
        <view class="spec-row">
          <text class="spec-label">每道</text>
          <text class="spec-value"
            >{{ pack.bagsPerRecipe }} 袋 × {{ pack.packSpecG }}g</text
          >
        </view>
        <view class="spec-row">
          <text class="spec-label">一整套</text>
          <text class="spec-value"
            >{{ pack.totalPacks }} 袋 · 共 {{ pack.totalNetWeightG }}g</text
          >
        </view>
        <view class="spec-row">
          <text class="spec-label">保存</text>
          <text class="spec-value">-18℃ 冷冻，保质期 6 个月</text>
        </view>
      </view>

      <view class="section">
        <view class="section-title">买几套</view>
        <view class="stepper">
          <view
            class="step-btn"
            :class="{ disabled: sets <= 1 }"
            @tap="changeSets(-1)"
            >−</view
          >
          <text class="step-value">{{ sets }}</text>
          <view
            class="step-btn"
            :class="{ disabled: sets >= maxSets }"
            @tap="changeSets(1)"
            >＋</view
          >
          <text class="step-hint"
            >{{ pack.soldOut ? '已售罄' : `现货 ${pack.availableSets} 套` }} ·
            单次最多 {{ maxSets }} 套</text
          >
        </view>
      </view>

      <view class="section total-section">
        <view class="spec-row">
          <text class="spec-label">商品</text>
          <text class="spec-value">¥{{ amountProduct }}</text>
        </view>
        <view class="spec-row">
          <text class="spec-label">运费</text>
          <text class="spec-value">{{ shippingText }}</text>
        </view>
        <view class="spec-row total">
          <text class="spec-label">合计</text>
          <text class="total-value">¥{{ amountTotal }}</text>
        </view>
        <text class="total-tip"
          >结算页会再确认一次价格，以付款金额为准</text
        >
      </view>

      <view class="footer-space" />

      <view class="footer">
        <view class="footer-price">
          <text class="footer-amount">¥{{ amountTotal }}</text>
          <text class="footer-sub">{{ sets }} 套 · 含运费</text>
        </view>
        <view
          class="buy-btn"
          :class="{ disabled: !canBuy || submitting }"
          @tap="buyNow"
        >
          {{ submitText }}
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import {
  fetchTastingPackDetail,
  quoteTastingPack,
  type TastingPack,
} from '../../api/tastingPack';

const loading = ref(true);
const submitting = ref(false);
const errorMessage = ref('');
const pack = ref<TastingPack | null>(null);
const sets = ref(1);
const quote = ref<{
  amountProduct: number;
  amountShipping: number;
  amountTotal: number;
  unitPrice: number;
  unitListPrice: number;
} | null>(null);

const unitPrice = computed(() => quote.value?.unitPrice ?? pack.value?.unitPrice ?? 0);
const unitListPrice = computed(
  () => quote.value?.unitListPrice ?? pack.value?.unitListPrice ?? 0,
);
const maxSets = computed(() => {
  if (!pack.value) return 1;
  return Math.max(1, Math.min(pack.value.maxSetsPerOrder, pack.value.availableSets || 1));
});
const amountProduct = computed(() => quote.value?.amountProduct ?? 0);
const amountTotal = computed(() => quote.value?.amountTotal ?? 0);
const shippingText = computed(() => {
  if (!quote.value) return '结算时计算';
  return quote.value.amountShipping > 0
    ? `¥${quote.value.amountShipping}`
    : '包邮';
});
const canBuy = computed(() => !!pack.value && !pack.value.soldOut && pack.value.availableSets >= sets.value);
const submitText = computed(() => {
  if (submitting.value) return '处理中…';
  if (!pack.value) return '立即购买';
  if (pack.value.soldOut) return '已售罄';
  if (pack.value.availableSets < sets.value) return '库存不足';
  return '立即购买';
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

let packCode = '';

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await fetchTastingPackDetail(packCode);
    if (res.code === 0 && res.data?.pack) {
      pack.value = res.data.pack;
      await refreshQuote();
    } else {
      pack.value = null;
      errorMessage.value = res.message || '试吃装不存在或已下架';
    }
  } catch (error: any) {
    console.error('[TastingPackDetail] 加载失败:', error);
    pack.value = null;
    errorMessage.value = error?.message || '加载失败，请稍后再试';
  } finally {
    loading.value = false;
  }
}

/**
 * 向服务端要一次报价。
 *
 * 价格不在前端算：服务端按库存批次成本实时定价，并返回一个价格快照。
 * 下单时只提交这个快照 ID，所以中途改价、改参数都不会生效。
 */
async function refreshQuote() {
  if (!pack.value) return;
  const res = await quoteTastingPack({
    idOrCode: pack.value.code,
    sets: sets.value,
  });
  if (res.code !== 0 || !res.data) {
    quote.value = null;
    errorMessage.value = res.message || '暂时无法报价，请稍后再试';
    return;
  }
  errorMessage.value = '';
  quote.value = {
    amountProduct: res.data.amountProduct,
    amountShipping: res.data.amountShipping,
    amountTotal: res.data.amountTotal,
    unitPrice: res.data.unitPrice,
    unitListPrice: res.data.unitListPrice,
  };
  // 服务端的可售量是最新的，以它为准
  pack.value.availableSets = res.data.availableSets;
}

async function changeSets(delta: number) {
  const next = sets.value + delta;
  if (next < 1 || next > maxSets.value) return;
  sets.value = next;
  await refreshQuote();
}

async function buyNow() {
  if (!canBuy.value || submitting.value) return;

  if (!uni.getStorageSync('customer_id') && !uni.getStorageSync('token')) {
    uni.navigateTo({ url: '/pages/login/index' });
    return;
  }

  submitting.value = true;
  try {
    const res = await quoteTastingPack({
      idOrCode: pack.value!.code,
      sets: sets.value,
    });
    if (res.code !== 0 || !res.data?.snapshotId) {
      uni.showToast({
        title: res.message || '暂时无法下单，请稍后再试',
        icon: 'none',
      });
      return;
    }

    // 结算页只认快照 ID + 展示用的配置，价格以服务端为准
    uni.setStorageSync('direct_buy_order_config', {
      orderKind: 'TASTING_PACK',
      snapshotId: res.data.snapshotId,
      tastingPackId: pack.value!.id,
      tastingPackCode: pack.value!.code,
      recipeName: pack.value!.name,
      recipeCoverImage: pack.value!.coverImageUrl || '',
      totalGrams: pack.value!.totalNetWeightG * res.data.sets,
      totalPackages: pack.value!.totalPacks * res.data.sets,
      sets: res.data.sets,
      packagePlan: [
        {
          packageSpecG: pack.value!.packSpecG,
          packageCount: pack.value!.totalPacks * res.data.sets,
        },
      ],
      amountProduct: res.data.amountProduct,
      amountShipping: res.data.amountShipping,
      amountTotal: res.data.amountTotal,
    });

    uni.navigateTo({
      url: `/pages/checkout/index?mode=stockBuy&snapshotId=${encodeURIComponent(
        res.data.snapshotId,
      )}`,
    });
  } finally {
    submitting.value = false;
  }
}

function goList() {
  uni.redirectTo({ url: '/pages/tasting-pack/list' });
}

onLoad((options: any) => {
  packCode = String(options?.packId || options?.code || '');
  if (!packCode) {
    loading.value = false;
    errorMessage.value = '缺少试吃装信息';
    return;
  }
  load();
});

onShareAppMessage(() => ({
  title: pack.value
    ? `${pack.value.name} · 一单尝 ${pack.value.items.length} 种`
    : '试吃装',
  path: `/pages/tasting-pack/index?packId=${packCode}`,
}));
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f0f3e9;
  padding-bottom: 40rpx;
  box-sizing: border-box;
}

.state {
  padding: 200rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}

.state-title {
  font-size: 30rpx;
  color: #6b7269;
}

.state-action {
  font-size: 28rpx;
  color: #1e3a2f;
  border: 2rpx solid #1e3a2f;
  border-radius: 40rpx;
  padding: 14rpx 40rpx;
}

.hero {
  width: 100%;
  height: 420rpx;
  background: #e8ece2;
}

.section {
  background: #ffffff;
  margin: 20rpx 24rpx;
  border-radius: 20rpx;
  padding: 28rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.name {
  font-size: 38rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.subtitle {
  font-size: 26rpx;
  color: #6b7269;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.price {
  font-size: 48rpx;
  font-weight: 700;
  color: #c0392b;
}

.list-price {
  font-size: 26rpx;
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

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.badge {
  font-size: 22rpx;
  color: #1e3a2f;
  background: #eef3e8;
  border-radius: 8rpx;
  padding: 6rpx 14rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.dish {
  display: flex;
  gap: 18rpx;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f0f2ec;
}

.dish:last-child {
  border-bottom: none;
}

.dish-cover {
  width: 96rpx;
  height: 96rpx;
  border-radius: 12rpx;
  background: #e8ece2;
  flex-shrink: 0;
}

.dish-body {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.dish-name {
  font-size: 28rpx;
  color: #1e3a2f;
  font-weight: 600;
}

.dish-point {
  font-size: 24rpx;
  color: #8a8f86;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.spec-label {
  font-size: 26rpx;
  color: #8a8f86;
}

.spec-value {
  font-size: 26rpx;
  color: #1e3a2f;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.step-btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #eef3e8;
  color: #1e3a2f;
  font-size: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-btn.disabled {
  opacity: 0.35;
}

.step-value {
  font-size: 34rpx;
  min-width: 48rpx;
  text-align: center;
  color: #1e3a2f;
}

.step-hint {
  font-size: 22rpx;
  color: #8a8f86;
  margin-left: 8rpx;
}

.total-section .total {
  border-top: 1rpx solid #f0f2ec;
  padding-top: 16rpx;
}

.total-value {
  font-size: 36rpx;
  font-weight: 700;
  color: #c0392b;
}

.total-tip {
  font-size: 22rpx;
  color: #a8ada4;
}

.footer-space {
  height: 140rpx;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #ffffff;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 -4rpx 16rpx rgba(30, 58, 47, 0.06);
}

.footer-price {
  display: flex;
  flex-direction: column;
}

.footer-amount {
  font-size: 38rpx;
  font-weight: 700;
  color: #c0392b;
}

.footer-sub {
  font-size: 22rpx;
  color: #8a8f86;
}

.buy-btn {
  background: #1e3a2f;
  color: #ffffff;
  font-size: 30rpx;
  border-radius: 44rpx;
  padding: 20rpx 64rpx;
}

.buy-btn.disabled {
  opacity: 0.45;
}
</style>
