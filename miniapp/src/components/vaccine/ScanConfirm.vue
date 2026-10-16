<template>
  <!-- 识别结果 · 逐条确认（需求 R12 / 原型 E 屏）。
       ⚠️ 只有**两列**：名称 + 日期。品牌、批号、下次到期日一律不要。
       ⚠️ "待核对"的行**不算进计划**（后端按 productVerified=false 处理），
          并给一个能走出去的动作：「我已对照本子核对」。没确认的不会保存。 -->
  <view v-if="rows.length > 0" class="vk-scan">
    <view class="vk-scan__head">
      <text class="vk-scan__title">识别结果</text>
      <text class="vk-scan__count">{{ rows.length }} 条</text>
    </view>
    <text class="vk-scan__hint">读出 {{ rows.length }} 条，请逐条确认。点任意一条可以改名称、日期，或者删掉。</text>
    <!-- "哪几条需要核对、为什么"要说在明面上（老板 2026-10-16 问的正是这个）——
         判据在 domain/vaccine/catalog.ts 的 scanRowReview，这里只是把同一套话讲给家长。 -->
    <text v-if="hasCareRow" class="vk-scan__hint">带「待核对」的是我们没十足把握的四种：名字没读出来、是狂犬、产品库里没有这个名字、日期可疑。它们会先记下来，但暂时不参与提醒 —— 对照本子看一眼、点一下核对，就算进去了。</text>

    <view
      v-for="(row, index) in rows"
      :key="row.key"
      class="vk-scan__row"
      :class="{ 'vk-scan__row--care': isCare(row) }"
    >
      <view class="vk-scan__line">
        <!-- ⚠️ 2026-10-16 老板："名字可以修改是可以修改，但用户可能并不知道
             当前 UI 下名字是可以修改的。" —— 原来它是个**没有边框的输入框**，
             看着和静态文字一模一样。现在按录入卡的写法给它一个框（有框 = 能改），
             右侧再明写一个「改」。 -->
        <view class="vk-scan__field">
          <input
            class="vk-scan__name"
            :value="row.name"
            placeholder="疫苗名称"
            placeholder-class="vk-scan__ph"
            @input="onNameInput(index, $event)"
          />
          <text class="vk-scan__edit">改</text>
        </view>
        <text v-if="isCare(row)" class="vk-scan__badge">待核对</text>
        <text class="vk-scan__del" @tap="removeRow(index)">删掉</text>
      </view>

      <picker mode="date" :value="row.date" @change="onDateChange(index, $event)">
        <view class="vk-scan__field vk-scan__field--date">
          <text
            class="vk-scan__date"
            :class="{ 'vk-scan__date--empty': !row.date }"
          >{{ row.date || '点这里选日期' }}</text>
          <text class="vk-scan__edit">改</text>
        </view>
      </picker>

      <template v-if="isCare(row)">
        <text class="vk-scan__why">{{ row.reason }}</text>
        <view class="vk-scan__acts">
          <text class="vk-scan__act" @tap="verifyRow(index)">我已对照本子核对</text>
        </view>
      </template>
    </view>

    <!-- 识别漏掉的那条，家长可以在这一页直接补上（老板 2026-10-16 问）——
         走的是**同一个录入器**：那里有产品库、有"含哪些疫苗"可勾，
         比在这一页硬填一个名字更不容易卡住。 -->
    <view class="vk-scan__add" @tap="onAddManual">
      <text class="vk-scan__add-text">＋ 补一条（识别漏掉的）</text>
    </view>

    <view class="vk-scan__footer">
      <text class="vk-scan__btn vk-scan__btn--ghost" @tap="onDiscard">全部不要</text>
      <text
        class="vk-scan__btn vk-scan__btn--primary"
        :class="{ 'vk-scan__btn--disabled': saving }"
        @tap="onSave"
      >{{ saving ? '正在保存…' : '确认并保存' }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { VaccineScanRow } from '../../domain/vaccine/types'

const props = withDefaults(defineProps<{
  /** 识别出来的行（名称 + 日期；`needsReview` 决定要不要核对） */
  drafts: VaccineScanRow[]
  /** 正在保存 */
  saving?: boolean
}>(), {
  saving: false,
})

/** 有没有"待核对"的行（决定要不要说那句"暂时不参与提醒"） */
const hasCareRow = computed(() => (props.drafts || []).some((row) => isCare(row)))

const emit = defineEmits<{
  (event: 'save', rows: VaccineScanRow[]): void
  (event: 'discard'): void
  /** 识别漏掉的那条，家长自己补 —— 交给唯一录入器 */
  (event: 'add-manual'): void
}>()

/**
 * 页面上的行是本组件的**本地副本**。
 *
 * 为什么不直接改 props：小程序里父组件传下来的 props 不该被子组件改写
 * （改了这一页的数据就同时属于两边，重渲染时谁说了算说不清）。
 * 所以父组件一给新的一批，就重新拷一份。
 */
const rows = ref<VaccineScanRow[]>([])

watch(
  () => props.drafts,
  (next) => {
    rows.value = (next || []).map((row) => ({ ...row }))
  },
  { immediate: true, deep: true },
)

/** 这一行还要不要核对（已经点过"我已对照本子核对"的就不再挡） */
function isCare(row: VaccineScanRow): boolean {
  return Boolean(row.needsReview) && !row.verified
}

function onNameInput(index: number, event: any) {
  const row = rows.value[index]
  if (!row) return
  row.name = String(event?.detail?.value || '')
}

function onDateChange(index: number, event: any) {
  const row = rows.value[index]
  if (!row) return
  row.date = String(event?.detail?.value || '')
}

function verifyRow(index: number) {
  const row = rows.value[index]
  if (!row) return
  row.verified = true
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

function onAddManual() {
  emit('add-manual')
}

function onDiscard() {
  emit('discard')
}

function onSave() {
  if (props.saving) return
  /*
   * 名称 + 日期都齐了才交上去（跟录入器同一套必填要求）。
   * 缺的那几条**留在页面上**，不静默丢 —— 家长补完还能再点一次保存。
   */
  const ready = rows.value.filter((row) => String(row.name || '').trim() && String(row.date || '').trim())
  if (ready.length === 0) {
    uni.showToast({ title: '还没有填好名称和日期', icon: 'none' })
    return
  }
  if (ready.length < rows.value.length) {
    const remaining = rows.value.length - ready.length
    rows.value = ready
    uni.showToast({ title: `还有 ${remaining} 条缺名称或日期，先留着`, icon: 'none' })
  }
  emit('save', ready.map((row) => ({ ...row })))
}
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vk-scan {
  background: $vk-card-bg;
  border: 1px solid $vk-card-border;
  border-radius: $vk-card-radius;
  padding: 24rpx;
}

.vk-scan__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 10rpx;
}

.vk-scan__title {
  font-size: 30rpx;
  font-weight: 700;
  color: $vk-text-strong;
}

.vk-scan__count {
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-scan__hint {
  display: block;
  font-size: $vk-font-sub;
  line-height: 1.55;
  color: $vk-text-muted;
  margin-bottom: 16rpx;
}

.vk-scan__row {
  border: 1px solid $vk-card-border;
  border-radius: 22rpx;
  padding: 18rpx;
  margin-bottom: 14rpx;
}

.vk-scan__row--care {
  border-color: $vk-care-border;
  background: $vk-care-bg;
}

.vk-scan__line {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/* 有框 = 能改（与录入卡同一种视觉语言） */
.vk-scan__field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
  border: 1px solid $vk-field-border;
  border-radius: 14rpx;
  background: $vk-white;
  padding: 8rpx 14rpx;
}

.vk-scan__field--date {
  margin-top: 8rpx;
}

/* 只给名称那一格：明写"改"，免得家长以为它只是标题 */
.vk-scan__edit {
  flex-shrink: 0;
  font-size: 21rpx;
  color: $vk-brand;
}

.vk-scan__add {
  margin: 12rpx 0 4rpx;
  text-align: center;
  line-height: 72rpx;
  border: 1px dashed $vk-field-border;
  border-radius: 16rpx;
  color: $vk-brand;
  font-size: $vk-font-body;
}

.vk-scan__add-text {
  font-size: $vk-font-body;
}

.vk-scan__name {
  flex: 1;
  min-width: 0;
  font-size: 27rpx;
  font-weight: 700;
  color: $vk-text;
}

.vk-scan__ph {
  color: $vk-placeholder;
  font-weight: 400;
}

.vk-scan__badge {
  @include vk-badge($vk-check-bg, $vk-check-fg);
}

.vk-scan__del {
  font-size: $vk-font-sub;
  color: $vk-text-faint;
  padding-left: 12rpx;
}

.vk-scan__date {
  margin-top: 12rpx;
  border: 1px solid $vk-field-border;
  border-radius: 18rpx;
  padding: 16rpx 18rpx;
  font-size: 26rpx;
  color: $vk-text;
}

.vk-scan__date--empty {
  color: $vk-placeholder;
}

.vk-scan__why {
  display: block;
  font-size: 22rpx;
  color: $vk-warning;
  line-height: 1.5;
  margin-top: 12rpx;
}

.vk-scan__acts {
  display: flex;
  margin-top: 14rpx;
}

.vk-scan__act {
  flex: 1;
  text-align: center;
  line-height: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  border: 1px solid $vk-brand;
  color: $vk-brand;
  font-size: 25rpx;
  font-weight: 600;
}

.vk-scan__footer {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.vk-scan__btn {
  flex: 1;
  text-align: center;
  line-height: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  font-weight: 600;
}

.vk-scan__btn--ghost {
  background: $vk-ghost-bg;
  color: $vk-ghost-fg;
}

.vk-scan__btn--primary {
  background: $vk-brand;
  color: $vk-white;
}

.vk-scan__btn--disabled {
  opacity: 0.6;
}
</style>
