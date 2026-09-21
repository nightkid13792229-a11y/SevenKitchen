import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() }
}))

vi.mock('@/api/recipeDesigner', () => ({
  recipeDesignerApi: {
    updateItem: vi.fn().mockResolvedValue({}),
    addItem: vi.fn().mockResolvedValue({}),
    removeItem: vi.fn().mockResolvedValue({}),
    batchUpdateItemOrder: vi.fn().mockResolvedValue({ updated: 0 })
  }
}))

import { useDesignerSaveQueue } from '../useDesignerSaveQueue'
import { recipeDesignerApi } from '@/api/recipeDesigner'

const api = recipeDesignerApi as unknown as Record<
  'updateItem' | 'addItem' | 'removeItem' | 'batchUpdateItemOrder',
  ReturnType<typeof vi.fn>
>

describe('useDesignerSaveQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('合并同一原料的连续 updateItem，只发送最后一次', async () => {
    const { enqueue, flushNow } = useDesignerSaveQueue()
    enqueue({ kind: 'updateItem', itemId: 'item-1', data: { weightG: 100 } })
    enqueue({ kind: 'updateItem', itemId: 'item-1', data: { weightG: 120 } })
    enqueue({ kind: 'updateItem', itemId: 'item-1', data: { weightG: 150 } })
    await flushNow()
    expect(api.updateItem).toHaveBeenCalledTimes(1)
    expect(api.updateItem).toHaveBeenCalledWith('item-1', { weightG: 150 })
  })

  it('撤销删除：删除请求未发送时可取消，服务器不执行删除', async () => {
    const { enqueue, flushNow, cancelPendingRemove } = useDesignerSaveQueue()
    enqueue({ kind: 'removeItem', itemId: 'item-9' })
    expect(cancelPendingRemove('item-9')).toBe(true)
    await flushNow()
    expect(api.removeItem).not.toHaveBeenCalled()
  })

  it('撤销删除：删除请求已发送后返回 false，需前端重建', async () => {
    const { enqueue, flushNow, cancelPendingRemove } = useDesignerSaveQueue()
    enqueue({ kind: 'removeItem', itemId: 'item-9' })
    await flushNow()
    expect(api.removeItem).toHaveBeenCalledTimes(1)
    expect(cancelPendingRemove('item-9')).toBe(false)
  })

  it('撤销排序：丢弃尚未发送的批量排序请求', async () => {
    const { enqueue, flushNow, cancelBatchOrders } = useDesignerSaveQueue()
    enqueue({ kind: 'batchOrder', order: [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 1 }] })
    cancelBatchOrders()
    await flushNow()
    expect(api.batchUpdateItemOrder).not.toHaveBeenCalled()
  })

  it('原料 id 失效：丢弃指向旧 id 的待保存 updateItem 与 removeItem', async () => {
    const { enqueue, flushNow, cancelItemOps } = useDesignerSaveQueue()
    enqueue({ kind: 'updateItem', itemId: 'old-1', data: { weightG: 80 } })
    enqueue({ kind: 'removeItem', itemId: 'old-1' })
    cancelItemOps('old-1')
    await flushNow()
    expect(api.updateItem).not.toHaveBeenCalled()
    expect(api.removeItem).not.toHaveBeenCalled()
  })

  it('未取消时按顺序串行发送全部操作', async () => {
    const { enqueue, flushNow } = useDesignerSaveQueue()
    enqueue({ kind: 'updateItem', itemId: 'a', data: { weightG: 10 } })
    enqueue({ kind: 'removeItem', itemId: 'b' })
    await flushNow()
    expect(api.updateItem).toHaveBeenCalledTimes(1)
    expect(api.removeItem).toHaveBeenCalledTimes(1)
  })

  it('hasPending 在队列清空且保存完成后为 false', async () => {
    const { enqueue, flushNow, hasPending } = useDesignerSaveQueue()
    expect(hasPending()).toBe(false)
    enqueue({ kind: 'updateItem', itemId: 'a', data: { weightG: 10 } })
    expect(hasPending()).toBe(true)
    await flushNow()
    expect(hasPending()).toBe(false)
  })

  it('删除一条已经不存在的原料（404）按成功处理，不再报错', async () => {
    api.removeItem.mockRejectedValueOnce({
      response: { status: 404, data: { message: 'Design recipe item x not found' } }
    })
    const { enqueue, flushNow, saveStatus, willAutoRetry } = useDesignerSaveQueue()
    enqueue({ kind: 'removeItem', itemId: 'item-gone' })
    await flushNow()
    expect(saveStatus.value).toBe('idle')
    expect(willAutoRetry.value).toBe(false)
  })

  it('一批操作里前面成功、后面失败时，重试不会重发已经成功的操作', async () => {
    api.updateItem.mockResolvedValueOnce({})
    api.removeItem
      .mockRejectedValueOnce({ response: { status: 500, data: { message: 'boom' } } })
      .mockResolvedValueOnce({})

    const { enqueue, flushNow } = useDesignerSaveQueue()
    enqueue({ kind: 'updateItem', itemId: 'item-1', data: { weightG: 120 } })
    enqueue({ kind: 'removeItem', itemId: 'item-2' })

    // 第一次 flush：updateItem 成功，removeItem 失败并等待自动重试
    await flushNow()
    expect(api.updateItem).toHaveBeenCalledTimes(1)
    expect(api.removeItem).toHaveBeenCalledTimes(1)

    // 手动再触发一次：只重发失败的删除，权重更新不再重复提交
    await flushNow()
    expect(api.updateItem).toHaveBeenCalledTimes(1)
    expect(api.removeItem).toHaveBeenCalledTimes(2)
  })

  it('服务端明确拒绝（4xx）的操作会被丢弃，不再阻塞后续操作', async () => {
    api.removeItem.mockRejectedValueOnce({
      response: { status: 400, data: { message: '已发布草稿不能编辑' } }
    })
    api.updateItem.mockResolvedValue({})

    const { enqueue, flushNow, saveStatus, willAutoRetry, hasPending } = useDesignerSaveQueue()
    enqueue({ kind: 'removeItem', itemId: 'item-locked' })
    enqueue({ kind: 'updateItem', itemId: 'item-1', data: { weightG: 130 } })

    await flushNow()

    expect(api.updateItem).toHaveBeenCalledTimes(1)
    expect(saveStatus.value).toBe('error')
    expect(willAutoRetry.value).toBe(false)
    expect(hasPending()).toBe(false)
  })

  it('网络错误会保留失败操作等待自动重试，并给出重试中状态', async () => {
    vi.useFakeTimers()
    try {
      api.updateItem
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({})

      const { enqueue, saveStatus, willAutoRetry, hasPending } = useDesignerSaveQueue()
      enqueue({ kind: 'updateItem', itemId: 'item-1', data: { weightG: 140 } })

      await vi.advanceTimersByTimeAsync(500)
      expect(api.updateItem).toHaveBeenCalledTimes(1)
      expect(saveStatus.value).toBe('error')
      expect(willAutoRetry.value).toBe(true)
      expect(hasPending()).toBe(true)

      await vi.advanceTimersByTimeAsync(1000)
      expect(api.updateItem).toHaveBeenCalledTimes(2)
      expect(saveStatus.value).toBe('idle')
      expect(hasPending()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
