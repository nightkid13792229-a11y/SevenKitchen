<template>
  <view class="ingredient-creation-detail-page">
    <view v-if="loading && !job" class="state-block">
      <text>加载中...</text>
    </view>

    <view v-else-if="!job" class="state-block">
      <text class="empty-title">未找到任务</text>
      <button class="secondary-btn" @tap="goBack">返回</button>
    </view>

    <view v-else>
      <view class="summary-panel">
        <view class="summary-header">
          <view class="summary-title-block">
            <text class="page-title">{{ job.draft?.suggestedName || '新增食材任务' }}</text>
            <text class="page-subtitle">{{ job.requestText }}</text>
          </view>
          <text :class="['status-badge', getStatusClass(job.status)]">
            {{ getStatusLabel(job.status) }}
          </text>
        </view>
        <view class="progress-track">
          <view class="progress-fill" :style="{ width: `${getJobProgress(job)}%` }" />
        </view>
        <view class="meta-grid">
          <view class="meta-item">
            <text class="meta-label">阶段</text>
            <text class="meta-value">{{ job.currentStage || '等待处理' }}</text>
          </view>
          <view class="meta-item">
            <text class="meta-label">进度</text>
            <text class="meta-value">{{ getJobProgress(job) }}%</text>
          </view>
          <view class="meta-item">
            <text class="meta-label">更新时间</text>
            <text class="meta-value">{{ formatDateTime(job.updatedAt || job.createdAt) }}</text>
          </view>
        </view>
        <view v-if="job.errorMessage" class="error-block">
          <text>{{ job.errorMessage }}</text>
        </view>
        <button
          v-if="job.draft"
          class="primary-btn full-btn"
          @tap="openDraft"
        >
          查看草稿
        </button>
      </view>

      <view v-if="job.status === 'WAITING_USER'" class="section waiting-section">
        <text class="section-title">待补充信息</text>
        <text v-if="job.waitingQuestion" class="section-note">{{ job.waitingQuestion }}</text>
        <textarea
          v-model="answerText"
          class="textarea-input"
          maxlength="500"
          placeholder="回答 AI 当前问题"
        />
        <button
          class="primary-btn full-btn"
          :disabled="answering || !canAnswer"
          @tap="answerQuestion"
        >
          {{ answering ? '提交中' : '提交回答' }}
        </button>
      </view>

      <view class="section">
        <text class="section-title">普通补充要求</text>
        <textarea
          v-model="messageText"
          class="textarea-input"
          maxlength="500"
          placeholder="补充非问答式要求，例如指定数据源、采购形态或别名"
        />
        <button
          class="secondary-btn full-btn"
          :disabled="sendingMessage || !canSendMessage"
          @tap="sendAdditionalMessage"
        >
          {{ sendingMessage ? '发送中' : '发送补充要求' }}
        </button>
      </view>

      <view class="section">
        <view class="section-header">
          <text class="section-title">对话记录</text>
          <text class="message-count">{{ messages.length }} 条</text>
        </view>
        <view v-if="messages.length === 0" class="empty-message">
          <text>暂无对话记录</text>
        </view>
        <view v-else class="message-list">
          <view
            v-for="message in messages"
            :key="message.id"
            :class="['message-card', getMessageClass(message.role)]"
          >
            <view class="message-header">
              <text class="message-role">{{ getMessageRoleLabel(message.role) }}</text>
              <text class="message-time">{{ formatDateTime(message.createdAt) }}</text>
            </view>
            <text class="message-content">{{ message.content }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import {
  ingredientCreationApi,
  type IngredientCreationJob,
  type IngredientCreationJobStatus,
  type IngredientCreationMessageRole,
} from '../../api/ingredient-creation'

type RouteOptions = {
  id?: string
}

const jobId = ref('')
const job = ref<IngredientCreationJob | null>(null)
const loading = ref(false)
const answering = ref(false)
const sendingMessage = ref(false)
const answerText = ref('')
const messageText = ref('')
const hasLoadedOnce = ref(false)

const messages = computed(() => job.value?.messages || [])
const canAnswer = computed(() => answerText.value.trim().length > 0)
const canSendMessage = computed(() => messageText.value.trim().length > 0)

onLoad((options: RouteOptions) => {
  jobId.value = String(options?.id || '')
  if (!jobId.value) {
    uni.showToast({ title: '缺少任务ID', icon: 'none' })
    return
  }
  void loadJob()
})

onShow(() => {
  if (jobId.value && hasLoadedOnce.value) {
    void loadJob()
  }
})

async function loadJob() {
  loading.value = true
  try {
    const res = await ingredientCreationApi.getJob(jobId.value)
    job.value = res.data
  } catch (error) {
    console.error('[IngredientCreationDetail] Failed to load job:', error)
    uni.showToast({ title: '加载任务失败', icon: 'none' })
  } finally {
    hasLoadedOnce.value = true
    loading.value = false
  }
}

async function answerQuestion() {
  if (!job.value || job.value.status !== 'WAITING_USER' || !canAnswer.value || answering.value) return

  answering.value = true
  try {
    const res = await ingredientCreationApi.answerQuestion(job.value.id, {
      content: answerText.value.trim(),
    })
    job.value = res.data
    answerText.value = ''
    uni.showToast({ title: '已提交回答', icon: 'success' })
  } catch (error) {
    console.error('[IngredientCreationDetail] Failed to answer question:', error)
    uni.showToast({ title: '提交回答失败', icon: 'none' })
  } finally {
    answering.value = false
  }
}

async function sendAdditionalMessage() {
  if (!job.value || !canSendMessage.value || sendingMessage.value) return

  sendingMessage.value = true
  try {
    const res = await ingredientCreationApi.addMessage(job.value.id, {
      content: messageText.value.trim(),
    })
    job.value = res.data
    messageText.value = ''
    uni.showToast({ title: '已发送', icon: 'success' })
  } catch (error) {
    console.error('[IngredientCreationDetail] Failed to send message:', error)
    uni.showToast({ title: '发送补充要求失败', icon: 'none' })
  } finally {
    sendingMessage.value = false
  }
}

function openDraft() {
  if (!job.value?.draft?.id) return
  uni.navigateTo({
    url: `/pages/ingredient-creation/draft?id=${job.value.draft.id}&jobId=${job.value.id}`,
  })
}

function goBack() {
  uni.navigateBack()
}

function getJobProgress(target: IngredientCreationJob) {
  const progress = Number(target.progress || 0)
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(100, Math.round(progress)))
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

function getMessageRoleLabel(role: IngredientCreationMessageRole) {
  const map: Record<IngredientCreationMessageRole, string> = {
    USER: '用户',
    AGENT: 'AI',
    PROGRESS: '进度',
    QUESTION: '问题',
    SYSTEM: '系统',
  }
  return map[role] || role
}

function getMessageClass(role: IngredientCreationMessageRole) {
  if (role === 'USER') return 'message-user'
  if (role === 'QUESTION') return 'message-question'
  if (role === 'PROGRESS') return 'message-progress'
  return ''
}

function formatDateTime(value?: string) {
  if (!value) return '未记录'
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
.ingredient-creation-detail-page {
  min-height: 100vh;
  padding: 24rpx 32rpx 56rpx;
  background: #f5f5f5;
  box-sizing: border-box;
}

.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 420rpx;
  gap: 18rpx;
  color: #888;
  font-size: 28rpx;
}

.empty-title {
  color: #333;
  font-size: 30rpx;
}

.summary-panel,
.section {
  margin-bottom: 22rpx;
  padding: 28rpx;
  border-radius: 12rpx;
  background: #fff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.summary-header,
.section-header,
.message-header,
.meta-grid {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.summary-title-block {
  flex: 1;
  min-width: 0;
}

.page-title {
  display: block;
  overflow: hidden;
  color: #222;
  font-size: 36rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-subtitle {
  display: block;
  margin-top: 10rpx;
  color: #666;
  font-size: 25rpx;
  line-height: 1.45;
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

.progress-track {
  height: 10rpx;
  margin-top: 22rpx;
  overflow: hidden;
  border-radius: 999rpx;
  background: #edf2f7;
}

.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: #1890ff;
}

.meta-grid {
  margin-top: 22rpx;
}

.meta-item {
  flex: 1;
  min-width: 0;
}

.meta-label,
.meta-value {
  display: block;
}

.meta-label {
  color: #888;
  font-size: 22rpx;
}

.meta-value {
  margin-top: 6rpx;
  overflow: hidden;
  color: #333;
  font-size: 25rpx;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-block {
  margin-top: 18rpx;
  padding: 16rpx;
  border-radius: 10rpx;
  background: #fff1f0;
  color: #cf1322;
  font-size: 24rpx;
  line-height: 1.45;
}

.section-title {
  display: block;
  color: #222;
  font-size: 30rpx;
  font-weight: 700;
}

.section-note {
  display: block;
  margin-top: 12rpx;
  color: #9a3412;
  font-size: 25rpx;
  line-height: 1.45;
}

.waiting-section {
  border: 1rpx solid #fed7aa;
}

.textarea-input {
  width: 100%;
  min-height: 160rpx;
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

.primary-btn,
.secondary-btn {
  height: 72rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 10rpx;
  font-size: 26rpx;
  line-height: 72rpx;
}

.primary-btn {
  background: #1890ff;
  color: #fff;
}

.secondary-btn {
  background: #fff;
  color: #1677ff;
  border: 1rpx solid #b7d9ff;
}

.full-btn {
  width: 100%;
  margin-top: 18rpx;
}

.message-count {
  flex-shrink: 0;
  color: #888;
  font-size: 24rpx;
}

.empty-message {
  margin-top: 18rpx;
  color: #999;
  font-size: 25rpx;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 18rpx;
}

.message-card {
  padding: 18rpx;
  border-radius: 10rpx;
  background: #f8fafc;
}

.message-user {
  background: #edf4ff;
}

.message-question {
  background: #fff7ed;
}

.message-progress {
  background: #f6ffed;
}

.message-role {
  color: #222;
  font-size: 25rpx;
  font-weight: 700;
}

.message-time {
  color: #999;
  font-size: 22rpx;
}

.message-content {
  display: block;
  margin-top: 10rpx;
  color: #444;
  font-size: 25rpx;
  line-height: 1.5;
}
</style>
