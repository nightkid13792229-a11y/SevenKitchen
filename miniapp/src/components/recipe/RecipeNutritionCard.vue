<template>
  <!--
    核心营养成分 · 交付第 1 页 + 详情页共用（2026-10-18 抽出）

    ## 它把三块合成一块

    原来这三样分散在页面上：
      · 营养标准背书（「符合 FEDIAF 犬营养标准」）
      · 8 项营养数值（蛋白质/脂肪/灰分/含水量/膳食纤维/碳水/能量密度/钙磷比）
      · 「查看完整营养报告 ›」入口（原来在页面最底部）
    老板审原型时要求合成一块，并把报告入口**并进来** ——
    因为顾客看完数值立刻想看细节，不该让他滚到页底去找。

    ## 为什么缺的值显示「—」而不是 0

    `0%` 和"没算出来"是两回事：前者会让顾客以为"这道食谱不含脂肪"。
    所以缺失一律给「—」。
  -->
  <view class="nutrition-card">
    <view class="nutrition-card__header">
      <text class="nutrition-card__title">核心营养成分</text>
    </view>

    <!-- 标准背书：只在有 standard 时出现，不给一个空标签；页面已有 banner 时可关闭 -->
    <view v-if="showStandard && standardLabel" class="nutrition-card__standard">
      <text class="nutrition-card__standard-text">✓ 符合 {{ standardLabel }}</text>
    </view>

    <view v-if="cells.length" class="nutrition-card__grid">
      <view v-for="cell in cells" :key="cell.key" class="nutrition-cell">
        <text class="nutrition-cell__value">{{ cell.value }}</text>
        <text class="nutrition-cell__label">{{ cell.label }}</text>
      </view>
    </view>

    <!-- 报告入口：整块内，居中 -->
    <view
      v-if="reportAvailable"
      class="nutrition-card__report"
      @tap="emit('open-report')"
    >
      <text class="nutrition-card__report-text">查看完整营养报告 ›</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getNutritionStandardLabel } from '@/utils/label-mapping'

/**
 * 8 项的显示顺序与单位。
 *
 * ⚠️ **顺序写死在这里**，不由后端传 —— 后端只给数字，
 * 顺序是"产品决定"（谁在前谁在后影响阅读）。
 * 8 项正好填满 4×2 网格，多一项少一项都会破版。
 */
const MACRO_CELLS = [
  { key: 'proteinPercent', label: '蛋白质', unit: '%' },
  { key: 'fatPercent', label: '脂肪', unit: '%' },
  { key: 'ashPercent', label: '灰分', unit: '%' },
  { key: 'moisturePercent', label: '含水量', unit: '%' },
  { key: 'crudeFiberPercent', label: '膳食纤维', unit: '%' },
  { key: 'carbohydratePercent', label: '碳水', unit: '%' },
  { key: 'energyDensityKcalPerKg', label: 'kcal/g', unit: '' },
  { key: 'calciumPhosphorusRatio', label: '钙磷比', unit: '' },
] as const

type MacroKey = (typeof MACRO_CELLS)[number]['key']

const props = withDefaults(
  defineProps<{
    /** 快照里的 `nutrition.standard`（如 `FEDIAF_2021`）；为空则整行不显示 */
    standard?: string | null
    /** 快照里的 `nutrition.macros`；缺项显示「—」 */
    macros?: Record<string, number | null> | null
    /** 有没有"完整报告"可看；没有就不显示那个入口 */
    reportAvailable?: boolean
    /** 页面已有独立的全营养标准 banner 时，关掉卡片里这行，避免重复 */
    showStandard?: boolean
  }>(),
  {
    standard: null,
    macros: null,
    reportAvailable: true,
    showStandard: true,
  },
)

const emit = defineEmits<{ (event: 'open-report'): void }>()

const standardLabel = computed(() => {
  const value = (props.standard || '').trim()
  if (!value) return ''
  // 已经带年号的直接拼"犬营养标准"；未知编码原样回显，不猜
  return `${getNutritionStandardLabel(value)} 犬营养标准`
})

/** 能量密度后端按 kcal/kg 存，这里换算成 kcal/g 显示 */
function formatValue(key: MacroKey, raw: number | null): string {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return '—'
  if (key === 'energyDensityKcalPerKg') {
    // 3200 kcal/kg → 3.2 kcal/g。两位小数以内，去掉多余的 0
    return String(Math.round((raw / 1000) * 100) / 100)
  }
  if (key === 'calciumPhosphorusRatio') return String(Math.round(raw * 100) / 100)
  return String(Math.round(raw * 10) / 10)
}

const cells = computed(() => {
  const macros = props.macros
  if (!macros) return []
  return MACRO_CELLS.map((cell) => ({
    key: cell.key,
    label: cell.label,
    value: formatValue(cell.key, (macros[cell.key] ?? null) as number | null),
  }))
})
</script>

<style scoped lang="scss">
.nutrition-card {
  background: #fff;
  border: 1px solid #ede0d0;
  border-radius: 30rpx;
  padding: 30rpx 28rpx 24rpx;
}

.nutrition-card__header {
  display: flex;
  justify-content: center;
}

.nutrition-card__title {
  font-size: 30rpx;
  font-weight: 800;
  letter-spacing: 1rpx;
  color: #3f3222;
}

.nutrition-card__standard {
  display: flex;
  justify-content: center;
  margin-top: 18rpx;
}

.nutrition-card__standard-text {
  font-size: 22rpx;
  color: #1e5b35;
}

.nutrition-card__grid {
  display: flex;
  flex-wrap: wrap;
  margin-top: 26rpx;
  padding-top: 24rpx;
  border-top: 1px solid #f4ebe0;
}

/* 4 列 × 2 行：用 25% 宽 + padding 造间隙，比 gap 在旧基础库上更稳 */
.nutrition-cell {
  width: 25%;
  box-sizing: border-box;
  padding: 8rpx 4rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.nutrition-cell__value {
  font-size: 28rpx;
  font-weight: 800;
  color: #b45309;
}

.nutrition-cell__label {
  font-size: 18rpx;
  color: #9c8b76;
  margin-top: 2rpx;
}

.nutrition-card__report {
  display: flex;
  justify-content: center;
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1px dashed #f0e6d8;
}

.nutrition-card__report-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #b45309;
}
</style>
