<template>
  <view class="staff-metric">
    <text class="staff-metric-label">{{ label }}</text>
    <text class="staff-metric-value" :class="tone ? `is-${tone}` : ''">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 员工端「标签 + 数值」指标块。
 * 用于报销详情的需要采购 / 实际采购 / 折算单价等。
 */
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    tone?: 'up' | 'down' | 'flat' | 'neutral' | '';
  }>(),
  {
    tone: '',
  },
);
</script>

<style scoped lang="scss">
.staff-metric {
  display: flex;
  align-items: center;
  gap: 8rpx;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10rpx 12rpx;
  background: #f6efe0;
  border-radius: 10rpx;
}

.staff-metric-label {
  font-size: 22rpx;
  color: #6b6653;
  white-space: nowrap;
}

.staff-metric-value {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  font-weight: 600;
  color: #26261f;
  line-height: 1.4;
  word-break: normal;
  white-space: nowrap;
  text-align: right;
}

.is-up {
  color: #b4453a;
}

.is-down {
  color: #1e3a2f;
}

.is-flat,
.is-neutral {
  color: #26261f;
}
</style>
