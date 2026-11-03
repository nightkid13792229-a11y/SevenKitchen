import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('order detail runtime regressions', () => {
  const wechatConfirmReceiptSource = readFileSync(
    resolve(process.cwd(), 'src/utils/wechat-confirm-receipt.ts'),
    'utf-8',
  )

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

  it('supports packagePlan on order items and drops the retired source plan', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('packagePlan?: Array<{ packageSpecG: number; packageCount: number }>')
    expect(source).not.toContain('ingredientSourcePlan')
  })

  it('does not leak internal order item enums to the customer', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    // 2026-10-31：顾客页不再展示营养标准、原料方案与版本号，
    // 这几项属于内部规格，需要时去食谱详情看。
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
    expect(source).toContain("return ['IN_PRODUCTION', 'FREEZING', 'SHIPPED', 'COMPLETED', 'AFTERSALE', 'CANCELLED'].includes(status)")
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

  it('keeps detail confirm receipt behind the WeChat confirm-receipt helper', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(wechatConfirmReceiptSource).toContain('confirmWechatReceiptBeforeInternalComplete')
    expect(source).toContain('confirmWechatReceiptBeforeInternalComplete')
    expect(source).toContain('await confirmWechatReceiptBeforeInternalComplete(order.value)')
  })

  it('registers the address-selected listener once and removes it on unmount', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain("uni.$on('address-selected', handleAddressSelected)")
    expect(source).toContain("uni.$off('address-selected', handleAddressSelected)")
    // 不再在 onShow 里重复注册（旧实现会累积监听导致多笔订单地址串改）
    expect(source).not.toContain('onShow(() =>')
  })

  it('shows a load error state with retry and back actions', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('loadError')
    expect(source).toContain('v-if="loadError"')
    expect(source).toContain('retryLoadOrder')
    expect(source).toContain('goBackToList')
  })

  it('offers re-order instead of a dead pay button when payment expires', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain('v-if="paymentExpired"')
    expect(source).toContain('重新下单')
    // 超时后不再出现"已超时"的死支付按钮
    expect(source).not.toContain(":disabled=\"paying || paymentExpired || paymentConfirming\"")
  })

  it('fetches the refund summary for cancelled orders to show refund progress', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).toContain("'AFTERSALE', 'CANCELLED'")
  })

  it('removes the dead view-logistics stub button for shipped orders', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    expect(source).not.toContain('@tap="viewLogistics"')
    expect(source).not.toContain("title: '查看物流...'")
    // 保留复制单号入口
    expect(source).toContain('copyTrackingNumber')
  })

  it('does not render the removed custom-recipe credit deduction', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    // 2026-10-20：定制费抵扣取消，订单详情不再有抵扣明细
    expect(source).not.toContain('creditAmountApplied')
    expect(source).not.toContain('creditOriginalProductAmount')
    expect(source).not.toContain('定制费抵扣')
    expect(source).not.toContain('credit-original')
    expect(source).not.toContain('credit-applied')
    // 只删抵扣：金额行仍在（2026-10-30 改版后并入首屏主卡，文案为「实付金额」）
    expect(source).toContain('实付金额')
    expect(source).toContain(
      'formatAmount(order.amountTotal || order.totalAmount)',
    )
  })
  it('shows actual procurement disclosure after purchase is completed', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    // 2026-11-02：采购完成后公开实际采购的渠道和采购产品名称
    expect(source).toContain('actualProcurement')
    expect(source).toContain('getProcurementDisclosure')
    expect(source).toContain('本单采购')
    expect(source).toContain('来自库存')
    expect(source).toContain('库存采购日期')
    expect(source).toContain('采购完成后，这里会显示每种原料的实际采购渠道和采购产品')
    // 食材只给内容，不写「渠道 / 采购产品」两个词（2026-11-03）
    expect(source).toContain('>{{ getProcurementDisclosure(ingredient)?.channel }}</text')
    // 补剂另走一套：渠道 / 品牌 / 采购产品，且不显示来源标签与库存日期
    expect(source).toContain('isSupplementIngredient')
    expect(source).toContain('品牌')
    expect(source).toContain('getProcurementDisclosure(ingredient)?.brand')
    expect(source).not.toContain('规格 {{')
  })

  it('shows the life-stage version frozen in the order snapshot', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )
    expect(source).toContain('series_life_stage_label')
  })

  it('carries the previous version into the repurchase route', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )
    expect(source).toContain('previousLifeStage')
  })
  it('2026-11-03 信息架构：去重、5 项折叠、物流合并、售后与客服', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
      'utf-8',
    )

    // 状态卡不再重复食谱名 / 分装 / 总价
    expect(source).not.toContain('class="hero-title"')
    expect(source).not.toContain('class="hero-meta"')

    // 原料清单：默认展开，直接看到 5 个占比最高的食材；其余（含补剂）折叠
    expect(source).toContain('isIngredientSectionOpen')
    expect(source).toContain('!== false')
    expect(source).not.toContain('v-if="expandedIngredients[item.id]"')
    expect(source).toContain('visibleFoodIngredients')
    expect(source).toContain('slice(0, 5)')
    expect(source).toContain('ingredient-toggle-more')
    expect(source).toContain('含')
    expect(source).toContain('种补剂')

    // 物流并入收货与配送，不再有独立的物流卡
    expect(source).toContain('logistics-inline')
    expect(source).not.toContain('shipping-section')

    // 售后与客服：删除投诉建议，联系客服整行
    expect(source).toContain('售后与客服')
    expect(source).not.toContain("applyAftersaleType('COMPLAINT')")
    expect(source).toContain('btn-contact')
    expect(source).toContain('收到后，如有化冻、破损、变质')
    expect(source).not.toContain('canApplyComplaint')

    // 食用与保存直接展开，取消二级入口
    expect(source).toContain('食用与保存')
    expect(source).not.toContain('reminder-section')
    expect(source).not.toContain('食用与保存提醒')
    expect(source).toContain('cookingWeightG')
    expect(source).toContain('cookingTimeJudgement')
    expect(source).toContain('必须烹饪后再食用')

    // 订单号 / 下单时间 / 备注 / 原料照片保留
    expect(source).toContain('copyOrderId')
    expect(source).toContain('formatDateTime(order.createdAt)')
    expect(source).toContain('customerRequirementText')
    expect(source).toContain('production-photos-section')
  })
})
