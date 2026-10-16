<template>
  <view class="shopping-page">
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <view v-else-if="!delivery" class="state-block">
      <text class="state-title">还没有交付内容</text>
      <text class="state-text">营养师交付后会在这里显示，并给你发通知</text>
      <button class="state-btn" @tap="goBack">返回</button>
    </view>

    <template v-else>
      <!--
        交付内容 · 第 2 页「采购与制作」（2026-10-16，批次 2.6）

        ## 为什么单独一页
        这一页的东西是**采购和做饭那一次**才看的 ——
        与第 1 页「每天喂多少」（天天要看）使用时机不同。
        混在一起的话，天天要看的那个每次都得划过一大段采购清单。

        ## 与第 1 页一样，这里**没有任何计算**
        要买多少克、含多少损耗余量、补充剂每 kg 加多少，
        全部来自后端在交付时冻结的快照。
      -->
      <view class="hero">
        <text class="hero-title">采购与制作</text>
        <text class="hero-sub">
          {{ content.recipe.name }} · 第 {{ delivery.version }} 版
        </text>
      </view>

      <!-- 这一批要做多少：先给总量，再给采购清单，读起来才有上下文 -->
      <view v-if="hasBatch" class="section">
        <view class="section-title">这一批要做多少</view>
        <view v-if="content.feeding.dailyIntakeG" class="info-row">
          <text class="label">每天</text>
          <text class="value">
            {{ content.feeding.dailyIntakeG }} 克<template
              v-if="content.feeding.mealsPerDay"
              >，分 {{ content.feeding.mealsPerDay }} 餐</template
            >
          </text>
        </view>
        <view v-if="content.feeding.cycleDays" class="info-row">
          <text class="label">这批做</text>
          <text class="value">{{ content.feeding.cycleDays }} 天</text>
        </view>
        <view v-if="content.shopping.totalNetG" class="info-row">
          <text class="label">总净重</text>
          <text class="value">{{ content.shopping.totalNetG }} 克</text>
        </view>
        <view v-if="content.feeding.perMealG" class="info-row">
          <text class="label">每餐</text>
          <text class="value">{{ content.feeding.perMealG }} 克</text>
        </view>
      </view>

      <!--
        要买什么：整块由**后端算好**。
        算不出来时后端给空清单，这里如实说"暂时算不出"，
        而不是显示一堆 0 让顾客以为不用买。
      -->
      <view class="section">
        <view class="section-title">要买什么（含损耗余量）</view>
        <template v-if="content.shopping.lines.length">
          <view
            v-for="(line, index) in content.shopping.lines"
            :key="index"
            class="shopping-row"
          >
            <text class="shopping-name">{{ line.name }}</text>
            <view class="shopping-amount">
              <text class="shopping-buy">{{ line.purchaseG }} 克</text>
              <text class="shopping-net">净用 {{ line.netG }} 克</text>
            </view>
          </view>
          <view class="shopping-total">
            <text>建议采购合计 {{ content.shopping.totalPurchaseG }} 克</text>
          </view>
          <text class="section-note">
            已按 {{ lossPercent }}% 的加工损耗留出余量，实际用量
            {{ content.shopping.totalNetG }} 克。
          </text>
        </template>
        <text v-else class="section-note">暂时算不出要买多少，请联系客服</text>
      </view>

      <!--
        补充剂按"每 kg 食材加多少"给 —— 顾客做的量不一定是 14 天，
        给一个按 kg 的比例他才好自己换算。
      -->
      <view v-if="content.supplements.length" class="section">
        <view class="section-title">营养补充剂（每 kg 食材加多少）</view>
        <view
          v-for="(item, index) in content.supplements"
          :key="index"
          class="supplement-row"
        >
          <view class="supplement-main">
            <text class="supplement-name">{{ item.name }}</text>
            <text v-if="item.timing" class="supplement-timing">
              {{ item.timing }}
            </text>
          </view>
          <text class="supplement-amount">
            {{
              item.perKgG !== null && item.perKgG !== undefined
                ? item.perKgG + ' g'
                : '按说明加'
            }}
          </text>
        </view>
      </view>

      <view v-if="content.steps.length" class="section">
        <view class="section-title">怎么做</view>
        <view v-for="(step, index) in content.steps" :key="index" class="step-row">
          <text class="step-index">{{ index + 1 }}</text>
          <text class="step-text">{{ step }}</text>
        </view>
      </view>

      <view v-if="content.storage" class="section">
        <view class="section-title">怎么存</view>
        <text class="section-note">{{ content.storage }}</text>
      </view>

      <!-- 回到第 1 页：顾客做完饭多半要回去看"每天喂多少" -->
      <button class="goto-recipe" @tap="goRecipe">返回专属食谱</button>

      <view class="footer-note">
        <text>这份内容在交付时已存档，之后调整配方不会改变你现在看到的版本。</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchDelivery, type OrderDelivery } from '@/api/custom-recipe';

const orderId = ref('');
const loading = ref(true);
const delivery = ref<OrderDelivery | null>(null);

const content = computed(
  () =>
    delivery.value?.content ?? {
      schemaVersion: 1,
      recipe: { recipeId: '', name: '', items: [] },
      feeding: {
        dailyIntakeG: null,
        mealsPerDay: null,
        perMealG: null,
        cycleDays: null,
      },
      nutrition: {
        standard: null,
        energyDensityKcalPerKg: null,
        plainConclusion: null,
      },
      shopping: { lines: [], totalNetG: 0, totalPurchaseG: 0, lossRate: 1 },
      supplements: [],
      steps: [],
      storage: null,
      generatedAt: '',
    },
);

/** 有没有"这一批做多少"可讲 —— 一个数都没有就不显示这一块 */
const hasBatch = computed(
  () =>
    content.value.feeding.dailyIntakeG !== null ||
    content.value.feeding.cycleDays !== null ||
    content.value.shopping.totalNetG > 0,
);

/** 损耗**系数**（1.07）→ **百分比**（7）。纯展示换算，不含业务判断 */
const lossPercent = computed(() =>
  Math.round((Number(content.value.shopping.lossRate || 1) - 1) * 100),
);

const load = async () => {
  loading.value = true;
  try {
    delivery.value = await fetchDelivery(orderId.value);
  } finally {
    loading.value = false;
  }
};

const goBack = () => uni.navigateBack();

/**
 * 回第 1 页。
 *
 * 用 `redirectTo` 而不是 `navigateTo`：这一页是从第 1 页跳过来的，
 * 再 navigateTo 会叠成三层（列表 → 食谱 → 采购 → 食谱），
 * 顾客连按返回要按好几次才回得到订单。
 */
const goRecipe = () => {
  uni.redirectTo({
    url: `/pages/custom-recipe/delivery?orderId=${encodeURIComponent(orderId.value)}`,
  });
};

onLoad((options) => {
  orderId.value = options?.orderId ? decodeURIComponent(options.orderId) : '';
  load();
});

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
</script>

<style scoped>
.shopping-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #16261f;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 120rpx 40rpx;
}

.state-title {
  font-size: 32rpx;
  color: #f4ecd8;
}

.state-text {
  font-size: 26rpx;
  color: rgba(244, 236, 216, 0.6);
  text-align: center;
}

.state-btn,
.goto-recipe {
  margin-top: 16rpx;
  border-radius: 16rpx;
  background: rgba(201, 162, 39, 0.16);
  color: #c9a227;
  font-size: 28rpx;
}

.hero {
  padding: 8rpx 8rpx 24rpx;
}

.hero-title {
  display: block;
  font-size: 40rpx;
  font-weight: 600;
  color: #f4ecd8;
}

.hero-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(244, 236, 216, 0.55);
}

.section {
  margin-bottom: 24rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: rgba(244, 236, 216, 0.05);
}

.section-title {
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #c9a227;
}

.section-note {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.6);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 10rpx 0;
}

.info-row .label {
  font-size: 26rpx;
  color: rgba(244, 236, 216, 0.6);
}

.info-row .value {
  font-size: 28rpx;
  color: #f4ecd8;
}

.shopping-row,
.supplement-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(244, 236, 216, 0.08);
}

.shopping-name,
.supplement-name {
  font-size: 28rpx;
  color: #f4ecd8;
}

.shopping-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.shopping-buy {
  font-size: 30rpx;
  font-weight: 600;
  color: #c9a227;
}

.shopping-net {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.45);
}

.shopping-total {
  display: flex;
  justify-content: space-between;
  margin-top: 16rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #f4ecd8;
}

.supplement-main {
  display: flex;
  flex-direction: column;
}

.supplement-timing {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.45);
}

.supplement-amount {
  font-size: 30rpx;
  font-weight: 600;
  color: #c9a227;
}

.step-row {
  display: flex;
  gap: 16rpx;
  padding: 12rpx 0;
}

.step-index {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(201, 162, 39, 0.2);
  color: #c9a227;
  font-size: 24rpx;
  text-align: center;
  line-height: 40rpx;
}

.step-text {
  flex: 1;
  font-size: 27rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.85);
}

.footer-note {
  padding: 24rpx 8rpx 48rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.4);
}
</style>
