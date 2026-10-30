<template>
  <div class="section-page">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="采购单" name="lists" lazy>
        <div class="embedded-section">
          <PurchaseLists />
        </div>
      </el-tab-pane>
      <el-tab-pane label="采购历史" name="history" lazy>
        <div class="embedded-section">
          <PurchaseHistory />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PurchaseLists from '@/views/Purchasing/PurchaseLists.vue'
import PurchaseHistory from '@/views/Purchasing/PurchaseHistory.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['lists', 'history'] as const

const tab = useQueryTab('tab', tabs, 'lists')

const descriptions: Record<(typeof tabs)[number], string> = {
  lists: '按订单制作日期生成采购单，跟进采购执行、记录实际采购和库存补货。',
  history: '历史采购的数量、金额和原料统计，用来核对价格和用量。',
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
