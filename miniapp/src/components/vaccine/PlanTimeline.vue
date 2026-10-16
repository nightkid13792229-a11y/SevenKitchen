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
      <!-- ⚠️ 2026-10-16 自检 V29：点开详情的动作挂在**整行**上，不是只挂在右边标题那一块。
           原来 @tap 在 `.vk-plan__body` 上 —— 左边那列日期（占了三分之一宽度）
           点了没反应；家长想展开往往先去点日期，于是以为"这一项打不开"✗。 -->
      <view
        v-for="step in plan"
        :key="step.key"
        class="vk-plan__row"
        :class="{
          'vk-plan__row--now': step.key === nextKey,
          'vk-plan__row--far': step.status === 'UPCOMING',
        }"
        @tap="toggleRow(step.key)"
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
            <!-- 每一项都能展开：为什么这么排（依据）/ 能打什么（常见产品） -->
            <text class="vk-plan__more">{{ isOpen(step.key) ? '收起' : '详情 ›' }}</text>
          </view>
          <text
            v-if="rowNote(step).text"
            class="vk-plan__note"
            :class="{ 'vk-plan__note--over': rowNote(step).overdue }"
          >{{ rowNote(step).text }}</text>

          <!-- 展开详情 -->
          <view v-if="isOpen(step.key)" class="vk-plan__detail">
            <!-- 2026-10-16 老板要求去掉"类别定义"那一格（原话见需求文档），
                 展开里只留这一刻真正用得上的两样：依据 + 常见产品。
                 ⚠️ 注释里也别把那几个字抄回来 —— 守卫是查源码文本的，抄了就红。 -->
            <view v-if="step.basis" class="vk-plan__field">
              <text class="vk-plan__field-label">依据</text>
              <text class="vk-plan__field-text">{{ step.basis }}</text>
            </view>
            <view v-if="step.products && step.products.length > 0" class="vk-plan__field">
              <text class="vk-plan__field-label">常见产品</text>
              <text class="vk-plan__field-text">{{ step.products.join('、') }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="rhythm" class="vk-plan__rhythm">
        <text>{{ rhythm }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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

/**
 * 展开的是哪一项（同时只开一项：一次看一项，版面不会被几条依据撑爆）。
 *
 * 老板 2026-10-16："免疫计划板块，每一项计划都需要给一个展开详情的按钮，
 * 点击这个按钮之后，可以看到该计划的疫苗分类的定义、依据和常见疫苗推荐。"
 */
const openKey = ref('')

function isOpen(key: string): boolean {
  return openKey.value === key
}

function toggleRow(key: string) {
  openKey.value = openKey.value === key ? '' : key
}

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
  font-size: $vk-font-section;
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

.vk-plan__more {
  flex-shrink: 0;
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-brand;
}

.vk-plan__detail {
  margin-top: 10rpx;
  padding: 14rpx 16rpx;
  background: $vk-page-bg;
  border-radius: 16rpx;
}

.vk-plan__field + .vk-plan__field {
  margin-top: 10rpx;
}

.vk-plan__field-label {
  display: block;
  font-size: $vk-font-badge;
  color: $vk-text-faint;
}

.vk-plan__field-text {
  display: block;
  margin-top: 2rpx;
  font-size: $vk-font-sub;
  color: $vk-text-body;
  line-height: 1.55;
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
  font-size: $vk-font-badge;
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

/* 层级标识（必打 / 强烈建议）：字号就用角标那一档（mixin 里已给），
   这里只把内边距收紧一点，让它跟标题同一行 */
.vk-plan__layer {
  @include vk-badge($vk-must-bg, $vk-must-fg);
  padding: 2rpx 12rpx;
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

.vk-plan__rhythm {
  font-size: $vk-font-sub;
  color: $vk-text-faint;
  padding: 16rpx 0 10rpx;
  border-top: 1px solid $vk-line;
  line-height: 1.55;
}
</style>
