import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('order detail runtime regressions', () => {
  it('keeps the address in basic info without rendering a duplicate delivery section', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('收货地址:')
    expect(source).not.toContain('<view class="section-title">收货信息</view>')
  })

  it('supports packagePlan and ingredientSourcePlan on order items', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('packagePlan?: Array<{ packageSpecG: number; packageCount: number }>')
    expect(source).toContain('ingredientSourcePlan?: string | null')
  })

  it('renders package plan details with formatPackagePlan', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('分装明细')
    expect(source).toContain('formatPackagePlan(item)')
  })

  it('keeps print-task totals tied to package plan rows when available', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/staff-production/print-task.vue'),
      'utf-8',
    )

    expect(source).toContain('getPackagePlanTotal')
    expect(source).toContain('totalGrams')
  })

  it('includes packagePlan in label payload normalization', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/staff-production/print-label.vue'),
      'utf-8',
    )
    const apiSource = readFileSync(
      resolve(process.cwd(), 'src/api/label.ts'),
      'utf-8',
    )

    expect(source).toContain('normalizePackagePlanRows')
    expect(source).toContain('packagePlan:')
    expect(apiSource).toContain('export interface PackagePlanItem')
    expect(apiSource).toContain('packagePlan?: PackagePlanItem[]')
  })

  it('hides the legacy editable spec row when a package plan exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/staff-production/print-label.vue'),
      'utf-8',
    )

    expect(source).toContain('v-if="!hasPackagePlan(order)"')
    expect(source).toContain('class="info-row editable-row"')
  })
})
