<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>

    <view v-else-if="errorText" class="state">
      <text class="state-text">{{ errorText }}</text>
      <text class="state-retry" @tap="load">重新加载</text>
    </view>

    <block v-else-if="overview">
      <!-- 只读横幅：员工不能改顾客档案 -->
      <view class="readonly-bar">
        <text class="readonly-text">员工只读视图 · 不能修改顾客的狗狗档案</text>
      </view>

      <!-- 基本信息 -->
      <view class="hero">
        <view class="hero-top">
          <text class="hero-name">{{ dog.name || '未命名' }}</text>
          <text v-if="dog.breedName" class="hero-breed">{{ dog.breedName }}</text>
        </view>
        <view class="hero-facts">
          <text class="fact">{{ dog.gender || '—' }}</text>
          <text class="fact">{{ dog.isNeutered ? '已绝育' : '未绝育' }}</text>
          <text class="fact">{{ dog.ageText || '—' }}</text>
          <text class="fact">{{ formatNumber(dog.currentWeightKg) }}kg</text>
          <text class="fact">BCS {{ formatNumber(dog.bcsScore) }}</text>
          <!-- 每日餐数 / 活动量：算口粮的口径，员工在这里就该看得到（2026-10-30 补） -->
          <text v-if="dog.mealsPerDay" class="fact">每天 {{ dog.mealsPerDay }} 餐</text>
          <text v-if="dog.activityLevelLabel" class="fact">{{ dog.activityLevelLabel }}</text>
        </view>
      </view>

      <!-- 过敏 -->
      <view class="card">
        <text class="card-title">过敏</text>
        <view v-if="allergies.length === 0" class="empty">没有登记过敏</view>
        <view v-for="(item, index) in allergies" :key="index" class="record">
          <view class="record-head">
            <text class="record-title">{{ item.allergen || '未写明' }}</text>
            <text class="record-date">{{ item.date || '' }}</text>
          </view>
          <text v-if="item.notes" class="record-body">{{ item.notes }}</text>
        </view>
      </view>

      <!-- 最近就诊 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">最近就诊</text>
          <text class="card-note">共 {{ counts.visits || 0 }} 条</text>
        </view>
        <view v-if="recentVisits.length === 0" class="empty">没有就诊记录</view>
        <view v-for="(item, index) in recentVisits" :key="index" class="record">
          <view class="record-head">
            <text class="record-title">{{ item.diagnosis || '就诊' }}</text>
            <text class="record-date">{{ item.date || '' }}</text>
          </view>
          <text v-if="item.chiefComplaint" class="record-body">{{ item.chiefComplaint }}</text>
          <text v-if="item.treatment" class="record-body">医嘱：{{ item.treatment }}</text>
          <!-- 还没好的（治疗中/慢性）必须在记录上标出来：老板去掉了原来那块
               「进行中」卡片，这条信号不能跟着一起消失 -->
          <text v-if="isOngoingStatus(item.status)" class="record-tag">{{ item.status }}</text>
        </view>
      </view>

      <!-- 最近体检 -->
      <view class="card">
        <view class="card-head">
          <text class="card-title">最近体检</text>
          <text class="card-note">共 {{ counts.checkups || 0 }} 条</text>
        </view>
        <view v-if="recentCheckups.length === 0" class="empty">没有体检记录</view>
        <view v-for="(item, index) in recentCheckups" :key="index" class="record">
          <view class="record-head">
            <text class="record-title">{{ item.checkupType || '体检' }}</text>
            <text class="record-date">{{ item.date || '' }}</text>
          </view>
          <text v-if="item.findings" class="record-body">{{ item.findings }}</text>
        </view>
      </view>

      <!-- 吃这件事：老板 2026-10-30 明确不要在这一页展示（饮食偏好在详情/后台看） -->

      <view class="foot">
        <text class="foot-text">
          健康信息最近更新：{{ formatTime(overview.lastHealthUpdatedAt) }}
        </text>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

const dogId = ref('')
const loading = ref(true)
const errorText = ref('')
const overview = ref<any>(null)

const dog = computed(() => overview.value?.dog || {})
const counts = computed(() => overview.value?.counts || {})
const allergies = computed<any[]>(() =>
  Array.isArray(overview.value?.allergies) ? overview.value.allergies : [],
)
const recentVisits = computed<any[]>(() =>
  Array.isArray(overview.value?.recentVisits) ? overview.value.recentVisits : [],
)
const recentCheckups = computed<any[]>(() =>
  Array.isArray(overview.value?.recentCheckups)
    ? overview.value.recentCheckups
    : [],
)

/**
 * 只有"还没好"的结局才标红：治疗中 / 慢性 / 家长还没标结果。
 * 已康复的不标 —— 否则每条记录都挂个标签，等于没标。
 */
function isOngoingStatus(status?: string | null) {
  return ['治疗中', '慢性', '未标注结果'].includes(String(status || ''))
}

function formatNumber(value: any) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return '—'
  return Number.isInteger(num) ? String(num) : num.toFixed(1)
}

function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

async function load() {
  if (!dogId.value) {
    errorText.value = '缺少狗狗 id，无法查看档案'
    loading.value = false
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    const res = await request({
      url: `/admin/dogs/${encodeURIComponent(dogId.value)}/health-overview`,
      method: 'GET',
      /**
       * ⚠️ 一定要关掉 AI 分析（2026-10-30 修）。
       *
       * 这个接口默认会跑一遍大模型健康分析，**要十几秒到几十秒**，
       * 而请求超时是 15 秒 —— 线上就表现成"一直加载中"
       * （nginx 日志里是 499：客户端等不及先断了）。
       * 员工在这里只是想快速确认品种/体重/过敏/病史，不需要 AI。
       */
      data: { includeAnalysis: '0' },
    })
    if (res.code === 0 && res.data) {
      overview.value = res.data
    } else {
      errorText.value = res.message || '这只狗的档案读不到'
    }
  } catch (error: any) {
    errorText.value = error?.message || '网络异常，请稍后重试'
  } finally {
    loading.value = false
  }
}

onLoad((options: any) => {
  dogId.value = Array.isArray(options?.dogId)
    ? options.dogId[0]
    : options?.dogId || ''
  load()
})
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx 24rpx 40rpx; box-sizing: border-box; }

.state { padding: 140rpx 0; text-align: center; }
.state-text { display: block; color: #909399; font-size: 26rpx; }
.state-retry { display: inline-block; margin-top: 24rpx; padding: 12rpx 32rpx; border-radius: 30rpx; background: #1e3a2f; color: #fff; font-size: 26rpx; }

.readonly-bar { padding: 14rpx 20rpx; border-radius: 12rpx; background: #fdf6ec; margin-bottom: 16rpx; }
.readonly-text { color: #b88230; font-size: 22rpx; }

.hero { background: #1e3a2f; border-radius: 20rpx; padding: 26rpx; margin-bottom: 18rpx; }
.hero-top { display: flex; align-items: baseline; }
.hero-name { font-size: 38rpx; font-weight: 700; color: #fff; }
.hero-breed { margin-left: 16rpx; color: rgba(255, 255, 255, 0.7); font-size: 24rpx; }
.hero-facts { display: flex; flex-wrap: wrap; margin-top: 18rpx; }
.fact { margin-right: 12rpx; margin-bottom: 8rpx; padding: 6rpx 16rpx; border-radius: 8rpx; background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 22rpx; }

.card { background: #fff; border-radius: 18rpx; padding: 24rpx; margin-bottom: 18rpx; }
.card-head { display: flex; justify-content: space-between; align-items: baseline; }
.card-title { font-size: 27rpx; font-weight: 600; color: #1e3a2f; }
.card-note { color: #909399; font-size: 21rpx; }


.record { padding: 16rpx 0; border-top: 1rpx solid #f2f3f5; }
.record:first-of-type { border-top: none; }
.record-head { display: flex; justify-content: space-between; align-items: baseline; }
.record-title { flex: 1; font-size: 26rpx; color: #303133; }
.record-date { margin-left: 16rpx; color: #909399; font-size: 21rpx; }
.record-body { display: block; margin-top: 8rpx; color: #606266; font-size: 23rpx; line-height: 1.6; }
.record-tag { display: inline-block; margin-top: 10rpx; padding: 4rpx 12rpx; border-radius: 6rpx; background: #fdf6ec; color: #b88230; font-size: 20rpx; }


.empty { padding: 28rpx 0; color: #909399; font-size: 24rpx; }
.foot { padding: 16rpx 0 0; text-align: center; }
.foot-text { color: #b8bcc4; font-size: 21rpx; }
</style>
