import { describe, expect, it } from 'vitest'

import type { DogLastIntake } from '@/api/customRecipe'
import {
  formatIntakeOrderDate,
  normalizeLastIntake,
} from '@/utils/assistedOrder'

/**
 * 代客下单 · 带入上次定制需求（2026-11-16）
 *
 * ## 背景
 *
 * 同一只狗回头下单，健康方向/过敏/现在喂什么/肠胃情况多数没变。
 * 页面此前每次都从空白开始，员工要重问一遍。后端已经把最近一单的快照
 * 返回来了（`/admin/custom-recipe/dogs/:dogId/last-intake`），
 * 这里负责**按当前配置校正**后再填进表单。
 *
 * 校正规则（都是线上真会遇到的）：
 *   ① 份数不能超过当前开关允许的上限（上次买 3 份、这次多份关了就只能是 1）；
 *   ② 主蛋白数量必须等于份数，对不上就清空并回落「营养师配」，
 *      否则页面会带着一个必然提交失败的表单；
 *   ③ 选项字典里已下线的 code 一律丢掉（不然提交会被后端拒绝）；
 *   ④ 「明确没有过敏」不保留上次的过敏原文，避免脏文本被当成过敏。
 */
function makeIntake(overrides: Partial<DogLastIntake> = {}): DogLastIntake {
  return {
    orderId: 'CR20261102001',
    orderCreatedAt: '2026-11-02T03:04:05.000Z',
    targetGoal: 'MAINTAIN',
    recipeQuantity: 1,
    requestedProteinCodes: [],
    allergyStatus: 'HAS_ALLERGY',
    allergyText: '鸡肉、牛肉',
    allergies: [],
    currentFoodMain: 'COMMERCIAL_DRY',
    currentFoodOther: null,
    changeReasons: ['HEALTHIER'],
    stomachConditions: ['SOFT_STOOL'],
    additionalNotes: '不吃硬的',
    ...overrides,
  }
}

describe('带入上次定制需求 · 归一化', () => {
  it('没有历史返回 null（页面据此不显示提示条）', () => {
    expect(normalizeLastIntake(null, { maxQuantity: 5 })).toBeNull()
    expect(normalizeLastIntake(undefined, { maxQuantity: 5 })).toBeNull()
  })

  it('★ 原样带回上次的答案', () => {
    const draft = normalizeLastIntake(makeIntake(), { maxQuantity: 5 })

    expect(draft).toMatchObject({
      targetGoal: 'MAINTAIN',
      recipeQuantity: 1,
      allergyStatus: 'HAS_ALLERGY',
      allergyText: '鸡肉、牛肉',
      currentFoodMain: 'COMMERCIAL_DRY',
      currentFoodOther: '',
      changeReasons: ['HEALTHIER'],
      stomachConditions: ['SOFT_STOOL'],
      additionalNotes: '不吃硬的',
      proteinMode: 'DIETITIAN',
      proteinCleared: false,
    })
  })

  it('★ 份数被当前上限压住（多份关闭时只能是 1）', () => {
    const draft = normalizeLastIntake(
      makeIntake({ recipeQuantity: 3 }),
      { maxQuantity: 1 },
    )
    expect(draft?.recipeQuantity).toBe(1)
  })

  it('★ 份数非法或为 0 时回落 1', () => {
    expect(
      normalizeLastIntake(makeIntake({ recipeQuantity: 0 }), {
        maxQuantity: 5,
      })?.recipeQuantity,
    ).toBe(1)
    expect(
      normalizeLastIntake(makeIntake({ recipeQuantity: 2.7 }), {
        maxQuantity: 5,
      })?.recipeQuantity,
    ).toBe(2)
  })

  it('★ 主蛋白数量与份数一致 → 选「自己选」', () => {
    const draft = normalizeLastIntake(
      makeIntake({
        recipeQuantity: 2,
        requestedProteinCodes: ['CHICKEN', 'DUCK'],
      }),
      { maxQuantity: 5 },
    )

    expect(draft).toMatchObject({
      recipeQuantity: 2,
      proteinMode: 'SELF',
      requestedProteinCodes: ['CHICKEN', 'DUCK'],
      proteinCleared: false,
    })
  })

  it('★ 主蛋白数量对不上 → 清空并回落「营养师配」，且标记出来', () => {
    const draft = normalizeLastIntake(
      makeIntake({
        recipeQuantity: 3,
        requestedProteinCodes: ['CHICKEN', 'DUCK', 'PORK'],
      }),
      { maxQuantity: 1 },
    )

    expect(draft).toMatchObject({
      recipeQuantity: 1,
      proteinMode: 'DIETITIAN',
      requestedProteinCodes: [],
      proteinCleared: true,
    })
  })

  it('★ 有 code 已下线时不能"过滤后刚好对得上"就当成上次的选择', () => {
    // 上次 2 个 code、份数 1；过滤掉下线的 SALMON 后剩 1 个 —— 数量刚好相等，
    // 但那不是上次的选择结果，必须清空让人重选。
    const draft = normalizeLastIntake(
      makeIntake({
        recipeQuantity: 1,
        requestedProteinCodes: ['CHICKEN', 'SALMON'],
      }),
      { maxQuantity: 5 },
    )

    expect(draft).toMatchObject({
      proteinMode: 'DIETITIAN',
      requestedProteinCodes: [],
      proteinCleared: true,
    })
  })

  it('★ 唯一一个 code 已下线时也清空并标记', () => {
    const draft = normalizeLastIntake(
      makeIntake({
        recipeQuantity: 1,
        requestedProteinCodes: ['SALMON'],
      }),
      { maxQuantity: 5 },
    )

    expect(draft).toMatchObject({
      proteinMode: 'DIETITIAN',
      requestedProteinCodes: [],
      proteinCleared: true,
    })
  })

  it('★ 老订单只有结构化过敏原（文本为 null）时用数组兜底', () => {
    // 顾客自助下单只要档案里有过敏记录，订单就只存 allergies、文本为 null。
    // 不兜底的话员工会看到"有过敏"但文本框是空的，提交直接被挡住。
    const draft = normalizeLastIntake(
      makeIntake({
        allergyStatus: 'HAS_ALLERGY',
        allergyText: null,
        allergies: ['鸡肉', '牛肉'],
      }),
      { maxQuantity: 5 },
    )

    expect(draft).toMatchObject({
      allergyStatus: 'HAS_ALLERGY',
      allergyText: '鸡肉、牛肉',
    })
  })

  it('★ 文本和数组都有时以文本为准（文本是顾客原话）', () => {
    const draft = normalizeLastIntake(
      makeIntake({
        allergyStatus: 'HAS_ALLERGY',
        allergyText: '吃鸡胸肉会挠',
        allergies: ['鸡肉'],
      }),
      { maxQuantity: 5 },
    )

    expect(draft?.allergyText).toBe('吃鸡胸肉会挠')
  })

  it('★ 明确「没有过敏」时不保留上次的过敏原文', () => {
    const draft = normalizeLastIntake(
      makeIntake({ allergyStatus: 'NO_ALLERGY', allergyText: '鸡肉' }),
      { maxQuantity: 5 },
    )

    expect(draft).toMatchObject({ allergyStatus: 'NO_ALLERGY', allergyText: '' })
  })

  it('★ 过敏状态未知（老订单）时留空，让员工重新问', () => {
    const draft = normalizeLastIntake(
      makeIntake({ allergyStatus: 'UNKNOWN', allergyText: '鸡肉' }),
      { maxQuantity: 5 },
    )

    expect(draft).toMatchObject({ allergyStatus: '', allergyText: '' })
  })

  it('★ 已下线的方向/选项一律丢掉', () => {
    const draft = normalizeLastIntake(
      makeIntake({
        targetGoal: 'HEALTH_SUPPORT',
        currentFoodMain: 'RAW',
        changeReasons: ['HEALTHIER', 'OLD_REASON'],
        stomachConditions: ['SOFT_STOOL', 'OLD_STOMACH'],
      }),
      {
        maxQuantity: 5,
        allowedGoals: ['LOSE_WEIGHT', 'MAINTAIN', 'GAIN_WEIGHT'],
        allowedCurrentFoods: ['COMMERCIAL_DRY'],
        allowedChangeReasons: ['HEALTHIER'],
        allowedStomach: ['SOFT_STOOL'],
      },
    )

    expect(draft).toMatchObject({
      targetGoal: '',
      currentFoodMain: '',
      changeReasons: ['HEALTHIER'],
      stomachConditions: ['SOFT_STOOL'],
    })
  })

  it('★ 选了「其他」才保留手填内容', () => {
    const withOther = normalizeLastIntake(
      makeIntake({
        currentFoodMain: 'OTHER',
        currentFoodOther: ' 自制鸡胸肉饭 ',
      }),
      { maxQuantity: 5 },
    )
    expect(withOther).toMatchObject({
      currentFoodMain: 'OTHER',
      currentFoodOther: '自制鸡胸肉饭',
    })

    const withoutOther = normalizeLastIntake(
      makeIntake({ currentFoodMain: 'COMMERCIAL_DRY', currentFoodOther: '残留' }),
      { maxQuantity: 5 },
    )
    expect(withoutOther?.currentFoodOther).toBe('')
  })
})

describe('带入上次定制需求 · 提示条日期', () => {
  it('ISO 时间 → 「11 月 2 日」', () => {
    expect(formatIntakeOrderDate('2026-11-02T03:04:05.000Z')).toBe('11 月 2 日')
  })

  it('非法日期返回空串（页面不显示"NaN 月"）', () => {
    expect(formatIntakeOrderDate('')).toBe('')
    expect(formatIntakeOrderDate('not-a-date')).toBe('')
  })
})
