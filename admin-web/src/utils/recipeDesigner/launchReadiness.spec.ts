import { describe, expect, it } from 'vitest'
import {
  buildLaunchPassedChecks,
  buildLaunchSummaryRows,
  formatLaunchEnergyDensity,
  formatLaunchWeightG,
  groupLaunchReadinessIssues,
  launchIssueFieldLabel,
  launchIssueItemLabel,
  launchIssueLocationHint,
  launchReadinessModeLabel,
  launchReadinessModeNote,
  launchReadinessScopeLabel,
  launchReadinessScopesForDesign,
  launchReadinessStatusLabel,
  launchReadinessStatusSummary,
  resolveLaunchIssueScope
} from './launchReadiness'
import type {
  DraftLaunchReadiness,
  DraftLaunchReadinessSummary
} from '@/types/recipeDesigner'

const summary: DraftLaunchReadinessSummary = {
  itemCount: 6,
  foodItemCount: 4,
  totalWeightG: 1250,
  energyDensityKcalPerKg: 4321.6,
  dryMatterEnergyDensityKcalPerKg: 4850.4,
  supplementCount: 2,
  stepCount: 4,
  reportAvailable: true,
  reportGenerated: false,
  reportStale: false
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

  it('概要六项覆盖评估项 / 食材 / 能量 / 补剂 / 步骤 / 报告', () => {
    const rows = buildLaunchSummaryRows(summary)

    expect(rows.map((row) => row.label)).toEqual([
      '参与评估项',
      '参与评估食材',
      '能量密度（每kg干物质）',
      '参与评估补剂',
      '制作步骤',
      '完整营养报告'
    ])
    expect(rows.map((row) => row.value)).toEqual([
      '6 项',
      '4 种',
      '4850 kcal/kg DM',
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
      energyDensityKcalPerKg: null,
      dryMatterEnergyDensityKcalPerKg: null
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

  it('订单与产品线分别说明各自的分支检查', () => {
    const orderNote = launchReadinessModeNote('ORDER')
    expect(orderNote).toContain('展示资料')
    expect(orderNote).toContain('订单信息')
    expect(orderNote).toContain('产品线上架文案不参与本单检查')

    const catalogNote = launchReadinessModeNote('CATALOG')
    expect(catalogNote).toContain('展示资料')
    expect(catalogNote).toContain('上架文案')
    expect(catalogNote).toContain('订单信息不参与产品线检查')
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

function readinessFixture(
  overrides: Partial<DraftLaunchReadiness> = {}
): DraftLaunchReadiness {
  return {
    draftId: 'draft-1',
    designMode: 'CATALOG',
    ready: true,
    blockers: [],
    warnings: [],
    summary,
    ...overrides
  }
}

describe('上线检查 · 问题归属与分组', () => {
  it('缺少 scope 的旧响应按共用处理，未知值也不丢问题', () => {
    expect(resolveLaunchIssueScope(undefined)).toBe('COMMON')
    expect(resolveLaunchIssueScope(null)).toBe('COMMON')
    expect(resolveLaunchIssueScope('presentation')).toBe('PRESENTATION')
    expect(resolveLaunchIssueScope('CATALOG')).toBe('CATALOG')
    expect(resolveLaunchIssueScope('SOMETHING_NEW')).toBe('COMMON')
    expect(launchReadinessScopeLabel('ORDER')).toBe('订单')
    expect(launchReadinessScopeLabel(undefined)).toBe('共用')
  })

  it('产品线与订单只展示各自分支的检查项', () => {
    expect(launchReadinessScopesForDesign('CATALOG')).toEqual([
      'COMMON',
      'PRESENTATION',
      'CATALOG'
    ])
    expect(launchReadinessScopesForDesign('ORDER')).toEqual([
      'COMMON',
      'PRESENTATION',
      'ORDER'
    ])
    // 历史缺省按产品线
    expect(launchReadinessScopesForDesign(null)).toEqual([
      'COMMON',
      'PRESENTATION',
      'CATALOG'
    ])
  })

  it('阻断项按 共用 / 展示资料 / 产品线 分组，过滤掉订单分支项', () => {
    const groups = groupLaunchReadinessIssues(
      [
        { code: 'NAME_REQUIRED', message: '名称', scope: 'COMMON' },
        { code: 'COVER_IMAGE_REQUIRED', message: '封面', scope: 'PRESENTATION' },
        { code: 'DESCRIPTION_REQUIRED', message: '描述', scope: 'CATALOG' },
        { code: 'ORDER_ID_REQUIRED', message: '订单', scope: 'ORDER' },
        { code: 'LEGACY_CODE', message: '旧问题' }
      ],
      'CATALOG'
    )

    expect(groups.map((group) => group.label)).toEqual([
      '共用',
      '展示资料',
      '产品线'
    ])
    expect(groups.map((group) => group.issues.length)).toEqual([2, 1, 1])
    expect(groups[0]?.issues.map((issue) => issue.code)).toEqual([
      'NAME_REQUIRED',
      'LEGACY_CODE'
    ])
  })

  it('订单设计只展示订单分支项，不把产品线文案混进来', () => {
    const groups = groupLaunchReadinessIssues(
      [
        { code: 'COVER_TITLE_REQUIRED', message: '标题', scope: 'PRESENTATION' },
        { code: 'SELLING_POINT_REQUIRED', message: '卖点', scope: 'CATALOG' },
        { code: 'CUSTOMER_DOG_REQUIRED', message: '爱犬', scope: 'ORDER' }
      ],
      'ORDER'
    )

    expect(groups.map((group) => group.label)).toEqual(['展示资料', '订单'])
    expect(
      groups.flatMap((group) => group.issues.map((issue) => issue.code))
    ).toEqual(['COVER_TITLE_REQUIRED', 'CUSTOMER_DOG_REQUIRED'])
  })
})

describe('上线检查 · 已通过清单', () => {
  it('产品线包含展示资料与上架文案，不出现订单项', () => {
    const checks = buildLaunchPassedChecks(
      readinessFixture({
        blockers: [
          { code: 'COVER_IMAGE_REQUIRED', message: '封面', scope: 'PRESENTATION' },
          { code: 'DESCRIPTION_REQUIRED', message: '描述', scope: 'CATALOG' }
        ],
        warnings: [
          {
            code: 'TARGET_HEALTH_TAGS_MISSING',
            message: '标签',
            scope: 'CATALOG'
          }
        ]
      })
    )
    const codes = checks.map((check) => check.code)

    expect(checks.find((check) => check.code === 'COVER_IMAGE_REQUIRED')).toBeUndefined()
    expect(checks.find((check) => check.code === 'DESCRIPTION_REQUIRED')).toBeUndefined()
    expect(
      checks.find((check) => check.code === 'TARGET_HEALTH_TAGS_MISSING')
    ).toBeUndefined()
    expect(codes).toEqual(
      expect.arrayContaining([
        'COVER_TITLE_REQUIRED',
        'SELLING_POINT_REQUIRED',
        'APPLICABLE_LIFE_STAGES_REQUIRED'
      ])
    )
    expect(codes).not.toEqual(
      expect.arrayContaining(['ORDER_ID_REQUIRED'])
    )
    expect(checks.find((check) => check.code === 'COVER_TITLE_REQUIRED')).toMatchObject({
      label: '封面标题已填写',
      scope: 'PRESENTATION',
      scopeLabel: '展示资料'
    })
  })

  it('订单设计包含订单信息，不检查产品线上架文案', () => {
    const checks = buildLaunchPassedChecks(
      readinessFixture({
        designMode: 'ORDER',
        blockers: [
          { code: 'ORDER_QUANTITY_INVALID', message: '份数', scope: 'ORDER' }
        ]
      })
    )
    const codes = checks.map((check) => check.code)

    expect(codes).toEqual(
      expect.arrayContaining([
        'COVER_IMAGE_REQUIRED',
        'COVER_TITLE_REQUIRED',
        'ORDER_ID_REQUIRED',
        'CUSTOMER_DOG_REQUIRED'
      ])
    )
    expect(codes).not.toContain('ORDER_QUANTITY_INVALID')
    expect(codes).not.toContain('DESCRIPTION_REQUIRED')
    expect(codes).not.toContain('TARGET_HEALTH_TAGS_MISSING')
  })
})
