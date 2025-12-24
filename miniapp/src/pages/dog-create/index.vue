<template>
  <view class="container">
    <view class="form-section">
      <!-- Loading breeds indicator -->
      <view class="loading-notice" v-if="loadingBreeds">
        <text>正在加载品种列表...</text>
      </view>

      <view class="form-item">
        <text class="label">姓名 *</text>
        <input class="input" placeholder="请输入狗狗姓名" v-model="formData.name" />
      </view>

      <!-- Breed Selection with Search -->
      <view class="form-item breed-section">
        <text class="label">品种 *</text>

        <!-- Selected Breed Display -->
        <view v-if="selectedBreed || isMixedBreed" class="selected-breed-display">
          <text class="selected-text">
            {{ isMixedBreed
              ? (formData.customBreedName || '混血/其他')
              : selectedBreed?.name
            }}
          </text>
          <text class="change-btn" @tap="clearBreed">重新选择</text>
        </view>

        <!-- Breed Selection UI (shown when no breed selected) -->
        <view v-else class="breed-selector">
          <!-- Search Input -->
          <view class="search-box">
            <input
              class="search-input"
              placeholder="🔍 搜索品种（如：拉布拉多、金毛）"
              v-model="searchKeyword"
              @input="onSearchInput"
            />
          </view>

          <!-- Search Results -->
          <view v-if="searchKeyword" class="search-results">
            <text class="section-title">搜索结果 ({{ filteredBreeds.length }}个品种)</text>
            <view class="breed-list">
              <view
                v-for="breed in filteredBreeds"
                :key="breed.id"
                class="breed-item"
                @tap="selectBreed(breed)"
              >
                {{ breed.name }}
              </view>
            </view>
            <view v-if="filteredBreeds.length === 0" class="no-results">
              未找到匹配的品种
            </view>
          </view>

          <!-- No Search: Show Common Breeds -->
          <view v-else>
            <!-- Common Breeds (Collapsible) -->
            <view class="section">
              <view class="section-header" @tap="toggleCommonBreeds">
                <text class="section-title">💡 常见品种</text>
                <text class="toggle-icon">{{ showCommonBreeds ? '▲' : '▼' }}</text>
              </view>
              <view v-if="showCommonBreeds" class="common-breeds">
                <view
                  v-for="breedName in commonBreeds"
                  :key="breedName"
                  class="breed-tag"
                  @tap="selectBreedByName(breedName)"
                >
                  {{ breedName }}
                </view>
              </view>
              <view v-else class="common-breeds collapsed">
                <view
                  v-for="breedName in commonBreeds.slice(0, 5)"
                  :key="breedName"
                  class="breed-tag"
                  @tap="selectBreedByName(breedName)"
                >
                  {{ breedName }}
                </view>
              </view>
            </view>

            <!-- All Breeds Toggle (Grouped by Size) -->
            <view class="section">
              <view class="section-header" @tap="toggleAllBreeds">
                <text class="section-title">📋 全部品种 (按体型分类)</text>
                <text class="toggle-icon">{{ showAllBreeds ? '▲' : '▼' }}</text>
              </view>

              <view v-if="showAllBreeds" class="breed-list all-breeds-list">
                <view
                  v-for="(breedList, category) in breedsBySizeCategory"
                  :key="category"
                  class="size-category-group"
                >
                  <view class="size-category-title">
                    {{ sizeCategoryLabels[category] }} ({{ breedList.length }}种)
                  </view>
                  <view
                    v-for="breed in breedList"
                    :key="breed.id"
                    class="breed-item"
                    @tap="selectBreed(breed)"
                  >
                    {{ breed.name }}
                  </view>
                </view>
              </view>
            </view>

            <!-- Mixed Breed Option -->
            <view class="section">
              <view class="mixed-breed-btn" @tap="selectMixedBreed">
                混血/其他
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- Size Class Display (Inline) -->
      <view v-if="selectedBreed || isMixedBreed" class="form-item size-display">
        <text class="label">📏 体型分类</text>
        <picker
          mode="selector"
          :range="sizeClassOptionsForPicker"
          :value="sizeClassIndex"
          @change="onSizeClassChange"
        >
          <view class="size-info" :class="{ 'size-required': isMixedBreed && !formData.sizeClassOverride }">
            <text class="size-text">{{ getSizeClassDisplay() }}</text>
            <text class="edit-icon">✏️</text>
          </view>
        </picker>
        <text class="hint" :class="{ 'hint-warning': isMixedBreed && !formData.sizeClassOverride }">
          {{ getSizeClassHint() }}
        </text>
      </view>

      <view class="form-item">
        <text class="label">生日 *</text>
        <picker mode="date" :value="formData.birthday" @change="onBirthdayChange">
          <view class="picker">{{ formData.birthday || '请选择生日' }}</view>
        </picker>
      </view>

      <view class="form-item">
        <text class="label">性别</text>
        <picker mode="selector" :range="genderOptions" :value="genderIndex" @change="onGenderChange">
          <view class="picker">{{ formData.gender }}</view>
        </picker>
      </view>

      <view class="form-item">
        <text class="label">是否绝育</text>
        <switch :checked="formData.isNeutered" @change="onNeuteredChange" />
      </view>

      <view class="form-item">
        <text class="label">体重(kg) *</text>
        <input class="input" type="digit" placeholder="请输入体重" v-model="formData.currentWeightKg" />
      </view>

      <view class="form-item">
        <text class="label">BCS评分 (1-9)</text>
        <slider :min="1" :max="9" :value="formData.bcsScore" step="1" show-value @change="onBcsChange" />
      </view>

      <view class="form-item">
        <text class="label">活动水平</text>
        <picker mode="selector" :range="activityLevelOptions" :value="activityLevelIndex" @change="onActivityLevelChange">
          <view class="picker">{{ formData.activityLevel }}</view>
        </picker>
      </view>

      <view class="form-item">
        <text class="label">生命阶段</text>
        <picker mode="selector" :range="lifeStageOptions" :value="lifeStageIndex" @change="onLifeStageChange">
          <view class="picker">{{ formData.lifeStageOverride }}</view>
        </picker>
      </view>

      <view class="form-item">
        <text class="label">每日餐数</text>
        <input class="input" type="number" placeholder="请输入每日餐数" v-model="formData.mealsPerDay" />
      </view>

      <view class="form-item">
        <text class="label">零食输入模式</text>
        <picker mode="selector" :range="treatInputModeOptions" :value="treatInputModeIndex" @change="onTreatInputModeChange">
          <view class="picker">{{ formData.treatInputMode }}</view>
        </picker>
      </view>

      <view class="form-item" v-if="formData.treatInputMode === 'ESTIMATE_LEVEL'">
        <text class="label">零食习惯</text>
        <picker mode="selector" :range="treatLevelOptions" :value="treatLevelIndex" @change="onTreatLevelChange">
          <view class="picker">{{ formData.treatLevel }}</view>
        </picker>
      </view>

      <view class="form-item" v-if="formData.treatInputMode === 'EXACT_KCAL'">
        <text class="label">每日零食能量(kcal) *</text>
        <input class="input" type="digit" placeholder="请输入零食能量" v-model="formData.manualTreatKcal" />
      </view>

      <view class="form-item">
        <text class="label">病史</text>
        <textarea class="textarea" placeholder="请输入病史" v-model="formData.medicalHistory" />
      </view>

      <button class="btn" @tap="submit" :disabled="!canSubmit">创建档案</button>

      <!-- Preview Calculation Button -->
      <button class="btn btn-secondary" @tap="previewCalculation" :disabled="!canPreview">
        试算喂食建议
      </button>

      <!-- Feeding Recommendation Card -->
      <view class="recommendation-card" v-if="calcResult">
        <view class="card-title">📊 喂食建议</view>
        <view class="calc-item">
          <text class="calc-label">静息能量需求 (RER):</text>
          <text class="calc-value">{{ calcResult.rer?.toFixed(1) || 'N/A' }} kcal/天</text>
        </view>
        <view class="calc-item">
          <text class="calc-label">每日总能量需求 (DER):</text>
          <text class="calc-value">{{ calcResult.totalDer?.toFixed(1) || 'N/A' }} kcal/天</text>
        </view>
        <view class="calc-item highlight-item">
          <text class="calc-label">每日建议能量 (鲜食):</text>
          <text class="calc-value highlight">{{ calcResult.finalFoodKcal?.toFixed(1) || 'N/A' }} kcal/天</text>
        </view>
        <view class="calc-item" v-if="calcResult.dailyIntakeG">
          <text class="calc-label">每日建议鲜食摄入量:</text>
          <text class="calc-value highlight">{{ calcResult.dailyIntakeG.toFixed(0) }} g/天</text>
        </view>
        <view class="calc-item" v-if="calcResult.treatDeduction && calcResult.treatDeduction > 0">
          <text class="calc-label">零食扣减:</text>
          <text class="calc-value">{{ calcResult.treatDeduction.toFixed(1) }} kcal/天</text>
        </view>
        <view class="calc-warning" v-if="calcResult.isTreatCapped">
          ⚠️ 零食热量已超过安全上限(10%)，系统已自动调整为安全最大值
        </view>
      </view>
    </view>

    <!-- Custom Breed Name Input Modal -->
    <view v-if="showCustomBreedInput" class="custom-breed-modal" @tap.self="cancelCustomBreed">
      <view class="custom-breed-content">
        <text class="custom-breed-title">请输入品种名称</text>
        <input
          class="custom-breed-input"
          v-model="customBreedName"
          placeholder="如：泰迪串串、田园犬等"
          :focus="true"
        />
        <view class="custom-breed-actions">
          <button class="custom-breed-btn-cancel" @tap="cancelCustomBreed">取消</button>
          <button class="custom-breed-btn-confirm" @tap="confirmCustomBreed">确定</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'
import { addDogToCache } from '../../utils/dog-cache'

interface FormData {
  name: string
  breedId: string
  customBreedName?: string
  birthday: string
  gender: string
  isNeutered: boolean
  currentWeightKg: string
  bcsScore: number
  activityLevel: string
  lifeStageOverride: string
  sizeClassOverride: string | null
  mealsPerDay: number
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  medicalHistory: string
}

// Constants
const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const commonBreeds = [
  '拉布拉多', '泰迪', '贵宾犬(小型)', '贵宾犬(标准)', '金毛',
  '比熊', '哈士奇', '德牧', '边牧', '柯基',
  '萨摩耶', '法国斗牛犬', '吉娃娃', '博美', '雪纳瑞(小型)',
  '约克夏', '马尔济斯', '腊肠犬', '阿拉斯加', '杜宾'
]

const formData = ref<FormData>({
  name: '',
  breedId: '',
  customBreedName: '',
  birthday: '',
  gender: 'MALE',
  isNeutered: false,
  currentWeightKg: '',
  bcsScore: 5,
  activityLevel: 'NORMAL',
  lifeStageOverride: 'NONE',
  sizeClassOverride: null,
  mealsPerDay: 2,
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  medicalHistory: ''
})

const genderOptions = ['MALE', 'FEMALE']
const activityLevelOptions = ['RESTING', 'LOW', 'NORMAL', 'HIGH', 'WORKING']
const lifeStageOptions = ['NONE', 'PUPPY', 'ADULT', 'SENIOR', 'PREGNANCY', 'LACTATION']
const sizeClassOptions = ['SMALL', 'MEDIUM', 'LARGE', 'GIANT']
const sizeClassOptionsForPicker = ['小型犬', '中型犬', '大型犬', '巨型犬']
const treatInputModeOptions = ['ESTIMATE_LEVEL', 'EXACT_KCAL']
const treatLevelOptions = ['NONE', 'LOW', 'MODERATE', 'HIGH']

interface Breed {
  id: string
  name: string
  sizeCategory: string
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg?: number
}

interface CalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  dailyIntakeG?: number
}

const breeds = ref<Breed[]>([])
const selectedBreed = ref<Breed | null>(null)
const calcResult = ref<CalcResult | null>(null)
const loadingBreeds = ref(false)
const calculating = ref(false)

// New state variables
const searchKeyword = ref('')
const showCommonBreeds = ref(false)
const showAllBreeds = ref(false)
const isMixedBreed = ref(false)
const showCustomBreedInput = ref(false)
const customBreedName = ref('')

const filteredBreeds = computed(() => {
  if (!searchKeyword.value) {
    return []
  }
  const keyword = searchKeyword.value.trim()
  return breeds.value.filter(b => b.name.includes(keyword))
})

const breedsBySizeCategory = computed(() => {
  const grouped: Record<string, typeof breeds.value> = {
    'SMALL': [],
    'MEDIUM': [],
    'LARGE': [],
    'GIANT': []
  }

  breeds.value.forEach(breed => {
    const category = breed.sizeCategory
    if (grouped[category]) {
      grouped[category].push(breed)
    }
  })

  return grouped
})

const sizeCategoryLabels: Record<string, string> = {
  'SMALL': '小型犬',
  'MEDIUM': '中型犬',
  'LARGE': '大型犬',
  'GIANT': '巨型犬'
}

const genderIndex = computed(() => genderOptions.indexOf(formData.value.gender))
const activityLevelIndex = computed(() => activityLevelOptions.indexOf(formData.value.activityLevel))
const lifeStageIndex = computed(() => lifeStageOptions.indexOf(formData.value.lifeStageOverride))
const sizeClassIndex = computed(() => {
  const override = formData.value.sizeClassOverride
  if (!override) return 0
  return sizeClassOptions.indexOf(override)
})
const treatInputModeIndex = computed(() => treatInputModeOptions.indexOf(formData.value.treatInputMode))
const treatLevelIndex = computed(() => treatLevelOptions.indexOf(formData.value.treatLevel))

const canSubmit = computed(() => {
  return formData.value.name &&
         formData.value.breedId &&
         formData.value.birthday &&
         formData.value.currentWeightKg &&
         !calculating.value &&
         (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
})

const canPreview = computed(() => {
  return formData.value.breedId &&
         formData.value.birthday &&
         formData.value.currentWeightKg &&
         !calculating.value &&
         (isMixedBreed.value ? formData.value.sizeClassOverride !== null : true)
})

onMounted(async () => {
  // Load breeds
  await loadBreeds()

  // Check if editing existing dog
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const dogId = currentPage.options?.dogId
  if (dogId) {
    // Load existing dog - for MVP, just show form
    // In production, would load and populate formData
  }
})

async function loadBreeds() {
  loadingBreeds.value = true
  try {
    const res: any = await request({
      url: '/dogs/breeds',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      breeds.value = res.data
      console.log('[DogCreate] Loaded breeds:', breeds.value.length)
      if (breeds.value.length === 0) {
        uni.showToast({
          title: '品种列表为空，请先运行seed脚本',
          icon: 'none',
          duration: 3000
        })
      }
    } else {
      throw new Error(res.message || 'Failed to load breeds')
    }
  } catch (err) {
    console.error('[DogCreate] Load breeds error:', err)
    uni.showToast({
      title: '加载品种列表失败',
      icon: 'none',
      duration: 2000
    })
  } finally {
    loadingBreeds.value = false
  }
}

function onSearchInput(e: any) {
  searchKeyword.value = e.detail.value
}

function selectBreed(breed: Breed) {
  selectedBreed.value = breed
  isMixedBreed.value = false
  formData.value.breedId = breed.id
  formData.value.sizeClassOverride = null  // Reset override
  searchKeyword.value = ''
  previewCalculation()
}

function selectBreedByName(name: string) {
  const breed = breeds.value.find(b => b.name === name)
  if (breed) {
    selectBreed(breed)
  }
}

function selectMixedBreed() {
  showCustomBreedInput.value = true
}

function confirmCustomBreed() {
  const name = customBreedName.value.trim() || '混血/其他'
  selectedBreed.value = null
  isMixedBreed.value = true
  formData.value.breedId = MIXED_BREED_VIRTUAL_ID
  formData.value.customBreedName = name
  formData.value.sizeClassOverride = null  // User must select
  showCustomBreedInput.value = false
  customBreedName.value = ''
}

function cancelCustomBreed() {
  showCustomBreedInput.value = false
  customBreedName.value = ''
}

function clearBreed() {
  selectedBreed.value = null
  isMixedBreed.value = false
  formData.value.breedId = ''
  formData.value.customBreedName = ''
  formData.value.sizeClassOverride = null
  searchKeyword.value = ''
}

function toggleCommonBreeds() {
  showCommonBreeds.value = !showCommonBreeds.value
}

function toggleAllBreeds() {
  showAllBreeds.value = !showAllBreeds.value
}

function onSizeClassChange(e: any) {
  const index = e.detail.value
  formData.value.sizeClassOverride = sizeClassOptions[index]
  previewCalculation()
}

function getSizeClassDisplay(): string {
  const override = formData.value.sizeClassOverride
  const labels: Record<string, string> = {
    'SMALL': '小型犬',
    'MEDIUM': '中型犬',
    'LARGE': '大型犬',
    'GIANT': '巨型犬'
  }

  if (isMixedBreed.value) {
    return override ? labels[override] : '请选择'
  }

  if (override) {
    return `${labels[override]} (手动调整)`
  }

  if (selectedBreed.value) {
    return `${labels[selectedBreed.value.sizeCategory]} (自动匹配)`
  }

  return '请先选择品种'
}

function getSizeClassHint(): string {
  if (isMixedBreed.value) {
    return '混血犬需要手动选择体型分类'
  }
  if (formData.value.sizeClassOverride) {
    return '点击 ✏️ 可重新调整'
  }
  return '点击 ✏️ 可修改系统自动判断的体型'
}

function onBirthdayChange(e: any) {
  formData.value.birthday = e.detail.value
}

function onGenderChange(e: any) {
  formData.value.gender = genderOptions[e.detail.value]
}

function onNeuteredChange(e: any) {
  formData.value.isNeutered = e.detail.value
}

function onBcsChange(e: any) {
  formData.value.bcsScore = e.detail.value
}

function onActivityLevelChange(e: any) {
  formData.value.activityLevel = activityLevelOptions[e.detail.value]
}

function onLifeStageChange(e: any) {
  formData.value.lifeStageOverride = lifeStageOptions[e.detail.value]
}

function onTreatInputModeChange(e: any) {
  formData.value.treatInputMode = treatInputModeOptions[e.detail.value]
}

function onTreatLevelChange(e: any) {
  formData.value.treatLevel = treatLevelOptions[e.detail.value]
  previewCalculation()
}

async function previewCalculation() {
  // Only calculate if we have minimum required fields
  // Silently return if not ready - don't show error to user
  if (!canPreview.value) {
    return
  }

  calculating.value = true
  try {
    const payload: any = {
      breedId: formData.value.breedId,
      birthday: new Date(formData.value.birthday).toISOString(),
      gender: formData.value.gender,
      isNeutered: formData.value.isNeutered,
      currentWeightKg: parseFloat(formData.value.currentWeightKg),
      bcsScore: formData.value.bcsScore,
      activityLevel: formData.value.activityLevel,
      lifeStageOverride: formData.value.lifeStageOverride,
      sizeClassOverride: formData.value.sizeClassOverride,
      mealsPerDay: formData.value.mealsPerDay,
      treatInputMode: formData.value.treatInputMode,
      treatLevel: formData.value.treatLevel
    }

    if (formData.value.treatInputMode === 'EXACT_KCAL' && formData.value.manualTreatKcal) {
      payload.manualTreatKcal = parseFloat(formData.value.manualTreatKcal)
    }

    console.log('[DogCreate] Preview calculation payload:', payload)

    const res: any = await request({
      url: '/dogs/calc-preview',
      method: 'POST',
      data: payload
    })

    console.log('[DogCreate] Preview calculation response:', res)

    if (res.code === 0 && res.data) {
      calcResult.value = {
        rer: res.data.rer,
        totalDer: res.data.totalDer,
        finalFoodKcal: res.data.finalFoodKcal,
        treatDeduction: res.data.treatDeduction,
        isTreatCapped: res.data.isTreatCapped,
        dailyIntakeG: res.data.dailyIntakeG
      }
      console.log('[DogCreate] Preview calculation result:', calcResult.value)
      uni.showToast({
        title: '计算完成',
        icon: 'success',
        duration: 1500
      })
    } else {
      throw new Error(res.message || 'Calculation failed')
    }
  } catch (err: any) {
    console.error('[DogCreate] Preview calculation error:', err)
    uni.showToast({
      title: err?.message || '计算失败，请检查输入',
      icon: 'none',
      duration: 2000
    })
    calcResult.value = null
  } finally {
    calculating.value = false
  }
}

function submit() {
  const { name, breedId, birthday, currentWeightKg } = formData.value

  // Validation
  if (!name || !breedId || !birthday || !currentWeightKg) {
    uni.showToast({
      title: '请填写必填项',
      icon: 'none'
    })
    return
  }

  // For mixed breed, require size class override
  if (isMixedBreed.value && !formData.value.sizeClassOverride) {
    uni.showToast({
      title: '混血犬请选择体型分类',
      icon: 'none'
    })
    return
  }

  if (formData.value.treatInputMode === 'EXACT_KCAL' && !formData.value.manualTreatKcal) {
    uni.showToast({
      title: '精确模式需填写零食能量',
      icon: 'none'
    })
    return
  }

  uni.showLoading({ title: '创建中...' })

  const payload: any = {
    name,
    breedId,
    customBreedName: formData.value.customBreedName || null,
    birthday: new Date(birthday).toISOString(),
    gender: formData.value.gender,
    isNeutered: formData.value.isNeutered,
    currentWeightKg: parseFloat(currentWeightKg),
    bcsScore: formData.value.bcsScore,
    activityLevel: formData.value.activityLevel,
    lifeStageOverride: formData.value.lifeStageOverride,
    sizeClassOverride: formData.value.sizeClassOverride,
    mealsPerDay: formData.value.mealsPerDay,
    treatInputMode: formData.value.treatInputMode,
    treatLevel: formData.value.treatLevel,
    medicalHistory: formData.value.medicalHistory || null
  }

  if (formData.value.treatInputMode === 'EXACT_KCAL') {
    payload.manualTreatKcal = parseFloat(formData.value.manualTreatKcal)
  }

  request({
    url: '/dogs',
    method: 'POST',
    data: payload
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      const createdDog = res.data.profile || res.data
      const dogId = createdDog.id

      if (!dogId) {
        console.error('[DogCreate] Response missing dog id:', res.data)
        uni.showToast({
          title: '创建失败：响应格式错误',
          icon: 'none',
          duration: 2000
        })
        return
      }

      console.info(`[DogCreate] Dog created successfully: id=${dogId}, name=${createdDog.name}`)

      uni.setStorageSync('dogId', dogId)
      addDogToCache(createdDog)

      uni.showToast({
        title: '创建成功',
        icon: 'success',
        duration: 1500
      })

      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      const errorMsg = res.message || '创建失败'
      console.error('[DogCreate] API error:', res.code, errorMsg)
      uni.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      })
    }
  }).catch((err: any) => {
    const errMsg = err?.message || String(err) || '网络错误'
    console.error('[DogCreate] Create dog error:', err)

    let userMsg = '创建失败，请稍后重试'
    if (errMsg.includes('400') || errMsg.includes('Bad Request')) {
      userMsg = '请求参数错误，请检查填写内容'
    } else if (errMsg.includes('网络') || errMsg.includes('连接') || errMsg.includes('timeout')) {
      userMsg = '网络连接失败，请检查网络设置'
    }

    uni.showToast({
      title: userMsg,
      icon: 'none',
      duration: 2000
    })
  }).finally(() => {
    uni.hideLoading()
  })
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.form-section {
  background-color: #fff;
  padding: 30rpx;
  border-radius: 8rpx;
}

.loading-notice {
  background-color: #f0f0f0;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
  text-align: center;
  font-size: 28rpx;
  color: #666;
}

.form-item {
  margin-bottom: 30rpx;
}

.breed-section {
  margin-bottom: 40rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  margin-bottom: 10rpx;
  color: #333;
  font-weight: bold;
}

/* Breed Selection Styles */
.breed-selector {
  border: 1px solid #ddd;
  border-radius: 8rpx;
  overflow: hidden;
}

.search-box {
  padding: 20rpx;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
}

.search-input {
  width: 100%;
  height: 70rpx;
  border: 1px solid #ddd;
  border-radius: 6rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.section {
  padding: 20rpx;
  border-bottom: 1px solid #e9ecef;
}

.section:last-child {
  border-bottom: none;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

.section-title {
  font-size: 26rpx;
  color: #666;
  font-weight: bold;
  display: block;
  margin-bottom: 15rpx;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
}

/* Common Breeds Tags */
.common-breeds {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
}

.breed-tag {
  background-color: #e6f7ff;
  color: #1890ff;
  padding: 10rpx 20rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  border: 1px solid #91d5ff;
}

/* Breed List */
.breed-list {
  max-height: 400rpx;
  overflow-y: auto;
}

.all-breeds-list {
  max-height: 600rpx;
}

.breed-item {
  padding: 20rpx;
  border-bottom: 1px solid #f0f0f0;
  font-size: 28rpx;
  color: #333;
}

.breed-item:last-child {
  border-bottom: none;
}

.no-results {
  padding: 40rpx;
  text-align: center;
  color: #999;
  font-size: 26rpx;
}

/* Mixed Breed Button */
.mixed-breed-btn {
  background-color: #fff7e6;
  color: #fa8c16;
  padding: 25rpx;
  border-radius: 8rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: bold;
  border: 1px solid #ffd591;
}

/* Selected Breed Display */
.selected-breed-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 8rpx;
}

.selected-text {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.change-btn {
  color: #1890ff;
  font-size: 26rpx;
}

/* Size Class Display */
.size-display {
  background-color: #f8f9fa;
  padding: 20rpx;
  border-radius: 8rpx;
  border: 1px solid #e9ecef;
}

.size-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx;
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 6rpx;
}

.size-text {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.edit-icon {
  font-size: 32rpx;
  color: #1890ff;
}

/* Original Input Styles */
.input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.textarea {
  width: 100%;
  min-height: 150rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}

.picker {
  height: 80rpx;
  line-height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
}

.hint {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-top: 5rpx;
}

.size-required {
  border-color: #ff4d4f !important;
  background-color: #fff1f0 !important;
}

.hint-warning {
  color: #ff4d4f !important;
  font-weight: bold;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #07c160;
  color: #fff;
  border-radius: 8rpx;
  font-size: 32rpx;
  margin-top: 20rpx;
  border: none;
}

.btn:disabled {
  background-color: #ccc;
  color: #999;
}

.btn-secondary {
  background-color: #1890ff;
  margin-top: 20rpx;
}

.recommendation-card {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8rpx;
  padding: 30rpx;
  margin-top: 30rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 15rpx;
}

.calc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15rpx 0;
  border-bottom: 1px solid #f0f0f0;
}

.calc-item:last-child {
  border-bottom: none;
}

.calc-item.highlight-item {
  background-color: #e6f7ff;
  padding: 20rpx;
  border-radius: 4rpx;
  margin: 10rpx 0;
  border-bottom: none;
}

.calc-label {
  font-size: 28rpx;
  color: #666;
  flex: 1;
}

.calc-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.calc-value.highlight {
  color: #1890ff;
  font-weight: bold;
  font-size: 32rpx;
}

.calc-warning {
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4rpx;
  padding: 15rpx;
  margin-top: 15rpx;
  font-size: 26rpx;
  color: #fa8c16;
  line-height: 1.5;
}

/* Collapsed Common Breeds */
.common-breeds.collapsed {
  display: flex;
  flex-wrap: wrap;
  gap: 15rpx;
  max-height: 80rpx;
  overflow: hidden;
}

/* Size Category Groups */
.size-category-group {
  margin-bottom: 30rpx;
}

.size-category-group:last-child {
  margin-bottom: 0;
}

.size-category-title {
  font-size: 26rpx;
  color: #666;
  font-weight: bold;
  padding: 15rpx 20rpx;
  background-color: #f8f9fa;
  border-radius: 4rpx;
  margin-bottom: 10rpx;
}

/* Custom Breed Input Modal */
.custom-breed-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.custom-breed-content {
  width: 600rpx;
  background-color: #fff;
  border-radius: 12rpx;
  padding: 40rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.15);
}

.custom-breed-title {
  font-size: 32rpx;
  color: #333;
  font-weight: bold;
  margin-bottom: 30rpx;
  display: block;
  text-align: center;
}

.custom-breed-input {
  width: 100%;
  height: 80rpx;
  border: 1px solid #ddd;
  border-radius: 8rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  margin-bottom: 30rpx;
}

.custom-breed-actions {
  display: flex;
  gap: 20rpx;
}

.custom-breed-btn-cancel,
.custom-breed-btn-confirm {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  text-align: center;
  border: none;
}

.custom-breed-btn-cancel {
  background-color: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
}

.custom-breed-btn-confirm {
  background-color: #07c160;
  color: #fff;
}
</style>
