import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/config', () => ({
  getBaseUrl: () => 'https://api.example.com/api/v1',
}))

vi.mock('../utils/api', async () => {
  const actual =
    await vi.importActual<typeof import('../utils/api')>('../utils/api')
  return {
    ...actual,
    request: vi.fn(),
  }
})

import {
  cancelOrder,
  confirmReceipt,
  fetchCustomRecipeQuote,
  fetchDelivery,
  fetchNextDeliveryDate,
  fetchOrderDetail,
  fetchPublicConfig,
  findAction,
  toneToClass,
  type RenderableOrderView,
} from './custom-recipe'
import { request } from '../utils/api'

const mockedRequest = vi.mocked(request)

/**
 * 定制食谱 API 层 · 测试（2026-10-16，批次 2.8）
 *
 * ## 这组测试的重点不是"请求发出去了"，而是**页面不用再自己判断**
 *
 * 后端从 2026-10-16 起下发 `renderable`（能不能点、为什么不能点都是后端算好的）。
 * 这一层要保证：**原样透传，不做加工**。
 * 一旦这里"顺手补一个默认值"，前端就又变回在判断业务了。
 */

function view(overrides: Partial<RenderableOrderView> = {}): RenderableOrderView {
  return {
    status: {
      code: 'DELIVERED',
      label: '已交付',
      tone: 'success',
      customerHint: '专属食谱已经完成，确认一下就能开始用了。',
    },
    actions: [
      { code: 'VIEW_DELIVERY', label: '查看定制食谱', enabled: true },
      {
        code: 'CANCEL_SELF',
        label: '取消订单',
        enabled: false,
        disabledReason: '食谱已经交付，不能取消；不满意可以申请售后',
      },
      { code: 'CONTACT_SERVICE', label: '联系客服', enabled: true },
    ],
    ...overrides,
  }
}

describe('定制食谱 API 层', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
  })

  describe('fetchOrderDetail', () => {
    it('成功时返回 data 本体（不是整个信封）', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        message: 'ok',
        data: { orderId: 'CR202610160001', status: 'DELIVERED' },
      } as never)

      const detail = await fetchOrderDetail('CR202610160001')

      expect(detail?.orderId).toBe('CR202610160001')
    })

    it('用业务编号拼路径，并做 URL 编码', async () => {
      mockedRequest.mockResolvedValue({ code: 0, data: {} } as never)

      await fetchOrderDetail('CR/2026 001')

      const arg = mockedRequest.mock.calls[0][0] as { url: string }
      expect(arg.url).toBe('/custom-recipe/orders/CR%2F2026%20001')
    })

    it('业务错误（code 非 0）时返回 null，而不是抛给页面', async () => {
      mockedRequest.mockResolvedValue({
        code: 404,
        message: '定制订单不存在',
      } as never)

      expect(await fetchOrderDetail('CR-不存在')).toBeNull()
    })

    it('★ renderable 原样透传 —— 一个字段都不加工', async () => {
      const original = view()
      mockedRequest.mockResolvedValue({
        code: 0,
        data: { orderId: 'CR1', status: 'DELIVERED', renderable: original },
      } as never)

      const detail = await fetchOrderDetail('CR1')

      expect(detail?.renderable).toEqual(original)
      // 尤其是"为什么不能点"这句，绝不能被这里覆盖成通用文案
      expect(
        findAction(detail?.renderable, 'CANCEL_SELF')?.disabledReason,
      ).toContain('食谱已经交付')
    })

    it('★ 老后端不返回 renderable 时，页面能拿到 undefined 而不是崩溃', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: { orderId: 'CR1', status: 'DELIVERED' },
      } as never)

      const detail = await fetchOrderDetail('CR1')

      expect(detail?.renderable).toBeUndefined()
      // 降级路径：页面回退到自己的状态文案表
      expect(findAction(detail?.renderable, 'CANCEL_SELF')).toBeUndefined()
    })
  })

  describe('fetchPublicConfig', () => {
    it('成功时返回设置本体，且不再包含成品抵扣字段', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: {
          feeAmount: 300,
          deliveryWorkDays: 3,
          multiRecipeEnabled: true,
          maxRecipeQuantity: 4,
          multiRecipeDiscounts: [
            { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
          ],
        },
      } as never)

      const config = await fetchPublicConfig()

      expect(config?.feeAmount).toBe(300)
      expect(config?.deliveryWorkDays).toBe(3)
      // 2026-10-20 多份购买：确认页需要开关、上限和优惠档位
      expect(config?.multiRecipeEnabled).toBe(true)
      expect(config?.maxRecipeQuantity).toBe(4)
      expect(config?.multiRecipeDiscounts).toEqual([
        { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
      ])
      // 2026-10-20：抵扣机制已取消，类型里不再有 creditAmount
      expect(config).not.toHaveProperty('creditAmount')
    })

    it('★ 失败时**抛错**，而不是静默返回默认值', async () => {
      mockedRequest.mockRejectedValue(new Error('network') as never)

      /**
       * 失败时的兜底会直接变成顾客看到的价格。
       * 后台把定制费改成 500，接口一挂却显示默认的 300 ——
       * 顾客会照着错的价格下单。所以宁可报"加载失败"。
       */
      await expect(fetchPublicConfig()).rejects.toThrow()
    })

    it('业务错误（code 非 0）也抛错，并把后端的原因带出来', async () => {
      mockedRequest.mockResolvedValue({
        code: 500,
        message: '配置读取失败',
      } as never)

      await expect(fetchPublicConfig()).rejects.toThrow('配置读取失败')
    })
  })

  describe('fetchNextDeliveryDate', () => {
    it('带 quantity 时把份数拼进查询串，让后端按 N 份算交期', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: {
          quantity: 3,
          scheduledDate: '2026-10-19',
          estimatedDeliveryDate: '2026-10-21',
          deliveryWorkDays: 2,
        },
      } as never)

      const delivery = await fetchNextDeliveryDate(3)

      expect(delivery.estimatedDeliveryDate).toBe('2026-10-21')
      const arg = mockedRequest.mock.calls[0][0] as {
        url: string
        method: string
      }
      expect(arg.url).toBe('/custom-recipe/next-delivery-date?quantity=3')
      expect(arg.method).toBe('GET')
    })

    it('不传 quantity 时保持原来的无查询串调用（单份行为不变）', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: {
          scheduledDate: '2026-10-19',
          estimatedDeliveryDate: '2026-10-20',
          deliveryWorkDays: 1,
        },
      } as never)

      await fetchNextDeliveryDate()

      const arg = mockedRequest.mock.calls[0][0] as { url: string }
      expect(arg.url).toBe('/custom-recipe/next-delivery-date')
    })

    it('份数不合法时发请求前就拒绝', async () => {
      await expect(fetchNextDeliveryDate(0)).rejects.toThrow('份数不正确')
      await expect(fetchNextDeliveryDate(1.5)).rejects.toThrow('份数不正确')
      expect(mockedRequest).not.toHaveBeenCalled()
    })
  })

  describe('fetchCustomRecipeQuote', () => {
    it('用 GET /custom-recipe/quote?quantity=N 取后端权威报价', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: {
          quantity: 3,
          unitAmount: 300,
          originalAmount: 900,
          discountRate: 0.08,
          discountAmount: 72,
          payableAmount: 828,
        },
      } as never)

      const quote = await fetchCustomRecipeQuote(3)

      expect(quote.payableAmount).toBe(828)
      const arg = mockedRequest.mock.calls[0][0] as {
        url: string
        method: string
      }
      expect(arg.url).toBe('/custom-recipe/quote?quantity=3')
      expect(arg.method).toBe('GET')
    })

    it('后端拒绝时抛错，不自己算一个价格兜底', async () => {
      mockedRequest.mockResolvedValue({
        code: 400,
        message: '多份购买暂未开放，请选择 1 份',
      } as never)

      await expect(fetchCustomRecipeQuote(2)).rejects.toThrow(
        '多份购买暂未开放',
      )
    })

    it('份数不合法时发请求前就拒绝', async () => {
      await expect(fetchCustomRecipeQuote(0)).rejects.toThrow('份数不正确')
      await expect(fetchCustomRecipeQuote(1.5)).rejects.toThrow('份数不正确')
      expect(mockedRequest).not.toHaveBeenCalled()
    })
  })

  describe('cancelOrder', () => {
    it('成功时 ok=true，并带回退款进展', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: { refundStatus: 'PROCESSING', refundAmount: 300 },
      } as never)

      expect(await cancelOrder('CR1')).toEqual({
        ok: true,
        refundStatus: 'PROCESSING',
        refundAmount: 300,
        data: { refundStatus: 'PROCESSING', refundAmount: 300 },
      })
    })

    it('★ 退款状态必须带回来（漏了它，退款失败顾客会以为钱在路上）', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: { refundStatus: 'FAILED' },
      } as never)

      const result = await cancelOrder('CR1')

      expect(result.refundStatus).toBe('FAILED')
    })

    it('后端没给退款状态时是 null，不是 undefined（页面好判）', async () => {
      mockedRequest.mockResolvedValue({ code: 0, data: {} } as never)

      const result = await cancelOrder('CR1')

      expect(result.refundStatus).toBeNull()
      expect(result.refundAmount).toBeNull()
    })

    it('被后端拒绝时把原因带回来（页面直接显示，不自己编）', async () => {
      mockedRequest.mockResolvedValue({
        code: 400,
        message: '营养师已经开始设计了，不能自助取消',
      } as never)

      const result = await cancelOrder('CR1')

      expect(result.ok).toBe(false)
      expect(result.message).toContain('已经开始设计')
    })
  })

  describe('fetchDelivery', () => {
    it('成功时返回交付内容', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: { id: 'd1', version: 1, itemCodes: ['RECIPE'] },
      } as never)

      const delivery = await fetchDelivery('CR1')

      expect(delivery?.version).toBe(1)
    })

    it('★ 还没交付（404）时返回 null 而不是抛错 —— 那是正常状态，不是故障', async () => {
      mockedRequest.mockRejectedValue(new Error('404') as never)

      expect(await fetchDelivery('CR1')).toBeNull()
    })

    it('带 version 参数时拼进查询串（回看历史版本）', async () => {
      mockedRequest.mockResolvedValue({ code: 0, data: {} } as never)

      await fetchDelivery('CR1', 2)

      const arg = mockedRequest.mock.calls[0][0] as { url: string }
      expect(arg.url).toBe('/custom-recipe/orders/CR1/delivery?version=2')
    })

    it('不带 version 时没有查询串', async () => {
      mockedRequest.mockResolvedValue({ code: 0, data: {} } as never)

      await fetchDelivery('CR1')

      const arg = mockedRequest.mock.calls[0][0] as { url: string }
      expect(arg.url).toBe('/custom-recipe/orders/CR1/delivery')
    })

    it('★ 多份批次原样返回（batchId + N 份 items），不压成单份', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: {
          batchId: 'batch-1',
          version: 1,
          deliveredAt: '2026-10-21T02:00:00.000Z',
          confirmedAt: null,
          itemCodes: ['RECIPE', 'SHOPPING_SOP'],
          items: [
            {
              id: 'item-1',
              recipeId: 'R1',
              recipeName: '鸡肉南瓜',
              itemCodes: ['RECIPE'],
              content: { recipe: { name: '鸡肉南瓜' } },
            },
            {
              id: 'item-2',
              recipeId: 'R2',
              recipeName: '鸭肉西兰花',
              itemCodes: ['RECIPE'],
              content: { recipe: { name: '鸭肉西兰花' } },
            },
          ],
        },
      } as never)

      const delivery: any = await fetchDelivery('CR1')

      expect(delivery.batchId).toBe('batch-1')
      expect(delivery.items).toHaveLength(2)
      expect(delivery.items[1].recipeId).toBe('R2')
    })

    it('★ 带 recipeId 时拼进查询串（页面按份选择，后端可忽略）', async () => {
      mockedRequest.mockResolvedValue({ code: 0, data: {} } as never)

      await fetchDelivery('CR1', 2, 'CR1759100000002')

      const arg = mockedRequest.mock.calls[0][0] as { url: string }
      expect(arg.url).toBe(
        '/custom-recipe/orders/CR1/delivery?version=2&recipeId=CR1759100000002',
      )
    })
  })

  describe('confirmReceipt', () => {
    it('首次确认：alreadyConfirmed=false', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: { confirmed: true, alreadyConfirmed: false },
      } as never)

      expect(await confirmReceipt('CR1')).toEqual({
        ok: true,
        alreadyConfirmed: false,
      })
    })

    it('★ 重复确认也算成功，但如实告诉页面"已经确认过了"', async () => {
      mockedRequest.mockResolvedValue({
        code: 0,
        data: { confirmed: true, alreadyConfirmed: true },
      } as never)

      const result = await confirmReceipt('CR1')

      // 不报错、不刷新时间 —— 幂等由后端保证
      expect(result.ok).toBe(true)
      expect(result.alreadyConfirmed).toBe(true)
    })

    it('被后端拒绝时把原因带回来', async () => {
      mockedRequest.mockResolvedValue({
        code: 400,
        message: '这张订单还没有交付记录，无法确认收到',
      } as never)

      const result = await confirmReceipt('CR1')

      expect(result.ok).toBe(false)
      expect(result.message).toContain('还没有交付记录')
    })
  })

  describe('findAction', () => {
    it('按动作码取到动作', () => {
      expect(findAction(view(), 'VIEW_DELIVERY')?.label).toBe('查看定制食谱')
    })

    it('没有这个动作时返回 undefined（页面据此不显示按钮）', () => {
      expect(findAction(view(), 'CONFIRM_RECEIPT')).toBeUndefined()
    })

    it('renderable 缺失时安全返回 undefined', () => {
      expect(findAction(undefined, 'PAY')).toBeUndefined()
      expect(findAction(null, 'PAY')).toBeUndefined()
    })
  })

  describe('toneToClass —— 唯一允许前端判断的地方', () => {
    it('后端给什么色调就映射成对应的类名', () => {
      expect(toneToClass('warning')).toBe('warning')
      expect(toneToClass('progress')).toBe('progress')
      expect(toneToClass('success')).toBe('success')
      expect(toneToClass('danger')).toBe('danger')
      expect(toneToClass('info')).toBe('info')
    })

    it('未知色调与空值都落到中性样式（不崩、不显示错色）', () => {
      /**
       * ⚠️ 2026-10-18 改：兜底值从 `neutral` 改成 `muted`。
       *
       * 组件里的 CSS 类名是 `.order-status-badge--muted` —— **没有 `--neutral`**。
       * 所以原来兜底到 `neutral` 时，标签**匹配不到任何背景色**，
       * 变成一行没有底色的裸文字（已取消那一档正好踩中）。
       *
       * 兜底的本意是"落到中性样式"，`muted` 才是那个真的存在的类。
       */
      expect(toneToClass(undefined)).toBe('muted')
      expect(toneToClass('')).toBe('muted')
      expect(toneToClass('某个将来的新色调')).toBe('muted')
    })
  })
})
