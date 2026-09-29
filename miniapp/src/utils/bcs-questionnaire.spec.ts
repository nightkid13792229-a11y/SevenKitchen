import { describe, expect, it } from 'vitest'
import {
  BCS_QUESTIONS,
  getBcsLabel,
  isLongHairedBreed,
  resolveBcsFallback,
  resolveBcsFromAnswers,
  resolveQuestions,
  resolveSpecialBreedType,
  getSpecialBreedHint,
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

describe('体况引导：长毛犬只留「摸」的两题', () => {
  it('识别常见长毛犬种', () => {
    expect(isLongHairedBreed('泰迪')).toBe(true)
    expect(isLongHairedBreed('比熊')).toBe(true)
    expect(isLongHairedBreed('萨摩耶')).toBe(true)
    expect(isLongHairedBreed('Poodle')).toBe(true)
  })

  it('短毛犬种不误判', () => {
    expect(isLongHairedBreed('拉布拉多')).toBe(false)
    expect(isLongHairedBreed('法斗')).toBe(false)
    expect(isLongHairedBreed('')).toBe(false)
    expect(isLongHairedBreed(null)).toBe(false)
  })

  it('长毛犬只返回 2 道题，且都是「摸」', () => {
    const questions = resolveQuestions({ isLongHaired: true })
    expect(questions).toHaveLength(2)
    expect(questions.every((q) => q.kind === 'touch')).toBe(true)
  })

  it('非长毛犬返回全部 4 道', () => {
    expect(resolveQuestions({ isLongHaired: false })).toHaveLength(4)
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

describe('体况引导：特殊犬种提示（阶段 C9）', () => {
  it('识别深胸细腰型犬种', () => {
    expect(resolveSpecialBreedType('灵缇')).toBe('SIGHTHOUND')
    expect(resolveSpecialBreedType('惠比特')).toBe('SIGHTHOUND')
    expect(resolveSpecialBreedType('Greyhound')).toBe('SIGHTHOUND')
  })

  it('识别短鼻桶胸型犬种', () => {
    expect(resolveSpecialBreedType('法国斗牛犬')).toBe('BRACHYCEPHALIC')
    expect(resolveSpecialBreedType('巴哥犬')).toBe('BRACHYCEPHALIC')
    expect(resolveSpecialBreedType('Pug')).toBe('BRACHYCEPHALIC')
  })

  it('普通犬种没有特殊提示', () => {
    expect(resolveSpecialBreedType('拉布拉多')).toBeNull()
    expect(resolveSpecialBreedType(null)).toBeNull()
    expect(getSpecialBreedHint(null)).toBe('')
  })

  it('两类犬种各有针对性提示（说明「可能是正常的」，避免误判）', () => {
    expect(getSpecialBreedHint('SIGHTHOUND')).toContain('肋骨')
    expect(getSpecialBreedHint('BRACHYCEPHALIC')).toContain('摸肋骨')
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
