<template>
  <!-- 「依据」——过敏板块的来源区（2026-10-04，过敏重构第二期）。
       报告在这里是一份**报告**，不是散装的十几条过敏原：
       检测日期 / 方式 / 机构 / 原件都在，顾客随时能翻出来给医生看。

       改造前：顾客上传报告 → AI 读出来 → **原件被丢掉**，再也看不到。 -->
  <view class="health-section allergy-reports">
    <view class="health-section__header">
      <view class="health-section__heading">
        <text class="health-section__title">检测报告与记录</text>
        <text class="health-section__desc">上面那些结论是从这里来的</text>
      </view>
      <text class="health-section__count">{{ reports.length }} 份</text>
    </view>

    <view v-if="reports.length === 0" class="health-section__empty">
      <text class="health-section__empty-title">还没有检测报告</text>
      <text class="health-section__empty-desc">
        有报告就传上来，原件会留在这里，识别出的过敏原会记到上面的结论里。
      </text>
    </view>

    <view v-else class="health-section__list">
      <view v-for="report in reports" :key="report.id" class="report-card">
        <view class="report-card__head" @tap="toggle(report.id)">
          <view class="report-card__head-main">
            <text class="report-card__date">{{ report.testDate || '未填检测日期' }}</text>
            <text class="report-card__method">{{ methodLabel(report.testMethod) }}</text>
          </view>
          <text class="report-card__toggle">
            {{ expandedId === report.id ? '收起' : '展开' }}
          </text>
        </view>

        <text class="report-card__summary">
          {{ report.resultCount > 0
            ? `${report.resultCount} 项结论：${resultNames(report).join('、')}`
            : '没有记录具体结论' }}
        </text>

        <view v-if="expandedId === report.id" class="report-card__body">
          <view v-if="report.institution" class="report-card__row">
            <text class="report-card__label">检测机构</text>
            <text class="report-card__value">{{ report.institution }}</text>
          </view>

          <view v-if="report.summary" class="report-card__row">
            <text class="report-card__label">报告说明</text>
            <text class="report-card__value">{{ report.summary }}</text>
          </view>

          <view v-if="report.results && report.results.length > 0" class="report-card__results">
            <text class="report-card__label">结论明细</text>
            <view
              v-for="result in report.results"
              :key="result.id || result.allergen"
              class="report-result"
            >
              <text class="report-result__name">{{ result.allergen }}</text>
              <text
                class="report-result__badge"
                :class="`report-result__badge--${certaintyKey(result.certainty)}`"
              >{{ certaintyLabel(result.certainty) }}</text>
            </view>
          </view>

          <!-- 报告原件：改造前传完就丢，现在留住了 -->
          <view v-if="report.attachments && report.attachments.length > 0" class="report-card__files">
            <text class="report-card__label">报告原件</text>
            <view class="report-card__file-list">
              <text
                v-for="(file, index) in report.attachments"
                :key="file"
                class="report-card__file"
                @tap="previewFile(report.attachments, index)"
              >查看第 {{ index + 1 }} 张</text>
            </view>
          </view>

          <view class="report-card__actions">
            <text class="report-card__action" @tap="removeReport(report)">删除这份报告</text>
          </view>

          <text class="report-card__hint">
            删除报告不会删掉上面已经记下的过敏原 —— 依据没了，结论仍然成立。
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { dogApi } from '../../api/dogs'

/**
 * 过敏「依据」区（2026-10-04，过敏重构第二期）
 *
 * 报告原件留住这件事本身就是这一期的核心：
 * 改造前顾客拍照 → 上传 COS → AI 读出来 → **原件标识被丢弃**，
 * 顾客再也看不到自己传的报告。"记录过敏检查报告"这条要求
 * 在原件留不住的情况下等于没完成。
 */

interface ReportResult {
  id?: string
  allergen: string
  certainty?: string
}

interface ReportItem {
  id: string
  testDate: string | null
  testMethod: string
  institution: string | null
  summary: string | null
  attachments: string[]
  resultCount: number
  results: ReportResult[]
}

const props = defineProps<{
  dogId: string
  /** 由父页面传入，避免每个子组件各拉一次 */
  reports?: ReportItem[]
}>()

const emit = defineEmits<{
  (event: 'changed'): void
}>()

const expandedId = ref('')

const reports = ref<ReportItem[]>([])

watch(
  () => props.reports,
  (value) => {
    reports.value = Array.isArray(value) ? value : []
  },
  { immediate: true },
)

const METHOD_LABELS: Record<string, string> = {
  SERUM: '血清检测',
  INTRADERMAL: '皮内试验',
  ELIMINATION: '排除性饮食试验',
  OTHER: '其它方式',
  UNKNOWN: '未注明方式',
}

/**
 * 检测方式照抄报告上写的。
 * 知识库 skin-003 明确血清 IgE / 皮试对食物不良反应不能确诊 ——
 * 但那是**给顾客看的引导**（写在下面的提示里），
 * 不是让系统替顾客否定他手里的报告。
 */
function methodLabel(value: string) {
  return METHOD_LABELS[String(value || '').toUpperCase()] || '未注明方式'
}

function resultNames(report: ReportItem): string[] {
  return (report.results || [])
    .map((result) => String(result?.allergen || '').trim())
    .filter(Boolean)
    .slice(0, 5)
}

const CERTAINTY_LABELS: Record<string, string> = {
  CONFIRMED: '确诊',
  SUSPECTED: '可疑',
  TO_VERIFY: '待排查',
  RULED_OUT: '已排除',
}

function certaintyLabel(value: string | undefined) {
  return CERTAINTY_LABELS[String(value || 'SUSPECTED').toUpperCase()] || '可疑'
}

function certaintyKey(value: string | undefined) {
  const key = String(value || 'SUSPECTED').toUpperCase()
  if (key === 'CONFIRMED') return 'confirmed'
  if (key === 'RULED_OUT') return 'ruled-out'
  if (key === 'TO_VERIFY') return 'verify'
  return 'suspected'
}

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? '' : id
}

function previewFile(urls: string[], index: number) {
  uni.previewImage({ urls, current: urls[index] })
}

function removeReport(report: ReportItem) {
  uni.showModal({
    title: '删除这份报告？',
    content: '报告原件会被删除，但已经记下的过敏原会保留。',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const response: any = await dogApi.allergyReports.remove(props.dogId, report.id)
        if (response?.code !== 0) {
          throw new Error(response?.message || '删除失败')
        }
        uni.showToast({ title: '已删除', icon: 'none' })
        emit('changed')
      } catch (error: any) {
        uni.showToast({ title: error?.message || '删除失败，请重试', icon: 'none' })
      }
    },
  })
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.report-card {
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  background: #fbfcf7;
  border: 2rpx solid #eef0e6;
  margin-bottom: 16rpx;
}

.report-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.report-card__head-main {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}

.report-card__date {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.report-card__method {
  font-size: 22rpx;
  color: #968f6d;
}

.report-card__toggle {
  font-size: 24rpx;
  color: #ad5b2a;
}

.report-card__summary {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
  margin-top: 10rpx;
  line-height: 1.5;
}

.report-card__body {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 2rpx dashed #e3e6d4;
}

.report-card__row {
  margin-bottom: 16rpx;
}

.report-card__label {
  display: block;
  font-size: 22rpx;
  color: #968f6d;
  margin-bottom: 8rpx;
}

.report-card__value {
  font-size: 24rpx;
  color: #26261f;
  line-height: 1.6;
}

.report-card__results {
  margin-bottom: 16rpx;
}

.report-result {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx 0;
}

.report-result__name {
  font-size: 26rpx;
  color: #26261f;
}

.report-result__badge {
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  color: #ffffff;
  background: #c08a2e;
}

.report-result__badge--confirmed {
  background: #b4553f;
}

.report-result__badge--verify {
  background: #6f7fb0;
}

.report-result__badge--ruled-out {
  background: #9aa88f;
}

.report-card__files {
  margin-bottom: 16rpx;
}

.report-card__file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.report-card__file {
  font-size: 22rpx;
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  color: #ad5b2a;
  background: #f7e9e0;
}

.report-card__actions {
  margin-top: 8rpx;
}

.report-card__action {
  font-size: 24rpx;
  color: #b4553f;
}

.report-card__hint {
  display: block;
  font-size: 20rpx;
  color: #968f6d;
  margin-top: 10rpx;
  line-height: 1.5;
}
</style>
