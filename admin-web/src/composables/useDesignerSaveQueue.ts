/**
 * 设计器保存队列
 * - 权重等高频编辑：本地即时生效 + 防抖合并后串行保存
 * - 同一原料的连续修改只保留最后一次
 * - 单飞（in-flight）去重，避免旧请求覆盖新值（小程序端卡顿根因之一）
 * - 部分失败不丢已完成的操作：重试时只重发「失败的那条 + 其后未执行的」
 * - 服务端明确拒绝的操作（4xx）直接丢弃并提示，不再无限重试卡死整个队列
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type { DesignRecipeItemPayload, UpdateDesignRecipeItemPayload } from '@/api/recipeDesigner'

export type SaveOperation =
  | { kind: 'updateItem'; itemId: string; data: UpdateDesignRecipeItemPayload }
  | { kind: 'addItem'; draftId: string; data: DesignRecipeItemPayload }
  | { kind: 'removeItem'; itemId: string }
  | { kind: 'batchOrder'; order: Array<{ id: string; sortOrder: number }> }

const DEBOUNCE_MS = 500
const RETRY_DELAY_MS = 1000
const MAX_AUTO_RETRY = 3

function resolveErrorMessage(error: unknown): string {
  const candidate = error as {
    response?: { data?: { message?: string } }
    message?: string
  }
  return candidate?.response?.data?.message || candidate?.message || '保存失败'
}

function resolveStatusCode(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : null
}

/** 网络中断、超时、服务端临时故障才值得自动重试；4xx 是服务端明确拒绝，重试没有意义 */
function isRetryableSaveError(error: unknown): boolean {
  const status = resolveStatusCode(error)
  if (status === null) return true
  if (status === 408 || status === 429) return true
  return status >= 500
}

/** 删除一条已经不存在的原料，等价于删除成功（重复提交或上次响应丢失后的重试） */
function isAlreadyRemovedError(error: unknown): boolean {
  return resolveStatusCode(error) === 404
}

export function useDesignerSaveQueue() {
  const queue: SaveOperation[] = []
  let saving = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let errorCount = 0
  // itemId -> 该原料的删除操作是否已发送到服务器（用于撤销删除时判断是否需要重新创建）
  const removeSent = new Map<string, boolean>()

  const saveStatus = ref<'idle' | 'pending' | 'saving' | 'error'>('idle')
  const saveError = ref<string | null>(null)
  // 是否还会自动重试（error 状态下用于区分「还在自动重试」和「已放弃，需手动处理」）
  const willAutoRetry = ref(false)

  function scheduleFlush(delayMs: number) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delayMs)
  }

  /** 合并同一原料的连续 updateItem（保留最后一次） */
  function compactQueue() {
    const lastIndexByItem = new Map<string, number>()
    queue.forEach((op, index) => {
      if (op.kind === 'updateItem') lastIndexByItem.set(op.itemId, index)
    })
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const op = queue[index]!
      if (op.kind === 'updateItem' && lastIndexByItem.get(op.itemId) !== index) {
        queue.splice(index, 1)
      }
    }
  }

  function enqueue(op: SaveOperation) {
    // 合并同一原料的连续 updateItem
    if (op.kind === 'updateItem') {
      const index = queue.findIndex(
        (candidate) =>
          candidate.kind === 'updateItem' && candidate.itemId === op.itemId
      )
      if (index >= 0) {
        queue[index] = op
      } else {
        queue.push(op)
      }
    } else {
      queue.push(op)
      if (op.kind === 'removeItem') {
        removeSent.set(op.itemId, false)
      }
    }
    saveStatus.value = 'pending'
    willAutoRetry.value = false
    scheduleFlush(DEBOUNCE_MS)
  }

  /**
   * 撤销删除原料：若删除请求尚未发送（仍在队列中），取消它并返回 true（服务器上原料仍在，无需重建）；
   * 若已发送，返回 false（服务器上原料已删除，需通过新增接口重建）。
   */
  function cancelPendingRemove(itemId: string): boolean {
    const sent = removeSent.get(itemId)
    removeSent.delete(itemId)
    if (sent === false) {
      const index = queue.findIndex(
        (candidate) => candidate.kind === 'removeItem' && candidate.itemId === itemId
      )
      if (index >= 0) queue.splice(index, 1)
      return true
    }
    return false
  }

  /** 撤销/重做排序时丢弃尚未发送的批量排序请求，避免旧排序覆盖新排序 */
  function cancelBatchOrders(): void {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index]!.kind === 'batchOrder') {
        queue.splice(index, 1)
      }
    }
  }

  /** 原料 id 失效（如删除后重建）时，丢弃所有指向旧 id 的待保存操作 */
  function cancelItemOps(itemId: string): void {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const op = queue[index]!
      if (op.kind === 'updateItem' && op.itemId === itemId) {
        queue.splice(index, 1)
      } else if (op.kind === 'removeItem' && op.itemId === itemId) {
        queue.splice(index, 1)
        removeSent.delete(itemId)
      }
    }
  }

  /** 立即保存（用于离开页面等场景） */
  async function flushNow(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    await flush()
  }

  async function flush(): Promise<void> {
    if (saving || queue.length === 0) return
    saving = true
    saveStatus.value = 'saving'
    willAutoRetry.value = false
    const batch = queue.splice(0, queue.length)

    // 已经发送成功的位置不会重发；失败后只把「失败的那条 + 其后未执行的」放回队列
    let retryFromIndex = -1
    let retryError: unknown = null
    let rejectedError: unknown = null

    try {
      for (let index = 0; index < batch.length; index += 1) {
        const op = batch[index]!
        try {
          if (op.kind === 'removeItem') {
            removeSent.set(op.itemId, true)
          }
          await sendOp(op)
          // 只要有一条成功，就说明链路是通的，重置自动重试预算
          errorCount = 0
          saveError.value = null
        } catch (error) {
          if (op.kind === 'removeItem' && isAlreadyRemovedError(error)) {
            // 服务器上已经没有这条原料了：删除意图已经达成，按成功处理
            errorCount = 0
            saveError.value = null
            continue
          }

          if (isRetryableSaveError(error)) {
            retryFromIndex = index
            retryError = error
            break
          }

          // 服务端明确拒绝（例如草稿不可编辑、原料已被删除、参数非法）：
          // 丢掉这一条，继续保存后面的操作，避免一条坏操作把整个队列永久卡死
          rejectedError = error
          saveError.value = resolveErrorMessage(error)
        }
      }
    } finally {
      saving = false
    }

    if (retryFromIndex >= 0) {
      queue.unshift(...batch.slice(retryFromIndex))
      compactQueue()
      errorCount += 1
      saveError.value = resolveErrorMessage(retryError)
      saveStatus.value = 'error'
      if (errorCount <= MAX_AUTO_RETRY) {
        willAutoRetry.value = true
        scheduleFlush(RETRY_DELAY_MS)
      } else {
        willAutoRetry.value = false
        ElMessage.error('多次保存失败，请检查网络后手动保存')
      }
      return
    }

    if (rejectedError) {
      saveStatus.value = 'error'
      willAutoRetry.value = false
      return
    }

    errorCount = 0
    saveError.value = null
    saveStatus.value = 'idle'
  }

  async function sendOp(op: SaveOperation): Promise<void> {
    switch (op.kind) {
      case 'updateItem':
        await recipeDesignerApi.updateItem(op.itemId, op.data)
        break
      case 'addItem':
        await recipeDesignerApi.addItem(op.draftId, op.data)
        break
      case 'removeItem':
        await recipeDesignerApi.removeItem(op.itemId)
        break
      case 'batchOrder':
        await recipeDesignerApi.batchUpdateItemOrder(op.order)
        break
    }
  }

  function hasPending(): boolean {
    return queue.length > 0 || saving
  }

  return {
    saveStatus,
    saveError,
    willAutoRetry,
    enqueue,
    flushNow,
    hasPending,
    cancelPendingRemove,
    cancelBatchOrders,
    cancelItemOps
  }
}
