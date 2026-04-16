import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('checkout direct-buy storage contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/checkout/index.vue'),
    'utf-8',
  )

  it('reads direct_buy_order_config from storage for direct-buy navigation', () => {
    expect(source).toContain("uni.getStorageSync('direct_buy_order_config')")
    expect(source).toContain('storedConfig.snapshotId')
  })

  it('includes package plan and ingredient source plan label in order config', () => {
    expect(source).toContain('packagePlan')
    expect(source).toContain('ingredientSourcePlanLabel')
  })

  it('preserves preparation and cooking methods from stored config', () => {
    expect(source).toContain('preparationMethod')
    expect(source).toContain('cookingMethod')
  })

  it('shows total, estimated feed days, and the subtitle in the bottom bar', () => {
    expect(source).toContain('estimatedFeedDays')
    expect(source).toContain('totalAmount')
    expect(source).toContain('bottom-bar')
    expect(source).toContain('预计可喂')
  })
})
