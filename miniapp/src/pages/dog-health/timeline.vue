<template>
  <view class="page">
    <view class="hero">
      <text class="hero__eyebrow">健康时间线</text>
      <text class="hero__title">{{ dogName || '健康记录' }}</text>
      <text class="hero__subtitle">
        {{ total > 0 ? `共 ${total} 条记录，从新到旧` : '还没有记录' }}
      </text>
      <view class="hero__actions">
        <text class="hero__action" @tap="openVisitSummary">就诊前摘要 ›</text>
      </view>
    </view>

    <view v-if="loadError" class="state">
      <text class="state__title">加载失败</text>
      <text class="state__desc">{{ loadError }}</text>
      <button class="state__button" @tap="load">重试</button>
    </view>

    <view v-else-if="isLoading" class="state">
      <text class="state__title">正在整理健康记录</text>
      <text class="state__desc">把五类记录按时间排成一条线，请稍候。</text>
    </view>

    <view v-else-if="events.length === 0" class="state">
      <text class="state__title">还没有健康记录</text>
      <text class="state__desc">
        在健康管理里记下看病、体检、疫苗和体重，这里会自动排成一条时间线。
      </text>
      <button class="state__button" @tap="goHealth">去记录</button>
    </view>

    <view v-else class="timeline">
      <view
        v-for="(event, index) in events"
        :key="`${event.type}-${event.id}-${index}`"
        class="timeline__row"
      >
        <!-- 左侧时间轴：日期 + 圆点 + 竖线 -->
        <view class="timeline__rail">
          <text class="timeline__date">{{ formatMonthDay(event.date) }}</text>
          <text class="timeline__year">{{ formatYear(event.date) }}</text>
          <view class="timeline__dot" :class="`timeline__dot--${event.type}`" />
          <view v-if="index < events.length - 1" class="timeline__line" />
        </view>

        <view class="timeline__card health-card">
          <view class="timeline__head">
            <text class="timeline__badge" :class="`timeline__badge--${event.type}`">
              {{ TYPE_LABELS[event.type] }}
            </text>
            <text v-if="event.flag" class="timeline__flag" :class="`timeline__flag--${event.flag}`">
              {{ event.flag === 'overdue' ? '已逾期' : '即将到期' }}
            </text>
          </view>
          <text class="timeline__title">{{ event.title }}</text>
          <text v-if="event.detail" class="timeline__detail">{{ event.detail }}</text>
        </view>
      </view>
    </view>

    <view v-if="!isLoading && events.length > 0" class="footer-note">
      <text class="footer-note__text">
        时间线只汇总你自己记录的内容，不构成诊断。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dogApi } from '../../api/dogs'

/**
 * 健康时间线（2026-10-01，第二期 · 老板需求 7）。
 *
 * 老板明确：时间线**放在健康管理页内**，不新开板块标签 ——
 * 所以它是从健康管理页顶部的一个入口进来的独立页面，而不是第六个书签。
 *
 * 数据由后端一次聚合（/dogs/:dogId/health/timeline），前端不拼记录。
 */
type HealthEventType = 'visit' | 'checkup' | 'allergy' | 'vaccine' | 'weight' | 'diet'

interface HealthEvent {
  id: string
  type: HealthEventType
  date: string
  title: string
  detail: string
  flag?: 'overdue' | 'due-soon'
}

const TYPE_LABELS: Record<HealthEventType, string> = {
  visit: '就诊',
  checkup: '体检',
  allergy: '过敏',
  vaccine: '疫苗',
  weight: '体重',
  diet: '饮食',
}

const dogId = ref('')
const dogName = ref('')
const total = ref(0)
const events = ref<HealthEvent[]>([])
const isLoading = ref(false)
const loadError = ref('')

const pageTitle = computed(() => (dogName.value ? `${dogName.value} · 健康时间线` : '健康时间线'))

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  dogId.value = typeof value === 'string' ? value : ''
  uni.setNavigationBarTitle({ title: pageTitle.value })
  void load()
})

async function load() {
  if (!dogId.value) {
    loadError.value = '缺少狗狗信息，请从健康管理页进入。'
    return
  }

  isLoading.value = true
  loadError.value = ''

  try {
    const res: any = await dogApi.healthTimeline(dogId.value)
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '加载健康时间线失败')
    }

    dogName.value = String(res.data.dogName || '')
    total.value = Number(res.data.total || 0)
    events.value = Array.isArray(res.data.events) ? res.data.events : []
    uni.setNavigationBarTitle({ title: pageTitle.value })
  } catch (error: any) {
    loadError.value = error?.message || '加载健康时间线失败'
    events.value = []
    total.value = 0
  } finally {
    isLoading.value = false
  }
}

function openVisitSummary() {
  if (!dogId.value) {
    return
  }
  uni.navigateTo({
    url: `/pages/dog-health/summary?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

function goHealth() {
  uni.redirectTo({
    url: `/pages/dog-profile-health/index?dogId=${encodeURIComponent(dogId.value)}`,
  })
}

/** 时间轴上日期分行显示：上面月-日，下面年份，窄屏也不挤 */
function formatMonthDay(date: string) {
  const parts = String(date || '').split('-')
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : date
}

function formatYear(date: string) {
  const parts = String(date || '').split('-')
  return parts.length === 3 ? parts[0] : ''
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #f0f3e9 0%, #f2f4ea 100%);
}

.hero {
  padding: 32rpx;
  border-radius: 28rpx;
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  box-shadow: 0 18rpx 36rpx rgba(27, 92, 64, 0.18);
}

.hero__eyebrow {
  display: block;
  font-size: 22rpx;
  letter-spacing: 0.12em;
  color: #d8bc85;
}

.hero__title {
  display: block;
  margin-top: 14rpx;
  font-size: 40rpx;
  font-weight: 800;
}

.hero__subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(243, 237, 221, 0.72);
}

.hero__actions {
  margin-top: 20rpx;
}

.hero__action {
  display: inline-block;
  padding: 14rpx 24rpx;
  font-size: 26rpx;
  color: #1e3a2f;
  background: #d8bc85;
  border-radius: 999rpx;
}

.state {
  margin-top: 24rpx;
  padding: 48rpx 32rpx;
  text-align: center;
  background: #fbfcf7;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 32rpx rgba(30, 46, 36, 0.06);
}

.state__title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
}

.state__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.state__button {
  margin-top: 28rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border-radius: 20rpx;
}

.state__button::after {
  border: none;
}

.timeline {
  margin-top: 24rpx;
}

.timeline__row {
  display: flex;
  gap: 20rpx;
}

/* 左侧时间轴 */
.timeline__rail {
  position: relative;
  width: 96rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 6rpx;
}

.timeline__date {
  font-size: 26rpx;
  font-weight: 700;
  color: #1e3a2f;
  line-height: 1.2;
}

.timeline__year {
  font-size: 20rpx;
  color: #8a968a;
  line-height: 1.4;
}

.timeline__dot {
  width: 18rpx;
  height: 18rpx;
  margin-top: 10rpx;
  border-radius: 50%;
  background: #1e3a2f;
}

/* 类型颜色与板块色系一致 */
.timeline__dot--visit { background: #0f7b49; }
.timeline__dot--checkup { background: #216d9b; }
.timeline__dot--allergy { background: #ad5b2a; }
.timeline__dot--vaccine { background: #6b5b9b; }
.timeline__dot--weight { background: #0e6f78; }
.timeline__dot--diet { background: #b07a1e; }

.timeline__line {
  flex: 1;
  width: 2rpx;
  margin-top: 6rpx;
  background: #dfe5d6;
}

.timeline__card {
  flex: 1;
  min-width: 0;
  margin-bottom: 24rpx;
}

.timeline__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.timeline__badge {
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: #ffffff;
  background: #4a5a4a;
}

.timeline__badge--visit { background: #0f7b49; }
.timeline__badge--checkup { background: #216d9b; }
.timeline__badge--allergy { background: #ad5b2a; }
.timeline__badge--vaccine { background: #6b5b9b; }
.timeline__badge--weight { background: #0e6f78; }
.timeline__badge--diet { background: #b07a1e; }

.timeline__flag {
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
}

.timeline__flag--overdue {
  color: #ffffff;
  background: #c0392b;
}

.timeline__flag--due-soon {
  color: #8a6f3d;
  background: #f6efe0;
}

.timeline__title {
  display: block;
  margin-top: 12rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
  line-height: 1.4;
}

.timeline__detail {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.footer-note {
  margin-top: 16rpx;
  padding: 0 8rpx;
}

.footer-note__text {
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a968a;
}
</style>
