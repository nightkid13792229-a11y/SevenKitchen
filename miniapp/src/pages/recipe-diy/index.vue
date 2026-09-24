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

      <!--
        加载失败 ≠ 没有档案：失败时若退化成「暂无狗狗档案」，
        顾客可能因此重复建档。这里给独立失败态 + 重试。
      -->
      <view v-if="dogsLoadFailed" class="dogs-load-error">
        <text class="dogs-load-error-title">狗狗档案加载失败</text>
        <text class="dogs-load-error-copy">请检查网络后重试，避免重复建档</text>
        <button
          class="section-action-button dogs-load-error-btn button-reset"
          @tap="retryDogsLoad"
        >
          重新加载
        </button>
      </view>

      <view v-else-if="dogs.length === 0" class="empty-dogs">
        <text class="empty-text">暂无狗狗档案</text>
        <button class="btn-create-dog" @tap="goToCreateDog">创建狗狗档案</button>
      </view>

      <view v-else class="dog-feeding-content">
        <!-- 选项卡与下方参数同属一只狗：同一内嵌面板 + 分隔线，建立视觉归属 -->
        <view class="dog-context-panel">
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
            <!-- 档案 + 喂食参数合并一行六项：年龄/性别/体重/每日餐次/每日饭量/每餐约 -->
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
        </view>

        <view v-if="!selectedDog" class="picker-hint">
          提示：请先选择爱犬以计算推荐饭量
        </view>

        <!-- 生命阶段提醒：紧贴所选狗狗，不再单独占一屏；
             已确认过的狗狗不再重复提醒（留痕在确认时即写入） -->
        <view
          v-if="!isLifeStageMatch && selectedDog && showWarning && !isLifeStageAcknowledged"
          class="warning-card inline-warning-card"
        >
          <view class="warning-header">
            <text class="warning-icon">⚠️</text>
            <text class="warning-title">生命阶段提醒</text>
          </view>

          <!-- 后端结论没取到：不静默放行，给一条中性提示（不是警示色，避免网络抖动吓到顾客） -->
          <view v-if="lifeStageCheckFailed" class="life-stage-unknown-note">
            <text class="life-stage-unknown-text">
              暂时无法确认这份食谱是否适合当前狗狗，建议稍后重试或联系客服。
            </text>
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
      </view>
    </view>

    <!-- 配置天数与分装 -->
    <view class="section cycle-section" v-if="selectedDog">
      <view class="section-title">
        <!-- 已有默认值（7 天），不再打红星，避免让人以为必须动它 -->
        <text class="title-text">快速选择备餐天数</text>
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

      <!-- 互斥条件当场说明：不再等顾客点了变灰的天数才弹提示 -->
      <view v-if="isCustomPackagePlan" class="package-plan-mode-hint">
        <text class="package-plan-mode-hint-text">已启用自定义分装，上方天数选择暂不生效</text>
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

      <button
        class="btn-generate"
        :disabled="!canGenerateSheet || isGeneratingSheet"
        @tap="generateSheet"
      >
        生成制作单
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { request } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import { resolveDogAvatarSrc } from '../../utils/dog-avatar'
import { navigateToDogCreate } from '../../utils/dog-profile-entry'
import { getNutritionStandardExplain, getNutritionStandardLabel } from '../../utils/label-mapping'
import {
  buildLifeStageReminderText,
  confirmLifeStageMismatch,
  fetchLifeStageMatch,
  getLifeStageLabel,
  isLifeStageMismatch,
  recordLifeStageAcknowledgement,
  type LifeStageMatchVerdict,
} from '../../utils/life-stage-match'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  MIN_PACKAGE_SPEC_G,
  ORDER_CYCLE_OPTIONS,
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
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

const dogs = ref<Dog[]>([])
// 列表加载失败与「没有档案」是两件事：失败时若显示"暂无档案"会诱导重复建档
const dogsLoadFailed = ref(false)
const selectedDogId = ref<string | null>(null)
const selectedDog = ref<Dog | null>(null)
const isGeneratingSheet = ref(false)
const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 生命阶段校验
const isLifeStageMatch = ref(true)
const showWarning = ref(true)
/**
 * 本次进入页面已经确认过生命阶段提醒的狗狗。
 * 卡片上点「我已知晓」即写留痕，之后不再弹同义弹窗（避免"刚确认过又问一遍"）。
 * 切换狗狗属于新的一只狗，会重新提醒。
 */
const acknowledgedLifeStageDogIds = ref<string[]>([])
const isLifeStageAcknowledged = computed(() => {
  const dogId = selectedDog.value?.id
  return Boolean(dogId && acknowledgedLifeStageDogIds.value.includes(dogId))
})
/**
 * 生命阶段匹配结论 —— **由后端给出**（2026-09-19 起不再前端自己算）。
 * 前端重算认不出混血犬的体型，算不出时还会被当成"匹配"静默放行。
 */
const lifeStageVerdict = ref<LifeStageMatchVerdict | null>(null)

/**
 * 是否"没能拿到后端结论"（网络/服务异常）。
 * 这种情况**绝不能静默放行** —— 那正是本次重构要消灭的问题；
 * 但也不该误报成"不匹配"，所以单独用一个中性提示。
 */
const lifeStageCheckFailed = ref(false)

/** 狗狗需要的食谱生命阶段（后端算出来的） */
const selectedDogRecipeLifeStage = computed(
  () => lifeStageVerdict.value?.dogLifeStage || '',
)

const lifeStageReminderText = computed(() => {
  if (lifeStageVerdict.value?.message) return lifeStageVerdict.value.message
  return buildLifeStageReminderText({
    applicableStages: recipe.value.applicableLifeStages,
    dogLifeStage: selectedDogRecipeLifeStage.value,
    dogName: selectedDog.value?.name,
  })
})
const recommendedLifeStageOption = computed(() => {
  const targetLifeStage = selectedDogRecipeLifeStage.value
  if (!targetLifeStage) return null
  const version = recipe.value.availableLifeStageVersions?.find(
    version => version.lifeStage === selectedDogRecipeLifeStage.value,
  )
  if (!version || version.lifeStage === recipe.value.selectedLifeStage) return null
  return {
    ...version,
    label: version.label || getLifeStageLabel(version.lifeStage),
  }
})
const dogProfileFacts = computed(() => {
  if (!selectedDog.value) return []

  // 六项合并一行展示（与成品订购页一致）：
  // 档案信息（年龄/性别/体重）+ 喂食参数（餐次/每日量/每餐量）
  return [
    { label: '年龄', value: calculateDogAgeText(selectedDog.value) },
    { label: '性别', value: getDogGenderLabel(selectedDog.value.gender) },
    { label: '体重', value: `${selectedDog.value.currentWeightKg}kg` },
    { label: '每日餐次', value: selectedDog.value.mealsPerDay ? `${selectedDog.value.mealsPerDay}餐` : '计算中' },
    { label: '每日饭量', value: dailySuggestedIntakeText.value },
    { label: '每餐约', value: perMealIntakeText.value },
  ]
})
const dailySuggestedIntakeText = computed(() => {
  if (!displayDailyIntakeG.value) return '计算中'
  return `${Math.round(displayDailyIntakeG.value)}g/天`
})
const perMealIntakeText = computed(() => {
  if (!perMealG.value) return '计算中'
  return `${Math.round(perMealG.value)}g`
})
const normalizedPackagePlan = computed(() =>
  packagePlan.value.map(row => normalizePackagePlanRow(row))
)
const packagePlanTotal = computed(() => getPackagePlanTotal(normalizedPackagePlan.value))
const totalGrams = computed(() => packagePlanTotal.value.totalGrams)
const totalPackages = computed(() => packagePlanTotal.value.totalPackages)
const estimatedFeedDays = computed(() =>
  estimateFeedDays(totalGrams.value, displayDailyIntakeG.value)
)
const hasInvalidPackageSpec = computed(() =>
  normalizedPackagePlan.value.some(row => row.packageSpecG < MIN_PACKAGE_SPEC_G)
)
const packagePlanValidationMessage = computed(() => (
  hasInvalidPackageSpec.value ? `每袋重量不能少于 ${MIN_PACKAGE_SPEC_G}g` : ''
))
const packagePlanInlineSummaryText = computed(() => {
  const specs = Array.from(new Set(
    normalizedPackagePlan.value.map(row => `${row.packageSpecG}g`)
  ))
  const specText = specs.length > 0 ? specs.join('、') : '-'

  return `每袋 ${specText} / 共${totalPackages.value}袋 / 总净重 ${Math.round(totalGrams.value)}g / 约${estimatedFeedDays.value}天`
})
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

const selectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
const lastSelectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
const packagePlan = ref<PackagePlanItem[]>([])
const packagePlanDogId = ref<string | null>(null)
const showPackageEditor = ref(false)
const isCustomPackagePlan = ref(false)

// 「每日饭量是怎么算的？」展开状态
const feedingNoteExpanded = ref(false)
const initialDogId = ref('')

onMounted(async () => {
  console.log('========== [RecipeDiy] onMounted ==========')

  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  console.log('[页面参数]', options)

  recipeId.value = options.recipeId || ''
  shareToken.value = options.shareToken || ''
  initialDogId.value = options.dogId || ''
  selectedLifeStage.value = options.lifeStage || ''
  console.log('[食谱ID]', recipeId.value)

  if (recipeId.value) {
    // 【修复】先加载健康标签映射
    await loadHealthTagMapping()
    // 【修复】确保品种列表先加载完成，再加载食谱和狗狗数据
    await loadRecipe()
    await loadDogs()
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


async function loadRecipe() {
  console.log('[RecipeDiy] loadRecipe 开始, recipeId:', recipeId.value)

  try {
    const requestData: Record<string, string> = {}
    if (selectedLifeStage.value) {
      requestData.lifeStage = selectedLifeStage.value
    }
    if (shareToken.value) {
      requestData.shareToken = shareToken.value
    }

    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET',
      data: requestData
    })

    console.log('[RecipeDiy] loadRecipe API响应:', res)

    if (res.code === 0 && res.data) {
      recipe.value = {
        ...res.data,
        availableLifeStageVersions: res.data.availableLifeStageVersions || [],
      }
      if (!selectedLifeStage.value && res.data.selectedLifeStage) {
        selectedLifeStage.value = res.data.selectedLifeStage
      }
      if (res.data.selectedRecipeId || res.data.id) {
        recipeId.value = res.data.selectedRecipeId || res.data.id
      }
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

  dogsLoadFailed.value = false

  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })

    console.log('[RecipeDiy] loadDogs API响应:', res)

    if (res.code === 0 && res.data) {
      dogs.value = res.data
      console.log('[RecipeDiy] 狗狗列表加载成功, 数量:', res.data.length)

      // 自动选择狗狗（优先使用详情页传入，其次使用本地缓存）
      if (res.data.length > 0 && !selectedDogId.value) {
        const preferredDogId = initialDogId.value || uni.getStorageSync('dogId') || ''
        const preferredDog = res.data.find((dog: Dog) => dog.id === preferredDogId) || res.data[0]
        console.log('[RecipeDiy] 自动选择狗狗:', preferredDog)

        await selectDog(preferredDog.id)
      }
    } else {
      // 拿到了响应但结论不可用：按失败处理，不能显示成「暂无档案」
      dogsLoadFailed.value = true
      dogs.value = []
    }
  } catch (error) {
    console.error('[RecipeDiy] Load dogs error:', error)
    dogsLoadFailed.value = true
    dogs.value = []
  }

  console.log('[RecipeDiy] loadDogs 结束')
}

/** 狗狗档案加载失败后的重试入口 */
async function retryDogsLoad() {
  await loadDogs()
}

async function selectDog(dogId: string) {
  if (!dogId) return

  const dog = dogs.value.find(item => item.id === dogId)
  if (!dog) return

  selectedDogId.value = dog.id
  selectedDog.value = dog
  isCustomPackagePlan.value = false
  showPackageEditor.value = false
  packagePlan.value = []
  packagePlanDogId.value = null
  resetDiyLifeStageDependentState()

  await loadDogCalc(dog.id)
  void checkLifeStageMatch()
}

async function loadDogCalc(dogId: string) {
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

async function checkLifeStageMatch() {
  const dogId = selectedDog.value?.id
  if (!dogId || !recipe.value) {
    lifeStageVerdict.value = null
    lifeStageCheckFailed.value = false
    isLifeStageMatch.value = true
    return
  }

  const verdict = await fetchLifeStageMatch({
    recipeId: recipeId.value,
    dogId,
    lifeStage: selectedLifeStage.value || undefined,
  })

  lifeStageVerdict.value = verdict
  if (!verdict) {
    lifeStageCheckFailed.value = true
    isLifeStageMatch.value = true
    return
  }

  lifeStageCheckFailed.value = false

  isLifeStageMatch.value = !isLifeStageMismatch(verdict.matchType)
  showWarning.value = true
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

async function switchToRecommendedLifeStage() {
  const option = recommendedLifeStageOption.value
  if (!option?.lifeStage) return

  selectedLifeStage.value = option.lifeStage
  if (option.recipeId) {
    recipeId.value = option.recipeId
  }
  showWarning.value = true
  // 换了生命阶段版本＝换了一份判定依据，之前的「已知晓」不再适用，需要重新提醒
  acknowledgedLifeStageDogIds.value = []
  resetDiyLifeStageDependentState()

  await loadRecipe()
  if (selectedDogId.value) {
    await loadDogCalc(selectedDogId.value)
  }
  void checkLifeStageMatch()
}

/**
 * 卡片上点「我已知晓」= 完成本次确认。
 *
 * 2026-09-22：原来是「卡片确认一次 + 点生成制作单时再弹一次同义弹窗」，
 * 顾客会觉得"刚确认过又问一遍"，而且弹窗的取消键「再看看」正好是漏斗末端的放弃键。
 * 现在改为：卡片确认时**立即写留痕**（合规凭证不变），本次不再弹窗；
 * 换一只狗属于新的一只狗，会重新提醒。
 */
async function dismissWarning() {
  showWarning.value = false

  const dogId = selectedDog.value?.id
  if (!dogId || !isLifeStageMismatch(lifeStageVerdict.value?.matchType)) return
  if (acknowledgedLifeStageDogIds.value.includes(dogId)) return

  acknowledgedLifeStageDogIds.value = [...acknowledgedLifeStageDogIds.value, dogId]

  try {
    await recordLifeStageAcknowledgement({
      recipeId: recipeId.value,
      dogId,
      verdict: lifeStageVerdict.value,
      source: 'diy',
    })
  } catch (error) {
    // 留痕失败不阻断顾客继续操作，但要把这只狗移出已确认集合，下次仍会提醒
    console.error('[RecipeDiy] 记录生命阶段确认失败:', error)
    acknowledgedLifeStageDogIds.value = acknowledgedLifeStageDogIds.value.filter((id) => id !== dogId)
  }
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

function togglePackageEditor() {
  if (isCustomPackagePlan.value) {
    // 取消自定义会直接丢掉顾客填的每袋克数与袋数，先确认一次。
    // ⚠️ confirmText / cancelText 最多 4 个汉字：超出时微信既不显示弹窗也不报错，
    //    表现就是「点了没反应」（此处踩过一次）。
    uni.showModal({
      title: '取消自定义分装',
      content: '取消后你填写的每袋克数和袋数会恢复为系统默认分装。',
      confirmText: '仍要取消',
      cancelText: '继续编辑',
      success: (res) => {
        if (res.confirm) {
          cancelCustomPackagePlan()
          uni.showToast({ title: '已恢复默认分装', icon: 'none' })
        }
      },
    })
    return
  }

  lastSelectedCycleDays.value = selectedCycleDays.value || lastSelectedCycleDays.value
  isCustomPackagePlan.value = true
  showPackageEditor.value = true
}

function cancelCustomPackagePlan() {
  isCustomPackagePlan.value = false
  showPackageEditor.value = false
  selectedCycleDays.value = lastSelectedCycleDays.value
  rebuildPackagePlan()
}

function addPackagePlanRow() {
  packagePlan.value = [
    ...packagePlan.value,
    {
      packageSpecG: Math.max(MIN_PACKAGE_SPEC_G, Math.round(perMealG.value || displayDailyIntakeG.value || 100)),
      packageCount: 1,
    },
  ]
}

function updatePackagePlanRow(index: number, field: keyof PackagePlanItem, value: string | number) {
  const nextValue = field === 'packageSpecG'
    ? normalizePackageSpecValue(value)
    : Math.max(1, Math.floor(Number(value) || 1))
  packagePlan.value = packagePlan.value.map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: nextValue } : row
  )
}

function removePackagePlanRow(index: number) {
  if (packagePlan.value.length <= 1) {
    return
  }
  packagePlan.value = packagePlan.value.filter((_, rowIndex) => rowIndex !== index)
}

function getPrimaryPackageSpecG(plan: PackagePlanItem[]): number {
  const primaryRow = [...plan].sort(
    (left, right) =>
      right.packageCount - left.packageCount
      || right.packageSpecG - left.packageSpecG,
  )[0]

  return primaryRow?.packageSpecG || 1
}

async function generateSheet() {
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

  // 生命阶段不匹配：卡片上已确认过的狗狗不再弹窗（留痕在卡片确认时已写入）；
  // 没确认过（比如直接从生成按钮进入）才走一次弹窗确认，同样留痕作为凭证。
  if (isLifeStageMismatch(lifeStageVerdict.value?.matchType)) {
    const dogId = selectedDog.value?.id || selectedDogId.value || ''
    const alreadyAcknowledged = Boolean(dogId && acknowledgedLifeStageDogIds.value.includes(dogId))

    if (!alreadyAcknowledged) {
      const confirmed = await confirmLifeStageMismatch({
        recipeId: recipeId.value,
        dogId,
        verdict: lifeStageVerdict.value,
        source: 'diy',
        dogName: selectedDog.value?.name,
      })
      if (!confirmed) return
      if (dogId) {
        acknowledgedLifeStageDogIds.value = [...acknowledgedLifeStageDogIds.value, dogId]
      }
    }
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
        ...(shareToken.value ? { shareToken: shareToken.value } : {})
      }
    })

    uni.setStorageSync(HOME_RECIPE_STATS_DIRTY_KEY, '1')
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
    cycleDays: selectedCycleDays.value,
    perMealG: Math.round(perMealG.value),
    isPerMealModified: isPerMealModified.value,
    dailyIntakeG: Math.round(displayDailyIntakeG.value),
    packageCount: totalPackages.value,
    packageSpecG: getPrimaryPackageSpecG(normalizedPackagePlan.value),
    packagePlan: JSON.stringify(normalizedPackagePlan.value),
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

/* 狗狗选择 */
.empty-dogs {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 0;
}

.empty-text {
  font-size: 28rpx;
  color: #6b6653;
  margin-bottom: 20rpx;
}

.btn-create-dog {
  padding: 16rpx 32rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;
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

.picker-hint {
  margin-top: 12rpx;
  padding: 0 8rpx;
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.5;
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
  border: 2rpx solid #eef1e2;
  background-color: #fbfcf7;
  color: #26261f;
  vertical-align: middle;
}

.order-dog-chip.active {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.order-dog-avatar {
  flex: 0 0 auto;
  width: 58rpx;
  height: 58rpx;
  border-radius: 50%;
  background-color: #eef2e4;
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
  color: #26261f;
}

.order-dog-chip.active .order-dog-name {
  color: #26261f;
}

.dog-profile-context {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #e5e8d4;
}

.dog-profile-facts {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6rpx;
}

.dog-profile-fact {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  min-width: 0;
  padding: 14rpx 4rpx;
  border-radius: 12rpx;
  background-color: #fbfcf7;
  line-height: 1.3;
}

.dog-profile-fact-label {
  font-size: 20rpx;
  color: #968f6d;
  white-space: nowrap;
}

.dog-profile-fact-value {
  min-width: 0;
  font-size: 24rpx;
  font-weight: 700;
  color: #1e3a2f;
  white-space: nowrap;
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
.cycle-and-custom-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

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
  border: 2rpx solid #e5e8d4;
  border-radius: 12rpx;
}

.cycle-option.active {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.cycle-option.disabled {
  opacity: 0.5;
}

.cycle-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #26261f;
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
  color: #26261f;
  line-height: 1.45;
}

.package-edit-button {
  flex: 0 0 auto;
  height: 64rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 26rpx;
  margin: 0;
  border: 1rpx solid rgba(216, 188, 133, 0.6);
  border-radius: 999rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #d8bc85;
  font-size: 24rpx;
  font-weight: 600;
}

.min-order-warning {
  margin-top: 16rpx;
  padding: 16rpx 18rpx;
  background-color: var(--sk-danger-soft, #f7e9e3);
  border: 1rpx solid var(--sk-danger, #b4553f);
  border-radius: 8rpx;
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
  background-color: #fbfcf7;
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
  color: #6b6653;
}

.package-input {
  width: 116rpx;
  height: 58rpx;
  text-align: center;
  border: 1rpx solid #e5e8d4;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #26261f;
  background-color: #fbfcf7;
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
  width: 100%;
  border: 1rpx dashed #1e3a2f;
  color: #1e3a2f;
  background-color: #fbfcf7;
}

.btn-remove-row {
  border: none;
  color: #6b6653;
  background-color: #eef2e4;
}

.btn-remove-row[disabled] {
  color: #968f6d;
}

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
.dogs-load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 32rpx;
  text-align: center;
}

.dogs-load-error-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.dogs-load-error-copy {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #968f6d;
}

.dogs-load-error-btn {
  width: 320rpx;
  height: 80rpx;
  line-height: 80rpx;
  margin-top: 28rpx;
}

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
.section-action-button,
.btn-secondary-full {
  border-radius: 8rpx;
  border: 2rpx solid #1e3a2f;
  color: #1e3a2f;
  background-color: #fbfcf7;
  font-size: 26rpx;
  text-align: center;
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

.dog-empty-state {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  padding: 24rpx;
  border-radius: 8rpx;
  background-color: #fbfcf7;
  border: 1rpx solid #e5e8d4;
}

/* 选项卡 + 参数行的统一容器，形成视觉归属 */
.dog-context-panel {
  padding: 16rpx;
  border-radius: 16rpx;
  background-color: #f2f4ea;
  border: 1rpx solid #e5e8d4;
}

.inline-warning-card {
  margin: 0;
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

/* 自定义分装与天数互斥：常驻说明，不再靠点击失败解释 */
.package-plan-mode-hint {
  margin-top: 14rpx;
  padding: 12rpx 18rpx;
  background-color: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.35);
  border-radius: 12rpx;
}

.package-plan-mode-hint-text {
  font-size: 22rpx;
  color: #8a6b33;
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
  width: 100%;
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
</style>
