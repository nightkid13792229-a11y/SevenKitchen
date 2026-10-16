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
      <!-- 2026-10-16 撤掉了记录区那条抗体检测的常驻入口：
           它等于每次打开都在招呼家长"要不要测一个"，与"不主动提示"冲突（需求 R9）。
           现在只从**家长主动打开的**「记一条」里进（卡里有类型切换），
           以及核心疫苗该不该打那一处（「下一针」展开里的「先做抗体检测」）。 -->
    </view>

    <!-- 待核对（需求 R7）：不催、不弹窗，只在记录区顶部一行 -->
    <view v-if="pendingReviewCount > 0" class="vk-records__notice">
      <text class="vk-records__notice-text">有 {{ pendingReviewCount }} 条记录待你对照本子核对（点那一条就能核对）</text>
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
          <!-- 这一条为什么不作数（后端算好的，以前只在后端算、界面不显示） -->
          <text v-if="conflictOf(entry)" class="vk-records__warn">
            {{ conflictOf(entry)!.reason }}
          </text>
        </view>
        <text v-if="isPending(entry)" class="vk-records__check">待核对</text>
        <text class="vk-records__date">{{ formatFullDate(entry.date) }}</text>
        <!-- 点一行能改、能删 —— 得让人**看得出**这里能点（原型只画了名字+日期，
             家长不知道可以点，会以为记录只能看不能改） -->
        <text class="vk-records__edit">编辑</text>
      </view>

      <view v-if="entries.length > visibleEntries.length" class="vk-records__more" @tap="toggleExpanded">
        <text>查看全部 {{ entries.length }} 条</text>
      </view>
      <view v-else-if="expanded && entries.length > RECENT_COUNT" class="vk-records__more" @tap="toggleExpanded">
        <text>收起</text>
      </view>
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
  VaccineConflict,
  VaccineRecord,
  VaccineTimelineEntry,
} from '../../domain/vaccine/types'
import { antibodyEntryTitle, formatFullDate } from '../../domain/vaccine/status'

const props = withDefaults(defineProps<{
  records?: VaccineRecord[]
  tests?: AntibodyTest[]
  loading?: boolean
  /** 有几条记录待核对（后端算好下发；0 = 不显示那一行） */
  pendingReviewCount?: number
  /** 后端算好的"为什么不作数"（按记录 id 对号入座） */
  conflicts?: VaccineConflict[]
}>(), {
  records: () => [],
  tests: () => [],
  loading: false,
  pendingReviewCount: 0,
  conflicts: () => [],
})

const emit = defineEmits<{
  (event: 'edit-record', record: VaccineRecord): void
  (event: 'edit-test', test: AntibodyTest): void
  (event: 'verify-record', record: VaccineRecord): void
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

/**
 * 这一行叫什么。
 *
 * 括号里是**这一针含哪些病种**（需求 6.1：病种是顾客看得见的东西）。
 * 不再截断加"…"—— 病种本来就只有 2~4 个，截断之后"卫佳伍（犬瘟热、犬细小病毒…）"
 * 反而看不出到底防了什么。
 */
function entryTitle(entry: VaccineTimelineEntry): string {
  if (entry.type === 'test') return antibodyEntryTitle(entry.test)
  const record = entry.record
  const labels = record.componentLabels || []
  if (labels.length === 0) return record.vaccineName
  return `${record.vaccineName}（${labels.join('、')}）`
}

/** 这一行的补充说明（备注 / 抗体检测的下次评估） */
function entryNote(entry: VaccineTimelineEntry): string {
  if (entry.type === 'test') {
    const nextReview = String(entry.test.nextReviewAt || '').slice(0, 10)
    return nextReview ? `下次评估 ${formatFullDate(nextReview)}` : ''
  }
  return String(entry.record.notes || '')
}

/**
 * 这一条对应的"为什么不作数"。
 *
 * 后端把冲突挂在记录的 id 上（`recordId`）；行里的 id 带了 `record-` / `test-` 前缀，
 * 所以两边都试一下。
 */
function conflictOf(entry: VaccineTimelineEntry): VaccineConflict | null {
  const list = props.conflicts || []
  if (list.length === 0) return null
  const rawId = String(entry.id).replace(/^(record|test)-/, '')
  return list.find((item) => String(item.recordId || '') === rawId) || null
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
async function onEntryTap(entry: VaccineTimelineEntry) {
  // 有冲突的行：先把"为什么、该怎么办"讲清楚 —— 这是他现在最需要知道的
  const conflict = conflictOf(entry)
  if (conflict) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: String(conflict.reason || '这一条暂时不作数'),
        content: String(conflict.suggestion || ''),
        confirmText: '去修改',
        cancelText: '知道了',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      })
    })
    if (!confirmed) return
  }

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

function onPreviewBook() {
  emit('preview', bookUrls.value)
}
</script>

<style scoped lang="scss">
@import '../../styles/vaccine-tokens.scss';


.vk-records__notice {
  background: $vk-check-bg;
  border-radius: 20rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 14rpx;
}

.vk-records__notice-text {
  font-size: $vk-font-sub;
  color: $vk-check-fg;
  line-height: 1.5;
}

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

.vk-records__warn {
  display: block;
  margin-top: 4rpx;
  font-size: $vk-font-sub;
  color: $vk-warning;
  line-height: 1.45;
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

.vk-records__edit {
  flex-shrink: 0;
  font-size: $vk-font-sub;
  color: $vk-brand;
  padding-left: 6rpx;
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
