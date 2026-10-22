<template>
  <el-drawer
    v-model="visible"
    size="880px"
    destroy-on-close
    :before-close="handleBeforeClose"
  >
    <template #header>
      <div class="series-release__heading">
        <div class="series-release__heading-text">
          <span class="series-release__title">系列发布</span>
          <span class="series-release__subtitle">
            {{ seriesName || '产品线' }} · 整条系列一次性发布
          </span>
        </div>
        <el-tag v-if="loading" size="small" type="info" effect="dark">
          检查中…
        </el-tag>
        <el-tag
          v-else-if="readiness"
          size="small"
          :type="readiness.ready ? 'success' : 'danger'"
          effect="dark"
        >
          {{ readiness.ready ? '可发布' : '未就绪' }}
        </el-tag>
        <el-tag v-else-if="error" size="small" type="danger" effect="dark">
          检查失败
        </el-tag>
      </div>
    </template>

    <div class="series-release">
      <div class="series-release__toolbar">
        <div class="series-release__meta">
          <el-tag size="small" effect="plain">产品线</el-tag>
          <span class="series-release__series-id">系列 {{ seriesId || '—' }}</span>
          <span v-if="readiness" class="series-release__latest">
            最新版本 {{ latestVersion }}
          </span>
        </div>
        <el-button
          size="small"
          :icon="Refresh"
          :loading="loading"
          :disabled="!seriesId"
          @click="refreshReadiness"
        >
          刷新检查
        </el-button>
      </div>

      <el-alert
        class="series-release__mode-note"
        type="info"
        :closable="false"
        show-icon
        title="阶段设计先保存进系列仓库；只有整条系列发布后，顾客才看得到"
      />

      <div v-if="!readiness && !error" class="series-release__loading">
        <el-skeleton :rows="8" animated />
      </div>

      <div v-else-if="error && !readiness" class="series-release__error">
        <el-alert
          type="error"
          :closable="false"
          show-icon
          title="系列发布检查加载失败"
          :description="error"
        />
        <el-button type="primary" :loading="loading" @click="loadReadiness(true)">
          重试
        </el-button>
      </div>

      <div
        v-else-if="readiness"
        v-loading="loading"
        class="series-release__content"
      >
        <div
          class="series-release__overview"
          :class="{
            'is-ready': readiness.ready,
            'is-blocked': !readiness.ready
          }"
        >
          <el-icon class="series-release__overview-icon">
            <CircleCheckFilled v-if="readiness.ready" />
            <CircleCloseFilled v-else />
          </el-icon>
          <div class="series-release__overview-text">
            <div class="series-release__overview-title">
              {{ readiness.ready ? '满足发布条件' : '还不能发布' }}
            </div>
            <div class="series-release__overview-sub">
              必填阶段 {{ progress.label }} · 已发布
              {{ readiness.summary.publishedStageCount }} 个阶段 · 阻断
              {{ readiness.blockers.length }} 项 · 提醒
              {{ readiness.warnings.length }} 项
            </div>
            <el-progress
              class="series-release__progress"
              :percentage="progress.percent"
              :status="progressStatus"
              :stroke-width="8"
            />
          </div>
        </div>

        <section class="series-release__section">
          <div class="series-release__section-title">
            阶段清单
            <span class="series-release__count">{{ progress.label }}</span>
          </div>
          <el-checkbox-group
            v-model="form.requiredLifeStages"
            class="series-release__stages"
          >
            <div
              v-for="stage in readiness.stages"
              :key="stage.stageCode"
              class="series-release__stage"
              :class="{
                'is-required': form.requiredLifeStages.includes(stage.stageCode),
                'is-ready': stage.status === 'READY' || stage.status === 'PUBLIC'
              }"
            >
              <el-checkbox
                :value="stage.stageCode"
                class="series-release__stage-check"
              >
                必填
              </el-checkbox>
              <div class="series-release__stage-main">
                <div class="series-release__stage-name">
                  {{ stage.label }}
                  <el-tag
                    v-if="form.requiredLifeStages.includes(stage.stageCode)"
                    size="small"
                    type="primary"
                    effect="plain"
                  >必填</el-tag>
                </div>
                <div class="series-release__stage-hint">
                  {{ seriesReleaseStageHint(stage) }}
                </div>
              </div>
              <el-tag
                :type="seriesReleaseStageTagType(stage.status)"
                size="small"
                effect="plain"
                :title="stage.status"
              >
                {{ seriesReleaseStageStatusLabel(stage.status) }}
              </el-tag>
              <span class="series-release__stage-version">
                最新 {{ formatSeriesReleaseStageVersion(stage) }}
              </span>
            </div>
          </el-checkbox-group>
          <div class="series-release__hint">
            勾选必须一起发布的阶段；只有达到「待发布」或「已发布」的阶段才算就绪。
            未勾选但已经保存进系列仓库的阶段也会一并发布，避免留下顾客看不到的隐藏草稿。
          </div>
        </section>

        <section class="series-release__section">
          <div class="series-release__section-title">发布设置</div>
          <el-form
            label-width="112px"
            label-position="left"
            class="series-release__form"
          >
            <el-form-item label="封面图" required>
              <div class="series-release__cover">
                <el-upload
                  class="series-release__cover-upload"
                  :show-file-list="false"
                  :before-upload="handleCoverUpload"
                  accept="image/jpeg,image/png,image/webp"
                >
                  <div
                    class="series-release__cover-box"
                    :class="{ 'is-empty': !form.coverImageUrl }"
                  >
                    <img
                      v-if="form.coverImageUrl"
                      :src="form.coverImageUrl"
                      alt="系列封面图预览"
                    />
                    <div v-else class="series-release__cover-placeholder">
                      <el-icon><Plus /></el-icon>
                      <span>上传封面图</span>
                    </div>
                    <div v-if="uploading" class="series-release__cover-mask">
                      上传中…
                    </div>
                  </div>
                </el-upload>
                <div class="series-release__cover-side">
                  <el-button
                    v-if="form.coverImageUrl"
                    link
                    type="danger"
                    @click="form.coverImageUrl = ''"
                  >移除封面</el-button>
                  <span class="series-release__hint">
                    建议 16:9 横图，JPG / PNG / WebP，不超过 5MB。
                    发布时会复制到每条阶段食谱。
                  </span>
                </div>
              </div>
            </el-form-item>

            <el-form-item label="封面标题" required>
              <el-input
                v-model="form.coverTitle"
                :maxlength="RECIPE_PRESENTATION_LIMITS.coverTitle"
                show-word-limit
                placeholder="上线后显示在封面上的标题"
              />
            </el-form-item>

            <el-form-item label="一句话卖点" required>
              <el-input
                v-model="form.sellingPoint"
                type="textarea"
                :rows="2"
                :maxlength="RECIPE_PRESENTATION_LIMITS.sellingPoint"
                show-word-limit
                placeholder="例如：鲜肉低敏，日常维持"
              />
            </el-form-item>

            <el-form-item label="目标健康标签">
              <el-select
                v-model="form.targetHealthTags"
                multiple
                filterable
                clearable
                collapse-tags
                collapse-tags-tooltip
                :loading="healthTagsLoading"
                placeholder="选择顾客可筛选的健康标签（可多选）"
                class="series-release__select"
              >
                <el-option
                  v-for="tag in healthTags"
                  :key="tag.id"
                  :label="tag.name"
                  :value="tag.id"
                />
              </el-select>
              <div v-if="healthTagsError" class="series-release__inline-error">
                {{ healthTagsError }}
                <el-button link type="primary" @click="loadHealthTags">
                  重新加载
                </el-button>
              </div>
              <div v-else class="series-release__hint">
                未设置仍可发布，但顾客无法按健康需求筛选到这条产品线。
              </div>
            </el-form-item>
          </el-form>

          <div class="series-release__save-row">
            <span
              class="series-release__save-state"
              :class="{ 'is-dirty': dirty }"
            >
              {{ dirty ? '有未保存的发布设置' : '发布设置已保存' }}
            </span>
            <el-button
              type="primary"
              :loading="saving"
              :disabled="saving || uploading || !dirty"
              @click="saveSettings"
            >
              保存发布设置
            </el-button>
          </div>
        </section>

        <section class="series-release__section">
          <div class="series-release__section-title">
            阻断项
            <span class="series-release__count">
              {{ readiness.blockers.length }}
            </span>
          </div>
          <div v-if="blockerGroups.length" class="series-release__groups">
            <div
              v-for="group in blockerGroups"
              :key="`blocker-group-${group.scope}`"
              class="series-release__group"
            >
              <div class="series-release__group-title">
                <el-tag size="small" effect="plain">{{ group.label }}</el-tag>
                <span>{{ group.issues.length }} 项</span>
              </div>
              <div
                v-for="(blocker, index) in group.issues"
                :key="`${blocker.code}-${blocker.stageCode || index}`"
                class="series-release__issue series-release__issue--blocker"
              >
                <el-icon class="series-release__issue-icon">
                  <CircleCloseFilled />
                </el-icon>
                <span class="series-release__issue-message">
                  {{ blocker.message }}
                </span>
                <el-tag
                  v-if="blocker.stageCode"
                  size="small"
                  type="info"
                  effect="plain"
                >{{ stageLabel(blocker.stageCode) }}</el-tag>
                <span class="series-release__code">{{ blocker.code }}</span>
              </div>
            </div>
          </div>
          <div v-else class="series-release__clear">
            <el-icon class="is-success"><CircleCheckFilled /></el-icon>
            没有阻断项
          </div>
        </section>

        <section class="series-release__section">
          <div class="series-release__section-title">
            提醒项
            <span class="series-release__count">
              {{ readiness.warnings.length }}
            </span>
          </div>
          <div v-if="warningGroups.length" class="series-release__groups">
            <div
              v-for="group in warningGroups"
              :key="`warning-group-${group.scope}`"
              class="series-release__group"
            >
              <div class="series-release__group-title">
                <el-tag size="small" type="warning" effect="plain">
                  {{ group.label }}
                </el-tag>
                <span>{{ group.issues.length }} 项</span>
              </div>
              <div
                v-for="(warning, index) in group.issues"
                :key="`${warning.code}-${warning.stageCode || index}`"
                class="series-release__issue series-release__issue--warning"
              >
                <el-icon class="series-release__issue-icon">
                  <WarningFilled />
                </el-icon>
                <span class="series-release__issue-message">
                  {{ warning.message }}
                </span>
                <el-tag
                  v-if="warning.stageCode"
                  size="small"
                  type="info"
                  effect="plain"
                >{{ stageLabel(warning.stageCode) }}</el-tag>
                <span class="series-release__code">{{ warning.code }}</span>
              </div>
            </div>
          </div>
          <div v-else class="series-release__clear">
            <el-icon class="is-success"><CircleCheckFilled /></el-icon>
            没有提醒项
          </div>
        </section>

        <p class="series-release__footer-note">
          检查的是服务器上已保存的版本；保存设置后会自动刷新，也可以手动点「刷新检查」。
        </p>
      </div>
    </div>

    <template #footer>
      <div v-if="readiness" class="series-release__footer">
        <span class="series-release__footer-text">
          <template v-if="!isAdmin">{{ ADMIN_ONLY_TIP }}</template>
          <template v-else-if="dirty">
            发布设置还有未保存的修改，请先点「保存发布设置」
          </template>
          <template v-else-if="!readiness.ready">
            还有 {{ readiness.blockers.length }} 项阻断，全部解决后才能发布整条产品线
          </template>
          <template v-else>
            发布后顾客即可看到整条产品线，共
            {{ readiness.summary.readyStageCount }} 个必填阶段就绪
          </template>
        </span>
        <el-button
          v-if="isAdmin && readiness.ready"
          type="success"
          :loading="releasing"
          :disabled="dirty"
          @click="handleRelease"
        >
          发布整条产品线
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadProps } from 'element-plus'
import {
  CircleCheckFilled,
  CircleCloseFilled,
  Plus,
  Refresh,
  WarningFilled
} from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { recipeApi } from '@/api/recipes'
import {
  recipeHealthTagApi,
  type RecipeHealthTag
} from '@/api/recipeHealthTags'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import {
  RECIPE_PRESENTATION_LIMITS,
  validatePresentationCoverFile
} from '@/utils/recipeDesigner/presentation'
import {
  buildSeriesReleaseForm,
  buildSeriesReleaseSettingsPatch,
  cloneSeriesReleaseForm,
  emptySeriesReleaseForm,
  formatSeriesReleaseLatestVersion,
  formatSeriesReleaseStageVersion,
  groupSeriesReleaseIssues,
  hasSeriesReleaseSettingsPatch,
  isSeriesReleaseFormDirty,
  seriesReleaseProgress,
  seriesReleaseStageHint,
  seriesReleaseStageStatusLabel,
  seriesReleaseStageTagType,
  type SeriesReleaseForm
} from '@/utils/recipeDesigner/seriesRelease'
import type {
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
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const isAdmin = useIsAdmin()

const readiness = ref<SeriesReleaseReadiness | null>(null)
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const releasing = ref(false)
const error = ref('')

const healthTags = ref<RecipeHealthTag[]>([])
const healthTagsLoading = ref(false)
const healthTagsError = ref('')

const form = reactive<SeriesReleaseForm>(emptySeriesReleaseForm())
const baseline = ref<SeriesReleaseForm>(emptySeriesReleaseForm())

/** 只认最后一次请求，避免关闭 / 重复刷新时的旧响应覆盖新状态 */
let requestSeq = 0
let healthTagsRequestSeq = 0
/** 表单是否已用服务器结果初始化；手动刷新检查时不覆盖未保存编辑 */
let formHydrated = false

const dirty = computed(() =>
  isSeriesReleaseFormDirty(form, baseline.value)
)

const progress = computed(() => seriesReleaseProgress(readiness.value))

const progressStatus = computed<'success' | undefined>(() =>
  readiness.value?.ready ? 'success' : undefined
)

const latestVersion = computed(() =>
  formatSeriesReleaseLatestVersion(readiness.value)
)

const blockerGroups = computed(() =>
  groupSeriesReleaseIssues(readiness.value?.blockers ?? [])
)

const warningGroups = computed(() =>
  groupSeriesReleaseIssues(readiness.value?.warnings ?? [])
)

const stageByCode = computed(
  () =>
    new Map(
      (readiness.value?.stages ?? []).map((stage) => [
        stage.stageCode,
        stage
      ])
    )
)

function stageLabel(stageCode: string): string {
  return stageByCode.value.get(stageCode)?.label || stageCode
}

function resetForm(): void {
  Object.assign(form, emptySeriesReleaseForm())
  baseline.value = emptySeriesReleaseForm()
  formHydrated = false
}

function hydrateForm(result: SeriesReleaseReadiness): void {
  const initial = buildSeriesReleaseForm(result)
  Object.assign(form, initial)
  baseline.value = cloneSeriesReleaseForm(initial)
  formHydrated = true
}

async function loadReadiness(hydrate = true): Promise<void> {
  if (!props.seriesId) {
    readiness.value = null
    error.value = '缺少系列 id，无法检查发布条件'
    return
  }

  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  try {
    const result = await recipeDesignerApi.getSeriesReleaseReadiness(
      props.seriesId
    )
    if (seq !== requestSeq) return
    readiness.value = result
    // 首次打开 / 保存成功后用服务器结果覆盖表单；
    // 手动刷新时如果还有未保存编辑，只刷新检查结果，不吞掉用户输入。
    if (hydrate || !formHydrated) {
      hydrateForm(result)
    }
  } catch {
    if (seq !== requestSeq) return
    // 错误提示已由 API 拦截器统一弹出，这里保留可重试的内联状态
    readiness.value = null
    error.value = '系列发布检查加载失败，请稍后重试'
  } finally {
    if (seq === requestSeq) {
      loading.value = false
    }
  }
}

async function loadHealthTags(): Promise<void> {
  const seq = ++healthTagsRequestSeq
  healthTagsLoading.value = true
  healthTagsError.value = ''
  try {
    const tags = await recipeHealthTagApi.list()
    if (seq !== healthTagsRequestSeq) return
    healthTags.value = Array.isArray(tags) ? tags : []
  } catch {
    if (seq !== healthTagsRequestSeq) return
    healthTagsError.value = '健康标签加载失败'
  } finally {
    if (seq === healthTagsRequestSeq) {
      healthTagsLoading.value = false
    }
  }
}

function refreshReadiness(): void {
  void loadReadiness(!dirty.value)
}

/**
 * 复用食谱管理的图片上传接口；上传只拿到 URL，点「保存发布设置」后才落库。
 * 返回 false 阻止 el-upload 自己再发一次请求。
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
    form.coverImageUrl = result.url
    ElMessage.success('封面图上传成功，保存发布设置后生效')
  } catch (uploadError: any) {
    if (!uploadError?.__apiErrorToasted) {
      ElMessage.error(uploadError?.message || '封面图上传失败')
    }
  } finally {
    uploading.value = false
  }
  return false
}

async function saveSettings(): Promise<void> {
  if (!props.seriesId || saving.value) return

  const patch = buildSeriesReleaseSettingsPatch(form, baseline.value)
  if (!hasSeriesReleaseSettingsPatch(patch)) {
    ElMessage.info('发布设置没有修改')
    return
  }

  const submitted = cloneSeriesReleaseForm(form)
  saving.value = true
  try {
    await recipeDesignerApi.updateSeriesReleaseSettings(props.seriesId, patch)
    baseline.value = submitted
    ElMessage.success('发布设置已保存，检查已刷新')
    // 门槛由后端按最新设置重新计算，保存后必须重拉，不能沿用旧阻断项
    await loadReadiness(true)
  } catch {
    // 错误提示由 API 拦截器统一处理；表单保持脏状态，方便直接重试
  } finally {
    saving.value = false
  }
}

async function handleRelease(): Promise<void> {
  if (!isAdmin.value) {
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }
  if (!readiness.value?.ready || releasing.value) return
  if (dirty.value) {
    ElMessage.warning('发布设置还有未保存的修改，请先保存')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将把「${props.seriesName || readiness.value.seriesId}」的全部阶段食谱一次性发布给顾客，发布后立即生效。确定发布吗？`,
      '发布整条产品线',
      {
        type: 'warning',
        confirmButtonText: '发布',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  releasing.value = true
  try {
    const result = await recipeDesignerApi.releaseSeries(props.seriesId)
    ElMessage.success(
      `产品线已发布，共更新 ${result.updatedRecipeCount} 条阶段食谱`
    )
    emit('released', result)
    visible.value = false
  } catch {
    // 错误提示由 API 拦截器统一处理；抽屉保持打开，方便按提示修正
  } finally {
    releasing.value = false
  }
}

async function handleBeforeClose(done: () => void): Promise<void> {
  if (!dirty.value) {
    done()
    return
  }

  try {
    await ElMessageBox.confirm(
      '发布设置还有未保存的修改，关闭会丢失这些修改。确定关闭吗？',
      '有未保存的修改',
      {
        type: 'warning',
        confirmButtonText: '放弃修改并关闭',
        cancelButtonText: '继续编辑'
      }
    )
    done()
  } catch {
    // 留在抽屉里继续编辑
  }
}

watch(
  () => [props.modelValue, props.seriesId] as const,
  ([open, seriesId]) => {
    if (!open) {
      // 关闭后到达的响应不再写回，避免下次打开先闪一眼旧结果
      requestSeq += 1
      healthTagsRequestSeq += 1
      loading.value = false
      saving.value = false
      uploading.value = false
      error.value = ''
      return
    }

    readiness.value = null
    error.value = ''
    resetForm()
    if (!seriesId) {
      error.value = '缺少系列 id，无法检查发布条件'
      return
    }
    void loadReadiness(true)
    void loadHealthTags()
  },
  { immediate: true }
)
</script>

<style scoped>
.series-release__heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.series-release__heading-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.series-release__title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.series-release__subtitle {
  font-size: 12px;
  color: #909399;
}

.series-release {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.series-release__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.series-release__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #909399;
  min-width: 0;
}

.series-release__latest {
  color: #606266;
}

.series-release__mode-note {
  margin: 0;
}

.series-release__loading {
  padding: 12px 0;
}

.series-release__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.series-release__content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 120px;
}

.series-release__overview {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  background: #f5f7fa;
}

.series-release__overview.is-ready {
  border-color: #b3e19d;
  background: #f0f9eb;
}

.series-release__overview.is-blocked {
  border-color: #f3d19e;
  background: #fdf6ec;
}

.series-release__overview-icon {
  font-size: 26px;
  color: #e6a23c;
  flex-shrink: 0;
}

.series-release__overview.is-ready .series-release__overview-icon {
  color: #67c23a;
}

.series-release__overview-text {
  flex: 1;
  min-width: 0;
}

.series-release__overview-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.series-release__overview-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}

.series-release__progress {
  margin-top: 8px;
  max-width: 520px;
}

.series-release__section {
  border-top: 1px solid #ebeef5;
  padding-top: 14px;
}

.series-release__section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.series-release__count {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.series-release__stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.series-release__stage {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.series-release__stage.is-required {
  border-color: #b3d8ff;
  background: #f4f9ff;
}

.series-release__stage.is-ready {
  border-left: 3px solid #67c23a;
}

.series-release__stage-check {
  flex-shrink: 0;
}

.series-release__stage-check :deep(.el-checkbox__label) {
  font-size: 12px;
  color: #606266;
}

.series-release__stage-main {
  flex: 1;
  min-width: 0;
}

.series-release__stage-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.series-release__stage-hint {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.series-release__stage-version {
  flex-shrink: 0;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

.series-release__hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.series-release__form :deep(.el-form-item__label) {
  font-size: 13px;
  color: #606266;
}

.series-release__form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.series-release__cover {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.series-release__cover-upload {
  flex-shrink: 0;
}

.series-release__cover-box {
  position: relative;
  width: 208px;
  height: 117px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
  cursor: pointer;
}

.series-release__cover-box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.series-release__cover-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  color: #909399;
  font-size: 12px;
}

.series-release__cover-placeholder .el-icon {
  font-size: 22px;
}

.series-release__cover-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
}

.series-release__cover-side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding-top: 4px;
}

.series-release__select {
  width: 100%;
}

.series-release__inline-error {
  font-size: 12px;
  line-height: 1.6;
  color: #f56c6c;
}

.series-release__save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 6px;
}

.series-release__save-state {
  font-size: 12px;
  color: #909399;
}

.series-release__save-state.is-dirty {
  color: #e6a23c;
}

.series-release__groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.series-release__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.series-release__group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}

.series-release__issue {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
}

.series-release__issue--blocker {
  background: #fef0f0;
  color: #f56c6c;
}

.series-release__issue--warning {
  background: #fdf6ec;
  color: #e6a23c;
}

.series-release__issue-icon {
  margin-top: 2px;
  flex-shrink: 0;
}

.series-release__issue-message {
  flex: 1;
  min-width: 0;
}

.series-release__code {
  flex-shrink: 0;
  font-size: 11px;
  color: #c0c4cc;
}

.series-release__clear {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
}

.series-release__clear .is-success {
  color: #67c23a;
}

.series-release__footer-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.series-release__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.series-release__footer-text {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
</style>
