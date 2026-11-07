<template>
  <view class="recipe-diy-page">
    <!-- 食谱信息卡片 -->
    <view class="section recipe-info-section">
      <!--
        食谱封面：与 DIY 制作单页同一写法（同一套 normalizeImageUrl + 占位态），
        整幅贴到卡片上边缘，不再被卡片内边距切开。
      -->
      <view class="recipe-cover-wrapper">
        <image
          v-if="recipe.coverImageUrl"
          :src="normalizeImageUrl(recipe.coverImageUrl)"
          class="recipe-cover"
          mode="aspectFill"
        />
        <view v-else class="recipe-cover-placeholder">
          <text class="placeholder-text">食谱封面</text>
        </view>
      </view>

      <view class="recipe-info-body">
        <view class="recipe-name-wrapper">
          <text class="recipe-name">{{ recipe.name }}</text>
        </view>

        <!-- 一句话卖点：与食谱详情页 / 成品订购页同一展示方式 -->
        <view v-if="recipe.sellingPoint" class="recipe-selling-point">
          <text class="recipe-selling-point-text">{{ recipe.sellingPoint }}</text>
        </view>

        <!--
          营养标准背书卡：原来把营养标准平铺成一行参数，
          和内部系统名并列，看起来像一张开发参数表。
          现在改成可点开的背书卡（与食谱详情页 / 成品订购页同一展示方式）。
        -->
        <view class="standard-card" @tap="toggleStandardExplain">
          <view class="standard-main">
            <text class="standard-badge">✓</text>
            <view class="standard-copy">
              <text class="standard-title">符合 {{ recipeNutritionStandardLabel }}</text>
              <text class="standard-sub">犬营养标准</text>
            </view>
          </view>
          <text class="standard-toggle">{{ standardExplainVisible ? '收起' : '说明' }}</text>
        </view>
        <view v-if="standardExplainVisible" class="standard-explain">
          <text class="standard-explain-text">{{ nutritionStandardExplain }}</text>
        </view>
      </view>
    </view>

    <!-- 选择爱犬（档案 + 喂食参数合并，对齐成品订购页） -->
    <view class="section dog-section">
      <view class="section-title">
        <text class="title-text">选择爱犬</text>
      </view>

      <!-- 选狗 + 六项读数：三页共用一个组件（2026-11-07） -->
      <view class="dog-feeding-content">
        <DogContextPanel
          :dogs="orderedDogs"
          :selected-id="selectedDogId"
          :state="dogPanelState"
          :daily-intake-g="displayDailyIntakeG"
          :per-meal-g="perMealG"
          hint="提示：请先选择爱犬以计算推荐饭量"
          @select="selectDog"
          @create-dog="goToCreateDog"
          @retry="retryDogsLoad"
        />

        <!-- 生命阶段与饭量说明只在“有档案”时出现；空档案/失败由组件自己提示 -->
        <block v-if="dogPanelState === 'ready'">
          <!-- 生命阶段版本条（2026-11-02）：紧贴所选狗狗；版本跟着狗走，可手动换版 -->
          <LifeStageVersionBar
            :state="lifeStageState"
            :dog-name="selectedDog?.name"
            :dog-stage="dogLifeStage"
            :dog-stage-label="dogLifeStageLabel"
            :current-label="selectedLifeStageLabel"
            :suggested-label="suggestedLifeStageVersion?.label"
            :suggested-stage="suggestedLifeStageVersion?.lifeStage"
            :version-count="lifeStageVersionOptions.length"
            @open-selector="versionSheetVisible = true"
            @select="switchLifeStageVersion"
            @see-suitable="goSuitableRecipes"
            @retry="loadRecipe"
            @add-dog="goToCreateDog"
          />

          <LifeStageVersionSheet
            :visible="versionSheetVisible"
            :versions="lifeStageVersionOptions"
            :current-stage="selectedLifeStage"
            :matched-stage="dogLifeStage"
            @close="versionSheetVisible = false"
            @select="switchLifeStageVersion"
          />

          <!-- 饭量计算失败：给出原因与重试，避免按钮永久灰着 -->
          <view v-if="dogCalcFailed" class="dog-calc-error" @tap="retryDogCalc">
            <text class="dog-calc-error-text">
              饭量计算失败，可能是网络波动。点这里重新计算。
            </text>
          </view>

          <!--
            饭量算法：默认收起。
            原来这里是「饭量计算过程」+ 5 张计算卡（DER / 零食能量 / 鲜食能量 / 每日饭量 / 每餐饭量，
            带公式与中间值），对顾客做决定帮助很小；
            现在改成成品订购页同款的 3 条人话 + 一句观察建议。
          -->
          <view class="feeding-note-toggle" @tap="toggleFeedingNote">
            <text class="feeding-note-toggle-text">每日饭量是怎么算的？</text>
            <text class="feeding-note-toggle-action">{{ feedingNoteExpanded ? '收起' : '展开' }}</text>
          </view>
          <view v-if="feedingNoteExpanded" class="feeding-adjustment-note">
            <text class="feeding-adjustment-line">① 按它的体重、年龄和每天的活动量，算出它一天大概需要多少热量；</text>
            <text class="feeding-adjustment-line">② 再根据它是偏胖还是偏瘦、每天吃多少零食，做相应增减；</text>
            <text class="feeding-adjustment-line">③ 用这个热量除以食谱每 100g 含的热量，就是每天的饭量。</text>
            <text class="feeding-adjustment-line feeding-adjustment-line--tip">这是首次喂食的保守估算。建议观察 2-4 周，按体重和便便情况增减 5%-10%。</text>
          </view>
        </block>
      </view>
    </view>

    <!-- 配置天数与分装 -->
    <view class="section cycle-section" v-if="selectedDog">
      <view class="section-title">
        <!-- 已有默认值（7 天），不再打红星，避免让人以为必须动它 -->
        <text class="title-text">快速选择备餐天数</text>
      </view>

      <QuickCyclePackagePlan
        ref="packagePlanSection"
        :cycle-days="selectedCycleDays"
        :package-plan="packagePlan"
        :is-custom="isCustomPackagePlan"
        :editor-open="showPackageEditor"
        :summary-text="packagePlanInlineSummaryText"
        :warnings="packagePlanWarnings"
        @select-cycle="selectCycle"
        @toggle-custom="togglePackageEditor"
        @add-row="addPackagePlanRow"
        @update-row="updatePackagePlanRow"
        @remove-row="removePackagePlanRow"
      />
    </view>

    <!-- 底部操作按钮 -->
    <view class="bottom-bar">
      <!-- 仅在按钮不可用或计算失败时才出小字，平时不显示说明 -->
      <view v-if="generateBlockReason || dogCalcFailed" class="bottom-bar-hint">
        <text v-if="generateBlockReason" class="bottom-bar-block-reason">
          {{ generateBlockReason }}
        </text>
        <text
          v-if="dogCalcFailed"
          class="bottom-bar-retry"
          @tap="retryDogCalc"
        >
          重新计算
        </text>
      </view>

      <view class="bottom-bar-actions">
        <CustomerServiceInlineButton
          compact
          label="Seven爸爸"
          :source-type="orderId ? 'ORDER' : 'GENERAL'"
          :order-id="orderId"
          :order-no="orderId"
          :title="orderId ? `定制订单 ${orderId}` : 'DIY 制作咨询'"
          path="/pages/recipe-diy/index"
        />
        <button
          class="btn-generate"
          :disabled="!canGenerateSheet || isGeneratingSheet"
          @tap="generateSheet"
        >
          生成制作单
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import { trackFunnelEvent } from '../../utils/funnel'
import { navigateToDogCreate } from '../../utils/dog-profile-entry'
import { getNutritionStandardExplain, getNutritionStandardLabel } from '../../utils/label-mapping'
import {
  confirmLifeStageMismatch,
  getLifeStageLabel,
} from '../../utils/life-stage-match'
import LifeStageVersionBar from '@/components/recipe/LifeStageVersionBar.vue'
import DogContextPanel from '@/components/dog/DogContextPanel.vue'
import LifeStageVersionSheet from '@/components/recipe/LifeStageVersionSheet.vue'
import CustomerServiceInlineButton from '@/components/CustomerServiceInlineButton.vue'
import QuickCyclePackagePlan from '@/components/package-plan/QuickCyclePackagePlan.vue'
import { useDogSelection } from '@/composables/useDogSelection'
import { usePackagePlan } from '@/composables/usePackagePlan'
import { useLifeStageVersion } from '@/composables/useLifeStageVersion'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  ORDER_CYCLE_OPTIONS,
  buildDefaultPackagePlan,
  type PackagePlanItem,
} from '../../utils/order-package-plan'

interface Dog {
  id: string
  name: string
  breedName: string
  breedId: string
  currentWeightKg: number
  mealsPerDay: number
  birthday?: string
  ageText?: string
  gender?: string
  activityLevel?: string
  lifeStageOverride?: string
  avatarUrl?: string
  breed?: {
    adultAgeMonths: number
    seniorAgeYears: number
  }
}

interface Recipe {
  id: string
  selectedRecipeId?: string
  selectedLifeStage?: string
  selectedLifeStageLabel?: string
  availableLifeStageVersions?: RecipeLifeStageVersion[]
  name: string
  sellingPoint?: string
  coverImageUrl?: string
  energyDensityKcalPerKg: number
  nutritionStandard: string
  nutritionDetailedData: {
    energyDensityKcalPerKg: number
  }
  designSource?: string
  applicableLifeStages: string[]
  targetHealthTags: string[]
}

interface RecipeLifeStageVersion {
  recipeId?: string
  lifeStage: string
  label?: string
  isSelected?: boolean
  selected?: boolean
}


const recipeId = ref('')
/**
 * 定制订单号（2026-10-24）。
 *
 * 从「我的定制食谱」点「自己做」进来时带上，后端据此按**交付那一版**取食谱；
 * 从橱窗进来时为空，行为与原来完全一致（取最新版）。
 */
const orderId = ref('')
const shareToken = ref('')
const selectedLifeStage = ref('')
const recipe = ref<Recipe>({
  id: '',
  selectedRecipeId: undefined,
  selectedLifeStage: undefined,
  selectedLifeStageLabel: undefined,
  availableLifeStageVersions: [],
  name: '',
  energyDensityKcalPerKg: 0,
  nutritionStandard: '',
  nutritionDetailedData: {
    energyDensityKcalPerKg: 0
  },
  applicableLifeStages: [],
  targetHealthTags: []
})
// 营养标准背书卡（与食谱详情页 / 成品订购页同一展示方式）
const recipeNutritionStandardLabel = computed(() =>
  getNutritionStandardLabel(recipe.value.nutritionStandard || 'FEDIAF_2021')
)
const nutritionStandardExplain = computed(() =>
  getNutritionStandardExplain(recipe.value.nutritionStandard || 'FEDIAF_2021')
)
const standardExplainVisible = ref(false)

function toggleStandardExplain() {
  standardExplainVisible.value = !standardExplainVisible.value
}

/**
 * 选狗状态（2026-10-18 收进 composable，泛型绑定 `Dog`）。
 *
 * ⚠️ 注意 `selectedDog` 原来是**存的副本**（`selectedDog.value = dog`），
 * 不是从 `dogs` 算出来的 —— 列表一刷新它就可能变旧。
 * composable 里它是 computed，跟着 `dogs` 走，**顺手修掉了这个隐患**。
 */
const {
  dogs,
  selectedDogId,
  selectedDog,
  setDogs,
  select: selectDogState,
} = useDogSelection<Dog>()

/**
 * 选中的爱犬排第一位（2026-10-24 老板定）。
 *
 * 横向选择器里狗一多，选中的那只可能滚在屏幕外；
 * 把它放到最前面，再配合 scroll-into-view，选中后一定在最左边。
 */
const orderedDogs = computed(() => {
  const selectedId = selectedDogId.value
  if (!selectedId) return dogs.value
  const selected = dogs.value.find((dog) => dog.id === selectedId)
  if (!selected) return dogs.value
  return [selected, ...dogs.value.filter((dog) => dog.id !== selected.id)]
})

// 列表加载失败与「没有档案」是两件事：失败时若显示"暂无档案"会诱导重复建档
const dogsLoadFailed = ref(false)
// 首次拉列表期间给骨架：原来这一段是“先闪一下暂无档案，再出现胶囊”
const dogsLoading = ref(false)
const isGeneratingSheet = ref(false)
const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 生命阶段校验
/**
 * 生命阶段状态（2026-10-18 收进 composable）。
 *
 * 本页与其它三页的**真实差异**（对比后加进 composable 的可选参数）：
 *   ① 顾客能手动切版本 → 查询要带 `lifeStage`
 *   ② 每次拿到结论要把 `showWarning` 置回 `true`（切版本后提醒要重新出现）
 *   ③ 取消选狗时要**重置**三个状态，否则会挂着上次的"不匹配"假警报
 */
const {
  state: lifeStageState,
  riskLevel: lifeStageRisk,
  dogLifeStage,
} = useLifeStageVersion({
  verdict: () => recipe.value?.lifeStageMatch,
  dogId: () => selectedDogId.value,
  applicableStages: () => recipe.value.applicableLifeStages,
  dogName: () => selectedDog.value?.name,
})

const manualLifeStage = ref('')
const versionSheetVisible = ref(false)
/** 本次生成制作单已确认过高风险提醒（换狗/换版即作废） */
const acknowledgedForSheet = ref(false)
/**
 * 生命阶段匹配结论 —— **由后端给出**（2026-09-19 起不再前端自己算）。
 * 前端重算认不出混血犬的体型，算不出时还会被当成"匹配"静默放行。
 */


const dogLifeStageLabel = computed(
  () => recipe.value?.lifeStageMatch?.dogLifeStageLabel || (dogLifeStage.value ? getLifeStageLabel(dogLifeStage.value) : ''),
)
const selectedLifeStageLabel = computed(() => {
  const stage = selectedLifeStage.value || recipe.value.selectedLifeStage || ''
  if (!stage) return ''
  const version = recipe.value.availableLifeStageVersions?.find(
    (item) => item.lifeStage === stage,
  )
  return getLifeStageLabel(stage)
})
const lifeStageVersionOptions = computed(() =>
  (recipe.value.availableLifeStageVersions || []).map((version) => ({
    recipeId: version.recipeId,
    lifeStage: version.lifeStage,
    label: getLifeStageLabel(version.lifeStage),
  })),
)
const suggestedLifeStageVersion = computed(() => {
  const targetLifeStage = dogLifeStage.value
  if (!targetLifeStage) return null
  const current = selectedLifeStage.value || recipe.value.selectedLifeStage || manualLifeStage.value || ''
  const version = recipe.value.availableLifeStageVersions?.find(
    (item) => item.lifeStage === targetLifeStage,
  )
  if (!version || version.lifeStage === current) return null
  return {
    ...version,
    label: getLifeStageLabel(version.lifeStage),
  }
})

function goSuitableRecipes() {
  uni.reLaunch({ url: '/pages/home/index' })
}
/**
 * 分装区当前的问题清单。
 *
 * DIY 页只生成制作单、不涉及下单，所以**不显示 1000g 起订量**提示 ——
 * 在这里提"起订量"会让人以为现在买不了。
 */
const packagePlanWarnings = computed(() =>
  packagePlanValidationMessage.value ? [packagePlanValidationMessage.value] : [],
)
const canGenerateSheet = computed(() => Boolean(
  selectedDogId.value
  && displayDailyIntakeG.value > 0
  && perMealG.value > 0
  && normalizedPackagePlan.value.length > 0
  && !packagePlanValidationMessage.value
))

/**
 * 「生成制作单」按钮不可点时的真实原因。
 * 之前按钮只变灰、不说理由（饭量接口失败时还会永久锁死），
 * 这里把原因显式落在按钮上方，用户不用猜、也不用干等。
 */
const generateBlockReason = computed(() => {
  if (!selectedDogId.value) {
    return '请先在上方选择要制作的爱犬'
  }
  // 正在算饭量时不提示：正常加载过程不该在按钮上方闪一行小字
  if (isLoadingDogCalc.value) {
    return ''
  }
  if (dogCalcFailed.value) {
    return '饭量计算失败，请点击重新计算'
  }
  if (!(displayDailyIntakeG.value > 0)) {
    return '还没算出每日饭量，暂时无法生成制作单'
  }
  if (!(perMealG.value > 0)) {
    return '每餐饭量异常，请检查狗狗档案里的体重信息'
  }
  if (packagePlanValidationMessage.value) {
    return packagePlanValidationMessage.value
  }
  return ''
})

// 饭量相关
const dogCalcResult = ref<any>(null)
const displayDailyIntakeG = ref(0)
const perMealG = ref(0)
const isPerMealModified = ref(false)
const isEditingPerMeal = ref(false)
const tempPerMealG = ref(0)
// 饭量计算状态：失败时必须能被解释、能被重试，否则按钮会永久灰着且没有理由
const isLoadingDogCalc = ref(false)
const dogCalcFailed = ref(false)

/**
 * 分装计划（2026-10-18 收进 composable）。
 *
 * 这 6 个 ref + 9 个函数原来在本页和**成品订购页**各写一遍，一字不差。
 * 参数用**函数**传（饭量会随选狗变，传值会拿到第一次的快照）。
 */
const {
  selectedCycleDays,
  lastSelectedCycleDays,
  packagePlan,
  packagePlanDogId,
  showPackageEditor,
  isCustomPackagePlan,
  normalizedPackagePlan,
  totalGrams,
  totalPackages,
  inlineSummaryText: packagePlanInlineSummaryText,
  validationMessage: packagePlanValidationMessage,
  normalizePackageSpecValue,
  normalizePackagePlanRow,
  rebuildPackagePlan,
  resetPackagePlan,
  togglePackageEditor,
  cancelCustomPackagePlan,
  addPackagePlanRow,
  updatePackagePlanRow,
  removePackagePlanRow,
  getPrimaryPackageSpecG,
} = usePackagePlan({
  dailyIntakeG: () => displayDailyIntakeG.value,
  mealsPerDay: () => selectedDog.value?.mealsPerDay,
  dogId: () => selectedDogId.value,
  perMealG: () => perMealG.value,
})

/** 分装区组件实例：生成制作单前调 commitAll()，不丢没失焦的输入 */
const packagePlanSection = ref<{ commitAll: () => void } | null>(null)

// 「每日饭量是怎么算的？」展开状态
const feedingNoteExpanded = ref(false)
const initialDogId = ref('')
/** onLoad 里的路由参数：比 onMounted 里翻页面栈更可靠 */
const routeDogId = ref('')

onLoad((options) => {
  routeDogId.value = options?.dogId
    ? decodeURIComponent(String(options.dogId))
    : ''
})

onMounted(async () => {
  console.log('========== [RecipeDiy] onMounted ==========')

  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  console.log('[页面参数]', options)

  recipeId.value = options.recipeId || ''
  orderId.value = options.orderId || ''
  shareToken.value = options.shareToken || ''
  initialDogId.value = routeDogId.value || options.dogId || ''
  selectedLifeStage.value = options.lifeStage || ''
  manualLifeStage.value = options.lifeStage || ''
  console.log('[食谱ID]', recipeId.value, '[订单]', orderId.value)

  /**
   * 从定制食谱进来时，这一页就是「自己做」——
   * 导航标题跟着按钮文案走，顾客不会觉得点进了另一个功能。
   */
  if (orderId.value) {
    uni.setNavigationBarTitle({ title: '自己做' })
  }

  if (recipeId.value) {
    /*
     * 2026-11-07 复审修：从第一个 await 之前就进「读取中」。
     * 原来 dogsLoading 要等 loadDogs 开始才置位，而它排在健康标签和食谱之后，
     * 弱网下这中间几秒显示的是「请先创建狗狗档案」+ 可点的建档按钮。
     */
    dogsLoading.value = true
    try {
      // 【修复】先加载健康标签映射
      await loadHealthTagMapping()
      // 【修复】确保品种列表先加载完成，再加载食谱和狗狗数据
      await loadRecipe()
      await loadDogs()
    } finally {
      dogsLoading.value = false
    }
  }

  console.log('========== [RecipeDiy] onMounted 结束 ==========')
})

/**
 * 从建档页返回时本页不会重新挂载，之前只靠 onMounted 拉一次列表，
 * 导致「已建档却仍显示暂无狗狗档案」，用户只能再点一次。
 */
onShow(() => {
  if (!recipeId.value) return
  if (!dogs.value.length) {
    void loadDogs()
  }
})


let recipeRequestSeq = 0

async function loadRecipe() {
  console.log('[RecipeDiy] loadRecipe 开始, recipeId:', recipeId.value)
  const requestSeq = ++recipeRequestSeq
  const requestDogId = selectedDogId.value

  try {
    const requestData: Record<string, string> = {}
    if (manualLifeStage.value) {
      requestData.lifeStage = manualLifeStage.value
    }
    requestData.manual = manualLifeStage.value ? 'true' : 'false'
    if (selectedDogId.value) {
      requestData.dogId = selectedDogId.value
    }
    if (shareToken.value) {
      requestData.shareToken = shareToken.value
    }
    // 定制场景：按交付记录冻结的那一版取食谱（后端据此解析版本）
    if (orderId.value) {
      requestData.orderId = orderId.value
    }

    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET',
      data: requestData
    })

    if (requestSeq !== recipeRequestSeq || requestDogId !== selectedDogId.value) {
      return
    }
    console.log('[RecipeDiy] loadRecipe API响应:', res)

    if (res.code === 0 && res.data) {
      recipe.value = {
        ...res.data,
        availableLifeStageVersions: res.data.availableLifeStageVersions || [],
      }
      if (!manualLifeStage.value && res.data.selectedLifeStage) {
        selectedLifeStage.value = res.data.selectedLifeStage
      }
      if (res.data.selectedRecipeId || res.data.id) {
        recipeId.value = res.data.selectedRecipeId || res.data.id
      }
      trackFunnelEvent({
        eventName: 'life_stage_bar_shown',
        step: 'diy_page',
        recipeId: recipeId.value,
        dogId: selectedDogId.value,
        properties: {
          state: lifeStageState.value,
          matchType: res.data.lifeStageMatch?.matchType || null,
          riskLevel: res.data.lifeStageMatch?.riskLevel || 'NONE',
        },
      })
      console.log('[RecipeDiy] 食谱信息加载成功:', res.data)
    }
  } catch (error) {
    console.error('[RecipeDiy] Load recipe error:', error)
    uni.showToast({
      title: '加载失败',
      icon: 'none'
    })
  }

  console.log('[RecipeDiy] loadRecipe 结束')
}

async function loadHealthTagMapping() {
  try {
    const res = await request({
      url: '/recipes/filter-options',
      method: 'GET'
    })
    if (res.code === 0 && res.data?.healthTags) {
      const uuidMap: Record<string, string> = {}
      if (Array.isArray(res.data.healthTags)) {
        res.data.healthTags.forEach((tag: any) => {
          if (tag.value && tag.label) {
            uuidMap[tag.value] = tag.label
          }
        })
      }
      healthTagUuidLabelMap.value = uuidMap
      console.log('[RecipeDiy] 健康标签映射表加载完成，共', Object.keys(uuidMap).length, '个标签')
    }
  } catch (error) {
    console.error('Load health tag mapping error:', error)
  }
}

async function loadDogs() {
  console.log('[RecipeDiy] loadDogs 开始')

  dogsLoading.value = true
  dogsLoadFailed.value = false

  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })

    console.log('[RecipeDiy] loadDogs API响应:', res)

    if (res.code === 0 && res.data) {
      /**
       * 灌列表（2026-10-18）。
       *
       * ⚠️ `setDogs` 会**自动校正 `selectedDogId`** —— 所以下面**不能**再写
       * `if (!selectedDogId.value)` 才会选：那样 `selectDog()` 永远不跑，
       * **饭量计算和生命阶段检查就废了**。
       *
       * 这里改成：灌完列表**无条件**调一次 `selectDog(preferred)` ——
       * 它除了选中，还要重新加载菜谱 + `loadDogCalc`。
       */
      setDogs(res.data)
      console.log('[RecipeDiy] 狗狗列表加载成功, 数量:', res.data.length)

      // 自动选择狗狗（优先使用详情页传入，其次使用本地缓存）
      if (res.data.length > 0) {
        const preferredDogId = initialDogId.value || uni.getStorageSync('dogId') || ''
        const preferredDog = res.data.find((dog: Dog) => dog.id === preferredDogId) || res.data[0]
        console.log('[RecipeDiy] 自动选择狗狗:', preferredDog)

        await selectDog(preferredDog.id)
      }
    } else {
      // 拿到了响应但结论不可用：按失败处理，不能显示成「暂无档案」
      dogsLoadFailed.value = true
      setDogs([])
    }
  } catch (error) {
    console.error('[RecipeDiy] Load dogs error:', error)
    dogsLoadFailed.value = true
    setDogs([])
  } finally {
    dogsLoading.value = false
  }

  console.log('[RecipeDiy] loadDogs 结束')
}

/** 狗狗档案加载失败后的重试入口 */
async function retryDogsLoad() {
  dogsLoadFailed.value = false
  await loadDogs()
}

/**
 * 狗狗面板的四种状态（组件只管好看，判断留在页面）。
 * 失败优先于空 —— 否则“加载失败”会被说成“还没有档案”，顾客会去重复建档。
 */
const dogPanelState = computed<'loading' | 'error' | 'empty' | 'ready'>(() => {
  if (dogsLoadFailed.value) return 'error'
  if (dogsLoading.value) return 'loading'
  if (dogs.value.length === 0) return 'empty'
  return 'ready'
})

async function selectDog(dogId: string) {
  if (!dogId) return

  const dog = dogs.value.find(item => item.id === dogId)
  if (!dog) return

  manualLifeStage.value = ''
  acknowledgedForSheet.value = false
  selectDogState(dog.id)
  isCustomPackagePlan.value = false
  showPackageEditor.value = false
  packagePlan.value = []
  packagePlanDogId.value = null
  resetDiyLifeStageDependentState()

  await loadRecipe()
  await loadDogCalc(dog.id)
}

let dogCalcRequestSeq = 0

async function loadDogCalc(dogId: string) {
  const requestSeq = ++dogCalcRequestSeq
  console.log('========== [RecipeDiy] loadDogCalc 开始 ==========')
  console.log('[调用参数]', { dogId, recipeId: recipeId.value })

  isLoadingDogCalc.value = true
  dogCalcFailed.value = false

  try {
    const res = await request({
      url: `/dogs/${dogId}/calc-for-recipe`,
      method: 'POST',
      data: { recipeId: recipeId.value }
    })

    console.log('[API响应]', res)

    if (requestSeq !== dogCalcRequestSeq) {
      return
    }
    if (res.code === 0 && res.data) {
      dogCalcResult.value = res.data
      displayDailyIntakeG.value = res.data.dailyIntakeG
      perMealG.value = res.data.perMealIntakeG
      isPerMealModified.value = false
      rebuildPackagePlan()

      console.log('[计算结果]', {
        dailyIntakeG: res.data.dailyIntakeG,
        perMealIntakeG: res.data.perMealIntakeG,
        totalDer: res.data.totalDer,
        finalFoodKcal: res.data.finalFoodKcal
      })
    } else {
      console.error('[API返回错误]', res)
      dogCalcResult.value = null
      displayDailyIntakeG.value = 0
      perMealG.value = 0
      dogCalcFailed.value = true
      uni.showToast({
        title: res.message || '计算失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('[API调用异常]', error)
    dogCalcResult.value = null
    displayDailyIntakeG.value = 0
    perMealG.value = 0
    dogCalcFailed.value = true
    uni.showToast({
      title: '计算失败',
      icon: 'none'
    })
  } finally {
    isLoadingDogCalc.value = false
  }

  console.log('========== [RecipeDiy] loadDogCalc 结束 ==========')
}

/** 饭量计算失败后的重试入口（原来失败即永久锁死，只能退出重进） */
function retryDogCalc() {
  if (!selectedDogId.value) return
  void loadDogCalc(selectedDogId.value)
}


function resetDiyLifeStageDependentState() {
  dogCalcResult.value = null
  displayDailyIntakeG.value = 0
  perMealG.value = 0
  isPerMealModified.value = false
  isEditingPerMeal.value = false
  packagePlan.value = []
  packagePlanDogId.value = null
}

async function switchLifeStageVersion(lifeStage: string) {
  if (!lifeStage || lifeStage === selectedLifeStage.value) return

  acknowledgedForSheet.value = false
  manualLifeStage.value = lifeStage
  selectedLifeStage.value = lifeStage
  versionSheetVisible.value = false
  resetDiyLifeStageDependentState()

  await loadRecipe()
  if (selectedDogId.value) {
    await loadDogCalc(selectedDogId.value)
  }
}

function startEditPerMeal() {
  isEditingPerMeal.value = true
  tempPerMealG.value = perMealG.value
}

function onTempPerMealChange() {
  // 输入验证
  if (tempPerMealG.value < 0) {
    tempPerMealG.value = 0
  }
}

function savePerMeal() {
  if (tempPerMealG.value <= 0) {
    uni.showToast({
      title: '请输入有效的饭量',
      icon: 'none'
    })
    return
  }

  perMealG.value = tempPerMealG.value
  isPerMealModified.value = true
  isEditingPerMeal.value = false
}

function cancelEditPerMeal() {
  isEditingPerMeal.value = false
  tempPerMealG.value = perMealG.value
}

function resetPerMeal() {
  if (dogCalcResult.value) {
    perMealG.value = dogCalcResult.value.perMealIntakeG
    isPerMealModified.value = false
  }
}

function toggleFeedingNote() {
  feedingNoteExpanded.value = !feedingNoteExpanded.value
}

function selectCycle(days: number) {
  if (isCustomPackagePlan.value) {
    uni.showToast({
      title: '请先取消自定义分装后再切换配置天数',
      icon: 'none'
    })
    return
  }

  selectedCycleDays.value = days
  lastSelectedCycleDays.value = days
  showPackageEditor.value = false
  rebuildPackagePlan()
}

async function generateSheet() {
  // 顾客可能打完数字直接点按钮（没失焦），先提交，别把这次输入丢掉
  packagePlanSection.value?.commitAll()
  if (isGeneratingSheet.value) {
    return
  }

  if (!selectedDogId.value) {
    uni.showToast({
      title: '请先选择狗狗档案',
      icon: 'none'
    })
    return
  }

  if (!canGenerateSheet.value) {
    // 原来这里一律说「生成中，请稍后」，把计算失败也当成在算，用户会一直等
    uni.showToast({
      title: generateBlockReason.value || '暂时无法生成制作单',
      icon: 'none'
    })
    return
  }

  if (packagePlanValidationMessage.value) {
    uni.showToast({
      title: packagePlanValidationMessage.value,
      icon: 'none'
    })
    return
  }

  // 2026-11-02：只有高风险（幼犬/繁殖期选错）才在生成前确认一次，并留痕。
  if (lifeStageRisk.value === 'HIGH' && !acknowledgedForSheet.value) {
    const confirmed = await confirmLifeStageMismatch({
      recipeId: recipeId.value,
      dogId: selectedDog.value?.id || selectedDogId.value || '',
      verdict: recipe.value.lifeStageMatch || null,
      source: 'diy',
      dogName: selectedDog.value?.name,
      dogAgeText: (selectedDog.value as any)?.ageText || '',
      dogStage: dogLifeStage.value,
      currentVersionLabel: selectedLifeStageLabel.value,
    })
    if (!confirmed) {
      goSuitableRecipes()
      return
    }
    acknowledgedForSheet.value = true
  }

  void generateAndNavigateToSheet()
}

async function generateAndNavigateToSheet() {
  if (!selectedDogId.value || isGeneratingSheet.value) {
    return
  }

  isGeneratingSheet.value = true
  uni.showLoading({ title: '生成中...' })

  try {
    await request({
      url: `/recipes/${recipeId.value}/diy-sheet`,
      method: 'POST',
      data: {
        dogId: selectedDogId.value,
        ...(orderId.value ? { orderId: orderId.value } : {}),
        ...(shareToken.value ? { shareToken: shareToken.value } : {})
      }
    })

    uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')
    acknowledgedForSheet.value = false
    navigateToSheet()
  } catch (error) {
    console.error('[RecipeDiy] Generate sheet error:', error)
  } finally {
    safeHideLoading()
    isGeneratingSheet.value = false
  }
}

function safeHideLoading() {
  try {
    uni.hideLoading({
      fail: () => {}
    } as any)
  } catch {
    // 页面跳转后 loading 可能已被微信自动清理，真机调试下忽略即可。
  }
}

function navigateToSheet() {
  const params = {
    recipeId: recipeId.value,
    dogId: selectedDogId.value,
    // 2026-11-01：制作单不再有天数（单位只有袋和克），不再往下传
    perMealG: Math.round(perMealG.value),
    isPerMealModified: isPerMealModified.value,
    dailyIntakeG: Math.round(displayDailyIntakeG.value),
    packageCount: totalPackages.value,
    packageSpecG: getPrimaryPackageSpecG(normalizedPackagePlan.value),
    packagePlan: JSON.stringify(normalizedPackagePlan.value),
    // 把「顾客点的是哪一档天数 / 是否自定义」一起带过去：
    // 制作单本身不存天数，但这层选择要能在补剂下单页原样亮出来
    ...(isCustomPackagePlan.value
      ? { custom: '1' }
      : { custom: '0', cycleDays: String(selectedCycleDays.value ?? '') }),
    ...(orderId.value ? { orderId: orderId.value } : {}),
    ...(shareToken.value ? { shareToken: shareToken.value } : {})
  }

  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')

  // 跳转到制作单页面
  uni.navigateTo({
    url: `/pages/diy-sheet/index?${queryString}`
  })
}

function goToCreateDog() {
  navigateToDogCreate({ source: 'recipe_diy', recipeId: recipeId.value })
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

</script>

<style scoped>
/* 后端结论未取到：既不静默放行，也不误报"不匹配"，给一条中性提示 */
.life-stage-unknown-note {
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 10rpx;
  background-color: #f7f8f2;
  border: 1rpx solid var(--sk-line, #e3e6d4);
}

.life-stage-unknown-text {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--sk-ink-2, #6b6653);
}

.recipe-diy-page {
  min-height: 100vh;
  background-color: #fbfcf7;
  padding-bottom: 200rpx;
}

.section {
  background-color: #fbfcf7;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.title-text {
  font-size: 30rpx;
  font-weight: bold;
  color: #26261f;
}

/* 食谱信息卡片 */
/* 封面整幅贴到卡片上边缘，正文内边距交给 .recipe-info-body */
.recipe-info-section {
  padding: 0;
  overflow: hidden;
}

.recipe-cover-wrapper {
  width: 100%;
  height: 400rpx;
  position: relative;
}

.recipe-cover {
  width: 100%;
  height: 100%;
}

.recipe-cover-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  font-size: 36rpx;
  color: #f3eddd;
  font-weight: bold;
}

.recipe-info-body {
  padding: 32rpx 24rpx;
}

.recipe-name-wrapper {
  text-align: center;
  margin-bottom: 24rpx;
}

.recipe-name {
  font-size: 40rpx;
  font-weight: bold;
  color: #26261f;
  display: block;
}

.health-tag {
  background-color: #f6efe0;
  color: #8a6b33;
}

.nutrition-item .label {
  font-size: 24rpx;
  color: #6b6653;
}

.nutrition-item .value {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.dog-picker {
  padding: 24rpx;
  background-color: #ffffff;
  border: 2rpx solid #1e3a2f;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(30, 46, 36, 0.1);
}

.picker-placeholder {
  font-size: 28rpx;
  color: #b08d4f;
  font-weight: 500;
}

.dog-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dog-text {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 500;
}

.picker-check {
  font-size: 32rpx;
  color: #1e3a2f;
  font-weight: bold;
}

.dog-feeding-content {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

/* 警告卡片 */
.warning-card {
  background-color: var(--sk-danger-soft, #f7e9e3);
  border: 1rpx solid var(--sk-danger, #b4553f);
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
  color: var(--sk-danger, #b4553f);
}

.warning-text {
  font-size: 26rpx;
  color: var(--sk-danger, #b4553f);
  line-height: 1.6;
  display: block;
  margin-bottom: 8rpx;
}

.warning-actions {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 16rpx;
}

.btn-switch-stage,
.btn-continue {
  width: 100%;
  padding: 16rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;
}

.btn-switch-stage {
  background-color: #1e3a2f;
  color: #f3eddd;
}

.btn-continue {
  background-color: var(--sk-danger, #b4553f);
  color: #fff;
}

/* 饭量配置 */
.feeding-info {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.feeding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.feeding-value.readonly {
  color: #26261f;
}

.feeding-adjustment-note {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  background-color: #eef2e4;
  border: 1rpx solid #e5e8d4;
  border-radius: 8rpx;
}

.feeding-adjustment-title {
  font-size: 25rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.feeding-adjustment-copy {
  font-size: 24rpx;
  line-height: 1.6;
  color: #26261f;
}

.feeding-value-wrapper {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.feeding-edit-wrapper {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.feeding-input-small {
  width: 120rpx;
  height: 60rpx;
  padding: 0 12rpx;
  border: 1rpx solid #e5e8d4;
  border-radius: 6rpx;
  font-size: 28rpx;
  text-align: center;
}

.feeding-unit {
  font-size: 26rpx;
  color: #26261f;
}

.btn-edit,
.btn-save,
.btn-cancel,
.btn-reset {
  padding: 12rpx 24rpx;
  border-radius: 6rpx;
  font-size: 26rpx;
  border: none;
}

.btn-edit {
  background-color: #1e3a2f;
  color: #f3eddd;
}

.btn-reset {
  background-color: #b4553f;
  color: #f3eddd;
}

.btn-save {
  background-color: #1e3a2f;
  color: #f3eddd;
}

.btn-cancel {
  background-color: #f2f4ea;
  color: #26261f;
}

/* 周期选择 */
.custom-cycle-inline {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 20rpx 16rpx;
  background-color: #fbfcf7;
  border: 2rpx solid #e5e8d4;
  border-radius: 12rpx;
}

.custom-label {
  font-size: 26rpx;
  color: #26261f;
}

.custom-input-white {
  width: 80rpx;
  height: 56rpx;
  text-align: center;
  border: 2rpx solid #e5e8d4;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #26261f;
  background-color: #fbfcf7;
}

.custom-unit {
  font-size: 24rpx;
  color: #6b6653;
}

.btn-confirm-custom {
  padding: 8rpx 16rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border: none;
  border-radius: 8rpx;
  font-size: 24rpx;
  line-height: 1.2;
  margin-left: 8rpx;
}

.custom-days-display {
  font-size: 26rpx;
  font-weight: bold;
  color: #b08d4f;
  padding: 0 12rpx;
}

.btn-edit-custom {
  padding: 8rpx 20rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border: none;
  border-radius: 8rpx;
  font-size: 24rpx;
  line-height: 1.2;
  margin-left: 8rpx;
}

/* 底部操作栏 */
/* 营养标准背书卡（与食谱详情页同一展示方式） */
.standard-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding: 22rpx 24rpx;
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
  margin-top: 10rpx;
  padding: 20rpx 24rpx;
  background-color: #f2f4ea;
  border-radius: 12rpx;
}

.standard-explain-text {
  font-size: 24rpx;
  line-height: 1.7;
  color: #6b6653;
}

/* 狗狗档案加载失败（区别于"未建档"空态） */
/* 一句话卖点：与食谱详情页保持同一视觉语言 */
.recipe-selling-point {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  background: rgba(176, 141, 79, 0.08);
  border-left: 6rpx solid #b08d4f;
  border-radius: 10rpx;
}

.recipe-selling-point-text {
  font-size: 26rpx;
  line-height: 1.55;
  color: #6b6653;
}

.hero-dog-action,
.btn-secondary-full {
  border-radius: 8rpx;
  border: 2rpx solid #1e3a2f;
  color: #1e3a2f;
  background-color: #fbfcf7;
  font-size: 26rpx;
  text-align: center;
}

.feeding-note-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14rpx;
  padding: 12rpx 4rpx;
}

.feeding-note-toggle-text {
  font-size: 24rpx;
  color: #6b6653;
}

.feeding-note-toggle-action {
  font-size: 24rpx;
  color: #b08d4f;
}

.feeding-adjustment-line {
  font-size: 24rpx;
  line-height: 1.6;
  color: #26261f;
}

/* 最后一行是建议，和上面三步的计算说明分开一点 */
.feeding-adjustment-line--tip {
  margin-top: 10rpx;
  color: #6b6653;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background-color: #fbfcf7;
  border-top: 1rpx solid #e5e8d4;
  z-index: 100;
}

.bottom-bar-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding: 0 8rpx;
}

.bottom-bar-block-reason {
  font-size: 21rpx;
  line-height: 1.4;
  color: #b23a2f;
}

.bottom-bar-retry {
  flex-shrink: 0;
  font-size: 21rpx;
  font-weight: 600;
  color: #1e3a2f;
  text-decoration: underline;
}

/* 饭量计算失败的提示与重试 */
.dog-calc-error {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  background-color: #fdf3f1;
  border: 1rpx solid #f0d2cc;
  border-radius: 8rpx;
}

.dog-calc-error-text {
  font-size: 23rpx;
  line-height: 1.5;
  color: #b23a2f;
}

.btn-generate {
  flex: 1;
  min-width: 0;
  width: auto;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
}

.btn-generate[disabled] {
  background-color: #f2f4ea;
  color: #6b6653;
}

/* 底栏两颗：找 Seven爸爸 + 生成制作单（2026-10-24） */
.bottom-bar-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

</style>
