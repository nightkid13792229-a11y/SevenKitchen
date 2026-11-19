import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 财务小程序端 UI 回归（设计 2026-11-19 §4.2 / §4.6 / §8）。
 *
 * 这一组只盯「入口和口径」三件事，防止以后重构时又把
 * 线下退款入口、代客单已收款默认值、报销费用范围改回去：
 * 1. 订单详情管理员可见「登记线下退款」，线下判定用完整集合；
 * 2. 代客下单「已收款」默认开、可关，关掉显式传 collected: false；
 * 3. 报销自定义费用不再出现房租/工资，默认项改成水电。
 */
const readPage = (relativePath: string) =>
  readFileSync(join(__dirname, relativePath), 'utf8')

const detailSource = readPage('staff-orders/detail.vue')
const confirmSource = readPage('staff-assisted-order/confirm.vue')
const reimbursementConstantsSource = readPage('../constants/reimbursement.ts')
const reimbursementSubmitSource = readPage(
  'staff-purchasing/reimbursement/submit.vue',
)

describe('订单详情 · 登记线下退款', () => {
  it('只有管理员能看到「登记线下退款」入口', () => {
    expect(detailSource).toContain('登记线下退款')
    expect(detailSource).toContain("role === 'ADMIN'")
  })

  it('线下收款按完整集合判断，不是只硬编码 OFFLINE / OFFLINE_WECHAT 两种', () => {
    expect(detailSource).toContain('OFFLINE_PAYMENT_METHODS')
    expect(detailSource).toMatch(
      /OFFLINE_PAYMENT_METHODS\.includes\(order\.value\.paymentMethod/,
    )
    // 集合里必须覆盖后台手动确认、支付宝和其他线下渠道
    expect(detailSource).toContain("'ADMIN'")
    expect(detailSource).toContain("'OFFLINE_ALIPAY'")
    expect(detailSource).toContain("'OTHER'")
    expect(detailSource).not.toContain("['OFFLINE', 'OFFLINE_WECHAT']")
  })

  it('登记后走接口刷新，并展示历史登记与累计金额', () => {
    expect(detailSource).toContain('registerOrderOfflineRefund')
    expect(detailSource).toContain('listOrderOfflineRefunds')
    expect(detailSource).toContain('已登记退款合计')
    expect(detailSource).toContain('offlineRefundMethodLabel')
  })
})

describe('代客下单 · 已收款开关', () => {
  it('「已收款」默认打开，并提供线下渠道选择', () => {
    expect(confirmSource).toContain('已收款')
    expect(confirmSource).toMatch(/collected\s*=\s*ref\(true\)/)
    expect(confirmSource).toContain('paymentChannel')
    expect(confirmSource).toContain('OFFLINE_WECHAT')
    expect(confirmSource).toContain('OFFLINE_ALIPAY')
    expect(confirmSource).toContain('OTHER')
  })

  it('提交时显式传 collected，关闭时不带渠道', () => {
    expect(confirmSource).toContain('collected: collected.value')
    expect(confirmSource).toContain(
      'collected.value ? paymentChannel.value : undefined',
    )
  })
})

describe('报销 · 自定义费用收窄', () => {
  it('常量里不再提供房租与工资，水电仍在', () => {
    expect(reimbursementConstantsSource).not.toContain('RENT')
    expect(reimbursementConstantsSource).not.toContain('PAYROLL')
    expect(reimbursementConstantsSource).toContain("value: 'UTILITIES'")
    expect(reimbursementConstantsSource).toContain("value: 'TOOLS'")
    expect(reimbursementConstantsSource).toContain("value: 'OTHER'")
  })

  it('默认费用项改成水电，并提示房租工资去固定费用报', () => {
    expect(reimbursementSubmitSource).not.toContain("category: 'RENT'")
    expect(reimbursementSubmitSource).toContain("category: 'UTILITIES'")
    expect(reimbursementSubmitSource).toContain('固定费用')
  })
})
