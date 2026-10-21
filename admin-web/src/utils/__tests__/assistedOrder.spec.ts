import { describe, expect, it } from 'vitest'
import {
  ASSISTED_PAYMENT_CHANNELS,
  ASSISTED_TARGET_GOAL_CODES,
  PROTEIN_OPTIONS,
  buildAssistedOrderPayload,
  buildCustomerDogCards,
  buildSelectedIdentity,
  collectAssistedOrderIssues,
  describeCustomer,
  formatDiscountRate,
  formatDogAge,
  formatDogWeight,
  formatMoney,
  getPaymentValidationError,
  isInternalCustomer,
  requiresInternalConfirmation,
  shouldSyncActualAmount,
} from '@/utils/assistedOrder'
import type {
  AssistedCustomerDogSearchItem,
} from '@/api/customRecipe'
import type { AssistedOrderFormState } from '@/utils/assistedOrder'

/**
 * 代客下单纯函数测试（2026-10-21 · Task 4）
 *
 * 页面在 admin-web 的 vitest 里挂不起来（node 环境，无 jsdom），
 * 所以金额/校验/载荷这些真正会出错的逻辑放在 utils 里由这里真跑；
 * 页面接线由 assistedOrderCreate.regression.spec.ts 读源码断言。
 */

function makeForm(
  overrides: Partial<AssistedOrderFormState> = {},
): AssistedOrderFormState {
  return {
    customerId: 'customer-1',
    dogId: 'dog-1',
    targetGoal: 'LOSE_WEIGHT',
    recipeQuantity: 2,
    requestedProteinCodes: [],
    allergyStatus: 'NO_ALLERGY',
    allergyText: '',
    currentFoodMain: 'DRY',
    currentFoodOther: '',
    changeReasons: ['HEALTHIER'],
    stomachConditions: [],
    additionalNotes: '',
    payment: {
      collected: true,
      channel: 'OFFLINE_WECHAT',
      amount: 900,
      externalRef: '',
      overrideReason: '',
    },
    ...overrides,
  }
}

describe('顾客/狗消歧', () => {
  it('任何顾客展示都必须同时带姓名与手机号', () => {
    expect(describeCustomer('王女士', '13800138000')).toBe('王女士（13800138000）')
  })

  it('缺姓名/手机号时给出可读占位，不退回只显示名字', () => {
    expect(describeCustomer('', '13800138000')).toBe('未命名顾客（13800138000）')
    expect(describeCustomer('王女士', null)).toBe('王女士（无手机号）')
    expect(describeCustomer(undefined, undefined)).toBe('未命名顾客（无手机号）')
  })
})

describe('服务端报价与实收金额', () => {
  it('金额只格式化，不做任何定价运算', () => {
    expect(formatMoney(538.2)).toBe('538.20')
    expect(formatMoney(null)).toBe('0.00')
    expect(formatMoney(undefined)).toBe('—')
  })

  it('折扣文案来自报价折扣率，不参与计算', () => {
    expect(formatDiscountRate(0)).toBe('无优惠')
    expect(formatDiscountRate(0.1)).toBe('9折')
    expect(formatDiscountRate(0.05)).toBe('95折')
    expect(formatDiscountRate(0.15)).toBe('85折')
  })

  it('员工没改过金额时，新报价自动成为实收', () => {
    expect(shouldSyncActualAmount(828, 828, false)).toBe(true)
    expect(shouldSyncActualAmount(828, 828, true)).toBe(true)
  })

  it('员工改过实收后，不覆盖他填的金额', () => {
    expect(shouldSyncActualAmount(800, 828, true)).toBe(false)
    expect(shouldSyncActualAmount(null, 828, true)).toBe(false)
  })
})

describe('实收差异原因', () => {
  it('实收等于应付时不需要原因', () => {
    expect(
      getPaymentValidationError({
        collected: true,
        amount: 900,
        payableAmount: 900,
        overrideReason: '',
      }),
    ).toBeNull()
  })

  it('实收与应付不一致时必须填写原因', () => {
    expect(
      getPaymentValidationError({
        collected: true,
        amount: 880,
        payableAmount: 900,
        overrideReason: '',
      }),
    ).toBe('实收金额与系统报价不一致时，必须填写原因')

    expect(
      getPaymentValidationError({
        collected: true,
        amount: 880,
        payableAmount: 900,
        overrideReason: '老客户抹零',
      }),
    ).toBeNull()
  })

  it('已收款时实收必须大于 0，负数一律拒绝', () => {
    expect(
      getPaymentValidationError({
        collected: true,
        amount: 0,
        payableAmount: 0,
        overrideReason: '',
      }),
    ).toBe('已收款时实收金额必须大于 0')

    expect(
      getPaymentValidationError({
        collected: false,
        amount: -1,
        payableAmount: 900,
        overrideReason: '测试',
      }),
    ).toBe('实收金额不能为负数')
  })

  it('没有服务端报价时不允许提交', () => {
    expect(
      getPaymentValidationError({
        collected: true,
        amount: 900,
        payableAmount: null,
        overrideReason: '',
      }),
    ).toBe('请先获取服务端报价')
  })
})

describe('提交前完整校验', () => {
  const options = {
    maxQuantity: 5,
    proteinMode: 'DIETITIAN' as const,
    quotePayable: 900,
  }

  it('完整表单没有任何问题', () => {
    expect(collectAssistedOrderIssues(makeForm(), options)).toEqual([])
  })

  it('顾客、狗、目标、过敏回答、当前食物、原因缺一不可', () => {
    const issues = collectAssistedOrderIssues(
      makeForm({
        customerId: '',
        dogId: '',
        targetGoal: '',
        allergyStatus: '',
        currentFoodMain: '',
        changeReasons: [],
      }),
      { ...options, quotePayable: null },
    )

    expect(issues).toContain('请选择顾客')
    expect(issues).toContain('请选择狗狗')
    expect(issues).toContain('请选择健康管理方向')
    expect(issues).toContain('请先回答狗狗是否对部分食物过敏')
    expect(issues).toContain('请选择现在主要喂什么')
    expect(issues).toContain('请选择定制原因')
    expect(issues).toContain('请先获取服务端报价')
  })

  it('份数必须落在 1–当前上限', () => {
    expect(
      collectAssistedOrderIssues(makeForm({ recipeQuantity: 6 }), options),
    ).toContain('份数必须是 1~5 的整数')
    expect(
      collectAssistedOrderIssues(makeForm({ recipeQuantity: 0 }), options),
    ).toContain('份数必须是 1~5 的整数')
    expect(
      collectAssistedOrderIssues(makeForm({ recipeQuantity: 2 }), {
        ...options,
        maxQuantity: 1,
      }),
    ).toContain('份数必须是 1~1 的整数')
  })

  it('自己选主蛋白时必须恰好等于份数且不重复', () => {
    expect(
      collectAssistedOrderIssues(
        makeForm({ requestedProteinCodes: ['CHICKEN'] }),
        { ...options, proteinMode: 'SELF' },
      ),
    ).toContain('请选择 2 种主蛋白，或改选“营养师配”')

    expect(
      collectAssistedOrderIssues(
        makeForm({ requestedProteinCodes: ['CHICKEN', 'CHICKEN'] }),
        { ...options, proteinMode: 'SELF' },
      ),
    ).toContain('主蛋白不能重复选择')

    expect(
      collectAssistedOrderIssues(
        makeForm({ requestedProteinCodes: ['CHICKEN', 'BEEF'] }),
        { ...options, proteinMode: 'SELF' },
      ),
    ).toEqual([])
  })

  it('有过敏必须写过敏食物；当前食物选其他必须补充说明', () => {
    const issues = collectAssistedOrderIssues(
      makeForm({
        allergyStatus: 'HAS_ALLERGY',
        allergyText: '',
        currentFoodMain: 'OTHER',
        currentFoodOther: '',
      }),
      options,
    )

    expect(issues).toContain('请补充过敏食物')
    expect(issues).toContain('请补充现在主要喂什么的说明')
  })
})

describe('提交载荷', () => {
  it('拼装后端 assisted DTO，不夹带页面自算金额', () => {
    const payload = buildAssistedOrderPayload(
      makeForm({
        allergyStatus: 'HAS_ALLERGY',
        allergyText: ' 鸡肉、牛肉 ',
        currentFoodMain: 'OTHER',
        currentFoodOther: ' 自制鲜食 ',
        changeReasons: ['HEALTHIER', 'PICKY'],
        stomachConditions: ['SOFT'],
        additionalNotes: ' 最近换粮 ',
        payment: {
          collected: true,
          channel: 'OFFLINE_ALIPAY',
          amount: 880,
          externalRef: ' 20261021001 ',
          overrideReason: ' 老客户抹零 ',
        },
      }),
      { proteinMode: 'DIETITIAN', quotePayable: 900 },
    )

    expect(payload).toMatchObject({
      customerId: 'customer-1',
      dogId: 'dog-1',
      targetGoal: 'LOSE_WEIGHT',
      recipeQuantity: 2,
      requestedProteinCodes: [],
      allergies: [],
      allergyText: '鸡肉、牛肉',
      allergyStatus: 'HAS_ALLERGY',
      currentFoodMain: 'OTHER',
      currentFoodOther: '自制鲜食',
      changeReasons: ['HEALTHIER', 'PICKY'],
      stomachConditions: ['SOFT'],
      additionalNotes: '最近换粮',
      payment: {
        collected: true,
        channel: 'OFFLINE_ALIPAY',
        amount: 880,
        externalRef: '20261021001',
        overrideReason: '老客户抹零',
      },
    })
    expect(payload).not.toHaveProperty('unitAmount')
    expect(payload).not.toHaveProperty('payableAmount')
  })

  it('营养师配时不传主蛋白；没有过敏时清空过敏文本', () => {
    const payload = buildAssistedOrderPayload(
      makeForm({
        requestedProteinCodes: ['CHICKEN', 'BEEF'],
        allergyStatus: 'NO_ALLERGY',
        allergyText: '不该被提交',
        currentFoodMain: 'DRY',
        currentFoodOther: '不该被提交',
      }),
      { proteinMode: 'DIETITIAN', quotePayable: 900 },
    )

    expect(payload.requestedProteinCodes).toEqual([])
    expect(payload.allergyText).toBeNull()
    expect(payload.currentFoodOther).toBeNull()
  })

  it('实收等于应付时清掉差异原因（与后端落库口径一致）', () => {
    const payload = buildAssistedOrderPayload(
      makeForm({
        payment: {
          collected: true,
          channel: 'OFFLINE_WECHAT',
          amount: 900,
          externalRef: '',
          overrideReason: '填了也不算',
        },
      }),
      { proteinMode: 'DIETITIAN', quotePayable: 900 },
    )

    expect(payload.payment.overrideReason).toBeNull()
  })
})

describe('线下收款渠道', () => {
  it('只有线下微信/支付宝/其他，不提供线上支付渠道', () => {
    expect(ASSISTED_PAYMENT_CHANNELS.map((item) => item.value)).toEqual([
      'OFFLINE_WECHAT',
      'OFFLINE_ALIPAY',
      'OTHER',
    ])
    expect(ASSISTED_PAYMENT_CHANNELS.map((item) => item.label)).toEqual([
      '线下微信',
      '线下支付宝',
      '其他（现金等）',
    ])
  })

  it('代客目标只有减重/维持/增重三个 code', () => {
    expect([...ASSISTED_TARGET_GOAL_CODES]).toEqual([
      'LOSE_WEIGHT',
      'MAINTAIN',
      'GAIN_WEIGHT',
    ])
    expect([...ASSISTED_TARGET_GOAL_CODES]).not.toContain('HEALTH_SUPPORT')
  })

  it('主蛋白选项与小程序一致（六种，不含鱼）', () => {
    expect(PROTEIN_OPTIONS.map((item) => item.code)).toEqual([
      'CHICKEN',
      'DUCK',
      'PORK',
      'BEEF',
      'TURKEY',
      'RABBIT',
    ])
    expect(PROTEIN_OPTIONS.map((item) => item.code)).not.toContain('FISH')
  })
})

describe('顾客 + 狗狗合并结果（2026-10-21）', () => {
  const items: AssistedCustomerDogSearchItem[] = [
    {
      id: 'customer-1',
      name: '王女士',
      phone: '13800138000',
      role: 'CUSTOMER',
      isInternal: false,
      dogs: [
        {
          id: 'dog-1',
          name: 'Seven',
          breedName: '柯基',
          birthday: '2023-01-01',
          ageText: null,
          currentWeightKg: 11.2,
        },
        {
          id: 'dog-2',
          name: '面包',
          breedName: null,
          birthday: null,
          ageText: null,
          currentWeightKg: null,
        },
      ],
    },
    {
      id: 'admin-1',
      name: '内部测试号',
      phone: null,
      role: 'ADMIN',
      isInternal: true,
      dogs: [],
    },
  ]

  it('★ 每个顾客的狗狗全部保留，不能只留关键词命中的那只', () => {
    const cards = buildCustomerDogCards(items)

    expect(cards).toHaveLength(2)
    expect(cards[0]!.dogs.map((dog) => dog.name)).toEqual(['Seven', '面包'])
    expect(cards[0]!.dogs[0]).toMatchObject({
      id: 'dog-1',
      name: 'Seven',
      breedName: '柯基',
      weightText: '11.2 kg',
    })
  })

  it('★ 补齐空姓名/空品种/年龄体重占位，不把空值丢给模板', () => {
    const cards = buildCustomerDogCards([
      {
        id: 'c2',
        name: null,
        phone: null,
        role: '',
        isInternal: false,
        dogs: [
          {
            id: 'd9',
            name: '',
            breedName: null,
            birthday: null,
            ageText: null,
            currentWeightKg: null,
          },
        ],
      },
    ])

    expect(cards[0]).toMatchObject({
      name: '未命名顾客',
      role: 'CUSTOMER',
      isInternal: false,
    })
    expect(cards[0]!.dogs[0]).toMatchObject({
      name: '未命名狗狗',
      breedName: null,
      ageText: '年龄未填',
      weightText: '体重未填',
    })
  })

  it('★ 后端给了 ageText 就直接用；没给才按生日算', () => {
    const cards = buildCustomerDogCards([
      {
        ...items[0]!,
        dogs: [
          {
            id: 'dog-1',
            name: 'Seven',
            breedName: '柯基',
            birthday: '2023-01-01',
            ageText: '3岁2个月',
            currentWeightKg: 11.2,
          },
        ],
      },
    ])

    expect(cards[0]!.dogs[0]!.ageText).toBe('3岁2个月')
    expect(formatDogAge('')).toBe('年龄未填')
    expect(formatDogAge('2023-01-01')).toMatch(/岁|个月|天/)
    expect(formatDogWeight(0)).toBe('体重未填')
  })

  it('★ 内部账号由 isInternal / role 判定，普通顾客不会被误标', () => {
    const cards = buildCustomerDogCards(items)

    expect(cards[0]!.isInternal).toBe(false)
    expect(cards[1]!.isInternal).toBe(true)
    expect(isInternalCustomer({ role: 'STAFF' })).toBe(true)
    expect(isInternalCustomer({ role: 'ADMIN', isInternal: false })).toBe(false)
    expect(isInternalCustomer({ role: 'CUSTOMER' })).toBe(false)
    expect(isInternalCustomer({ role: '' })).toBe(false)
  })

  it('★ 只有内部账号的卡片需要二次确认', () => {
    const cards = buildCustomerDogCards(items)

    expect(requiresInternalConfirmation(cards[0]!)).toBe(false)
    expect(requiresInternalConfirmation(cards[1]!)).toBe(true)
    expect(requiresInternalConfirmation({})).toBe(false)
  })
})

describe('已选身份卡', () => {
  it('★ 同时带出顾客姓名/手机号与狗狗品种/年龄/体重', () => {
    const identity = buildSelectedIdentity(
      {
        id: 'customer-1',
        name: '王女士',
        phone: '13800138000',
        role: 'CUSTOMER',
        isInternal: false,
      },
      {
        id: 'dog-1',
        name: 'Seven',
        breedName: '柯基',
        ageText: '3岁',
        weightText: '11.2 kg',
      },
    )

    expect(identity).toMatchObject({
      customerId: 'customer-1',
      customerName: '王女士',
      customerPhone: '13800138000',
      isInternal: false,
      dogId: 'dog-1',
      dogName: 'Seven',
      dogBreedName: '柯基',
      dogAgeText: '3岁',
      dogWeightText: '11.2 kg',
    })
  })

  it('★ 内部账号保留标记，供身份卡显示警示', () => {
    const identity = buildSelectedIdentity(
      { id: 'admin-1', name: '老板测试号', phone: null, role: 'ADMIN' },
      null,
    )

    expect(identity.isInternal).toBe(true)
    expect(identity.customerPhone).toBe('未填写手机号')
    expect(identity.dogId).toBeNull()
    expect(identity.dogName).toBe('')
  })
})
