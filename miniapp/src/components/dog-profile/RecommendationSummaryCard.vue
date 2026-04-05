<template>
  <view class="summary-card">
    <view class="summary-card__header">
      <view class="summary-card__copy">
        <text class="summary-card__title">{{ title }}</text>
        <text class="summary-card__subtitle">{{ subtitle }}</text>
      </view>
      <view v-if="badgeTexts.length > 0" class="summary-card__badges">
        <text
          v-for="badge in badgeTexts"
          :key="badge"
          class="summary-card__badge"
        >
          {{ badge }}
        </text>
      </view>
    </view>

    <view v-if="metricItems.length > 0" class="summary-card__grid">
      <view
        v-for="metric in metricItems"
        :key="metric.label"
        class="summary-card__metric"
      >
        <text class="summary-card__metric-label">{{ metric.label }}</text>
        <text class="summary-card__metric-value">{{ metric.value }}</text>
        <text v-if="metric.hint" class="summary-card__metric-hint">{{ metric.hint }}</text>
      </view>
    </view>

    <view v-else class="summary-card__empty">
      <text class="summary-card__empty-title">{{ emptyTitle }}</text>
      <text class="summary-card__empty-desc">{{ emptyDescription }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface MetricItem {
  label: string
  value: string
  hint?: string
}

const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  badges?: string[]
  metrics?: MetricItem[]
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  title: '喂食建议',
  subtitle: '根据当前档案生成的推荐结果',
  badges: () => [],
  metrics: () => [],
  emptyTitle: '还没有可用的喂食建议',
  emptyDescription: '先完善喂食信息，再返回这里查看推荐结果。',
})

const badgeTexts = computed(() => props.badges || [])
const metricItems = computed(() => props.metrics || [])
</script>

<style scoped>
.summary-card {
  background: linear-gradient(180deg, #f6fbf8 0%, #ffffff 42%);
  border: 1rpx solid rgba(7, 193, 96, 0.14);
  border-radius: 32rpx;
  padding: 30rpx;
  box-shadow: 0 12rpx 34rpx rgba(24, 40, 60, 0.08);
}

.summary-card__header {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
}

.summary-card__copy {
  flex: 1;
  min-width: 0;
}

.summary-card__title {
  display: block;
  font-size: 34rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #17313f;
}

.summary-card__subtitle {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #68808a;
}

.summary-card__badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12rpx;
}

.summary-card__badge {
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
}

.summary-card__grid {
  margin-top: 26rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 18rpx;
}

.summary-card__metric {
  width: calc(50% - 9rpx);
  padding: 22rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.92);
  border: 1rpx solid rgba(26, 26, 26, 0.06);
}

.summary-card__metric-label {
  display: block;
  font-size: 22rpx;
  color: #75848f;
}

.summary-card__metric-value {
  display: block;
  margin-top: 10rpx;
  font-size: 30rpx;
  line-height: 1.2;
  font-weight: 700;
  color: #19333f;
}

.summary-card__metric-hint {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  color: #7b8f97;
}

.summary-card__empty {
  margin-top: 26rpx;
  padding: 30rpx 24rpx;
  border-radius: 24rpx;
  background: rgba(7, 193, 96, 0.06);
}

.summary-card__empty-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #17313f;
}

.summary-card__empty-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #627780;
}
</style>
