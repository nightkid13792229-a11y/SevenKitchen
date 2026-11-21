import { describe, expect, it } from 'vitest'
import {
  isReviewLocked,
  shouldBlockRunForPendingPlan,
} from './reviewLock'

describe('isReviewLocked', () => {
  const idle = {
    running: false,
    saving: false,
    submitting: false,
    committed: false,
  }

  it('全部空闲时解锁', () => {
    expect(isReviewLocked(idle)).toBe(false)
  })

  it('AI 运行 / 保存 / 授权中 / 已提交，任一状态都锁', () => {
    expect(isReviewLocked({ ...idle, running: true })).toBe(true)
    expect(isReviewLocked({ ...idle, saving: true })).toBe(true)
    expect(isReviewLocked({ ...idle, submitting: true })).toBe(true)
    expect(isReviewLocked({ ...idle, committed: true })).toBe(true)
  })
})

describe('shouldBlockRunForPendingPlan', () => {
  it('有方案未确认时不许继续对话；确认/跳过（方案为空）后才放行', () => {
    expect(
      shouldBlockRunForPendingPlan({ pendingPlan: { status: 'PENDING' }, running: false }),
    ).toBe(true)
    expect(
      shouldBlockRunForPendingPlan({ pendingPlan: null, running: false }),
    ).toBe(false)
    expect(
      shouldBlockRunForPendingPlan({ pendingPlan: { status: 'PENDING' }, running: true }),
    ).toBe(false)
  })
})
