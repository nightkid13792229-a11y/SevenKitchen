<template>
  <view class="staff-empty" :class="{ 'is-card': card }">
    <text v-if="icon" class="empty-icon">{{ icon }}</text>
    <text class="empty-title">{{ title }}</text>
    <text v-if="hint" class="empty-hint">{{ hint }}</text>
    <button v-if="actionText" class="empty-action" @tap="onAction">
      {{ actionText }}
    </button>
  </view>
</template>

<script setup lang="ts">
/**
 * 员工端空态。
 *
 * 统一“图标 + 一句话 + 可选的下一步”，避免各页有的用 emoji、
 * 有的用插画、有的只有一行字。
 */
withDefaults(
  defineProps<{
    icon?: string;
    title: string;
    hint?: string;
    actionText?: string;
    card?: boolean;
  }>(),
  {
    icon: '',
    hint: '',
    actionText: '',
    card: false,
  },
);

const emit = defineEmits<{ (event: 'action'): void }>();

const onAction = () => {
  emit('action');
};
</script>

<style scoped lang="scss">
.staff-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 32rpx;
}

.staff-empty.is-card {
  background: #fbfcf7;
  border-radius: 24rpx;
}

.empty-icon {
  font-size: 120rpx;
  line-height: 1;
  margin-bottom: 24rpx;
}

.empty-title {
  font-size: 28rpx;
  color: #26261f;
}

.empty-hint {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
  text-align: center;
}

.empty-action {
  margin-top: 24rpx;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 40rpx;
  border-radius: 36rpx;
  border: none;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 26rpx;
}
</style>
