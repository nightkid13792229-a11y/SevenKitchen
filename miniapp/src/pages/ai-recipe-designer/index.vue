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
  try {
    const res = await dogApi.list()
    dogs.value = Array.isArray(res.data) ? res.data : []
  } catch (error: any) {
    dogs.value = []
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
