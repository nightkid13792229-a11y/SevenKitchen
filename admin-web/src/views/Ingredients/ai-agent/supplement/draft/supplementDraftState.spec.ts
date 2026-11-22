import { describe, expect, it } from 'vitest'
import type {
  SupplementDraftIssueCode,
  SupplementDraftPayload,
  SupplementDraftReview,
  SupplementDraftValidationIssue,
  SupplementDraftView
} from '@/api/supplementDrafts'
import {
  ackKeyOf,
  applyDraftAiSelection,
  canFinalize,
  diffDraft,
  fieldMapRows,
  formatDraftFieldValue,
  hasBlocker
} from './supplementDraftState'

/** 一张最小可用的完整草稿载荷（空值形状与后端 normalize 一致）。 */
function basePayload(): SupplementDraftPayload {
  return {
    basic: {
      name: '',
      brand: '',
      productModel: '',
      purchaseChannel: '',
      baseUnit: 'PCS',
      unitDisplayLabel: '',
      physicalForm: null,
      servingUnitsPerDose: null,
      purchaseUnit: '',
      purchaseToBaseRatio: null,
      currentPricePerPurchaseUnit: null,
      productionLossRate: 1.05,
      addTiming: ''
    },
    nutrition: {
      servingNutrients: {},
      defaultTargetFields: [],
      labelText: ''
    },
    label: {
      labelCategory: null,
      labelNames: [],
      tagNames: [],
      labelNameSource: ''
    },
    retail: {
      enabled: false,
      shelfLifeMonths: null,
      openedShelfLifeDays: null,
      storageCondition: '',
      isOilBased: false,
      noSaleReason: null
    },
    diy: {
      enabled: false,
      platform: '',
      linkUrl: '',
      imageUrl: ''
    },
    procurement: {
      enabled: false
    },
    equivalence: {
      groupId: null,
      priority: null,
      reapproveGroup: true
    },
    evidence: {
      frontImageUrl: '',
      labelImageUrl: '',
      productUrl: '',
      selectionNote: ''
    },
    review: {
      acknowledgedWarnings: []
    }
  }
}

function issue(
  code: SupplementDraftIssueCode,
  overrides: Partial<SupplementDraftValidationIssue> = {}
): SupplementDraftValidationIssue {
  return {
    code,
    level: 'WARNING',
    message: '提示',
    ...overrides
  }
}

function draftView(payload: SupplementDraftPayload): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'admin-1',
    status: 'DRAFT',
    schemaVersion: 1,
    name: payload.basic.name,
    payload,
    aiSnapshot: null,
    manualFields: [],
    verification: null,
    finalizedIngredientId: null,
    finalizedNutritionFoodId: null,
    finalizedEvidenceId: null,
    finalizedAt: null,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
    completeness: { totalRequired: 15, filledRequired: 0, missing: [] }
  }
}

function review(
  blockers: SupplementDraftValidationIssue[] = [],
  warnings: SupplementDraftValidationIssue[] = []
): SupplementDraftReview {
  const payload = basePayload()
  return {
    draft: draftView(payload),
    blockers,
    warnings,
    completeness: { totalRequired: 15, filledRequired: 0, missing: [] }
  }
}

describe('最终写入门禁', () => {
  it('有阻断项时不能写入，即使提醒都确认了', () => {
    const result = review(
      [issue('NAME_REQUIRED', { level: 'BLOCKER', message: '名称必填' })],
      [issue('SHOP_DISABLED', { ackKey: 'SHOP_DISABLED' })]
    )
    expect(hasBlocker(result)).toBe(true)
    expect(canFinalize(result, ['SHOP_DISABLED'])).toBe(false)
  })

  it('提醒项没逐条确认时不能写入', () => {
    const result = review(
      [],
      [
        issue('EVIDENCE_MISSING', { ackKey: 'EVIDENCE_MISSING:front' }),
        issue('SHOP_DISABLED', { ackKey: 'SHOP_DISABLED' })
      ]
    )
    expect(canFinalize(result, [])).toBe(false)
    expect(canFinalize(result, ['EVIDENCE_MISSING:front'])).toBe(false)
    expect(canFinalize(result, ['EVIDENCE_MISSING:front', 'SHOP_DISABLED'])).toBe(
      true
    )
  })

  it('没有阻断项、提醒都确认后可以写入；没有提醒也可以', () => {
    expect(canFinalize(review(), [])).toBe(true)
    expect(canFinalize(review([], [issue('SHOP_DISABLED', { ackKey: 'SHOP_DISABLED' })]), ['SHOP_DISABLED'])).toBe(
      true
    )
  })

  it('提醒项没有 ackKey 时回退用 code 匹配', () => {
    const result = review([], [issue('SHOP_DISABLED')])
    expect(canFinalize(result, ['SHOP_DISABLED'])).toBe(true)
    expect(canFinalize(result, ['SHOP_DISABLED:other'])).toBe(false)
  })

  it('没有审核结果时不允许写入', () => {
    expect(canFinalize(null, [])).toBe(false)
  })
})

describe('提醒项确认键', () => {
  it('优先用后端给的 ackKey', () => {
    expect(
      ackKeyOf({
        code: 'EVIDENCE_MISSING',
        ackKey: 'EVIDENCE_MISSING:front'
      })
    ).toBe('EVIDENCE_MISSING:front')
  })

  it('ackKey 缺失或为空时回退 code', () => {
    expect(ackKeyOf({ code: 'SHOP_DISABLED' })).toBe('SHOP_DISABLED')
    expect(ackKeyOf({ code: 'SHOP_DISABLED', ackKey: '   ' })).toBe(
      'SHOP_DISABLED'
    )
  })
})

describe('AI 重填 diff', () => {
  it('两份一样时返回空数组', () => {
    const before = basePayload()
    expect(diffDraft(before, basePayload())).toEqual([])
  })

  it('列出变化字段的前后值和类型', () => {
    const before = basePayload()
    before.basic.name = '旧名字'
    before.basic.brand = '旧品牌'
    before.nutrition.servingNutrients = { 'fattyAcids.epa': 100 }
    before.label.labelNames = ['鱼油']
    before.retail.shelfLifeMonths = 24
    before.diy.linkUrl = 'https://old.example.com'
    before.equivalence.groupId = '__SKIP__'

    const after = basePayload()
    after.basic.name = '新名字'
    after.basic.brand = '旧品牌'
    after.nutrition.servingNutrients = { 'fattyAcids.epa': 120 }
    after.label.labelNames = ['鱼油', 'EPA']
    after.retail.shelfLifeMonths = 36
    after.diy.linkUrl = 'https://new.example.com'
    after.equivalence.groupId = 'group-1'
    after.procurement.enabled = true
    after.evidence.productUrl = 'https://item.example.com'

    const rows = diffDraft(before, after)
    const paths = rows.map((row) => row.path)

    // 没变的品牌不出现；变化的字段一个不少。
    expect(paths).not.toContain('basic.brand')
    expect(paths).toEqual(
      expect.arrayContaining([
        'basic.name',
        'nutrition.servingNutrients.fattyAcids.epa',
        'label.labelNames',
        'retail.shelfLifeMonths',
        'diy.linkUrl',
        'equivalence.groupId',
        'procurement.enabled',
        'evidence.productUrl'
      ])
    )

    const byPath = new Map(rows.map((row) => [row.path, row]))
    const nameRow = byPath.get('basic.name')
    expect(nameRow?.before).toBe('旧名字')
    expect(nameRow?.after).toBe('新名字')
    expect(byPath.get('retail.shelfLifeMonths')?.before).toBe(24)
    expect(byPath.get('retail.shelfLifeMonths')?.after).toBe(36)
    expect(Array.isArray(byPath.get('label.labelNames')?.after)).toBe(true)
    expect(byPath.get('procurement.enabled')?.after).toBe(true)
    expect(byPath.get('evidence.productUrl')?.after).toBe(
      'https://item.example.com'
    )
  })

  it('人改过的路径（含父路径）标 manual，其余不标', () => {
    const before = basePayload()
    before.basic.name = '旧名字'
    before.nutrition.servingNutrients = { 'fattyAcids.epa': 100 }
    before.retail.shelfLifeMonths = 24

    const after = basePayload()
    after.basic.name = '新名字'
    after.nutrition.servingNutrients = { 'fattyAcids.epa': 120 }
    after.retail.shelfLifeMonths = 36

    const rows = diffDraft(before, after, [
      'basic.name',
      'nutrition.servingNutrients'
    ])
    const byPath = new Map(rows.map((row) => [row.path, row]))

    expect(byPath.get('basic.name')?.manual).toBe(true)
    // 父路径 manualFields 覆盖子路径：营养素的每一条都算人改过。
    expect(byPath.get('nutrition.servingNutrients.fattyAcids.epa')?.manual).toBe(
      true
    )
    expect(byPath.get('retail.shelfLifeMonths')?.manual).toBe(false)
  })

  it('按勾选采用 AI 值，其余路径回退到原值并标人改（营养素扁平键也能回退）', () => {
    const before = basePayload()
    before.basic.name = '旧名字'
    before.basic.brand = '旧品牌'
    before.nutrition.servingNutrients = { 'fattyAcids.epa': 100 }

    const after = basePayload()
    after.basic.name = 'AI 名字'
    after.basic.brand = 'AI 品牌'
    after.nutrition.servingNutrients = { 'fattyAcids.epa': 120 }

    const local = basePayload()
    local.basic.name = '本地名字'
    local.basic.brand = '本地品牌'
    local.nutrition.servingNutrients = { 'fattyAcids.epa': 100 }

    const result = applyDraftAiSelection(
      before,
      after,
      ['basic.brand'],
      ['basic.name'],
      local
    )

    expect(result.payload.basic.name).toBe('AI 名字')
    // 人改过的品牌即使 AI 给了新值，也保留当前本地值（不是 before）。
    expect(result.payload.basic.brand).toBe('本地品牌')
    expect(result.payload.nutrition.servingNutrients['fattyAcids.epa']).toBe(100)
    expect(result.manualPaths).toEqual(
      expect.arrayContaining([
        'basic.brand',
        'nutrition.servingNutrients.fattyAcids.epa'
      ])
    )
    expect(result.manualPaths).not.toContain('basic.name')
  })

  it('manual 行保留当前本地值，非 manual 未勾选行才回退 before', () => {
    const before = basePayload()
    before.basic.name = '旧名字'
    before.basic.brand = '旧品牌'
    const after = basePayload()
    after.basic.name = 'AI 名字'
    after.basic.brand = 'AI 品牌'
    const local = basePayload()
    local.basic.name = 'AI 名字'
    local.basic.brand = '本地最新品牌'

    const result = applyDraftAiSelection(
      before,
      after,
      ['basic.brand'],
      [],
      local
    )

    expect(result.payload.basic.brand).toBe('本地最新品牌')
    expect(result.payload.basic.name).toBe('旧名字')
    expect(result.manualPaths).toEqual(
      expect.arrayContaining(['basic.brand', 'basic.name'])
    )
  })

  it('「保留我的」把全部变化回退成原值', () => {
    const before = basePayload()
    before.basic.name = '旧名字'
    before.retail.shelfLifeMonths = 24
    const after = basePayload()
    after.basic.name = 'AI 名字'
    after.retail.shelfLifeMonths = 36

    const result = applyDraftAiSelection(before, after, [], [])

    expect(result.payload).toEqual(before)
    expect(result.manualPaths).toEqual(
      expect.arrayContaining(['basic.name', 'retail.shelfLifeMonths'])
    )
  })

  it('删掉某个营养素也会单独列出来（after 为空）', () => {
    const before = basePayload()
    before.nutrition.servingNutrients = {
      'fattyAcids.epa': 100,
      'fattyAcids.dha': 80
    }
    const after = basePayload()
    after.nutrition.servingNutrients = { 'fattyAcids.epa': 100 }

    const rows = diffDraft(before, after)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.path).toBe('nutrition.servingNutrients.fattyAcids.dha')
    expect(rows[0]?.before).toBe(80)
    expect(rows[0]?.after).toBeUndefined()
  })
})

describe('补剂差异不展示已移除的标签分类标签', () => {
  it('tagNames 变化不进入 AI 差异列表', () => {
    const before = basePayload()
    before.label.tagNames = ['氨基酸']
    const after = basePayload()
    after.label.tagNames = ['氨基酸', '矿物质']

    expect(diffDraft(before, after).map((row) => row.path)).not.toContain(
      'label.tagNames'
    )
  })
})

describe('字段 → 生产落点', () => {
  const byPath = new Map(fieldMapRows.map((row) => [row.path, row]))

  it('覆盖 spec §12 的关键字段', () => {
    expect(byPath.get('basic.name')?.target).toBe('ingredient.name')
    expect(byPath.get('retail.shelfLifeMonths')?.target).toBe(
      'ingredient.shelf_life_months'
    )
    expect(byPath.get('retail.openedShelfLifeDays')?.target).toBe(
      'ingredient.opened_shelf_life_days'
    )
    expect(byPath.get('diy.linkUrl')?.target).toBe(
      'ingredient.properties.purchase_link.url'
    )
    expect(byPath.get('equivalence.groupId')?.target).toBe(
      'ingredient.equivalence_group_id'
    )
    expect(byPath.get('procurement.enabled')?.target).toBe(
      'ingredient.procurement_enabled'
    )
    expect(byPath.get('evidence.frontImageUrl')?.target).toBe(
      'supplement_label_evidence.front_image_url'
    )
    expect(byPath.get('nutrition.servingNutrients')?.target).toContain(
      'nutrition_food.nutrition_data'
    )
  })

  it('每行都有给人看的字段名、落点和分组，且路径不重复', () => {
    expect(fieldMapRows.length).toBeGreaterThan(20)
    for (const row of fieldMapRows) {
      expect(row.label.length).toBeGreaterThan(0)
      expect(row.target.length).toBeGreaterThan(0)
      expect(row.section.length).toBeGreaterThan(0)
    }
    const paths = fieldMapRows.map((row) => row.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})


describe('差异值显示', () => {
  it('把枚举代码翻译成中文，不把内部代码给用户看', () => {
    expect(formatDraftFieldValue('basic.baseUnit', 'G')).toBe('克')
    expect(formatDraftFieldValue('basic.physicalForm', 'POWDER')).toBe('粉剂')
    expect(formatDraftFieldValue('basic.addTiming', 'BEFORE_MIXING')).toBe(
      '制作中添加'
    )
    expect(formatDraftFieldValue('label.labelCategory', 'FEED_ADDITIVE')).toBe(
      '饲料添加剂'
    )
    expect(formatDraftFieldValue('diy.platform', 'IHERB')).toBe('iHerb')
    expect(formatDraftFieldValue('retail.noSaleReason', 'BULK')).toBe('散装采购')
  })

  it('布尔和数组显示成人话', () => {
    expect(formatDraftFieldValue('retail.enabled', true)).toBe('上架')
    expect(formatDraftFieldValue('retail.enabled', false)).toBe('不上架')
    expect(formatDraftFieldValue('diy.enabled', true)).toBe('参与')
    expect(formatDraftFieldValue('procurement.enabled', false)).toBe('不参与')
    expect(
      formatDraftFieldValue('nutrition.defaultTargetFields', [
        'minerals.copper',
        'fattyAcids.epa'
      ])
    ).toBe('铜、EPA')
  })

  it('价格、保质期和每份营养带单位', () => {
    expect(
      formatDraftFieldValue('basic.currentPricePerPurchaseUnit', 98.52)
    ).toBe('98.52 元')
    expect(formatDraftFieldValue('retail.shelfLifeMonths', 24)).toBe('24 个月')
    expect(formatDraftFieldValue('retail.openedShelfLifeDays', 60)).toBe(
      '60 天'
    )
    expect(
      formatDraftFieldValue(
        'nutrition.servingNutrients.minerals.copper',
        2
      )
    ).toBe('2 mg')
  })

  it('空值和“暂不归组”有明确说法', () => {
    expect(formatDraftFieldValue('basic.brand', null)).toBe('空')
    expect(formatDraftFieldValue('basic.brand', undefined)).toBe(
      '（原草稿没有）'
    )
    expect(formatDraftFieldValue('equivalence.groupId', '__SKIP__')).toBe(
      '暂不归组'
    )
  })
})
