<template>
  <view class="page">
    <view class="hero-shell">
      <view class="hero-card">
        <view class="hero-card__top">
          <text class="hero-card__eyebrow">爱犬概览</text>
          <text class="hero-card__sync">{{ syncLabel }}</text>
        </view>

        <view v-if="profile" class="hero-card__body">
          <view class="hero-card__avatar">
            {{ avatarText }}
          </view>
          <view class="hero-card__copy">
            <text class="hero-card__name">{{ profile.name || '未命名' }}</text>
            <text class="hero-card__breed">{{ breedLabel }}</text>
            <view class="hero-card__chips">
              <text class="hero-card__chip">{{ ageLabel }}</text>
              <text class="hero-card__chip">{{ weightLabel }}</text>
              <text class="hero-card__chip">{{ mealsLabel }}</text>
            </view>
          </view>
        </view>

        <view v-if="profile" class="hero-card__metrics">
          <view class="hero-card__metric">
            <text class="hero-card__metric-label">活动水平</text>
            <text class="hero-card__metric-value">{{ profile.activityLevel || '-' }}</text>
          </view>
          <view class="hero-card__metric">
            <text class="hero-card__metric-label">健康记录</text>
            <text class="hero-card__metric-value">{{ healthCount }} 项</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="loadError" class="state-card">
      <text class="state-card__title">加载失败</text>
      <text class="state-card__desc">{{ loadError }}</text>
      <button class="state-card__button" @tap="loadDogProfile">重试</button>
    </view>

    <view v-else-if="isLoading && !profile" class="state-card">
      <text class="state-card__title">正在加载档案</text>
      <text class="state-card__desc">正在获取狗狗档案和计算结果，请稍候。</text>
    </view>

    <view v-else-if="profile" class="content">
      <RecommendationSummaryCard
        :title="'喂食建议'"
        :subtitle="recommendationSubtitle"
        :badges="recommendationBadges"
        :metrics="recommendationMetrics"
        :empty-title="'还没有可用的喂食建议'"
        :empty-description="'先完善喂食信息，再返回这里查看推荐结果。'"
      />

      <view class="section-header">
        <text class="section-header__title">任务状态</text>
        <text class="section-header__hint">先从需要更新的卡片进入编辑流程</text>
      </view>

      <view class="task-list">
        <TaskStatusCard
          v-for="card in taskCards"
          :key="card.key"
          :title="card.title"
          :summary="card.summary"
          :status="card.status"
          :action-label="card.actionLabel"
          @tap="handleTaskTap(card.key)"
        />
      </view>
    </view>

    <StickyActionBar
      primary-text="编辑档案"
      secondary-text="去订购"
      :primary-disabled="!profile"
      :secondary-disabled="!profile"
      @primary="goToEdit"
      @secondary="goToOrder"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import RecommendationSummaryCard from '../../components/dog-profile/RecommendationSummaryCard.vue'
import StickyActionBar from '../../components/dog-profile/StickyActionBar.vue'
import TaskStatusCard from '../../components/dog-profile/TaskStatusCard.vue'
import { dogApi } from '../../api/dogs'
import {
  buildOverviewTaskCards,
  type DogProfileOverviewTaskCard,
} from '../../utils/dog-profile-form'

interface DogProfileDetail {
  id: string
  name?: string
  breedName?: string
  customBreedName?: string
  birthday?: string
  gender?: string
  currentWeightKg?: number
  mealsPerDay?: number
  activityLevel?: string
  bcsScore?: number
  treatInputMode?: string
  treatLevel?: string
  manualTreatKcal?: number
  medicalRecords?: any[]
  checkupRecords?: any[]
  allergyRecords?: any[]
  dirtyFields?: string[]
  [key: string]: any
}

interface DogCalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  dailyIntakeG?: number
}

const dogId = ref('')
const profile = ref<DogProfileDetail | null>(null)
const calcResult = ref<DogCalcResult | null>(null)
const isLoading = ref(false)
const loadError = ref('')
const hasLoadedOnce = ref(false)

const healthCount = computed(() => {
  if (!profile.value) {
    return 0
  }

  return ['medicalRecords', 'checkupRecords', 'allergyRecords'].reduce((total, key) => {
    const records = profile.value?.[key]
    return total + (Array.isArray(records) ? records.length : 0)
  }, 0)
})

const taskCards = computed(() =>
  profile.value
    ? buildOverviewTaskCards({
      profile: profile.value,
      dirtyFields: profile.value.dirtyFields || [],
      healthCount: healthCount.value,
    })
    : [],
)

const breedLabel = computed(() => {
  if (!profile.value) {
    return '-'
  }

  return profile.value.breedName || profile.value.customBreedName || '未知品种'
})

const ageLabel = computed(() => profile.value?.birthday ? calculateAgeText(profile.value.birthday) : '年龄未知')
const weightLabel = computed(() => {
  if (!profile.value?.currentWeightKg && profile.value?.currentWeightKg !== 0) {
    return '体重未知'
  }

  return `${formatWeight(profile.value.currentWeightKg)}kg`
})

const mealsLabel = computed(() => profile.value?.mealsPerDay ? `${profile.value.mealsPerDay}餐/天` : '餐数未知')
const avatarText = computed(() => profile.value?.name ? profile.value.name.slice(0, 1) : '汪')
const syncLabel = computed(() => (calcResult.value ? '推荐已同步' : '资料已同步'))
const recommendationSubtitle = computed(() => {
  if (!profile.value) {
    return '根据当前档案生成的推荐结果'
  }

  return `${profile.value.name || '这只狗狗'} · ${breedLabel.value}`
})

const recommendationBadges = computed(() => {
  const badges: string[] = []
  if (calcResult.value) {
    badges.push('推荐已生成')
    if (calcResult.value.isTreatCapped) {
      badges.push('零食已封顶')
    }
  } else {
    badges.push('待生成')
  }

  return badges
})

const recommendationMetrics = computed(() => {
  if (!calcResult.value) {
    return []
  }

  const metrics = [
    { label: '每日能量需求', value: formatKcal(calcResult.value.totalDer), hint: 'DER' },
    { label: '零食能量', value: formatKcal(calcResult.value.treatDeduction), hint: calcResult.value.isTreatCapped ? '已触发10%上限' : '可正常使用' },
    { label: '鲜食能量', value: formatKcal(calcResult.value.finalFoodKcal), hint: '最终可用于喂食' },
    { label: '每日饭量', value: formatGrams(calcResult.value.dailyIntakeG), hint: '用于下单参考' },
  ]

  return metrics
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  if (value) {
    dogId.value = value
    void loadDogProfile()
    return
  }

  loadError.value = '缺少狗狗ID，无法打开档案概览。'
})

onShow(() => {
  if (hasLoadedOnce.value && dogId.value) {
    void loadDogProfile()
  }
})

async function loadDogProfile() {
  if (!dogId.value) {
    loadError.value = '缺少狗狗ID，无法打开档案概览。'
    return
  }

  isLoading.value = true
  loadError.value = ''

  try {
    uni.showLoading({ title: '加载中...' })
    const res: any = await dogApi.detail(dogId.value)

    if (res.code === 0 && res.data && res.data.profile) {
      profile.value = res.data.profile
      calcResult.value = res.data.calcResult || null
      hasLoadedOnce.value = true
      return
    }

    throw new Error(res.message || '加载狗狗档案失败')
  } catch (err: any) {
    loadError.value = err?.message || '加载狗狗档案失败，请稍后重试。'
  } finally {
    isLoading.value = false
    uni.hideLoading()
    uni.stopPullDownRefresh?.()
  }
}

function handleTaskTap(_key: DogProfileOverviewTaskCard['key']) {
  goToEdit()
}

function goToEdit() {
  if (!dogId.value) {
    return
  }

  uni.navigateTo({
    url: `/pages/dog-create/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

function goToOrder() {
  if (!dogId.value) {
    return
  }

  uni.navigateTo({
    url: `/pages/recipe-order/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

function calculateAgeText(birthday: string) {
  const birth = new Date(birthday)
  if (Number.isNaN(birth.getTime())) {
    return '年龄未知'
  }

  const now = new Date()
  const months = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30)))
  if (months < 12) {
    return `${months}个月`
  }

  const years = Math.floor(months / 12)
  return `${years}岁`
}

function formatWeight(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
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
  padding-bottom: calc(132rpx + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top right, rgba(7, 193, 96, 0.18), transparent 28%),
    linear-gradient(180deg, #f4faf7 0%, #eef5f1 100%);
}

.hero-shell {
  padding: 24rpx 24rpx 0;
}

.hero-card {
  padding: 28rpx;
  border-radius: 36rpx;
  color: #fff;
  background: linear-gradient(135deg, #0d6b43 0%, #0a5032 100%);
  box-shadow: 0 18rpx 36rpx rgba(10, 80, 50, 0.24);
}

.hero-card__top {
  display: flex;
  justify-content: space-between;
  gap: 18rpx;
}

.hero-card__eyebrow {
  font-size: 22rpx;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.72);
  text-transform: uppercase;
}

.hero-card__sync {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.84);
}

.hero-card__body {
  margin-top: 28rpx;
  display: flex;
  gap: 22rpx;
  align-items: center;
}

.hero-card__avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42rpx;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.18);
  border: 1rpx solid rgba(255, 255, 255, 0.16);
}

.hero-card__copy {
  flex: 1;
  min-width: 0;
}

.hero-card__name {
  display: block;
  font-size: 42rpx;
  line-height: 1.15;
  font-weight: 800;
}

.hero-card__breed {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.84);
}

.hero-card__chips {
  margin-top: 18rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.hero-card__chip {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: #e9fff3;
  background: rgba(255, 255, 255, 0.14);
}

.hero-card__metrics {
  margin-top: 24rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.hero-card__metric {
  width: calc(50% - 8rpx);
  padding: 18rpx 20rpx;
  border-radius: 24rpx;
  background: rgba(255, 255, 255, 0.11);
}

.hero-card__metric-label {
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.78);
}

.hero-card__metric-value {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.content {
  padding: 24rpx 24rpx 0;
}

.state-card {
  margin: 24rpx;
  padding: 36rpx 28rpx;
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 32rpx rgba(24, 40, 60, 0.08);
  text-align: center;
}

.state-card__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #18313f;
}

.state-card__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6d7b86;
}

.state-card__button {
  margin-top: 24rpx;
  width: 220rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  color: #fff;
  font-size: 28rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #0d6b43 0%, #0a8a55 100%);
}

.section-header {
  margin: 30rpx 4rpx 18rpx;
}

.section-header__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #18313f;
}

.section-header__hint {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #70828c;
}

.task-list {
  display: flex;
  flex-direction: column;
}
</style>
