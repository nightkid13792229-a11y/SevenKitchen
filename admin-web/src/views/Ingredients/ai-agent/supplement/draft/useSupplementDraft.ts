/**
 * 补剂草稿的页面状态与自动保存。
 *
 * 主要职责：
 * - 读/存草稿（PATCH 整份 payload + manualFields + `expectedUpdatedAt` 乐观锁）；
 * - 800ms 防抖自动保存；保存中不并发第二次，等人停手后补一次；
 * - 409 时只提示「草稿已被更新」，**不拿本地值覆盖**（本地继续保留，等人刷新）；
 * - AI 起草 / 最终校验 / 最终写入 / 放弃 / 重新核验的 loading 与错误状态。
 *
 * 两条容易踩的规矩（2026-11-22 复核）：
 * 1. **异步结果只属于发起它的那张草稿**。所有请求进入时记一个 epoch（reset/load
 *    会递增），回来时 epoch 变了、或 `draftId` 已经不是当时的 id，就整段丢弃——
 *    不写 draft/review/verification/dirty/saveError，避免 A 草稿的 AI/校验结果
 *    覆盖刚打开的 B。
 * 2. **保存状态必须真实**。`dirty` 只由人可编辑的三块（name/payload/manualFields）
 *    变化置真；`saveError` 是与 AI/校验错误分开的通道。防抖还没发请求时
 *    显示的是「未保存」，不是「已保存」。
 *
 * 返回值在 Task 13 要求的
 * `{ draft, loading, saving, aiRunning, validating, error, load, save, runAi,
 * validate, finalize, discard, reverify }` 之外，额外暴露 `review` /
 * `verification` / `finalizing` / `dirty` / `saveError` / `reset`：
 * 审核屏与核验页要读它们；Flow 返回列表时要 `reset()` 清掉上下文。
 */
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'
import {
  supplementDraftsApi,
  type SupplementDraftFinalizeResult,
  type SupplementDraftPayload,
  type SupplementDraftReview,
  type SupplementDraftView,
  type SupplementWriteVerification
} from '@/api/supplementDrafts'
import { getApiErrorMessage } from '@/utils/apiError'
import { canFinalize, hasBlocker } from './supplementDraftState'

/** 自动保存防抖：人停手 800ms 后才发 PATCH。 */
const AUTOSAVE_DEBOUNCE_MS = 800

/** 判「内容有没有变」只比人可编辑的三块，`updatedAt` 等元数据不参与。 */
function signatureOf(draft: SupplementDraftView | null): string {
  if (!draft) return ''
  return JSON.stringify([draft.name, draft.payload, draft.manualFields])
}

/** axios 错误的 HTTP 状态码；不是 HTTP 错误返回 null。 */
function statusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response
    ?.status
  return typeof status === 'number' ? status : null
}

/** 已确认提醒 → 与后端一致的 ackKey（`code:paramsHash`，无参数时就是 code）。 */
function acknowledgedKeysOf(payload: SupplementDraftPayload): string[] {
  return payload.review.acknowledgedWarnings.map((entry) =>
    entry.paramsHash ? `${entry.code}:${entry.paramsHash}` : entry.code
  )
}

export function useSupplementDraft(draftId: Ref<string | null>) {
  const draft = ref<SupplementDraftView | null>(null)
  const review = ref<SupplementDraftReview | null>(null)
  const verification = ref<SupplementWriteVerification | null>(null)

  const loading = ref(false)
  const saving = ref(false)
  const aiRunning = ref(false)
  const validating = ref(false)
  const finalizing = ref(false)
  /** 读写/AI/校验等非保存类错误；保存失败单独走 `saveError`。 */
  const error = ref<string | null>(null)
  /** 保存失败的中文原因；保存成功后清空。 */
  const saveError = ref('')
  /** 有没有还没存到服务端的修改。 */
  const dirty = ref(false)

  /**
   * 请求代次：`reset()` / `load()` 递增。请求回来时代次不同就丢弃结果。
   */
  let epoch = 0
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  /** 最近一次与服务端一致的内容签名；本地改过就与它不同。 */
  let lastKnownSignature = ''
  /** 最近一次 validate 针对的内容签名；内容变了就说明审核结果已过期。 */
  let validatedSignature = ''
  /** 保存/AI/校验进行中人又改了：等动作结束再补一次自动保存。 */
  let pendingAutosave = false
  let disposed = false

  /** 开启新一轮请求代次，让所有在飞的旧请求失效。 */
  function nextEpoch(): number {
    epoch += 1
    return epoch
  }

  /** 结果回来时还属于同一次请求、同一张草稿，才允许写状态。 */
  function isCurrent(epochAtStart: number, idAtStart: string | null): boolean {
    return epochAtStart === epoch && draftId.value === idAtStart
  }

  function clearAutosaveTimer(): void {
    if (autosaveTimer !== null) {
      clearTimeout(autosaveTimer)
      autosaveTimer = null
    }
  }

  /** 服务端返回的是权威内容：整体替换，并把签名记成已同步。 */
  function applyServerDraft(next: SupplementDraftView): void {
    draft.value = next
    lastKnownSignature = signatureOf(next)
    dirty.value = false
    saveError.value = ''
  }

  /**
   * 只回写服务端元数据，不覆盖本地未保存的 name/payload/manualFields。
   *
   * 保存期间人如果又改了，响应里的旧载荷不能把新值盖掉；这里保留本地内容，
   * 只更新乐观锁时间、完成度和核验报告，随后 watcher 会再排一次保存。
   * `dirty` 保持原值：本地还有没保存的修改。
   */
  function mergeServerMeta(next: SupplementDraftView): void {
    if (!draft.value || signatureOf(draft.value) === lastKnownSignature) {
      applyServerDraft(next)
      return
    }
    draft.value = {
      ...draft.value,
      updatedAt: next.updatedAt,
      completeness: next.completeness,
      aiSnapshot: next.aiSnapshot,
      verification: next.verification
    }
    lastKnownSignature = signatureOf(next)
  }

  /** 动作结束后把「进行中攒下的修改」补存一次。 */
  function drainPendingAutosave(): void {
    if (!pendingAutosave) return
    pendingAutosave = false
    if (!draft.value || disposed) return
    if (signatureOf(draft.value) === lastKnownSignature) return
    if (saving.value || loading.value || aiRunning.value || validating.value || finalizing.value) {
      pendingAutosave = true
      return
    }
    scheduleAutosave()
  }

  function scheduleAutosave(delayMs = AUTOSAVE_DEBOUNCE_MS): void {
    if (disposed) return
    clearAutosaveTimer()
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      void save()
    }, delayMs)
  }

  // 只盯人可编辑的三块；服务端写回时签名已同步，不会自触发死循环。
  watch(
    () =>
      draft.value
        ? [draft.value.name, draft.value.payload, draft.value.manualFields]
        : null,
    () => {
      if (!draft.value || loading.value) return
      if (signatureOf(draft.value) === lastKnownSignature) {
        // 改回原样（或服务端刚写回）：没有未保存改动。
        dirty.value = false
        saveError.value = ''
        return
      }
      // 人真的改了：在保存成功/服务端写回之前，状态就叫「未保存」。
      dirty.value = true
      if (
        saving.value ||
        aiRunning.value ||
        validating.value ||
        finalizing.value
      ) {
        pendingAutosave = true
        return
      }
      scheduleAutosave()
    },
    { deep: true }
  )

  /**
   * 保存前先把本地改动落库（AI/校验/finalize 读的是服务端草稿）。
   *
   * 返回 false 表示仍有未保存内容（保存失败或保存期间又改了），
   * 调用方应中止本次动作，避免拿旧数据做决定。
   */
  async function flushPendingSave(): Promise<boolean> {
    if (!draft.value) return false
    if (signatureOf(draft.value) === lastKnownSignature) return true
    clearAutosaveTimer()
    await save()
    return signatureOf(draft.value) === lastKnownSignature
  }

  /**
   * 清空当前草稿上下文（Flow 返回草稿列表时调用）。
   *
   * 递增 epoch 让所有在飞请求的结果作废，并清掉 loading/保存中/AI 中等标记，
   * 否则回到列表后这些标记会卡住下一张草稿的按钮。
   */
  function reset(): void {
    nextEpoch()
    clearAutosaveTimer()
    pendingAutosave = false
    draft.value = null
    review.value = null
    verification.value = null
    loading.value = false
    saving.value = false
    aiRunning.value = false
    validating.value = false
    finalizing.value = false
    error.value = null
    saveError.value = ''
    dirty.value = false
    lastKnownSignature = ''
    validatedSignature = ''
  }

  /** 读草稿；`draftId` 为空时清空状态（列表页/新建前）。 */
  async function load(): Promise<SupplementDraftView | null> {
    const id = draftId.value
    // 新一次加载让旧请求全部作废，也把上一张草稿的动作标记清掉。
    const epochAtStart = nextEpoch()
    clearAutosaveTimer()
    pendingAutosave = false
    review.value = null
    validatedSignature = ''
    error.value = null
    saveError.value = ''
    loading.value = false
    saving.value = false
    aiRunning.value = false
    validating.value = false
    finalizing.value = false

    if (!id) {
      draft.value = null
      verification.value = null
      lastKnownSignature = ''
      dirty.value = false
      return null
    }

    loading.value = true
    try {
      const loaded = await supplementDraftsApi.get(id)
      if (!isCurrent(epochAtStart, id)) return null
      applyServerDraft(loaded)
      verification.value = loaded.verification
      return loaded
    } catch (err) {
      if (!isCurrent(epochAtStart, id)) return null
      error.value = getApiErrorMessage(err, '加载草稿失败')
      return null
    } finally {
      if (epochAtStart === epoch) {
        loading.value = false
      }
    }
  }

  /**
   * PATCH 保存整份草稿。
   *
   * 409 是乐观锁冲突：说明别处（或 AI）已经改过这张草稿，这里只报错，
   * 不刷新、不覆盖本地内容——由人决定刷新还是复制自己的改动。
   *
   * 失败写 `saveError`（不复用共享 `error`），并保持 `dirty=true`，
   * 这样编辑页显示「保存失败」而不是假装已保存。
   */
  async function save(): Promise<SupplementDraftView | null> {
    const current = draft.value
    if (!current || !draftId.value) return null
    if (loading.value || saving.value || aiRunning.value || validating.value || finalizing.value) {
      if (saving.value) pendingAutosave = true
      return null
    }
    const idAtStart = current.id
    const epochAtStart = epoch
    clearAutosaveTimer()
    pendingAutosave = false
    const sentSignature = signatureOf(current)

    saving.value = true
    saveError.value = ''
    try {
      const updated = await supplementDraftsApi.update(current.id, {
        name: current.name,
        payload: current.payload,
        manualFields: current.manualFields,
        expectedUpdatedAt: current.updatedAt
      })
      if (!isCurrent(epochAtStart, idAtStart)) return null
      if (signatureOf(draft.value) === sentSignature) {
        applyServerDraft(updated)
      } else {
        // 保存期间人又改了：保留本地新值，只同步服务端时间/完成度。
        mergeServerMeta(updated)
        dirty.value = true
        pendingAutosave = true
      }
      saveError.value = ''
      return updated
    } catch (err) {
      if (!isCurrent(epochAtStart, idAtStart)) return null
      saveError.value =
        statusOf(err) === 409
          ? '草稿已被更新，请刷新后再试'
          : getApiErrorMessage(err, '保存草稿失败')
      dirty.value = true
      return null
    } finally {
      if (epochAtStart === epoch) {
        saving.value = false
        drainPendingAutosave()
      }
    }
  }

  /**
   * AI 起草/重填。两张图都在才发请求；成功后用响应整体替换草稿。
   *
   * AI 读的是服务端草稿，所以先把本地未保存的改动存掉。
   * 请求回来时如果已经切走（reset/load 让 epoch 变了），结果整段丢弃。
   */
  async function runAi(): Promise<SupplementDraftView | null> {
    if (!draft.value || loading.value || aiRunning.value) return null

    const evidence = draft.value.payload.evidence
    if (!evidence.frontImageUrl.trim() || !evidence.labelImageUrl.trim()) {
      error.value = '请先上传商品正面图和标签图，再让 AI 起草'
      return null
    }

    const flushed = await flushPendingSave()
    if (!flushed) {
      if (!error.value && !saveError.value) {
        error.value = '草稿还没保存成功，先保存再让 AI 起草'
      }
      return null
    }
    const current = draft.value
    if (!current) return null
    const idAtStart = current.id
    const epochAtStart = epoch
    const latestEvidence = current.payload.evidence

    clearAutosaveTimer()
    pendingAutosave = false
    aiRunning.value = true
    error.value = null
    try {
      const updated = await supplementDraftsApi.aiFill(current.id, {
        frontImageUrl: latestEvidence.frontImageUrl,
        labelImageUrl: latestEvidence.labelImageUrl,
        productUrl: latestEvidence.productUrl,
        selectionNote: latestEvidence.selectionNote
      })
      if (!isCurrent(epochAtStart, idAtStart)) return null
      applyServerDraft(updated)
      verification.value = updated.verification
      review.value = null
      validatedSignature = ''
      return updated
    } catch (err) {
      if (!isCurrent(epochAtStart, idAtStart)) return null
      error.value = getApiErrorMessage(err, 'AI 起草失败，草稿已保留，可重试')
      return null
    } finally {
      if (epochAtStart === epoch) {
        aiRunning.value = false
        drainPendingAutosave()
      }
    }
  }

  /** 跑最终校验；结果存进 `review`，审核屏用它展示阻断/提醒。 */
  async function validate(): Promise<SupplementDraftReview | null> {
    if (!draft.value || loading.value || validating.value) return null

    const flushed = await flushPendingSave()
    if (!flushed) {
      if (!error.value && !saveError.value) {
        error.value = '草稿还没保存成功，先保存再校验'
      }
      return null
    }
    const current = draft.value
    if (!current) return null
    const idAtStart = current.id
    const epochAtStart = epoch

    validating.value = true
    error.value = null
    try {
      const result = await supplementDraftsApi.validate(current.id)
      if (!isCurrent(epochAtStart, idAtStart)) return null
      review.value = result
      mergeServerMeta(result.draft)
      validatedSignature = signatureOf(result.draft)
      return result
    } catch (err) {
      if (!isCurrent(epochAtStart, idAtStart)) return null
      error.value = getApiErrorMessage(err, '校验失败，请重试')
      return null
    } finally {
      if (epochAtStart === epoch) {
        validating.value = false
        drainPendingAutosave()
      }
    }
  }

  /**
   * 最终写入。
   *
   * - 没有审核结果（或审核后内容又变了）先 validate；
   * - 有阻断项或提醒没逐条确认 → 不调 finalize；
   * - 成功后把核验报告存进 `verification`（页面据此显示「全部成功」或
   *   「已写入，但功能未生效」）。
   * - 与 validate 一样带 epoch/id 守卫：切走后的写入结果不落到新草稿。
   */
  async function finalize(): Promise<SupplementDraftFinalizeResult | null> {
    if (!draft.value || loading.value || finalizing.value) return null

    const flushed = await flushPendingSave()
    if (!flushed) {
      if (!error.value && !saveError.value) {
        error.value = '草稿还没保存成功，先保存再写入'
      }
      return null
    }

    const idAtStart = draftId.value
    const epochAtStart = epoch
    const currentSignature = signatureOf(draft.value)
    const currentReview =
      review.value && validatedSignature === currentSignature
        ? review.value
        : await validate()
    if (!currentReview) return null
    if (!isCurrent(epochAtStart, idAtStart)) return null

    const target = draft.value
    if (!target || target.id !== idAtStart) return null

    if (!canFinalize(currentReview, acknowledgedKeysOf(target.payload))) {
      error.value = hasBlocker(currentReview)
        ? '还有阻断项没解决，改完再写入'
        : '还有未确认的提醒项，请逐条勾选「我知道了」'
      return null
    }

    finalizing.value = true
    error.value = null
    try {
      const result = await supplementDraftsApi.finalize(target.id, {
        expectedUpdatedAt: target.updatedAt
      })
      if (!isCurrent(epochAtStart, target.id)) return null
      verification.value = result.verification
      draft.value = {
        ...target,
        status: 'FINALIZED',
        finalizedIngredientId: result.ingredientId,
        finalizedNutritionFoodId: result.nutritionFoodId,
        finalizedEvidenceId: result.evidenceId,
        verification: result.verification
      }
      lastKnownSignature = signatureOf(draft.value)
      dirty.value = false
      saveError.value = ''
      return result
    } catch (err) {
      if (!isCurrent(epochAtStart, target.id)) return null
      error.value = getApiErrorMessage(err, '写入失败，草稿已保留')
      return null
    } finally {
      if (epochAtStart === epoch) {
        finalizing.value = false
        drainPendingAutosave()
      }
    }
  }

  /** 放弃草稿（软删）；成功后清空本地状态，页面自己回列表。 */
  async function discard(): Promise<SupplementDraftView | null> {
    const current = draft.value
    if (!current || loading.value) return null
    const idAtStart = current.id
    const epochAtStart = epoch
    clearAutosaveTimer()
    pendingAutosave = false
    error.value = null
    saveError.value = ''
    try {
      const discarded = await supplementDraftsApi.discard(current.id)
      if (!isCurrent(epochAtStart, idAtStart)) return null
      draft.value = null
      review.value = null
      verification.value = null
      lastKnownSignature = ''
      validatedSignature = ''
      dirty.value = false
      saveError.value = ''
      return discarded
    } catch (err) {
      if (!isCurrent(epochAtStart, idAtStart)) return null
      error.value = getApiErrorMessage(err, '放弃草稿失败')
      return null
    }
  }

  /** 只重跑功能核验，不写数据。 */
  async function reverify(): Promise<SupplementWriteVerification | null> {
    const current = draft.value
    if (!current) return null
    const idAtStart = current.id
    const epochAtStart = epoch
    error.value = null
    try {
      const result = await supplementDraftsApi.reverify(current.id)
      if (!isCurrent(epochAtStart, idAtStart)) return null
      verification.value = result
      return result
    } catch (err) {
      if (!isCurrent(epochAtStart, idAtStart)) return null
      error.value = getApiErrorMessage(err, '重新核验失败')
      return null
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true
      // 卸载后回来的请求也不许再写状态。
      nextEpoch()
      clearAutosaveTimer()
    })
  }

  return {
    draft,
    review,
    verification,
    loading,
    saving,
    aiRunning,
    validating,
    finalizing,
    error,
    saveError,
    dirty,
    load,
    save,
    runAi,
    validate,
    finalize,
    discard,
    reverify,
    reset
  }
}
