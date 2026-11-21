// @vitest-environment jsdom
/**
 * 最终审核页的组件测试（jsdom + @vue/test-utils）。
 *
 * 复核点：
 * - 有阻断项时「确认写入」必须禁用，并把字段路径显示出来；
 * - 提醒项逐条勾选，全部确认前禁用；全部确认后才允许写入并 emit；
 * - AI 决策日志必须展示 recommendCreate / 上架 / 等价组及理由；
 * - 字段映射表按区块分组，显示草稿路径 → 生产落点。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type {
  SupplementDraftPayload,
  SupplementDraftReview,
  SupplementDraftValidationIssue,
  SupplementDraftView
} from '@/api/supplementDrafts'
import DraftReview from './DraftReview.vue'

function basePayload(): SupplementDraftPayload {
  return {
    basic: {
      name: '铜',
      brand: 'Swanson',
      productModel: '120 粒/瓶',
      purchaseChannel: 'iHerb',
      baseUnit: 'PCS',
      unitDisplayLabel: '粒',
      physicalForm: 'CAPSULE',
      servingUnitsPerDose: 1,
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 80.76,
      productionLossRate: 1.05,
      addTiming: 'BEFORE_MEAL'
    },
    nutrition: {
      servingNutrients: { 'minerals.copper': 2 },
      defaultTargetFields: ['minerals.copper'],
      labelText: ''
    },
    label: {
      labelCategory: 'FEED_ADDITIVE',
      labelNames: ['铜'],
      tagNames: ['矿物质'],
      labelNameSource: '目录'
    },
    retail: {
      enabled: false,
      shelfLifeMonths: null,
      openedShelfLifeDays: null,
      storageCondition: '',
      isOilBased: false,
      noSaleReason: 'SELF_MADE'
    },
    diy: {
      enabled: true,
      platform: 'TAOBAO',
      linkUrl: 'https://example.com/buy',
      imageUrl: ''
    },
    procurement: { enabled: true },
    equivalence: { groupId: 'group-copper', priority: 1, reapproveGroup: true },
    evidence: {
      frontImageUrl: 'https://example.com/front.png',
      labelImageUrl: 'https://example.com/label.png',
      productUrl: 'https://example.com/product',
      selectionNote: ''
    },
    review: { acknowledgedWarnings: [] }
  }
}

function aiSnapshot(): Record<string, unknown> {
  const decisions = {
    recommendCreate: {
      value: false,
      reason: '标签显示这是人用产品，不建议建档'
    },
    retail: { enabled: false, reason: '没有找到商城售卖信息' },
    noSaleReason: 'SELF_MADE',
    diy: {
      enabled: true,
      linkUrl: 'https://example.com/buy',
      imageUrl: '',
      reason: '商品页有购买链接'
    },
    procurement: { enabled: true, reason: '可作为生产原料采购' },
    equivalence: { groupId: 'group-copper', reason: '与现有铜组同营养素' },
    labelNames: ['铜'],
    defaultTargetFields: ['minerals.copper'],
    tagNames: ['矿物质'],
    addTiming: 'BEFORE_MEAL'
  }
  return {
    status: 'OK',
    fields: {},
    missing: [],
    warnings: [],
    decisions,
    proposedDecisions: {
      ...decisions,
      retail: { enabled: true, reason: '商品页有价格' }
    }
  }
}

function draftView(): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'admin-1',
    status: 'DRAFT',
    schemaVersion: 1,
    name: '铜',
    payload: basePayload(),
    aiSnapshot: aiSnapshot(),
    manualFields: [],
    verification: null,
    finalizedIngredientId: null,
    finalizedNutritionFoodId: null,
    finalizedEvidenceId: null,
    finalizedAt: null,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T02:30:00.000Z',
    completeness: { totalRequired: 15, filledRequired: 13, missing: [] }
  }
}

function reviewState(
  overrides: Partial<SupplementDraftReview> = {}
): SupplementDraftReview {
  return {
    draft: draftView(),
    blockers: [],
    warnings: [],
    completeness: { totalRequired: 15, filledRequired: 13, missing: [] },
    ...overrides
  }
}

function blocker(
  overrides: Partial<SupplementDraftValidationIssue> = {}
): SupplementDraftValidationIssue {
  return {
    code: 'NAME_REQUIRED',
    level: 'BLOCKER',
    message: '请填写原料名称',
    fieldPath: 'basic.name',
    ...overrides
  }
}

function warning(
  overrides: Partial<SupplementDraftValidationIssue> = {}
): SupplementDraftValidationIssue {
  return {
    code: 'GROUP_NOT_APPROVED',
    level: 'WARNING',
    message: '等价组还没审核通过，本次写入会一并通过',
    fieldPath: 'equivalence.groupId',
    ackKey: 'GROUP_NOT_APPROVED:group-copper',
    ...overrides
  }
}

interface ReviewProps {
  review: SupplementDraftReview
  draft: SupplementDraftView
  acknowledged: string[]
  finalizing: boolean
}

function mountReview(overrides: Partial<ReviewProps> = {}) {
  return mount(DraftReview, {
    props: {
      review: reviewState(),
      draft: draftView(),
      acknowledged: [],
      finalizing: false,
      ...overrides
    },
    global: { plugins: [ElementPlus] }
  })
}

describe('补剂草稿最终审核页', () => {
  it('有阻断项时禁用写入，并显示阻断项与字段路径', async () => {
    const wrapper = mountReview({
      review: reviewState({ blockers: [blocker()] })
    })

    const button = wrapper.find('[data-action="finalize"]')
    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeDefined()

    expect(wrapper.findAll('[data-blocker]')).toHaveLength(1)
    expect(wrapper.text()).toContain('请填写原料名称')
    expect(wrapper.text()).toContain('basic.name')
    expect(wrapper.text()).toContain('还有 1 条阻断项')
  })

  it('提醒项未逐条确认时禁用，全部勾选后才能写入并发出 finalize', async () => {
    const first = warning()
    const second = warning({
      code: 'EVIDENCE_MISSING',
      message: '缺少标签图，写入后证据会不完整',
      fieldPath: 'evidence.labelImageUrl',
      ackKey: 'EVIDENCE_MISSING'
    })
    const wrapper = mountReview({
      review: reviewState({ warnings: [first, second] })
    })

    expect(wrapper.find('[data-action="finalize"]').attributes('disabled')).toBeDefined()
    const boxes = wrapper.findAll('[data-warning] input[type="checkbox"]')
    expect(boxes).toHaveLength(2)

    await boxes[0]!.setValue(true)
    expect(wrapper.emitted('update:acknowledged')?.[0]).toEqual([
      ['GROUP_NOT_APPROVED:group-copper']
    ])
    await wrapper.setProps({ acknowledged: ['GROUP_NOT_APPROVED:group-copper'] })
    expect(wrapper.find('[data-action="finalize"]').attributes('disabled')).toBeDefined()

    const refreshed = wrapper.findAll('[data-warning] input[type="checkbox"]')
    await refreshed[1]!.setValue(true)
    expect(wrapper.emitted('update:acknowledged')?.[1]).toEqual([
      ['GROUP_NOT_APPROVED:group-copper', 'EVIDENCE_MISSING']
    ])
    await wrapper.setProps({
      acknowledged: ['GROUP_NOT_APPROVED:group-copper', 'EVIDENCE_MISSING']
    })

    const button = wrapper.find('[data-action="finalize"]')
    expect(button.attributes('disabled')).toBeUndefined()

    await button.trigger('click')
    expect(wrapper.emitted('finalize')).toHaveLength(1)
  })

  it('显示完整性缺失项与 AI 决策日志（建议不建档 / 不上架 / 等价组理由）', () => {
    const wrapper = mountReview({
      review: reviewState({
        completeness: {
          totalRequired: 15,
          filledRequired: 13,
          missing: ['tagNames', 'groupId']
        }
      })
    })

    const text = wrapper.text()
    expect(text).toContain('13/15')
    expect(text).toContain('标签分类标签')
    expect(text).toContain('等价组')

    expect(text).toContain('AI 建议不建档')
    expect(text).toContain('标签显示这是人用产品，不建议建档')
    expect(text).toContain('不上架')
    expect(text).toContain('自制原料')
    expect(text).toContain('group-copper')
    expect(text).toContain('与现有铜组同营养素')
    expect(text).toContain('可作为生产原料采购')
    expect(text).toContain('商品页有购买链接')
    expect(text).toContain('AI 原始提议')
  })

  it('字段映射表按区块分组，显示草稿路径与生产落点', () => {
    const wrapper = mountReview()

    expect(wrapper.text()).toContain('写入后会写什么')
    expect(wrapper.text()).toContain('商品与基本')
    expect(wrapper.text()).toContain('营养')
    expect(wrapper.find('[data-field-path="basic.name"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ingredient.name')
    expect(wrapper.find('[data-field-map-section="商品与基本"]').exists()).toBe(true)
  })

  it('返回修改发出 back；写入中返回与写入都禁用', async () => {
    const wrapper = mountReview({
      review: reviewState({ warnings: [warning()] }),
      acknowledged: ['GROUP_NOT_APPROVED:group-copper']
    })

    await wrapper.find('[data-action="back"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)

    await wrapper.setProps({ finalizing: true })
    expect(wrapper.find('[data-action="back"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-action="finalize"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('正在写入')
  })
})
