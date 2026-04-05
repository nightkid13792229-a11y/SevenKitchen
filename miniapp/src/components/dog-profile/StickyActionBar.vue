<template>
  <view class="sticky-bar">
    <button
      v-if="secondaryText"
      class="sticky-bar__button sticky-bar__button--secondary"
      :disabled="secondaryDisabled"
      @tap="emit('secondary')"
    >
      {{ secondaryText }}
    </button>
    <button
      class="sticky-bar__button sticky-bar__button--primary"
      :class="{ 'sticky-bar__button--full': !secondaryText }"
      :disabled="primaryDisabled"
      @tap="emit('primary')"
    >
      {{ primaryText }}
    </button>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  primaryText: string
  secondaryText?: string
  primaryDisabled?: boolean
  secondaryDisabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'primary'): void
  (event: 'secondary'): void
}>()
</script>

<style scoped>
.sticky-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  gap: 18rpx;
  padding: 18rpx 20rpx calc(18rpx + env(safe-area-inset-bottom));
  background: rgba(247, 250, 251, 0.98);
  box-shadow: 0 -10rpx 28rpx rgba(24, 40, 60, 0.08);
}

.sticky-bar__button {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 22rpx;
  font-size: 30rpx;
  font-weight: 700;
}

.sticky-bar__button::after {
  border: none;
}

.sticky-bar__button--secondary {
  color: #0f6b43;
  background: #fff;
  border: 1rpx solid rgba(7, 193, 96, 0.2);
}

.sticky-bar__button--primary {
  color: #fff;
  background: linear-gradient(135deg, #0f6b43 0%, #0c8a55 100%);
}

.sticky-bar__button--full {
  flex: 1 1 auto;
}
</style>
