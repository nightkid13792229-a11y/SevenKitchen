<template>
  <view class="ai-recipe-page">
    <view class="hero">
      <text class="hero__eyebrow">AI Agent 设计</text>
      <text class="hero__title">AI食谱设计</text>
      <text class="hero__subtitle">从一只狗狗开始，生成营养管理方案与食谱草稿。</text>
    </view>

    <view v-if="checkingPermission" class="section">
      <text class="section__title">权限校验</text>
      <text class="section__desc">正在校验管理员权限...</text>
    </view>

    <view v-else-if="!isAuthorized" class="section">
      <text class="section__title">仅管理员可用</text>
      <text class="section__desc">该功能暂时只开放给管理员用户。</text>
    </view>

    <template v-else>
      <view class="section">
        <text class="section__title">选择狗狗</text>
        <text v-if="loadingDogs" class="section__desc">正在加载狗狗档案...</text>
        <view v-else-if="dogLoadError" class="state">
          <text class="state__text state__text--error">{{ dogLoadError }}</text>
          <button class="state__button" @tap="loadDogs">重新加载</button>
        </view>
        <view v-else-if="dogs.length === 0" class="state">
          <text class="state__text">暂无狗狗档案，请先完善健康档案。</text>
        </view>
        <picker
          v-else
          mode="selector"
          :range="dogs"
          range-key="name"
          :value="selectedDogIndex"
          @change="onDogChange"
        >
          <view class="picker">
            {{ selectedDog ? selectedDog.name : '请选择狗狗' }}
          </view>
        </picker>
      </view>

      <view class="section">
        <text class="section__title">资料完整度检查</text>
        <text class="section__desc">选择狗狗后，系统会读取健康记录、过敏记录、体重记录和报告附件。</text>
      </view>

      <view class="section">
        <text class="section__title">营养评估</text>
        <text class="section__desc">基于已选狗狗档案生成营养管理方案与食谱设计约束。</text>
        <button
          class="primary-button"
          :disabled="!selectedDog || creatingAssessment"
          @tap="startAssessment"
        >
          {{ creatingAssessment ? '评估生成中...' : '开始营养评估' }}
        </button>
        <text v-if="assessmentError" class="error-text">{{ assessmentError }}</text>
      </view>

      <view v-if="assessment" class="section">
        <text class="section__title">营养评估结果</text>
        <view class="result-grid">
          <view class="result-item">
            <text class="result-label">评估状态</text>
            <text class="result-value">{{ formatStatus(assessment.status) }}</text>
          </view>
          <view class="result-item">
            <text class="result-label">结果状态</text>
            <text class="result-value">{{ formatStatus(assessment.resultStatus) }}</text>
          </view>
        </view>
        <view class="result-block">
          <text class="result-block__title">缺失信息</text>
          <text class="result-block__content">{{ missingInfoText }}</text>
        </view>
        <view class="result-block">
          <text class="result-block__title">营养管理方案</text>
          <text class="result-block__content">{{ formatJsonValue(assessment.managementPlan) }}</text>
        </view>
        <view class="result-block">
          <text class="result-block__title">设计约束</text>
          <text class="result-block__content">{{ formatJsonValue(assessment.constraintSet) }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section__title">结果状态</text>
        <view class="status-list">
          <text>可审核发布</text>
          <text>需人工审核</text>
          <text>受限草稿</text>
          <text>无法完成</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { aiRecipeApi, type CreateAssessmentResult } from '../../api/ai-recipe'
import { dogApi } from '../../api/dogs'

type DogOption = {
  id: string
  name: string
}

const checkingPermission = ref(true)
const isAuthorized = ref(false)
const loadingDogs = ref(false)
const dogLoadError = ref('')
const dogs = ref<DogOption[]>([])
const selectedDogIndex = ref(-1)
const selectedDog = computed(() => selectedDogIndex.value >= 0 ? dogs.value[selectedDogIndex.value] : null)
const creatingAssessment = ref(false)
const assessmentError = ref('')
const assessment = ref<CreateAssessmentResult | null>(null)
const missingInfoText = computed(() => formatMissingInfo(assessment.value?.completeness))

function parseStoredUser(storedUser: unknown) {
  if (typeof storedUser !== 'string') {
    return storedUser
  }

  if (!storedUser || storedUser === '{}') {
    return null
  }

  try {
    return JSON.parse(storedUser)
  } catch {
    return null
  }
}

function getStoredUser() {
  const user = parseStoredUser(uni.getStorageSync('user'))
  if (user) {
    return user
  }

  return parseStoredUser(uni.getStorageSync('userInfo'))
}

function redirectAfterDenied() {
  setTimeout(() => {
    uni.navigateBack({
      delta: 1,
      fail: () => {
        uni.switchTab({ url: '/pages/home/index' })
      },
    })
  }, 1200)
}

async function loadDogs() {
  loadingDogs.value = true
  dogLoadError.value = ''
  assessment.value = null
  assessmentError.value = ''
  try {
    const res = await dogApi.list()
    dogs.value = Array.isArray(res.data) ? res.data : []
    selectedDogIndex.value = dogs.value.length > 0 ? 0 : -1
  } catch (error: any) {
    dogs.value = []
    selectedDogIndex.value = -1
    dogLoadError.value = error?.message || '加载狗狗档案失败'
  } finally {
    loadingDogs.value = false
  }
}

async function initializePage() {
  checkingPermission.value = true
  const user = getStoredUser() as { role?: string } | null
  isAuthorized.value = user?.role === 'ADMIN'
  checkingPermission.value = false

  if (!isAuthorized.value) {
    uni.showToast({ title: '仅管理员可用', icon: 'none' })
    redirectAfterDenied()
    return
  }

  await loadDogs()
}

onMounted(initializePage)

function onDogChange(event: any) {
  selectedDogIndex.value = Number(event.detail.value)
  assessment.value = null
  assessmentError.value = ''
}

async function startAssessment() {
  if (!selectedDog.value) {
    uni.showToast({ title: '请先选择狗狗', icon: 'none' })
    return
  }

  creatingAssessment.value = true
  assessmentError.value = ''
  assessment.value = null

  try {
    const res = await aiRecipeApi.createAssessment({
      dogId: selectedDog.value.id,
      prompt: '请基于当前狗狗档案生成营养管理方案与食谱设计约束。',
      confirmedInputs: {
        selectedDogName: selectedDog.value.name,
      },
    })
    assessment.value = res.data
    uni.showToast({ title: '评估已生成', icon: 'success' })
  } catch (error: any) {
    assessmentError.value = error?.message || '营养评估创建失败'
  } finally {
    creatingAssessment.value = false
  }
}

function formatStatus(status?: string | null) {
  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    REVIEWABLE: '可审核发布',
    NEEDS_MANUAL_REVIEW: '需人工审核',
    NEEDS_REVIEW: '需人工审核',
    LIMITED_DRAFT: '受限草稿',
    BLOCKED: '无法完成',
  }

  return status ? statusMap[status] || status : '--'
}

function formatMissingInfo(completeness?: Record<string, unknown> | null) {
  if (!completeness) {
    return '暂无缺失信息'
  }

  const missingInfo = completeness.missingInfo ?? completeness.missingFields ?? completeness.missing
  if (Array.isArray(missingInfo)) {
    return missingInfo.length > 0 ? missingInfo.map(String).join('、') : '暂无缺失信息'
  }

  if (typeof missingInfo === 'string') {
    return missingInfo || '暂无缺失信息'
  }

  if (missingInfo && typeof missingInfo === 'object') {
    return formatJsonValue(missingInfo)
  }

  return '暂无缺失信息'
}

function formatJsonValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return '暂无'
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
</script>

<style scoped lang="scss">
.ai-recipe-page {
  min-height: 100vh;
  padding: 32rpx;
  background-color: #f6f7f9;
}

.hero,
.section {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.hero__eyebrow,
.hero__subtitle,
.section__desc,
.section__title {
  display: block;
}

.hero__eyebrow {
  font-size: 24rpx;
  color: #667eea;
  margin-bottom: 12rpx;
}

.hero__title {
  display: block;
  font-size: 44rpx;
  font-weight: bold;
  color: #222;
  margin-bottom: 16rpx;
}

.hero__subtitle,
.section__desc {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}

.section__title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
}

.picker {
  padding: 24rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #333;
  background-color: #fafafa;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  font-size: 28rpx;
  color: #333;
}

.primary-button {
  margin: 24rpx 0 0;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 42rpx;
  font-size: 30rpx;
  color: #fff;
  background: linear-gradient(135deg, #667eea 0%, #4b8f8c 100%);

  &[disabled] {
    color: rgba(255, 255, 255, 0.8);
    background: #b8bdc7;
  }
}

.error-text {
  display: block;
  margin-top: 18rpx;
  font-size: 26rpx;
  color: #d93026;
  line-height: 1.5;
}

.result-grid {
  display: flex;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.result-item {
  flex: 1;
  min-width: 0;
  padding: 20rpx;
  border-radius: 12rpx;
  background-color: #f6f7f9;
}

.result-label,
.result-value,
.result-block__title,
.result-block__content {
  display: block;
}

.result-label {
  margin-bottom: 8rpx;
  font-size: 22rpx;
  color: #777;
}

.result-value {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

.result-block {
  padding: 20rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  margin-top: 16rpx;
  background-color: #fff;
}

.result-block__title {
  margin-bottom: 12rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #333;
}

.result-block__content {
  font-size: 24rpx;
  color: #555;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.state {
  padding: 24rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  background-color: #fafafa;
}

.state__text {
  display: block;
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}

.state__text--error {
  color: #d93026;
  margin-bottom: 20rpx;
}

.state__button {
  margin: 0;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 36rpx;
  font-size: 28rpx;
  color: #fff;
  background-color: #667eea;
}
</style>
