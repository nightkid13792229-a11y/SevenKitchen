<template>
  <!-- ══ 接种记录 + 抗体检测（合并成一个列表，需求 R10 / 原型 C、F、K 屏）══════
       ⚠️ 两类记录在顾客眼里是同一件事："我给这只狗做过什么"。
          所以一个列表、按日期倒序；来源不同才在名字里说清（抗体检测 · …）。
       ⚠️ 疫苗本原件**整本只展示一次**（R10）：一条虚线行，点开能预览。 -->
  <view class="vk-records">
    <view class="vk-records__head">
      <view class="vk-records__bar" />
      <text class="vk-records__title">接种记录</text>
      <text v-if="entries.length > 0" class="vk-records__meta">{{ entries.length }} 条</text>
    </view>

    <view class="vk-records__card">
      <text v-if="loading && entries.length === 0" class="vk-records__empty">正在读取…</text>
      <text v-else-if="entries.length === 0" class="vk-records__empty">还没有接种记录</text>

      <view
        v-for="entry in visibleEntries"
        :key="entry.id"
        class="vk-records__row"
        @tap="onEntryTap(entry)"
      >
        <view class="vk-records__body">
          <text class="vk-records__name">{{ entryTitle(entry) }}</text>
          <text v-if="entryNote(entry)" class="vk-records__note">{{ entryNote(entry) }}</text>
        </view>
        <text v-if="isPending(entry)" class="vk-records__check">待核对</text>
        <text class="vk-records__date">{{ formatFullDate(entry.date) }}</text>
      </view>

      <view v-if="entries.length > visibleEntries.length" class="vk-records__more" @tap="toggleExpanded">
        <text>查看全部 {{ entries.length }} 条</text>
      </view>
      <view v-else-if="expanded && entries.length > RECENT_COUNT" class="vk-records__more" @tap="toggleExpanded">
        <text>收起</text>
      </view>
    </view>

    <!-- 抗体检测的入口常驻在记录区（与「下一针」详情里那条路是同一个录入器） -->
    <view class="vk-records__add" @tap="onAddTest">
      <text class="vk-records__add-text">记一次抗体检测</text>
    </view>

    <!-- 疫苗本原件：整本只展示一次（R10） -->
    <view v-if="bookUrls.length > 0" class="vk-records__book" @tap="onPreviewBook">
      <text class="vk-records__book-title">查看疫苗本原件</text>
      <text class="vk-records__book-count">{{ bookUrls.length }} 张</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  AntibodyTest,
  VaccineRecord,
  VaccineTimelineEntry,
} from '../../domain/vaccine/types'
import { antibodyEntryTitle, formatFullDate } from '../../domain/vaccine/status'

const props = withDefaults(defineProps<{
  records?: VaccineRecord[]
  tests?: AntibodyTest[]
  loading?: boolean
}>(), {
  records: () => [],
  tests: () => [],
  loading: false,
})

const emit = defineEmits<{
  (event: 'edit-record', record: VaccineRecord): void
  (event: 'edit-test', test: AntibodyTest): void
  (event: 'verify-record', record: VaccineRecord): void
  (event: 'add-test'): void
  (event: 'preview', urls: string[]): void
}>()

/** 没展开时只给最近几条（原型 C 屏：两行 + 查看全部 6 条） */
const RECENT_COUNT = 2

const expanded = ref(false)

/**
 * 两类合并成一条时间线（**只是摆进同一个列表**，与免疫计划无关）。
 *
 * 排序按日期倒序 —— 同一天的，接种记录排在抗体检测前面（先打了针才去测抗体）。
 */
const entries = computed<VaccineTimelineEntry[]>(() => {
  const list: VaccineTimelineEntry[] = []
  for (const record of props.records || []) {
    if (!record?.id) continue
    list.push({
      type: 'record',
      id: `record-${record.id}`,
      date: String(record.vaccinationDate || '').slice(0, 10),
      record,
    })
  }
  for (const test of props.tests || []) {
    if (!test?.id) continue
    list.push({
      type: 'test',
      id: `test-${test.id}`,
      date: String(test.testedAt || '').slice(0, 10),
      test,
    })
  }
  return list.sort((left, right) => {
    if (left.date === right.date) return left.type === 'test' ? 1 : -1
    return left.date < right.date ? 1 : -1
  })
})

const visibleEntries = computed(() => (
  expanded.value ? entries.value : entries.value.slice(0, RECENT_COUNT)
))

/** 疫苗本原件（所有记录 + 抗体检测上的附件，整本只展示一次） */
const bookUrls = computed(() => {
  const urls: string[] = []
  for (const record of props.records || []) {
    for (const url of record?.attachments || []) {
      if (url && urls.indexOf(url) < 0) urls.push(url)
    }
  }
  for (const test of props.tests || []) {
    for (const url of test?.attachments || []) {
      if (url && urls.indexOf(url) < 0) urls.push(url)
    }
  }
  return urls
})

function entryTitle(entry: VaccineTimelineEntry): string {
  if (entry.type === 'test') return antibodyEntryTitle(entry.test)
  const record = entry.record
  const labels = (record.componentLabels || []).slice(0, 3)
  if (labels.length === 0) return record.vaccineName
  const tail = (record.componentLabels || []).length > labels.length ? '…' : ''
  return `${record.vaccineName}（${labels.join('、')}${tail}）`
}

/** 这一行的补充说明（备注 / 抗体检测的下次评估） */
function entryNote(entry: VaccineTimelineEntry): string {
  if (entry.type === 'test') {
    const nextReview = String(entry.test.nextReviewAt || '').slice(0, 10)
    return nextReview ? `下次评估 ${formatFullDate(nextReview)}` : ''
  }
  return String(entry.record.notes || '')
}

/** 待核对（R7）：识别出来还没对照本子确认的那几条 */
function isPending(entry: VaccineTimelineEntry): boolean {
  return entry.type === 'record' && entry.record.productVerified === false
}

function toggleExpanded() {
  expanded.value = !expanded.value
}

/**
 * 点一行：待核对的**先给核对动作**（那是唯一的出路），其余进编辑。
 */
function onEntryTap(entry: VaccineTimelineEntry) {
  if (isPending(entry) && entry.type === 'record') {
    emit('verify-record', entry.record)
    return
  }
  if (entry.type === 'test') {
    emit('edit-test', entry.test)
    return
  }
  emit('edit-record', entry.record)
}

function onAddTest() {
  emit('add-test')
}

function onPreviewBook() {
  emit('preview', bookUrls.value)
}
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';

.vk-records__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 0 4rpx 14rpx;
}

.vk-records__bar {
  width: 8rpx;
  height: 28rpx;
  border-radius: 4rpx;
  background: $vk-record-accent;
}

.vk-records__title {
  font-size: 28rpx;
  font-weight: 700;
  color: $vk-record-title;
}

.vk-records__meta {
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-records__card {
  background: linear-gradient(180deg, $vk-record-bg-from, $vk-record-bg-to);
  border: 1px solid $vk-record-border;
  border-radius: $vk-card-radius;
  padding: 8rpx 24rpx 16rpx;
}

.vk-records__empty {
  display: block;
  font-size: 25rpx;
  color: $vk-text-faint;
  padding: 16rpx 4rpx 8rpx;
}

.vk-records__row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx 4rpx;
  border-top: 1px solid $vk-line-soft;
}

.vk-records__body {
  flex: 1;
  min-width: 0;
}

.vk-records__name {
  font-size: 26rpx;
  font-weight: 600;
  color: $vk-text;
}

.vk-records__note {
  display: block;
  font-size: 21rpx;
  color: $vk-text-faint;
  margin-top: 4rpx;
}

.vk-records__check {
  @include vk-badge($vk-check-bg, $vk-check-fg);
}

.vk-records__date {
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}

.vk-records__more {
  text-align: center;
  font-size: 24rpx;
  color: $vk-record-accent;
  font-weight: 600;
  padding: 18rpx 0 6rpx;
}

.vk-records__add {
  margin-top: 14rpx;
  border: 1px dashed $vk-field-border;
  border-radius: 22rpx;
  padding: 20rpx 24rpx;
  background: $vk-card-bg;
}

.vk-records__add-text {
  font-size: 25rpx;
  font-weight: 600;
  color: $vk-text-muted;
}

.vk-records__book {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: $vk-card-bg;
  border: 1px dashed $vk-field-border;
  border-radius: 22rpx;
  padding: 22rpx 24rpx;
  margin-top: 14rpx;
}

.vk-records__book-title {
  font-size: 25rpx;
  font-weight: 600;
  color: $vk-ghost-fg;
}

.vk-records__book-count {
  margin-left: auto;
  font-size: $vk-font-sub;
  color: $vk-text-faint;
}
</style>
