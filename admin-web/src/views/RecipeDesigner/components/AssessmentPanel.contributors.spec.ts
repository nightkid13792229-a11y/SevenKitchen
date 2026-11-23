// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AssessmentPanel from './AssessmentPanel.vue'

/**
 * 回归背景（2026-11-23 线上）：
 *
 * 营养评估列表的响应**不带**原料贡献明细（点开某个营养素才单独取，见
 * `assessContributors`）。于是「弹窗已经拿到明细」之后，只要配方再重算一次
 * （在弹窗里点「应用」改用量、或在左边改任何原料），新的评估结果就会把
 * `activeEntry` 换成不带明细的那份 —— 表格消失、停在「数据缺失」，
 * 而且不会重新去取。用户看到的就是「详情永远加载不出来」。
 *
 * 这里锁住三条：
 * 1. 点开营养素能拿到明细并显示；
 * 2. 评估重算后，已加载的明细不被清空（并自动重取一次刷新数值）；
 * 3. 正在取明细时显示「正在计算」，别把空窗期说成「数据缺失」。
 */

function buildEntry(overrides: Record<string, unknown> = {}) {
  return {
    nutrientKey: 'phosphorus',
    label: '磷',
    category: 'MINERAL',
    expressionBasis: 'PER_1000_KCAL_ME',
    unit: 'g',
    minValue: 1.16,
    maxValue: 4,
    currentValue: 1.1,
    status: 'DEFICIENT',
    details: [],
    detailCount: 1,
    ...overrides
  }
}

function buildAssessment(overrides: Record<string, unknown> = {}) {
  return {
    scenario: 'ADULT_MER_95',
    totalWeightG: 1000,
    totalEnergyKcal: 1300,
    dryMatterG: 250,
    dryMatterEnergyKcalPer100g: 520,
    energyDensityKcalPerKg: 1300,
    normalizedToKg: false,
    items: [{ id: 'i1', name: '鸡胸肉', weightG: 500, ratioPercent: 50 }],
    nutrients: {},
    macroMetrics: {},
    dataGaps: [],
    overallStatus: 'NEEDS_REVIEW',
    summary: {
      compliant: 0,
      deficient: 1,
      excess: 0,
      missingData: 0,
      info: 0,
      total: 1
    },
    rawSummary: {
      compliant: 0,
      deficient: 1,
      excess: 0,
      missingData: 0,
      info: 0,
      total: 1
    },
    groupedEntries: [buildEntry(overrides)]
  }
}

function buildContributors() {
  return [
    {
      itemId: 'i1',
      itemName: '鸡胸肉',
      weightG: 500,
      amountUnit: 'g',
      amount: 0.5,
      unit: 'g',
      contributionPercent: 100,
      missing: false
    }
  ]
}

function mountPanel(loadContributors: (key: string) => Promise<unknown[]>) {
  return mount(AssessmentPanel, {
    props: {
      assessment: buildAssessment() as never,
      scenario: 'ADULT_MER_95',
      loadContributors: loadContributors as never
    },
    global: { plugins: [ElementPlus] },
    attachTo: document.body
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('营养贡献明细弹窗', () => {
  it('点开营养素后展示原料贡献明细', async () => {
    const loadContributors = vi.fn().mockResolvedValue(buildContributors())
    const wrapper = mountPanel(loadContributors)

    await wrapper.find('.entry-row').trigger('click')
    await flushPromises()

    expect(loadContributors).toHaveBeenCalledWith('phosphorus')
    expect(document.body.textContent).toContain('鸡胸肉')
    expect(document.body.textContent).not.toContain('暂无原料贡献明细')

    wrapper.unmount()
  })

  it('评估重算后不清空已加载的明细，并自动重取一次', async () => {
    const loadContributors = vi.fn().mockResolvedValue(buildContributors())
    const wrapper = mountPanel(loadContributors)

    await wrapper.find('.entry-row').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('鸡胸肉')

    // 模拟「弹窗里改用量 → 配方重算」：新结果里没有 contributors
    await wrapper.setProps({ assessment: buildAssessment({ currentValue: 1.2 }) as never })
    await flushPromises()

    expect(document.body.textContent).toContain('鸡胸肉')
    expect(document.body.textContent).not.toContain('暂无原料贡献明细')

    // 防抖窗口过后自动补拉，明细跟着新配方刷新
    await new Promise((resolve) => setTimeout(resolve, 400))
    await flushPromises()
    expect(loadContributors).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('明细还没回来时说「正在计算」，不说「数据缺失」', async () => {
    let release: (value: unknown[]) => void = () => {}
    const loadContributors = vi.fn(
      () => new Promise<unknown[]>((resolve) => {
        release = resolve
      })
    )
    const wrapper = mountPanel(loadContributors)

    await wrapper.find('.entry-row').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('正在计算')
    expect(document.body.textContent).not.toContain('暂无原料贡献明细')

    release(buildContributors())
    await flushPromises()
    expect(document.body.textContent).toContain('鸡胸肉')

    wrapper.unmount()
  })
})
