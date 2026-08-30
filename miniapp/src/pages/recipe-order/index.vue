<template>
  <view class="recipe-order-page">
    <view class="recipe-info-section">
      <view
        v-if="lifeStageVersionOptions.length > 0"
        class="recipe-life-stage-picker"
      >
        <view class="recipe-life-stage-picker-inner" @tap="toggleLifeStageDropdown">
          <text class="recipe-life-stage-picker-label">{{ selectedLifeStageLabel || '选择生命阶段' }}</text>
          <text :class="['recipe-life-stage-picker-arrow', { open: lifeStageDropdownVisible }]">▼</text>
        </view>
        <view
          v-if="lifeStageDropdownVisible"
          class="recipe-life-stage-dropdown-mask"
          @tap="closeLifeStageDropdown"
        />
        <view v-if="lifeStageDropdownVisible" class="recipe-life-stage-dropdown">
          <view
            v-for="option in lifeStageVersionOptions"
            :key="option.lifeStage"
            :class="['recipe-life-stage-dropdown-option', { active: option.lifeStage === selectedLifeStage }]"
            @tap.stop="selectLifeStageVersion(option)"
          >
            <text class="recipe-life-stage-dropdown-label">{{ option.label }}</text>
            <text v-if="option.lifeStage === selectedLifeStage" class="recipe-life-stage-dropdown-check">✓</text>
          </view>
        </view>
      </view>
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
        <view
          v-if="recipe.targetHealthTags && recipe.targetHealthTags.length > 0"
          class="recipe-tags"
        >
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
            <text class="recipe-meta-value">{{ displayRecipeEnergyDensity }} kcal/kg</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section dog-feeding-section">
      <view v-if="dogs.length === 0" class="dog-empty-state">
        <text class="dog-empty-title">请先创建狗狗档案</text>
        <text class="dog-empty-copy">系统会结合狗狗档案和当前食谱计算建议用量。</text>
        <button class="section-action-button dog-empty-action button-reset" @tap="goToCreateDog">创建档案</button>
      </view>

      <view v-else class="dog-feeding-content">
        <scroll-view scroll-x class="order-dog-scroll">
          <view
            v-for="dog in dogs"
            :key="dog.id"
            :class="['order-dog-chip', { active: dog.id === selectedDogId }]"
            @tap="selectDog(dog.id)"
          >
            <image class="order-dog-avatar" :src="resolveDogAvatarSrc(dog.avatarUrl)" mode="aspectFill" />
            <view class="order-dog-copy">
              <text class="order-dog-name">{{ dog.name }}</text>
            </view>
          </view>
        </scroll-view>

        <view v-if="selectedDog" class="dog-profile-context">
          <view class="dog-profile-facts">
            <view
              v-for="fact in dogProfileFacts"
              :key="fact.label"
              class="dog-profile-fact"
            >
              <text class="dog-profile-fact-label">{{ fact.label }}</text>
              <text class="dog-profile-fact-value">{{ fact.value }}</text>
            </view>
          </view>
        </view>

        <view v-if="!isLifeStageMatch && showWarning" class="warning-card inline-warning-card">
          <view class="warning-header">
            <text class="warning-title">生命阶段提醒</text>
          </view>
          <text class="warning-text">
            {{ lifeStageReminderText }}
          </text>
          <view class="warning-actions">
            <button
              v-if="recommendedLifeStageOption"
              class="btn-switch-stage"
              @tap="switchToRecommendedLifeStage"
            >
              切换到{{ recommendedLifeStageOption.label }}
            </button>
            <button class="btn-continue" @tap="dismissWarning">
              我已知晓
            </button>
          </view>
        </view>

        <view class="dog-feeding-grid">
          <view class="dog-feeding-item daily-intake-item">
            <text class="feeding-label">每日参考</text>
            <text class="feeding-value">{{ dailySuggestedIntakeText }}</text>
          </view>
          <view class="dog-feeding-item">
            <text class="feeding-label">每餐约</text>
            <text class="feeding-value">{{ perMealIntakeText }}</text>
          </view>
          <view class="dog-feeding-item">
            <text class="feeding-label">主食能量</text>
            <text class="feeding-value">{{ dailyMainFoodEnergyText }}</text>
          </view>
        </view>

        <text class="section-note feeding-adjustment-note">
          首单起始喂食量：已按国内城市犬的常见活动量保守估算。建议观察2-4周体重、便便和饥饿感，再按5%-10%小幅调整。
        </text>
      </view>
    </view>

    <view class="section package-plan-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">配置天数</text>
      </view>

      <view class="cycle-options">
        <view
          v-for="days in ORDER_CYCLE_OPTIONS"
          :key="days"
          class="cycle-option"
          :class="{ active: !isCustomPackagePlan && selectedCycleDays === days, disabled: isCustomPackagePlan }"
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
        <button class="btn-add-row" @tap="addPackagePlanRow">添加多个分装规格</button>
      </view>
    </view>

    <view class="section ingredient-source-section" v-if="selectedDog">
      <view class="section-title">
        <view class="title-stack">
          <text class="title-text">原料来源</text>
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
      <text class="source-plan-safety-copy">{{ selectedSourcePlanDescription }}</text>

      <view v-if="totalIngredientCount === 0" class="ingredient-empty-state">
        <text class="ingredient-empty-text">原料清单生成中，请稍后查看</text>
      </view>

      <view v-if="totalIngredientCount > 0" class="ingredients-content">
        <view class="ingredient-list-title">
          <text class="ingredient-list-title-text">原料明细</text>
        </view>

        <view
          v-for="ingredient in displayIngredientRows"
          :key="ingredient.key"
          class="ingredient-row-compact"
        >
          <view class="ingredient-row-main">
            <view class="ingredient-name-cell">
              <text class="ingredient-type-tag" :class="ingredient.typeClass">
                {{ ingredient.typeLabel }}
              </text>
              <text class="ingredient-name">{{ ingredient.nameText }}</text>
            </view>
            <text class="ingredient-amount">
              {{ ingredient.amountText }}
            </text>
          </view>
          <view class="ingredient-meta-row">
            <text class="ingredient-meta-item">
              <text class="ingredient-meta-label">渠道</text>
              {{ ingredient.purchaseChannelText }}
            </text>
            <text class="ingredient-meta-item">
              <text class="ingredient-meta-label">品牌</text>
              {{ ingredient.brandText }}
            </text>
            <text class="ingredient-meta-item">
              <text class="ingredient-meta-label">规格</text>
              {{ ingredient.productModelText }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <view class="section product-explanation-section">
      <view class="section-title">
        <text class="title-text">说明</text>
      </view>

      <view class="explanation-card-list">
        <view
          v-for="card in productExplanationCards"
          :key="card.title"
          class="product-explanation-card"
          :class="{
            'product-explanation-logistics-card': card.mediaKind === 'logistics',
            'product-explanation-storage-card': card.mediaKind === 'storage',
            'product-explanation-cooking-card': card.mediaKind === 'cooking',
            'product-explanation-plain-card': card.mediaKind === 'plain',
          }"
        >
          <template v-if="card.mediaKind === 'logistics'">
            <text class="product-explanation-title product-explanation-logistics-title">
              {{ card.title }}
            </text>
            <view class="product-explanation-logistics-visual">
              <view class="product-explanation-package-frame">
                <image
                  v-if="card.packageImageUrl"
                  :src="normalizeImageUrl(card.packageImageUrl)"
                  class="product-explanation-package-image product-explanation-logistics-package-image"
                  mode="aspectFit"
                  @error="handleProductExplanationPackageImageError"
                />
              </view>
              <view v-if="card.shippingLogoUrl" class="product-explanation-shipping-row">
                <view class="product-explanation-shipping-main">
                  <image
                    :src="normalizeImageUrl(card.shippingLogoUrl)"
                    class="product-explanation-shipping-logo product-explanation-shipping-logo-large"
                    mode="aspectFit"
                    @error="handleProductExplanationShippingLogoError"
                  />
                  <view class="product-explanation-shipping-copy">
                    <text class="product-explanation-shipping-title">顺丰生鲜配送</text>
                    <text class="product-explanation-shipping-subtitle">冷冻包材 + 冰袋随箱</text>
                  </view>
                </view>
                <text class="product-explanation-shipping-pill">冷链配送</text>
              </view>
            </view>
          </template>

          <template v-else-if="card.mediaKind === 'storage'">
            <text class="product-explanation-title">{{ card.title }}</text>
            <text
              v-for="point in card.points"
              :key="point"
              class="product-explanation-storage-note"
            >
              {{ point }}
            </text>
            <view class="product-explanation-storage-grid">
              <view
                v-for="item in card.storageItems"
                :key="item.title"
                class="product-explanation-storage-item"
                :class="{ highlight: item.highlight }"
              >
                <text class="product-explanation-storage-temp">{{ item.temperature }}</text>
                <text class="product-explanation-storage-title">{{ item.title }}</text>
                <text class="product-explanation-storage-copy">{{ item.copy }}</text>
              </view>
            </view>
          </template>

          <template v-else-if="card.mediaKind === 'cooking'">
            <text class="product-explanation-title">{{ card.title }}</text>
            <view class="product-explanation-cooking-list">
              <view
                v-for="method in card.cookingMethods"
                :key="method.title"
                class="product-explanation-cooking-item"
                :class="method.tone"
              >
                <view class="product-explanation-cooking-label">
                  {{ method.label }}
                </view>
                <view class="product-explanation-cooking-copy">
                  <text class="product-explanation-cooking-title">{{ method.title }}</text>
                  <view class="product-explanation-cooking-tags">
                    <text
                      v-for="tag in method.tags"
                      :key="tag"
                      class="product-explanation-cooking-tag"
                    >
                      {{ tag }}
                    </text>
                  </view>
                  <text
                    v-for="line in method.lines"
                    :key="line"
                    class="product-explanation-cooking-line"
                  >
                    {{ line }}
                  </text>
                </view>
              </view>
            </view>
          </template>

          <template v-else-if="card.mediaKind === 'plain'">
            <view class="product-explanation-copy">
              <text class="product-explanation-title">{{ card.title }}</text>
              <text
                v-for="point in card.points"
                :key="point"
                class="product-explanation-point"
              >
                {{ point }}
              </text>
            </view>
          </template>

          <template v-else>
            <view class="product-explanation-media" :class="card.mediaKind">
            <view
              v-if="card.packageImageUrl || card.shippingLogoUrl"
              class="product-explanation-media-stack"
            >
              <image
                v-if="card.packageImageUrl"
                :src="normalizeImageUrl(card.packageImageUrl)"
                class="product-explanation-package-image"
                mode="aspectFill"
                @error="handleProductExplanationPackageImageError"
              />
              <view v-if="card.shippingLogoUrl" class="product-explanation-shipping-company">
                <image
                  :src="normalizeImageUrl(card.shippingLogoUrl)"
                  class="product-explanation-shipping-logo"
                  mode="aspectFit"
                  @error="handleProductExplanationShippingLogoError"
                />
                <text class="product-explanation-shipping-text">冷链配送</text>
              </view>
            </view>
            <text v-else class="product-explanation-media-label">{{ card.mediaLabel }}</text>
            </view>
            <view class="product-explanation-copy">
              <text class="product-explanation-title">{{ card.title }}</text>
              <text
                v-for="point in card.points"
                :key="point"
                class="product-explanation-point"
              >
                {{ point }}
              </text>
            </view>
          </template>
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
      <CustomerServiceInlineButton
        class="customer-service-bottom-action"
        source-type="PRODUCT"
        :product-id="recipeId"
        :product-name="recipe.name"
        :image-url="normalizeImageUrl(recipe.coverImageUrl || '')"
        title="下单配置咨询"
      />
      <view class="bottom-price">
        <text class="bottom-total">{{ bottomPriceTitle }}</text>
        <view class="bottom-estimate">
          <text class="bottom-price-per-package">{{ bottomPricePerPackageText }}</text>
        </view>
      </view>
      <button
        class="btn-buy-now"
        :disabled="!canBuyNow"
        @tap="buyNow"
      >
        确认订单
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { request } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import { formatEnergyDensityKcalPerKg, formatRecipeFormulaSoftwareLabel } from '../../utils/recipe-display'
import {
  buildLifeStageReminderText,
  getLifeStageLabel,
  isRecipeLifeStageMatch,
  resolveDogLifeStage,
  resolveDogRecipeLifeStage,
} from '../../utils/life-stage-match'
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
import {
  buildIngredientBrandText,
  buildIngredientDisplayName,
  buildIngredientPurchaseChannelText,
} from './ingredientDisplay'
import CustomerServiceInlineButton from '../../components/CustomerServiceInlineButton.vue'

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
  activityLevel?: string
  lifeStageOverride?: string
  avatarUrl?: string
}

interface Recipe {
  id: string
  name: string
  selectedLifeStage?: string
  selectedLifeStageLabel?: string
  selectedRecipeId?: string
  availableLifeStageVersions?: RecipeLifeStageVersion[]
  description?: string
  coverImageUrl?: string
  energyDensityKcalPerKg: number
  nutritionStandard?: string
  designSource?: string
  applicableLifeStages?: string[]
  targetHealthTags?: string[]
}

interface RecipeLifeStageVersion {
  recipeId?: string
  lifeStage: string
  label?: string
  isSelected?: boolean
  selected?: boolean
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
  mediaKind: 'plain' | 'image' | 'video' | 'logistics' | 'storage' | 'cooking'
  mediaLabel?: string
  packageImageUrl?: string
  shippingLogoUrl?: string
  storageItems?: Array<{
    temperature: string
    title: string
    copy: string
    highlight?: boolean
  }>
  cookingMethods?: Array<{
    label: string
    title: string
    tags: string[]
    lines: string[]
    tone: 'recommend' | 'avoid'
  }>
  points: string[]
}

interface IngredientCostItem {
  name: string
  type: string
  amount: number
  unit: string
  procurementSkuName?: string
  brand?: string
  productModel?: string
  purchaseChannel?: string
  displayUnit?: string
  unitCost: number
  cost: number
  calculation: string
  netAmount?: number  // 净需求（不含生产损耗和出肉率）
}

interface IngredientDisplayRow {
  key: string
  typeLabel: string
  typeClass: string
  nameText: string
  amountText: string
  purchaseChannelText: string
  brandText: string
  productModelText: string
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
const selectedLifeStage = ref('')
const recipe = ref<Recipe>({
  id: '',
  name: '',
  energyDensityKcalPerKg: 0
})
const lifeStageDropdownVisible = ref(false)

const dogs = ref<Dog[]>([])
const breeds = ref<Breed[]>([])
const selectedDogId = ref('')
const selectedCycleDays = ref<number | null>(DEFAULT_ORDER_CYCLE_DAYS)
const lastSelectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
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

const DEFAULT_PACKAGE_EXAMPLE_IMAGE_URL = 'https://img.sevenkitchen.cloud/package-images/1769932497277-7bf4f880.jpg'
const DEFAULT_SHIPPING_COMPANY_LOGO_URL = 'https://img.sevenkitchen.cloud/shipping-logos/1769932504418-14b5188c.png'
const STALE_PRODUCT_EXPLANATION_MEDIA_URLS = new Set([
  normalizeImageUrl('http://img.sevenkitchen.cloud/package-images/1767527958742-149215e3.jpg'),
  normalizeImageUrl('https://img.sevenkitchen.cloud/package-images/1767527958742-149215e3.jpg'),
  normalizeImageUrl('http://img.sevenkitchen.cloud/shipping-logos/1767529001420-55fde8f2.png'),
  normalizeImageUrl('https://img.sevenkitchen.cloud/shipping-logos/1767529001420-55fde8f2.png'),
].filter(Boolean))

const productExplanationMediaConfig = ref({
  packageImageUrl: DEFAULT_PACKAGE_EXAMPLE_IMAGE_URL,
  shippingLogoUrl: DEFAULT_SHIPPING_COMPANY_LOGO_URL,
})

const productExplanationCards = computed<ProductExplanationCard[]>(() => [
  {
    title: '保质期与存储方式',
    mediaKind: 'storage',
    mediaLabel: '保质期',
    points: [
      '收到后请尽快放入冷冻或冷藏环境，按实际喂食节奏取用。',
    ],
    storageItems: [
      {
        temperature: '-18℃',
        title: '冷冻保存',
        copy: '可保存 6 个月。',
      },
      {
        temperature: '0-4℃',
        title: '冷藏保存',
        copy: '可保存 3 天。',
      },
      {
        temperature: '1 个月',
        title: '最佳营养保存期',
        copy: '建议 1 个月内吃完，不建议囤货。',
        highlight: true,
      },
    ],
  },
  {
    title: '烹饪方法',
    mediaKind: 'cooking',
    mediaLabel: '烹饪',
    points: [],
    cookingMethods: [
      {
        label: '建议',
        title: '温和加热',
        tags: ['蒸', '炖', '低温慢煮'],
        lines: [
          '建议蒸、炖、低温慢煮。',
          '烹饪时间与重量和体积相关，请参考产品标签。',
        ],
        tone: 'recommend',
      },
      {
        label: '不建议',
        title: '高温快速烹饪',
        tags: ['微波', '炸', '炒', '煎'],
        lines: [
          '不建议微波、炸、炒、煎等高温烹饪方式。',
        ],
        tone: 'avoid',
      },
    ],
  },
])

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
const selectedDogLifeStage = computed(() => resolveDogLifeStage(selectedDog.value, breeds.value))
const selectedDogRecipeLifeStage = computed(() =>
  resolveDogRecipeLifeStage(selectedDog.value, breeds.value),
)
const lifeStageReminderText = computed(() => buildLifeStageReminderText({
  applicableStages: recipe.value.applicableLifeStages || [],
  dogLifeStage: selectedDogRecipeLifeStage.value,
  dogName: selectedDog.value?.name,
}))

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
const hasSelectedCycleOrCustomPackagePlan = computed(() => Boolean(
  selectedCycleDays.value || isCustomPackagePlan.value,
))
const sourcePlanLabel = computed(() => getSourcePlanLabel(selectedSourcePlan.value))
const selectedSourcePlanDescription = computed(() => formatSourcePlanDescription(selectedSourcePlan.value))
const perMealG = computed(() => {
  if (!displayDailyIntakeG.value || !selectedDog.value?.mealsPerDay) return 0
  return displayDailyIntakeG.value / selectedDog.value.mealsPerDay
})
const recipeNutritionStandardLabel = computed(() =>
  getNutritionStandardLabel(recipe.value.nutritionStandard || 'FEDIAF_2021')
)
const recipeFormulaSoftwareLabel = computed(() =>
  formatRecipeFormulaSoftwareLabel(recipe.value.designSource)
)
const displayRecipeEnergyDensity = computed(() =>
  formatEnergyDensityKcalPerKg(recipe.value.energyDensityKcalPerKg)
)
const selectedLifeStageLabel = computed(() => {
  if (recipe.value.selectedLifeStageLabel) return recipe.value.selectedLifeStageLabel
  const stage = selectedLifeStage.value || recipe.value.selectedLifeStage || ''
  if (!stage) return ''
  const matchedVersion = recipe.value.availableLifeStageVersions?.find(
    version => version.lifeStage === stage,
  )
  return matchedVersion?.label || getLifeStageLabel(stage)
})
const lifeStageVersionOptions = computed(() => {
  const versions = recipe.value.availableLifeStageVersions || []
  return versions.map(version => ({
    recipeId: version.recipeId,
    lifeStage: version.lifeStage,
    label: version.label || getLifeStageLabel(version.lifeStage),
  }))
})
const recommendedLifeStageOption = computed(() => {
  const targetLifeStage = selectedDogRecipeLifeStage.value
  if (!targetLifeStage) return null
  const currentLifeStage = selectedLifeStage.value || recipe.value.selectedLifeStage || ''
  const version = recipe.value.availableLifeStageVersions?.find(
    version => version.lifeStage === selectedDogRecipeLifeStage.value,
  )
  if (!version || version.lifeStage === currentLifeStage) return null
  return {
    recipeId: version.recipeId,
    lifeStage: version.lifeStage,
    label: version.label || getLifeStageLabel(version.lifeStage),
  }
})
const dogProfileFacts = computed(() => {
  if (!selectedDog.value) return []

  return [
    { label: '年龄', value: calculateDogAgeText(selectedDog.value) },
    { label: '性别', value: getDogGenderLabel(selectedDog.value.gender) },
    { label: '体重', value: `${selectedDog.value.currentWeightKg}kg` },
    { label: '餐次', value: `每日 ${selectedDog.value.mealsPerDay} 餐` },
  ]
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
const perMealIntakeText = computed(() => {
  if (!perMealG.value) return '计算中'
  return `${Math.round(perMealG.value)}g`
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
const bottomPriceTitle = computed(() => {
  if (!selectedDogId.value) return '请选择狗狗'
  if (packagePlanValidationMessage.value) return '分装需调整'
  if (isPricePreviewLoading.value) return '计算中'
  if (!minimumOrderMet.value) return '未满 1000g'
  if (pricePreviewError.value) return '价格暂未生成'
  if (!pricePreview.value) return '--'
  return `¥${pricePreview.value.amountTotal.toFixed(2)}`
})
const bottomPricePerPackageText = computed(() => {
  if (!selectedDogId.value) return '选择狗狗后查看饭量和价格'
  if (packagePlanValidationMessage.value) return packagePlanValidationMessage.value
  if (isPricePreviewLoading.value) return '价格生成后可下单'
  if (!minimumOrderMet.value) return `当前 ${Math.round(totalGrams.value)}g，暂不可下单`
  if (pricePreviewError.value) return '请稍后重试或切换分装/采购方案'
  if (!pricePreview.value || totalPackages.value <= 0) return '等待价格生成'
  if (isSinglePackageSpec.value) {
    return `¥${averagePricePerPackage.value.toFixed(2)}/袋`
  }
  return `均价 ¥${averagePricePerPackage.value.toFixed(2)}/袋`
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
    && hasSelectedCycleOrCustomPackagePlan.value
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

const displayIngredients = computed(() => {
  if (!pricePreview.value?.pricingBreakdown?.ingredientDetails) return []
  return pricePreview.value.pricingBreakdown.ingredientDetails
})

const displayIngredientRows = computed<IngredientDisplayRow[]>(() => {
  return displayIngredients.value.map((ingredient, index) => ({
    key: `ingredient-${index}`,
    typeLabel: getIngredientTypeLabel(ingredient.type),
    typeClass: getIngredientTypeClass(ingredient.type),
    nameText: buildIngredientDisplayName(ingredient),
    amountText: formatIngredientAmount(ingredient),
    purchaseChannelText: buildIngredientPurchaseChannelText(ingredient),
    brandText: buildIngredientBrandText(ingredient),
    productModelText: ingredient.productModel || '-',
  }))
})

const totalIngredientCount = computed(() => displayIngredientRows.value.length)

function getIngredientTypeLabel(type: string): string {
  return type === 'SUPPLEMENT' ? '补剂' : '食材'
}

function getIngredientTypeClass(type: string): string {
  return type === 'SUPPLEMENT' ? 'supplement' : 'food'
}

function formatSourcePlanShortName(code: IngredientSourcePlanCode): string {
  const map: Record<IngredientSourcePlanCode, string> = {
    ORGANIC: '有机优先',
    MARKET_PREMIUM: '商超优先',
    WHOLESALE: '批发优先',
  }
  return map[code]
}

function formatSourcePlanDescription(code: IngredientSourcePlanCode): string {
  const map: Record<IngredientSourcePlanCode, string> = {
    ORGANIC: '优先采购有机食材，如果没有有机来源，再向下选择。',
    MARKET_PREMIUM: '优先采购山姆、盒马等商超来源的食材，如果没有，再向下选择本地农贸市场或者批发市场的来源。',
    WHOLESALE: '优先采用本地大型食材批发市场来源，包括但不限于成都海吉星、海霸王、美菜网等批发市场。营养价值与有机或者商超来源几乎没有差异，但品控没有大型商超那么严格。',
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

  lastSelectedCycleDays.value = selectedCycleDays.value || lastSelectedCycleDays.value
  selectedCycleDays.value = null
  isCustomPackagePlan.value = true
  showPackageEditor.value = true
  invalidatePackagePlanPricingPreview()
  loadPricePreview()
  loadSourcePlanPricePreviews()
}

function cancelCustomPackagePlan() {
  clearPricePreviewDebounce()
  isCustomPackagePlan.value = false
  showPackageEditor.value = false
  selectedCycleDays.value = lastSelectedCycleDays.value
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
const detailHandoffDogId = ref('')

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any

  loadProductExplanationMediaConfig()

  recipeId.value = currentPage.options?.recipeId || ''
  selectedLifeStage.value = currentPage.options?.lifeStage || ''
  detailHandoffDogId.value = currentPage.options?.dogId || ''

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

async function loadProductExplanationMediaConfig() {
  try {
    const res = await request<{
      packageExampleImageUrl?: string | null
      shippingCompanyLogoUrl?: string | null
    }>({
      url: '/global-config',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    })

    if (res.code === 0 && res.data) {
      const configuredPackageImageUrl = normalizeImageUrl(res.data.packageExampleImageUrl)
      const configuredShippingLogoUrl = normalizeImageUrl(res.data.shippingCompanyLogoUrl)
      productExplanationMediaConfig.value = {
        packageImageUrl: isUsableProductExplanationMediaUrl(configuredPackageImageUrl)
          ? configuredPackageImageUrl
          : DEFAULT_PACKAGE_EXAMPLE_IMAGE_URL,
        shippingLogoUrl: isUsableProductExplanationMediaUrl(configuredShippingLogoUrl)
          ? configuredShippingLogoUrl
          : DEFAULT_SHIPPING_COMPANY_LOGO_URL,
      }
    }
  } catch (error) {
    console.warn('[RecipeOrder] Load product explanation media config failed:', error)
  }
}

function isUsableProductExplanationMediaUrl(url: string | null | undefined): url is string {
  return Boolean(url && !STALE_PRODUCT_EXPLANATION_MEDIA_URLS.has(url))
}

function handleProductExplanationPackageImageError() {
  if (productExplanationMediaConfig.value.packageImageUrl !== DEFAULT_PACKAGE_EXAMPLE_IMAGE_URL) {
    productExplanationMediaConfig.value = {
      ...productExplanationMediaConfig.value,
      packageImageUrl: DEFAULT_PACKAGE_EXAMPLE_IMAGE_URL,
    }
  }
}

function handleProductExplanationShippingLogoError() {
  if (productExplanationMediaConfig.value.shippingLogoUrl !== DEFAULT_SHIPPING_COMPANY_LOGO_URL) {
    productExplanationMediaConfig.value = {
      ...productExplanationMediaConfig.value,
      shippingLogoUrl: DEFAULT_SHIPPING_COMPANY_LOGO_URL,
    }
  }
}

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
    const data: Record<string, string> = {}
    if (selectedLifeStage.value) {
      data.lifeStage = selectedLifeStage.value
    }
    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET',
      data,
    })
    if (res.code === 0 && res.data) {
      recipe.value = res.data
      if (!selectedLifeStage.value && res.data.selectedLifeStage) {
        selectedLifeStage.value = res.data.selectedLifeStage
      }
      if (res.data.selectedRecipeId || res.data.id) {
        recipeId.value = res.data.selectedRecipeId || res.data.id
      }
    }
  } catch (error) {
    console.error('Load recipe error:', error)
  }
}

function toggleLifeStageDropdown() {
  lifeStageDropdownVisible.value = !lifeStageDropdownVisible.value
}

function closeLifeStageDropdown() {
  lifeStageDropdownVisible.value = false
}

async function selectLifeStageVersion(option: { recipeId?: string; lifeStage: string; label: string }) {
  closeLifeStageDropdown()
  if (!option?.lifeStage || option.lifeStage === selectedLifeStage.value) return

  clearPricePreviewDebounce()
  pricingPreviewRequestSeq += 1
  sourcePlanPriceRequestSeq += 1
  dogCalcRequestSeq += 1
  selectedLifeStage.value = option.lifeStage
  if (option.recipeId) {
    recipeId.value = option.recipeId
  }
  pricePreviewError.value = ''
  sourcePlanPrices.value = {
    ORGANIC: null,
    MARKET_PREMIUM: null,
    WHOLESALE: null,
  }
  resetPricePreviewState()
  displayDailyIntakeG.value = 0
  dogCalcResult.value = null
  packagePlan.value = []
  packagePlanDogId.value = null

  await loadRecipeDetail()
  checkLifeStageMatch()
  if (selectedDogId.value) {
    loadDogCalcResult(selectedDogId.value)
  }
}

async function switchToRecommendedLifeStage() {
  const option = recommendedLifeStageOption.value
  if (!option) return
  await selectLifeStageVersion(option)
}

async function loadDogs() {
  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      dogs.value = res.data

      // 自动选中狗狗（再次购买优先，其次详情页传入，再其次本地缓存）
      if (dogs.value.length > 0 && !selectedDogId.value) {
        const preferredDogId = autoConfigParams.value.dogId || detailHandoffDogId.value || uni.getStorageSync('dogId') || ''
        const preferredDog = dogs.value.find(d => d.id === preferredDogId) || dogs.value[0]
        selectDog(preferredDog.id)
      }
    }
  } catch (error) {
    console.error('Load dogs error:', error)
  }
}

// ========== 生命阶段校验逻辑 ==========

function checkLifeStageMatch() {
  console.log('[RecipeOrder] checkLifeStageMatch 开始')

  if (!selectedDog.value || !recipe.value) {
    console.log('[RecipeOrder] 缺少必要数据，跳过校验')
    isLifeStageMatch.value = true
    return
  }

  const dogLifeStage = selectedDogLifeStage.value
  const dogRecipeLifeStage = selectedDogRecipeLifeStage.value
  const applicableStages = recipe.value.applicableLifeStages || []

  // 详细调试日志
  console.log('[RecipeOrder] 生命阶段校验详情:', {
    '狗狗名字': selectedDog.value.name,
    '狗狗生日': selectedDog.value.birthday,
    '狗狗品种ID': selectedDog.value.breedId,
    '生命阶段覆盖值': selectedDog.value.lifeStageOverride,
    '计算的狗狗生命阶段': dogLifeStage,
    '食谱匹配生命阶段': dogRecipeLifeStage,
    '食谱适用生命阶段': applicableStages,
    '食谱名称': recipe.value.name,
    '检查结果': isRecipeLifeStageMatch(applicableStages, dogRecipeLifeStage),
    'breeds列表长度': breeds.value.length,
    'breeds列表': breeds.value.map(b => ({ id: b.id, name: b.name, adultAgeMonths: b.adultAgeMonths }))
  })

  isLifeStageMatch.value = isRecipeLifeStageMatch(applicableStages, dogRecipeLifeStage)
  console.log('[RecipeOrder] 校验结果:', isLifeStageMatch.value ? '匹配' : '不匹配')

  // 每次切换狗狗时重置警告状态
  showWarning.value = true

  console.log('[RecipeOrder] 警告卡片显示条件:', {
    '!isLifeStageMatch': !isLifeStageMatch.value,
    'selectedDog': !!selectedDog.value,
    'showWarning': showWarning.value,
    '应该显示警告': !isLifeStageMatch.value && selectedDog.value && showWarning.value
  })
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

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'FEDIAF_2025': 'FEDIAF 2025',
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
  if (!dogId || dogId === selectedDogId.value) return

  clearPricePreviewDebounce()
  pricingPreviewRequestSeq += 1
  sourcePlanPriceRequestSeq += 1
  selectedDogId.value = dogId
  isCustomPackagePlan.value = false
  showPackageEditor.value = false
  selectedCycleDays.value = selectedCycleDays.value || lastSelectedCycleDays.value
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
      lastSelectedCycleDays.value = cycleDays
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
      title: '请先取消自定义分装后再切换配置天数',
      icon: 'none',
    })
    return
  }

  selectedCycleDays.value = days
  lastSelectedCycleDays.value = days
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
    lifeStage: selectedLifeStage.value || undefined,
    quantityG: Math.round(totalGrams.value),
    packageCount: totalPackages.value,
    packageSpecG: getPrimaryPackageSpecG(normalizedPackagePlan.value),
    packagePlan: normalizedPackagePlan.value,
    cycleDays: selectedCycleDays.value || undefined,
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

function buyNow() {
  if (!canBuyNow.value) return

  if (!isLifeStageMatch.value && showWarning.value) {
    uni.showModal({
      title: '生命阶段提醒',
      content: '当前狗狗生命阶段与食谱适用阶段不一致，仍要继续下单吗？',
      success: (res) => {
        if (res.confirm) {
          showWarning.value = false
          void continueBuyNow()
        }
      }
    })
    return
  }

  void continueBuyNow()
}

async function continueBuyNow() {
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
    dogId: selectedDog.value?.id || selectedDogId.value,
    recipeId: recipeId.value,
    lifeStage: selectedLifeStage.value,
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
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
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
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
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
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
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
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  z-index: 999;
}

.bottom-price {
  min-width: 0;
  max-width: calc(100% - 470rpx);
  margin-left: auto;
  margin-right: 0;
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
  text-align: right;
}

.bottom-total {
  max-width: 100%;
  font-size: 36rpx;
  font-weight: bold;
  color: #ff4d4f;
  text-align: right;
}

.bottom-estimate {
  max-width: 100%;
  font-size: 22rpx;
  color: #666;
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2rpx;
}

.bottom-price-per-package {
  max-width: 100%;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.btn-buy-now {
  flex-shrink: 0;
  width: 240rpx;
  margin: 0;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 40rpx;
  box-sizing: border-box;
  padding: 0 18rpx;
  font-size: 26rpx;
  line-height: 1;
  white-space: nowrap;
  border: none;
  background-color: #1890ff;
  color: #fff;
}

.btn-buy-now[disabled] {
  background-color: #ccc;
  color: #999;
}

.customer-service-bottom-action {
  flex: 0 0 auto;
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

.recipe-life-stage-picker {
  display: block;
  position: relative;
  padding: 20rpx 28rpx 14rpx;
  z-index: 30;
}

.recipe-life-stage-picker-inner {
  height: 64rpx;
  padding: 0 22rpx;
  border-radius: 8rpx;
  background-color: #f6faf7;
  border: 1rpx solid #dceee0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.recipe-life-stage-picker-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26rpx;
  font-weight: 800;
  color: #226d3a;
}

.recipe-life-stage-picker-arrow {
  flex: 0 0 auto;
  font-size: 20rpx;
  color: #2f8f4e;
  transition: transform 0.18s ease;
}

.recipe-life-stage-picker-arrow.open {
  transform: rotate(180deg);
}

.recipe-life-stage-dropdown-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 20;
  background-color: transparent;
}

.recipe-life-stage-dropdown {
  position: absolute;
  left: 28rpx;
  right: 28rpx;
  top: 92rpx;
  z-index: 31;
  overflow: hidden;
  border-radius: 8rpx;
  border: 1rpx solid #dceee0;
  background-color: #fff;
  box-shadow: 0 12rpx 32rpx rgba(18, 24, 31, 0.14);
}

.recipe-life-stage-dropdown-option {
  min-height: 72rpx;
  padding: 0 22rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  border-bottom: 1rpx solid #edf0f2;
}

.recipe-life-stage-dropdown-option:last-child {
  border-bottom: none;
}

.recipe-life-stage-dropdown-option.active {
  background-color: #f0faf3;
}

.recipe-life-stage-dropdown-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 25rpx;
  color: #25282b;
}

.recipe-life-stage-dropdown-option.active .recipe-life-stage-dropdown-label,
.recipe-life-stage-dropdown-check {
  font-weight: 800;
  color: #226d3a;
}

.recipe-life-stage-dropdown-check {
  flex: 0 0 auto;
  font-size: 24rpx;
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
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.section-action-button {
  min-width: 136rpx;
  height: 60rpx;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
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

.order-dog-scroll {
  width: 100%;
  white-space: nowrap;
}

.order-dog-chip {
  width: 214rpx;
  min-height: 86rpx;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  margin-right: 14rpx;
  padding: 12rpx;
  border-radius: 8rpx;
  border: 2rpx solid #edf0f2;
  background-color: #f8faf9;
  color: #25282b;
  vertical-align: middle;
}

.order-dog-chip.active {
  border-color: #2f8f4e;
  background-color: #f0faf3;
}

.order-dog-avatar {
  flex: 0 0 auto;
  width: 58rpx;
  height: 58rpx;
  border-radius: 50%;
  background-color: #e8efe9;
}

.order-dog-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.order-dog-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 25rpx;
  font-weight: 800;
  color: #25282b;
}

.order-dog-chip.active .order-dog-name {
  color: #226d3a;
}

.dog-profile-context {
  padding: 14rpx 16rpx;
  border-radius: 8rpx;
  background-color: #f8faf9;
  border: 1rpx solid #edf0f2;
}

.dog-profile-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}

.dog-profile-fact {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  max-width: 100%;
  padding: 4rpx 10rpx;
  border-radius: 6rpx;
  background-color: #fff;
  color: #25282b;
  line-height: 1.35;
}

.dog-profile-fact-label {
  font-size: 21rpx;
  color: #7a838b;
}

.dog-profile-fact-value {
  min-width: 0;
  font-size: 23rpx;
  font-weight: 700;
  color: #25282b;
  word-break: keep-all;
}

.dog-feeding-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  padding: 16rpx 10rpx;
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

.feeding-adjustment-note {
  padding: 16rpx 18rpx;
  border-radius: 8rpx;
  background-color: #f6fbf7;
  border: 1rpx solid #d9f0dd;
  font-size: 24rpx;
  line-height: 1.6;
  color: #496052;
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

.custom-tag {
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
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
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

.warning-actions {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 14rpx;
}

.btn-switch-stage,
.btn-continue {
  width: 100%;
  padding: 16rpx;
  margin: 0;
  line-height: 1.2;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;
}

.btn-switch-stage {
  background-color: #2f8f4e;
  color: #fff;
}

.btn-continue {
  background-color: #e5a23c;
  color: #fff;
}

.btn-secondary-full {
  width: 100%;
  height: 76rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
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
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
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

.source-plan-price {
  font-size: 28rpx;
  font-weight: 800;
  color: #e6543f;
}

.source-plan-card.compact .source-plan-price {
  font-size: 25rpx;
  line-height: 1.25;
}

.source-plan-safety-copy {
  display: block;
  margin-top: 16rpx;
  padding: 18rpx;
  border-radius: 8rpx;
  background: #fff7ef;
  color: #7a5b43;
  font-size: 24rpx;
  line-height: 1.45;
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

.ingredient-summary-note {
  font-size: 23rpx;
  color: #687078;
  line-height: 1.45;
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

.ingredient-list-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.ingredient-list-title-text {
  font-size: 28rpx;
  font-weight: 800;
  color: #25282b;
  line-height: 1.35;
}

.ingredient-row-compact {
  padding: 22rpx 0;
  border-bottom: 1rpx solid #eef0f2;
}

.ingredient-row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18rpx;
  align-items: flex-start;
}

.ingredient-name-cell,
.ingredient-name,
.ingredient-meta-row,
.ingredient-meta-item,
.ingredient-amount {
  min-width: 0;
}

.ingredient-name-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 6rpx;
  line-height: 1.35;
}

.ingredient-type-tag {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 4rpx 7rpx;
  border-radius: 6rpx;
  font-size: 19rpx;
  font-weight: 700;
  line-height: 1.2;
}

.ingredient-type-tag.food {
  color: #257b43;
  background-color: #e7f6eb;
}

.ingredient-type-tag.supplement {
  color: #526173;
  background-color: #edf2f7;
}

.ingredient-name {
  flex: 1 1 180rpx;
  overflow: visible;
  white-space: normal;
  text-overflow: clip;
  font-size: 26rpx;
  font-weight: 800;
  color: #25282b;
  line-height: 1.35;
  word-break: break-all;
}

.ingredient-meta-row {
  display: flex;
  flex-wrap: wrap;
  column-gap: 18rpx;
  row-gap: 6rpx;
  margin-top: 10rpx;
  color: #687078;
  line-height: 1.42;
}

.ingredient-meta-item {
  font-size: 23rpx;
  white-space: normal;
  word-break: break-all;
}

.ingredient-meta-label {
  color: #8b949e;
  margin-right: 6rpx;
}

.ingredient-amount {
  min-width: 92rpx;
  text-align: right;
  font-size: 26rpx;
  color: #25282b;
  font-weight: 800;
  line-height: 1.35;
  white-space: nowrap;
}

.explanation-card-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.product-explanation-card {
  display: flex;
  gap: 18rpx;
  padding: 22rpx;
  border-radius: 8rpx;
  background-color: #f8fafc;
  border: 1rpx solid #e8edf2;
}

.product-explanation-logistics-card {
  flex-direction: column;
  gap: 14rpx;
}

.product-explanation-storage-card,
.product-explanation-cooking-card,
.product-explanation-plain-card {
  flex-direction: column;
  gap: 14rpx;
}

.product-explanation-logistics-title {
  margin-bottom: 0;
}

.product-explanation-storage-note {
  display: block;
  margin-top: -4rpx;
  font-size: 24rpx;
  color: #687078;
  line-height: 1.5;
}

.product-explanation-storage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10rpx;
}

.product-explanation-storage-item {
  min-width: 0;
  min-height: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 18rpx 10rpx;
  border-radius: 8rpx;
  border: 1rpx solid #e4ebf0;
  background-color: #fbfcfd;
  text-align: center;
}

.product-explanation-storage-item.highlight {
  border-color: #f0d4a1;
  background-color: #fff9ed;
}

.product-explanation-storage-temp {
  display: block;
  margin-bottom: 10rpx;
  font-size: 30rpx;
  font-weight: 800;
  color: #2f8f4e;
  line-height: 1.2;
}

.product-explanation-storage-item.highlight .product-explanation-storage-temp {
  color: #a76416;
}

.product-explanation-storage-title {
  display: block;
  margin-bottom: 8rpx;
  font-size: 24rpx;
  font-weight: 800;
  color: #25282b;
  line-height: 1.25;
}

.product-explanation-storage-copy {
  display: block;
  font-size: 21rpx;
  color: #687078;
  line-height: 1.45;
}

.product-explanation-cooking-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.product-explanation-cooking-item {
  display: grid;
  grid-template-columns: 112rpx minmax(0, 1fr);
  gap: 16rpx;
  padding: 18rpx;
  border-radius: 8rpx;
  border: 1rpx solid #e4ebf0;
  background-color: #fbfcfd;
}

.product-explanation-cooking-label {
  min-height: 102rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8rpx;
  font-size: 26rpx;
  font-weight: 800;
  line-height: 1.25;
  text-align: center;
}

.product-explanation-cooking-item.recommend .product-explanation-cooking-label {
  background-color: #ecf8ef;
  color: #2f8f4e;
}

.product-explanation-cooking-item.avoid .product-explanation-cooking-label {
  background-color: #fff2ef;
  color: #c74b35;
}

.product-explanation-cooking-copy {
  min-width: 0;
}

.product-explanation-cooking-title {
  display: block;
  margin-bottom: 10rpx;
  font-size: 27rpx;
  font-weight: 800;
  color: #25282b;
  line-height: 1.35;
}

.product-explanation-cooking-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 10rpx;
}

.product-explanation-cooking-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6rpx 12rpx;
  border-radius: 6rpx;
  background-color: #f2f6f4;
  color: #2f633f;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1.2;
}

.product-explanation-cooking-item.avoid .product-explanation-cooking-tag {
  background-color: #fff6f4;
  color: #a33d28;
}

.product-explanation-cooking-line {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #687078;
  line-height: 1.55;
}

.product-explanation-media {
  flex: 0 0 148rpx;
  height: 116rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8rpx;
  background-color: #eef6ff;
  color: #2566a8;
}

.product-explanation-media.video {
  background-color: #fff5e8;
  color: #a76416;
}

.product-explanation-media-label {
  padding: 0 12rpx;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.product-explanation-media-stack {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.product-explanation-package-image {
  width: 100%;
  height: 72rpx;
  border-radius: 8rpx;
  background-color: #f1f5f9;
}

.product-explanation-logistics-visual {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 16rpx;
  border-radius: 8rpx;
  background: linear-gradient(180deg, #f7fafc 0%, #eef3f6 100%);
}

.product-explanation-package-frame {
  width: 100%;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8rpx;
  background-color: #fff;
  border: 1rpx solid #e4ebf0;
}

.product-explanation-logistics-package-image {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.product-explanation-shipping-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 14rpx;
  border-radius: 8rpx;
  background-color: #fff;
  border: 1rpx solid #e6edf5;
}

.product-explanation-shipping-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.product-explanation-shipping-logo-large {
  width: 112rpx;
  height: 42rpx;
  flex: 0 0 112rpx;
}

.product-explanation-shipping-copy {
  flex: 1;
  min-width: 0;
}

.product-explanation-shipping-title,
.product-explanation-shipping-subtitle {
  display: block;
  line-height: 1.35;
}

.product-explanation-shipping-title {
  font-size: 26rpx;
  font-weight: 800;
  color: #25282b;
}

.product-explanation-shipping-subtitle {
  margin-top: 2rpx;
  font-size: 22rpx;
  color: #687078;
}

.product-explanation-shipping-pill {
  margin-left: auto;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background-color: #edf6ff;
  color: #2566a8;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.product-explanation-shipping-company {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.product-explanation-shipping-logo {
  width: 42rpx;
  height: 28rpx;
  flex: 0 0 42rpx;
}

.product-explanation-shipping-text {
  flex: 1;
  min-width: 0;
  font-size: 20rpx;
  font-weight: 700;
  color: #2566a8;
}

.product-explanation-copy {
  flex: 1;
  min-width: 0;
}

.product-explanation-title,
.product-explanation-point {
  display: block;
}

.product-explanation-point {
  margin-top: 10rpx;
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
  justify-content: space-between;
  gap: 18rpx;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background-color: rgba(255, 255, 255, 0.98);
  box-shadow: 0 -8rpx 28rpx rgba(18, 24, 31, 0.08);
}

.bottom-price {
  min-width: 0;
  max-width: calc(100% - 470rpx);
  margin-left: auto;
  margin-right: 0;
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  text-align: right;
}

.bottom-total {
  max-width: 100%;
  font-size: 36rpx;
  color: #e6543f;
  font-weight: 800;
  line-height: 1.15;
  text-align: right;
}

.bottom-estimate {
  max-width: 100%;
  font-size: 23rpx;
  color: #687078;
  line-height: 1.3;
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2rpx;
}

.bottom-price-per-package {
  max-width: 100%;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.btn-buy-now {
  width: 240rpx;
  flex-shrink: 0;
  margin: 0;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 40rpx;
  box-sizing: border-box;
  padding: 0 18rpx;
  background-color: #1890ff;
  color: #fff;
  font-size: 26rpx;
  line-height: 1;
  white-space: nowrap;
  font-weight: 700;
  border: none;
}

.btn-buy-now[disabled] {
  background-color: #d8dde3;
  color: #fff;
}

</style>
