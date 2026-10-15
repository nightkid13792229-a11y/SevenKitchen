<template>
  <!-- ══ 下一针（需求 R2 / 原型 A、B、C、F、I、K 屏）══════════════════════
       第一句话永远是「下一针：哪一类 · 什么时候」—— 哪怕是三年后，
       也不做"没事 / 有事"的二分（老板 2026-10-15 定）。

       平时不占地方：右上角「查看详情 ›」展开后才有依据、常见产品、
       抗体检测入口、忽略、以及"这一针可以和 X 一起打"（原型 G 屏）。 -->
  <view class="vk-next" :class="`vk-next--${tone}`">
    <view class="vk-next__eyebrow">
      <text>下一针</text>
      <text v-if="next" class="vk-next__toggle" @tap="toggleDetail">
        {{ expanded ? '收起详情' : '查看详情 ›' }}
      </text>
    </view>

    <template v-if="next">
      <text class="vk-next__what">{{ stepTitle(next) }}</text>
      <text class="vk-next__when">{{ stepWhenText(next) }}</text>
      <text v-if="hint" class="vk-next__hint">{{ hint }}</text>
      <view class="vk-next__acts">
        <text class="vk-next__btn vk-next__btn--ghost" @tap="onScan">拍疫苗本</text>
        <text class="vk-next__btn vk-next__btn--solid" @tap="onRecord">记录这一针</text>
      </view>
    </template>

    <template v-else>
      <text class="vk-next__what">暂无需要接种的项目</text>
      <text class="vk-next__when">{{ idleText }}</text>
      <view class="vk-next__acts">
        <text v-if="ignoredCount > 0" class="vk-next__btn vk-next__btn--solid" @tap="toggleIgnored">
          {{ ignoredOpen ? '收起已忽略的项' : `查看已忽略的 ${ignoredCount} 项` }}
        </text>
        <text class="vk-next__btn vk-next__btn--ghost" @tap="onScan">拍疫苗本</text>
      </view>
    </template>

    <!-- ── 详情（点开才出现）────────────────────────────────────────── -->
    <view v-if="next && expanded" class="vk-next__detail">
      <view class="vk-next__field">
        <text class="vk-next__field-label">免疫流程</text>
        <text class="vk-next__field-text">{{ flowText }}</text>
      </view>

      <view v-if="productText" class="vk-next__field">
        <text class="vk-next__field-label">常见产品</text>
        <text class="vk-next__field-text">{{ productText }}</text>
      </view>

      <view v-if="basisText" class="vk-next__field">
        <text class="vk-next__field-label">依据</text>
        <text class="vk-next__field-text">{{ basisText }}</text>
      </view>

      <view class="vk-next__detail-acts">
        <text class="vk-next__act vk-next__act--primary" @tap="onRecord">记录这一针</text>
        <text v-if="next.titerable" class="vk-next__act" @tap="onAntibody">先做抗体检测</text>
      </view>
      <view class="vk-next__detail-acts">
        <text class="vk-next__act vk-next__act--ghost" @tap="onIgnore">这个先不打（忽略）</text>
      </view>

      <!-- 两针一起打：提示本身就是录入入口（需求 R11 / 原型 G 屏） -->
      <view v-if="next.combo" class="vk-next__combo">
        <text class="vk-next__combo-title">这一针可以和{{ next.combo.withLabel }}一起打</text>
        <text v-if="next.combo.hint" class="vk-next__combo-text">{{ next.combo.hint }}</text>
        <text class="vk-next__combo-when">接种窗口 {{ comboWindowText }}</text>
        <text v-if="comboProductText" class="vk-next__combo-label">常见产品</text>
        <text v-if="comboProductText" class="vk-next__combo-text">{{ comboProductText }}</text>
        <view class="vk-next__detail-acts">
          <text class="vk-next__act vk-next__act--primary" @tap="onRecord">记录这一针</text>
        </view>
      </view>

      <!-- 后面还有：只列接下来两项（远期的不逐条堆在首屏） -->
      <view v-if="laterText" class="vk-next__later">
        <text>{{ laterText }}</text>
      </view>
    </view>

    <!-- ── 已忽略的项（能一键恢复，需求 R5）────────────────────────── -->
    <view v-if="ignoredOpen && ignoredItems.length > 0" class="vk-next__ignored">
      <view v-for="item in ignoredItems" :key="item.key" class="vk-next__ignored-row">
        <view class="vk-next__ignored-body">
          <text class="vk-next__ignored-name">{{ item.kindLabel }}{{ item.label }}</text>
          <text v-if="reasonLabel(item.reason)" class="vk-next__ignored-reason">{{ reasonLabel(item.reason) }}</text>
        </view>
        <text class="vk-next__restore" @tap="onRestore(item.key)">恢复</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { VaccineIgnoredStep, VaccineStep } from '../../domain/vaccine/types'
import {
  formatFullDate,
  ignoreReasonLabel,
  stepTitle,
  stepWhenText,
} from '../../domain/vaccine/status'

const props = withDefaults(defineProps<{
  /** 下一针；没有任何待办时是 null */
  next?: VaccineStep | null
  /** 计划里排在下一针之后的项（只用来写"还有：…"一行，不做任何推算） */
  laterSteps?: VaccineStep[]
  /** 已设为不做的项（E 类：不再接种） */
  ignoredItems?: VaccineIgnoredStep[]
  ignoredCount?: number
}>(), {
  next: null,
  laterSteps: () => [],
  ignoredItems: () => [],
  ignoredCount: 0,
})

const emit = defineEmits<{
  (event: 'record', step: VaccineStep | null): void
  (event: 'scan'): void
  (event: 'antibody', step: VaccineStep | null): void
  (event: 'ignore', step: VaccineStep): void
  (event: 'restore', key: string): void
}>()

const expanded = ref(false)
const ignoredOpen = ref(false)

/** 三种底色：待接种的亮绿 / 尽快补种的警示红 / 半年内没事的深绿（原型三套） */
const tone = computed(() => {
  const step = props.next
  if (!step) return 'calm'
  if (step.status === 'OVERDUE') return 'warn'
  if (step.status === 'DUE') return 'now'
  return 'calm'
})

/**
 * 卡片上那行小字。
 *
 * 后端给了依据就写依据（例如"已经满 26 周，补一针核心疫苗即可；之后每 3 年接种一次"、
 * "狂犬是法定每年接种，漏了要尽快补上"）；
 * 没给就写"还有：…"——只把计划里**已经排好的**接下来两项念出来，不做任何推算。
 */
const hint = computed(() => {
  const step = props.next
  if (!step) return ''
  const basis = String(step.basis || '').trim()
  if (basis) return basis
  const later = (props.laterSteps || []).slice(0, 2)
  if (later.length === 0) return ''
  const parts = later.map((item) => `${item.kindLabel}${item.label} ${formatFullDate(item.windowStart)}`)
  return `还有：${parts.join(' · ')}`
})

const idleText = computed(() => {
  const items = props.ignoredItems || []
  if (items.length > 0) {
    const names = items.map((item) => `${item.kindLabel}${item.label}`).join('、')
    return `有 ${props.ignoredCount || items.length} 项已设为不做：${names}`
  }
  return '按现在这份记录，暂时没有需要接种的项目'
})

const flowText = computed(() => {
  const step = props.next
  if (!step) return ''
  const start = formatFullDate(step.windowStart)
  const end = formatFullDate(step.windowEnd)
  const window = end ? `${start} ~ ${end}` : start
  const status = String(step.statusLabel || '').trim()
  return status ? `接种窗口 ${window} · ${status}` : `接种窗口 ${window}`
})

const productText = computed(() => {
  const products = props.next?.products || []
  return products.length > 0 ? `${products.join('、')} 等产品` : ''
})

const basisText = computed(() => String(props.next?.basis || '').trim())

const comboWindowText = computed(() => {
  const combo = props.next?.combo
  if (!combo) return ''
  const start = formatFullDate(combo.windowStart)
  const end = formatFullDate(combo.windowEnd)
  return end ? `${start} ~ ${end}` : start
})

const comboProductText = computed(() => (props.next?.combo?.products || []).join(' · '))

const laterText = computed(() => {
  const later = (props.laterSteps || []).slice(0, 2)
  if (later.length === 0) return ''
  const parts = later.map((item) => `${item.kindLabel}${item.label} ${formatFullDate(item.windowStart)}`)
  return `后面还有：${parts.join(' · ')}`
})

function reasonLabel(reason: string) {
  return ignoreReasonLabel(reason)
}

function toggleDetail() {
  expanded.value = !expanded.value
}

function toggleIgnored() {
  ignoredOpen.value = !ignoredOpen.value
}

function onScan() {
  emit('scan')
}

function onRecord() {
  emit('record', props.next)
}

function onAntibody() {
  emit('antibody', props.next)
}

function onIgnore() {
  if (!props.next) return
  emit('ignore', props.next)
}

function onRestore(key: string) {
  emit('restore', key)
}
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vk-next {
  border-radius: $vk-card-radius;
  padding: 24rpx;
  color: $vk-white;
  background: linear-gradient(135deg, $vk-next-from, $vk-next-to);
  box-shadow: 0 8rpx 28rpx rgba(15, 123, 73, 0.16);
}

.vk-next--warn {
  background: linear-gradient(135deg, $vk-next-warn-from, $vk-next-warn-to);
  box-shadow: 0 8rpx 28rpx rgba(168, 64, 47, 0.18);
}

.vk-next--calm {
  background: linear-gradient(135deg, $vk-next-calm-from, $vk-next-calm-to);
  box-shadow: none;
}

.vk-next__eyebrow {
  display: flex;
  align-items: center;
  font-size: 22rpx;
  opacity: 0.88;
}

.vk-next__toggle {
  margin-left: auto;
  font-weight: 600;
}

.vk-next__what {
  display: block;
  font-size: $vk-font-hero;
  font-weight: 700;
  margin: 8rpx 0;
}

.vk-next__when {
  display: block;
  font-size: 25rpx;
  line-height: 1.55;
}

.vk-next__hint {
  display: block;
  font-size: $vk-font-sub;
  opacity: 0.9;
  margin-top: 8rpx;
  line-height: 1.5;
}

.vk-next__acts {
  display: flex;
  gap: 16rpx;
  margin-top: 22rpx;
}

.vk-next__btn {
  flex: 1;
  text-align: center;
  line-height: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  font-size: 25rpx;
  font-weight: 600;
}

.vk-next__btn--solid {
  background: $vk-white;
  color: $vk-brand-deep;
}

.vk-next__btn--ghost {
  border: 1px solid rgba(255, 255, 255, 0.55);
  color: $vk-white;
}

.vk-next__detail {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1px solid rgba(255, 255, 255, 0.28);
}

.vk-next__field {
  margin-bottom: 18rpx;
}

.vk-next__field-label {
  display: block;
  font-size: 22rpx;
  opacity: 0.8;
  margin-bottom: 6rpx;
}

.vk-next__field-text {
  display: block;
  font-size: 25rpx;
  line-height: 1.55;
}

.vk-next__detail-acts {
  display: flex;
  gap: 16rpx;
  margin-top: 12rpx;
}

.vk-next__act {
  flex: 1;
  text-align: center;
  line-height: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  font-size: 25rpx;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.55);
  color: $vk-white;
}

.vk-next__act--primary {
  background: $vk-white;
  color: $vk-brand-deep;
  border-color: $vk-white;
}

.vk-next__act--ghost {
  background: rgba(255, 255, 255, 0.12);
}

.vk-next__combo {
  margin-top: 22rpx;
  border-radius: 22rpx;
  padding: 20rpx;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.vk-next__combo-title {
  display: block;
  font-size: 27rpx;
  font-weight: 700;
}

.vk-next__combo-when {
  display: block;
  font-size: $vk-font-sub;
  margin-top: 8rpx;
}

.vk-next__combo-label {
  display: block;
  font-size: 22rpx;
  opacity: 0.8;
  margin-top: 14rpx;
}

.vk-next__combo-text {
  display: block;
  font-size: 25rpx;
  line-height: 1.55;
  margin-top: 6rpx;
}

.vk-next__later {
  margin-top: 18rpx;
  font-size: $vk-font-sub;
  opacity: 0.88;
  line-height: 1.5;
}

.vk-next__ignored {
  margin-top: 20rpx;
  padding-top: 16rpx;
  border-top: 1px solid rgba(255, 255, 255, 0.28);
}

.vk-next__ignored-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 14rpx 0;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
}

.vk-next__ignored-body {
  flex: 1;
  min-width: 0;
}

.vk-next__ignored-name {
  font-size: 25rpx;
  font-weight: 600;
}

.vk-next__ignored-reason {
  display: block;
  font-size: 21rpx;
  opacity: 0.85;
  margin-top: 4rpx;
}

.vk-next__restore {
  font-size: 25rpx;
  font-weight: 600;
  text-decoration: underline;
}
</style>
