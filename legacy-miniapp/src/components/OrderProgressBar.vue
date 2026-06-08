<template>
  <view class="order-progress-bar">
    <view
      v-for="(step, index) in steps"
      :key="index"
      class="step-item"
      :class="{
        'active': isStepActive(step),
        'current': isStepCurrent(step)
      }"
    >
      <view class="step-icon">
        <text v-if="isStepActive(step)" class="icon">{{ step.icon }}</text>
        <text v-else class="icon-empty">{{ index + 1 }}</text>
      </view>
      <view class="step-label">{{ step.label }}</view>
      <view
        v-if="index < steps.length - 1"
        class="step-line"
        :class="{ 'active': isNextStepActive(index) }"
      ></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: string
}>()

const steps = [
  {
    key: 'PAID',
    label: '已付款',
    icon: '✓',
    backendStatus: ['PAID']
  },
  {
    key: 'PURCHASING',
    label: '采购中',
    icon: '🛒',
    backendStatus: ['PURCHASING']
  },
  {
    key: 'IN_PRODUCTION',
    label: '生产中',
    icon: '👨‍🍳',
    backendStatus: ['IN_PRODUCTION']
  },
  {
    key: 'FREEZING',
    label: '急冻中',
    icon: '❄️',
    backendStatus: ['FREEZING']
  },
  {
    key: 'SHIPPED',
    label: '已发货',
    icon: '🚚',
    backendStatus: ['SHIPPED']
  },
  {
    key: 'COMPLETED',
    label: '已完成',
    icon: '✅',
    backendStatus: ['COMPLETED']
  }
]

function isStepActive(step: typeof steps[0]): boolean {
  return step.backendStatus.includes(props.status as any) || getCurrentStepIndex(step) > -1
}

function isStepCurrent(step: typeof steps[0]): boolean {
  return step.backendStatus.includes(props.status as any)
}

function isNextStepActive(currentIndex: number): boolean {
  const nextStep = steps[currentIndex + 1]
  return nextStep ? isStepActive(nextStep) : false
}

function getCurrentStepIndex(step: typeof steps[0]): number {
  const currentIndex = steps.findIndex(s => s.backendStatus.includes(props.status as any))
  const stepIndex = steps.indexOf(step)
  return currentIndex >= stepIndex ? stepIndex : -1
}
</script>

<style scoped>
.order-progress-bar {
  display: flex;
  justify-content: space-between;
  padding: 40rpx 20rpx;
  background: #fff;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
}

.step-icon {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  border: 3rpx solid #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  background: #f5f5f5;
  margin-bottom: 12rpx;
  z-index: 1;
}

.step-item.active .step-icon {
  border-color: #1890ff;
  background: #e6f7ff;
}

.step-item.current .step-icon {
  background: #1890ff;
  border-color: #1890ff;
}

.icon {
  font-size: 28rpx;
}

.icon-empty {
  font-size: 24rpx;
  color: #999;
}

.step-label {
  font-size: 22rpx;
  color: #999;
  text-align: center;
  line-height: 1.4;
  white-space: pre-line;
}

.step-item.active .step-label {
  color: #1890ff;
  font-weight: 500;
}

.step-line {
  position: absolute;
  top: 28rpx;
  left: 50%;
  width: calc(100% - 56rpx);
  height: 3rpx;
  background: #e8e8e8;
  z-index: 0;
}

.step-line.active {
  background: #1890ff;
}
</style>
