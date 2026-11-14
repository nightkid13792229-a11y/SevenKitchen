import { describe, expect, it } from 'vitest'
import {
  formatOrderPackageSpec,
  normalizeOrderPackagePlan,
} from './order-package-spec'

describe('formatOrderPackageSpec', () => {
  it('多组分装按「袋数×每袋克重」用逗号连接', () => {
    expect(
      formatOrderPackageSpec({
        packagePlan: [
          { packageSpecG: 250, packageCount: 4 },
          { packageSpecG: 500, packageCount: 2 },
        ],
      }),
    ).toBe('4袋×250g，2袋×500g')
  })

  it('没有 packagePlan 时退回老订单的单组字段', () => {
    expect(
      formatOrderPackageSpec({ packageSpecG: 250, packageCount: 4 }),
    ).toBe('4袋×250g')
  })

  it('脏数据整行丢掉，不会写出 0 袋 / 负数克重', () => {
    expect(
      formatOrderPackageSpec({
        packagePlan: [
          { packageSpecG: 0, packageCount: 4 },
          { packageSpecG: 250, packageCount: 0 },
          { packageSpecG: 250, packageCount: 2 },
        ],
      }),
    ).toBe('2袋×250g')
  })

  it('完全没有分装数据时返回空串（卡片整段不显示）', () => {
    expect(formatOrderPackageSpec(null)).toBe('')
    expect(formatOrderPackageSpec({})).toBe('')
    expect(formatOrderPackageSpec({ packageSpecG: 250 })).toBe('')
    expect(formatOrderPackageSpec({ packagePlan: [] })).toBe('')
  })

  it('★ 试吃装加「共」前缀，说明是整套总袋数；空数据仍返回空串', () => {
    expect(
      formatOrderPackageSpec(
        { packagePlan: [{ packageSpecG: 250, packageCount: 12 }] },
        { totalPrefix: true },
      ),
    ).toBe('共12袋×250g')
    expect(formatOrderPackageSpec({}, { totalPrefix: true })).toBe('')
  })

  it('normalize 保留顺序并转成整数', () => {
    expect(
      normalizeOrderPackagePlan({
        packagePlan: [
          { packageSpecG: 250.9, packageCount: 4.8 },
          { packageSpecG: 500, packageCount: 1 },
        ],
      }),
    ).toEqual([
      { packageSpecG: 250, packageCount: 4 },
      { packageSpecG: 500, packageCount: 1 },
    ])
  })
})
