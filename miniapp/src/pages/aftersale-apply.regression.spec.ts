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
})
