<template>
  <view class="recipe-designer-publish-page">
    <view class="section">
      <view class="status-line">
        <text class="status-label">评估结果</text>
        <text class="status-badge" :class="getAssessmentStatusClass(overallStatus)">
          {{ getOverallStatusLabel(overallStatus) }}
        </text>
      </view>

      <view class="summary-grid">
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.compliant }}</text>
          <text class="summary-label">达标</text>
        </view>
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.deficient }}</text>
          <text class="summary-label">缺口</text>
        </view>
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.excess }}</text>
          <text class="summary-label">超标</text>
        </view>
        <view class="summary-item">
          <text class="summary-value">{{ summaryCounts.missingData }}</text>
          <text class="summary-label">缺数据</text>
        </view>
      </view>
    </view>

    <view v-if="requiresReviewNote" class="section">
      <text class="field-label">审核说明</text>
      <textarea
        class="review-textarea"
        v-model="reviewNote"
        maxlength="500"
        placeholder="填写风险说明、调整依据或放行原因"
      />
    </view>

    <view class="footer-actions">
      <button class="secondary-btn" @tap="goBack">返回编辑</button>
      <button class="primary-btn" :disabled="publishing" @tap="submitPublish">
        {{ publishing ? '发布中' : '确认发布' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { recipeDesignerApi } from '../../api/recipe-designer'
import {
  getAssessmentStatusClass,
  getOverallStatusLabel,
  normalizeAssessmentSummary,
} from './assessment'

const draftId = ref('')
const assessment = ref<any>(null)
const reviewNote = ref('')
const publishing = ref(false)

const overallStatus = computed(() => {
  return assessment.value?.overallStatus || assessment.value?.status
})

const requiresReviewNote = computed(() => {
  return overallStatus.value !== 'COMPLIANT'
})

const summaryCounts = computed(() => {
  return normalizeAssessmentSummary(assessment.value?.summary)
})

onLoad((options: any) => {
  draftId.value = options?.id || ''
  if (!draftId.value) {
    uni.showToast({ title: '缺少草稿ID', icon: 'none' })
    return
  }
  loadAssessment()
})

async function loadAssessment() {
  try {
    const res: any = await recipeDesignerApi.assessDraft(draftId.value)
    assessment.value = res?.data ?? res
  } catch (error) {
    console.error('[RecipeDesignerPublish] Failed to assess draft:', error)
    uni.showToast({ title: '评估失败', icon: 'none' })
  }
}

async function submitPublish() {
  if (publishing.value) return
  if (requiresReviewNote.value && !reviewNote.value.trim()) {
    uni.showToast({ title: '需审核配方必须填写审核说明', icon: 'none' })
    return
  }

  publishing.value = true
  try {
    if (requiresReviewNote.value) {
      await recipeDesignerApi.publishDraft(draftId.value, { reviewNote: reviewNote.value.trim() })
    } else {
      await recipeDesignerApi.publishDraft(draftId.value)
    }
    uni.showToast({ title: '已发布', icon: 'success' })
    setTimeout(() => {
      uni.redirectTo({ url: '/pages/recipe-designer/list' })
    }, 600)
  } catch (error) {
    console.error('[RecipeDesignerPublish] Failed to publish draft:', error)
    uni.showToast({ title: '发布失败', icon: 'none' })
  } finally {
    publishing.value = false
  }
}

function goBack() {
  uni.navigateBack()
}
</script>

<style scoped lang="scss">
.recipe-designer-publish-page {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24rpx 32rpx 160rpx;
}

.section {
  background: #fff;
  border-radius: 12rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.status-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.status-label,
.field-label {
  font-size: 28rpx;
  font-weight: 700;
  color: #222;
}

.status-badge {
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
  margin-top: 24rpx;
}

.summary-item {
  padding: 16rpx 8rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
  text-align: center;
}

.summary-value {
  display: block;
  color: #222;
  font-size: 30rpx;
  font-weight: 700;
}

.summary-label {
  display: block;
  margin-top: 6rpx;
  color: #777;
  font-size: 22rpx;
}

.review-textarea {
  width: 100%;
  min-height: 220rpx;
  margin-top: 20rpx;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 10rpx;
  background: #f7f8fa;
  color: #222;
  font-size: 26rpx;
}

.footer-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 16rpx;
  padding: 20rpx 32rpx 36rpx;
  background: #fff;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.08);
}

.primary-btn,
.secondary-btn {
  flex: 1;
  height: 76rpx;
  border-radius: 10rpx;
  font-size: 28rpx;
  line-height: 76rpx;
}

.primary-btn {
  background: #1890ff;
  color: #fff;
}

.secondary-btn {
  background: #f0f6ff;
  color: #1677ff;
}

.status-compliant {
  background: #f6ffed;
  color: #389e0d;
}

.status-deficient {
  background: #fff7e6;
  color: #d46b08;
}

.status-excess {
  background: #fff1f0;
  color: #cf1322;
}

.status-missing,
.status-pending {
  background: #f5f5f5;
  color: #777;
}
</style>
