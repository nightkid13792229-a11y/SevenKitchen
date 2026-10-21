import { describe, expect, it } from 'vitest'
import {
  canDeliverCustomRecipe,
  canManualRefundCustomRecipeOrder,
  getCustomRecipeRefundStatusText,
  isCustomRecipeOrderOpen,
  isCustomRecipeRedelivery,
  isCustomRecipeRefundSucceeded,
} from './customRecipeOrder'

/**
 * 订单判断规则与退款文案的回归（2026-10-04 第 6 条 + 2026-10-16 批次 3.3）。
 *
 * ## ⚠️ 状态文案的测试搬走了，不是删了
 *
 * 这里原来有四个用例，钉的是「五档状态都有中文文案，一档都不能少」。
 * 那条意图**完全有效，而且比原来更要紧了** —— 只是它现在属于**后端**：
 *
 *   后端 `tests/application/platform-options/platform-options.service.spec.ts`
 *   断言 `result.unlabeled` 为空，且期望列表里含 `COMPLETED`。
 *   服务启动时会自动把**枚举的全部取值**补进选项字典，缺标签会打 warn。
 *
 * 为什么搬走而不是在前端再守一遍：前端那份 `CUSTOM_RECIPE_STATUS_META`
 * **恰恰是漏掉 `COMPLETED` 的那一份** —— 顾客在小程序点「确认收到」后，
 * 后台显示的是英文 `COMPLETED`。在前端再守一遍等于把同一个毛病留着。
 *
 * 前端现在只保证一件事：**去后端取**（那条断言在
 * `views/CustomRecipes/customRecipeOrderPage.regression.spec.ts` 里）。
 */

describe('订单判断规则（文案无关）', () => {
  it('可交付的状态：已付款 / 制作中 / 已交付 / 已完成', () => {
    expect(canDeliverCustomRecipe('PAID')).toBe(true)
    expect(canDeliverCustomRecipe('IN_PROGRESS')).toBe(true)
    expect(canDeliverCustomRecipe('DELIVERED')).toBe(true)
    // 2026-10-16 新增：售后改稿后要能重新交付
    expect(canDeliverCustomRecipe('COMPLETED')).toBe(true)
    expect(canDeliverCustomRecipe('PENDING_PAYMENT')).toBe(false)
    expect(canDeliverCustomRecipe('CANCELLED')).toBe(false)
  })

  it('重新交付：已交付 / 已完成都算', () => {
    expect(isCustomRecipeRedelivery('DELIVERED')).toBe(true)
    expect(isCustomRecipeRedelivery('COMPLETED')).toBe(true)
    expect(isCustomRecipeRedelivery('IN_PROGRESS')).toBe(false)
  })

  it('进行中的单才会因为超期被催', () => {
    expect(isCustomRecipeOrderOpen('PAID')).toBe(true)
    expect(isCustomRecipeOrderOpen('IN_PROGRESS')).toBe(true)
    expect(isCustomRecipeOrderOpen('DELIVERED')).toBe(false)
    expect(isCustomRecipeOrderOpen('CANCELLED')).toBe(false)
  })
})

describe('可交付状态（与后端 deliverExistingRecipe 白名单一致）', () => {
  it('已付款 / 制作中 / 已交付 可交付', () => {
    expect(canDeliverCustomRecipe('PAID')).toBe(true)
    expect(canDeliverCustomRecipe('IN_PROGRESS')).toBe(true)
    expect(canDeliverCustomRecipe('DELIVERED')).toBe(true)
  })

  it('未付款 / 已取消 不可交付（后端也会拦）', () => {
    expect(canDeliverCustomRecipe('PENDING_PAYMENT')).toBe(false)
    expect(canDeliverCustomRecipe('CANCELLED')).toBe(false)
    expect(canDeliverCustomRecipe(null)).toBe(false)
  })

  it('已交付 = 重新交付（口径 4）', () => {
    expect(isCustomRecipeRedelivery('DELIVERED')).toBe(true)
    expect(isCustomRecipeRedelivery('PAID')).toBe(false)
  })
})

describe('进行中判断（决定要不要因超期标红）', () => {
  it('只有未交付、未取消的单才催办', () => {
    expect(isCustomRecipeOrderOpen('PENDING_PAYMENT')).toBe(true)
    expect(isCustomRecipeOrderOpen('PAID')).toBe(true)
    expect(isCustomRecipeOrderOpen('IN_PROGRESS')).toBe(true)
    expect(isCustomRecipeOrderOpen('DELIVERED')).toBe(false)
    expect(isCustomRecipeOrderOpen('CANCELLED')).toBe(false)
  })
})

describe('退款状态文案', () => {
  it('常见退款状态都翻成人话', () => {
    expect(getCustomRecipeRefundStatusText('SUCCESS')).toContain('原路退回')
    expect(getCustomRecipeRefundStatusText('PROCESSING')).toContain('处理中')
    expect(getCustomRecipeRefundStatusText('PENDING')).toContain('处理中')
    expect(getCustomRecipeRefundStatusText('ABNORMAL')).toContain('异常')
    expect(getCustomRecipeRefundStatusText('FAILED')).toContain('未退回')
  })

  it('没有退款状态时返回空串，界面据此不显示整块', () => {
    expect(getCustomRecipeRefundStatusText(null)).toBe('')
    expect(getCustomRecipeRefundStatusText('')).toBe('')
  })

  it('只有 SUCCESS 才算退款成功', () => {
    expect(isCustomRecipeRefundSucceeded('SUCCESS')).toBe(true)
    expect(isCustomRecipeRefundSucceeded('PROCESSING')).toBe(false)
    expect(isCustomRecipeRefundSucceeded(null)).toBe(false)
  })
})

/**
 * 「补退款」入口的显示条件（2026-10-21）。
 *
 * 生产单 CR202610201196：修复前取消"制作中"的单不退钱，
 * 取消后 refundStatus=null；而取消按钮已随订单取消消失 ——
 * 这是后台唯一能把钱退回去的入口，所以显示条件必须钉死：
 * 该显示的一定要显示，不该显示的（没付款 / 已在退 / 已退成）不能多给。
 */
describe('「补退款」入口显示条件', () => {
  /** 生产单 CR202610201196 的真实形态 */
  const legacyCancelledPaidOrder = {
    status: 'CANCELLED',
    paymentConfirmedAt: '2026-10-20T08:00:00.000Z',
    refundStatus: null,
  }

  it('★ 已取消 + 已收款 + 从未退款（生产单形态）→ 显示', () => {
    expect(canManualRefundCustomRecipeOrder(legacyCancelledPaidOrder)).toBe(true)
  })

  it('退款失败 / 异常 / 关闭 → 显示（这正是需要补退或核查的）', () => {
    for (const refundStatus of ['FAILED', 'ABNORMAL', 'CLOSED']) {
      expect(
        canManualRefundCustomRecipeOrder({
          ...legacyCancelledPaidOrder,
          refundStatus,
        }),
      ).toBe(true)
    }
  })

  it('退款已成功 / 处理中 / 待处理 → 不显示（不能重复打款）', () => {
    for (const refundStatus of ['SUCCESS', 'PROCESSING', 'PENDING']) {
      expect(
        canManualRefundCustomRecipeOrder({
          ...legacyCancelledPaidOrder,
          refundStatus,
        }),
      ).toBe(false)
    }
  })

  it('没有付款确认的老单 → 不显示（本来就没收到钱）', () => {
    expect(
      canManualRefundCustomRecipeOrder({
        ...legacyCancelledPaidOrder,
        paymentConfirmedAt: null,
      }),
    ).toBe(false)
  })

  it('订单没取消 → 不显示（未取消的单走「取消订单」，那里会先退款）', () => {
    for (const status of ['PAID', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED']) {
      expect(
        canManualRefundCustomRecipeOrder({
          ...legacyCancelledPaidOrder,
          status,
        }),
      ).toBe(false)
    }
  })

  it('大小写与空值不敏感，缺字段按不显示处理', () => {
    expect(
      canManualRefundCustomRecipeOrder({
        status: 'cancelled',
        paymentConfirmedAt: new Date('2026-10-20T08:00:00.000Z'),
        refundStatus: 'failed',
      }),
    ).toBe(true)
    expect(canManualRefundCustomRecipeOrder({})).toBe(false)
  })
})
