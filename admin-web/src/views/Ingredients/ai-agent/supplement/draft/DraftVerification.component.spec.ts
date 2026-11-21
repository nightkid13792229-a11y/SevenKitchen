// @vitest-environment jsdom
/**
 * 写入后核验结果页的组件测试（jsdom + @vue/test-utils）。
 *
 * 复核点：
 * - ok=true / ok=false 的两句标题必须严格区分；失败时整页不能用成功样式；
 * - 直接字段按「期望 / 实际 / 是否通过」展示，功能项带修复入口；
 * - 修复入口落到真实路由（RECIPE/EQUIVALENCE/PACKAGING 有固定落点）；
 * - 「重新核验」发 reverify，核验中禁用。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type {
  SupplementDraftPayload,
  SupplementDraftView,
  SupplementWriteVerification
} from '@/api/supplementDrafts'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))

import DraftVerification from './DraftVerification.vue'

beforeEach(() => {
  router.push.mockReset()
})

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
    diy: { enabled: false, platform: '', linkUrl: '', imageUrl: '' },
    procurement: { enabled: false },
    equivalence: { groupId: 'group-copper', priority: 1, reapproveGroup: true },
    evidence: {
      frontImageUrl: '',
      labelImageUrl: '',
      productUrl: '',
      selectionNote: ''
    },
    review: { acknowledgedWarnings: [] }
  }
}

function draftView(): SupplementDraftView {
  return {
    id: 'draft-1',
    createdBy: 'admin-1',
    status: 'FINALIZED',
    schemaVersion: 1,
    name: '铜',
    payload: basePayload(),
    aiSnapshot: null,
    manualFields: [],
    verification: null,
    finalizedIngredientId: 'ingredient-1',
    finalizedNutritionFoodId: 'nutrition-1',
    finalizedEvidenceId: 'evidence-1',
    finalizedAt: '2026-11-21T03:00:00.000Z',
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T03:00:00.000Z',
    completeness: { totalRequired: 15, filledRequired: 15, missing: [] }
  }
}

function verification(
  overrides: Partial<SupplementWriteVerification> = {}
): SupplementWriteVerification {
  return {
    ok: false,
    checkedAt: '2026-11-21T03:00:00.000Z',
    fields: [
      {
        key: 'basic.name',
        label: '原料名称',
        target: 'ingredient.name',
        expected: '铜',
        actual: '铜',
        ok: true
      },
      {
        key: 'serving_units_per_dose',
        label: '每份多少',
        target: 'supplement_label_evidence.serving_units_per_dose',
        expected: 0.9,
        actual: 0.9,
        ok: true
      },
      {
        key: 'retail.shelfLifeMonths',
        label: '原厂保质期（月）',
        target: 'ingredient.shelf_life_months',
        expected: 24,
        actual: null,
        ok: false
      }
    ],
    features: [
      {
        code: 'RETAIL',
        label: '商城上架',
        ok: false,
        severity: 'ERROR',
        detail: '上架清单里查不到这条原料',
        action: { label: '去上架清单', path: '/supplement-shop' }
      },
      {
        code: 'RECIPE',
        label: '配方可选',
        ok: true,
        severity: 'INFO',
        detail: '主映射 + 营养档案 VERIFIED'
      },
      {
        code: 'EQUIVALENCE',
        label: '等价替换',
        ok: false,
        severity: 'WARN',
        detail: '已归组，但暂不参与等价替换',
        action: {
          label: '去等价组检查',
          path: '/supplement-shop/equivalence-groups'
        }
      },
      {
        code: 'PACKAGING',
        label: '分装',
        ok: false,
        severity: 'WARN',
        detail: '没有匹配到袋型规则',
        action: { label: '去配置包材', path: '/supplement-shop/packaging' }
      }
    ],
    ...overrides
  }
}

function mountVerification(
  overrides: Partial<{
    verification: SupplementWriteVerification
    draft: SupplementDraftView
    reverifying: boolean
  }> = {}
) {
  return mount(DraftVerification, {
    props: {
      verification: verification(),
      draft: draftView(),
      reverifying: false,
      ...overrides
    },
    global: { plugins: [ElementPlus] }
  })
}

describe('补剂写入核验结果页', () => {
  it('核验通过时显示「已写入并核验通过」且用成功样式', () => {
    const wrapper = mountVerification({
      verification: verification({
        ok: true,
        fields: verification().fields.map((field) => ({ ...field, ok: true })),
        features: verification().features.map((feature) => ({
          ...feature,
          ok: true,
          severity: 'INFO' as const
        }))
      })
    })

    expect(wrapper.text()).toContain('已写入并核验通过')
    expect(wrapper.find('[data-verification-state="ok"]').exists()).toBe(true)
    expect(wrapper.find('[data-verification-state="failed"]').exists()).toBe(false)
  })

  it('核验失败时显示「已写入，但以下功能未生效」，且整页不用成功样式', () => {
    const wrapper = mountVerification()

    expect(wrapper.text()).toContain('已写入，但以下功能未生效')
    expect(wrapper.find('[data-verification-state="failed"]').exists()).toBe(true)
    expect(wrapper.find('[data-verification-state="ok"]').exists()).toBe(false)
    expect(wrapper.find('.draft-verification--failed').exists()).toBe(true)
  })

  it('直接字段表显示期望 / 实际 / 通过标记', () => {
    const wrapper = mountVerification()

    expect(wrapper.text()).toContain('原料名称')
    expect(wrapper.text()).toContain('ingredient.name')
    expect(wrapper.text()).toContain('0.9')
    expect(wrapper.text()).toContain('原厂保质期（月）')
    expect(wrapper.findAll('[data-field-row]')).toHaveLength(3)
    expect(wrapper.findAll('[data-field-row][data-pass="false"]')).toHaveLength(1)
  })

  it('功能项显示标签、严重程度、详情与通过状态', () => {
    const wrapper = mountVerification()

    const text = wrapper.text()
    expect(text).toContain('商城上架')
    expect(text).toContain('上架清单里查不到这条原料')
    expect(text).toContain('等价替换')
    expect(text).toContain('已归组，但暂不参与等价替换')
    expect(text).toContain('分装')
    expect(text).toContain('没有匹配到袋型规则')
    expect(wrapper.findAll('[data-feature]')).toHaveLength(4)
  })

  it('功能修复入口使用有效路由（RECIPE / EQUIVALENCE / PACKAGING / RETAIL）', async () => {
    const wrapper = mountVerification()

    const retail = wrapper.find('[data-feature-action="RETAIL"]')
    expect(retail.exists()).toBe(true)
    await retail.trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/supplement-shop/catalog')

    const equivalence = wrapper.find('[data-feature-action="EQUIVALENCE"]')
    await equivalence.trigger('click')
    expect(router.push).toHaveBeenLastCalledWith(
      '/supplement-shop/equivalence-groups'
    )

    const packaging = wrapper.find('[data-feature-action="PACKAGING"]')
    await packaging.trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/supplement-shop/packaging')

    // RECIPE 的修复入口即使后端不给 action，也要落到营养档案页。
    const recipeOnly = mountVerification({
      verification: verification({
        features: [
          {
            code: 'RECIPE',
            label: '配方可选',
            ok: false,
            severity: 'ERROR',
            detail: '缺少主映射'
          }
        ]
      })
    })
    const recipe = recipeOnly.find('[data-feature-action="RECIPE"]')
    expect(recipe.exists()).toBe(true)
    await recipe.trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/ingredients?tab=nutrition')
  })

  it('底部三个入口跳到原料库 / 上架清单 / 配方设计器', async () => {
    const wrapper = mountVerification()

    await wrapper.find('[data-action="goto-ingredients"]').trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/ingredients')

    await wrapper.find('[data-action="goto-catalog"]').trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/supplement-shop/catalog')

    await wrapper.find('[data-action="goto-recipe-designer"]').trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/recipe-designer')
  })

  it('重新核验发出 reverify，核验中禁用', async () => {
    const wrapper = mountVerification()

    const button = wrapper.find('[data-action="reverify"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.emitted('reverify')).toHaveLength(1)

    await wrapper.setProps({ reverifying: true })
    const busy = wrapper.find('[data-action="reverify"]')
    expect(busy.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('正在重新核验')
  })
})
