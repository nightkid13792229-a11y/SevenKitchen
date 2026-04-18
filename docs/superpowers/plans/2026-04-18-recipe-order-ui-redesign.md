# 订购成品页 UI 与交互重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构小程序端订购成品页，让顾客能按产品、饭量参考、分装、采购方案、原料清单、产品说明和底部价格栏完成购买决策。

**Architecture:** 只改小程序 `recipe-order` 页面和页面级回归测试，不改后端、确认订单页、订单详情页或后台。页面继续复用现有狗狗档案、饭量计算、价格预览、价格快照、分装方案和原料成本明细接口；新增的 UI 状态和展示 helper 都留在页面内，避免提前抽象。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、uni-app 小程序组件、Vitest 文本级回归测试。

---

## File Map

- Modify: `miniapp/src/pages/recipe-order.regression.spec.ts`
  - Add UI contract tests for the redesigned page copy, ordering, custom package affordance, ingredient list columns, product explanation, and bottom bar wording.
- Modify: `miniapp/src/pages/recipe-order/index.vue`
  - Refactor template into the confirmed business order.
  - Add UI state helpers for package editor, pricing loading/error, source-plan card prices, ingredient summary, bottom-bar copy, and product explanation cards.
  - Update styles for compact mobile layout, source-plan cards, ingredient rows, explanation cards, and fixed bottom price/action bar.

No backend, admin-web, checkout, or order-detail files are part of this implementation.

---

### Task 1: Strengthen Recipe Order UI Contract Tests

**Files:**
- Modify: `miniapp/src/pages/recipe-order.regression.spec.ts`

- [ ] **Step 1: Add failing tests for the redesigned customer flow**

Append these tests inside the existing `describe('recipe-order phase one UI contract', () => {` block before its final closing `});`:

```ts
  it('presents the redesigned purchase decision sections in order', () => {
    const sectionOrder = [
      '请选择狗狗后查看饭量和价格',
      '饭量参考',
      '当前分装方案',
      '原料采购方案',
      '原料清单',
      '产品说明',
      '分装及物流说明',
      'bottom-bar',
    ];

    const positions = sectionOrder.map((text) => source.indexOf(text));
    positions.forEach((position, index) => {
      expect(position, `${sectionOrder[index]} should exist`).toBeGreaterThan(-1);
    });

    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index], `${sectionOrder[index]} should appear after ${sectionOrder[index - 1]}`)
        .toBeGreaterThan(positions[index - 1]);
    }
  });

  it('makes custom package planning obvious without quick meal-size editing', () => {
    expect(source).toContain('可自定义');
    expect(source).toContain('修改分装方案');
    expect(source).toContain('+ 添加另一种规格');
    expect(source).toContain('订单总量由分装明细自动汇总，满 1000g 可下单。');
    expect(source).toContain('当前 {{ Math.round(totalGrams) }}g，最低订购量为 1000g');
  });

  it('shows source plan cards with pricing impact copy', () => {
    expect(source).toContain('source-plan-card');
    expect(source).toContain('方案会影响原料清单和订单价格');
    expect(source).toContain('formatSourcePlanPrice(option.code)');
    expect(source).toContain('loadSourcePlanPricePreviews');
  });

  it('shows a compact ingredient summary and the full four-column ingredient list', () => {
    expect(source).toContain('ingredient-summary-title');
    expect(source).toContain('查看全部 {{ totalIngredientCount }} 种原料');
    expect(source).toContain('原料名称');
    expect(source).toContain('规格');
    expect(source).toContain('采购渠道');
    expect(source).toContain('用量');
    expect(source).toContain('ingredient-channel-tag');
  });

  it('explains product handling, storage, production, and logistics before checkout', () => {
    expect(source).toContain('为什么要把所有原料打碎？');
    expect(source).toContain('保存方法、保质期和烹饪说明');
    expect(source).toContain('当日采购当日制作，冷冻 24 小时后发货');
    expect(source).toContain('分装及物流说明');
    expect(source).toContain('按袋真空分装');
  });

  it('uses bag-based bottom pricing states instead of daily pricing', () => {
    expect(source).toContain('bottomPriceTitle');
    expect(source).toContain('bottomPriceSubtitle');
    expect(source).toContain('¥${averagePricePerPackage.value.toFixed(2)}/袋');
    expect(source).toContain('多规格共 ${totalPackages.value}袋');
    expect(source).not.toContain('每日预估');
    expect(source).not.toContain('pricePerDayText');
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd miniapp
npm test -- src/pages/recipe-order.regression.spec.ts
```

Expected: the new tests fail because the current page still uses the older layout, older copy, and daily price text.

---

### Task 2: Add Page State Helpers For The New Interaction Model

**Files:**
- Modify: `miniapp/src/pages/recipe-order/index.vue`

- [ ] **Step 1: Add types and refs near the existing pricing and display state**

Add these definitions after the `interface PricePreview` declaration and near the existing refs:

```ts
type SourcePlanPriceState = Record<IngredientSourcePlanCode, number | null>

interface ProductExplanationCard {
  title: string
  points: string[]
}

const sourcePlanPrices = ref<SourcePlanPriceState>({
  ORGANIC: null,
  MARKET_PREMIUM: null,
  WHOLESALE: null,
})
const sourcePlanPriceLoading = ref(false)
const isPricePreviewLoading = ref(false)
const pricePreviewError = ref('')
const showPackageEditor = ref(false)

const productExplanationCards: ProductExplanationCard[] = [
  {
    title: '为什么要把所有原料打碎？',
    points: [
      '让不同原料充分混合，每袋营养更均匀。',
      '减少挑食，避免只挑肉不吃菜或补剂。',
      '更适合冷冻、解冻和复热后的状态稳定。',
    ],
  },
  {
    title: '保存方法、保质期和烹饪说明',
    points: [
      '-18℃ 冷冻保存，建议 3 个月内吃完。',
      '冷藏后请尽快食用，不建议反复冷冻解冻。',
      '喂食前充分解冻，可隔水复温或按说明加热。',
    ],
  },
  {
    title: '当日采购当日制作，冷冻 24 小时后发货',
    points: [
      '根据目标制作日期采购原料。',
      '当日制作并按袋分装。',
      '冷冻 24 小时后再安排冷链发货。',
    ],
  },
]
```

- [ ] **Step 2: Add computed display helpers before `canBuyNow`**

Add:

```ts
const averagePricePerPackage = computed(() => {
  if (!pricePreview.value || totalPackages.value <= 0) return 0
  return pricePreview.value.amountTotal / totalPackages.value
})

const isSinglePackageSpec = computed(() => normalizedPackagePlan.value.length === 1)

const packagePlanSummaryText = computed(() => {
  if (isSinglePackageSpec.value) {
    const row = normalizedPackagePlan.value[0]
    return `${row.packageSpecG}g × ${row.packageCount}袋`
  }
  return `多规格共 ${totalPackages.value}袋`
})

const bottomPriceTitle = computed(() => {
  if (!selectedDogId.value) return '请选择狗狗'
  if (isPricePreviewLoading.value || sourcePlanPriceLoading.value) return '计算中'
  if (!minimumOrderMet.value) return '未满 1000g'
  if (pricePreviewError.value) return '价格暂未生成'
  if (!pricePreview.value) return '--'
  return `¥${pricePreview.value.amountTotal.toFixed(2)}`
})

const bottomPriceSubtitle = computed(() => {
  if (!selectedDogId.value) return '选择狗狗后查看饭量和价格'
  if (isPricePreviewLoading.value || sourcePlanPriceLoading.value) return '价格生成后可下单'
  if (!minimumOrderMet.value) return `当前 ${Math.round(totalGrams.value)}g，暂不可下单`
  if (pricePreviewError.value) return '请稍后重试或切换分装/采购方案'
  if (!pricePreview.value || totalPackages.value <= 0) return '等待价格生成'
  if (isSinglePackageSpec.value) {
    return `¥${averagePricePerPackage.value.toFixed(2)}/袋 · ${packagePlanSummaryText.value}`
  }
  return `均价 ¥${averagePricePerPackage.value.toFixed(2)}/袋 · ${packagePlanSummaryText.value}`
})

const dogSummaryText = computed(() => {
  if (!selectedDog.value) return '请选择狗狗后查看饭量和价格'
  return `${selectedDog.value.name} · ${selectedDog.value.currentWeightKg}kg · ${selectedDog.value.mealsPerDay}餐/天`
})

const feedingHintText = computed(() => {
  if (!selectedDog.value) return '请选择狗狗后查看饭量和价格'
  return `系统建议每日 ${Math.round(displayDailyIntakeG.value)}g，每餐约 ${Math.round(perMealG.value)}g`
})

const totalIngredientCount = computed(() => foodIngredients.value.length + supplementIngredients.value.length)

const ingredientSummaryTitle = computed(() => {
  if (totalIngredientCount.value === 0) return '当前食谱暂无可展示原料，请联系客服确认'
  const names = foodIngredients.value.slice(0, 3).map((item) => item.name).join('、')
  return `${names}${totalIngredientCount.value > 3 ? '等' : ''} ${totalIngredientCount.value} 种原料`
})

const ingredientSummaryMeta = computed(() => {
  const totalFoodKg = foodIngredients.value.reduce(
    (sum, item) => sum + (item.netAmount ?? item.amount),
    0,
  )
  return `${foodIngredients.value.length}种食材 · ${supplementIngredients.value.length}种补剂 · 净重 ${totalFoodKg.toFixed(2)}kg`
})
```

- [ ] **Step 3: Remove obsolete daily price helpers**

Delete the current `pricePerDay` and `pricePerDayText` computed blocks. The bottom bar will use `bottomPriceTitle` and `bottomPriceSubtitle`.

---

### Task 3: Split Selected Preview From Source-Plan Card Prices

**Files:**
- Modify: `miniapp/src/pages/recipe-order/index.vue`

- [ ] **Step 1: Add a reusable pricing request function above `loadPricePreview`**

Add:

```ts
async function requestPricingPreview(sourcePlan: IngredientSourcePlanCode) {
  return request({
    url: '/orders/pricing/preview',
    method: 'POST',
    data: {
      dogId: selectedDogId.value,
      type: 'FRESH_FOOD',
      ingredientSourcePlan: sourcePlan,
      items: [{
        recipeId: recipeId.value,
        packagePlan: normalizedPackagePlan.value,
        dailyIntakeG: displayDailyIntakeG.value,
        preparationMethod: preparationMethod.value || undefined,
        cookingMethod: cookingMethod.value || undefined,
      }]
    }
  })
}
```

- [ ] **Step 2: Rewrite `loadPricePreview` to use loading and error state**

Replace the body of `loadPricePreview` with:

```ts
async function loadPricePreview() {
  const requestSeq = ++pricingPreviewRequestSeq
  resetPricePreviewState()
  pricePreviewError.value = ''

  if (!selectedDog.value || !isPackagePlanReadyForDog.value) return
  if (!minimumOrderMet.value) return

  isPricePreviewLoading.value = true

  try {
    const res = await requestPricingPreview(selectedSourcePlan.value)
    if (res.code === 0 && res.data) {
      if (requestSeq !== pricingPreviewRequestSeq) {
        return
      }

      pricePreview.value = {
        amountProduct: res.data.amountProduct || 0,
        amountShipping: res.data.amountShipping || 0,
        amountTotal: res.data.amountTotal || 0,
        pricingBreakdown: res.data.pricingBreakdown || undefined
      }
      pricingSnapshotId.value = res.data.snapshotId || null
      sourcePlanPrices.value = {
        ...sourcePlanPrices.value,
        [selectedSourcePlan.value]: pricePreview.value.amountTotal,
      }
      console.log('[Price Preview] Snapshot ID:', pricingSnapshotId.value)
    } else if (requestSeq === pricingPreviewRequestSeq) {
      pricePreviewError.value = '价格暂未生成'
    }
  } catch (error: any) {
    if (requestSeq !== pricingPreviewRequestSeq) {
      return
    }

    if (!error?.message?.includes('订单净重不足')) {
      console.error('Load price preview error:', error)
    }

    pricePreviewError.value = '价格暂未生成'
    resetPricePreviewState()
  } finally {
    if (requestSeq === pricingPreviewRequestSeq) {
      isPricePreviewLoading.value = false
    }
  }
}
```

- [ ] **Step 3: Add card-price preview loader**

Add below `loadPricePreview`:

```ts
async function loadSourcePlanPricePreviews() {
  if (!selectedDog.value || !isPackagePlanReadyForDog.value || !minimumOrderMet.value) {
    sourcePlanPrices.value = {
      ORGANIC: null,
      MARKET_PREMIUM: null,
      WHOLESALE: null,
    }
    return
  }

  sourcePlanPriceLoading.value = true

  try {
    const previews = await Promise.all(
      SOURCE_PLAN_OPTIONS.map(async (option) => {
        try {
          const res = await requestPricingPreview(option.code)
          return [option.code, res.code === 0 && res.data ? Number(res.data.amountTotal || 0) : null] as const
        } catch (error) {
          console.error('[Source Plan Price] preview failed:', option.code, error)
          return [option.code, null] as const
        }
      }),
    )

    sourcePlanPrices.value = previews.reduce((next, [code, amount]) => ({
      ...next,
      [code]: amount,
    }), {
      ORGANIC: null,
      MARKET_PREMIUM: null,
      WHOLESALE: null,
    } as SourcePlanPriceState)
  } finally {
    sourcePlanPriceLoading.value = false
  }
}

function formatSourcePlanPrice(code: IngredientSourcePlanCode): string {
  if (sourcePlanPriceLoading.value) return '计算中'
  const amount = sourcePlanPrices.value[code]
  if (amount === null || !Number.isFinite(amount)) return '切换后计算'
  return `¥${amount.toFixed(2)}`
}
```

- [ ] **Step 4: Refresh card prices when package inputs or source plan change**

Update these functions:

```ts
function schedulePricePreview() {
  clearPricePreviewDebounce()
  pricePreviewDebounceTimer = setTimeout(() => {
    pricePreviewDebounceTimer = null
    loadPricePreview()
    loadSourcePlanPricePreviews()
  }, 300)
}

function selectSourcePlan(code: IngredientSourcePlanCode) {
  selectedSourcePlan.value = code
  loadPricePreview()
  loadSourcePlanPricePreviews()
}

function selectCycle(days: number) {
  selectedCycleDays.value = days
  showPackageEditor.value = false
  rebuildPackagePlan()
  loadPricePreview()
  loadSourcePlanPricePreviews()
}
```

Also call `loadSourcePlanPricePreviews()` immediately after `loadPricePreview()` in `loadDogCalcResult`.

---

### Task 4: Refactor The Template Into The Confirmed Section Order

**Files:**
- Modify: `miniapp/src/pages/recipe-order/index.vue`

- [ ] **Step 1: Replace the current top recipe header and dog section with a product hero**

Use this structure at the top of `<template>`:

```vue
    <view class="product-hero">
      <image
        v-if="recipe.coverImageUrl"
        :src="normalizeImageUrl(recipe.coverImageUrl)"
        class="hero-image"
        mode="aspectFill"
      />
      <view v-else class="hero-image-placeholder">
        <text class="hero-placeholder-text">成品鲜食</text>
      </view>

      <view class="hero-content">
        <text class="recipe-name">{{ recipe.name }}</text>
        <view class="recipe-tags">
          <text
            v-for="stage in recipe.applicableLifeStages"
            :key="stage"
            class="tag life-stage-tag"
          >
            {{ getLifeStageLabel(stage) }}
          </text>
          <text
            v-for="tag in recipe.targetHealthTags"
            :key="tag"
            class="tag health-tag"
          >
            {{ getHealthTagLabel(tag) }}
          </text>
        </view>

        <view class="hero-meta-row">
          <text class="hero-meta-label">能量密度</text>
          <text class="hero-meta-value">{{ recipe.energyDensityKcalPerKg || '-' }} kcal/kg</text>
        </view>

        <view class="hero-dog-card">
          <view class="hero-dog-copy">
            <text class="hero-dog-label">当前狗狗</text>
            <text class="hero-dog-value">{{ dogSummaryText }}</text>
            <text class="hero-dog-hint">{{ feedingHintText }}</text>
          </view>
          <picker v-if="dogs.length > 0" mode="selector" :range="dogPickerOptions" range-key="label" @change="onDogPickerChange">
            <view class="hero-dog-action">{{ selectedDog ? '切换' : '选择' }}</view>
          </picker>
          <button v-else class="hero-dog-action button-reset" @tap="goToCreateDog">创建</button>
        </view>
      </view>
    </view>
```

- [ ] **Step 2: Update the life-stage warning copy**

Replace the warning body with:

```vue
      <text class="warning-text">
        该食谱可能不完全适合当前生命阶段，建议确认后再下单。
      </text>
      <button class="btn-continue" @tap="dismissWarning">
        我已知晓，继续订购
      </button>
```

- [ ] **Step 3: Replace the feeding section content**

Use:

```vue
    <view class="section feeding-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">饭量参考</text>
      </view>

      <view class="feeding-grid">
        <view class="feeding-item">
          <text class="feeding-label">每日建议饭量</text>
          <text class="feeding-value">{{ Math.round(displayDailyIntakeG) }}g/天</text>
        </view>
        <view class="feeding-item">
          <text class="feeding-label">每日餐数</text>
          <text class="feeding-value">{{ selectedDog.mealsPerDay }}餐</text>
        </view>
        <view class="feeding-item">
          <text class="feeding-label">每餐参考量</text>
          <text class="feeding-value">{{ Math.round(perMealG) }}g/餐</text>
        </view>
      </view>

      <text class="section-note">饭量为喂食参考，实际购买总量由下方分装方案汇总决定。</text>

      <view class="calculation-explanation">
        <view class="explanation-header" @tap="toggleCalculationDetails">
          <text class="explanation-title">查看计算过程</text>
          <text class="toggle-icon">{{ showCalculationDetails ? '▲' : '▼' }}</text>
        </view>
        <view v-if="showCalculationDetails && dogCalcResult" class="explanation-content">
          <view class="calc-cards">
            <view class="calc-card">
              <text class="card-title">每日能量需求</text>
              <view class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.totalDer || 0) }} kcal/天</text>
              </view>
            </view>
            <view class="calc-card">
              <text class="card-title">每日零食能量</text>
              <view class="calc-result">
                <text v-if="dogCalcResult.treatDeduction && dogCalcResult.treatDeduction > 0" class="result-value">{{ Math.round(dogCalcResult.treatDeduction) }} kcal/天</text>
                <text v-else class="result-note">未配置零食</text>
              </view>
            </view>
            <view class="calc-card">
              <text class="card-title">每日鲜食能量</text>
              <view class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.finalFoodKcal || 0) }} kcal/天</text>
              </view>
            </view>
            <view class="calc-card highlight">
              <text class="card-title">推算每日饭量</text>
              <view class="formula-box">
                <text class="formula-text">鲜食能量 ÷ 食谱能量密度 × 1000</text>
              </view>
              <view class="calc-result final">
                <text class="result-value highlight">{{ Math.round(dogCalcResult.dailyIntakeG || displayDailyIntakeG) }} g/天</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
```

- [ ] **Step 4: Merge cycle and package plan into one section**

Replace the separate “订购周期” and “自定义分装” sections with:

```vue
    <view class="section package-plan-section" v-if="selectedDog">
      <view class="section-title">
        <view class="title-stack">
          <text class="title-text">当前分装方案</text>
          <text class="title-subtitle">系统已按 {{ selectedCycleDays }} 天生成，您可以按冷冻空间或每餐习惯修改规格。</text>
        </view>
        <text class="custom-tag">可自定义</text>
      </view>

      <view class="cycle-options">
        <view
          v-for="days in ORDER_CYCLE_OPTIONS"
          :key="days"
          class="cycle-option"
          :class="{ active: selectedCycleDays === days }"
          @tap="selectCycle(days)"
        >
          <text class="cycle-text">{{ days }}天</text>
        </view>
      </view>

      <view class="package-plan-preview">
        <view
          v-for="(row, index) in normalizedPackagePlan"
          :key="index"
          class="package-preview-row"
        >
          <text class="package-preview-main">{{ row.packageSpecG }}g × {{ row.packageCount }}袋</text>
          <text class="package-preview-sub">{{ row.packageSpecG * row.packageCount }}g</text>
        </view>
      </view>

      <view class="total-summary package-summary">
        <view class="summary-item">
          <text class="summary-label">总净重</text>
          <text class="summary-value">{{ Math.round(totalGrams) }}g</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">总袋数</text>
          <text class="summary-value">{{ totalPackages }}袋</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">预计可喂</text>
          <text class="summary-value">{{ estimatedFeedDays }}天</text>
        </view>
      </view>

      <view v-if="!minimumOrderMet" class="min-order-warning">
        <text class="warning-text">当前 {{ Math.round(totalGrams) }}g，最低订购量为 1000g</text>
      </view>

      <button class="btn-secondary-full" @tap="showPackageEditor = !showPackageEditor">
        {{ showPackageEditor ? '收起分装方案' : '修改分装方案' }}
      </button>

      <view v-if="showPackageEditor" class="package-plan-list">
        <view
          v-for="(row, index) in packagePlan"
          :key="index"
          class="package-plan-row"
        >
          <view class="package-input-group">
            <text class="package-input-label">每袋</text>
            <input
              class="package-input"
              type="number"
              :value="row.packageSpecG"
              @input="updatePackagePlanRow(index, 'packageSpecG', $event.detail.value)"
            />
            <text class="package-input-unit">g</text>
          </view>
          <view class="package-input-group">
            <text class="package-input-label">袋数</text>
            <input
              class="package-input"
              type="number"
              :value="row.packageCount"
              @input="updatePackagePlanRow(index, 'packageCount', $event.detail.value)"
            />
            <text class="package-input-unit">袋</text>
          </view>
          <button
            class="btn-remove-row"
            :disabled="packagePlan.length <= 1"
            @tap="removePackagePlanRow(index)"
          >
            删除
          </button>
        </view>
        <button class="btn-add-row" @tap="addPackagePlanRow">+ 添加另一种规格</button>
      </view>

      <text class="section-note">订单总量由分装明细自动汇总，满 1000g 可下单。</text>
    </view>
```

- [ ] **Step 5: Replace source plan options with cards**

Use:

```vue
    <view class="section source-plan-section" v-if="selectedDog">
      <view class="section-title">
        <view class="title-stack">
          <text class="title-text">原料采购方案</text>
          <text class="title-subtitle">方案会影响原料清单和订单价格</text>
        </view>
      </view>

      <view class="source-plan-options">
        <view
          v-for="option in SOURCE_PLAN_OPTIONS"
          :key="option.code"
          class="source-plan-card"
          :class="{ active: selectedSourcePlan === option.code }"
          @tap="selectSourcePlan(option.code)"
        >
          <view class="source-plan-main">
            <text class="source-plan-name">{{ option.label }}</text>
            <text class="source-plan-desc">{{ option.description }}</text>
          </view>
          <view class="source-plan-side">
            <text class="source-plan-price">{{ formatSourcePlanPrice(option.code) }}</text>
            <text v-if="selectedSourcePlan === option.code" class="source-plan-check">已选</text>
          </view>
        </view>
      </view>

      <text class="section-note">当前部分原料暂无替代来源时，系统会按可用来源匹配。</text>
    </view>
```

- [ ] **Step 6: Move ingredient list immediately after source plans and make it summary-first**

Use:

```vue
    <view class="section ingredients-section" v-if="selectedDog">
      <view class="section-title">
        <view class="title-stack">
          <text class="title-text">原料清单</text>
          <text class="title-subtitle">{{ sourcePlanLabel }}</text>
        </view>
      </view>

      <view class="ingredient-summary">
        <text class="ingredient-summary-title">{{ ingredientSummaryTitle }}</text>
        <text class="ingredient-summary-meta">{{ ingredientSummaryMeta }}</text>
      </view>

      <button
        v-if="totalIngredientCount > 0"
        class="btn-secondary-full"
        @tap="toggleIngredientDetails"
      >
        {{ showIngredientDetails ? '收起原料清单' : `查看全部 ${totalIngredientCount} 种原料` }}
      </button>

      <view v-if="showIngredientDetails" class="ingredients-content">
        <view v-if="foodIngredients.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">主要食材</view>
          <view class="ingredient-header compact">
            <text class="ingredient-header-item">原料名称</text>
            <text class="ingredient-header-item">规格</text>
            <text class="ingredient-header-item">采购渠道</text>
            <text class="ingredient-header-item">用量</text>
          </view>
          <view v-for="(ingredient, idx) in foodIngredients" :key="'food-' + idx" class="ingredient-row-compact">
            <text class="ingredient-name">{{ ingredient.name }}</text>
            <text class="ingredient-spec">{{ ingredient.brand || '-' }}</text>
            <text class="ingredient-channel-tag">{{ ingredient.purchaseChannel || '默认来源' }}</text>
            <text class="ingredient-amount">
              {{ Math.round((ingredient.netAmount ?? ingredient.amount) * 1000) }}{{ ingredient.displayUnit || ingredient.unit }}
            </text>
          </view>
        </view>

        <view v-if="supplementIngredients.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">营养补剂</view>
          <view class="ingredient-header compact">
            <text class="ingredient-header-item">原料名称</text>
            <text class="ingredient-header-item">规格</text>
            <text class="ingredient-header-item">采购渠道</text>
            <text class="ingredient-header-item">用量</text>
          </view>
          <view v-for="(ingredient, idx) in supplementIngredients" :key="'supplement-' + idx" class="ingredient-row-compact">
            <text class="ingredient-name">{{ ingredient.name }}</text>
            <text class="ingredient-spec">{{ ingredient.brand || '-' }}</text>
            <text class="ingredient-channel-tag supplement">{{ ingredient.purchaseChannel || '默认来源' }}</text>
            <text class="ingredient-amount">
              {{ (ingredient.netAmount ?? ingredient.amount).toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
            </text>
          </view>
        </view>
      </view>
    </view>
```

Inside each ingredient row, use:

```vue
            <text class="ingredient-name">{{ ingredient.name }}</text>
            <text class="ingredient-spec">{{ ingredient.brand || '-' }}</text>
            <text class="ingredient-channel-tag">{{ ingredient.purchaseChannel || '默认来源' }}</text>
            <text class="ingredient-amount">
              {{ Math.round((ingredient.netAmount ?? ingredient.amount) * 1000) }}{{ ingredient.displayUnit || ingredient.unit }}
            </text>
```

- [ ] **Step 7: Replace product intro and package info with confirmed explanation sections**

Use:

```vue
    <view class="section product-explanation-section">
      <view class="section-title">
        <text class="title-text">产品说明</text>
      </view>

      <view class="explanation-card-list">
        <view
          v-for="card in productExplanationCards"
          :key="card.title"
          class="product-explanation-card"
        >
          <text class="product-explanation-title">{{ card.title }}</text>
          <text
            v-for="point in card.points"
            :key="point"
            class="product-explanation-point"
          >
            {{ point }}
          </text>
        </view>
      </view>
    </view>

    <view class="section logistics-section">
      <view class="section-title">
        <text class="title-text">分装及物流说明</text>
      </view>

      <view class="logistics-grid">
        <view class="logistics-item">
          <text class="logistics-title">按袋真空分装</text>
          <text class="logistics-copy">每袋贴标签，支持自定义规格。</text>
        </view>
        <view class="logistics-item">
          <text class="logistics-title">冷冻包材</text>
          <text class="logistics-copy">使用冷冻包材和冰袋，降低运输温度波动。</text>
        </view>
        <view class="logistics-item">
          <text class="logistics-title">顺丰生鲜或冷链配送</text>
          <text class="logistics-copy">按制作和冷冻节奏安排发货。</text>
        </view>
      </view>
    </view>
```

- [ ] **Step 8: Replace bottom bar pricing copy**

Use:

```vue
    <view class="bottom-bar">
      <view class="bottom-price">
        <text class="bottom-total">{{ bottomPriceTitle }}</text>
        <text class="bottom-estimate">{{ bottomPriceSubtitle }}</text>
      </view>
      <button
        class="btn-buy-now"
        :disabled="!canBuyNow"
        @tap="buyNow"
      >
        立即下单
      </button>
    </view>
```

Delete the old customer-facing standalone `price-section`. Keep the admin-only price breakdown section, because it is only visible to administrators and helps manual verification.

---

### Task 5: Restyle The Page For A Compact Mobile Purchase Flow

**Files:**
- Modify: `miniapp/src/pages/recipe-order/index.vue`

- [ ] **Step 1: Replace old header, dog picker, package, source-plan, ingredient, product, logistics, and bottom-bar styles**

Use the existing color language but update these class groups:

```css
.recipe-order-page {
  min-height: 100vh;
  background-color: #f6f7f8;
  padding-bottom: 170rpx;
}

.product-hero {
  background-color: #fff;
  margin-bottom: 20rpx;
}

.hero-image,
.hero-image-placeholder {
  width: 100%;
  height: 360rpx;
}

.hero-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #eef5ef;
}

.hero-placeholder-text {
  font-size: 32rpx;
  color: #6f8f76;
}

.hero-content {
  padding: 28rpx 28rpx 32rpx;
}

.hero-meta-row,
.hero-dog-card,
.package-preview-row,
.source-plan-card,
.ingredient-row-compact,
.logistics-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-dog-card {
  margin-top: 24rpx;
  padding: 22rpx;
  border-radius: 8rpx;
  background-color: #f6faf7;
  border: 2rpx solid #dceee0;
}

.hero-dog-copy,
.title-stack,
.source-plan-main {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.hero-dog-label,
.title-subtitle,
.section-note,
.ingredient-summary-meta,
.product-explanation-point,
.logistics-copy {
  font-size: 24rpx;
  color: #6f7378;
  line-height: 1.5;
}

.hero-dog-value,
.ingredient-summary-title,
.product-explanation-title,
.logistics-title {
  font-size: 28rpx;
  color: #25282b;
  font-weight: 700;
  line-height: 1.4;
}

.hero-dog-action,
.btn-secondary-full {
  border-radius: 8rpx;
  border: 2rpx solid #2f8f4e;
  color: #2f8f4e;
  background-color: #fff;
  font-size: 26rpx;
  text-align: center;
}

.hero-dog-action {
  min-width: 104rpx;
  height: 60rpx;
  line-height: 60rpx;
}

.btn-secondary-full {
  width: 100%;
  height: 76rpx;
  line-height: 76rpx;
  margin-top: 20rpx;
}

.custom-tag,
.source-plan-check,
.ingredient-channel-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6rpx;
  font-size: 22rpx;
  line-height: 1;
  white-space: nowrap;
}

.custom-tag {
  padding: 10rpx 14rpx;
  color: #2f8f4e;
  background-color: #ecf8ef;
}

.source-plan-card {
  gap: 18rpx;
  padding: 22rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 8rpx;
  background-color: #fff;
}

.source-plan-card.active {
  border-color: #2f8f4e;
  background-color: #f4fbf5;
}

.source-plan-side {
  min-width: 150rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10rpx;
}

.source-plan-price {
  font-size: 28rpx;
  font-weight: 700;
  color: #e6543f;
}

.source-plan-check {
  padding: 8rpx 12rpx;
  color: #2f8f4e;
  background-color: #e7f6eb;
}

.ingredient-summary {
  padding: 20rpx;
  border-radius: 8rpx;
  background-color: #f7faf8;
}

.ingredient-row-compact {
  display: grid;
  grid-template-columns: 1.2fr 1fr auto 96rpx;
  gap: 12rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #eef0f2;
}

.ingredient-name {
  font-size: 26rpx;
  font-weight: 700;
  color: #25282b;
}

.ingredient-spec {
  font-size: 24rpx;
  color: #687078;
}

.ingredient-channel-tag {
  padding: 8rpx 10rpx;
  color: #257b43;
  background-color: #e7f6eb;
}

.ingredient-amount {
  font-size: 24rpx;
  color: #25282b;
  text-align: right;
  font-weight: 700;
}

.explanation-card-list,
.logistics-grid {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.product-explanation-card,
.logistics-item {
  padding: 22rpx;
  border-radius: 8rpx;
  background-color: #f8fafc;
  border: 1rpx solid #e8edf2;
}

.product-explanation-title,
.product-explanation-point {
  display: block;
}

.product-explanation-point {
  margin-top: 10rpx;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.98);
  box-shadow: 0 -8rpx 28rpx rgba(18, 24, 31, 0.08);
}

.bottom-price {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.bottom-total {
  font-size: 36rpx;
  color: #e6543f;
  font-weight: 800;
  line-height: 1.15;
}

.bottom-estimate {
  font-size: 23rpx;
  color: #687078;
  line-height: 1.3;
}

.btn-buy-now {
  width: 240rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 8rpx;
  background-color: #1890ff;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}

.btn-buy-now[disabled] {
  background-color: #d8dde3;
  color: #fff;
}
```

- [ ] **Step 2: Remove styles that only support deleted UI**

Remove unused classes after the template no longer references them:

```css
.recipe-header
.recipe-cover-wrapper
.recipe-cover
.dog-section
.dog-picker
.price-section
.price-card
.product-intro-section
.product-intro-image
.package-info-row
.package-example-card
.shipping-service-card
```

Keep shared classes that are still used by admin-only price breakdown.

---

### Task 6: Verify Tests, Build, And Manual WeChat Flow

**Files:**
- Modify: `miniapp/src/pages/recipe-order.regression.spec.ts`
- Modify: `miniapp/src/pages/recipe-order/index.vue`

- [ ] **Step 1: Run focused regression test**

Run:

```bash
cd miniapp
npm test -- src/pages/recipe-order.regression.spec.ts
```

Expected: all tests in `recipe-order.regression.spec.ts` pass.

- [ ] **Step 2: Run miniapp test suite**

Run:

```bash
cd miniapp
npm test
```

Expected: Vitest exits with code 0.

- [ ] **Step 3: Build WeChat output**

Run:

```bash
cd miniapp
npm run build:mp-weixin
```

Expected: build exits with code 0 and `dist/build/mp-weixin` is generated.

- [ ] **Step 4: Manual verification in WeChat Developer Tools**

Open the miniapp project and verify:

```text
1. 进入食谱详情，点击订购成品。
2. 首屏展示产品图、食谱名称、能量密度、狗狗选择和价格状态摘要。
3. 未选择狗狗时底部按钮不可下单。
4. 选择狗狗后出现饭量参考，点击“查看计算过程”可展开。
5. 点击 7天、15天、30天，分装明细和底部价格随之刷新。
6. 点击“修改分装方案”，能看到每袋克数、袋数、删除和“+ 添加另一种规格”。
7. 把总量改到 1000g 以下，底部显示未满 1000g 且按钮禁用。
8. 切换三档原料采购方案，方案卡片价格、原料清单和底部价格刷新。
9. 原料清单默认摘要展示，点击后按“原料名称 / 规格 / 采购渠道 / 用量”紧凑显示。
10. 产品说明包含加工方式、保存/烹饪、当日采购当日制作冷冻 24 小时后发货。
11. 分装及物流说明紧跟产品说明。
12. 底部固定栏展示总价、袋均价和袋数；点击立即下单进入确认订单页。
```

- [ ] **Step 5: Commit only recipe-order implementation files**

Run:

```bash
git add miniapp/src/pages/recipe-order/index.vue miniapp/src/pages/recipe-order.regression.spec.ts
git commit -m "feat: redesign recipe order page"
```

Expected: commit contains only the recipe-order page and its regression spec.

---

## Self-Review

- Spec coverage: This plan covers product hero, feeding reference, default cycle and custom package editor, source plan cards, compact ingredient list, product explanation, logistics explanation, bottom bar states, price failure state, minimum order state, and verification.
- Scope: This plan stays inside the miniapp recipe order page and its page-level regression spec.
- Type consistency: `IngredientSourcePlanCode`, `PackagePlanItem`, `PricePreview`, `IngredientCostItem`, `SOURCE_PLAN_OPTIONS`, and existing price snapshot usage remain compatible with current code.
- Risk: The only added API load is source-plan card pricing, which calls the existing pricing preview endpoint for each plan and does not store snapshot IDs from non-selected plans.
