<template>
  <!-- ══ 免疫计划（需求 R3 / 原型 A–K 屏）══════════════════════════════════
       每行 = 日期窗口 + 类别色条 + `类别 · 步骤名` + `必打`/`强烈建议` + 状态角标。

       ⚠️ 前端**不排计划、不算状态**：顺序、窗口、状态、"现在"是哪一条
          全部是后端算好下发的（技术方案 2.2 / 3.4）。这里只按数组顺序画。
       ⚠️ 底部"之后的节奏"一行替代了把 20 年逐条列出来（需求 7.3）。 -->
  <!-- 没有一行可排时**整块不出现**：答案已经在上面那张「下一针」卡里了，
       再立一个空板块只会把同一句话又说一遍、还多占一屏 -->
  <view v-if="plan.length > 0" class="vk-plan">
    <view class="vk-plan__head">
      <view class="vk-plan__bar" />
      <text class="vk-plan__title">免疫计划</text>
      <!-- 老板 2026-10-15 第 3 条：统计**放在免疫计划这个板块**里（下一针那块不报数）。
           数的是"这一块列了几项"—— 原型 K 里两行都已完成，那里也写「共 2 项」。 -->
      <text v-if="plan.length > 0" class="vk-plan__meta">共 {{ plan.length }} 项</text>
    </view>

    <view class="vk-plan__card">
      <view
        v-for="step in plan"
        :key="step.key"
        class="vk-plan__row"
        :class="{
          'vk-plan__row--now': step.key === nextKey,
          'vk-plan__row--far': step.status === 'UPCOMING',
        }"
      >
        <view class="vk-plan__when">
          <text class="vk-plan__when-main">{{ windowText(step).main }}</text>
          <text v-if="windowText(step).sub" class="vk-plan__when-sub">{{ windowText(step).sub }}</text>
        </view>

        <view class="vk-plan__body">
          <view class="vk-plan__line">
            <view class="vk-plan__kind" :class="`vk-plan__kind--${kindTone(step.kind)}`" />
            <text class="vk-plan__step">{{ planTitle(step) }}</text>
            <!-- 层级标识只挂在**还要打的行**上：已完成的行再写"必打"没有意义，
                 原型 K/F 里那两行也没有标识。 -->
            <text
              v-if="step.status !== 'DONE'"
              class="vk-plan__layer"
              :class="{ 'vk-plan__layer--suggest': step.layer === 'SUGGEST' }"
            >{{ layerLabel(step.layer) }}</text>
          </view>
          <text
            v-if="rowNote(step).text"
            class="vk-plan__note"
            :class="{ 'vk-plan__note--over': rowNote(step).overdue }"
          >{{ rowNote(step).text }}</text>
        </view>
      </view>

      <view v-if="rhythm" class="vk-plan__rhythm">
        <text>{{ rhythm }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { VaccineKind, VaccineLayer, VaccineStep } from '../../domain/vaccine/types'
import {
  stepKindTone,
  stepLayerLabel,
  stepPlanTitle,
  stepRowNote,
  stepWindowText,
} from '../../domain/vaccine/status'

const props = withDefaults(defineProps<{
  /** 免疫计划（后端已按时间从近到远排好） */
  plan?: VaccineStep[]
  /** 底部"之后的节奏"那一句 */
  rhythm?: string
  /** 哪一行是"现在"（后端给的"下一针"的 key；没有待办时是空串） */
  nextKey?: string
}>(), {
  plan: () => [],
  rhythm: '',
  nextKey: '',
})

const plan = computed(() => props.plan || [])

function windowText(step: VaccineStep) {
  return stepWindowText(step)
}

function planTitle(step: VaccineStep) {
  return stepPlanTitle(step)
}

function rowNote(step: VaccineStep) {
  return stepRowNote(step)
}

function kindTone(kind: VaccineKind) {
  return stepKindTone(kind)
}

function layerLabel(layer: VaccineLayer) {
  return stepLayerLabel(layer)
}

</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vk-plan__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 0 4rpx 14rpx;
}

.vk-plan__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 4rpx;
  background: $vk-brand;
}

.vk-plan__title {
  font-size: 28rpx;
  font-weight: 700;
  color: $vk-text-strong;
}

.vk-plan__meta {
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-plan__card {
  background: $vk-card-bg;
  border: 1px solid $vk-card-border;
  border-radius: $vk-card-radius;
  padding: 4rpx 24rpx 8rpx;
}

/* 还没到时间的那几行弱化（原型 `.tl__row--far`：标题与日期都用更浅的灰）——
   "现在"那一行才是重点，远期的不该和它一样抢眼 */
.vk-plan__row--far .vk-plan__step {
  color: $vk-text-muted;
  font-weight: 600;
}

.vk-plan__row--far .vk-plan__when-main,
.vk-plan__row--far .vk-plan__when-sub {
  color: $vk-text-faint;
}

.vk-plan__row {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 16rpx 0;
  border-top: 1px solid $vk-line;
  position: relative;
}

.vk-plan__row--now::before {
  content: '';
  position: absolute;
  left: -24rpx;
  top: 18rpx;
  bottom: 18rpx;
  width: 6rpx;
  border-radius: 4rpx;
  background: $vk-brand;
}

.vk-plan__when {
  flex: 0 0 168rpx;
  font-size: $vk-font-sub;
  font-weight: 600;
  color: $vk-ghost-fg;
  line-height: 1.4;
  padding-top: 2rpx;
}

.vk-plan__when-main {
  display: block;
}

.vk-plan__when-sub {
  display: block;
  font-weight: 400;
  font-size: 21rpx;
  color: $vk-text-faint;
}

.vk-plan__body {
  flex: 1;
  min-width: 0;
}

.vk-plan__line {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}

.vk-plan__kind {
  display: inline-block;
  width: $vk-bar-width;
  height: $vk-bar-height;
  border-radius: 4rpx;
}

.vk-plan__kind--core {
  background: $vk-core;
}

.vk-plan__kind--rabies {
  background: $vk-rabies;
}

.vk-plan__kind--lepto {
  background: $vk-lepto;
}

.vk-plan__kind--plain {
  background: $vk-plain;
}

.vk-plan__step {
  font-size: $vk-font-title;
  font-weight: 700;
  color: $vk-text;
  line-height: 1.35;
}

.vk-plan__layer {
  @include vk-badge($vk-must-bg, $vk-must-fg);
  padding: 2rpx 12rpx;
  font-size: 20rpx;
}

.vk-plan__layer--suggest {
  background: $vk-suggest-bg;
  color: $vk-suggest-fg;
}





.vk-plan__note {
  display: block;
  font-size: $vk-font-sub;
  color: $vk-text-muted;
  margin-top: 6rpx;
  line-height: 1.5;
}

.vk-plan__note--over {
  color: $vk-danger;
}

.vk-plan__empty {
  display: block;
  font-size: 25rpx;
  color: $vk-text-faint;
  padding: 20rpx 4rpx;
}

.vk-plan__rhythm {
  font-size: $vk-font-sub;
  color: $vk-text-faint;
  padding: 16rpx 0 10rpx;
  border-top: 1px solid $vk-line;
  line-height: 1.55;
}
</style>
