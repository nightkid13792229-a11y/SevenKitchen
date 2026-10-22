<template>
  <section class="creation-step profile-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">③</span>
      <div>
        <h2 class="creation-step__title">档案成型</h2>
        <p class="creation-step__summary">
          核对每个数字的来源与换算；在上方编辑器里改值，会自动记入下方账本。
        </p>
      </div>
    </header>

    <el-alert
      v-if="replacedState"
      type="warning"
      :closable="false"
      show-icon
      title="这一份档案已按新缝合方案重建"
    >
      ② 站的主来源换过了，原来的「{{ stateLabel(replacedState) }}」档案整份重建；
      旧来源的数值与手工改动不会混进新档案。
    </el-alert>

    <el-alert
      v-if="planStateInferred"
      type="info"
      :closable="false"
      show-icon
      title="主来源没有标注生熟"
    >
      暂按「{{ stateLabel(planState) }}」建档。生熟是来源的属性，不按数值反推；
      如果不对，请回 ① 起手页核对清单，或换一个标了生熟的来源。
    </el-alert>

    <el-alert
      v-if="plan && !profiles.length && !loading"
      type="warning"
      :closable="false"
      show-icon
      title="还没有可编辑的营养档案"
    >
      请先回 ② 营养依据站选中主来源并生成缝合方案。
    </el-alert>

    <el-tabs
      v-if="profiles.length"
      v-model="activeState"
      class="profile-tabs"
      tab-position="top"
    >
      <el-tab-pane
        v-for="view in profileViews"
        :key="view.profile.preparationState"
        :name="view.profile.preparationState"
      >
        <template #label>
          <span class="profile-tab-label">
            <span>{{ view.stateLabel }}档案</span>
            <el-tag size="small" effect="plain" type="info">
              已填 {{ view.filledCount }} 项
            </el-tag>
            <el-tag
              v-if="isPrimaryProfile(view)"
              size="small"
              effect="light"
              type="primary"
            >
              本次主来源
            </el-tag>
          </span>
        </template>

        <div class="profile-pane">
          <div class="profile-source-card">
            <div class="profile-source-card__main">
              <span class="profile-source-card__label">来源记录</span>
              <strong class="profile-source-card__value">
                {{ view.sourceText }}
              </strong>
              <span class="profile-source-card__id">
                {{ view.profile.sourceRecordId || '—' }}
              </span>
            </div>
            <el-tag
              effect="light"
              :type="view.filledCount > 0 ? 'success' : 'warning'"
            >
              已填 {{ view.filledCount }} / {{ view.coverage.total }} 项
            </el-tag>
          </div>

          <el-alert
            v-if="view.coverageNotice"
            class="coverage-alert"
            type="warning"
            :closable="false"
            show-icon
            :title="view.coverageNotice"
          >
            覆盖率按营养字段目录全部 {{ view.coverage.total }} 项计算。
            缺失字段保持空值、不补 0，可以手工录入；低于任何阈值都不阻断下一步，
            但会持续显示在这里。
          </el-alert>
          <el-alert
            v-else
            class="coverage-alert"
            type="success"
            :closable="false"
            show-icon
            title="目录字段已全部覆盖"
          />

          <IngredientNutritionEditor
            v-model="editorProfiles[view.index]"
            :ingredient-type="IngredientType.FOOD"
            :show-sample-state="false"
          />

          <el-alert
            class="edit-hint"
            type="info"
            :closable="false"
            show-icon
            title="改值会自动记入账本"
          >
            在编辑器里改任何数值，都会把该字段标成「人工裁决」并记录操作人与时间；
            原始来源、原始值与换算公式会保留，不会被覆盖掉。
          </el-alert>

          <section class="evidence-panel" aria-labelledby="evidence-title">
            <header class="evidence-panel__header">
              <div>
                <h3 id="evidence-title">字段证据账本</h3>
                <p>
                  每个字段的来源与状态都在这里；点「查看证据」摊开来源记录、
                  原始值、换算公式和确认人。没有来源的字段显示「暂无溯源」，不是空白。
                </p>
              </div>
            </header>

            <el-table
              :data="view.rows"
              border
              size="small"
              max-height="420"
              :row-class-name="evidenceRowClassName"
            >
              <el-table-column label="字段" min-width="150">
                <template #default="{ row }">
                  <div class="evidence-field">
                    <span>{{ row.label }}</span>
                    <span class="evidence-field__path">{{ row.fieldPath }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="最终值" min-width="130">
                <template #default="{ row }">
                  <strong v-if="!row.isMissing">{{ row.valueText }}</strong>
                  <span v-else class="is-muted">待补</span>
                </template>
              </el-table-column>
              <el-table-column label="来源" min-width="190" show-overflow-tooltip>
                <template #default="{ row }">
                  <span :class="{ 'is-muted': row.sourceText === '暂无溯源' }">
                    {{ row.sourceText }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="120">
                <template #default="{ row }">
                  <el-tag
                    v-if="row.entry"
                    size="small"
                    effect="light"
                    :type="row.statusType"
                  >
                    {{ row.statusLabel }}
                  </el-tag>
                  <el-tag v-else size="small" effect="plain" type="info">
                    待补
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="110" align="right">
                <template #default="{ row }">
                  <el-button
                    text
                    type="primary"
                    size="small"
                    @click="openEvidence(view, row)"
                  >
                    查看证据
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </section>
        </div>
      </el-tab-pane>
    </el-tabs>

    <div v-else-if="!loading" class="creation-step__placeholder">
      <p>
        草稿里还没有缝合方案，也没有已保存的营养档案。
        请先回 ② 营养依据站生成缝合方案。
      </p>
    </div>

    <p v-if="saveError" class="save-error">
      自动保存失败：{{ saveError }}（继续编辑会重试；点「下一步」也会再保存一次）
    </p>

    <p v-if="blockedReason" class="next-hint">{{ blockedReason }}</p>

    <el-drawer
      v-model="drawerVisible"
      :title="drawerTitle"
      size="520px"
      destroy-on-close
    >
      <div v-if="drawerRow" class="evidence-drawer">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="字段">
            {{ drawerRow.label }}
            <span class="evidence-field__path">{{ drawerRow.fieldPath }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="最终值">
            {{ drawerRow.isMissing ? '待补（没有值）' : drawerRow.valueText }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag
              v-if="drawerRow.entry"
              size="small"
              effect="light"
              :type="drawerRow.statusType"
            >
              {{ drawerRow.statusLabel }}
            </el-tag>
            <span v-else class="is-muted">待补</span>
          </el-descriptions-item>
          <el-descriptions-item label="来源记录">
            {{ drawerSourceText }}
          </el-descriptions-item>
          <el-descriptions-item label="来源记录 ID">
            {{ drawerRow.entry?.sourceRecordId ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="原始值">
            {{ drawerOriginalValueText }}
          </el-descriptions-item>
          <el-descriptions-item label="原始单位">
            {{ drawerRow.entry?.sourceUnit ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="换算公式">
            {{ drawerRow.entry?.formula ?? '无（直接采用）' }}
          </el-descriptions-item>
          <el-descriptions-item label="确认人">
            {{ drawerRow.entry?.confirmedBy ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="确认时间">
            {{ formatDateTime(drawerRow.entry?.confirmedAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="drawerNoProvenance"
          class="drawer-empty"
          type="info"
          :closable="false"
          show-icon
          title="暂无溯源"
        >
          这个字段没有来源记录，也没有人工改值记录。缺失就是缺失，不会被补成 0；
          可以在上方编辑器里手工录入，录入后账本会记成「人工裁决」。
        </el-alert>

        <el-alert
          v-else-if="drawerRow.entry?.status === 'MANUAL' && !drawerRow.entry.sourceRecordId"
          class="drawer-empty"
          type="warning"
          :closable="false"
          show-icon
          title="人工录入"
        >
          这个字段没有外部来源，数值由人填写，操作人与时间记录在账本里。
        </el-alert>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { IngredientType, type NutritionProfile } from '@/types/ingredient'
import type {
  CandidateRow,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  MergePlan,
  NutritionEvidenceEntry,
  PreparationState,
  ProfileDraft
} from '@/types/ingredientCreation'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { getApiErrorMessage, shouldToastApiError } from '@/utils/apiError'
import { useUserStore } from '@/store/user'
import IngredientNutritionEditor from '../components/IngredientNutritionEditor.vue'
import { getPreparationStateLabel } from './stateCoverage'
import {
  EVIDENCE_STATUS_META,
  computeProfileCoverage,
  formatCoverageNotice,
  type ProfileCoverage
} from './stepProfileHelpers'
import {
  PROFILE_FIELD_BY_PATH,
  PROFILE_FIELD_DEFINITIONS,
  applyEditorProfileToDraft,
  countProfileValues,
  formatFieldNumber,
  formatFieldValue,
  mergeProfilesWithPlan,
  normalizeStoredProfiles,
  profileDraftToNutritionProfile,
  resolvePlanPreparationState
} from './profileLedger'

interface Props {
  draft: IngredientCreationDraft | null
  saving?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  next: [payload: Partial<IngredientCreationDraftPayload>]
  'can-next': [value: boolean]
}>()

const userStore = useUserStore()

/** 操作人：优先用户名，刷新后 JWT 里只剩 userId 时退回 userId。 */
const operatorLabel = computed(() => {
  const info = userStore.userInfo as
    | { username?: unknown; userId?: unknown }
    | null
    | undefined
  if (typeof info?.username === 'string' && info.username.trim()) {
    return info.username.trim()
  }
  if (typeof info?.userId === 'string' && info.userId.trim()) {
    return info.userId.trim()
  }
  return '当前登录人'
})

const SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  USDA: 'USDA',
  NZFCD: 'NZFCD',
  MEXT: 'MEXT',
  CFCT: 'CFCT',
  CNF: 'CNF',
  COFID: 'CoFID',
  CIQUAL: 'Ciqual',
  MANUAL: '人工录入',
  SUPPLEMENT_LABEL: '补剂标签'
}

function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

const intake = computed(() => props.draft?.payload.intake ?? null)
const plan = computed<MergePlan | null>(
  () => props.draft?.payload.mergePlan ?? null
)
const candidates = computed<CandidateRow[]>(
  () => props.draft?.payload.candidates ?? []
)

const candidateMap = computed(() => {
  const map = new Map<string, CandidateRow>()
  for (const candidate of candidates.value) {
    map.set(candidate.sourceRecordId, candidate)
  }
  return map
})

function candidateLabel(sourceRecordId: string | null): string | null {
  if (!sourceRecordId) {
    return null
  }
  const candidate = candidateMap.value.get(sourceRecordId)
  if (!candidate) {
    return `来源记录 ${shortId(sourceRecordId)}`
  }
  const state = candidate.preparationState
    ? getPreparationStateLabel(candidate.preparationState)
    : '生熟未知'
  return `${candidate.foodName}（${sourceTypeLabel(candidate.sourceType)} · ${state}）`
}

const planState = computed<PreparationState>(() =>
  resolvePlanPreparationState({
    plan: plan.value,
    candidates: candidates.value,
    intake: intake.value
  })
)

const primaryCandidate = computed<CandidateRow | null>(() =>
  plan.value
    ? (candidateMap.value.get(plan.value.primarySourceRecordId) ?? null)
    : null
)

const planStateInferred = computed(
  () => Boolean(plan.value) && !primaryCandidate.value?.preparationState
)

const profiles = ref<ProfileDraft[]>([])
const editorProfiles = ref<(NutritionProfile | null)[]>([])
const activeState = ref<PreparationState>('RAW')
const replacedState = ref<PreparationState | null>(null)
const loading = ref(true)
const initializing = ref(true)
const saveError = ref('')

function stateLabel(state: PreparationState): string {
  return getPreparationStateLabel(state)
}

function isPrimaryProfile(view: ProfileView): boolean {
  return (
    Boolean(plan.value) &&
    view.profile.sourceRecordId === plan.value?.primarySourceRecordId
  )
}

function sourceTextFor(sourceRecordId: string | null): string {
  return candidateLabel(sourceRecordId) ?? '暂无溯源'
}

function syncEditorProfiles() {
  editorProfiles.value = profiles.value.map((profile) => {
    const candidate = candidateMap.value.get(profile.sourceRecordId)
    return profileDraftToNutritionProfile(profile, {
      sourceLabel: candidateLabel(profile.sourceRecordId),
      sourceType: candidate?.sourceType ?? null
    })
  })
}

async function initializeProfiles() {
  loading.value = true
  initializing.value = true

  const draft = props.draft
  if (!draft) {
    profiles.value = []
    editorProfiles.value = []
    loading.value = false
    initializing.value = false
    return
  }

  const stored = normalizeStoredProfiles(draft.payload.profiles ?? [])
  const currentPlan = draft.payload.mergePlan

  if (currentPlan) {
    const merged = mergeProfilesWithPlan({
      storedProfiles: stored,
      plan: currentPlan,
      planState: planState.value
    })
    profiles.value = merged.profiles
    replacedState.value = merged.replacedState
  } else {
    profiles.value = stored
    replacedState.value = null
  }

  syncEditorProfiles()
  activeState.value = profiles.value[0]?.preparationState ?? planState.value

  await nextTick()
  initializing.value = false
  loading.value = false

  if (replacedState.value) {
    ElMessage.warning(
      `「${stateLabel(replacedState.value)}」档案的来源已变，已按新缝合方案重建。`
    )
  }
}

/* ------------------------------------------------------------------ *
 * 编辑器改值 → 写回证据账本 → 防抖保存草稿
 * ------------------------------------------------------------------ */

interface EvidenceRow {
  fieldPath: string
  label: string
  unit: string
  entry: NutritionEvidenceEntry | null
  isMissing: boolean
  valueText: string
  sourceText: string
  statusLabel: string
  statusType: 'success' | 'primary' | 'warning' | 'info'
}

interface ProfileView {
  profile: ProfileDraft
  index: number
  stateLabel: string
  sourceText: string
  filledCount: number
  coverage: ProfileCoverage
  coverageNotice: string
  rows: EvidenceRow[]
}

function buildEvidenceRows(profile: ProfileDraft): EvidenceRow[] {
  const entryMap = new Map<string, NutritionEvidenceEntry>()
  for (const entry of profile.entries) {
    entryMap.set(entry.fieldPath, entry)
  }

  const rows: EvidenceRow[] = []
  const coveredPaths = new Set<string>()

  function pushRow(
    fieldPath: string,
    label: string,
    unit: string,
    entry: NutritionEvidenceEntry | null
  ) {
    const isMissing =
      !entry ||
      typeof entry.finalValue !== 'number' ||
      !Number.isFinite(entry.finalValue)
    const statusMeta = entry ? EVIDENCE_STATUS_META[entry.status] : null

    rows.push({
      fieldPath,
      label,
      unit: entry?.unit ?? unit,
      entry,
      isMissing,
      valueText: isMissing
        ? '待补'
        : formatFieldValue(entry.finalValue, entry.unit ?? unit),
      sourceText: entry ? sourceTextFor(entry.sourceRecordId) : '暂无溯源',
      statusLabel: statusMeta?.label ?? '待补',
      statusType: statusMeta?.type ?? 'info'
    })
  }

  for (const field of PROFILE_FIELD_DEFINITIONS) {
    coveredPaths.add(field.fieldPath)
    pushRow(
      field.fieldPath,
      field.label,
      field.unit,
      entryMap.get(field.fieldPath) ?? null
    )
  }

  for (const entry of profile.entries) {
    if (PROFILE_FIELD_BY_PATH.has(entry.fieldPath)) {
      continue
    }
    pushRow(entry.fieldPath, `自定义：${entry.fieldPath}`, entry.unit, entry)
  }

  return rows
}

const profileViews = computed<ProfileView[]>(() =>
  profiles.value.map((profile, index) => {
    const coverage = computeProfileCoverage(
      profile.entries,
      PROFILE_FIELD_DEFINITIONS
    )

    return {
      profile,
      index,
      stateLabel: stateLabel(profile.preparationState),
      sourceText: sourceTextFor(profile.sourceRecordId),
      filledCount: countProfileValues(profile),
      coverage,
      coverageNotice:
        coverage.missingFields.length > 0
          ? formatCoverageNotice(coverage.percent, coverage.missingLabels, 10)
          : '',
      rows: buildEvidenceRows(profile)
    }
  })
)

watch(
  editorProfiles,
  (nextEditors) => {
    if (initializing.value) {
      return
    }

    let changed = false
    const nextProfiles = profiles.value.map((profile, index) => {
      const editor = nextEditors[index]
      if (!editor) {
        return profile
      }
      const nextProfile = applyEditorProfileToDraft(
        profile,
        editor,
        operatorLabel.value
      )
      if (
        nextProfile.notes !== profile.notes ||
        JSON.stringify(nextProfile.entries) !== JSON.stringify(profile.entries)
      ) {
        changed = true
        return nextProfile
      }
      return profile
    })

    if (!changed) {
      return
    }

    profiles.value = nextProfiles
    scheduleSave()
  },
  { deep: true }
)

/** 档案口径固定每 100g 可食部：编辑器里改口径会被拉回，并说明原因。 */
watch(
  () =>
    editorProfiles.value.map((profile) => profile?.meta.rawBasisType ?? null),
  (types) => {
    if (initializing.value) {
      return
    }
    let reset = false
    for (const profile of editorProfiles.value) {
      if (profile && profile.meta.rawBasisType !== 'PER_100_G') {
        profile.meta.rawBasisType = 'PER_100_G'
        reset = true
      }
    }
    if (reset) {
      ElMessage.info(
        '营养档案统一按每 100g 可食部，口径不在这里改；来源按份给的换算在 ② 站处理。'
      )
    }
  },
  { deep: true }
)

let saveTimer: ReturnType<typeof setTimeout> | null = null
let savePromise: Promise<void> | null = null
let dirty = false
/** 点「下一步」后不再安排新的自动保存，避免它和壳子的推进请求抢 step。 */
let leaving = false

function evidenceForPayload(): NutritionEvidenceEntry[] {
  const current =
    profiles.value.find(
      (profile) => profile.sourceRecordId === plan.value?.primarySourceRecordId
    ) ?? profiles.value[0]
  return current?.entries ?? []
}

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

async function patchProfiles(): Promise<void> {
  const draft = props.draft
  if (!draft || profiles.value.length === 0) {
    return
  }
  // 已经提交过的草稿不再改写；也不把站点回退（用草稿当前 step）。
  if (draft.step === 'COMMIT') {
    return
  }

  await ingredientCreationApi.patchDraft(draft.id, draft.step, {
    profiles: profiles.value,
    evidence: evidenceForPayload()
  })
}

async function flushSave(): Promise<void> {
  clearSaveTimer()
  if (savePromise) {
    await savePromise.catch(() => undefined)
  }
  if (!dirty) {
    return
  }

  dirty = false
  const run = (async () => {
    try {
      await patchProfiles()
      saveError.value = ''
    } catch (error) {
      dirty = true
      saveError.value = getApiErrorMessage(error, '保存档案失败')
      if (shouldToastApiError(error, '保存档案失败')) {
        ElMessage.warning(saveError.value)
      }
    }
  })()

  savePromise = run
  await run
  if (savePromise === run) {
    savePromise = null
  }
  if (dirty) {
    scheduleSave()
  }
}

function scheduleSave() {
  if (leaving) {
    return
  }
  dirty = true
  clearSaveTimer()
  saveTimer = setTimeout(() => {
    void flushSave()
  }, 800)
}

onBeforeUnmount(() => {
  clearSaveTimer()
})

/* ------------------------------------------------------------------ *
 * 证据抽屉
 * ------------------------------------------------------------------ */

const drawerVisible = ref(false)
const drawerRow = ref<EvidenceRow | null>(null)

const drawerTitle = computed(() =>
  drawerRow.value ? `字段证据 · ${drawerRow.value.label}` : '字段证据'
)

const drawerSourceText = computed(() => {
  const row = drawerRow.value
  if (!row?.entry) {
    return '暂无溯源'
  }
  if (!row.entry.sourceRecordId) {
    return row.entry.status === 'MANUAL' ? '人工录入（无外部来源）' : '暂无溯源'
  }
  return candidateLabel(row.entry.sourceRecordId) ?? shortId(row.entry.sourceRecordId)
})

const drawerOriginalValueText = computed(() => {
  const entry = drawerRow.value?.entry
  if (!entry) {
    return '—'
  }
  if (
    typeof entry.sourceValue !== 'number' ||
    !Number.isFinite(entry.sourceValue)
  ) {
    return '未记录'
  }
  return `${formatFieldNumber(entry.sourceValue)} ${entry.sourceUnit ?? ''}`.trim()
})

const drawerNoProvenance = computed(() => {
  const entry = drawerRow.value?.entry
  if (!entry) {
    return true
  }
  return !entry.sourceRecordId && !entry.confirmedBy
})

function openEvidence(_view: ProfileView, row: EvidenceRow) {
  drawerRow.value = row
  drawerVisible.value = true
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

function evidenceRowClassName(params: { row: EvidenceRow }): string {
  return params.row.isMissing ? 'evidence-row--missing' : ''
}

/* ------------------------------------------------------------------ *
 * 下一步闸门
 * ------------------------------------------------------------------ */

const blockedReason = computed(() => {
  if (!props.draft) {
    return '草稿还没创建。'
  }
  if (!plan.value) {
    return '还没有缝合方案，请先回 ② 营养依据站选中主来源并生成方案。'
  }
  if (profiles.value.length === 0) {
    return '还没有可编辑的营养档案。'
  }

  const emptyProfiles = profiles.value.filter(
    (profile) => countProfileValues(profile) === 0
  )
  if (emptyProfiles.length > 0) {
    const labels = emptyProfiles
      .map((profile) => `${stateLabel(profile.preparationState)}档案`)
      .join('、')
    return `${labels}还没有任何营养值：至少手工填一项再继续。`
  }

  return ''
})

const canProceed = computed(() => blockedReason.value === '')

async function submit() {
  if (!canProceed.value) {
    ElMessage.warning(blockedReason.value)
    return
  }

  // 先等已经在路上的保存落地，再交给壳子推进；之后不再排新的自动保存，
  // 否则它可能带着旧 step 把壳子刚推进的站点覆盖回去。
  leaving = true
  clearSaveTimer()
  if (savePromise) {
    await savePromise.catch(() => undefined)
  }

  emit('next', {
    profiles: profiles.value,
    evidence: evidenceForPayload()
  })
}

onMounted(() => {
  void initializeProfiles().then(() => {
    emit('can-next', canProceed.value)
  })
})

watch(canProceed, (value) => emit('can-next', value))

defineExpose({ submit })
</script>

<style scoped>
.profile-step {
  gap: 18px;
}

.profile-tabs {
  width: 100%;
}

.profile-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.profile-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.profile-source-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.profile-source-card__main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.profile-source-card__label {
  color: #909399;
  font-size: 12px;
}

.profile-source-card__value {
  color: #303133;
  font-size: 14px;
}

.profile-source-card__id {
  color: #c0c4cc;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.coverage-alert :deep(p) {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.edit-hint :deep(.el-alert__title) {
  font-size: 13px;
}

.evidence-panel {
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.evidence-panel__header {
  margin-bottom: 10px;
}

.evidence-panel__header h3 {
  margin: 0;
  color: #303133;
  font-size: 15px;
}

.evidence-panel__header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.evidence-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.evidence-field__path {
  color: #c0c4cc;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.is-muted {
  color: #c0c4cc;
}

:deep(.evidence-row--missing) {
  background: #fafafa;
}

.evidence-drawer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-empty {
  margin-top: 4px;
}

.save-error {
  margin: 0;
  color: #e6a23c;
  font-size: 12px;
}

.next-hint {
  margin: 0;
  color: #e6a23c;
  font-size: 12px;
  text-align: right;
}

@media (max-width: 720px) {
  .profile-source-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
