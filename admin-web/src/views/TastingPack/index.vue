<template>
  <div class="section-page">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="商品" name="products" lazy>
        <div class="embedded-section">
          <TastingPackList />
        </div>
      </el-tab-pane>
      <el-tab-pane label="库存" name="stock" lazy>
        <div class="embedded-section">
          <TastingPackStock />
        </div>
      </el-tab-pane>
      <el-tab-pane label="备货" name="plans" lazy>
        <div class="embedded-section">
          <TastingPackPlans />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TastingPackList from '@/views/TastingPack/List.vue'
import TastingPackStock from '@/views/TastingPack/Stock.vue'
import TastingPackPlans from '@/views/TastingPack/ProductionPlans.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['products', 'stock', 'plans'] as const

const tab = useQueryTab('tab', tabs, 'products')

const descriptions: Record<(typeof tabs)[number], string> = {
  products: '一套试吃装 = 几道菜 × 每道几袋 × 每袋多少克；售价由成本 × 试吃倍率自动算。',
  stock: '管做好的成品（按套记）：备货入库、先到期先出、过期下账。',
  plans: '没有顾客订单时也能提前做一批：把“做几套”换算成每道菜和每样原料。',
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
