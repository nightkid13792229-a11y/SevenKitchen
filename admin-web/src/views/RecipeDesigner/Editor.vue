<template>
  <div class="designer-editor">
    <div class="editor-header">
      <el-button :icon="ArrowLeft" text @click="goBack">返回</el-button>
      <div class="header-info">
        <span class="draft-name">{{ draft?.name || '加载中…' }}</span>
        <span v-if="draft?.seriesLifeStage" class="stage-tag">
          {{ stageLabel }}
        </span>
        <el-dropdown v-if="draft" trigger="click" @command="handleSwitchStage">
          <el-button size="small" class="stage-switch-btn" :loading="switchingStage">
            切换阶段<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="(label, key) in FEDIAF_DOG_SCENARIO_LABELS"
                :key="key"
                :command="key"
                :disabled="key === draft.fediafDogScenario"
              >
                {{ label }}<span v-if="key === draft.fediafDogScenario" class="stage-current">（当前）</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="header-right">
        <el-button
          text
          :icon="RefreshLeft"
          :disabled="!canUndo"
          @click="undo"
        >撤销</el-button>
        <el-button
          text
          :icon="RefreshRight"
          :disabled="!canRedo"
          @click="redo"
        >重做</el-button>
        <el-button
          v-if="canRevert"
          text
          :loading="reverting"
          @click="handleRevert"
        >恢复正式版</el-button>
        <span class="save-status" :class="saveStatus">
          <el-icon v-if="saveStatus === 'saving'"><Loading /></el-icon>
          <el-icon v-else-if="saveStatus === 'error'"><WarningFilled /></el-icon>
          <el-icon v-else><CircleCheckFilled /></el-icon>
          {{ saveStatusText }}
        </span>
        <el-button
          type="primary"
          :disabled="!draft || items.length === 0"
          @click="goPublish"
        >
          发布配方
        </el-button>
      </div>
    </div>

    <div class="editor-body">
      <!-- 左：原料库 -->
      <div class="pane pane-library">
        <div class="pane-title">原料库</div>
        <IngredientLibrary :scenario="draft?.fediafDogScenario" @add="handleAddOption" />
      </div>

      <!-- 中：配方编辑 -->
      <div class="pane pane-items">
        <div class="pane-title">
          配方明细
          <span class="item-count">原料 {{ items.length }} 种 · 总重 {{ includedTotalWeightText }}</span>
        </div>
        <div v-loading="initialLoading" class="item-list">
          <el-empty v-if="!initialLoading && items.length === 0" description="从左侧原料库点击食材加入配方" />
          <draggable
            v-model="items"
            item-key="id"
            handle=".drag-handle"
            animation="150"
            ghost-class="drag-ghost"
            @start="handleReorderStart"
            @end="handleReorder"
          >
            <template #item="{ element, index }">
              <div class="item-row" :class="{ 'item-row-excluded': element.includeInAssessment === false }">
                <div class="drag-handle">
                  <el-icon><Rank /></el-icon>
                </div>
                <span class="item-type-tag" :class="itemTypeTagClass(element)">{{ itemTypeLabel(element) }}</span>
                <div class="item-main">
                  <div class="item-name">{{ itemDisplayName(element) }}</div>
                  <div class="item-meta">{{ itemProfileName(element) }}</div>
                </div>
                <div class="weight-editor">
                  <el-input-number
                    :model-value="element.weightG"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    size="small"
                    class="weight-input"
                    @update:model-value="(value: number | undefined) => onWeightChange(element, value)"
                  />
                  <span class="weight-unit">{{ itemUnitLabel(element) }}</span>
                </div>
                <div class="item-ratio-column">
                  <span v-if="shouldShowWeightRatio(element)" class="item-ratio">{{ weightRatioLabel(element) }}</span>
                </div>
                <div class="item-action-stack">
                  <el-switch
                    :model-value="element.includeInAssessment !== false"
                    size="small"
                    @change="(value: string | number | boolean) => onToggleInclude(element, Boolean(value))"
                  />
                  <el-button
                    size="small"
                    text
                    type="danger"
                    :icon="Delete"
                    @click="handleRemoveItem(element)"
                  />
                </div>
              </div>
            </template>
          </draggable>
        </div>
      </div>

      <!-- 中右：关键比例仪表盘 -->
      <div class="pane pane-dashboard">
        <GaugePanel :assessment="assessment" />
        <MacroCompositionPanel :assessment="assessment" />
      </div>

      <!-- 右：营养评估 -->
      <div class="pane pane-right">
        <div class="pane-title">营养评估</div>
        <div class="assessment-pane">
          <AssessmentPanel
            :assessment="assessment"
            :loading-inputs="assessmentLoading"
            :scenario="draft?.fediafDogScenario"
            :on-update-item-weight="applyItemWeight"
            @add-ingredient="handleAddOption"
          />
        </div>
      </div>

      <!-- 最右：爱犬指导 -->
      <div class="pane pane-dog">
        <div class="pane-title">爱犬指导</div>
        <div class="dog-pane">
          <DogInsightPanel
            :dog-id="referenceDogId"
            :draft-id="draft?.id"
            :series-id="seriesId"
            :energy-density-kcal-per-kg="assessment?.energyDensityKcalPerKg ?? null"
            :current-ingredient-ids="currentIngredientIds"
            @dog-changed="(dogId: string | null) => (referenceDogId = dogId)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, CircleCheckFilled, Delete, Loading, Rank, RefreshLeft, RefreshRight, WarningFilled } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { CreateRecipeSeriesStageDraftPayload } from '@/api/recipeDesigner'
import {
  FEDIAF_DOG_SCENARIO_LABELS,
  type DesignRecipeDraftDetail,
  type DesignerItem,
  type FediafDogScenario,
  type IngredientNutritionProfileOption,
  type RecipeDesignerIngredientOption
} from '@/types/recipeDesigner'
import { useRecipeDesignerAssessment } from '@/composables/useRecipeDesignerAssessment'
import { useDesignerSaveQueue } from '@/composables/useDesignerSaveQueue'
import IngredientLibrary from './components/IngredientLibrary.vue'
import AssessmentPanel from './components/AssessmentPanel.vue'
import GaugePanel from './components/GaugePanel.vue'
import MacroCompositionPanel from './components/MacroCompositionPanel.vue'
import DogInsightPanel from './components/DogInsightPanel.vue'
import type { DesignRecipeAssessmentResult } from '@/utils/recipeDesigner/assessment'

/** 兜底烹饪方式选项（后端未提供时使用） */

// 系列生命阶段 → 中文标签（对应后端 SERIES_LIFE_STAGE_LABELS）
const SERIES_LIFE_STAGE_LABELS: Record<string, string> = {
  PUPPY_UNDER_14_WEEKS: '小于 14 周幼犬',
  PUPPY_14_WEEKS_PLUS: '14 周以上幼犬',
  HIGH_ACTIVITY_ADULT: '普通成年犬',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '低能量成年犬 / 老年犬',
  REPRODUCTION: '繁殖期'
}

const route = useRoute()
const router = useRouter()
const draftId = route.params.draftId as string
const seriesId = route.params.seriesId as string
// 进入已发布草稿会自动跳转到修订版，此后用 currentDraftId 跟随最新草稿
const currentDraftId = ref(draftId)

const draft = ref<DesignRecipeDraftDetail | null>(null)
const items = ref<DesignerItem[]>([])
const initialLoading = ref(true)
/** 切换生命阶段中 */
const switchingStage = ref(false)

const { loadInputs, refreshInputs, loadingInputs: assessmentLoading, inputsError, compute } = useRecipeDesignerAssessment()
const {
  saveStatus,
  enqueue,
  flushNow,
  hasPending,
  cancelPendingRemove,
  cancelBatchOrders,
  cancelItemOps
} = useDesignerSaveQueue()

const assessment = computed<DesignRecipeAssessmentResult | null>(() => {
  if (!draft.value || !draft.value.fediafDogScenario) return null
  // 依赖评估输入加载状态：首次进入时目标值异步到达，加载完成后需重算
  void assessmentLoading.value
  void inputsError.value
  return compute(draft.value.fediafDogScenario, draft.value.id, items.value)
})

const referenceDogId = ref<string | null>(null)

function syncReferenceDog() {
  referenceDogId.value = draft.value?.series?.referenceDogId ?? null
}

/** 计入评估的原料总重（与评估、重量百分比一致） */
const includedTotalWeightG = computed(() =>
  items.value
    .filter((item) => item.includeInAssessment !== false)
    .reduce((sum, item) => sum + Number(item.weightG ?? 0), 0)
)

const includedTotalWeightText = computed(() => {
  const total = includedTotalWeightG.value
  if (total >= 1000) return `${(total / 1000).toFixed(2)}kg`
  return `${Math.round(total)}g`
})

// ---------- 明细列表显示 ----------

function itemTypeLabel(item: DesignerItem): string {
  return isSupplementItem(item) ? '补剂' : '食材'
}

function itemTypeTagClass(item: DesignerItem): string {
  return isSupplementItem(item) ? 'supplement' : 'food'
}

/** 标准原料名称（与小程序一致） */
function itemDisplayName(item: DesignerItem): string {
  return (
    item.name ||
    item.ingredientName ||
    item.ingredient?.name ||
    item.nutritionFoodName ||
    item.nutritionFood?.name ||
    '未命名原料'
  )
}

/** 营养档案名称（与小程序一致） */
function itemProfileName(item: DesignerItem): string {
  return (
    item.nutritionFood?.displayNameZh ||
    item.nutritionProfileDisplayName ||
    item.nutritionFoodName ||
    item.nutritionFood?.name ||
    '未选择营养档案'
  )
}

/** 重量百分比：仅食材（非补剂）且计入评估、总重大于 0 时显示 */
function shouldShowWeightRatio(item: DesignerItem): boolean {
  if (isSupplementItem(item)) return false
  if (item.includeInAssessment === false) return false
  const weight = Number(item.weightG ?? 0)
  return includedTotalWeightG.value > 0 && weight > 0
}

function weightRatioLabel(item: DesignerItem): string {
  const percent = (Number(item.weightG ?? 0) / includedTotalWeightG.value) * 100
  const rounded = Math.round(percent * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'pending':
      return '待保存'
    case 'saving':
      return '保存中…'
    case 'error':
      return '保存失败，自动重试中'
    default:
      return '已保存'
  }
})

const stageLabel = computed(() => {
  const stage = draft.value?.seriesLifeStage || ''
  return SERIES_LIFE_STAGE_LABELS[stage] ?? stage
})

// ---------- 撤销 / 重做 ----------
type HistoryEntry =
  | { type: 'add'; item: DesignerItem }
  | { type: 'remove'; item: DesignerItem; index: number }
  | {
      type: 'update'
      itemId: string
      field: 'weightG' | 'preparationMethod' | 'includeInAssessment'
      before: unknown
      after: unknown
    }
  | { type: 'reorder'; before: string[]; after: string[] }

const HISTORY_LIMIT = 50
const undoStack = ref<HistoryEntry[]>([])
const redoStack = ref<HistoryEntry[]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)
// 系列生命阶段草稿且非正式版时，允许一键恢复正式版本
const canRevert = computed(() => {
  const detail = draft.value
  if (!detail?.seriesId || !detail.seriesLifeStage) return false
  return String(detail.status || '').toUpperCase() !== 'PUBLISHED'
})
const reverting = ref(false)

function recordHistory(entry: HistoryEntry) {
  undoStack.value.push(entry)
  if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
  redoStack.value.length = 0
}

function applyUpdateField(item: DesignerItem, field: 'weightG' | 'preparationMethod' | 'includeInAssessment', value: unknown) {
  if (field === 'weightG') item.weightG = Number(value ?? 0)
  else if (field === 'preparationMethod') item.preparationMethod = (value as string | undefined) ?? undefined
  else item.includeInAssessment = Boolean(value)
}

function buildUpdateData(field: 'weightG' | 'preparationMethod' | 'includeInAssessment', value: unknown) {
  if (field === 'weightG') return { weightG: Number(value ?? 0) }
  if (field === 'preparationMethod') return { preparationMethod: (value as string | null | undefined) ?? null }
  return { includeInAssessment: Boolean(value) }
}

function applyOrderByIds(ids: string[]) {
  const byId = new Map(items.value.map((item) => [item.id, item]))
  const next = ids.map((id) => byId.get(id)).filter((item): item is DesignerItem => Boolean(item))
  for (const item of items.value) {
    if (!next.some((candidate) => candidate.id === item.id)) next.push(item)
  }
  items.value = next
}

/** 撤销删除后服务器上原料已不存在时，用原信息重新创建原料（生成新 id 并替换本地引用） */
async function recreateItem(snapshot: DesignerItem) {
  if (!draft.value) return
  const payload = {
    ingredientId: snapshot.ingredientId ?? snapshot.ingredient?.id,
    nutritionFoodId: snapshot.nutritionFoodId ?? '',
    weightG: Number(snapshot.weightG ?? 0),
    includeInAssessment: snapshot.includeInAssessment,
    preparationMethod: snapshot.preparationMethod,
    nutrientTargetKey: snapshot.nutrientTargetKey ?? undefined,
    nutrientTargetValue: snapshot.nutrientTargetValue ?? undefined
  }
  try {
    const created = await recipeDesignerApi.addItem(draft.value.id, payload)
    const oldId = snapshot.id
    items.value = items.value.map((item) => (item.id === oldId ? created : item))
    // 旧 id 在服务器上已失效：丢弃指向它的待保存操作，并把历史栈中的 id 换成新 id
    cancelItemOps(oldId)
    remapHistoryItemId(oldId, created.id)
    await refreshInputs(draft.value.id)
  } catch {
    ElMessage.error('原料恢复失败，请重试')
    items.value = items.value.filter((item) => item.id !== snapshot.id)
  }
}

function remapHistoryItemId(oldId: string, newId: string) {
  for (const stack of [undoStack.value, redoStack.value]) {
    for (const entry of stack) {
      if (entry.type === 'remove' || entry.type === 'add') {
        if (entry.item.id === oldId) entry.item.id = newId
      } else if (entry.type === 'update' && entry.itemId === oldId) {
        entry.itemId = newId
      }
    }
  }
}

async function applyHistoryEntry(entry: HistoryEntry, direction: 'undo' | 'redo') {
  const isUndo = direction === 'undo'
  switch (entry.type) {
    case 'add': {
      if (isUndo) {
        // 撤销新增：本地移除 + 排队删除
        items.value = items.value.filter((item) => item.id !== entry.item.id)
        enqueue({ kind: 'removeItem', itemId: entry.item.id })
      } else {
        // 重做新增：若删除尚未发送则直接恢复；否则重新创建
        if (cancelPendingRemove(entry.item.id)) {
          items.value = [...items.value, entry.item]
        } else {
          await recreateItem(entry.item)
        }
      }
      break
    }
    case 'remove': {
      if (isUndo) {
        const index = Math.min(entry.index, items.value.length)
        const next = [...items.value]
        next.splice(index, 0, entry.item)
        items.value = next
        if (cancelPendingRemove(entry.item.id)) {
          // 删除请求尚未发送：本地恢复即可，服务器上原料仍在
        } else {
          // 已发送：服务器上原料已删除，重新创建并换新 id
          await recreateItem(entry.item)
        }
      } else {
        items.value = items.value.filter((item) => item.id !== entry.item.id)
        enqueue({ kind: 'removeItem', itemId: entry.item.id })
      }
      break
    }
    case 'update': {
      const value = isUndo ? entry.before : entry.after
      const item = items.value.find((candidate) => candidate.id === entry.itemId)
      if (item) applyUpdateField(item, entry.field, value)
      enqueue({
        kind: 'updateItem',
        itemId: entry.itemId,
        data: buildUpdateData(entry.field, value)
      })
      break
    }
    case 'reorder': {
      cancelBatchOrders()
      const ids = isUndo ? entry.before : entry.after
      applyOrderByIds(ids)
      enqueue({
        kind: 'batchOrder',
        order: ids.map((id, index) => ({ id, sortOrder: index }))
      })
      break
    }
  }
}

async function undo() {
  const entry = undoStack.value.pop()
  if (!entry) return
  redoStack.value.push(entry)
  await applyHistoryEntry(entry, 'undo')
}

async function redo() {
  const entry = redoStack.value.pop()
  if (!entry) return
  undoStack.value.push(entry)
  await applyHistoryEntry(entry, 'redo')
}

function isSupplementItem(item: DesignerItem): boolean {
  return (
    String(item.ingredientType || item.ingredient?.type || '').trim().toUpperCase() === 'SUPPLEMENT'
  )
}

/** 明细行单位：食材统一为克；补剂按其规格单位显示（如 粒/片/胶囊/毫升），无规格时兜底克 */
function itemUnitLabel(item: DesignerItem): string {
  if (!isSupplementItem(item)) return 'g'
  const display = String(item.ingredient?.unitDisplayLabel || '').trim()
  const propsUnit = String(
    (item.ingredient?.properties as Record<string, unknown> | null)?.['display_unit'] ?? ''
  ).trim()
  const purchase = String(item.ingredient?.purchaseUnit || '').trim()
  return display || propsUnit || purchase || 'g'
}

/** 当前配方已使用的标准原料 ID（仅食材类），用于与「最近吃过的食材」对比提醒 */
const currentIngredientIds = computed(() => {
  const ids = new Set<string>()
  for (const item of items.value) {
    if (isSupplementItem(item)) continue
    const id =
      item.ingredientId ??
      item.ingredient?.id ??
      item.nutritionFood?.mappings?.find((m) => m.isPrimary)?.ingredientId
    if (id) ids.add(id)
  }
  return Array.from(ids)
})

async function loadDraft(targetDraftId?: string) {
  initialLoading.value = true
  const id = targetDraftId ?? draftId
  try {
    let detail = await recipeDesignerApi.getDraft(id)
    // 已发布正式草稿不可直接编辑：自动创建可编辑修订版并跳转（与小程序行为一致）
    if (String(detail.status || '').toUpperCase() === 'PUBLISHED') {
      try {
        const revision = (await recipeDesignerApi.createRevisionDraft(
          detail.id
        )) as unknown as DesignRecipeDraftDetail
        if (revision?.id && revision.id !== detail.id) {
          ElMessage.info('已创建可编辑修订版本')
          currentDraftId.value = revision.id
          router.replace(
            `/recipe-designer/series/${detail.seriesId ?? seriesId}/drafts/${revision.id}`
          )
          detail = revision
        } else {
          currentDraftId.value = revision?.id ?? detail.id
          detail = revision
        }
      } catch {
        ElMessage.error('正式版本无法直接编辑，进入修订版失败')
        initialLoading.value = false
        router.push('/recipe-designer')
        return
      }
    }
    draft.value = detail
    syncReferenceDog()
    items.value = (detail.items ?? []).map((item) => ({
      ...item,
      includeInAssessment: item.includeInAssessment !== false
    }))
    undoStack.value = []
    redoStack.value = []
    await loadInputs(detail.id, detail.fediafDogScenario)
  } catch {
    ElMessage.error('草稿加载失败')
  } finally {
    initialLoading.value = false
  }
}

/** 切换该配方系列的生命阶段：打开目标阶段的草稿（无草稿时自动新建并带入当前内容） */
async function handleSwitchStage(scenario: string) {
  if (!draft.value || switchingStage.value) return
  if (scenario === draft.value.fediafDogScenario) return
  const targetLabel = FEDIAF_DOG_SCENARIO_LABELS[scenario as FediafDogScenario] ?? scenario
  try {
    await ElMessageBox.confirm(
      `确认切换到「${targetLabel}」阶段吗？\n将把当前配方内容复制到该阶段（若该阶段已有草稿则直接打开），当前草稿不受影响。`,
      '切换生命阶段',
      {
        type: 'warning',
        confirmButtonText: '确认切换',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  switchingStage.value = true
  try {
    const payload: CreateRecipeSeriesStageDraftPayload = {
      scenario: scenario as FediafDogScenario,
      sourceDraftId: currentDraftId.value
    }
    const next = await recipeDesignerApi.createSeriesStageDraft(seriesId, payload)
    currentDraftId.value = next.id
    router.replace(`/recipe-designer/series/${seriesId}/drafts/${next.id}`)
    await loadDraft(next.id)
    ElMessage.success(`已切换到「${targetLabel}」`)
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    switchingStage.value = false
  }
}

/** 一键恢复正式版：丢弃未发布修改，回到最近一次发布的正式版本 */
async function handleRevert() {
  if (!draft.value) return
  try {
    await ElMessageBox.confirm(
      '将丢弃本草稿的全部未发布修改，恢复为最近一次发布的正式版本。确定继续吗？',
      '恢复正式版',
      {
        type: 'warning',
        confirmButtonText: '恢复',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  reverting.value = true
  try {
    const reverted = (await recipeDesignerApi.revertDraftToLatestOfficial(
      currentDraftId.value
    )) as unknown as DesignRecipeDraftDetail
    draft.value = reverted
    items.value = (reverted.items ?? []).map((item) => ({
      ...item,
      includeInAssessment: item.includeInAssessment !== false
    }))
    undoStack.value = []
    redoStack.value = []
    await loadInputs(reverted.id, reverted.fediafDogScenario)
    ElMessage.success('已恢复正式版')
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    reverting.value = false
  }
}

async function handleAddOption(
  option: RecipeDesignerIngredientOption,
  targetProfile?: IngredientNutritionProfileOption,
  weightG?: number
) {
  if (!draft.value) return
  const profile =
    targetProfile ??
    option.nutritionProfiles.find((candidate) => candidate.isPrimary) ??
    option.nutritionProfiles[0]
  if (!profile) return

  const payload = {
    ingredientId: option.id,
    nutritionFoodId: profile.nutritionFoodId,
    weightG: weightG ?? 100,
    includeInAssessment: true
  }

  try {
    const created = await recipeDesignerApi.addItem(draft.value.id, payload)
    items.value = [...items.value, created]
    recordHistory({ type: 'add', item: created })
    await refreshInputs(draft.value.id)
  } catch {
    // 拦截器已提示
  }
}

function onWeightChange(item: DesignerItem, value: number | undefined) {
  const weightG = Number(value ?? 0)
  if (!Number.isFinite(weightG) || weightG < 0) return
  const before = item.weightG
  item.weightG = weightG
  recordHistory({
    type: 'update',
    itemId: item.id,
    field: 'weightG',
    before,
    after: weightG
  })
  // 本地即时生效（computed 自动重算评估），防抖保存
  enqueue({
    kind: 'updateItem',
    itemId: item.id,
    data: { weightG }
  })
}

function onToggleInclude(item: DesignerItem, value: boolean) {
  const after = value
  const before = !after
  item.includeInAssessment = after
  recordHistory({
    type: 'update',
    itemId: item.id,
    field: 'includeInAssessment',
    before,
    after
  })
  enqueue({
    kind: 'updateItem',
    itemId: item.id,
    data: { includeInAssessment: after }
  })
}

/** 弹窗内修改原料用量：本地即时生效（评估自动重算）+ 保存队列 */
async function applyItemWeight(itemId: string, weightG: number): Promise<void> {
  const item = items.value.find((candidate) => candidate.id === itemId)
  if (!item) return
  const before = item.weightG
  item.weightG = weightG
  recordHistory({
    type: 'update',
    itemId,
    field: 'weightG',
    before,
    after: weightG
  })
  enqueue({
    kind: 'updateItem',
    itemId,
    data: { weightG }
  })
}

async function handleRemoveItem(item: DesignerItem) {
  const index = items.value.findIndex((candidate) => candidate.id === item.id)
  items.value = items.value.filter((candidate) => candidate.id !== item.id)
  recordHistory({ type: 'remove', item: { ...item }, index: index < 0 ? 0 : index })
  enqueue({ kind: 'removeItem', itemId: item.id })
}

let reorderBeforeIds: string[] = []

function handleReorderStart() {
  reorderBeforeIds = items.value.map((item) => item.id)
}

async function handleReorder() {
  if (!draft.value) return
  const afterIds = items.value.map((item) => item.id)
  recordHistory({ type: 'reorder', before: reorderBeforeIds, after: afterIds })
  cancelBatchOrders()
  const order = items.value.map((item, index) => ({
    id: item.id,
    sortOrder: index
  }))
  enqueue({ kind: 'batchOrder', order })
}

function goPublish() {
  router.push(`/recipe-designer/drafts/${currentDraftId.value}/publish`)
}

function goBack() {
  router.push('/recipe-designer')
}

let beforeUnloadRegistered = false
function registerBeforeUnload() {
  if (beforeUnloadRegistered) return
  beforeUnloadRegistered = true
  window.addEventListener('beforeunload', (event) => {
    if (hasPending()) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) void redo()
    else void undo()
  } else if (key === 'y') {
    event.preventDefault()
    void redo()
  }
}

onMounted(() => {
  registerBeforeUnload()
  window.addEventListener('keydown', handleKeydown)
  void loadDraft()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (hasPending()) {
    void flushNow()
  }
})
</script>

<style scoped>
.designer-editor {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  box-sizing: border-box;
}
.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
  flex-shrink: 0;
}
.header-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.draft-name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-tag {
  color: #909399;
  font-size: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 2px 8px;
  flex-shrink: 0;
}
.stage-switch-btn {
  flex-shrink: 0;
}
.stage-current {
  color: #909399;
  margin-left: 4px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.save-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}
.save-status.saving {
  color: #409eff;
}
.save-status.error {
  color: #f56c6c;
}
.editor-body {
  flex: 1 0 auto;
  display: flex;
  align-items: stretch;
}
.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
}
.pane-library {
  width: 250px;
  border-right: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.pane-items {
  flex: 1;
  min-width: 320px;
  border-right: 1px solid #e4e7ed;
}
.pane-dashboard {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid #e4e7ed;
  background: #fafbfc;
}
.pane-right {
  width: 330px;
  flex-shrink: 0;
  border-right: 1px solid #e4e7ed;
}
.pane-dog {
  width: 300px;
  flex-shrink: 0;
}
.assessment-pane {
  flex: 1 0 auto;
}
.dog-pane {
  flex: 1 0 auto;
}
.pane-title {
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.item-count {
  font-weight: 400;
  color: #909399;
  font-size: 12px;
}
.item-list {
  flex: 1 0 auto;
  padding: 6px;
}
.item-row {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 6px 8px;
  margin-bottom: 5px;
  background: #fff;
}
.item-row:hover {
  border-color: #c6e2ff;
}
.item-row-excluded {
  opacity: 0.6;
}
.drag-handle {
  cursor: grab;
  color: #c0c4cc;
  font-size: 16px;
  flex-shrink: 0;
}
.drag-ghost {
  opacity: 0.4;
}
/* 类型标签：食材 / 补剂 */
.item-type-tag {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.item-type-tag.food {
  color: #409eff;
  background: #ecf5ff;
}
.item-type-tag.supplement {
  color: #e6a23c;
  background: #fdf6ec;
}
.item-main {
  flex: 1;
  min-width: 0;
}
.item-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-meta {
  margin-top: 2px;
  font-size: 11px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 用量编辑 */
.weight-editor {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.weight-editor .weight-input {
  width: 70px;
}
.weight-editor :deep(.el-input__inner) {
  padding: 0 4px;
}
.weight-unit {
  font-size: 12px;
  color: #909399;
}
/* 重量百分比 */
.item-ratio-column {
  flex-shrink: 0;
  width: 46px;
  text-align: right;
}
.item-ratio {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}
/* 开关 + 删除 */
.item-action-stack {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}
.dog-pane {
  padding: 0 12px;
  box-sizing: border-box;
}
</style>
