import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FINANCE_START_DATE,
  OFFLINE_PAYMENT_METHODS,
  isFinanceDateInRange,
  isOfflinePaymentMethod,
} from '../constants/finance'
import {
  getReimbursementCustomFeeCategoryLabel,
  isLegacyReimbursementCustomFeeCategory,
  isReimbursementCustomFeeCategory,
  reimbursementCustomFeeCategoryOptions,
  resolveReimbursementCustomFeeCategoryForEdit,
} from './staff-purchasing/constants/reimbursement'
import {
  reimbursementCustomFeeCategoryOptions as rootReimbursementFeeOptions,
} from '../constants/reimbursement'
import {
  resolveOfflineRefundDefaultAmount,
  validateOfflineRefundAmount,
} from '../utils/offline-refund'

/**
 * 财务小程序端 UI 回归（设计 2026-11-19 §4.2 / §4.8 / §6.6 / §8）。
 *
 * 这一组只盯「入口、口径、边界」三件事，防止以后重构时又把
 * 线下退款入口、代客单已收款默认值、报销费用范围改回去：
 * 1. 订单详情管理员可见「登记线下退款」，线下判定用完整集合；
 * 2. 退款金额默认剩余、超额前端拦下，退款日限制在起账日~今天；
 * 3. 代客下单「已收款」默认开、可关，关掉显式传 collected: false；
 * 4. 报销新增只有工具/杂物/其它，历史房租/工资/水电只读保留不改写。
 */
const readPage = (relativePath: string) =>
  readFileSync(join(__dirname, relativePath), 'utf8')

const detailSource = readPage('staff-orders/detail.vue')
const confirmSource = readPage('staff-assisted-order/confirm.vue')
const reimbursementConstantsSource = readPage(
  'staff-purchasing/constants/reimbursement.ts',
)
const reimbursementSubmitSource = readPage(
  'staff-purchasing/reimbursement/submit.vue',
)

describe('订单详情 · 登记线下退款', () => {
  it('只有管理员能看到「登记线下退款」入口', () => {
    expect(detailSource).toContain('登记线下退款')
    expect(detailSource).toContain("role === 'ADMIN'")
  })

  it('线下收款集合与后端一致，删掉任何一个成员都会红', () => {
    // 顺序也与后端 finance-categories.OFFLINE_PAYMENT_METHODS 一致
    expect([...OFFLINE_PAYMENT_METHODS]).toEqual([
      'ADMIN',
      'OFFLINE_WECHAT',
      'OFFLINE_ALIPAY',
      'OTHER',
      'OFFLINE',
    ])
    for (const method of OFFLINE_PAYMENT_METHODS) {
      expect(isOfflinePaymentMethod(method)).toBe(true)
    }
    // 线上支付和空值必须判成非线下
    expect(isOfflinePaymentMethod('WECHAT_PAY')).toBe(false)
    expect(isOfflinePaymentMethod('')).toBe(false)
    expect(isOfflinePaymentMethod(null)).toBe(false)
    // 页面必须引用这份集合，不能自己再写一遍两种值
    expect(detailSource).toContain('isOfflinePaymentMethod')
    expect(detailSource).not.toContain("['OFFLINE', 'OFFLINE_WECHAT']")
  })

  it('退款日期限制在起账日到今天，提交前再校验一次', () => {
    expect(detailSource).toContain(':start="FINANCE_START_DATE"')
    expect(detailSource).toContain(':end="offlineRefundMaxDate"')
    expect(detailSource).toContain('validateOfflineRefundDate')
    expect(FINANCE_START_DATE).toBe('2026-11-01')

    expect(isFinanceDateInRange(FINANCE_START_DATE, '2026-11-19')).toBe(true)
    expect(isFinanceDateInRange('2026-10-31', '2026-11-19')).toBe(false)
    expect(isFinanceDateInRange('2026-11-20', '2026-11-19')).toBe(false)
    expect(isFinanceDateInRange('', '2026-11-19')).toBe(false)
  })

  it('默认金额 = 剩余可退，超额在前端拦下', () => {
    expect(resolveOfflineRefundDefaultAmount(500, 120)).toBe('380.00')
    expect(resolveOfflineRefundDefaultAmount(500, 500)).toBe('0.00')
    expect(resolveOfflineRefundDefaultAmount(500, 600)).toBe('0.00')

    expect(validateOfflineRefundAmount('380', 380)).toEqual({
      ok: true,
      amount: 380,
    })
    expect(validateOfflineRefundAmount('380.01', 380)).toEqual({
      ok: false,
      message: '退款金额超过剩余可退 ¥380.00',
    })
    expect(validateOfflineRefundAmount('0', 380)).toEqual({
      ok: false,
      message: '请输入正确的退款金额',
    })

    expect(detailSource).toContain('resolveOfflineRefundDefaultAmount')
    expect(detailSource).toContain('validateOfflineRefundAmount')
  })

  it('先 await 列表再开弹层，成功后先刷新累计再提示', () => {
    expect(detailSource).toMatch(
      /await loadOfflineRefunds\(\)[\s\S]{0,420}offlineRefundVisible\.value = true/,
    )
    expect(detailSource).toMatch(
      /await loadOrderDetail\(\)\s*\n\s*uni\.showToast\(\{ title: '已登记'/,
    )
    expect(detailSource).toMatch(/await loadOfflineRefunds\(\)/)
  })

  it('登记后走接口，并展示历史登记与累计金额', () => {
    expect(detailSource).toContain('registerOrderOfflineRefund')
    expect(detailSource).toContain('listOrderOfflineRefunds')
    expect(detailSource).toContain('已登记退款合计')
    expect(detailSource).toContain('offlineRefundMethodLabel')
  })

  it('登记退款时把「退到哪个账户」随请求提交（payerAccount）', () => {
    // 2026-11-19 账户化：后端 DTO 已收 payerAccount，缺省沿用订单收款账户
    expect(detailSource).toContain('退到哪个账户')
    const submitBlock =
      detailSource.match(/async function submitOfflineRefund[\s\S]*?\n\}/)?.[0] || ''
    expect(submitBlock).toContain('payerAccount: offlineRefundAccount.value')
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

  it('已收款时提交顶层 paymentAccount（收到哪个账户）', () => {
    expect(confirmSource).toContain('收到哪个账户')
    const submitBlock =
      confirmSource.match(/async function submit[\s\S]*?\n\}/)?.[0] || ''
    // 账户是 body 顶层字段，不在 payment 里；没收到钱就不带
    expect(submitBlock).toContain(
      'paymentAccount: collected.value ? paymentAccount.value : undefined',
    )
  })
})

describe('报销 · 自定义费用收窄', () => {
  it('新增选项只有工具/杂物/其它，房租工资水电不可选', () => {
    const expected = ['TOOLS', 'SUNDRIES', 'OTHER']
    expect(reimbursementCustomFeeCategoryOptions.map((item) => item.value)).toEqual(
      expected,
    )
    // 主包副本必须同步（分包不能跨包引用，逻辑是两份）
    expect(rootReimbursementFeeOptions.map((item) => item.value)).toEqual(
      expected,
    )
    expect(isReimbursementCustomFeeCategory('RENT')).toBe(false)
    expect(isReimbursementCustomFeeCategory('PAYROLL')).toBe(false)
    // 水电已经归固定费用账单管，报销里不能再选，否则两边重复
    expect(isReimbursementCustomFeeCategory('UTILITIES')).toBe(false)
  })

  it('历史房租/工资/水电只读回显，标签还在，但不进新增选项', () => {
    expect(isLegacyReimbursementCustomFeeCategory('RENT')).toBe(true)
    expect(isLegacyReimbursementCustomFeeCategory('PAYROLL')).toBe(true)
    expect(isLegacyReimbursementCustomFeeCategory('UTILITIES')).toBe(true)
    expect(getReimbursementCustomFeeCategoryLabel('RENT')).toBe('房租')
    expect(getReimbursementCustomFeeCategoryLabel('PAYROLL')).toBe('工资/人工')
    expect(getReimbursementCustomFeeCategoryLabel('UTILITIES')).toBe('水电')
    expect(reimbursementConstantsSource).not.toContain("{ value: 'RENT'")
    expect(reimbursementConstantsSource).not.toContain("{ value: 'PAYROLL'")
    expect(reimbursementConstantsSource).not.toContain("{ value: 'UTILITIES'")
    expect(reimbursementSubmitSource).not.toContain("category: 'RENT'")
    expect(reimbursementSubmitSource).toContain('历史类别')
  })

  it('编辑历史报销时原类别原样保留，不重新推断成其它', () => {
    expect(resolveReimbursementCustomFeeCategoryForEdit('RENT', '6月房租')).toBe(
      'RENT',
    )
    expect(
      resolveReimbursementCustomFeeCategoryForEdit('PAYROLL', '6月工资'),
    ).toBe('PAYROLL')
    // 水电也是历史类别，老单重提交不能改成别的
    expect(
      resolveReimbursementCustomFeeCategoryForEdit('UTILITIES', '6月水电'),
    ).toBe('UTILITIES')
    // 老数据缺 category 时才按描述兜底
    expect(resolveReimbursementCustomFeeCategoryForEdit(undefined, '6月房租')).toBe(
      'RENT',
    )
    expect(
      resolveReimbursementCustomFeeCategoryForEdit(undefined, '6月水电'),
    ).toBe('UTILITIES')
    expect(resolveReimbursementCustomFeeCategoryForEdit(undefined, '')).toBe(
      'OTHER',
    )
    expect(reimbursementSubmitSource).toContain(
      'resolveReimbursementCustomFeeCategoryForEdit',
    )
  })

  it('默认费用项是工具，并提示水电房租工资去固定费用', () => {
    expect(reimbursementSubmitSource).toContain("category: 'TOOLS'")
    expect(reimbursementSubmitSource).not.toContain("category: 'UTILITIES'")
    expect(reimbursementSubmitSource).toContain(
      '水电、房租、工资、社保、税费请到『财务 → 固定费用』里设',
    )
  })
})
