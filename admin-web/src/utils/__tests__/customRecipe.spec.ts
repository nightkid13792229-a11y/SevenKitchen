import { describe, expect, it } from 'vitest'
import {
  buildDogProfileAllergens,
  compareDogProfileAllergies,
  compareDogProfileMedicalConditions,
  diffCalendarDays,
  formatCalendarDate,
  getAllergyCertaintyTagType,
  getAllergyCertaintyText,
  getEstimatedDeliveryInfo,
  normalizeAllergen,
  parseAllergyText,
} from '../customRecipe'

/**
 * 定制订单详情页两个"会算错就出事"的纯函数：
 *   · 过敏比对（第 4 条）—— 漏一条就可能设计进过敏原；
 *   · 预计交付倒计时（第 5 条）—— 算错一天就白催或漏催。
 */
describe('过敏文本解析', () => {
  it('中英文逗号、顿号、斜杠、空格都能切', () => {
    expect(parseAllergyText('鸡肉,牛肉、羊肉；鱼肉/鸡蛋 乳制品')).toEqual([
      '鸡肉',
      '牛肉',
      '羊肉',
      '鱼肉',
      '鸡蛋',
      '乳制品',
    ])
  })

  it('空值返回空数组，不会产生 [""] 这种脏数据', () => {
    expect(parseAllergyText(null)).toEqual([])
    expect(parseAllergyText('   ')).toEqual([])
  })
})

describe('档案最新过敏的合并', () => {
  it('结构化记录 + 旧文本字段都要算上（顾客填的那份在 allergyRecords 里）', () => {
    const allergens = buildDogProfileAllergens({
      allergyFoods: '牛肉, 乳制品',
      allergyRecords: [{ allergen: '鸡肉', certainty: 'CONFIRMED' }],
    })

    expect(allergens).toEqual(['鸡肉', '牛肉', '乳制品'])
  })

  it('已排除（RULED_OUT）的不算"不能吃"', () => {
    const allergens = buildDogProfileAllergens({
      allergyRecords: [
        { allergen: '鸡肉', certainty: 'RULED_OUT' },
        { allergen: '牛肉', certainty: 'SUSPECTED' },
      ],
    })

    expect(allergens).toEqual(['牛肉'])
  })

  it('两个来源重复时只留一条', () => {
    const allergens = buildDogProfileAllergens({
      allergyFoods: '鸡肉、牛肉',
      allergyRecords: [{ allergen: '鸡肉', certainty: 'CONFIRMED' }],
    })

    expect(allergens).toEqual(['鸡肉', '牛肉'])
  })

  it('档案为空（新狗）不报错', () => {
    expect(buildDogProfileAllergens(null)).toEqual([])
    expect(buildDogProfileAllergens({})).toEqual([])
  })
})

describe('「下单时填写」与「档案最新」的比对', () => {
  it('内容一致时不提示（避免天天弹提示，最后没人看）', () => {
    const result = compareDogProfileAllergies(
      { allergyRecords: [{ allergen: '鸡肉', certainty: 'CONFIRMED' }] },
      ['鸡肉'],
    )

    expect(result.changed).toBe(false)
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('下单后档案补了新过敏 → 必须提示，并指出是哪一条', () => {
    const result = compareDogProfileAllergies(
      { allergyRecords: [{ allergen: '鸡肉', certainty: 'CONFIRMED' }] },
      ['牛肉'],
    )

    expect(result.changed).toBe(true)
    expect(result.added).toEqual(['鸡肉'])
    expect(result.removed).toEqual(['牛肉'])
  })

  it('只比大小写/空格不算变化（"鸡 肉 " vs "鸡肉"）', () => {
    expect(normalizeAllergen(' 鸡 肉 ')).toBe('鸡肉')
    expect(
      compareDogProfileAllergies({ allergyFoods: 'Chicken' }, ['chicken']).changed,
    ).toBe(false)
  })

  it('档案里没有过敏、下单时也没有 → 不提示', () => {
    expect(compareDogProfileAllergies({}, []).changed).toBe(false)
    expect(compareDogProfileAllergies(null, null).changed).toBe(false)
  })

  it('档案新增过敏但下单时没写 → 提示', () => {
    const result = compareDogProfileAllergies({ allergyFoods: '鸡肉' }, [])
    expect(result.changed).toBe(true)
    expect(result.added).toEqual(['鸡肉'])
  })
})

describe('过敏可信度文案（与 DogDetail / 小程序同一套）', () => {
  it('四档都有中文，缺省按"可疑"而不是"确诊"', () => {
    expect(getAllergyCertaintyText('CONFIRMED')).toBe('确诊')
    expect(getAllergyCertaintyText('SUSPECTED')).toBe('可疑')
    expect(getAllergyCertaintyText('TO_VERIFY')).toBe('待排查')
    expect(getAllergyCertaintyText('RULED_OUT')).toBe('已排除')
    expect(getAllergyCertaintyText(null)).toBe('可疑')
    expect(getAllergyCertaintyTagType('CONFIRMED')).toBe('danger')
  })
})

describe('日期解析与自然日相减', () => {
  it('按字符串里的 YYYY-MM-DD 取日期，不受 UTC 零点序列化影响', () => {
    expect(formatCalendarDate('2026-10-07T00:00:00.000Z')).toBe('2026-10-07')
    expect(formatCalendarDate(null)).toBe('')
    expect(formatCalendarDate('不是日期')).toBe('')
  })

  it('跨月相减按自然日算', () => {
    expect(diffCalendarDays(new Date(2026, 9, 1), new Date(2026, 8, 30))).toBe(1)
    expect(diffCalendarDays(new Date(2026, 9, 1), new Date(2026, 9, 3))).toBe(-2)
  })
})

describe('预计交付倒计时与超期', () => {
  const now = new Date(2026, 9, 4) // 2026-10-04

  it('还没到期 → 显示剩余天数', () => {
    const info = getEstimatedDeliveryInfo('2026-10-07', 'IN_PROGRESS', now)
    expect(info.overdue).toBe(false)
    expect(info.remainingDays).toBe(3)
    expect(info.text).toBe('剩 3 天')
    expect(info.dateText).toBe('2026-10-07')
  })

  it('当天到期 → 今天到期', () => {
    expect(getEstimatedDeliveryInfo('2026-10-04', 'PAID', now).text).toBe('今天到期')
  })

  it('过了预计交付日 → 超期并给出天数（详情页/列表页据此标红）', () => {
    const info = getEstimatedDeliveryInfo('2026-10-01', 'PAID', now)
    expect(info.overdue).toBe(true)
    expect(info.overdueDays).toBe(3)
    expect(info.text).toBe('已超期 3 天')
  })

  it('已交付 / 已取消的单不再催办（否则列表里全是红的）', () => {
    const delivered = getEstimatedDeliveryInfo('2026-10-01', 'DELIVERED', now)
    expect(delivered.overdue).toBe(false)
    expect(delivered.text).toBe('')
    expect(getEstimatedDeliveryInfo('2026-10-01', 'CANCELLED', now).overdue).toBe(false)
  })

  it('没有预计交付日时不报错，也不谎报超期', () => {
    const info = getEstimatedDeliveryInfo(null, 'PAID', now)
    expect(info.dateText).toBe('')
    expect(info.overdue).toBe(false)
    expect(info.text).toBe('')
  })
})

/**
 * 疾病史比对（2026-10-04 补）。
 *
 * 与过敏同一类风险：订单上那份是下单快照，顾客之后在健康档案里补的疾病
 * 不会同步过来 —— 漏一条就可能照着旧信息设计。
 */
describe('疾病史比对（档案最新 vs 下单时填写）', () => {
  it('档案里有、下单时没写的，要能挑出来并标记"有更新"', () => {
    const result = compareDogProfileMedicalConditions(
      { medicalHistory: '胰腺炎、慢性肾衰' } as any,
      ['皮肤病'],
    )

    expect(result.profileConditions).toEqual(['胰腺炎', '慢性肾衰'])
    expect(result.added).toEqual(['胰腺炎', '慢性肾衰'])
    expect(result.removed).toEqual(['皮肤病'])
    expect(result.changed).toBe(true)
  })

  it('两份内容一致（含分隔符与空格差异）时不误报', () => {
    const result = compareDogProfileMedicalConditions(
      { medicalHistory: '胰腺炎， 慢性肾衰' } as any,
      ['胰腺炎', '慢性肾衰'],
    )

    expect(result.changed).toBe(false)
  })

  it('档案里没有疾病史时不报错，也不谎报有更新', () => {
    const result = compareDogProfileMedicalConditions({} as any, ['胰腺炎'])

    expect(result.profileConditions).toEqual([])
    expect(result.changed).toBe(true) // 只在"下单写了、档案没有"这一侧有差异
    expect(result.removed).toEqual(['胰腺炎'])
  })

  it('两边都空时不算"有更新"', () => {
    const result = compareDogProfileMedicalConditions(null, [])

    expect(result.changed).toBe(false)
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })
})
