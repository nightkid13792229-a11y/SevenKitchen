<template>
  <div class="supplement-dashboard">
    <div class="page-header">
      <div>
        <h2>补剂看板</h2>
        <p class="subtitle">{{ data?.date || '今日' }} · 只看经营动作，不堆历史报表</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-row :gutter="12">
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric">
          <div class="label">今日新单</div>
          <div class="value">{{ data?.todayCreated ?? '—' }}</div>
          <div class="hint">下单时间在上海今天</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric">
          <div class="label">今日已付款</div>
          <div class="value">{{ data?.todayPaid ?? '—' }}</div>
          <div class="hint">以微信 success_time 为准</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric warning">
          <div class="label">待排期</div>
          <div class="value">{{ data?.pendingSchedule ?? '—' }}</div>
          <div class="hint">已付款但还没有分装日</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric">
          <div class="label">今日分装</div>
          <div class="value">{{ data?.todayPacking ?? '—' }}</div>
          <div class="hint">分装日 = 今天，已分装/已发/已完成</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric warning">
          <div class="label">待发货</div>
          <div class="value">{{ data?.toShip ?? '—' }}</div>
          <div class="hint">已分装、未填快递单号</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric danger">
          <div class="label">未完结售后</div>
          <div class="value">{{ data?.openAftersale ?? '—' }}</div>
          <div class="hint">待受理 + 处理中</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric">
          <div class="label">本月退款</div>
          <div class="value">
            <span v-if="data?.refundAmountMonth === null">—</span>
            <span v-else>¥{{ formatMoney(data?.refundAmountMonth) }}</span>
          </div>
          <div class="hint">只统计退款成功</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="metric">
          <div class="label">今日截单</div>
          <div class="value small">{{ data?.configHints?.dailyCutoffTime || '—' }}</div>
          <div class="hint">
            产能 {{ data?.configHints?.dailyPackingCapacity ?? '—' }} 单/天 ·
            {{ data?.configHints?.autoScheduleEnabled ? '自动排期开' : '自动排期关' }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="quick-card">
      <div class="quick-title">常用入口</div>
      <div class="quick-links">
        <el-button type="primary" plain @click="$router.push('/order-center')">订单中心</el-button>
        <el-button plain @click="$router.push('/supplement-shop/orders')">补剂订单</el-button>
        <el-button plain @click="$router.push('/supplement-shop/aftersales')">补剂售后</el-button>
        <el-button plain @click="$router.push('/supplement-shop/config')">商城设置</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supplementDashboardApi } from '@/api/supplementDashboard'
import type { SupplementDashboard } from '@/api/supplementDashboard'

const loading = ref(false)
const data = ref<SupplementDashboard | null>(null)

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toFixed(2)
}

async function load() {
  loading.value = true
  try {
    data.value = await supplementDashboardApi.get()
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.supplement-dashboard { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.page-header h2 { margin: 0; font-size: 20px; }
.subtitle { margin: 6px 0 0; color: #909399; font-size: 13px; }
.metric { margin-bottom: 12px; min-height: 122px; }
.metric .label { color: #606266; font-size: 13px; }
.metric .value { margin-top: 10px; font-size: 28px; font-weight: 600; color: #303133; }
.metric .value.small { font-size: 22px; }
.metric .hint { margin-top: 8px; color: #909399; font-size: 12px; line-height: 1.5; }
.metric.warning { border-top: 3px solid #e6a23c; }
.metric.danger { border-top: 3px solid #f56c6c; }
.quick-card { margin-top: 4px; }
.quick-title { font-weight: 600; margin-bottom: 12px; }
.quick-links { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
