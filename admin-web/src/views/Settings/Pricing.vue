<template>
  <div class="section-page">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="全局配置" name="global" lazy>
        <div class="embedded-section">
          <GlobalConfig />
        </div>
      </el-tab-pane>
      <el-tab-pane label="食谱定制" name="recipe" lazy>
        <div class="embedded-section">
          <CustomRecipeConfig />
        </div>
      </el-tab-pane>
      <el-tab-pane label="补剂商城" name="supplement" lazy>
        <div class="embedded-section">
          <SupplementConfig />
        </div>
      </el-tab-pane>
      <el-tab-pane label="试吃装" name="tasting" lazy>
        <div class="embedded-section">
          <TastingPackConfig />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import GlobalConfig from '@/views/GlobalConfig.vue'
import CustomRecipeConfig from '@/views/CustomRecipes/Config.vue'
import SupplementConfig from '@/views/SupplementShop/Config.vue'
import TastingPackConfig from '@/views/TastingPack/Config.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['global', 'recipe', 'supplement', 'tasting'] as const

const tab = useQueryTab('tab', tabs, 'global')

const descriptions: Record<(typeof tabs)[number], string> = {
  global: '成本、生产、订单、包材、运费、图片等公共参数；改一次，三个端一起生效。',
  recipe: '定制费、交付周期、每日接单上限，改完即时生效。',
  supplement: '加价倍率、分装服务费、运费策略和分装有效期，不受鲜食成本影响。',
  tasting: '试吃倍率与合并成本规则；试吃装售价由这套参数自动算。',
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
