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

      <view class="form-item">
        <text class="label">品种 *</text>
        <picker 
          mode="selector" 
          :range="breedOptions" 
          :range-key="'name'"
          :value="breedIndex" 
          @change="onBreedChange"
          :disabled="loadingBreeds"
        >
          <view class="picker">
            {{ selectedBreed?.name || (loadingBreeds ? '加载中...' : '请选择品种') }}
          </view>
        </picker>
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
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'
import { addDogToCache } from '../../utils/dog-cache'

interface FormData {
  name: string
  breedId: string
  birthday: string
  gender: string
  isNeutered: boolean
  currentWeightKg: string
  bcsScore: number
  activityLevel: string
  lifeStageOverride: string
  mealsPerDay: number
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  medicalHistory: string
}

const formData = ref<FormData>({
  name: '',
  breedId: '',
  birthday: '',
  gender: 'MALE',
  isNeutered: false,
  currentWeightKg: '',
  bcsScore: 5,
  activityLevel: 'NORMAL',
  lifeStageOverride: 'NONE',
  mealsPerDay: 2,
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  medicalHistory: ''
})

const genderOptions = ['MALE', 'FEMALE']
const activityLevelOptions = ['RESTING', 'LOW', 'NORMAL', 'HIGH', 'WORKING']
const lifeStageOptions = ['NONE', 'PUPPY', 'ADULT', 'SENIOR', 'PREGNANCY', 'LACTATION']
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

const breedOptions = computed(() => breeds.value)
const breedIndex = computed(() => {
  if (!selectedBreed.value) return -1
  return breeds.value.findIndex(b => b.id === selectedBreed.value!.id)
})

const genderIndex = computed(() => genderOptions.indexOf(formData.value.gender))
const activityLevelIndex = computed(() => activityLevelOptions.indexOf(formData.value.activityLevel))
const lifeStageIndex = computed(() => lifeStageOptions.indexOf(formData.value.lifeStageOverride))
const treatInputModeIndex = computed(() => treatInputModeOptions.indexOf(formData.value.treatInputMode))
const treatLevelIndex = computed(() => treatLevelOptions.indexOf(formData.value.treatLevel))

const canSubmit = computed(() => {
  return formData.value.name && 
         formData.value.breedId && 
         formData.value.birthday && 
         formData.value.currentWeightKg &&
         !calculating.value
})

const canPreview = computed(() => {
  return formData.value.breedId && 
         formData.value.birthday && 
         formData.value.currentWeightKg &&
         !calculating.value
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

function onBreedChange(e: any) {
  const index = e.detail.value
  if (index >= 0 && index < breeds.value.length) {
    selectedBreed.value = breeds.value[index]
    formData.value.breedId = selectedBreed.value.id
    // Trigger preview calculation
    previewCalculation()
  }
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
  // Trigger preview calculation when treat settings change
  previewCalculation()
}

async function previewCalculation() {
  // Only calculate if we have minimum required fields
  if (!canPreview.value) {
    uni.showToast({
      title: '请先填写品种、生日和体重',
      icon: 'none'
    })
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
  if (!name || !formData.value.breedId || !birthday || !currentWeightKg) {
    uni.showToast({
      title: '请填写必填项',
      icon: 'none'
    })
    return
  }

  // Validate breed is selected
  if (!selectedBreed.value) {
    uni.showToast({
      title: '请选择品种',
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
    birthday: new Date(birthday).toISOString(),
    gender: formData.value.gender,
    isNeutered: formData.value.isNeutered,
    currentWeightKg: parseFloat(currentWeightKg),
    bcsScore: formData.value.bcsScore,
    activityLevel: formData.value.activityLevel,
    lifeStageOverride: formData.value.lifeStageOverride,
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
      // Handle response format: res.data.profile or res.data directly
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
      
      // Store dogId (for backward compatibility)
      uni.setStorageSync('dogId', dogId)
      
      // Add to cache so it appears immediately in the list
      addDogToCache(createdDog)
      
      uni.showToast({
        title: '创建成功',
        icon: 'success',
        duration: 1500
      })

      // Navigate back after toast (DogList will refresh via onShow)
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      // API returned error code
      const errorMsg = res.message || '创建失败'
      console.error('[DogCreate] API error:', res.code, errorMsg)
      uni.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 2000
      })
    }
  }).catch((err: any) => {
    // Network or request error
    const errMsg = err?.message || String(err) || '网络错误'
    console.error('[DogCreate] Create dog error:', err)
    
    // Show user-friendly error (no stack traces)
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

.limitation-notice {
  background-color: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 8rpx;
  padding: 20rpx;
  margin-bottom: 30rpx;
}

.notice-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #fa8c16;
  margin-bottom: 10rpx;
}

.notice-content {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}

.notice-content text {
  display: block;
  margin-bottom: 10rpx;
}

.form-item {
  margin-bottom: 30rpx;
}

.label {
  display: block;
  font-size: 28rpx;
  margin-bottom: 10rpx;
  color: #333;
  font-weight: bold;
}

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
</style>


