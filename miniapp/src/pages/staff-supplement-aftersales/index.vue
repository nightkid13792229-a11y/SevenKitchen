<template>
  <view class="page">
    <view class="head">
      <text class="title">补剂售后</text>
      <text class="sub">员工只读：资金操作由管理员处理</text>
    </view>
    <view v-if="loading" class="state"><text>加载中…</text></view>
    <view v-else-if="cases.length === 0" class="state"><text>暂无售后记录</text></view>
    <view v-else class="list">
      <view v-for="item in cases" :key="item.id" class="card">
        <view class="row">
          <text class="case-no">{{ item.caseNo }}</text>
          <text class="status">{{ statusLabel(item.status) }}</text>
        </view>
        <view class="line"><text class="label">订单</text><text>{{ item.orderNo }}</text></view>
        <view class="line"><text class="label">诉求</text><text>{{ typeLabel(item.requestType) }}</text></view>
        <view class="line"><text class="label">原因</text><text class="reason">{{ item.requestedReason }}</text></view>
        <view v-if="item.reshipOrderNo" class="line"><text class="label">补发单</text><text>{{ item.reshipOrderNo }}</text></view>
      </view>
      <view v-if="hasMore" class="more" @tap="loadMore"><text>{{ loadingMore ? '加载中…' : '加载更多' }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import { request } from '../../utils/api'

const loading = ref(false)
const loadingMore = ref(false)
const cases = ref<any[]>([])
const page = ref(1)
const hasMore = ref(false)

function statusLabel(value: string) {
  return ({ PENDING: '待受理', PROCESSING: '处理中', RESOLVED: '已解决', REJECTED: '已驳回', CANCELLED: '已撤回' } as Record<string, string>)[value] || value
}
function typeLabel(value: string) {
  return ({ REFUND: '退款', RESHIP: '补发', OTHER: '其他' } as Record<string, string>)[value] || value
}

async function load(reset = false) {
  if (reset) {
    page.value = 1
    cases.value = []
  }
  if (loading.value || loadingMore.value) return
  if (page.value === 1) loading.value = true
  else loadingMore.value = true
  try {
    const res = await request({
      url: '/admin/supplement-shop/aftersales',
      method: 'GET',
      data: { page: page.value, pageSize: 20 },
    })
    if (res.code === 0) {
      const items = res.data.items || []
      cases.value = page.value === 1 ? items : [...cases.value, ...items]
      hasMore.value = cases.value.length < Number(res.data.total || 0)
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  if (!hasMore.value) return
  page.value += 1
  load()
}

onLoad(() => load(true))
onReachBottom(loadMore)
</script>

<style scoped>
.page { min-height: 100vh; background: #f5f6f8; padding: 24rpx; box-sizing: border-box; }
.head { margin-bottom: 20rpx; }
.title { display: block; font-size: 38rpx; font-weight: 700; color: #1e3a2f; }
.sub { display: block; margin-top: 6rpx; color: #909399; font-size: 23rpx; }
.state { padding-top: 200rpx; text-align: center; color: #909399; }
.card { background: #fff; border-radius: 14rpx; padding: 22rpx; margin-bottom: 16rpx; }
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10rpx; }
.case-no { font-size: 25rpx; color: #303133; font-family: monospace; }
.status { font-size: 22rpx; color: #b88230; background: #fdf6ec; padding: 4rpx 10rpx; border-radius: 16rpx; }
.line { display: flex; gap: 16rpx; padding: 6rpx 0; font-size: 25rpx; color: #606266; }
.label { color: #909399; flex: 0 0 80rpx; }
.reason { flex: 1; }
.more { text-align: center; padding: 20rpx; color: #909399; font-size: 24rpx; }
</style>
