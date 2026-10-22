import { describe, expect, it } from 'vitest'
import {
  buildLaunchSummaryRows,
  formatLaunchEnergyDensity,
  formatLaunchWeightG,
  launchIssueFieldLabel,
  launchIssueItemLabel,
  launchIssueLocationHint,
  launchReadinessModeLabel,
  launchReadinessModeNote,
  launchReadinessStatusLabel,
  launchReadinessStatusSummary
} from './launchReadiness'
import type { DraftLaunchReadinessSummary } from '@/types/recipeDesigner'

const summary: DraftLaunchReadinessSummary = {
  itemCount: 6,
  totalWeightG: 1250,
  energyDensityKcalPerKg: 4321.6,
  supplementCount: 2,
  stepCount: 4,
  reportAvailable: true
}

describe('上线检查 · 概要展示', () => {
  it('重量按 g / kg 切换，不把 0 或缺失显示成脏数字', () => {
    expect(formatLaunchWeightG(0)).toBe('0 g')
    expect(formatLaunchWeightG(null)).toBe('0 g')
    expect(formatLaunchWeightG(999.6)).toBe('999.6 g')
    expect(formatLaunchWeightG(1000)).toBe('1.00 kg')
    expect(formatLaunchWeightG(1250.5)).toBe('1.25 kg')
  })

  it('能量密度缺失显示破折号，有值四舍五入到整数', () => {
    expect(formatLaunchEnergyDensity(null)).toBe('—')
    expect(formatLaunchEnergyDensity(undefined)).toBe('—')
    expect(formatLaunchEnergyDensity(4321.6)).toBe('4322 kcal/kg')
  })

  it('概要六项覆盖原料 / 重量 / 能量 / 补剂 / 步骤 / 报告', () => {
    const rows = buildLaunchSummaryRows(summary)

    expect(rows.map((row) => row.label)).toEqual([
      '参与评估原料',
      '总重量',
      '能量密度',
      '参与评估补剂',
      '制作步骤',
      '完整营养报告'
    ])
    expect(rows.map((row) => row.value)).toEqual([
      '6 种',
      '1.25 kg',
      '4322 kcal/kg',
      '2 种',
      '4 步',
      '可生成'
    ])
    expect(rows.find((row) => row.key === 'reportAvailable')?.tone).toBe(
      'success'
    )
  })

  it('报告不可生成时用红色状态值', () => {
    const rows = buildLaunchSummaryRows({
      ...summary,
      reportAvailable: false,
      energyDensityKcalPerKg: null
    })

    expect(rows.find((row) => row.key === 'reportAvailable')).toMatchObject({
      value: '不可生成',
      tone: 'danger'
    })
    expect(rows.find((row) => row.key === 'energyDensityKcalPerKg')?.value).toBe(
      '—'
    )
  })
})

describe('上线检查 · 状态与模式文案', () => {
  it('通过 / 阻断状态有明确文案', () => {
    expect(launchReadinessStatusLabel(true)).toBe('可以上线')
    expect(launchReadinessStatusLabel(false)).toBe('有阻断项')
  })

  it('总览结论带阻断 / 提醒数量', () => {
    expect(
      launchReadinessStatusSummary({ ready: true, blockers: [], warnings: [] })
    ).toBe('没有阻断项，可以进入下一步')
    expect(
      launchReadinessStatusSummary({
        ready: true,
        blockers: [],
        warnings: [
          {
            code: 'REVIEW_REQUIRED',
            message: '需复核'
          }
        ]
      })
    ).toBe('没有阻断项，有 1 条提醒')
    expect(
      launchReadinessStatusSummary({
        ready: false,
        blockers: [
          { code: 'NAME_REQUIRED', message: '请填写名称' },
          { code: 'PRODUCTION_STEPS_REQUIRED', message: '请填写步骤' }
        ],
        warnings: []
      })
    ).toBe('发现 2 项阻断，暂时不能进入下一步')
  })

  it('订单与产品线使用不同模式名，历史缺省按产品线', () => {
    expect(launchReadinessModeLabel('ORDER')).toBe('本单设计')
    expect(launchReadinessModeLabel('CATALOG')).toBe('产品线')
    expect(launchReadinessModeLabel(null)).toBe('产品线')
    expect(launchReadinessModeLabel('order')).toBe('本单设计')
  })

  it('订单模式明确说明共享门槛，并提示订单分支专属检查尚未接入', () => {
    const orderNote = launchReadinessModeNote('ORDER')
    expect(orderNote).toContain('共用同一套上线门槛')
    expect(orderNote).toContain('订单分支专属检查')
    expect(orderNote).toContain('暂未接入')

    const catalogNote = launchReadinessModeNote('CATALOG')
    expect(catalogNote).toContain('产品线')
    expect(catalogNote).toContain('订单分支专属检查')
  })
})

describe('上线检查 · 阻断定位提示', () => {
  it('字段路径翻译成中文，未知字段原样展示', () => {
    expect(launchIssueFieldLabel('preparationMethod')).toBe('预处理方式')
    expect(launchIssueFieldLabel('supplementTargets')).toBe('补剂目标')
    expect(launchIssueFieldLabel('productionStepsJson')).toBe('制作步骤')
    expect(launchIssueFieldLabel('futureField')).toBe('futureField')
    expect(launchIssueFieldLabel('')).toBeNull()
    expect(launchIssueFieldLabel(null)).toBeNull()
  })

  it('原料 id 短提示只展示前 8 位', () => {
    expect(launchIssueItemLabel('abcdef1234567890')).toBe('原料 #abcdef12')
    expect(launchIssueItemLabel('item-1')).toBe('原料 #item-1')
    expect(launchIssueItemLabel(undefined)).toBeNull()
  })

  it('字段 + 原料提示可以拼成一行', () => {
    expect(
      launchIssueLocationHint({
        field: 'supplementTargets',
        itemId: 'abcdef1234567890'
      })
    ).toBe('补剂目标 · 原料 #abcdef12')
    expect(launchIssueLocationHint({ field: 'name' })).toBe('名称')
    expect(launchIssueLocationHint({})).toBe('')
  })
})
