<template>
  <div class="section-page">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="看板" name="board" lazy>
        <div class="embedded-section">
          <SupplementDashboard />
        </div>
      </el-tab-pane>

      <el-tab-pane label="商品" name="products" lazy>
        <div class="sub-switch">
          <el-radio-group v-model="sub" size="small">
            <el-radio-button value="catalog">上架清单</el-radio-button>
            <el-radio-button value="equivalence">等价组</el-radio-button>
          </el-radio-group>
        </div>
        <div class="embedded-section">
          <SupplementCatalog v-if="sub === 'catalog'" />
          <SupplementEquivalence v-else />
        </div>
      </el-tab-pane>

      <el-tab-pane label="分装" name="packing" lazy>
        <div class="sub-switch">
          <el-radio-group v-model="sub" size="small">
            <el-radio-button value="summary">分装汇总</el-radio-button>
            <el-radio-button value="rules">包材规则</el-radio-button>
          </el-radio-group>
        </div>
        <div class="embedded-section">
          <SupplementPackingSummary v-if="sub === 'summary'" />
          <SupplementPackaging v-else />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import SupplementDashboard from '@/views/SupplementShop/Dashboard.vue'
import SupplementCatalog from '@/views/SupplementShop/Catalog.vue'
import SupplementEquivalence from '@/views/SupplementShop/EquivalenceGroups.vue'
import SupplementPackingSummary from '@/views/SupplementShop/PackingSummary.vue'
import SupplementPackaging from '@/views/SupplementShop/Packaging.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['board', 'products', 'packing'] as const
const subs = ['catalog', 'equivalence', 'summary', 'rules'] as const

const tab = useQueryTab('tab', tabs, 'board')
const sub = useQueryTab('sub', subs, 'catalog')

watch(
  tab,
  (value) => {
    if (value === 'products' && !['catalog', 'equivalence'].includes(sub.value)) {
      sub.value = 'catalog'
    }
    if (value === 'packing' && !['summary', 'rules'].includes(sub.value)) {
      sub.value = 'summary'
    }
  },
  { immediate: true },
)

const descriptions: Record<string, string> = {
  board: '只看今天的补剂经营动作：新单、已付款、待排期，以及需要人处理的卡点。',
  catalog: '逐个确认补剂的物理形态、原厂保质期和储存条件，档案不全会阻断上架。',
  equivalence: '把可以互相替代的补剂原料归成一组，审核通过后才参与 DIY 推荐。',
  summary: '当天单数、袋数、补剂总量、包材需求、缺料和产能。只算需求量，不扣包材库存。',
  rules: '只维护“哪种袋 / 标签 / 干燥剂”的规则；包材主数据仍在原料库里建。',
}

const activeDesc = computed(() => {
  if (tab.value === 'products' || tab.value === 'packing') {
    return descriptions[sub.value]
  }
  return descriptions.board
})
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

.sub-switch {
  margin: -4px 0 12px;
}
</style>
