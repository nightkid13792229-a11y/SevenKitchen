<template>
  <view class="page">
    <view class="head">
      <view>
        <text class="title">分装汇总</text>
        <text class="sub">当天备料 / 包材 / 缺料 / 产能</text>
      </view>
      <picker mode="date" :value="date" @change="onDateChange">
        <view class="date-btn">{{ date }}</view>
      </picker>
    </view>

    <view v-if="loading" class="state"><text>加载中…</text></view>
    <template v-else>
      <view class="hero">
        <view class="hero-item"><text class="hero-value">{{ data?.orderCount || 0 }}</text><text class="hero-label">订单</text></view>
        <view class="hero-item"><text class="hero-value">{{ data?.bagCount || 0 }}</text><text class="hero-label">总袋数</text></view>
        <view class="hero-item"><text class="hero-value">{{ data?.capacity || 0 }}</text><text class="hero-label">产能</text></view>
      </view>

      <view class="card">
        <text class="section-title">补剂总用量</text>
        <view v-for="item in data?.ingredientTotals || []" :key="`${item.ingredientId}-${item.unit}`" class="row">
          <view>
            <text class="name">{{ item.name }}</text>
            <text class="desc">{{ item.quantity }} {{ item.unit }} · {{ item.orderCount }} 单</text>
          </view>
          <text :class="item.shortage > 0 ? 'badge red' : 'badge green'">
            {{ item.shortage > 0 ? `缺 ${item.shortage} ${item.unit}` : '足' }}
          </text>
        </view>
        <text v-if="(data?.ingredientTotals || []).length === 0" class="empty">当天没有待分装订单</text>
      </view>

      <view class="card">
        <text class="section-title">包材需求</text>
        <view v-for="item in data?.packagingNeeds || []" :key="item.role + item.name" class="row">
          <view>
            <text class="name">{{ item.name }}</text>
            <text class="desc">{{ roleLabel(item.role) }} · {{ item.configured ? '已配置' : '未配置' }}</text>
          </view>
          <text class="qty">{{ item.quantity }}</text>
        </view>
      </view>

      <view v-if="(data?.missingPouchRules || []).length" class="card warning-card">
        <text class="section-title">未配置袋型（{{ data?.missingPouchRules?.length }}）</text>
        <text class="warning-text">{{ data?.missingPouchRules?.join('；') }}</text>
      </view>
      <view class="notice">缺料默认不能分装；如确认缺料，请联系管理员强制分装并说明原因。员工不能强制。</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { request } from '../../utils/api'

const loading = ref(false)
const date = ref(new Date().toISOString().slice(0, 10))
const data = ref<any>(null)

function roleLabel(role: string) {
  return ({ POUCH: '分装袋', DESICCANT: '干燥剂', LABEL: '标签' } as Record<string, string>)[role] || role
}

function onDateChange(event: any) {
  date.value = event.detail.value
  load()
}

async function load() {
  loading.value = true
  try {
    const res = await request({
      url: '/admin/supplement-shop/packing-summary',
      method: 'GET',
      data: { date: date.value },
    })
    if (res.code === 0) data.value = res.data
    else uni.showToast({ title: res.message || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx; box-sizing: border-box; }
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.title { display: block; font-size: 38rpx; font-weight: 700; color: #1e3a2f; }
.sub { display: block; margin-top: 6rpx; color: #909399; font-size: 23rpx; }
.date-btn { background: #fff; padding: 12rpx 20rpx; border-radius: 30rpx; font-size: 26rpx; color: #1e3a2f; }
.state { padding-top: 200rpx; text-align: center; color: #909399; }
.hero { display: flex; background: linear-gradient(140deg, #1e3a2f, #2b5040); border-radius: 18rpx; padding: 28rpx; color: #f7f3e8; margin-bottom: 20rpx; }
.hero-item { flex: 1; text-align: center; }
.hero-value { display: block; font-size: 40rpx; font-weight: 700; }
.hero-label { display: block; margin-top: 4rpx; font-size: 22rpx; color: #cad6c9; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; }
.section-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 12rpx; }
.row { display: flex; justify-content: space-between; align-items: center; padding: 14rpx 0; border-bottom: 1rpx solid #f2f2f2; }
.name { display: block; font-size: 27rpx; color: #303133; }
.desc { display: block; margin-top: 4rpx; font-size: 22rpx; color: #909399; }
.badge { font-size: 22rpx; padding: 4rpx 12rpx; border-radius: 20rpx; }
.badge.green { color: #2e7d32; background: #edf7ed; }
.badge.red { color: #c62828; background: #fdecea; }
.qty { font-size: 30rpx; font-weight: 600; }
.empty { color: #909399; font-size: 24rpx; }
.warning-card { border-left: 6rpx solid #e6a23c; }
.warning-text { color: #8a5a00; font-size: 23rpx; line-height: 1.6; }
.notice { padding: 18rpx; background: #fdf6ec; color: #b88230; border-radius: 10rpx; font-size: 23rpx; line-height: 1.6; }
</style>
