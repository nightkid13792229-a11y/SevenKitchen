<template>
  <div v-loading="loading" class="presentation-panel">
    <div v-if="error && !draft" class="presentation-panel__error">
      <el-alert
        type="error"
        :closable="false"
        show-icon
        title="产品展示加载失败"
        :description="error"
      />
      <el-button type="primary" size="small" @click="loadDraft">重试</el-button>
    </div>

    <template v-else-if="draft">
      <el-form label-width="112px" label-position="left" class="presentation-form">
        <!-- 两种设计分支都要：封面图 + 封面标题 -->
        <el-form-item label="封面图" required>
          <div class="presentation-cover">
            <el-upload
              class="presentation-cover__upload"
              :show-file-list="false"
              :before-upload="handleCoverUpload"
              accept="image/jpeg,image/png,image/webp"
            >
              <div
                class="presentation-cover__box"
                :class="{ 'is-empty': !form.coverImageUrl }"
              >
                <img
                  v-if="form.coverImageUrl"
                  :src="form.coverImageUrl"
                  alt="封面图预览"
                />
                <div v-else class="presentation-cover__placeholder">
                  <el-icon><Plus /></el-icon>
                  <span>上传封面图</span>
                </div>
                <div v-if="uploading" class="presentation-cover__mask">
                  上传中…
                </div>
              </div>
            </el-upload>
            <div class="presentation-cover__side">
              <el-button
                v-if="form.coverImageUrl"
                link
                type="danger"
                @click="form.coverImageUrl = ''"
              >移除封面</el-button>
              <span class="presentation-hint">
                建议 16:9 横图，JPG / PNG / WebP，不超过 5MB。
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

        <!-- 产品线：上架文案 + 目标人群 -->
        <template v-if="isCatalog">
          <el-form-item label="详情描述" required>
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="4"
              :maxlength="RECIPE_PRESENTATION_LIMITS.description"
              show-word-limit
              placeholder="介绍这道食谱的原料、做法与适用场景"
            />
          </el-form-item>

          <el-form-item label="一句话卖点" required>
            <el-input
              v-model="form.sellingPoint"
              :maxlength="RECIPE_PRESENTATION_LIMITS.sellingPoint"
              show-word-limit
              placeholder="例如：鲜肉低敏，日常维持"
            />
          </el-form-item>

          <el-form-item label="适用生命阶段" required>
            <el-select
              v-model="form.applicableLifeStages"
              multiple
              collapse-tags
              collapse-tags-tooltip
              placeholder="至少选择一个人生阶段"
              class="presentation-select"
            >
              <el-option
                v-for="option in lifeStageOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
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
              class="presentation-select"
            >
              <el-option
                v-for="tag in healthTags"
                :key="tag.id"
                :label="tag.name"
                :value="tag.id"
              />
            </el-select>
            <div v-if="healthTagsError" class="presentation-inline-error">
              {{ healthTagsError }}
              <el-button link type="primary" @click="loadHealthTags">重新加载</el-button>
            </div>
            <div v-else class="presentation-hint">
              未设置仍可上线，但顾客无法按健康需求筛选到这道食谱。
            </div>
          </el-form-item>
        </template>

        <!-- 订单分支：订单信息只读，封面字段仍可编辑 -->
        <template v-else>
          <el-form-item label="订单信息">
            <el-descriptions
              :column="1"
              border
              size="small"
              class="presentation-order"
            >
              <el-descriptions-item label="订单号">
                <span :class="{ 'is-missing': !orderInfo.orderId }">
                  {{ orderInfo.orderId || '未绑定' }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="本单份数">
                <span :class="{ 'is-missing': !orderInfo.orderQuantity }">
                  {{ orderQuantityLabel }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="顾客爱犬">
                <span :class="{ 'is-missing': !orderInfo.customerDogId }">
                  {{ orderInfo.customerDogId || '未绑定' }}
                </span>
              </el-descriptions-item>
            </el-descriptions>
            <div class="presentation-hint">
              订单信息来自本单，只读；如需修改请回订单设计工作台。
            </div>
          </el-form-item>
        </template>
      </el-form>

      <div class="presentation-panel__footer">
        <span
          class="presentation-panel__state"
          :class="{ 'is-dirty': dirty }"
        >
          {{ dirty ? '有未保存的展示修改' : '展示资料已保存' }}
        </span>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="saving || uploading || !dirty"
          @click="savePresentation"
        >保存展示资料</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadProps } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import { recipeApi } from '@/api/recipes'
import {
  recipeHealthTagApi,
  type RecipeHealthTag
} from '@/api/recipeHealthTags'
import type {
  DesignRecipeDesignMode,
  DesignRecipeDraftDetail
} from '@/types/recipeDesigner'
import { ORDER_DESIGN_LIFE_STAGE_LABELS } from '@/utils/orderRecipeDesign'
import {
  RECIPE_PRESENTATION_LIMITS,
  buildPresentationForm,
  buildPresentationPatch,
  buildPresentationTargetPatch,
  clonePresentationForm,
  emptyPresentationForm,
  formatOrderQuantityLabel,
  hasPresentationPatch,
  hasPresentationTargetPatch,
  isPresentationDirty,
  normalizePresentationDesignMode,
  resolveOrderPresentationInfo,
  validatePresentationCoverFile,
  type RecipePresentationForm
} from '@/utils/recipeDesigner/presentation'

const props = defineProps<{
  draftId: string
  designMode?: DesignRecipeDesignMode | null
}>()

const emit = defineEmits<{
  (
    e: 'saved',
    payload: { draftId: string; contentRevision: number | null }
  ): void
  (e: 'dirty-change', dirty: boolean): void
}>()

const lifeStageOptions = Object.entries(ORDER_DESIGN_LIFE_STAGE_LABELS).map(
  ([value, label]) => ({ value, label })
)

const draft = ref<DesignRecipeDraftDetail | null>(null)
const form = reactive<RecipePresentationForm>(emptyPresentationForm())
const baseline = ref<RecipePresentationForm>(emptyPresentationForm())
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const error = ref('')

const healthTags = ref<RecipeHealthTag[]>([])
const healthTagsLoading = ref(false)
const healthTagsError = ref('')

/** 只认最后一次加载，避免切换草稿时旧响应覆盖新表单 */
let requestSeq = 0
let healthTagsRequestSeq = 0

const isCatalog = computed(
  () => normalizePresentationDesignMode(props.designMode) === 'CATALOG'
)

const orderInfo = computed(() => resolveOrderPresentationInfo(draft.value))
const orderQuantityLabel = computed(() =>
  formatOrderQuantityLabel(orderInfo.value.orderQuantity)
)

const dirty = computed(() =>
  isPresentationDirty(form, baseline.value, isCatalog.value)
)

watch(
  dirty,
  (value) => {
    emit('dirty-change', value)
  },
  { immediate: true }
)

watch(
  () => [props.draftId, props.designMode] as const,
  () => {
    void loadDraft()
  },
  { immediate: true }
)

watch(isCatalog, (catalog) => {
  if (catalog && healthTags.value.length === 0 && !healthTagsLoading.value) {
    void loadHealthTags()
  }
})

onBeforeUnmount(() => {
  emit('dirty-change', false)
})

async function loadDraft(): Promise<void> {
  if (!props.draftId) {
    draft.value = null
    error.value = '缺少草稿 id，无法维护产品展示'
    return
  }

  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  draft.value = null
  Object.assign(form, emptyPresentationForm())
  baseline.value = emptyPresentationForm()

  try {
    const detail = await recipeDesignerApi.getDraft(props.draftId)
    if (seq !== requestSeq) return
    draft.value = detail
    const initial = buildPresentationForm(detail)
    Object.assign(form, initial)
    baseline.value = clonePresentationForm(initial)
    if (isCatalog.value) {
      void loadHealthTags()
    }
  } catch {
    if (seq !== requestSeq) return
    // 错误提示已由 API 拦截器统一弹出，这里保留可重试的内联状态
    error.value = '产品展示加载失败，请稍后重试'
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

/**
 * 复用食谱管理的图片上传接口；上传只拿到 URL，点「保存展示资料」后才落库。
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
    ElMessage.success('封面图上传成功，保存后生效')
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
 * 保存：
 *  · 展示字段走 PATCH presentation（只发变化项，空串按 null 清空）；
 *  · 适用生命阶段 / 目标健康标签走既有草稿 PATCH（不在 presentation DTO 里）；
 *  · 成功后把基线更新为本次提交值，并通知抽屉重新拉上线检查。
 */
async function savePresentation(): Promise<void> {
  if (!draft.value || saving.value) return

  const presentationPatch = buildPresentationPatch(form, baseline.value)
  const targetPatch = isCatalog.value
    ? buildPresentationTargetPatch(form, baseline.value)
    : {}

  if (
    !hasPresentationPatch(presentationPatch) &&
    !hasPresentationTargetPatch(targetPatch)
  ) {
    ElMessage.info('展示资料没有修改')
    return
  }

  const submitted = clonePresentationForm(form)
  saving.value = true
  try {
    const presentationRequest = hasPresentationPatch(presentationPatch)
      ? recipeDesignerApi.updateDraftPresentation(
          props.draftId,
          presentationPatch
        )
      : Promise.resolve(null)
    const targetRequest = hasPresentationTargetPatch(targetPatch)
      ? recipeDesignerApi.updateDraft(props.draftId, targetPatch)
      : Promise.resolve(null)

    const [presentationSnapshot] = await Promise.all([
      presentationRequest,
      targetRequest
    ])

    // 只把提交时的值设为基线：保存期间继续输入的内容仍算未保存
    baseline.value = submitted
    draft.value = {
      ...draft.value,
      coverImageUrl: submitted.coverImageUrl || null,
      coverTitle: submitted.coverTitle || null,
      description: submitted.description || null,
      sellingPoint: submitted.sellingPoint || null,
      applicableLifeStages: [...submitted.applicableLifeStages],
      targetHealthTags: [...submitted.targetHealthTags]
    }

    ElMessage.success('展示资料已保存，上线检查已刷新')
    emit('saved', {
      draftId: props.draftId,
      contentRevision: presentationSnapshot?.contentRevision ?? null
    })
  } catch {
    // 错误提示由 API 拦截器统一处理；表单保持脏状态，方便直接重试
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.presentation-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 80px;
}

.presentation-panel__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.presentation-form {
  padding: 4px 0 0;
}

.presentation-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: #606266;
}

.presentation-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.presentation-cover {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.presentation-cover__upload {
  flex-shrink: 0;
}

.presentation-cover__box {
  position: relative;
  width: 208px;
  height: 117px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
  cursor: pointer;
}

.presentation-cover__box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.presentation-cover__placeholder {
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

.presentation-cover__placeholder .el-icon {
  font-size: 22px;
}

.presentation-cover__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
}

.presentation-cover__side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding-top: 4px;
}

.presentation-hint {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.presentation-inline-error {
  font-size: 12px;
  line-height: 1.6;
  color: #f56c6c;
}

.presentation-select {
  width: 100%;
}

.presentation-order {
  width: 100%;
}

.presentation-order .is-missing {
  color: #f56c6c;
}

.presentation-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
}

.presentation-panel__state {
  font-size: 12px;
  color: #909399;
}

.presentation-panel__state.is-dirty {
  color: #e6a23c;
}
</style>
