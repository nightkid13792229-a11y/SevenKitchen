import { describe, expect, it } from 'vitest'
import {
  buildOrderDesignProgress,
  canAddOrderDesignSlot,
  countActiveSlots,
  countDeliveredSlots,
  countReadySlots,
  formatOrderDesignLifeStage,
  formatOrderDesignSourceKind,
  isOrderDesignAllReady,
  normalizeOrderDesignQuantity,
  orderDesignStatusLabel,
  orderDesignStatusTagType,
} from '../orderRecipeDesign'
import type {
  OrderDesignWorkspaceSlot,
  OrderRecipeDesignStatus,
} from '@/types/orderRecipeDesign'

function slot(
  status: OrderRecipeDesignStatus,
  patch: Partial<OrderDesignWorkspaceSlot> = {},
): OrderDesignWorkspaceSlot {
  return {
    designId: `design-${Math.random().toString(36).slice(2)}`,
    seriesId: 'series-1',
    draftId: 'draft-1',
    name: '测试食谱',
    status,
    recipeId: null,
    sourceRecipeId: null,
    stageWarning: null,
    updatedAt: '2026-10-22T00:00:00.000Z',
    ...patch,
  }
}

describe('订单设计工作台进度', () => {
  it('2 份订单一个人都还没加入待提交时是 0/2', () => {
    const progress = buildOrderDesignProgress(2, [slot('EDITING'), slot('EDITING')])

    expect(progress.total).toBe(2)
    expect(progress.ready).toBe(0)
    expect(progress.delivered).toBe(0)
    expect(progress.percent).toBe(0)
    expect(progress.text).toBe('已就绪 0 / 2 份')
    expect(progress.complete).toBe(false)
  })

  it('1 份已就绪 + 1 份编辑中是 1/2，不能继续加槽位', () => {
    const slots = [slot('READY'), slot('EDITING')]
    const progress = buildOrderDesignProgress(2, slots)

    expect(progress.ready).toBe(1)
    expect(progress.percent).toBe(50)
    expect(progress.text).toBe('已就绪 1 / 2 份')
    expect(countActiveSlots(slots)).toBe(2)
    expect(canAddOrderDesignSlot(2, countActiveSlots(slots))).toBe(false)
  })

  it('N 份全部就绪时进度满格，并进入可最终提交状态', () => {
    const slots = [slot('READY'), slot('READY')]
    const progress = buildOrderDesignProgress(2, slots)

    expect(progress.ready).toBe(2)
    expect(progress.percent).toBe(100)
    expect(progress.complete).toBe(true)
    expect(isOrderDesignAllReady(2, 2)).toBe(true)
  })

  it('最终交付后按已交付数量显示，不会退回 0/N 让人以为丢了设计', () => {
    const slots = [slot('DELIVERED'), slot('DELIVERED')]
    const progress = buildOrderDesignProgress(2, slots)

    expect(progress.delivered).toBe(2)
    expect(progress.percent).toBe(100)
    expect(progress.complete).toBe(true)
    expect(progress.text).toBe('已交付 2 / 2 份')
    expect(countDeliveredSlots(slots)).toBe(2)
  })

  it('只看 READY / DELIVERED，编辑中的不算已就绪', () => {
    const slots = [slot('EDITING'), slot('READY'), slot('DELIVERED')]

    expect(countReadySlots(slots)).toBe(1)
    expect(countDeliveredSlots(slots)).toBe(1)
    expect(buildOrderDesignProgress(3, slots).ready).toBe(1)
  })

  it('份数为 0 / 负数 / 小数时按 1 份兜底（老订单没有份数字段）', () => {
    expect(normalizeOrderDesignQuantity(0)).toBe(1)
    expect(normalizeOrderDesignQuantity(-2)).toBe(1)
    expect(normalizeOrderDesignQuantity(2.5)).toBe(1)
    expect(normalizeOrderDesignQuantity(3)).toBe(3)
    expect(normalizeOrderDesignQuantity(null)).toBe(1)
    expect(buildOrderDesignProgress(undefined, []).total).toBe(1)
  })

  it('设计多出来的槽位不会让进度超过 100%（后端有容量限制，前端仍兜底）', () => {
    const slots = [slot('READY'), slot('READY'), slot('READY')]
    const progress = buildOrderDesignProgress(2, slots)

    expect(progress.ready).toBe(3)
    expect(progress.percent).toBe(100)
    expect(progress.text).toBe('已就绪 3 / 2 份')
  })
})

describe('订单设计槽位状态文案', () => {
  it('三种对设计者可见的状态都是中文业务口径', () => {
    expect(orderDesignStatusLabel('EDITING')).toBe('编辑中')
    expect(orderDesignStatusLabel('READY')).toBe('已就绪')
    expect(orderDesignStatusLabel('DELIVERED')).toBe('已交付')
  })

  it('未知状态原样返回，不吞掉后端新状态', () => {
    expect(orderDesignStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })

  it('标签颜色区分醒目程度', () => {
    expect(orderDesignStatusTagType('EDITING')).toBe('info')
    expect(orderDesignStatusTagType('READY')).toBe('success')
    expect(orderDesignStatusTagType('DELIVERED')).toBe('primary')
  })
})

describe('订单设计容量', () => {
  it('本单 N 份建满后不再允许新建槽位', () => {
    expect(canAddOrderDesignSlot(2, 1)).toBe(true)
    expect(canAddOrderDesignSlot(2, 2)).toBe(false)
    expect(canAddOrderDesignSlot(2, 3)).toBe(false)
  })

  it('只对恰好 N 份就绪放行最终提交', () => {
    expect(isOrderDesignAllReady(2, 1)).toBe(false)
    expect(isOrderDesignAllReady(2, 2)).toBe(true)
    expect(isOrderDesignAllReady(2, 3)).toBe(false)
    expect(isOrderDesignAllReady(0, 0)).toBe(false)
  })
})

describe('模板来源展示', () => {
  it('橱窗 / 顾客定制用后台业务口径，不显示英文枚举', () => {
    expect(formatOrderDesignSourceKind('CATALOG')).toBe('橱窗食谱')
    expect(formatOrderDesignSourceKind('CUSTOM')).toBe('顾客定制（私密）')
  })
})

describe('模板生命阶段展示', () => {
  it('后端返回的阶段代码转成中文业务标签', () => {
    expect(formatOrderDesignLifeStage('PUPPY_UNDER_14_WEEKS')).toBe('小于 14 周幼犬')
    expect(formatOrderDesignLifeStage('HIGH_ACTIVITY_ADULT')).toBe('普通成年犬')
  })

  it('模板没标阶段时明确显示「未标注」，不显示空白单元格', () => {
    expect(formatOrderDesignLifeStage(null)).toBe('未标注')
    expect(formatOrderDesignLifeStage('  ')).toBe('未标注')
  })

  it('后端新增阶段代码时原样显示，不吞掉信息', () => {
    expect(formatOrderDesignLifeStage('FUTURE_STAGE')).toBe('FUTURE_STAGE')
  })
})
