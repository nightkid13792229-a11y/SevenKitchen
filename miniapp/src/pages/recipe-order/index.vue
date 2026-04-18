<template>
  <view class="recipe-order-page">
    <view class="recipe-info-section">
      <view class="section-label">食谱信息</view>
      <image
        v-if="recipe.coverImageUrl"
        :src="normalizeImageUrl(recipe.coverImageUrl)"
        class="recipe-cover-image"
        mode="aspectFill"
      />
      <view v-else class="recipe-cover-placeholder">
        <text class="hero-placeholder-text">成品鲜食</text>
      </view>

      <view class="recipe-info-body">
        <text class="recipe-info-title">{{ recipe.name || '成品鲜食' }}</text>
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

        <view class="recipe-meta-grid">
          <view class="recipe-meta-card">
            <text class="recipe-meta-label">营养标准</text>
            <text class="recipe-meta-value">{{ recipeNutritionStandardLabel }}</text>
          </view>
          <view class="recipe-meta-card">
            <text class="recipe-meta-label">配方软件</text>
            <text class="recipe-meta-value">{{ recipeFormulaSoftwareLabel }}</text>
          </view>
          <view class="recipe-meta-card">
            <text class="recipe-meta-label">能量密度</text>
            <text class="recipe-meta-value">{{ recipe.energyDensityKcalPerKg || '-' }} kcal/kg</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section dog-feeding-section">
      <view v-if="!selectedDog" class="dog-empty-state">
        <text class="dog-empty-title">请选择狗狗后查看饭量和价格</text>
        <text class="dog-empty-copy">系统会结合狗狗档案和当前食谱计算建议用量。</text>
        <picker
          v-if="dogs.length > 0"
          mode="selector"
          :range="dogPickerOptions"
          range-key="label"
          @change="onDogPickerChange"
        >
          <view class="section-action-button dog-empty-action">选择狗狗</view>
        </picker>
        <button v-else class="section-action-button dog-empty-action button-reset" @tap="goToCreateDog">创建档案</button>
      </view>

      <view v-else class="dog-feeding-content">
        <view class="dog-profile-summary-row">
          <text class="dog-profile-summary">{{ dogProfileSummaryText }}</text>
          <picker
            v-if="dogs.length > 1"
            mode="selector"
            :range="dogPickerOptions"
            range-key="label"
            @change="onDogPickerChange"
          >
            <view class="section-action-button">切换狗狗</view>
          </picker>
        </view>

        <view v-if="!isLifeStageMatch && showWarning" class="warning-card inline-warning-card">
          <view class="warning-header">
            <text class="warning-title">生命阶段提醒</text>
          </view>
          <text class="warning-text">
            该食谱可能不完全适合当前生命阶段，建议确认后再下单。
          </text>
          <button class="btn-continue" @tap="dismissWarning">
            我已知晓，继续订购
          </button>
        </view>

        <view class="dog-feeding-grid">
          <view class="dog-feeding-item">
            <text class="feeding-label">主食能量</text>
            <text class="feeding-value">{{ dailyMainFoodEnergyText }}</text>
          </view>
          <view class="dog-feeding-item daily-intake-item">
            <text class="feeding-label">本食谱参考饭量</text>
            <text class="feeding-value">{{ dailySuggestedIntakeText }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section package-plan-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">订购天数</text>
      </view>

      <view class="cycle-options">
        <view
          v-for="days in ORDER_CYCLE_OPTIONS"
          :key="days"
          class="cycle-option"
          :class="{ active: selectedCycleDays === days, disabled: isCustomPackagePlan }"
          @tap="selectCycle(days)"
        >
          <text class="cycle-text">{{ days }}天</text>
        </view>
      </view>

      <view class="package-plan-toolbar">
        <text class="package-plan-inline-summary">{{ packagePlanInlineSummaryText }}</text>
        <button class="package-edit-button" @tap="togglePackageEditor">
          {{ showPackageEditor ? '取消自定义' : '自定义分装' }}
        </button>
      </view>

      <view v-if="packagePlanValidationMessage" class="min-order-warning">
        <text class="warning-text">{{ packagePlanValidationMessage }}</text>
      </view>

      <view v-else-if="!minimumOrderMet" class="min-order-warning">
        <text class="warning-text">当前 {{ Math.round(totalGrams) }}g，最低订购量为 1000g</text>
      </view>

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
        <button class="btn-add-row" @tap="addPackagePlanRow">添加规格</button>
      </view>
    </view>

    <view class="section ingredient-source-section" v-if="selectedDog">
      <view class="section-title">
        <view class="title-stack">
          <text class="title-text">原料采购来源</text>
        </view>
      </view>

      <view class="source-plan-options compact">
        <view
          v-for="option in SOURCE_PLAN_OPTIONS"
          :key="option.code"
          class="source-plan-card compact"
          :class="{ active: selectedSourcePlan === option.code }"
          @tap="selectSourcePlan(option.code)"
        >
          <text class="source-plan-name">{{ formatSourcePlanShortName(option.code) }}</text>
          <text class="source-plan-price">{{ formatSourcePlanPrice(option.code) }}</text>
        </view>
      </view>

      <view class="ingredient-summary">
        <text class="ingredient-summary-title">{{ sourcePlanDescription }}</text>
      </view>

      <view v-if="totalIngredientCount === 0" class="ingredient-empty-state">
        <text class="ingredient-empty-text">原料清单生成中，请稍后查看</text>
      </view>

      <view v-if="totalIngredientCount > 0" class="ingredients-content">
        <view v-if="foodIngredients.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">原料用量</view>
          <view v-for="(ingredient, idx) in foodIngredients" :key="'food-' + idx" class="ingredient-row-compact">
            <text class="ingredient-name">{{ ingredient.name }}</text>
            <text class="ingredient-channel-tag">{{ ingredient.purchaseChannel || '默认来源' }}</text>
            <text class="ingredient-spec-inline">{{ ingredient.productModel || '-' }}</text>
            <text class="ingredient-amount">
              {{ formatIngredientAmount(ingredient) }}
            </text>
          </view>
        </view>

        <view v-if="supplementIngredients.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">补剂用量</view>
          <view v-for="(ingredient, idx) in supplementIngredients" :key="'supplement-' + idx" class="ingredient-row-compact">
            <text class="ingredient-name">{{ ingredient.name }}</text>
            <text class="ingredient-channel-tag supplement">{{ ingredient.purchaseChannel || '默认来源' }}</text>
            <text class="ingredient-spec-inline">{{ ingredient.productModel || '-' }}</text>
            <text class="ingredient-amount">
              {{ formatIngredientAmount(ingredient) }}
            </text>
          </view>
        </view>
      </view>
    </view>

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

    <view class="section price-breakdown-section" v-if="isAdminUser && selectedDog && pricePreview && pricePreview.pricingBreakdown">
      <view class="section-title clickable" @tap="togglePriceBreakdown">
        <view class="title-stack">
          <text class="title-text">价格计算明细</text>
          <text class="title-subtitle">管理员可见，点击查看成本摘要</text>
        </view>
        <text class="toggle-icon">{{ showPriceBreakdown ? '▲' : '▼' }}</text>
      </view>

      <view v-if="showPriceBreakdown" class="breakdown-content">
        <view class="breakdown-group">
          <view class="breakdown-item">
            <text class="breakdown-label">原料成本</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costIngredients.toFixed(2) }}</text>
          </view>
          <view class="breakdown-item">
            <text class="breakdown-label">包材成本</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costPackaging.toFixed(2) }}</text>
          </view>
          <view class="breakdown-item">
            <text class="breakdown-label">人工成本</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costLabor.toFixed(2) }}</text>
          </view>
          <view class="breakdown-item">
            <text class="breakdown-label">间接成本</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costOverhead.toFixed(2) }}</text>
          </view>
          <view class="breakdown-item total">
            <text class="breakdown-label">最终金额</text>
            <text class="breakdown-value final">¥{{ pricePreview.amountTotal.toFixed(2) }}</text>
          </view>
        </view>
      </view>
    </view>

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
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { request } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  MIN_PACKAGE_SPEC_G,
  ORDER_CYCLE_OPTIONS,
  SOURCE_PLAN_OPTIONS,
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
  getSourcePlanLabel,
  isMinimumOrderMet,
  type IngredientSourcePlanCode,
  type PackagePlanItem,
} from '../../utils/order-package-plan'

interface Dog {
  id: string
  name: string
  breedName?: string
  breedId?: string
  currentWeightKg: number
  mealsPerDay: number
  birthday?: string
  ageText?: string
  gender?: string
  lifeStageOverride?: string
}

interface Recipe {
  id: string
  name: string
  description?: string
  coverImageUrl?: string
  energyDensityKcalPerKg: number
  nutritionStandard?: string
  designSource?: string
  applicableLifeStages?: string[]
  targetHealthTags?: string[]
}

interface Breed {
  id: string
  name: string
  adultAgeMonths: number
  seniorAgeYears?: number
}

interface CalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  dailyIntakeG?: number
  calcDetails?: {
    weightKg: number
    ageMonths: number
    sizeClass: string
    lifeStage: string
    stageFactor: number
    bcsMultiplier: number
    isNeutered: boolean
    activityLevel: string
    treatMode: string
    treatLevel?: string
    treatPercentage?: number
  }
}

interface PricePreview {
  amountProduct: number
  amountShipping: number
  amountTotal: number
  pricingBreakdown?: {
    costIngredients: number
    costPackaging: number
    costLabor: number
    costOverhead: number
    totalProductCost: number
    productPrice: number
    weightPackagingG?: number
    ingredientDetails?: IngredientCostItem[]
    packagingDetails?: PackagingCostDetail
    laborDetails?: LaborCostDetail
    overheadDetails?: OverheadCostDetail
  }
}

type SourcePlanPriceState = Record<IngredientSourcePlanCode, number | null>

interface ProductExplanationCard {
  title: string
  points: string[]
}

interface IngredientCostItem {
  name: string
  type: string
  amount: number
  unit: string
  brand?: string
  productModel?: string
  purchaseChannel?: string
  displayUnit?: string
  unitCost: number
  cost: number
  calculation: string
  netAmount?: number  // 净需求（不含生产损耗和出肉率）
}

interface PackagingPerPackConsumables {
  vacuumBagName: string
  vacuumBagSpec: string  // 真空袋规格
  labelName: string
  labelSpec: string      // 标签规格
  vacuumBagCost: number
  labelCost: number
  totalCost: number
  weightPerPack: number  // 每袋包装重量
  calculation: string
  vacuumBagsCount: number  // 真空袋总数量
  labelsCount: number      // 标签总数量
}

interface PackagingShippingContainers {
  boxName: string
  boxSpec: string         // 泡沫箱规格
  thermalBagName: string
  thermalBagSpec: string  // 保温袋规格
  icePacks: number
  boxCost: number
  thermalBagCost: number
  icePackCost: number
  labelCost: number
  totalCost: number
  weight: number          // 该包装重量
  calculation: string
  boxesCount: number       // 泡沫箱数量
  thermalBagsCount: number // 保温袋数量
}

interface PackagingCostDetail {
  perPackConsumables: PackagingPerPackConsumables
  shippingContainers: PackagingShippingContainers[]
}

interface LaborCostDetail {
  standardBatchOutputKg: number
  standardLaborCostPerKg: number
  rawInputWeightKg: number
  totalCost: number
  calculation: string
}

interface OverheadCostDetail {
  overheadCostPerKg: number
  rawInputWeightKg: number
  totalCost: number
  calculation: string
}

// 制作要求枚举
type PreparationMethod = 'CHOPPED' | 'DICED'
type CookingMethod = 'RAW' | 'COOKED'

const recipeId = ref('')
const recipe = ref<Recipe>({
  id: '',
  name: '',
  energyDensityKcalPerKg: 0
})

const dogs = ref<Dog[]>([])
const breeds = ref<Breed[]>([])
const selectedDogId = ref('')
const selectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
const selectedSourcePlan = ref<IngredientSourcePlanCode>('MARKET_PREMIUM')
const packagePlan = ref<PackagePlanItem[]>([])
const packagePlanDogId = ref<string | null>(null)
const dogCalcResult = ref<CalcResult | null>(null)

// 生命阶段校验
const isLifeStageMatch = ref(true)
const showWarning = ref(true)
const pricePreview = ref<PricePreview | null>(null)
const pricingSnapshotId = ref<string | null>(null)  // ✅ 新增：快照ID
const sourcePlanPrices = ref<SourcePlanPriceState>({
  ORGANIC: null,
  MARKET_PREMIUM: null,
  WHOLESALE: null,
})
const sourcePlanPriceLoading = ref(false)
const isPricePreviewLoading = ref(false)
const pricePreviewError = ref('')
const showPackageEditor = ref(false)
const isCustomPackagePlan = ref(false)
let pricingPreviewRequestSeq = 0
let dogCalcRequestSeq = 0
let sourcePlanPriceRequestSeq = 0
let pricePreviewDebounceTimer: ReturnType<typeof setTimeout> | null = null

// 显示的每日饭量
const displayDailyIntakeG = ref(0)

// 制作要求（默认值：打碎、生）
const preparationMethod = ref<PreparationMethod | null>('CHOPPED')
const cookingMethod = ref<CookingMethod | null>('RAW')

// 价格明细展开状态
const showPriceBreakdown = ref(false)

// 计算说明展开状态
const showCalculationDetails = ref(false)

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

// 权限检查：只有管理员才能查看价格计算明细
const isAdminUser = computed(() => {
  const user = uni.getStorageSync('user')
  return user && user.role === 'ADMIN'
})

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 选中的狗狗
const selectedDog = computed(() => {
  return dogs.value.find(d => d.id === selectedDogId.value)
})

// 狗狗选择器的选项（用于 picker）
const dogPickerOptions = computed(() => {
  return dogs.value.map(dog => ({
    id: dog.id,
    label: `${dog.name} | ${dog.breedName || '-'} | ${dog.currentWeightKg}kg | ${dog.mealsPerDay}餐/天`
  }))
})

const normalizedPackagePlan = computed(() =>
  packagePlan.value.map(row => normalizePackagePlanRow(row))
)
const isPackagePlanReadyForDog = computed(() =>
  Boolean(
    selectedDogId.value
    && packagePlanDogId.value === selectedDogId.value
    && normalizedPackagePlan.value.length > 0
    && displayDailyIntakeG.value > 0,
  )
)
const packagePlanTotal = computed(() => getPackagePlanTotal(normalizedPackagePlan.value))
const totalGrams = computed(() => packagePlanTotal.value.totalGrams)
const totalPackages = computed(() => packagePlanTotal.value.totalPackages)
const estimatedFeedDays = computed(() =>
  estimateFeedDays(totalGrams.value, displayDailyIntakeG.value),
)
const minimumOrderMet = computed(() => isMinimumOrderMet(totalGrams.value))
const hasInvalidPackageSpec = computed(() =>
  normalizedPackagePlan.value.some(row => row.packageSpecG < MIN_PACKAGE_SPEC_G)
)
const packagePlanValidationMessage = computed(() => (
  hasInvalidPackageSpec.value ? `每袋重量不能少于 ${MIN_PACKAGE_SPEC_G}g` : ''
))
const sourcePlanLabel = computed(() => getSourcePlanLabel(selectedSourcePlan.value))
const perMealG = computed(() => {
  if (!displayDailyIntakeG.value || !selectedDog.value?.mealsPerDay) return 0
  return displayDailyIntakeG.value / selectedDog.value.mealsPerDay
})
const recipeNutritionStandardLabel = computed(() =>
  getNutritionStandardLabel(recipe.value.nutritionStandard || 'FEDIAF_2021')
)
const recipeFormulaSoftwareLabel = computed(() =>
  getInitials(recipe.value.designSource || 'SevenKitchen')
)
const dogProfileSummaryText = computed(() => {
  if (!selectedDog.value) return ''

  return [
    selectedDog.value.name,
    calculateDogAgeText(selectedDog.value),
    getDogGenderLabel(selectedDog.value.gender),
    `${selectedDog.value.currentWeightKg}kg`,
    `${selectedDog.value.mealsPerDay}餐/天`,
  ].join(' ｜ ')
})
const dailyMainFoodEnergyText = computed(() => {
  const kcal = dogCalcResult.value?.finalFoodKcal
  if (!kcal || !Number.isFinite(kcal)) return '计算中'
  return `${Math.round(kcal)} kcal/天`
})
const dailySuggestedIntakeText = computed(() => {
  if (!displayDailyIntakeG.value) return '计算中'
  return `${Math.round(displayDailyIntakeG.value)}g/天`
})
const packagePlanInlineSummaryText = computed(() => {
  const specs = Array.from(new Set(
    normalizedPackagePlan.value.map(row => `${row.packageSpecG}g`)
  ))
  const specText = specs.length > 0 ? specs.join('、') : '-'

  return `每袋 ${specText} / 共${totalPackages.value}袋 / 总净重 ${Math.round(totalGrams.value)}g`
})

const averagePricePerPackage = computed(() => {
  if (!pricePreview.value || totalPackages.value <= 0) return 0
  return pricePreview.value.amountTotal / totalPackages.value
})
const isSinglePackageSpec = computed(() => normalizedPackagePlan.value.length === 1)
const packagePlanSummaryText = computed(() => {
  if (isSinglePackageSpec.value) {
    const row = normalizedPackagePlan.value[0]
    if (!row) return ''
    return `${row.packageSpecG}g × ${row.packageCount}袋`
  }
  return `多规格共 ${totalPackages.value}袋`
})
const bottomPriceTitle = computed(() => {
  if (!selectedDogId.value) return '请选择狗狗'
  if (packagePlanValidationMessage.value) return '分装需调整'
  if (isPricePreviewLoading.value) return '计算中'
  if (!minimumOrderMet.value) return '未满 1000g'
  if (pricePreviewError.value) return '价格暂未生成'
  if (!pricePreview.value) return '--'
  return `¥${pricePreview.value.amountTotal.toFixed(2)}`
})
const bottomPriceSubtitle = computed(() => {
  if (!selectedDogId.value) return '选择狗狗后查看饭量和价格'
  if (packagePlanValidationMessage.value) return packagePlanValidationMessage.value
  if (isPricePreviewLoading.value) return '价格生成后可下单'
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
  if (!displayDailyIntakeG.value || !perMealG.value) return '饭量和价格计算中'
  return `系统建议每日 ${Math.round(displayDailyIntakeG.value)}g，每餐约 ${Math.round(perMealG.value)}g`
})

// 是否可以立即购买
const canBuyNow = computed(() => {
  return Boolean(
    selectedDogId.value
    && selectedCycleDays.value
    && isPackagePlanReadyForDog.value
    && minimumOrderMet.value
    && pricePreview.value !== null
    && pricingSnapshotId.value !== null
    && displayDailyIntakeG.value > 0
    && !packagePlanValidationMessage.value
    && !isPricePreviewLoading.value
    && !pricePreviewError.value
  )
})

function resetPricePreviewState() {
  pricePreview.value = null
  pricingSnapshotId.value = null
}

// 原料分组计算属性
const foodIngredients = computed(() => {
  if (!pricePreview.value?.pricingBreakdown?.ingredientDetails) return []
  return pricePreview.value.pricingBreakdown.ingredientDetails.filter(item => item.type === 'FOOD')
})

const supplementIngredients = computed(() => {
  if (!pricePreview.value?.pricingBreakdown?.ingredientDetails) return []
  return pricePreview.value.pricingBreakdown.ingredientDetails.filter(item => item.type === 'SUPPLEMENT')
})

const totalIngredientCount = computed(() => foodIngredients.value.length + supplementIngredients.value.length)
const sourcePlanDescription = computed(() => getSourcePlanDescription(selectedSourcePlan.value))

function formatSourcePlanShortName(code: IngredientSourcePlanCode): string {
  const map: Record<IngredientSourcePlanCode, string> = {
    ORGANIC: '有机优先',
    MARKET_PREMIUM: '超市优先',
    WHOLESALE: '性价比优先',
  }
  return map[code]
}

function getSourcePlanDescription(code: IngredientSourcePlanCode): string {
  const map: Record<IngredientSourcePlanCode, string> = {
    ORGANIC: '原料优先选择有机、非转基因、生态散养来源',
    MARKET_PREMIUM: '原料优先选择山姆、盒马、沃集鲜等知名商超来源',
    WHOLESALE: '原料选择以人食级为底线，尽量选择肉团、生鲜批发等性价比高的来源',
  }
  return map[code]
}

function formatSourcePlanPrice(code: IngredientSourcePlanCode): string {
  if (sourcePlanPriceLoading.value) return '计算中'
  const amount = sourcePlanPrices.value[code]
  if (amount === null || !Number.isFinite(amount)) return '切换后计算'
  return `¥${amount.toFixed(2)}`
}

function formatIngredientAmount(ingredient: IngredientCostItem): string {
  const amount = ingredient.netAmount ?? ingredient.amount
  const displayUnit = ingredient.displayUnit || ingredient.unit

  if (ingredient.type === 'FOOD') {
    return `${Math.round(amount * 1000)}${displayUnit === 'kg' ? 'g' : displayUnit}`
  }

  return `${amount.toFixed(1)}${displayUnit}`
}

function togglePackageEditor() {
  if (isCustomPackagePlan.value) {
    cancelCustomPackagePlan()
    return
  }

  isCustomPackagePlan.value = true
  showPackageEditor.value = true
}

function cancelCustomPackagePlan() {
  clearPricePreviewDebounce()
  isCustomPackagePlan.value = false
  showPackageEditor.value = false
  rebuildPackagePlan()
  pricePreviewError.value = ''
  loadPricePreview()
  loadSourcePlanPricePreviews()
}

// 自动配置参数（从订单详情页"再次购买"传递）
const autoConfigParams = ref<{
  dogId?: string
  packageCount?: number
  perMealG?: number
}>({})

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any

  recipeId.value = currentPage.options?.recipeId || ''

  // 解析自动配置参数
  if (currentPage.options?.autoConfig === 'true') {
    autoConfigParams.value = {
      dogId: currentPage.options?.dogId,
      packageCount: currentPage.options?.packageCount ? Number(currentPage.options.packageCount) : undefined,
      perMealG: currentPage.options?.perMealG ? Number(currentPage.options.perMealG) : undefined,
    }
  }

  if (recipeId.value) {
    // 必须先加载品种数据，因为狗狗生命阶段计算需要品种信息
    await loadBreeds()
    await loadHealthTagMapping()  // 加载健康标签映射
    await loadRecipeDetail()
    await loadDogs()
  }
})

onUnmounted(() => {
  clearPricePreviewDebounce()
})

async function loadBreeds() {
  console.log('[RecipeOrder] loadBreeds 开始')

  try {
    const res = await request({
      url: '/dogs/breeds',
      method: 'GET'
    })

    console.log('[RecipeOrder] loadBreeds API响应:', res)

    if (res.code === 0 && res.data) {
      breeds.value = res.data
      console.log('[RecipeOrder] 品种列表加载成功, 数量:', res.data.length)
    }
  } catch (error) {
    console.error('[RecipeOrder] Load breeds error:', error)
  }

  console.log('[RecipeOrder] loadBreeds 结束')
}

async function loadHealthTagMapping() {
  try {
    const res = await request({
      url: '/recipes/filter-options',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      // 建立健康标签UUID到label的映射
      const uuidMap: Record<string, string> = {}
      if (res.data.healthTags && Array.isArray(res.data.healthTags)) {
        res.data.healthTags.forEach((tag: any) => {
          if (tag.value && tag.label) {
            uuidMap[tag.value] = tag.label
          }
        })
      }
      healthTagUuidLabelMap.value = uuidMap
    }
  } catch (error) {
    console.error('[RecipeOrder] Load health tag mapping error:', error)
  }
}

async function loadRecipeDetail() {
  try {
    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      recipe.value = res.data
    }
  } catch (error) {
    console.error('Load recipe error:', error)
  }
}

async function loadDogs() {
  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      dogs.value = res.data

      // 自动选中狗狗（优先使用自动配置参数中的 dogId）
      if (dogs.value.length > 0 && !selectedDogId.value) {
        if (autoConfigParams.value.dogId) {
          // 检查指定的 dogId 是否存在
          const dogExists = dogs.value.find(d => d.id === autoConfigParams.value.dogId)
          if (dogExists) {
            selectDog(autoConfigParams.value.dogId!)
          } else {
            // 如果指定的狗狗不存在，选中第一个
            selectDog(dogs.value[0].id)
          }
        } else {
          // 没有自动配置参数，选中第一个
          selectDog(dogs.value[0].id)
        }
      }
    }
  } catch (error) {
    console.error('Load dogs error:', error)
  }
}

function onDogPickerChange(e: any) {
  const index = e.detail.value
  const dog = dogs.value[index]
  if (dog) {
    selectDog(dog.id)
  }
}

// ========== 生命阶段校验逻辑 ==========

function checkLifeStageMatch() {
  console.log('[RecipeOrder] checkLifeStageMatch 开始')

  if (!selectedDog.value || !recipe.value) {
    console.log('[RecipeOrder] 缺少必要数据，跳过校验')
    return
  }

  const dogLifeStage = getDogLifeStage(selectedDog.value)
  const applicableStages = recipe.value.applicableLifeStages || []

  // 详细调试日志
  console.log('[RecipeOrder] 生命阶段校验详情:', {
    '狗狗名字': selectedDog.value.name,
    '狗狗生日': selectedDog.value.birthday,
    '狗狗品种ID': selectedDog.value.breedId,
    '生命阶段覆盖值': selectedDog.value.lifeStageOverride,
    '计算的狗狗生命阶段': dogLifeStage,
    '食谱适用生命阶段': applicableStages,
    '食谱名称': recipe.value.name,
    '检查结果': applicableStages.includes(dogLifeStage),
    'breeds列表长度': breeds.value.length,
    'breeds列表': breeds.value.map(b => ({ id: b.id, name: b.name, adultAgeMonths: b.adultAgeMonths }))
  })

  // 如果无法判断生命阶段（无品种信息），跳过警告
  if (dogLifeStage === null) {
    console.log('[RecipeOrder] 无法判断狗狗生命阶段（无品种信息），跳过警告')
    isLifeStageMatch.value = true
  } else {
    isLifeStageMatch.value = applicableStages.includes(dogLifeStage)
    console.log('[RecipeOrder] 校验结果:', isLifeStageMatch.value ? '匹配' : '不匹配')
  }

  // 每次切换狗狗时重置警告状态
  showWarning.value = true

  console.log('[RecipeOrder] 警告卡片显示条件:', {
    '!isLifeStageMatch': !isLifeStageMatch.value,
    'selectedDog': !!selectedDog.value,
    'showWarning': showWarning.value,
    '应该显示警告': !isLifeStageMatch.value && selectedDog.value && showWarning.value
  })
}

function getDogLifeStage(dog: Dog): string | null {
  console.log('[getDogLifeStage] 开始计算狗狗生命阶段:', dog.name)

  // 优先使用用户设置的覆盖值
  if (dog.lifeStageOverride && dog.lifeStageOverride !== 'NONE') {
    console.log('[getDogLifeStage] 使用用户设置的覆盖值:', dog.lifeStageOverride)
    return dog.lifeStageOverride
  }

  // 根据品种和年龄自动判断
  const birthday = new Date(dog.birthday)
  const now = new Date()

  const ageInDays = Math.floor((now.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24))
  const ageInMonths = Math.floor(ageInDays / 30.4375)
  const ageInYears = ageInMonths / 12.0

  console.log('[getDogLifeStage] 年龄计算:', {
    ageInDays,
    ageInMonths,
    ageInYears
  })

  // 在本地breeds列表中查找品种对象
  const breed = breeds.value.find(b => b.id === dog.breedId)

  if (!breed || !breed.adultAgeMonths) {
    console.log('[getDogLifeStage] 缺少完整的品种信息，返回null')
    return null
  }

  // 使用品种特定的标准
  const adultAgeMonths = breed.adultAgeMonths
  const seniorAgeYears = breed.seniorAgeYears || 7

  if (ageInMonths < adultAgeMonths) {
    return 'PUPPY'
  } else if (ageInYears >= seniorAgeYears) {
    return 'SENIOR'
  } else {
    return 'ADULT'
  }
}

function getDogLifeStageLabel(dog: Dog): string {
  const stage = getDogLifeStage(dog)

  if (stage === null) {
    return '未知'
  }

  const stageMap: Record<string, string> = {
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
  }
  return stageMap[stage] || stage
}

function getLifeStageLabel(stage: string): string {
  const stageMap: Record<string, string> = {
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
  }
  return stageMap[stage] || stage
}

function getHealthTagLabel(tagOrUuid: string): string {
  // 优先使用动态映射（UUID -> label）
  if (healthTagUuidLabelMap.value[tagOrUuid]) {
    return healthTagUuidLabelMap.value[tagOrUuid]
  }

  // 兼容旧的枚举值（用于向后兼容）
  const enumMap: Record<string, string> = {
    'HEALTHY': '健康',
    'PICKY_EATER': '挑食',
    'SENSITIVE_STOMACH': '敏感胃',
    'PANCREATITIS_SUPPORT': '胰腺炎友好',
    'LOW_FAT': '低脂',
    'SKIN_COAT_CARE': '护肤',
  }

  if (enumMap[tagOrUuid]) {
    return enumMap[tagOrUuid]
  }

  return tagOrUuid
}

function getInitials(value: string): string {
  const source = value.trim()
  if (!source) return 'SK'

  const words = source.match(/[A-Za-z0-9]+/g) || []
  if (words.length === 0) return source
  if (words.length === 1) {
    const camelParts = words[0].match(/[A-Z][a-z0-9]*/g)
    if (camelParts && camelParts.length > 1) {
      return camelParts.map(part => part[0]).join('').toUpperCase()
    }
  }

  return words.map(word => word[0]).join('').toUpperCase()
}

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'AAFCO_2019': 'AAFCO 2019',
    'AAFCO_2021': 'AAFCO 2021',
    'AAFCO_2022': 'AAFCO 2022',
    'NRC_2006': 'NRC 2006',
    'GB_T_31216': '国标 GB/T 31216',
  }
  return map[standard] || standard
}

function calculateDogAgeText(dog: Dog): string {
  if (dog.ageText) return dog.ageText
  if (!dog.birthday) return '年龄未知'

  const birthday = new Date(dog.birthday)
  if (Number.isNaN(birthday.getTime())) return '年龄未知'

  const now = new Date()
  let months = (now.getFullYear() - birthday.getFullYear()) * 12
    + now.getMonth() - birthday.getMonth()

  if (now.getDate() < birthday.getDate()) {
    months -= 1
  }

  if (months < 0) return '年龄未知'
  if (months < 12) return `${months}个月`

  const years = Math.floor(months / 12)
  return `${years}岁`
}

function getDogGenderLabel(gender?: string): string {
  const map: Record<string, string> = {
    MALE: '弟弟',
    FEMALE: '妹妹',
  }
  return gender ? map[gender] || gender : '性别未知'
}

function dismissWarning() {
  showWarning.value = false
}

// ========== 结束：生命阶段校验逻辑 ==========

function selectDog(dogId: string) {
  clearPricePreviewDebounce()
  pricingPreviewRequestSeq += 1
  sourcePlanPriceRequestSeq += 1
  selectedDogId.value = dogId
  isCustomPackagePlan.value = false
  showPackageEditor.value = false
  packagePlan.value = []
  displayDailyIntakeG.value = 0
  dogCalcResult.value = null
  packagePlanDogId.value = null
  pricePreviewError.value = ''
  sourcePlanPrices.value = {
    ORGANIC: null,
    MARKET_PREMIUM: null,
    WHOLESALE: null,
  }
  resetPricePreviewState()
  loadDogCalcResult(dogId)
  checkLifeStageMatch()  // 校验生命阶段
}

async function loadDogCalcResult(dogId: string) {
  const requestSeq = ++dogCalcRequestSeq
  console.log('========== [RecipeOrder] loadDogCalcResult 开始 ==========')
  console.log('[调用参数]', {
    dogId,
    recipeId: recipeId.value
  })
  console.log('[更新前]', {
    perMealG: perMealG.value,
    displayDailyIntakeG: displayDailyIntakeG.value
  })

  try {
    // 调用新的API：POST /dogs/:id/calc-for-recipe
    const res = await request({
      url: `/dogs/${dogId}/calc-for-recipe`,
      method: 'POST',
      data: {
        recipeId: recipeId.value
      }
    })

    if (res.code === 0 && res.data) {
      if (requestSeq !== dogCalcRequestSeq || dogId !== selectedDogId.value) {
        return
      }

      const result = res.data

      console.log('[API返回]', {
        perMealIntakeG: result.perMealIntakeG,
        dailyIntakeG: result.dailyIntakeG
      })

      // 保存计算结果 - 完整映射所有字段
      dogCalcResult.value = {
        rer: result.rer,
        totalDer: result.totalDer,
        finalFoodKcal: result.finalFoodKcal,
        treatDeduction: result.treatDeduction,
        isTreatCapped: result.isTreatCapped,
        dailyIntakeG: result.dailyIntakeG,
        calcDetails: result.calcDetails
      }

      // 重新计算每日饭量：每餐饭量 × 每日餐数
      displayDailyIntakeG.value = result.perMealIntakeG * (selectedDog.value?.mealsPerDay || 2)
      rebuildPackagePlan()

      console.log('[更新后]', {
        perMealG: perMealG.value,
        displayDailyIntakeG: displayDailyIntakeG.value,
        packagePlan: packagePlan.value
      })
      console.log('========== [RecipeOrder] loadDogCalcResult 结束 ==========')

      // 应用自动配置参数（如果有）
      applyAutoConfig()

      // 加载价格预览
      loadPricePreview()
      loadSourcePlanPricePreviews()
    }
  } catch (error) {
    if (requestSeq !== dogCalcRequestSeq) {
      return
    }

    console.error('Load dog calc error:', error)

    // 显示错误提示
    uni.showToast({
      title: '饭量计算失败',
      icon: 'none'
    })
  }
}

// 应用自动配置参数
function applyAutoConfig() {
  const params = autoConfigParams.value

  if (params.perMealG && params.perMealG > 0) {
    displayDailyIntakeG.value = params.perMealG * (selectedDog.value?.mealsPerDay || 2)
    console.log('[AutoConfig] 已设置每餐饭量:', params.perMealG)
  }

  if (params.packageCount) {
    const mealsPerDay = selectedDog.value?.mealsPerDay || 2
    const cycleDays = Math.round(params.packageCount / mealsPerDay)
    if ((ORDER_CYCLE_OPTIONS as readonly number[]).includes(cycleDays)) {
      selectedCycleDays.value = cycleDays
      console.log('[AutoConfig] 已设置订购周期:', cycleDays, '天')
    }
  }

  rebuildPackagePlan()
}

function rebuildPackagePlan() {
  packagePlan.value = buildDefaultPackagePlan({
    dailyIntakeG: displayDailyIntakeG.value,
    mealsPerDay: selectedDog.value?.mealsPerDay || 2,
    days: selectedCycleDays.value,
  })
  packagePlanDogId.value = selectedDogId.value
}

function normalizePackagePlanRow(row: PackagePlanItem): PackagePlanItem {
  return {
    packageSpecG: normalizePackageSpecValue(row.packageSpecG),
    packageCount: Math.max(1, Math.floor(Number(row.packageCount) || 1)),
  }
}

function normalizePackageSpecValue(value: string | number | null | undefined): number {
  const normalized = Math.floor(Number(value))
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function clearPricePreviewDebounce() {
  if (pricePreviewDebounceTimer !== null) {
    clearTimeout(pricePreviewDebounceTimer)
    pricePreviewDebounceTimer = null
  }
}

function schedulePricePreview() {
  clearPricePreviewDebounce()
  pricePreviewDebounceTimer = setTimeout(() => {
    pricePreviewDebounceTimer = null
    loadPricePreview()
    loadSourcePlanPricePreviews()
  }, 300)
}

function invalidatePackagePlanPricingPreview() {
  clearPricePreviewDebounce()
  pricingPreviewRequestSeq += 1
  sourcePlanPriceRequestSeq += 1
  pricePreviewError.value = ''
  resetPricePreviewState()
}

function addPackagePlanRow() {
  packagePlan.value = [
    ...packagePlan.value,
    {
      packageSpecG: Math.max(MIN_PACKAGE_SPEC_G, Math.round(perMealG.value || displayDailyIntakeG.value || 100)),
      packageCount: 1,
    },
  ]
  invalidatePackagePlanPricingPreview()
  schedulePricePreview()
}

function updatePackagePlanRow(index: number, field: keyof PackagePlanItem, value: string | number) {
  const nextValue = field === 'packageSpecG'
    ? normalizePackageSpecValue(value)
    : Math.max(1, Math.floor(Number(value) || 1))
  packagePlan.value = packagePlan.value.map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: nextValue } : row
  )
  invalidatePackagePlanPricingPreview()
  schedulePricePreview()
}

function removePackagePlanRow(index: number) {
  if (packagePlan.value.length <= 1) {
    return
  }
  packagePlan.value = packagePlan.value.filter((_, rowIndex) => rowIndex !== index)
  invalidatePackagePlanPricingPreview()
  schedulePricePreview()
}

function selectSourcePlan(code: IngredientSourcePlanCode) {
  selectedSourcePlan.value = code
  pricePreviewError.value = ''
  loadPricePreview()
  loadSourcePlanPricePreviews()
}

// 选择制作工艺
function selectPreparationMethod(method: PreparationMethod) {
  preparationMethod.value = method
  loadPricePreview()
}

// 选择烹饪工艺
function selectCookingMethod(method: CookingMethod) {
  cookingMethod.value = method
  loadPricePreview()
}

// 切换价格明细显示
function togglePriceBreakdown() {
  showPriceBreakdown.value = !showPriceBreakdown.value
}

// 切换计算说明
function toggleCalculationDetails() {
  showCalculationDetails.value = !showCalculationDetails.value
}

function selectCycle(days: number) {
  if (isCustomPackagePlan.value) {
    uni.showToast({
      title: '请先取消自定义分装后再切换订购天数',
      icon: 'none',
    })
    return
  }

  selectedCycleDays.value = days
  showPackageEditor.value = false
  rebuildPackagePlan()
  pricePreviewError.value = ''
  loadPricePreview()
  loadSourcePlanPricePreviews()
}

function getPrimaryPackageSpecG(plan: PackagePlanItem[]): number {
  const primaryRow = [...plan].sort(
    (left, right) =>
      right.packageCount - left.packageCount
      || right.packageSpecG - left.packageSpecG,
  )[0]

  return primaryRow?.packageSpecG || 1
}

function buildPricingPreviewItem() {
  return {
    recipeId: recipeId.value,
    quantityG: Math.round(totalGrams.value),
    packageCount: totalPackages.value,
    packageSpecG: getPrimaryPackageSpecG(normalizedPackagePlan.value),
    packagePlan: normalizedPackagePlan.value,
    cycleDays: selectedCycleDays.value,
    dailyIntakeG: displayDailyIntakeG.value,
    preparationMethod: preparationMethod.value || undefined,
    cookingMethod: cookingMethod.value || undefined,
  }
}

async function requestPricingPreview(sourcePlan: IngredientSourcePlanCode) {
  return request({
    url: '/orders/pricing/preview',
    method: 'POST',
    data: {
      dogId: selectedDogId.value,
      type: 'FRESH_FOOD',
      ingredientSourcePlan: sourcePlan,
      items: [buildPricingPreviewItem()]
    }
  })
}

async function loadPricePreview() {
  const requestSeq = ++pricingPreviewRequestSeq
  resetPricePreviewState()
  pricePreviewError.value = ''

  if (!selectedDog.value || !isPackagePlanReadyForDog.value) return
  if (packagePlanValidationMessage.value) return
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
      // ✅ 保存快照ID
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

    // 如果是订单净重不足的错误，不打印到控制台（避免大量红色日志）
    // 这是预期的业务逻辑验证，界面上已有警告提示
    if (!error?.message?.includes('订单净重不足')) {
      console.error('Load price preview error:', error)
    }

    // 订单净重不足时，清空价格预览
    pricePreviewError.value = '价格暂未生成'
    resetPricePreviewState()
  } finally {
    if (requestSeq === pricingPreviewRequestSeq) {
      isPricePreviewLoading.value = false
    }
  }
}

async function loadSourcePlanPricePreviews() {
  const requestSeq = ++sourcePlanPriceRequestSeq

  if (!selectedDog.value || !isPackagePlanReadyForDog.value || !minimumOrderMet.value) {
    sourcePlanPrices.value = {
      ORGANIC: null,
      MARKET_PREMIUM: null,
      WHOLESALE: null,
    }
    return
  }

  if (packagePlanValidationMessage.value) {
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
          return [
            option.code,
            res.code === 0 && res.data ? Number(res.data.amountTotal || 0) : null,
          ] as const
        } catch (error) {
          console.error('[Source Plan Price] preview failed:', option.code, error)
          return [option.code, null] as const
        }
      }),
    )

    if (requestSeq !== sourcePlanPriceRequestSeq) {
      return
    }

    sourcePlanPrices.value = previews.reduce((next, [code, amount]) => ({
      ...next,
      [code]: amount,
    }), {
      ORGANIC: null,
      MARKET_PREMIUM: null,
      WHOLESALE: null,
    } as SourcePlanPriceState)
  } finally {
    if (requestSeq === sourcePlanPriceRequestSeq) {
      sourcePlanPriceLoading.value = false
    }
  }
}

async function buyNow() {
  if (!canBuyNow.value) return

  // ✅ 安全改进：使用快照ID而不是传递所有参数（防止价格篡改）
  if (!pricingSnapshotId.value) {
    uni.showToast({
      title: '价格预览未完成，请稍候',
      icon: 'none'
    })
    return
  }

  const orderConfig = {
    snapshotId: pricingSnapshotId.value,
    dogName: selectedDog.value?.name || '',
    breedName: selectedDog.value?.breedName || '',
    weightKg: selectedDog.value?.currentWeightKg || 0,
    mealsPerDay: selectedDog.value?.mealsPerDay || 2,
    dailyIntakeG: displayDailyIntakeG.value,
    estimatedFeedDays: estimatedFeedDays.value,
    recipeName: recipe.value.name,
    recipeCoverImage: recipe.value.coverImageUrl || '',
    packagePlan: normalizedPackagePlan.value,
    totalPackages: totalPackages.value,
    totalGrams: totalGrams.value,
    ingredientSourcePlan: selectedSourcePlan.value,
    ingredientSourcePlanLabel: sourcePlanLabel.value,
    preparationMethod: preparationMethod.value || 'CHOPPED',
    cookingMethod: cookingMethod.value || 'RAW',
    amountProduct: pricePreview.value?.amountProduct || 0,
    amountShipping: pricePreview.value?.amountShipping || 0,
    amountTotal: pricePreview.value?.amountTotal || 0,
  }

  uni.setStorageSync('direct_buy_order_config', orderConfig)

  uni.navigateTo({
    url: `/pages/checkout/index?mode=directBuy&snapshotId=${encodeURIComponent(pricingSnapshotId.value)}`
  })
}

function goToCreateDog() {
  uni.navigateTo({
    url: '/pages/dog-create/index'
  })
}
</script>

<style scoped>
.recipe-order-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

/* 食谱头部 */
.recipe-header {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.recipe-cover-wrapper {
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 比例 */
  position: relative;
  margin-bottom: 20rpx;
}

.recipe-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 12rpx;
}

.recipe-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  line-height: 1.4;
  text-align: center;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  justify-content: center;
  margin-top: 12rpx;
}

.recipe-tags .tag {
  display: inline-block;
  padding: 6rpx 16rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
}

.recipe-tags .life-stage-tag {
  background-color: #e3f2fd;
  color: #1976d2;
}

.recipe-tags .health-tag {
  background-color: #fff3e0;
  color: #f57c00;
}

/* 通用区块 */
.section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

/* 警告卡片 */
.warning-card {
  background-color: #fffbe6;
  border: 1rpx solid #ffe58f;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
}

.warning-header {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.warning-icon {
  font-size: 32rpx;
  margin-right: 8rpx;
}

.warning-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #856404;
}

.warning-text {
  font-size: 26rpx;
  color: #856404;
  line-height: 1.6;
  display: block;
  margin-bottom: 8rpx;
}

.btn-continue {
  width: 100%;
  margin-top: 16rpx;
  padding: 16rpx;
  background-color: #faad14;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;
}

.section-title {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.title-text {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
}

.clickable {
  cursor: pointer;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
  margin-left: 8rpx;
}

.required {
  color: #ff4d4f;
  margin-left: 8rpx;
  font-size: 32rpx;
}

/* 狗狗选择 */
.empty-dogs {
  text-align: center;
  padding: 60rpx 0;
}

.empty-text {
  display: block;
  font-size: 28rpx;
  color: #999;
  margin-bottom: 30rpx;
}

.btn-create-dog {
  width: 240rpx;
  height: 70rpx;
  line-height: 70rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 35rpx;
  font-size: 28rpx;
  border: none;
}

.dog-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
  background-color: #fff;
}

.picker-placeholder {
  font-size: 28rpx;
  color: #999;
}

.dog-selected {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 12rpx;
}

.dog-emoji {
  font-size: 32rpx;
}

.dog-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.picker-arrow {
  font-size: 24rpx;
  color: #999;
}

/* 预估喂食量 */
.feeding-section {
  border-top: 1rpx solid #e8e8e8;
}

.feeding-info {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.feeding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.feeding-label {
  font-size: 28rpx;
  color: #666;
}

.feeding-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.feeding-value.readonly {
  color: #999;
}

.feeding-value-wrapper {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.feeding-edit-wrapper {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.feeding-input-small {
  width: 100rpx;
  height: 60rpx;
  text-align: center;
  border: 2rpx solid #1890ff;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  background-color: #fff;
}

.feeding-unit {
  font-size: 26rpx;
  color: #999;
}

.btn-edit {
  padding: 8rpx 20rpx;
  background-color: #fff;
  color: #1890ff;
  border: 2rpx solid #1890ff;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

.btn-reset {
  padding: 8rpx 20rpx;
  background-color: #fff;
  color: #ff9800;
  border: 2rpx solid #ff9800;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

.btn-save {
  padding: 8rpx 20rpx;
  background-color: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

.btn-cancel {
  padding: 8rpx 20rpx;
  background-color: #fff;
  color: #999;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

/* 计算说明 */
.calculation-explanation {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: 2rpx solid #e8e8e8;
}

.explanation-header {
  cursor: pointer;
}

.explanation-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.explanation-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.explanation-content {
  margin-top: 20rpx;
}

.calc-cards {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.calc-card {
  padding: 20rpx;
  background-color: #fff;
  border-radius: 12rpx;
  border: 2rpx solid #e8e8e8;
}

.calc-card.highlight {
  border-color: #ffd591;
  background-color: #fffbf0;
}

.card-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
  display: block;
}

.formula-box {
  padding: 12rpx 16rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
  border: 1rpx solid #bae7ff;
  margin-bottom: 12rpx;
}

.formula-text {
  font-size: 24rpx;
  color: #0050b3;
  font-family: 'Courier New', monospace;
  line-height: 1.5;
}

.step-data {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.data-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 24rpx;
}

.data-label {
  color: #666;
  min-width: 160rpx;
}

.data-value {
  color: #333;
  font-weight: 500;
}

.calc-result {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 12rpx 16rpx;
  background-color: #f6ffed;
  border-radius: 8rpx;
  border: 1rpx solid #b7eb8f;
}

.calc-result.final {
  background-color: #fff7e6;
  border-color: #ffd591;
}

.result-value {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.result-value.highlight {
  color: #ff4d4f;
  font-size: 32rpx;
}

.result-note {
  font-size: 22rpx;
  color: #999;
  font-style: italic;
}

.result-warning {
  font-size: 22rpx;
  color: #ff4d4f;
  font-weight: bold;
}

/* 订购周期 */
.cycle-options {
  display: flex;
  gap: 12rpx;
}

.cycle-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 12rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
}

.cycle-option.active {
  border-color: #1890ff;
  background-color: #f0f9ff;
}

.cycle-option.disabled {
  opacity: 0.5;
}

.cycle-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.cycle-desc {
  font-size: 24rpx;
  color: #999;
}

.total-summary {
  display: flex;
  justify-content: space-between;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  gap: 24rpx;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.summary-label {
  font-size: 28rpx;
  color: #666;
}

.summary-value {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.package-plan-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.package-plan-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.package-input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.package-input-label,
.package-input-unit {
  font-size: 24rpx;
  color: #666;
  flex-shrink: 0;
}

.package-input {
  width: 120rpx;
  height: 60rpx;
  text-align: center;
  border: 2rpx solid #e8e8e8;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  background-color: #fff;
}

.btn-add-row {
  min-width: 112rpx;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 20rpx;
  background-color: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.btn-remove-row {
  min-width: 96rpx;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 16rpx;
  background-color: #fff;
  color: #ff4d4f;
  border: 2rpx solid #ffccc7;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.btn-remove-row[disabled] {
  color: #bfbfbf;
  border-color: #f0f0f0;
}

.package-summary {
  margin-top: 20rpx;
}

.source-plan-options {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.source-plan-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
  background-color: #fff;
}

.source-plan-option.active {
  border-color: #1890ff;
  background-color: #f0f9ff;
}

.source-plan-main {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.source-plan-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.source-plan-desc {
  font-size: 24rpx;
  color: #666;
  line-height: 1.4;
}

.source-plan-check {
  font-size: 32rpx;
  color: #1890ff;
  font-weight: bold;
  margin-left: 16rpx;
}

.product-intro-section {
  padding: 0;
  overflow: hidden;
}

.product-intro-image {
  display: block;
  width: 100%;
}

.min-order-warning {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff7e6;
  border: 2rpx solid #ffa940;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.warning-icon {
  font-size: 32rpx;
}

.warning-text {
  font-size: 26rpx;
  color: #d46b08;
  line-height: 1.4;
}

/* 保质期说明 */
.shelf-life-notice {
  margin-top: 20rpx;
  padding: 20rpx;
  background-color: #f0f9ff;
  border: 2rpx solid #91d5ff;
  border-radius: 12rpx;
}

.notice-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.notice-title-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #0050b3;
}

.notice-content {
  margin-top: 12rpx;
}

.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  margin-bottom: 10rpx;
}

.notice-item:last-child {
  margin-bottom: 0;
}

.notice-dot {
  font-size: 24rpx;
  flex-shrink: 0;
  margin-top: 2rpx;
}

.notice-text {
  font-size: 24rpx;
  color: #333;
  line-height: 1.5;
  flex: 1;
}

/* 原料清单 */
.ingredients-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.ingredients-content {
  margin-top: 16rpx;
}

.no-ingredients {
  padding: 40rpx 0;
  text-align: center;
}

.no-data-text {
  color: #999;
  font-size: 28rpx;
}

/* 原料分组 */
.ingredient-group {
  margin-bottom: 32rpx;
}

.ingredient-group:last-child {
  margin-bottom: 0;
}

.ingredient-category-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #f0f0f0;
  margin-bottom: 16rpx;
}

.ingredient-header {
  display: flex;
  padding: 12rpx 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  margin-bottom: 8rpx;
}

.ingredient-header-item {
  flex: 1;
  font-size: 26rpx;
  color: #666;
  text-align: center;
  font-weight: 500;
}

.ingredient-row {
  display: flex;
  padding: 16rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.ingredient-row:last-child {
  border-bottom: none;
}

.ingredient-item {
  flex: 1;
  font-size: 26rpx;
  color: #333;
  text-align: center;
  word-break: break-all;
}

.ingredient-summary-row {
  padding: 16rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
  margin-top: 12rpx;
  border-left: 4rpx solid #ff9800;
}

.summary-text {
  font-size: 28rpx;
  color: #ff9800;
  font-weight: 500;
}

/* 制作要求 */
.requirements-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.requirement-group {
  margin-bottom: 20rpx;
}

.requirement-group:last-child {
  margin-bottom: 0;
}

/* 第一组：口感选择 - 橙色主题 */
.preparation-group {
  padding: 20rpx;
  background-color: #fff7e6;
  border-radius: 12rpx;
  border: 2rpx solid #ffe7ba;
}

/* 第二组：烹饪方式 - 绿色主题 */
.cooking-group {
  padding: 20rpx;
  background-color: #f6ffed;
  border-radius: 12rpx;
  border: 2rpx solid #d9f7be;
}

.option-row {
  display: flex;
  gap: 16rpx;
}

.option-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 16rpx;
  border: 2rpx solid rgba(0, 0, 0, 0.1);
  border-radius: 12rpx;
  text-align: center;
  background-color: #fff;
  transition: all 0.3s;
}

.option-card-large {
  min-height: 180rpx;
  justify-content: center;
}

.option-name {
  font-size: 30rpx;
  color: #333;
  margin-bottom: 12rpx;
  font-weight: bold;
}

.option-tip {
  font-size: 22rpx;
  color: #666;
  line-height: 1.5;
}

.option-tips {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.option-tip-highlight {
  font-size: 22rpx;
  color: #ff4d4f;
  font-weight: bold;
  line-height: 1.5;
}

.option-tip-warning {
  font-size: 22rpx;
  color: #faad14;
  line-height: 1.5;
}

/* 第一组选中状态 - 橙色 */
.preparation-group .option-card.active {
  border-color: #fa8c16;
  background-color: #fff7e6;
}

.preparation-group .option-card.active .option-name {
  color: #fa8c16;
}

/* 第二组选中状态 - 绿色 */
.cooking-group .option-card.active {
  border-color: #52c41a;
  background-color: #f6ffed;
}

.cooking-group .option-card.active .option-name {
  color: #52c41a;
}

/* 包装及说明 */
.package-info-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.package-info-row {
  display: flex;
  gap: 20rpx;
}

/* 左侧：包装示例图片 */
.package-example-card {
  flex-shrink: 0;
  padding: 20rpx;
  background-color: #f0f9ff;
  border: 2rpx solid #91d5ff;
  border-radius: 12rpx;
}

.example-title {
  font-size: 26rpx;
  font-weight: bold;
  color: #0050b3;
  margin-bottom: 16rpx;
  display: block;
}

.example-image-container {
  width: 280rpx;
  height: 210rpx; /* 4:3 比例 */
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;
  border-radius: 8rpx;
  overflow: hidden;
}

.example-image {
  width: 100%;
  height: 100%;
}

.example-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.placeholder-icon {
  font-size: 80rpx;
}

.placeholder-text {
  font-size: 24rpx;
  color: #999;
}

/* 右侧：包装规格及配送服务 */
.package-info-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.package-detail-card,
.shipping-service-card {
  flex: 1;
  padding: 20rpx;
  background-color: #f0f9ff;
  border: 2rpx solid #91d5ff;
  border-radius: 12rpx;
}

.package-detail-card:last-child,
.shipping-service-card:last-child {
  margin-bottom: 0;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.title-icon {
  font-size: 24rpx;
}

.title-text {
  font-size: 26rpx;
  font-weight: bold;
  color: #0050b3;
}

.detail-content {
  padding-left: 32rpx;
}

.detail-text {
  font-size: 24rpx;
  color: #333;
  line-height: 1.6;
}

.shipping-company {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding-left: 32rpx;
}

.shipping-logo {
  width: 60rpx;
  height: 60rpx;
  line-height: 60rpx;
  text-align: center;
  background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
  color: #fff;
  font-size: 24rpx;
  font-weight: bold;
  border-radius: 8rpx;
}

.shipping-logo-image {
  width: 60rpx;
  height: 60rpx;
  border-radius: 8rpx;
}

.shipping-name {
  font-size: 26rpx;
  font-weight: bold;
  color: #ff6b35;
}

/* 价格 */
.price-card {
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.price-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #e8e8e8;
}

.price-item:last-child {
  border-bottom: none;
}

.price-label {
  font-size: 28rpx;
  color: #666;
}

.price-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.price-value.total {
  font-size: 36rpx;
  color: #ff4d4f;
}

/* 价格明细 */
.price-breakdown-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
}

.price-breakdown-section .section-title {
  cursor: pointer;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
}

.subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #999;
}

.breakdown-content {
  margin-top: 20rpx;
}

.breakdown-group {
  margin-bottom: 24rpx;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.breakdown-group:last-child {
  margin-bottom: 0;
}

.breakdown-group.final {
  background-color: #fff7e6;
  border: 2rpx solid #ffd591;
}

.breakdown-group-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #e8e8e8;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
}

.breakdown-item.total {
  padding-top: 16rpx;
  margin-top: 8rpx;
  border-top: 1rpx dashed #d9d9d9;
}

.breakdown-item.final {
  padding: 16rpx 0;
}

.breakdown-label {
  font-size: 26rpx;
  color: #666;
}

.breakdown-value {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.breakdown-value.highlight {
  color: #ff4d4f;
}

.breakdown-value.final {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

/* 详细展示样式 */
.clickable {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle-icon-small {
  font-size: 20rpx;
  color: #999;
}

.breakdown-item.summary {
  background-color: #fff;
  padding: 12rpx 16rpx;
  border-radius: 8rpx;
  margin-bottom: 12rpx;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.detail-item {
  background-color: #fff;
  padding: 16rpx;
  border-radius: 8rpx;
  border-left: 4rpx solid #1890ff;
}

.detail-item-nested {
  background-color: #fafafa;
  padding: 12rpx;
  border-radius: 6rpx;
  border-left: 3rpx solid #faad14;
  margin-bottom: 12rpx;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.detail-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.detail-type {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  background-color: #e6f7ff;
  color: #1890ff;
  border-radius: 4rpx;
}

.detail-box {
  background-color: #fff;
  padding: 16rpx;
  border-radius: 8rpx;
  border-left: 4rpx solid #52c41a;
}

.detail-subtitle {
  font-size: 26rpx;
  font-weight: bold;
  color: #52c41a;
  margin: 16rpx 0 12rpx 0;
  padding-bottom: 8rpx;
  border-bottom: 1rpx dashed #d9d9d9;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 0;
}

.detail-label {
  font-size: 24rpx;
  color: #666;
}

.detail-value {
  font-size: 24rpx;
  color: #333;
}

.detail-value.highlight {
  color: #ff4d4f;
  font-weight: bold;
}

.detail-spec {
  font-size: 22rpx;
  color: #999;
  margin-left: 8rpx;
}

.detail-count {
  font-size: 22rpx;
  color: #52c41a;
  margin-left: 8rpx;
  font-weight: 500;
}

.detail-calculation {
  margin-top: 12rpx;
  padding: 12rpx;
  background-color: #f5f5f5;
  border-radius: 6rpx;
  font-size: 22rpx;
  color: #666;
  line-height: 1.6;
}

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  z-index: 999;
}

.bottom-price {
  min-width: 220rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.bottom-total {
  font-size: 36rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.bottom-estimate {
  font-size: 22rpx;
  color: #666;
}

.btn-buy-now {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
  background-color: #1890ff;
  color: #fff;
}

.btn-buy-now[disabled] {
  background-color: #ccc;
  color: #999;
}

/* 原料清单样式 */
.ingredient-header {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 16rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
  font-weight: bold;
  font-size: 26rpx;
  margin-bottom: 8rpx;
}

.ingredient-header-item {
  flex: 1;
  text-align: center;
  color: #333;
}

.ingredient-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
  font-size: 26rpx;
}

.ingredient-row:last-child {
  border-bottom: none;
}

.ingredient-item {
  flex: 1;
  text-align: center;
  color: #666;
  word-break: break-all;
}

/* Redesigned recipe order page */
.recipe-order-page {
  min-height: 100vh;
  background-color: #f6f7f8;
  padding-bottom: 170rpx;
}

.product-hero {
  background-color: #fff;
  margin-bottom: 20rpx;
}

.recipe-info-section {
  background-color: #fff;
  margin-bottom: 20rpx;
}

.section-label {
  display: block;
  padding: 24rpx 28rpx 16rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: #25282b;
}

.hero-image,
.hero-image-placeholder,
.recipe-cover-image,
.recipe-cover-placeholder {
  width: 100%;
  height: 360rpx;
}

.hero-image-placeholder,
.recipe-cover-placeholder {
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

.recipe-info-body {
  padding: 28rpx 28rpx 32rpx;
}

.recipe-name,
.recipe-info-title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #25282b;
  line-height: 1.3;
  text-align: center;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  justify-content: center;
  margin-top: 16rpx;
}

.recipe-tags .tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8rpx 14rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
}

.recipe-tags .life-stage-tag {
  background-color: #eef6ff;
  color: #2566a8;
}

.recipe-tags .health-tag {
  background-color: #fff5e8;
  color: #a76416;
}

.hero-meta-row,
.hero-dog-card,
.package-preview-row,
.source-plan-card,
.logistics-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-meta-row {
  margin-top: 22rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #edf0f2;
}

.hero-meta-label,
.summary-label,
.feeding-label {
  font-size: 24rpx;
  color: #687078;
}

.hero-meta-value,
.recipe-meta-value,
.summary-value,
.feeding-value {
  font-size: 28rpx;
  color: #25282b;
  font-weight: 700;
}

.recipe-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 24rpx;
}

.recipe-meta-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 18rpx;
  border-radius: 8rpx;
  background-color: #f8faf9;
  text-align: center;
}

.recipe-meta-label {
  font-size: 23rpx;
  color: #687078;
  line-height: 1.3;
}

.recipe-meta-value {
  line-height: 1.35;
  word-break: break-word;
}

.hero-dog-card {
  gap: 18rpx;
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
  min-width: 0;
}

.hero-dog-label,
.title-subtitle,
.section-note,
.ingredient-summary-meta,
.product-explanation-point,
.logistics-copy,
.hero-dog-hint,
.calc-line {
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
.section-action-button,
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

.section-action-button {
  min-width: 136rpx;
  height: 60rpx;
  line-height: 60rpx;
  padding: 0 18rpx;
}

.button-reset {
  padding: 0;
}

.section {
  background-color: #fff;
  padding: 28rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  margin-bottom: 22rpx;
}

.title-text {
  display: block;
  font-size: 32rpx;
  font-weight: 800;
  color: #25282b;
  line-height: 1.35;
}

.feeding-grid {
  display: flex;
  gap: 12rpx;
}

.dog-empty-state {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 24rpx;
  border-radius: 8rpx;
  background-color: #f7faf8;
  border: 1rpx solid #e3ede5;
}

.dog-empty-title {
  font-size: 28rpx;
  font-weight: 800;
  color: #25282b;
}

.dog-empty-copy {
  font-size: 24rpx;
  color: #687078;
  line-height: 1.5;
}

.dog-empty-action {
  align-self: flex-start;
  margin-top: 8rpx;
}

.dog-feeding-content {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.dog-profile-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.dog-profile-summary {
  flex: 1;
  min-width: 0;
  font-size: 27rpx;
  color: #25282b;
  line-height: 1.55;
}

.dog-feeding-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
}

.feeding-item,
.dog-feeding-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 18rpx;
  background-color: #f8faf9;
  border-radius: 8rpx;
  text-align: center;
}

.dog-profile-item,
.daily-intake-item {
  grid-column: span 1;
}

.dog-feeding-item:nth-child(3),
.daily-intake-item {
  background-color: #f4fbf5;
}

.inline-warning-card {
  margin: 0;
}

.section-note {
  display: block;
  margin-top: 18rpx;
}

.calculation-explanation {
  margin-top: 22rpx;
  padding: 20rpx;
  border-radius: 8rpx;
  background-color: #f8fafc;
  border: 1rpx solid #e6ebef;
}

.explanation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.explanation-title {
  font-size: 27rpx;
  font-weight: 700;
  color: #25282b;
}

.calc-cards {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 18rpx;
}

.calc-card {
  padding: 18rpx;
  background-color: #fff;
  border-radius: 8rpx;
  border: 1rpx solid #edf0f2;
}

.calc-card.highlight {
  border-color: #f2d6a4;
  background-color: #fff9ed;
}

.card-title {
  display: block;
  margin-bottom: 8rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: #25282b;
}

.calc-line.strong {
  color: #e6543f;
  font-weight: 800;
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

.cycle-options {
  display: flex;
  gap: 12rpx;
}

.cycle-option {
  flex: 1;
  padding: 18rpx 12rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 8rpx;
  text-align: center;
  background-color: #fff;
}

.cycle-option.active {
  border-color: #2f8f4e;
  background-color: #f4fbf5;
}

.cycle-option.disabled {
  opacity: 0.5;
}

.cycle-text {
  font-size: 28rpx;
  color: #25282b;
  font-weight: 700;
}

.package-plan-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-top: 24rpx;
}

.package-plan-inline-summary {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  font-weight: 700;
  color: #25282b;
  line-height: 1.45;
}

.package-edit-button {
  min-width: 172rpx;
  height: 60rpx;
  line-height: 60rpx;
  padding: 0 18rpx;
  border-radius: 8rpx;
  border: 2rpx solid #2f8f4e;
  color: #2f8f4e;
  background-color: #fff;
  font-size: 25rpx;
}

.package-plan-preview {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 16rpx;
}

.package-preview-row {
  padding: 18rpx;
  border-radius: 8rpx;
  background-color: #f8faf9;
}

.package-preview-main {
  font-size: 28rpx;
  color: #25282b;
  font-weight: 700;
}

.package-preview-sub {
  font-size: 24rpx;
  color: #6f7378;
}

.total-summary {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 18rpx;
  padding: 18rpx;
  background-color: #f8faf9;
  border-radius: 8rpx;
}

.summary-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.min-order-warning {
  margin-top: 16rpx;
  padding: 16rpx 18rpx;
  background-color: #fff7e8;
  border: 1rpx solid #f3c67d;
  border-radius: 8rpx;
}

.warning-card {
  margin: 0 0 20rpx;
  padding: 24rpx 28rpx;
  background-color: #fff9ed;
  border-left: 6rpx solid #e5a23c;
}

.warning-title {
  font-size: 30rpx;
  font-weight: 800;
  color: #7a5317;
}

.warning-text {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  color: #7a5317;
  line-height: 1.5;
}

.btn-continue {
  margin-top: 10rpx;
  border-radius: 8rpx;
  background-color: #e5a23c;
  color: #fff;
  font-size: 28rpx;
}

.btn-secondary-full {
  width: 100%;
  height: 76rpx;
  line-height: 76rpx;
  margin-top: 20rpx;
}

.package-plan-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 18rpx;
}

.package-plan-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  border-radius: 8rpx;
  background-color: #f8faf9;
}

.package-input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.package-input-label,
.package-input-unit {
  font-size: 24rpx;
  color: #687078;
}

.package-input {
  width: 116rpx;
  height: 58rpx;
  text-align: center;
  border: 1rpx solid #d8dee4;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #25282b;
  background-color: #fff;
}

.btn-add-row,
.btn-remove-row {
  min-width: 118rpx;
  height: 60rpx;
  line-height: 60rpx;
  padding: 0 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.btn-add-row {
  align-self: flex-start;
  color: #fff;
  background-color: #2f8f4e;
  border: none;
}

.btn-remove-row {
  color: #c74b35;
  background-color: #fff;
  border: 1rpx solid #f0c5bc;
}

.btn-remove-row[disabled] {
  color: #a8b0b8;
  border-color: #e5e7eb;
}

.source-plan-options {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.source-plan-options.compact {
  flex-direction: row;
  gap: 12rpx;
}

.source-plan-card {
  gap: 18rpx;
  padding: 22rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 8rpx;
  background-color: #fff;
}

.source-plan-card.compact {
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 16rpx 8rpx;
  text-align: center;
}

.source-plan-card.active {
  border-color: #2f8f4e;
  background-color: #f4fbf5;
}

.source-plan-name {
  font-size: 28rpx;
  font-weight: 800;
  color: #25282b;
}

.source-plan-card.compact .source-plan-name {
  font-size: 25rpx;
  line-height: 1.25;
}

.source-plan-desc {
  font-size: 24rpx;
  color: #687078;
  line-height: 1.45;
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
  font-weight: 800;
  color: #e6543f;
}

.source-plan-card.compact .source-plan-price {
  font-size: 25rpx;
  line-height: 1.25;
}

.source-plan-check {
  padding: 8rpx 12rpx;
  color: #2f8f4e;
  background-color: #e7f6eb;
}

.source-plan-card.compact .source-plan-check {
  padding: 6rpx 10rpx;
}

.ingredient-summary {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 20rpx;
  margin-top: 18rpx;
  border-radius: 8rpx;
  background-color: #f7faf8;
}

.ingredient-empty-state {
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 8rpx;
  background-color: #f8fafc;
  border: 1rpx solid #e8edf2;
}

.ingredient-empty-text {
  font-size: 25rpx;
  color: #687078;
}

.ingredients-content {
  margin-top: 20rpx;
}

.ingredient-group {
  margin-bottom: 28rpx;
}

.ingredient-category-title {
  margin-bottom: 12rpx;
  font-size: 28rpx;
  font-weight: 800;
  color: #25282b;
}

.ingredient-row-compact {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-height: 64rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #eef0f2;
}

.ingredient-name,
.ingredient-channel-tag,
.ingredient-spec-inline,
.ingredient-amount {
  min-width: 0;
}

.ingredient-name {
  flex: 0 1 auto;
  max-width: 196rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 26rpx;
  font-weight: 800;
  color: #25282b;
}

.ingredient-channel-tag {
  flex: 0 0 auto;
  max-width: 128rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 8rpx 10rpx;
  border-radius: 6rpx;
  color: #257b43;
  background-color: #e7f6eb;
}

.ingredient-channel-tag.supplement {
  color: #526173;
  background-color: #edf2f7;
}

.ingredient-spec-inline {
  flex: 1 1 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 24rpx;
  color: #687078;
}

.ingredient-amount {
  flex: 0 0 auto;
  min-width: 92rpx;
  text-align: right;
  font-size: 24rpx;
  color: #25282b;
  font-weight: 800;
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

.logistics-item {
  align-items: flex-start;
  flex-direction: column;
  gap: 8rpx;
}

.price-breakdown-section {
  background-color: #fff;
  padding: 28rpx;
}

.clickable {
  cursor: pointer;
}

.breakdown-content {
  margin-top: 16rpx;
}

.breakdown-group {
  padding: 18rpx;
  border-radius: 8rpx;
  background-color: #f8fafc;
}

.breakdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 0;
}

.breakdown-item.total {
  margin-top: 8rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #e2e8ef;
}

.breakdown-label {
  font-size: 25rpx;
  color: #687078;
}

.breakdown-value {
  font-size: 26rpx;
  color: #25282b;
  font-weight: 700;
}

.breakdown-value.final {
  color: #e6543f;
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

</style>
