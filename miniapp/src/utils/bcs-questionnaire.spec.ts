import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BCS_QUESTIONS,
  BCS_SKIP,
  getBcsLabel,
  resolveBcsFallback,
  resolveBcsFromAnswers,
} from './bcs-questionnaire'

describe('体况引导：题目集（阶段 C）', () => {
  it('共 4 道题，其中 2 道是「摸」、2 道是「看」', () => {
    expect(BCS_QUESTIONS).toHaveLength(4)
    expect(BCS_QUESTIONS.filter((q) => q.kind === 'touch')).toHaveLength(2)
    expect(BCS_QUESTIONS.filter((q) => q.kind === 'look')).toHaveLength(2)
  })

  it('必答题是两道「摸」的题（不受毛发长度影响）', () => {
    const required = BCS_QUESTIONS.filter((q) => q.required)
    expect(required.map((q) => q.key)).toEqual(['ribs', 'spine'])
    expect(required.every((q) => q.kind === 'touch')).toBe(true)
  })

  it('每题 4 个选项，选项对应的体况分都在 1-9 之间', () => {
    for (const q of BCS_QUESTIONS) {
      expect(q.options).toHaveLength(4)
      for (const o of q.options) {
        expect(o.bcs).toBeGreaterThanOrEqual(1)
        expect(o.bcs).toBeLessThanOrEqual(9)
      }
    }
  })

  it('标准体重的狗：四题都选中间档 → 5 分', () => {
    const answers = { ribs: 5, spine: 5, waist: 5, tuck: 5 }
    expect(resolveBcsFromAnswers({ answers, questions: BCS_QUESTIONS }).bcs).toBe(5)
  })
})

describe('体况引导：不再按犬种分类，改用「看不出来」跳过', () => {
  it('题目模块里不存在任何犬种判断（柴犬这类边界犬种不再有争议）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/utils/bcs-questionnaire.ts'),
      'utf-8',
    )
    // 只查代码，不查注释 —— 注释里正解释着为什么把这份名单删掉
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(code).not.toContain('isLongHairedBreed')
    expect(code).not.toContain('resolveQuestions')
    expect(code).not.toContain('KEYWORDS')
    expect(code).not.toContain('柴犬')
    expect(code).not.toContain('泰迪')
  })

  it('所有狗拿到同一套题（4 道）', () => {
    expect(BCS_QUESTIONS).toHaveLength(4)
  })

  it('只有两道「看」的题可以「看不出来」', () => {
    const skippable = BCS_QUESTIONS.filter((q) => q.skippable)
    expect(skippable.map((q) => q.key)).toEqual(['waist', 'tuck'])
    expect(skippable.every((q) => q.kind === 'look')).toBe(true)
  })

  it('「看不出来」不计入中位数，等价于该题没答', () => {
    // 直观上像 7 分（腰线平直），但顾客说看不出来，就不该拿它去推高结论
    const withSkip = resolveBcsFromAnswers({
      answers: { ribs: 5, spine: 5, waist: BCS_SKIP, tuck: BCS_SKIP },
      questions: BCS_QUESTIONS,
    })
    expect(withSkip.bcs).toBe(5)

    const withGuess = resolveBcsFromAnswers({
      answers: { ribs: 5, spine: 5, waist: 7, tuck: 7 },
      questions: BCS_QUESTIONS,
    })
    expect(withGuess.bcs).toBe(6)
  })

  it('必答题不接受「看不出来」（摸得出来，不该跳过）', () => {
    const result = resolveBcsFromAnswers({
      answers: { ribs: BCS_SKIP, spine: 5 },
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBeNull()
    expect(result.missing).toHaveLength(1)
  })
})

describe('体况引导：分数档对齐 WSAVA 官方判据', () => {
  it('选项分数与官方逐档判据一致', () => {
    const byKey = Object.fromEntries(
      BCS_QUESTIONS.map((q) => [q.key, q.options.map((o) => o.bcs)]),
    )
    // 官方第 3 档原文即「明顯腰身與腹部凹陷」，所以「看」的题最瘦档是 3 不是 4
    expect(byKey.ribs).toEqual([1, 5, 7, 9])
    expect(byKey.spine).toEqual([1, 5, 7, 9])
    expect(byKey.waist).toEqual([3, 5, 7, 9])
    expect(byKey.tuck).toEqual([3, 5, 6, 8])
  })

  it('极瘦的狗算得出 1-2 分（不再被系统性低估 20%）', () => {
    const thinnest = Object.fromEntries(
      BCS_QUESTIONS.map((q) => [q.key, q.options[0].bcs]),
    )
    // 四题都答最瘦档 -> 2 分（旧版只能到 3 分）
    expect(resolveBcsFromAnswers({ answers: thinnest, questions: BCS_QUESTIONS }).bcs).toBe(2)

    // 瘦到骨头明显时，两道「看」的题通常也会看不出来 -> 1 分可达
    const skipped = { ...thinnest, waist: BCS_SKIP, tuck: BCS_SKIP }
    expect(resolveBcsFromAnswers({ answers: skipped, questions: BCS_QUESTIONS }).bcs).toBe(1)
  })

  it('最胖的狗仍然算得出 9 分', () => {
    const fattest = Object.fromEntries(
      BCS_QUESTIONS.map((q) => [q.key, q.options[q.options.length - 1].bcs]),
    )
    expect(resolveBcsFromAnswers({ answers: fattest, questions: BCS_QUESTIONS }).bcs).toBe(9)
  })
})

describe('体况引导：算分与必答校验', () => {
  it('两道必答题没答完 → 不给分（不猜）', () => {
    const result = resolveBcsFromAnswers({
      answers: { ribs: 5 },
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBeNull()
    expect(result.isComplete).toBe(false)
    expect(result.missing).toHaveLength(1)
  })

  it('只答两道必答题也能出分（选答题可跳过）', () => {
    const result = resolveBcsFromAnswers({
      answers: { ribs: 7, spine: 7 },
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBe(7)
    expect(result.isComplete).toBe(true)
  })

  it('中位数对个别看错一项是稳健的', () => {
    // 三项都指向 5 分，只有一项看错成 9 分 → 仍应得 5 分左右
    const result = resolveBcsFromAnswers({
      answers: { ribs: 5, spine: 5, waist: 5, tuck: 9 },
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBe(5)
  })

  it('明显偏胖的狗 → 7 分及以上', () => {
    const result = resolveBcsFromAnswers({
      answers: { ribs: 7, spine: 7, waist: 7, tuck: 8 },
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBeGreaterThanOrEqual(7)
  })

  it('明显偏瘦的狗 → 3 分及以下', () => {
    const result = resolveBcsFromAnswers({
      answers: { ribs: 1, spine: 2, waist: 4, tuck: 4 },
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBeLessThanOrEqual(4)
  })

  it('算出的分数始终落在 1-9 内', () => {
    const result = resolveBcsFromAnswers({
      answers: { ribs: 1, spine: 1, waist: 1, tuck: 1 },
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBeGreaterThanOrEqual(1)
    expect(result.bcs).toBeLessThanOrEqual(9)
  })
})

describe('体况引导：跳过的兜底', () => {
  it('顾客仍跳过时按默认 5 分，但**明确标记为未确认**', () => {
    const fallback = resolveBcsFallback()
    expect(fallback.bcs).toBe(5)
    expect(fallback.confirmed).toBe(false)
  })
})

describe('体况引导：结果文案', () => {
  it('各档位都有中文说明', () => {
    expect(getBcsLabel(3)).toBe('偏瘦')
    expect(getBcsLabel(5)).toBe('理想体态')
    expect(getBcsLabel(7)).toBe('偏胖')
    expect(getBcsLabel(9)).toBe('严重肥胖')
  })
})
