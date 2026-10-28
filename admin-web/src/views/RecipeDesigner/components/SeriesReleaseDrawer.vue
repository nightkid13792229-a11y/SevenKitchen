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
          <span class="series-release__title">发布 / 更新</span>
          <span class="series-release__subtitle">
            {{ seriesName || '产品线' }} · 整条系列一次性发布
          </span>
        </div>
        <el-tag v-if="loading" size="small" type="info" effect="dark">
          检查中…
        </el-tag>
        <template v-else-if="readiness">
          <el-tag size="small" :type="releaseStateTagType" effect="dark">
            {{ releaseStateLabel }}
          </el-tag>
          <el-tag size="small" :type="availabilityTag.type" effect="dark">
            {{ availabilityTag.label }}
          </el-tag>
        </template>
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
            'is-ready': readiness.canRelease,
            'is-blocked': !readiness.canRelease
          }"
        >
          <el-icon class="series-release__overview-icon">
            <CircleCheckFilled v-if="readiness.canRelease" />
            <CircleCloseFilled v-else />
          </el-icon>
          <div class="series-release__overview-text">
            <div class="series-release__overview-title">
              <el-tag
                size="small"
                :type="releaseStateTagType"
                effect="dark"
                class="series-release__state-tag"
              >
                {{ releaseStateLabel }}
              </el-tag>
              <span>
                {{ readiness.canRelease ? '满足发布条件' : '还不能发布' }}
              </span>
            </div>
            <div class="series-release__overview-sub">
              {{ progress.label }}
              <template v-if="pendingStageCount > 0">
                · 待更新 {{ pendingStageCount }} 个阶段
              </template>
              · 阻断 {{ readiness.blockers.length }} 项 · 提醒
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
            发布范围
            <span class="series-release__count">{{ progress.label }}</span>
            <span
              v-if="pendingStageCount > 0"
              class="series-release__count series-release__count--pending"
            >
              待更新 {{ pendingStageCount }} 个阶段
            </span>
            <template v-if="!isFirstRelease && actionableStageCodes.length > 0">
              <el-button
                link
                type="primary"
                size="small"
                @click="selectAllActionableStages"
              >全选</el-button>
              <el-button
                link
                type="primary"
                size="small"
                @click="clearSelectedStages"
              >清空</el-button>
            </template>
          </div>
          <el-checkbox-group
            v-model="selectedStageCodes"
            class="series-release__stages"
          >
            <div
              v-for="stage in readiness.stages"
              :key="stage.stageCode"
              class="series-release__stage"
              :class="{
                'is-selected':
                  !isFirstRelease &&
                  selectedStageCodes.includes(stage.stageCode),
                'is-actionable': !isFirstRelease && stage.actionable,
                'is-inactive': stage.status === 'DRAFT' || stage.status === 'EMPTY',
                'is-pending': isSeriesReleaseStagePendingUpdate(stage)
              }"
            >
              <el-checkbox
                v-if="!isFirstRelease && stage.actionable"
                :value="stage.stageCode"
                class="series-release__stage-check"
                :title="`勾选后本次更新「${stage.label}」`"
              />
              <div class="series-release__stage-main">
                <div class="series-release__stage-name">
                  {{ stage.label }}
                </div>
                <div
                  v-if="stage.status !== 'EMPTY'"
                  class="series-release__stage-hint"
                >
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
              <span class="series-release__stage-scope">
                {{ seriesReleaseStageScopeLabel(stage) }}
              </span>
              <span
                v-if="stage.status !== 'EMPTY'"
                class="series-release__stage-version"
              >
                {{ formatSeriesReleaseStageVersion(stage) }}
              </span>
            </div>
          </el-checkbox-group>
          <div class="series-release__range-note">
            发布后覆盖
            {{ coverageStageCount }} / {{ readiness.summary.totalStageCount }}
            个阶段；未设计阶段不影响发布。
            <template v-if="isFirstRelease">
              本次发布范围是已经就绪（待发布）的
              {{ readiness.summary.publishableStageCount }} 个阶段；只要有 1 个就绪就能发布，不要求全部阶段齐全。
            </template>
            <template v-else>
              默认勾选全部可操作阶段（待发布 + 有更新）；未勾选的「有更新」阶段会保留到下次，未入库 / 未设计不影响发布。
            </template>
          </div>
          <div class="series-release__hint">
            「有更新」表示已上线阶段存在更新的草稿，勾选后会一起更新给顾客；「已是最新」「未入库」「未设计」只作覆盖参考，不会阻断发布。
          </div>
        </section>

        <section class="series-release__section">
          <div class="series-release__section-title">发布设置</div>
          <el-form
            label-width="112px"
            label-position="left"
            class="series-release__form"
          >
            <el-alert
              v-if="isTemporaryName"
              class="series-release__temp-name"
              type="warning"
              :closable="false"
              show-icon
              title="还是临时名称，不能发布"
              description="先把上面改成正式名称（例如「均衡营养｜三文鱼南瓜」），改完离开输入框就会自动保存。"
            />

            <!-- 2026-10-27：系列名是唯一名字，整系列发布前必须定下来 -->
            <el-form-item label="食谱名称" required>
              <div class="series-release__name-row">
                <AiNameField
                  v-model="nameDraft"
                  :series-id="seriesId"
                  @saved="onNameAdopted"
                />
              </div>
              <div class="series-release__hint">
                价值点在前、食材在后，最多 12 个字——多了标签印不下。
              </div>
            </el-form-item>

            <el-form-item label="封面图" required>
              <div class="series-release__cover">
                <el-upload
                  class="series-release__cover-upload"
                  :show-file-list="false"
                  :before-upload="handleCoverUpload"
                  :disabled="uploading || aiCoverGenerating"
                  accept="image/jpeg,image/png,image/webp"
                >
                  <div
                    class="series-release__cover-box"
                    :class="{ 'is-empty': !form.coverImageUrl }"
                  >
                    <div
                      v-if="form.coverImageUrl"
                      class="series-release__cover-preview"
                      @click.stop="openCoverPreview(form.coverImageUrl)"
                    >
                      <img
                        :src="form.coverImageUrl"
                        alt="系列封面图预览"
                      />
                      <span class="series-release__cover-zoom">
                        点击看大图
                      </span>
                    </div>
                    <div v-else class="series-release__cover-placeholder">
                      <el-icon><Plus /></el-icon>
                      <span>上传封面图</span>
                    </div>
                    <div
                      v-if="uploading || aiCoverGenerating"
                      class="series-release__cover-mask"
                    >
                      {{
                        aiCoverGenerating
                          ? 'AI 正在生成封面…（约 20–40 秒）'
                          : '上传中…'
                      }}
                    </div>
                  </div>
                </el-upload>
                <div class="series-release__cover-side">
                  <div v-if="isAdmin" class="series-release__ai-cover-actions">
                    <el-button
                      size="small"
                      :loading="aiCoverGenerating"
                      :disabled="
                        aiCoverGenerating || !!aiCoverUnavailableReason
                      "
                      @click="handleGenerateAiCover"
                    >
                      {{ aiCoverButtonLabel }}
                    </el-button>
                  </div>
                  <div
                    v-if="form.coverImageUrl"
                    class="series-release__cover-actions"
                  >
                    <el-upload
                      :show-file-list="false"
                      :before-upload="handleCoverUpload"
                      :disabled="uploading || aiCoverGenerating"
                      accept="image/jpeg,image/png,image/webp"
                    >
                      <el-button
                        link
                        type="primary"
                        :disabled="uploading || aiCoverGenerating"
                      >更换封面</el-button>
                    </el-upload>
                    <el-button
                      link
                      type="danger"
                      :disabled="aiCoverGenerating || uploading"
                      @click="form.coverImageUrl = ''"
                    >移除封面</el-button>
                  </div>
                  <span v-if="aiCoverHint" class="series-release__hint">
                    {{ aiCoverHint }}
                  </span>
                  <span class="series-release__hint">
                    建议 16:9 横图，JPG / PNG / WebP，不超过 5MB。
                    发布时会复制到每条阶段食谱。
                  </span>
                </div>
              </div>
              <div v-if="aiCoverPreviewUrl" class="series-release__ai-preview">
                <img
                  :src="aiCoverPreviewUrl"
                  alt="AI 生成封面预览"
                  class="series-release__ai-preview-image"
                  @click="openCoverPreview(aiCoverPreviewUrl)"
                />
                <div class="series-release__ai-preview-actions">
                  <el-button
                    size="small"
                    type="primary"
                    @click="applyAiCoverPreview"
                  >用这张</el-button>
                  <el-button
                    size="small"
                    @click="discardAiCoverPreview"
                  >不要</el-button>
                </div>
                <span class="series-release__hint">
                  点「用这张」后，还要点「保存发布设置」才会生效。
                </span>
              </div>
              <div v-if="aiCoverError" class="series-release__ai-error">
                <span>{{ aiCoverError }}</span>
                <el-button
                  link
                  type="primary"
                  @click="handleGenerateAiCover"
                >重试</el-button>
              </div>
            </el-form-item>

            <el-form-item label="封面角标">
              <el-select
                v-model="form.coverBadgeHealthTagIds"
                multiple
                :multiple-limit="2"
                filterable
                clearable
                collapse-tags
                collapse-tags-tooltip
                :loading="healthTagsLoading"
                placeholder="从合规词表选择（最多 2 个）"
                class="series-release__select"
              >
                <el-option
                  v-for="tag in eligibleHealthTags"
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
              <div
                v-else-if="hiddenBadgeNames.length > 0"
                class="series-release__hint series-release__hint--warning"
              >
                旧角标「{{ hiddenBadgeNames.join('、') }}」已隐藏；重新选择合规角标并保存后会替换。
              </div>
              <div v-else class="series-release__hint">
                最多 2 个；不选就不显示。未设置角标时，封面左下角将没有文字。
              </div>
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
          </el-form>

          <div class="series-release__save-row">
            <span
              class="series-release__save-state"
              :class="{ 'is-dirty': dirty }"
            >
              {{ dirty ? '有未保存的发布设置' : '发布设置已保存' }}
            </span>
            <span class="series-release__save-tip">
              保存后立即对已上线阶段生效，无需再点发布。
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
          <div class="series-release__section-title">顾客看到的样子</div>
          <div class="series-release__preview">
            <div class="series-release__preview-cover">
              <img
                v-if="form.coverImageUrl"
                :src="form.coverImageUrl"
                alt="顾客看到的系列封面"
                class="series-release__preview-cover-image"
                @click="openCoverPreview(form.coverImageUrl)"
              />
              <div v-else class="series-release__preview-placeholder">
                封面图
              </div>
              <span
                v-if="coverBadgeText"
                class="series-release__preview-badge"
              >{{ coverBadgeText }}</span>
            </div>
            <div class="series-release__preview-info">
              <div class="series-release__preview-name">
                {{ seriesName || '未命名系列' }}
              </div>
              <div class="series-release__preview-selling">
                {{ form.sellingPoint || '还没有填写一句话卖点' }}
              </div>
            </div>
          </div>
          <div class="series-release__hint">
            预览用当前表单实时渲染；角标只显示选中的项，没选就不显示，不回退旧封面标题。
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
          <template v-else-if="readiness.blockers.length > 0">
            还有 {{ readiness.blockers.length }} 项阻断，全部解决后才能发布 / 更新
          </template>
          <template v-else-if="releaseStageCount === 0">
            <template
              v-if="actionableStageCodes.length === 0 && releaseState === 'PUBLISHED'"
            >
              系列已上线，所有阶段都是最新版本，无需重新发布
            </template>
            <template v-else-if="actionableStageCodes.length === 0">
              还没有可发布的阶段
            </template>
            <template v-else>请至少勾选一个要更新的阶段</template>
          </template>
          <template v-else-if="pendingStageCount > 0">
            有 {{ pendingStageCount }} 个阶段存在更新草稿，更新后顾客才能看到最新版本
          </template>
          <template v-else>
            将{{ actionVerb }} {{ releaseStageCount }} 个阶段，发布后顾客立即可见
          </template>
        </span>
        <div class="series-release__footer-actions">
          <el-button
            v-if="isAdmin && canUnpublish"
            type="danger"
            plain
            :loading="unpublishing"
            :disabled="unpublishing || releasing"
            @click="handleUnpublish"
          >
            下架整个系列
          </el-button>
          <el-button
            v-if="isAdmin"
            type="success"
            :loading="releasing"
            :disabled="dirty || !readiness.canRelease || (isUpdate && selectedStageCodes.length === 0) || unpublishing || releasing"
            @click="handleRelease"
          >
            {{ releaseActionLabel }}
          </el-button>
        </div>
      </div>
    </template>

    <!-- 点击封面缩略图看大图（2026-10-27） -->
    <el-dialog
      v-model="coverPreviewVisible"
      title="封面图预览"
      width="720px"
      append-to-body
      class="series-release__cover-preview-dialog"
    >
      <img
        v-if="coverPreviewUrl"
        :src="coverPreviewUrl"
        class="series-release__cover-preview-large"
        alt="封面图大图"
      />
      <template #footer>
        <el-button @click="coverPreviewVisible = false">关闭</el-button>
      </template>
    </el-dialog>
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
import AiNameField from './AiNameField.vue'
import { recipeApi } from '@/api/recipes'
import {
  recipeHealthTagApi,
  recipeSeriesCoverBadgeApi,
  type RecipeHealthTag
} from '@/api/recipeHealthTags'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import { getApiErrorMessage } from '@/utils/apiError'
import {
  RECIPE_PRESENTATION_LIMITS,
  validatePresentationCoverFile
} from '@/utils/recipeDesigner/presentation'
import {
  SERIES_AI_COVER_TIMEOUT_MESSAGE,
  buildSeriesAiCoverSaveFlag,
  resolveSeriesAiCoverButtonLabel,
  resolveSeriesAiCoverHint,
  resolveSeriesAiCoverUnavailableReason,
  type SeriesAiCoverContext
} from '@/utils/recipeDesigner/seriesAiCover'
import { isTemporarySeriesName } from '@/utils/recipeDesigner/seriesName'
import {
  buildSeriesReleaseForm,
  buildSeriesReleaseSettingsPatch,
  canUnpublishSeries,
  cloneSeriesReleaseForm,
  emptySeriesReleaseForm,
  formatSeriesReleaseLatestVersion,
  formatSeriesReleaseStageVersion,
  groupSeriesReleaseIssues,
  hasSeriesReleaseSettingsPatch,
  isSeriesReleaseBadgesDirty,
  isSeriesReleaseFormDirty,
  isSeriesReleaseStagePendingUpdate,
  resolveSeriesReleaseActionableStages,
  resolveSeriesReleaseDefaultSelectedStageCodes,
  resolveSeriesReleasePendingStageCount,
  resolveSeriesReleaseState,
  seriesReleasePrimaryActionVerb,
  seriesReleaseProgress,
  seriesReleaseStageHint,
  seriesReleaseStageScopeLabel,
  seriesReleaseStageStatusLabel,
  seriesReleaseStageTagType,
  seriesReleaseStateLabel,
  seriesReleaseStateTagType,
  type SeriesReleaseForm
} from '@/utils/recipeDesigner/seriesRelease'
import type {
  SeriesReleaseReadiness,
  SeriesReleaseResult,
  SeriesUnpublishResult
} from '@/types/recipeDesigner'

const props = defineProps<{
  modelValue: boolean
  seriesId: string
  seriesName?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'released', result: SeriesReleaseResult): void
  /** 整系列下架 / 状态变化后通知父级刷新列表与卡片 */
  (e: 'updated', result: SeriesUnpublishResult): void
  /** 改了系列名：父级需要刷新列表与卡片 */
  (e: 'saved'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const isAdmin = useIsAdmin()

/** 系列名草稿：采用候选或失焦即写库，没有单独按钮 */
const nameDraft = ref('')
const nameDirty = computed(
  () => nameDraft.value.trim() !== String(props.seriesName ?? '').trim()
)

/**
 * 已成功写库的系列名。
 *
 * 列表页打开抽屉后，父组件的 `seriesName` prop 不会随之刷新；
 * 用本地状态接住 AiNameField 的 saved 事件，AI 按钮和临时名提示才不会停在旧名字。
 */
const savedSeriesName = ref(String(props.seriesName ?? '').trim())

watch(
  () => props.seriesName,
  (value) => {
    nameDraft.value = value ?? ''
    savedSeriesName.value = String(value ?? '').trim()
  },
  { immediate: true }
)

/** 采用 AI 候选 / 输入框失焦后名称已经落库，这里只把界面上的值对齐并通知父级 */
function onNameAdopted(name: string) {
  nameDraft.value = name
  savedSeriesName.value = String(name ?? '').trim()
  emit('saved')
}

/** 临时名（「未命名系列 · …」）会印在标签上，后端也会拦 */
const isTemporaryName = computed(() =>
  isTemporarySeriesName(savedSeriesName.value)
)


const readiness = ref<SeriesReleaseReadiness | null>(null)
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const releasing = ref(false)
const unpublishing = ref(false)
const error = ref('')

/** AI 系列封面（2026-10-27）：可用性 / 生成中 / 预览 / 失败 */
const aiCoverAvailable = ref<boolean | null>(null)
const aiCoverGenerating = ref(false)
const aiCoverPreviewUrl = ref('')
const aiCoverError = ref('')
let aiCoverRequestSeq = 0

/** 点封面缩略图看大图：主封面 / AI 预览 / 顾客预览共用同一个弹窗 */
const coverPreviewUrl = ref('')
const coverPreviewVisible = computed({
  get: () => Boolean(coverPreviewUrl.value),
  set: (visible: boolean) => {
    if (!visible) coverPreviewUrl.value = ''
  }
})

function openCoverPreview(url?: string | null): void {
  const target = String(url ?? '').trim()
  if (!target) return
  coverPreviewUrl.value = target
}

const healthTags = ref<RecipeHealthTag[]>([])
const healthTagsLoading = ref(false)
const healthTagsError = ref('')
/** 库里已有、但按新白名单不再允许的旧角标（只提示，保存后替换） */
const hiddenBadgeNames = ref<string[]>([])

const form = reactive<SeriesReleaseForm>(emptySeriesReleaseForm())
const baseline = ref<SeriesReleaseForm>(emptySeriesReleaseForm())

/** 更新时勾选的阶段；首次发布没有勾选框，始终为空 */
const selectedStageCodes = ref<string[]>([])

/** 只认最后一次请求，避免关闭 / 重复刷新时的旧响应覆盖新状态 */
let requestSeq = 0
let healthTagsRequestSeq = 0
/** 表单是否已用服务器结果初始化；手动刷新检查时不覆盖未保存编辑 */
let formHydrated = false
/** 阶段勾选是否已按默认值初始化；保存后刷新只保留仍可操作的勾选 */
let selectedStagesInitialized = false

const dirty = computed(() =>
  isSeriesReleaseFormDirty(form, baseline.value)
)

const progress = computed(() => seriesReleaseProgress(readiness.value))

const progressStatus = computed<'success' | undefined>(() =>
  readiness.value?.canRelease ? 'success' : undefined
)

const latestVersion = computed(() =>
  formatSeriesReleaseLatestVersion(readiness.value)
)

/** 未上线 / 待重新发布 / 已上线（最新） */
const releaseState = computed(() => resolveSeriesReleaseState(readiness.value))
const releaseStateLabel = computed(() =>
  seriesReleaseStateLabel(releaseState.value)
)
const releaseStateTagType = computed(() =>
  seriesReleaseStateTagType(releaseState.value)
)
/** 首次发布：不显示勾选框，范围是后端返回的全部 READY 阶段 */
const isFirstRelease = computed(() => releaseState.value === 'UNPUBLISHED')
/** 已上线过（含待更新）走更新接口，并提交勾选的阶段 */
const isUpdate = computed(() => releaseState.value !== 'UNPUBLISHED')

/**
 * AI 封面按钮状态（2026-10-27）。
 *
 * `busy` 把上传 / 保存 / 发布 / 下架都算进来：生成要花钱，
 * 也不该和另一个写封面的动作打架。生成中不阻断其它字段与保存。
 */
const aiCoverContext = computed<SeriesAiCoverContext>(() => ({
  isAdmin: isAdmin.value,
  available: aiCoverAvailable.value,
  generating: aiCoverGenerating.value,
  busy:
    uploading.value ||
    saving.value ||
    releasing.value ||
    unpublishing.value,
  savedSeriesName: savedSeriesName.value,
  hasCover: Boolean(form.coverImageUrl.trim()),
  isLive: isUpdate.value
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

/** 有更新草稿、等待重新发布的阶段数 */
const pendingStageCount = computed(() =>
  resolveSeriesReleasePendingStageCount(readiness.value)
)
/** 本次可勾选的阶段（READY + 有更新） */
const actionableStageCodes = computed(() =>
  resolveSeriesReleaseActionableStages(readiness.value).map(
    (stage) => stage.stageCode
  )
)
/** 本次实际发布 / 更新的阶段数 */
const releaseStageCount = computed(() =>
  isFirstRelease.value
    ? Number(readiness.value?.summary.publishableStageCount) || 0
    : selectedStageCodes.value.length
)
/** 发布 / 更新按钮文案：「发布 3 个阶段」/「更新 2 个阶段」 */
const actionVerb = computed(() => seriesReleasePrimaryActionVerb(readiness.value))
const releaseActionLabel = computed(
  () => `${actionVerb.value} ${releaseStageCount.value} 个阶段`
)
/** 是否已上线且没有任何可发内容 */
const availabilityTag = computed<{
  label: string
  type: 'success' | 'warning' | 'info'
}>(() => {
  if (!readiness.value) {
    return { label: '未就绪', type: 'info' }
  }
  if (
    isUpdate.value &&
    pendingStageCount.value === 0 &&
    actionableStageCodes.value.length === 0
  ) {
    return { label: '已是最新', type: 'success' }
  }
  if (readiness.value.canRelease) {
    return {
      label: isFirstRelease.value ? '可发布' : '可更新',
      type: 'success'
    }
  }
  return { label: '未就绪', type: 'warning' }
})
/** 已上线 / 待重新发布都可以整系列下架 */
const canUnpublish = computed(() => canUnpublishSeries(readiness.value))

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

/** 确认框里列出的阶段：首次发布是全部 READY，更新是勾选的阶段 */
const releaseStageCodes = computed(() =>
  isFirstRelease.value
    ? (readiness.value?.stages ?? [])
        .filter((stage) => stage.status === 'READY')
        .map((stage) => stage.stageCode)
    : selectedStageCodes.value
)
const releaseStageLabels = computed(() =>
  releaseStageCodes.value.map((stageCode) => stageLabel(stageCode))
)
/** 发布后覆盖的生命阶段数 = 已上线 + 本次新发布（已上线的待更新阶段不重复计数） */
const coverageStageCount = computed(() => {
  const published = Number(readiness.value?.summary.publishedStageCount) || 0
  const newlyPublished = (readiness.value?.stages ?? []).filter(
    (stage) =>
      stage.status === 'READY' &&
      releaseStageCodes.value.includes(stage.stageCode)
  ).length
  return published + newlyPublished
})

/** 角标下拉只显示白名单内的词（后端按词名算好 coverBadgeEligible） */
const eligibleHealthTags = computed(() =>
  healthTags.value.filter((tag) => tag.coverBadgeEligible === true)
)

/** 顾客预览里的封面角标文案：选中角标名以「 · 」连接，空则不渲染 */
const coverBadgeText = computed(() =>
  form.coverBadgeHealthTagIds
    .map(
      (healthTagId) =>
        eligibleHealthTags.value.find((tag) => tag.id === healthTagId)?.name ||
        ''
    )
    .filter(Boolean)
    .join(' · ')
)

function selectAllActionableStages(): void {
  selectedStageCodes.value = [...actionableStageCodes.value]
}

function clearSelectedStages(): void {
  selectedStageCodes.value = []
}

function resetForm(): void {
  Object.assign(form, emptySeriesReleaseForm())
  baseline.value = emptySeriesReleaseForm()
  formHydrated = false
}

/**
 * 用服务器结果初始化表单：发布设置来自 readiness，封面角标来自
 * `recipeSeriesCoverBadgeApi.get`（系列级独立表，不在 readiness 里）。
 */
function hydrateForm(
  result: SeriesReleaseReadiness,
  coverBadgeHealthTagIds: string[]
): void {
  const initial = buildSeriesReleaseForm(result, coverBadgeHealthTagIds)
  Object.assign(form, initial)
  baseline.value = cloneSeriesReleaseForm(initial)
  formHydrated = true
}

/**
 * 勾选同步：
 *  · 首次打开时按后端默认值初始化（更新 = 全部可操作阶段）；
 *  · 刷新 / 保存后只保留仍然可操作的勾选，不把用户取消掉的阶段重新勾上。
 */
function syncSelectedStageCodes(result: SeriesReleaseReadiness): void {
  if (!selectedStagesInitialized) {
    selectedStageCodes.value =
      resolveSeriesReleaseDefaultSelectedStageCodes(result)
    selectedStagesInitialized = true
    return
  }
  if (resolveSeriesReleaseState(result) === 'UNPUBLISHED') {
    selectedStageCodes.value = []
    return
  }
  const actionable = new Set(
    resolveSeriesReleaseActionableStages(result).map((stage) => stage.stageCode)
  )
  selectedStageCodes.value = selectedStageCodes.value.filter((stageCode) =>
    actionable.has(stageCode)
  )
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
    // 门槛与封面角标并行拉取；角标失败不阻断发布检查（表单回落到空角标）
    const [result, badgeResponse] = await Promise.all([
      recipeDesignerApi.getSeriesReleaseReadiness(props.seriesId),
      recipeSeriesCoverBadgeApi
        .get(props.seriesId) // 系列级角标单独存储，与 readiness 并行拉取
        .catch(() => ({
          seriesId: props.seriesId,
          badges: [],
          hiddenBadges: [],
        })),
    ])
    if (seq !== requestSeq) return
    readiness.value = result
    const coverBadgeHealthTagIds = (badgeResponse?.badges ?? []).map(
      (badge) => badge.healthTagId
    )
    hiddenBadgeNames.value = badgeResponse?.hiddenBadges ?? []
    // 首次打开 / 保存成功后用服务器结果覆盖表单；
    // 手动刷新时如果还有未保存编辑，只刷新检查结果，不吞掉用户输入。
    if (hydrate || !formHydrated) {
      hydrateForm(result, coverBadgeHealthTagIds)
    }
    syncSelectedStageCodes(result)
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
 * AI 生图能不能用（2026-10-27）。
 *
 * 只有管理员需要知道；查失败按「不可用」处理，不弹错 ——
 * 生图入口不该因为一次查询失败就在抽屉里报红。
 */
async function loadAiCoverAvailability(): Promise<void> {
  if (!isAdmin.value) {
    aiCoverAvailable.value = null
    return
  }
  try {
    const res = await recipeApi.getAiCoverAvailability()
    aiCoverAvailable.value = Boolean(res?.available)
  } catch {
    aiCoverAvailable.value = false
  }
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

/**
 * AI 生成系列封面（2026-10-27）。
 *
 * - 空封面 + 未上线：生成后直接存系列（后端只写 coverImageUrl，不推线上）；
 * - 已有封面 / 已上线：只出预览，点「用这张」才替换表单，最终由「保存发布设置」落库；
 * - 失败 / 超时保留原封面，只记错误 + 提供重试，**不自动重试**。
 */
async function handleGenerateAiCover(): Promise<void> {
  if (!props.seriesId || aiCoverGenerating.value) return
  if (aiCoverUnavailableReason.value) return

  const hasCover = Boolean(form.coverImageUrl.trim())
  const save = buildSeriesAiCoverSaveFlag({
    hasCover,
    isLive: isUpdate.value
  })
  if (hasCover) {
    try {
      await ElMessageBox.confirm(
        '重新生成需要再调用一次 AI（约 0.2 元/张）。生成后先看预览，点「用这张」才会替换当前封面。继续？',
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

  if (aiCoverPreviewUrl.value) {
    discardAiCoverPreview()
  }
  const seq = ++aiCoverRequestSeq
  aiCoverGenerating.value = true
  aiCoverError.value = ''
  try {
    const result = await recipeDesignerApi.generateSeriesAiCover(
      props.seriesId
    )
    if (seq !== aiCoverRequestSeq) return
    if (result.saved) {
      form.coverImageUrl = result.url
      // 服务器已经写库：表单和基线一起更新，避免「保存发布设置」误以为有未保存修改
      baseline.value = cloneSeriesReleaseForm({
        ...baseline.value,
        coverImageUrl: result.url
      })
      ElMessage.success('AI 封面已生成并保存')
      // 刷新「缺封面」阻断项；hydrate=false，不覆盖其它未保存编辑
      void loadReadiness(false)
    } else {
      aiCoverPreviewUrl.value = result.url
      ElMessage.success('已生成预览，确认后才会替换')
    }
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

/** 丢弃预览：未采用的图进回收站，不留孤儿 */
function discardAiCoverPreview(): void {
  const url = aiCoverPreviewUrl.value
  aiCoverPreviewUrl.value = ''
  if (url) {
    void recipeDesignerApi.discardAiCoverPreview(url).catch(() => undefined)
  }
}

/** 用预览替换抽屉里的封面；真正落库 / 上线仍由「保存发布设置」完成 */
function applyAiCoverPreview(): void {
  if (!aiCoverPreviewUrl.value) return
  form.coverImageUrl = aiCoverPreviewUrl.value
  aiCoverPreviewUrl.value = ''
  aiCoverError.value = ''
  ElMessage.success('封面已替换，记得点「保存发布设置」')
}

/**
 * 保存发布设置：
 *  · 先存设置（封面图 / 一句话卖点），再存封面角标；
 *  · 只有角标变化时也能单独保存；
 *  · 角标失败不回滚已保存的设置，保留角标修改方便直接重试。
 */
async function saveSettings(): Promise<void> {
  if (!props.seriesId || saving.value) return

  const patch = buildSeriesReleaseSettingsPatch(form, baseline.value)
  const hasSettingsPatch = hasSeriesReleaseSettingsPatch(patch)
  const hasBadgePatch = isSeriesReleaseBadgesDirty(form, baseline.value)
  if (!hasSettingsPatch && !hasBadgePatch) {
    ElMessage.info('发布设置没有修改')
    return
  }

  // 已上线系列不能清空封面图 / 卖点（后端也会拒绝），先给出可读的提示
  if (isUpdate.value) {
    if (!form.coverImageUrl.trim()) {
      ElMessage.warning('已上线系列保存时不能清空封面图')
      return
    }
    if (!form.sellingPoint.trim()) {
      ElMessage.warning('已上线系列保存时不能清空一句话卖点')
      return
    }
  }

  const submitted = cloneSeriesReleaseForm(form)
  const saved = cloneSeriesReleaseForm(baseline.value)
  saving.value = true
  let badgeSaveFailed = false
  try {
    if (hasSettingsPatch) {
      await recipeDesignerApi.updateSeriesReleaseSettings(props.seriesId, patch)
      saved.coverImageUrl = submitted.coverImageUrl
      saved.sellingPoint = submitted.sellingPoint
      baseline.value = cloneSeriesReleaseForm(saved)
    }
    if (hasBadgePatch) {
      try {
        await recipeSeriesCoverBadgeApi.save(
          props.seriesId,
          submitted.coverBadgeHealthTagIds
        )
        saved.coverBadgeHealthTagIds = [...submitted.coverBadgeHealthTagIds]
        baseline.value = cloneSeriesReleaseForm(saved)
      } catch {
        badgeSaveFailed = true
      }
    }
    if (badgeSaveFailed) {
      ElMessage.warning('设置已保存，但角标未保存成功，请重试')
    } else {
      ElMessage.success('发布设置已保存，展示资料立即对已上线阶段生效')
    }
    // 门槛由后端按最新设置重新计算；角标失败时保留表单里的角标选择以便重试
    if (badgeSaveFailed) {
      await loadReadiness(false)
    } else {
      await loadReadiness(true)
    }
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
  const current = readiness.value
  if (!current || releasing.value) return
  if (dirty.value) {
    ElMessage.warning('发布设置还有未保存的修改，请先保存')
    return
  }
  if (!current.canRelease) {
    ElMessage.warning(
      actionableStageCodes.value.length === 0
        ? '还没有可发布的阶段'
        : '请先补齐封面图和一句话卖点'
    )
    return
  }
  if (isUpdate.value && selectedStageCodes.value.length === 0) {
    ElMessage.warning('请至少勾选一个要更新的阶段')
    return
  }

  const verb = seriesReleasePrimaryActionVerb(current)
  const seriesName = props.seriesName || current.seriesId
  const stageList = releaseStageLabels.value.join('、')
  const message = isUpdate.value
    ? `将更新「${seriesName}」的 ${releaseStageCount.value} 个阶段：${stageList}。\n未勾选的「有更新」阶段会保留到下次；更新后顾客立即可见。确定更新吗？`
    : `将发布「${seriesName}」的 ${releaseStageCount.value} 个阶段：${stageList}。\n发布后顾客立即可见。确定发布吗？`

  try {
    await ElMessageBox.confirm(message, `${verb}系列`, {
      type: 'warning',
      confirmButtonText: verb,
      cancelButtonText: '取消'
    })
  } catch {
    return
  }

  releasing.value = true
  try {
    const result = isUpdate.value
      ? await recipeDesignerApi.releaseSeries(props.seriesId, { stageCodes: selectedStageCodes.value })
      : await recipeDesignerApi.releaseSeries(props.seriesId)
    ElMessage.success(
      `系列已${verb}，覆盖 ${result.releasedStageCodes.length} 个阶段，更新 ${result.updatedRecipeCount} 条阶段食谱`
    )
    emit('released', result)
    visible.value = false
  } catch {
    // 错误提示由 API 拦截器统一处理；抽屉保持打开，方便按提示修正
  } finally {
    releasing.value = false
  }
}

/**
 * 整系列下架（管理员）。
 *
 * 后端只把 PUBLIC 食谱改回 DRAFT、系列状态设为 DRAFT，设计稿和历史版本都保留，
 * 所以下架后仍可重新发布。下架成功后刷新门槛并通知列表刷新。
 */
async function handleUnpublish(): Promise<void> {
  if (!isAdmin.value) {
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }
  if (!props.seriesId || !readiness.value || unpublishing.value) return
  if (!canUnpublish.value) {
    ElMessage.info('系列还没上线，不需要下架')
    return
  }

  const seriesName = props.seriesName || readiness.value.seriesId
  try {
    await ElMessageBox.confirm(
      `下架后顾客将立即看不到「${seriesName}」，所有已发布阶段食谱会变回草稿；设计稿和历史版本都会保留，之后仍可重新发布。确定下架整个系列吗？`,
      '下架整个系列',
      {
        type: 'warning',
        confirmButtonText: '确认下架',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  unpublishing.value = true
  try {
    const result = await recipeDesignerApi.unpublishSeries(props.seriesId)
    ElMessage.success(
      `系列已下架，共下架 ${result.unpublishedRecipeCount} 条阶段食谱`
    )
    emit('updated', result)
    // 保留抽屉让管理员看到「未上线」状态；有未保存设置时不覆盖编辑
    await loadReadiness(!dirty.value)
  } catch {
    // 错误提示由 API 拦截器统一处理
  } finally {
    unpublishing.value = false
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
    // AI 封面的状态只在「当前这一次打开 / 这个系列」内有效：
    // 关闭、重新打开、甚至在打开状态下切换系列，都要清掉旧预览 / 旧错误。
    aiCoverRequestSeq += 1
    aiCoverGenerating.value = false
    if (aiCoverPreviewUrl.value) {
      const previewUrl = aiCoverPreviewUrl.value
      void recipeDesignerApi
        .discardAiCoverPreview(previewUrl)
        .catch(() => undefined)
    }
    aiCoverPreviewUrl.value = ''
    aiCoverError.value = ''
    aiCoverAvailable.value = null
    coverPreviewUrl.value = ''

    if (!open) {
      // 关闭后到达的响应不再写回，避免下次打开先闪一眼旧结果
      requestSeq += 1
      healthTagsRequestSeq += 1
      loading.value = false
      saving.value = false
      uploading.value = false
      releasing.value = false
      unpublishing.value = false
      error.value = ''
      return
    }

    readiness.value = null
    error.value = ''
    resetForm()
    selectedStageCodes.value = []
    selectedStagesInitialized = false
    if (!seriesId) {
      error.value = '缺少系列 id，无法检查发布条件'
      return
    }
    void loadReadiness(true)
    void loadHealthTags()
    void loadAiCoverAvailability()
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.series-release__state-tag {
  flex-shrink: 0;
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

.series-release__count--pending {
  color: #e6a23c;
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

.series-release__stage.is-selected {
  border-color: #b3d8ff;
  background: #f4f9ff;
}

.series-release__stage.is-actionable {
  border-left: 3px solid #67c23a;
}

.series-release__stage.is-pending {
  border-left: 3px solid #e6a23c;
}

.series-release__stage.is-inactive {
  background: #f7f8fa;
  color: #c0c4cc;
}

.series-release__stage.is-inactive .series-release__stage-name {
  color: #a8abb2;
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
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.45;
}

.series-release__stage-name {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: #303133;
}

.series-release__stage-hint {
  display: block;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: #909399;
}

.series-release__stage-scope {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #409eff;
  white-space: nowrap;
}

.series-release__stage.is-pending .series-release__stage-scope {
  color: #e6a23c;
}

.series-release__stage.is-inactive .series-release__stage-scope {
  color: #c0c4cc;
}

.series-release__stage-version {
  flex-shrink: 0;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}

.series-release__range-note {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: #606266;
}

.series-release__hint--warning {
  color: #e6a23c;
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

.series-release__cover-preview {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: zoom-in;
}

.series-release__cover-zoom {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 11px;
  line-height: 1.6;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.series-release__cover-preview:hover .series-release__cover-zoom {
  opacity: 1;
}

.series-release__cover-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.series-release__ai-preview-image,
.series-release__preview-cover-image {
  cursor: zoom-in;
}

.series-release__cover-preview-large {
  display: block;
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  background: #f5f7fa;
  border-radius: 8px;
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

.series-release__ai-cover-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.series-release__ai-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.series-release__ai-preview img {
  width: 160px;
  height: 90px;
  object-fit: cover;
  border-radius: 6px;
  background: #f0f2f5;
}

.series-release__ai-preview-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.series-release__ai-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: #f56c6c;
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

.series-release__save-tip {
  flex: 1;
  font-size: 12px;
  color: #909399;
}

.series-release__preview {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
}

.series-release__preview-cover {
  position: relative;
  width: 208px;
  height: 117px;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f2f5;
  flex-shrink: 0;
}

.series-release__preview-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.series-release__preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 12px;
  color: #c0c4cc;
}

.series-release__preview-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  max-width: calc(100% - 16px);
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.series-release__preview-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-top: 4px;
}

.series-release__preview-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  overflow-wrap: anywhere;
}

.series-release__preview-selling {
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
  overflow-wrap: anywhere;
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

.series-release__footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.series-release__footer-text {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
</style>
