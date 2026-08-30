/**
 * 设计器保存队列
 * - 权重等高频编辑：本地即时生效 + 防抖合并后串行保存
 * - 同一原料的连续修改只保留最后一次
 * - 单飞（in-flight）去重，避免旧请求覆盖新值（小程序端卡顿根因之一）
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

export function useDesignerSaveQueue() {
  const queue: SaveOperation[] = []
  let saving = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let errorCount = 0
  // itemId -> 该原料的删除操作是否已发送到服务器（用于撤销删除时判断是否需要重新创建）
  const removeSent = new Map<string, boolean>()

  const saveStatus = ref<'idle' | 'pending' | 'saving' | 'error'>('idle')
  const saveError = ref<string | null>(null)

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
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void flush()
    }, DEBOUNCE_MS)
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
    const batch = queue.splice(0, queue.length)
    try {
      for (const op of batch) {
        if (op.kind === 'removeItem') {
          removeSent.set(op.itemId, true)
        }
        await sendOp(op)
      }
      errorCount = 0
      saveError.value = null
      saveStatus.value = 'idle'
    } catch (error: any) {
      errorCount += 1
      saveError.value = error?.message || '保存失败'
      saveStatus.value = 'error'
      // 失败的批次放回队列头，稍后重试
      queue.unshift(...batch)
      if (errorCount <= 3) {
        setTimeout(() => {
          void flush()
        }, 1000)
      } else {
        ElMessage.error('多次保存失败，请检查网络后手动保存')
      }
    } finally {
      saving = false
    }
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
    enqueue,
    flushNow,
    hasPending,
    cancelPendingRemove,
    cancelBatchOrders,
    cancelItemOps
  }
}
