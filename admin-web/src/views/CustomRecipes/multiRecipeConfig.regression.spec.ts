import { describe, expect, it } from 'vitest'
/**
 * 多份购买配置 · 回归（2026-10-20）
 *
 * 对应计划 Task 5：
 *   · 配置页要能配「多份购买 / 单笔最多份数 / 2–5 份优惠档位 / 设计工时」；
 *   · 折扣在页面上按**百分比**编辑（5 表示 5%），保存时必须换成**小数**（0.05），
 *     否则后端会把它当成 5 = 500%，校验直接拒绝；
 *   · 2/3/4/5 四档必须齐全，份数越高折扣不能降低，单档最高 20%；
 *   · 页面展示的「每天最多设计几份」由工时推导，不手填。
 *
 * 与仓库里其它 admin-web 回归一致：页面挂载不了 Element Plus（vitest 是 node
 * 环境），所以「接线」用 `?raw` 读源码断言；真正的换算与校验是
 * `utils/customRecipe.ts` 里的纯函数，这里**真跑**它们。
 */
import page from '@/views/CustomRecipes/Config.vue?raw'
import apiSource from '@/api/customRecipe.ts?raw'
import {
  buildMultiRecipeDiscountRows,
  calcDailyDesignCapacity,
  discountRateToPercent,
  percentToDiscountRate,
  validateMultiRecipeConfig,
  type MultiRecipeConfigInput,
} from '@/utils/customRecipe'

/** 一份合法配置：四档齐全、5/8/10/12、工时 480/96 */
const validConfig: MultiRecipeConfigInput = {
  multiRecipeEnabled: true,
  maxRecipeQuantity: 5,
  multiRecipeDiscounts: [
    { quantity: 2, discountRatePercent: 5, label: '2 份享 95 折' },
    { quantity: 3, discountRatePercent: 8, label: '3 份享 92 折' },
    { quantity: 4, discountRatePercent: 10, label: '4 份享 9 折' },
    { quantity: 5, discountRatePercent: 12, label: '5 份享 88 折' },
  ],
  dailyDesignMinutes: 480,
  minutesPerRecipe: 96,
}

/** 每个用例拿一份独立配置，避免用例之间互相污染 */
function makeConfig(
  overrides: Partial<MultiRecipeConfigInput> = {},
): MultiRecipeConfigInput {
  return {
    ...validConfig,
    ...overrides,
    multiRecipeDiscounts: (
      overrides.multiRecipeDiscounts ?? validConfig.multiRecipeDiscounts
    ).map((tier) => ({ ...tier })),
  }
}

describe('多份购买配置页 · 字段与文案', () => {
  it('包含多份购买、单笔最多、多份优惠与两个设计工时', () => {
    expect(page).toContain('多份购买')
    expect(page).toContain('最多 5 份')
    expect(page).toContain('每日设计工时')
    expect(page).toContain('每份设计工时')
    expect(page).toContain('多份优惠')
    // 保存映射必须出现 discountRate（不是只改页面文案）
    expect(page).toContain('discountRate')
  })

  it('写明 2/3/4/5 四档必须齐全、单档最高 20%', () => {
    expect(page).toContain('2/3/4/5')
    expect(page).toContain('四档')
    expect(page).toContain('20%')
    expect(page).toContain('份数越高折扣不能降低')
  })

  it('写明改动只影响之后提交的订单（已下单按快照）', () => {
    // 这句必须挂在「多份购买」区，不能靠页面顶部那条调价提示蒙混过关
    expect(page).toContain(
      '多份购买开关、优惠档位与设计工时的改动只影响之后提交的订单',
    )
    expect(page).toContain('订单快照')
  })

  it('折扣按百分比编辑、按小数保存（5 → 0.05）', () => {
    expect(page).toContain('discountRatePercent')
    expect(page).toContain('percentToDiscountRate')
    expect(page).toContain('discountRate: percentToDiscountRate')
    expect(page).toContain('buildMultiRecipeDiscountRows')
    expect(page).toContain('customRecipeApi.updateConfig(payload)')
  })

  it('展示由工时推导的每日设计产能，而不是让人手填', () => {
    expect(page).toContain('dailyDesignCapacity')
    expect(page).toContain('calcDailyDesignCapacity')
  })

  it('单笔最多份数允许 1–5 编辑并说明硬上限', () => {
    expect(page).toContain('form.maxRecipeQuantity')
    expect(page).toContain(':max="5"')
    expect(page).toContain('业务硬上限')
  })
})

describe('多份购买配置 · 类型字段', () => {
  it('API 类型声明五个新配置字段与档位接口', () => {
    expect(apiSource).toContain('export interface MultiRecipeDiscountTier')
    for (const field of [
      'multiRecipeEnabled',
      'maxRecipeQuantity',
      'multiRecipeDiscounts',
      'dailyDesignMinutes',
      'minutesPerRecipe',
    ]) {
      expect(apiSource).toContain(field)
    }
    expect(apiSource).toContain('discountRate: number')
  })
})

describe('折扣率换算', () => {
  it('保存：百分比换成小数', () => {
    expect(percentToDiscountRate(5)).toBe(0.05)
    expect(percentToDiscountRate(8)).toBe(0.08)
    expect(percentToDiscountRate(10)).toBe(0.1)
    expect(percentToDiscountRate(12)).toBe(0.12)
    expect(percentToDiscountRate(20)).toBe(0.2)
  })

  it('读取：小数换回百分比', () => {
    expect(discountRateToPercent(0.05)).toBe(5)
    expect(discountRateToPercent(0.08)).toBe(8)
    expect(discountRateToPercent(0.1)).toBe(10)
    expect(discountRateToPercent(0.12)).toBe(12)
    expect(discountRateToPercent(0.2)).toBe(20)
  })
})

describe('读取配置：后端小数 → 页面百分比', () => {
  it('四档按 2/3/4/5 排好，并换成百分比', () => {
    const rows = buildMultiRecipeDiscountRows([
      { quantity: 5, discountRate: 0.12, label: '5 份享 88 折' },
      { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
      { quantity: 4, discountRate: 0.1, label: '4 份享 9 折' },
      { quantity: 3, discountRate: 0.08, label: '3 份享 92 折' },
    ])

    expect(rows).toEqual([
      { quantity: 2, discountRatePercent: 5, label: '2 份享 95 折' },
      { quantity: 3, discountRatePercent: 8, label: '3 份享 92 折' },
      { quantity: 4, discountRatePercent: 10, label: '4 份享 9 折' },
      { quantity: 5, discountRatePercent: 12, label: '5 份享 88 折' },
    ])
  })

  it('存量空数组或坏数据时补默认四档，页面始终能存回齐全配置', () => {
    const fromEmpty = buildMultiRecipeDiscountRows([])
    expect(fromEmpty.map((row) => row.quantity)).toEqual([2, 3, 4, 5])
    expect(fromEmpty.map((row) => row.discountRatePercent)).toEqual([
      5, 8, 10, 12,
    ])

    const fromBroken = buildMultiRecipeDiscountRows([
      { quantity: 2, discountRate: 0.05, label: '2 份' },
      { quantity: 4, discountRate: 5, label: '坏了' },
      { quantity: 9, discountRate: 0.2, label: '越界' },
    ])
    expect(fromBroken.map((row) => row.quantity)).toEqual([2, 3, 4, 5])
    // 合法的第 2 档保留，坏的第 4 档退默认文案
    expect(fromBroken[0]).toMatchObject({ discountRatePercent: 5, label: '2 份' })
    expect(fromBroken[2]?.discountRatePercent).toBe(10)
  })

  it('补全后的四档一定能通过保存校验', () => {
    const rows = buildMultiRecipeDiscountRows(null)
    expect(
      validateMultiRecipeConfig(
        makeConfig({ multiRecipeDiscounts: rows }),
      ),
    ).toBeNull()
  })
})

describe('保存前校验：与后端同一套规则', () => {
  it('默认四档配置合法', () => {
    expect(validateMultiRecipeConfig(validConfig)).toBeNull()
  })

  it.each([0, 6, 1.5, -1])('单笔最多份数 %s 不合法', (maxRecipeQuantity) => {
    expect(
      validateMultiRecipeConfig(makeConfig({ maxRecipeQuantity })),
    ).toContain('最多份数')
  })

  it('缺任何一档都不合法（2/3/4/5 必须齐全）', () => {
    const missingFour = makeConfig({
      multiRecipeDiscounts: validConfig.multiRecipeDiscounts.filter(
        (tier) => tier.quantity !== 4,
      ),
    })
    expect(validateMultiRecipeConfig(missingFour)).toContain('2/3/4/5')
  })

  it('份数重复不合法', () => {
    const duplicated = makeConfig({
      multiRecipeDiscounts: [
        { quantity: 2, discountRatePercent: 5, label: '2 份' },
        { quantity: 2, discountRatePercent: 6, label: '又 2 份' },
        { quantity: 3, discountRatePercent: 8, label: '3 份' },
        { quantity: 4, discountRatePercent: 10, label: '4 份' },
        { quantity: 5, discountRatePercent: 12, label: '5 份' },
      ],
    })
    expect(validateMultiRecipeConfig(duplicated)).toContain('重复')
  })

  it('份数越高折扣降低不合法', () => {
    const decreased = makeConfig({
      multiRecipeDiscounts: [
        { quantity: 2, discountRatePercent: 5, label: '2 份' },
        { quantity: 3, discountRatePercent: 8, label: '3 份' },
        { quantity: 4, discountRatePercent: 7, label: '4 份' },
        { quantity: 5, discountRatePercent: 12, label: '5 份' },
      ],
    })
    expect(validateMultiRecipeConfig(decreased)).toContain('不能降低')
  })

  it.each([0, 20.01, Number.NaN])('折扣率 %s 不合法（必须 >0 且 ≤20%%）', (percent) => {
    const bad = makeConfig({
      multiRecipeDiscounts: validConfig.multiRecipeDiscounts.map((tier) =>
        tier.quantity === 3
          ? { ...tier, discountRatePercent: percent }
          : { ...tier },
      ),
    })
    expect(validateMultiRecipeConfig(bad)).toContain('折扣率')
  })

  it('设计工时必须是正整数分钟', () => {
    expect(
      validateMultiRecipeConfig(makeConfig({ minutesPerRecipe: 0 })),
    ).toContain('每份设计工时')
    expect(
      validateMultiRecipeConfig(makeConfig({ minutesPerRecipe: 96.5 })),
    ).toContain('每份设计工时')
    expect(
      validateMultiRecipeConfig(makeConfig({ dailyDesignMinutes: 0 })),
    ).toContain('每日设计工时')
    expect(
      validateMultiRecipeConfig(makeConfig({ dailyDesignMinutes: -1 })),
    ).toContain('每日设计工时')
  })
})

describe('每日设计产能（floor）', () => {
  it('480 / 96 = 5 份', () => {
    expect(calcDailyDesignCapacity(480, 96)).toBe(5)
  })

  it('不足一份时向下取整', () => {
    expect(calcDailyDesignCapacity(100, 96)).toBe(1)
    expect(calcDailyDesignCapacity(95, 96)).toBe(0)
  })

  it('工时为 0 / 非法时返回 0，不产出 Infinity 或 NaN', () => {
    expect(calcDailyDesignCapacity(480, 0)).toBe(0)
    expect(calcDailyDesignCapacity(0, 96)).toBe(0)
    expect(calcDailyDesignCapacity(Number.NaN, 96)).toBe(0)
  })
})
