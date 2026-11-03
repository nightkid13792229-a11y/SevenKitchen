<template>
  <view class="staff-status-badge" :class="[`tone-${tone}`, `size-${size}`]">
    <text class="badge-label">{{ label }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 员工端状态徽标。
 *
 * 只做“浅底 + 深字”，且必须带文字（不允许只靠颜色表达状态）。
 * 尺寸对应现有页面：
 *   sm → 采购首页清单卡（6/14，22rpx）
 *   md → 报销列表（8/16，22rpx）
 *   lg → 采购/报销详情（12/24，24rpx）
 */
withDefaults(
  defineProps<{
    label: string;
    tone?: 'pending' | 'done' | 'danger' | 'neutral';
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    tone: 'pending',
    size: 'md',
  },
);
</script>

<style scoped lang="scss">
.staff-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 8rpx;
  font-weight: 700;
  line-height: 1.35;
}

.badge-label {
  font-size: inherit;
}

.size-sm {
  padding: 6rpx 14rpx;
  font-size: 22rpx;
}

.size-md {
  padding: 8rpx 16rpx;
  font-size: 22rpx;
}

.size-lg {
  padding: 12rpx 24rpx;
  font-size: 24rpx;
}

.tone-pending {
  background: #f6efe0;
  color: #7a5c28;
}

.tone-done {
  background: #eef2e4;
  color: #1e3a2f;
}

.tone-danger {
  background: #f8e8e2;
  color: #b4453a;
}

.tone-neutral {
  background: #f0f3e9;
  color: #26261f;
}
</style>
