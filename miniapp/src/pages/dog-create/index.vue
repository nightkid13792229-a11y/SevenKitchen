<template>
  <view class="container">
    <view class="form-section">
      <!-- MVP Limitation Notice -->
      <view class="limitation-notice">
        <view class="notice-title">⚠️ MVP 限制说明</view>
        <view class="notice-content">
          <text>当前后端未提供品种列表API，需要手动输入有效的breedId (UUID格式)。</text>
          <text>请从后端数据库获取有效的breedId后填入。</text>
        </view>
      </view>

      <view class="form-item">
        <text class="label">姓名 *</text>
        <input class="input" placeholder="请输入狗狗姓名" v-model="formData.name" />
      </view>

      <view class="form-item">
        <text class="label">品种ID (UUID) *</text>
        <input 
          class="input" 
          placeholder="请输入有效的breedId (UUID格式)" 
          v-model="formData.breedId" 
        />
        <text class="hint">示例: 550e8400-e29b-41d4-a716-446655440000</text>
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

      <button class="btn" @tap="submit">创建档案</button>
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

const genderIndex = computed(() => genderOptions.indexOf(formData.value.gender))
const activityLevelIndex = computed(() => activityLevelOptions.indexOf(formData.value.activityLevel))
const lifeStageIndex = computed(() => lifeStageOptions.indexOf(formData.value.lifeStageOverride))
const treatInputModeIndex = computed(() => treatInputModeOptions.indexOf(formData.value.treatInputMode))
const treatLevelIndex = computed(() => treatLevelOptions.indexOf(formData.value.treatLevel))

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

onMounted(() => {
  // Check if editing existing dog
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  const dogId = currentPage.options?.dogId
  if (dogId) {
    // Load existing dog - for MVP, just show form
    // In production, would load and populate formData
  }
})

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
}

function validateUUID(uuid: string): boolean {
  return uuidRegex.test(uuid)
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

  // Validate breedId UUID format
  if (!validateUUID(breedId)) {
    uni.showToast({
      title: 'breedId必须是有效的UUID格式',
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
    if (res.code === 0 && res.data && res.data.profile) {
      const createdDog = res.data.profile
      const dogId = createdDog.id
      
      console.info(`[DogCreate] Dog created successfully: id=${dogId}, name=${createdDog.name}`)
      
      // Store dogId (for backward compatibility)
      uni.setStorageSync('dogId', dogId)
      
      // Add to cache so it appears immediately in the list
      addDogToCache(createdDog)
      
      uni.showToast({
        title: '创建成功',
        icon: 'success'
      })

      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    }
  }).catch((err: any) => {
    console.error('Create dog error:', err)
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
}
</style>


