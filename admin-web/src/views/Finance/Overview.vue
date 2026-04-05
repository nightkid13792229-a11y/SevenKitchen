<template>
  <div class="finance-page">
    <div class="page-header">
      <div>
        <h2>财务总览</h2>
        <p>基于真实收款、真实付款和待支付单据查看经营结果。</p>
      </div>
      <RangeSwitcher v-model="preset" @change="loadAll" />
    </div>

    <el-row v-loading="loading" :gutter="16" class="metrics-row">
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover">
          <div class="metric-label">实际收款总额</div>
          <div class="metric-value">¥{{ formatCurrency(overview?.cashIn) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover">
          <div class="metric-label">真实经营结余</div>
          <div class="metric-value">¥{{ formatCurrency(overview?.operatingBalance) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover">
          <div class="metric-label">待支付金额</div>
          <div class="metric-value">¥{{ formatCurrency(overview?.pendingPayables) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover">
          <div class="metric-label">实际费用</div>
          <div class="metric-value">¥{{ formatCurrency(overview?.actualExpense) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover">
          <div class="metric-label">现金流出</div>
          <div class="metric-value">¥{{ formatCurrency(overview?.cashOut) }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card shadow="hover">
          <div class="metric-label">净现金流</div>
          <div class="metric-value">¥{{ formatCurrency(overview?.netCashflow) }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section-row">
      <el-col :xs="24" :lg="14">
        <el-card shadow="never">
          <template #header>经营结果摘要</template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="经营收入">
              ¥{{ formatCurrency(overview?.operatingRevenue) }}
            </el-descriptions-item>
            <el-descriptions-item label="实际费用">
              ¥{{ formatCurrency(overview?.actualExpense) }}
            </el-descriptions-item>
            <el-descriptions-item label="经营结余">
              ¥{{ formatCurrency(overview?.operatingBalance) }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="10">
        <el-card shadow="never">
          <template #header>预警提醒</template>
          <div v-if="alerts.length" class="alerts">
            <el-alert
              v-for="(alert, index) in alerts"
              :key="`${alert.category}-${index}`"
              :title="alert.message"
              type="warning"
              :closable="false"
              show-icon
            />
          </div>
          <el-empty v-else description="当前周期暂无异常提醒" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { financeApi } from '@/api/finance'
import RangeSwitcher from './components/RangeSwitcher.vue'
import type {
  FinanceAlertItem,
  FinanceOverview,
  FinanceRangePreset
} from '@/types/finance'

const preset = ref<FinanceRangePreset>('TODAY')
const overview = ref<FinanceOverview | null>(null)
const alerts = ref<FinanceAlertItem[]>([])
const loading = ref(false)

const loadAll = async () => {
  loading.value = true
  try {
    const [overviewData, alertData] = await Promise.all([
      financeApi.getOverview(preset.value),
      financeApi.getAlerts(preset.value)
    ])
    overview.value = overviewData
    alerts.value = alertData
  } finally {
    loading.value = false
  }
}

const formatCurrency = (value?: number) => Number(value ?? 0).toFixed(2)

onMounted(() => {
  loadAll()
})
</script>

<style scoped lang="scss">
.finance-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  h2 {
    margin: 0 0 6px;
    color: #303133;
  }

  p {
    margin: 0;
    color: #909399;
  }
}

.metrics-row,
.section-row {
  margin-top: 0;
}

.metric-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
}

.alerts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
