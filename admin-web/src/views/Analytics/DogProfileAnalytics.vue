<template>
  <div class="analytics-page">
    <el-card class="filters-card" shadow="never">
      <div class="filters-bar">
        <div>
          <div class="filters-title">狗档案转化分析</div>
          <div class="filters-subtitle">观察首次建档、日常编辑和风险信号的变化趋势。</div>
        </div>
        <div class="filters-actions">
          <el-date-picker
            v-model="range"
            type="daterange"
            value-format="YYYY-MM-DD"
            unlink-panels
          />
          <el-button type="primary" :loading="loading" @click="load">刷新</el-button>
        </div>
      </div>
    </el-card>

    <!-- 体况确认率（阶段 C10）：本次上线的核心运营指标。
         阶段 C 之前，生产库 99.98% 的狗从未确认过体况分，而新算法里
         体况分第一次真正参与能量计算 —— 这个数字直接决定新算法有多少狗
         是真的按自己体况在算，而不是按默认的 5 分。 -->
    <el-row :gutter="20" class="stats-grid">
      <el-col :span="24">
        <el-card shadow="hover">
          <div class="bcs-rate">
            <div class="bcs-rate__head">
              <span class="bcs-rate__label">体况确认率</span>
              <span class="bcs-rate__value">{{ summary.bcsConfirmation.rate }}%</span>
            </div>
            <div class="bcs-rate__detail">
              已确认 {{ summary.bcsConfirmation.confirmedDogs }} 只 /
              共 {{ summary.bcsConfirmation.totalDogs }} 只
              <span class="bcs-rate__range">
                · 所选区间内新增 {{ summary.bcsConfirmation.confirmedInRange }} 只
              </span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="stats-grid">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>首次建档漏斗</template>
          <el-steps direction="vertical" :active="4">
            <el-step title="开始建档" :description="String(summary.createFunnel.started)" />
            <el-step title="完成基础信息" :description="String(summary.createFunnel.basicCompleted)" />
            <el-step title="生成喂食建议" :description="String(summary.createFunnel.recommendationSucceeded)" />
            <el-step title="完成建档" :description="String(summary.createFunnel.submitted)" />
          </el-steps>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>日常编辑漏斗</template>
          <el-steps direction="vertical" :active="3">
            <el-step title="进入编辑模块" :description="String(summary.editFunnel.moduleOpened)" />
            <el-step title="建议计算成功" :description="String(summary.editFunnel.calcSucceeded)" />
            <el-step title="保存成功" :description="String(summary.editFunnel.saved)" />
          </el-steps>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="stats-grid">
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover">
          <div class="signal-card">
            <span class="signal-card__label">草稿恢复</span>
            <span class="signal-card__value">{{ summary.riskSignals.draftRestored }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover">
          <div class="signal-card">
            <span class="signal-card__label">试算失败</span>
            <span class="signal-card__value">{{ summary.riskSignals.calcFailed }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover">
          <div class="signal-card">
            <span class="signal-card__label">保存失败</span>
            <span class="signal-card__value">{{ summary.riskSignals.submitFailed }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover">
          <div class="signal-card">
            <span class="signal-card__label">跳过健康补充</span>
            <span class="signal-card__value">{{ summary.riskSignals.healthSkipped }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { analyticsApi } from '@/api/analytics'
import type { DogProfileAnalyticsSummary } from '@/types/analytics'

const loading = ref(false)
const range = ref<[string, string]>(getDefaultRange())
const summary = ref<DogProfileAnalyticsSummary>({
  createFunnel: { started: 0, basicCompleted: 0, recommendationSucceeded: 0, submitted: 0 },
  editFunnel: { moduleOpened: 0, calcSucceeded: 0, saved: 0 },
  riskSignals: { draftRestored: 0, calcFailed: 0, submitFailed: 0, healthSkipped: 0 },
  bcsConfirmation: { totalDogs: 0, confirmedDogs: 0, confirmedInRange: 0, rate: 0 },
})

function getDefaultRange(): [string, string] {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 6)

  return [formatDate(start), formatDate(end)]
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function load() {
  loading.value = true

  try {
    summary.value = await analyticsApi.getDogProfileSummary({
      from: `${range.value[0]}T00:00:00.000Z`,
      to: `${range.value[1]}T23:59:59.999Z`,
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.analytics-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.filters-card {
  border: none;
}

.filters-bar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.filters-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2d3d;
}

.filters-subtitle {
  margin-top: 6px;
  color: #6b7785;
  font-size: 13px;
}

.filters-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.stats-grid {
  margin: 0;
}

.signal-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signal-card__label {
  color: #6b7785;
  font-size: 13px;
}

.signal-card__value {
  color: #1f2d3d;
  font-size: 28px;
  font-weight: 700;
}

/* 体况确认率（阶段 C10）：只读展示，不做图表 */
.bcs-rate {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bcs-rate__head {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.bcs-rate__label {
  color: #6b7785;
  font-size: 13px;
}

.bcs-rate__value {
  color: #1f2d3d;
  font-size: 32px;
  font-weight: 700;
}

.bcs-rate__detail {
  color: #6b7785;
  font-size: 13px;
}

.bcs-rate__range {
  color: #9aa5b1;
}
</style>
