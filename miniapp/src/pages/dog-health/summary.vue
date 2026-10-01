<template>
  <view class="page">
    <view class="hero">
      <text class="hero__eyebrow">就诊前摘要</text>
      <text class="hero__title">{{ dog.name || '健康摘要' }}</text>
      <text class="hero__subtitle">{{ dogLine }}</text>
    </view>

    <view v-if="loadError" class="state">
      <text class="state__title">加载失败</text>
      <text class="state__desc">{{ loadError }}</text>
      <button class="state__button" @tap="load">重试</button>
    </view>

    <view v-else-if="isLoading" class="state">
      <text class="state__title">正在整理摘要</text>
      <text class="state__desc">按医生问诊的顺序汇总，请稍候。</text>
    </view>

    <template v-else>
      <!-- ① 过敏：安全底线，永远排第一 -->
      <view class="block health-card">
        <text class="block__title">过敏</text>
        <view v-if="allergies.length === 0" class="block__empty">
          <text class="block__empty-text">没有已记录的过敏原</text>
        </view>
        <view v-else class="chips">
          <text v-for="item in allergies" :key="item.allergen" class="chip chip--danger">
            {{ item.allergen }}
          </text>
        </view>
      </view>

      <!-- ② 还没结束的病：医生最需要知道"现在在治什么" -->
      <view class="block health-card">
        <text class="block__title">还没结束的问题</text>
        <view v-if="ongoingConditions.length === 0" class="block__empty">
          <text class="block__empty-text">没有进行中的病史</text>
        </view>
        <view
          v-for="item in ongoingConditions"
          :key="item.id"
          class="row"
        >
          <view class="row__head">
            <text class="row__date">{{ item.date }}</text>
            <text class="row__tag">{{ item.status }}</text>
          </view>
          <text class="row__title">{{ item.diagnosis }}</text>
          <text v-if="item.treatment" class="row__detail">处理：{{ item.treatment }}</text>
          <text v-if="item.followUpDate" class="row__detail">复查日期：{{ item.followUpDate }}</text>
        </view>
      </view>

      <!-- ③ 最近就诊 -->
      <view class="block health-card">
        <text class="block__title">最近就诊</text>
        <view v-if="recentVisits.length === 0" class="block__empty">
          <text class="block__empty-text">没有就诊记录</text>
        </view>
        <view v-for="item in recentVisits" :key="item.id" class="row">
          <view class="row__head">
            <text class="row__date">{{ item.date }}</text>
            <text v-if="item.attachmentCount > 0" class="row__tag row__tag--soft">
              含 {{ item.attachmentCount }} 个附件
            </text>
          </view>
          <text class="row__title">{{ item.diagnosis }}</text>
          <text v-if="item.treatment" class="row__detail">处理：{{ item.treatment }}</text>
          <text v-if="item.veterinarian" class="row__detail">兽医：{{ item.veterinarian }}</text>
        </view>
      </view>

      <!-- ④ 最近体检 -->
      <view class="block health-card">
        <text class="block__title">最近体检</text>
        <view v-if="recentCheckups.length === 0" class="block__empty">
          <text class="block__empty-text">没有体检记录</text>
        </view>
        <view v-for="item in recentCheckups" :key="item.id" class="row">
          <view class="row__head">
            <text class="row__date">{{ item.date }}</text>
            <text class="row__tag row__tag--soft">{{ item.checkupType }}</text>
          </view>
          <text class="row__title">{{ item.findings || '未填写检查结论' }}</text>
          <text v-if="item.recommendations" class="row__detail">建议：{{ item.recommendations }}</text>
        </view>
      </view>

      <!-- ⑤ 疫苗 -->
      <view class="block health-card">
        <text class="block__title">疫苗</text>
        <view v-if="vaccines.upcoming.length > 0" class="notice" :class="{ 'notice--danger': hasOverdueVaccine }">
          <text v-for="item in vaccines.upcoming" :key="item.id" class="notice__line">
            {{ item.name }} · {{ item.overdue ? '已逾期' : '即将到期' }} {{ item.nextDueDate }}
          </text>
        </view>
        <view v-if="vaccines.latest.length === 0" class="block__empty">
          <text class="block__empty-text">没有疫苗记录</text>
        </view>
        <view v-for="item in vaccines.latest" :key="item.id" class="row">
          <view class="row__head">
            <text class="row__date">{{ item.date }}</text>
            <text v-if="item.nextDueDate" class="row__tag row__tag--soft">下次 {{ item.nextDueDate }}</text>
          </view>
          <text class="row__title">{{ item.name }}</text>
        </view>
      </view>

      <!-- ⑥ 体重 -->
      <view class="block health-card">
        <text class="block__title">体重</text>
        <view class="weight">
          <text class="weight__value">{{ weight.current }} kg</text>
          <text v-if="weight.recentChangeKg !== null" class="weight__change">
            较上次 {{ weight.recentChangeKg > 0 ? '+' : '' }}{{ weight.recentChangeKg }} kg
          </text>
        </view>
        <text v-if="dog.weightUpdatedAt" class="row__detail">
          档案体重更新于 {{ dog.weightUpdatedAt }}
        </text>
      </view>

      <!-- ⑦ 饮食偏好 -->
      <view class="block health-card">
        <text class="block__title">饮食偏好</text>
        <view v-if="!diet.preferredFoods && !diet.pickyFoods" class="block__empty">
          <text class="block__empty-text">没有填写饮食偏好</text>
        </view>
        <view v-else>
          <text v-if="diet.preferredFoods" class="row__detail">爱吃：{{ diet.preferredFoods }}</text>
          <text v-if="diet.pickyFoods" class="row__detail">不吃：{{ diet.pickyFoods }}</text>
        </view>
      </view>

      <!-- ⑧ 档案里填过的自由文本病史 -->
      <view v-if="medicalHistory" class="block health-card">
        <text class="block__title">档案里的病史描述</text>
        <text class="row__detail">{{ medicalHistory }}</text>
      </view>

      <view class="footer">
        <text class="footer__text">
          本摘要由你自己记录的内容整理而成，仅供就诊时参考，不构成诊断。
        </text>
        <text class="footer__time">生成时间：{{ generatedAtText }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dogApi } from '../../api/dogs'

/**
 * 就诊前摘要（2026-10-01，第二期 · 老板需求 8）。
 *
 * 老板："带狗去看病前，我最想看到的是过往病史的摘要。"
 *
 * 排序**按医生问诊的实际顺序**，不是按我们数据库的顺序：
 *   过敏（安全底线）→ 还没结束的问题 → 最近就诊 → 最近体检 → 疫苗 → 体重 → 饮食 → 档案病史
 *
 * 第三期的分享会以这份摘要为内容来源。
 */
const dogId = ref('')
const isLoading = ref(false)
const loadError = ref('')

const dog = ref<Record<string, any>>({})
const allergies = ref<{ allergen: string; notes: string; date: string }[]>([])
const ongoingConditions = ref<any[]>([])
const recentVisits = ref<any[]>([])
const recentCheckups = ref<any[]>([])
const vaccines = ref<{ latest: any[]; upcoming: any[] }>({ latest: [], upcoming: [] })
const weight = ref<{ current: number; records: any[]; recentChangeKg: number | null }>({
  current: 0,
  records: [],
  recentChangeKg: null,
})
const diet = ref<{ preferredFoods: string; pickyFoods: string }>({
  preferredFoods: '',
  pickyFoods: '',
})
const medicalHistory = ref('')
const generatedAt = ref('')

const dogLine = computed(() => {
  const parts = [
    dog.value.breedName,
    dog.value.gender,
    dog.value.isNeutered ? '已绝育' : '未绝育',
    dog.value.ageText,
  ].filter(Boolean)
  return parts.join(' · ')
})

const hasOverdueVaccine = computed(() =>
  vaccines.value.upcoming.some((item) => item.overdue),
)

const generatedAtText = computed(() => {
  if (!generatedAt.value) {
    return ''
  }
  const date = new Date(generatedAt.value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  dogId.value = typeof value === 'string' ? value : ''
  uni.setNavigationBarTitle({ title: '就诊前摘要' })
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
    const res: any = await dogApi.healthVisitSummary(dogId.value)
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '加载就诊前摘要失败')
    }

    const data = res.data
    dog.value = data.dog || {}
    allergies.value = Array.isArray(data.allergies) ? data.allergies : []
    ongoingConditions.value = Array.isArray(data.ongoingConditions) ? data.ongoingConditions : []
    recentVisits.value = Array.isArray(data.recentVisits) ? data.recentVisits : []
    recentCheckups.value = Array.isArray(data.recentCheckups) ? data.recentCheckups : []
    vaccines.value = {
      latest: Array.isArray(data.vaccines?.latest) ? data.vaccines.latest : [],
      upcoming: Array.isArray(data.vaccines?.upcoming) ? data.vaccines.upcoming : [],
    }
    weight.value = {
      current: Number(data.weight?.current ?? 0),
      records: Array.isArray(data.weight?.records) ? data.weight.records : [],
      recentChangeKg:
        data.weight?.recentChangeKg === null || data.weight?.recentChangeKg === undefined
          ? null
          : Number(data.weight.recentChangeKg),
    }
    diet.value = {
      preferredFoods: String(data.diet?.preferredFoods || ''),
      pickyFoods: String(data.diet?.pickyFoods || ''),
    }
    medicalHistory.value = String(data.medicalHistory || '')
    generatedAt.value = String(data.generatedAt || '')
  } catch (error: any) {
    loadError.value = error?.message || '加载就诊前摘要失败'
  } finally {
    isLoading.value = false
  }
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

.block {
  margin-top: 24rpx;
}

.block__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.block__empty {
  margin-top: 14rpx;
}

.block__empty-text {
  font-size: 24rpx;
  color: #8a968a;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.chip {
  font-size: 26rpx;
  line-height: 1;
  padding: 14rpx 20rpx;
  border-radius: 999rpx;
  background: #eef2e4;
  color: #1e3a2f;
}

.chip--danger {
  background: #fbe9e5;
  color: #a5311f;
  font-weight: 600;
}

.row {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #eef1e8;
}

.row__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.row__date {
  font-size: 24rpx;
  font-weight: 600;
  color: #4a5a4a;
}

.row__tag {
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: #8a6f3d;
  background: #f6efe0;
}

.row__tag--soft {
  color: #4a5a4a;
  background: #f2f5ec;
}

.row__title {
  display: block;
  margin-top: 10rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
  line-height: 1.4;
}

.row__detail {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.notice {
  margin-top: 16rpx;
  padding: 18rpx 22rpx;
  border-radius: 16rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.notice--danger {
  background: #fbe9e5;
  border-color: #f0c4ba;
}

.notice__line {
  display: block;
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

.notice--danger .notice__line {
  color: #a5311f;
}

.weight {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  margin-top: 12rpx;
}

.weight__value {
  font-size: 44rpx;
  font-weight: 800;
  color: #0e6f78;
}

.weight__change {
  font-size: 24rpx;
  color: #6b6653;
}

.footer {
  margin-top: 32rpx;
  padding: 0 8rpx;
}

.footer__text {
  display: block;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a968a;
}

.footer__time {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #a8b2a8;
}
</style>
