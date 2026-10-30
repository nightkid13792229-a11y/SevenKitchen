<template>
  <view v-if="progress.showProgress" class="progress">
    <view
      v-for="(step, index) in progress.steps"
      :key="step.key"
      class="progress__step"
      :class="{
        'is-done': index < progress.doneCount,
        'is-current':
          index === progress.currentIndex && index >= progress.doneCount,
        'is-waiting': progress.isWaiting && index === 0,
      }"
    >
      <view class="progress__dot">
        <text v-if="index < progress.doneCount" class="progress__check">✓</text>
      </view>
      <text class="progress__label">{{ step.label }}</text>
      <view
        v-if="index < progress.steps.length - 1"
        class="progress__line"
        :class="{ 'is-done': index + 1 <= progress.doneCount }"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 订单四步进度（2026-10-30）。
 *
 * 列表页与详情页共用：同一个订单在两页上必须是同一条线，
 * 否则顾客会怀疑自己看错单。状态到步位的映射全部在
 * utils/order-progress.ts，这里只负责画。
 */
import { computed } from 'vue';
import { resolveOrderProgress, type OrderKind } from '../utils/order-progress';

const props = defineProps<{
  kind: OrderKind;
  status: string;
}>();

const progress = computed(() =>
  resolveOrderProgress({ kind: props.kind, status: props.status }),
);
</script>

<style scoped>
.progress {
  display: flex;
  margin: 22rpx 0 14rpx;
}

.progress__step {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}

.progress__dot {
  width: 22rpx;
  height: 22rpx;
  border-radius: 999rpx;
  border: 3rpx solid #dedfcc;
  background: #fffdf7;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  box-sizing: border-box;
}

.progress__check {
  font-size: 14rpx;
  line-height: 1;
  color: #ffffff;
}

.progress__step.is-done .progress__dot {
  border-color: #1e3a2f;
  background: #1e3a2f;
}

.progress__step.is-current .progress__dot {
  border-color: #b08d4f;
  box-shadow: 0 0 0 6rpx rgba(176, 141, 79, 0.16);
}

/* 待付款：第一步还没发生，用琥珀色提醒"这一步在等你" */
.progress__step.is-waiting .progress__dot {
  border-color: #e0a04a;
  background: #fffdf7;
  box-shadow: 0 0 0 6rpx rgba(224, 160, 74, 0.16);
}

.progress__label {
  font-size: 20rpx;
  color: #b3ae98;
}

.progress__step.is-done .progress__label {
  color: #6b6653;
}

.progress__step.is-current .progress__label {
  color: #1e3a2f;
  font-weight: 700;
}

.progress__step.is-waiting .progress__label {
  color: #a8520f;
  font-weight: 700;
}

.progress__line {
  position: absolute;
  top: 10rpx;
  left: calc(50% + 18rpx);
  right: calc(-50% + 18rpx);
  height: 3rpx;
  border-radius: 3rpx;
  background: #e3e6d4;
}

.progress__line.is-done {
  background: #9db9a8;
}
</style>
