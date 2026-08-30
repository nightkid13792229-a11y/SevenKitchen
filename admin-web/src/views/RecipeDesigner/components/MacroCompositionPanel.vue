<template>
  <div class="macro-composition">
    <div class="mc-banner">宏量构成</div>
    <div class="mc-body">
      <div class="mc-table">
        <div class="mc-row mc-head">
          <span>项目</span><span>占配方</span><span>占干物质</span><span>占热量</span>
        </div>
        <div v-for="row in rows" :key="row.key" class="mc-row">
          <span class="mc-name">{{ row.name }}</span>
          <span>{{ row.weightPctText }}</span>
          <span>{{ row.dryMatterPctText }}</span>
          <span>{{ row.energyPctText }}</span>
        </div>
      </div>
      <div class="mc-density">
        <div v-for="row in densityRows" :key="row.label" class="mc-density-row">
          <span class="mc-density-label">{{ row.label }}</span>
          <span class="mc-density-value">{{ row.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DesignRecipeAssessmentResult } from '@/utils/recipeDesigner/assessment'

const props = defineProps<{
  assessment: DesignRecipeAssessmentResult | null
}>()

/* ============ 宏量构成明细（与小程序宏量营养素板块一致） ============ */

const MACRO_DETAIL_DEFINITIONS = [
  { key: 'crudeProtein', name: '粗蛋白', energyFactor: 3.5 },
  { key: 'crudeFat', name: '粗脂肪', energyFactor: 8.5 },
  { key: 'carbohydrate', name: '净碳水', energyFactor: 3.5 },
  { key: 'fiber', name: '膳食纤维', energyFactor: 0 },
  { key: 'ash', name: '灰分', energyFactor: 0 },
  { key: 'moisture', name: '水分', energyFactor: 0 }
] as const

const rows = computed(() => {
  const a = props.assessment
  if (!a) return []
  const totalWeightG = a.totalWeightG
  const energyKcal = a.totalEnergyKcal
  return MACRO_DETAIL_DEFINITIONS.map((def) => {
    const metric = a.macroMetrics?.[def.key]
    const total = metric?.total ?? null
    const weightPct =
      total != null && totalWeightG > 0 ? (total * 100) / totalWeightG : null
    const energyPct =
      total != null && energyKcal != null && energyKcal > 0
        ? (total * def.energyFactor * 100) / energyKcal
        : null
    return {
      key: def.key,
      name: def.name,
      weightPctText: weightPct == null ? '—' : `${weightPct.toFixed(1)}%`,
      dryMatterPctText:
        metric?.dryMatterPercent == null ? '—' : `${metric.dryMatterPercent.toFixed(1)}%`,
      energyPctText: energyPct == null ? '—' : `${energyPct.toFixed(1)}%`
    }
  })
})

const densityRows = computed(() => {
  const a = props.assessment
  if (!a) return []
  const perKg = a.energyDensityKcalPerKg
  const dryPerKg =
    a.dryMatterEnergyKcalPer100g != null ? a.dryMatterEnergyKcalPer100g * 10 : null
  return [
    { label: '每公斤配方', value: perKg == null ? '—' : `${Math.round(perKg)} kcal/kg` },
    { label: '每公斤干物质', value: dryPerKg == null ? '—' : `${Math.round(dryPerKg)} kcal/kg DM` }
  ]
})
</script>

<style scoped>
.macro-composition {
  display: flex;
  flex-direction: column;
}
.mc-banner {
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  color: #303133;
  border-top: 1px solid #e4e7ed;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
}
.mc-body {
  padding: 12px;
}
.mc-table {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.mc-row {
  display: flex;
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}
.mc-row span {
  flex: 1;
  text-align: right;
}
.mc-row span:first-child {
  flex: 1.3;
  text-align: left;
}
.mc-head {
  font-size: 11px;
  color: #909399;
  font-weight: 600;
}
.mc-density {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mc-density-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.mc-density-label {
  color: #909399;
}
.mc-density-value {
  font-weight: 600;
  color: #303133;
}
</style>
