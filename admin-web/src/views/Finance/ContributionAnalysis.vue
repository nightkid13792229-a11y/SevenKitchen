<template>
  <div class="finance-page">
    <div class="page-header">
      <div>
        <h2>经营贡献分析</h2>
        <p>用于看订单或食谱贡献表现，不等同于正式财务利润。</p>
      </div>
      <div class="header-actions">
        <RangeSwitcher v-model="preset" @change="loadData" />
        <el-select v-model="groupBy" style="width: 140px" @change="loadData">
          <el-option label="按订单" value="ORDER" />
          <el-option label="按食谱" value="RECIPE" />
        </el-select>
      </div>
    </div>

    <el-alert
      title="以下结果用于经营贡献分析，不等同正式财务利润。"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column prop="groupKey" label="对象" min-width="220" />
        <el-table-column label="收入" min-width="140" align="right">
          <template #default="{ row }">
            ¥{{ Number(row.revenue ?? 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="规则归集成本" min-width="160" align="right">
          <template #default="{ row }">
            ¥{{ Number(row.contributionCost ?? 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="label" label="说明" min-width="240" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { financeApi } from '@/api/finance'
import RangeSwitcher from './components/RangeSwitcher.vue'
import type { ContributionAnalysisRow, FinanceRangePreset } from '@/types/finance'

const preset = ref<FinanceRangePreset>('THIS_MONTH')
const groupBy = ref<'ORDER' | 'RECIPE'>('RECIPE')
const rows = ref<ContributionAnalysisRow[]>([])
const loading = ref(false)

const loadData = async () => {
  loading.value = true
  try {
    rows.value = await financeApi.getContributionAnalysis(preset.value, groupBy.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
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
  }

  p {
    margin: 0;
    color: #909399;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
