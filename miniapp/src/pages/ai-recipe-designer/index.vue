<template>
  <view class="ai-recipe-page">
    <view class="hero">
      <text class="hero__eyebrow">AI Agent 设计</text>
      <text class="hero__title">AI食谱设计</text>
      <text class="hero__subtitle">从一只狗狗开始，生成营养管理方案与食谱草稿。</text>
    </view>

    <view class="section">
      <text class="section__title">选择狗狗</text>
      <picker mode="selector" :range="dogs" range-key="name" :value="selectedDogIndex" @change="onDogChange">
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
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dogApi } from '../../api/dogs'

const dogs = ref<any[]>([])
const selectedDogIndex = ref(-1)
const selectedDog = computed(() => selectedDogIndex.value >= 0 ? dogs.value[selectedDogIndex.value] : null)

onMounted(async () => {
  const res: any = await dogApi.list()
  dogs.value = Array.isArray(res.data) ? res.data : []
})

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
</style>
