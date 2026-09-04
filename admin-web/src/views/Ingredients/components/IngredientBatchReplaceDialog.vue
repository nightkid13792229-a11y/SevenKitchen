<template>
  <el-dialog
    :model-value="visible"
    title="批量替换原料"
    width="960px"
    top="6vh"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="handleVisibleChange"
  >
    <div v-if="fromIngredient" class="batch-replace-root">
      <!-- 顶部：被替换原料信息 -->
      <el-alert type="info" :closable="false" class="from-alert">
        <template #title>
          将把「{{ fromIngredient.name
          }}{{ fromIngredient.brand ? ` · ${fromIngredient.brand}` : ''
          }}{{ fromIngredient.productModel ? ` · ${fromIngredient.productModel}` : '' }}」批量替换为新原料
        </template>
      </el-alert>

      <!-- 第一步：选新原料 + 选食谱 -->
      <template v-if="step === 'config'">
        <el-form label-width="90px" class="config-form">
          <el-form-item label="替换为" required>
            <el-select
              v-model="toIngredientId"
              filterable
              placeholder="选择同类型的新原料"
              style="width: 100%"
              :loading="loadingCandidates"
            >
              <el-option
                v-for="candidate in candidateIngredients"
                :key="candidate.id"
                :value="candidate.id"
                :label="candidateLabel(candidate)"
              >
                <div class="candidate-option">
                  <span>{{ candidate.name }}</span>
                  <span v-if="candidate.brand || candidate.productModel" class="candidate-spec">
                    {{ [candidate.brand, candidate.productModel].filter(Boolean).join(' · ') }}
                  </span>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
        </el-form>

        <div class="recipe-scope-header">
          <div class="scope-title">
            选择要替换的食谱（共 {{ affectedRecipes.length }} 个）
          </div>
          <el-radio-group v-model="scopeFilter" size="small">
            <el-radio-button label="ALL">全部</el-radio-button>
            <el-radio-button label="PUBLIC">已发布</el-radio-button>
            <el-radio-button label="DRAFT">草稿</el-radio-button>
          </el-radio-group>
        </div>

        <el-table
          ref="scopeTableRef"
          v-loading="loadingAffected"
          :data="filteredAffectedRecipes"
          size="small"
          max-height="320"
          @selection-change="handleScopeSelectionChange"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column prop="recipeName" label="食谱名称" min-width="180" />
          <el-table-column label="状态" width="86">
            <template #default="{ row }">
              <el-tag :type="row.status === 'PUBLIC' ? 'success' : 'info'" size="small">
                {{ row.status === 'PUBLIC' ? '已发布' : '草稿' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="version" label="版本" width="64" />
          <el-table-column label="用量 / 目标" min-width="220">
            <template #default="{ row }">
              <span class="usage-text">{{ row.itemsUsageText }}</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="empty-tip" v-if="affectedRecipes.length === 0 && !loadingAffected">
          没有食谱使用该原料
        </div>
      </template>

      <!-- 第二步：预览影响 -->
      <template v-else-if="step === 'preview'">
        <div class="preview-toolbar">
          <el-button size="small" @click="backToConfig">返回调整</el-button>
          <span class="preview-hint">
            下表为替换并重算后的营养报告对比；食材可修改每份克数，补剂可修改营养目标值（改后需点击「重新预览」生效）。
          </span>
        </div>

        <div
          v-for="result in previewResults"
          :key="result.recipeId"
          class="preview-card"
        >
          <div class="preview-card-header">
            <div class="preview-card-title">
              {{ result.recipeName }}
              <el-tag size="small" :type="result.ok ? 'success' : 'danger'" style="margin-left: 8px">
                {{ result.ok ? '可替换' : '无法替换' }}
              </el-tag>
            </div>
            <div class="dose-summary" v-if="result.supplementDoses.length > 0">
              <span v-for="dose in result.supplementDoses" :key="dose.recipeItemId">
                理论用量 ≈ {{ formatNumber(dose.amount) }} {{ dose.unit }}
              </span>
            </div>
          </div>

          <!-- 用量微调区 -->
          <div class="override-row" v-if="overrideRowsByRecipe.get(result.recipeId)?.length">
            <div
              v-for="row in overrideRowsByRecipe.get(result.recipeId)"
              :key="row.recipeItemId"
              class="override-item"
            >
              <span class="override-label">{{ row.label }}</span>
              <el-input-number
                v-if="row.kind === 'FOOD'"
                v-model="row.newWeight"
                :min="0"
                :max="10000"
                :precision="1"
                :step="5"
                size="small"
                controls-position="right"
                placeholder="保持原克数"
              />
              <el-input-number
                v-else
                v-model="row.newTarget"
                :min="0"
                :max="1000000"
                :precision="2"
                size="small"
                controls-position="right"
                placeholder="保持原目标"
              />
              <span class="override-unit">{{ row.unit }}</span>
            </div>
            <el-button
              v-if="overrideRowsByRecipe.get(result.recipeId)?.length"
              size="small"
              type="primary"
              plain
              :loading="previewLoading"
              @click="refreshPreview"
            >
              重新预览
            </el-button>
          </div>

          <!-- 营养报告对比 -->
          <el-table :data="summaryCompareRows(result)" size="small" border class="compare-table">
            <el-table-column prop="label" label="指标" width="150" />
            <el-table-column label="替换前" width="130">
              <template #default="{ row }">
                {{ formatSummaryValue(result.before?.[row.key]) }}
              </template>
            </el-table-column>
            <el-table-column label="替换后" width="130">
              <template #default="{ row }">
                <span :class="{ changed: rowChanged(result, row.key) }">
                  {{ formatSummaryValue(result.after?.[row.key]) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="变化" width="110">
              <template #default="{ row }">
                {{ diffLabel(result, row.key) }}
              </template>
            </el-table-column>
          </el-table>

          <div v-if="result.warnings.length > 0" class="preview-warnings">
            <el-alert
              v-for="warning in result.warnings"
              :key="warning"
              :title="warning"
              type="warning"
              :closable="false"
              class="warning-line"
            />
          </div>
        </div>
      </template>

      <!-- 第三步：执行结果 -->
      <template v-else>
        <div class="done-summary">
          <el-alert
            :type="failedCount > 0 ? 'warning' : 'success'"
            :closable="false"
            :title="`批量替换完成：成功 ${successCount} 个食谱${failedCount > 0 ? `，失败 ${failedCount} 个` : ''}`"
          />
        </div>
        <el-table :data="executeResults" size="small" class="done-table">
          <el-table-column prop="recipeName" label="食谱" min-width="200" />
          <el-table-column label="结果" width="90">
            <template #default="{ row }">
              <el-tag :type="row.ok ? 'success' : 'danger'" size="small">
                {{ row.ok ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="版本" width="120">
            <template #default="{ row }">
              <span v-if="row.ok">v{{ row.versionBefore }} → v{{ row.versionAfter }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <template #footer>
      <template v-if="step === 'config'">
        <el-button @click="handleVisibleChange(false)">取消</el-button>
        <el-button
          type="primary"
          :disabled="!toIngredientId || selectedRecipeIds.length === 0"
          :loading="previewLoading"
          @click="runPreview"
        >
          预览影响
        </el-button>
      </template>
      <template v-else-if="step === 'preview'">
        <el-button @click="backToConfig">上一步</el-button>
        <el-button
          type="primary"
          :disabled="!canExecute"
          :loading="executing"
          @click="runExecute"
        >
          确认执行替换
        </el-button>
      </template>
      <template v-else>
        <el-button type="primary" @click="closeAfterDone">完成</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ingredientApi, type BatchReplaceAffectedRecipe, type BatchReplacePreviewRecipeResult, type BatchReplaceExecuteRecipeResult } from '@/api/ingredients'
import { listSupplementTargetFields, listDerivedNutritionFields } from '@/utils/recipeDesigner/nutritionFieldCatalog'
import type { Ingredient } from '@/types/ingredient'

const props = defineProps<{
  visible: boolean
  fromIngredient: Ingredient | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success'): void
}>()

type Step = 'config' | 'preview' | 'done'

const SUMMARY_FIELDS: Array<{ key: string; label: string; unit: string }> = [
  { key: 'energy_density_kcal_per_kg', label: '能量密度', unit: 'kcal/kg' },
  { key: 'moisture_pct', label: '水分', unit: '%' },
  { key: 'protein_dm_pct', label: '蛋白质（干物质）', unit: '%' },
  { key: 'fat_dm_pct', label: '脂肪（干物质）', unit: '%' },
  { key: 'fiber_dm_pct', label: '纤维（干物质）', unit: '%' },
  { key: 'ash_dm_pct', label: '灰分（干物质）', unit: '%' },
  { key: 'carbs_dm_pct', label: '碳水（干物质）', unit: '%' },
  { key: 'ca_p_ratio', label: '钙磷比', unit: ':1' },
]

const step = ref<Step>('config')
const loadingCandidates = ref(false)
const loadingAffected = ref(false)
const previewLoading = ref(false)
const executing = ref(false)

const candidateIngredients = ref<Ingredient[]>([])
const toIngredientId = ref('')
const affectedRecipes = ref<BatchReplaceAffectedRecipe[]>([])
const scopeFilter = ref<'ALL' | 'PUBLIC' | 'DRAFT'>('ALL')
const selectedRecipeIds = ref<string[]>([])
const previewResults = ref<BatchReplacePreviewRecipeResult[]>([])
const executeResults = ref<BatchReplaceExecuteRecipeResult[]>([])

const scopeTableRef = ref()

interface OverrideRow {
  recipeItemId: string
  recipeId: string
  label: string
  kind: 'FOOD' | 'SUPPLEMENT'
  unit: string
  originalWeight: number | null
  originalTarget: number | null
  newWeight: number | null
  newTarget: number | null
}

const overrideRows = ref<OverrideRow[]>([])

const filteredAffectedRecipes = computed(() => {
  if (scopeFilter.value === 'ALL') return affectedRecipes.value
  return affectedRecipes.value.filter((r) => r.status === scopeFilter.value)
})

const overrideRowsByRecipe = computed(() => {
  const map = new Map<string, OverrideRow[]>()
  for (const row of overrideRows.value) {
    const list = map.get(row.recipeId) ?? []
    list.push(row)
    map.set(row.recipeId, list)
  }
  return map
})

const canExecute = computed(() => {
  return (
    previewResults.value.length > 0 &&
    previewResults.value.every((r) => r.ok)
  )
})

const successCount = computed(
  () => executeResults.value.filter((r) => r.ok).length
)
const failedCount = computed(
  () => executeResults.value.filter((r) => !r.ok).length
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetState()
      loadCandidates()
      loadAffectedRecipes()
    }
  }
)

function resetState() {
  step.value = 'config'
  toIngredientId.value = ''
  affectedRecipes.value = []
  selectedRecipeIds.value = []
  previewResults.value = []
  executeResults.value = []
  overrideRows.value = []
  scopeFilter.value = 'ALL'
}

function handleVisibleChange(value: boolean) {
  emit('update:visible', value)
}

function closeAfterDone() {
  emit('update:visible', false)
  emit('success')
}

async function loadCandidates() {
  if (!props.fromIngredient) return
  loadingCandidates.value = true
  try {
    const all = await ingredientApi.list()
    candidateIngredients.value = all.filter(
      (candidate) =>
        candidate.id !== props.fromIngredient?.id &&
        candidate.type === props.fromIngredient?.type
    )
  } catch (error) {
    ElMessage.error('新原料候选加载失败')
  } finally {
    loadingCandidates.value = false
  }
}

async function loadAffectedRecipes() {
  if (!props.fromIngredient) return
  loadingAffected.value = true
  try {
    const recipes = await ingredientApi.listBatchReplaceAffectedRecipes(
      props.fromIngredient.id
    )
    affectedRecipes.value = recipes.map((recipe) => ({
      ...recipe,
      itemsUsageText: recipe.items
        .map((item) => describeRecipeItemUsage(item))
        .join('；'),
    }))
    selectedRecipeIds.value = affectedRecipes.value.map((r) => r.recipeId)
    nextTickRestoreSelection()
  } catch (error) {
    ElMessage.error('受影响食谱加载失败')
  } finally {
    loadingAffected.value = false
  }
}

function nextTickRestoreSelection() {
  setTimeout(() => {
    if (scopeTableRef.value) {
      filteredAffectedRecipes.value.forEach((row) => {
        scopeTableRef.value.toggleRowSelection(row, true)
      })
    }
  }, 50)
}

function handleScopeSelectionChange(selection: BatchReplaceAffectedRecipe[]) {
  const selected = new Set(selection.map((r) => r.recipeId))
  // 保留未显示在其他筛选下的已选项
  const hiddenSelected = selectedRecipeIds.value.filter(
    (id) => !filteredAffectedRecipes.value.some((r) => r.recipeId === id)
  )
  selectedRecipeIds.value = [...hiddenSelected, ...selected]
}

function candidateLabel(candidate: Ingredient) {
  const parts = [candidate.name, candidate.brand, candidate.productModel].filter(
    Boolean
  )
  return parts.join(' · ')
}

function buildOverrideRows() {
  if (!props.fromIngredient) return
  const rows: OverrideRow[] = []
  for (const recipe of affectedRecipes.value) {
    if (!selectedRecipeIds.value.includes(recipe.recipeId)) continue
    for (const item of recipe.items) {
      const isSupplement = item.nutrientTargetKey !== null || item.supplementTargets !== null
      if (isSupplement) {
        const target = item.nutrientTargetKey
          ? resolveTargetLabel(item.nutrientTargetKey)
          : null
        const label = target
          ? `补剂目标「${target.label}」`
          : `补剂目标「${item.supplementTargets?.[0]?.label ?? '营养目标'}」`
        rows.push({
          recipeItemId: item.recipeItemId,
          recipeId: recipe.recipeId,
          label,
          kind: 'SUPPLEMENT',
          unit: '每kg',
          originalWeight: null,
          originalTarget: item.nutrientTargetValue,
          newWeight: null,
          newTarget: item.nutrientTargetValue,
        })
      } else {
        rows.push({
          recipeItemId: item.recipeItemId,
          recipeId: recipe.recipeId,
          label: `「${props.fromIngredient.name}」每份克数`,
          kind: 'FOOD',
          unit: 'g',
          originalWeight: item.exampleWeight,
          originalTarget: null,
          newWeight: item.exampleWeight,
          newTarget: null,
        })
      }
    }
  }
  overrideRows.value = rows
}

function collectOverrides() {
  const selected = new Set(selectedRecipeIds.value)
  return overrideRows.value
    .filter((row) => selected.has(row.recipeId))
    .filter((row) => {
      if (row.kind === 'FOOD') {
        return row.newWeight !== null && row.newWeight !== row.originalWeight
      }
      return row.newTarget !== null && row.newTarget !== row.originalTarget
    })
    .map((row) => {
      if (row.kind === 'FOOD') {
        return {
          recipeItemId: row.recipeItemId,
          exampleWeight: row.newWeight as number,
        }
      }
      return {
        recipeItemId: row.recipeItemId,
        nutrientTargetValue: row.newTarget as number,
      }
    })
}

async function runPreview() {
  if (!props.fromIngredient || !toIngredientId.value) return
  previewLoading.value = true
  buildOverrideRows()
  try {
    const results = await ingredientApi.previewBatchReplace(props.fromIngredient.id, {
      toIngredientId: toIngredientId.value,
      recipeIds: selectedRecipeIds.value,
      itemOverrides: collectOverrides(),
    })
    previewResults.value = results
    step.value = 'preview'
  } catch (error) {
    ElMessage.error('预览失败，请重试')
  } finally {
    previewLoading.value = false
  }
}

async function refreshPreview() {
  await runPreview()
}

async function runExecute() {
  if (!props.fromIngredient || !toIngredientId.value) return

  const failedPreview = previewResults.value.filter((r) => !r.ok)
  if (failedPreview.length > 0) {
    ElMessage.warning('存在无法替换的食谱，请返回调整选择范围')
    return
  }

  try {
    await ElMessageBox.confirm(
      `即将对 ${selectedRecipeIds.value.length} 个食谱执行批量替换，并自动重算覆盖营养报告。历史订单不受影响，此操作不可撤销。确认继续？`,
      '确认批量替换',
      {
        confirmButtonText: '确认执行',
        cancelButtonText: '再想想',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  executing.value = true
  try {
    executeResults.value = await ingredientApi.executeBatchReplace(
      props.fromIngredient.id,
      {
        toIngredientId: toIngredientId.value,
        recipeIds: selectedRecipeIds.value,
        itemOverrides: collectOverrides(),
      }
    )
    step.value = 'done'
    ElMessage.success('批量替换完成')
  } catch (error) {
    ElMessage.error('执行失败，已回滚本次操作')
  } finally {
    executing.value = false
  }
}

function backToConfig() {
  step.value = 'config'
}

// -------- 展示辅助 --------

function summaryCompareRows(_result: BatchReplacePreviewRecipeResult) {
  return SUMMARY_FIELDS
}

function formatSummaryValue(value: number | null | undefined) {
  if (value === null || value === undefined) return '-'
  return String(Math.round(value * 100) / 100)
}

function formatNumber(value: number) {
  return Math.round(value * 100) / 100
}

function rowChanged(result: BatchReplacePreviewRecipeResult, key: string) {
  const before = result.before?.[key]
  const after = result.after?.[key]
  if (before === null || before === undefined || after === null || after === undefined) {
    return false
  }
  return Math.abs(after - before) > 0.005
}

function diffLabel(result: BatchReplacePreviewRecipeResult, key: string) {
  const before = result.before?.[key]
  const after = result.after?.[key]
  if (
    before === null ||
    before === undefined ||
    after === null ||
    after === undefined
  ) {
    return '-'
  }
  const diff = after - before
  if (Math.abs(diff) < 0.005) return '不变'
  return `${diff > 0 ? '+' : ''}${String(Math.round(diff * 100) / 100)}`
}

// 根据原料项的营养目标/用量，生成一列易懂的说明文本
function describeRecipeItemUsage(item: {
  nutrientTargetKey: string | null
  nutrientTargetValue: number | null
  exampleWeight: number | null
  ratioPercent: number | null
}): string {
  // 补剂：显示营养目标（中文名 + 目标值 + 单位）
  if (item.nutrientTargetKey) {
    const target = resolveTargetLabel(item.nutrientTargetKey)
    const value = item.nutrientTargetValue ?? null
    if (value !== null) {
      return `目标 ${target.label} ${value}${target.unitUnit}${target.perKg}`
    }
    return `目标 ${target.label}`
  }
  // 食材：显示克数 / 比例
  const weight = item.exampleWeight ?? null
  if (weight !== null) {
    const ratio = item.ratioPercent !== null ? `${item.ratioPercent}%` : '未填比例'
    return `${weight}g（${ratio}）`
  }
  if (item.ratioPercent !== null) {
    return `${item.ratioPercent}%`
  }
  return '未填用量'
}

// 把营养字段编码（如 vitaminB2）解析为中文名 + 单位
interface ResolvedTargetLabel {
  label: string
  unitUnit: string
  perKg: string
}

function resolveTargetLabel(key: string): ResolvedTargetLabel {
  const normalized = key.replace(/[\s_-]+/g, '').toLowerCase()
  const field = listSupplementTargetFields().find((f) => {
    const label = f.label.replace(/[\s_-]+/g, '').toLowerCase()
    const fieldKey = f.fieldKey.replace(/[\s_-]+/g, '').toLowerCase()
    const fieldPath = f.fieldPath.replace(/[\s_.-]+/g, '').toLowerCase()
    const srcKey = key.replace(/[\s_-]+/g, '').toLowerCase()
    return (
      label === srcKey || fieldKey === srcKey || fieldPath === srcKey
    )
  })
  if (field) {
    return {
      label: field.label,
      unitUnit: field.unit,
      perKg: '/kg',
    }
  }
  // 组合目标（如 EPA+DHA）在派生目录
  const derived = listDerivedNutritionFields().find((d) => {
    const label = d.label.replace(/[\s_-]+/g, '').toLowerCase()
    const fieldPath = d.fieldPath.replace(/[\s_.-]+/g, '').toLowerCase()
    const srcKey = key.replace(/[\s_-]+/g, '').toLowerCase()
    return label === srcKey || fieldPath === srcKey
  })
  if (derived) {
    return {
      label: derived.label,
      unitUnit: derived.unit === 'ratio' ? '' : derived.unit,
      perKg: derived.unit === 'ratio' ? '' : '/kg',
    }
  }
  return { label: key, unitUnit: '', perKg: '' }
}
</script>

<style scoped>
.batch-replace-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.from-alert {
  margin-bottom: 4px;
}

.config-form {
  margin-bottom: 4px;
}

.candidate-option {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.candidate-spec {
  color: #909399;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}

.recipe-scope-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0;
}

.scope-title {
  font-weight: 600;
  color: #303133;
}

.usage-text {
  color: #606266;
  font-size: 13px;
}

.empty-tip {
  color: #909399;
  text-align: center;
  padding: 24px 0;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.preview-hint {
  color: #909399;
  font-size: 12px;
}

.preview-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.preview-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.preview-card-title {
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
}

.dose-summary {
  color: #409eff;
  font-size: 13px;
}

.override-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 10px;
}

.override-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.override-label {
  color: #606266;
  font-size: 13px;
}

.override-unit {
  color: #909399;
  font-size: 12px;
}

.compare-table {
  margin-bottom: 8px;
}

.changed {
  color: #e6a23c;
  font-weight: 600;
}

.preview-warnings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.warning-line {
  margin: 0;
}

.done-summary {
  margin-bottom: 12px;
}

.done-table {
  width: 100%;
}
</style>
