<template>
  <view class="nutrition-report-page">
    <view v-if="loading" class="state-panel">
      <text>加载营养报告中...</text>
    </view>

    <view v-else-if="!report" class="state-panel">
      <text class="state-title">暂无完整营养报告</text>
      <text class="state-copy">该食谱还没有 Setar 生成的结构化营养报告。</text>
    </view>

    <view v-else>
      <view class="section recipe-summary-section">
        <view class="summary-title-row">
          <view class="summary-title-main">
            <image class="summary-logo" src="/static/logo.png" mode="aspectFit" />
            <text class="page-title">基础信息</text>
          </view>
        </view>
        <view class="summary-row">
          <text class="summary-label">食谱名称</text>
          <text class="summary-value recipe-name-value">{{ recipe.name || '完整营养报告' }}</text>
        </view>
        <view class="summary-row">
          <text class="summary-label">遵循标准</text>
          <text class="summary-value standard-name-value">{{ standardName }}</text>
        </view>
      </view>

      <view class="report-heading">
        <text class="report-title">营养报告</text>
      </view>

      <view v-if="ingredientRows.length > 0" class="section">
        <text class="section-title">食谱原料清单</text>
        <scroll-view scroll-x class="report-table-scroll">
          <view class="report-table ingredient-table">
            <view class="table-row table-head">
              <text class="table-cell ingredient-name-cell">原料</text>
              <text class="table-cell amount-cell">用量</text>
              <text class="table-cell percent-cell">重量占比</text>
            </view>
            <view v-for="row in ingredientRows" :key="row.ingredientName" class="table-row">
              <text class="table-cell ingredient-name-cell">{{ row.ingredientName }}</text>
              <text class="table-cell amount-cell">{{ row.amountLabel }}</text>
              <text class="table-cell percent-cell">{{ row.weightPercentLabel }}</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <view v-if="macroRows.length > 0 || energyDensityRows.length > 0" class="section">
        <text class="section-title">宏量营养分析</text>
        <scroll-view v-if="macroRows.length > 0" scroll-x class="report-table-scroll">
          <view class="report-table macro-table">
            <view class="table-row table-head">
              <text class="table-cell nutrient-name-cell">项目</text>
              <text class="table-cell report-number-cell">占配方</text>
              <text class="table-cell report-number-cell">占干物质</text>
              <text class="table-cell report-number-cell">占热量</text>
            </view>
            <view v-for="row in macroRows" :key="row.key" class="table-row">
              <text class="table-cell nutrient-name-cell">{{ row.name }}</text>
              <text class="table-cell report-number-cell">{{ row.weightPercentLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.dryMatterLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.energyPercentLabel }}</text>
            </view>
          </view>
        </scroll-view>
        <view v-if="energyDensityRows.length > 0" class="energy-density-list">
          <view v-for="row in energyDensityRows" :key="row.label" class="energy-density-row">
            <text class="energy-density-label">能量密度 · {{ row.label }}</text>
            <text class="energy-density-value">{{ row.value }}</text>
          </view>
        </view>
      </view>

      <view
        v-for="section in nutrientSections"
        :key="section.key"
        class="section"
      >
        <text class="section-title">{{ section.title }}</text>
        <scroll-view scroll-x class="report-table-scroll">
          <view class="report-table nutrient-table">
            <view class="table-row table-head">
              <text class="table-cell nutrient-name-cell">营养素</text>
              <text class="table-cell unit-cell">单位</text>
              <view class="table-cell report-number-cell stacked-head">
                <text>下限</text>
                <text>/1,000kcal</text>
              </view>
              <view class="table-cell report-number-cell stacked-head">
                <text>上限</text>
                <text>/1,000kcal</text>
              </view>
              <text class="table-cell report-number-cell">食谱含量</text>
              <text class="table-cell report-number-cell">{{ section.dryMatterHeader || '干物质/100g' }}</text>
            </view>
            <view v-for="row in section.rows" :key="row.key || row.name" :class="['table-row', getRowStatusClass(row)]">
              <text class="table-cell nutrient-name-cell">{{ row.name }}</text>
              <text class="table-cell unit-cell">{{ row.unit || '-' }}</text>
              <text class="table-cell report-number-cell">{{ row.minLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.maxLabel }}</text>
              <text class="table-cell report-number-cell report-current-cell">{{ row.currentLabel }}</text>
              <text class="table-cell report-number-cell">{{ row.dryMatterLabel || '-' }}</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { request } from '../../utils/api'
import { getScenarioLabel } from '../recipe-designer/assessment'

interface NutritionReport {
  ingredientRows?: Array<Record<string, any>>
  macroRows?: Array<Record<string, any>>
  energyDensityRows?: Array<Record<string, any>>
  nutrientSections?: Record<string, NutritionSection>
}

interface NutritionSection {
  key: string
  title: string
  dryMatterHeader: string
  rows: Array<Record<string, any>>
}

const loading = ref(false)
const recipeId = ref('')
const shareToken = ref('')
const recipe = ref<any>({})
const report = ref<NutritionReport | null>(null)

const ingredientRows = computed(() => report.value?.ingredientRows || [])
const macroRows = computed(() => report.value?.macroRows || [])
const energyDensityRows = computed(() => report.value?.energyDensityRows || [])
const standardName = computed(() => {
  const standard = recipe.value?.nutritionDetailedData?.standard || recipe.value?.nutritionStandard
  const scenario = recipe.value?.nutritionDetailedData?.scenario
  return scenario
    ? `${getNutritionStandardLabel(standard)} · ${getScenarioLabel(scenario)}`
    : getNutritionStandardLabel(standard)
})
const nutrientSections = computed(() => {
  const sections = report.value?.nutrientSections || {}
  return ['minerals', 'vitamins', 'aminoAcids', 'fattyAcids']
    .map((key) => sections[key])
    .filter((section) => section && Array.isArray(section.rows) && section.rows.length > 0)
})

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any
  recipeId.value = currentPage.options?.recipeId || ''
  shareToken.value = currentPage.options?.shareToken || ''
  loadNutritionReport()
})

function loadNutritionReport() {
  if (!recipeId.value) return
  loading.value = true
  const data: Record<string, string> = {}
  if (shareToken.value) data.shareToken = shareToken.value

  request({
    url: `/recipes/${recipeId.value}`,
    method: 'GET',
    data,
  }).then((res: any) => {
    if (res.code === 0 && res.data) {
      recipe.value = res.data
      report.value = res.data.nutritionDetailedData?.report || null
    }
  }).catch((error: any) => {
    console.error('[RecipeNutritionReport] Failed to load report:', error)
    uni.showToast({ title: '营养报告加载失败', icon: 'none' })
  }).finally(() => {
    loading.value = false
  })
}

function getNutritionStandardLabel(standard: string): string {
  const map: Record<string, string> = {
    FEDIAF_2021: 'FEDIAF 2021',
    FEDIAF_2025: 'FEDIAF 2025',
    AAFCO_2019: 'AAFCO 2019',
    GB_T_31216: '国标 GB/T 31216',
  }
  return map[standard] || standard || '-'
}

function getRowStatusClass(row: Record<string, any>) {
  if (row.statusClass) return row.statusClass
  const map: Record<string, string> = {
    COMPLIANT: 'status-compliant',
    DEFICIENT: 'status-deficient',
    EXCESS: 'status-excess',
    MISSING_DATA: 'status-missing',
    INFO: 'status-info',
  }
  return map[String(row.status || '')] || ''
}
</script>

<style scoped lang="scss">
.nutrition-report-page {
  min-height: 100vh;
  padding: 24rpx 28rpx 40rpx;
  background: #f6f7f9;
  box-sizing: border-box;
}

.state-panel,
.section {
  background: #fff;
  border-radius: 8rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.04);
}

.state-panel {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  align-items: center;
  color: #666;
}

.state-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.state-copy {
  font-size: 24rpx;
  color: #999;
}

.recipe-summary-section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.summary-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-title-main {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.summary-logo {
  width: 46rpx;
  height: 46rpx;
  border-radius: 8rpx;
}

.page-title,
.report-title {
  color: #111827;
  font-size: 34rpx;
  font-weight: 700;
}

.summary-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
}

.summary-label {
  flex: 0 0 150rpx;
  color: #6b7280;
  font-size: 25rpx;
}

.summary-value {
  flex: 1;
  color: #111827;
  font-size: 27rpx;
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.report-heading {
  padding: 8rpx 4rpx 20rpx;
}

.section-title {
  display: block;
  margin-bottom: 20rpx;
  color: #111827;
  font-size: 30rpx;
  font-weight: 700;
}

.report-table-scroll {
  width: 100%;
}

.report-table {
  min-width: 920rpx;
  border: 1rpx solid #e5e7eb;
  border-bottom: 0;
  border-radius: 8rpx;
  overflow: hidden;
}

.ingredient-table {
  min-width: 760rpx;
}

.macro-table {
  min-width: 860rpx;
}

.nutrient-table {
  min-width: 1120rpx;
}

.table-row {
  display: flex;
  min-height: 76rpx;
  border-bottom: 1rpx solid #e5e7eb;
  background: #fff;
}

.table-head {
  min-height: 72rpx;
  background: #f3f4f6;
}

.table-cell {
  display: flex;
  align-items: center;
  padding: 14rpx 16rpx;
  box-sizing: border-box;
  color: #1f2937;
  font-size: 24rpx;
  line-height: 1.35;
  border-right: 1rpx solid #e5e7eb;
}

.table-head .table-cell {
  color: #374151;
  font-weight: 700;
}

.table-cell:last-child {
  border-right: 0;
}

.ingredient-name-cell {
  width: 420rpx;
}

.amount-cell {
  width: 160rpx;
  justify-content: flex-end;
  text-align: right;
}

.nutrient-name-cell {
  width: 220rpx;
}

.unit-cell {
  width: 140rpx;
}

.percent-cell,
.report-number-cell {
  width: 180rpx;
  justify-content: flex-end;
  text-align: right;
}

.stacked-head {
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 2rpx;
}

.status-deficient .nutrient-name-cell,
.status-deficient .report-current-cell,
.status-excess .nutrient-name-cell,
.status-excess .report-current-cell {
  color: #dc2626;
  font-weight: 700;
}

.energy-density-list {
  margin-top: 22rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.energy-density-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 18rpx;
  border-radius: 8rpx;
  background: #f8fafc;
}

.energy-density-label {
  color: #64748b;
  font-size: 24rpx;
}

.energy-density-value {
  color: #0f172a;
  font-size: 26rpx;
  font-weight: 700;
}
</style>
