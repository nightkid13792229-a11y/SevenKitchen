<template>
  <section class="creation-step sources-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">②</span>
      <div>
        <h2 class="creation-step__title">营养依据</h2>
        <p class="creation-step__summary">
          挑来源，确认缝合方案；只补缺，不覆盖主来源。
        </p>
      </div>
    </header>

    <el-alert
      v-if="!draft || !intake"
      type="error"
      :closable="false"
      show-icon
      title="缺少起手信息"
    >
      没有读到 ① 站的名字与生熟清单。请先回「起手」站填好并按「下一步」。
    </el-alert>

    <template v-else>
      <div class="query-bar">
        <div class="query-bar__names">
          <span class="query-bar__name">{{ intake.name }}</span>
          <span v-if="intake.nameEn" class="query-bar__name-en">
            {{ intake.nameEn }}
          </span>
          <el-tag size="small" effect="plain">{{ categoryLabel }}</el-tag>
          <el-tag
            v-for="state in requestedStates"
            :key="state"
            size="small"
            :type="state === 'RAW' ? 'success' : 'warning'"
            effect="light"
          >
            {{ getPreparationStateLabel(state) }}档案
          </el-tag>
        </div>
        <div class="query-bar__actions">
          <el-button
            size="small"
            :loading="searchLoading"
            :disabled="mergeLoading || isResolving"
            @click="searchCandidates"
          >
            重新查一轮
          </el-button>
          <el-tooltip
            :content="onlineButtonHint"
            placement="top"
          >
            <span class="tooltip-wrapper">
              <el-button
                size="small"
                :loading="onlineLoading"
                :disabled="onlineDisabled"
                @click="searchOnline"
              >
                到线上找一轮
              </el-button>
            </span>
          </el-tooltip>
        </div>
      </div>

      <el-alert
        v-if="searchError"
        type="error"
        :closable="false"
        show-icon
        title="候选检索失败"
      >
        <div class="search-error">
          <span>{{ searchError }}</span>
          <el-button link type="primary" @click="searchCandidates">
            重试
          </el-button>
        </div>
      </el-alert>

      <div v-if="onlineLoading" class="online-progress">
        <el-skeleton :rows="1" animated />
        <p>正在白名单来源里查找…（每个来源都要现场抓取，可能要十几秒）</p>
      </div>

      <el-alert
        v-else-if="onlineError"
        type="error"
        :closable="false"
        show-icon
        title="线上检索失败"
      >
        <div class="search-error">
          <span>{{ onlineError }}</span>
          <el-button link type="primary" @click="searchOnline">
            再试一次
          </el-button>
        </div>
      </el-alert>

      <el-alert
        v-else-if="onlineSearched"
        :type="onlineCandidateCount > 0 ? 'success' : 'warning'"
        :closable="false"
        show-icon
        :title="onlineResultTitle"
      >
        <p class="online-summary">
          线上候选排在本地候选之后，仍然只是候选；要沿 ② → ⑥ 继续人工确认，
          不会自动变成已验证。
          <span v-if="onlineAttemptedHosts.length">
            尝试了 {{ onlineAttemptedHosts.length }} 个白名单来源：
            {{ onlineAttemptedHosts.join('、') }}。
          </span>
          <span v-if="onlineRejectedHosts.length" class="online-summary__rejected">
            已拒绝非白名单网址：{{ onlineRejectedHosts.join('、') }}。
          </span>
        </p>
      </el-alert>

      <section
        v-for="state in requestedStates"
        :key="state"
        class="state-section"
        :aria-labelledby="`state-section-${state}`"
      >
        <header class="state-section__header">
          <div>
            <h3 :id="`state-section-${state}`">
              {{ getPreparationStateLabel(state) }}档案候选
            </h3>
            <p>
              按「{{ intake.name }}」{{ intake.nameEn ? ` / ${intake.nameEn}` : '' }}
              与状态「{{ getPreparationStateLabel(state) }}」查本地库。
            </p>
          </div>
          <el-tag v-if="stateResult(state)" type="info" effect="plain">
            {{ visibleCandidateCount(state) }} 条
            <template v-if="onlineCandidates(state).length">
              （线上 {{ onlineCandidates(state).length }}）
            </template>
          </el-tag>
        </header>

        <div v-if="searchLoading" class="candidate-loading">
          <el-skeleton :rows="2" animated />
        </div>

        <template v-else-if="stateResult(state)">
          <div class="state-summary">
            <span v-if="bestCoveragePercent(state) !== null">
              最全一份覆盖：
              <strong>
                {{
                  formatCoverage(
                    bestCoveragePercent(state) ?? 0,
                    bestMissingCount(state)
                  )
                }}
              </strong>
            </span>
            <span v-else class="state-summary__empty">
              本地库没有匹配到{{ getPreparationStateLabel(state) }}词条<template
                v-if="onlineCandidates(state).length"
              >；下面是线上兜底候选</template>
            </span>
            <span class="state-summary__count">
              共 {{ visibleCandidateCount(state) }} 条候选
            </span>
            <span
              v-if="(stateResult(state)?.excludedCount ?? 0) > 0"
              class="state-summary__excluded"
            >
              另有 {{ stateResult(state)?.excludedCount }} 条因烤/煎被排除
            </span>
          </div>

          <div
            v-if="candidatesFor(state).length"
            class="candidate-list"
          >
            <article
              v-for="candidate in candidatesFor(state)"
              :key="candidate.sourceRecordId"
              class="candidate-card"
              :class="{
                'is-primary': isPrimary(candidate),
                'is-online': candidate.isOnline
              }"
            >
              <div class="candidate-card__top">
                <div class="candidate-card__tags">
                  <el-tag
                    v-if="candidate.isOnline"
                    size="small"
                    type="warning"
                    effect="dark"
                  >
                    线上
                  </el-tag>
                  <el-tag size="small" effect="plain">
                    {{ candidateSourceLabel(candidate) }}
                  </el-tag>
                  <el-tag
                    size="small"
                    effect="light"
                    :type="candidate.preparationState ? 'success' : 'danger'"
                  >
                    {{
                      candidate.preparationState
                        ? getPreparationStateLabel(candidate.preparationState)
                        : '生熟未知'
                    }}
                  </el-tag>
                  <el-tag
                    v-for="note in visibleNotes(candidate)"
                    :key="note"
                    size="small"
                    effect="light"
                    :type="noteMeta(note).type"
                  >
                    {{ noteMeta(note).label }}
                  </el-tag>
                </div>
                <el-tag
                  v-if="isPrimary(candidate)"
                  type="primary"
                  effect="dark"
                  size="small"
                >
                  主来源
                </el-tag>
              </div>

              <div class="candidate-card__name">{{ candidate.foodName }}</div>
              <div v-if="candidate.foodNameEn" class="candidate-card__name-en">
                {{ candidate.foodNameEn }}
              </div>

              <div v-if="candidate.isOnline" class="candidate-card__source">
                <a
                  v-if="candidate.sourceUrl"
                  :href="candidate.sourceUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ onlineHost(candidate.sourceUrl) }}
                </a>
                <span v-else>线上抓取</span>
                <span v-if="candidate.fetchedAt">
                  · 抓取于 {{ formatFetchedAt(candidate.fetchedAt) }}
                </span>
              </div>

              <div class="candidate-card__coverage">
                <span class="candidate-card__coverage-value">
                  {{
                    formatCoverage(
                      candidate.coveragePercent,
                      candidate.missingFields.length
                    )
                  }}
                </span>
                <span class="candidate-card__coverage-label">
                  必需营养素覆盖
                </span>
              </div>

              <div class="candidate-card__missing">
                <span class="candidate-card__missing-label">缺项：</span>
                <el-tooltip
                  v-if="candidate.missingFields.length"
                  :content="missingTooltip(candidate.missingFields)"
                  placement="top"
                >
                  <span>{{ missingPreview(candidate.missingFields) }}</span>
                </el-tooltip>
                <span v-else class="is-complete">无</span>
              </div>

              <div class="candidate-card__actions">
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :disabled="
                    isPrimary(candidate) || mergeLoading || isResolving
                  "
                  @click="selectPrimary(candidate)"
                >
                  {{ isPrimary(candidate) ? '当前主来源' : '设为主来源' }}
                </el-button>
                <el-checkbox
                  v-if="canUseAsSupplement(candidate)"
                  :model-value="
                    supplementalSourceRecordIds.includes(
                      candidate.sourceRecordId
                    )
                  "
                  size="small"
                  @change="
                    toggleSupplement(candidate.sourceRecordId, $event)
                  "
                >
                  用作补位来源
                </el-checkbox>
                <span
                  v-else-if="supplementDisabledReason(candidate)"
                  class="candidate-card__no-supplement"
                >
                  {{ supplementDisabledReason(candidate) }}
                </span>
              </div>
            </article>
          </div>

          <div v-else class="empty-state">
            <p class="empty-state__title">
              本地库没有匹配到「{{ intake.name }}」的{{
                getPreparationStateLabel(state)
              }}词条。
            </p>
            <p class="empty-state__hint">
              多半是英文名对不上：回 ① 站补上包装上的英文名再试。
              也可以点上方「到线上找一轮」去白名单来源查；线上数据仍要人工确认。
            </p>
          </div>
        </template>
      </section>

      <section v-if="primarySourceRecordId" class="primary-panel">
        <div class="primary-panel__label">当前主来源</div>
        <div class="primary-panel__value">
          <template v-if="primaryCandidate">
            {{ primaryCandidate.foodName }}
            <span class="primary-panel__meta">
              · {{ candidateSourceLabel(primaryCandidate) }}
              · 状态
              {{
                primaryCandidate.preparationState
                  ? getPreparationStateLabel(primaryCandidate.preparationState)
                  : '生熟未知'
              }}
            </span>
          </template>
          <template v-else>{{ shortId(primarySourceRecordId) }}</template>
        </div>
        <el-tag
          v-if="selectedSupplementalCount"
          size="small"
          type="info"
          effect="plain"
        >
          补位 {{ selectedSupplementalCount }} 条
        </el-tag>
        <el-tag v-if="primaryIsDifferentPart" size="small" type="danger" effect="light">
          主来源部位不同，请确认没有把「兔肝」当成「兔肉」
        </el-tag>
      </section>

      <el-alert
        v-else-if="allCandidates.length"
        type="info"
        :closable="false"
        show-icon
        title="还没有选主来源"
      >
        在候选卡片上点「设为主来源」，才能生成缝合方案。补位来源只接受同生熟状态、
        非「部位不同」的词条。
      </el-alert>

      <el-alert
        v-else-if="!searchLoading && !searchError"
        type="warning"
        :closable="false"
        show-icon
        title="本地库零候选"
      >
        这已经等同于「本地库一个都没匹配到」。可以点上方「到线上找一轮」去白名单来源查；
        还找不到就只能手工填写档案，缺失的数字会在终检里按「营养待补」提示。
      </el-alert>

      <section
        v-if="primarySourceRecordId"
        v-loading="mergeLoading"
        class="merge-panel"
        aria-labelledby="merge-panel-title"
      >
        <header class="merge-panel__header">
          <div>
            <h3 id="merge-panel-title">缝合方案</h3>
            <p>
              主来源有的字段不覆盖；主来源缺的字段才用补位来源补。
              同一字段多个来源给了不同的值，不自动裁决。
            </p>
          </div>
          <div class="merge-panel__actions">
            <el-button
              size="small"
              :disabled="isResolving"
              @click="generateMergePlan"
            >
              更新缝合方案
            </el-button>
            <div v-if="conflictCount > 0" class="merge-panel__adopt">
              <el-button
                size="small"
                type="warning"
                :loading="resolvingAll"
                :disabled="isResolving"
                @click="resolveAllByPrimary"
              >
                全部按主来源（其余来源仅作参考）
              </el-button>
              <span class="merge-panel__adopt-hint">
                这一步不算人工修改
              </span>
            </div>
          </div>
        </header>

        <el-alert
          v-if="isMergeDirty"
          type="warning"
          :closable="false"
          show-icon
          title="补位来源已变更"
        >
          勾选/取消补位来源后，请先点「更新缝合方案」，否则下面的表格还是上一次的方案。
        </el-alert>

        <template v-if="mergePlan">
          <div class="merge-summary">
            <el-tag size="small" type="success" effect="light">
              直接 {{ directCount }}
            </el-tag>
            <el-tag size="small" type="primary" effect="light">
              补位 {{ filledCount }}
            </el-tag>
            <el-tag size="small" type="warning" effect="light">
              人工裁决 {{ manualCount }}
            </el-tag>
            <el-tag size="small" type="danger" effect="light">
              待裁决 {{ conflictCount }}
            </el-tag>
            <el-tag size="small" type="info" effect="plain">
              缺失 {{ mergePlan.missingFields.length }}
            </el-tag>
          </div>

          <el-alert
            v-if="conflictCount > 0"
            type="error"
            :closable="false"
            show-icon
            :title="`还有 ${conflictCount} 个字段冲突未裁决，不能进入下一站`"
          >
            冲突不会自动选边：请逐行选一个候选，或点上方
            「全部按主来源（其余来源仅作参考）」。选主来源只是采纳 AI 方案，
            不会记成人工修改。
          </el-alert>

          <el-table
            :data="mergePlan.rows"
            border
            size="small"
            class="merge-table"
            :row-class-name="mergeRowClassName"
          >
            <el-table-column label="字段" min-width="140">
              <template #default="{ row }">
                <div class="field-cell">
                  <span>{{ fieldLabel(row.fieldPath) }}</span>
                  <span class="field-cell__path">{{ row.fieldPath }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="来源" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span :class="{ 'is-muted': row.status === 'CONFLICT' }">
                  {{ sourceLabel(row.sourceRecordId) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="原始值 → 换算" min-width="230">
              <template #default="{ row }">
                <div class="value-pair">
                  <div class="value-block">
                    <span class="value-block__label">原文</span>
                    <span>{{
                      row.sourceValue === null
                        ? '未记录'
                        : formatValue(row.sourceValue, row.sourceUnit)
                    }}</span>
                  </div>
                  <span class="value-pair__arrow">→</span>
                  <div class="value-block">
                    <span class="value-block__label">目录</span>
                    <span>{{
                      row.value === null
                        ? '待裁决'
                        : formatValue(row.value, row.unit)
                    }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="最终值" min-width="110">
              <template #default="{ row }">
                <strong v-if="row.value !== null">
                  {{ formatValue(row.value, row.unit) }}
                </strong>
                <span v-else class="is-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="mergeStatusMeta(row.status).type"
                  effect="light"
                >
                  {{ mergeStatusMeta(row.status).label }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <el-alert
            v-if="mergePlan.missingFields.length"
            type="warning"
            :closable="false"
            show-icon
            title="营养待补"
          >
            <p class="missing-text">
              营养待补：缺 {{ missingFieldLabels(mergePlan.missingFields) }}
            </p>
          </el-alert>

          <section v-if="conflictCount > 0" class="conflict-section">
            <div class="conflict-section__header">
              <h4>冲突裁决</h4>
              <p>
                每一行必须选一个值。选主来源等于采纳 AI 方案，记为「直接」，
                不算人工修改；改选其他来源才记为「人工裁决」。
                下面把「目录单位值」与「来源原文」分开列，它们不是一回事；
                写入档案的是目录单位值。
              </p>
            </div>

            <article
              v-for="conflict in mergePlan.conflicts"
              :key="conflict.fieldPath"
              class="conflict-card"
            >
              <header class="conflict-card__header">
                <span class="conflict-card__field">
                  {{ fieldLabel(conflict.fieldPath) }}
                </span>
                <span class="conflict-card__path">
                  {{ conflict.fieldPath }}
                </span>
              </header>

              <div class="conflict-options">
                <button
                  v-for="option in conflict.candidates"
                  :key="option.sourceRecordId"
                  type="button"
                  class="conflict-option"
                  :disabled="isResolving"
                  @click="resolveConflict(conflict, option.sourceRecordId)"
                >
                  <span class="conflict-option__source">
                    {{ sourceLabel(option.sourceRecordId) }}
                    <el-tag
                      v-if="option.sourceRecordId === primarySourceRecordId"
                      size="small"
                      type="success"
                      effect="plain"
                    >
                      主来源
                    </el-tag>
                  </span>
                  <span class="conflict-option__values">
                    <span class="value-block">
                      <span class="value-block__label">目录单位值</span>
                      <strong>{{ formatValue(option.value, option.unit) }}</strong>
                    </span>
                    <span class="value-block">
                      <span class="value-block__label">来源原文</span>
                      <strong>
                        {{
                          option.sourceValue === null
                            ? '未记录'
                            : formatValue(option.sourceValue, option.sourceUnit)
                        }}
                      </strong>
                    </span>
                  </span>
                  <span class="conflict-option__cta">
                    {{
                      option.sourceRecordId === primarySourceRecordId
                        ? '采用主来源值（不算人工修改）'
                        : '采用这个值（记为人工裁决）'
                    }}
                  </span>
                </button>
              </div>
            </article>
          </section>
        </template>

        <div v-else-if="!mergeLoading" class="merge-panel__empty">
          <p>缝合方案还没有生成成功。</p>
          <el-button size="small" type="primary" @click="generateMergePlan">
            重新生成
          </el-button>
        </div>
      </section>

      <p v-if="blockedReason" class="next-hint">{{ blockedReason }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { INGREDIENT_NUTRITION_TAB_DEFINITIONS } from '@/constants/ingredientNutrition'
import type {
  CandidateRow,
  CandidateSearchResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  MergeConflict,
  MergePlan,
  MergeRow,
  OnlineCandidateSearchResult,
  PreparationState
} from '@/types/ingredientCreation'
import { getApiErrorMessage, shouldToastApiError } from '@/utils/apiError'
import { formatCoverage } from './formatCoverage'
import {
  getCoverageCategoryLabel,
  getPreparationStateLabel
} from './stateCoverage'

const props = defineProps<{
  draft: IngredientCreationDraft | null
  saving?: boolean
}>()

const emit = defineEmits<{
  next: [payload: Partial<IngredientCreationDraftPayload>]
  'can-next': [value: boolean]
}>()

const STATE_ORDER: readonly PreparationState[] = ['RAW', 'COOKED']

/* ------------------------------------------------------------------ *
 * 名字 / 生熟清单
 * ------------------------------------------------------------------ */

const intake = computed(() => props.draft?.payload.intake ?? null)

const categoryLabel = computed(() =>
  intake.value ? getCoverageCategoryLabel(intake.value.category) : ''
)

/**
 * 要查的状态：① 站勾了哪些就查哪些（生、熟分别一次请求，可并行）。
 * ① 站一份都没勾时退回「生 + 熟」都查，避免页面空白让人无从下手。
 */
const requestedStates = computed<PreparationState[]>(() => {
  const card = intake.value
  const picked = new Set<PreparationState>([
    ...(card?.requiredStates ?? []),
    ...(card?.suggestedStates ?? [])
  ])
  const ordered = STATE_ORDER.filter((state) => picked.has(state))
  return ordered.length ? ordered : [...STATE_ORDER]
})

/* ------------------------------------------------------------------ *
 * 候选检索
 * ------------------------------------------------------------------ */

const searchResults = ref<Partial<Record<PreparationState, CandidateSearchResult>>>(
  {}
)
const searchLoading = ref(false)
const searchError = ref('')

/**
 * 线上兜底结果按状态分开存：与本地结果合并时**本地永远在前**，
 * 线上来源只是兜底，不能因为覆盖率更高就插到本地来源前面。
 */
const onlineResults = ref<
  Partial<Record<PreparationState, OnlineCandidateSearchResult>>
>({})
const onlineLoading = ref(false)
const onlineError = ref('')
const onlineSearched = ref(false)
const onlineAttemptedHosts = ref<string[]>([])
const onlineRejectedHosts = ref<string[]>([])

function localCandidates(state: PreparationState): CandidateRow[] {
  return searchResults.value[state]?.candidates ?? []
}

function onlineCandidates(state: PreparationState): CandidateRow[] {
  return onlineResults.value[state]?.candidates ?? []
}

/** ② 站实际展示/选择的候选顺序：本地候选在前，线上候选在后。 */
function candidatesFor(state: PreparationState): CandidateRow[] {
  return [...localCandidates(state), ...onlineCandidates(state)]
}

const allCandidates = computed<CandidateRow[]>(() =>
  requestedStates.value.flatMap((state) => candidatesFor(state))
)

const candidateMap = computed(() => {
  const map = new Map<string, CandidateRow>()
  for (const candidate of allCandidates.value) {
    map.set(candidate.sourceRecordId, candidate)
  }
  return map
})

function stateResult(state: PreparationState): CandidateSearchResult | null {
  return searchResults.value[state] ?? null
}

function visibleCandidateCount(state: PreparationState): number {
  return candidatesFor(state).length
}

const hasLocalCandidates = computed(() =>
  requestedStates.value.some((state) => localCandidates(state).length > 0)
)

const onlineCandidateCount = computed(() =>
  requestedStates.value.reduce(
    (count, state) => count + onlineCandidates(state).length,
    0
  )
)

const onlineResultTitle = computed(() => {
  if (!onlineSearched.value) return ''
  if (onlineCandidateCount.value > 0) {
    return `线上找到 ${onlineCandidateCount.value} 条候选（试了 ${onlineAttemptedHosts.value.length} 个来源）`
  }
  return `找了 ${onlineAttemptedHosts.value.length} 个来源都没有找到`
})

function bestCoveragePercent(state: PreparationState): number | null {
  return stateResult(state)?.coverage.bestCoveragePercent ?? null
}

function bestMissingCount(state: PreparationState): number {
  return stateResult(state)?.coverage.bestMissingFieldCount ?? 0
}

/**
 * 候选落进草稿，后续站点要按来源记录回看词条名与状态；失败不阻断本页。
 *
 * 线上候选也一起写进去：StepProfile / StepFinish 要能按 sourceRecordId
 * 找到线上来源的词条名，不能只留在本页内存里。
 */
async function persistCandidatesToDraft() {
  const draft = props.draft
  if (!draft) {
    return
  }

  const candidates = requestedStates.value.flatMap((state) =>
    candidatesFor(state)
  )
  try {
    // 用草稿当前站点而不是写死 SOURCES：从 ③ 站点回本页只是重新查候选，
    // 不能把已经推进到 PROFILE 的草稿悄悄退回 SOURCES。
    await ingredientCreationApi.patchDraft(draft.id, draft.step, {
      candidates
    })
  } catch (error) {
    if (shouldToastApiError(error, '候选已查到，但保存到草稿失败')) {
      ElMessage.warning(
        getApiErrorMessage(error, '候选已查到，但保存到草稿失败')
      )
    }
  }
}

function resetOnlineSearch() {
  onlineResults.value = {}
  onlineError.value = ''
  onlineSearched.value = false
  onlineAttemptedHosts.value = []
  onlineRejectedHosts.value = []
}

async function searchCandidates() {
  const draft = props.draft
  const card = intake.value
  if (!draft) {
    return
  }
  if (!card?.name.trim()) {
    searchError.value = '缺少中文名，请先回①站填写。'
    return
  }

  searchLoading.value = true
  searchError.value = ''
  searchResults.value = {}
  // 重新查本地库后，上一轮线上结果不再代表当前候选集合，先清掉。
  resetOnlineSearch()

  try {
    const nameEn = card.nameEn?.trim()
    const entries = await Promise.all(
      requestedStates.value.map(async (state) => {
        const result = await ingredientCreationApi.findCandidates(draft.id, {
          name: card.name.trim(),
          ...(nameEn ? { nameEn } : {}),
          state
        })
        return [state, result] as const
      })
    )

    const nextResults: Partial<
      Record<PreparationState, CandidateSearchResult>
    > = {}
    for (const [state, result] of entries) {
      nextResults[state] = result
    }
    searchResults.value = nextResults

    await persistCandidatesToDraft()
  } catch (error) {
    searchError.value = getApiErrorMessage(
      error,
      '检索候选失败，请稍后重试'
    )
    if (shouldToastApiError(error, '检索候选失败')) {
      ElMessage.error(searchError.value)
    }
  } finally {
    searchLoading.value = false
  }
}

/**
 * 本地零候选时才允许点：到白名单来源兜底找一轮。
 *
 * 不自动跑：每建一个原料都联网既慢又浪费；由人点按钮触发。
 */
async function searchOnline() {
  const draft = props.draft
  const card = intake.value
  if (!draft || !card) {
    return
  }
  if (!card.name.trim()) {
    onlineError.value = '缺少中文名，请先回①站填写。'
    return
  }

  onlineLoading.value = true
  resetOnlineSearch()

  try {
    const nameEn = card.nameEn?.trim()
    const entries = await Promise.all(
      requestedStates.value.map(async (state) => {
        const result = await ingredientCreationApi.findOnlineCandidates(
          draft.id,
          {
            name: card.name.trim(),
            ...(nameEn ? { nameEn } : {}),
            state
          }
        )
        return [state, result] as const
      })
    )

    const nextResults: Partial<
      Record<PreparationState, OnlineCandidateSearchResult>
    > = {}
    const attempted = new Set<string>()
    const rejected = new Set<string>()
    for (const [state, result] of entries) {
      nextResults[state] = result
      result.attemptedHosts.forEach((host) => attempted.add(host))
      result.rejectedHosts.forEach((host) => rejected.add(host))
    }
    onlineResults.value = nextResults
    onlineAttemptedHosts.value = [...attempted]
    onlineRejectedHosts.value = [...rejected]
    onlineSearched.value = true

    await persistCandidatesToDraft()

    if (onlineCandidateCount.value > 0) {
      ElMessage.success(`线上找到 ${onlineCandidateCount.value} 条候选`)
    } else {
      ElMessage.warning(`找了 ${attempted.size} 个来源都没有找到`)
    }
  } catch (error) {
    onlineError.value = getApiErrorMessage(
      error,
      '线上检索失败，请稍后重试'
    )
    if (shouldToastApiError(error, '线上检索失败')) {
      ElMessage.error(onlineError.value)
    }
  } finally {
    onlineLoading.value = false
  }
}

/* ------------------------------------------------------------------ *
 * 选主来源 / 补位来源 / 缝合方案
 * ------------------------------------------------------------------ */

const primarySourceRecordId = ref<string | null>(
  props.draft?.payload.mergePlan?.primarySourceRecordId ?? null
)
const mergePlan = ref<MergePlan | null>(
  props.draft?.payload.mergePlan ?? null
)

/**
 * 刷新后从已有方案反推补位来源：表格里非主来源的 `sourceRecordId`
 * 就是这次缝合真正用过的补位来源。否则页面会显示「补位 0 条」，
 * 但表格里明明有补位行，用户再点一次「更新」就会把它们弄丢。
 */
function initialSupplementalSourceRecordIds(): string[] {
  const plan = props.draft?.payload.mergePlan
  if (!plan) {
    return []
  }
  const sourceIds = new Set<string>()
  for (const row of plan.rows) {
    if (row.sourceRecordId && row.sourceRecordId !== plan.primarySourceRecordId) {
      sourceIds.add(row.sourceRecordId)
    }
  }
  return [...sourceIds]
}

const initialSupplementalIds = initialSupplementalSourceRecordIds()
const supplementalSourceRecordIds = ref<string[]>([...initialSupplementalIds])
const appliedSupplementalSourceRecordIds = ref<string[]>([
  ...initialSupplementalIds
])
const mergeLoading = ref(false)
/** 连续点不同主来源时只接受最后一次请求的结果，避免旧响应盖住新方案。 */
let mergeRequestSeq = 0

const primaryCandidate = computed<CandidateRow | null>(() => {
  if (!primarySourceRecordId.value) {
    return null
  }
  return candidateMap.value.get(primarySourceRecordId.value) ?? null
})

const primaryIsDifferentPart = computed(() =>
  Boolean(primaryCandidate.value?.notes.includes('DIFFERENT_PART'))
)

function isPrimary(candidate: CandidateRow): boolean {
  return candidate.sourceRecordId === primarySourceRecordId.value
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  const set = new Set(left)
  return right.every((item) => set.has(item))
}

/** 补位来源改了但还没有重新生成方案：表格是旧的，不能放行。 */
const isMergeDirty = computed(
  () =>
    Boolean(mergePlan.value) &&
    !sameStringSet(
      supplementalSourceRecordIds.value,
      appliedSupplementalSourceRecordIds.value
    )
)

/**
 * 补位来源必须与主来源**同生熟状态**，且不能是「部位不同」的易混词条。
 *
 * 后端缝合只做字段级补缺，不知道两份来源的生熟状态；如果页面把熟词条补进生档案，
 * 水分、蛋白都会整体漂移。这一层必须由界面挡住。
 */
function canUseAsSupplement(candidate: CandidateRow): boolean {
  const primary = primaryCandidate.value
  if (!primary || isPrimary(candidate)) {
    return false
  }
  if (primary.preparationState === null) {
    return false
  }
  if (candidate.preparationState !== primary.preparationState) {
    return false
  }
  if (candidate.notes.includes('DIFFERENT_PART')) {
    return false
  }
  return true
}

function supplementDisabledReason(candidate: CandidateRow): string {
  const primary = primaryCandidate.value
  if (!primary || isPrimary(candidate)) {
    return ''
  }
  if (primary.preparationState === null) {
    return '主来源生熟未知，不能安全补位'
  }
  if (candidate.notes.includes('DIFFERENT_PART')) {
    return '部位不同，不能补位'
  }
  if (candidate.preparationState !== primary.preparationState) {
    return `只接受${getPreparationStateLabel(primary.preparationState)}候选补位`
  }
  return ''
}

const selectedSupplementalCount = computed(
  () => supplementalSourceRecordIds.value.length
)

/**
 * 单个复选框映射到补位来源数组。
 *
 * 不用 `v-model` 直接绑数组：Element Plus 的 `el-checkbox` 单选框只接受
 * boolean / string / number，绑数组会触发 modelValue 类型告警，也拿不到
 * 当前这一条是否被勾选。
 */
function toggleSupplement(sourceRecordId: string, checked: unknown) {
  const selected = new Set(supplementalSourceRecordIds.value)
  if (Boolean(checked)) {
    selected.add(sourceRecordId)
  } else {
    selected.delete(sourceRecordId)
  }
  supplementalSourceRecordIds.value = [...selected]
}

async function selectPrimary(candidate: CandidateRow) {
  if (isPrimary(candidate) || mergeLoading.value || isResolving.value) {
    return
  }

  primarySourceRecordId.value = candidate.sourceRecordId
  // 换主来源后，旧的补位选择可能跨状态/跨部位，按新主来源重新过滤。
  supplementalSourceRecordIds.value = supplementalSourceRecordIds.value.filter(
    (sourceRecordId) => {
      const supplemental = candidateMap.value.get(sourceRecordId)
      return supplemental ? canUseAsSupplement(supplemental) : false
    }
  )
  mergePlan.value = null
  appliedSupplementalSourceRecordIds.value = []
  await generateMergePlan()
}

async function generateMergePlan() {
  const draft = props.draft
  const primary = primarySourceRecordId.value
  if (!draft || !primary) {
    return
  }

  const requestSeq = ++mergeRequestSeq
  mergeLoading.value = true
  try {
    const plan = await ingredientCreationApi.createMergePlan(draft.id, {
      primarySourceRecordId: primary,
      supplementalSourceRecordIds: [...supplementalSourceRecordIds.value]
    })
    if (requestSeq !== mergeRequestSeq) {
      return
    }
    mergePlan.value = plan
    appliedSupplementalSourceRecordIds.value = [
      ...supplementalSourceRecordIds.value
    ]
    if (plan.conflicts.length > 0) {
      ElMessage.warning(
        `缝合方案有 ${plan.conflicts.length} 个字段冲突，需要人工裁决`
      )
    }
  } catch (error) {
    if (requestSeq !== mergeRequestSeq) {
      return
    }
    mergePlan.value = null
    if (shouldToastApiError(error, '生成缝合方案失败')) {
      ElMessage.error(getApiErrorMessage(error, '生成缝合方案失败'))
    }
  } finally {
    if (requestSeq === mergeRequestSeq) {
      mergeLoading.value = false
    }
  }
}

/* ------------------------------------------------------------------ *
 * 冲突裁决
 * ------------------------------------------------------------------ */

const resolvingAll = ref(false)
const resolvingChoice = ref<{
  fieldPath: string
  sourceRecordId: string
} | null>(null)

const isResolving = computed(
  () => resolvingAll.value || resolvingChoice.value !== null
)

/** 线上按钮只有在「本地零候选」且没有别的请求在跑时才可用。 */
const onlineDisabled = computed(
  () =>
    searchLoading.value ||
    mergeLoading.value ||
    isResolving.value ||
    onlineLoading.value ||
    hasLocalCandidates.value ||
    Boolean(searchError.value)
)

const onlineButtonHint = computed(() => {
  if (hasLocalCandidates.value) {
    return '本地库已有候选，优先用本地来源'
  }
  if (searchLoading.value) {
    return '正在查本地库…'
  }
  if (searchError.value) {
    return '本地检索失败，请先重试'
  }
  if (onlineLoading.value) {
    return '正在白名单来源里查找…'
  }
  if (onlineSearched.value && onlineCandidateCount.value === 0) {
    return '本次已经找过；再点一次会命中缓存，不会重复抓取'
  }
  return '本地库一个都没匹配到时才使用；只查白名单来源'
})

const conflictCount = computed(() => mergePlan.value?.conflicts.length ?? 0)

async function resolveConflict(
  conflict: MergeConflict,
  sourceRecordId: string
) {
  const draft = props.draft
  if (!draft) {
    return
  }
  resolvingChoice.value = { fieldPath: conflict.fieldPath, sourceRecordId }
  try {
    mergePlan.value = await ingredientCreationApi.resolveMergeConflict(
      draft.id,
      { fieldPath: conflict.fieldPath, sourceRecordId }
    )
  } catch (error) {
    if (shouldToastApiError(error, '保存冲突裁决失败')) {
      ElMessage.error(getApiErrorMessage(error, '保存冲突裁决失败'))
    }
  } finally {
    resolvingChoice.value = null
  }
}

/**
 * 顶部一键：每个冲突都选主来源给出的那个候选。
 *
 * 主来源没给该字段的冲突不会被静默跳过——它留在列表里，按钮文案也写清楚
 * 只处理「主来源有的」，剩下的仍需逐行选。
 */
async function resolveAllByPrimary() {
  const draft = props.draft
  const plan = mergePlan.value
  const primary = primarySourceRecordId.value
  if (!draft || !plan || !primary) {
    return
  }

  const targets = plan.conflicts.filter((conflict) =>
    conflict.candidates.some(
      (candidate) => candidate.sourceRecordId === primary
    )
  )
  if (targets.length === 0) {
    ElMessage.warning('主来源没有为这些冲突字段提供值，请逐行选择')
    return
  }

  resolvingAll.value = true
  let latest = plan
  let failed = 0
  for (const conflict of targets) {
    try {
      latest = await ingredientCreationApi.resolveMergeConflict(draft.id, {
        fieldPath: conflict.fieldPath,
        sourceRecordId: primary
      })
      mergePlan.value = latest
    } catch {
      failed += 1
    }
  }
  resolvingAll.value = false

  const skipped = plan.conflicts.length - targets.length
  if (failed > 0) {
    ElMessage.warning(`${failed} 个冲突未裁决成功，请逐行检查`)
    return
  }
  if (skipped > 0) {
    ElMessage.warning(
      `已按主来源采纳 ${targets.length} 个字段；主来源没给值的 ${skipped} 个冲突仍需逐行选择`
    )
    return
  }
  ElMessage.success('已按主来源采纳全部冲突（不算人工修改）')
}

/* ------------------------------------------------------------------ *
 * 展示辅助
 * ------------------------------------------------------------------ */

const NOTE_META: Readonly<
  Record<
    string,
    { label: string; type: 'success' | 'warning' | 'info' | 'danger' | 'primary' }
  >
> = {
  COOKING_METHOD_UNKNOWN: { label: '做法未识别', type: 'warning' },
  STATE_UNKNOWN: { label: '生熟未知', type: 'danger' },
  DIFFERENT_PART: { label: '部位不同，易混', type: 'danger' },
  COOKING_METHOD_BOILED: { label: '水煮', type: 'success' },
  COOKING_METHOD_STEAMED: { label: '蒸', type: 'success' },
  COOKING_METHOD_GRILLED: { label: '烤', type: 'info' },
  COOKING_METHOD_FRIED: { label: '煎', type: 'info' },
  COOKING_METHOD_OTHER: { label: '其它做法', type: 'info' }
}

function noteMeta(note: string): {
  label: string
  type: 'success' | 'warning' | 'info' | 'danger' | 'primary'
} {
  return NOTE_META[note] ?? { label: note, type: 'info' }
}

/**
 * 状态为 null 时，卡片顶部已经用「生熟未知」标签说明了 STATE_UNKNOWN，
 * 这里不再重复贴同一句话；事实仍然显式可见，不藏。
 */
function visibleNotes(candidate: CandidateRow): string[] {
  return candidate.notes.filter(
    (note) =>
      note !== 'STATE_UNKNOWN' || candidate.preparationState !== null
  )
}

const SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  USDA: 'USDA',
  NZFCD: 'NZFCD',
  NEVO: 'NEVO',
  TFDA: 'TFDA',
  CFCT: 'CFCT',
  MEXT: 'MEXT',
  COFID: 'CoFID',
  CIQUAL: 'Ciqual',
  CNF: 'CNF',
  MANUAL: '人工录入',
  SUPPLEMENT_LABEL: '补剂标签'
}

function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType
}

/** 线上候选不显示「人工录入」，直接标成线上抓取。 */
function candidateSourceLabel(candidate: CandidateRow): string {
  return candidate.isOnline ? '线上抓取' : sourceTypeLabel(candidate.sourceType)
}

function onlineHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function formatFetchedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

const FIELD_LABEL_BY_PATH = new Map<string, string>()
const NUTRIENT_LABEL_BY_CODE = new Map<string, string>()

for (const tab of INGREDIENT_NUTRITION_TAB_DEFINITIONS) {
  for (const field of tab.fields) {
    FIELD_LABEL_BY_PATH.set(`${tab.key}.${field.key}`, field.label)
    NUTRIENT_LABEL_BY_CODE.set(field.key, field.label)
  }
}

/** 后端 FEDIAF 码里不在营养素目录中的派生/特殊项。 */
const EXTRA_NUTRIENT_LABELS: Readonly<Record<string, string>> = {
  methionineCystine: '蛋氨酸+胱氨酸',
  phenylalanineTyrosine: '苯丙氨酸+酪氨酸',
  epaDha: 'EPA+DHA',
  calciumPhosphorusRatio: '钙磷比',
  seleniumWetDiet: '硒（湿粮）',
  seleniumDryDiet: '硒（干粮）'
}

function fieldLabel(fieldPath: string): string {
  return (
    FIELD_LABEL_BY_PATH.get(fieldPath) ??
    fieldPath.split('.').pop() ??
    fieldPath
  )
}

function nutrientLabel(code: string): string {
  return (
    NUTRIENT_LABEL_BY_CODE.get(code) ??
    EXTRA_NUTRIENT_LABELS[code] ??
    code
  )
}

function missingPreview(fields: readonly string[]): string {
  const labels = fields.slice(0, 6).map(nutrientLabel)
  const suffix = fields.length > 6 ? ` 等 ${fields.length} 项` : ''
  return `${labels.join('、')}${suffix}`
}

function missingTooltip(fields: readonly string[]): string {
  return `缺 ${fields.length} 项：${fields.map(nutrientLabel).join('、')}`
}

function missingFieldLabels(fields: readonly string[]): string {
  // MergePlan.missingFields 是字段路径（macros.solubleFiber），
  // 与候选卡的缺失营养素码（crudeProtein / vitaminD）不是同一套，不能共用映射。
  return fields.length ? fields.map(fieldLabel).join('、') : '无'
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  if (Number.isInteger(value)) {
    return String(value)
  }
  return String(Number(value.toFixed(4)))
}

function formatValue(value: number | null, unit: string | null): string {
  if (value === null) {
    return '—'
  }
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value)
}

function shortId(value: string | null): string {
  if (!value) {
    return '—'
  }
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function sourceLabel(sourceRecordId: string | null): string {
  if (!sourceRecordId) {
    return '多个来源不一致'
  }
  const candidate = candidateMap.value.get(sourceRecordId)
  if (!candidate) {
    return shortId(sourceRecordId)
  }
  const state = candidate.preparationState
    ? getPreparationStateLabel(candidate.preparationState)
    : '生熟未知'
  return `${candidate.foodName}（${candidateSourceLabel(candidate)} · ${state}）`
}

const MERGE_STATUS_META: Readonly<
  Record<
    MergeRow['status'],
    { label: string; type: 'success' | 'primary' | 'warning' | 'danger' | 'info' }
  >
> = {
  DIRECT: { label: '直接', type: 'success' },
  FILLED: { label: '补位', type: 'primary' },
  MANUAL: { label: '人工裁决', type: 'warning' },
  CONFLICT: { label: '待裁决', type: 'danger' }
}

function mergeStatusMeta(status: MergeRow['status']) {
  return MERGE_STATUS_META[status]
}

function mergeRowClassName(params: {
  row: MergeRow
  rowIndex: number
}): string {
  return params.row.status === 'CONFLICT' ? 'merge-row--conflict' : ''
}

const mergeRows = computed(() => mergePlan.value?.rows ?? [])
const directCount = computed(
  () => mergeRows.value.filter((row) => row.status === 'DIRECT').length
)
const filledCount = computed(
  () => mergeRows.value.filter((row) => row.status === 'FILLED').length
)
const manualCount = computed(
  () => mergeRows.value.filter((row) => row.status === 'MANUAL').length
)

/* ------------------------------------------------------------------ *
 * 下一步闸门
 * ------------------------------------------------------------------ */

const hasCandidateData = computed(() => allCandidates.value.length > 0)

const blockedReason = computed(() => {
  if (!props.draft || !intake.value) {
    return '请先完成 ① 起手站。'
  }
  if (searchLoading.value) {
    return '正在检索候选…'
  }
  if (searchError.value) {
    return '候选检索失败，请先重试。'
  }
  if (mergeLoading.value) {
    return '正在生成缝合方案…'
  }
  if (isResolving.value) {
    return '正在保存冲突裁决…'
  }
  if (!primarySourceRecordId.value && hasCandidateData.value) {
    return '请先选一个主来源，才能生成缝合方案。'
  }
  if (isMergeDirty.value) {
    return '补位来源已变更，请先点「更新缝合方案」。'
  }
  if (primarySourceRecordId.value && !mergePlan.value) {
    return '缝合方案还没有生成成功，请重试。'
  }
  if (conflictCount.value > 0) {
    return `还有 ${conflictCount.value} 个字段冲突未裁决，不能进入下一站。`
  }
  if (props.saving) {
    return '正在保存草稿…'
  }
  return ''
})

const canProceed = computed(() => blockedReason.value === '')

function submit() {
  if (!canProceed.value) {
    ElMessage.warning(blockedReason.value)
    return
  }
  emit('next', {})
}

onMounted(() => {
  void searchCandidates()
  emit('can-next', canProceed.value)
})

watch(canProceed, (value) => emit('can-next', value))

defineExpose({ submit })
</script>

<style scoped>
.sources-step {
  gap: 20px;
}

.query-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.query-bar__names {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.query-bar__name {
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.query-bar__name-en {
  color: #606266;
  font-size: 13px;
}

.query-bar__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.tooltip-wrapper {
  display: inline-block;
}

.search-error {
  display: flex;
  align-items: center;
  gap: 8px;
}

.online-progress {
  padding: 10px 14px;
  border: 1px solid #faecd8;
  border-radius: 8px;
  background: #fdf6ec;
}

.online-progress p {
  margin: 8px 0 0;
  color: #b88230;
  font-size: 12px;
}

.online-summary {
  margin: 4px 0 0;
  color: #606266;
  font-size: 12px;
  line-height: 1.7;
}

.online-summary__rejected {
  color: #e6a23c;
}

.state-section {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
}

.state-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.state-section__header h3 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.state-section__header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
}

.candidate-loading {
  padding: 4px 0;
}

.state-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #f5f7fa;
  color: #606266;
  font-size: 12px;
}

.state-summary strong {
  color: #303133;
  font-size: 13px;
}

.state-summary__empty {
  color: #e6a23c;
}

.state-summary__count {
  color: #909399;
}

.state-summary__excluded {
  color: #b88230;
}

.candidate-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.candidate-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.candidate-card.is-primary {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff inset;
  background: #f5faff;
}

.candidate-card.is-online {
  border-style: dashed;
  border-color: #e6a23c;
  background: #fffdf8;
}

.candidate-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.candidate-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.candidate-card__name {
  color: #303133;
  font-size: 15px;
  font-weight: 600;
  word-break: break-word;
}

.candidate-card__name-en {
  color: #909399;
  font-size: 12px;
  word-break: break-word;
}

.candidate-card__source {
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}

.candidate-card__source a {
  color: #409eff;
  text-decoration: none;
}

.candidate-card__source a:hover {
  text-decoration: underline;
}

.candidate-card__coverage {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 2px;
}

.candidate-card__coverage-value {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.candidate-card__coverage-label {
  color: #909399;
  font-size: 11px;
}

.candidate-card__missing {
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.candidate-card__missing-label {
  color: #909399;
}

.candidate-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.candidate-card__no-supplement {
  color: #c0c4cc;
  font-size: 11px;
}

.is-complete {
  color: #67c23a;
}

.is-muted {
  color: #c0c4cc;
}

.empty-state {
  padding: 24px 16px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
  text-align: center;
}

.empty-state__title {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.empty-state__hint {
  margin: 6px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.primary-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 14px;
  border: 1px solid #b3e19d;
  border-radius: 8px;
  background: #f0f9eb;
}

.primary-panel__label {
  color: #67c23a;
  font-size: 12px;
  font-weight: 600;
}

.primary-panel__value {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.primary-panel__meta {
  color: #909399;
  font-size: 12px;
  font-weight: 400;
}

.merge-panel {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
}

.merge-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.merge-panel__header h3 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.merge-panel__header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.merge-panel__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.merge-panel__adopt {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.merge-panel__adopt-hint {
  color: #909399;
  font-size: 11px;
  line-height: 1.4;
}

.merge-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.merge-table {
  margin-bottom: 12px;
}

:deep(.merge-row--conflict > td) {
  background: #fef0f0 !important;
}

.field-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.field-cell__path {
  color: #c0c4cc;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.value-pair {
  display: flex;
  align-items: center;
  gap: 8px;
}

.value-pair__arrow {
  color: #c0c4cc;
}

.value-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.value-block__label {
  color: #909399;
  font-size: 10px;
}

.missing-text {
  margin: 0;
  color: #606266;
  font-size: 12px;
  line-height: 1.7;
  word-break: break-word;
}

.conflict-section {
  margin-top: 16px;
}

.conflict-section__header h4 {
  margin: 0;
  color: #f56c6c;
  font-size: 15px;
}

.conflict-section__header p {
  margin: 4px 0 12px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.conflict-card {
  padding: 12px;
  border: 1px solid #fbc4c4;
  border-radius: 8px;
  background: #fef0f0;
}

.conflict-card + .conflict-card {
  margin-top: 10px;
}

.conflict-card__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.conflict-card__field {
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.conflict-card__path {
  color: #c0c4cc;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.conflict-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.conflict-option {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid #f2b8b8;
  border-radius: 6px;
  background: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.conflict-option:hover:not(:disabled) {
  border-color: #f56c6c;
  box-shadow: 0 0 0 1px #f56c6c inset;
}

.conflict-option:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.conflict-option__source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.conflict-option__values {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}

.conflict-option__values strong {
  color: #303133;
  font-size: 13px;
}

.conflict-option__cta {
  color: #f56c6c;
  font-size: 12px;
}

.merge-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #909399;
}

.merge-panel__empty p {
  margin: 0;
}

.next-hint {
  margin: 0;
  color: #e6a23c;
  font-size: 12px;
  text-align: right;
}

@media (max-width: 900px) {
  .candidate-list,
  .conflict-options {
    grid-template-columns: minmax(0, 1fr);
  }

  .query-bar,
  .merge-panel__header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
