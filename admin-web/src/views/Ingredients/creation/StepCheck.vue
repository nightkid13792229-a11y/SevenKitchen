<template>
  <section class="creation-step check-step">
    <header class="creation-step__header">
      <span class="creation-step__badge">④</span>
      <div>
        <h2 class="creation-step__title">终检</h2>
        <p class="creation-step__summary">
          三档结果全部来自服务端；页面只展示，不自己判断能不能通过。
        </p>
      </div>
    </header>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      show-icon
      title="终检没有跑成功"
    >
      <p class="alert-body">{{ loadError }}</p>
      <el-button size="small" type="primary" @click="loadCheck">重试终检</el-button>
    </el-alert>

    <div v-loading="loading" class="check-body">
      <el-alert
        v-if="result"
        :type="summaryAlertType"
        :closable="false"
        show-icon
        :title="summaryTitle"
      >
        以下分类与顺序完全来自后端 `POST drafts/:id/check` 的返回；
        刷新页面会重新跑一次，前端不缓存、不重算。
      </el-alert>

      <div v-if="result" class="check-columns">
        <section
          class="check-column check-column--blocking"
          aria-labelledby="check-blocking-title"
        >
          <header class="check-column__header">
            <h3 id="check-blocking-title">
              {{ CHECK_GROUP_META.blocking.title }}
              <el-tag size="small" type="danger" effect="dark">
                {{ grouped.blocking.length }}
              </el-tag>
            </h3>
            <p>{{ CHECK_GROUP_META.blocking.description }}</p>
          </header>

          <div v-if="grouped.blocking.length === 0" class="check-column__empty">
            没有拦死项。
          </div>
          <article
            v-for="(item, index) in grouped.blocking"
            :key="`blocking-${item.code}-${index}`"
            class="check-item check-item--blocking"
          >
            <header class="check-item__header">
              <span class="check-item__code">{{ item.code }}</span>
            </header>
            <p class="check-item__message">{{ item.message }}</p>
            <p v-if="item.fieldPath" class="check-item__field">
              字段：{{ fieldLabel(item.fieldPath) }}
              <span class="check-item__path">{{ item.fieldPath }}</span>
            </p>
          </article>
          <p class="check-column__note">
            拦死项没有「继续」或「放行」按钮：请点页面底部「上一步」回 ③ / ② 改数据，
            改完再进本站重新终检。
          </p>
        </section>

        <section
          class="check-column check-column--exceptionable"
          aria-labelledby="check-exceptionable-title"
        >
          <header class="check-column__header">
            <h3 id="check-exceptionable-title">
              {{ CHECK_GROUP_META.exceptionable.title }}
              <el-tag size="small" type="warning" effect="dark">
                {{ grouped.exceptionable.length }}
              </el-tag>
            </h3>
            <p>{{ CHECK_GROUP_META.exceptionable.description }}</p>
          </header>

          <div
            v-if="grouped.exceptionable.length === 0"
            class="check-column__empty"
          >
            没有可例外项。
          </div>
          <article
            v-for="(item, index) in grouped.exceptionable"
            :key="`exceptionable-${item.code}-${index}`"
            class="check-item check-item--exceptionable"
          >
            <header class="check-item__header">
              <span class="check-item__code">{{ item.code }}</span>
              <el-tag
                v-if="exceptionFor(item.code)"
                size="small"
                type="success"
                effect="light"
              >
                已放行
              </el-tag>
            </header>
            <p class="check-item__message">{{ item.message }}</p>
            <p v-if="item.fieldPath" class="check-item__field">
              字段：{{ fieldLabel(item.fieldPath) }}
              <span class="check-item__path">{{ item.fieldPath }}</span>
            </p>

            <div v-if="exceptionFor(item.code)" class="exception-approved">
              <p class="exception-approved__reason">
                理由：{{ exceptionFor(item.code)?.reason }}
              </p>
              <p class="exception-approved__meta">
                {{ exceptionFor(item.code)?.approvedBy }} ·
                {{ formatDateTime(exceptionFor(item.code)?.approvedAt) }}
              </p>
              <el-button
                text
                type="danger"
                size="small"
                :disabled="persisting"
                @click="revokeException(item.code)"
              >
                撤销放行
              </el-button>
            </div>

            <div v-else class="exception-form">
              <el-input
                v-model="reasons[item.code]"
                type="textarea"
                :rows="2"
                maxlength="200"
                show-word-limit
                :placeholder="`必填：为什么「${item.code}」可以放行？`"
              />
              <el-button
                type="warning"
                size="small"
                :loading="persisting && pendingCode === item.code"
                :disabled="!canApprove(item.code) || persisting"
                @click="approveException(item)"
              >
                登记例外并放行
              </el-button>
            </div>
          </article>
          <p v-if="grouped.exceptionable.length" class="check-column__note">
            例外必须写理由，并记录当前登录人与时间；同一规则码的多条共用一条理由。
          </p>
        </section>

        <section
          class="check-column check-column--warnings"
          aria-labelledby="check-warnings-title"
        >
          <header class="check-column__header">
            <h3 id="check-warnings-title">
              {{ CHECK_GROUP_META.warnings.title }}
              <el-tag size="small" type="info" effect="dark">
                {{ grouped.warnings.length }}
              </el-tag>
            </h3>
            <p>{{ CHECK_GROUP_META.warnings.description }}</p>
          </header>

          <div
            v-if="grouped.warnings.length === 0"
            class="check-column__empty"
          >
            没有提醒项。
          </div>
          <article
            v-for="(item, index) in grouped.warnings"
            :key="`warning-${item.code}-${index}`"
            class="check-item check-item--warning"
          >
            <header class="check-item__header">
              <span class="check-item__code">{{ item.code }}</span>
              <el-tag
                v-if="exceptionFor(item.code)"
                size="small"
                type="success"
                effect="light"
              >
                已确认忽略
              </el-tag>
            </header>
            <p class="check-item__message">{{ item.message }}</p>
            <p v-if="item.fieldPath" class="check-item__field">
              字段：{{ fieldLabel(item.fieldPath) }}
              <span class="check-item__path">{{ item.fieldPath }}</span>
            </p>

            <div v-if="exceptionFor(item.code)" class="exception-approved">
              <p class="exception-approved__meta">
                {{ exceptionFor(item.code)?.approvedBy }} ·
                {{ formatDateTime(exceptionFor(item.code)?.approvedAt) }}
              </p>
              <el-button
                text
                type="danger"
                size="small"
                :disabled="persisting"
                @click="revokeException(item.code)"
              >
                撤销
              </el-button>
            </div>
            <el-button
              v-else
              size="small"
              :loading="persisting && pendingCode === item.code"
              :disabled="persisting"
              @click="ackWarning(item)"
            >
              已知悉，忽略
            </el-button>
          </article>
          <p v-if="grouped.warnings.length" class="check-column__note">
            提醒可以忽略，但忽略会写入草稿的例外记录（操作人 + 时间），事后可查。
          </p>
        </section>
      </div>
    </div>

    <p v-if="blockedReason" class="next-hint">{{ blockedReason }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ingredientCreationApi } from '@/api/ingredientCreation'
import { getApiErrorMessage, shouldToastApiError } from '@/utils/apiError'
import { useUserStore } from '@/store/user'
import type {
  CheckItem,
  CreationStep,
  ExceptionRecord,
  FinalCheckResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload
} from '@/types/ingredientCreation'
import { CHECK_GROUP_META, groupCheckItems } from './checkPresentation'
import { PROFILE_FIELD_BY_PATH } from './profileLedger'
import { stepIndex } from './stepState'
import { canLeaveCheckStep, isExceptionRecordComplete } from './stepProfileHelpers'

interface Props {
  draft: IngredientCreationDraft | null
  saving?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  next: [payload: Partial<IngredientCreationDraftPayload>]
  'can-next': [value: boolean]
}>()

const userStore = useUserStore()

const operatorLabel = computed(() => {
  const info = userStore.userInfo as
    | { username?: unknown; userId?: unknown }
    | null
    | undefined
  if (typeof info?.username === 'string' && info.username.trim()) {
    return info.username.trim()
  }
  if (typeof info?.userId === 'string' && info.userId.trim()) {
    return info.userId.trim()
  }
  return '当前登录人'
})

const result = ref<FinalCheckResult | null>(null)
const exceptions = ref<ExceptionRecord[]>([])
const reasons = reactive<Record<string, string>>({})
const loading = ref(false)
const loadError = ref('')
const persisting = ref(false)
const pendingCode = ref<string | null>(null)
const initialized = ref(false)

const grouped = computed(() => groupCheckItems(result.value))

const summaryTitle = computed(() => {
  const data = grouped.value
  return `服务端终检：拦死 ${data.blocking.length} · 可例外 ${data.exceptionable.length} · 提醒 ${data.warnings.length}`
})

const summaryAlertType = computed<'success' | 'warning' | 'error'>(() => {
  if (grouped.value.blocking.length > 0) {
    return 'error'
  }
  if (grouped.value.exceptionable.length > 0) {
    return 'warning'
  }
  return 'success'
})

function fieldLabel(fieldPath: string): string {
  return PROFILE_FIELD_BY_PATH.get(fieldPath)?.label ?? fieldPath
}

/**
 * 例外写回草稿时用哪个站点。
 *
 * 正常在 ④ 就是 CHECK；从 ⑤ / ⑥ 回看时保留原站点，不能因为存一次例外
 * 就把草稿进度悄悄退回 CHECK。已提交（COMMIT）的草稿不再改写。
 */
function draftStepForException(): CreationStep | null {
  const step = props.draft?.step
  if (!step) {
    return null
  }
  const index = stepIndex(step)
  if (index >= stepIndex('COMMIT')) {
    return null
  }
  return index >= stepIndex('CHECK') ? step : 'CHECK'
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

function normalizeExceptions(
  records: readonly ExceptionRecord[] | null | undefined
): ExceptionRecord[] {
  if (!Array.isArray(records)) {
    return []
  }

  return records
    .filter(
      (record): record is ExceptionRecord =>
        Boolean(record) && typeof record.code === 'string'
    )
    .map((record) => ({
      code: record.code,
      reason: typeof record.reason === 'string' ? record.reason : '',
      approvedBy:
        typeof record.approvedBy === 'string' ? record.approvedBy : '',
      approvedAt: typeof record.approvedAt === 'string' ? record.approvedAt : ''
    }))
}

/**
 * 只有完整记录才算「已放行」：缺理由 / 操作人 / 时间的旧数据不能骗过闸门。
 */
function exceptionFor(code: string): ExceptionRecord | null {
  return (
    exceptions.value.find(
      (record) => record.code === code && isExceptionRecordComplete(record)
    ) ?? null
  )
}

function canApprove(code: string): boolean {
  return (reasons[code] ?? '').trim().length > 0
}

async function loadCheck() {
  const draft = props.draft
  if (!draft) {
    loadError.value = '草稿还没有创建，无法终检。'
    initialized.value = true
    emit('can-next', false)
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    // 同时读一次草稿：例外是上一轮直接写回草稿的，页面重进时必须恢复，
    // 不能因为父组件手里的草稿是旧快照就把已放行的记录弄丢。
    const [checkResult, latestDraft] = await Promise.all([
      ingredientCreationApi.runCheck(draft.id),
      ingredientCreationApi.getDraft(draft.id)
    ])

    result.value = checkResult
    exceptions.value = normalizeExceptions(
      latestDraft.payload.verify?.exceptions
    )
    initialized.value = true
  } catch (error) {
    result.value = null
    loadError.value = getApiErrorMessage(error, '终检失败，请稍后重试')
    initialized.value = true
    if (shouldToastApiError(error, '终检失败')) {
      ElMessage.error(loadError.value)
    }
  } finally {
    loading.value = false
    emit('can-next', canProceed.value)
  }
}

/**
 * 把一条例外 / 提醒确认写回草稿。
 *
 * 先乐观更新本地，失败时回滚并明确告知；绝不吞掉后端原因。
 */
async function persistException(
  record: ExceptionRecord,
  successMessage: string
): Promise<boolean> {
  if (persisting.value) {
    // 例外记录是整份数组写回：并发两个 PATCH 会让后到的旧数组覆盖前一条，
    // 所以同一时刻只允许一个写入，按钮也会在下一帧被禁用。
    ElMessage.info('正在保存上一条记录，请稍候再点')
    return false
  }

  const draft = props.draft
  if (!draft) {
    ElMessage.warning('草稿还没有创建，无法保存例外。')
    return false
  }
  const targetStep = draftStepForException()
  if (!targetStep) {
    ElMessage.warning('这份草稿已经提交，不能再修改例外记录。')
    return false
  }

  const previous = exceptions.value
  const next = [
    ...exceptions.value.filter((item) => item.code !== record.code),
    record
  ]
  exceptions.value = next
  persisting.value = true
  pendingCode.value = record.code

  try {
    await ingredientCreationApi.patchDraft(draft.id, targetStep, {
      checks: result.value ?? undefined,
      verify: { exceptions: next }
    })
    ElMessage.success(successMessage)
    return true
  } catch (error) {
    exceptions.value = previous
    if (shouldToastApiError(error, '保存例外失败')) {
      ElMessage.error(getApiErrorMessage(error, '保存例外失败'))
    }
    return false
  } finally {
    persisting.value = false
    pendingCode.value = null
    emit('can-next', canProceed.value)
  }
}

async function approveException(item: CheckItem) {
  const reason = (reasons[item.code] ?? '').trim()
  if (!reason) {
    ElMessage.warning('登记例外必须填写理由。')
    return
  }

  const saved = await persistException(
    {
      code: item.code,
      reason,
      approvedBy: operatorLabel.value,
      approvedAt: new Date().toISOString()
    },
    '已登记例外并放行'
  )
  if (saved) {
    reasons[item.code] = ''
  }
}

async function ackWarning(item: CheckItem) {
  await persistException(
    {
      code: item.code,
      reason: `已确认忽略提醒：${item.message}`,
      approvedBy: operatorLabel.value,
      approvedAt: new Date().toISOString()
    },
    '已记录：这条提醒被忽略'
  )
}

async function revokeException(code: string) {
  if (persisting.value) {
    ElMessage.info('正在保存上一条记录，请稍候再点')
    return
  }

  try {
    await ElMessageBox.confirm(
      '撤销后，这条规则重新回到「未处理」状态；已记录的操作人仍会留在草稿历史里。确定撤销？',
      '撤销放行 / 忽略记录？',
      {
        type: 'warning',
        confirmButtonText: '撤销',
        cancelButtonText: '保留'
      }
    )
  } catch {
    return
  }

  const draft = props.draft
  if (!draft) {
    return
  }
  const targetStep = draftStepForException()
  if (!targetStep) {
    ElMessage.warning('这份草稿已经提交，不能再修改例外记录。')
    return
  }

  const previous = exceptions.value
  const next = exceptions.value.filter((item) => item.code !== code)
  exceptions.value = next
  persisting.value = true
  pendingCode.value = code

  try {
    await ingredientCreationApi.patchDraft(draft.id, targetStep, {
      checks: result.value ?? undefined,
      verify: { exceptions: next }
    })
    ElMessage.success('已撤销')
  } catch (error) {
    exceptions.value = previous
    if (shouldToastApiError(error, '撤销失败')) {
      ElMessage.error(getApiErrorMessage(error, '撤销失败'))
    }
  } finally {
    persisting.value = false
    pendingCode.value = null
    emit('can-next', canProceed.value)
  }
}

const blockedReason = computed(() => {
  if (loading.value) {
    return '正在跑服务端终检…'
  }
  if (loadError.value) {
    return '终检没有跑成功，请先重试。'
  }
  if (!result.value) {
    return '还没有终检结果。'
  }
  if (grouped.value.blocking.length > 0) {
    return `有 ${grouped.value.blocking.length} 个拦死项：只能回上一步改数据，没有绕过按钮。`
  }

  const pendingExceptions = grouped.value.exceptionable.filter(
    (item) => !exceptionFor(item.code)
  )
  if (pendingExceptions.length > 0) {
    const codes = [...new Set(pendingExceptions.map((item) => item.code))]
    return `还有 ${codes.length} 条可例外规则没有填写理由放行：${codes.join('、')}`
  }

  if (persisting.value) {
    return '正在保存例外记录…'
  }

  return ''
})

const canProceed = computed(
  () =>
    initialized.value &&
    !loading.value &&
    !persisting.value &&
    canLeaveCheckStep(result.value, exceptions.value)
)

function submit() {
  if (!canProceed.value) {
    ElMessage.warning(blockedReason.value || '请先处理终检结果')
    return
  }

  // 例外已经逐条写回草稿；这里再随站点推进带一次，保证草稿与页面一致。
  emit('next', {
    checks: result.value ?? undefined,
    verify: { exceptions: exceptions.value }
  })
}

onMounted(() => {
  void loadCheck()
})

watch(canProceed, (value) => emit('can-next', value))

defineExpose({ submit })
</script>

<style scoped>
.check-step {
  gap: 18px;
}

.check-body {
  min-height: 200px;
}

.alert-body {
  margin: 4px 0 10px;
  font-size: 12px;
  line-height: 1.6;
}

.check-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.check-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #ebeef5;
  border-top-width: 3px;
  border-radius: 8px;
  background: #fff;
}

.check-column--blocking {
  border-top-color: #f56c6c;
  background: #fffafa;
}

.check-column--exceptionable {
  border-top-color: #e6a23c;
  background: #fffdf7;
}

.check-column--warnings {
  border-top-color: #909399;
  background: #fafafa;
}

.check-column__header h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: #303133;
  font-size: 15px;
}

.check-column__header p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.check-column__empty {
  padding: 16px 8px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  color: #909399;
  font-size: 13px;
  text-align: center;
}

.check-column__note {
  margin: 0;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.check-item {
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
}

.check-item--blocking {
  border-color: #fbc4c4;
}

.check-item--exceptionable {
  border-color: #f5dab1;
}

.check-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.check-item__code {
  color: #606266;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.check-item__message {
  margin: 6px 0 0;
  color: #303133;
  font-size: 13px;
  line-height: 1.6;
}

.check-item__field {
  margin: 6px 0 0;
  color: #909399;
  font-size: 12px;
}

.check-item__path {
  color: #c0c4cc;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.exception-approved {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid #c2e7b0;
  border-radius: 6px;
  background: #f0f9eb;
}

.exception-approved__reason {
  margin: 0;
  color: #303133;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.exception-approved__meta {
  margin: 4px 0 0;
  color: #909399;
  font-size: 11px;
}

.exception-form {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.exception-form :deep(.el-textarea) {
  width: 100%;
}

.next-hint {
  margin: 0;
  color: #e6a23c;
  font-size: 12px;
  text-align: right;
}

@media (max-width: 1100px) {
  .check-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
