import { describe, expect, it } from 'vitest'
import { canToggleListing, showListingBlockedHint } from './catalog-listing'

/**
 * 补剂上架开关的规则（2026-11-14）。
 *
 * 现场问题：`上架清单` 里「上架」那一列的开关，对**还没上架**的补剂是灰的 ——
 * 因为当时把「能不能点」绑成了「是否已上架」，
 * 于是只能关、不能开，形成一个死循环，运营没法逐条上架。
 */
describe('补剂上架清单 · 上架开关能否点', () => {
  it('还没上架、档案没有问题 → 能点（这是这次要修的主场景）', () => {
    expect(
      canToggleListing({ supplementRetailEnabled: false, issues: [] }),
    ).toBe(true)
  })

  it('还没上架、但有红色问题（缺价/缺形态/液体…）→ 不能点', () => {
    expect(
      canToggleListing({
        supplementRetailEnabled: false,
        issues: [{ level: 'ERROR' }, { level: 'WARN' }],
      }),
    ).toBe(false)
  })

  it('还没上架、只有黄色提醒（同名/未归组…）→ 仍然能点', () => {
    expect(
      canToggleListing({
        supplementRetailEnabled: false,
        issues: [{ level: 'WARN' }],
      }),
    ).toBe(true)
  })

  it('已经上架的，即使档案后来出了问题也能点（要能下架）', () => {
    expect(
      canToggleListing({
        supplementRetailEnabled: true,
        issues: [{ level: 'ERROR' }],
      }),
    ).toBe(true)
  })
})

describe('补剂上架清单 · 「档案未补齐，无法上架」提示', () => {
  it('没上架且有红色问题 → 显示提示', () => {
    expect(
      showListingBlockedHint({
        supplementRetailEnabled: false,
        issues: [{ level: 'ERROR' }],
      }),
    ).toBe(true)
  })

  it('没上架但没有红色问题 → 不提示', () => {
    expect(
      showListingBlockedHint({ supplementRetailEnabled: false, issues: [] }),
    ).toBe(false)
  })

  it('已经上架的 → 不提示', () => {
    expect(
      showListingBlockedHint({
        supplementRetailEnabled: true,
        issues: [{ level: 'ERROR' }],
      }),
    ).toBe(false)
  })
})
