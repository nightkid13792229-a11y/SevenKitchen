<template>
  <view class="task-card" :class="`task-card--${status}`" @tap="emit('tap')">
    <view class="task-card__header">
      <view class="task-card__copy">
        <text class="task-card__title">{{ title }}</text>
        <text class="task-card__summary">{{ summary }}</text>
      </view>
      <text class="task-card__badge">{{ statusLabel }}</text>
    </view>

    <view class="task-card__footer">
      <text class="task-card__action">{{ actionLabel }}</text>
      <text class="task-card__arrow">›</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DogProfileOverviewTaskStatus } from '../../utils/dog-profile-form'

const props = defineProps<{
  title: string
  summary: string
  status: DogProfileOverviewTaskStatus
  actionLabel: string
}>()

const emit = defineEmits<{
  (event: 'tap'): void
}>()

const statusLabel = computed(() => {
  const map: Record<DogProfileOverviewTaskStatus, string> = {
    complete: '已完成',
    stale: '需更新',
    pending: '待完善',
  }

  return map[props.status]
})
</script>

<style scoped>
.task-card {
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx;
  box-shadow: 0 12rpx 32rpx rgba(24, 40, 60, 0.08);
  border: 1rpx solid rgba(19, 104, 65, 0.08);
}

.task-card + .task-card {
  margin-top: 20rpx;
}

.task-card--complete {
  border-color: rgba(7, 193, 96, 0.18);
}

.task-card--stale {
  border-color: rgba(255, 166, 0, 0.22);
}

.task-card--pending {
  border-color: rgba(26, 26, 26, 0.08);
}

.task-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.task-card__copy {
  flex: 1;
  min-width: 0;
}

.task-card__title {
  display: block;
  font-size: 32rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #18313f;
}

.task-card__summary {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6d7b86;
}

.task-card__badge {
  flex-shrink: 0;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  line-height: 1;
  font-weight: 600;
  color: #40616d;
  background: rgba(64, 97, 109, 0.08);
}

.task-card--complete .task-card__badge {
  color: #067345;
  background: rgba(7, 193, 96, 0.12);
}

.task-card--stale .task-card__badge {
  color: #8a5a00;
  background: rgba(255, 166, 0, 0.14);
}

.task-card__footer {
  margin-top: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-card__action {
  font-size: 24rpx;
  font-weight: 600;
  color: #0f6b43;
}

.task-card__arrow {
  font-size: 40rpx;
  line-height: 1;
  color: #c2ccd4;
}
</style>
