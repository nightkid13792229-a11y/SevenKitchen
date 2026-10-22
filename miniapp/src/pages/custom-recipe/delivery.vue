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

      <!-- 食材：**只给名称 + 占比**（不带制备方法 —— 那是制作单的事） -->
      <view class="section">
        <view class="section-title">食材</view>
        <RecipeIngredientRatioTable :items="foodItems" />
      </view>

      <!--
        额外补充的营养素：**列营养素名（钙）而不是产品名（钙粉）**。

        老板 2026-10-18 定的口径：这一页是"我的配方要求什么"，
        产品是第 2 页"我要买哪一瓶"的事。两个别混。
      -->
      <view v-if="nutrientRows.length" class="section">
        <view class="section-title">额外补充的营养素</view>
        <view class="nutrient-box">
          <view
            v-for="(row, index) in nutrientRows"
            :key="index"
            class="nutrient-row"
          >
            <text class="nutrient-name">{{ row.label }}</text>
            <text class="nutrient-value">{{ row.text }}</text>
          </view>
        </view>
      </view>

      <!-- 核心营养成分：标准 + 8 项 + 报告入口，合成一块（与详情页同一套） -->
      <view class="section">
        <RecipeNutritionCard
          :standard="content.nutrition.standard"
          :macros="content.nutrition.macros || null"
          :report-available="false"
        />
      </view>

      <view class="footer-note">
        <text>这份内容在交付时已存档，之后调整配方不会改变你现在看到的版本。</text>
      </view>
    </template>

    <!--
      固定栏：进第 2 页的**唯一入口**。
      老板 2026-10-18 审原型时指出"这边没给入口，顾客进不去第 2 页"——
      原来那个按钮在页面最底部，要滚到底才看得到。
    -->
    <view v-if="resolved" class="bottom-bar">
      <view class="bottom-bar__inner">
        <view v-if="deliveryDateText" class="bottom-bar__date">
          <text class="bottom-bar__date-text">{{ deliveryDateText }}</text>
        </view>
        <button class="bottom-bar__btn" @tap="goShopping">开始采购与制作</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { fetchDelivery } from '@/api/custom-recipe';
import {
  buildDeliveryShoppingUrl,
  deliveryBatchCountText,
  resolveDeliverySelection,
  type CustomRecipeDeliveryResponse,
} from '@/utils/custom-recipe-delivery';
import RecipeCover from '@/components/recipe/RecipeCover.vue';
import RecipeNutritionCard from '@/components/recipe/RecipeNutritionCard.vue';
import RecipeIngredientRatioTable from '@/components/recipe/RecipeIngredientRatioTable.vue';

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
const recipeId = ref('');
const loading = ref(true);
const delivery = ref<CustomRecipeDeliveryResponse | null>(null);

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
  return `${deliveryBatchCountText(current.batchSize)} · 当前查看第 ${
    current.selectedIndex + 1
  } 份`;
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
 * 额外补充的营养素：**名称 + 每 kg 添加量**。
 *
 * 口径：这一页列**营养素**（钙/锌/维生素D），不是产品（钙粉/鱼油）。
 * 数据来自快照的 `supplements[].targets`。
 */
const nutrientRows = computed(() => {
  const rows: Array<{ label: string; text: string }> = [];
  for (const supplement of content.value.supplements || []) {
    for (const target of supplement.targets || []) {
      const label = (target.label || '').trim();
      if (!label) continue;
      const perKg = target.targetValuePerKg;
      const unit = (target.unit || 'g').trim();
      const text =
        perKg === null || perKg === undefined
          ? '按说明添加'
          : `每kg食材添加 ${perKg}${unit}`;
      // 同一个营养素可能挂在多个补剂下，去重
      if (!rows.some((row) => row.label === label)) rows.push({ label, text });
    }
  }
  return rows;
});

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
  } finally {
    loading.value = false;
  }
};

const goBack = () => uni.navigateBack();

/**
 * 去第 2 页「采购与制作」。
 *
 * 必须把这一份的 `recipeId` 带过去；否则第 2 页会默认显示批次第一份，
 * 顾客在第 1 页看的是鸭肉、翻页却变成鸡肉。老单份订单不带这个参数。
 */
const goShopping = () => {
  /**
   * 老单份订单不带 recipeId —— 保持原来的链接形状；
   * 多份批次才需要把"看的是哪一份"传下去。
   */
  const selectedRecipeId = resolved.value?.recipeId ?? recipeId.value;
  const routeRecipeId = resolved.value?.isBatch
    ? selectedRecipeId
    : undefined;
  uni.navigateTo({
    url: buildDeliveryShoppingUrl(orderId.value, routeRecipeId),
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
  width: 100%;
  background: #b45309;
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  border-radius: 18rpx;
  padding: 22rpx 0;
  line-height: 1.2;
}

.bottom-bar__btn::after {
  border: 0;
}
</style>
