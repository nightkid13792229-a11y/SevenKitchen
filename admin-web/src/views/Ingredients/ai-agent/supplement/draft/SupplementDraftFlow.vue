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
        :locked="aiDiff !== null"
        :mark-manual="markManual"
        @save="handleSaveAndLeave"
        @run-ai="handleRunAi"
        @review="handleReview"
        @back="handleBack"
        @discard="handleEditorDiscard"
        @reload="handleReload"
      />
    </template>

    <!-- 最终审核 -->
    <template v-else-if="view === 'review'">
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        class="draft-flow__alert"
      />

      <DraftReview
        v-if="review && draft"
        :review="review"
        :draft="draft"
        :acknowledged="acknowledged"
        :finalizing="finalizing"
        @finalize="handleFinalize"
        @back="backToEditor"
        @update:acknowledged="handleAcknowledged"
      />

      <el-card v-else shadow="never" class="draft-flow__empty">
        <el-alert
          :title="error ?? '没有拿到校验结果，请返回编辑页重新点「最终审核」'"
          type="warning"
          :closable="false"
          show-icon
        />
        <div class="draft-flow__empty-actions">
          <el-button data-action="review-back" @click="backToEditor">
            返回编辑
          </el-button>
          <el-button text @click="returnToList">返回草稿列表</el-button>
        </div>
      </el-card>
    </template>

    <!-- 写入后核验 -->
    <template v-else>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        class="draft-flow__alert"
      />

      <DraftVerification
        v-if="verification && draft"
        :verification="verification"
        :draft="draft"
        :reverifying="reverifying"
        @reverify="handleReverify"
      />

      <el-card v-else shadow="never" class="draft-flow__empty">
        <el-alert
          :title="error ?? '没有拿到核验结果，请返回草稿列表重试'"
          type="warning"
          :closable="false"
          show-icon
        />
        <div class="draft-flow__empty-actions">
          <el-button type="primary" @click="returnToList">
            返回草稿列表
          </el-button>
        </div>
      </el-card>
    </template>

    <!-- 写入中：不可关闭，避免以为写入已经结束 -->
    <div
      v-if="finalizing"
      class="draft-flow__finalize-mask"
      data-finalize-overlay
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label="正在写入正式数据"
    >
      <div class="draft-flow__finalize-panel">
        <h3 class="draft-flow__finalize-title">正在写入正式数据…</h3>
        <ol class="draft-flow__finalize-steps">
          <li v-for="(step, index) in FINALIZE_STEPS" :key="step">
            <span class="draft-flow__finalize-step-no">{{ index + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>
        <p class="draft-flow__finalize-hint">
          全部步骤在同一个事务里：中途失败会回滚，不会留下半成品，草稿会保留。请勿关闭页面。
        </p>
      </div>
    </div>

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
  type SupplementDraftAcknowledgedWarning,
  type SupplementDraftSummary
} from '@/api/supplementDrafts'
import {
  getApiErrorMessage,
  isUserCancel,
  toastApiError
} from '@/utils/apiError'
import SupplementDraftList from './SupplementDraftList.vue'
import SupplementDraftEditor from './SupplementDraftEditor.vue'
import DraftReview from './DraftReview.vue'
import DraftVerification from './DraftVerification.vue'
import DraftAiDiffDialog from './DraftAiDiffDialog.vue'
import {
  applyDraftAiSelection,
  cloneDraftPayload,
  diffDraft
} from './supplementDraftState'
import { useSupplementDraft } from './useSupplementDraft'

type FlowView = 'list' | 'editor' | 'review' | 'verification'

/** 写入遮罩上的步骤（spec §4.5）；不可点击、不可关闭，只表达进度。 */
const FINALIZE_STEPS = [
  '校验',
  '写原料',
  '写营养',
  '写证据/标签',
  '归组',
  '回读核验'
] as const

const view = ref<FlowView>('list')
const selectedDraftId = ref<string | null>(null)

const drafts = ref<SupplementDraftSummary[]>([])
const listLoading = ref(false)
const listError = ref('')
const creating = ref(false)
/** 审核屏勾选中的提醒 ackKey；点「确认写入」时写回草稿 payload。 */
const acknowledged = ref<string[]>([])
/** 只重跑功能核验的 loading（composable 没有单独的 reverifying 状态）。 */
const reverifying = ref(false)

const {
  draft,
  review,
  verification,
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
  loadErrorStatus,
  markManual,
  hasUnsavedWork,
  load,
  save,
  runAi,
  validate,
  finalize,
  discard,
  reverify,
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
    applyPaths,
    // 人改行必须保留「当前本地值」，不能回退成 AI 前的 before。
    target.payload
  )
  aiDiff.value = null
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
    if (saving.value) {
      ElMessage.warning('正在保存，修改已留在编辑页，稍后会自动补存')
      return
    }
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
    if (loadErrorStatus.value === 404) {
      // 这张草稿已经被放弃/删除：留在编辑页没有意义，退回列表。
      ElMessage.warning('这张草稿已不存在，已返回草稿列表')
      await returnToList()
      return
    }
    // 网络/500 等：保留 conflict 与本地内容，允许重试，不要清成「已同步」。
    ElMessage.error(
      error.value || '重新加载失败，请检查网络后重试；本地修改仍保留'
    )
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
  if (!review.value) return
  // 每次进入审核屏都重新逐条确认；上一次的勾选不能带进来。
  acknowledged.value = []
  view.value = 'review'
}

/**
 * 审核屏勾选提醒 → 写回草稿 payload。
 *
 * 后端 finalize 只认 `payload.review.acknowledgedWarnings`（ackKey 拆分回
 * `code` + `paramsHash`），所以前端必须把勾选结果落进草稿，不能只留在本地。
 */
function handleAcknowledged(keys: string[]): void {
  acknowledged.value = [...keys]
  const current = draft.value
  if (!current) return
  current.payload.review.acknowledgedWarnings = keys.map(acknowledgementOf)
}

/** ackKey 形如 `CODE:paramsHash`；没有冒号就是纯 code。 */
function acknowledgementOf(key: string): SupplementDraftAcknowledgedWarning {
  const separator = key.indexOf(':')
  if (separator <= 0) {
    return { code: key, paramsHash: '' }
  }
  return {
    code: key.slice(0, separator),
    paramsHash: key.slice(separator + 1)
  }
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

/**
 * 最终写入。
 *
 * - 成功且拿到核验报告 → 切到核验页；
 * - 成功但报告缺失 → 留在审核屏提示（不能假装成功）；
 * - 失败 → 留在审核屏，error 由 composable 设置、页面顶部显示。
 */
async function handleFinalize(): Promise<void> {
  if (finalizing.value) return
  const idAtStart = selectedDraftId.value
  if (!idAtStart) return
  const result = await finalize()
  if (!result) return
  // 同 validate：写入结果只属于发起它的那张草稿。
  if (selectedDraftId.value !== idAtStart) return
  if (!verification.value) {
    ElMessage.warning('写入已完成，但还没有拿到核验报告；请刷新草稿后再核验')
    return
  }
  view.value = 'verification'
}

/** 核验页「重新核验」：只重跑功能核验，不再次写数据。 */
async function handleReverify(): Promise<void> {
  if (reverifying.value) return
  const idAtStart = selectedDraftId.value
  if (!idAtStart) return
  reverifying.value = true
  try {
    const result = await reverify()
    if (!result) return
    if (selectedDraftId.value !== idAtStart) return
    if (result.ok) {
      ElMessage.success('重新核验通过')
    } else {
      ElMessage.warning('已重新核验，仍有功能未生效')
    }
  } finally {
    reverifying.value = false
  }
}

/* ------------------------------------------------------------------ */
/* 视图切换                                                            */
/* ------------------------------------------------------------------ */

/** 回列表：作废在飞请求并清空编辑状态，再刷新列表。 */
async function returnToList(): Promise<void> {
  view.value = 'list'
  selectedDraftId.value = null
  aiDiff.value = null
  acknowledged.value = []
  reverifying.value = false
  reset()
  await refreshList()
}

/** 审核屏返回编辑；写入进行中禁止返回（遮罩也不可关闭）。 */
function backToEditor(): void {
  if (finalizing.value) return
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

.draft-flow__empty {
  border-radius: 10px;
}

.draft-flow__empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.draft-flow__finalize-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(17 24 39 / 55%);
}

.draft-flow__finalize-panel {
  width: min(460px, 100%);
  padding: 24px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 48px rgb(15 23 42 / 24%);
}

.draft-flow__finalize-title {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 700;
  color: #1f2733;
}

.draft-flow__finalize-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin: 0 0 14px;
  padding: 0;
  list-style: none;
}

.draft-flow__finalize-steps li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #1f2733;
}

.draft-flow__finalize-step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ecf5ff;
  font-size: 11px;
  font-weight: 600;
  color: #409eff;
}

.draft-flow__finalize-hint {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #5b6470;
}
</style>
