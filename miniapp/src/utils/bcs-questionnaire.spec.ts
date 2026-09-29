import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BCS_QUESTIONS,
  applyBcsScoreMap,
  getBcsLabel,
  resolveBcsFallback,
  resolveBcsFromAnswers,
} from './bcs-questionnaire'

/**
 * 体况问卷（2026-09-29 复盘后定稿）
 *
 *   1 道题、5 个选项，全部是「手要按多用力」的动作阶梯。
 *   依据：WSAVA 官方 9 档判据里，肋骨是唯一贯穿 1-9 的检查点；
 *   腰椎/骨盆属于 MCS（肌肉状况评分）、腰线/腹部是视觉项（桶胸犬答不准），
 *   三者都已删除。详见 bcs-questionnaire.ts 顶部注释。
 */
describe('体况问卷：题目集', () => {
  it('只有 1 道题、5 个选项 —— 动作阶梯：碰 → 放上去 → 轻轻按 → 用力按 → 摸不到', () => {
    expect(BCS_QUESTIONS).toHaveLength(1)
    expect(BCS_QUESTIONS[0].key).toBe('ribs')
    expect(BCS_QUESTIONS[0].options.map((o) => o.label)).toEqual([
      '一碰就硌手，几乎没有肉',
      '手放上去就摸到，不用按',
      '要轻轻按一下才摸到',
      '要用力按才摸到',
      '怎么都摸不到',
    ])
  })

  it('选项分数逐条对齐 WSAVA 肋骨判据', () => {
    expect(BCS_QUESTIONS[0].options.map((o) => o.bcs)).toEqual([2, 3, 5, 7, 9])
  })

  it('是必答题（不答就不出分，不猜）', () => {
    expect(BCS_QUESTIONS[0].required).toBe(true)
  })

  it('带指导图（挂在题干上方）', () => {
    expect(BCS_QUESTIONS[0].image).toContain('bcs-guide-palpate-ribs.jpg')
  })

  it('不再问腰线/腹部/腰椎/骨盆 —— 那三项分别是视觉项与 MCS', () => {
    const keys = BCS_QUESTIONS.map((q) => q.key)
    expect(keys).not.toContain('waist')
    expect(keys).not.toContain('tuck')
    expect(keys).not.toContain('spine')

    const source = readFileSync(
      resolve(process.cwd(), 'src/utils/bcs-questionnaire.ts'),
      'utf-8',
    )
    // 只查代码，不查注释 —— 注释里正解释着为什么把这几个删掉
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(code).not.toContain('腰椎')
    expect(code).not.toContain('骨盆')
    expect(code).not.toContain('腰部')
    expect(code).not.toContain('腹部')
  })
})

describe('体况问卷：算分', () => {
  it('选哪一档就是几分（只有一道题）', () => {
    for (const option of BCS_QUESTIONS[0].options) {
      const result = resolveBcsFromAnswers({
        answers: { ribs: option.bcs },
        questions: BCS_QUESTIONS,
      })
      expect(result.bcs).toBe(option.bcs)
      expect(result.isComplete).toBe(true)
    }
  })

  it('一碰就硌手 → 2 分；怎么都摸不到 → 9 分（两端都可达）', () => {
    const lowest = resolveBcsFromAnswers({
      answers: { ribs: 2 },
      questions: BCS_QUESTIONS,
    })
    const highest = resolveBcsFromAnswers({
      answers: { ribs: 9 },
      questions: BCS_QUESTIONS,
    })
    expect(lowest.bcs).toBe(2)
    expect(highest.bcs).toBe(9)
  })

  it('没答 → 不给分（不猜一个看起来合理的数）', () => {
    const result = resolveBcsFromAnswers({
      answers: {},
      questions: BCS_QUESTIONS,
    })
    expect(result.bcs).toBeNull()
    expect(result.isComplete).toBe(false)
    expect(result.missing).toHaveLength(1)
  })
})

describe('犬种换算表（深胸细腰型犬，名单与分数来自数据库）', () => {
  const OPTS = BCS_QUESTIONS[0].options
  const GREYHOUND = [4, 5, 6, 7, 9]

  it('灵缇的五个选项分别换算成 4/5/6/7/9', () => {
    // 关键：标准分下「手放上去就摸到」= 3（偏瘦）；灵缇应换算成 5（理想体态）
    const mapped = OPTS.map((o) => applyBcsScoreMap(o.bcs, GREYHOUND, OPTS))
    expect(mapped).toEqual([4, 5, 6, 7, 9])
  })

  it('最瘦的两档不再撞成同一个分数', () => {
    // 上一版用「下限 4」时，选项 1 和 2 都会被抬到 4，丢了一档分辨率
    const a = applyBcsScoreMap(OPTS[0].bcs, GREYHOUND, OPTS)
    const b = applyBcsScoreMap(OPTS[1].bcs, GREYHOUND, OPTS)
    expect(a).not.toBe(b)
    expect([a, b]).toEqual([4, 5])
  })

  it('灵缇在理想体态下的答案落到 5 · 理想体态（而不是被冤枉成偏瘦）', () => {
    // 「手放上去就摸到，不用按」是这类犬理想体态该有的手感
    expect(applyBcsScoreMap(OPTS[1].bcs, GREYHOUND, OPTS)).toBe(5)
    expect(getBcsLabel(5)).toBe('理想体态')
  })

  it('灵缇永远不会被判成"需要增重"（最低 4 分，换算系数 1.0）', () => {
    for (const o of OPTS) {
      const mapped = applyBcsScoreMap(o.bcs, GREYHOUND, OPTS)
      expect(mapped).toBeGreaterThanOrEqual(4)
    }
  })

  it('普通犬种没有换算表 → 用标准分，原样返回', () => {
    for (const o of OPTS) {
      expect(applyBcsScoreMap(o.bcs, null, OPTS)).toBe(o.bcs)
      expect(applyBcsScoreMap(o.bcs, undefined, OPTS)).toBe(o.bcs)
    }
  })

  it('换算表长度和选项数不符 → 整表忽略、退回标准分（宁可不修正，也不能错位）', () => {
    for (const bad of [[4, 5, 6], [4, 5, 6, 7, 9, 9], []]) {
      expect(applyBcsScoreMap(OPTS[1].bcs, bad, OPTS)).toBe(OPTS[1].bcs)
    }
  })

  it('没算出分数时保持 null（不能凭空变成一个分）', () => {
    expect(applyBcsScoreMap(null, GREYHOUND, OPTS)).toBeNull()
    expect(applyBcsScoreMap(null, null, OPTS)).toBeNull()
  })

  it('换算表可调（存在数据库里，不是写死的）', () => {
    expect(applyBcsScoreMap(OPTS[0].bcs, [3, 4, 5, 6, 7], OPTS)).toBe(3)
    expect(applyBcsScoreMap(OPTS[4].bcs, [3, 4, 5, 6, 8], OPTS)).toBe(8)
  })

  it('小程序里不存在任何犬种名单（名单在后端数据库）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/utils/bcs-questionnaire.ts'),
      'utf-8',
    )
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(code).not.toContain('灵缇')
    expect(code).not.toContain('惠比特')
    expect(code).not.toContain('KEYWORDS')
  })
})

describe('体况问卷：兜底与文案', () => {
  it('顾客整个跳过体况时：默认 5 分 + 标记未确认', () => {
    const fallback = resolveBcsFallback()
    expect(fallback.bcs).toBe(5)
    expect(fallback.confirmed).toBe(false)
  })

  it('各档位都有中文说明', () => {
    expect(getBcsLabel(2)).toBe('明显偏瘦')
    expect(getBcsLabel(3)).toBe('偏瘦')
    expect(getBcsLabel(5)).toBe('理想体态')
    expect(getBcsLabel(7)).toBe('偏胖')
    expect(getBcsLabel(9)).toBe('严重肥胖')
  })
})
