import { describe, expect, it } from 'vitest'
import {
  buildNutrientSectionList,
  hasNutritionReportMeta,
  nutrientRowStatusClass,
  orderEnergyDensityRows,
  resolveNutritionReportAction
} from './nutritionReport'
import type {
  DraftNutritionReportEnergyDensityRow,
  DraftNutritionReportNutrientSection
} from '@/types/recipeDesigner'

describe('营养报告 · 上线检查动作', () => {
  it('从没生成过报告时提示生成', () => {
    expect(
      resolveNutritionReportAction({ reportGenerated: false, reportStale: false })
    ).toEqual({ kind: 'generate', label: '生成营养报告' })
  })

  it('已保存且未过期时提示查看', () => {
    expect(
      resolveNutritionReportAction({ reportGenerated: true, reportStale: false })
    ).toEqual({ kind: 'view', label: '查看营养报告' })
  })

  it('已保存但过期时提示重新生成', () => {
    expect(
      resolveNutritionReportAction({ reportGenerated: true, reportStale: true })
    ).toEqual({ kind: 'regenerate', label: '报告已过期，重新生成' })
  })

  it('没有报告时即使后端误报 stale，也按未生成处理', () => {
    expect(
      resolveNutritionReportAction({ reportGenerated: false, reportStale: true })
    ).toEqual({ kind: 'generate', label: '生成营养报告' })
  })
})

describe('营养报告 · 元信息展示', () => {
  it('没有报告信封或从未生成过时不显示生成时间', () => {
    expect(hasNutritionReportMeta(null)).toBe(false)
    expect(
      hasNutritionReportMeta({ generatedAt: null, revision: null })
    ).toBe(false)
  })

  it('有生成时间或内容版本时显示元信息', () => {
    expect(
      hasNutritionReportMeta({
        generatedAt: '2026-10-22T12:00:00.000Z',
        revision: null
      })
    ).toBe(true)
    expect(
      hasNutritionReportMeta({ generatedAt: null, revision: 3 })
    ).toBe(true)
  })
})

describe('营养报告 · 能量密度排序', () => {
  it('每公斤干物质排在每公斤配方之前', () => {
    const rows: DraftNutritionReportEnergyDensityRow[] = [
      { label: '每公斤配方', value: '4200 kcal/kg' },
      { label: '每公斤干物质', value: '4800 kcal/kg DM' }
    ]

    expect(orderEnergyDensityRows(rows).map((row) => row.label)).toEqual([
      '每公斤干物质',
      '每公斤配方'
    ])
  })

  it('只有数值里带 DM 标记时也能识别', () => {
    const rows: DraftNutritionReportEnergyDensityRow[] = [
      { label: '配方能量', value: '4200 kcal/kg' },
      { label: '干物质能量', value: '4800 kcal/kg DM' }
    ]

    expect(orderEnergyDensityRows(rows).map((row) => row.label)).toEqual([
      '干物质能量',
      '配方能量'
    ])
  })

  it('不修改后端返回的数组顺序', () => {
    const rows: DraftNutritionReportEnergyDensityRow[] = [
      { label: '每公斤配方', value: '4200 kcal/kg' },
      { label: '每公斤干物质', value: '4800 kcal/kg DM' }
    ]

    orderEnergyDensityRows(rows)

    expect(rows.map((row) => row.label)).toEqual([
      '每公斤配方',
      '每公斤干物质'
    ])
  })
})

describe('营养报告 · 营养素分区', () => {
  const buildSection = (
    key: string,
    title: string
  ): DraftNutritionReportNutrientSection => ({
    key,
    title,
    dryMatterHeader: '/100gDM',
    rows: [
      {
        key: `${key}-row`,
        name: title,
        unit: 'mg',
        minLabel: '1',
        maxLabel: '2',
        currentLabel: '1.5',
        dryMatterLabel: '1.5',
        status: 'COMPLIANT'
      }
    ]
  })

  it('固定按微量元素 / 维生素 / 氨基酸 / 脂肪酸排序', () => {
    const sections = {
      fattyAcids: buildSection('fattyAcids', '脂肪酸'),
      vitamins: buildSection('vitamins', '维生素'),
      minerals: buildSection('minerals', '微量元素'),
      aminoAcids: buildSection('aminoAcids', '氨基酸')
    }

    expect(buildNutrientSectionList(sections).map((section) => section.key)).toEqual([
      'minerals',
      'vitamins',
      'aminoAcids',
      'fattyAcids'
    ])
  })

  it('后端新增的未知分区排在四类之后，不丢数据', () => {
    const sections = {
      fattyAcids: buildSection('fattyAcids', '脂肪酸'),
      minerals: buildSection('minerals', '微量元素'),
      others: buildSection('others', '其他')
    }

    expect(buildNutrientSectionList(sections).map((section) => section.key)).toEqual([
      'minerals',
      'fattyAcids',
      'others'
    ])
  })

  it('没有分区或分区缺 rows 时返回可安全渲染的结构', () => {
    expect(buildNutrientSectionList(undefined)).toEqual([])
    expect(buildNutrientSectionList(null)).toEqual([])

    const incomplete = {
      minerals: {
        key: 'minerals',
        title: '微量元素',
        dryMatterHeader: '/100gDM'
      } as DraftNutritionReportNutrientSection
    }

    expect(buildNutrientSectionList(incomplete)).toEqual([
      {
        key: 'minerals',
        title: '微量元素',
        dryMatterHeader: '/100gDM',
        rows: []
      }
    ])
  })
})

describe('营养报告 · 营养素状态', () => {
  it('达标 / 不足 / 超标 / 缺数据各有独立样式', () => {
    expect(nutrientRowStatusClass('COMPLIANT')).toBe('is-compliant')
    expect(nutrientRowStatusClass('DEFICIENT')).toBe('is-deficient')
    expect(nutrientRowStatusClass('EXCESS')).toBe('is-excess')
    expect(nutrientRowStatusClass('MISSING_DATA')).toBe('is-missing')
    expect(nutrientRowStatusClass('UNKNOWN')).toBe('')
    expect(nutrientRowStatusClass(undefined)).toBe('')
  })
})
