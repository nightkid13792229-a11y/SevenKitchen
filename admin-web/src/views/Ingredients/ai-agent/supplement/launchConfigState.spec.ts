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
    expect(
      missingDecisions({ ...decided, group: GROUP_SKIPPED }),
    ).toEqual([])
  })

  it('不上架但没选原因 → 缺「不上架原因」', () => {
    expect(
      missingDecisions({ ...decided, retail: false, noSaleReason: null }),
    ).toEqual(['不上架原因'])
  })

  it('不上架且选了原因 → 不缺', () => {
    expect(
      missingDecisions({
        ...decided,
        retail: false,
        noSaleReason: 'SELF_MADE',
      }),
    ).toEqual([])
  })
})

describe('落地配置 · 结论卡', () => {
  const base = {
    retailEnabled: true,
    issues: [] as Array<{ level: string; code: string; message: string }>,
    hasPurchaseLink: true,
    diyEnabled: true,
    groupStatus: 'APPROVED',
    groupMembers: 3,
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
      issues: [{ level: 'ERROR', code: 'SHELF_LIFE_MISSING', message: '缺保质期' }],
    })
    expect(result.level).toBe('BLOCKED')
    expect(result.reasons).toContain('缺保质期')
  })

  it('已上架但没购买链接 → WARN', () => {
    const result = evaluateLaunch({ ...base, hasPurchaseLink: false })
    expect(result.level).toBe('WARN')
    expect(result.reasons.join()).toContain('购买链接')
  })

  it('未归组 → WARN', () => {
    const result = evaluateLaunch({ ...base, groupStatus: null, groupMembers: 0 })
    expect(result.level).toBe('WARN')
    expect(result.reasons.join()).toContain('等价组')
  })

  it('草稿组 / 单成员组 → WARN，且说明不参与替换', () => {
    const draft = evaluateLaunch({ ...base, groupStatus: 'DRAFT', groupMembers: 3 })
    expect(draft.level).toBe('WARN')
    expect(draft.reasons.join()).toContain('不参与替换')

    const singleton = evaluateLaunch({ ...base, groupMembers: 1 })
    expect(singleton.level).toBe('WARN')
    expect(singleton.reasons.join()).toContain('只有 1 个成员')
  })

  it('DIY 关闭时不因缺链接报警', () => {
    const result = evaluateLaunch({
      ...base,
      hasPurchaseLink: false,
      diyEnabled: false,
    })
    expect(result.level).toBe('READY')
  })
})

describe('落地配置 · 制作单预览文案', () => {
  it('未上架 → 仅生产', () => {
    expect(
      describeSheetPreview({ retailEnabled: false, hasError: false, candidateCount: 1 }),
    ).toBe('仅生产，不可购买')
  })

  it('有 ERROR → 仅生产', () => {
    expect(
      describeSheetPreview({ retailEnabled: true, hasError: true, candidateCount: 2 }),
    ).toBe('仅生产，不可购买')
  })

  it('上架且 1 个候选 → 查看商品', () => {
    expect(
      describeSheetPreview({ retailEnabled: true, hasError: false, candidateCount: 1 }),
    ).toBe('查看商品 〉')
  })

  it('上架且多个候选 → 可更换', () => {
    expect(
      describeSheetPreview({ retailEnabled: true, hasError: false, candidateCount: 3 }),
    ).toBe('可更换 3项 〉')
  })

  it('上架但没有候选（组不可用）→ 仅生产', () => {
    expect(
      describeSheetPreview({ retailEnabled: true, hasError: false, candidateCount: 0 }),
    ).toBe('仅生产，不可购买')
  })
})
