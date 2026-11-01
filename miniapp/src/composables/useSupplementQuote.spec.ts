import { describe, expect, it, vi } from 'vitest'
import { useSupplementQuote, type QuoteFn } from './useSupplementQuote'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function okQuote(multiplier = 1, bags = 3) {
  return {
    code: 0,
    data: {
      quote: {
        lines: [],
        bagCount: bags,
        total: 100 * multiplier,
        portionOptions: [],
        maxPortionMultiplier: 3,
      } as any,
      unavailable: [],
      enabled: true,
      minOrderAmount: 0,
      paymentTimeoutMinutes: 30,
      bulkBagThreshold: 60,
    },
  }
}

describe('useSupplementQuote', () => {
  it('加载成功后进入 ready，默认全选，且只发一次请求', async () => {
    const quote = vi.fn().mockResolvedValue(okQuote())
    const state = useSupplementQuote({ quote })

    await state.load([
      { ingredientId: 'a', recipeItemId: 'r1' },
      { ingredientId: 'b', amount: 50 },
    ])

    expect(state.status.value).toBe('ready')
    expect(state.selectedIds.value).toEqual(['a', 'b'])
    expect(state.canSubmit.value).toBe(true)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(quote.mock.calls[0][0]).toEqual([
      { ingredientId: 'a', recipeItemId: 'r1' },
      { ingredientId: 'b', amount: 50 },
    ])
  })

  it('改套数失败时，套数与勾选都回滚，且禁止提交', async () => {
    const quote = vi
      .fn()
      .mockResolvedValueOnce(okQuote(1))
      .mockRejectedValueOnce(new Error('网络断了'))
    const state = useSupplementQuote({ quote })

    await state.load([{ ingredientId: 'a', recipeItemId: 'r1' }])
    await state.setPortion(5)

    expect(state.portionMultiplier.value).toBe(1)
    expect(state.status.value).toBe('failed')
    expect(state.errorMessage.value).toBe('网络断了')
    expect(state.canSubmit.value).toBe(false)
  })

  it('先发后到的旧响应会被丢弃', async () => {
    const slow = deferred<any>()
    const fast = deferred<any>()
    const quote = vi
      .fn<Parameters<QuoteFn>, ReturnType<QuoteFn>>()
      .mockReturnValueOnce(slow.promise as any)
      .mockReturnValueOnce(fast.promise as any)
    const state = useSupplementQuote({ quote })

    const first = state.load([{ ingredientId: 'a', recipeItemId: 'r1' }])
    const second = state.setPortion(2)

    fast.resolve(okQuote(2, 6))
    await second
    slow.resolve(okQuote(1, 3))
    await first

    expect(state.summary.value?.total).toBe(200)
    expect(state.portionMultiplier.value).toBe(2)
  })

  it('全选会跳过不可购买的补剂', async () => {
    const quote = vi.fn().mockImplementation(async (lines: any[]) => ({
      ...okQuote(1, lines.length),
      data: {
        ...okQuote(1, lines.length).data,
        unavailable: [{ ingredientId: 'b', name: 'B', reason: '暂未开放购买' }],
      },
    }))
    const state = useSupplementQuote({ quote })

    await state.load([
      { ingredientId: 'a', recipeItemId: 'r1' },
      { ingredientId: 'b', recipeItemId: 'r2' },
    ])

    expect(state.selectableLines.value.map((line) => line.ingredientId)).toEqual(['a'])
    expect(state.selectedIds.value).toEqual(['a'])

    await state.toggleAll()
    expect(state.selectedIds.value).toEqual([])
    await state.toggleAll()
    expect(state.selectedIds.value).toEqual(['a'])
  })

  it('勾选失败时回滚到上一次确认的选择', async () => {
    const quote = vi
      .fn()
      .mockResolvedValueOnce(okQuote(1))
      .mockRejectedValueOnce(new Error('超时'))
    const state = useSupplementQuote({ quote })

    await state.load([
      { ingredientId: 'a', recipeItemId: 'r1' },
      { ingredientId: 'b', recipeItemId: 'r2' },
    ])
    await state.toggleLine('b')

    expect(state.selectedIds.value).toEqual(['a', 'b'])
    expect(state.status.value).toBe('failed')
  })
})
