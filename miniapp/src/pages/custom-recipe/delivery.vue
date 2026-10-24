<template>
  <view class="delivery-page">
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <view v-else-if="!resolved" class="state-block">
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
      <!--
        2026-10-18 重写：封面、一句话、核心营养、食材占比全部改用共享组件。

        改之前这一页是这样：hero 只有食谱名 → 食材配比（带制备方法）→
        营养补充剂（按占比给）→ 营养（能量密度 + 标准）→ 一个"去买食材"按钮。
        跟定稿原型差了四块，而且食材表多了一列制备方法。
      -->
      <RecipeCover
        :cover-image-url="resolved.recipeCoverImageUrl"
        :title="resolved.recipeName || content.recipe.name"
        :subtitles="coverSubtitles"
        :badge="`第 ${resolved.version} 版 · ${formatTime(resolved.deliveredAt)} 交付`"
      />

      <!-- 多份订单：说明本次共几份、现在看的是第几份（单份订单不显示） -->
      <view v-if="batchNote" class="batch-note">
        <text class="batch-note-text">{{ batchNote }}</text>
      </view>

      <!-- 一句话：默认两行，点开看全文 -->
      <view v-if="sellingPointText" class="oneline" @tap="sellingPointOpen = !sellingPointOpen">
        <text
          class="oneline-text"
          :class="{ 'oneline-text--open': sellingPointOpen }"
        >{{ sellingPointText }}</text>
        <text class="oneline-toggle">{{ sellingPointOpen ? '收起' : '展开' }}</text>
      </view>

      <!-- 全营养标准 banner：封面下方、食材清单上方（2026-10-24） -->
      <NutritionStandardBanner
        v-if="content.nutrition.standard"
        :standard="content.nutrition.standard"
      />

      <!-- 食材清单：名称 + 部位/预处理 + 占比（2026-10-24） -->
      <view class="section">
        <view class="section-title">食材清单</view>
        <text v-if="foodItems.length" class="section-note">
          共计 {{ foodItems.length }} 种食材
        </text>
        <RecipeIngredientRatioTable :items="foodItems" />
      </view>

      <!--
        须额外添加的营养素（2026-10-24）：
        顾客要看的是"补什么、每公斤补多少"，不是补剂原料名或添加时机。
        数据来自快照的 supplements[].targets，老快照没有 targets 就整块不显示。
      -->
      <view v-if="supplementTargetRows.length" class="section">
        <view class="section-title">须额外添加的营养素</view>
        <view class="nutrient-box">
          <view class="nutrient-head">
            <text class="nutrient-name">营养素</text>
            <text class="nutrient-value">添加浓度</text>
          </view>
          <view
            v-for="(row, index) in supplementTargetRows"
            :key="index"
            class="nutrient-row"
          >
            <text class="nutrient-name">{{ row.nutrient }}</text>
            <text class="nutrient-value">{{ row.concentration }}</text>
          </view>
        </view>
        <text class="section-note">
          具体的补剂产品和实际用量，可点击下方【自己做】并生成制作单后查看。
        </text>
      </view>

      <!-- 喂食建议：顾客每天要照着喂的三个数 -->
      <view v-if="hasFeeding" class="section">
        <view class="section-title">喂食建议</view>
        <view class="feeding-grid">
          <view v-if="content.feeding.dailyIntakeG" class="feeding-cell">
            <text class="feeding-value">{{ formatFeedingGrams(content.feeding.dailyIntakeG) }}</text>
            <text class="feeding-unit">克 / 天</text>
          </view>
          <view v-if="content.feeding.mealsPerDay" class="feeding-cell">
            <text class="feeding-value">{{ content.feeding.mealsPerDay }}</text>
            <text class="feeding-unit">餐 / 天</text>
          </view>
          <view v-if="content.feeding.perMealG" class="feeding-cell">
            <text class="feeding-value">{{ formatFeedingGrams(content.feeding.perMealG) }}</text>
            <text class="feeding-unit">克 / 餐</text>
          </view>
        </view>
        <text class="section-note">
          喂食建议仅供参考。可以点击下方【自己做】自定义配置。
        </text>
      </view>

      <!-- 没有喂食量时说清为什么，而不是显示一堆 0 -->
      <view v-else class="section">
        <view class="section-title">喂食建议</view>
        <text class="section-note">
          暂时算不出喂食量（缺少爱犬的体重或体况）。找 Seven爸爸补全档案后，我们再帮你算。
        </text>
      </view>

      <!-- 核心营养成分：标准 + 8 项 + 报告入口，合成一块（与详情页同一套） -->
      <view class="section">
        <RecipeNutritionCard
          :standard="content.nutrition.standard"
          :macros="content.nutrition.macros || null"
          :report-available="false"
          :show-standard="false"
        />
      </view>

    </template>

    <!--
      固定底栏：三件事，只有一颗实心。
        · 找 Seven爸爸 —— 视觉最轻，带订单号；
        · 自己做 —— 进 DIY 配置，自己定份量；
        · 订购成品 —— 实心主操作，进成品订购页。
    -->
    <view v-if="resolved" class="bottom-bar">
      <view class="bottom-bar__inner">
        <view v-if="deliveryDateText" class="bottom-bar__date">
          <text class="bottom-bar__date-text">{{ deliveryDateText }}</text>
        </view>
        <view class="bottom-bar__actions">
          <CustomerServiceInlineButton
            compact
            label="Seven爸爸"
            source-type="ORDER"
            :order-id="orderId"
            :order-no="orderId"
            :title="`定制订单 ${orderId}`"
            path="/pages/orders-list/index"
          />
          <button
            class="bottom-bar__btn bottom-bar__btn--secondary"
            @tap="goDiy"
          >
            自己做
          </button>
          <button
            class="bottom-bar__btn bottom-bar__btn--primary"
            @tap="goOrderFinished"
          >
            订购成品
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchDelivery, fetchOrderDetail } from '@/api/custom-recipe';
import {
  buildDeliveryDiyUrl,
  buildFinishedFoodOrderUrl,
  deliveryBatchCountText,
  resolveDeliverySelection,
  type CustomRecipeDeliveryResponse,
} from '@/utils/custom-recipe-delivery';
import RecipeCover from '@/components/recipe/RecipeCover.vue';
import RecipeNutritionCard from '@/components/recipe/RecipeNutritionCard.vue';
import NutritionStandardBanner from '@/components/recipe/NutritionStandardBanner.vue';
import CustomerServiceInlineButton from '@/components/CustomerServiceInlineButton.vue';
import RecipeIngredientRatioTable from '@/components/recipe/RecipeIngredientRatioTable.vue';

/**
 * 交付内容 · 第 1 页「我的定制食谱」（2026-10-16，批次 2.4；2.6 拆页）
 *
 * 这一页只放**天天要看**的东西：喂食建议、配方组成、补剂、营养结论。
 * 采购量与制作步骤不再由交付页承担 —— 顾客点「自己做」进 DIY 配置，
 * 由 DIY 制作单按**交付那一版**生成（2026-10-24）。

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
const recipeId = ref('');
const loading = ref(true);
const delivery = ref<CustomRecipeDeliveryResponse | null>(null);
/** 老交付没有 dogId 时，从订单详情补一次，保证"自己做"能预选这只狗 */
const orderDogId = ref('');

/**
 * 多份交付里选中的那一份。
 *
 * 老单份交付也会被收敛成同一个形状（`content` / `version` 原样保留），
 * 所以下面模板不需要再分两套。
 */
const resolved = computed(() =>
  resolveDeliverySelection(delivery.value, recipeId.value),
);

const content = computed(
  () =>
    resolved.value?.content ?? {
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
      },
      shopping: {
        lines: [],
        totalNetG: 0,
      },
      supplements: [],
      steps: [],
      storage: null,
      generatedAt: '',
    },
);

/** 多份订单在封面下说明「共几份、当前第几份」；单份订单不显示 */
const batchNote = computed(() => {
  const current = resolved.value;
  if (!current?.isBatch || current.batchSize <= 1) return '';
  return `${deliveryBatchCountText(current.batchSize)} · 可在订单详情切换查看`;
});

/** 食材与补充剂分开渲染（补充剂单独一块，不与食材混） */
/**
 * 食材 = `ingredientType === 'FOOD'`。
 *
 * ⚠️ 2026-10-17 修的真实缺陷：这里原来是 `filter(item => !item.isSupplement)`。
 * 但 `IngredientType` 有三个值（FOOD / SUPPLEMENT / **PACKAGING**），
 * 布尔只有两种状态 —— **包材被归进"非补剂"，于是当成食材列了出来**。
 *
 * 旧交付快照里没有 `ingredientType`（只有 `isSupplement`），
 * 所以留一个回退：没有新字段时按旧逻辑走，不至于让历史交付变成空白。
 */
const foodItems = computed(() =>
  (content.value.recipe.items || []).filter((item) =>
    item.ingredientType
      ? item.ingredientType === 'FOOD'
      : !item.isSupplement,
  ),
);
const hasFeeding = computed(
  () =>
    content.value.feeding.dailyIntakeG !== null ||
    content.value.feeding.mealsPerDay !== null,
);

/**
 * 封面叠的两行（2026-10-18）：
 *   「为 豆豆 定制」+「柯基 · 3 岁 · 11.2kg」
 *
 * 年龄从月数换成"几岁/几个月"是**渲染层的事**，
 * 后端只存月数（见快照的 `recipe.dog.ageMonths`）。
 */
const coverSubtitles = computed(() => {
  const dog = content.value.recipe.dog;
  if (!dog) return [];
  const lines: string[] = [];
  if (dog.name) lines.push(`为 ${dog.name} 定制`);

  const facts: string[] = [];
  if (dog.breedName) facts.push(dog.breedName);
  if (dog.ageMonths !== null && dog.ageMonths !== undefined) {
    const months = Number(dog.ageMonths);
    if (Number.isFinite(months) && months >= 0) {
      facts.push(months >= 12 ? `${Math.floor(months / 12)} 岁` : `${months} 个月`);
    }
  }
  if (dog.weightKg !== null && dog.weightKg !== undefined) {
    const kg = Number(dog.weightKg);
    if (Number.isFinite(kg) && kg > 0) facts.push(`${kg}kg`);
  }
  if (facts.length) lines.push(facts.join(' · '));
  return lines;
});

/** 一句话卖点（默认只显示两行，点开看全文） */
const sellingPointOpen = ref(false);
const sellingPointText = computed(() =>
  (content.value.recipe.sellingPoint || '').trim(),
);

/**
 * 须额外添加的营养素：**营养素名 + 每公斤添加浓度**。
 *
 * 快照里的 supplements[].targets 已经是营养师定的目标（钙/锌/…），
 * 不再显示补剂原料名或添加时机 —— 那是"买哪瓶"和"什么时候加"，
 * 不是这一页要回答的"补什么、补多少"。
 */
const supplementTargetRows = computed(() => {
  const rows: Array<{ nutrient: string; concentration: string }> = [];
  for (const supplement of content.value.supplements || []) {
    for (const target of supplement.targets || []) {
      const nutrient = String(target.label || '').trim();
      if (!nutrient) continue;
      const raw = target.targetValuePerKg;
      const value = raw === null || raw === undefined ? NaN : Number(raw);
      const unit = String(target.unit || 'g').trim();
      rows.push({
        nutrient,
        concentration: Number.isFinite(value)
          ? `每公斤食材添加 ${Math.round(value)} ${unit}`
          : '—',
      });
    }
  }
  return rows;
});

/** 喂食量取整（2026-10-24）；日喂量和每餐量各自四舍五入，允许 1g 误差 */
function formatFeedingGrams(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const grams = Number(value);
  if (!Number.isFinite(grams)) return '';
  return String(Math.round(grams));
}

/** 底部固定栏上那行交付日期 */
const deliveryDateText = computed(() => {
  const raw = (delivery.value as any)?.deliveryDate || '';
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return `交付于 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const load = async () => {
  loading.value = true;
  try {
    delivery.value = await fetchDelivery(
      orderId.value,
      undefined,
      recipeId.value,
    );
    orderDogId.value = '';
    if (delivery.value && !(delivery.value as any).dogId) {
      try {
        const detail = await fetchOrderDetail(orderId.value);
        orderDogId.value = String(detail.dogId || '');
      } catch (error) {
        console.warn('[Delivery] 补取订单狗狗失败:', error);
      }
    }
  } finally {
    loading.value = false;
  }
};

const goBack = () => uni.navigateBack();

/** 这一份的业务食谱编号；没有就返回空（按钮会提示而不是跳空页） */
const selectedRecipeId = computed(
  () => resolved.value?.recipeId ?? recipeId.value ?? '',
);

/** 交付单上的狗；DIY / 成品下单都要预选它，不能再让顾客选一次 */
const dogId = computed(() =>
  String((delivery.value as any)?.dogId || orderDogId.value || ''),
);

/**
 * 自己做：进 DIY 配置页，按**交付的那一版**取食谱。
 *
 * `orderId` 是版本锁的钥匙 —— 后端据此从交付记录里读出版本号；
 * `recipeId` 决定多份订单里是哪一份；`dogId` 让选狗那一步直接预选。
 */
const goDiy = () => {
  if (!selectedRecipeId.value) {
    uni.showToast({ title: '这条交付缺少食谱编号', icon: 'none' });
    return;
  }
  uni.navigateTo({
    url: buildDeliveryDiyUrl(
      orderId.value,
      selectedRecipeId.value,
      dogId.value,
    ),
  });
};

/** 订购成品：进成品订购页，同样带这份食谱和这只狗 */
const goOrderFinished = () => {
  if (!selectedRecipeId.value) {
    uni.showToast({ title: '这条交付缺少食谱编号', icon: 'none' });
    return;
  }
  uni.navigateTo({
    url: buildFinishedFoodOrderUrl(selectedRecipeId.value, dogId.value),
  });
};

onLoad((options) => {
  orderId.value = options?.orderId ? decodeURIComponent(options.orderId) : '';
  recipeId.value = options?.recipeId
    ? decodeURIComponent(options.recipeId)
    : '';
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
  padding: 24rpx 24rpx calc(180rpx + env(safe-area-inset-bottom));
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






/* ===== 多份交付：本次共 N 份 / 当前第几份（2026-10-21）===== */
.batch-note {
  margin: 18rpx 0 24rpx;
  padding: 16rpx 24rpx;
  background: rgba(216, 188, 133, 0.12);
  border: 1rpx solid rgba(216, 188, 133, 0.28);
  border-radius: 999rpx;
}

.batch-note-text {
  font-size: 24rpx;
  color: #d8bc85;
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




.footer-note {
  padding: 20rpx 8rpx 60rpx;
  font-size: 22rpx;
  line-height: 1.6;
  text-align: center;
  color: rgba(244, 236, 216, 0.45);
}

/* ===== 2026-10-18 新增：一句话卖点 ===== */
.oneline {
  background: #fff8ec;
  border: 1.5px solid #e8c88a;
  border-radius: 24rpx;
  padding: 22rpx 26rpx;
  margin-bottom: 20rpx;
}

.oneline-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.65;
  color: #3f3222;
  /* 默认两行：存得下 200 字，只露两行 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.oneline-text--open {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}

.oneline-toggle {
  display: block;
  text-align: right;
  font-size: 21rpx;
  font-weight: 700;
  color: #b45309;
  margin-top: 8rpx;
}

/* ===== 2026-10-18 新增：额外补充的营养素 ===== */
.nutrient-box {
  background: #f4f7f5;
  border-radius: 24rpx;
  padding: 8rpx 24rpx;
}

/* 营养素表头（2026-10-24）：营养素 / 添加浓度 */
.nutrient-head {
  display: flex;
  align-items: center;
  padding: 14rpx 0 10rpx;
  border-bottom: 1rpx solid #dfe9e3;
}

.nutrient-head .nutrient-name,
.nutrient-head .nutrient-value {
  font-size: 20rpx;
  font-weight: 500;
  color: #8a9a8f;
}

.nutrient-head .nutrient-value {
  flex-shrink: 0;
  margin-left: 16rpx;
}

.nutrient-row {
  display: flex;
  align-items: baseline;
  padding: 16rpx 0;
  border-bottom: 1px dashed #dfe9e3;
}

.nutrient-row:last-child {
  border-bottom: 0;
}

.nutrient-name {
  flex: 1;
  font-size: 25rpx;
  font-weight: 600;
  color: #3f3222;
}

.nutrient-value {
  font-size: 22rpx;
  font-weight: 700;
  color: #1e5b35;
}

/* ===== 2026-10-18 新增：底部固定栏 ===== */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  padding: 16rpx 24rpx calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(22, 38, 31, 0), #16261f 34%);
}

.bottom-bar__inner {
  background: #fff;
  border-radius: 24rpx;
  padding: 16rpx 20rpx;
}

.bottom-bar__date {
  display: flex;
  justify-content: center;
  margin-bottom: 10rpx;
}

.bottom-bar__date-text {
  font-size: 21rpx;
  color: #8a7a66;
}

.bottom-bar__btn {
  flex: 1;
  min-width: 0;
  width: auto;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 700;
  border-radius: 999rpx;
  padding: 0 10rpx;
  line-height: 1;
}

.bottom-bar__actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.bottom-bar__btn--secondary {
  background: #fffdf7;
  border: 1rpx solid #d9cdb8;
  color: #1e3a2f;
}

.bottom-bar__btn--primary {
  flex: 1.15;
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  color: #1e3a2f;
}

.bottom-bar__btn::after {
  border: 0;
}

/* ===== 2026-10-23 顾客端统一视觉：温暖私厨 ===== */
.delivery-page {
  background: #f3eee3;
  padding: 24rpx 24rpx calc(190rpx + env(safe-area-inset-bottom));
}

.recipe-cover {
  margin-bottom: 24rpx;
  border-radius: 28rpx;
  overflow: hidden;
  box-shadow: 0 18rpx 46rpx rgba(20, 41, 31, 0.2);
}

.batch-note {
  margin: 0 0 22rpx;
  background: #f7f1e4;
  border-color: #e8decd;
}

.batch-note-text {
  color: #8a6d2f;
}

.section {
  background: #fffdf7;
  border: 1rpx solid #e8decd;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 34rpx rgba(30, 58, 47, 0.05);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 14rpx;
  font-size: 29rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
  color: #1e3a2f;
}

.section-title::before {
  content: '';
  width: 5rpx;
  height: 28rpx;
  border-radius: 4rpx;
  background: #c6a15b;
}

.section-note {
  color: #7d7564;
}

.feeding-cell {
  background: #f7f1e4;
  border: 1rpx solid #eee5d6;
}

.feeding-value {
  font-family: "Songti SC", "STSong", serif;
  color: #1e3a2f;
}

.feeding-unit {
  color: #8a806c;
}

.shopping-buy {
  color: #1e3a2f;
}

.shopping-net,
.shopping-loss {
  color: #8a806c;
}

.shopping-total {
  color: #b08d4f;
}

.step-text {
  color: #2f3a30;
}

.oneline {
  background: #fffdf7;
  border-color: #e8decd;
}

.footer-note {
  color: #9a927f;
}

.bottom-bar {
  background: linear-gradient(180deg, rgba(243, 238, 227, 0), #f3eee3 34%);
}

.bottom-bar__inner {
  background: #fffdf7;
  border: 1rpx solid #e8decd;
  box-shadow: 0 10rpx 30rpx rgba(30, 58, 47, 0.08);
}

.bottom-bar__btn--primary {
  background: linear-gradient(135deg, #e7d3a5 0%, #d8bc85 100%);
  color: #1e3a2f;
  border-radius: 999rpx;
}

.state-title {
  color: #1e3a2f;
}

.state-text {
  color: #7d7564;
}

.state-btn {
  color: #1e3a2f;
  background: #d8bc85;
}

</style>
