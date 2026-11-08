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
        <text class="nutrition-cell__value">{{ cell.value }}<text v-if="cell.unit" class="nutrition-cell__unit">{{ cell.unit }}</text></text>
        <text class="nutrition-cell__label">{{ cell.label }}</text>
      </view>
    </view>

    <!--
      口径说明（2026-11-07）：
      蛋白/脂肪/灰分/纤维/碳水 是**干物质（DM）占比**，含水量是实际含水率 ——
      与食谱详情页同一句，避免家长拿鲜食的 DM 值去和膨化粮包装上的湿基值比。
    -->
    <text v-if="cells.length" class="nutrition-card__basis">
      以上营养指标按干物质（DM）计，即去除水分后的占比；含水量为实际含水率。
    </text>

    <!--
      2026-11-08 审核：卡内的「查看完整营养报告」入口已删除。
      它唯一的调用方（交付页）一直传 `report-available=false`，
      `open-report` 也没有任何监听者 —— 是死代码。
      报告入口现在是独立板块（`NutritionReportEntry`），显示与否由
      「交付快照里有没有冻结报告」决定；留着旧入口的默认值 true，
      将来谁再用这张卡就会把旧文案带回来。
    -->
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getNutritionStandardLabel } from '@/utils/label-mapping'

/**
 * 8 项的显示顺序、单位与标签。
 *
 * ⚠️ **顺序写死在这里**，不由后端传 —— 后端只给数字，
 * 顺序是"产品决定"（谁在前谁在后影响阅读）。
 * 8 项正好填满 4×2 网格，多一项少一项都会破版。
 *
 * 单位跟数字一起画在格子里（2026-11-07 老板指出：只显示 38.2 没有 %，
 * 会被读成"38.2 克"或"38.2 倍"）。能量按**每公斤**给，钙磷比给 `N:1`。
 */
const MACRO_CELLS = [
  { key: 'proteinPercent', label: '蛋白质', unit: '%' },
  { key: 'fatPercent', label: '脂肪', unit: '%' },
  { key: 'ashPercent', label: '灰分', unit: '%' },
  { key: 'moisturePercent', label: '含水量', unit: '%' },
  { key: 'crudeFiberPercent', label: '膳食纤维', unit: '%' },
  { key: 'carbohydratePercent', label: '碳水', unit: '%' },
  { key: 'energyDensityKcalPerKg', label: '能量密度', unit: 'kcal/kg' },
  { key: 'calciumPhosphorusRatio', label: '钙磷比', unit: '' },
] as const

type MacroKey = (typeof MACRO_CELLS)[number]['key']

const props = withDefaults(
  defineProps<{
    /** 快照里的 `nutrition.standard`（如 `FEDIAF_2021`）；为空则整行不显示 */
    standard?: string | null
    /** 快照里的 `nutrition.macros`；缺项显示「—」 */
    macros?: Record<string, number | null> | null
    /** 页面已有独立的全营养标准 banner 时，关掉卡片里这行，避免重复 */
    showStandard?: boolean
  }>(),
  {
    standard: null,
    macros: null,
    showStandard: true,
  },
)

const standardLabel = computed(() => {
  const value = (props.standard || '').trim()
  if (!value) return ''
  // 已经带年号的直接拼"犬营养标准"；未知编码原样回显，不猜
  return `${getNutritionStandardLabel(value)} 犬营养标准`
})

/**
 * 数值格式。
 *
 * · 能量密度：后端存的就是 **kcal/kg**（如 1144），按每公斤原样显示，
 *   不再折成每克 —— 鲜食一克只有 1 点几卡，写成 1.14 kcal/g 没人有感觉。
 * · 钙磷比：必须写成 `1.35:1`。只写 1.35 会被读成"1.35 倍"，
 *   而它的意思是"钙是磷的 1.35 倍"，即 1.35 : 1。
 */
function formatValue(key: MacroKey, raw: number | null): string {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return '—'
  if (key === 'energyDensityKcalPerKg') return String(Math.round(raw))
  if (key === 'calciumPhosphorusRatio') {
    return `${Math.round(raw * 100) / 100}:1`
  }
  return String(Math.round(raw * 10) / 10)
}

const cells = computed(() => {
  const macros = props.macros
  if (!macros) return []
  return MACRO_CELLS.map((cell) => ({
    key: cell.key,
    label: cell.label,
    unit: cell.unit,
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
  /* 「1144 kcal/kg」不能被拆成两行 */
  white-space: nowrap;
}

/* 单位跟在数字后面，比数字小一号：不抢眼，但不能少（少了 38.2 就说不清是什么） */
.nutrition-cell__unit {
  font-size: 18rpx;
  font-weight: 700;
  color: #b45309;
  margin-left: 2rpx;
}

.nutrition-cell__label {
  font-size: 18rpx;
  color: #9c8b76;
  margin-top: 2rpx;
}

.nutrition-card__basis {
  display: block;
  margin-top: 18rpx;
  padding-top: 14rpx;
  border-top: 1px solid #f4ebe0;
  font-size: 18rpx;
  line-height: 1.5;
  color: #9c8b76;
  text-align: center;
}

</style>
