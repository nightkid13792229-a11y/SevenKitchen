<template>
  <el-drawer v-model="visible" size="760px" destroy-on-close>
    <template #header>
      <div class="nutrition-report__heading">
        <div class="nutrition-report__heading-text">
          <span class="nutrition-report__title">营养报告</span>
          <span class="nutrition-report__subtitle">
            发布口径 · 只读
          </span>
        </div>
        <el-tag
          v-if="isStale"
          size="small"
          type="warning"
          effect="dark"
        >已过期</el-tag>
      </div>
    </template>

    <div class="nutrition-report">
      <div
        v-if="showMeta"
        class="nutrition-report__toolbar"
      >
        <span class="nutrition-report__meta">
          生成时间：{{ generatedAtLabel }}
        </span>
        <span
          v-if="props.snapshot?.revision != null"
          class="nutrition-report__meta"
        >内容版本：v{{ props.snapshot?.revision }}</span>
      </div>

      <el-alert
        v-if="isStale"
        class="nutrition-report__stale"
        type="warning"
        :closable="false"
        show-icon
        title="报告已过期"
        description="报告生成后草稿内容又改过，下面的数字可能不是最新的。回到上线检查点「报告已过期，重新生成」即可更新。"
      />

      <div v-if="props.loading" class="nutrition-report__loading">
        <el-skeleton :rows="6" animated />
      </div>

      <div v-else-if="props.error" class="nutrition-report__error">
        <el-alert
          type="error"
          :closable="false"
          show-icon
          title="营养报告加载失败"
          :description="props.error"
        />
        <el-button
          type="primary"
          @click="emit('retry')"
        >重试</el-button>
      </div>

      <el-empty
        v-else-if="!report"
        description="还没有生成营养报告"
      />

      <div v-else class="nutrition-report__content">
        <section class="nutrition-report__section">
          <div class="nutrition-report__section-title">食谱原料清单</div>
          <table class="report-table">
            <thead>
              <tr>
                <th class="col-name">原料</th>
                <th class="col-number">用量 / 浓度</th>
                <th class="col-number">重量占比</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="ingredientRows.length === 0">
                <td colspan="3" class="empty-cell">暂无数据</td>
              </tr>
              <tr
                v-for="row in ingredientRows"
                :key="row.ingredientName"
              >
                <td class="col-name">{{ row.ingredientName }}</td>
                <td class="col-number">{{ row.amountLabel }}</td>
                <td class="col-number">{{ row.weightPercentLabel }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="nutrition-report__section">
          <div class="nutrition-report__section-title">宏量营养分析</div>
          <table class="report-table">
            <thead>
              <tr>
                <th class="col-name">项目</th>
                <th class="col-number">占配方</th>
                <th class="col-number">占干物质</th>
                <th class="col-number">占热量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="macroRows.length === 0">
                <td colspan="4" class="empty-cell">暂无数据</td>
              </tr>
              <tr
                v-for="row in macroRows"
                :key="row.key"
              >
                <td class="col-name">{{ row.name }}</td>
                <td class="col-number">{{ row.weightPercentLabel }}</td>
                <td class="col-number">{{ row.dryMatterLabel }}</td>
                <td class="col-number">{{ row.energyPercentLabel }}</td>
              </tr>
            </tbody>
          </table>

          <div
            v-if="energyDensityRows.length"
            class="nutrition-report__energy-list"
          >
            <div
              v-for="row in energyDensityRows"
              :key="row.label"
              class="nutrition-report__energy-row"
            >
              <span class="nutrition-report__energy-label">{{ row.label }}</span>
              <span class="nutrition-report__energy-value">{{ row.value }}</span>
            </div>
          </div>
        </section>

        <section
          v-for="section in nutrientSections"
          :key="section.key"
          class="nutrition-report__section"
        >
          <div class="nutrition-report__section-title">{{ section.title }}</div>
          <table class="report-table">
            <thead>
              <tr>
                <th class="col-name">营养素</th>
                <th class="col-unit">单位</th>
                <th class="col-number">标准下限</th>
                <th class="col-number">标准上限</th>
                <th class="col-number">食谱含量</th>
                <th class="col-number">{{ section.dryMatterHeader || '/100gDM' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="section.rows.length === 0">
                <td colspan="6" class="empty-cell">暂无数据</td>
              </tr>
              <tr
                v-for="row in section.rows"
                :key="row.key || row.name"
                :class="nutrientRowStatusClass(row.status)"
              >
                <td class="col-name">{{ row.name }}</td>
                <td class="col-unit">{{ row.unit }}</td>
                <td class="col-number">{{ row.minLabel }}</td>
                <td class="col-number">{{ row.maxLabel }}</td>
                <td class="col-number">{{ row.currentLabel }}</td>
                <td class="col-number">{{ row.dryMatterLabel }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <p class="nutrition-report__footer-note">
          报告按服务器上已保存的草稿生成；刚修改过的内容请先保存，再回上线检查重新生成。
        </p>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DraftNutritionReportEnvelope } from '@/types/recipeDesigner'
import { formatDateTime } from '@/utils/date'
import {
  buildNutrientSectionList,
  hasNutritionReportMeta,
  nutrientRowStatusClass,
  orderEnergyDensityRows
} from '@/utils/recipeDesigner/nutritionReport'

const props = defineProps<{
  modelValue: boolean
  snapshot: DraftNutritionReportEnvelope | null
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'retry'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const report = computed(() => props.snapshot?.report ?? null)
const isStale = computed(() => Boolean(props.snapshot?.stale))
const showMeta = computed(() => hasNutritionReportMeta(props.snapshot))
const generatedAtLabel = computed(() => formatDateTime(props.snapshot?.generatedAt))
const ingredientRows = computed(() => report.value?.ingredientRows ?? [])
const macroRows = computed(() => report.value?.macroRows ?? [])
const energyDensityRows = computed(() =>
  orderEnergyDensityRows(report.value?.energyDensityRows ?? [])
)
const nutrientSections = computed(() =>
  buildNutrientSectionList(report.value?.nutrientSections)
)
</script>

<style scoped>
.nutrition-report__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.nutrition-report__heading-text {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.nutrition-report__title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.nutrition-report__subtitle {
  font-size: 12px;
  color: #909399;
}

.nutrition-report {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
}

.nutrition-report__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f5f7fa;
}

.nutrition-report__meta {
  font-size: 12px;
  color: #606266;
}

.nutrition-report__stale :deep(.el-alert__description) {
  font-size: 12px;
  line-height: 1.6;
}

.nutrition-report__loading {
  padding: 8px 0;
}

.nutrition-report__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.nutrition-report__content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nutrition-report__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nutrition-report__section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}

.report-table th,
.report-table td {
  border: 1px solid #ebeef5;
  padding: 8px 10px;
  line-height: 1.5;
  text-align: left;
  word-break: break-word;
}

.report-table th {
  background: #f5f7fa;
  color: #606266;
  font-weight: 600;
}

.report-table .col-name {
  width: 30%;
}

.report-table .col-unit {
  width: 12%;
}

.report-table .col-number {
  width: 16%;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.empty-cell {
  text-align: center !important;
  color: #909399;
}

.nutrition-report__energy-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fafafa;
}

.nutrition-report__energy-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nutrition-report__energy-label {
  font-size: 12px;
  color: #909399;
}

.nutrition-report__energy-value {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

.report-table tr.is-deficient td {
  background: #fef0f0;
}

.report-table tr.is-excess td {
  background: #fdf6ec;
}

.report-table tr.is-missing td {
  background: #f4f4f5;
  color: #909399;
}

.nutrition-report__footer-note {
  margin: 0;
  padding-top: 4px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
</style>
