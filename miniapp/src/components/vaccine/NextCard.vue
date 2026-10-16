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
      <text v-if="hint && !expanded" class="vk-next__hint">{{ hint }}</text>
      <view class="vk-next__acts">
        <text class="vk-next__btn vk-next__btn--ghost" @tap="onScan">上传疫苗本</text>
        <text class="vk-next__btn vk-next__btn--solid" @tap="onRecord">记录这一针</text>
      </view>
    </template>

    <template v-else>
      <text class="vk-next__what">暂无需要接种的项目</text>
      <text class="vk-next__when">{{ idleText }}</text>
      <view class="vk-next__acts">
        <text class="vk-next__btn vk-next__btn--ghost" @tap="onScan">上传疫苗本</text>
      </view>
    </template>

    <!-- 已忽略的项：**只要有就必须能看见**（否则一旦还有别的待办，
         被忽略的那几项就永远看不到、也恢复不了）。原型 K 是 ghost 按钮。 -->
    <view v-if="ignoredCount > 0" class="vk-next__ignored-toggle">
      <text class="vk-next__btn vk-next__btn--ghost" @tap="toggleIgnored">
        {{ ignoredOpen ? '收起已忽略的项' : `查看已忽略的 ${ignoredCount} 项` }}
      </text>
    </view>

    <!-- ── 详情（点开才出现）────────────────────────────────────────── -->
    <view v-if="next && expanded" class="vk-next__detail">
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
          <text class="vk-next__act vk-next__act--primary" @tap="onRecordCombo">记录这一针</text>
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
  /** 组合那一针：带上 combo 的常见产品去预填（不是主按钮那一支） */
  (event: 'record-combo', products: string[]): void
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
 * 卡片上那行小字：只把计划里**已经排好的**接下来两项念出来，不做任何推算。
 *
 * ⚠️ 2026-10-16 改：原来这里优先写后端的 `basis`（依据原文）——
 *    那是「查看详情」里给人看的**整段依据**，放在卡片上当小字既太长、
 *    又和展开后的「依据」一字不差地重复。收起状态只用这一句"还有：…"。
 */
const hint = computed(() => {
  const step = props.next
  if (!step) return ''
  /*
   * 优先级：**后端的 `hint`**（一句话）> 自己拼的"还有：…"。
   *
   * ⚠️ 这里**不能**用 `basis`：那是"查看详情"里给人读的整段依据，
   *    带指南引注、100 多字，放在卡片上当小字会变成一堵墙
   *    （2026-10-16 实测：成年补一针那条 basis 有 128 个字）。
   *    短的给首屏、长的给详情，两个字段分工见后端程序表。
   */
  const hint = String(step.hint || '').trim()
  if (hint) return hint
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
  // ⚠️ 不能重复上面那行"暂无需要接种的项目"（原来是同一句话写两遍）。
  //    这里说"接下来会怎样"，才是家长真正想知道的。
  return '该打的都打完了。以后该打的时候，这里会告诉你。'
})

const productText = computed(() => {
  const products = props.next?.products || []
  return products.length > 0 ? `${products.join('、')} 等产品` : ''
})

const comboWindowText = computed(() => {
  const combo = props.next?.combo
  if (!combo) return ''
  const start = formatFullDate(combo.windowStart)
  const end = formatFullDate(combo.windowEnd)
  return end ? `${start} ~ ${end}` : start
})

const comboProductText = computed(() => (props.next?.combo?.products || []).join(' · '))

const basisText = computed(() => String(props.next?.basis || '').trim())

const laterText = computed(() => {
  const later = (props.laterSteps || []).slice(0, 2)
  if (later.length === 0) return ''
  const parts = later.map((item) => `${item.kindLabel}${item.label} ${formatFullDate(item.windowStart)}`)
  return `后面还有：${parts.join(' · ')}`
})

function reasonLabel(reason: string) {
  return ignoreReasonLabel(reason)
}

function onRecordCombo() {
  emit('record-combo', (props.next?.combo?.products || []).slice())
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

.vk-next__ignored-toggle {
  margin-top: 18rpx;
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
