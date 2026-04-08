<template>
  <div class="finance-page">
    <div class="page-header">
      <div>
        <h2>费用分析</h2>
        <p>按真实费用分类查看当前周期的钱主要花去了哪里。</p>
      </div>
      <RangeSwitcher v-model="preset" @change="loadAnalysis" />
    </div>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="analysis?.categories ?? []" style="width: 100%">
        <el-table-column prop="label" label="费用类别" min-width="220" />
        <el-table-column label="本期金额" min-width="160" align="right">
          <template #default="{ row }">
            ¥{{ Number(row.amount ?? 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="较历史变化" min-width="160" align="right">
          <template #default="{ row }">
            <span v-if="row.deltaRate !== undefined">
              {{ (Number(row.deltaRate) * 100).toFixed(1) }}%
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { financeApi } from '@/api/finance'
import RangeSwitcher from './components/RangeSwitcher.vue'
import type { ExpenseAnalysis, FinanceRangePreset } from '@/types/finance'

const preset = ref<FinanceRangePreset>('THIS_MONTH')
const analysis = ref<ExpenseAnalysis | null>(null)
const loading = ref(false)

const loadAnalysis = async () => {
  loading.value = true
  try {
    analysis.value = await financeApi.getExpenseAnalysis(preset.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAnalysis()
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
</style>
