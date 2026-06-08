<template>
  <view class="feedback-list">
    <!-- 我要反馈按钮 -->
    <view class="fab-btn" @tap="goToForm">
      <text class="fab-text">我要反馈</text>
    </view>

    <!-- 反馈列表 -->
    <view v-if="feedbacks.length > 0" class="list-content">
      <view
        v-for="item in feedbacks"
        :key="item.id"
        class="feedback-card"
      >
        <!-- 用户信息 -->
        <view class="card-header">
          <image
            :src="item.user?.avatarUrl || '/static/default-avatar.png'"
            class="user-avatar"
            mode="aspectFill"
          />
          <view class="user-info">
            <text class="user-name">{{ item.user?.nickname || '匿名用户' }}</text>
            <text class="feedback-time">{{ formatTime(item.createdAt) }}</text>
          </view>
          <view class="type-tag" :class="getTypeClass(item.type)">
            {{ getTypeLabel(item.type) }}
          </view>
        </view>

        <!-- 反馈内容 -->
        <view class="card-content">
          <text class="content-text">{{ item.content }}</text>
        </view>

        <!-- 图片 -->
        <view v-if="item.imageUrls?.length" class="card-images">
          <image
            v-for="(url, idx) in item.imageUrls"
            :key="idx"
            :src="url"
            class="feedback-image"
            mode="aspectFill"
            @tap="previewImage(item.imageUrls, idx)"
          />
        </view>

        <!-- 回复列表 -->
        <view v-if="item.replies?.length" class="replies-section">
          <view
            v-for="reply in item.replies"
            :key="reply.id"
            class="reply-item"
            :class="{ 'reply-indent': !!reply.replyToId }"
          >
            <view class="reply-user-row">
              <image
                :src="reply.user?.avatarUrl || '/static/default-avatar.png'"
                class="reply-avatar"
                mode="aspectFill"
              />
              <view class="reply-main">
                <view class="reply-name-row">
                  <text class="reply-name">{{ reply.user?.nickname || '匿名用户' }}</text>
                  <text v-if="reply.user?.role === 'ADMIN'" class="admin-tag">管理员</text>
                </view>
                <text class="reply-content">
                  <text v-if="reply.replyTo?.user" class="at-user">@{{ reply.replyTo.user.nickname || '匿名用户' }} </text>
                  {{ reply.content }}
                </text>
                <!-- 回复中的图片 -->
                <view v-if="reply.imageUrls?.length" class="reply-images">
                  <image
                    v-for="(url, rIdx) in reply.imageUrls"
                    :key="rIdx"
                    :src="url"
                    class="reply-image"
                    mode="aspectFill"
                    @tap="previewImage(reply.imageUrls, rIdx)"
                  />
                </view>
                <text class="reply-time">{{ formatTime(reply.createdAt) }}</text>
              </view>
            </view>
            <view class="reply-action" @tap="openReplyInput(item, reply)">
              <text class="reply-action-text">回复</text>
            </view>
          </view>
        </view>

        <!-- 底部操作栏 -->
        <view class="card-actions">
          <view class="action-btn" @tap="openReplyInput(item)">
            <text class="action-text">回复</text>
          </view>
          <view v-if="isMine(item)" class="action-btn" @tap="handleDelete(item)">
            <text class="action-text delete-action">删除</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-if="!loading && feedbacks.length === 0" class="empty-state">
      <text class="empty-icon">📝</text>
      <text class="empty-text">还没有反馈，快来提一条吧！</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 没有更多 -->
    <view v-if="!loading && feedbacks.length > 0 && noMore" class="no-more">
      <text class="no-more-text">没有更多了</text>
    </view>

    <!-- 底部回复输入框 -->
    <view v-if="showReplyInput" class="reply-input-mask" @tap="closeReplyInput">
      <view class="reply-input-bar" @tap.stop>
        <!-- 已选图片预览 -->
        <view v-if="replyImages.length" class="reply-thumb-list">
          <view v-for="(img, idx) in replyImages" :key="idx" class="reply-thumb-item">
            <image :src="img.url" mode="aspectFill" class="reply-thumb" />
            <view class="reply-thumb-remove" @tap="removeReplyImage(idx)">
              <text class="reply-thumb-remove-text">×</text>
            </view>
          </view>
        </view>
        <view class="reply-input-row">
          <view class="reply-image-btn" @tap="chooseReplyImage">
            <text class="reply-image-icon">🖼</text>
          </view>
          <input
            class="reply-input"
            :placeholder="replyPlaceholder"
            :value="replyContent"
            :focus="replyInputFocus"
            :adjust-position="true"
            confirm-type="send"
            @input="onReplyInput"
            @confirm="submitReply"
          />
          <view class="reply-send-btn" :class="{ active: canSendReply }" @tap="submitReply">
            <text class="send-text">发送</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import { getFeedbackList, deleteFeedback, createFeedbackReply, deleteFeedbackReply, uploadFeedbackImage } from '../../utils/api'

interface ReplyItem {
  id: string
  content: string
  imageUrls: string[]
  replyToId: string | null
  replyToUserId: string | null
  createdAt: string
  user: {
    nickname: string | null
    avatarUrl: string | null
    role?: string
  }
  replyTo?: {
    user: { nickname: string | null }
  }
}

interface FeedbackItem {
  id: string
  userId: string
  type: string
  content: string
  imageUrls: string[]
  imageKeys: string[]
  createdAt: string
  user: {
    nickname: string | null
    avatarUrl: string | null
  }
  replies: ReplyItem[]
}

interface ReplyImage {
  url: string
  key: string
}

const feedbacks = ref<FeedbackItem[]>([])
const loading = ref(false)
const noMore = ref(false)
const page = ref(1)
const pageSize = 10

// 回复输入框状态
const showReplyInput = ref(false)
const replyInputFocus = ref(false)
const replyContent = ref('')
const replyPlaceholder = ref('写回复...')
const currentFeedbackId = ref('')
const currentReplyToId = ref<string | null>(null)
const replyImages = ref<ReplyImage[]>([])

const canSendReply = computed(() => {
  return replyContent.value.trim().length > 0 || replyImages.value.length > 0
})

let currentUserId = ''

const loadUserInfo = () => {
  try {
    let user = uni.getStorageSync('user') || '{}'
    if (user === '{}' || user === '' || !user) {
      user = uni.getStorageSync('userInfo') || '{}'
    }
    let userData
    if (typeof user === 'string') {
      userData = JSON.parse(user)
    } else {
      userData = user
    }
    currentUserId = userData.id || userData.userId || userData.customerId || ''
  } catch (err) {
    console.error('[FeedbackList] Load user info failed:', err)
  }
}

const isMine = (item: FeedbackItem) => {
  return item.userId === currentUserId
}

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    BUG: '问题反馈',
    SUGGESTION: '功能建议',
    OTHER: '其他',
  }
  return map[type] || type
}

const getTypeClass = (type: string) => {
  const map: Record<string, string> = {
    BUG: 'type-bug',
    SUGGESTION: 'type-suggestion',
    OTHER: 'type-other',
  }
  return map[type] || ''
}

const formatTime = (dateStr: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

const loadFeedbacks = async (reset = false) => {
  if (loading.value) return
  if (!reset && noMore.value) return

  loading.value = true
  if (reset) {
    page.value = 1
    noMore.value = false
  }

  try {
    const result = await getFeedbackList({ page: page.value, pageSize })
    if (reset) {
      feedbacks.value = result.items
    } else {
      feedbacks.value.push(...result.items)
    }
    if (result.items.length < pageSize) {
      noMore.value = true
    }
    page.value++
  } catch (err) {
    console.error('[FeedbackList] Load failed:', err)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

const goToForm = () => {
  uni.navigateTo({ url: '/pages/feedback-form/index' })
}

const previewImage = (urls: string[], index: number) => {
  uni.previewImage({
    current: urls[index],
    urls,
  })
}

const handleDelete = (item: FeedbackItem) => {
  uni.showModal({
    title: '确认删除',
    content: '删除后不可恢复，确定要删除这条反馈吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await deleteFeedback(item.id)
          feedbacks.value = feedbacks.value.filter(f => f.id !== item.id)
          uni.showToast({ title: '已删除', icon: 'success' })
        } catch (err: any) {
          uni.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    },
  })
}

// 打开回复输入框
const openReplyInput = (feedback: FeedbackItem, reply?: ReplyItem) => {
  currentFeedbackId.value = feedback.id
  if (reply) {
    currentReplyToId.value = reply.id
    replyPlaceholder.value = `回复 @${reply.user?.nickname || '匿名用户'}`
  } else {
    currentReplyToId.value = null
    replyPlaceholder.value = '写回复...'
  }
  replyContent.value = ''
  replyImages.value = []
  showReplyInput.value = true
  setTimeout(() => {
    replyInputFocus.value = true
  }, 100)
}

const closeReplyInput = () => {
  showReplyInput.value = false
  replyInputFocus.value = false
  replyContent.value = ''
  replyImages.value = []
}

const onReplyInput = (e: any) => {
  replyContent.value = e.detail.value
}

// 选择回复图片
const chooseReplyImage = () => {
  const remaining = 3 - replyImages.value.length
  if (remaining <= 0) {
    uni.showToast({ title: '最多上传3张图片', icon: 'none' })
    return
  }

  uni.chooseImage({
    count: remaining,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res: any) => {
      for (const tempPath of res.tempFilePaths) {
        if (replyImages.value.length >= 3) break
        try {
          uni.showLoading({ title: '上传中...' })
          const result = await uploadFeedbackImage(tempPath)
          replyImages.value.push({ url: result.url, key: result.key })
        } catch (err: any) {
          console.error('[FeedbackReply] Upload image failed:', err)
          uni.showToast({ title: '图片上传失败', icon: 'none' })
        } finally {
          uni.hideLoading()
        }
      }
    },
  })
}

const removeReplyImage = (index: number) => {
  replyImages.value.splice(index, 1)
}

// 提交回复
const submitReply = async () => {
  const content = replyContent.value.trim()
  if (!content && replyImages.value.length === 0) return

  try {
    const data: { content: string; replyToId?: string; imageUrls?: string[]; imageKeys?: string[] } = {
      content: content || '',
    }
    if (currentReplyToId.value) {
      data.replyToId = currentReplyToId.value
    }
    if (replyImages.value.length > 0) {
      data.imageUrls = replyImages.value.map(img => img.url)
      data.imageKeys = replyImages.value.map(img => img.key)
    }

    const newReply = await createFeedbackReply(currentFeedbackId.value, data)

    // 更新本地数据
    const feedback = feedbacks.value.find(f => f.id === currentFeedbackId.value)
    if (feedback) {
      if (!feedback.replies) {
        feedback.replies = []
      }
      feedback.replies.push(newReply)
    }

    closeReplyInput()
    uni.showToast({ title: '回复成功', icon: 'success' })
  } catch (err: any) {
    uni.showToast({ title: err.message || '回复失败', icon: 'none' })
  }
}

onMounted(() => {
  loadUserInfo()
  loadFeedbacks(true)
})

onShow(() => {
  loadFeedbacks(true)
})

onPullDownRefresh(() => {
  loadFeedbacks(true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

onReachBottom(() => {
  loadFeedbacks()
})
</script>

<style scoped>
.feedback-list {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}

/* 浮动按钮 */
.fab-btn {
  position: fixed;
  right: 30rpx;
  bottom: 60rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: #1890ff;
  color: white;
  padding: 20rpx 32rpx;
  border-radius: 44rpx;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
  z-index: 100;
}

.fab-text {
  font-size: 28rpx;
  font-weight: 600;
}

/* 列表内容 */
.list-content {
  padding: 20rpx 24rpx;
}

/* 反馈卡片 */
.feedback-card {
  background: white;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.user-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #f0f0f0;
}

.user-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.user-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
}

.feedback-time {
  font-size: 22rpx;
  color: #999;
}

.type-tag {
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-weight: 500;
}

.type-bug {
  background: #fff1f0;
  color: #f5222d;
}

.type-suggestion {
  background: #e6f7ff;
  color: #1890ff;
}

.type-other {
  background: #f9f0ff;
  color: #722ed1;
}

.card-content {
  margin-bottom: 16rpx;
}

.content-text {
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
  word-break: break-all;
}

.card-images {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
}

.feedback-image {
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
}

/* 回复区域 */
.replies-section {
  background: #f7f8fa;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  margin-top: 16rpx;
}

.reply-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 12rpx 0;
}

.reply-item + .reply-item {
  border-top: 1rpx solid #eee;
}

.reply-indent {
  padding-left: 40rpx;
}

.reply-user-row {
  display: flex;
  flex: 1;
  gap: 12rpx;
}

.reply-avatar {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: #f0f0f0;
  flex-shrink: 0;
}

.reply-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.reply-name-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.reply-name {
  font-size: 24rpx;
  font-weight: 500;
  color: #333;
}

.admin-tag {
  font-size: 18rpx;
  background: #1890ff;
  color: white;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
}

.reply-content {
  font-size: 26rpx;
  color: #333;
  line-height: 1.5;
  word-break: break-all;
}

.at-user {
  color: #1890ff;
  font-weight: 500;
}

/* 回复中的图片 */
.reply-images {
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.reply-image {
  width: 120rpx;
  height: 120rpx;
  border-radius: 8rpx;
}

.reply-time {
  font-size: 20rpx;
  color: #bbb;
}

.reply-action {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
}

.reply-action-text {
  font-size: 22rpx;
  color: #999;
}

/* 底部操作栏 */
.card-actions {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-top: 16rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}

.action-btn {
  padding: 8rpx 16rpx;
}

.action-text {
  font-size: 24rpx;
  color: #666;
}

.delete-action {
  color: #999;
}

/* 底部回复输入框 */
.reply-input-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 200;
  display: flex;
  align-items: flex-end;
}

.reply-input-bar {
  width: 100%;
  background: white;
  border-top: 1rpx solid #eee;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}

.reply-thumb-list {
  display: flex;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.reply-thumb-item {
  position: relative;
  width: 100rpx;
  height: 100rpx;
}

.reply-thumb {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.reply-thumb-remove {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 32rpx;
  height: 32rpx;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reply-thumb-remove-text {
  color: white;
  font-size: 24rpx;
  line-height: 1;
}

.reply-input-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.reply-image-btn {
  flex-shrink: 0;
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reply-image-icon {
  font-size: 44rpx;
}

.reply-input {
  flex: 1;
  height: 72rpx;
  background: #f5f5f5;
  border-radius: 36rpx;
  padding: 0 28rpx;
  font-size: 28rpx;
}

.reply-send-btn {
  flex-shrink: 0;
  background: #ddd;
  border-radius: 36rpx;
  padding: 12rpx 28rpx;
  transition: background 0.2s;
}

.reply-send-btn.active {
  background: #1890ff;
}

.send-text {
  font-size: 26rpx;
  color: white;
  font-weight: 500;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 200rpx;
  gap: 20rpx;
}

.empty-icon {
  font-size: 80rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
}

/* 加载状态 */
.loading-state {
  padding: 30rpx;
  text-align: center;
}

.loading-text {
  font-size: 26rpx;
  color: #999;
}

.no-more {
  padding: 30rpx;
  text-align: center;
}

.no-more-text {
  font-size: 24rpx;
  color: #ccc;
}
</style>
