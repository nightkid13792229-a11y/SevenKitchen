<template>
  <div class="section-page">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="财务总览" name="overview" lazy>
        <div class="embedded-section">
          <FinanceOverview />
        </div>
      </el-tab-pane>
      <el-tab-pane label="费用与待支付" name="expense-bills" lazy>
        <div class="embedded-section">
          <FinanceExpenseBills />
        </div>
      </el-tab-pane>
      <el-tab-pane label="费用分析" name="expense-analysis" lazy>
        <div class="embedded-section">
          <FinanceExpenseAnalysis />
        </div>
      </el-tab-pane>
      <el-tab-pane label="经营贡献分析" name="contribution" lazy>
        <div class="embedded-section">
          <FinanceContributionAnalysis />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FinanceOverview from '@/views/Finance/Overview.vue'
import FinanceExpenseBills from '@/views/Finance/ExpenseBills.vue'
import FinanceExpenseAnalysis from '@/views/Finance/ExpenseAnalysis.vue'
import FinanceContributionAnalysis from '@/views/Finance/ContributionAnalysis.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['overview', 'expense-bills', 'expense-analysis', 'contribution'] as const

const tab = useQueryTab('tab', tabs, 'overview')

const descriptions: Record<(typeof tabs)[number], string> = {
  overview: '基于真实收款、真实付款和待支付单据，看这段时间的经营结果。',
  'expense-bills': '房租、水电、服务器、工资等公司直接应付的费用单。',
  'expense-analysis': '按真实费用分类，看这个周期的钱主要花去了哪里。',
  contribution: '按订单或食谱看贡献表现，用于经营分析，不等同正式财务利润。',
}

const activeDesc = computed(() => descriptions[tab.value])
</script>

<style scoped>
.section-page {
  min-height: 100%;
}

.section-head {
  margin-bottom: 4px;
}

.section-desc {
  margin: 0 0 2px;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}

.section-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
</style>
