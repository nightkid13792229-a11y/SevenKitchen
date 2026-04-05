<template>
  <view class="page">
    <view class="hero-card">
      <text class="hero-card__eyebrow">喂食信息</text>
      <text class="hero-card__title">{{ form.name || '喂食档案' }}</text>
      <text class="hero-card__subtitle">这里是已有狗狗更新体重、活动量和喂食建议的主入口。</text>
    </view>

    <view v-if="loadError" class="state-card">
      <text class="state-card__title">加载失败</text>
      <text class="state-card__desc">{{ loadError }}</text>
      <button class="state-card__button" @tap="loadDogProfile">重试</button>
    </view>

    <view v-else class="content">
      <view class="section-card">
        <text class="section-card__title">推荐计算字段</text>

        <view class="field-group">
          <text class="field-label">当前体重（kg）</text>
          <input
            class="field-input"
            type="digit"
            placeholder="请输入体重"
            v-model="form.currentWeightKg"
          />
          <text v-if="form.currentWeightKg && !hasValidCurrentWeightKg" class="field-error">
            请输入 0 到 200 之间的有效体重
          </text>
        </view>

        <view class="field-group">
          <text class="field-label">BCS 体态评分</text>
          <picker mode="selector" :range="bcsOptions" :value="bcsIndex" @change="onBcsChange">
            <view class="field-picker">
              {{ `${form.bcsScore} 分` }}
            </view>
          </picker>
        </view>

        <view class="field-group">
          <text class="field-label">活动水平</text>
          <view class="option-grid">
            <view
              v-for="option in activityLevelOptions"
              :key="option.value"
              class="option-chip"
              :class="{ 'option-chip--active': form.activityLevel === option.value }"
              @tap="form.activityLevel = option.value"
            >
              <text class="option-chip__title">{{ option.label }}</text>
              <text class="option-chip__desc">{{ option.description }}</text>
            </view>
          </view>
        </view>

        <view v-if="isMixedBreed" class="field-group">
          <text class="field-label">混血犬体型</text>
          <picker
            mode="selector"
            :range="sizeClassLabels"
            :value="sizeClassIndex"
            @change="onSizeClassChange"
          >
            <view class="field-picker">
              {{ sizeClassDisplay }}
            </view>
          </picker>
        </view>

        <view class="field-group">
          <text class="field-label">每日餐数</text>
          <picker mode="selector" :range="mealsOptions" :value="mealsIndex" @change="onMealsChange">
            <view class="field-picker">
              {{ `${form.mealsPerDay || '2'} 餐/天` }}
            </view>
          </picker>
        </view>

        <view class="field-group">
          <text class="field-label">零食输入方式</text>
          <view class="chip-row">
            <view
              class="chip"
              :class="{ 'chip--active': currentTreatInputMode === 'ESTIMATE_LEVEL' }"
              @tap="setTreatInputMode('ESTIMATE_LEVEL')"
            >
              估算等级
            </view>
            <view
              class="chip"
              :class="{ 'chip--active': currentTreatInputMode === 'EXACT_KCAL' }"
              @tap="setTreatInputMode('EXACT_KCAL')"
            >
              精确热量
            </view>
          </view>
        </view>

        <view v-if="currentTreatInputMode === 'ESTIMATE_LEVEL'" class="field-group">
          <text class="field-label">零食量等级</text>
          <view class="chip-row chip-row--stacked">
            <view
              v-for="option in treatLevelOptions"
              :key="option.value"
              class="chip chip--wide"
              :class="{ 'chip--active': form.treatLevel === option.value }"
              @tap="form.treatLevel = option.value"
            >
              {{ option.label }}
            </view>
          </view>
        </view>

        <view v-else class="field-group">
          <text class="field-label">零食热量（kcal/天）</text>
          <input
            class="field-input"
            type="digit"
            placeholder="请输入具体热量"
            v-model="form.manualTreatKcal"
          />
          <text v-if="form.manualTreatKcal && !hasValidManualTreatKcal" class="field-error">
            请输入大于等于 0 的数值
          </text>
        </view>
      </view>

      <RecommendationSummaryCard
        :title="'喂食建议'"
        :subtitle="recommendationSubtitle"
        :badges="recommendationBadges"
        :metrics="recommendationMetrics"
        :empty-title="'还没有可用建议'"
        :empty-description="recommendationEmptyDescription"
      />

      <view class="section-actions">
        <button class="secondary-button" :disabled="isPreviewLoading" @tap="refreshRecommendation">
          {{ isPreviewLoading ? '刷新中...' : '刷新建议' }}
        </button>
        <text class="section-actions__hint">{{ previewHint }}</text>
      </view>
    </view>

    <StickyActionBar
      primary-text="保存喂食信息"
      secondary-text="返回概览"
      :primary-disabled="isLoading || isSaving"
      :secondary-disabled="isLoading || isSaving"
      @primary="saveProfile"
      @secondary="goBack"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import RecommendationSummaryCard from '../../components/dog-profile/RecommendationSummaryCard.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import { dogApi } from '../../api/dogs'
import {
  buildDogEditPayload,
  getRecommendationDirtyFields,
  shouldAutoPreviewRecommendation,
} from '../../utils/dog-profile-form'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'

const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'
const mealsOptions = ['1', '2', '3', '4', '5']
const sizeClassOptions = ['SMALL', 'MEDIUM', 'LARGE', 'GIANT']
const sizeClassLabels = ['小型犬', '中型犬', '大型犬', '巨型犬']
const bcsOptions = ['1 分', '2 分', '3 分', '4 分', '5 分', '6 分', '7 分', '8 分', '9 分']
const activityLevelOptions = [
  { value: 'RESTING', label: '休息', description: '几乎不运动，主要时间休息' },
  { value: 'LOW', label: '低活动', description: '偶尔散步，每日运动少于30分钟' },
  { value: 'NORMAL', label: '正常活动', description: '每日散步1-2小时，正常活动量' },
  { value: 'HIGH', label: '高活动', description: '每日运动2-4小时，经常跑步或玩耍' },
  { value: 'WORKING', label: '工作犬', description: '高强度训练或工作犬场景' },
]
const treatLevelOptions = [
  { value: 'NONE', label: '不给零食' },
  { value: 'LOW', label: '较少零食' },
  { value: 'MODERATE', label: '适中零食' },
  { value: 'HIGH', label: '较多零食' },
]

const dogId = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const isPreviewLoading = ref(false)
const loadError = ref('')
const calcResult = ref<Record<string, any> | null>(null)
const isHydrating = ref(false)

let previousRecommendationSnapshot: Record<string, any> = {}
let autoPreviewTimer: ReturnType<typeof setTimeout> | null = null
let previewRequestId = 0

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
  allergyFoods: '',
  pickyFoods: '',
})

const currentTreatInputMode = computed(() => form.treatInputMode || 'ESTIMATE_LEVEL')
const isMixedBreed = computed(() => form.breedId === MIXED_BREED_VIRTUAL_ID)
const parsedCurrentWeightKg = computed(() => {
  const trimmed = typeof form.currentWeightKg === 'string' ? form.currentWeightKg.trim() : ''
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 200 ? parsed : null
})
const hasValidCurrentWeightKg = computed(() => parsedCurrentWeightKg.value !== null)
const parsedManualTreatKcal = computed(() => {
  const trimmed = typeof form.manualTreatKcal === 'string' ? form.manualTreatKcal.trim() : ''
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
})
const hasValidManualTreatKcal = computed(() => (
  currentTreatInputMode.value !== 'EXACT_KCAL' || parsedManualTreatKcal.value !== null
))
const canPreview = computed(() => Boolean(
  form.breedId &&
  form.birthday &&
  form.gender &&
  hasValidCurrentWeightKg.value &&
  hasValidManualTreatKcal.value &&
  (!isMixedBreed.value || form.sizeClassOverride),
))
const recommendationSubtitle = computed(() => `${form.name || '这只狗狗'} · ${form.breedName || form.customBreedName || '喂食建议'}`)
const recommendationBadges = computed(() => {
  const badges: string[] = []
  if (calcResult.value) {
    badges.push('建议已生成')
    if (calcResult.value.isTreatCapped) {
      badges.push('零食已封顶')
    }
  } else {
    badges.push('待刷新')
  }

  if (!hasValidCurrentWeightKg.value) {
    badges.push('体重待校验')
  }

  return badges
})
const recommendationMetrics = computed(() => {
  if (!calcResult.value) {
    return []
  }

  return [
    { label: '每日能量需求', value: formatKcal(calcResult.value.totalDer), hint: 'DER' },
    { label: '零食能量', value: formatKcal(calcResult.value.treatDeduction), hint: calcResult.value.isTreatCapped ? '已按安全上限处理' : '按当前设置估算' },
    { label: '鲜食能量', value: formatKcal(calcResult.value.finalFoodKcal), hint: '可用于正餐' },
    { label: '每日饭量', value: formatGrams(calcResult.value.dailyIntakeG), hint: '下单时可作为参考' },
  ]
})
const recommendationEmptyDescription = computed(() => {
  if (!hasValidCurrentWeightKg.value) {
    return '先填写有效体重，再刷新建议。'
  }

  if (currentTreatInputMode.value === 'EXACT_KCAL' && !hasValidManualTreatKcal.value) {
    return '精确热量模式下，请先填写有效零食热量。'
  }

  if (isMixedBreed.value && !form.sizeClassOverride) {
    return '混血犬请先补充体型，再刷新建议。'
  }

  return '调整喂食字段后，系统会自动尝试刷新建议。'
})
const previewHint = computed(() => {
  if (isPreviewLoading.value) {
    return '正在根据新字段刷新建议'
  }

  if (!canPreview.value) {
    return recommendationEmptyDescription.value
  }

  return '修改体重、活动量、零食设置后会自动刷新，也可以手动点一次。'
})
const mealsIndex = computed(() => Math.max(0, mealsOptions.indexOf(form.mealsPerDay || '2')))
const sizeClassIndex = computed(() => {
  const index = sizeClassOptions.indexOf(form.sizeClassOverride || '')
  return index >= 0 ? index : 0
})
const sizeClassDisplay = computed(() => {
  const index = sizeClassOptions.indexOf(form.sizeClassOverride || '')
  return index >= 0 ? sizeClassLabels[index] : '请选择体型'
})
const bcsIndex = computed(() => {
  const numeric = Number(form.bcsScore)
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 9 ? numeric - 1 : 4
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  if (!value) {
    loadError.value = '缺少狗狗ID，无法打开喂食信息页。'
    return
  }

  dogId.value = value
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'edit',
    dogId: dogId.value,
    moduleName: 'feeding_info',
  })
  void loadDogProfile()
})

onUnload(() => {
  if (autoPreviewTimer) {
    clearTimeout(autoPreviewTimer)
    autoPreviewTimer = null
  }

  previewRequestId += 1
})

watch(
  () => JSON.stringify(getRecommendationSnapshot()),
  () => {
    if (isHydrating.value) {
      return
    }

    const nextSnapshot = getRecommendationSnapshot()
    const dirtyFields = getRecommendationDirtyFields(previousRecommendationSnapshot, nextSnapshot)
    previousRecommendationSnapshot = JSON.parse(JSON.stringify(nextSnapshot))

    if (!shouldAutoPreviewRecommendation(dirtyFields)) {
      return
    }

    queuePreview(true)
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
    calcResult.value = res.data.calcResult || null
  } catch (error: any) {
    loadError.value = error?.message || '加载狗狗档案失败，请稍后重试。'
  } finally {
    isLoading.value = false
    uni.hideLoading()
  }
}

function populateForm(profile: Record<string, any>) {
  isHydrating.value = true
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
  form.medicalRecords = Array.isArray(profile.medicalRecords) ? profile.medicalRecords : []
  form.checkupRecords = Array.isArray(profile.checkupRecords) ? profile.checkupRecords : []
  form.allergyRecords = Array.isArray(profile.allergyRecords) ? profile.allergyRecords : []
  form.allergyFoods = profile.allergyFoods || ''
  form.pickyFoods = profile.pickyFoods || ''
  previousRecommendationSnapshot = getRecommendationSnapshot()
  isHydrating.value = false
}

function getRecommendationSnapshot() {
  return {
    breedId: form.breedId,
    birthday: form.birthday,
    currentWeightKg: form.currentWeightKg,
    bcsScore: form.bcsScore,
    activityLevel: form.activityLevel,
    isNeutered: form.isNeutered,
    lifeStageOverride: form.lifeStageOverride,
    sizeClassOverride: form.sizeClassOverride,
    mealsPerDay: form.mealsPerDay,
    treatInputMode: currentTreatInputMode.value,
    treatLevel: form.treatLevel,
    manualTreatKcal: form.manualTreatKcal,
  }
}

function onBcsChange(event: any) {
  form.bcsScore = Number(event.detail.value) + 1
}

function onMealsChange(event: any) {
  form.mealsPerDay = mealsOptions[event.detail.value] || '2'
}

function onSizeClassChange(event: any) {
  form.sizeClassOverride = sizeClassOptions[event.detail.value] || null
}

function setTreatInputMode(mode: string) {
  form.treatInputMode = mode
}

function queuePreview(silent: boolean) {
  if (autoPreviewTimer) {
    clearTimeout(autoPreviewTimer)
  }

  autoPreviewTimer = setTimeout(() => {
    void previewRecommendation({ silent })
  }, 350)
}

async function refreshRecommendation() {
  await previewRecommendation({ silent: false })
}

async function previewRecommendation(options: { silent: boolean }) {
  if (!canPreview.value) {
    if (!options.silent) {
      if (!hasValidCurrentWeightKg.value) {
        uni.showToast({ title: '请先填写有效体重', icon: 'none' })
        return false
      }

      if (currentTreatInputMode.value === 'EXACT_KCAL' && !hasValidManualTreatKcal.value) {
        uni.showToast({ title: '请先填写有效零食热量', icon: 'none' })
        return false
      }

      if (isMixedBreed.value && !form.sizeClassOverride) {
        uni.showToast({ title: '请先选择混血犬体型', icon: 'none' })
      }
    }

    return false
  }

  const requestId = ++previewRequestId
  isPreviewLoading.value = true

  try {
    void trackDogProfileEvent('dog_profile_calc_requested', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'feeding_info',
      calcStatus: 'requested',
    })
    const res: any = await dogApi.preview({
      breedId: form.breedId,
      birthday: new Date(form.birthday).toISOString(),
      gender: form.gender,
      isNeutered: form.isNeutered,
      currentWeightKg: parsedCurrentWeightKg.value,
      bcsScore: Number(form.bcsScore) || 5,
      activityLevel: form.activityLevel,
      lifeStageOverride: form.lifeStageOverride,
      sizeClassOverride: form.sizeClassOverride,
      mealsPerDay: parseInt(form.mealsPerDay, 10) || 2,
      treatInputMode: currentTreatInputMode.value,
      treatLevel: form.treatLevel,
      manualTreatKcal: currentTreatInputMode.value === 'EXACT_KCAL' ? parsedManualTreatKcal.value : undefined,
    })

    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '刷新建议失败')
    }

    if (requestId !== previewRequestId) {
      return false
    }

    void trackDogProfileEvent('dog_profile_calc_succeeded', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'feeding_info',
      calcStatus: 'success',
    })
    calcResult.value = res.data
    return true
  } catch (error: any) {
    if (requestId === previewRequestId) {
      void trackDogProfileEvent('dog_profile_calc_failed', {
        mode: 'edit',
        dogId: dogId.value,
        moduleName: 'feeding_info',
        calcStatus: 'failed',
      })
    }

    if (requestId === previewRequestId && !options.silent) {
      uni.showToast({ title: error?.message || '刷新建议失败', icon: 'none' })
    }
    return false
  } finally {
    if (requestId === previewRequestId) {
      isPreviewLoading.value = false
    }
  }
}

async function saveProfile() {
  if (!dogId.value) {
    return
  }

  if (!hasValidCurrentWeightKg.value) {
    uni.showToast({ title: '请先填写有效体重', icon: 'none' })
    return
  }

  if (currentTreatInputMode.value === 'EXACT_KCAL' && !hasValidManualTreatKcal.value) {
    uni.showToast({ title: '请先填写有效零食热量', icon: 'none' })
    return
  }

  isSaving.value = true

  try {
    void trackDogProfileEvent('dog_profile_submit_requested', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'feeding_info',
      submitStatus: 'requested',
    })
    uni.showLoading({ title: '保存中...' })
    const res: any = await dogApi.update(dogId.value, buildDogEditPayload(form, 'feeding'))
    if (res.code !== 0) {
      throw new Error(res.message || '保存失败')
    }

    void trackDogProfileEvent('dog_profile_submit_succeeded', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'feeding_info',
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
      moduleName: 'feeding_info',
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

function formatKcal(value: number | undefined) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '--'
  }

  return `${Math.round(value)} kcal/天`
}

function formatGrams(value: number | undefined) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '--'
  }

  return `${Math.round(value)} g/天`
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
  background: linear-gradient(135deg, #12513a 0%, #0c6b46 100%);
  box-shadow: 0 18rpx 36rpx rgba(12, 88, 57, 0.2);
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

.state-card__button,
.secondary-button {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.state-card__button {
  color: #fff;
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
.field-picker {
  margin-top: 10rpx;
  width: 100%;
  box-sizing: border-box;
  padding: 22rpx 24rpx;
  border-radius: 22rpx;
  font-size: 28rpx;
  color: #17313f;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.field-error {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #b64d4d;
}

.option-grid {
  margin-top: 12rpx;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.option-chip {
  padding: 22rpx;
  border-radius: 22rpx;
  background: #f3f7f5;
  border: 1rpx solid transparent;
}

.option-chip--active {
  background: rgba(7, 193, 96, 0.12);
  border-color: rgba(7, 193, 96, 0.24);
}

.option-chip__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #17313f;
}

.option-chip__desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #6d8089;
}

.chip-row {
  margin-top: 12rpx;
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
}

.chip-row--stacked .chip {
  flex: 1 1 calc(50% - 8rpx);
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

.chip--wide {
  padding-left: 16rpx;
  padding-right: 16rpx;
}

.chip--active {
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
  border-color: rgba(7, 193, 96, 0.24);
}

.section-actions {
  margin-top: 20rpx;
  padding: 0 6rpx;
}

.secondary-button {
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.secondary-button::after,
.state-card__button::after {
  border: none;
}

.section-actions__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #6a7d86;
}
</style>
