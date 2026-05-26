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

  it('lets staff and admins manage reusable customer addresses on the order detail page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('listOrderCustomerAddresses')
    expect(source).toContain('createOrderCustomerAddress')
    expect(source).toContain('bindExistingOrderAddress')
    expect(source).toContain('updateOrderCustomerAddress')
    expect(source).toContain('暂未录入收货地址')
    expect(source).toContain('选择已有地址')
    expect(source).toContain('录入新地址')
    expect(source).toContain('编辑地址')
    expect(source).toContain('addressSelectVisible')
    expect(source).toContain('addressFormVisible')
    expect(source).toContain('addressForm.value.isDefault')
    expect(source).toContain('isStaffOrAdmin.value || canEditOrder.value')
    expect(source).toContain('addressModalClosing')
    expect(source).toContain('@tap.stop="closeAddressSelect"')
    expect(source).toContain('@tap.stop="closeAddressForm"')
    expect(source).toContain('formatPhoneForOrderStaff(address.phone)')
  })

  it('supports packagePlan and ingredientSourcePlan on order items', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('packagePlan?: Array<{ packageSpecG: number; packageCount: number }>')
    expect(source).toContain('ingredientSourcePlan?: string | null')
  })

  it('renders customer-facing labels instead of internal order item enums', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('getNutritionStandardLabel(item.recipeSnapshot?.nutrition_standard || \'\')')
    expect(source).toContain('formatIngredientSourcePlan(item.ingredientSourcePlan)')
    expect(source).not.toContain('{{ item.recipeSnapshot?.nutrition_standard }}')
    expect(source).not.toContain('{{ item.ingredientSourcePlan }}')
  })

  it('uses package wording instead of meal wording for order item packaging', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('总袋数')
    expect(source).toContain('每袋重量')
    expect(source).toContain('/袋')
    expect(source).not.toContain('总餐数')
    expect(source).not.toContain('每餐重量')
    expect(source).not.toContain('/餐')
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
    expect(source).toContain('adjustmentSummary')
    expect(source).toContain('settlement-adjustments')
    expect(source).not.toContain('actualCost')
    expect(source).not.toContain('actualMargin')
  })

  it('does not request production settlement summaries before production can settle', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('function shouldFetchOrderFinancialSummary')
    expect(source).toContain("return ['IN_PRODUCTION', 'FREEZING', 'SHIPPED', 'COMPLETED', 'AFTERSALE'].includes(status)")
    expect(source).toContain('if (!shouldFetchOrderFinancialSummary(order.value?.status))')
    expect(source).toContain('orderFinancialSummary.value = null')
  })

  it('uses the admin financial summary endpoint for staff and admins', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )
    const apiSource = readFileSync(
      resolve(process.cwd(), 'src/api/orders.ts'),
      'utf-8',
    )

    expect(apiSource).toContain('getAdminOrderFinancialSummary')
    expect(apiSource).toContain('url: `/admin/orders/${orderId}/financial-summary`')
    expect(source).toContain('getAdminOrderFinancialSummary')
    expect(source).toContain('isStaffOrAdmin.value')
    expect(source).toContain('getAdminOrderFinancialSummary(orderId.value)')
  })

  it('prepares a local image for production photo share cards', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('sharePhotoImageUrl')
    expect(source).toContain('uni.downloadFile')
    expect(source).toContain('normalizeImageUrl(firstPhoto)')
    expect(source).toContain('prefetchSharePhotoImage()')
    expect(source).toContain('imageUrl: getProductionPhotosShareImageUrl()')
  })

  it('uses the dog name in production photo share titles', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('function getProductionPhotosShareTitle()')
    expect(source).toContain('return `${dogName}原料照片`')
    expect(source).toContain('title: getProductionPhotosShareTitle()')
    expect(source).not.toContain("title: 'SevenKitchen原料照片'")
  })

  it('labels settlement adjustment amounts by processing status', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('formatSettlementAdjustmentAmount(adjustment.amount, adjustment.status)')
    expect(source).toContain('function formatSettlementAdjustmentAmount(amount: number, status: string): string')
    expect(source).toContain("status === 'SETTLED'")
    expect(source).toContain("return amount > 0 ? '已补' : '已退'")
  })

  it('summarizes only pending settlement adjustments in the settlement headline', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('return adjustmentSummary.pendingExtraPaymentAmount - adjustmentSummary.pendingRefundAmount')
    expect(source).not.toContain('return adjustmentSummary.netAdjustmentAmount')
  })

  it('uses a handled headline when all visible settlement adjustments are processed', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('visibleSettlementAdjustments.value.length > 0')
    expect(source).toContain("return '差价已处理'")
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
