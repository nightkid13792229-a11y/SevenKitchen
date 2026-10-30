<template>
  <div class="section-page">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="售后待办" name="tickets" lazy>
        <div class="embedded-section">
          <AftersaleList />
        </div>
      </el-tab-pane>
      <el-tab-pane label="退款申请" name="refund-requests" lazy>
        <div class="embedded-section">
          <RefundRequests />
        </div>
      </el-tab-pane>
      <el-tab-pane label="退款记录" name="refunds" lazy>
        <div class="embedded-section">
          <RefundManagement />
        </div>
      </el-tab-pane>
      <el-tab-pane label="补剂售后" name="supplement" lazy>
        <div class="embedded-section">
          <SupplementAftersales />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AftersaleList from '@/views/CustomRecipes/AftersaleList.vue'
import RefundRequests from '@/views/CustomRecipes/RefundRequests.vue'
import RefundManagement from '@/views/Aftersale/RefundManagement.vue'
import SupplementAftersales from '@/views/SupplementShop/Aftersales.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['tickets', 'refund-requests', 'refunds', 'supplement'] as const

const tab = useQueryTab('tab', tabs, 'tickets')

const descriptions: Record<(typeof tabs)[number], string> = {
  tickets: '按等待时长排好序，先处理等得最久的那单；每单能做什么由后端给出。',
  'refund-requests': '已交付、制作中的订单要退款，需要人工审核；通过后直接发起微信原路退款。',
  refunds: '每一笔微信退款的尝试和到账结果，按微信成功记录核对。',
  supplement: '补剂订单的退款、补发、仅登记或驳回；未发货只支持全额退款。',
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
