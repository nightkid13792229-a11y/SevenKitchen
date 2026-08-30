<template>
  <view class="recipe-diy-page">
    <!-- 食谱信息卡片 -->
    <view class="section recipe-info-section">
      <view class="recipe-name-wrapper">
        <text class="recipe-name">{{ recipe.name }}</text>
      </view>

      <view class="tags-row">
        <text class="section-label">适用于：</text>
        <view class="tags-container">
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
      </view>

      <view class="nutrition-summary">
        <view class="nutrition-item">
          <text class="label">能量密度</text>
          <text class="value">{{ displayRecipeEnergyDensity }} kcal/kg</text>
        </view>
        <view class="nutrition-item">
          <text class="label">营养标准</text>
          <text class="value">{{ getNutritionStandardLabel(recipe.nutritionStandard) }}</text>
        </view>
        <view class="nutrition-item">
          <text class="label">设计软件</text>
          <text class="value">{{ recipeFormulaSoftwareLabel }}</text>
        </view>
      </view>
    </view>

    <!-- 选择狗狗 -->
    <view class="section dog-section">
      <view class="section-title">
        <text class="title-text">选择爱犬</text>
        <text class="required">*</text>
      </view>

      <view v-if="dogs.length === 0" class="empty-dogs">
        <text class="empty-text">暂无狗狗档案</text>
        <button class="btn-create-dog" @tap="goToCreateDog">创建狗狗档案</button>
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
      </view>

      <view v-if="!selectedDog" class="picker-hint">
        提示：请先选择爱犬以计算推荐饭量
      </view>
    </view>

    <!-- 生命阶段提醒 -->
    <view v-if="!isLifeStageMatch && selectedDog && showWarning" class="warning-card">
      <view class="warning-header">
        <text class="warning-icon">⚠️</text>
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

    <!-- 确定饭量 -->
    <view class="section feeding-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">确定饭量</text>
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

      <view class="feeding-adjustment-note">
        <text class="feeding-adjustment-title">起始喂食建议</text>
        <text class="feeding-adjustment-copy">
          当前热量已按国内城市犬的常见活动量保守估算。请连续观察2-4周的体重、便便和饥饿感，再按5%-10%小幅增减。
        </text>
      </view>

      <!-- 计算说明 -->
      <view class="calculation-explanation">
        <view class="explanation-header" @tap="toggleCalculationDetails">
          <view class="explanation-title-row">
            <text class="explanation-title">饭量计算过程</text>
            <text class="toggle-icon">{{ showCalculationDetails ? '▲' : '▼' }}</text>
          </view>
        </view>

        <view v-if="showCalculationDetails && dogCalcResult" class="explanation-content">
          <!-- 计算卡片 -->
          <view class="calc-cards">

            <!-- ① 每日能量需求 -->
            <view class="calc-card">
              <text class="card-title">每日能量需求 (DER)</text>
              <view class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.totalDer || 0) }} kcal/天</text>
              </view>
            </view>

            <!-- ② 每日零食能量 -->
            <view class="calc-card">
              <text class="card-title">每日零食能量</text>
              <view v-if="dogCalcResult.treatDeduction > 0" class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.treatDeduction) }} kcal/天</text>
                <text v-if="dogCalcResult.isTreatCapped" class="result-warning">⚠️ 已触发10%安全上限</text>
              </view>
              <view v-else class="calc-result">
                <text class="result-note">未配置零食</text>
              </view>
            </view>

            <!-- ③ 每日鲜食能量 -->
            <view class="calc-card">
              <text class="card-title">每日鲜食能量</text>
              <view class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.finalFoodKcal) }} kcal/天</text>
              </view>
            </view>

            <!-- ④ 每日饭量 -->
            <view class="calc-card highlight">
              <text class="card-title">每日饭量</text>
              <view class="formula-box">
                <text class="formula-text">每日饭量 = (鲜食能量 ÷ 食谱能量密度) × 1000</text>
              </view>
              <view class="step-data">
                <view class="data-item">
                  <text class="data-label">食谱能量密度：</text>
                  <text class="data-value">{{ displayRecipeEnergyDensity }} kcal/kg</text>
                </view>
              </view>
              <view class="calc-result final">
                <text class="result-value highlight">{{ Math.round(dogCalcResult.dailyIntakeG) }} g/天</text>
              </view>
            </view>

            <!-- ⑤ 每餐饭量 -->
            <view class="calc-card highlight">
              <text class="card-title">每餐饭量</text>
              <view class="formula-box">
                <text class="formula-text">每餐饭量 = 每日饭量 ÷ 每日餐数</text>
              </view>
              <view class="step-data">
                <view class="data-item">
                  <text class="data-label">每日餐数：</text>
                  <text class="data-value">{{ selectedDog.mealsPerDay }} 餐/天</text>
                </view>
              </view>
              <view class="calc-result final">
                <text class="result-value highlight">{{ Math.round(perMealG) }} g/餐</text>
              </view>
            </view>

          </view>
        </view>
      </view>
    </view>

    <!-- 配置天数与分装 -->
    <view class="section cycle-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">配置天数</text>
        <text class="required">*</text>
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

      <!-- 保质期说明 -->
      <view class="shelf-life-notice">
        <view class="notice-title" @tap="toggleShelfLife">
          <text class="notice-title-text">📅 保质期说明</text>
          <text class="toggle-icon">{{ showShelfLife ? '▲' : '▼' }}</text>
        </view>
        <view v-if="showShelfLife" class="notice-content">
          <view class="notice-item">
            <text class="notice-dot">🧊</text>
            <text class="notice-text">-18℃冷冻保存保质期6个月，建议3个月内吃完</text>
          </view>
          <view class="notice-item">
            <text class="notice-dot">❄️</text>
            <text class="notice-text">0-5℃冷藏保存保质期3天，建议当天吃完</text>
          </view>
          <view class="notice-item">
            <text class="notice-dot">⏱️</text>
            <text class="notice-text">开袋后，建议3小时内吃完</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作按钮 -->
    <view class="bottom-bar">
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
import { request } from '../../utils/api'
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

interface Breed {
  id: string
  name: string
  adultAgeMonths: number
  seniorAgeYears?: number
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
const recipeEnergyDensityKcalPerKg = computed(() => {
  const directValue = Number(recipe.value.energyDensityKcalPerKg)
  if (Number.isFinite(directValue) && directValue > 0) return directValue
  return recipe.value.nutritionDetailedData?.energyDensityKcalPerKg
})
const displayRecipeEnergyDensity = computed(() =>
  formatEnergyDensityKcalPerKg(recipeEnergyDensityKcalPerKg.value)
)
const recipeFormulaSoftwareLabel = computed(() =>
  formatRecipeFormulaSoftwareLabel(recipe.value.designSource)
)

const dogs = ref<Dog[]>([])
const breeds = ref<Breed[]>([])
const selectedDogId = ref<string | null>(null)
const selectedDog = ref<Dog | null>(null)
const isGeneratingSheet = ref(false)
const HOME_RECIPE_STATS_DIRTY_KEY = 'home_recipe_stats_dirty'

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 生命阶段校验
const isLifeStageMatch = ref(true)
const showWarning = ref(true)
const selectedDogLifeStage = computed(() => resolveDogLifeStage(selectedDog.value, breeds.value))
const selectedDogRecipeLifeStage = computed(() =>
  resolveDogRecipeLifeStage(selectedDog.value, breeds.value),
)
const lifeStageReminderText = computed(() => buildLifeStageReminderText({
  applicableStages: recipe.value.applicableLifeStages,
  dogLifeStage: selectedDogRecipeLifeStage.value,
  dogName: selectedDog.value?.name,
}))
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

// 饭量相关
const dogCalcResult = ref<any>(null)
const displayDailyIntakeG = ref(0)
const perMealG = ref(0)
const isPerMealModified = ref(false)
const isEditingPerMeal = ref(false)
const tempPerMealG = ref(0)

const selectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
const lastSelectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
const packagePlan = ref<PackagePlanItem[]>([])
const packagePlanDogId = ref<string | null>(null)
const showPackageEditor = ref(false)
const isCustomPackagePlan = ref(false)

// 保质期说明展开状态
const showShelfLife = ref(false)

// 计算说明展开状态
const showCalculationDetails = ref(false)
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
    await loadBreeds()
    await loadRecipe()
    await loadDogs()
  }

  console.log('========== [RecipeDiy] onMounted 结束 ==========')
})

async function loadBreeds() {
  console.log('[RecipeDiy] loadBreeds 开始')

  try {
    const res = await request({
      url: '/dogs/breeds',
      method: 'GET'
    })

    console.log('[RecipeDiy] loadBreeds API响应:', res)

    if (res.code === 0 && res.data) {
      breeds.value = res.data
      console.log('[RecipeDiy] 品种列表加载成功, 数量:', res.data.length)
    }
  } catch (error) {
    console.error('[RecipeDiy] Load breeds error:', error)
  }

  console.log('[RecipeDiy] loadBreeds 结束')
}

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
    }
  } catch (error) {
    console.error('[RecipeDiy] Load dogs error:', error)
  }

  console.log('[RecipeDiy] loadDogs 结束')
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
  checkLifeStageMatch()
}

async function loadDogCalc(dogId: string) {
  console.log('========== [RecipeDiy] loadDogCalc 开始 ==========')
  console.log('[调用参数]', { dogId, recipeId: recipeId.value })

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
      uni.showToast({
        title: res.message || '计算失败',
        icon: 'none'
      })
    }
  } catch (error) {
    console.error('[API调用异常]', error)
    uni.showToast({
      title: '计算失败',
      icon: 'none'
    })
  }

  console.log('========== [RecipeDiy] loadDogCalc 结束 ==========')
}

function checkLifeStageMatch() {
  console.log('[RecipeDiy] checkLifeStageMatch 开始')

  if (!selectedDog.value || !recipe.value) {
    console.log('[RecipeDiy] 缺少必要数据，跳过校验')
    isLifeStageMatch.value = true
    return
  }

  const dogLifeStage = selectedDogLifeStage.value
  const dogRecipeLifeStage = selectedDogRecipeLifeStage.value

  console.log('[RecipeDiy] 生命阶段校验:', {
    dogLifeStage,
    dogRecipeLifeStage,
    applicableStages: recipe.value.applicableLifeStages,
    dogName: selectedDog.value.name
  })

  isLifeStageMatch.value = isRecipeLifeStageMatch(recipe.value.applicableLifeStages, dogRecipeLifeStage)
  console.log('[RecipeDiy] 校验结果:', isLifeStageMatch.value ? '匹配' : '不匹配')

  // 修复：切换狗狗时重置警告状态
  // 无论匹配还是不匹配，都应该重置showWarning为true
  // 这样警告卡片会根据isLifeStageMatch的值自动显示或隐藏
  showWarning.value = true

  console.log('[RecipeDiy] 警告卡片显示条件:', {
    '!isLifeStageMatch': !isLifeStageMatch.value,
    'selectedDog': !!selectedDog.value,
    'showWarning': showWarning.value,
    '应该显示警告': !isLifeStageMatch.value && selectedDog.value && showWarning.value
  })

  console.log('[RecipeDiy] checkLifeStageMatch 结束')
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
  resetDiyLifeStageDependentState()

  await loadRecipe()
  if (selectedDogId.value) {
    await loadDogCalc(selectedDogId.value)
  }
  checkLifeStageMatch()
}

function dismissWarning() {
  showWarning.value = false
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

function toggleCalculationDetails() {
  showCalculationDetails.value = !showCalculationDetails.value
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

function toggleShelfLife() {
  showShelfLife.value = !showShelfLife.value
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
    cancelCustomPackagePlan()
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

function generateSheet() {
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
    uni.showToast({
      title: '饭量和分装生成中，请稍后',
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

  if (!isLifeStageMatch.value && showWarning.value) {
    uni.showModal({
      title: '生命阶段提醒',
      content: '当前狗狗生命阶段与食谱适用阶段不一致，仍要生成 DIY 制作单吗？',
      success: (res) => {
        if (res.confirm) {
          showWarning.value = false
          void generateAndNavigateToSheet()
        }
      }
    })
    return
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
  uni.navigateTo({
    url: '/pages/dog-create/index'
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
    'AAFCO_2021': 'AAFCO 2021',
  }
  return map[standard] || standard
}
</script>

<style scoped>
.recipe-diy-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.section {
  background-color: #fff;
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
  color: #333;
}

.required {
  color: #ff4d4f;
  margin-left: 4rpx;
}

/* 食谱信息卡片 */
.recipe-info-section {
  padding: 32rpx 24rpx;
}

.recipe-name-wrapper {
  text-align: center;
  margin-bottom: 24rpx;
}

.recipe-name {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  display: block;
}

.tags-row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
  flex-wrap: wrap;
}

.section-label {
  font-size: 28rpx;
  color: #666;
  margin-right: 12rpx;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.tag {
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

.nutrition-summary {
  display: flex;
  justify-content: space-around;
  gap: 20rpx;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.nutrition-item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.nutrition-item .label {
  font-size: 24rpx;
  color: #999;
}

.nutrition-item .value {
  font-size: 28rpx;
  color: #333;
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
  color: #999;
  margin-bottom: 20rpx;
}

.btn-create-dog {
  padding: 16rpx 32rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;
}

.dog-picker {
  padding: 24rpx;
  background-color: #ffffff;
  border: 2rpx solid #1890ff;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(24, 144, 255, 0.1);
}

.picker-placeholder {
  font-size: 28rpx;
  color: #1890ff;
  font-weight: 500;
}

.dog-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dog-text {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.picker-check {
  font-size: 32rpx;
  color: #52c41a;
  font-weight: bold;
}

.picker-hint {
  margin-top: 12rpx;
  padding: 0 8rpx;
  font-size: 24rpx;
  color: #999;
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
  background-color: #2f8f4e;
  color: #fff;
}

.btn-continue {
  background-color: #faad14;
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

.feeding-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.feeding-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #1890ff;
}

.feeding-value.readonly {
  color: #666;
}

.dog-feeding-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.dog-feeding-item {
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

.dog-feeding-item:nth-child(3),
.daily-intake-item {
  background-color: #f4fbf5;
}

.feeding-adjustment-note {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  background-color: #f6fbf7;
  border: 1rpx solid #d9f0dd;
  border-radius: 8rpx;
}

.feeding-adjustment-title {
  font-size: 25rpx;
  font-weight: 700;
  color: #2f7d42;
}

.feeding-adjustment-copy {
  font-size: 24rpx;
  line-height: 1.6;
  color: #496052;
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
  border: 1rpx solid #d9d9d9;
  border-radius: 6rpx;
  font-size: 28rpx;
  text-align: center;
}

.feeding-unit {
  font-size: 26rpx;
  color: #666;
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
  background-color: #1890ff;
  color: #fff;
}

.btn-reset {
  background-color: #ff4d4f;
  color: #fff;
}

.btn-save {
  background-color: #52c41a;
  color: #fff;
}

.btn-cancel {
  background-color: #d9d9d9;
  color: #666;
}

/* 计算说明 */
.calculation-explanation {
  margin-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;
  padding-top: 20rpx;
}

.explanation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.explanation-title-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.explanation-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
}

.explanation-content {
  margin-top: 20rpx;
}

.calc-cards {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.calc-card {
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border-left: 4rpx solid #d9d9d9;
}

.calc-card.highlight {
  background-color: #e6f7ff;
  border-left-color: #1890ff;
}

.card-title {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 12rpx;
  display: block;
}

.calc-result {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.result-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.result-value.highlight {
  color: #1890ff;
  font-size: 36rpx;
}

.result-note {
  font-size: 26rpx;
  color: #999;
}

.result-warning {
  font-size: 22rpx;
  color: #faad14;
}

.formula-box {
  padding: 12rpx;
  background-color: #fff;
  border-radius: 6rpx;
  margin-bottom: 12rpx;
}

.formula-text {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
}

.step-data {
  margin-bottom: 8rpx;
}

.data-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.data-label {
  font-size: 24rpx;
  color: #999;
}

.data-value {
  font-size: 24rpx;
  color: #333;
  font-weight: 500;
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
  flex: 1;
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

.min-order-warning {
  margin-top: 16rpx;
  padding: 16rpx 18rpx;
  background-color: #fff7e8;
  border: 1rpx solid #f3c67d;
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
  width: 100%;
  border: 1rpx dashed #2f8f4e;
  color: #2f8f4e;
  background-color: #fff;
}

.btn-remove-row {
  border: none;
  color: #687078;
  background-color: #eef1f3;
}

.btn-remove-row[disabled] {
  color: #b7bdc3;
}

.custom-cycle-inline {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 20rpx 16rpx;
  background-color: #fff;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
}

.custom-label {
  font-size: 26rpx;
  color: #666;
}

.custom-input-white {
  width: 80rpx;
  height: 56rpx;
  text-align: center;
  border: 2rpx solid #e8e8e8;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #333;
  background-color: #fff;
}

.custom-unit {
  font-size: 24rpx;
  color: #999;
}

.btn-confirm-custom {
  padding: 8rpx 16rpx;
  background-color: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 24rpx;
  line-height: 1.2;
  margin-left: 8rpx;
}

.custom-days-display {
  font-size: 26rpx;
  font-weight: bold;
  color: #1890ff;
  padding: 0 12rpx;
}

.btn-edit-custom {
  padding: 8rpx 20rpx;
  background-color: #52c41a;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 24rpx;
  line-height: 1.2;
  margin-left: 8rpx;
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

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  z-index: 100;
}

.btn-generate {
  width: 100%;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1890ff;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
}

.btn-generate[disabled] {
  background-color: #ccc;
  color: #999;
}
</style>
