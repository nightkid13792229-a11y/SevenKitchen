<template>
  <view class="recipe-detail-page" :class="{ 'has-reference-price': !!displayReferencePrice && canBuyFinishedFood }">
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

      <!--
        选狗：三页共用同一个组件（2026-11-07）。
        详情页只放选择器 —— 每日饭量要按食谱现算（只有成品页和 DIY 页会调那个接口），
        而“这只狗合不合适”由下面的生命阶段卡回答，这里再放六项就是两份档案。
      -->
      <view class="recipe-detail-dog-selector">
        <DogContextPanel
          :dogs="dogs"
          :selected-id="selectedDogId"
          :state="dogPanelState"
          facts="none"
          :panel="false"
          @select="selectDogForDetail"
          @create-dog="goCreateDog"
          @retry="retryDogsLoad"
        />
      </view>

      <!--
        生命阶段版本卡。
        2026-09-19 精简：去掉"通俗补充说明"与"本品可选"两行 ——
        它们不构成决策依据，只会把这一块撑长、稀释真正重要的"匹配与否"。
        未匹配时（人工指定错版本 / 无完全匹配版本）整卡转为警示色，
        用颜色本身承担提示，而不是靠再堆一行文字。
      -->
      <!--
        2026-10-18：改用共享组件 `LifeStageVersionCard`。
        原来这一块在四个页面各写了一遍（共 21 个 computed + 13 个函数），
        同一个 matchType 四个页面可能给出四种说法。
      -->
      <LifeStageVersionBar
        v-if="recipe.id"
        :state="lifeStageState"
        :dog-name="selectedDogName"
        :dog-stage="dogStage"
        :dog-stage-label="dogStageLabel"
        :current-label="selectedLifeStageLabel"
        :suggested-label="suggestedVersionLabel"
        :suggested-stage="suggestedVersionStage"
        :version-count="recipe.availableLifeStageVersions?.length || 0"
        @open-selector="openLifeStageSelector"
        @select="selectLifeStageVersionByStage"
        @see-suitable="goSuitableRecipes"
        @retry="loadRecipeDetail"
        @add-dog="goCreateDog"
      />

    </view>

    <!-- 食谱配方：主料按占比、需额外补充的营养素按每公斤浓度，分块展示（口径不同，避免同一列混用） -->
    <view class="ingredients-card">
      <view class="card-header">
        <text class="card-title">食谱配方</text>
        <text class="card-subtitle">共 {{ recipe.items.length }} 项原料</text>
      </view>

      <!-- 食材表 -->
      <view v-if="foodItems.length > 0" class="ingredient-block">
        <view class="ingredient-table-header">
          <text class="header-name">食材</text>
          <text class="header-method">部位 / 状态 / 预处理</text>
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

      <!--
        需额外补充的营养素（2026-11-07 改版）：
        原来这一块列的是**补剂产品**（钙粉、鱼油…）和它们的添加时机 ——
        顾客真正关心的是"这道食谱要额外补什么、补多少"，不是"买哪瓶"。
        现在只列**营养素名 + 每公斤食材添加浓度**，与「我的定制食谱」同一口径；
        具体产品与实际用量放到「自己做」生成的制作单里。
      -->
      <view v-if="supplementNutrientRows.length > 0" class="ingredient-block ingredient-block--nutrients">
        <view class="ingredient-block-header">
          <text class="ingredient-block-title">需额外补充的营养素</text>
          <text class="ingredient-block-count">{{ supplementNutrientRows.length }} 项</text>
        </view>
        <view class="supplement-nutrient-head">
          <text class="supplement-nutrient-head-name">营养素</text>
          <text class="supplement-nutrient-head-value">添加浓度</text>
        </view>
        <view
          v-for="(row, index) in supplementNutrientRows"
          :key="`${row.nutrient}-${index}`"
          class="supplement-nutrient-row"
        >
          <text class="supplement-nutrient-name">{{ row.nutrient }}</text>
          <text class="supplement-nutrient-value">{{ row.concentration }}</text>
        </view>
        <text class="supplement-nutrient-note">
          具体的补剂产品和实际用量，可点击下方【自己做】生成制作单后查看。
        </text>
      </view>

      <!-- 其他物料（包材等，无营养口径） -->
      <view v-if="otherItems.length > 0" class="ingredient-block">
        <view class="ingredient-block-header">
          <text class="ingredient-block-title">其他物料</text>
          <text class="ingredient-block-count">{{ otherItems.length }} 种</text>
        </view>
        <view class="ingredient-table-header">
          <text class="header-name">物料</text>
          <text class="header-method">部位 / 状态 / 预处理</text>
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

    <!--
      营养报告入口（2026-11-07 改版）：
      样式对齐上面的「全营养标准」卡，去掉没信息量的"营养"方块；
      标题收成「营养报告」，副标题说清报告里有什么（氨基酸/脂肪酸/维生素/矿物质）。
    -->
    <view
      v-if="hasStructuredNutritionReport"
      class="nutrition-report-card"
    >
      <NutritionReportEntry @open="openNutritionReportPage" />
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
      <view v-if="displayReferencePrice && canBuyFinishedFood" class="reference-price-strip">
        <view class="reference-price-copy">
          <text class="reference-price-value">
            约¥{{ formatReferencePrice(displayReferencePrice.amount) }}/100g
          </text>
          <text class="reference-price-note">
            按起订量估算 · 已含冷链配送 · 最终价格以下单页为准
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

          <!-- W3：客户自己设计的食谱不显示「买成品」（想要成品要走定制流程） -->
          <button
            v-if="canBuyFinishedFood"
            class="btn-order"
            @tap="goToOrder"
          >
            买成品
          </button>
        </view>
      </view>
    </view>

    <LifeStageVersionSheet
      :visible="lifeStageSelectorVisible"
      :versions="lifeStageVersionOptions"
      :current-stage="recipe.selectedLifeStage || ''"
      :matched-stage="dogStage"
      @close="closeLifeStageSelector"
      @select="selectLifeStageVersionByStage"
    />
    </block>
  </view>
</template>

<!-- 普通script：定义分享函数 -->
<script lang="ts">
import { CURRENT_SHARE_CONFIG } from '@/utils/config'
// 2026-11-02：版本条 + 版本面板，详情/订购/DIY 共用
import LifeStageVersionBar from '@/components/recipe/LifeStageVersionBar.vue'
import DogContextPanel from '@/components/dog/DogContextPanel.vue'
import LifeStageVersionSheet from '@/components/recipe/LifeStageVersionSheet.vue'
import { resolveLifeStageUiState } from '@/utils/life-stage-ui'
import { useDogSelection } from '@/composables/useDogSelection'

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
      ? `${currentRecipeName} | Setar 赛文的食堂`
      : '精选食谱 | Setar 赛文的食堂'

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
      ? `${currentRecipeName} | Setar 赛文的食堂`
      : '精选食谱 | Setar 赛文的食堂'

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
import { trackFunnelEvent } from '../../utils/funnel'
import { buildDogCreateRoute, navigateToDogCreate } from '../../utils/dog-profile-entry'
import { resolveCoverBadgeText } from '../../utils/cover-badge'
import { getNutritionStandardExplain, getLifeStageLabel } from '../../utils/label-mapping'
import { buildSupplementNutrientRowsFromItems } from '../../utils/supplement-nutrients'
import ReviewList from '../../components/ReviewList.vue'
import ReviewForm from '../../components/ReviewForm.vue'
import NutritionReportEntry from '../../components/recipe/NutritionReportEntry.vue'

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
/** 定制单号：带值时只看交付记录冻结的那一版（员工端入口用） */
const pinnedOrderId = ref('')
const dogId = ref<string | null>(null)
/**
 * 选狗状态（2026-10-18 收进 composable）。
 *
 * 这段原来在**七个页面**各写一遍，写法还不一致（有的 `dogId`、有的 `selectedDogId`）。
 * composable 只管"选哪只"；列表还是本页自己拉（各页接口不同）。
 *
 * ⚠️ `dogId` 暂时保留 —— 它是本页 API 请求用的，与 `selectedDogId` 是同一个概念的两份记录，
 * 合并属于另一步（会动到 5 处请求参数），这里先只统一"选中项"。
 */
const {
  dogs,
  selectedDogId,
  selectedDog,
  setDogs,
  syncFromMatch,
} = useDogSelection()
const dogsLoaded = ref(false)
// 拉档案失败：失败要能重试，不能一直停在骨架屏上
const dogsLoadFailed = ref(false)
// 未登录时也应该看到「订购前需先建档」的预告（原实现只在已登录时才拉列表，导致新用户毫无提示）
const hasToken = ref(Boolean(uni.getStorageSync('token')))

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

// 配方分组：主料按"占比"口径，补剂按"营养素目标"口径，分开成两块
const foodItems = computed(() =>
  sortedItems.value.filter((item) => item.ingredientType === 'FOOD'))
const supplementItems = computed(() =>
  sortedItems.value.filter((item) => item.ingredientType === 'SUPPLEMENT'))
const otherItems = computed(() =>
  sortedItems.value.filter(
    (item) => item.ingredientType !== 'FOOD' && item.ingredientType !== 'SUPPLEMENT',
  ))

/**
 * 需额外补充的营养素：**营养素名 + 每公斤食材添加浓度**（2026-11-07）。
 *
 * 口径与「我的定制食谱」交付页共用 `buildSupplementNutrientRows` ——
 * 页面上不再出现补剂产品名与添加时机（那是"买哪瓶/什么时候加"）。
 * 老数据没有营养素目标时，`getSupplementTargets` 会回退到
 * `nutrientTargetKey/Value`；都没有的补剂就不产生行。
 */
const supplementNutrientRows = computed(() =>
  buildSupplementNutrientRowsFromItems(supplementItems.value))

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



// 首次加载骨架屏 / 失败重试态
const showDetailSkeleton = computed(() => detailLoading.value && !recipe.value.id)
const showDetailError = computed(() => detailLoadFailed.value && !recipe.value.id)

function retryLoadDetail() {
  detailLoadFailed.value = false
  detailLoading.value = true
  loadRecipeDetail()
}

// 非公开食谱（员工预览 / 分享链接）：给内部人员一个低调提示，避免误以为已上线
/**
 * W3：能不能买成品。
 * 后端按"这条食谱所在系列是不是客户自己建的"下发（客户自助食谱为 false）。
 * 拿不到字段时按"可以"处理，避免老接口把正常食谱的入口也一起藏了。
 */
const canBuyFinishedFood = computed(
  () => (recipe.value as any).canBuyFinishedFood !== false,
)

const isNonPublicRecipe = computed(() => {
  const status = recipe.value.status
  return Boolean(status) && status !== 'PUBLIC'
})

// 参考价区域：加载中不展示兜底文案，避免闪现；无数据时降级为说明文案
const showPriceFallbackCopy = computed(
  () => Boolean(recipe.value.id) && !referencePriceLoading.value && !displayReferencePrice.value,
)

// 未建档时在详情页提前预告，避免进入订购配置页才被拦下。
// 2026-09-21：未登录也展示（新用户此前完全看不到任何预告），文案不变。
/**
 * 狗狗面板的四种状态（组件只管好看，判断留在页面）。
 *
 * · 未登录：直接给“请先创建档案”，点按钮时再拦登录（原来就是这么引导的）
 * · 失败优先于空：失败时说“暂无档案”，顾客会去重复建档
 * · 已登录但还没拉到：骨架
 */
const dogPanelState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (!hasToken.value) return 'empty'
  if (dogsLoadFailed.value) return 'error'
  if (!dogsLoaded.value) return 'loading'
  if (dogs.value.length === 0) return 'empty'
  return 'ready'
})

/** 档案没拉到时的重试（组件里的「重新加载」） */
function retryDogsLoad() {
  dogsLoadFailed.value = false
  dogsLoaded.value = false
  void loadDogsForDetail()
}

// 当前生效的生命阶段版本（对应食谱ID）
const activeLifeStageVersionRecipeId = computed(() => {
  const selectedStage = recipe.value.selectedLifeStage
  if (!selectedStage) return ''
  const version = recipe.value.availableLifeStageVersions?.find(
    (v) => v.lifeStage === selectedStage,
  )
  return version?.recipeId || ''
})

// 展示参考价：有生效版本价则展示该价；否则展示全阶段最低价（文案统一用「约」）
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
  const selectedStage = recipe.value.selectedLifeStage || recipe.value.lifeStageMatch?.lifeStage || ''
  if (!selectedStage) return recipe.value.selectedLifeStageLabel || ''
  // 2026-11-02：版本名以前端映射为准
  return getLifeStageLabel(selectedStage)
})

const lifeStageState = computed(() =>
  resolveLifeStageUiState({
    hasDog: Boolean(selectedDogId.value || dogId.value),
    verdict: recipe.value.lifeStageMatch,
  }),
)

const dogStage = computed(() => recipe.value.lifeStageMatch?.dogLifeStage || '')
const dogStageLabel = computed(() => recipe.value.lifeStageMatch?.dogLifeStageLabel || '')
const selectedDogName = computed(
  () => dogs.value.find((dog) => dog.id === selectedDogId.value)?.name || '',
)
const suggestedVersion = computed(() => {
  const versions = recipe.value.availableLifeStageVersions || []
  const current = recipe.value.selectedLifeStage || selectedManualLifeStage.value
  return versions.find(
    (version) => version.lifeStage === dogStage.value && version.lifeStage !== current,
  ) || null
})
const suggestedVersionLabel = computed(() => {
  const version = suggestedVersion.value
  return version ? getLifeStageLabel(version.lifeStage) : ''
})
const suggestedVersionStage = computed(() => suggestedVersion.value?.lifeStage || '')
const lifeStageVersionOptions = computed(() =>
  (recipe.value.availableLifeStageVersions || []).map((version) => {
    const price = getVersionReferencePrice(version)
    return {
      lifeStage: version.lifeStage,
      label: getLifeStageLabel(version.lifeStage),
      recipeId: version.recipeId,
      note: price ? `约¥${formatReferencePrice(price)}/100g` : '',
    }
  }),
)

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

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage.options?.recipeId || currentPage.options?.id || ''
  shareToken.value = currentPage.options?.shareToken || ''
  pinnedOrderId.value = currentPage.options?.orderId || ''
  initialDogId.value = currentPage.options?.dogId || ''
  hasToken.value = Boolean(uni.getStorageSync('token'))

  dogId.value = initialDogId.value || uni.getStorageSync('dogId') || null

  if (recipeId.value) {
    // 2026-11-02：先定狗再取菜谱，避免首屏先按"无狗"渲染一版再跳
    await loadDogsForDetail()
    if (!dogs.value.length) {
      loadRecipeDetail()
    }
  }
})

/**
 * 从建档页返回详情页时，本页不会重新挂载（页面实例还在栈里），
 * 之前只靠 onMounted 拉一次列表，导致「已经建好档了，页面还在说没建档」，
 * 用户会以为没成功并再建一次。这里在每次显示时补一次刷新。
 */
onShow(() => {
  hasToken.value = Boolean(uni.getStorageSync('token'))
  if (!recipeId.value) return
  // 已有狗狗时无需重复请求；为空则重新拉，让预告消失、新狗狗自动选中
  if (!dogs.value.length) {
    loadDogsForDetail()
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
  /**
   * 定制订单「看交付那一版」（2026-10-30）。
   *
   * 员工从工作台订单中心点进来时，会带上 `orderId=<定制单号>`；
   * 后端据此只返回**交付记录冻结的那一版**，绝不回退最新版。
   * 不带这个参数时行为不变（仍然是当前最新版）。
   */
  if (pinnedOrderId.value) {
    data.orderId = pinnedOrderId.value
  }
  const activeDogId = selectedDogId.value || dogId.value
  if (activeDogId) {
    data.dogId = activeDogId
  }
  if (selectedManualLifeStage.value) {
    data.lifeStage = selectedManualLifeStage.value
  }
  data.manual = selectedManualLifeStage.value ? 'true' : 'false'

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

      if (res.data.lifeStageMatch) {
        trackFunnelEvent({
          eventName: 'life_stage_bar_shown',
          step: 'detail',
          recipeId: selectedRecipeIdForActions.value,
          dogId: selectedDogId.value,
          properties: {
            matchType: res.data.lifeStageMatch.matchType,
            riskLevel: res.data.lifeStageMatch.riskLevel || 'NONE',
          },
        })
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
  /*
   * 2026-11-07 复审修：401 时 api 层会把 token 清掉，
   * 而 hasToken 原来只在 onMounted/onShow 更新 —— 重试会在
   * “没有 token 直接 return” 之后永远停在骨架屏（failed=false + loaded=false）。
   * 这里每次重新读 token 并同步 hasToken：没登录就是「请先建档」，不是「加载中」。
   */
  hasToken.value = Boolean(token)
  if (!token) {
    dogsLoaded.value = true
    return
  }

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
      dogsLoadFailed.value = false
      if (dogs.value.length > 0) {
        selectedDogId.value = initialDogId.value || dogId.value || uni.getStorageSync('dogId') || dogs.value[0].id
        if (!dogs.value.some((dog) => dog.id === selectedDogId.value)) {
          selectedDogId.value = dogs.value[0].id
        }
        dogId.value = selectedDogId.value
        uni.setStorageSync('dogId', selectedDogId.value)
        loadRecipeDetail()
      }
    } else {
      // 拿到了响应但结论不可用：按失败处理，别一直停在“读取中”
      dogsLoadFailed.value = true
    }
  } catch (error) {
    console.warn('[RecipeDetail] Load dogs failed:', error)
    dogsLoadFailed.value = true
  }
}

function syncSelectedDogFromMatch(matchedDogId?: string | null) {
  // 选中项与持久化都在 composable 里（含"列表外的不采纳"那条校验）
  syncFromMatch(matchedDogId)
  // 本页还有一个请求用的 dogId，跟着一起改
  if (matchedDogId) dogId.value = matchedDogId
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
  if (selectedManualLifeStage.value) {
    query.push(`lifeStage=${encodeURIComponent(selectedManualLifeStage.value)}`)
    query.push('manual=true')
  }
  return `/pages/recipe-diy/index?${query.join('&')}`
}

/** 成品订购配置页路由（登录后要直达的目标） */
function buildOrderRoute(): string {
  const query = [`recipeId=${encodeURIComponent(selectedRecipeIdForActions.value)}`]
  if (selectedDogId.value) {
    query.push(`dogId=${encodeURIComponent(selectedDogId.value)}`)
  }
  if (selectedManualLifeStage.value) {
    query.push(`lifeStage=${encodeURIComponent(selectedManualLifeStage.value)}`)
    query.push('manual=true')
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
  const token = uni.getStorageSync('token')
  // 未登录先引导登录，登录后直接进建档页，避免用户登录完还得再点一次
  if (!token) {
    promptLoginAndRedirect(
      '创建狗狗档案需要登录，登录后继续为你建档',
      buildDogCreateRoute({ source: 'recipe_detail', recipeId: recipeId.value }),
    )
    return
  }

  navigateToDogCreate({ source: 'recipe_detail', recipeId: recipeId.value })
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

function selectLifeStageVersionByStage(lifeStage: string) {
  if (!lifeStage) return
  const version = (recipe.value.availableLifeStageVersions || []).find(
    (item) => item.lifeStage === lifeStage,
  )
  if (!version) return
  selectedManualLifeStage.value = version.lifeStage
  lifeStageSelectorVisible.value = false
  loadRecipeDetail()
}

function goSuitableRecipes() {
  uni.reLaunch({ url: '/pages/home/index' })
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

/* 选狗器在页面里的外边距（组件本身不管外部间距） */
.recipe-detail-dog-selector {
  margin: 16rpx 0 18rpx;
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

/* 营养报告入口：外层只负责与页面其它卡片对齐的留白，卡片样式在组件里 */
.nutrition-report-card {
  margin: 20rpx;
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
  word-break: break-all;
  line-height: 1.4;
}

.ingredient-ratio {
  flex: 0 0 120rpx;
  font-size: 28rpx;
  font-weight: bold;
  color: #1e3a2f;
  text-align: right;
}

/* 配方分组（主料 / 需额外补充的营养素 / 其他物料） */
.ingredient-block {
  margin-top: 28rpx;
}

.ingredient-block--nutrients .ingredient-block-header {
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

/* 食材表与营养素块做底色区分 */
.ingredient-block--nutrients {
  padding: 20rpx;
  background-color: #f2f4ea;
  border: 1rpx solid #e5e8d4;
  border-radius: 16rpx;
}

.ingredient-block--nutrients .ingredient-block-title {
  color: #8a6b33;
}

.ingredient-block-count {
  font-size: 22rpx;
  color: #968f6d;
}

/* 需额外补充的营养素：营养素名 + 每公斤添加浓度（2026-11-07） */
.supplement-nutrient-head {
  display: flex;
  align-items: center;
  padding: 14rpx 0 10rpx;
  border-bottom: 1rpx solid #e5e8d4;
}

.supplement-nutrient-head-name {
  flex: 1;
  font-size: 22rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.supplement-nutrient-head-value {
  flex: 0 0 300rpx;
  font-size: 22rpx;
  font-weight: 700;
  text-align: right;
  color: #1e3a2f;
}

.supplement-nutrient-row {
  display: flex;
  align-items: baseline;
  padding: 18rpx 0;
  border-bottom: 1px dashed #e5e8d4;
}

.supplement-nutrient-name {
  flex: 1;
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}

.supplement-nutrient-value {
  flex: 0 0 300rpx;
  font-size: 24rpx;
  text-align: right;
  color: #b4553f;
}

.supplement-nutrient-note {
  display: block;
  margin-top: 18rpx;
  font-size: 21rpx;
  line-height: 1.6;
  color: #968f6d;
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
