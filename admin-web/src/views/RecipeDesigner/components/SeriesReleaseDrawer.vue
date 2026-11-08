<template>
  <el-drawer
    v-model="visible"
    size="820px"
    destroy-on-close
    :before-close="handleBeforeClose"
  >
    <template #header>
      <div class="sr-head">
        <div class="sr-head__text">
          <span class="sr-head__title">产品线发布</span>
          <span class="sr-head__sub">{{ headSubtitle }}</span>
        </div>
        <el-tag v-if="loading" size="small" type="info" effect="dark">检查中…</el-tag>
        <el-tag v-else-if="readiness" size="small" :type="statePill.type" effect="plain">
          {{ statePill.label }}
        </el-tag>
        <el-tag v-else-if="error" size="small" type="danger" effect="dark">检查失败</el-tag>
      </div>
    </template>

    <div v-if="loading && !readiness" class="sr-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else-if="error && !readiness" class="sr-error">
      <el-alert type="error" :closable="false" show-icon title="发布检查加载失败" :description="error" />
      <el-button type="primary" :loading="loading" @click="loadReadiness">重试</el-button>
    </div>

    <div v-else-if="readiness" v-loading="loading" class="sr">
      <!-- 差什么：只在真有问题时出现，一行说清 -->
      <div v-if="readiness.blockers.length" class="sr-notice">
        <el-icon class="sr-notice__icon"><WarningFilled /></el-icon>
        <span>还差 {{ readiness.blockers.length }} 项：<b>{{ blockerText }}</b></span>
        <span class="sr-link" @click="editing = true">去填写</span>
      </div>

      <div v-if="isTemporaryName" class="sr-notice">
        <el-icon class="sr-notice__icon"><WarningFilled /></el-icon>
        <span>还是临时名称，不能发布：先改成正式名称（最多 12 个字）</span>
        <span class="sr-link" @click="editing = true">去改名</span>
      </div>

      <!-- 这次会上线什么 -->
      <section v-if="changeRows.length" class="sr-sec">
        <h3 class="sr-sec__title">{{ hasLive ? '这次发布会改变顾客看到的内容' : '这次上线包含什么' }}</h3>
        <div v-for="row in changeRows" :key="row.label" class="sr-chg">
          <span class="sr-chg__label">{{ row.label }}</span>
          <span class="sr-chg__text">{{ row.text }}</span>
        </div>
      </section>

      <!-- 顾客会看到的样子 -->
      <section class="sr-sec">
        <div class="sr-sec__head">
          <h3 class="sr-sec__title">顾客会看到的样子</h3>
          <span class="sr-link" @click="toggleEditing">{{ editing ? '收起编辑' : '编辑资料' }}</span>
        </div>

        <div class="sr-look">
          <div class="series-release__cover">
            <el-upload
              class="sr-cover-upload"
              :show-file-list="false"
              :before-upload="handleCoverUpload"
              :disabled="uploading || aiCoverGenerating"
              accept="image/jpeg,image/png,image/webp"
            >
              <div class="sr-cover" :class="{ 'is-empty': !form.coverImageUrl }">
                <img
                  v-if="form.coverImageUrl"
                  :src="form.coverImageUrl"
                  alt="封面图"
                  @click.stop="openCoverPreview(form.coverImageUrl)"
                />
                <span v-else class="sr-cover__empty">上传封面图</span>
                <span v-if="badgeText" class="sr-cover__badge">{{ badgeText }}</span>
                <span v-if="uploading || aiCoverGenerating" class="sr-cover__mask">
                  {{ aiCoverGenerating ? 'AI 正在生成 3 张候选…（约 40–70 秒）' : '上传中…' }}
                </span>
              </div>
            </el-upload>
            <el-upload
              v-if="form.coverImageUrl"
              :show-file-list="false"
              :before-upload="handleCoverUpload"
              :disabled="uploading || aiCoverGenerating"
              accept="image/jpeg,image/png,image/webp"
            >
              <span class="sr-link sr-cover__change">更换封面</span>
            </el-upload>
            <div v-if="isAdmin" class="series-release__ai-cover-actions">
              <el-button
                size="small"
                :loading="aiCoverGenerating"
                :disabled="aiCoverGenerating || !!aiCoverUnavailableReason"
                @click="handleGenerateAiCover"
              >
                {{ aiCoverButtonLabel }}
              </el-button>
            </div>
            <span v-if="aiCoverHint" class="sr-hint">{{ aiCoverHint }}</span>
          </div>
          <div class="sr-look__info">
            <div class="sr-look__name">{{ effectiveName }}</div>
            <div class="sr-look__selling" :class="{ 'is-empty': !readiness.presentation.sellingPoint }">
              {{ readiness.presentation.sellingPoint || '还没有填写一句话卖点' }}
            </div>
            <div v-if="readiness.presentation.coverBadges.length" class="sr-look__badges">
              <el-tag
                v-for="badge in readiness.presentation.coverBadges"
                :key="badge"
                size="small"
                type="primary"
                effect="plain"
              >
                {{ badge }}
              </el-tag>
            </div>
          </div>
        </div>

        <div v-if="aiCoverCandidates.length > 0" class="series-release__ai-preview">
          <div class="series-release__ai-candidates">
            <div
              v-for="candidate in aiCoverCandidates"
              :key="candidate.url"
              class="series-release__ai-candidate"
              :class="{ 'is-active': aiCoverSelectedUrl === candidate.url }"
              @click="aiCoverSelectedUrl = candidate.url"
            >
              <img
                :src="candidate.url"
                alt="AI 生成封面候选"
                class="series-release__ai-candidate-image"
                @click.stop="openCoverPreview(candidate.url)"
              />
              <span class="series-release__ai-candidate-label">
                {{ candidate.presetLabel }}
                <template v-if="candidate.skeletonLabel"> · {{ candidate.skeletonLabel }}</template>
              </span>
            </div>
          </div>
          <div class="series-release__ai-preview-actions">
            <el-button
              size="small"
              type="primary"
              :disabled="!aiCoverSelectedUrl"
              @click="applyAiCoverPreview"
            >用这张</el-button>
            <el-button size="small" @click="discardAiCoverPreview">都不要</el-button>
          </div>
          <span class="sr-hint">点「用这张」会存进发布草稿，发布后才替换顾客看到的封面；没选中的会自动丢弃。</span>
        </div>
        <div v-if="aiCoverError" class="series-release__ai-error">
          <span>{{ aiCoverError }}</span>
          <el-button link type="primary" @click="handleGenerateAiCover">重试</el-button>
        </div>

        <div v-if="editing" class="sr-edit">
          <div class="sr-edit__head">
            改完自动存成草稿，发布后才对顾客生效
            <span class="sr-edit__state">{{ draftSavedText }}</span>
          </div>

          <el-alert
            v-if="draftSaveError"
            class="sr-edit__error"
            type="error"
            :closable="false"
            show-icon
            :title="draftSaveError"
          />

          <div class="sr-field">
            <label class="sr-field__label">食谱名称</label>
            <div class="sr-field__body">
              <AiNameField
                v-model="nameDraft"
                :series-id="seriesId"
                :persist-name="persistNameDraft"
                @saved="onNameAdopted"
              />
              <div class="sr-hint">价值点在前、食材在后，最多 12 个字——多了标签印不下。</div>
            </div>
          </div>

          <div class="sr-field">
            <label class="sr-field__label">需求分类</label>
            <div class="sr-field__body">
              <QuickTaxonomyPicker
                :series-id="seriesId"
                :show-title="false"
                :persist-links="persistTaxonomyDraft"
                @saved="refreshReadiness"
              />
              <div class="sr-hint">归类先存进发布草稿，点「发布这一版」后才进货架分组。</div>
            </div>
          </div>

          <div class="sr-field">
            <label class="sr-field__label">一句话卖点</label>
            <div class="sr-field__body">
              <el-input
                v-model="sellingDraft"
                type="textarea"
                :rows="2"
                :maxlength="RECIPE_PRESENTATION_LIMITS.sellingPoint"
                show-word-limit
                placeholder="例如：鲜肉低敏，日常维持"
                @change="saveSellingPoint"
              />
            </div>
          </div>

          <div class="sr-field">
            <label class="sr-field__label">封面角标</label>
            <div class="sr-field__body">
              <el-select
                v-model="badgeDraft"
                multiple
                :multiple-limit="2"
                filterable
                clearable
                collapse-tags
                collapse-tags-tooltip
                :loading="healthTagsLoading"
                placeholder="从合规词表选择（最多 2 个）"
                class="sr-select"
                @change="saveBadges"
              >
                <el-option
                  v-for="tag in eligibleHealthTags"
                  :key="tag.id"
                  :label="tag.name"
                  :value="tag.id"
                />
              </el-select>
              <div class="sr-hint">不选就不显示；封面左下角会空着。</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 还没设计的阶段：一行，点名字直接去设计 -->
      <div v-if="blankStages.length" class="sr-blank">
        <span class="sr-blank__label">还没设计</span>
        <template v-for="(stage, index) in blankStages" :key="stage.stageCode">
          <span v-if="index > 0" class="sr-blank__sep">·</span>
          <span class="sr-link" @click="openStageDesigner(stage)">{{ stage.label }}</span>
        </template>
      </div>
    </div>

    <template #footer>
      <div v-if="readiness" class="sr-foot">
        <span class="sr-foot__tip">{{ footerTip }}</span>
        <div class="sr-foot__actions">
          <el-button v-if="canUnpublish && isAdmin" type="danger" text :loading="unpublishing" @click="handleUnpublish">
            下架整个系列
          </el-button>
          <el-button v-if="showPublish && isAdmin" type="success" :loading="publishing" :disabled="!readiness.canRelease" @click="handleRelease">
            {{ hasLive ? '发布这一版' : '上线这条产品线' }}
          </el-button>
          <el-button v-else @click="visible = false">关闭</el-button>
        </div>
      </div>
    </template>

    <!-- 点封面缩略图看大图（含 AI 候选） -->
    <el-dialog v-model="coverPreviewVisible" title="封面图预览" width="720px" append-to-body>
      <img
        v-if="coverPreviewUrl"
        :src="coverPreviewUrl"
        alt="封面图大图"
        class="series-release__cover-preview-large"
      />
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadProps } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import { nutritionGovernanceApi } from '@/api/nutritionGovernance'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { recipeApi } from '@/api/recipes'
import { recipeHealthTagApi, type RecipeHealthTag } from '@/api/recipeHealthTags'
import {
  RECIPE_PRESENTATION_LIMITS,
  validatePresentationCoverFile
} from '@/utils/recipeDesigner/presentation'
import {
  SERIES_AI_COVER_TIMEOUT_MESSAGE,
  resolveSeriesAiCoverButtonLabel,
  resolveSeriesAiCoverHint,
  resolveSeriesAiCoverUnavailableReason,
  type SeriesAiCoverContext
} from '@/utils/recipeDesigner/seriesAiCover'
import { isTemporarySeriesName } from '@/utils/recipeDesigner/seriesName'
import { getApiErrorMessage } from '@/utils/apiError'
import { useIsAdmin } from '@/composables/useAdminRole'
import AiNameField from './AiNameField.vue'
import QuickTaxonomyPicker from './QuickTaxonomyPicker.vue'
import type {
  AiCoverCandidate,
  SeriesReleaseDraftField,
  SeriesReleaseReadiness,
  SeriesReleaseResult
} from '@/types/recipeDesigner'

const props = defineProps<{
  modelValue: boolean
  seriesId: string
  seriesName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'released', result: SeriesReleaseResult): void
  (e: 'updated', result: unknown): void
  (e: 'saved'): void
  /** 去设计某个还没做的阶段：交给列表页复用它的进编辑器逻辑 */
  (e: 'design-stage', stageCode: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const isAdmin = useIsAdmin()
const readiness = ref<SeriesReleaseReadiness | null>(null)
const loading = ref(false)
const error = ref('')

const editing = ref(false)
const uploading = ref(false)
const publishing = ref(false)
const unpublishing = ref(false)

/**
 * 草稿保存队列（2026-11-08 审核修复）。
 *
 * 之前 `draftSaving` 为真时直接 return，连点保存会静默丢掉后一次输入；
 * 现在改成一串 patch 排队 / 合并，最后一个字段值一定写得进去。
 */
interface QueuedDraftSave {
  seriesId: string
  patch: Record<string, unknown>
  resolve: () => void
  reject: (reason?: unknown) => void
}
const saveQueue: QueuedDraftSave[] = []
let saveLoop: Promise<void> | null = null
const draftSaving = ref(false)
const draftSaveError = ref('')
const draftSavedAt = ref<Date | null>(null)
/**
 * 乐观锁基线：打开抽屉 / 上次保存拿到的 `releaseDraft.updatedAt`。
 * 与数据库对不上时后端 409，避免两个人同时改互相覆盖。
 */
const expectedUpdatedAt = ref<string | null>(null)

const nameDraft = ref('')
const sellingDraft = ref('')
const badgeDraft = ref<string[]>([])

const healthTags = ref<RecipeHealthTag[]>([])
const healthTagsLoading = ref(false)

/** AI 系列封面（2026-11-08 恢复，采用后写发布草稿） */
const aiCoverAvailable = ref<boolean | null>(null)
const aiCoverGenerating = ref(false)
const aiCoverCandidates = ref<AiCoverCandidate[]>([])
const aiCoverSelectedUrl = ref('')
const aiCoverError = ref('')
let aiCoverRequestSeq = 0
/** 本次会话里上传 / 采用、但还没被发布固化的封面，换掉时要回收 */
const pendingCoverUrl = ref('')
const pendingCoverReason = ref<'PREVIEW_DISCARDED' | 'UPLOAD_DISCARDED'>(
  'PREVIEW_DISCARDED'
)

/** 点封面缩略图看大图：主封面 / AI 候选共用同一个弹窗 */
const coverPreviewUrl = ref('')
const coverPreviewVisible = computed({
  get: () => Boolean(coverPreviewUrl.value),
  set: (visible: boolean) => {
    if (!visible) coverPreviewUrl.value = ''
  }
})

/** 展示资料的只读快照：模板里统一从这取，避免各处散着读 readiness */
const form = computed(() => ({
  coverImageUrl: readiness.value?.presentation.coverImageUrl ?? ''
}))

const DRAFT_FIELD_LABELS: Record<SeriesReleaseDraftField, string> = {
  name: '食谱名称',
  coverImageUrl: '封面图',
  coverTitle: '封面标题',
  sellingPoint: '一句话卖点',
  targetHealthTags: '健康标签',
  coverBadges: '封面角标',
  taxonomy: '需求分类'
}

const hasLive = computed(() => readiness.value?.businessStatus === 'PUBLIC')
const hasDraft = computed(() => readiness.value?.releaseDraft?.exists === true)
/** 有待上线 / 待更新的配方版本（只有新版本、没改资料时也要能发） */
const actionableCount = computed(
  () => readiness.value?.stages.filter((stage) => stage.actionable).length ?? 0
)
const hasPendingStages = computed(() => actionableCount.value > 0)

const effectiveName = computed(
  () => readiness.value?.name || props.seriesName || '未命名系列'
)

const isTemporaryName = computed(() => isTemporarySeriesName(effectiveName.value))

const nameChanged = computed(
  () => readiness.value?.releaseDraft?.changedFields.includes('name') === true
)

const headSubtitle = computed(() => {
  const parts = [effectiveName.value]
  if (nameChanged.value) parts.push('名称已改，发布后生效')
  const at = readiness.value?.releaseDraft?.updatedAt
  if (at) parts.push(`草稿已保存 ${formatTime(at)}`)
  return parts.join(' · ')
})

const statePill = computed<{ label: string; type: 'info' | 'success' | 'warning' }>(() => {
  const value = readiness.value
  if (!value) return { label: '未就绪', type: 'info' }
  if (value.blockers.length > 0) return { label: '还不能发布', type: 'warning' }
  if (!hasLive.value) return { label: '未上线', type: 'info' }
  if (hasDraft.value) return { label: '有草稿待发布', type: 'warning' }
  if (hasPendingStages.value) return { label: '有新版本待发布', type: 'warning' }
  return { label: '已是最新', type: 'success' }
})

/** 这次发布会改变什么：展示资料按字段、配方按阶段。 */
const changeRows = computed(() => {
  const value = readiness.value
  if (!value) return [] as Array<{ label: string; text: string }>
  const rows: Array<{ label: string; text: string }> = []

  const fields = value.releaseDraft?.changedFields ?? []
  const fieldText = fields.map((field) => DRAFT_FIELD_LABELS[field] ?? field).join(' · ')
  if (fieldText) rows.push({ label: '展示资料', text: fieldText })

  const stages = value.stages.filter((stage) => stage.actionable)
  if (stages.length > 0) {
    const text = stages
      .map((stage) => {
        if (stage.status === 'READY') {
          return `${stage.label} 新增 v${stage.latestRecipeVersion ?? 1}`
        }
        return `${stage.label} v${stage.publishedRecipeVersion ?? '-'} → v${stage.latestRecipeVersion ?? '-'}`
      })
      .join(' · ')
    rows.push({ label: '配方版本', text })
  }
  return rows
})

const blankStages = computed(() =>
  (readiness.value?.stages ?? []).filter(
    (stage) => stage.status === 'EMPTY' || stage.status === 'DRAFT'
  )
)

const badgeText = computed(() => (readiness.value?.presentation.coverBadges ?? []).join(' · '))

const blockerText = computed(() =>
  (readiness.value?.blockers ?? []).map((blocker) => blocker.message).join('；')
)

const footerTip = computed(() => {
  const value = readiness.value
  if (!value) return ''
  if (value.blockers.length > 0) return '补齐后才能发布'
  if (!hasLive.value) return '上线后顾客就能在货架上看到'
  if (hasDraft.value || hasPendingStages.value) return '发布后顾客立即可见'
  return '没有待发布的内容，顾客看到的就是最新版'
})

/** 「已是最新」时唯一的主操作是关闭；有草稿 / 有新版本 / 未上线都要能发 */
const showPublish = computed(
  () => hasDraft.value || hasPendingStages.value || !hasLive.value
)
const canUnpublish = computed(() => hasLive.value)

const draftSavedText = computed(() => {
  if (draftSaving.value) return '保存中…'
  if (draftSaveError.value) return '保存失败，见上方提示'
  const at =
    draftSavedAt.value ??
    (readiness.value?.releaseDraft?.updatedAt
      ? new Date(readiness.value.releaseDraft.updatedAt)
      : null)
  return at ? `已自动保存 ${formatTime(at)}` : '改动会先存成草稿'
})

const eligibleHealthTags = computed(() =>
  healthTags.value.filter((tag) => tag.coverBadgeEligible === true)
)

/** AI 封面按钮状态：生成中不阻断其它字段保存，只避免两个写封面的动作打架 */
const aiCoverContext = computed<SeriesAiCoverContext>(() => ({
  isAdmin: isAdmin.value,
  available: aiCoverAvailable.value,
  generating: aiCoverGenerating.value,
  busy: uploading.value || publishing.value || unpublishing.value,
  savedSeriesName: nameDraft.value || readiness.value?.name || '',
  hasCover: Boolean(form.value.coverImageUrl),
  isLive: hasLive.value
}))
const aiCoverUnavailableReason = computed(() =>
  resolveSeriesAiCoverUnavailableReason(aiCoverContext.value)
)
const aiCoverHint = computed(() =>
  resolveSeriesAiCoverHint(aiCoverContext.value)
)
const aiCoverButtonLabel = computed(() =>
  resolveSeriesAiCoverButtonLabel(
    aiCoverContext.value.hasCover,
    aiCoverGenerating.value
  )
)

function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function loadReadiness(): Promise<void> {
  if (!props.seriesId) {
    error.value = '缺少系列 id，无法检查发布条件'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result = await recipeDesignerApi.getSeriesReleaseReadiness(props.seriesId)
    applyReadiness(result)
    nameDraft.value = result.name || props.seriesName || ''
    sellingDraft.value = result.presentation.sellingPoint ?? ''
    badgeDraft.value = result.presentation.coverBadgeIds?.length
      ? [...result.presentation.coverBadgeIds]
      : await resolveBadgeIds(result.presentation.coverBadges)
  } catch {
    error.value = '系列发布检查加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

/**
 * 只刷新门槛与乐观锁基线，不动正在编辑的输入框。
 * 保存后必须重拉：首次补齐封面卖点、只改资料草稿等都会改变 canRelease。
 */
async function refreshReadiness(): Promise<void> {
  if (!props.seriesId) return
  const fresh = await recipeDesignerApi.getSeriesReleaseReadiness(props.seriesId)
  applyReadiness(fresh)
}

function applyReadiness(result: SeriesReleaseReadiness): void {
  readiness.value = result
  expectedUpdatedAt.value = result.releaseDraft.updatedAt
}

/** 角标回传的是名称（旧后端没有 id）：按名称反查一次。 */
async function resolveBadgeIds(names: string[]): Promise<string[]> {
  await loadHealthTags()
  return eligibleHealthTags.value
    .filter((tag) => names.includes(tag.name))
    .map((tag) => tag.id)
}

async function loadHealthTags(): Promise<void> {
  if (healthTags.value.length > 0) return
  healthTagsLoading.value = true
  try {
    const tags = await recipeHealthTagApi.list()
    healthTags.value = Array.isArray(tags) ? tags : []
  } catch {
    healthTags.value = []
  } finally {
    healthTagsLoading.value = false
  }
}

/**
 * 草稿保存串行队列：同一时间的多个 patch 合并成一次请求（后写覆盖先写），
 * 保存中再点保存也不会丢字段。
 */
function enqueueDraftPatch(patch: Record<string, unknown>): Promise<void> {
  if (!props.seriesId) return Promise.reject(new Error('缺少系列 id'))
  return new Promise((resolve, reject) => {
    saveQueue.push({ seriesId: props.seriesId, patch, resolve, reject })
    void startSaveLoop()
  })
}

function startSaveLoop(): Promise<void> {
  if (saveLoop) return saveLoop
  saveLoop = (async () => {
    draftSaving.value = true
    while (saveQueue.length > 0) {
      const batch = saveQueue.splice(0, saveQueue.length)
      const targetSeriesId = batch[0]?.seriesId ?? props.seriesId
      const current = batch.filter((item) => item.seriesId === targetSeriesId)
      const rest = batch.filter((item) => item.seriesId !== targetSeriesId)
      if (rest.length > 0) saveQueue.unshift(...rest)

      const mergedPatch: Record<string, unknown> = {}
      for (const item of current) Object.assign(mergedPatch, item.patch)

      try {
        const result = await recipeDesignerApi.saveSeriesReleaseDraft(
          targetSeriesId,
          {
            ...mergedPatch,
            expectedUpdatedAt: expectedUpdatedAt.value
          } as never
        )
        if (targetSeriesId === props.seriesId) {
          expectedUpdatedAt.value = result.updatedAt ?? null
          draftSavedAt.value = result.updatedAt ? new Date(result.updatedAt) : null
          draftSaveError.value = ''
          // 保存会改变 canRelease / blockers，必须重拉门槛，否则按钮停在旧状态
          const fresh = await recipeDesignerApi.getSeriesReleaseReadiness(targetSeriesId)
          if (targetSeriesId === props.seriesId) {
            applyReadiness(fresh)
            emit('saved')
          }
        }
        for (const item of current) item.resolve()
      } catch (saveError) {
        const conflict =
          (saveError as { response?: { status?: number } })?.response?.status === 409
        const message = conflict
          ? '发布草稿刚被其他人改过，已刷新成最新版本，请检查后重新保存'
          : getApiErrorMessage(saveError, '草稿保存失败，请重试')
        draftSaveError.value = message
        ElMessage.error(message)
        if (conflict && targetSeriesId === props.seriesId) {
          try {
            await refreshReadiness()
          } catch {
            // 刷新失败不掩盖原来的 409 提示
          }
        }
        for (const item of current) item.reject(saveError)
      }
    }
  })().finally(() => {
    saveLoop = null
    draftSaving.value = false
  })
  return saveLoop
}

/** 发布前必须等保存队列落地：否则最后一笔改动不在草稿里，发布会漏掉。 */
async function flushDraftSaves(): Promise<void> {
  while (saveLoop || saveQueue.length > 0) {
    await startSaveLoop()
  }
  if (draftSaveError.value) {
    throw new Error(draftSaveError.value)
  }
}

function toggleEditing(): void {
  editing.value = !editing.value
  if (editing.value) {
    void loadHealthTags()
    void loadAiCoverAvailability()
  }
}

/** AI 起名：采用 / 失焦都写发布草稿，随发布生效 */
async function persistNameDraft(name: string): Promise<void> {
  await enqueueDraftPatch({ name })
}

/** 快速归类也走同一个保存队列，避免和名字/卖点并发时把乐观锁基线冲掉 */
async function persistTaxonomyDraft(
  links: Array<{ kindId: string; nodeId: string }>
): Promise<void> {
  await enqueueDraftPatch({ taxonomy: links })
}

function onNameAdopted(name: string): void {
  nameDraft.value = name
  emit('saved')
  void refreshReadiness().catch(() => undefined)
}

function saveSellingPoint(): void {
  void enqueueDraftPatch({ sellingPoint: sellingDraft.value }).catch(
    () => undefined
  )
}

function saveBadges(): void {
  void enqueueDraftPatch({ badgeHealthTagIds: [...badgeDraft.value] }).catch(
    () => undefined
  )
}

/**
 * 上传封面：先拿 URL，再等草稿保存真正成功才提示「已存进草稿」。
 * 保存失败时把刚上传的图回收，避免 COS 里留孤儿。
 */
const handleCoverUpload: UploadProps['beforeUpload'] = async (file) => {
  const validation = validatePresentationCoverFile(file)
  if (validation) {
    ElMessage.error(validation)
    return false
  }
  uploading.value = true
  try {
    const result = await recipeApi.uploadImage(file)
    try {
      await enqueueDraftPatch({ coverImageUrl: result.url })
    } catch {
      /**
       * 保存失败时**不**回收刚上传的图：请求可能已经在服务端成功、只是
       * 响应没回来，贸然回收会让草稿指向一张已删除的图。宁可留一张孤儿图，
       * 也不能把草稿弄坏；用户重试保存即可。
       */
      return false
    }
    const previous = pendingCoverUrl.value
    if (
      previous &&
      previous !== result.url &&
      previous !== readiness.value?.presentation.coverImageUrl
    ) {
      void recipeDesignerApi
        .discardAiCoverPreview(previous, pendingCoverReason.value)
        .catch(() => undefined)
    }
    pendingCoverUrl.value = result.url
    pendingCoverReason.value = 'UPLOAD_DISCARDED'
    ElMessage.success('封面已存进草稿，发布后生效')
  } catch (uploadError) {
    if (!(uploadError as { __apiErrorToasted?: boolean })?.__apiErrorToasted) {
      ElMessage.error(getApiErrorMessage(uploadError, '封面图上传失败'))
    }
  } finally {
    uploading.value = false
  }
  return false
}

/**
 * AI 生图能不能用（2026-10-27）。
 * 查失败按「不可用」处理，不弹错 —— 入口不该因为一次查询失败就报红。
 */
async function loadAiCoverAvailability(): Promise<void> {
  if (!isAdmin.value) {
    aiCoverAvailable.value = null
    return
  }
  try {
    const config = await nutritionGovernanceApi.getRecipeCoverConfig()
    aiCoverAvailable.value = Boolean(config?.ready)
  } catch {
    aiCoverAvailable.value = false
  }
}

/**
 * AI 生成系列封面（一次 3 张）：只出候选，点「用这张」才写进发布草稿。
 * 失败 / 超时保留原封面，只记错误 + 提供重试，不自动重试。
 */
async function handleGenerateAiCover(): Promise<void> {
  if (!props.seriesId || aiCoverGenerating.value) return
  if (aiCoverUnavailableReason.value) return

  if (form.value.coverImageUrl) {
    try {
      await ElMessageBox.confirm(
        '重新生成需要再调用一次 AI（一次 3 张，约 0.6 元）。生成后挑一张，点「用这张」才会替换当前封面。继续？',
        '重新生成封面',
        {
          type: 'warning',
          confirmButtonText: '继续生成',
          cancelButtonText: '取消'
        }
      )
    } catch {
      return
    }
  }

  if (aiCoverCandidates.value.length > 0) {
    discardAiCoverPreview()
  }
  const seq = ++aiCoverRequestSeq
  aiCoverGenerating.value = true
  aiCoverError.value = ''
  try {
    const result = await recipeDesignerApi.generateSeriesAiCover(
      props.seriesId,
      3
    )
    if (seq !== aiCoverRequestSeq) return
    aiCoverCandidates.value =
      result.candidates && result.candidates.length > 0
        ? result.candidates
        : [
            {
              url: result.url,
              preset: '',
              presetLabel: '默认',
              skeleton: '',
              skeletonLabel: ''
            }
          ]
    aiCoverSelectedUrl.value = aiCoverCandidates.value[0]?.url ?? ''
    ElMessage.success('已生成 3 张候选，挑一张再采用')
  } catch (error: any) {
    if (seq !== aiCoverRequestSeq) return
    // 全局拦截器已经弹过一次；这里只保留可回看的红字
    aiCoverError.value =
      error?.code === 'ECONNABORTED'
        ? SERIES_AI_COVER_TIMEOUT_MESSAGE
        : `AI 生成失败：${getApiErrorMessage(error, '请点重试')}`
  } finally {
    if (seq === aiCoverRequestSeq) {
      aiCoverGenerating.value = false
    }
  }
}

/** 丢弃全部候选：未采用的图进回收站，不留孤儿 */
function discardAiCoverPreview(): void {
  const urls = aiCoverCandidates.value.map((item) => item.url)
  aiCoverCandidates.value = []
  aiCoverSelectedUrl.value = ''
  for (const url of urls) {
    void recipeDesignerApi
      .discardAiCoverPreview(url, 'PREVIEW_DISCARDED')
      .catch(() => undefined)
  }
}

/** 用选中的候选替换草稿封面；没选中的候选直接回收。 */
async function applyAiCoverPreview(): Promise<void> {
  const chosen = aiCoverSelectedUrl.value
  if (!chosen) return
  try {
    await enqueueDraftPatch({ coverImageUrl: chosen })
  } catch {
    // 保存失败：候选保留，方便直接重试
    return
  }
  for (const candidate of aiCoverCandidates.value) {
    if (candidate.url === chosen) continue
    void recipeDesignerApi
      .discardAiCoverPreview(candidate.url, 'PREVIEW_DISCARDED')
      .catch(() => undefined)
  }
  pendingCoverUrl.value = chosen
  pendingCoverReason.value = 'PREVIEW_DISCARDED'
  aiCoverCandidates.value = []
  aiCoverSelectedUrl.value = ''
  aiCoverError.value = ''
  ElMessage.success('封面已存进发布草稿，发布后生效')
}

function openCoverPreview(url?: string | null): void {
  const target = String(url ?? '').trim()
  if (!target) return
  coverPreviewUrl.value = target
}

function openStageDesigner(stage: { stageCode: string }): void {
  visible.value = false
  emit('design-stage', stage.stageCode)
}

async function handleRelease(): Promise<void> {
  const value = readiness.value
  if (!value || publishing.value) return
  const lines = changeRows.value.map((row) => `${row.label}：${row.text}`)
  try {
    await ElMessageBox.confirm(
      `${lines.join('\n')}\n\n发布后顾客立刻看到，这一版不能撤回；改错只能再发一版。`,
      '发布这一版？',
      { type: 'warning', confirmButtonText: '确认发布', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  publishing.value = true
  try {
    // 发布前把排队中的草稿全部写完：最后一笔改动也必须进这一版
    try {
      await flushDraftSaves()
    } catch {
      ElMessage.error('还有草稿没保存成功，先按提示重试保存再发布')
      return
    }
    const result = await recipeDesignerApi.releaseSeries(props.seriesId, {
      expectedDraftUpdatedAt: expectedUpdatedAt.value
    })
    ElMessage.success(
      result.releasedStageCodes.length > 0
        ? `已发布，覆盖 ${result.releasedStageCodes.length} 个阶段`
        : '发布设置已生效'
    )
    emit('released', result)
    visible.value = false
  } catch (releaseError) {
    const conflict =
      (releaseError as { response?: { status?: number } })?.response?.status === 409
    ElMessage.error(
      conflict
        ? '草稿刚被其他人改过，已阻止发布；请关闭抽屉重新打开确认最新内容'
        : getApiErrorMessage(releaseError, '发布失败，请按提示修正后重试')
    )
    if (conflict) {
      try {
        await refreshReadiness()
      } catch {
        // 保留原 409 提示
      }
    }
  } finally {
    publishing.value = false
  }
}

async function handleUnpublish(): Promise<void> {
  if (!props.seriesId || unpublishing.value) return
  try {
    await ElMessageBox.confirm(
      `下架后顾客立即看不到「${props.seriesName || '这条产品线'}」，所有已发布阶段变回草稿；设计稿和历史版本都会保留。确定下架吗？`,
      '下架整个系列',
      { type: 'warning', confirmButtonText: '确认下架', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  unpublishing.value = true
  try {
    const result = await recipeDesignerApi.unpublishSeries(props.seriesId)
    ElMessage.success('系列已下架')
    emit('updated', result)
    await loadReadiness()
  } catch (unpublishError) {
    ElMessage.error(getApiErrorMessage(unpublishError, '下架失败，请重试'))
  } finally {
    unpublishing.value = false
  }
}

async function handleBeforeClose(done: () => void): Promise<void> {
  // 草稿是实时保存的，关闭不需要拦截；但排队中的保存要等它落地再关
  try {
    await flushDraftSaves()
  } catch {
    // 保存失败：明确告诉管理员关闭会丢哪一次修改，由他决定
    try {
      await ElMessageBox.confirm(
        '有草稿没保存成功，关闭会丢失这次的修改。建议先重试保存；确定要关闭吗？',
        '草稿还没保存成功',
        {
          type: 'warning',
          confirmButtonText: '放弃修改并关闭',
          cancelButtonText: '继续编辑'
        }
      )
    } catch {
      return
    }
  }
  done()
}

watch(
  () => [props.modelValue, props.seriesId] as const,
  ([open]) => {
    // AI 封面的状态只在「当前这一次打开 / 这个系列」内有效：
    // 关闭、重新打开、切换系列都要清掉旧预览 / 旧错误。
    aiCoverRequestSeq += 1
    aiCoverGenerating.value = false
    if (aiCoverCandidates.value.length > 0) {
      for (const candidate of aiCoverCandidates.value) {
        void recipeDesignerApi
          .discardAiCoverPreview(candidate.url, 'PREVIEW_DISCARDED')
          .catch(() => undefined)
      }
    }
    aiCoverCandidates.value = []
    aiCoverSelectedUrl.value = ''
    aiCoverError.value = ''
    aiCoverAvailable.value = null
    coverPreviewUrl.value = ''
    pendingCoverUrl.value = ''

    if (!open) {
      readiness.value = null
      editing.value = false
      draftSavedAt.value = null
      draftSaveError.value = ''
      expectedUpdatedAt.value = null
      loading.value = false
      error.value = ''
      return
    }
    readiness.value = null
    editing.value = false
    draftSavedAt.value = null
    draftSaveError.value = ''
    expectedUpdatedAt.value = null
    error.value = ''
    void loadReadiness()
    if (isAdmin.value) void loadAiCoverAvailability()
  },
  { immediate: true }
)

defineExpose({ loadReadiness })
</script>

<style scoped>
.sr-head { display: flex; align-items: center; gap: 12px; }
.sr-head__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.sr-head__title { font-size: 16px; font-weight: 600; color: #303133; }
.sr-head__sub { font-size: 12px; color: #909399; }
.sr-loading { padding: 12px 0; }
.sr-error { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.sr { display: flex; flex-direction: column; gap: 18px; }

.sr-notice {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 8px;
  background: #fdf6ec; border: 1px solid #f5dab1;
  font-size: 13px; color: #303133;
}
.sr-notice__icon { color: #e6a23c; }

.sr-sec { display: flex; flex-direction: column; gap: 10px; }
.sr-sec__head { display: flex; align-items: center; justify-content: space-between; }
.sr-sec__title { margin: 0; font-size: 14px; font-weight: 600; color: #303133; }

.sr-chg { display: flex; align-items: baseline; gap: 10px; font-size: 13px; line-height: 1.6; }
.sr-chg__label { width: 64px; flex: none; font-size: 12px; color: #909399; }
.sr-chg__text { color: #303133; }

.sr-look { display: flex; align-items: flex-start; gap: 16px; padding: 12px; border-radius: 8px; background: #fafafa; }
.sr-cover-upload :deep(.el-upload) { display: block; }
.sr-cover {
  position: relative; width: 176px; height: 99px; border-radius: 8px;
  overflow: hidden; background: #f0f2f5; cursor: pointer;
}
.sr-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sr-cover__empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: #a8abb2; }
.sr-cover__badge {
  position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px);
  padding: 2px 6px; border-radius: 4px; background: rgba(0, 0, 0, .55);
  color: #fff; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sr-cover__mask { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, .45); color: #fff; font-size: 12px; }
.sr-cover__change { display: inline-block; margin-top: 8px; }

.sr-look__info { min-width: 0; padding-top: 2px; }
.sr-look__name { font-size: 15px; font-weight: 600; color: #303133; }
.sr-look__selling { margin-top: 6px; font-size: 13px; color: #606266; }
.sr-look__selling.is-empty { color: #c0c4cc; }
.sr-look__badges { margin-top: 8px; display: flex; gap: 6px; }

.sr-edit { margin-top: 12px; padding: 14px; border: 1px solid #ebeef5; border-radius: 8px; background: #fafafa; }
.sr-edit__head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #909399; margin-bottom: 12px; }
.sr-edit__state { color: #b1b3b8; }
.sr-edit__error { margin-bottom: 12px; }

.sr-field { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.sr-field:last-child { margin-bottom: 0; }
.sr-field__label { width: 72px; flex: none; font-size: 13px; color: #606266; line-height: 32px; }
.sr-field__body { flex: 1; min-width: 0; }
.sr-select { width: 100%; }
.sr-hint { margin-top: 4px; font-size: 12px; color: #909399; display: block; }

.sr-blank { display: flex; align-items: baseline; gap: 8px; font-size: 13px; color: #606266; }
.sr-blank__label { font-size: 12px; color: #909399; }
.sr-blank__sep { color: #dcdfe6; }
.sr-link { color: #409eff; font-size: 13px; cursor: pointer; }

.sr-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sr-foot__tip { font-size: 12px; color: #909399; }
.sr-foot__actions { display: flex; align-items: center; gap: 10px; }

.series-release__ai-cover-actions { margin-top: 8px; }
.series-release__ai-preview {
  margin-top: 12px; padding: 12px; border: 1px solid #dbe6ff;
  background: #f7f9ff; border-radius: 8px;
}
.series-release__ai-candidates { display: flex; gap: 10px; flex-wrap: wrap; }
.series-release__ai-candidate {
  width: 176px; padding: 6px; border: 2px solid transparent; border-radius: 8px;
  background: #fff; cursor: pointer;
}
.series-release__ai-candidate.is-active { border-color: #409eff; }
.series-release__ai-candidate-image {
  width: 160px; height: 90px; object-fit: cover; border-radius: 6px; display: block;
}
.series-release__ai-candidate-label { display: block; margin-top: 4px; font-size: 11px; color: #606266; }
.series-release__ai-preview-actions { display: flex; gap: 8px; margin-top: 10px; }
.series-release__ai-error {
  display: flex; align-items: center; gap: 10px; margin-top: 8px;
  font-size: 12px; color: #f56c6c;
}
.series-release__cover-preview-large { width: 100%; border-radius: 8px; display: block; }
</style>
