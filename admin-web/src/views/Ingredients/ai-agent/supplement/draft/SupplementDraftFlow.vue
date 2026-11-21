<template>
  <div class="draft-flow">
    <!-- 列表 -->
    <template v-if="view === 'list'">
      <div v-if="listError" class="draft-flow__alert">
        <el-alert :title="listError" type="error" :closable="false" show-icon />
        <el-button text size="small" @click="refreshList">重新加载</el-button>
      </div>

      <SupplementDraftList
        :drafts="drafts"
        :loading="listLoading || creating"
        @new="handleCreate"
        @continue="handleContinue"
        @discard="handleListDiscard"
      />
    </template>

    <!-- 编辑 -->
    <template v-else-if="view === 'editor'">
      <el-alert
        v-if="error"
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
        @save="handleSaveAndLeave"
        @run-ai="handleRunAi"
        @review="handleReview"
        @back="handleBack"
        @discard="handleEditorDiscard"
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
  saving,
  aiRunning,
  validating,
  error,
  load,
  save,
  runAi,
  validate,
  finalize,
  discard
} = useSupplementDraft(selectedDraftId)

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
  selectedDraftId.value = id
  view.value = 'editor'
  const loaded = await load()
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

/**
 * 「保存并离开」/顶部「返回草稿列表」都先存一次。
 *
 * 保存失败（409 / 断网）就留在编辑页，让上面的错误提示可见，
 * 避免静默丢掉还没保存的修改；只有保存成功或已有保存请求在飞才离开。
 */
async function handleSaveAndLeave(): Promise<void> {
  const saved = await save()
  if (saved || saving.value) {
    await returnToList()
  }
}

async function handleRunAi(): Promise<void> {
  const updated = await runAi()
  if (updated) {
    ElMessage.success('AI 起草完成，请按区块逐项核对')
  }
}

/**
 * 顶部「返回草稿列表」：尽力保存一次再走，不阻塞导航。
 *
 * 自动保存平时已经存过；这里补一次是为了兜住「刚改完就点返回」。
 * 保存失败（如 409）时接口层已提示，仍让人回到列表，避免卡在编辑页。
 */
async function handleBack(): Promise<void> {
  if (draft.value) {
    await save()
  }
  await returnToList()
}

/** 最终审核：先让服务端校验，拿到阻断/提醒后再进审核视图。 */
async function handleReview(): Promise<void> {
  const result = await validate()
  if (result) {
    view.value = 'review'
  }
}

/** 编辑页「放弃草稿」：确认后走 composable 的 discard，再回列表。 */
async function handleEditorDiscard(): Promise<void> {
  const current = draft.value
  if (!current) return
  if (!(await confirmDiscard(current.name))) return
  const discarded = await discard()
  if (discarded) {
    await returnToList()
  }
}

/** 最终写入（Task 16 的审核页接上按钮后启用）。 */
async function handleFinalize(): Promise<void> {
  const result = await finalize()
  if (result) {
    view.value = 'verification'
  }
}

/* ------------------------------------------------------------------ */
/* 视图切换                                                            */
/* ------------------------------------------------------------------ */

/** 回列表：清掉编辑状态（`load()` 在 id 为空时会清空草稿/审核结果）。 */
async function returnToList(): Promise<void> {
  view.value = 'list'
  selectedDraftId.value = null
  await load()
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
