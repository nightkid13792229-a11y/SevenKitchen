<template>
  <div class="assessment-panel">
    <div v-if="!assessment" class="empty">
      <div v-loading="loadingInputs" class="empty-text">
        {{ loadingInputs ? '评估引擎准备中…' : '配方暂无评估数据' }}
      </div>
    </div>

    <template v-else>
      <div class="entry-list">
        <div v-for="group in displayGroups" :key="group.key" class="entry-group">
          <div class="group-head" @click="toggleGroup(group.key)">
            <span class="group-title">{{ group.title }}</span>
            <span class="group-count">{{ group.statusCountText }}</span>
            <el-icon class="group-arrow" :class="{ open: expandedGroups[group.key] }"><ArrowDown /></el-icon>
          </div>
          <div v-show="expandedGroups[group.key]" class="group-body">
            <div
              v-for="row in group.rows"
              :key="row.key"
              class="entry-row"
              :class="'status-' + row.status.toLowerCase()"
              @click="openDetail(row)"
            >
              <div class="entry-row-top">
                <span class="entry-label" :title="row.label">{{ row.label }}</span>
                <el-tag size="small" :type="row.tagType" effect="plain">{{ row.statusText }}</el-tag>
                <span class="entry-amount">{{ row.amountText }}</span>
              </div>
              <div v-if="row.hasBaseline" class="bar-line">
                <el-tooltip placement="top" :show-after="150">
                  <template #content>
                    <div class="bar-tooltip">{{ row.tooltipText }}</div>
                  </template>
                  <div class="bar-track" :class="{ 'track-zoned': row.hasZones }">
                    <div class="bar-fill" :class="'bar-' + row.barClass" :style="{ width: row.barWidth + '%' }"></div>
                    <div v-if="row.minLinePct != null" class="bar-min-line" :style="{ left: row.minLinePct + '%' }"></div>
                    <div v-if="row.maxLinePct != null" class="bar-max-line" :style="{ left: row.maxLinePct + '%' }"></div>
                  </div>
                </el-tooltip>
                <span class="bar-pct">{{ row.barText }}</span>
              </div>
              <div v-else class="bar-line bar-none">{{ row.noneText }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <el-dialog v-model="detailVisible" :title="detailTitle" width="540px" class="contrib-dialog" append-to-body>
      <div v-if="activeEntry" class="detail-summary">
        <div class="detail-row">
          <span>当前含量</span>
          <b>{{ detailCurrentText }}</b>
          <span v-if="detailTotalG != null" class="detail-sub">（全配方合计 {{ detailTotalG }} 克）</span>
        </div>
        <div class="detail-row">
          <span>标准范围</span>
          <b>{{ detailRangeText }}</b>
        </div>
        <div v-if="detailPctText" class="detail-row">
          <span>相对标准下限</span>
          <b>{{ detailPctText }}</b>
        </div>
        <!-- 含量刻度：三段式柱状条（实线=下限 1/3，虚线=上限 2/3） -->
        <div v-if="detailBar" class="detail-bar-block">
          <div class="detail-bar-track" :class="{ 'track-zoned': detailBar.hasZones }">
            <div class="detail-bar-fill" :class="'bar-' + detailBar.barClass" :style="{ width: detailBar.barPos + '%' }"></div>
            <div v-if="detailBar.minLinePct != null" class="bar-min-line" :style="{ left: detailBar.minLinePct + '%' }"></div>
            <div v-if="detailBar.maxLinePct != null" class="bar-max-line" :style="{ left: detailBar.maxLinePct + '%' }"></div>
          </div>
          <div class="detail-bar-bounds">
            <span>{{ detailMinBoundText }}</span>
            <span>{{ detailMaxBoundText }}</span>
          </div>
        </div>
      </div>
      <div v-if="detailContributors.length" class="contrib-table-wrap">
        <table class="contrib-table">
          <thead>
            <tr>
              <th>原料</th>
              <th class="th-weight">用量</th>
              <th>贡献量</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in detailContributors" :key="c.itemId">
              <td class="td-name">
                <div class="td-name-text">{{ c.itemName }}</div>
                <div class="mini-bar"><div class="mini-fill" :style="{ width: c.pctWidth + '%' }"></div></div>
              </td>
              <td class="td-weight-edit">
                <div class="weight-editor">
                  <el-input-number
                    :model-value="c.draftWeight ?? c.weightG ?? undefined"
                    :min="0"
                    :precision="1"
                    :controls="false"
                    size="small"
                    class="weight-input"
                    @update:model-value="(value: number | undefined) => onWeightDraft(c, value)"
                  />
                  <span class="weight-unit">{{ c.amountUnit || 'g' }}</span>
                  <el-button
                    size="small"
                    text
                    type="primary"
                    :loading="c.updating"
                    :disabled="!c.dirty || c.updating"
                    @click="applyWeight(c)"
                  >应用</el-button>
                </div>
              </td>
              <td>{{ c.amountText }}</td>
              <td>{{ c.pctText }}</td>
            </tr>
            <tr class="total-row">
              <td>合计</td>
              <td>{{ detailTotalWeightG != null ? detailTotalWeightG + ' 克' : '—' }}</td>
              <td>{{ detailTotalG != null ? detailTotalG + ' 克' : '—' }}</td>
              <td>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="detail-empty">该营养素暂无原料贡献明细（数据缺失）。</div>
      <template #footer>
        <div class="detail-footer">
          <el-button
            v-if="detailNutrientSearchTarget"
            type="primary"
            plain
            :icon="Search"
            @click="openNutrientPicker"
          >寻找富含该营养素的原料</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 富含该营养素的原料选择器 -->
    <el-dialog v-model="nutrientPickerVisible" :title="nutrientPickerTitle" width="440px" class="nutrient-picker-dialog" append-to-body>
      <div class="nutrient-picker">
        <el-input
          v-model="nutrientPickerKeyword"
          placeholder="搜索原料名称"
          clearable
          :prefix-icon="Search"
          @input="debouncedNutrientSearch"
        />
        <div v-loading="nutrientPickerLoading" class="nutrient-option-list">
          <el-empty
            v-if="!nutrientPickerLoading && nutrientPickerOptions.length === 0"
            description="暂无富含该营养素的可用原料"
            :image-size="60"
          />
          <div
            v-for="option in nutrientPickerOptions"
            :key="option.id"
            class="nutrient-option-item"
          >
            <div class="nutrient-option-body" @click="addNutrientOption(option)">
              <div class="nutrient-option-name">{{ option.name }}</div>
              <div v-if="pickerOptionSpec(option)" class="nutrient-option-spec">
                {{ pickerOptionSpec(option) }}
              </div>
              <div v-if="option.nutrientMatch" class="nutrient-option-match">
                {{ option.nutrientMatch.displayText }}
              </div>
            </div>
            <el-button
              v-if="smartAddInfo(option)"
              size="small"
              type="primary"
              plain
              class="smart-add-btn"
              @click.stop="handleSmartAdd(option)"
            >智能添加</el-button>
          </div>
        </div>
        <div v-if="nutrientPickerHasMore" class="load-more">
          <el-button size="small" text type="primary" :loading="nutrientPickerLoading" @click="loadMoreNutrientPicker">
            加载更多
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Search } from '@element-plus/icons-vue'
import type { DesignRecipeAssessmentResult, GroupedAssessmentEntry } from '@/utils/recipeDesigner/assessment'
import type { AssessmentNutrientContributor } from '@/utils/recipeDesigner/assessmentTypes'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type {
  FediafDogScenario,
  IngredientNutritionProfileOption,
  RecipeDesignerIngredientOption
} from '@/types/recipeDesigner'

const props = defineProps<{
  assessment: DesignRecipeAssessmentResult | null
  loadingInputs?: boolean
  scenario?: FediafDogScenario
  /** 弹窗内修改原料用量：由编辑器实现（本地生效 + 保存队列） */
  onUpdateItemWeight?: (itemId: string, weightG: number) => Promise<void> | void
}>()

const emit = defineEmits<{
  (
    event: 'add-ingredient',
    option: RecipeDesignerIngredientOption,
    profile?: IngredientNutritionProfileOption,
    weightG?: number
  ): void
}>()

const expandedGroups = reactive<Record<string, boolean>>({
  MACRO: true,
  MINERAL: true,
  VITAMIN: true,
  FATTY_ACID: true,
  AMINO_ACID: true
})

const BASIS_LABELS: Record<string, string> = {
  PER_1000_KCAL_ME: '每1000千卡',
  PER_MJ_ME: '每兆焦',
  PER_100G_DRY_MATTER: '每100克干物质',
  RATIO: ''
}

/** 已由「关键比例仪表盘」单独展示，评估面板不再重复列出的比例项 */
const RATIO_KEYS_HIDDEN = ['calciumPhosphorusRatio', 'omega6Omega3Ratio']

const visibleGroupedEntries = computed<GroupedAssessmentEntry[]>(() => {
  const grouped = (props.assessment?.groupedEntries ?? []) as GroupedAssessmentEntry[]
  return grouped.filter((entry) => !RATIO_KEYS_HIDDEN.includes(entry.nutrientKey))
})

interface DisplayContributor {
  itemId: string
  itemName: string
  amountText: string
  pctText: string
  pctWidth: number
}

interface DisplayRow {
  key: string
  label: string
  status: string
  statusText: string
  tagType: 'success' | 'danger' | 'warning' | 'info'
  amountText: string
  hasBaseline: boolean
  hasZones: boolean
  barClass: string
  barWidth: number
  barText: string
  minLinePct: number | null
  maxLinePct: number | null
  tooltipText: string
  noneText: string
  entry: GroupedAssessmentEntry
}

interface DisplayGroup {
  key: string
  title: string
  statusCountText: string
  rows: DisplayRow[]
}

function basisLabel(entry: GroupedAssessmentEntry): string {
  return BASIS_LABELS[entry.expressionBasis] ?? ''
}

/** 名称右侧的完整含量文本，如「91.1 克/每1000千卡」或「1.20:1」 */
function amountText(entry: GroupedAssessmentEntry): string {
  if (entry.currentValue == null) return '—'
  if (entry.expressionBasis === 'RATIO') {
    return `${Number(entry.currentValue).toFixed(2)}:1`
  }
  const unit = entry.unit || ''
  const basis = basisLabel(entry)
  return `${Number(entry.currentValue).toFixed(1)} ${unit}${basis ? '/' + basis : ''}`
}

function rangeText(entry: GroupedAssessmentEntry): string {
  const min = entry.minValue
  const max = entry.maxValue
  if (min != null && max != null) return `${min} - ${max}`
  if (min != null) return `≥ ${min}`
  if (max != null) return `≤ ${max}`
  return '—'
}

function statusText(status: string): string {
  switch (status) {
    case 'COMPLIANT':
      return '达标'
    case 'DEFICIENT':
      return '不足'
    case 'EXCESS':
      return '超标'
    case 'MISSING_DATA':
      return '缺数据'
    case 'INFO':
      return '参考'
    default:
      return status
  }
}

function statusTagType(status: string): 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'COMPLIANT':
      return 'success'
    case 'DEFICIENT':
    case 'EXCESS':
      return 'danger'
    case 'MISSING_DATA':
      return 'warning'
    default:
      return 'info'
  }
}

function barStatusClass(status: string): string {
  return status.toLowerCase()
}

interface BarGeometry {
  hasBar: boolean
  contentPct: number | null
  barPos: number
  minLinePct: number | null
  maxLinePct: number | null
  tooltipText: string
  noneText: string
}

const TRACK_THIRD = 100 / 3

/**
 * 每个营养素独立比例尺（三段等分安全区）：
 * - 实线（下限）固定在轨道 1/3 处，虚线（上限）固定在 2/3 处，永远同时可见
 * - 每格代表的真实数值随营养素不同（钠的上限 1500% 就在 2/3 处）
 * - 含量条位置：低于下限落在左段、上下限之间落在中段、超上限落在右段
 * - 只有下限（无上限标准）时：轨道按「0–300% 下限单位」线性显示，下限仍在 1/3（=100%）
 */
function buildBar(entry: GroupedAssessmentEntry): BarGeometry {
  const min = entry.minValue
  const max = entry.maxValue
  const cur = entry.currentValue
  const basis = basisLabel(entry)
  const unitSuffix =
    entry.expressionBasis === 'RATIO'
      ? ':1'
      : `${entry.unit || ''}${basis ? '/' + basis : ''}`
  /** 悬浮提示数值统一保留两位小数 */
  const fmtNum = (value: number | null | undefined): string =>
    value == null ? '—' : Number(value).toFixed(2)

  const tooltipLines = [`当前含量：${fmtNum(cur)} ${unitSuffix}`]
  tooltipLines.push(min != null ? `标准下限：${fmtNum(min)} ${unitSuffix}` : '标准下限：未设下限')
  tooltipLines.push(max != null ? `标准上限：${fmtNum(max)} ${unitSuffix}` : '标准上限：无上限')

  if (min == null && max == null) {
    return {
      hasBar: false,
      contentPct: null,
      barPos: 0,
      minLinePct: null,
      maxLinePct: null,
      tooltipText: tooltipLines.join('\n'),
      noneText: '参考指标（无标准上下限）'
    }
  }

  const baseline = min ?? max ?? 0
  const contentPct = cur != null && baseline > 0 ? (cur / baseline) * 100 : null

  let barPos = 0
  if (cur != null && baseline > 0) {
    if (min != null && max != null) {
      if (cur < min) {
        barPos = (cur / min) * TRACK_THIRD
      } else if (cur <= max) {
        barPos = TRACK_THIRD + ((cur - min) / (max - min)) * TRACK_THIRD
      } else {
        barPos = TRACK_THIRD * 2 + ((cur - max) / max) * TRACK_THIRD
      }
      barPos = Math.min(barPos, 100)
    } else if (min != null) {
      // 无上限：轨道 0–300% 下限单位，100% 即 1/3 处
      barPos = Math.min((cur / min) * TRACK_THIRD, 100)
    } else if (max != null) {
      if (cur <= max) {
        barPos = (cur / max) * TRACK_THIRD * 2
      } else {
        barPos = TRACK_THIRD * 2 + ((cur - max) / max) * TRACK_THIRD
      }
      barPos = Math.min(barPos, 100)
    }
  }

  return {
    hasBar: true,
    contentPct,
    barPos,
    minLinePct: min != null ? TRACK_THIRD : null,
    maxLinePct: max != null ? TRACK_THIRD * 2 : null,
    tooltipText: tooltipLines.join('\n'),
    noneText: ''
  }
}

const displayGroups = computed<DisplayGroup[]>(() => {
  const assessment = props.assessment
  if (!assessment) return []
  const grouped = visibleGroupedEntries.value
  const byCategory = new Map<string, GroupedAssessmentEntry[]>()
  for (const entry of grouped) {
    const category = entry.category || 'MACRO'
    const list = byCategory.get(category) ?? []
    list.push(entry)
    byCategory.set(category, list)
  }
  const result: DisplayGroup[] = []
  for (const [category, entries] of byCategory) {
    const rows: DisplayRow[] = entries.map((entry) => {
      const status = String(entry.status || '').toUpperCase()
      const geom = buildBar(entry)
      return {
        key: entry.nutrientKey,
        label: entry.label || entry.nutrientKey,
        status,
        statusText: statusText(status),
        tagType: statusTagType(status),
        amountText: amountText(entry),
        hasBaseline: geom.hasBar,
        hasZones: entry.minValue != null && entry.maxValue != null,
        barClass: barStatusClass(status),
        barWidth: geom.barPos,
        barText: geom.contentPct != null ? `${Math.round(geom.contentPct)}%` : '—',
        minLinePct: geom.minLinePct,
        maxLinePct: geom.maxLinePct,
        tooltipText: geom.tooltipText,
        noneText: geom.noneText,
        entry
      }
    })
    const deficient = rows.filter((row) => row.status === 'DEFICIENT').length
    const excess = rows.filter((row) => row.status === 'EXCESS').length
    const missing = rows.filter((row) => row.status === 'MISSING_DATA').length
    const issues: string[] = []
    if (deficient) issues.push(`不足 ${deficient}`)
    if (excess) issues.push(`超标 ${excess}`)
    if (missing) issues.push(`缺数据 ${missing}`)
    result.push({
      key: category,
      title: CATEGORY_TITLES[category] ?? category,
      statusCountText: issues.length ? issues.join(' · ') : `${rows.length} 项全部达标`,
      rows
    })
  }
  return result
})

const CATEGORY_TITLES: Record<string, string> = {
  MACRO: '宏量营养',
  AMINO_ACID: '氨基酸',
  FATTY_ACID: '脂肪酸',
  MINERAL: '矿物质',
  VITAMIN: '维生素'
}

function toggleGroup(key: string) {
  expandedGroups[key] = !expandedGroups[key]
}

/* ============ 点击弹窗：原料贡献明细 ============ */

const detailVisible = ref(false)
const activeEntry = ref<GroupedAssessmentEntry | null>(null)

const detailTitle = computed(() => {
  const entry = activeEntry.value
  if (!entry) return ''
  return `${entry.label || entry.nutrientKey} · ${statusText(String(entry.status || '').toUpperCase())}`
})

const detailCurrentText = computed(() => (activeEntry.value ? amountText(activeEntry.value) : '—'))

const detailRangeText = computed(() => {
  const entry = activeEntry.value
  if (!entry) return '—'
  const range = rangeText(entry)
  if (entry.expressionBasis === 'RATIO') return `${range} :1`
  const basis = basisLabel(entry)
  return `${range} ${entry.unit || ''}${basis ? '/' + basis : ''}`
})

const detailPctText = computed(() => {
  const entry = activeEntry.value
  if (!entry || entry.currentValue == null) return ''
  const min = entry.minValue
  const max = entry.maxValue
  const baseline = min != null ? min : max != null ? max : null
  if (baseline == null || baseline <= 0) return ''
  const pct = (entry.currentValue / baseline) * 100
  return `${Math.round(pct)}%（100%=标准${min != null ? '下限' : '上限'}）`
})

const detailTotalG = computed<number | null>(() => {
  const contributors = activeEntry.value?.contributors ?? []
  if (!contributors.length) return null
  const total = contributors.reduce((sum, c) => sum + (typeof c.amount === 'number' ? c.amount : 0), 0)
  return Number(total.toFixed(1))
})

/** 全配方原料用量合计（克） */
const detailTotalWeightG = computed<number | null>(() => {
  const contributors = activeEntry.value?.contributors ?? []
  if (!contributors.length) return null
  const total = contributors.reduce(
    (sum, c) => sum + (typeof c.weightG === 'number' ? c.weightG : 0),
    0
  )
  return Number(total.toFixed(1))
})

/* ---- 弹窗内含量刻度（与行内三段式一致） ---- */

const detailBoundUnitSuffix = computed(() => {
  const entry = activeEntry.value
  if (!entry) return ''
  if (entry.expressionBasis === 'RATIO') return ':1'
  const basis = basisLabel(entry)
  return `${entry.unit || ''}${basis ? '/' + basis : ''}`
})

const detailMinBoundText = computed(() => {
  const entry = activeEntry.value
  if (!entry || entry.minValue == null) return '未设下限'
  return `下限 ${entry.minValue} ${detailBoundUnitSuffix.value}`
})

const detailMaxBoundText = computed(() => {
  const entry = activeEntry.value
  if (!entry || entry.maxValue == null) return '未设上限'
  return `上限 ${entry.maxValue} ${detailBoundUnitSuffix.value}`
})

const detailBar = computed(() => {
  const entry = activeEntry.value
  if (!entry) return null
  const geom = buildBar(entry)
  return {
    hasBar: geom.hasBar,
    barPos: geom.barPos,
    minLinePct: geom.minLinePct,
    maxLinePct: geom.maxLinePct,
    hasZones: entry.minValue != null && entry.maxValue != null,
    barClass: barStatusClass(String(entry.status || '').toUpperCase())
  }
})

/* ---- 弹窗内用量修改 ---- */

const weightDrafts = reactive<Record<string, number | null>>({})
const updatingWeightItemId = ref<string | null>(null)

function onWeightDraft(c: DetailContributor, value: number | undefined) {
  weightDrafts[c.itemId] = value == null ? null : value
}

function clearWeightDrafts() {
  for (const key of Object.keys(weightDrafts)) delete weightDrafts[key]
}

async function applyWeight(c: DetailContributor) {
  const value = weightDrafts[c.itemId]
  if (value == null || !Number.isFinite(value) || value < 0) {
    ElMessage.warning('用量不能小于 0')
    return
  }
  if (value === c.weightG) {
    delete weightDrafts[c.itemId]
    return
  }
  if (!props.onUpdateItemWeight) {
    ElMessage.warning('当前页面不支持直接修改用量')
    return
  }
  updatingWeightItemId.value = c.itemId
  try {
    await props.onUpdateItemWeight(c.itemId, value)
    delete weightDrafts[c.itemId]
  } catch {
    ElMessage.error('用量更新失败')
  } finally {
    updatingWeightItemId.value = null
  }
}

interface DetailContributor {
  itemId: string
  itemName: string
  weightG: number | null
  amountUnit: string
  draftWeight: number | null
  dirty: boolean
  updating: boolean
  amountText: string
  pctText: string
  pctWidth: number
}

const detailContributors = computed<DetailContributor[]>(() => {
  const contributors = (activeEntry.value?.contributors ?? []) as AssessmentNutrientContributor[]
  return contributors.map((contributor) => {
    const pct = contributor.contributionPercent
    const amount = contributor.amount
    const weightG = typeof contributor.weightG === 'number' ? contributor.weightG : null
    const draftWeight = weightDrafts[contributor.itemId] ?? null
    return {
      itemId: contributor.itemId,
      itemName: contributor.itemName,
      weightG,
      amountUnit: contributor.amountUnit || 'g',
      draftWeight,
      dirty:
        draftWeight != null && weightG != null && Math.abs(draftWeight - weightG) >= 0.05,
      updating: updatingWeightItemId.value === contributor.itemId,
      amountText:
        amount == null
          ? '无数据'
          : `${Number(amount).toFixed(1)} ${contributor.unit || ''}`,
      pctText: pct == null ? '—' : `${Number(pct).toFixed(1)}%`,
      pctWidth: pct == null ? 0 : Math.min(Math.max(pct, 0), 100)
    }
  })
})

function findEntryByKey(entry: GroupedAssessmentEntry): GroupedAssessmentEntry | null {
  const grouped = (props.assessment?.groupedEntries ?? []) as GroupedAssessmentEntry[]
  const key = entry.nutrientKey
  const basis = entry.expressionBasis || ''
  return (
    grouped.find(
      (candidate) => candidate.nutrientKey === key && (candidate.expressionBasis || '') === basis
    ) ??
    grouped.find((candidate) => candidate.nutrientKey === key) ??
    null
  )
}

/** 用量修改应用后，评估重算 → 弹窗跟随最新数据刷新 */
watch(
  () => props.assessment,
  () => {
    if (!detailVisible.value || !activeEntry.value) return
    const next = findEntryByKey(activeEntry.value)
    if (next) {
      activeEntry.value = next
      clearWeightDrafts()
    }
  }
)

/* ---- 富含该营养素的原料选择 ---- */

const nutrientPickerVisible = ref(false)
const nutrientPickerLoading = ref(false)
const nutrientPickerKeyword = ref('')
const nutrientPickerOptions = ref<RecipeDesignerIngredientOption[]>([])
const nutrientPickerPage = ref(1)
const nutrientPickerTotal = ref(0)
let nutrientSearchTimer: ReturnType<typeof setTimeout> | null = null

const nutrientPickerHasMore = computed(
  () => nutrientPickerOptions.value.length < nutrientPickerTotal.value
)

const detailNutrientSearchTarget = computed(() => {
  const entry = activeEntry.value
  if (!entry || entry.expressionBasis === 'RATIO' || !entry.nutrientKey) return null
  return {
    nutrientKey: entry.nutrientKey,
    expressionBasis: entry.expressionBasis || '',
    label: entry.label || entry.nutrientKey
  }
})

const nutrientPickerTitle = computed(() =>
  detailNutrientSearchTarget.value
    ? `富含${detailNutrientSearchTarget.value.label}的原料`
    : '选择原料'
)

async function loadNutrientPicker(reset: boolean) {
  const target = detailNutrientSearchTarget.value
  if (!target || !props.scenario) return
  nutrientPickerLoading.value = true
  try {
    const page = reset ? 1 : nutrientPickerPage.value + 1
    const res = await recipeDesignerApi.listIngredientOptions({
      search: nutrientPickerKeyword.value.trim() || undefined,
      nutrientKey: target.nutrientKey,
      scenario: props.scenario,
      expressionBasis: target.expressionBasis,
      page,
      pageSize: 20
    })
    nutrientPickerOptions.value =
      page === 1 ? res.data : [...nutrientPickerOptions.value, ...res.data]
    nutrientPickerTotal.value = res.total ?? nutrientPickerOptions.value.length
    nutrientPickerPage.value = page
  } catch {
    nutrientPickerOptions.value = []
  } finally {
    nutrientPickerLoading.value = false
  }
}

function openNutrientPicker() {
  nutrientPickerKeyword.value = ''
  nutrientPickerOptions.value = []
  nutrientPickerPage.value = 1
  nutrientPickerTotal.value = 0
  nutrientPickerVisible.value = true
  void loadNutrientPicker(true)
}

function debouncedNutrientSearch() {
  if (nutrientSearchTimer) clearTimeout(nutrientSearchTimer)
  nutrientSearchTimer = setTimeout(() => {
    nutrientPickerOptions.value = []
    nutrientPickerPage.value = 1
    void loadNutrientPicker(true)
  }, 300)
}

function loadMoreNutrientPicker() {
  void loadNutrientPicker(false)
}

function addNutrientOption(option: RecipeDesignerIngredientOption) {
  emit('add-ingredient', option)
  nutrientPickerVisible.value = false
}

/* ---- 智能添加：按缺口自动计算补足量 ---- */

/** 弹窗卡片规格信息：补剂显示品牌·产品规格（区分同名补剂）；食材有多个营养档案时显示主档案名 */
function pickerOptionSpec(option: RecipeDesignerIngredientOption): string {
  if (String(option.type || '').trim().toUpperCase() === 'SUPPLEMENT') {
    const parts = [option.brand, option.productModel].filter(
      (value): value is string => Boolean(value && String(value).trim())
    )
    return parts.map((value) => String(value).trim()).join(' · ')
  }
  const profiles = option.nutritionProfiles ?? []
  if (profiles.length > 1) {
    return (
      profiles.find((profile) => profile.isPrimary)?.name ??
      profiles[0]?.name ??
      ''
    )
  }
  return ''
}

interface SmartAddInfo {
  weightG: number
  unitLabel: string
  /** 弹窗确认文案中的用量描述，如「12.5 g」「2 片」 */
  amountDisplay: string
  gapDisplay: string
}

/** 计算补足当前营养素最低需求所需的该原料用量；已达标或数据缺失时返回 null */
function smartAddInfo(option: RecipeDesignerIngredientOption): SmartAddInfo | null {
  const entry = activeEntry.value
  const match = option.nutrientMatch
  const assessment = props.assessment
  if (!entry || !match || !assessment) return null
  const min = entry.minValue
  const cur = entry.currentValue
  if (min == null || cur == null || min <= cur) return null

  // 1) 把「每评估基准」的缺口换算成当前配方总量缺口
  const gapPerBasis = min - cur
  let scale: number | null = null
  switch (entry.expressionBasis) {
    case 'PER_1000_KCAL_ME': {
      const kcal = assessment.totalEnergyKcal
      if (kcal != null && kcal > 0) scale = kcal / 1000
      break
    }
    case 'PER_MJ_ME': {
      const kcal = assessment.totalEnergyKcal
      if (kcal != null && kcal > 0) scale = kcal * 0.004184
      break
    }
    case 'PER_100G_DRY_MATTER': {
      const dm = assessment.dryMatterG
      if (dm != null && dm > 0) scale = dm / 100
      break
    }
  }
  if (scale == null) return null
  const totalGap = gapPerBasis * scale

  // 2) 按原料含量换算所需用量
  const amount = match.amount
  if (amount == null || amount <= 0) return null
  let weightG: number
  let unitLabel: string
  if (match.basis === 'PER_100_G') {
    // 食材：含量按每 100g，需量（克）= 缺口 / 含量 × 100，精确到 0.01g
    weightG = Math.round((totalGap / amount) * 100 * 100) / 100
    unitLabel = 'g'
  } else {
    // 补剂：含量按每 1 份（片/粒/克/毫升…），需量（份数）= 缺口 / 含量，精确到 0.01 份
    weightG = Math.round((totalGap / amount) * 100) / 100
    unitLabel = (match.basisLabel || '').replace(/^\//, '') || '份'
  }
  if (weightG <= 0) return null
  // 与配方明细列表一致：统一保留两位小数
  const fmt = (v: number) => Number(v).toFixed(2)
  return {
    weightG,
    unitLabel,
    amountDisplay: `${fmt(weightG)} ${unitLabel}`,
    gapDisplay: `${Number(totalGap).toFixed(2)} ${match.unit}`
  }
}

function primaryProfile(option: RecipeDesignerIngredientOption) {
  return (
    option.nutritionProfiles.find((profile) => profile.isPrimary) ??
    option.nutritionProfiles[0] ??
    null
  )
}

async function handleSmartAdd(option: RecipeDesignerIngredientOption) {
  const info = smartAddInfo(option)
  const entry = activeEntry.value
  if (!info || !entry) return
  try {
    await ElMessageBox.confirm(
      `将添加「${option.name}」${info.amountDisplay}，用于补足${entry.label}（当前缺口 ${info.gapDisplay}）的最低需求。确认添加？`,
      '智能添加',
      {
        type: 'warning',
        confirmButtonText: '确认添加',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  const profile = primaryProfile(option)
  if (!profile) {
    ElMessage.warning(`「${option.name}」暂无可用营养档案，无法加入配方`)
    return
  }
  emit('add-ingredient', option, profile, info.weightG)
  nutrientPickerVisible.value = false
}

function openDetail(row: DisplayRow) {
  activeEntry.value = row.entry
  clearWeightDrafts()
  detailVisible.value = true
}
</script>

<style scoped>
.assessment-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.empty-text {
  color: #909399;
  font-size: 13px;
}
.entry-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.entry-group {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  background: #f5f7fa;
}
.group-title {
  font-weight: 600;
  font-size: 13px;
}
.group-count {
  font-size: 11px;
  color: #909399;
  flex: 1;
}
.group-arrow {
  transition: transform 0.2s;
  font-size: 12px;
}
.group-arrow.open {
  transform: rotate(180deg);
}
.group-body {
  padding: 4px 10px 8px;
}
/* 宏量构成明细表 */
.entry-row {
  padding: 6px 0;
  border-bottom: 1px dashed #f0f0f0;
  cursor: pointer;
  transition: background 0.15s;
}
.entry-row:hover {
  background: #fafafa;
}
.entry-row:last-child {
  border-bottom: none;
}
.entry-row-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.entry-label {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}
.entry-amount {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  flex-shrink: 0;
}
.entry-row.status-deficient .entry-amount {
  color: #f56c6c;
}
.entry-row.status-excess .entry-amount {
  color: #e6a23c;
}
.entry-row.status-missing_data .entry-amount {
  color: #909399;
}
.bar-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
}
.bar-none {
  font-size: 11px;
  color: #c0c4cc;
  padding-left: 2px;
}
.bar-track {
  position: relative;
  flex: 1;
  height: 12px;
  background: #f0f2f5;
  border-radius: 6px;
  overflow: visible;
}
/* 有上下限的营养素：三段等分底色（左=不足浅红 中=达标浅绿 右=超标浅橙） */
.bar-track.track-zoned {
  background: linear-gradient(
    to right,
    rgba(245, 108, 108, 0.12) 0%,
    rgba(245, 108, 108, 0.12) 33.333%,
    rgba(103, 194, 58, 0.12) 33.333%,
    rgba(103, 194, 58, 0.12) 66.667%,
    rgba(230, 162, 60, 0.14) 66.667%,
    rgba(230, 162, 60, 0.14) 100%
  );
}
.bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 6px;
  min-width: 2px;
}
.bar-compliant {
  background: #67c23a;
}
.bar-deficient {
  background: #f56c6c;
}
.bar-excess {
  background: #e6a23c;
}
.bar-missing_data {
  background: #c0c4cc;
}
.bar-info {
  background: #79bbff;
}
.bar-min-line {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: #909399;
  border-radius: 1px;
  z-index: 2;
}
.bar-max-line {
  position: absolute;
  top: -2px;
  bottom: -2px;
  border-left: 2px dashed #b1b3b8;
  z-index: 2;
}
.bar-pct {
  font-size: 11px;
  font-weight: 600;
  color: #606266;
  width: 46px;
  text-align: right;
  flex-shrink: 0;
}
.bar-tooltip {
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-line;
}
.entry-row.status-deficient .bar-pct {
  color: #f56c6c;
}
.entry-row.status-excess .bar-pct {
  color: #e6a23c;
}

/* 弹窗 */
.detail-summary {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.detail-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
}
.detail-row span:first-child {
  color: #909399;
  min-width: 64px;
}
.detail-sub {
  color: #909399;
  font-size: 12px;
}
.contrib-table-wrap {
  max-height: 46vh;
  overflow-y: auto;
}
.contrib-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.contrib-table th {
  text-align: left;
  font-weight: 600;
  color: #909399;
  font-size: 12px;
  padding: 4px 6px;
  border-bottom: 1px solid #ebeef5;
}
.contrib-table td {
  padding: 5px 6px;
  border-bottom: 1px solid #f5f7fa;
  white-space: nowrap;
}
.td-name {
  width: 30%;
  white-space: normal;
  word-break: break-word;
}
.td-name-text {
  line-height: 1.3;
}
.th-weight,
.td-weight-edit {
  width: 42%;
}
.td-name .mini-bar {
  margin-top: 4px;
  max-width: 120px;
}
.mini-bar {
  height: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  overflow: hidden;
}
.mini-fill {
  height: 100%;
  background: #67c23a;
  border-radius: 4px;
}
.total-row td {
  font-weight: 600;
  border-bottom: none;
  padding-top: 8px;
}
.detail-empty {
  color: #909399;
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}
/* 弹窗内含量刻度 */
.detail-bar-block {
  margin: 10px 0 4px;
}
.detail-bar-track {
  position: relative;
  height: 14px;
  background: #f0f2f5;
  border-radius: 7px;
  overflow: visible;
}
.detail-bar-track.track-zoned {
  background: linear-gradient(
    to right,
    rgba(245, 108, 108, 0.12) 0%,
    rgba(245, 108, 108, 0.12) 33.333%,
    rgba(103, 194, 58, 0.12) 33.333%,
    rgba(103, 194, 58, 0.12) 66.667%,
    rgba(230, 162, 60, 0.14) 66.667%,
    rgba(230, 162, 60, 0.14) 100%
  );
}
.detail-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 7px;
  min-width: 2px;
  transition: width 0.2s;
}
.detail-bar-bounds {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: #909399;
}
/* 弹窗内用量编辑 */
.weight-editor {
  display: flex;
  align-items: center;
  gap: 4px;
}
.weight-editor .weight-input {
  width: 76px;
}
.weight-unit {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}
.detail-footer {
  display: flex;
  justify-content: flex-end;
}
/* 富含营养素原料选择器 */
.nutrient-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.nutrient-option-list {
  max-height: 46vh;
  overflow-y: auto;
  min-height: 120px;
}
.nutrient-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.nutrient-option-item:hover {
  border-color: #409eff;
  background: #f5f9ff;
}
.nutrient-option-body {
  min-width: 0;
}
.nutrient-option-name {
  font-size: 13px;
  font-weight: 500;
}
.nutrient-option-spec {
  margin-top: 2px;
  font-size: 11px;
  color: #909399;
}
.nutrient-option-match {
  margin-top: 2px;
  font-size: 11px;
  color: #67c23a;
}
.smart-add-btn {
  flex-shrink: 0;
  margin-left: 4px;
}
.nutrient-picker .load-more {
  text-align: center;
  padding: 4px 0;
}
</style>
