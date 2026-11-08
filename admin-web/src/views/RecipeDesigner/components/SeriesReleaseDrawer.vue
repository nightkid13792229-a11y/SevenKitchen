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
          <div>
            <el-upload
              class="sr-cover-upload"
              :show-file-list="false"
              :before-upload="handleCoverUpload"
              :disabled="uploading"
              accept="image/jpeg,image/png,image/webp"
            >
              <div class="sr-cover" :class="{ 'is-empty': !readiness.presentation.coverImageUrl }">
                <img
                  v-if="readiness.presentation.coverImageUrl"
                  :src="readiness.presentation.coverImageUrl"
                  alt="封面图"
                />
                <span v-else class="sr-cover__empty">上传封面图</span>
                <span v-if="badgeText" class="sr-cover__badge">{{ badgeText }}</span>
                <span v-if="uploading" class="sr-cover__mask">上传中…</span>
              </div>
            </el-upload>
            <span v-if="editing" class="sr-link sr-cover__change">更换封面</span>
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

        <div v-if="editing" class="sr-edit">
          <div class="sr-edit__head">
            改完自动存成草稿，发布后才对顾客生效
            <span class="sr-edit__state">{{ draftSavedText }}</span>
          </div>

          <div class="sr-field">
            <label class="sr-field__label">食谱名称</label>
            <div class="sr-field__body">
              <el-input
                v-model="nameDraft"
                maxlength="12"
                show-word-limit
                placeholder="例如：均衡营养｜三文鱼南瓜"
                @change="saveName"
              />
              <div class="sr-hint">价值点在前、食材在后，最多 12 个字——多了标签印不下。</div>
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
          <el-button v-if="showPublish && isAdmin" type="success" :loading="publishing" :disabled="!readiness.canRelease || isTemporaryName" @click="handleRelease">
            {{ hasLive ? '发布这一版' : '上线这条产品线' }}
          </el-button>
          <el-button v-else @click="visible = false">关闭</el-button>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadProps } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { recipeApi } from '@/api/recipes'
import { recipeHealthTagApi, type RecipeHealthTag } from '@/api/recipeHealthTags'
import {
  RECIPE_PRESENTATION_LIMITS,
  validatePresentationCoverFile
} from '@/utils/recipeDesigner/presentation'
import { isTemporarySeriesName } from '@/utils/recipeDesigner/seriesName'
import { useIsAdmin } from '@/composables/useAdminRole'
import type {
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
const draftSaving = ref(false)
const draftSavedAt = ref<Date | null>(null)

const nameDraft = ref('')
const sellingDraft = ref('')
const badgeDraft = ref<string[]>([])

const healthTags = ref<RecipeHealthTag[]>([])
const healthTagsLoading = ref(false)

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

  const fields = (value.releaseDraft?.changedFields ?? []).filter(
    (field) => field !== 'taxonomy'
  )
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
  if (hasDraft.value && hasPendingStages.value) return '发布后顾客立即可见'
  if (hasDraft.value) return '发布后顾客立即可见'
  if (hasPendingStages.value) return '有新版本待上线，发布后顾客立即可见'
  return '没有待发布的内容，顾客看到的就是最新版'
})

/** 「已是最新」时唯一的主操作是关闭；有草稿 / 有新版本 / 未上线都要能发 */
const showPublish = computed(
  () => hasDraft.value || hasPendingStages.value || !hasLive.value
)
const canUnpublish = computed(() => hasLive.value)

const draftSavedText = computed(() => {
  if (draftSaving.value) return '保存中…'
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
    readiness.value = result
    nameDraft.value = result.name || props.seriesName || ''
    sellingDraft.value = result.presentation.sellingPoint ?? ''
    badgeDraft.value = result.presentation.coverBadges.length
      ? await resolveBadgeIds(result.presentation.coverBadges)
      : []
  } catch {
    error.value = '系列发布检查加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

/** 角标回传的是名称，编辑下拉要的是 id：按名称反查一次。 */
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

function toggleEditing(): void {
  editing.value = !editing.value
  if (editing.value) void loadHealthTags()
}

async function saveDraft(patch: Record<string, unknown>): Promise<void> {
  if (!props.seriesId || draftSaving.value) return
  draftSaving.value = true
  try {
    const result = await recipeDesignerApi.saveSeriesReleaseDraft(
      props.seriesId,
      patch as never
    )
    draftSavedAt.value = result.updatedAt ? new Date(result.updatedAt) : null
    // 保存会改变 canRelease / blockers（例如首次补齐封面卖点、或只剩资料草稿），
    // 必须重拉门槛，否则发布按钮会一直停在旧的禁用状态。
    const fresh = await recipeDesignerApi.getSeriesReleaseReadiness(props.seriesId)
    readiness.value = fresh
    emit('saved')
  } catch {
    ElMessage.error('草稿保存失败，请重试')
  } finally {
    draftSaving.value = false
  }
}

function saveName(): void {
  const next = nameDraft.value.trim()
  if (!next) {
    ElMessage.warning('食谱名称不能为空')
    nameDraft.value = readiness.value?.name ?? ''
    return
  }
  void saveDraft({ name: next })
}

function saveSellingPoint(): void {
  void saveDraft({ sellingPoint: sellingDraft.value })
}

function saveBadges(): void {
  void saveDraft({ badgeHealthTagIds: badgeDraft.value })
}

const handleCoverUpload: UploadProps['beforeUpload'] = async (file) => {
  const validation = validatePresentationCoverFile(file)
  if (validation) {
    ElMessage.error(validation)
    return false
  }
  uploading.value = true
  try {
    const result = await recipeApi.uploadImage(file)
    await saveDraft({ coverImageUrl: result.url })
    ElMessage.success('封面已存进草稿，发布后生效')
  } catch {
    ElMessage.error('封面图上传失败')
  } finally {
    uploading.value = false
  }
  return false
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
    const result = await recipeDesignerApi.releaseSeries(props.seriesId)
    ElMessage.success(
      result.releasedStageCodes.length > 0
        ? `已发布，覆盖 ${result.releasedStageCodes.length} 个阶段`
        : '发布设置已生效'
    )
    emit('released', result)
    visible.value = false
  } catch {
    ElMessage.error('发布失败，请按提示修正后重试')
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
  } catch {
    ElMessage.error('下架失败，请重试')
  } finally {
    unpublishing.value = false
  }
}

async function handleBeforeClose(done: () => void): Promise<void> {
  // 草稿是实时保存的，关闭不需要拦截
  done()
}

watch(
  () => [props.modelValue, props.seriesId] as const,
  ([open]) => {
    if (!open) {
      readiness.value = null
      editing.value = false
      draftSavedAt.value = null
      return
    }
    readiness.value = null
    editing.value = false
    draftSavedAt.value = null
    void loadReadiness()
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

.sr-field { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.sr-field:last-child { margin-bottom: 0; }
.sr-field__label { width: 72px; flex: none; font-size: 13px; color: #606266; line-height: 32px; }
.sr-field__body { flex: 1; min-width: 0; }
.sr-select { width: 100%; }
.sr-hint { margin-top: 4px; font-size: 12px; color: #909399; }

.sr-blank { display: flex; align-items: baseline; gap: 8px; font-size: 13px; color: #606266; }
.sr-blank__label { font-size: 12px; color: #909399; }
.sr-blank__sep { color: #dcdfe6; }
.sr-link { color: #409eff; font-size: 13px; cursor: pointer; }

.sr-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sr-foot__tip { font-size: 12px; color: #909399; }
.sr-foot__actions { display: flex; align-items: center; gap: 10px; }
</style>
