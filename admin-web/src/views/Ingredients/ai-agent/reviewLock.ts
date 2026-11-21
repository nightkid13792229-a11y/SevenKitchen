/**
 * 审核区锁定与「检索方案未确认」两个纯判断（2026-11-21）。
 *
 * 页面只负责把状态喂进来：AI 正在跑、草稿在保存、授权在提交、草稿已提交，
 * 这四种情况都不允许再改字段或点授权；有未确认的检索方案时不允许继续对话，
 * 否则方案卡消失、服务端方案仍挂着，写工具会被一直拒。
 */

export interface ReviewLockInput {
  running: boolean
  saving: boolean
  submitting: boolean
  committed: boolean
}

export function isReviewLocked(input: ReviewLockInput): boolean {
  return Boolean(
    input.running || input.saving || input.submitting || input.committed
  )
}

export function shouldBlockRunForPendingPlan(input: {
  pendingPlan: unknown
  running: boolean
}): boolean {
  return Boolean(input.pendingPlan) && !input.running
}
