<template>
  <div class="section-page payment-section">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="支付配置" name="payment" lazy>
        <div class="embedded-section">
          <PaymentConfig />
        </div>
      </el-tab-pane>
      <el-tab-pane label="客服配置" name="customer-service" lazy>
        <div class="embedded-section">
          <CustomerServiceConfig />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PaymentConfig from '@/views/PaymentConfig.vue'
import CustomerServiceConfig from '@/views/CustomerServiceConfig.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['payment', 'customer-service'] as const

const tab = useQueryTab('tab', tabs, 'payment')

const descriptions: Record<(typeof tabs)[number], string> = {
  payment: '微信支付商户参数与回调地址；密钥不会明文回显。',
  'customer-service': '微信客服 / 企业微信接待、订单卡片和小程序悬浮客服入口。',
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

/* 页面里的卡片标题和 tab 重复，只保留说明和状态标签 */
.payment-section :deep(.card-header h3) {
  display: none;
}
</style>
