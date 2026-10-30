/**
 * 「本次」与「草稿累计」的用量口径（2026-10-29 一草稿一会话）。
 *
 * 会话已经变成按草稿累计，所以：
 * - 草稿累计 = session.stepCount / promptTokens / completionTokens；
 * - 本次 = 当前累计 - 本轮起点（runStart*，每次用户发新消息时由后端重置）。
 *
 * 老后端/老数据没有 runStart* 时退回「从最后一条用户消息之后数工具调用」，
 * token 的本次值无法还原，按 0 展示并标记不可用。
 */

export interface AgentRunUsageSource {
  stepCount: number
  promptTokens: number
  completionTokens: number
  runStartStepCount?: number | null
  runStartPromptTokens?: number | null
  runStartCompletionTokens?: number | null
}

export interface AgentRunUsage {
  steps: number
  promptTokens: number
  completionTokens: number
  /** 后端是否提供了本轮起点；false 表示本次 token 只能按 0 展示 */
  perRunTokensAvailable: boolean
}

function hasBaseline(session: AgentRunUsageSource | null): boolean {
  return Boolean(
    session &&
      Number.isFinite(session.runStartStepCount) &&
      Number.isFinite(session.runStartPromptTokens) &&
      Number.isFinite(session.runStartCompletionTokens)
  )
}

function delta(current: number, baseline: number | null | undefined): number {
  return Math.max(0, Number(current ?? 0) - Number(baseline ?? 0))
}

export function resolveAgentRunUsage(
  session: AgentRunUsageSource | null,
  fallbackSteps: number
): AgentRunUsage {
  if (!session) {
    return {
      steps: 0,
      promptTokens: 0,
      completionTokens: 0,
      perRunTokensAvailable: false
    }
  }

  if (!hasBaseline(session)) {
    return {
      steps: Math.max(0, fallbackSteps),
      promptTokens: 0,
      completionTokens: 0,
      perRunTokensAvailable: false
    }
  }

  return {
    steps: delta(session.stepCount, session.runStartStepCount),
    promptTokens: delta(session.promptTokens, session.runStartPromptTokens),
    completionTokens: delta(
      session.completionTokens,
      session.runStartCompletionTokens
    ),
    perRunTokensAvailable: true
  }
}
