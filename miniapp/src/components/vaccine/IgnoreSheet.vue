<template>
  <!-- 忽略时问一句原因（需求 R5 / 原型 J 屏）。
       ⚠️ 不做独立的"不再接种"功能：两个选项**行为一致**（都是不再提醒这一针），
          区别只是把"为什么"记下来 —— 这样"已忽略"那一行才说得清。 -->
  <view v-if="visible" class="vk-ignore">
    <view class="vk-ignore__mask" @tap="onCancel" />
    <view class="vk-ignore__sheet">
      <text class="vk-ignore__title">这一针怎么办？</text>
      <view
        v-for="option in REASON_OPTIONS"
        :key="option.value"
        class="vk-ignore__opt"
        @tap="pick(option.value)"
      >
        <view class="vk-ignore__dot" :class="{ 'vk-ignore__dot--on': reason === option.value }" />
        <text class="vk-ignore__name">{{ option.label }}</text>
        <text class="vk-ignore__hint">{{ option.hint }}</text>
      </view>
      <view class="vk-ignore__acts">
        <text class="vk-ignore__btn vk-ignore__btn--ghost" @tap="onCancel">取消</text>
        <text
          class="vk-ignore__btn vk-ignore__btn--primary"
          :class="{ 'vk-ignore__btn--disabled': saving }"
          @tap="onConfirm"
        >{{ saving ? '保存中…' : '确定' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  /** 正在保存（确定键置忙，避免连点存两次） */
  saving?: boolean
}>(), {
  saving: false,
})

const emit = defineEmits<{
  (event: 'confirm', reason: 'NOT_NOW' | 'STOPPED'): void
  (event: 'cancel'): void
}>()

/**
 * 两个选项（文案逐字来自原型 J 屏）。
 *
 * `NOT_NOW` 之后还会提醒；`STOPPED` 是按兽医建议或家长自己决定停止。
 * 后端收的是同一个 `decision: 'SKIP'`，只把 `reason` 分开记。
 */
/**
 * 两个原因**强度不同**，界面上要把这个区别说出来（老板 2026-10-16 拍板）。
 *
 * 原来两行小字只说了"是什么心情"（之后还会提醒 / 兽医建议停），
 * 可家长真正需要知道的是**选哪个会连带停掉一整类** ——
 * 不然他点「不再接种了」会以为只是"这次不点"，结果整个类别都从计划里消失 ✗。
 *
 * 行为本身**不动**（跳过这一针 / 停掉这一类各有各的用处，见需求文档决策记录）。
 */
const REASON_OPTIONS: { value: 'NOT_NOW' | 'STOPPED'; label: string; hint: string }[] = [
  { value: 'NOT_NOW', label: '这次先不打', hint: '只跳过这一针，以后该打还会提醒' },
  { value: 'STOPPED', label: '不再接种了', hint: '这一类都不再提醒（随时可以恢复）' },
]

const DEFAULT_REASON: 'NOT_NOW' | 'STOPPED' = 'NOT_NOW'

const reason = ref<'NOT_NOW' | 'STOPPED'>(DEFAULT_REASON)

/**
 * 每次**打开时复位**。
 *
 * ⚠️ 不复位的话：上次给狂犬选了"不再接种了"，这次给核心那一针打开弹层，
 *    选项还停在"不再接种了" —— 家长只想"这次先不打"，一按确定就记成了长期停打。
 *    默认值取"这次先不打"（影响最小、随时还会再提醒）；原型 J 画的是选中
 *    "不再接种了"，那只是**画了一个状态**，不是默认值。
 */
watch(
  () => props.visible,
  (open) => {
    if (open) reason.value = DEFAULT_REASON
  },
)

function pick(value: 'NOT_NOW' | 'STOPPED') {
  reason.value = value
}

function onCancel() {
  emit('cancel')
}

function onConfirm() {
  if (props.saving) return
  emit('confirm', reason.value)
}
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vk-ignore {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 90;
}

.vk-ignore__mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(30, 58, 47, 0.35);
}

.vk-ignore__sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: $vk-card-bg;
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 32rpx 40rpx;
}

.vk-ignore__title {
  display: block;
  font-size: $vk-font-card-title;
  font-weight: 700;
  color: $vk-text;
  margin-bottom: 20rpx;
}

.vk-ignore__opt {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 0;
  border-top: 1px solid $vk-line;
}

.vk-ignore__dot {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 3rpx solid $vk-radio-border;
  flex: 0 0 36rpx;
  box-sizing: border-box;
}

.vk-ignore__dot--on {
  border-color: $vk-brand;
  background: $vk-brand;
  box-shadow: inset 0 0 0 8rpx $vk-card-bg;
}

.vk-ignore__name {
  font-size: $vk-font-title;
  font-weight: 600;
  color: $vk-text;
}

.vk-ignore__hint {
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-ignore__acts {
  display: flex;
  gap: 16rpx;
  margin-top: 28rpx;
}

.vk-ignore__btn {
  flex: 1;
  text-align: center;
  line-height: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  font-size: $vk-font-button;
  font-weight: 600;
}

.vk-ignore__btn--ghost {
  background: $vk-ghost-bg;
  color: $vk-ghost-fg;
}

.vk-ignore__btn--primary {
  background: $vk-brand;
  color: $vk-white;
}

.vk-ignore__btn--disabled {
  opacity: 0.6;
}
</style>
