<template>
  <view class="delivery-page">
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
        交付内容是**后端算好、结构固定**的快照，页面只负责画。
        这里一个数字都不自己算 —— 包括"每天喂多少克"和"要买多少"，
        它们全部来自快照。
      -->
      <view class="hero">
        <text class="hero-title">{{ content.recipe.name }}</text>
        <text class="hero-sub">
          第 {{ delivery.version }} 版 · 交付于 {{ formatTime(delivery.deliveredAt) }}
        </text>
        <view class="hero-items">
          <text v-for="code in delivery.itemCodes" :key="code" class="hero-item">
            {{ itemLabel(code) }}
          </text>
        </view>
      </view>

      <!-- 每天怎么喂：顾客最关心的三个数 -->
      <view v-if="hasFeeding" class="section">
        <view class="section-title">每天怎么喂</view>
        <view class="feeding-grid">
          <view v-if="content.feeding.dailyIntakeG" class="feeding-cell">
            <text class="feeding-value">{{ content.feeding.dailyIntakeG }}</text>
            <text class="feeding-unit">克 / 天</text>
          </view>
          <view v-if="content.feeding.mealsPerDay" class="feeding-cell">
            <text class="feeding-value">{{ content.feeding.mealsPerDay }}</text>
            <text class="feeding-unit">餐 / 天</text>
          </view>
          <view v-if="content.feeding.perMealG" class="feeding-cell">
            <text class="feeding-value">{{ content.feeding.perMealG }}</text>
            <text class="feeding-unit">克 / 餐</text>
          </view>
        </view>
        <text v-if="content.feeding.cycleDays" class="section-note">
          这份量是按 {{ content.feeding.cycleDays }} 天配的
        </text>
      </view>

      <!-- 没有喂食量时说清为什么，而不是显示一堆 0 -->
      <view v-else class="section">
        <view class="section-title">每天怎么喂</view>
        <text class="section-note">
          暂时算不出喂食量（缺少爱犬的体重或体况），请联系客服补全档案后重新生成
        </text>
      </view>

      <!-- 食材配比 -->
      <view class="section">
        <view class="section-title">食材配比</view>
        <view
          v-for="(item, index) in foodItems"
          :key="index"
          class="ingredient-row"
        >
          <view class="ingredient-main">
            <text class="ingredient-name">{{ item.name }}</text>
            <text v-if="item.preparation" class="ingredient-prep">
              {{ item.preparation }}
            </text>
          </view>
          <text class="ingredient-ratio">
            {{ item.ratioPercent !== null ? item.ratioPercent + '%' : '—' }}
          </text>
        </view>
        <text v-if="!foodItems.length" class="section-note">这份食谱还没有配比信息</text>
      </view>

      <!-- 营养补充剂：单独一块，不和食材混 -->
      <view v-if="supplementItems.length" class="section">
        <view class="section-title">营养补充剂</view>
        <view
          v-for="(item, index) in supplementItems"
          :key="index"
          class="ingredient-row"
        >
          <view class="ingredient-main">
            <text class="ingredient-name">{{ item.name }}</text>
            <text v-if="item.preparation" class="ingredient-prep">
              {{ item.preparation }}
            </text>
          </view>
          <text class="ingredient-ratio">
            {{ item.ratioPercent !== null ? item.ratioPercent + '%' : '—' }}
          </text>
        </view>
      </view>

      <!-- 营养达标情况 -->
      <view v-if="content.nutrition.standard || content.nutrition.energyDensityKcalPerKg" class="section">
        <view class="section-title">营养</view>
        <view v-if="content.nutrition.energyDensityKcalPerKg" class="info-row">
          <text class="label">能量密度</text>
          <text class="value">{{ content.nutrition.energyDensityKcalPerKg }} kcal/kg</text>
        </view>
        <view v-if="content.nutrition.standard" class="info-row">
          <text class="label">参照标准</text>
          <text class="value">{{ content.nutrition.standard }}</text>
        </view>
        <text v-if="content.nutrition.plainConclusion" class="section-note">
          {{ content.nutrition.plainConclusion }}
        </text>
      </view>

      <!--
        去第 2 页「采购与制作」（2026-10-16 批次 2.6）。

        为什么拆成两页：这两件事的**使用时机不一样** ——
        「每天喂多少」是天天要看的，「要买什么、怎么做」是采购和做饭那一次才看。
        混在一页里，天天要看的那个每次都得划过一大段采购清单。
      -->
      <button class="goto-shopping" @tap="goShopping">
        <text class="goto-title">去买食材 / 看做法</text>
        <text class="goto-sub">
          要买什么、买多少、怎么做、怎么存
        </text>
      </button>

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

/**
 * 交付内容 · 第 1 页「专属食谱」（2026-10-16，批次 2.4；2.6 拆页）
 *
 * 这一页只放**天天要看**的东西：每天喂多少、食材配比、补充剂、营养结论。
 * 采购量与制作步骤挪到第 2 页（`delivery-shopping.vue`）——
 * 那两件事是采购和做饭那一次才看的。

 *
 * ## 页面里**没有任何计算**
 *
 * "每天喂多少克""要买多少""损耗多少"全部来自后端快照 ——
 * 老板的要求是「所有的计算交给后端，前端只负责渲染」。
 * 这里连一个 `Math.round` 都不该有。唯一做的是把损耗**系数** 1.07
 * 显示成 **7%**（纯展示换算）。
 *
 * ## 快照是冻结的
 *
 * 交付那一刻的内容存了档，营养师之后改配方不会影响这一版。
 * 页面底部把这件事明确告诉顾客。
 */

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
      shopping: {
        lines: [],
        totalNetG: 0,
        totalPurchaseG: 0,
        lossRate: 1,
      },
      supplements: [],
      steps: [],
      storage: null,
      generatedAt: '',
    },
);

/** 食材与补充剂分开渲染（补充剂单独一块，不与食材混） */
const foodItems = computed(() =>
  (content.value.recipe.items || []).filter((item) => !item.isSupplement),
);
const supplementItems = computed(() =>
  (content.value.recipe.items || []).filter((item) => item.isSupplement),
);

const hasFeeding = computed(
  () =>
    content.value.feeding.dailyIntakeG !== null ||
    content.value.feeding.mealsPerDay !== null,
);

/** 损耗**系数**（1.07）→ **百分比**（7）。纯展示换算，不含业务判断 */
const lossPercent = computed(() =>
  Math.round((Number(content.value.shopping.lossRate || 1) - 1) * 100),
);

const DELIVERY_ITEM_LABELS: Record<string, string> = {
  RECIPE: '专属食谱',
  SHOPPING_SOP: '采购与制作单',
  NUTRITION_REPORT: '营养评估报告',
};
const itemLabel = (code: string) => DELIVERY_ITEM_LABELS[code] || code;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const load = async () => {
  loading.value = true;
  try {
    delivery.value = await fetchDelivery(orderId.value);
  } finally {
    loading.value = false;
  }
};

const goBack = () => uni.navigateBack();

/** 去第 2 页「采购与制作」。带上 orderId，那一页自己再取一次内容 */
const goShopping = () => {
  uni.navigateTo({
    url: `/pages/custom-recipe/delivery-shopping?orderId=${encodeURIComponent(orderId.value)}`,
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
.delivery-page {
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

.state-btn {
  margin-top: 20rpx;
  color: #1e3a2f;
  background: #d8bc85;
}

.hero {
  padding: 36rpx 32rpx;
  margin-bottom: 24rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  border-radius: 28rpx;
}

.hero-title {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #f4ecd8;
}

.hero-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: rgba(244, 236, 216, 0.6);
}

.hero-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.hero-item {
  padding: 8rpx 18rpx;
  font-size: 24rpx;
  color: #f4ecd8;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 100rpx;
}

.section {
  padding: 28rpx 32rpx;
  margin-bottom: 24rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(216, 188, 133, 0.22);
  border-radius: 28rpx;
}

.section-title {
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #d8bc85;
}

.section-note {
  display: block;
  font-size: 24rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.6);
}

.feeding-grid {
  display: flex;
  gap: 20rpx;
}

.feeding-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 24rpx 0;
  background: rgba(216, 188, 133, 0.1);
  border-radius: 20rpx;
}

.feeding-value {
  font-size: 44rpx;
  font-weight: 700;
  color: #f4ecd8;
}

.feeding-unit {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.6);
}

.ingredient-row,
.shopping-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-bottom: 1rpx solid rgba(216, 188, 133, 0.12);
}

.ingredient-main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1;
}

.ingredient-name,
.shopping-name {
  font-size: 28rpx;
  color: #f4ecd8;
}

.ingredient-prep {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.5);
}

.ingredient-ratio {
  font-size: 28rpx;
  color: #d8bc85;
}

.shopping-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}

.shopping-buy {
  font-size: 30rpx;
  font-weight: 600;
  color: #f4ecd8;
}

.shopping-net {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.5);
}

.shopping-total {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8rpx;
  margin-top: 20rpx;
  font-size: 28rpx;
  color: #d8bc85;
}

.shopping-loss {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.5);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 14rpx 0;
}

.info-row .label {
  font-size: 26rpx;
  color: rgba(244, 236, 216, 0.6);
}

.info-row .value {
  font-size: 26rpx;
  color: #f4ecd8;
}

.step-row {
  display: flex;
  gap: 16rpx;
  padding: 14rpx 0;
}

.step-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36rpx;
  height: 36rpx;
  flex-shrink: 0;
  font-size: 22rpx;
  color: #1e3a2f;
  background: #d8bc85;
  border-radius: 50%;
}

.step-text {
  flex: 1;
  font-size: 26rpx;
  line-height: 1.6;
  color: #f4ecd8;
}

.goto-shopping {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8rpx;
  margin: 24rpx 0;
  padding: 32rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #c9a227, #a8861d);
  text-align: left;
}

.goto-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #16261f;
}

.goto-sub {
  font-size: 24rpx;
  color: rgba(22, 38, 31, 0.75);
}

.footer-note {
  padding: 20rpx 8rpx 60rpx;
  font-size: 22rpx;
  line-height: 1.6;
  text-align: center;
  color: rgba(244, 236, 216, 0.45);
}
</style>
