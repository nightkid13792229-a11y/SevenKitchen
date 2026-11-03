<template>
  <view class="staff-qty" :class="{ 'is-covered': covered }">
    <template v-if="covered">
      <text class="qty-zero">{{ zeroText }}</text>
    </template>
    <template v-else>
      <text v-if="label" class="qty-label">{{ label }}</text>
      <text class="qty-value">{{ value }}</text>
      <text v-if="unit" class="qty-unit">{{ unit }}</text>
    </template>
  </view>
</template>

<script setup lang="ts">
/**
 * 员工端「仍需采购」数量块。
 *
 * 数字与单位分开排版：数字大、单位小；库存已覆盖时只显示灰字。
 */
withDefaults(
  defineProps<{
    value: string | number;
    unit?: string;
    label?: string;
    covered?: boolean;
    zeroText?: string;
  }>(),
  {
    unit: '',
    label: '',
    covered: false,
    zeroText: '库存已覆盖',
  },
);
</script>

<style scoped lang="scss">
.staff-qty {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  flex-shrink: 0;
}

.qty-label {
  font-size: 22rpx;
  color: #6b6653;
}

.qty-value {
  font-size: 34rpx;
  font-weight: 800;
  color: #7a5c28;
  line-height: 1.1;
}

.qty-unit {
  font-size: 22rpx;
  color: #6b6653;
}

.qty-zero {
  font-size: 22rpx;
  color: #8a8a7e;
}
</style>
