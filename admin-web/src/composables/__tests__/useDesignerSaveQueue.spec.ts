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
})
