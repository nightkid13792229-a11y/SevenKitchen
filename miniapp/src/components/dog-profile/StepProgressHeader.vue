<template>
  <view class="step-progress">
    <view
      v-for="item in stepItems"
      :key="item.key"
      class="step-progress__item"
    >
      <view
        class="step-progress__dot"
        :class="{
          'step-progress__dot--complete': item.status === 'complete',
          'step-progress__dot--active': item.status === 'active',
        }"
      >
        <text class="step-progress__dot-text">{{ item.index }}</text>
      </view>
      <text
        class="step-progress__label"
        :class="{ 'step-progress__label--active': item.status !== 'upcoming' }"
      >
        {{ item.label }}
      </text>
      <view
        v-if="!item.isLast"
        class="step-progress__line"
        :class="{ 'step-progress__line--complete': item.status === 'complete' }"
      ></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  DOG_PROFILE_CREATE_STEPS,
  type DogProfileCreateStep,
} from '../../constants/dog-profile'

const props = defineProps<{
  activeStep: DogProfileCreateStep
}>()

const stepLabelMap: Record<DogProfileCreateStep, string> = {
  basic: '基础信息',
  feeding: '喂食信息',
  recommendation: '喂食建议',
  health: '健康记录',
}

const stepItems = computed(() => {
  const activeIndex = DOG_PROFILE_CREATE_STEPS.indexOf(props.activeStep)

  return DOG_PROFILE_CREATE_STEPS.map((step, index) => ({
    key: step,
    index: index + 1,
    label: stepLabelMap[step],
    isLast: index === DOG_PROFILE_CREATE_STEPS.length - 1,
    status: index < activeIndex
      ? 'complete'
      : index === activeIndex
        ? 'active'
        : 'upcoming',
  }))
})
</script>

<style scoped>
.step-progress {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8rpx;
  margin-bottom: 28rpx;
  padding: 24rpx 20rpx;
  border-radius: 28rpx;
  background: linear-gradient(180deg, #f6fbf8 0%, #ffffff 100%);
  box-shadow: 0 12rpx 30rpx rgba(24, 40, 60, 0.06);
}

.step-progress__item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.step-progress__dot {
  position: relative;
  z-index: 1;
  width: 52rpx;
  height: 52rpx;
  border-radius: 999rpx;
  background: #e7edf1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-progress__dot--complete,
.step-progress__dot--active {
  background: linear-gradient(135deg, #0f6b43 0%, #0c8a55 100%);
  box-shadow: 0 10rpx 22rpx rgba(15, 107, 67, 0.18);
}

.step-progress__dot-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #6f7f89;
}

.step-progress__dot--complete .step-progress__dot-text,
.step-progress__dot--active .step-progress__dot-text {
  color: #fff;
}

.step-progress__label {
  font-size: 22rpx;
  line-height: 1.4;
  text-align: center;
  color: #7f8f98;
}

.step-progress__label--active {
  color: #17313f;
  font-weight: 600;
}

.step-progress__line {
  position: absolute;
  top: 24rpx;
  left: calc(50% + 26rpx);
  right: calc(-50% + 26rpx);
  height: 4rpx;
  border-radius: 999rpx;
  background: #e6ecef;
}

.step-progress__line--complete {
  background: rgba(12, 138, 85, 0.45);
}
</style>
