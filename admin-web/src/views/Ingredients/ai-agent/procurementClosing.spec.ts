import { describe, expect, it } from 'vitest'
import {
  applyRecognizedDraft,
  buildCreateSkuPayload,
  computeClosingState,
  formatCostPreview,
  formatRatioText,
  shouldShowProcurementCard,
  type RecognizedSkuDraft,
} from './procurementClosing'

/**
 * AI 建档收尾「补一条采购商品」（2026-11-07）。
 *
 * 这一步是整条食材线的闭环：没有采购商品 → 买不了 → 成本永远是 0 →
 * 食谱里这条食材按「免费」算，售价跟着偏低。
 */
describe('AI 建档收尾 · 采购商品', () => {
  it('没填价时是 MISSING_PRICE（不算走完）', () => {
    expect(
      computeClosingState({
        pricePerPackage: null,
        netContent: 500,
        purchaseUnit: '袋'
      }),
    ).toBe('MISSING_PRICE')
  })

  it('价和净含量都填了才是 READY', () => {
    expect(
      computeClosingState({
        pricePerPackage: 39.9,
        netContent: 500,
        purchaseUnit: '袋'
      }),
    ).toBe('READY')
  })

  it('只填了价、没填净含量也不算走完（否则算不出每克成本）', () => {
    expect(
      computeClosingState({
        pricePerPackage: 39.9,
        netContent: null,
        purchaseUnit: '袋'
      }),
    ).toBe('MISSING_PRICE')
  })

  it('提交体只带「人话」字段，换算交给服务端算', () => {
    const payload = buildCreateSkuPayload({
      name: '山姆 糙米',
      purchaseChannel: '山姆会员店',
      purchaseUnit: '袋',
      packCount: 1,
      netContentPerPack: 500,
      currentPurchasePrice: 39.9,
    })

    expect(payload).toEqual({
      name: '山姆 糙米',
      purchaseChannel: '山姆会员店',
      purchaseUnit: '袋',
      packCount: 1,
      netContentPerPack: 500,
      currentPurchasePrice: 39.9,
    })
    // 前端不自己算换算：算错一次，库存差几十倍
    expect(payload).not.toHaveProperty('purchaseToBaseRatio')
  })

  it('换算预览按「一件多少钱 ÷ 净含量」显示', () => {
    expect(formatCostPreview(39.9, 500, 'g')).toBe('≈ ¥0.079800 / g')
    expect(formatCostPreview(null, 500, 'g')).toBe('')
    expect(formatCostPreview(39.9, 0, 'g')).toBe('')
  })
})

/**
 * 截图识别 → 自动填表（2026-11-08）。
 *
 * 规则只有两条：**只填空格子**（人手打进去的不许被 AI 盖掉）、
 * **读不出的不填**（缺的进待补，绝不编数字——净含量错一次库存差几十倍）。
 */
describe('截图识别 · 自动填表', () => {
  const blankForm = () => ({
    name: '',
    purchaseChannel: '',
    purchaseUnit: '',
    packCount: 1 as number,
    netContentPerPack: undefined as number | undefined,
    currentPurchasePrice: undefined as number | undefined
  })

  const fullDraft = (
    overrides: Partial<RecognizedSkuDraft> = {}
  ): RecognizedSkuDraft => ({
    name: '沃集鲜 秋刀鱼 1kg',
    brand: '沃集鲜',
    productModel: '1kg/袋',
    purchaseChannel: '沃尔玛',
    purchaseUnit: '袋',
    packCount: 1,
    netContentPerPack: 1000,
    netContentUnitText: 'kg',
    unitPrice: 39.9,
    missing: [],
    confidence: { name: 'high', purchaseChannel: 'low', netContent: 'high' },
    ...overrides
  })

  it('空表单：五个格子全填上，并记下哪些是 AI 填的', () => {
    const result = applyRecognizedDraft(blankForm(), fullDraft())

    expect(result.form.name).toBe('沃集鲜 秋刀鱼 1kg')
    expect(result.form.purchaseUnit).toBe('袋')
    expect(result.form.packCount).toBe(1)
    expect(result.form.netContentPerPack).toBe(1000)
    expect(result.form.currentPurchasePrice).toBe(39.9)
    expect(result.form.purchaseChannel).toBe('沃尔玛')
    expect(result.aiFilled.sort()).toEqual(
      ['name', 'netContentPerPack', 'packCount', 'purchaseChannel', 'purchaseUnit', 'currentPurchasePrice'].sort()
    )
  })

  it('人已经填过的格子不覆盖（价 45 块不能被识别结果盖成 39.9）', () => {
    const form = { ...blankForm(), currentPurchasePrice: 45, name: '我自己起的名字' }

    const result = applyRecognizedDraft(form, fullDraft())

    expect(result.form.currentPurchasePrice).toBe(45)
    expect(result.form.name).toBe('我自己起的名字')
    expect(result.aiFilled).not.toContain('currentPurchasePrice')
    expect(result.aiFilled).not.toContain('name')
    // 空格子照填
    expect(result.form.netContentPerPack).toBe(1000)
  })

  it('件数默认 1 时 AI 读到多件可以覆盖；人填过的非 1 值不覆盖', () => {
    const defaultOne = applyRecognizedDraft(
      blankForm(),
      fullDraft({ packCount: 24, netContentPerPack: 330 })
    )
    expect(defaultOne.form.packCount).toBe(24)

    const typedFive = applyRecognizedDraft(
      { ...blankForm(), packCount: 5 },
      fullDraft({ packCount: 24 })
    )
    expect(typedFive.form.packCount).toBe(5)
    expect(typedFive.aiFilled).not.toContain('packCount')
  })

  it('读不出的字段不填，留给「待补」', () => {
    const draft = fullDraft({
      netContentPerPack: null,
      missing: ['netContentPerPack']
    })

    const result = applyRecognizedDraft(blankForm(), draft)

    expect(result.form.netContentPerPack).toBeUndefined()
    expect(result.missing).toContain('netContentPerPack')
    expect(result.aiFilled).not.toContain('netContentPerPack')
  })

  it('渠道是推测的就标出来（AI 推测·可改）', () => {
    const result = applyRecognizedDraft(blankForm(), fullDraft())

    expect(result.lowConfidence).toContain('purchaseChannel')
  })

  it('倍率按「件数 × 每件净含量」显示，供人核对', () => {
    expect(formatRatioText(1, 1000, 'g')).toBe('1 件 × 1000 g → 一袋 = 1000 g')
    expect(formatRatioText(24, 330, 'ml')).toBe('24 件 × 330 ml → 一箱 = 7920 ml')
    expect(formatRatioText(1, 1000, 'g', '袋')).toBe('1 件 × 1000 g → 一袋 = 1000 g')
    expect(formatRatioText(null, 1000, 'g')).toBe('')
    expect(formatRatioText(1, null, 'g')).toBe('')
  })

  it('采购单位没选不算填完（后端会拒），提示还差单位', () => {
    expect(
      computeClosingState({ pricePerPackage: 39.9, netContent: 500, purchaseUnit: '  ' }),
    ).toBe('MISSING_UNIT')
    expect(
      computeClosingState({ pricePerPackage: 39.9, netContent: 500, purchaseUnit: '袋' }),
    ).toBe('READY')
  })
})

/**
 * 板块出现时机（2026-11-08 老板定）：
 * 先填原料档案、两页核验都通过，才出现「这条原料的采购商品」。
 * 为什么：识别与倍率都要按原料的基准单位算；档案没定就没法算，也不该让人先填这个。
 */
describe('采购商品板块 · 出现时机', () => {
  const ready = {
    line: 'FOOD',
    hasDraft: true,
    hasIngredientBaseUnit: true,
    checksReady: true
  }

  it('原料写全 + 两页核验通过 → 出现', () => {
    expect(shouldShowProcurementCard(ready)).toBe(true)
  })

  it('补剂线不出现（补剂没有采购商品）', () => {
    expect(shouldShowProcurementCard({ ...ready, line: 'SUPPLEMENT' })).toBe(false)
  })

  it('还没有草稿 → 不出现', () => {
    expect(shouldShowProcurementCard({ ...ready, hasDraft: false })).toBe(false)
  })

  it('原料卡还没写全（没有基准单位）→ 不出现', () => {
    expect(shouldShowProcurementCard({ ...ready, hasIngredientBaseUnit: false })).toBe(false)
  })

  it('两页核验还没过 → 不出现', () => {
    expect(shouldShowProcurementCard({ ...ready, checksReady: false })).toBe(false)
  })
})
