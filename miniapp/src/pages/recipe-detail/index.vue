<template>
  <view class="recipe-detail-page">
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
        v-if="recipe.coverImageUrl && recipe.coverTitle"
        class="recipe-detail-cover-badge-gradient"
      >
        <text class="recipe-detail-cover-title-badge">{{ recipe.coverTitle }}</text>
      </view>
    </view>

    <!-- 基础信息区 -->
    <view class="info-section">
      <text class="recipe-name">{{ recipe.name }}</text>

      <view
        v-if="recipe.selectedLifeStage || recipe.availableLifeStageVersions?.length"
        class="life-stage-version-card"
        @tap="openLifeStageSelector"
      >
        <view class="life-stage-version-main">
          <text class="life-stage-version-title">{{ lifeStageVersionTitle }}</text>
          <text class="life-stage-version-copy">{{ lifeStageVersionCopy }}</text>
        </view>
        <text v-if="recipe.availableLifeStageVersions?.length" class="life-stage-version-action">
          切换
        </text>
      </view>

      <view
        v-if="recipe.targetHealthTags && recipe.targetHealthTags.length > 0"
        class="tags-row"
      >
        <text class="section-label">健康标签：</text>
        <view class="tags-container">
          <text
            v-for="tag in recipe.targetHealthTags"
            :key="tag"
            class="tag health-tag"
          >
            {{ getHealthTagLabel(tag) }}
          </text>
        </view>
      </view>

      <text v-if="recipe.description" class="recipe-description">
        {{ recipe.description }}
      </text>
    </view>

    <view class="dog-fit-card" v-if="dogs.length > 0">
      <view class="dog-fit-header">
        <view>
          <text class="dog-fit-title">按狗狗重算喂食量</text>
          <text class="dog-fit-subtitle">切换宠物后，饭量和阶段提醒会自动更新</text>
        </view>
      </view>
      <scroll-view scroll-x class="detail-dog-scroll">
        <view
          v-for="dog in dogs"
          :key="dog.id"
          :class="['detail-dog-chip', { active: dog.id === selectedDogId }]"
          @tap="selectDetailDog(dog.id)"
        >
          <image class="detail-dog-avatar" :src="resolveDogAvatarSrc(dog.avatarUrl)" mode="aspectFill" />
          <text class="detail-dog-name">{{ dog.name }}</text>
        </view>
      </scroll-view>
      <view v-if="dogCalcLoading" class="dog-fit-loading">正在重算...</view>
      <view v-else-if="dogRecipeCalc" class="dog-fit-result">
        <view class="dog-fit-metric">
          <text class="dog-fit-label">每日参考</text>
          <text class="dog-fit-value">{{ Math.round(dogRecipeCalc.dailyIntakeG) }}g</text>
        </view>
        <view class="dog-fit-metric">
          <text class="dog-fit-label">每餐约</text>
          <text class="dog-fit-value">{{ Math.round(dogRecipeCalc.perMealIntakeG) }}g</text>
        </view>
        <view class="dog-fit-metric">
          <text class="dog-fit-label">每日热量</text>
          <text class="dog-fit-value">{{ Math.round(dogRecipeCalc.finalFoodKcal) }}kcal</text>
        </view>
      </view>
      <view v-if="lifeStageWarning" class="life-stage-warning">
        {{ lifeStageWarning }}
      </view>
    </view>

    <!-- 营养数据卡片 -->
    <view class="nutrition-card">
      <view class="nutrition-item">
        <text class="label">营养标准</text>
        <text class="value">{{ getNutritionStandardLabel(recipe.nutritionStandard) }}</text>
      </view>
      <view class="nutrition-item">
        <text class="label">设计软件</text>
        <text class="value">{{ recipe.designSource || '七厨房' }}</text>
      </view>
    </view>

    <!-- 食谱配方列表 -->
    <view class="ingredients-card">
      <view class="card-header">
        <text class="card-title">食谱配方</text>
        <text class="card-subtitle">共 {{ recipe.items.length }} 种原料</text>
      </view>

      <!-- 表格标题 -->
      <view class="ingredient-table-header">
        <text class="header-name">原料</text>
        <text class="header-method">制备方法</text>
        <text class="header-ratio">占比/用量</text>
      </view>

      <view
        v-for="(item, index) in sortedItems"
        :key="item.ingredientId"
        class="ingredient-item"
      >
        <view class="ingredient-name">
          <text>{{ item.name }}</text>
          <text
            v-if="item.ingredientType"
            :class="['ingredient-type-tag', getIngredientTypeClass(item.ingredientType)]"
          >
            {{ getIngredientTypeLabel(item.ingredientType) }}
          </text>
          <text v-if="item.nutritionStateLabel" class="nutrition-state-tag">
            {{ item.nutritionStateLabel }}
          </text>
        </view>
        <view class="preparation-method">
          <text v-if="item.preparationMethod" class="method-text">{{ item.preparationMethod }}</text>
          <text v-else class="method-text">-</text>
        </view>
        <!-- 食材类型：显示占比 -->
        <text v-if="item.ingredientType === 'FOOD' && item.ratio && item.ratio > 0" class="ingredient-ratio">
          {{ formatRatio(item.ratio) }}%
        </text>
        <!-- 补剂类型：显示营养目标值 -->
        <text v-else-if="item.ingredientType === 'SUPPLEMENT' && getNutrientTargetText(item)" class="ingredient-ratio nutrient-target-value">
          {{ getNutrientTargetText(item) }}
        </text>
        <!-- 其他情况：显示占位符 -->
        <text v-else class="ingredient-ratio">
          -
        </text>
      </view>
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
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">脂肪</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.fatPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">灰分</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.ashPercent) }}
            </text>
            <text class="nutrition-unit">%</text>
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
          </view>
        </view>

        <view class="nutrition-item-small">
          <text class="nutrition-label">碳水</text>
          <view class="nutrition-value-with-unit">
            <text class="nutrition-value">
              {{ formatNumber(recipe.nutritionDetailedData.carbohydratePercent) }}
            </text>
            <text class="nutrition-unit">%</text>
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

    <!-- 用户评价板块 -->
    <ReviewList ref="reviewListRef" :recipe-id="selectedRecipeIdForActions" />

    <!-- 写评价按钮 -->
    <view class="write-review-section">
      <button class="btn-write-review" @tap="openReviewForm">
        写评价
      </button>
    </view>

    <!-- 评论表单弹窗 -->
    <ReviewForm
      v-model:visible="showReviewForm"
      :recipe-id="selectedRecipeIdForActions"
      @submitted="onReviewSubmitted"
    />

    <!-- 底部操作按钮 -->
    <view class="bottom-actions">
      <view class="quick-actions">
        <button
          class="quick-action btn-favorite"
          :class="{ active: isFavorite }"
          @tap="toggleFavorite"
        >
          <text class="icon">{{ isFavorite ? '★' : '☆' }}</text>
          <text class="quick-label">收藏</text>
        </button>

        <button
          class="quick-action btn-cart"
          :class="{ active: isInCart }"
          @tap="handleCartTap"
          aria-label="加入购物车"
        >
          <view class="cart-icon-wrap">
            <image
              class="cart-icon"
              src="/static/icons/cart-orange.png"
              mode="aspectFit"
            />
            <text v-if="isInCart" class="cart-added-mark">✓</text>
          </view>
          <text class="quick-label">购物车</text>
        </button>
      </view>

      <view class="action-buttons">
        <button class="btn-diy" @tap="generateDiySheet">
          自己制作
        </button>

        <button class="btn-order" @tap="goToOrder">
          现做成品
        </button>
      </view>
    </view>

    <CustomerServiceFloatButton
      source-type="PRODUCT"
      :product-id="selectedRecipeIdForActions"
      :product-name="recipe.name"
      :image-url="normalizeImageUrl(recipe.coverImageUrl || '')"
    />

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
          <text v-if="isLifeStageVersionSelected(version)" class="life-stage-version-selected">
            当前
          </text>
        </view>
      </view>
    </view>
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
      ? `${currentRecipeName} | Seven的厨房`
      : '精选食谱 | Seven的厨房'

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
      ? `${currentRecipeName} | Seven的厨房`
      : '精选食谱 | Seven的厨房'

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
import { onShow } from '@dcloudio/uni-app'
import { request, addFavorite, removeFavorite, checkFavorite, createRecipeShareToken, reviewApi, trackRecipeView } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import { addCartItem, getCartItems, removeCartItem } from '../../utils/cart'
import { formatSupplementTargets } from '../../utils/supplement-nutrients'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import ReviewList from '../../components/ReviewList.vue'
import ReviewForm from '../../components/ReviewForm.vue'
import CustomerServiceFloatButton from '../../components/CustomerServiceFloatButton.vue'

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
  description?: string
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
const isInCart = ref(false)
const recipeId = ref('')
const shareToken = ref('')
const dogId = ref<string | null>(null)
const dogs = ref<any[]>([])
const selectedDogId = ref('')
const dogRecipeCalc = ref<any | null>(null)
const dogCalcLoading = ref(false)
const showReviewForm = ref(false)
const reviewListRef = ref<InstanceType<typeof ReviewList> | null>(null)
const selectedManualLifeStage = ref('')
const lifeStageSelectorVisible = ref(false)
const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 原料排序（按sortOrder升序）
const sortedItems = computed(() => {
  return [...recipe.value.items].sort((a, b) => a.sortOrder - b.sortOrder)
})

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

const isCurrentLifeStageMatched = computed(() => {
  const match = recipe.value.lifeStageMatch
  return Boolean(
    match?.matched === true ||
      match?.status === 'MATCHED' ||
      match?.matchType === 'MATCHED',
  )
})

const lifeStageVersionTitle = computed(() => {
  const label = selectedLifeStageLabel.value || '当前版本'
  return `${isCurrentLifeStageMatched.value ? '已匹配' : '当前展示'}：${label}`
})

const lifeStageVersionCopy = computed(() => {
  if (recipe.value.lifeStageMatch?.message) return recipe.value.lifeStageMatch.message
  if (selectedDog.value) {
    return `根据${selectedDog.value.name}的档案自动展示该生命阶段版本。`
  }
  return '可切换查看该食谱已开放的生命阶段版本。'
})

const lifeStageWarning = computed(() => {
  if (!selectedDog.value || !recipe.value.applicableLifeStages?.length) return ''
  const stage = selectedDog.value.lifeStageOverride && selectedDog.value.lifeStageOverride !== 'NONE'
    ? selectedDog.value.lifeStageOverride
    : ''
  if (!stage || recipe.value.applicableLifeStages.includes(stage)) return ''
  return '这道食谱的适配阶段与当前狗狗档案不完全一致，下单前建议确认阶段和喂食目标。'
})

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage.options?.recipeId || currentPage.options?.id || ''
  shareToken.value = currentPage.options?.shareToken || ''

  dogId.value = uni.getStorageSync('dogId') || null

  // 【修复】先加载健康标签映射，再加载食谱详情
  // 这样可以确保在渲染标签时，映射表已经准备好了
  await loadHealthTagMapping()

  if (recipeId.value) {
    updateCartStatus()
    loadDogsForDetail()
    loadRecipeDetail()
  }
})

onShow(() => {
  updateCartStatus()
})

function loadRecipeDetail() {
  uni.showLoading({ title: '加载中...' })

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
    if (res.code === 0 && res.data) {
      recipe.value = {
        ...res.data,
        id: res.data.selectedRecipeId || res.data.id,
        availableLifeStageVersions: res.data.availableLifeStageVersions || [],
      }
      uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')
      const actionRecipeId = selectedRecipeIdForActions.value
      updateCartStatus()
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

      if (selectedDogId.value) {
        calcSelectedDogForRecipe()
      }
    }
  }).catch((err: any) => {
    console.error('Load recipe error:', err)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }).finally(() => {
    uni.hideLoading()
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

function loadHealthTagMapping(): Promise<void> {
  return request({
    url: '/recipes/filter-options',
    method: 'GET'
  }).then((res: any) => {
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
  }).catch((err: any) => {
    console.error('Load health tag mapping error:', err)
  })
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
      if (dogs.value.length > 0) {
        selectedDogId.value = dogId.value || uni.getStorageSync('dogId') || dogs.value[0].id
        if (!dogs.value.some((dog) => dog.id === selectedDogId.value)) {
          selectedDogId.value = dogs.value[0].id
        }
        loadRecipeDetail()
      }
    }
  } catch (error) {
    console.warn('[RecipeDetail] Load dogs failed:', error)
  }
}

function selectDetailDog(id: string) {
  if (!id || selectedDogId.value === id) return
  selectedDogId.value = id
  dogId.value = id
  uni.setStorageSync('dogId', id)
  selectedManualLifeStage.value = ''
  loadRecipeDetail()
}

async function calcSelectedDogForRecipe() {
  if (!selectedDogId.value || !recipeId.value || !selectedRecipeIdForActions.value) return

  dogCalcLoading.value = true
  try {
    const res: any = await request({
      url: `/dogs/${selectedDogId.value}/calc-for-recipe`,
      method: 'POST',
      data: { recipeId: selectedRecipeIdForActions.value },
      quiet: true,
      suppressErrorToast: true
    })
    if (res.code === 0 && res.data) {
      dogRecipeCalc.value = res.data
    }
  } catch (error) {
    console.warn('[RecipeDetail] Calc dog for recipe failed:', error)
    dogRecipeCalc.value = null
  } finally {
    dogCalcLoading.value = false
  }
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
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    // 延迟跳转到登录页
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/login/index'
      })
    }, 1500)
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
      uni.showToast({
        title: '请先登录',
        icon: 'none'
      })
      setTimeout(() => {
        uni.navigateTo({
          url: '/pages/login/index'
        })
      }, 1500)
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

function generateDiySheet() {
  // 检查是否登录
  const token = uni.getStorageSync('token')
  if (!token) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    // 延迟跳转到登录页
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/login/index'
      })
    }, 1500)
    return
  }

  // 已登录，直接跳转到DIY配置页面
  uni.navigateTo({
    url: `/pages/recipe-diy/index?recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}`
  })
}

function goToOrder() {
  // 检查是否登录
  const token = uni.getStorageSync('token')
  if (!token) {
    uni.showToast({
      title: '请先登录',
      icon: 'none'
    })
    // 延迟跳转到登录页
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/login/index'
      })
    }, 1500)
    return
  }

  const query = [`recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}`]
  if (recipe.value.selectedLifeStage) {
    query.push(`lifeStage=${encodeURIComponent(recipe.value.selectedLifeStage)}`)
  }

  // 已登录，跳转到订购配置页面
  uni.navigateTo({
    url: `/pages/recipe-order/index?${query.join('&')}`
  })
}

function updateCartStatus() {
  const actionRecipeId = selectedRecipeIdForActions.value
  if (!actionRecipeId) {
    isInCart.value = false
    return
  }

  isInCart.value = getCartItems().some((item) => item.recipeId === actionRecipeId)
}

function goToCart() {
  uni.navigateTo({
    url: '/pages/cart/index',
  })
}

function handleCartTap() {
  const actionRecipeId = selectedRecipeIdForActions.value
  if (!actionRecipeId || !recipe.value?.name) {
    uni.showToast({
      title: '食谱信息未加载',
      icon: 'none',
    })
    return
  }

  if (isInCart.value) {
    uni.showActionSheet({
      itemList: ['查看购物车', '移出购物车'],
      itemColor: '#1f2933',
      success: (res) => {
        if (res.tapIndex === 0) {
          goToCart()
          return
        }

        removeCartItem(actionRecipeId)
        isInCart.value = false
        uni.showToast({
          title: '已移出购物车',
          icon: 'success',
        })
      },
    })
    return
  }

  addCartItem({
    recipeId: actionRecipeId,
    name: recipe.value.name,
    coverImageUrl: normalizeImageUrl(recipe.value.coverImageUrl || ''),
    description: recipe.value.description || '',
    energyDensityKcalPerKg: recipe.value.energyDensityKcalPerKg || 0,
  })
  isInCart.value = true

  uni.showToast({
    title: '已加入购物车',
    icon: 'success',
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

function getLifeStageLabel(stage: string): string {
  const map: Record<string, string> = {
    'PUPPY_UNDER_14_WEEKS': '小于14周幼犬',
    'PUPPY_14_WEEKS_PLUS': '大于等于14周幼犬',
    'LOW_ACTIVITY_ADULT_OR_SENIOR': '低运动量成犬或老年犬',
    'HIGH_ACTIVITY_ADULT': '普通或高运动量成犬',
    'REPRODUCTION': '繁殖期',
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期',
  }
  const result = map[stage]
  if (!result) {
    console.warn('[RecipeDetail] 未知的生命阶段标签:', stage)
  }
  return result || stage
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

  // 如果都找不到，记录警告并返回原始值
  console.warn('[RecipeDetail] 未找到健康标签映射:', tagOrUuid, '当前映射表大小:', Object.keys(healthTagUuidLabelMap.value).length)
  return tagOrUuid
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

function getIngredientTypeLabel(type: string): string {
  const map: Record<string, string> = {
    'FOOD': '食材',
    'SUPPLEMENT': '补剂',
    'PACKAGING': '包材',
  }
  return map[type] || type
}

function getIngredientTypeClass(type: string): string {
  const map: Record<string, string> = {
    'FOOD': 'type-food',
    'SUPPLEMENT': 'type-supplement',
    'PACKAGING': 'type-packaging',
  }
  return map[type] || ''
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
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => {
      uni.navigateTo({ url: '/pages/login/index' })
    }, 1500)
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
.recipe-detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 190rpx;
}

/* 封面图区 */
.cover-section {
  width: 100%;
  height: 360rpx;
  background-color: #f0f0f0;
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
    rgba(20, 18, 16, 0) 0%,
    rgba(20, 18, 16, 0.18) 52%,
    rgba(20, 18, 16, 0.34) 100%
  );
}

.recipe-detail-cover-title-badge {
  max-width: 340rpx;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  background: rgba(32, 29, 25, 0.58);
  color: #fff;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 32rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.16);
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.placeholder-text {
  font-size: 120rpx;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
}

/* 基础信息区 */
.info-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 8rpx;
  line-height: 1.4;
  text-align: center;
}

.section-label {
  font-size: 26rpx;
  color: #666;
  display: inline-block;
  margin-right: 8rpx;
}

.tags-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
  gap: 8rpx;
}

.tags-row .section-label {
  margin-right: 0;
  margin-bottom: 8rpx;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  justify-content: center;
}

.life-stage-version-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin: 18rpx 0;
  padding: 22rpx;
  border-radius: 12rpx;
  background: #f4fbf5;
  border: 1rpx solid #dcefe2;
}

.life-stage-version-main {
  flex: 1;
  min-width: 0;
}

.life-stage-version-title,
.life-stage-version-copy {
  display: block;
}

.life-stage-version-title {
  font-size: 28rpx;
  font-weight: 800;
  color: #264b2e;
}

.life-stage-version-copy {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #58705d;
  line-height: 1.45;
}

.life-stage-version-action {
  flex: 0 0 auto;
  padding: 8rpx 16rpx;
  border-radius: 6rpx;
  color: #2f8f4e;
  background-color: #fff;
  font-size: 24rpx;
  font-weight: 700;
}

.tag {
  display: inline-block;
  padding: 6rpx 16rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
}

.life-stage-tag {
  background-color: #e3f2fd;
  color: #1976d2;
}

.health-tag {
  background-color: #fff3e0;
  color: #f57c00;
}

.recipe-description {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
  display: block;
}

/* 营养数据卡片 */
.dog-fit-card {
  margin: 24rpx;
  padding: 28rpx;
  background: #fff;
  border-radius: 16rpx;
}

.dog-fit-title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #2f261f;
}

.dog-fit-subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #7a6a5d;
}

.detail-dog-scroll {
  margin-top: 22rpx;
  white-space: nowrap;
}

.detail-dog-chip {
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  margin-right: 18rpx;
  padding: 10rpx 18rpx 10rpx 10rpx;
  border-radius: 999rpx;
  background: #f7f2ed;
  color: #7a5b43;
  vertical-align: middle;
}

.detail-dog-chip.active {
  background: #f08a3c;
  color: #fff;
}

.detail-dog-avatar {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
}

.detail-dog-chip.active .detail-dog-avatar {
  width: 64rpx;
  height: 64rpx;
}

.detail-dog-name {
  font-size: 24rpx;
  font-weight: 600;
}

.dog-fit-loading {
  margin-top: 22rpx;
  color: #8a7a6c;
  font-size: 24rpx;
}

.dog-fit-result {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
  margin-top: 22rpx;
}

.dog-fit-metric {
  padding: 18rpx 12rpx;
  border-radius: 14rpx;
  background: #fff7ef;
  text-align: center;
}

.dog-fit-label {
  display: block;
  font-size: 22rpx;
  color: #8a7a6c;
}

.dog-fit-value {
  display: block;
  margin-top: 8rpx;
  font-size: 30rpx;
  font-weight: 800;
  color: #2f261f;
}

.life-stage-warning {
  margin-top: 18rpx;
  padding: 18rpx;
  border-radius: 12rpx;
  background: #fff3df;
  color: #8a5a16;
  font-size: 24rpx;
  line-height: 1.45;
}

.nutrition-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin: 20rpx;
  display: flex;
  justify-content: space-around;
}

.nutrition-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.nutrition-item .label {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 4rpx;
}

.nutrition-item .value {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.nutrition-report-card {
  background-color: #fff;
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
  background-color: #e8f5e9;
  color: #07c160;
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
  color: #333;
}

.report-subtitle {
  font-size: 24rpx;
  color: #888;
}

.report-action {
  font-size: 26rpx;
  font-weight: 600;
  color: #07c160;
}

/* 原料卡片 */
.ingredients-card {
  background-color: #fff;
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
  color: #333;
}

.card-subtitle {
  font-size: 24rpx;
  color: #999;
}

/* 表格标题 */
.ingredient-table-header {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #e5e5e5;
  margin-bottom: 8rpx;
}

.header-name {
  flex: 1;
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
  text-align: left;
}

.header-method {
  flex: 1.5;
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
  text-align: center;
}

.header-ratio {
  flex: 0 0 120rpx;
  font-size: 26rpx;
  font-weight: bold;
  color: #333;
  text-align: right;
}

/* 原料列表项 */
.ingredient-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.ingredient-item:last-child {
  border-bottom: none;
}

.ingredient-name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.ingredient-type-tag {
  display: inline-block;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  font-size: 20rpx;
  font-weight: normal;
}

.nutrition-state-tag {
  display: inline-block;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  font-size: 20rpx;
  font-weight: normal;
  background-color: #f4f4f5;
  color: #606266;
}

.type-food {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.type-supplement {
  background-color: #fff3e0;
  color: #ef6c00;
}

.type-packaging {
  background-color: #e3f2fd;
  color: #1565c0;
}

.preparation-method {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 24rpx;
  color: #666;
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
  color: #07c160;
  text-align: right;
}

.nutrient-target-value {
  font-size: 24rpx;
  color: #ff6b6b;
  font-weight: normal;
}

/* 核心营养成分板块 */
.nutrition-panel {
  background-color: #fff;
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
  background-color: #f9f9f9;
  border-radius: 12rpx;
  text-align: center;
}

.nutrition-label {
  font-size: 24rpx;
  color: #666;
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
  color: #07c160;
}

.nutrition-unit {
  font-size: 22rpx;
  color: #999;
}

/* 能量密度特殊样式 */
.highlight-energy .nutrition-value {
  color: #ff6b6b;
}

/* 钙磷比特殊样式 */
.highlight-ratio .nutrition-value {
  color: #4dabf7;
}

/* 写评价按钮区域 */
.write-review-section {
  padding: 0 20rpx 20rpx;
}

.btn-write-review {
  width: 100%;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background-color: #fff;
  color: #07c160;
  font-size: 30rpx;
  font-weight: 500;
  border-radius: 44rpx;
  border: 2rpx solid #07c160;
  padding: 0;
  margin: 0;
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
  align-items: center;
  gap: 16rpx;
  padding: 10rpx 20rpx calc(12rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(12rpx + env(safe-area-inset-bottom));
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  box-shadow: 0 -8rpx 22rpx rgba(15, 23, 42, 0.06);
  box-sizing: border-box;
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
  background: #fff;
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
  color: #25282b;
}

.life-stage-sheet-close {
  width: 56rpx;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 50%;
  background: #f2f4f5;
  color: #687078;
  text-align: center;
  font-size: 34rpx;
}

.life-stage-version-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #eef0f2;
}

.life-stage-version-option.active {
  color: #2f8f4e;
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
  color: #687078;
  font-size: 24rpx;
  line-height: 1.45;
}

.life-stage-version-selected {
  flex: 0 0 auto;
  font-size: 24rpx;
  font-weight: 700;
  color: #2f8f4e;
}

.quick-actions {
  flex: 0 0 176rpx;
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
  box-shadow: 0 8rpx 18rpx rgba(24, 144, 255, 0.12);
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
  color: #606266;
  font-size: 22rpx;
  border-radius: 0;
}

.quick-action .icon {
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: #999;
  line-height: 1;
}

.btn-favorite.active .icon {
  color: #f6ad00;
}

.quick-label {
  display: block;
  font-size: 22rpx;
  color: #606266;
  line-height: 1;
}

.btn-diy {
  flex: 1;
  border-radius: 42rpx 0 0 42rpx;
  font-size: 26rpx;
  font-weight: 600;
  background-color: #07c160;
  color: #fff;
}

.btn-cart {
  position: relative;
}

.btn-cart.active {
  color: #f97316;
}

.btn-cart.active .quick-label {
  color: #f97316;
}

.cart-icon-wrap {
  position: relative;
  width: 52rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cart-icon {
  width: 50rpx;
  height: 50rpx;
  display: block;
}

.cart-added-mark {
  position: absolute;
  top: -5rpx;
  right: -9rpx;
  width: 24rpx;
  height: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: #07c160;
  color: #fff;
  font-size: 19rpx;
  font-weight: 700;
  line-height: 1;
}

.btn-order {
  flex: 1;
  border-radius: 0 42rpx 42rpx 0;
  font-size: 26rpx;
  font-weight: 600;
  background-color: #1890ff;
  color: #fff;
}
</style>
