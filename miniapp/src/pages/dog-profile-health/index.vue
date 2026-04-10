<template>
  <view class="page">
    <view class="hero-card">
      <text class="hero-card__eyebrow">健康记录</text>
      <text class="hero-card__title">{{ form.name || '健康档案' }}</text>
      <text class="hero-card__subtitle">集中维护病史、体检和过敏记录，并补充挑食提醒。</text>
    </view>

    <view v-if="loadError" class="state-card">
      <text class="state-card__title">加载失败</text>
      <text class="state-card__desc">{{ loadError }}</text>
      <button class="state-card__button" @tap="loadDogProfile">重试</button>
    </view>

    <view v-else class="content">
      <HealthRecordsSection
        v-model="form.medicalRecords"
        :dog-id="dogId"
        :preferred-expanded-record-identity="healthRecordFocusIdentity.medical"
        record-type="medical"
        title="病史记录"
        description="记录症状、发病日期和诊断结果。"
        empty-title="还没有病史记录"
        primary-field-key="chiefComplaint"
        primary-label="症状或疾病"
        date-field-key="visitDate"
        date-label="发病日期"
        secondary-field-key="diagnosis"
        secondary-label="诊断结果"
        notes-label="补充说明"
        @record-saved="rememberHealthRecordFocus('medical', $event)"
      />

      <HealthRecordsSection
        v-model="form.checkupRecords"
        :dog-id="dogId"
        :preferred-expanded-record-identity="healthRecordFocusIdentity.checkup"
        record-type="checkup"
        title="体检记录"
        description="更新最近的体检时间和发现。"
        empty-title="还没有体检记录"
        primary-field-key="checkupType"
        primary-label="体检类型"
        date-field-key="checkupDate"
        date-label="体检日期"
        notes-label="体检说明"
        @record-saved="rememberHealthRecordFocus('checkup', $event)"
      />

      <HealthRecordsSection
        v-model="form.allergyRecords"
        :dog-id="dogId"
        :preferred-expanded-record-identity="healthRecordFocusIdentity.allergy"
        record-type="allergy"
        title="过敏记录"
        description="记录明确的过敏原和相关备注。"
        empty-title="还没有过敏记录"
        primary-field-key="allergen"
        primary-label="过敏原"
        notes-label="备注"
        @record-saved="rememberHealthRecordFocus('allergy', $event)"
      />

      <view class="section-card">
        <text class="section-card__title">饮食提醒</text>

        <view class="field-group">
          <text class="field-label">挑食 / 不爱吃的食物</text>
          <text v-if="dietReminderStatusText" class="field-help">{{ dietReminderStatusText }}</text>
          <textarea
            class="field-textarea"
            placeholder="记录口味偏好，方便后续推荐"
            v-model="form.pickyFoods"
          />
        </view>
      </view>
    </view>

    <StickyActionBar
      primary-text="保存饮食提醒"
      secondary-text="返回概览"
      :primary-disabled="isLoading || isSaving"
      :secondary-disabled="isLoading || isSaving"
      @primary="saveDietReminders"
      @secondary="goBack"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import HealthRecordsSection from '../../components/dog-profile/HealthRecordsSection.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'
import {
  buildDogHealthStateSnapshot,
  mergeDogHealthStateSnapshot,
  readDogHealthStateSnapshotCache,
  writeDogHealthStateSnapshotCache,
} from '../../utils/health-records'

const dogId = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')
const loadedFields = reactive({
  pickyFoods: true,
})
const healthRecordFocusIdentity = reactive({
  medical: '',
  checkup: '',
  allergy: '',
})
const savedPickyFoods = ref('')

const form = reactive<Record<string, any>>({
  id: '',
  name: '',
  breedId: '',
  breedName: '',
  customBreedName: '',
  birthday: '',
  gender: 'MALE',
  isNeutered: false,
  currentWeightKg: '',
  bcsScore: 5,
  activityLevel: 'NORMAL',
  lifeStageOverride: 'NONE',
  sizeClassOverride: null,
  mealsPerDay: '2',
  treatInputMode: 'ESTIMATE_LEVEL',
  treatLevel: 'LOW',
  manualTreatKcal: '',
  medicalRecords: [],
  checkupRecords: [],
  allergyRecords: [],
  pickyFoods: '',
})

const dietReminderStatusText = computed(() => {
  const current = String(form.pickyFoods || '').trim()
  const saved = String(savedPickyFoods.value || '').trim()

  if (current !== saved) {
    return '已修改，待保存'
  }

  if (saved) {
    return '已保存'
  }

  return ''
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  if (!value) {
    loadError.value = '缺少狗狗ID，无法打开健康信息页。'
    return
  }

  dogId.value = value
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'edit',
    dogId: dogId.value,
    moduleName: 'health',
  })
  void loadDogProfile()
})

watch(
  () => [
    JSON.stringify(form.medicalRecords),
    JSON.stringify(form.checkupRecords),
    JSON.stringify(form.allergyRecords),
  ],
  () => {
    if (!dogId.value) {
      return
    }

    writeDogHealthStateSnapshotCache(
      dogId.value,
      buildDogHealthStateSnapshot({
        medicalRecords: form.medicalRecords,
        checkupRecords: form.checkupRecords,
        allergyRecords: form.allergyRecords,
        pickyFoods: form.pickyFoods,
      }),
    )
  },
)

async function loadDogProfile() {
  if (!dogId.value) {
    return
  }

  isLoading.value = true
  loadError.value = ''

  try {
    uni.showLoading({ title: '加载中...' })
    const res: any = await dogApi.detail(dogId.value)
    if (res.code !== 0 || !res.data?.profile) {
      throw new Error(res.message || '加载狗狗档案失败')
    }

    populateForm(res.data.profile)
  } catch (error: any) {
    loadError.value = error?.message || '加载狗狗档案失败，请稍后重试。'
  } finally {
    isLoading.value = false
    uni.hideLoading()
  }
}

function populateForm(profile: Record<string, any>) {
  loadedFields.pickyFoods = Object.prototype.hasOwnProperty.call(profile, 'pickyFoods')
  const cachedHealthState = readDogHealthStateSnapshotCache(dogId.value || profile.id || '')
  const mergedHealthState = mergeDogHealthStateSnapshot(
    cachedHealthState || buildDogHealthStateSnapshot(form),
    profile,
  )
  form.id = profile.id || ''
  form.name = profile.name || ''
  form.breedId = profile.breedId || ''
  form.breedName = profile.breedName || ''
  form.customBreedName = profile.customBreedName || ''
  form.birthday = profile.birthday ? new Date(profile.birthday).toISOString().split('T')[0] : ''
  form.gender = profile.gender || 'MALE'
  form.isNeutered = profile.isNeutered ?? false
  form.currentWeightKg = profile.currentWeightKg?.toString() || ''
  form.bcsScore = profile.bcsScore ?? 5
  form.activityLevel = profile.activityLevel || 'NORMAL'
  form.lifeStageOverride = profile.lifeStageOverride || 'NONE'
  form.sizeClassOverride = profile.sizeClassOverride || null
  form.mealsPerDay = (profile.mealsPerDay || 2).toString()
  form.treatInputMode = profile.treatInputMode || 'ESTIMATE_LEVEL'
  form.treatLevel = profile.treatLevel || 'LOW'
  form.manualTreatKcal = profile.manualTreatKcal?.toString() || ''
  form.medicalRecords = mergedHealthState.medicalRecords
  form.checkupRecords = mergedHealthState.checkupRecords
  form.allergyRecords = mergedHealthState.allergyRecords
  form.pickyFoods = mergedHealthState.pickyFoods
  savedPickyFoods.value = mergedHealthState.pickyFoods

  writeDogHealthStateSnapshotCache(
    dogId.value || profile.id || '',
    mergedHealthState,
  )
}

function rememberHealthRecordFocus(type: 'medical' | 'checkup' | 'allergy', identity: string) {
  healthRecordFocusIdentity[type] = identity
}

async function saveDietReminders() {
  if (!dogId.value) {
    return
  }

  isSaving.value = true

  try {
    void trackDogProfileEvent('dog_profile_submit_requested', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'health',
      submitStatus: 'requested',
    })
    uni.showLoading({ title: '保存中...' })
    const res: any = await dogApi.updateDietReminders(dogId.value, {
      pickyFoods: form.pickyFoods,
    })
    if (res.code !== 0) {
      throw new Error(res.message || '保存失败')
    }

    if (res.data?.profile) {
      populateForm(res.data.profile)
    }

    void trackDogProfileEvent('dog_profile_submit_succeeded', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'health',
      submitStatus: 'success',
    })
    uni.hideLoading()
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => {
      goBack()
    }, 300)
  } catch (error: any) {
    void trackDogProfileEvent('dog_profile_submit_failed', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'health',
      submitStatus: 'failed',
    })
    uni.hideLoading()
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    isSaving.value = false
  }
}

function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }

  uni.redirectTo({
    url: `/pages/dog-profile-overview/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(132rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top right, rgba(7, 193, 96, 0.16), transparent 24%),
    linear-gradient(180deg, #f4faf7 0%, #eef5f1 100%);
}

.hero-card {
  padding: 32rpx;
  border-radius: 34rpx;
  color: #fff;
  background: linear-gradient(135deg, #395b3a 0%, #1b7b4e 100%);
  box-shadow: 0 18rpx 36rpx rgba(27, 92, 64, 0.18);
}

.hero-card__eyebrow {
  display: block;
  font-size: 22rpx;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.76);
  text-transform: uppercase;
}

.hero-card__title {
  display: block;
  margin-top: 16rpx;
  font-size: 42rpx;
  font-weight: 800;
}

.hero-card__subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.82);
}

.content,
.state-card {
  margin-top: 24rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.section-card,
.state-card {
  padding: 30rpx;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 32rpx rgba(24, 40, 60, 0.08);
}

.section-card__title,
.state-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #17313f;
}

.state-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b7d86;
}

.state-card__button {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #0d6b43 0%, #0c8a55 100%);
}

.state-card__button::after {
  border: none;
}

.field-group + .field-group {
  margin-top: 24rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #415b65;
}

.field-help {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6c7d86;
}

.field-textarea {
  margin-top: 10rpx;
  width: 100%;
  min-height: 180rpx;
  box-sizing: border-box;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  font-size: 28rpx;
  color: #17313f;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}
</style>
