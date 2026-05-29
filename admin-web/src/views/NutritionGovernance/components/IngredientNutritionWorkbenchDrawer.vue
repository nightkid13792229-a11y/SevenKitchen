<template>
  <el-drawer
    v-model="visible"
    :title="title"
    size="92%"
    destroy-on-close
  >
    <template v-if="ingredient">
      <section class="ingredient-summary">
        <div>
          <div class="summary-label">后台标准原料</div>
          <h3>{{ ingredient.name }}</h3>
        </div>
        <div class="summary-actions">
          <div class="summary-stat">
            <span>{{ candidateCounterCount }}</span>
            <small>{{ candidateCounterLabel }}</small>
          </div>
          <el-button
            v-if="!isProfileDraftMode && confirmedCandidateCount"
            plain
            type="primary"
            :disabled="busy"
            @click="remappingConfirmedProfiles = !remappingConfirmedProfiles"
          >
            {{ remappingConfirmedProfiles ? '退出调整' : '调整主/次档案' }}
          </el-button>
        </div>
      </section>

      <section class="agent-requirement-panel">
        <div class="agent-requirement-copy">
          {{ agentRequirementCopy }}
        </div>
        <el-input
          v-model="reviewerRequirement"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          maxlength="300"
          show-word-limit
          placeholder="匹配要求：例如普通卷心菜，生，USDA 优先；不要把 pak-choi、pe-tsai、紫甘蓝作为主档案。"
        />
        <el-checkbox
          v-model="onlineWhitelistSearch"
          class="online-whitelist-checkbox"
        >
          联网白名单搜索可信网页来源
        </el-checkbox>
        <el-button
          type="primary"
          :loading="rankingWithAgent"
          :disabled="!ingredient.id || rankingWithAgent || busy"
          @click="emitRankWithAgent"
        >
          查找候选并排序
        </el-button>
      </section>

      <section class="rematch-toolbar">
        <el-input
          v-model="fdcId"
          clearable
          placeholder="USDA FDC ID"
          class="fdc-input"
        />

        <el-button
          :disabled="!fdcId.trim() || importing || busy"
          :loading="importing"
          @click="emitImportUsda"
        >
          导入候选
        </el-button>
      </section>

      <el-empty
        v-if="!candidateRows.length"
        description="暂无候选档案"
      />

      <template v-else>
      <el-alert
        v-if="isProfileDraftMode"
        class="source-scope-alert"
        :title="sourceScopeAlertTitle"
        type="info"
        :closable="false"
        show-icon
      >
        {{ sourceScopeAlertDescription }}
      </el-alert>

      <el-alert
        v-if="noAdmissionCandidateFound"
        class="source-scope-alert"
        title="未找到可入库营养档案"
        type="warning"
        :closable="false"
        show-icon
      >
        本次召回结果都已入库或被 Agent 标记为拒绝/换来源；这些记录不会参与本次新增保存。
      </el-alert>

      <div
        v-if="isProfileDraftMode && excludedCandidateRows.length"
        class="excluded-toggle"
      >
        <el-button
          size="small"
          plain
          type="danger"
          @click="showExcludedCandidates = !showExcludedCandidates"
        >
          {{
            showExcludedCandidates
              ? '隐藏排除结果'
              : `查看排除结果 ${excludedCandidateRows.length} 条`
          }}
        </el-button>
      </div>

      <el-alert
        v-if="remappingConfirmedProfiles"
        class="remap-mode-alert"
        title="已确认档案可调整主次"
        type="info"
        :closable="false"
        show-icon
      >
        这里只更新默认主档案和次级档案映射，不会改动 USDA/CFCT 原始营养数据。
      </el-alert>

      <section
        v-for="group in candidateGroups"
        :key="group.key"
        class="candidate-group"
      >
        <div class="candidate-group-header">
          <div>
            <strong>{{ group.label }}</strong>
            <span>{{ group.description }}</span>
          </div>
          <el-tag
            size="small"
            :type="group.tagType"
          >
            {{ group.rows.length }} 条
          </el-tag>
        </div>

      <el-table
        :data="group.rows"
        stripe
        class="candidate-config-table"
        row-key="id"
      >
        <el-table-column type="expand" width="46">
          <template #default="{ row }">
            <NutritionProfilePreview :profile="row.normalizedNutrition" />
            <div
              v-if="row.validationResult"
              class="validation-detail"
            >
              <el-alert
                :title="validationDetailTitle(row.validationResult)"
                :type="validationAlertType(row.validationResult)"
                :closable="false"
                show-icon
              >
                <template #default>
                  <div class="validation-detail-text">
                    {{ row.validationResult.agent?.summary || validationIssueSummary(row.validationResult) }}
                  </div>
                  <div class="validation-detail-list">
                    <div
                      v-for="item in validationDetailItems(row.validationResult)"
                      :key="`${row.id}-${item.label}`"
                      class="validation-detail-item"
                    >
                      <strong>{{ item.label }}</strong>
                      <span>{{ item.text }}</span>
                    </div>
                  </div>
                </template>
              </el-alert>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="主档案" width="92" align="center">
          <template #default="{ row }">
            <el-radio
              v-model="selectedPrimaryCandidateId"
              :label="row.id"
              :disabled="!canEditCandidateMapping(row)"
              @change="handlePrimaryChange(row.id)"
            >
              主
            </el-radio>
          </template>
        </el-table-column>

        <el-table-column label="次级档案" width="96" align="center">
          <template #default="{ row }">
            <el-checkbox
              :model-value="secondaryCandidateIds.includes(row.id)"
              :disabled="!canEditCandidateMapping(row) || selectedPrimaryCandidateId === row.id"
              @change="toggleSecondaryCandidate(row.id, $event)"
            >
              次
            </el-checkbox>
          </template>
        </el-table-column>

        <el-table-column label="候选食物" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="primary-text">
              {{ row.sourceRecord?.foodName || row.sourceRecord?.sourceTitle || '-' }}
            </div>
            <div class="secondary-text">
              {{ row.sourceRecord?.sourceKey || '-' }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="档案状态" width="102" align="center">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="candidateStatusTagType(row.status)"
            >
              {{ candidateStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="分数" width="82" align="right">
          <template #default="{ row }">
            {{ typeof row.score === 'number' ? row.score.toFixed(2) : '-' }}
          </template>
        </el-table-column>

        <el-table-column label="Agent建议" min-width="300">
          <template #default="{ row }">
            <div class="primary-text">
              {{ agentActionLabel(row.agentReview?.recommendedAction) }}
            </div>
            <div class="secondary-text">
              {{ row.agentReview?.confidence || '未审核' }}
            </div>
            <div
              v-if="agentReviewDetailText(row)"
              class="secondary-text agent-rationale"
            >
              语义分析：{{ agentReviewDetailText(row) }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="营养状态" min-width="150">
          <template #default="{ row }">
            <el-select
              v-model="row.reviewForm.preparationState"
              clearable
              filterable
              :disabled="!canEditCandidateFields(row)"
              placeholder="状态"
            >
              <el-option
                v-for="option in NUTRITION_PREPARATION_STATE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </template>
        </el-table-column>

        <el-table-column label="可食部/规格" min-width="160">
          <template #default="{ row }">
            <el-select
              v-model="row.reviewForm.ediblePortionLabel"
              clearable
              filterable
              :disabled="!canEditCandidateFields(row)"
              placeholder="规格"
            >
              <el-option
                v-for="option in NUTRITION_EDIBLE_PORTION_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.label"
              />
            </el-select>
          </template>
        </el-table-column>

        <el-table-column label="加工标记" min-width="150">
          <template #default="{ row }">
            <el-select
              v-model="row.reviewForm.processingLabel"
              clearable
              filterable
              :disabled="!canEditCandidateFields(row)"
              placeholder="加工"
            >
              <el-option
                v-for="option in NUTRITION_PROCESSING_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.label"
              />
            </el-select>
          </template>
        </el-table-column>

        <el-table-column label="备注" min-width="180">
          <template #default="{ row }">
            <el-input
              v-model="row.reviewForm.reviewNote"
              clearable
              :disabled="!canEditCandidateFields(row)"
              placeholder="审核备注"
            />
          </template>
        </el-table-column>

        <el-table-column label="营养校验" min-width="190">
          <template #default="{ row }">
            <template v-if="row.validationResult">
              <el-tag
                size="small"
                :type="validationTagType(row.validationResult.system.status)"
              >
                {{ validationStatusLabel(row.validationResult.system.status) }}
              </el-tag>
              <div class="secondary-text validation-summary">
                {{ row.validationResult.agent?.summary || validationIssueSummary(row.validationResult) }}
              </div>
            </template>
            <span v-else class="secondary-text">未校验</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button
                link
                type="primary"
                :loading="validatingCandidateId === row.id"
                :disabled="busy || validatingCandidateId === row.id"
                @click="emitValidateNutrition(row)"
              >
                校验营养
              </el-button>
              <el-button
                link
                type="danger"
                :loading="rejectingCandidateId === row.id"
                :disabled="!isEditableCandidate(row) || busy || rejectingCandidateId === row.id"
                @click="emitRejectCandidate(row)"
              >
                拒绝候选
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      </section>
      </template>
    </template>

    <el-empty v-else description="请选择一个原料" />

    <template #footer>
      <div class="drawer-actions">
        <el-button @click="visible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="!configurableCandidateCount"
          @click="emitSave"
        >
          {{ footerPrimaryButtonLabel }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import NutritionProfilePreview from './NutritionProfilePreview.vue'
import {
  NUTRITION_EDIBLE_PORTION_OPTIONS,
  NUTRITION_PREPARATION_STATE_OPTIONS,
  NUTRITION_PROCESSING_OPTIONS,
  resolveReviewOptionLabel,
  resolveReviewOptionValue
} from '../nutritionReviewTaxonomy'
import type {
  ApplyIngredientCandidateConfigurationPayload,
  CandidateNutritionValidationWithAgentResult,
  ConfirmNutritionCandidatePayload,
  IngredientNutritionCandidateListItem,
  NutritionGovernanceIngredientSummary
} from '@/types/nutritionGovernance'

interface CandidateRowForm {
  preparationState: string
  ediblePortionLabel: string
  processingLabel: string
  reviewNote: string
}

type CandidateConfigRow = IngredientNutritionCandidateListItem & {
  reviewForm: CandidateRowForm
  validationResult: CandidateNutritionValidationWithAgentResult | null
}

type CandidateGroup = {
  key: string
  label: string
  description: string
  tagType: 'success' | 'warning' | 'danger' | 'info'
  rows: CandidateConfigRow[]
}

type ValidationFieldIssue = CandidateNutritionValidationWithAgentResult['system']['missingExpectedFields'][number]

type ValidationDetailItem = {
  label: string
  text: string
}

const props = defineProps<{
  modelValue: boolean
  title?: string
  mode?: 'GOVERNANCE' | 'PROFILE_DRAFT'
  ingredient: NutritionGovernanceIngredientSummary | null
  candidates: IngredientNutritionCandidateListItem[]
  existingProfileSourceKeys?: string[]
  busy?: boolean
  rematching?: boolean
  importing?: boolean
  rankingWithAgent?: boolean
  rejectingCandidateId?: string
  validatingCandidateId?: string
  validationResults?: Record<string, CandidateNutritionValidationWithAgentResult>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: ApplyIngredientCandidateConfigurationPayload): void
  (e: 'rematch', ingredientId: string): void
  (e: 'import-usda', payload: { ingredientId: string; fdcId: string }): void
  (e: 'reject-candidate', candidate: IngredientNutritionCandidateListItem): void
  (e: 'rank-with-agent', payload: {
    ingredientId: string
    reviewerRequirement: string
    onlineWhitelistSearch?: boolean
  }): void
  (e: 'validate-nutrition', candidate: IngredientNutritionCandidateListItem): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const title = computed(() => props.title || '原料营养档案审批')
const isProfileDraftMode = computed(() => props.mode === 'PROFILE_DRAFT')
const existingProfileSourceKeySet = computed(() => new Set(
  (props.existingProfileSourceKeys || [])
    .map(normalizeSourceKey)
    .filter(Boolean)
))

const selectedPrimaryCandidateId = ref('')
const secondaryCandidateIds = ref<string[]>([])
const fdcId = ref('')
const reviewerRequirement = ref('')
const onlineWhitelistSearch = ref(false)
const remappingConfirmedProfiles = ref(false)
const showExcludedCandidates = ref(false)
const rowForms = reactive<Record<string, CandidateRowForm>>({})

const candidateRows = computed<CandidateConfigRow[]>(() => (
  [...props.candidates]
    .sort((left, right) => primaryRank(right) - primaryRank(left))
    .map((candidate) => ({
      ...candidate,
      reviewForm: ensureRowForm(candidate),
      validationResult: props.validationResults?.[candidate.id] ?? null
    }))
))

const admissionCandidateRows = computed(() => candidateRows.value.filter(isAdmissionCandidate))
const confirmedCandidateRows = computed(() => candidateRows.value.filter(isExistingProfileCandidate))
const excludedCandidateRows = computed(() => candidateRows.value.filter(isExcludedCandidate))

const candidateCounterCount = computed(() => (
  isProfileDraftMode.value ? admissionCandidateRows.value.length : props.candidates.length
))

const candidateCounterLabel = computed(() => (
  isProfileDraftMode.value ? '可入库候选' : '候选档案'
))

const agentRequirementCopy = computed(() => (
  isProfileDraftMode.value
    ? 'Agent 会先生成搜索词和易混淆项；开启联网白名单时会抓取可信网页来源、可用时调用 USDA 官方 API，再合并本地 USDA/CFCT/NZFCD 候选并排序。'
    : 'Agent 会先生成搜索词和易混淆项，系统宽召回候选，再由 Agent 排序；最终仍由你确认入库。'
))

const sourceScopeAlertTitle = computed(() => (
  onlineWhitelistSearch.value
    ? '将搜索可信网页来源，并合并 USDA / NZFCD / CFCT'
    : '本次仅搜索本地 USDA / NZFCD / CFCT'
))

const sourceScopeAlertDescription = computed(() => (
  onlineWhitelistSearch.value
    ? '可信网页来源必须来自白名单域名；只有能抓取到结构化原始营养值时才会生成候选，不会自动写入标准原料营养档案。'
    : '还没有执行联网白名单检索；若没有可入库候选，需要补充本地 CFCT/NZFCD/USDA 来源或勾选联网白名单搜索。'
))

const noAdmissionCandidateFound = computed(() => (
  isProfileDraftMode.value &&
  candidateRows.value.length > 0 &&
  admissionCandidateRows.value.length === 0
))

const candidateGroups = computed<CandidateGroup[]>(() => {
  if (isProfileDraftMode.value) {
    const groups: CandidateGroup[] = []

    if (admissionCandidateRows.value.length) {
      groups.push({
        key: 'admission',
        label: '可入库候选',
        description: 'Agent 未明确排除，可选择主档案或次级档案后确认入库。',
        tagType: 'success',
        rows: admissionCandidateRows.value
      })
    }

    if (confirmedCandidateRows.value.length) {
      groups.push({
        key: 'confirmed',
        label: '已入库档案',
        description: '只读展示，避免与本次新增候选混淆；如需调整主次，请回档案管理器操作。',
        tagType: 'info',
        rows: confirmedCandidateRows.value
      })
    }

    if (showExcludedCandidates.value && excludedCandidateRows.value.length) {
      groups.push({
        key: 'excluded',
        label: '排除结果',
        description: 'Agent 标记为拒绝/换来源或已被拒绝，仅用于追溯，不参与本次保存。',
        tagType: 'danger',
        rows: excludedCandidateRows.value
      })
    }

    return groups
  }

  const groups: CandidateGroup[] = [
    {
      key: 'recommended',
      label: '推荐候选',
      description: 'Agent 认为适合作为当前主档案优先审核。',
      tagType: 'success',
      rows: []
    },
    {
      key: 'secondary',
      label: '可作为备用或需复核',
      description: '可能可用，但更适合作为备用档案或需要人工判断。',
      tagType: 'warning',
      rows: []
    },
    {
      key: 'not-recommended',
      label: '不推荐但保留查看',
      description: '系统不硬拦搜索结果，Agent 标记为不推荐或需要换来源。',
      tagType: 'danger',
      rows: []
    }
  ]

  for (const candidate of candidateRows.value) {
    const group = groups[candidateGroupIndex(candidate)] ?? groups[1]!
    group.rows.push(candidate)
  }

  return groups.filter((group) => group.rows.length > 0)
})

const confirmedCandidateCount = computed(() => props.candidates.filter(isConfirmedCandidate).length)

const configurableCandidateCount = computed(() => (
  props.candidates.filter(canConfigureCandidate).length
))

const footerPrimaryButtonLabel = computed(() => {
  if (isProfileDraftMode.value) return '保存可入库候选'
  return remappingConfirmedProfiles.value ? '保存主/次档案' : '保存原料配置'
})

watch(
  () => ({
    visible: props.modelValue,
    ids: props.candidates
      .map((candidate) => `${candidate.id}:${candidate.agentReview?.recommendedAction || ''}:${candidate.reviewGroup || ''}`)
      .join('|')
  }),
  ({ visible: isVisible }) => {
    if (isVisible) {
      resetRows()
    }
  },
  { immediate: true }
)

watch(selectedPrimaryCandidateId, (nextPrimaryId, previousPrimaryId) => {
  if (
    !remappingConfirmedProfiles.value ||
    !previousPrimaryId ||
    previousPrimaryId === nextPrimaryId
  ) {
    return
  }

  const previousPrimary = props.candidates.find((candidate) => candidate.id === previousPrimaryId)
  if (
    previousPrimary &&
    isConfirmedCandidate(previousPrimary) &&
    !secondaryCandidateIds.value.includes(previousPrimaryId)
  ) {
    secondaryCandidateIds.value = [...secondaryCandidateIds.value, previousPrimaryId]
  }
})

function resetRows() {
  remappingConfirmedProfiles.value = false
  showExcludedCandidates.value = false

  for (const key of Object.keys(rowForms)) {
    delete rowForms[key]
  }

  for (const candidate of props.candidates) {
    rowForms[candidate.id] = buildInitialRowForm(candidate)
  }

  const previousPrimary = props.candidates.find(
    (candidate) => candidate.id === selectedPrimaryCandidateId.value && canConfigureCandidate(candidate)
  )
  const confirmedPrimary = isProfileDraftMode.value ? null : props.candidates.find(
    (candidate) => candidateMappingRole(candidate) === 'PRIMARY'
  )
  const selectableCandidates = isProfileDraftMode.value
    ? props.candidates.filter(isAdmissionCandidate)
    : props.candidates
  const primary = previousPrimary ?? confirmedPrimary ?? recommendPrimaryCandidate(selectableCandidates)
  selectedPrimaryCandidateId.value = primary?.id ?? ''
  secondaryCandidateIds.value = selectableCandidates
    .filter((candidate) => (
      candidate.id !== selectedPrimaryCandidateId.value &&
      (
        (!isProfileDraftMode.value && candidateMappingRole(candidate) === 'SECONDARY') ||
        (
          canConfigureCandidate(candidate) &&
          candidate.agentReview?.recommendedAction === 'CONFIRM_SECONDARY'
        )
      )
    ))
    .map((candidate) => candidate.id)
}

function emitRematch() {
  if (!props.ingredient?.id) return
  emit('rematch', props.ingredient.id)
}

function emitImportUsda() {
  const nextFdcId = fdcId.value.trim()
  if (!props.ingredient?.id || !nextFdcId) return

  emit('import-usda', {
    ingredientId: props.ingredient.id,
    fdcId: nextFdcId
  })
}

function emitRejectCandidate(candidate: IngredientNutritionCandidateListItem) {
  emit('reject-candidate', candidate)
}

function emitRankWithAgent() {
  if (!props.ingredient?.id) return
  emit('rank-with-agent', {
    ingredientId: props.ingredient.id,
    reviewerRequirement: reviewerRequirement.value.trim(),
    onlineWhitelistSearch: onlineWhitelistSearch.value
  })
}

function emitValidateNutrition(candidate: IngredientNutritionCandidateListItem) {
  emit('validate-nutrition', candidate)
}

function buildInitialRowForm(candidate: IngredientNutritionCandidateListItem): CandidateRowForm {
  const foodName = candidate.sourceRecord?.foodName || ''
  const preparationState = resolveReviewOptionValue(
    NUTRITION_PREPARATION_STATE_OPTIONS,
    candidate.preparationState || candidate.agentReview?.preparationState || inferPreparationState(foodName),
    candidate.preparationStateLabel || candidate.agentReview?.preparationStateLabel
  )

  return {
    preparationState,
    ediblePortionLabel: resolveReviewOptionLabel(
      NUTRITION_EDIBLE_PORTION_OPTIONS,
      candidate.ediblePortionLabel || candidate.agentReview?.ediblePortionLabel || inferEdiblePortionLabel(foodName)
    ),
    processingLabel: resolveReviewOptionLabel(
      NUTRITION_PROCESSING_OPTIONS,
      candidate.processingLabel || candidate.agentReview?.processingLabel || inferProcessingLabel(foodName)
    ),
    reviewNote: candidate.reviewNote || ''
  }
}

function ensureRowForm(candidate: IngredientNutritionCandidateListItem): CandidateRowForm {
  const existing = rowForms[candidate.id]
  if (existing) return existing

  const next = buildInitialRowForm(candidate)
  rowForms[candidate.id] = next
  return next
}

function recommendPrimaryCandidate(candidates: IngredientNutritionCandidateListItem[]) {
  return [...candidates]
    .filter(canConfigureCandidate)
    .sort((left, right) => primaryRank(right) - primaryRank(left))[0] ?? null
}

function primaryRank(candidate: IngredientNutritionCandidateListItem): number {
  const foodName = (candidate.sourceRecord?.foodName || '').toLowerCase()
  let rank = typeof candidate.score === 'number' ? candidate.score : 0

  if (candidate.sourceRecord?.sourceType === 'USDA') rank += 0.04
  if (candidate.hardGateResults?.canBatchConfirm) rank += 0.04
  if (candidate.agentReview?.recommendedAction === 'CONFIRM_PRIMARY') rank += 1
  if (candidate.agentReview?.recommendedAction === 'CONFIRM_SECONDARY') rank += 0.4
  if (candidate.agentReview?.recommendedAction === 'NEEDS_HUMAN_REVIEW') rank -= 0.1
  if (candidate.agentReview?.recommendedAction === 'FIND_ALTERNATIVE_SOURCE') rank -= 0.7
  if (candidate.agentReview?.recommendedAction === 'REJECT') rank -= 1
  if (!candidate.agentReview?.recommendedAction) {
    if (/with peel|unpeeled|skin on/.test(foodName)) rank += 0.16
    if (/peeled|skinless|boneless|uv exposed/.test(foodName)) rank -= 0.16
  }
  if (/flowers|flower|blossom/.test(foodName)) rank -= 0.36

  return rank
}

function candidateGroupIndex(candidate: IngredientNutritionCandidateListItem): number {
  const action = candidate.agentReview?.recommendedAction
  if (action === 'CONFIRM_PRIMARY' || candidate.reviewGroup === 'AUTO_REVIEWABLE') return 0
  if (action === 'REJECT' || action === 'FIND_ALTERNATIVE_SOURCE' || candidate.reviewGroup === 'NOT_RECOMMENDED') return 2
  return 1
}

function isEditableCandidate(candidate: IngredientNutritionCandidateListItem): boolean {
  return candidate.status === 'CANDIDATE'
}

function isConfirmedCandidate(candidate: IngredientNutritionCandidateListItem): boolean {
  return candidate.status === 'CONFIRMED'
}

function isExistingProfileCandidate(candidate: IngredientNutritionCandidateListItem): boolean {
  if (isConfirmedCandidate(candidate)) return true

  return candidateSourceKeyAliases(candidate).some((key) => (
    existingProfileSourceKeySet.value.has(key)
  ))
}

function isExcludedCandidate(candidate: IngredientNutritionCandidateListItem): boolean {
  if (isExistingProfileCandidate(candidate)) return false

  const action = candidate.agentReview?.recommendedAction
  return (
    candidate.status === 'REJECTED' ||
    candidate.status === 'SKIPPED' ||
    action === 'REJECT' ||
    action === 'FIND_ALTERNATIVE_SOURCE' ||
    candidate.reviewGroup === 'NOT_RECOMMENDED'
  )
}

function isAdmissionCandidate(candidate: IngredientNutritionCandidateListItem): boolean {
  return (
    isEditableCandidate(candidate) &&
    !isExistingProfileCandidate(candidate) &&
    !isExcludedCandidate(candidate)
  )
}

function canEditCandidateMapping(candidate: IngredientNutritionCandidateListItem): boolean {
  return canConfigureCandidate(candidate)
}

function canConfigureCandidate(candidate: IngredientNutritionCandidateListItem): boolean {
  return (
    (isProfileDraftMode.value && isAdmissionCandidate(candidate)) ||
    (!isProfileDraftMode.value && (
      isEditableCandidate(candidate) ||
      (remappingConfirmedProfiles.value && isConfirmedCandidate(candidate))
    ))
  )
}

function canEditCandidateFields(candidate: IngredientNutritionCandidateListItem): boolean {
  if (isProfileDraftMode.value) {
    return isAdmissionCandidate(candidate)
  }

  return isEditableCandidate(candidate)
}

function candidateMappingRole(candidate: IngredientNutritionCandidateListItem): 'PRIMARY' | 'SECONDARY' | '' {
  const snapshot = candidate.confirmationSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return ''

  const role = (snapshot as Record<string, unknown>).mappingRole
  return role === 'PRIMARY' || role === 'SECONDARY' ? role : ''
}

function candidateSourceKeyAliases(candidate: IngredientNutritionCandidateListItem): string[] {
  const sourceKey = normalizeSourceKey(candidate.sourceRecord?.sourceKey)
  if (!sourceKey) return []

  const keys = new Set([sourceKey])
  const sourceMatch = sourceKey.match(/^([A-Z]+):(.+)$/)
  if (sourceMatch?.[2]) {
    keys.add(sourceMatch[2].trim())
  }

  if (!sourceKey.includes(':') && candidate.sourceRecord?.sourceType) {
    keys.add(`${candidate.sourceRecord.sourceType}:${sourceKey}`)
  }

  return [...keys].map(normalizeSourceKey).filter(Boolean)
}

function normalizeSourceKey(value?: string | null): string {
  return value?.trim() || ''
}

function handlePrimaryChange(candidateId: string) {
  secondaryCandidateIds.value = secondaryCandidateIds.value.filter((id) => id !== candidateId)
}

function toggleSecondaryCandidate(candidateId: string, checked: string | number | boolean) {
  if (Boolean(checked)) {
    if (candidateId !== selectedPrimaryCandidateId.value && !secondaryCandidateIds.value.includes(candidateId)) {
      secondaryCandidateIds.value = [...secondaryCandidateIds.value, candidateId]
    }
    return
  }

  secondaryCandidateIds.value = secondaryCandidateIds.value.filter((id) => id !== candidateId)
}

function emitSave() {
  if (!props.ingredient?.id) {
    ElMessage.warning('请选择原料')
    return
  }

  if (!selectedPrimaryCandidateId.value) {
    ElMessage.warning(isProfileDraftMode.value ? '请选择一个可入库候选作为主档案' : '请选择一个主档案')
    return
  }

  const selectedIds = [
    selectedPrimaryCandidateId.value,
    ...secondaryCandidateIds.value.filter((id) => id !== selectedPrimaryCandidateId.value)
  ]
  const entries = selectedIds
    .map((candidateId) => buildEntry(candidateId))
    .filter(Boolean) as ApplyIngredientCandidateConfigurationPayload['entries']

  emit('save', {
    ingredientId: props.ingredient.id,
    entries
  })
}

function buildEntry(candidateId: string): ConfirmNutritionCandidatePayload & { candidateId: string } | null {
  const form = rowForms[candidateId]
  if (!form) return null
  const candidate = props.candidates.find((item) => item.id === candidateId)
  if (!candidate || !canConfigureCandidate(candidate)) return null

  const mappingRole = candidateId === selectedPrimaryCandidateId.value ? 'PRIMARY' : 'SECONDARY'

  return {
    candidateId,
    mappingRole,
    preparationState: form.preparationState || null,
    preparationStateLabel: resolveReviewOptionLabel(
      NUTRITION_PREPARATION_STATE_OPTIONS,
      form.preparationState
    ) || null,
    ediblePortionLabel: form.ediblePortionLabel || null,
    processingLabel: form.processingLabel || null,
    reviewNote: form.reviewNote || null
  }
}

function inferPreparationState(foodName: string): string {
  const lower = foodName.toLowerCase()
  if (/freeze[-\s]?dried/.test(lower)) return 'FREEZE_DRIED'
  if (/air[-\s]?dried/.test(lower)) return 'AIR_DRIED'
  if (/dried|dry/.test(lower)) return 'DRIED'
  if (/powder/.test(lower)) return 'POWDER'
  if (/canned/.test(lower)) return 'CANNED'
  if (/oil/.test(lower)) return 'OIL'
  if (/cooked|boiled|roasted|baked|steamed/.test(lower)) return 'COOKED'
  if (/raw|fresh/.test(lower)) return 'RAW'
  return ''
}

function inferEdiblePortionLabel(foodName: string): string {
  const lower = foodName.toLowerCase()
  if (/skinless.*boneless|boneless.*skinless/.test(lower)) return '去皮去骨'
  if (/with peel|unpeeled|skin on/.test(lower)) return '带皮'
  if (/peeled|skinless/.test(lower)) return '去皮'
  if (/boneless/.test(lower)) return '去骨'
  if (/bone[-\s]?in/.test(lower)) return '带骨'
  if (/liver/.test(lower)) return '肝脏'
  if (/breast/.test(lower)) return '胸肉'
  if (/thigh/.test(lower)) return '腿肉'
  if (/meat/.test(lower)) return '肉'
  if (/whole/.test(lower)) return '整体'
  return ''
}

function inferProcessingLabel(foodName: string): string {
  const lower = foodName.toLowerCase()
  if (/unsalted/.test(lower)) return '无盐'
  if (/salted/.test(lower)) return '加盐'
  if (/unfortified/.test(lower)) return '未强化'
  if (/fortified/.test(lower)) return '强化'
  if (/not uv|non[-\s]?uv/.test(lower)) return '非紫外线照射'
  if (/uv exposed|ultraviolet/.test(lower)) return '紫外线照射'
  if (/smoked/.test(lower)) return '烟熏'
  if (/frozen/.test(lower)) return '冷冻'
  if (/raw|fresh|unprocessed/.test(lower)) return '未加工'
  return ''
}

function agentActionLabel(action?: string | null): string {
  const labels: Record<string, string> = {
    CONFIRM_PRIMARY: '建议主档案',
    CONFIRM_SECONDARY: '建议次级',
    NEEDS_HUMAN_REVIEW: '人工复核',
    REJECT: '建议拒绝',
    FIND_ALTERNATIVE_SOURCE: '换来源'
  }
  return action ? labels[action] || action : '未审核'
}

function agentReviewDetailText(candidate?: IngredientNutritionCandidateListItem | null): string {
  if (!candidate?.agentReview) return ''

  return [
    candidate.agentReview.rationale,
    candidate.agentReview.riskFlags?.length
      ? `风险标记：${candidate.agentReview.riskFlags.join('、')}`
      : ''
  ].filter(Boolean).join('；')
}

function validationStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    PASS: '校验通过',
    WARNING: '需复核',
    FAIL: '校验失败'
  }
  return status ? labels[status] || status : '未校验'
}

function validationTagType(status?: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'PASS') return 'success'
  if (status === 'WARNING') return 'warning'
  if (status === 'FAIL') return 'danger'
  return 'info'
}

function candidateStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    CANDIDATE: '待确认',
    CONFIRMED: '已确认',
    REJECTED: '已拒绝',
    SKIPPED: '已跳过'
  }
  return status ? labels[status] || status : '-'
}

function candidateStatusTagType(status?: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'CONFIRMED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'SKIPPED') return 'info'
  return 'warning'
}

function validationAlertType(
  result: CandidateNutritionValidationWithAgentResult
): 'success' | 'warning' | 'error' | 'info' {
  if (result.system.status === 'PASS') return 'success'
  if (result.system.status === 'WARNING') return 'warning'
  if (result.system.status === 'FAIL') return 'error'
  return 'info'
}

function validationDetailTitle(result: CandidateNutritionValidationWithAgentResult): string {
  return `营养数据${validationStatusLabel(result.system.status)}：已校验 ${result.system.checkedFieldCount}/${result.system.expectedFieldCount} 个来源映射字段`
}

function validationIssueSummary(result: CandidateNutritionValidationWithAgentResult): string {
  const issues = [
    result.system.missingExpectedFields.length
      ? `缺失 ${result.system.missingExpectedFields.length} 项`
      : '',
    result.system.mismatchedFields.length
      ? `不一致 ${result.system.mismatchedFields.length} 项`
      : '',
    result.system.missingSourceFormFields.length
      ? `缺来源追溯 ${result.system.missingSourceFormFields.length} 项`
      : '',
    ...result.system.warnings
  ].filter(Boolean)

  return issues.join('；') || '系统校验未发现来源值、换算值与标准化档案不一致。'
}

function validationDetailItems(
  result: CandidateNutritionValidationWithAgentResult
): ValidationDetailItem[] {
  const items: ValidationDetailItem[] = []

  if (result.system.missingExpectedFields.length) {
    items.push({
      label: '缺失字段',
      text: formatValidationIssues(result.system.missingExpectedFields)
    })
  }

  if (result.system.mismatchedFields.length) {
    items.push({
      label: '数值不一致',
      text: formatValidationIssues(result.system.mismatchedFields)
    })
  }

  if (result.system.missingSourceFormFields.length) {
    items.push({
      label: '缺来源追溯',
      text: formatValidationIssues(result.system.missingSourceFormFields)
    })
  }

  if (result.system.warnings.length) {
    items.push({
      label: '系统提示',
      text: result.system.warnings.join('；')
    })
  }

  if (result.agent?.riskFlags?.length) {
    items.push({
      label: 'Agent 风险标记',
      text: result.agent.riskFlags.join('、')
    })
  }

  if (!items.length) {
    items.push({
      label: '校验结论',
      text: validationIssueSummary(result)
    })
  }

  return items
}

function formatValidationIssues(issues: ValidationFieldIssue[]): string {
  return issues.map(formatValidationIssue).join('；')
}

function formatValidationIssue(issue: ValidationFieldIssue): string {
  const source = [
    issue.sourceNutrientName,
    issue.sourceNutrientId ? `#${issue.sourceNutrientId}` : ''
  ].filter(Boolean).join(' ')
  const expected = formatNullableNumber(issue.expectedValue)
  const actual = formatNullableNumber(issue.actualValue)
  const unit = issue.canonicalUnit ? ` ${issue.canonicalUnit}` : ''

  return [
    issue.fieldPath,
    source ? `来源项 ${source}` : '',
    expected ? `来源值 ${expected}${unit}` : '',
    actual ? `档案值 ${actual}${unit}` : issue.actualValue === null ? '档案值缺失' : ''
  ].filter(Boolean).join('，')
}

function formatNullableNumber(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(3)
    : ''
}
</script>

<style scoped>
.ingredient-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.summary-label {
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.ingredient-summary h3 {
  margin: 2px 0 0;
  color: #303133;
  font-size: 18px;
  line-height: 26px;
}

.summary-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.summary-stat {
  display: grid;
  min-width: 86px;
  justify-items: end;
}

.summary-stat span {
  color: #409eff;
  font-size: 24px;
  font-weight: 600;
  line-height: 28px;
}

.summary-stat small {
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.rematch-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.agent-requirement-panel {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto;
  gap: 10px;
  align-items: start;
  margin-bottom: 12px;
}

.agent-requirement-copy {
  grid-column: 1 / -1;
  color: #606266;
  font-size: 12px;
  line-height: 18px;
}

.fdc-input {
  width: 180px;
}

.remap-mode-alert {
  margin-bottom: 12px;
}

.candidate-group {
  margin-top: 14px;
}

.candidate-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 0 2px;
}

.candidate-group-header strong {
  color: #303133;
  font-size: 14px;
  line-height: 20px;
}

.candidate-group-header span {
  display: block;
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.candidate-config-table {
  width: 100%;
}

.primary-text {
  color: #303133;
  font-weight: 500;
  line-height: 20px;
}

.secondary-text {
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.validation-summary {
  margin-top: 4px;
  color: #606266;
  overflow-wrap: anywhere;
  white-space: normal;
}

.validation-detail {
  margin-top: 12px;
}

.validation-detail-text {
  margin-top: 4px;
  line-height: 20px;
}

.validation-detail-list {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.validation-detail-item {
  display: grid;
  gap: 2px;
  line-height: 20px;
}

.validation-detail-item strong {
  color: #303133;
}

.validation-detail-item span {
  color: #606266;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.agent-rationale {
  margin-top: 4px;
  color: #606266;
  overflow-wrap: anywhere;
  white-space: normal;
}

.row-actions {
  display: grid;
  gap: 2px;
  justify-items: center;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .summary-actions {
    align-items: flex-end;
    flex-direction: column;
  }

  .rematch-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .agent-requirement-panel {
    grid-template-columns: 1fr;
  }

  .rematch-toolbar :deep(.el-button),
  .rematch-toolbar :deep(.el-input),
  .fdc-input {
    width: 100%;
  }
}
</style>
