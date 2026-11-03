import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('aftersale apply regressions', () => {
  it('shows a clear submitted state instead of leaking internal backend errors', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/aftersale-apply/index.vue'),
      'utf-8',
    )

    expect(source).toContain('showAftersaleSubmittedModal')
    expect(source).toContain('您的售后申请已提交，请耐心等待管理员审核。处理结果会在订单详情中更新。')
    expect(source).toContain("showAftersaleSubmittedModal('申请处理中')")
    expect(source).toContain('isAlreadySubmittedAftersaleError')
    expect(source).toContain('suppressErrorToast: true')
    expect(source).not.toContain("uni.showToast({ title: '提交成功'")
  })

  it('defaults the aftersale type to refund, and complaint is gone', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/aftersale-apply/index.vue'),
      'utf-8',
    )

    expect(source).toContain("ref<'REFUND' | 'REMAKE'>('REFUND')")
    expect(source).toContain("currentPage.options?.type || 'REFUND'")
    // 2026-11-03：投诉建议统一走客服，售后表单不再提供该类型
    expect(source).not.toContain('COMPLAINT')
    expect(source).not.toContain('投诉建议')
  })
})
