<template>
  <view class="breed-risk-section">
    <view class="breed-risk-section__header">
      <view>
        <text class="breed-risk-section__title">本品种健康关注项</text>
        <text v-if="breedName" class="breed-risk-section__subtitle">{{
          breedName
        }}</text>
      </view>
      <text v-if="risks.length > 0" class="breed-risk-section__count"
        >{{ risks.length }} 项</text
      >
    </view>

    <view v-if="loading" class="breed-risk-section__state">
      <text class="breed-risk-section__state-title">正在加载品种资料</text>
      <text class="breed-risk-section__state-desc"
        >正在获取本品种常见健康关注项。</text
      >
    </view>

    <view
      v-else-if="error"
      class="breed-risk-section__state breed-risk-section__state--error"
    >
      <text class="breed-risk-section__state-title">加载失败</text>
      <text class="breed-risk-section__state-desc">{{ error }}</text>
      <text class="breed-risk-section__retry" @tap="emit('retry')">重试</text>
    </view>

    <view v-else-if="risks.length === 0" class="breed-risk-section__state">
      <text class="breed-risk-section__state-title">暂无品种专属资料</text>
      <text class="breed-risk-section__state-desc">{{ emptyText }}</text>
    </view>

    <view v-else class="breed-risk-list">
      <view
        v-for="risk in risks"
        :key="risk.id || risk.conditionId || risk.conditionName"
        class="breed-risk-card"
      >
        <view class="breed-risk-card__summary" @tap="toggleRisk(risk)">
          <view class="breed-risk-card__summary-main">
            <view class="breed-risk-card__meta">
              <text
                :class="['breed-risk-card__label', attentionLabelClass(risk)]"
                >{{ risk.attentionLabel }}</text
              >
              <text class="breed-risk-card__sources"
                >{{ risk.sourceCount }} 个来源</text
              >
            </view>
            <text class="breed-risk-card__name">{{ risk.conditionName }}</text>
            <text
              v-if="risk.oneLineSummary"
              class="breed-risk-card__summary-text"
            >
              {{ risk.oneLineSummary }}
            </text>
          </view>
          <text class="breed-risk-card__toggle">
            {{ isRiskExpanded(risk) ? '收起' : '详情' }}
          </text>
        </view>

        <view v-if="isRiskExpanded(risk)" class="breed-risk-card__detail">
          <view v-if="risk.breedSpecificReason" class="breed-risk-detail">
            <text class="breed-risk-detail__label">为什么需要关注</text>
            <text class="breed-risk-detail__text">{{
              risk.breedSpecificReason
            }}</text>
          </view>

          <view v-if="risk.commonSigns.length > 0" class="breed-risk-detail">
            <text class="breed-risk-detail__label">常见表现</text>
            <view class="breed-risk-signs">
              <text
                v-for="sign in risk.commonSigns"
                :key="sign"
                class="breed-risk-signs__item"
              >
                {{ sign }}
              </text>
            </view>
          </view>

          <view v-if="risk.screeningAdvice" class="breed-risk-detail">
            <text class="breed-risk-detail__label">筛查建议</text>
            <text class="breed-risk-detail__text">{{
              risk.screeningAdvice
            }}</text>
          </view>

          <view v-if="risk.careAdvice" class="breed-risk-detail">
            <text class="breed-risk-detail__label">日常照护建议</text>
            <text class="breed-risk-detail__text">{{ risk.careAdvice }}</text>
          </view>

          <view class="breed-risk-sources">
            <view
              v-if="risk.sources.length > 0"
              class="breed-risk-sources__summary"
              @tap="toggleSource(risk)"
            >
              <view>
                <text class="breed-risk-sources__title">资料来源</text>
                <text class="breed-risk-sources__desc">
                  {{ risk.sourceCount }} 个公开来源，展开后查看机构和链接。
                </text>
              </view>
              <text class="breed-risk-sources__toggle">
                {{ isSourceExpanded(risk) ? '收起资料来源' : '查看资料来源' }}
              </text>
            </view>

            <view v-if="isSourceExpanded(risk)" class="breed-risk-source-list">
              <view
                v-for="source in risk.sources"
                :key="`${risk.id || risk.conditionId}-${source.sourceName}-${source.title}`"
                class="breed-risk-source"
              >
                <text class="breed-risk-source__name">{{
                  source.sourceName
                }}</text>
                <text class="breed-risk-source__title">{{ source.title }}</text>
                <text class="breed-risk-source__meta">
                  {{ source.publisher || source.sourceTypeLabel }}
                </text>
                <text
                  v-if="source.publisher && source.sourceTypeLabel"
                  class="breed-risk-source__meta"
                >
                  {{ source.sourceTypeLabel }}
                </text>
                <text v-if="source.url" class="breed-risk-source__url">
                  {{ source.url }}
                </text>
                <text v-if="source.accessedAt" class="breed-risk-source__date">
                  访问日期：{{ source.accessedAt }}
                </text>
              </view>
            </view>
            <text
              v-if="risk.sources.length === 0"
              class="breed-risk-sources__empty"
            >
              暂无可展示来源信息。
            </text>
          </view>
        </view>
      </view>
    </view>

    <text class="breed-risk-section__note">
      本页面为品种资料科普，不替代兽医诊断。如有症状，请及时咨询兽医。
    </text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { BreedHealthRiskItem } from '../../utils/breed-health-risks'

defineProps<{
  breedName?: string
  risks: BreedHealthRiskItem[]
  loading: boolean
  error: string
  emptyText: string
}>()

const emit = defineEmits<{
  (event: 'retry'): void
}>()

const expandedRiskIds = ref<string[]>([])
const expandedSourceIds = ref<string[]>([])

function riskKey(risk: BreedHealthRiskItem) {
  return risk.id || risk.conditionId || risk.conditionName
}

function isRiskExpanded(risk: BreedHealthRiskItem) {
  return expandedRiskIds.value.includes(riskKey(risk))
}

function toggleRisk(risk: BreedHealthRiskItem) {
  const key = riskKey(risk)
  if (!key) {
    return
  }

  expandedRiskIds.value = isRiskExpanded(risk)
    ? expandedRiskIds.value.filter((item) => item !== key)
    : [...expandedRiskIds.value, key]
}

function isSourceExpanded(risk: BreedHealthRiskItem) {
  return expandedSourceIds.value.includes(riskKey(risk))
}

function toggleSource(risk: BreedHealthRiskItem) {
  const key = riskKey(risk)
  if (!key) {
    return
  }

  expandedSourceIds.value = isSourceExpanded(risk)
    ? expandedSourceIds.value.filter((item) => item !== key)
    : [...expandedSourceIds.value, key]
}

function attentionLabelClass(risk: BreedHealthRiskItem) {
  if (risk.attentionPriority === 'KEY_ATTENTION') {
    return 'breed-risk-card__label--key'
  }

  if (risk.attentionPriority === 'RECOMMENDED_AWARENESS') {
    return 'breed-risk-card__label--recommended'
  }

  return 'breed-risk-card__label--supplemental'
}
</script>

<style scoped>
.breed-risk-section {
  padding: 30rpx;
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 32rpx rgba(24, 40, 60, 0.08);
}

.breed-risk-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.breed-risk-section__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #17313f;
}

.breed-risk-section__subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b7d86;
}

.breed-risk-section__count {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #0d6b43;
  background: rgba(13, 107, 67, 0.1);
}

.breed-risk-section__state {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.breed-risk-section__state--error {
  background: #fff8f6;
  border-color: rgba(196, 80, 42, 0.16);
}

.breed-risk-section__state-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #17313f;
}

.breed-risk-section__state-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b7d86;
}

.breed-risk-section__retry {
  display: inline-block;
  margin-top: 16rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #0d6b43;
}

.breed-risk-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 24rpx;
}

.breed-risk-card {
  border-radius: 24rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
  overflow: hidden;
}

.breed-risk-card__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
}

.breed-risk-card__summary-main {
  min-width: 0;
  flex: 1;
}

.breed-risk-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.breed-risk-card__label,
.breed-risk-card__sources {
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 700;
}

.breed-risk-card__label {
  border: 1rpx solid transparent;
}

.breed-risk-card__label--key {
  color: #a34018;
  background: #fff0e8;
  border-color: rgba(196, 85, 32, 0.18);
}

.breed-risk-card__label--recommended {
  color: #0c5c78;
  background: #e8f5fb;
  border-color: rgba(21, 113, 145, 0.16);
}

.breed-risk-card__label--supplemental {
  color: #526977;
  background: #eef4f2;
  border-color: rgba(82, 105, 119, 0.12);
}

.breed-risk-card__sources {
  color: #526977;
  background: rgba(82, 105, 119, 0.1);
}

.breed-risk-card__name {
  display: block;
  margin-top: 14rpx;
  font-size: 30rpx;
  font-weight: 800;
  line-height: 1.35;
  color: #17313f;
}

.breed-risk-card__summary-text {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #526977;
}

.breed-risk-card__toggle {
  flex-shrink: 0;
  padding-top: 4rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #0d6b43;
}

.breed-risk-card__detail {
  padding: 0 24rpx 24rpx;
}

.breed-risk-detail + .breed-risk-detail,
.breed-risk-detail + .breed-risk-sources {
  margin-top: 22rpx;
}

.breed-risk-detail__label,
.breed-risk-sources__title {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  color: #415b65;
}

.breed-risk-detail__text {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: #526977;
}

.breed-risk-signs {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 10rpx;
}

.breed-risk-signs__item {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #415b65;
  background: #fff;
  border: 1rpx solid rgba(20, 47, 58, 0.08);
}

.breed-risk-sources {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(20, 47, 58, 0.08);
}

.breed-risk-sources__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.breed-risk-sources__desc {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #7b8d96;
}

.breed-risk-sources__toggle {
  flex-shrink: 0;
  padding-top: 2rpx;
  font-size: 23rpx;
  font-weight: 700;
  color: #0d6b43;
}

.breed-risk-source-list {
  margin-top: 14rpx;
}

.breed-risk-source {
  margin-top: 14rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  background: #fff;
}

.breed-risk-source__name,
.breed-risk-source__title,
.breed-risk-source__meta,
.breed-risk-source__url,
.breed-risk-source__date {
  display: block;
}

.breed-risk-source__name {
  font-size: 24rpx;
  font-weight: 700;
  color: #17313f;
}

.breed-risk-source__title {
  margin-top: 6rpx;
  font-size: 23rpx;
  line-height: 1.5;
  color: #415b65;
}

.breed-risk-source__meta,
.breed-risk-source__url,
.breed-risk-source__date,
.breed-risk-sources__empty {
  margin-top: 4rpx;
  font-size: 21rpx;
  line-height: 1.5;
  color: #7b8d96;
}

.breed-risk-source__url {
  word-break: break-all;
}

.breed-risk-sources__empty {
  display: block;
  margin-top: 12rpx;
}

.breed-risk-section__note {
  display: block;
  margin-top: 22rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid rgba(20, 47, 58, 0.08);
  font-size: 22rpx;
  line-height: 1.6;
  color: #7b8d96;
}
</style>
