<template>
  <view class="ingredient-creation-list-page">
    <view class="toolbar">
      <view class="toolbar-title-block">
        <text class="page-title">AI 新增食材</text>
        <text class="page-subtitle">内部新增食材任务与审核进度</text>
      </view>
      <button class="refresh-btn" :disabled="loading" @tap="loadJobs">
        {{ loading ? '加载中' : '刷新' }}
      </button>
    </view>

    <view class="create-panel">
      <text class="section-title">新增食材需求</text>
      <textarea
        v-model="requestText"
        class="request-input"
        maxlength="600"
        placeholder="例如：新增去皮鸭胸肉，按每日采购使用，需要可用于 DIY 食谱评估"
      />
      <view class="create-actions">
        <text class="input-hint">{{ requestText.length }}/600</text>
        <button
          class="primary-btn"
          :disabled="creating || !canSubmitJob"
          @tap="createJob"
        >
          {{ creating ? '创建中' : '创建任务' }}
        </button>
      </view>
    </view>

    <view class="list-heading">
      <text class="section-title">任务列表</text>
      <text class="list-count">{{ jobs.length }} 项</text>
    </view>

    <view v-if="loading && jobs.length === 0" class="state-block">
      <text>加载中...</text>
    </view>

    <view v-else-if="jobs.length === 0" class="state-block">
      <text class="empty-title">暂无新增任务</text>
      <text class="empty-subtitle">在上方描述新增食材需求后开始</text>
    </view>

    <view v-else class="job-list">
      <view
        v-for="job in sortedJobs"
        :key="job.id"
        class="job-card"
        @tap="openJob(job)"
      >
        <view class="job-header">
          <text class="job-title">{{ getJobTitle(job) }}</text>
          <text :class="['status-badge', getStatusClass(job.status)]">
            {{ getStatusLabel(job.status) }}
          </text>
        </view>
        <text class="job-request">{{ job.requestText }}</text>
        <view class="progress-track">
          <view class="progress-fill" :style="{ width: `${getJobProgress(job)}%` }" />
        </view>
        <view class="job-meta-row">
          <text>{{ job.currentStage || '等待处理' }}</text>
          <text>{{ formatDateTime(job.updatedAt || job.createdAt) }}</text>
        </view>
        <view v-if="job.waitingQuestion" class="waiting-question">
          <text>{{ job.waitingQuestion }}</text>
        </view>
        <view class="job-actions">
          <button class="secondary-btn" @tap.stop="openJob(job)">查看任务</button>
          <button
            v-if="job.draft"
            class="secondary-btn draft-btn"
            @tap.stop="openDraft(job)"
          >
            查看草稿
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  ingredientCreationApi,
  type IngredientCreationJob,
  type IngredientCreationJobStatus,
} from '../../api/ingredient-creation'

const jobs = ref<IngredientCreationJob[]>([])
const requestText = ref('')
const loading = ref(false)
const creating = ref(false)

const canSubmitJob = computed(() => requestText.value.trim().length > 0)

const sortedJobs = computed(() => {
  return [...jobs.value].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt || '').getTime()
    const right = new Date(b.updatedAt || b.createdAt || '').getTime()
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0)
  })
})

onShow(() => {
  void loadJobs()
})

async function loadJobs() {
  loading.value = true
  try {
    const res = await ingredientCreationApi.listJobs()
    jobs.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    console.error('[IngredientCreationList] Failed to load jobs:', error)
    uni.showToast({ title: '加载任务失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

async function createJob() {
  if (!canSubmitJob.value || creating.value) return

  creating.value = true
  try {
    const res = await ingredientCreationApi.createJob({
      requestText: requestText.value.trim(),
    })
    const job = res.data
    requestText.value = ''
    if (job?.id) {
      uni.navigateTo({ url: `/pages/ingredient-creation/detail?id=${job.id}` })
      return
    }
    await loadJobs()
  } catch (error) {
    console.error('[IngredientCreationList] Failed to create job:', error)
    uni.showToast({ title: '创建任务失败', icon: 'none' })
  } finally {
    creating.value = false
  }
}

function openJob(job: IngredientCreationJob) {
  uni.navigateTo({ url: `/pages/ingredient-creation/detail?id=${job.id}` })
}

function openDraft(job: IngredientCreationJob) {
  if (!job.draft?.id) return
  uni.navigateTo({
    url: `/pages/ingredient-creation/draft?id=${job.draft.id}&jobId=${job.id}`,
  })
}

function getJobTitle(job: IngredientCreationJob) {
  return job.draft?.suggestedName || compactText(job.requestText, 22) || '新增食材任务'
}

function getJobProgress(job: IngredientCreationJob) {
  const progress = Number(job.progress || 0)
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(100, Math.round(progress)))
}

function compactText(value: string, maxLength: number) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}...`
}

function getStatusLabel(status: IngredientCreationJobStatus) {
  const map: Record<IngredientCreationJobStatus, string> = {
    DRAFTING: '起草中',
    SEARCHING_SOURCES: '查资料',
    WAITING_USER: '待补充',
    BUILDING_REPORT: '生成报告',
    READY_FOR_REVIEW: '待审核',
    CONFIRMED: '已确认',
    FAILED: '失败',
    CANCELED: '已取消',
  }
  return map[status] || status
}

function getStatusClass(status: IngredientCreationJobStatus) {
  if (status === 'WAITING_USER') return 'status-waiting'
  if (status === 'READY_FOR_REVIEW') return 'status-review'
  if (status === 'CONFIRMED') return 'status-confirmed'
  if (status === 'FAILED') return 'status-failed'
  return ''
}

function formatDateTime(value?: string) {
  if (!value) return '未更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}
</script>

<style scoped lang="scss">
.ingredient-creation-list-page {
  min-height: 100vh;
  padding: 24rpx 32rpx 56rpx;
  background: #f5f5f5;
  box-sizing: border-box;
}

.toolbar,
.list-heading,
.job-header,
.job-meta-row,
.job-actions,
.create-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.toolbar {
  margin-bottom: 24rpx;
}

.toolbar-title-block {
  flex: 1;
  min-width: 0;
}

.page-title {
  display: block;
  color: #222;
  font-size: 40rpx;
  font-weight: 700;
}

.page-subtitle {
  display: block;
  margin-top: 8rpx;
  color: #777;
  font-size: 24rpx;
}

.refresh-btn,
.primary-btn,
.secondary-btn {
  flex-shrink: 0;
  height: 68rpx;
  margin: 0;
  padding: 0 22rpx;
  border-radius: 10rpx;
  font-size: 25rpx;
  line-height: 68rpx;
}

.refresh-btn,
.secondary-btn {
  background: #fff;
  color: #1677ff;
  border: 1rpx solid #b7d9ff;
}

.primary-btn {
  min-width: 156rpx;
  background: #1890ff;
  color: #fff;
}

.create-panel,
.job-card {
  background: #fff;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.create-panel {
  padding: 28rpx;
  margin-bottom: 28rpx;
}

.section-title {
  display: block;
  color: #222;
  font-size: 30rpx;
  font-weight: 700;
}

.request-input {
  width: 100%;
  min-height: 180rpx;
  margin-top: 18rpx;
  padding: 18rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 10rpx;
  background: #fbfcfe;
  box-sizing: border-box;
  color: #222;
  font-size: 26rpx;
  line-height: 1.45;
}

.create-actions {
  margin-top: 18rpx;
}

.input-hint,
.list-count {
  color: #888;
  font-size: 24rpx;
}

.list-heading {
  margin-bottom: 16rpx;
  padding: 0 4rpx;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 360rpx;
  color: #888;
  font-size: 28rpx;
}

.empty-title {
  margin-bottom: 12rpx;
  color: #333;
  font-size: 30rpx;
}

.empty-subtitle {
  color: #999;
  font-size: 24rpx;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.job-card {
  padding: 28rpx;
}

.job-header {
  align-items: flex-start;
}

.job-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #222;
  font-size: 32rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  background: #edf4ff;
  color: #1677ff;
  font-size: 22rpx;
}

.status-waiting {
  background: #fff7ed;
  color: #c2410c;
}

.status-review {
  background: #f6ffed;
  color: #389e0d;
}

.status-confirmed {
  background: #ecfdf5;
  color: #047857;
}

.status-failed {
  background: #fff1f0;
  color: #cf1322;
}

.job-request {
  display: block;
  margin-top: 14rpx;
  color: #555;
  font-size: 25rpx;
  line-height: 1.5;
}

.progress-track {
  height: 10rpx;
  margin-top: 18rpx;
  overflow: hidden;
  border-radius: 999rpx;
  background: #edf2f7;
}

.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: #1890ff;
}

.job-meta-row {
  margin-top: 14rpx;
  color: #777;
  font-size: 23rpx;
}

.waiting-question {
  margin-top: 14rpx;
  padding: 16rpx;
  border-radius: 10rpx;
  background: #fff7ed;
  color: #9a3412;
  font-size: 24rpx;
  line-height: 1.45;
}

.job-actions {
  justify-content: flex-end;
  margin-top: 18rpx;
}

.draft-btn {
  background: #f6ffed;
  color: #389e0d;
  border-color: #b7eb8f;
}
</style>
