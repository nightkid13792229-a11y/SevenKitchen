<template>
  <view class="page">
    <view class="hero-card">
      <text class="hero-card__eyebrow">基础信息</text>
      <text class="hero-card__title">{{ form.name || '未命名狗狗' }}</text>
      <text class="hero-card__subtitle">更新档案中的基础资料，保存后会同步回概览页。</text>
    </view>

    <view v-if="loadError" class="state-card">
      <text class="state-card__title">加载失败</text>
      <text class="state-card__desc">{{ loadError }}</text>
      <button class="state-card__button" @tap="loadDogProfile">重试</button>
    </view>

    <view v-else class="content">
      <view class="section-card">
        <text class="section-card__title">档案字段</text>

        <view class="field-group">
          <text class="field-label">狗狗名字</text>
          <input
            class="field-input"
            type="text"
            placeholder="请输入名字"
            v-model="form.name"
          />
        </view>

        <view class="field-group">
          <text class="field-label">性别</text>
          <view class="chip-row">
            <view
              class="chip"
              :class="{ 'chip--active': form.gender === 'MALE' }"
              @tap="form.gender = 'MALE'"
            >
              公狗
            </view>
            <view
              class="chip"
              :class="{ 'chip--active': form.gender === 'FEMALE' }"
              @tap="form.gender = 'FEMALE'"
            >
              母狗
            </view>
          </view>
        </view>

        <view class="field-group">
          <text class="field-label">生日</text>
          <picker mode="date" :value="form.birthday" @change="form.birthday = $event.detail.value">
            <view class="field-picker">
              {{ form.birthday || '请选择生日' }}
            </view>
          </picker>
        </view>

        <view class="field-group">
          <text class="field-label">品种</text>
          <view class="readonly-card">
            <text class="readonly-card__value">{{ breedLabel }}</text>
            <text class="readonly-card__hint">本次任务中保持只读，避免引入额外的品种选择风险。</text>
          </view>
        </view>
      </view>
    </view>

    <StickyActionBar
      primary-text="保存基础信息"
      secondary-text="返回概览"
      :primary-disabled="isLoading || isSaving"
      :secondary-disabled="isLoading || isSaving"
      @primary="saveProfile"
      @secondary="goBack"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import { buildDogEditPayload } from '../../utils/dog-profile-form'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'

const dogId = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref('')

const form = reactive<Record<string, any>>({
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
  allergyFoods: '',
  pickyFoods: '',
})

const breedLabel = computed(() => form.breedName || form.customBreedName || '未填写品种')

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  if (!value) {
    loadError.value = '缺少狗狗ID，无法打开基础信息页。'
    return
  }

  dogId.value = value
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'edit',
    dogId: dogId.value,
    moduleName: 'basic_info',
  })
  void loadDogProfile()
})

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
  form.medicalRecords = Array.isArray(profile.medicalRecords) ? profile.medicalRecords : []
  form.checkupRecords = Array.isArray(profile.checkupRecords) ? profile.checkupRecords : []
  form.allergyRecords = Array.isArray(profile.allergyRecords) ? profile.allergyRecords : []
  form.allergyFoods = profile.allergyFoods || ''
  form.pickyFoods = profile.pickyFoods || ''
}

async function saveProfile() {
  if (!dogId.value) {
    return
  }

  if (!form.name.trim()) {
    uni.showToast({ title: '请先填写狗狗名字', icon: 'none' })
    return
  }

  if (!form.birthday) {
    uni.showToast({ title: '请选择生日', icon: 'none' })
    return
  }

  isSaving.value = true

  try {
    void trackDogProfileEvent('dog_profile_submit_requested', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'basic_info',
      submitStatus: 'requested',
    })
    uni.showLoading({ title: '保存中...' })
    const res: any = await dogApi.update(dogId.value, buildDogEditPayload(form, 'basic'))
    if (res.code !== 0) {
      throw new Error(res.message || '保存失败')
    }

    void trackDogProfileEvent('dog_profile_submit_succeeded', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'basic_info',
      submitStatus: 'success',
    })
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => {
      goBack()
    }, 300)
  } catch (error: any) {
    void trackDogProfileEvent('dog_profile_submit_failed', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'basic_info',
      submitStatus: 'failed',
    })
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    isSaving.value = false
    uni.hideLoading()
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
  background: linear-gradient(135deg, #0d6b43 0%, #0a5032 100%);
  box-shadow: 0 18rpx 36rpx rgba(10, 80, 50, 0.22);
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

.field-group + .field-group {
  margin-top: 26rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #415b65;
}

.field-input,
.field-picker,
.readonly-card {
  margin-top: 10rpx;
  width: 100%;
  box-sizing: border-box;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.field-input,
.field-picker {
  font-size: 28rpx;
  color: #17313f;
}

.chip-row {
  margin-top: 12rpx;
  display: flex;
  gap: 16rpx;
}

.chip {
  flex: 1;
  padding: 20rpx 0;
  border-radius: 22rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: 700;
  color: #4f6670;
  background: #f3f7f5;
  border: 1rpx solid transparent;
}

.chip--active {
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
  border-color: rgba(7, 193, 96, 0.24);
}

.readonly-card__value {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #17313f;
}

.readonly-card__hint {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #70838c;
}
</style>
