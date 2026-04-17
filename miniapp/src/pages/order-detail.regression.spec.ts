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

  it('shows customer-facing production settlement without internal cost fields', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('生产结算')
    expect(source).toContain('fetchOrderFinancialSummary')
    expect(source).toContain('formatAdjustmentText')
    expect(source).not.toContain('actualCost')
    expect(source).not.toContain('actualMargin')
  })

  it('keeps print-task totals tied to package plan rows when available', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/staff-production/print-task.vue'),
      'utf-8',
    )

    expect(source).toContain('getPackagePlanTotal')
    expect(source).toContain('totalGrams')
    expect(source).toContain('row.packageSpecG}g×${row.packageCount}袋')
    expect(source).not.toContain("packagePlanRows.join('，')")
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

  it('keeps backend label image rendering package-plan aware', () => {
    const dtoSource = readFileSync(
      resolve(process.cwd(), '../backend/src/label/dto/label-data.dto.ts'),
      'utf-8',
    )
    const serviceSource = readFileSync(
      resolve(process.cwd(), '../backend/src/label/label.service.ts'),
      'utf-8',
    )

    expect(dtoSource).toContain('packagePlan?: LabelPackagePlanItemDto[]')
    expect(serviceSource).toContain('getOrderInfoLines')
    expect(serviceSource).toContain('labelData.packagePlan')
    expect(serviceSource).toContain('分装: ${planText}')
  })

  it('keeps production detail order totals tied to each order package plan', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/staff-production/detail.vue'),
      'utf-8',
    )

    expect(source).toContain('getOrderTotalNetWeight(order)')
    expect(source).toContain('formatPackagePlan(order)')
    expect(source).toContain('hasPackagePlan(order)')
  })
})
