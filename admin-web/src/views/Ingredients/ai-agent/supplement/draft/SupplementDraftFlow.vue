<template>
  <div class="draft-flow">
    <!-- 列表 -->
    <template v-if="view === 'list'">
      <SupplementDraftList
        :drafts="drafts"
        :loading="listLoading || creating"
        :error="listError"
        @new="handleCreate"
        @continue="handleContinue"
        @discard="handleListDiscard"
        @retry="refreshList"
      />
    </template>

    <!-- 编辑 -->
    <template v-else-if="view === 'editor'">
      <el-alert
        v-if="saveError && !conflict"
        :title="saveError"
        type="error"
        :closable="false"
        show-icon
        class="draft-flow__alert"
      />
      <el-alert
        v-else-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        class="draft-flow__alert"
      />

      <SupplementDraftEditor
        :draft="draft"
        :saving="saving"
        :ai-running="aiRunning"
        :validating="validating"
        :finalizing="finalizing"
        :dirty="dirty"
        :save-error="saveError"
        :conflict="conflict"
        :mark-manual="markManual"
        @save="handleSaveAndLeave"
        @run-ai="handleRunAi"
        @review="handleReview"
        @back="handleBack"
        @discard="handleEditorDiscard"
        @reload="handleReload"
      />
    </template>

    <!-- 最终审核（Task 16 会换成完整页面） -->
    <el-card
      v-else-if="view === 'review'"
      shadow="never"
      class="draft-flow__placeholder"
    >
      <template #header>
        <span class="draft-flow__placeholder-title">最终审核</span>
      </template>

      <template v-if="review">
        <p class="draft-flow__summary">
          完整性：已填 {{ review.completeness.filledRequired }}/{{
            review.completeness.totalRequired
          }}
          项必填；阻断项 {{ review.blockers.length }} 条，提醒项
          {{ review.warnings.length }} 条。
        </p>
      </template>
      <el-alert
        v-else
        :title="error ?? '没有拿到校验结果'"
        type="warning"
        :closable="false"
        show-icon
      />

      <p class="draft-flow__summary">
        完整审核与逐条确认页面还没接入；可以先返回编辑继续补全，草稿内容不会丢。
      </p>

      <div class="draft-flow__placeholder-actions">
        <el-button @click="backToEditor">返回编辑</el-button>
        <el-button text @click="returnToList">返回草稿列表</el-button>
        <el-button type="primary" disabled @click="handleFinalize">
          确认写入
        </el-button>
      </div>
    </el-card>

    <!-- 写入后核验（Task 16 会换成完整页面） -->
    <el-card v-else shadow="never" class="draft-flow__placeholder">
      <template #header>
        <span class="draft-flow__placeholder-title">写入核验</span>
      </template>

      <p class="draft-flow__summary">
        写入核验结果页还没接入；写入成功后应逐项显示字段与功能是否真的生效。
      </p>

      <div class="draft-flow__placeholder-actions">
        <el-button type="primary" @click="returnToList">返回草稿列表</el-button>
      </div>
    </el-card>

    <!-- AI 重填 diff：必须选一次「采用所选 / 保留我的」 -->
    <DraftAiDiffDialog
      v-if="aiDiff"
      :model-value="true"
      :before="aiDiff.before"
      :after="aiDiff.after"
      :manual-fields="aiDiff.manualFields"
      @apply="handleAiDiffApply"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 补剂草稿流程外壳（spec §4 / §10）。
 *
 * 四种视图：列表 → 编辑 → 最终审核 → 写入核验。状态都留在本组件：
 * `view` 与 `selectedDraftId` 不落 storage——**不自动打开上一张草稿**，
 * 刷新后永远先看列表（Global Constraints）。
 *
 * 所有接口动作都在这里收口：列表新建/继续/放弃，编辑页保存/AI/审核/返回/放弃。
 * 编辑内容本身由 `useSupplementDraft` 自动保存（800ms 防抖 + 乐观锁）。
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  supplementDraftsApi,
  type SupplementDraftSummary
} from '@/api/supplementDrafts'
import {
  getApiErrorMessage,
  isUserCancel,
  toastApiError
} from '@/utils/apiError'
import SupplementDraftList from './SupplementDraftList.vue'
import SupplementDraftEditor from './SupplementDraftEditor.vue'
import DraftAiDiffDialog from './DraftAiDiffDialog.vue'
import {
  applyDraftAiSelection,
  cloneDraftPayload,
  diffDraft
} from './supplementDraftState'
import { useSupplementDraft } from './useSupplementDraft'

type FlowView = 'list' | 'editor' | 'review' | 'verification'

const view = ref<FlowView>('list')
const selectedDraftId = ref<string | null>(null)

const drafts = ref<SupplementDraftSummary[]>([])
const listLoading = ref(false)
const listError = ref('')
const creating = ref(false)

const {
  draft,
  review,
  loading,
  dirty,
  saving,
  saveError,
  conflict,
  aiRunning,
  validating,
  finalizing,
  error,
  manualFields,
  markManual,
  hasUnsavedWork,
  load,
  save,
  runAi,
  validate,
  finalize,
  discard,
  reset
} = useSupplementDraft(selectedDraftId)

interface AiDiffState {
  before: ReturnType<typeof cloneDraftPayload>
  after: ReturnType<typeof cloneDraftPayload>
  manualFields: string[]
}

/** 等人工确认的 AI diff；非空时弹窗必须选一次才能继续。 */
const aiDiff = ref<AiDiffState | null>(null)

/* ------------------------------------------------------------------ */
/* 列表                                                                */
/* ------------------------------------------------------------------ */

async function refreshList(): Promise<void> {
  listLoading.value = true
  try {
    drafts.value = await supplementDraftsApi.list()
    listError.value = ''
  } catch (err) {
    listError.value = getApiErrorMessage(err, '加载草稿列表失败')
  } finally {
    listLoading.value = false
  }
}

/** 新建：先建空草稿（服务端给默认 payload），再进编辑页加载它。 */
async function handleCreate(): Promise<void> {
  if (creating.value) return
  creating.value = true
  try {
    const created = await supplementDraftsApi.create()
    await openDraft(created.id)
  } catch (err) {
    toastApiError(err, '新建草稿失败', (message) => ElMessage.error(message))
  } finally {
    creating.value = false
  }
}

/** 继续：按 id 打开编辑页并读最新草稿（列表摘要不带 payload）。 */
async function handleContinue(id: string): Promise<void> {
  await openDraft(id)
}

async function openDraft(id: string): Promise<void> {
  // 先清掉上一张草稿的上下文并作废它的在飞请求，避免加载期间还显示/写入旧草稿。
  aiDiff.value = null
  reset()
  selectedDraftId.value = id
  view.value = 'editor'
  const loaded = await load()
  if (selectedDraftId.value !== id) return
  if (!loaded) {
    // 别人的草稿/已被放弃时后端返回 404；拦截器已经提示过，退回列表。
    await returnToList()
  }
}

/** 列表上的「放弃」：只删草稿，不动正式原料库。 */
async function handleListDiscard(
  target: SupplementDraftSummary
): Promise<void> {
  if (!(await confirmDiscard(target.name))) return
  try {
    await supplementDraftsApi.discard(target.id)
    await refreshList()
  } catch (err) {
    toastApiError(err, '放弃草稿失败', (message) => ElMessage.error(message))
  }
}

/** 放弃前的二次确认：文案说清「只删草稿」。 */
async function confirmDiscard(name: string): Promise<boolean> {
  const title = name.trim() || '未命名补剂'
  try {
    await ElMessageBox.confirm(
      `只删除草稿「${title}」，不影响正式原料库。确定放弃吗？`,
      '放弃草稿',
      {
        confirmButtonText: '放弃草稿',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    return true
  } catch (err) {
    if (!isUserCancel(err)) {
      ElMessage.error(getApiErrorMessage(err, '放弃草稿失败'))
    }
    return false
  }
}

/* ------------------------------------------------------------------ */
/* 编辑                                                                */
/* ------------------------------------------------------------------ */

/** 保存/AI/校验/写入进行中时，不允许离开编辑页；返回一句中文原因。 */
function editorBusyMessage(): string | null {
  if (saving.value) return '正在保存，请稍候再试'
  if (aiRunning.value) return 'AI 正在起草，请稍候再试'
  if (validating.value) return '正在校验，请稍候再试'
  if (finalizing.value) return '正在写入，请稍候再试'
  return null
}

/**
 * 「保存并离开」：存成功才走。
 *
 * 保存失败（409 / 断网）就留在编辑页，让 saveError 的提示可见，
 * 避免静默丢掉还没保存的修改。
 */
async function handleSaveAndLeave(): Promise<void> {
  const busy = editorBusyMessage()
  if (busy) {
    ElMessage.warning(busy)
    return
  }
  const saved = await save()
  if (!saved) {
    // 刚好撞上自动保存：不硬走，提示等它完成；失败原因由 saveError 显示。
    if (saving.value) {
      ElMessage.warning('正在保存，请稍候再试')
    }
    return
  }
  if (hasUnsavedWork()) {
    ElMessage.warning(
      '保存期间又有改动，已经留在编辑页；等保存状态变成「已保存」再离开'
    )
    return
  }
  await returnToList()
}

/**
 * AI 起草/重填：先记下旧载荷，回来后只把「真正的变化」放进 diff 弹窗。
 *
 * 服务端已经按 manualFields 跳过人改字段；这里再做一层：diff 行里人改的
 * 字段默认不采用，弹窗必须明确选「采用所选 / 保留我的」才收尾。
 */
async function handleRunAi(): Promise<void> {
  const idAtStart = selectedDraftId.value
  const current = draft.value
  if (!current) return
  const before = cloneDraftPayload(current.payload)
  const updated = await runAi()
  if (!updated) return
  if (selectedDraftId.value !== idAtStart) return
  const rows = diffDraft(before, updated.payload, manualFields.value)
  if (rows.length === 0) {
    ElMessage.success('AI 起草完成，没有需要你确认的字段变化')
    return
  }
  aiDiff.value = {
    before,
    after: cloneDraftPayload(updated.payload),
    manualFields: [...manualFields.value]
  }
}

/** diff 弹窗的收尾：采用勾选路径，其余回退到原值并标人改，然后保存。 */
async function handleAiDiffApply(applyPaths: string[]): Promise<void> {
  const pending = aiDiff.value
  const target = draft.value
  if (!pending || !target) {
    aiDiff.value = null
    return
  }
  const { payload, manualPaths } = applyDraftAiSelection(
    pending.before,
    pending.after,
    pending.manualFields,
    applyPaths
  )
  aiDiff.value = null
  error.value = null
  target.payload = payload
  for (const path of manualPaths) {
    markManual(path)
  }
  if (!hasUnsavedWork()) {
    ElMessage.success(
      applyPaths.length === 0
        ? '已全部保留你的原值'
        : '已采用勾选的 AI 结果'
    )
    return
  }
  const saved = await save()
  if (!saved) {
    ElMessage.error(saveError.value || '保存失败，修改还在编辑页')
    return
  }
  if (hasUnsavedWork()) {
    ElMessage.warning('保存期间又有改动，请等保存完成后再离开编辑页')
    return
  }
  ElMessage.success(
    manualPaths.length > 0
      ? `AI 起草完成，已保留 ${manualPaths.length} 处你的修改`
      : '已采用 AI 起草结果'
  )
}

/** 409 后的「重新加载草稿」：人确认后才丢弃本地内容，不需要刷新浏览器。 */
async function handleReload(): Promise<void> {
  if (!selectedDraftId.value || loading.value) return
  try {
    await ElMessageBox.confirm(
      '重新加载会用服务端最新内容覆盖你本地还没保存的修改。确定重新加载吗？',
      '重新加载草稿',
      {
        confirmButtonText: '重新加载',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch (err) {
    if (!isUserCancel(err)) {
      ElMessage.error(getApiErrorMessage(err, '重新加载草稿失败'))
    }
    return
  }
  const loaded = await load()
  if (!loaded) {
    if (selectedDraftId.value && !loading.value && !error.value) {
      // 服务端已没有这张草稿（被放弃/删除）时退回列表。
      await returnToList()
    }
    return
  }
  ElMessage.success('已重新加载服务端草稿')
}

/**
 * 顶部「返回草稿列表」：有改动先存；保存失败就留在编辑页。
 *
 * 不再「尽力保存后照样清空」——那会在 409/断网时静默丢改动。
 */
async function handleBack(): Promise<void> {
  const busy = editorBusyMessage()
  if (busy) {
    ElMessage.warning(busy)
    return
  }
  if (hasUnsavedWork()) {
    const saved = await save()
    if (!saved) {
      if (saving.value) {
        ElMessage.warning('正在保存，请稍候再试')
      }
      return
    }
    if (hasUnsavedWork()) {
      ElMessage.warning(
        '保存期间又有改动，已经留在编辑页；等保存状态变成「已保存」再离开'
      )
      return
    }
  }
  await returnToList()
}

/** 最终审核：先让服务端校验，拿到阻断/提醒后再进审核视图。 */
async function handleReview(): Promise<void> {
  const idAtStart = selectedDraftId.value
  if (!idAtStart) return
  const busy = editorBusyMessage()
  if (busy) {
    ElMessage.warning(busy)
    return
  }
  const result = await validate()
  if (!result) return
  // 校验期间如果已经切走（reset/打开别的草稿），不要把视图拉到旧草稿的审核屏。
  if (selectedDraftId.value !== idAtStart) return
  view.value = 'review'
}

/** 编辑页「放弃草稿」：确认后走 composable 的 discard，再回列表。 */
async function handleEditorDiscard(): Promise<void> {
  const busy = editorBusyMessage()
  if (busy) {
    ElMessage.warning(busy)
    return
  }
  const current = draft.value
  if (!current) return
  const idAtStart = current.id
  if (!(await confirmDiscard(current.name))) return
  const discarded = await discard()
  if (!discarded) return
  if (selectedDraftId.value !== idAtStart) return
  await returnToList()
}

/** 最终写入（Task 16 的审核页接上按钮后启用）。 */
async function handleFinalize(): Promise<void> {
  const idAtStart = selectedDraftId.value
  if (!idAtStart) return
  const result = await finalize()
  if (!result) return
  // 同 validate：写入结果只属于发起它的那张草稿。
  if (selectedDraftId.value !== idAtStart) return
  view.value = 'verification'
}

/* ------------------------------------------------------------------ */
/* 视图切换                                                            */
/* ------------------------------------------------------------------ */

/** 回列表：作废在飞请求并清空编辑状态，再刷新列表。 */
async function returnToList(): Promise<void> {
  view.value = 'list'
  selectedDraftId.value = null
  aiDiff.value = null
  reset()
  await refreshList()
}

function backToEditor(): void {
  view.value = 'editor'
}

onMounted(() => {
  void refreshList()
})
</script>

<style scoped>
.draft-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.draft-flow__alert {
  display: flex;
  align-items: center;
  gap: 8px;
}

.draft-flow__alert :deep(.el-alert) {
  flex: 1;
}

.draft-flow__placeholder {
  border-radius: 10px;
}

.draft-flow__placeholder-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2733;
}

.draft-flow__summary {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #5b6470;
}

.draft-flow__placeholder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
</style>
