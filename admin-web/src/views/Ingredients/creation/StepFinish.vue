<template>
  <section class="creation-step finish-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">⑥</span>
      <div>
        <h2 class="creation-step__title">收尾</h2>
        <p class="creation-step__summary">
          核对摘要后一次性提交；要么全成，要么全不成。
        </p>
      </div>
    </header>

    <template v-if="!commitResult">
      <el-alert
        v-if="!draft"
        type="warning"
        :closable="false"
        show-icon
        title="草稿还没有加载"
      >
        请刷新页面，或从原料列表重新进入 AI 新建。
      </el-alert>

      <el-alert
        v-else-if="!ingredientDraft"
        type="warning"
        :closable="false"
        show-icon
        title="⑤ 原料档案还没有填写"
      >
        请先回「原料档案」站补齐名称、基准单位等基础字段，再回来提交。
      </el-alert>

      <el-alert
        v-else-if="profiles.length === 0"
        type="warning"
        :closable="false"
        show-icon
        title="还没有营养档案"
      >
        请先回「档案成型」站确认缝合方案并保存至少一份档案。
      </el-alert>

      <template v-if="ingredientDraft">
        <div class="summary-grid">
          <section class="summary-card" aria-labelledby="summary-ingredient-title">
            <header class="summary-card__header">
              <h3 id="summary-ingredient-title">原料</h3>
              <el-tag size="small" type="success" effect="light">食材</el-tag>
            </header>
            <dl class="summary-list">
              <div>
                <dt>名称</dt>
                <dd>{{ ingredientDraft.name }}</dd>
              </div>
              <div>
                <dt>基准单位</dt>
                <dd>
                  {{ baseUnitLabel }}
                  <span class="summary-muted">
                    （展示名：{{ ingredientDraft.unitDisplayLabel }}）
                  </span>
                </dd>
              </div>
              <div>
                <dt>CFCT 分类</dt>
                <dd>
                  <template v-if="ingredientDraft.cfctClass">
                    {{ ingredientDraft.cfctClass }}
                  </template>
                  <el-tag v-else size="small" type="info" effect="plain">
                    待补
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>可食部比例</dt>
                <dd>
                  <template v-if="ingredientDraft.edibleYieldRate !== null">
                    {{ ingredientDraft.edibleYieldRate }}
                  </template>
                  <el-tag v-else size="small" type="info" effect="plain">
                    待补
                  </el-tag>
                </dd>
              </div>
            </dl>
          </section>

          <section class="summary-card" aria-labelledby="summary-profiles-title">
            <header class="summary-card__header">
              <h3 id="summary-profiles-title">营养档案</h3>
              <el-tag size="small" type="primary" effect="light">
                {{ profiles.length }} 份
              </el-tag>
            </header>
            <el-table :data="profileSummaries" size="small" border>
              <el-table-column label="状态" width="80">
                <template #default="{ row }">
                  <span>{{ row.stateLabel }}</span>
                  <el-tag v-if="row.isPrimary" size="small" type="primary" effect="plain">
                    主
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="来源" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">{{ row.sourceText }}</template>
              </el-table-column>
              <el-table-column label="已填" width="100" align="center">
                <template #default="{ row }">
                  {{ row.filledCount }} / {{ row.total }}
                </template>
              </el-table-column>
            </el-table>
            <p class="summary-card__note">
              档案一律按每 100g 可食部提交，状态先落「待验证」。
            </p>
          </section>

          <section class="summary-card" aria-labelledby="summary-primary-title">
            <header class="summary-card__header">
              <h3 id="summary-primary-title">主档案</h3>
              <el-tag size="small" type="primary" effect="dark">
                {{ primaryProfile ? stateLabel(primaryProfile.preparationState) : '—' }}
              </el-tag>
            </header>
            <p class="summary-primary">
              <template v-if="primaryProfile">
                {{ stateLabel(primaryProfile.preparationState) }}档案 ·
                {{ sourceText(primaryProfile.sourceRecordId) }}
              </template>
              <template v-else>还没有可用的主档案。</template>
            </p>
            <p class="summary-card__note">
              主档案按 ② 站选中的主来源推断；主来源没有匹配时，按 ① 站类别的默认主状态。
              提交后生 / 熟两份档案都会保留，配方默认读主档案。
            </p>
          </section>
        </div>

        <section class="summary-section" aria-labelledby="summary-exceptions-title">
          <header class="summary-section__header">
            <div>
              <h3 id="summary-exceptions-title">例外清单</h3>
              <p>终检时人登记过的放行理由、忽略的提醒都在这里，提交后进入审计记录。</p>
            </div>
            <el-tag size="small" type="info" effect="plain">
              {{ exceptionRows.length }} 条
            </el-tag>
          </header>

          <el-table v-if="exceptionRows.length" :data="exceptionRows" size="small" border>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="row.tagType" effect="light">
                  {{ row.kindLabel }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="规则码" min-width="180">
              <template #default="{ row }">
                <span class="mono">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column label="理由" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ row.reason }}</template>
            </el-table-column>
            <el-table-column label="操作人" width="130">
              <template #default="{ row }">{{ row.approvedBy }}</template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                {{ formatDateTime(row.approvedAt) }}
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="summary-empty">没有登记例外，也没有忽略提醒。</div>
        </section>

        <section class="summary-section" aria-labelledby="summary-missing-title">
          <header class="summary-section__header">
            <div>
              <h3 id="summary-missing-title">缺失字段</h3>
              <p>缺失就是空值，不会被补成 0；提交后仍可在原料详情里继续补。</p>
            </div>
            <el-tag
              size="small"
              :type="missingLabels.length ? 'warning' : 'success'"
              effect="light"
            >
              {{ missingLabels.length }} 项
            </el-tag>
          </header>

          <p v-if="missingLabels.length === 0" class="summary-empty">
            营养字段目录已全部覆盖。
          </p>
          <template v-else>
            <p class="missing-preview">
              {{ missingLabels.slice(0, 12).join('、') }}
              <template v-if="missingLabels.length > 12">
                等 {{ missingLabels.length }} 项
              </template>
            </p>
            <el-table :data="profileSummaries" size="small" border>
              <el-table-column label="档案" width="90">
                <template #default="{ row }">{{ row.stateLabel }}</template>
              </el-table-column>
              <el-table-column label="缺失数" width="90" align="center">
                <template #default="{ row }">{{ row.missingCount }}</template>
              </el-table-column>
              <el-table-column label="缺项" min-width="260">
                <template #default="{ row }">
                  <span v-if="row.missingLabels.length">
                    {{ row.missingLabels.slice(0, 8).join('、') }}
                    <template v-if="row.missingLabels.length > 8">
                      等 {{ row.missingLabels.length }} 项
                    </template>
                  </span>
                  <span v-else class="summary-muted">无</span>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </section>

        <el-alert
          v-if="commitError"
          class="commit-error"
          type="error"
          :closable="false"
          show-icon
          title="提交失败（后端返回原文）"
        >
          <p class="commit-error__message">{{ commitError }}</p>
          <ul v-if="blockingDetails.length" class="commit-error__blocking">
            <li v-for="item in blockingDetails" :key="item.code">
              <span class="mono">{{ item.code }}</span>：{{ item.message }}
            </li>
          </ul>
        </el-alert>

        <div class="submit-bar">
          <p v-if="blockedReason" class="next-hint">{{ blockedReason }}</p>
          <p v-else class="submit-hint">
            提交会在一个事务里创建标准原料、营养档案与主映射；任何一步失败都不会留下半条数据。
          </p>
          <el-button
            type="primary"
            size="large"
            :loading="submitting"
            :disabled="!canSubmit || submitting"
            @click="submitCommit"
          >
            提交（创建原料 + 档案 + 主映射）
          </el-button>
        </div>
      </template>
    </template>

    <template v-else>
      <el-result
        icon="success"
        title="已提交，原料与营养档案已创建"
        :sub-title="`原料「${ingredientDraft?.name ?? ''}」与 ${profiles.length} 份营养档案已写入，当前状态：待验证（PENDING）。`"
      >
        <template #extra>
          <el-button type="primary" @click="handleConfirmAvailable">
            确认可用
          </el-button>
          <el-button @click="goToIngredientList">去原料列表核对</el-button>
        </template>
      </el-result>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="当前状态是「待验证」，配方设计器还选不到这份原料"
      >
        必须由人点一次「确认可用」并记录是谁、什么时候点的，状态才会变成「已验证」。
        AI 不参与这一步；真正调用审核接口在 Task 12 接入。
      </el-alert>

      <section class="summary-section">
        <header class="summary-section__header">
          <div>
            <h3>提交结果</h3>
            <p>以下编号可用于后续核对与审计。</p>
          </div>
        </header>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="原料">
            {{ ingredientDraft?.name ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="原料 ID">
            <span class="mono">{{ commitResult?.ingredientId }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="营养档案 ID">
            <span class="mono">
              {{ commitResult?.nutritionFoodIds.join('、') || '—' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="审计记录 ID">
            <span class="mono">{{ commitResult?.auditId }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { getApiErrorMessage } from '@/utils/apiError'
import { BaseUnitLabels } from '@/types/ingredient'
import type {
  CandidateRow,
  CheckItem,
  CommitIngredientCreationResult,
  ExceptionRecord,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  IngredientDraft,
  ProfileDraft
} from '@/types/ingredientCreation'
import { getPreparationStateLabel } from './stateCoverage'
import {
  PROFILE_FIELD_DEFINITIONS,
  countProfileValues
} from './profileLedger'
import {
  computeProfileCoverage,
  resolvePrimaryProfileIndex,
  sortProfilesByState
} from './stepProfileHelpers'

interface Props {
  draft: IngredientCreationDraft | null
  saving?: boolean
}

const props = defineProps<Props>()

// 向导壳监听这两个事件；⑥ 是最后一站，不向下一步推进，这里只声明接口。
defineEmits<{
  next: [payload: Partial<IngredientCreationDraftPayload>]
  'can-next': [value: boolean]
}>()

const router = useRouter()

const submitting = ref(false)
const commitError = ref('')
const blockingDetails = ref<CheckItem[]>([])
const commitResult = ref<CommitIngredientCreationResult | null>(null)

const intake = computed(() => props.draft?.payload.intake ?? null)
const plan = computed(() => props.draft?.payload.mergePlan ?? null)

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

function shortId(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function sourceText(sourceRecordId: string | null): string {
  if (!sourceRecordId) {
    return '暂无来源'
  }
  return candidateMap.value.get(sourceRecordId)?.foodName ?? shortId(sourceRecordId)
}

function stateLabel(state: ProfileDraft['preparationState']): string {
  return getPreparationStateLabel(state)
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

const ingredientDraft = computed<IngredientDraft | null>(() => {
  const raw = props.draft?.payload.ingredient
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) {
    return null
  }
  return {
    name: raw.name.trim(),
    type: 'FOOD',
    baseUnit: raw.baseUnit,
    unitDisplayLabel: raw.unitDisplayLabel,
    cfctClass: raw.cfctClass ?? null,
    edibleYieldRate:
      typeof raw.edibleYieldRate === 'number' ? raw.edibleYieldRate : null
  }
})

const profiles = computed<ProfileDraft[]>(() =>
  sortProfilesByState(
    (props.draft?.payload.profiles ?? []).filter(
      (profile): profile is ProfileDraft =>
        Boolean(profile) &&
        (profile.preparationState === 'RAW' ||
          profile.preparationState === 'COOKED')
    )
  )
)

const primaryIndex = computed(() =>
  resolvePrimaryProfileIndex(profiles.value, {
    primarySourceRecordId: plan.value?.primarySourceRecordId ?? null,
    category: intake.value?.category ?? null
  })
)

const primaryProfile = computed(() =>
  primaryIndex.value >= 0 ? (profiles.value[primaryIndex.value] ?? null) : null
)

const baseUnitLabel = computed(
  () =>
    BaseUnitLabels[ingredientDraft.value?.baseUnit ?? ''] ??
    ingredientDraft.value?.baseUnit ??
    '—'
)

interface ProfileSummary {
  stateLabel: string
  sourceText: string
  filledCount: number
  total: number
  missingCount: number
  missingLabels: string[]
  isPrimary: boolean
}

const profileSummaries = computed<ProfileSummary[]>(() =>
  profiles.value.map((profile, index) => {
    const coverage = computeProfileCoverage(
      profile.entries,
      PROFILE_FIELD_DEFINITIONS
    )
    return {
      stateLabel: stateLabel(profile.preparationState),
      sourceText: sourceText(profile.sourceRecordId),
      filledCount: countProfileValues(profile),
      total: coverage.total,
      missingCount: coverage.missingFields.length,
      missingLabels: coverage.missingLabels,
      isPrimary: index === primaryIndex.value
    }
  })
)

const missingLabels = computed<string[]>(() => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const summary of profileSummaries.value) {
    for (const label of summary.missingLabels) {
      if (!seen.has(label)) {
        seen.add(label)
        result.push(label)
      }
    }
  }
  return result
})

interface ExceptionSummaryRow extends ExceptionRecord {
  kindLabel: string
  tagType: 'warning' | 'info' | 'success'
}

const exceptionRows = computed<ExceptionSummaryRow[]>(() => {
  const records = props.draft?.payload.verify?.exceptions
  if (!Array.isArray(records)) {
    return []
  }

  const exceptionCodes = new Set(
    (props.draft?.payload.checks?.exceptionable ?? []).map((item) => item.code)
  )
  const warningCodes = new Set(
    (props.draft?.payload.checks?.warnings ?? []).map((item) => item.code)
  )

  return records
    .filter((record): record is ExceptionRecord => Boolean(record))
    .map((record) => {
      if (exceptionCodes.has(record.code)) {
        return {
          ...record,
          kindLabel: '例外放行',
          tagType: 'warning' as const
        }
      }
      if (warningCodes.has(record.code)) {
        return {
          ...record,
          kindLabel: '提醒确认',
          tagType: 'info' as const
        }
      }
      return {
        ...record,
        kindLabel: '其它记录',
        tagType: 'info' as const
      }
    })
})

const blockedReason = computed(() => {
  if (!props.draft) {
    return '草稿还没有创建。'
  }
  if (!ingredientDraft.value) {
    return '⑤ 原料档案还没填，请先回上一站。'
  }
  if (profiles.value.length === 0) {
    return '还没有营养档案，请先回「档案成型」站。'
  }
  if (primaryIndex.value < 0) {
    return '还没有可用的主档案。'
  }

  const emptyProfiles = profiles.value.filter(
    (profile) => countProfileValues(profile) === 0
  )
  if (emptyProfiles.length > 0) {
    const labels = emptyProfiles
      .map((profile) => `${stateLabel(profile.preparationState)}档案`)
      .join('、')
    return `${labels}没有任何营养值，请先回「档案成型」站至少填一项。`
  }

  if (props.saving) {
    return '正在保存草稿…'
  }
  return ''
})

const canSubmit = computed(() => blockedReason.value === '')

/**
 * 提交失败时把后端原文完整摊开：DTO 校验、终检阻断、重名冲突都要看得到，
 * 不能只留一句「提交失败」。
 */
function describeCommitError(error: unknown): {
  message: string
  blocking: CheckItem[]
} {
  const message = getApiErrorMessage(error, '提交失败，请稍后重试')
  const data = (
    error as {
      response?: {
        data?: { blocking?: unknown }
      }
    }
  )?.response?.data
  const rawBlocking = data?.blocking
  const blocking = Array.isArray(rawBlocking)
    ? rawBlocking.filter(
        (item): item is CheckItem =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as CheckItem).code === 'string'
      )
    : []

  return { message, blocking }
}

async function submitCommit() {
  if (!canSubmit.value || !props.draft || !ingredientDraft.value) {
    ElMessage.warning(blockedReason.value || '请先补齐提交所需信息')
    return
  }

  submitting.value = true
  commitError.value = ''
  blockingDetails.value = []

  try {
    const result = await ingredientCreationApi.commit(props.draft.id, {
      ingredient: ingredientDraft.value,
      profiles: profiles.value,
      primaryProfileIndex: primaryIndex.value
    })
    commitResult.value = result
    ElMessage.success('提交成功，原料与营养档案已创建')
  } catch (error) {
    const described = describeCommitError(error)
    commitError.value = described.message
    blockingDetails.value = described.blocking
  } finally {
    submitting.value = false
  }
}

function handleConfirmAvailable() {
  void ElMessageBox.alert(
    '「确认可用」按钮将在 Task 12 接入：届时会调用审核接口，把状态从「待验证」改成「已验证」，并记录操作人与时间。当前请先到原料列表核对营养档案。',
    '这一功能即将接入',
    {
      confirmButtonText: '知道了',
      type: 'info'
    }
  )
}

function goToIngredientList() {
  void router.push('/ingredients')
}
</script>

<style scoped>
.finish-step {
  gap: 18px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
}

.summary-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.summary-card__header h3 {
  margin: 0;
  color: #303133;
  font-size: 15px;
}

.summary-card__note {
  margin: 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.summary-list dt {
  color: #909399;
  font-size: 12px;
}

.summary-list dd {
  margin: 2px 0 0;
  color: #303133;
  font-size: 13px;
  word-break: break-word;
}

.summary-muted {
  color: #909399;
}

.summary-primary {
  margin: 0;
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.summary-section {
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.summary-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.summary-section__header h3 {
  margin: 0;
  color: #303133;
  font-size: 15px;
}

.summary-section__header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.summary-empty {
  margin: 0;
  padding: 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  color: #909399;
  font-size: 13px;
  text-align: center;
}

.missing-preview {
  margin: 0 0 10px;
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  word-break: break-all;
}

.commit-error__message {
  margin: 4px 0 0;
  white-space: pre-line;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.commit-error__blocking {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
}

.submit-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding-top: 4px;
}

.submit-hint {
  margin: 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.next-hint {
  margin: 0;
  color: #e6a23c;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
