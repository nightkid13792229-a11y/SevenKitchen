<template>
  <view
    class="staff-bottom-bar"
    :class="[
      `theme-${theme}`,
      `gap-${gap}`,
      { 'is-spread': spread, 'is-compact': compact },
    ]"
  >
    <slot />
  </view>
</template>

<script setup lang="ts">
/**
 * 员工端固定底栏。
 *
 * 统一处理：贴底、安全区、阴影、左右留白。
 * 页面只负责往里放内容（汇总 + 按钮），不要再各写一套 fixed 定位。
 */
withDefaults(
  defineProps<{
    theme?: 'page' | 'white';
    spread?: boolean;
    compact?: boolean;
    gap?: 'sm' | 'md' | 'lg';
  }>(),
  {
    theme: 'page',
    spread: false,
    compact: false,
    gap: 'md',
  },
);
</script>

<style scoped lang="scss">
.staff-bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  background: #fbfcf7;
  box-shadow: 0 -4rpx 16rpx rgba(30, 46, 36, 0.06);
}

.theme-white {
  background: #ffffff;
  box-shadow: 0 -8rpx 24rpx rgba(30, 46, 36, 0.08);
}

.is-spread {
  justify-content: space-between;
}

.is-compact {
  padding: 20rpx 24rpx calc(28rpx + env(safe-area-inset-bottom));
}

.gap-sm {
  gap: 12rpx;
}

.gap-md {
  gap: 16rpx;
}

.gap-lg {
  gap: 24rpx;
}
</style>
