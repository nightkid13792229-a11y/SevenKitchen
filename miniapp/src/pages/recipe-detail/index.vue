<template>
  <view class="recipe-detail-page" :class="{ 'has-reference-price': !!displayReferencePrice }">
    <!-- 首次加载骨架屏 -->
    <view v-if="showDetailSkeleton" class="detail-skeleton">
      <view class="skeleton-cover"></view>
      <view class="skeleton-body">
        <view class="skeleton-line skeleton-line--title"></view>
        <view class="skeleton-line skeleton-line--price"></view>
        <view class="skeleton-line skeleton-line--text"></view>
        <view class="skeleton-block"></view>
        <view class="skeleton-block"></view>
      </view>
    </view>

    <!-- 加载失败（可重试） -->
    <view v-else-if="showDetailError" class="detail-error">
      <text class="detail-error-title">食谱加载失败</text>
      <text class="detail-error-copy">请检查网络后重试</text>
      <button class="detail-error-btn" @tap="retryLoadDetail">重新加载</button>
    </view>

    <!-- 正文 -->
    <block v-else>
    <view v-if="detailRefreshing" class="detail-refreshing-bar">
      <text class="detail-refreshing-text">正在更新…</text>
    </view>

    <!-- 封面静态图 -->
    <view class="cover-section">
      <image
        v-if="recipe.coverImageUrl"
        :src="normalizeImageUrl(recipe.coverImageUrl)"
        mode="aspectFill"
        class="cover-image"
        @tap="previewImage"
      />
      <view v-else class="cover-placeholder">
        <text class="placeholder-text">{{ recipe.name.charAt(0) }}</text>
      </view>
      <view
        v-if="recipe.coverImageUrl && resolveCoverBadgeText(recipe)"
        class="recipe-detail-cover-badge-gradient"
      >
        <text class="recipe-detail-cover-title-badge">{{ resolveCoverBadgeText(recipe) }}</text>
      </view>
    </view>

    <!-- 基础信息区 -->
    <view class="info-section">
      <view v-if="isNonPublicRecipe" class="internal-preview-bar">
        <text class="internal-preview-text">内部预览版本，尚未对外发布</text>
      </view>

      <text class="recipe-name">{{ recipe.name }}</text>

      <!-- 一句话卖点（AI 生成 + 人工确认的合规文案） -->
      <view v-if="recipe.sellingPoint" class="recipe-selling-point">
        <text class="recipe-selling-point-text">{{ recipe.sellingPoint }}</text>
      </view>

      <!-- 参考价统一只在底部固定栏展示；此处仅在拿不到价格时说明价格如何获得，避免信息真空 -->
      <view v-if="showPriceFallbackCopy" class="price-hint">
        <text class="price-hint-text">价格按狗狗体重计算，进入订购可见</text>
      </view>

      <view v-if="showNoDogHint" class="no-dog-hint">
        <text class="no-dog-hint-text">订购前需先创建狗狗档案，才能按体重精确计算份量与价格</text>
        <button class="no-dog-hint-btn" @tap="goCreateDog">一键建档</button>
      </view>

      <view
        v-if="dogs.length > 0"
        class="recipe-detail-dog-selector"
      >
        <scroll-view scroll-x class="recipe-detail-dog-scroll">
          <view class="recipe-detail-dog-chip-row">
            <view
              v-for="dog in dogs"
              :key="dog.id"
              :class="['recipe-detail-dog-chip', { active: dog.id === selectedDogId }]"
              @tap="selectDogForDetail(dog.id)"
            >
              <image
                class="recipe-detail-dog-avatar"
                :src="resolveDogAvatarSrc(dog.avatarUrl)"
                mode="aspectFill"
              />
              <text class="recipe-detail-dog-chip-name">{{ dog.name }}</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!--
        生命阶段版本卡。
        2026-09-19 精简：去掉"通俗补充说明"与"本品可选"两行 ——
        它们不构成决策依据，只会把这一块撑长、稀释真正重要的"匹配与否"。
        未匹配时（人工指定错版本 / 无完全匹配版本）整卡转为警示色，
        用颜色本身承担提示，而不是靠再堆一行文字。
      -->
      <view
        v-if="recipe.selectedLifeStage || recipe.availableLifeStageVersions?.length"
        class="life-stage-version-card"
        :class="{ 'life-stage-version-card--mismatch': isLifeStageMismatch }"
        @tap="openLifeStageSelector"
      >
        <view class="life-stage-version-main">
          <view class="life-stage-version-head">
            <text v-if="isLifeStageMismatch" class="life-stage-version-warn">!</text>
            <text class="life-stage-version-title">{{ lifeStageVersionTitle }}</text>
          </view>
          <text class="life-stage-version-copy">
            {{ lifeStageVersionCopy }}
          </text>
        </view>
        <text v-if="recipe.availableLifeStageVersions?.length" class="life-stage-version-action">
          切换
        </text>
      </view>

      <text v-if="recipe.description" class="recipe-description">
        {{ recipe.description }}
      </text>
    </view>

    <!-- 食谱配方：主料与营养补充剂分表展示（口径不同，避免同一列混用） -->
    <view class="ingredients-card">
      <view class="card-header">
        <text class="card-title">食谱配方</text>
        <text class="card-subtitle">共 {{ recipe.items.length }} 项原料</text>
      </view>

      <!-- 食材表 -->
      <view v-if="foodItems.length > 0" class="ingredient-block">
        <view class="ingredient-table-header">
          <text class="header-name">食材</text>
          <text class="header-method">制备方法</text>
          <text class="header-ratio">占比</text>
        </view>
        <view
          v-for="item in foodItems"
          :key="item.ingredientId"
          class="ingredient-item"
        >
          <view class="ingredient-name">
            <text>{{ item.name }}</text>
            <text v-if="item.nutritionStateLabel" class="nutrition-state-tag">
              {{ item.nutritionStateLabel }}
            </text>
          </view>
          <view class="preparation-method">
            <text v-if="item.preparationMethod" class="method-text">{{ item.preparationMethod }}</text>
            <text v-else class="method-text">-</text>
          </view>
          <text class="ingredient-ratio">{{ formatFoodRatio(item) }}</text>
        </view>
      </view>

      <!-- 营养补充剂表（独立底色，与食材表区分） -->
      <view v-if="supplementItems.length > 0" class="ingredient-block ingredient-block--supplement">
        <view class="ingredient-block-header">
          <text class="ingredient-block-title">营养补充剂</text>
          <text class="ingredient-block-count">{{ supplementItems.length }} 种</text>
        </view>
        <view
          v-for="item in supplementItems"
          :key="item.ingredientId"
          class="ingredient-item ingredient-item--supplement"
        >
          <view class="ingredient-name">
            <text>{{ item.name }}</text>
            <text v-if="item.nutritionStateLabel" class="nutrition-state-tag">
              {{ item.nutritionStateLabel }}
            </text>
            <text v-if="item.preparationMethod" class="supplement-method">
              {{ item.preparationMethod }}
            </text>
          </view>
          <text class="ingredient-ratio nutrient-target-value">
            {{ getNutrientTargetText(item) || '-' }}
          </text>
        </view>
      </view>

      <!-- 其他物料（包材等，无营养口径） -->
      <view v-if="otherItems.length > 0" class="ingredient-block">
        <view class="ingredient-block-header">
          <text class="ingredient-block-title">其他物料</text>
          <text class="ingredient-block-count">{{ otherItems.length }} 种</text>
        </view>
        <view class="ingredient-table-header">
          <text class="header-name">物料</text>
          <text class="header-method">制备方法</text>
          <text class="header-ratio">占比</text>
        </view>
        <view
          v-for="item in otherItems"
          :key="item.ingredientId"
          class="ingredient-item"
        >
          <view class="ingredient-name">
            <text>{{ item.name }}</text>
          </view>
          <view class="preparation-method">
            <text v-if="item.preparationMethod" class="method-text">{{ item.preparationMethod }}</text>
            <text v-else class="method-text">-</text>
          </view>
          <text class="ingredient-ratio">{{ formatFoodRatio(item) }}</text>
        </view>
      </view>
    </view>

    <!-- 营养标准背书（结论式 + 可展开说明） -->
    <view class="standard-card" @tap="toggleStandardExplain">
      <view class="standard-main">
        <text class="standard-badge">✓</text>
        <view class="standard-copy">
          <text class="standard-title">符合 {{ getNutritionStandardLabel(recipe.nutritionStandard) }}</text>
          <text class="standard-sub">犬营养标准</text>
        </view>
      </view>
      <text class="standard-toggle">{{ standardExplainVisible ? '收起' : '说明' }}</text>
    </view>
    <view v-if="standardExplainVisible" class="standard-explain">
      <text class="standard-explain-text">{{ nutritionStandardExplain }}</text>
    </view>

    <!-- 核心营养成分 -->
    <view class="nutrition-panel" v-if="recipe.nutritionDetailedData">
      <view class="card-header">
        <text class="card-title">核心营养成分</text>
      </view>

      <view class="nutrition-grid">
        <view class="nutrition-item-small">
          <text class="nutrition-label">蛋白质</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.proteinPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
            <text class="nutrition-basis">（DM）</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">脂肪</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.fatPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
            <text class="nutrition-basis">（DM）</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">灰分</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.ashPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
            <text class="nutrition-basis">（DM）</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">含水量</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.moisturePercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">膳食纤维</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.crudeFiberPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
            <text class="nutrition-basis">（DM）</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">碳水</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.carbohydratePercent) }}
            </text>
            <text class="nutrition-unit">%</text>
            <text class="nutrition-basis">（DM）</text>
          </view>
        </view>

        <view class="nutrition-item-small highlight-energy">
          <text class="nutrition-label">能量密度</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatEnergyDensity(recipe.energyDensityKcalPerKg || recipe.nutritionDetailedData?.energyDensityKcalPerKg) }}
            </text>
            <text class="nutrition-unit">kcal/kg</text>
          </view>
        </view>

        <view class="nutrition-item-small highlight-ratio">
          <text class="nutrition-label">钙磷比</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatCalciumPhosphorusRatio(recipe.nutritionDetailedData.calciumPhosphorusRatio) }}
            </text>
          </view>
        </view>
      </view>

      <text class="nutrition-basis-note">以上营养指标按干物质（DM）计，即去除水分后的占比；含水量为实际含水率。</text>
    </view>

    <!-- 详细营养报告入口 -->
    <view
      v-if="hasStructuredNutritionReport"
      class="nutrition-report-card"
      @tap="openNutritionReportPage"
    >
      <view class="report-icon">营养</view>
      <view class="report-copy">
        <text class="report-title">详细营养报告</text>
        <text class="report-subtitle">查看 Setar 生成的完整营养评估</text>
      </view>
      <text class="report-action">查看完整报告</text>
    </view>

    <!-- 用户评价板块（写评价入口收进标题行，提升可见性） -->
    <ReviewList ref="reviewListRef" :recipe-id="selectedRecipeIdForActions">
      <template #action>
        <button class="btn-write-review" @tap="openReviewForm">
          写评价
        </button>
      </template>
    </ReviewList>

    <!-- 评论表单弹窗 -->
    <ReviewForm
      v-model:visible="showReviewForm"
      :recipe-id="selectedRecipeIdForActions"
      @submitted="onReviewSubmitted"
    />

    <!-- 底部操作按钮 -->
    <view class="bottom-actions">
      <!-- 参考价条（接口未就绪时不展示） -->
      <view v-if="displayReferencePrice" class="reference-price-strip">
        <view class="reference-price-copy">
          <text class="reference-price-value">
            约¥{{ formatReferencePrice(displayReferencePrice.amount) }}/100g{{
              displayReferencePrice.isMin ? '起' : ''
            }}
          </text>
          <text class="reference-price-note">
            {{ displayReferencePrice.isMin ? '按狗狗体重精确计算最终价格 · 已含冷链配送' : '已含冷链配送' }}
          </text>
        </view>
      </view>

      <view class="bottom-actions-row">
        <view class="quick-actions">
          <button
            class="quick-action btn-favorite"
            :class="{ active: isFavorite }"
            @tap="toggleFavorite"
          >
            <image
              class="favorite-icon"
              :src="isFavorite ? '/static/ui-icons/favorite-filled.png' : '/static/ui-icons/favorite-outline.png'"
              mode="aspectFit"
            />
            <text class="quick-label">收藏</text>
          </button>
        </view>

        <view class="action-buttons">
          <button class="btn-diy" @tap="generateDiySheet">
            自己做
          </button>

          <button class="btn-order" @tap="goToOrder">
            买成品
          </button>
        </view>
      </view>
    </view>

    <view
      v-if="lifeStageSelectorVisible"
      class="life-stage-sheet-mask"
      @tap="closeLifeStageSelector"
    >
      <view class="life-stage-sheet" @tap.stop>
        <view class="life-stage-sheet-header">
          <text class="life-stage-sheet-title">切换生命阶段版本</text>
          <text class="life-stage-sheet-close" @tap="closeLifeStageSelector">×</text>
        </view>
        <view
          v-for="version in recipe.availableLifeStageVersions"
          :key="version.recipeId || version.lifeStage"
          :class="['life-stage-version-option', { active: isLifeStageVersionSelected(version) }]"
          @tap="selectLifeStageVersion(version)"
        >
          <view class="life-stage-version-option-main">
            <text class="life-stage-version-option-title">
              {{ version.label || getLifeStageLabel(version.lifeStage) }}
            </text>
            <text v-if="version.description" class="life-stage-version-option-copy">
              {{ version.description }}
            </text>
          </view>
          <view class="life-stage-version-option-side">
            <text
              v-if="getVersionReferencePrice(version)"
              class="life-stage-version-option-price"
            >约¥{{ formatReferencePrice(getVersionReferencePrice(version)) }}/100g</text>
            <text v-if="isLifeStageVersionSelected(version)" class="life-stage-version-selected">
              当前
            </text>
          </view>
        </view>
      </view>
    </view>
    </block>
  </view>
</template>

<!-- 普通script：定义分享函数 -->
<script lang="ts">
import { CURRENT_SHARE_CONFIG } from '@/utils/config'

// 模块级变量，存储当前食谱信息
let currentRecipeName = ''
let currentRecipeCoverImageUrl = ''
let currentRecipeId = ''
let currentRecipeStatus = ''
let currentShareToken = ''

// 导出函数供setup调用
export function updateShareInfo(name: string, coverImageUrl: string, id: string, status?: string, shareToken?: string) {
  currentRecipeName = name
  currentRecipeCoverImageUrl = coverImageUrl
  currentRecipeId = id
  if (status) currentRecipeStatus = status
  if (shareToken) currentShareToken = shareToken
}

export default {
  onShareAppMessage() {
    // 动态生成标题
    const title = currentRecipeName
      ? `${currentRecipeName} | 赛文的食堂`
      : '精选食谱 | 赛文的食堂'

    // 动态选择图片：优先使用食谱封面图，否则使用默认食谱图
    const imageUrl = currentRecipeCoverImageUrl || CURRENT_SHARE_CONFIG.recipeImageUrl

    // 动态生成路径：非公开食谱附带shareToken
    const encodedRecipeId = encodeURIComponent(currentRecipeId)
    const encodedShareToken = encodeURIComponent(currentShareToken)
    let path = currentRecipeId
      ? `/pages/recipe-detail/index?recipeId=${encodedRecipeId}`
      : '/pages/home/index'

    // 非公开食谱分享时附带shareToken
    if (currentRecipeId && currentRecipeStatus !== 'PUBLIC' && currentShareToken) {
      path = `/pages/recipe-detail/index?recipeId=${encodedRecipeId}&shareToken=${encodedShareToken}`
    }

    const config = { title, imageUrl, path }

    return config
  },
  onShareTimeline() {
    // 动态生成标题
    const title = currentRecipeName
      ? `${currentRecipeName} | 赛文的食堂`
      : '精选食谱 | 赛文的食堂'

    // 动态选择图片：优先使用食谱封面图，否则使用默认食谱图
    const imageUrl = currentRecipeCoverImageUrl || CURRENT_SHARE_CONFIG.recipeImageUrl

    const config = { title, imageUrl }

    return config
  }
}
</script>

<!-- Setup script：业务逻辑 -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request, addFavorite, removeFavorite, checkFavorite, createRecipeShareToken, reviewApi, trackRecipeView } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import { trackFunnelEvent } from '../../utils/funnel'
import { resolveCoverBadgeText } from '../../utils/cover-badge'
import { getNutritionStandardExplain, getLifeStageLabel } from '../../utils/label-mapping'
import { formatSupplementTargets } from '../../utils/supplement-nutrients'
import ReviewList from '../../components/ReviewList.vue'
import ReviewForm from '../../components/ReviewForm.vue'

interface RecipeItem {
  ingredientId: string
  name: string
  nutritionFoodId?: string
  nutritionState?: string
  nutritionStateLabel?: string
  preparationMethod?: string
  ratio?: number  // 食材类型才有此字段
  sortOrder: number
  nutrientTargetKey?: string  // 补剂类型才有此字段
  nutrientTargetValue?: number  // 补剂类型才有此字段
  supplementTargets?: any[]
  ingredientType?: string
  properties?: any
}

interface NutritionDetailedData {
  energyDensityKcalPerKg?: number
  proteinPercent?: number
  fatPercent?: number
  ashPercent?: number
  moisturePercent?: number
  crudeFiberPercent?: number
  carbohydratePercent?: number
  calciumPhosphorusRatio?: string
  source?: string
  schemaVersion?: number
  standard?: string
  scenario?: string
  report?: SetarNutritionReport
}

interface SetarNutritionReport {
  ingredientRows?: Array<Record<string, any>>
  macroRows?: Array<Record<string, any>>
  energyDensityRows?: Array<Record<string, any>>
  nutrientSections?: Record<string, SetarNutrientSection>
}

interface SetarNutrientSection {
  key: string
  title: string
  dryMatterHeader: string
  rows: Array<Record<string, any>>
}

interface RecipeDetail {
  id: string
  seriesId?: string
  selectedRecipeId?: string
  selectedLifeStage?: string
  selectedLifeStageLabel?: string
  lifeStageMatch?: RecipeLifeStageMatch
  availableLifeStageVersions?: RecipeLifeStageVersion[]
  version: number
  name: string
  status: string
  coverImageUrl?: string
  coverTitle?: string
  /** 系列级封面角标（合规词表，最多 2 个） */
  coverBadges?: string[]
  description?: string
  /** 一句话卖点（合规文案，AI 生成 + 人工确认） */
  sellingPoint?: string
  nutritionStandard: string
  designSource?: string
  energyDensityKcalPerKg: number
  targetHealthTags: string[]
  applicableLifeStages: string[]
  nutritionDetailedData?: NutritionDetailedData
  items: RecipeItem[]
}

interface RecipeLifeStageVersion {
  recipeId?: string
  lifeStage: string
  label?: string
  description?: string
  status?: string
  isSelected?: boolean
  selected?: boolean
}

interface RecipeLifeStageMatch {
  status?: string
  matchType?: string
  matched?: boolean
  dogId?: string
  matchedDogId?: string
  dogName?: string
  dogLifeStage?: string
  dogLifeStageLabel?: string
  lifeStage?: string
  lifeStageLabel?: string
  message?: string
}

const recipe = ref<RecipeDetail>({
  id: '',
  seriesId: undefined,
  selectedRecipeId: undefined,
  selectedLifeStage: undefined,
  selectedLifeStageLabel: undefined,
  lifeStageMatch: undefined,
  availableLifeStageVersions: [],
  version: 1,
  name: '',
  status: '',
  coverImageUrl: undefined,
  coverTitle: undefined,
  description: undefined,
  nutritionStandard: 'FEDIAF_2021',
  designSource: undefined,
  energyDensityKcalPerKg: 0,
  targetHealthTags: [],
  applicableLifeStages: [],
  nutritionDetailedData: undefined,
  items: []
})

const isFavorite = ref(false)
const recipeId = ref('')
const shareToken = ref('')
const dogId = ref<string | null>(null)
const dogs = ref<any[]>([])
const dogsLoaded = ref(false)
const selectedDogId = ref('')
const initialDogId = ref('')
const showReviewForm = ref(false)
const reviewListRef = ref<InstanceType<typeof ReviewList> | null>(null)
const selectedManualLifeStage = ref('')
const lifeStageSelectorVisible = ref(false)
const standardExplainVisible = ref(false)
const detailLoading = ref(true)
const detailRefreshing = ref(false)
const detailLoadFailed = ref(false)
const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'
let recipeDetailRequestSeq = 0

// 参考价（每100g、已含运费）：由后端参考价接口自动计算，接口未就绪时留空不展示
interface RecipeReferencePriceEntry {
  recipeId: string
  lifeStage: string
  pricePer100g: number
}
interface RecipeReferencePriceData {
  lifeStagePrices: RecipeReferencePriceEntry[]
  minPricePer100g: number
}
const referencePriceData = ref<RecipeReferencePriceData | null>(null)
const referencePriceLoading = ref(true)

// 原料排序（按sortOrder升序）
const sortedItems = computed(() => {
  return [...recipe.value.items].sort((a, b) => a.sortOrder - b.sortOrder)
})

// 配方分组：主料按"占比"口径，补剂按"每kg食材添加量"口径，分开成两张表
const foodItems = computed(() =>
  sortedItems.value.filter((item) => item.ingredientType === 'FOOD'))
const supplementItems = computed(() =>
  sortedItems.value.filter((item) => item.ingredientType === 'SUPPLEMENT'))
const otherItems = computed(() =>
  sortedItems.value.filter(
    (item) => item.ingredientType !== 'FOOD' && item.ingredientType !== 'SUPPLEMENT',
  ))

const hasStructuredNutritionReport = computed(() => {
  const report = recipe.value.nutritionDetailedData?.report
  return Boolean(
    report &&
      ((report.macroRows && report.macroRows.length > 0) ||
        Object.values(report.nutrientSections || {}).some(
          (section: any) => Array.isArray(section?.rows) && section.rows.length > 0,
        )),
  )
})

const selectedDog = computed(() => {
  return dogs.value.find((dog) => dog.id === selectedDogId.value) || null
})

// 首次加载骨架屏 / 失败重试态
const showDetailSkeleton = computed(() => detailLoading.value && !recipe.value.id)
const showDetailError = computed(() => detailLoadFailed.value && !recipe.value.id)

function retryLoadDetail() {
  detailLoadFailed.value = false
  detailLoading.value = true
  loadRecipeDetail()
}

// 非公开食谱（员工预览 / 分享链接）：给内部人员一个低调提示，避免误以为已上线
const isNonPublicRecipe = computed(() => {
  const status = recipe.value.status
  return Boolean(status) && status !== 'PUBLIC'
})

// 参考价区域：加载中不展示兜底文案，避免闪现；无数据时降级为说明文案
const showPriceFallbackCopy = computed(
  () => Boolean(recipe.value.id) && !referencePriceLoading.value && !displayReferencePrice.value,
)

// 已登录但未建档：在详情页提前预告，避免进入订购配置页才被拦下
const showNoDogHint = computed(() => dogsLoaded.value && dogs.value.length === 0)

// 当前生效的生命阶段版本（对应食谱ID）
const activeLifeStageVersionRecipeId = computed(() => {
  const selectedStage = recipe.value.selectedLifeStage
  if (!selectedStage) return ''
  const version = recipe.value.availableLifeStageVersions?.find(
    (v) => v.lifeStage === selectedStage,
  )
  return version?.recipeId || ''
})

// 展示参考价：有生效版本价则展示该价；否则展示全阶段最低价（加"起"）
const displayReferencePrice = computed(() => {
  const data = referencePriceData.value
  if (!data) return null

  const activeRecipeId = activeLifeStageVersionRecipeId.value
  if (activeRecipeId) {
    const entry = data.lifeStagePrices.find((item) => item.recipeId === activeRecipeId)
    if (entry && Number.isFinite(entry.pricePer100g)) {
      return { amount: entry.pricePer100g, isMin: false }
    }
  }

  if (Number.isFinite(data.minPricePer100g)) {
    return { amount: data.minPricePer100g, isMin: true }
  }

  return null
})

function getVersionReferencePrice(version: { recipeId?: string; lifeStage: string }): number | null {
  const data = referencePriceData.value
  if (!data) return null

  const entry = data.lifeStagePrices.find(
    (item) => item.recipeId === version.recipeId || (!version.recipeId && item.lifeStage === version.lifeStage),
  )
  if (entry && Number.isFinite(entry.pricePer100g)) {
    return entry.pricePer100g
  }

  return null
}

function formatReferencePrice(amount: number): string {
  return Number(amount).toFixed(2)
}

// 拉取食谱参考价（每100g、已含运费），失败时静默降级
async function loadRecipeReferencePrice() {
  if (!recipeId.value) return

  referencePriceLoading.value = true

  try {
    const res: any = await request({
      url: `/recipes/${recipeId.value}/reference-price`,
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    })

    if (res?.code !== 0 || !res?.data) return

    const lifeStagePrices = Array.isArray(res.data.lifeStagePrices)
      ? res.data.lifeStagePrices
          .map((item: any) => ({
            recipeId: String(item?.recipeId || ''),
            lifeStage: String(item?.lifeStage || ''),
            pricePer100g: Number(item?.pricePer100g),
          }))
          .filter((item: RecipeReferencePriceEntry) =>
            Number.isFinite(item.pricePer100g))
      : []

    const minPricePer100g = Number(res.data.minPricePer100g)
    if (lifeStagePrices.length === 0 && !Number.isFinite(minPricePer100g)) return

    referencePriceData.value = { lifeStagePrices, minPricePer100g }
  } catch (error) {
    console.warn('[RecipeDetail] Load reference price failed:', error)
  } finally {
    referencePriceLoading.value = false
  }
}

const selectedRecipeIdForActions = computed(() => {
  return recipe.value.selectedRecipeId || recipe.value.id || recipeId.value
})

const selectedLifeStageLabel = computed(() => {
  if (recipe.value.selectedLifeStageLabel) return recipe.value.selectedLifeStageLabel
  if (recipe.value.lifeStageMatch?.lifeStageLabel) return recipe.value.lifeStageMatch.lifeStageLabel
  const selectedStage = recipe.value.selectedLifeStage || recipe.value.lifeStageMatch?.lifeStage || ''
  if (!selectedStage) return ''
  const matchedVersion = recipe.value.availableLifeStageVersions?.find(
    (version) => version.lifeStage === selectedStage,
  )
  return matchedVersion?.label || getLifeStageLabel(selectedStage)
})

const hasDogSpecificLifeStageMatch = computed(() => {
  const match = recipe.value.lifeStageMatch
  return Boolean(
    match?.dogId ||
      match?.matchedDogId ||
      match?.dogLifeStage ||
      match?.dogName,
  )
})

const isCurrentLifeStageMatched = computed(() => {
  const match = recipe.value.lifeStageMatch
  return Boolean(
    hasDogSpecificLifeStageMatch.value &&
      (
        match?.matched === true ||
        match?.status === 'MATCHED' ||
        match?.matchType === 'MATCHED'
      ),
  )
})

const isLifeStageFallbackSelection = computed(() => {
  const matchType = recipe.value.lifeStageMatch?.matchType
  return matchType === 'FALLBACK_ADULT' || matchType === 'FALLBACK_FIRST'
})

/**
 * 当前展示的生命阶段版本是否"与狗狗不匹配"。
 *
 * 后端 matchType 取值：MATCHED / MANUAL_MISMATCH / FALLBACK_ADULT / FALLBACK_FIRST / LEGACY。
 * 其中三种都属于"不匹配"，此前只有 FALLBACK_* 会被提示，
 * MANUAL_MISMATCH（人工指定了不匹配的版本）完全没有视觉区分 —— 这里统一起来。
 */
const isLifeStageMismatch = computed(() => {
  const matchType = recipe.value.lifeStageMatch?.matchType
  return (
    matchType === 'MANUAL_MISMATCH' ||
    matchType === 'FALLBACK_ADULT' ||
    matchType === 'FALLBACK_FIRST'
  )
})

const hasResolvedLifeStageMatch = computed(() => {
  const match = recipe.value.lifeStageMatch
  return Boolean(
    match &&
      (
        match.matched !== undefined ||
        match.status ||
        match.matchType
      ),
  )
})

const lifeStageVersionTitle = computed(() => {
  const label = selectedLifeStageLabel.value || '当前版本'
  // 未匹配时不加前缀，避免"当前展示"这类冗余表述
  return isCurrentLifeStageMatched.value ? `已匹配：${label}` : label
})

const lifeStageVersionCopy = computed(() => {
  if (recipe.value.lifeStageMatch?.message) return recipe.value.lifeStageMatch.message

  // 不匹配时要说清"为什么"，否则顾客看到警示色却不知道问题出在哪
  if (isLifeStageMismatch.value) {
    return isLifeStageFallbackSelection.value
      ? '当前狗狗档案没有完全匹配版本，已展示可用替代版本。'
      : '当前展示的版本与狗狗的生命阶段不一致，建议切换后再下单。'
  }

  const matchedDogName = recipe.value.lifeStageMatch?.dogName || selectedDog.value?.name
  if (isCurrentLifeStageMatched.value && matchedDogName) {
    return `根据${matchedDogName}的档案自动展示该生命阶段版本。`
  }
  return '可切换查看该食谱已开放的生命阶段版本。'
})

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage.options?.recipeId || currentPage.options?.id || ''
  shareToken.value = currentPage.options?.shareToken || ''
  initialDogId.value = currentPage.options?.dogId || ''

  dogId.value = initialDogId.value || uni.getStorageSync('dogId') || null

  if (recipeId.value) {
    loadDogsForDetail()
    loadRecipeDetail()
  }
})

function loadRecipeDetail() {
  const currentRequestSeq = ++recipeDetailRequestSeq
  // 首次加载用骨架屏；已有内容时只显示区块级"更新中"，不再用全屏遮罩打断阅读
  const hasContent = Boolean(recipe.value.id)
  detailRefreshing.value = hasContent
  if (!hasContent) {
    detailLoading.value = true
  }

  // 构建请求参数：非公开食谱通过URL传入的shareToken传递给后端
  const data: any = {}
  if (shareToken.value) {
    data.shareToken = shareToken.value
  }
  const activeDogId = selectedDogId.value || dogId.value
  if (activeDogId) {
    data.dogId = activeDogId
  }
  if (selectedManualLifeStage.value) {
    data.lifeStage = selectedManualLifeStage.value
  }

  request({
    url: `/recipes/${recipeId.value}`,
    method: 'GET',
    data,
  }).then((res: any) => {
    if (currentRequestSeq !== recipeDetailRequestSeq) {
      return
    }

    if (res.code === 0 && res.data) {
      detailLoadFailed.value = false
      recipe.value = {
        ...res.data,
        id: res.data.selectedRecipeId || res.data.id,
        availableLifeStageVersions: res.data.availableLifeStageVersions || [],
      }
      // 拉取参考价（接口未就绪时静默降级，不展示价格）
      loadRecipeReferencePrice()
      const matchedDogId = res.data.lifeStageMatch?.dogId || res.data.lifeStageMatch?.matchedDogId
      syncSelectedDogFromMatch(matchedDogId)
      uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')
      const actionRecipeId = selectedRecipeIdForActions.value
      void trackRecipeView(actionRecipeId, shareToken.value).catch((error: any) => {
        console.warn('[RecipeDetail] Failed to track recipe view:', error)
      })

      // 更新分享信息（封面图URL需要经过normalizeImageUrl处理，确保分享卡片能正常加载）
      updateShareInfo(
        res.data.name || '',
        normalizeImageUrl(res.data.coverImageUrl) || '',
        actionRecipeId,
        res.data.status,
        shareToken.value,
      )

      // 非公开食谱：预生成分享令牌（仅登录员工可操作）
      if (res.data.status !== 'PUBLIC') {
        preGenerateShareToken()
      }

      // 只有登录时才检查收藏状态，避免显示"请先登录"提示
      const token = uni.getStorageSync('token')
      if (token) {
        checkFavoriteStatus()
      }

      // 漏斗：详情页浏览（漏斗第 2 步）
      trackFunnelEvent({
        eventName: 'detail_view',
        step: 'detail',
        recipeId: actionRecipeId,
        dogId: selectedDogId.value,
        entrySource: initialDogId.value ? 'with_dog' : 'no_dog',
        properties: { lifeStage: res.data.selectedLifeStage || null },
      })

    }
  }).catch((err: any) => {
    if (currentRequestSeq !== recipeDetailRequestSeq) return

    console.error('Load recipe error:', err)
    if (!recipe.value.id) {
      // 首次加载失败：给出可重试的失败态，而不是停在空白页
      detailLoadFailed.value = true
      return
    }
    // 已有内容时刷新失败：保留旧内容，仅提示
    uni.showToast({
      title: '更新失败，请稍后重试',
      icon: 'none'
    })
  }).finally(() => {
    if (currentRequestSeq === recipeDetailRequestSeq) {
      detailLoading.value = false
      detailRefreshing.value = false
      // 兜底关闭可能残留的全屏加载态
      uni.hideLoading()
    }
  })
}

async function preGenerateShareToken() {
  try {
    const result = await createRecipeShareToken(selectedRecipeIdForActions.value)
    if (result?.token) {
      shareToken.value = result.token
      // 更新分享信息中的token（封面图URL需要经过normalizeImageUrl处理）
      updateShareInfo(
        recipe.value.name || '',
        normalizeImageUrl(recipe.value.coverImageUrl) || '',
        selectedRecipeIdForActions.value,
        recipe.value.status,
        result.token
      )
    }
  } catch (error) {
    // 非员工用户可能无法生成令牌，静默失败
  }
}

async function loadDogsForDetail() {
  const token = uni.getStorageSync('token')
  if (!token) return

  try {
    const res: any = await request({
      url: '/dogs',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true
    })
    if (res.code === 0 && Array.isArray(res.data)) {
      dogs.value = res.data
      dogsLoaded.value = true
      if (dogs.value.length > 0) {
        selectedDogId.value = initialDogId.value || dogId.value || uni.getStorageSync('dogId') || dogs.value[0].id
        if (!dogs.value.some((dog) => dog.id === selectedDogId.value)) {
          selectedDogId.value = dogs.value[0].id
        }
        dogId.value = selectedDogId.value
        uni.setStorageSync('dogId', selectedDogId.value)
        loadRecipeDetail()
      }
    }
  } catch (error) {
    console.warn('[RecipeDetail] Load dogs failed:', error)
  }
}

function syncSelectedDogFromMatch(matchedDogId?: string | null) {
  if (!matchedDogId) return
  if (dogs.value.length > 0 && !dogs.value.some((dog) => dog.id === matchedDogId)) return
  selectedDogId.value = matchedDogId
  dogId.value = matchedDogId
  uni.setStorageSync('dogId', matchedDogId)
}

async function checkFavoriteStatus() {
  try {
    const result = await checkFavorite(selectedRecipeIdForActions.value)
    isFavorite.value = result.isFavorite
  } catch (error: any) {
    console.error('[RecipeDetail] Failed to check favorite status:', error)
    // 未登录或其他错误时，保持false状态，不显示错误提示
    isFavorite.value = false
  }
}

async function toggleFavorite() {
  // 检查是否登录
  const token = uni.getStorageSync('token')
  if (!token) {
    promptLoginAndRedirect('收藏需要登录，登录后继续为你保存收藏')
    return
  }

  try {
    if (isFavorite.value) {
      // 取消收藏
      await removeFavorite(selectedRecipeIdForActions.value)
      uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')
      isFavorite.value = false
      uni.showToast({
        title: '已取消收藏',
        icon: 'success'
      })
    } else {
      // 添加收藏
      await addFavorite(selectedRecipeIdForActions.value)
      uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')
      isFavorite.value = true
      uni.showToast({
        title: '已收藏',
        icon: 'success'
      })
    }
  } catch (error: any) {
    console.error('[RecipeDetail] Failed to toggle favorite:', error)
    // 如果是未授权错误，提示登录
    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('未授权')) {
      promptLoginAndRedirect('登录状态已失效，请重新登录')
    } else {
      uni.showToast({
        title: error.message || '操作失败',
        icon: 'none'
      })
    }
    // 如果失败，恢复原状态
    isFavorite.value = !isFavorite.value
  }
}

function previewImage() {
  if (!recipe.value.coverImageUrl) return

  const normalizedUrl = normalizeImageUrl(recipe.value.coverImageUrl)
  uni.previewImage({
    urls: [normalizedUrl],
    current: normalizedUrl
  })
}

function openNutritionReportPage() {
  const query = [`recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}`]
  if (shareToken.value) {
    query.push(`shareToken=${encodeURIComponent(shareToken.value)}`)
  }
  uni.navigateTo({
    url: `/pages/recipe-nutrition-report/index?${query.join('&')}`
  })
}

/** DIY 制作单配置页路由（登录后要直达的目标） */
function buildDiyRoute(): string {
  const query = [`recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}`]
  if (selectedDogId.value) {
    query.push(`dogId=${encodeURIComponent(selectedDogId.value)}`)
  }
  if (shareToken.value) {
    query.push(`shareToken=${encodeURIComponent(shareToken.value)}`)
  }
  return `/pages/recipe-diy/index?${query.join('&')}`
}

/** 成品订购配置页路由（登录后要直达的目标） */
function buildOrderRoute(): string {
  const query = [`recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}`]
  if (selectedDogId.value) {
    query.push(`dogId=${encodeURIComponent(selectedDogId.value)}`)
  }
  if (recipe.value.selectedLifeStage) {
    query.push(`lifeStage=${encodeURIComponent(recipe.value.selectedLifeStage)}`)
  }
  return `/pages/recipe-order/index?${query.join('&')}`
}

function generateDiySheet() {
  const target = buildDiyRoute()
  // 检查是否登录
  const token = uni.getStorageSync('token')
  trackFunnelEvent({
    eventName: 'tap_diy',
    step: 'tap_diy',
    recipeId: selectedRecipeIdForActions.value,
    dogId: selectedDogId.value,
    properties: { loggedIn: Boolean(token) },
  })
  if (!token) {
    // 登录后直达 DIY 配置页，不再退回详情页要求用户重新点击
    promptLoginAndRedirect('制作 DIY 食谱单需要登录，登录后继续为你生成', target)
    return
  }

  // 已登录，直接跳转到DIY配置页面
  uni.navigateTo({ url: target })
}

function goToOrder() {
  const target = buildOrderRoute()
  // 检查是否登录
  const token = uni.getStorageSync('token')
  trackFunnelEvent({
    eventName: 'tap_buy',
    step: 'tap_buy',
    recipeId: selectedRecipeIdForActions.value,
    dogId: selectedDogId.value,
    properties: { loggedIn: Boolean(token) },
  })
  if (!token) {
    // 登录后直达订购配置页，不再退回详情页要求用户重新点击
    promptLoginAndRedirect('购买成品需要登录，登录后继续为你配置订单', target)
    return
  }

  // 已登录，跳转到订购配置页面
  uni.navigateTo({ url: target })
}

function selectDogForDetail(nextDogId: string) {
  if (!nextDogId || nextDogId === selectedDogId.value) return
  selectedDogId.value = nextDogId
  dogId.value = nextDogId
  selectedManualLifeStage.value = ''
  uni.setStorageSync('dogId', nextDogId)
  loadRecipeDetail()
}

function goCreateDog() {
  uni.navigateTo({
    url: '/pages/dog-create/index',
  })
}

function promptLoginAndRedirect(message: string, redirectTarget?: string) {
  uni.showModal({
    title: '需要登录',
    content: message,
    confirmText: '去登录',
    cancelText: '暂不',
    success: (res) => {
      // 漏斗：卡点——触发了登录弹窗（用于度量"登录拦截"造成的流失）
      trackFunnelEvent({
        eventName: 'login_prompt_shown',
        step: 'login_required',
        recipeId: recipeId.value,
        properties: { confirmed: Boolean(res.confirm), intent: redirectTarget || 'detail' },
      })
      if (!res.confirm) return

      // 默认回落到当前食谱详情页；购买/DIY 意图由调用方传入目标页，避免登录后丢失意图
      let redirect = redirectTarget
      if (!redirect) {
        const params = [`recipeId=${encodeURIComponent(recipeId.value)}`]
        if (shareToken.value) {
          params.push(`shareToken=${encodeURIComponent(shareToken.value)}`)
        }
        redirect = `/pages/recipe-detail/index?${params.join('&')}`
      }
      uni.navigateTo({
        url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
      })
    },
  })
}

function openLifeStageSelector() {
  if (!recipe.value.availableLifeStageVersions?.length) return
  lifeStageSelectorVisible.value = true
}

function closeLifeStageSelector() {
  lifeStageSelectorVisible.value = false
}

function isLifeStageVersionSelected(version: RecipeLifeStageVersion): boolean {
  return Boolean(
    version.isSelected ||
      version.selected ||
      (version.recipeId && version.recipeId === selectedRecipeIdForActions.value) ||
      version.lifeStage === recipe.value.selectedLifeStage,
  )
}

function selectLifeStageVersion(version: RecipeLifeStageVersion) {
  if (!version.lifeStage) return
  selectedManualLifeStage.value = version.lifeStage
  lifeStageSelectorVisible.value = false
  loadRecipeDetail()
}


// 营养标准的通俗解释（与订购配置页共用同一份文案，保证两页展示一致）
const nutritionStandardExplain = computed(() =>
  getNutritionStandardExplain(recipe.value.nutritionStandard),
)

function toggleStandardExplain() {
  standardExplainVisible.value = !standardExplainVisible.value
}

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    'FEDIAF_2021': 'FEDIAF 2021',
    'FEDIAF_2025': 'FEDIAF 2025',
    'AAFCO_2019': 'AAFCO 2019',
    'GB_T_31216': '国标 GB/T 31216',
  }
  return map[standard] || standard
}

function formatFoodRatio(item: RecipeItem): string {
  if (item.ratio && item.ratio > 0) return `${formatRatio(item.ratio)}%`
  return '-'
}

function getNutrientTargetText(item: RecipeItem): string {
  const targetText = formatSupplementTargets(item)
  if (targetText) return targetText
  if (!item.nutrientTargetKey || !item.nutrientTargetValue) return ''
  return `每kg食材添加${item.nutrientTargetValue}${item.nutrientTargetKey}`
}

function formatNumber(value: number | undefined | null): string {
  if (value === null || value === undefined) return '-'
  return value.toFixed(1)
}

function formatEnergyDensity(value: number | undefined | null): string {
  if (value === null || value === undefined) return '-'
  return String(Math.round(Number(value)))
}

function formatRatio(value: number | undefined | null): string {
  if (value === null || value === undefined) return '-'
  return value.toFixed(2)
}

function formatCalciumPhosphorusRatio(ratio: string | number | undefined | null): string {
  if (ratio === null || ratio === undefined) return '-'

  // Convert to string first
  const ratioStr = String(ratio)

  // If already contains colon, return as is
  if (ratioStr.includes('：')) return ratioStr

  // Otherwise, convert "1.24" to "1.24：1"
  return `${ratioStr}：1`
}

async function openReviewForm() {
  const token = uni.getStorageSync('token')
  if (!token) {
    promptLoginAndRedirect('写评价需要登录，登录后继续为你填写评价')
    return
  }

  try {
    const result = await reviewApi.checkEligibility(selectedRecipeIdForActions.value)
    if (!result.eligible) {
      uni.showToast({ title: '您需要购买或制作过该食谱才能评价', icon: 'none', duration: 2500 })
      return
    }
    showReviewForm.value = true
  } catch (error: any) {
    // checkEligibility 自身会 showToast，这里静默处理
    console.error('[RecipeDetail] Check eligibility failed:', error)
  }
}

function onReviewSubmitted() {
  reviewListRef.value?.refresh()
}
</script>

<style scoped>
/* 首次加载骨架屏 */
.detail-skeleton {
  padding-bottom: 40rpx;
}

.skeleton-cover {
  width: 100%;
  height: 420rpx;
  background-color: #ecefe0;
}

.skeleton-body {
  padding: 24rpx;
}

.skeleton-line {
  height: 32rpx;
  margin-bottom: 20rpx;
  border-radius: 8rpx;
  background-color: #eef1e2;
}

.skeleton-line--title {
  width: 60%;
  height: 44rpx;
}

.skeleton-line--price {
  width: 45%;
  height: 60rpx;
}

.skeleton-line--text {
  width: 80%;
}

.skeleton-block {
  height: 220rpx;
  margin-top: 24rpx;
  border-radius: 16rpx;
  background-color: #f2f4ea;
}

.skeleton-cover,
.skeleton-line,
.skeleton-block {
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0% { opacity: 1; }
  50% { opacity: 0.55; }
  100% { opacity: 1; }
}

/* 加载失败（可重试） */
.detail-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 200rpx 48rpx 0;
}

.detail-error-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
}

.detail-error-copy {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #968f6d;
}

.detail-error-btn {
  width: 320rpx;
  height: 80rpx;
  line-height: 80rpx;
  margin-top: 40rpx;
  border: 1rpx solid rgba(216, 188, 133, 0.6);
  border-radius: 999rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #f3eddd;
  font-size: 28rpx;
}

/* 切换狗狗 / 生命阶段时的区块级更新提示 */
.detail-refreshing-bar {
  padding: 12rpx 24rpx;
  background-color: #f2f4ea;
  text-align: center;
}

.detail-refreshing-text {
  font-size: 22rpx;
  color: #968f6d;
}

.recipe-detail-page {
  min-height: 100vh;
  background-color: #fbfcf7;
  padding-bottom: 190rpx;
}

/* 底部展示参考价条时，为加高的固定底栏预留空间，避免遮挡"写评价"按钮 */
.recipe-detail-page.has-reference-price {
  padding-bottom: calc(232rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(232rpx + env(safe-area-inset-bottom));
}

/* 封面图区 */
.cover-section {
  width: 100%;
  height: 360rpx;
  background-color: #f0f3e9;
  position: relative;
}

.cover-image {
  width: 100%;
  height: 100%;
}

.recipe-detail-cover-badge-gradient {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  padding: 56rpx 24rpx 20rpx;
  box-sizing: border-box;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(38, 38, 31, 0.0) 0%,
    rgba(38, 38, 31, 0.18) 52%,
    rgba(38, 38, 31, 0.34) 100%
  );
}

.recipe-detail-cover-title-badge {
  max-width: 340rpx;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  background: rgba(38, 38, 31, 0.58);
  color: #f3eddd;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 32rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 4rpx 14rpx rgba(30, 46, 36, 0.16);
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
}

.placeholder-text {
  font-size: 120rpx;
  font-weight: bold;
  color: #f3eddd;
}

/* 基础信息区 */
.info-section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #26261f;
  display: block;
  margin-bottom: 8rpx;
  line-height: 1.4;
  text-align: center;
}

.no-dog-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin: 16rpx 0;
  padding: 20rpx 24rpx;
  background-color: #f6efe0;
  border: 1rpx solid #b08d4f;
  border-radius: 12rpx;
}

.no-dog-hint-text {
  flex: 1;
  font-size: 26rpx;
  color: #8a6b33;
  line-height: 1.5;
}

.no-dog-hint-btn {
  flex-shrink: 0;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 24rpx;
  font-size: 26rpx;
  color: #f3eddd;
  background-color: #1e3a2f;
  border-radius: 32rpx;
  border: none;
}

.no-dog-hint-btn::after {
  border: none;
}

.recipe-detail-dog-selector {
  margin: 16rpx 0 18rpx;
}

.recipe-detail-dog-scroll {
  width: 100%;
  white-space: nowrap;
}

.recipe-detail-dog-chip-row {
  display: inline-flex;
  gap: 12rpx;
  padding: 0 2rpx;
}

.recipe-detail-dog-chip {
  width: 214rpx;
  min-height: 86rpx;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx;
  border: 2rpx solid #eef1e2;
  border-radius: 8rpx;
  background-color: #fbfcf7;
  vertical-align: middle;
}

.recipe-detail-dog-chip.active {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.recipe-detail-dog-avatar {
  flex: 0 0 auto;
  width: 58rpx;
  height: 58rpx;
  border-radius: 50%;
  background-color: #eef2e4;
}

.recipe-detail-dog-chip-name {
  display: block;
  min-width: 0;
  flex: 1;
  font-size: 24rpx;
  font-weight: 700;
  color: #26261f;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.recipe-detail-dog-chip.active .recipe-detail-dog-chip-name {
  color: #1e3a2f;
}

.life-stage-version-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin: 18rpx 0;
  padding: 22rpx;
  border-radius: 12rpx;
  background: #eef2e4;
  border: 1rpx solid #e5e8d4;
}

.life-stage-version-main {
  flex: 1;
  min-width: 0;
}

.life-stage-version-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

/* 未匹配：整卡转为警示色，用颜色承担提示，而不是再堆一行文字 */
.life-stage-version-card--mismatch {
  background-color: var(--sk-danger-soft, #f7e9e3);
  border-color: var(--sk-danger, #b4553f);
}

.life-stage-version-warn {
  flex: none;
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  background-color: var(--sk-danger, #b4553f);
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 30rpx;
  text-align: center;
}

.life-stage-version-card--mismatch .life-stage-version-title,
.life-stage-version-card--mismatch .life-stage-version-copy {
  color: var(--sk-danger, #b4553f);
}

.life-stage-version-title,
.life-stage-version-copy {
  display: block;
}

.life-stage-version-title {
  font-size: 28rpx;
  font-weight: 800;
  color: #26261f;
}

.life-stage-version-copy {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #26261f;
  line-height: 1.45;
}

.life-stage-version-plain {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #6b6653;
  line-height: 1.45;
}

.life-stage-version-options {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #8a6b33;
  line-height: 1.45;
}

.life-stage-version-action {
  flex: 0 0 auto;
  padding: 8rpx 16rpx;
  border-radius: 6rpx;
  color: #1e3a2f;
  background-color: #fbfcf7;
  font-size: 24rpx;
  font-weight: 700;
}

/* 未匹配时「切换」按钮也要跟着变，否则白底按钮压在粉底上很突兀 */
.life-stage-version-card--mismatch .life-stage-version-action {
  color: #fff;
  background-color: var(--sk-danger, #b4553f);
}

/* 一句话卖点：金色竖条强调，作为核心价值主张 */
.recipe-selling-point {
  display: flex;
  margin-top: 14rpx;
  padding-left: 18rpx;
  border-left: 6rpx solid #b08d4f;
}

.recipe-selling-point-text {
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.5;
  color: #1e3a2f;
}

.recipe-description {
  font-size: 28rpx;
  color: #26261f;
  line-height: 1.6;
  display: block;
}

/* 营养数据卡片 */
/* 营养标准背书卡 */
/* 营养标准背书卡：作为卖点做金色强调 */
.standard-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20rpx;
  padding: 26rpx 28rpx;
  background: linear-gradient(150deg, #fdf8ee 0%, #f6efe0 100%);
  border: 1rpx solid rgba(176, 141, 79, 0.45);
  border-radius: 16rpx;
  box-shadow: 0 8rpx 22rpx rgba(176, 141, 79, 0.14);
}

.standard-main {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.standard-badge {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #d8bc85;
  font-size: 24rpx;
  font-weight: 700;
  text-align: center;
  line-height: 40rpx;
}

.standard-copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.standard-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.standard-sub {
  font-size: 22rpx;
  color: #968f6d;
}

.standard-toggle {
  font-size: 24rpx;
  color: #b08d4f;
}

.standard-explain {
  margin: -8rpx 20rpx 20rpx;
  padding: 20rpx 24rpx;
  background-color: #f2f4ea;
  border-radius: 12rpx;
}

.standard-explain-text {
  font-size: 24rpx;
  line-height: 1.7;
  color: #6b6653;
}

/* 营养指标干物质（DM）口径标注 */
.nutrition-basis {
  font-size: 20rpx;
  color: #968f6d;
  margin-left: 2rpx;
}

.nutrition-basis-note {
  display: block;
  margin-top: 20rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #968f6d;
}

.nutrition-item .label {
  font-size: 24rpx;
  color: #26261f;
  margin-bottom: 4rpx;
}

.nutrition-item .value {
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
}

.nutrition-report-card {
  background-color: #fbfcf7;
  border-radius: 16rpx;
  padding: 22rpx 24rpx;
  margin: 20rpx;
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.report-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 8rpx;
  background-color: #eef2e4;
  color: #1e3a2f;
  font-size: 22rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.report-copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.report-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
}

.report-subtitle {
  font-size: 24rpx;
  color: #6b6653;
}

.report-action {
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

/* 原料卡片 */
.ingredients-card {
  background-color: #fbfcf7;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
}

.card-subtitle {
  font-size: 24rpx;
  color: #6b6653;
}

/* 表格标题 */
.ingredient-table-header {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #e5e8d4;
  margin-bottom: 8rpx;
}

.header-name {
  flex: 1;
  font-size: 26rpx;
  font-weight: bold;
  color: #26261f;
  text-align: left;
}

.header-method {
  flex: 1.5;
  font-size: 26rpx;
  font-weight: bold;
  color: #26261f;
  text-align: center;
}

.header-ratio {
  flex: 0 0 120rpx;
  font-size: 26rpx;
  font-weight: bold;
  color: #26261f;
  text-align: right;
}

/* 原料列表项 */
.ingredient-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #eef1e2;
}

.ingredient-item:last-child {
  border-bottom: none;
}

.ingredient-name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 500;
  color: #26261f;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.nutrition-state-tag {
  display: inline-block;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  font-size: 20rpx;
  font-weight: normal;
  background-color: #fbfcf7;
  color: #26261f;
}

.preparation-method {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 24rpx;
  color: #26261f;
}

.preparation-method .method-text {
  width: 100%;
  text-align: center;
  display: block;
}

.ingredient-ratio {
  flex: 0 0 120rpx;
  font-size: 28rpx;
  font-weight: bold;
  color: #1e3a2f;
  text-align: right;
}

/* 配方分组（主料 / 营养补充剂 / 其他物料） */
.ingredient-block {
  margin-top: 28rpx;
}

.ingredient-block--supplement .ingredient-block-header {
  margin-bottom: 4rpx;
}

.ingredient-block-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.ingredient-block-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

/* 食材表与营养补充剂表做底色区分 */
.ingredient-block--supplement {
  padding: 20rpx;
  background-color: #f2f4ea;
  border: 1rpx solid #e5e8d4;
  border-radius: 16rpx;
}

.ingredient-block--supplement .ingredient-block-title {
  color: #8a6b33;
}

.ingredient-block--supplement .ingredient-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.ingredient-block-count {
  font-size: 22rpx;
  color: #968f6d;
}

.ingredient-item--supplement {
  align-items: flex-start;
}

.ingredient-item--supplement .ingredient-name {
  flex-direction: column;
  align-items: flex-start;
  gap: 6rpx;
}

.ingredient-item--supplement .ingredient-ratio {
  flex: 0 0 300rpx;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 1.5;
  color: #6b6653;
}

.supplement-method {
  font-size: 22rpx;
  color: #968f6d;
}

.nutrient-target-value {
  font-size: 24rpx;
  color: #b4553f;
  font-weight: normal;
}

/* 核心营养成分板块 */
.nutrition-panel {
  background-color: #fbfcf7;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx;
}

.nutrition-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.nutrition-item-small {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx;
  background-color: #fbfcf7;
  border-radius: 12rpx;
  text-align: center;
}

.nutrition-label {
  font-size: 24rpx;
  color: #26261f;
  margin-bottom: 8rpx;
}

/* 数值和单位在同一行 */
.nutrition-value-with-unit {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4rpx;
}

.nutrition-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #1e3a2f;
}

.nutrition-unit {
  font-size: 22rpx;
  color: #6b6653;
}

/* 能量密度特殊样式 */
.highlight-energy .nutrition-value {
  color: #b4553f;
}

/* 钙磷比特殊样式 */
.highlight-ratio .nutrition-value {
  color: #b08d4f;
}

/* 写评价按钮（位于评价区标题行右侧） */
.btn-write-review {
  height: 56rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 28rpx;
  margin: 0 0 0 auto;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #f3eddd;
  font-size: 24rpx;
  font-weight: 600;
  border: none;
  border-radius: 999rpx;
}

.btn-write-review::after {
  border: none;
}

/* 底部操作按钮 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10rpx;
  padding: 10rpx 20rpx calc(12rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(12rpx + env(safe-area-inset-bottom));
  background-color: #fbfcf7;
  border-top: 1rpx solid #e5e8d4;
  box-shadow: 0 -8rpx 22rpx rgba(30, 46, 36, 0.06);
  box-sizing: border-box;
}

.bottom-actions-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

/* 无参考价时的价格说明（有价时价格只在底部固定栏展示，避免重复） */
.price-hint {
  margin-top: 16rpx;
  padding: 14rpx 24rpx;
  background-color: #f2f4ea;
  border: 1rpx solid #e5e8d4;
  border-radius: 12rpx;
}

.price-hint-text {
  font-size: 22rpx;
  color: #968f6d;
}

/* 非公开食谱（内部预览）提示 */
.internal-preview-bar {
  margin-bottom: 16rpx;
  padding: 12rpx 20rpx;
  background-color: #f2f4ea;
  border: 1rpx dashed #dde3cd;
  border-radius: 12rpx;
}

.internal-preview-text {
  font-size: 22rpx;
  color: #968f6d;
}

.reference-price-strip {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-radius: 16rpx;
  padding: 12rpx 20rpx;
  background: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.35);
}

.reference-price-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  gap: 2rpx;
}

.reference-price-value {
  font-size: 30rpx;
  font-weight: 800;
  color: #b4553f;
}

.reference-price-note {
  font-size: 20rpx;
  color: #6b6653;
}

.life-stage-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.42);
}

.life-stage-sheet {
  width: 100%;
  max-height: 70vh;
  box-sizing: border-box;
  padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));
  border-radius: 24rpx 24rpx 0 0;
  background: #fbfcf7;
}

.life-stage-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}

.life-stage-sheet-title {
  font-size: 32rpx;
  font-weight: 800;
  color: #26261f;
}

.life-stage-sheet-close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 50%;
  background: #f0f3e9;
  color: #6b6653;
  text-align: center;
  font-size: 34rpx;
}

.life-stage-version-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #eef1e2;
}

.life-stage-version-option.active {
  color: #1e3a2f;
}

.life-stage-version-option-main {
  flex: 1;
  min-width: 0;
}

.life-stage-version-option-title,
.life-stage-version-option-copy {
  display: block;
}

.life-stage-version-option-title {
  font-size: 28rpx;
  font-weight: 800;
}

.life-stage-version-option-copy {
  margin-top: 6rpx;
  color: #6b6653;
  font-size: 24rpx;
  line-height: 1.45;
}

.life-stage-version-selected {
  flex: 0 0 auto;
  font-size: 24rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.life-stage-version-option-side {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
}

.life-stage-version-option-price {
  font-size: 26rpx;
  font-weight: 800;
  color: #b4553f;
}

.quick-actions {
  flex: 0 0 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
}

.action-buttons {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 0;
  border-radius: 42rpx;
  overflow: hidden;
  box-shadow: 0 8rpx 18rpx rgba(30, 46, 36, 0.12);
}

.quick-action,
.btn-diy,
.btn-order {
  height: 84rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  /* 重置微信小程序button默认样式 */
  padding: 0;
  margin: 0;
  line-height: 1;
}

.quick-action::after,
.btn-diy::after,
.btn-order::after {
  border: none;
}

.quick-action {
  flex: 0 0 88rpx;
  min-width: 0;
  flex-direction: column;
  gap: 8rpx;
  background: transparent;
  color: #26261f;
  font-size: 22rpx;
  border-radius: 0;
}

.favorite-icon {
  width: 44rpx;
  height: 44rpx;
}

.btn-favorite.active .icon {
  color: #8a6b33;
}

.quick-label {
  display: block;
  font-size: 22rpx;
  color: #26261f;
  line-height: 1;
}

/* 次级路径：自己做（浅绿底 + 墨绿字） */
.btn-diy {
  flex: 1;
  border-radius: 42rpx 0 0 42rpx;
  font-size: 26rpx;
  font-weight: 600;
  background-color: #eef2e4;
  color: #1e3a2f;
  border-right: 1rpx solid #dde3cd;
}

/* 主转化路径：买成品（墨绿渐变 + 米白字 + 金描边，对比度最高） */
.btn-order {
  flex: 1;
  border-radius: 0 42rpx 42rpx 0;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #f3eddd;
  border: none;
  box-shadow: inset 0 0 0 1rpx rgba(216, 188, 133, 0.55);
  letter-spacing: 1rpx;
}
</style>
