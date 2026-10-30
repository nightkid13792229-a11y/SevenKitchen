<template>
  <div class="section-page">
    <div class="section-head">
      <p class="section-desc">{{ activeDesc }}</p>
    </div>

    <el-tabs v-model="tab" class="section-tabs">
      <el-tab-pane label="FEDIAF 2025 犬标准" name="standard" lazy>
        <div class="embedded-section">
          <FediafDogStandard />
        </div>
      </el-tab-pane>
      <el-tab-pane label="原料计算就绪度" name="readiness" lazy>
        <div class="embedded-section">
          <IngredientReadiness />
        </div>
      </el-tab-pane>
      <el-tab-pane label="FEDIAF 目标预览" name="preview" lazy>
        <div class="embedded-section">
          <FediafTargetPreview />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FediafDogStandard from '@/views/NutritionStandards/FediafDogStandard.vue'
import IngredientReadiness from '@/views/NutritionStandards/IngredientReadiness.vue'
import FediafTargetPreview from '@/views/NutritionStandards/FediafTargetPreview.vue'
import { useQueryTab } from '@/composables/useQueryTab'

const tabs = ['standard', 'readiness', 'preview'] as const

const tab = useQueryTab('tab', tabs, 'standard')

const descriptions: Record<(typeof tabs)[number], string> = {
  standard: 'FEDIAF 2025 犬标准值，只读；支持审核标记和备注。',
  readiness: '检查原料营养档案是否足够支撑 FEDIAF 计算。',
  preview: '按生命阶段和 MER 口径，查看实际计算出来的目标值。',
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
