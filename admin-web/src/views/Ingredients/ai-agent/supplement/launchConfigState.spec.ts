import { describe, expect, it } from 'vitest'
import {
  GROUP_SKIPPED,
  describeSheetPreview,
  evaluateLaunch,
  missingDecisions,
  type LaunchDecisions,
} from './launchConfigState'

const decided: LaunchDecisions = {
  diy: true,
  procurement: true,
  retail: true,
  group: 'group-1',
  noSaleReason: null,
}

const issue = (code: string, level: 'ERROR' | 'WARN', message = code) => ({
  code,
  level,
  message,
})

describe('落地配置 · 四段必须表态', () => {
  it('全都没表态 → 四段都算缺', () => {
    expect(
      missingDecisions({
        diy: null,
        procurement: null,
        retail: null,
        group: null,
        noSaleReason: null,
      }),
    ).toEqual(['DIY 推荐', '生产采购', '商城上架', '等价组'])
  })

  it('选了暂不归组也算表态', () => {
    expect(missingDecisions({ ...decided, group: GROUP_SKIPPED })).toEqual([])
  })

  it('不上架但没选原因 → 缺「不上架原因」', () => {
    expect(
      missingDecisions({ ...decided, retail: false, noSaleReason: null }),
    ).toEqual(['不上架原因'])
  })

  it('不上架且选了原因 → 不缺', () => {
    expect(
      missingDecisions({ ...decided, retail: false, noSaleReason: 'SELF_MADE' }),
    ).toEqual([])
  })
})

describe('落地配置 · 结论卡只读后端 issues', () => {
  const base = {
    retailEnabled: true,
    issues: [] as ReturnType<typeof issue>[],
    hasPurchaseLink: true,
    diyEnabled: true,
  }

  it('全部就绪 → READY', () => {
    expect(evaluateLaunch(base)).toEqual({ level: 'READY', reasons: [] })
  })

  it('未上架 → BLOCKED，并说清后果', () => {
    const result = evaluateLaunch({ ...base, retailEnabled: false })
    expect(result.level).toBe('BLOCKED')
    expect(result.reasons[0]).toContain('仅生产')
  })

  it('有 ERROR → BLOCKED，原样带出后端原因', () => {
    const result = evaluateLaunch({
      ...base,
      issues: [issue('SHELF_LIFE_MISSING', 'ERROR', '缺保质期')],
    })
    expect(result.level).toBe('BLOCKED')
    expect(result.reasons).toContain('缺保质期')
  })

  it('已上架但没购买链接 → WARN', () => {
    const result = evaluateLaunch({ ...base, hasPurchaseLink: false })
    expect(result.level).toBe('WARN')
    expect(result.reasons.join()).toContain('购买链接')
  })

  it('DIY 关闭时不因缺链接报警', () => {
    const result = evaluateLaunch({
      ...base,
      hasPurchaseLink: false,
      diyEnabled: false,
    })
    expect(result.level).toBe('READY')
  })

  it('后端报等价组 WARN → 结论卡变 WARN（不自己另判一套）', () => {
    const result = evaluateLaunch({
      ...base,
      issues: [
        issue('EQUIVALENCE_GROUP_NOT_APPROVED', 'WARN', '所在等价组还未审核通过'),
        issue('EQUIVALENCE_NUTRIENT_MISSING', 'WARN', '缺碘浓度，不参与替换'),
      ],
    })
    expect(result.level).toBe('WARN')
    expect(result.reasons.join()).toContain('未审核')
    expect(result.reasons.join()).toContain('不参与替换')
  })

  it('与替换无关的 WARN（同名重复）不改变结论', () => {
    const result = evaluateLaunch({
      ...base,
      issues: [issue('DUPLICATE_NAME', 'WARN', '同名档案多条')],
    })
    expect(result.level).toBe('READY')
  })
})

describe('落地配置 · 制作单预览文案', () => {
  it('没开 DIY → 不出现在制作单', () => {
    expect(
      describeSheetPreview({
        diyEnabled: false,
        retailEnabled: true,
        hasError: false,
        groupEffective: false,
      }),
    ).toBe('不出现在制作单')
  })

  it('未上架 → 仅生产', () => {
    expect(
      describeSheetPreview({
        diyEnabled: true,
        retailEnabled: false,
        hasError: false,
        groupEffective: false,
      }),
    ).toBe('仅生产，不可购买')
  })

  it('有 ERROR → 仅生产', () => {
    expect(
      describeSheetPreview({
        diyEnabled: true,
        retailEnabled: true,
        hasError: true,
        groupEffective: true,
      }),
    ).toBe('仅生产，不可购买')
  })

  it('上架、组生效 → 换一个（小程序口径，不推算候选数）', () => {
    expect(
      describeSheetPreview({
        diyEnabled: true,
        retailEnabled: true,
        hasError: false,
        groupEffective: true,
      }),
    ).toBe('换一个')
  })

  it('上架、组没生效 → 查看商品', () => {
    expect(
      describeSheetPreview({
        diyEnabled: true,
        retailEnabled: true,
        hasError: false,
        groupEffective: false,
      }),
    ).toBe('查看商品 〉')
  })
})
