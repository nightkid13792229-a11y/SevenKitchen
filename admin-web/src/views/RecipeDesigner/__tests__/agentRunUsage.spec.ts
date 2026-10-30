import { describe, expect, it } from 'vitest'
import { resolveAgentRunUsage } from '../agentRunUsage'

describe('resolveAgentRunUsage', () => {
  it('有本轮起点时：本次 = 累计 - 起点，草稿累计仍看 session', () => {
    const usage = resolveAgentRunUsage(
      {
        stepCount: 40,
        promptTokens: 12_000,
        completionTokens: 3_000,
        runStartStepCount: 32,
        runStartPromptTokens: 9_500,
        runStartCompletionTokens: 2_100
      },
      0
    )
    expect(usage).toEqual({
      steps: 8,
      promptTokens: 2_500,
      completionTokens: 900,
      perRunTokensAvailable: true
    })
  })

  it('刚重置起点时本次为 0，不会把草稿累计误当成单次', () => {
    const usage = resolveAgentRunUsage(
      {
        stepCount: 120,
        promptTokens: 88_000,
        completionTokens: 19_000,
        runStartStepCount: 120,
        runStartPromptTokens: 88_000,
        runStartCompletionTokens: 19_000
      },
      0
    )
    expect(usage.steps).toBe(0)
    expect(usage.promptTokens).toBe(0)
    expect(usage.completionTokens).toBe(0)
  })

  it('老数据没有本轮起点：步数退回按消息数估，token 标记不可用', () => {
    const usage = resolveAgentRunUsage(
      {
        stepCount: 12,
        promptTokens: 4_000,
        completionTokens: 900
      },
      3
    )
    expect(usage.steps).toBe(3)
    expect(usage.promptTokens).toBe(0)
    expect(usage.perRunTokensAvailable).toBe(false)
  })

  it('起点大于累计（异常数据）时不会出现负数', () => {
    const usage = resolveAgentRunUsage(
      {
        stepCount: 5,
        promptTokens: 100,
        completionTokens: 20,
        runStartStepCount: 9,
        runStartPromptTokens: 200,
        runStartCompletionTokens: 30
      },
      0
    )
    expect(usage.steps).toBe(0)
    expect(usage.promptTokens).toBe(0)
    expect(usage.completionTokens).toBe(0)
  })
})
