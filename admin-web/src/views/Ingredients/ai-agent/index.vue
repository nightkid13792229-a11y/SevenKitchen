<template>
  <div class="ai-agent-page">
    <header class="ai-agent-header">
      <div>
        <h2 class="ai-agent-header__title">AI 添加原料（Agent）</h2>
        <p class="ai-agent-header__subtitle">
          说一句话，AI 会在这份草稿上查库、写原料卡与营养档案、跑终检；
          跑完一轮后右侧出现「原料卡 / 营养档案」，你核对、改完就能提交。
        </p>
      </div>
      <el-button text @click="goBackToList">返回原料列表</el-button>
    </header>

    <div class="ai-agent-layout">
      <el-card class="agent-panel" shadow="never">
        <div class="agent-panel__head">
          <span class="agent-panel__dot" aria-hidden="true"></span>
          <b>Agent 运行</b>
          <span class="agent-panel__draft">
            草稿：<code>{{ state.draftId || '运行后创建' }}</code>
          </span>
        </div>

        <div ref="bodyRef" class="agent-panel__body">
          <el-empty
            v-if="state.runs.length === 0"
            description="还没有运行。输入一句话开始，例如「帮我加鸡肝」。"
            :image-size="72"
          />

          <div v-for="run in state.runs" :key="run.id" class="agent-run">
            <div class="agent-run__ask">
              <span class="agent-run__role agent-run__role--me">你</span>
              <p class="agent-run__ask-text">{{ run.text }}</p>
            </div>

            <div v-if="run.error" class="agent-run__failure">
              <div class="agent-run__failure-head">
                <el-tag type="danger" size="small" effect="plain">失败</el-tag>
                <span v-if="run.steps.length > 0">
                  这一轮中断了，已保留上面收到的 {{ run.steps.length }} 步
                </span>
                <span v-else>这一轮没有跑完</span>
              </div>
              <p class="agent-run__failure-text">{{ run.error }}</p>
            </div>

            <div v-if="run.meta" class="agent-run__meta">
              <span>草稿 {{ run.draftId || state.draftId }}</span>
              <span>steps {{ run.meta.steps }}</span>
              <span>工具调用 {{ run.meta.toolCallCount }} 次</span>
            </div>

            <div v-if="run.steps.length > 0" class="agent-steps">
              <div
                v-for="step in run.steps"
                :key="step.index"
                class="agent-step"
                :class="{
                  'agent-step--running': step.status === 'running',
                  'agent-step--failed': step.status === 'failed',
                  'agent-step--empty': step.found === false
                }"
              >
                <span class="agent-step__index">{{ step.index }}</span>
                <div class="agent-step__body">
                  <div class="agent-step__head">
                    <b class="agent-step__label">{{ step.label }}</b>
                    <span v-if="stepSummary(step)" class="agent-step__summary">
                      {{ stepSummary(step) }}
                    </span>
                    <el-tag
                      size="small"
                      effect="plain"
                      :type="stepTagType(step)"
                    >
                      {{ stepTagLabel(step) }}
                    </el-tag>
                  </div>
                  <p v-if="step.resultSummary" class="agent-step__result">
                    {{ step.resultSummary }}
                  </p>
                  <p v-if="step.status === 'failed'" class="agent-step__error">
                    {{ step.error || '工具执行失败（后端没有给出原因）' }}
                  </p>
                </div>
              </div>
            </div>

            <p v-else-if="run.reply" class="agent-run__no-tools">
              这一轮没有调用工具，AI 直接回答了。
            </p>

            <div v-if="run.reply" class="agent-run__reply">
              <span class="agent-run__role agent-run__role--ai">AI</span>
              <p class="agent-run__reply-text">{{ run.reply }}</p>
            </div>

            <div v-if="run.running" class="agent-typing">
              <span class="agent-typing__dot" aria-hidden="true"></span>
              AI 正在执行…
            </div>
          </div>
        </div>

        <div class="agent-composer">
          <el-input
            v-model="inputText"
            :disabled="state.running || saving || Boolean(commitResult)"
            maxlength="500"
            placeholder="例如：帮我加鸡肝，按生档案补粗蛋白 19.5 g"
            @keyup.enter="handleRun"
          />
          <el-button
            type="primary"
            :loading="state.running"
            :disabled="!canRun"
            @click="handleRun"
          >
            {{ runButtonLabel }}
          </el-button>
        </div>
      </el-card>

      <el-card v-if="reviewVisible" class="review-panel" shadow="never">
        <div class="review-panel__head">
          <div class="review-panel__title">
            <b>草稿审核</b>
            <span v-if="draft" class="review-panel__step">
              当前站点 {{ draft.step }}
            </span>
          </div>
          <div class="review-stats">
            <el-tag size="small" type="warning" effect="plain">
              待补 {{ pendingCount }} 项
            </el-tag>
            <el-tag
              size="small"
              :type="conflictCount > 0 ? 'danger' : 'info'"
              effect="plain"
            >
              冲突 {{ conflictCount }} 项
            </el-tag>
            <el-tag size="small" :type="checkTagType" effect="plain">
              检查：{{ checkSummary.label }}
            </el-tag>
          </div>
        </div>

        <el-alert
          v-if="draftError"
          class="review-alert"
          type="error"
          :closable="false"
          show-icon
          title="草稿加载失败（后端返回原文）"
        >
          <p class="review-error-text">{{ draftError }}</p>
        </el-alert>

        <div v-else-if="draftLoading" v-loading="true" class="review-loading" />

        <div v-else-if="draft" class="review-panel__body">
          <el-tabs v-model="activeTab" class="review-tabs">
            <el-tab-pane label="原料卡" name="ingredient">
              <el-form
                class="ingredient-form"
                label-position="top"
                :disabled="Boolean(commitResult) || saving || submitting"
                @submit.prevent
              >
                <div class="ingredient-form__grid">
                  <el-form-item label="名称">
                    <div class="field-with-tag">
                      <el-input
                        v-model="ingredientForm.name"
                        maxlength="100"
                        placeholder="例如：鸡肝"
                        @change="saveIngredientField('name')"
                      />
                      <el-tag
                        v-if="isIngredientManual('name')"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        人工
                      </el-tag>
                    </div>
                  </el-form-item>

                  <el-form-item label="英文名">
                    <div class="field-with-tag">
                      <el-input
                        v-model="ingredientForm.nameEn"
                        maxlength="200"
                        placeholder="没有把握就留空"
                        @change="saveIngredientField('nameEn')"
                      />
                      <el-tag
                        v-if="isIngredientManual('nameEn')"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        人工
                      </el-tag>
                    </div>
                  </el-form-item>

                  <el-form-item label="类别">
                    <div class="field-with-tag">
                      <el-select
                        v-model="ingredientForm.category"
                        clearable
                        placeholder="判不准就留空"
                        class="field-control"
                        @change="saveIngredientField('category')"
                      >
                        <el-option
                          v-for="option in COVERAGE_CATEGORY_OPTIONS"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </el-select>
                      <el-tag
                        v-if="isIngredientManual('category')"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        人工
                      </el-tag>
                    </div>
                  </el-form-item>

                  <el-form-item label="基准单位">
                    <div class="field-with-tag">
                      <el-select
                        v-model="ingredientForm.baseUnit"
                        class="field-control"
                        @change="saveIngredientField('baseUnit')"
                      >
                        <el-option
                          v-for="option in BASE_UNIT_OPTIONS"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </el-select>
                      <el-tag
                        v-if="isIngredientManual('baseUnit')"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        人工
                      </el-tag>
                    </div>
                  </el-form-item>

                  <el-form-item label="单位展示名">
                    <div class="field-with-tag">
                      <el-input
                        v-model="ingredientForm.unitDisplayLabel"
                        maxlength="50"
                        placeholder="例如：克"
                        @change="saveIngredientField('unitDisplayLabel')"
                      />
                      <el-tag
                        v-if="isIngredientManual('unitDisplayLabel')"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        人工
                      </el-tag>
                    </div>
                  </el-form-item>

                  <el-form-item label="CFCT 分类">
                    <div class="field-with-tag">
                      <el-select
                        v-model="ingredientForm.cfctClass"
                        clearable
                        filterable
                        placeholder="判不准就留空"
                        class="field-control"
                        @change="handleCfctClassChange"
                      >
                        <el-option
                          v-for="option in CFCT_CLASS_OPTIONS"
                          :key="option"
                          :label="option"
                          :value="option"
                        />
                      </el-select>
                      <el-tag
                        v-if="isIngredientManual('cfctClass')"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        人工
                      </el-tag>
                    </div>
                  </el-form-item>

                  <el-form-item label="可食部（%）">
                    <div class="field-with-tag">
                      <el-input-number
                        :model-value="ingredientForm.edibleYieldPercent ?? undefined"
                        :min="0.1"
                        :max="100"
                        :step="0.5"
                        :precision="2"
                        :controls="false"
                        placeholder="未知留空"
                        class="field-control"
                        @change="handlePercentChange"
                      />
                      <el-tag
                        v-if="isIngredientManual('edibleYieldPercent')"
                        size="small"
                        type="warning"
                        effect="plain"
                      >
                        人工
                      </el-tag>
                    </div>
                  </el-form-item>
                </div>
              </el-form>

              <p class="review-hint">
                改动会在离开输入框时自动保存到草稿。标「人工」的字段 AI
                之后不会再覆盖；提交后可在原料详情里继续补。
              </p>
            </el-tab-pane>

            <el-tab-pane label="营养档案" name="profiles">
              <el-empty
                v-if="profileGroups.length === 0"
                description="草稿里还没有营养档案。先让 AI 查库写入，或继续对话补数据。"
                :image-size="64"
              />

              <section
                v-for="group in profileGroups"
                :key="group.profileIndex"
                class="profile-group"
              >
                <header class="profile-group__head">
                  <b>{{ group.stateLabel }}档案</b>
                  <span class="profile-group__source">
                    来源：{{ group.sourceLabel }}
                  </span>
                  <el-tag
                    size="small"
                    :type="group.pendingCount > 0 ? 'warning' : 'success'"
                    effect="plain"
                  >
                    待补 {{ group.pendingCount }} 项
                  </el-tag>
                </header>

                <div
                  v-for="section in tabSections(group)"
                  :key="`${group.profileIndex}-${section.key}`"
                  class="profile-section"
                >
                  <div class="profile-section__head">{{ section.label }}</div>
                  <div class="profile-rows">
                    <div
                      v-for="row in section.rows"
                      :key="row.fieldPath"
                      class="profile-row"
                    >
                      <span class="profile-row__label" :title="row.fieldPath">
                        {{ row.label }}
                      </span>
                      <el-input-number
                        :model-value="cellValue(group.profileIndex, row) ?? undefined"
                        :min="0"
                        :controls="false"
                        size="small"
                        class="profile-row__input"
                        :disabled="Boolean(commitResult) || saving || submitting"
                        @change="
                          handleCellChange(group.profileIndex, row, $event)
                        "
                      />
                      <span class="profile-row__unit">{{ row.unit }}</span>
                      <el-tag
                        size="small"
                        :type="row.statusType"
                        effect="plain"
                        class="profile-row__status"
                      >
                        {{ row.statusLabel }}
                      </el-tag>
                      <span
                        class="profile-row__source"
                        :title="row.sourceRecordId || '暂无来源'"
                      >
                        {{ row.sourceLabel }}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <p class="review-hint">
                清空一格会保留证据行、值变成空（显示「待补」），不会写成 0。
              </p>
            </el-tab-pane>
          </el-tabs>

          <div class="review-feedback">
            <el-alert
              v-if="saveError"
              type="error"
              :closable="false"
              show-icon
              title="保存草稿失败（后端返回原文）"
            >
              <p class="review-error-text">{{ saveError }}</p>
            </el-alert>

            <el-alert
              v-if="submitError"
              type="error"
              :closable="false"
              show-icon
              title="提交失败（后端返回原文）"
            >
              <p class="review-error-text">{{ submitError }}</p>
            </el-alert>

            <el-alert
              v-if="checkSummary.state === 'BLOCK'"
              type="error"
              :closable="false"
              show-icon
              title="终检有阻断项，已阻止提交"
            >
              <ul class="review-blocking">
                <li
                  v-for="item in checkSummary.blocking"
                  :key="`${item.code}-${item.fieldPath ?? ''}`"
                >
                  <code>{{ item.code }}</code
                  >：{{ item.message }}
                  <span v-if="item.fieldPath" class="review-blocking__path">
                    （{{ item.fieldPath }}）
                  </span>
                </li>
              </ul>
            </el-alert>

            <el-alert
              v-if="verifyError"
              type="error"
              :closable="false"
              show-icon
              title="确认可用失败（后端返回原文）"
            >
              <p class="review-error-text">{{ verifyError }}</p>
            </el-alert>

            <el-alert
              v-if="commitResult"
              type="success"
              :closable="false"
              show-icon
              :title="
                verified
                  ? '已提交，原料与营养档案已确认可用'
                  : '已提交，营养档案当前是「待验证」'
              "
            >
              <p class="review-commit-result">
                原料 {{ shortId(commitResult.ingredientId) }} ·
                营养档案
                {{ commitResult.nutritionFoodIds.map(shortId).join('、') }}
              </p>
              <p v-if="!verified" class="review-error-text">
                {{
                  isAdmin
                    ? '点「确认可用」后，这些档案才会进入配方链路。'
                    : ADMIN_ONLY_TIP
                }}
              </p>
            </el-alert>
          </div>

          <footer class="review-footer">
            <el-button
              type="primary"
              size="large"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              提交
            </el-button>
            <el-button
              v-if="commitResult"
              type="success"
              size="large"
              :loading="verifying"
              :disabled="!isAdmin || verified || verifying"
              @click="handleVerify"
            >
              确认可用
            </el-button>
            <span class="review-footer__hint">{{ submitHint }}</span>
          </footer>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { nutritionFoodApi } from '@/api/ingredients'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import { INGREDIENT_NUTRITION_TAB_DEFINITIONS } from '@/constants/ingredientNutrition'
import { CFCT_CLASS_OPTIONS } from '@/types/ingredient'
import { COVERAGE_CATEGORY_OPTIONS } from './ingredientProfileRules'
import { getApiErrorMessage } from '@/utils/apiError'
import type {
  CommitIngredientCreationResult,
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  IngredientDraft,
  ProfileDraft
} from '@/types/ingredientCreation'
import {
  applyProfileCellEdit,
  countPendingRows,
  countPlanConflicts,
  markIngredientFieldManual,
  toCheckSummary,
  toCommitInput,
  toIngredientCard,
  toIngredientDraft,
  toProfileRows,
  type IngredientCardForm,
  type IngredientEditableField,
  type ProfileFieldRow,
  type ProfileGroup
} from './draftReview'
import {
  streamIngredientAgent,
  type AgentStreamMeta,
  type AgentStreamState,
  type AgentStreamStep
} from './agentStream'

/**
 * Agent 审核页：
 * - 左边是受控循环的对话与工具记录；
 * - 跑完一轮后右边出现「原料卡 / 营养档案」两个标签，数据全部来自草稿；
 * - 原料卡与营养格改动都 PATCH 草稿，人工改过的字段带标记，AI 不再覆盖；
 * - 底部提交先跑终检、有阻断就停；提交成功后才出现「确认可用」。
 */
interface AgentRunRecord {
  id: number
  text: string
  /** 边跑边追加：step_start 先落一行「执行中」，step_end 改成成功 / 失败 */
  steps: AgentStreamStep[]
  reply: string | null
  draftId: string | null
  meta: AgentStreamMeta | null
  error: string | null
  running: boolean
}

const router = useRouter()
const isAdmin = useIsAdmin()

const inputText = ref('')
const bodyRef = ref<HTMLElement | null>(null)
const state = reactive({
  running: false,
  /** 上一轮成功返回的草稿 id；为空表示下一轮会新建草稿。 */
  draftId: null as string | null,
  runs: [] as AgentRunRecord[]
})

const draft = ref<IngredientCreationDraft | null>(null)
const draftLoading = ref(false)
const draftError = ref('')
const activeTab = ref<'ingredient' | 'profiles'>('ingredient')

const ingredientForm = reactive<IngredientCardForm>({
  name: '',
  nameEn: '',
  category: '',
  baseUnit: 'G',
  unitDisplayLabel: '克',
  cfctClass: '',
  edibleYieldPercent: null,
  manualFields: []
})
/** 最近一次从后端读到的原料卡：用来判断人到底改了没有。 */
const loadedCard = ref<IngredientCardForm | null>(null)

const checkResult = ref<FinalCheckResult | null>(null)
/** 终检出现阻断后禁止提交，直到人再改草稿（改动会把 checkResult 清空）。 */
const checkBlocked = ref(false)
const submitError = ref('')
const submitting = ref(false)
const commitResult = ref<CommitIngredientCreationResult | null>(null)

const verifyError = ref('')
const verifying = ref(false)
const verified = ref(false)

const saveError = ref('')
const saveFailed = ref(false)
const savingCount = ref(0)
const pendingCells = reactive(new Map<string, number | null>())
let saveQueue: Promise<void> = Promise.resolve()

let runSeq = 0

const BASE_UNIT_OPTIONS: ReadonlyArray<{
  value: IngredientDraft['baseUnit']
  label: string
}> = [
  { value: 'G', label: '克' },
  { value: 'ML', label: '毫升' },
  { value: 'PCS', label: '个/件' }
]

const saving = computed(() => savingCount.value > 0)

const canRun = computed(
  () =>
    !state.running &&
    !saving.value &&
    !commitResult.value &&
    inputText.value.trim().length > 0
)

const runButtonLabel = computed(() =>
  state.runs.length === 0 ? '开始' : '继续'
)

const reviewVisible = computed(
  () =>
    Boolean(state.draftId) &&
    Boolean(draft.value || draftLoading.value || draftError.value)
)

const sourceNames = computed(() => {
  const map = new Map<string, string>()
  const candidates = draft.value?.payload.candidates ?? []
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate.sourceRecordId === 'string' &&
      typeof candidate.foodName === 'string' &&
      candidate.foodName
    ) {
      map.set(candidate.sourceRecordId, candidate.foodName)
    }
  }
  return map
})

const profileGroups = computed<ProfileGroup[]>(() =>
  toProfileRows(draft.value?.payload, sourceNames.value)
)

const pendingCount = computed(() => countPendingRows(profileGroups.value))
const conflictCount = computed(() =>
  countPlanConflicts(draft.value?.payload)
)
const checkSummary = computed(() => toCheckSummary(checkResult.value))
const checkTagType = computed<'success' | 'danger' | 'info'>(() => {
  if (checkSummary.value.state === 'PASS') return 'success'
  if (checkSummary.value.state === 'BLOCK') return 'danger'
  return 'info'
})

const canSubmit = computed(
  () =>
    Boolean(draft.value) &&
    !commitResult.value &&
    !submitting.value &&
    !saving.value &&
    !checkBlocked.value &&
    ingredientForm.name.trim().length > 0 &&
    (draft.value?.payload.profiles?.length ?? 0) > 0
)

const submitHint = computed(() => {
  if (commitResult.value) {
    return verified.value
      ? '已确认可用，配方里现在能选到这些档案。'
      : '提交已完成；确认可用后才会进入配方链路。'
  }
  if (checkBlocked.value) {
    return '终检有阻断项，已禁止提交；按明细修改草稿后可再试。'
  }
  if (!ingredientForm.name.trim()) return '原料名称还没填。'
  if ((draft.value?.payload.profiles?.length ?? 0) === 0) {
    return '还没有营养档案，先让 AI 写入再提交。'
  }
  if (saving.value) return '正在保存草稿…'
  return '提交会先跑终检；有阻断项就停下，不会写正式数据。'
})

function stepTagType(
  step: AgentStreamStep
): 'info' | 'success' | 'warning' | 'danger' {
  if (step.status === 'running') return 'info'
  if (step.status === 'failed') return 'danger'
  return step.found === false ? 'warning' : 'success'
}

function stepTagLabel(step: AgentStreamStep): string {
  if (step.status === 'running') return '正在执行'
  if (step.status === 'failed') return '失败'
  return step.found === false ? '未找到' : '成功'
}

/** 后端 summary 已带中文动作（如「查本地库 西洋菜·生」），去掉与 label 重复的前缀。 */
function stepSummary(step: AgentStreamStep): string {
  const summary = step.summary.trim()
  for (const prefix of [`调用 ${step.label}`, step.label]) {
    if (prefix && summary.startsWith(prefix)) {
      return summary.slice(prefix.length).replace(/^[\s·:：-]+/, '')
    }
  }
  return summary
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

async function scrollToBottom() {
  await nextTick()
  const element = bodyRef.value
  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

watch(() => state.runs.length, scrollToBottom)
watch(() => state.running, scrollToBottom)
onMounted(scrollToBottom)

/** 后端返回的草稿统一在这里落状态；`resetForm` 只在首次加载/新一轮后使用。 */
function applyDraft(
  updated: IngredientCreationDraft,
  options: { resetForm?: boolean } = {}
) {
  draft.value = updated
  loadedCard.value = toIngredientCard(updated.payload, updated.name)

  if (options.resetForm) {
    Object.assign(ingredientForm, loadedCard.value)
    checkResult.value = updated.payload.checks ?? null
    checkBlocked.value = false
    pendingCells.clear()
  }
}

async function loadDraft(draftId: string) {
  draftLoading.value = true
  draftError.value = ''
  try {
    const updated = await ingredientCreationApi.getDraft(draftId)
    applyDraft(updated, { resetForm: true })
  } catch (error) {
    draftError.value = getApiErrorMessage(error, '草稿加载失败，请稍后重试')
  } finally {
    draftLoading.value = false
  }
}

async function handleRun() {
  const text = inputText.value.trim()
  if (!text || state.running || saving.value || commitResult.value) {
    return
  }

  inputText.value = ''
  state.running = true
  const run = reactive<AgentRunRecord>({
    id: ++runSeq,
    text,
    steps: [],
    reply: null,
    draftId: null,
    meta: null,
    error: null,
    running: true
  })
  state.runs.push(run)
  await scrollToBottom()

  const applyState = (next: AgentStreamState) => {
    run.steps = next.steps
    run.reply = next.reply
    run.draftId = next.draftId
    run.meta = next.meta
    run.error = next.error
    if (next.draftId) {
      state.draftId = next.draftId
    }
  }

  try {
    // 直接读 ReadableStream：step_start 一到就渲染「执行中」，
    // step_end 再改成成功 / 失败；断网时 next.steps 已经是收到的那几步。
    const finalState = await streamIngredientAgent(
      {
        ...(state.draftId ? { draftId: state.draftId } : {}),
        text
      },
      {
        onState: (next) => {
          applyState(next)
          void scrollToBottom()
        }
      }
    )
    applyState(finalState)
    if (finalState.draftId) {
      // 每跑完一轮都重新读草稿：右边两个标签永远显示服务端最新版本。
      await loadDraft(finalState.draftId)
    }
  } catch (error) {
    // 流式函数本身不抛错；这里是防御性兜底，且不清空已经收到的步骤。
    run.error = getApiErrorMessage(error, '流式请求失败，已保留收到的步骤。')
  } finally {
    run.running = false
    state.running = false
    await scrollToBottom()
  }
}

/**
 * 保存串行化：两个格子几乎同时改时，后一个必须在前一个返回后再读最新草稿，
 * 否则会用旧 profiles 覆盖掉前一次改动。
 */
function enqueueSave(task: () => Promise<void>): Promise<boolean> {
  const run = saveQueue.then(async () => {
    savingCount.value += 1
    saveError.value = ''
    saveFailed.value = false
    try {
      await task()
      return true
    } catch (error) {
      saveFailed.value = true
      saveError.value = getApiErrorMessage(error, '保存草稿失败，请稍后重试')
      return false
    } finally {
      savingCount.value -= 1
    }
  })

  saveQueue = run.then(() => undefined)
  return run
}

function ingredientFieldValue(
  card: IngredientCardForm,
  field: IngredientEditableField
): string | number | null {
  if (field === 'edibleYieldPercent') {
    return card.edibleYieldPercent
  }
  return card[field]
}

function isIngredientChanged(field: IngredientEditableField): boolean {
  const before = loadedCard.value
  if (!before) {
    return true
  }
  return (
    ingredientFieldValue(before, field) !==
    ingredientFieldValue(ingredientForm, field)
  )
}

function isIngredientManual(field: IngredientEditableField): boolean {
  return ingredientForm.manualFields.includes(field)
}

/** 人改了原料卡的一格：先记人工标记，再 PATCH 整张卡。 */
async function saveIngredientField(field: IngredientEditableField) {
  if (!draft.value || commitResult.value) {
    return
  }
  if (!isIngredientChanged(field)) {
    return
  }

  const marked = markIngredientFieldManual(ingredientForm, field)
  ingredientForm.manualFields = marked.manualFields
  const ingredient = toIngredientDraft(marked)
  const draftId = draft.value.id
  const step = draft.value.step
  checkResult.value = null
  checkBlocked.value = false

  await enqueueSave(async () => {
    const updated = await ingredientCreationApi.patchDraft(draftId, step, {
      ingredient
    })
    draft.value = updated
    loadedCard.value = toIngredientCard(updated.payload, updated.name)
  })
}

function handleCfctClassChange(value: unknown) {
  ingredientForm.cfctClass = typeof value === 'string' ? value : ''
  void saveIngredientField('cfctClass')
}

function handlePercentChange(value: number | undefined) {
  ingredientForm.edibleYieldPercent =
    typeof value === 'number' && Number.isFinite(value) ? value : null
  void saveIngredientField('edibleYieldPercent')
}

function cellKey(profileIndex: number, fieldPath: string): string {
  return `${profileIndex}:${fieldPath}`
}

/** 乐观显示刚输入的值；PATCH 成功后以服务端返回为准。 */
function cellValue(profileIndex: number, row: ProfileFieldRow): number | null {
  const key = cellKey(profileIndex, row.fieldPath)
  return pendingCells.has(key) ? pendingCells.get(key)! : row.value
}

async function handleCellChange(
  profileIndex: number,
  row: ProfileFieldRow,
  value: number | undefined
) {
  if (!draft.value || commitResult.value) {
    return
  }

  const nextValue =
    typeof value === 'number' && Number.isFinite(value) ? value : null
  const key = cellKey(profileIndex, row.fieldPath)
  if (row.value === nextValue && !pendingCells.has(key)) {
    return
  }

  pendingCells.set(key, nextValue)
  checkResult.value = null
  checkBlocked.value = false

  const draftId = draft.value.id
  const step = draft.value.step
  const ok = await enqueueSave(async () => {
    const profiles = applyProfileCellEdit(
      draft.value?.payload.profiles ?? [],
      profileIndex,
      row.fieldPath,
      nextValue
    )
    const updated = await ingredientCreationApi.patchDraft(draftId, step, {
      profiles
    })
    draft.value = updated
    pendingCells.delete(key)
  })

  if (!ok) {
    pendingCells.delete(key)
  }
}

function tabSections(group: ProfileGroup) {
  return INGREDIENT_NUTRITION_TAB_DEFINITIONS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    rows: group.rows.filter((row) => row.tabKey === tab.key)
  })).filter((section) => section.rows.length > 0)
}

/** 提交：先跑终检，有 blocking 就停在页面上；通过才调 commit。 */
async function handleSubmit() {
  if (!draft.value || submitting.value) {
    return
  }
  if (!canSubmit.value) {
    ElMessage.warning(submitHint.value)
    return
  }

  submitting.value = true
  submitError.value = ''
  verifyError.value = ''
  verified.value = false

  try {
    await saveQueue
    if (saveFailed.value) {
      submitError.value = saveError.value || '草稿还有没保存成功的改动，不能提交'
      return
    }

    const check = await ingredientCreationApi.runCheck(draft.value.id)
    checkResult.value = check
    if (check.blocking.length > 0) {
      checkBlocked.value = true
      submitError.value = `终检有 ${check.blocking.length} 项阻断，已阻止提交`
      return
    }
    checkBlocked.value = false

    const input = toCommitInput(
      draft.value.payload,
      // 以当前表单为准：刚改完还没离开输入框的字段也要一起提交。
      toIngredientDraft(ingredientForm)
    )
    if (!input) {
      submitError.value = '草稿还缺原料名或营养档案，不能提交'
      return
    }

    const result = await ingredientCreationApi.commit(draft.value.id, input)
    commitResult.value = result
    ElMessage.success('提交成功，营养档案已创建为「待验证」')
  } catch (error) {
    submitError.value = getApiErrorMessage(error, '提交失败，请稍后重试')
    const rawBlocking = (
      error as { response?: { data?: { blocking?: unknown } } }
    )?.response?.data?.blocking
    if (Array.isArray(rawBlocking)) {
      checkBlocked.value = true
      checkResult.value = {
        blocking: rawBlocking as FinalCheckResult['blocking'],
        exceptionable: [],
        warnings: []
      }
    }
  } finally {
    submitting.value = false
  }
}

/** 确认可用：对提交返回的每个 nutritionFoodId 一个一个验证，失败逐条留原文。 */
async function handleVerify() {
  if (!isAdmin.value) {
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }

  const nutritionFoodIds = commitResult.value?.nutritionFoodIds ?? []
  if (nutritionFoodIds.length === 0) {
    verifyError.value = '这次提交没有返回营养档案，无法确认可用'
    return
  }

  verifying.value = true
  verifyError.value = ''

  const failures: string[] = []
  for (const nutritionFoodId of nutritionFoodIds) {
    try {
      await nutritionFoodApi.verify(nutritionFoodId)
    } catch (error) {
      failures.push(
        `${shortId(nutritionFoodId)}：${getApiErrorMessage(
          error,
          '确认可用失败，请稍后重试'
        )}`
      )
    }
  }

  verifying.value = false

  if (failures.length === 0) {
    verified.value = true
    ElMessage.success('已确认可用，配方里现在能选到这些档案')
    return
  }

  verifyError.value = failures.join('\n')
}

function goBackToList() {
  void router.push('/ingredients')
}
</script>

<style scoped>
.ai-agent-page {
  max-width: 1440px;
  margin: 0 auto;
}

.ai-agent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ai-agent-header__title {
  margin: 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
}

.ai-agent-header__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.ai-agent-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 540px);
  gap: 16px;
  align-items: start;
}

.agent-panel,
.review-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 220px);
  min-height: 480px;
  max-height: 860px;
}

.agent-panel :deep(.el-card__body),
.review-panel :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.agent-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.agent-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-success);
}

.agent-panel__draft {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.agent-panel__draft code {
  font-family: var(--el-font-family-mono, monospace);
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.agent-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--el-bg-color);
  scroll-behavior: smooth;
}

.agent-run {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-run__ask {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agent-run__role {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  line-height: 26px;
  text-align: center;
}

.agent-run__role--me {
  background: var(--el-color-primary);
  color: #fff;
}

.agent-run__role--ai {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.agent-run__ask-text {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  border-top-left-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.agent-run__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-left: 34px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 34px;
}

.agent-step {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.agent-step--failed {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}

.agent-step--empty {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
}

.agent-step--running {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.agent-step--running .agent-step__index {
  animation: agent-step-pulse 1.2s ease-in-out infinite;
}

@keyframes agent-step-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.agent-step__index {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 20px;
  text-align: center;
}

.agent-step--failed .agent-step__index {
  background: var(--el-color-danger-light-7);
  color: var(--el-color-danger);
}

.agent-step__body {
  flex: 1;
  min-width: 0;
}

.agent-step__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.agent-step__label {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.agent-step__summary {
  font-size: 13px;
  color: var(--el-text-color-regular);
  word-break: break-word;
}

.agent-step__result {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}

.agent-step__head :deep(.el-tag) {
  margin-left: auto;
}

.agent-step__evidence {
  margin-top: 8px;
}

.agent-step__evidence-summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--el-color-primary);
  user-select: none;
}

.agent-step__evidence-body {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  font-size: 12px;
}

.agent-step__keywords {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--el-text-color-secondary);
}

.agent-step__empty {
  margin: 0;
  font-weight: 600;
  color: var(--el-color-warning);
}

.agent-step__matches {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-step__match {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.agent-step__match-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.agent-step__match-en,
.agent-step__match-meta,
.agent-step__match-more {
  color: var(--el-text-color-secondary);
}

.agent-step__match-more {
  margin: 6px 0 0;
}

.agent-step__error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-danger);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-run__no-tools {
  margin: 0;
  padding-left: 34px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-run__reply {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agent-run__reply-text {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 10px;
  border-top-left-radius: 4px;
  background: var(--el-color-primary-light-9);
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-run__failure {
  margin-left: 34px;
  padding: 10px 12px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 10px;
  background: var(--el-color-danger-light-9);
}

.agent-run__failure-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.agent-run__failure-text {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-color-danger);
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-typing {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.agent-typing__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: agent-pulse 1s ease-in-out infinite;
}

@keyframes agent-pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.agent-composer {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.agent-composer :deep(.el-input) {
  flex: 1;
}

.agent-composer :deep(.el-input__wrapper) {
  border-radius: 8px;
}

.agent-composer :deep(.el-button) {
  border-radius: 8px;
}

/* ---------- 右侧审核面板 ---------- */

.review-panel__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.review-panel__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.review-panel__step {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.review-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.review-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.review-loading {
  flex: 1;
  min-height: 120px;
}

.review-tabs {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.review-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
}

.review-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
  overflow-y: auto;
}

.review-alert {
  margin: 12px 16px;
}

.review-error-text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.ingredient-form {
  padding-top: 4px;
}

.ingredient-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

.ingredient-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.field-with-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.field-with-tag :deep(.el-input),
.field-with-tag :deep(.el-select),
.field-with-tag :deep(.el-input-number) {
  flex: 1;
}

.field-control {
  width: 100%;
}

.field-control :deep(.el-input__wrapper) {
  width: 100%;
}

.review-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.profile-group {
  margin-bottom: 18px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
}

.profile-group__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.profile-group__source {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.profile-section + .profile-section {
  margin-top: 10px;
}

.profile-section__head {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.profile-rows {
  display: flex;
  flex-direction: column;
}

.profile-row {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) 86px 40px 52px minmax(60px, 1fr);
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  font-size: 12px;
}

.profile-row:last-child {
  border-bottom: none;
}

.profile-row__label {
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-row__input {
  width: 86px;
}

.profile-row__unit {
  color: var(--el-text-color-secondary);
  text-align: center;
}

.profile-row__status {
  justify-self: start;
}

.profile-row__source {
  color: var(--el-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-feedback {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 8px;
}

.review-blocking {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
}

.review-blocking__path {
  color: var(--el-text-color-secondary);
}

.review-commit-result {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.review-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
}

.review-footer__hint {
  flex: 1;
  min-width: 160px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 1200px) {
  .ai-agent-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-panel,
  .review-panel {
    height: 620px;
    max-height: 720px;
  }
}

@media (max-width: 900px) {
  .agent-panel,
  .review-panel {
    height: 560px;
  }

  .agent-panel__draft {
    max-width: 55%;
    text-align: right;
  }

  .ingredient-form__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
