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
      v-if="tertiaryText"
      class="sticky-bar__button sticky-bar__button--tertiary"
      :disabled="tertiaryDisabled"
      @tap="emit('tertiary')"
    >
      {{ tertiaryText }}
    </button>
    <button
      class="sticky-bar__button sticky-bar__button--primary"
      :class="[
        { 'sticky-bar__button--full': !secondaryText && !tertiaryText },
        primaryTheme && primaryTheme !== 'default'
          ? 'sticky-bar__button--primary--' + primaryTheme
          : '',
      ]"
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
  tertiaryText?: string
  primaryDisabled?: boolean
  secondaryDisabled?: boolean
  tertiaryDisabled?: boolean
  /**
   * 主按钮的主题色。
   *
   * 默认整站的绿色；健康管理页的六个板块各有一套色系，保存按钮跟着走 ——
   * 顾客切到「过敏」看到的是橙色系的保存键，切到「体重」是青色系，
   * 不会所有板块都是一个绿按钮。
   *
   * ⚠️ 必须做成属性而不是让父页面用 :deep() 覆盖 ——
   *    小程序的自定义组件默认样式隔离，父页面的样式进不来（实测撞到过）。
   */
  primaryTheme?: 'default' | 'visit' | 'allergy' | 'vaccine' | 'diet' | 'weight'
}>()

const emit = defineEmits<{
  (event: 'primary'): void
  (event: 'secondary'): void
  (event: 'tertiary'): void
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
  min-width: 0;
  height: 88rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 22rpx;
  padding: 0 12rpx;
  font-size: 28rpx;
  font-weight: 700;
  white-space: nowrap;
}

.sticky-bar__button::after {
  border: none;
}

.sticky-bar__button--secondary {
  flex: 0.92;
  color: #0f6b43;
  background: #fff;
  border: 1rpx solid rgba(7, 193, 96, 0.2);
}

.sticky-bar__button--tertiary {
  flex: 1.02;
  color: #5b6770;
  background: rgba(15, 107, 67, 0.08);
}

.sticky-bar__button--primary {
  flex: 1.18;
  color: #fff;
  background: linear-gradient(135deg, #0f6b43 0%, #0c8a55 100%);
}

.sticky-bar__button--full {
  flex: 1 1 auto;
}

/*
 * 五个板块的主题色主按钮（健康管理页用）。病史与体检已合并为「病例」。
 * 与书签、板块底色同一套色，顾客一眼能对上「我在哪一块」。
 */
.sticky-bar__button--primary--visit {
  background: linear-gradient(135deg, #0c6a3f 0%, #128a54 100%);
}
.sticky-bar__button--primary--allergy {
  background: linear-gradient(135deg, #97501f 0%, #bc6a33 100%);
}
.sticky-bar__button--primary--vaccine {
  background: linear-gradient(135deg, #5b4c88 0%, #7a68ab 100%);
}
.sticky-bar__button--primary--diet {
  background: linear-gradient(135deg, #a06a12 0%, #c08a24 100%);
}
.sticky-bar__button--primary--weight {
  background: linear-gradient(135deg, #0b6069 0%, #12808b 100%);
}
</style>
