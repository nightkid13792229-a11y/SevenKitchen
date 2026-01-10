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
          <text class="value">{{ recipe.energyDensityKcalPerKg || recipe.nutritionDetailedData?.energyDensityKcalPerKg }} kcal/kg</text>
        </view>
        <view class="nutrition-item">
          <text class="label">营养标准</text>
          <text class="value">{{ getNutritionStandardLabel(recipe.nutritionStandard) }}</text>
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

      <picker v-else mode="selector" :range="dogPickerOptions" range-key="label" @change="onDogPickerChange">
        <view class="dog-picker">
          <text v-if="!selectedDog" class="picker-placeholder">
            请选择爱犬 →
          </text>
          <view v-else class="dog-selected">
            <text class="dog-text">{{ selectedDog?.name }} | {{ selectedDog?.breedName }} | {{ selectedDog?.currentWeightKg }}kg | {{ selectedDog?.mealsPerDay }}餐/天</text>
            <text class="picker-check">✓</text>
          </view>
        </view>
      </picker>

      <view v-if="!selectedDog" class="picker-hint">
        提示：请先选择爱犬以计算推荐饭量
      </view>
    </view>

    <!-- 生命阶段不匹配警告 -->
    <view v-if="!isLifeStageMatch && selectedDog && showWarning" class="warning-card">
      <view class="warning-header">
        <text class="warning-icon">⚠️</text>
        <text class="warning-title">生命阶段不匹配</text>
      </view>
      <text class="warning-text">
        该食谱适用于"{{ getLifeStageLabel(recipe.applicableLifeStages[0]) }}"，
        您选择的狗狗"{{ selectedDog.name }}"是"{{ getDogLifeStageLabel(selectedDog) }}"阶段，
        可能不太适合。
      </text>
      <text class="warning-text">
        建议选择其他食谱。
      </text>
      <button class="btn-continue" @tap="dismissWarning">
        我已知晓，仍要继续
      </button>
    </view>

    <!-- 确定饭量 -->
    <view class="section feeding-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">确定饭量</text>
      </view>

      <view class="feeding-info">
        <view class="feeding-item">
          <text class="feeding-label">每日饭量</text>
          <text class="feeding-value readonly">{{ Math.round(displayDailyIntakeG) }}g/天</text>
        </view>
        <view class="feeding-item">
          <text class="feeding-label">每餐饭量</text>

          <!-- 只读模式 -->
          <view v-if="!isEditingPerMeal" class="feeding-value-wrapper">
            <text class="feeding-value">{{ Math.round(perMealG) }}g/餐</text>
            <button class="btn-edit" @tap="startEditPerMeal">修改</button>
            <button v-if="isPerMealModified" class="btn-reset" @tap="resetPerMeal">重置</button>
          </view>

          <!-- 编辑模式 -->
          <view v-else class="feeding-edit-wrapper">
            <input
              class="feeding-input-small"
              type="number"
              v-model="tempPerMealG"
              @input="onTempPerMealChange"
            />
            <text class="feeding-unit">g/餐</text>
            <button class="btn-save" @tap="savePerMeal">确定</button>
            <button class="btn-cancel" @tap="cancelEditPerMeal">取消</button>
          </view>
        </view>
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
                  <text class="data-value">{{ recipe.energyDensityKcalPerKg }} kcal/kg</text>
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

    <!-- 制作周期 -->
    <view class="section cycle-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">制作周期</text>
        <text class="required">*</text>
      </view>

      <view class="cycle-and-custom-row">
        <view class="cycle-options">
          <view
            v-for="option in cycleOptions"
            :key="option.days"
            class="cycle-option"
            :class="{ active: cycleDays === option.days }"
            @tap="selectCycle(option.days)"
          >
            <text class="cycle-text">{{ option.days }}天</text>
          </view>
        </view>

        <!-- 自选天数 -->
        <view class="custom-cycle-inline">
          <!-- 编辑模式：显示输入框和确定按钮 -->
          <template v-if="!isCustomDaysMode">
            <text class="custom-label">自选</text>
            <input
              class="custom-input-white"
              type="number"
              v-model="customDays"
              placeholder="1-90"
            />
            <text class="custom-unit">天</text>
            <button class="btn-confirm-custom" @tap="confirmCustomDays">确定</button>
          </template>

          <!-- 查看模式：显示天数和修改按钮 -->
          <template v-else>
            <text class="custom-label">自选</text>
            <text class="custom-days-display">{{ cycleDays }}天</text>
            <button class="btn-edit-custom" @tap="editCustomDays">修改</button>
          </template>
        </view>
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
        :disabled="!selectedDogId"
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

interface Dog {
  id: string
  name: string
  breedName: string
  breedId: string
  currentWeightKg: number
  mealsPerDay: number
  birthday: string
  lifeStageOverride: string
  breed: {
    adultAgeMonths: number
    seniorAgeYears: number
  }
}

interface Recipe {
  id: string
  name: string
  energyDensityKcalPerKg: number
  nutritionStandard: string
  nutritionDetailedData: {
    energyDensityKcalPerKg: number
  }
  applicableLifeStages: string[]
  targetHealthTags: string[]
}

const recipeId = ref('')
const recipe = ref<Recipe>({
  id: '',
  name: '',
  energyDensityKcalPerKg: 0,
  nutritionStandard: '',
  nutritionDetailedData: {
    energyDensityKcalPerKg: 0
  },
  applicableLifeStages: [],
  targetHealthTags: []
})

const dogs = ref<Dog[]>([])
const breeds = ref<Breed[]>([])
const selectedDogId = ref<string | null>(null)
const selectedDog = ref<Dog | null>(null)

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

const dogPickerOptions = computed(() => {
  return dogs.value.map(dog => ({
    value: dog.id,
    label: `${dog.name} | ${dog.breedName} | ${dog.currentWeightKg}kg | ${dog.mealsPerDay}餐/天`
  }))
})

// 生命阶段校验
const isLifeStageMatch = ref(true)
const showWarning = ref(true)

// 饭量相关
const dogCalcResult = ref<any>(null)
const displayDailyIntakeG = ref(0)
const perMealG = ref(0)
const isPerMealModified = ref(false)
const isEditingPerMeal = ref(false)
const tempPerMealG = ref(0)

// 周期
const cycleDays = ref(7)

// 周期选项
const cycleOptions = [
  { days: 7, packageCount: 14 },
  { days: 15, packageCount: 30 },
  { days: 30, packageCount: 60 }
]

// 预设选项天数（用于判断是否为自定义天数）
const presetDays = [7, 15, 30]

// 自选天数
const customDays = ref('')

// 是否处于自定义天数模式（非预设选项）
const isCustomDaysMode = ref(false)

// 保质期说明展开状态
const showShelfLife = ref(false)

// 计算说明展开状态
const showCalculationDetails = ref(false)

onMounted(() => {
  console.log('========== [RecipeDiy] onMounted ==========')

  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const options = currentPage.options || {}

  console.log('[页面参数]', options)

  recipeId.value = options.recipeId || ''
  console.log('[食谱ID]', recipeId.value)

  if (recipeId.value) {
    loadBreeds()
    loadHealthTagMapping()
    loadRecipe()
    loadDogs()
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
    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET'
    })

    console.log('[RecipeDiy] loadRecipe API响应:', res)

    if (res.code === 0 && res.data) {
      recipe.value = res.data
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

      // 自动选择第一只狗狗（如果还没有选择狗狗）
      if (res.data.length > 0 && !selectedDogId.value) {
        const firstDog = res.data[0]
        console.log('[RecipeDiy] 自动选择第一只狗狗:', firstDog)

        selectedDogId.value = firstDog.id
        selectedDog.value = firstDog

        // 调用饭量计算API
        await loadDogCalc(firstDog.id)

        // 校验生命阶段
        checkLifeStageMatch()
      }
    }
  } catch (error) {
    console.error('[RecipeDiy] Load dogs error:', error)
  }

  console.log('[RecipeDiy] loadDogs 结束')
}

async function onDogPickerChange(e: any) {
  console.log('========== [RecipeDiy] onDogPickerChange ==========')
  console.log('[选择参数]', e.detail)

  // picker返回的是索引，不是dogId
  const index = parseInt(e.detail.value)
  console.log('[选择的索引]', index)

  const dog = dogs.value[index]
  console.log('[索引对应的狗狗]', dog)

  if (dog) {
    const dogId = dog.id
    console.log('[狗狗ID]', dogId)

    // 重要：先更新 selectedDog，再调用其他函数
    selectedDogId.value = dogId
    selectedDog.value = dog

    console.log('[DEBUG] selectedDog 已更新:', selectedDog.value.name)

    // 调用饭量计算API
    await loadDogCalc(dogId)

    console.log('[DEBUG] 准备调用 checkLifeStageMatch')
    console.log('[DEBUG] 当前 recipe.value.applicableLifeStages:', recipe.value.applicableLifeStages)

    // 校验生命阶段
    checkLifeStageMatch()

    console.log('[DEBUG] checkLifeStageMatch 调用完成')
    console.log('[DEBUG] isLifeStageMatch.value:', isLifeStageMatch.value)
    console.log('[DEBUG] showWarning.value:', showWarning.value)
  } else {
    console.error('[错误] 未找到索引对应的狗狗, index:', index, 'dogs.length:', dogs.value.length)
  }

  console.log('========== [RecipeDiy] onDogPickerChange 结束 ==========')
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
    return
  }

  const dogLifeStage = getDogLifeStage(selectedDog.value)
  const applicableStages = recipe.value.applicableLifeStages || []

  console.log('[RecipeDiy] 生命阶段校验:', {
    dogLifeStage,
    applicableStages: Array.from(applicableStages), // 将Proxy转为数组
    dogName: selectedDog.value.name
  })

  // 如果无法判断狗狗的生命阶段（无品种信息），则不显示警告
  if (dogLifeStage === null) {
    console.log('[RecipeDiy] 无法判断狗狗生命阶段（无品种信息），跳过警告')
    isLifeStageMatch.value = true  // 默认为匹配，不显示警告
  } else {
    isLifeStageMatch.value = applicableStages.includes(dogLifeStage)
    console.log('[RecipeDiy] 校验结果:', isLifeStageMatch.value ? '匹配' : '不匹配')
  }

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

  console.log('[getDogLifeStage] 生日信息:', {
    birthday: dog.birthday,
    birthdayObj: birthday,
    now: now,
    timeDiff: now.getTime() - birthday.getTime()
  })

  const ageInDays = Math.floor((now.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24))
  const ageInMonths = Math.floor(ageInDays / 30.4375) // 使用更精确的月数计算（平均每月30.4375天）
  const ageInYears = ageInMonths / 12.0

  console.log('[getDogLifeStage] 年龄计算:', {
    ageInDays,
    ageInMonths,
    ageInYears
  })

  console.log('[getDogLifeStage] 检查品种信息:', {
    breedId: dog.breedId,
    breedName: dog.breedName
  })

  // 在本地breeds列表中查找品种对象
  const breed = breeds.value.find(b => b.id === dog.breedId)

  if (!breed || !breed.adultAgeMonths) {
    console.log('[getDogLifeStage] 缺少完整的品种信息（breed.adultAgeMonths），返回null')
    console.log('[getDogLifeStage] 找到的breed对象:', breed)
    return null  // 没有品种信息，无法判断，返回null
  }

  // 使用品种特定的标准
  const adultAgeMonths = breed.adultAgeMonths
  const seniorAgeYears = breed.seniorAgeYears || 7  // 默认7岁老年

  console.log('[getDogLifeStage] 使用品种特定标准:', {
    breedName: breed.name,
    adultAgeMonths,
    seniorAgeYears
  })

  if (ageInMonths < adultAgeMonths) {
    console.log('[getDogLifeStage] 判断为幼犬（PUPPY）', { ageInMonths, adultAgeMonths })
    return 'PUPPY'  // 幼犬
  } else if (ageInYears >= seniorAgeYears) {
    console.log('[getDogLifeStage] 判断为老年犬（SENIOR）', { ageInYears, seniorAgeYears })
    return 'SENIOR'  // 老年犬
  } else {
    console.log('[getDogLifeStage] 判断为成犬（ADULT）', { ageInMonths, ageInYears, adultAgeMonths, seniorAgeYears })
    return 'ADULT'  // 成犬
  }
}

function getDogLifeStageLabel(dog: Dog): string {
  const stage = getDogLifeStage(dog)

  // 如果无法判断生命阶段，返回"未知"
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

function dismissWarning() {
  showWarning.value = false
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
  cycleDays.value = days
  customDays.value = '' // 清空自选天数
  isCustomDaysMode.value = false // 点击预设选项，退出自定义模式
}

function confirmCustomDays() {
  const days = Number(customDays.value)

  // 检查是否为数字
  if (isNaN(days)) {
    uni.showToast({
      title: '请输入有效的天数',
      icon: 'none'
    })
    return
  }

  // 检查是否为整数
  if (!Number.isInteger(days)) {
    uni.showToast({
      title: '天数必须是整数',
      icon: 'none'
    })
    return
  }

  // 检查范围
  if (days < 1 || days > 90) {
    uni.showToast({
      title: '请输入1-90之间的天数',
      icon: 'none'
    })
    return
  }

  cycleDays.value = days

  // 判断是否为自定义天数（不在预设选项中）
  isCustomDaysMode.value = !presetDays.includes(days)

  // 清空输入框
  customDays.value = ''
}

function editCustomDays() {
  // 回填当前值到输入框
  customDays.value = String(cycleDays.value)
  // 切换回编辑模式
  isCustomDaysMode.value = false
}

function toggleShelfLife() {
  showShelfLife.value = !showShelfLife.value
}

function generateSheet() {
  if (!selectedDogId.value) {
    uni.showToast({
      title: '请先选择狗狗档案',
      icon: 'none'
    })
    return
  }

  if (!isLifeStageMatch.value && showWarning.value) {
    uni.showModal({
      title: '提示',
      content: '狗狗生命阶段与食谱不匹配，确定要继续吗？',
      success: (res) => {
        if (res.confirm) {
          navigateToSheet()
        }
      }
    })
    return
  }

  navigateToSheet()
}

function navigateToSheet() {
  const params = {
    recipeId: recipeId.value,
    dogId: selectedDogId.value,
    cycleDays: cycleDays.value,
    perMealG: Math.round(perMealG.value),
    isPerMealModified: isPerMealModified.value,
    dailyIntakeG: Math.round(displayDailyIntakeG.value),
  }

  const queryString = Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
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

function getLifeStageLabel(stage: string): string {
  const map: Record<string, string> = {
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
    'PREGNANCY': '妊娠期',
    'LACTATION': '哺乳期',
  }
  return map[stage] || stage
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

.cycle-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
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
