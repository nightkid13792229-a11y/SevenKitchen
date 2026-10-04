import { describe, expect, it } from 'vitest'
import {
  canDeliverCustomRecipe,
  getCustomRecipeRefundStatusText,
  getCustomRecipeStatusTagType,
  getCustomRecipeStatusText,
  isCustomRecipeOrderOpen,
  isCustomRecipeRedelivery,
  isCustomRecipeRefundSucceeded,
} from './customRecipeOrder'

/**
 * 状态字典的回归（2026-10-04 第 6 条）。
 *
 * 重点防的是"漏一档"：详情页原来少了 CANCELLED，同一张单在列表里是
 * "已取消"、点进详情变成英文枚举。字典收成一份后，这里把五档全钉死。
 */
describe('定制订单状态文案', () => {
  it('五档状态都有中文文案，一档都不能少', () => {
    expect(getCustomRecipeStatusText('PENDING_PAYMENT')).toBe('待付款')
    expect(getCustomRecipeStatusText('PAID')).toBe('已付款')
    expect(getCustomRecipeStatusText('IN_PROGRESS')).toBe('制作中')
    expect(getCustomRecipeStatusText('DELIVERED')).toBe('已交付')
    // 这一档就是详情页此前缺失、直接显示英文 CANCELLED 的那个
    expect(getCustomRecipeStatusText('CANCELLED')).toBe('已取消')
  })

  it('小写或空值不会显示成空白', () => {
    expect(getCustomRecipeStatusText('cancelled')).toBe('已取消')
    expect(getCustomRecipeStatusText(null)).toBe('-')
    expect(getCustomRecipeStatusText(undefined)).toBe('-')
  })

  it('未知状态原样返回，方便发现后端加了新枚举', () => {
    expect(getCustomRecipeStatusText('REFUNDING')).toBe('REFUNDING')
  })

  it('标签颜色唯一来自字典', () => {
    expect(getCustomRecipeStatusTagType('DELIVERED')).toBe('success')
    expect(getCustomRecipeStatusTagType('CANCELLED')).toBe('info')
    expect(getCustomRecipeStatusTagType('PENDING_PAYMENT')).toBe('warning')
    expect(getCustomRecipeStatusTagType('WHATEVER')).toBe('info')
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
