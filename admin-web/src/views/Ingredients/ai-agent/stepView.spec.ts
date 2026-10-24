import { describe, expect, it } from 'vitest'
import {
  matchMethodLabel,
  toSearchEvidenceFromEvent,
  toStepView,
  type AgentStepView
} from './stepView'

type ToolCalls = Parameters<typeof toStepView>[0]

function onlyStep(toolCalls: ToolCalls): AgentStepView {
  const views = toStepView(toolCalls)
  expect(views).toHaveLength(1)
  const [view] = views
  if (!view) {
    throw new Error('期望映射出一个步骤，实际为空')
  }
  return view
}

/**
 * 工具调用 → 页面步骤的纯函数测试。
 *
 * 页面只负责把这里的结果按顺序画出来，所以中文名、参数摘要、
 * 失败原因都收在这一层验证。
 */
describe('toStepView', () => {
  it('searchLocalNutrition 映射成「查本地库」，摘要含关键词与生熟状态', () => {
    const view = onlyStep([
      {
        name: 'searchLocalNutrition',
        args: { keyword: '鸡肝', state: 'RAW' },
        ok: true
      }
    ])

    expect(view.name).toBe('searchLocalNutrition')
    expect(view.label).toBe('查本地库')
    expect(view.summary).toContain('鸡肝')
    expect(view.summary).toContain('生')
    expect(view.ok).toBe(true)
    expect(view.error).toBeUndefined()
  })

  it('searchLocalNutrition 的熟档案显示「熟」', () => {
    const view = onlyStep([
      {
        name: 'searchLocalNutrition',
        args: { keyword: '鸡肝', state: 'COOKED' },
        ok: true
      }
    ])

    expect(view.summary).toBe('鸡肝 · 熟')
  })

  it('updateNutritionField 成功：中文名「写字段」，摘要含字段名、数值与单位', () => {
    const view = onlyStep([
      {
        name: 'updateNutritionField',
        args: {
          profileIndex: 0,
          fieldPath: 'macros.crudeProtein',
          value: 19.5,
          unit: 'g'
        },
        ok: true
      }
    ])

    expect(view.label).toBe('写字段')
    expect(view.summary).toBe('粗蛋白 = 19.5 g')
    expect(view.ok).toBe(true)
    expect(view.error).toBeUndefined()
  })

  it('updateNutritionField 失败：摘要照常，error 保留后端原文', () => {
    const error =
      '字段 macros.crudeProtein 的目录单位是 g，不接受「mg」（本工具不做换算）。'
    const view = onlyStep([
      {
        name: 'updateNutritionField',
        args: {
          profileIndex: 0,
          fieldPath: 'macros.crudeProtein',
          value: 19500,
          unit: 'mg'
        },
        ok: false,
        error
      }
    ])

    expect(view.label).toBe('写字段')
    expect(view.summary).toBe('粗蛋白 = 19500 mg')
    expect(view.ok).toBe(false)
    expect(view.error).toBe(error)
  })

  it('未知工具名不崩，原样显示工具名与参数', () => {
    const view = onlyStep([
      {
        name: 'someFutureTool',
        args: { foo: 'bar', count: 2 },
        ok: true
      }
    ])

    expect(view.label).toBe('someFutureTool')
    expect(view.summary).toContain('foo')
    expect(view.summary).toContain('bar')
    expect(view.summary).not.toContain('\n')
    expect(view.ok).toBe(true)
  })

  it('runCheck 映射成「跑终检」', () => {
    const view = onlyStep([
      { name: 'runCheck', args: {}, ok: false, error: '终检服务超时' }
    ])

    expect(view.label).toBe('跑终检')
    expect(view.ok).toBe(false)
    expect(view.error).toBe('终检服务超时')
  })

  it('查本地库命中时展开匹配依据：关键词、词条名、匹配方式与分数', () => {
    const view = onlyStep([
      {
        name: 'searchLocalNutrition',
        args: { keyword: '西洋菜', state: 'RAW' },
        ok: true,
        result: {
          ok: true,
          found: true,
          keywords: ['西洋菜', 'watercress'],
          candidateCount: 1,
          candidates: [
            {
              sourceRecordId: 'usda-watercress',
              foodName: 'Watercress, raw',
              foodNameEn: 'Watercress, raw',
              matchedBy: 'ZH_ALIAS',
              matchedKeyword: '西洋菜',
              score: 0.8
            }
          ]
        }
      }
    ])

    expect(view.search?.keywords).toEqual(['西洋菜', 'watercress'])
    expect(view.search?.matches).toHaveLength(1)
    expect(view.search?.matches[0]).toMatchObject({
      foodName: 'Watercress, raw',
      matchedByLabel: '中英别名匹配',
      matchedKeyword: '西洋菜',
      scoreLabel: '0.80'
    })
    expect(view.summary).toContain('命中 1 条')
    expect(view.statusLabel).toBe('成功')
  })

  it('查本地库候选带 AI 复核时逐条显示 相关/存疑/不相关 标签与一句理由', () => {
    const view = onlyStep([
      {
        name: 'searchLocalNutrition',
        args: { keyword: '山药', state: 'RAW' },
        ok: true,
        result: {
          ok: true,
          found: true,
          keywords: ['山药', 'yam'],
          candidateCount: 3,
          candidates: [
            {
              sourceRecordId: 'rec-yam',
              foodName: 'Yam, raw',
              matchedBy: 'EN_PARTIAL',
              matchedKeyword: 'yam',
              score: 0.9,
              review: { verdict: 'RELEVANT', reason: '就是山药' }
            },
            {
              sourceRecordId: 'rec-jicama',
              foodName: 'Yambean (jicama), raw',
              matchedBy: 'EN_PARTIAL',
              matchedKeyword: 'yam',
              score: 0.8,
              review: { verdict: 'IRRELEVANT', reason: '凉薯，不是山药' }
            },
            {
              sourceRecordId: 'rec-celery',
              foodName: 'Celery, raw',
              matchedBy: 'FUZZY',
              matchedKeyword: 'yam',
              score: 0.4,
              review: { verdict: 'UNCERTAIN', reason: '无法确认' }
            }
          ]
        }
      }
    ])

    expect(view.search?.matches).toHaveLength(3)
    expect(view.search?.matches[0]).toMatchObject({
      foodName: 'Yam, raw',
      aiVerdict: 'RELEVANT',
      aiVerdictLabel: '相关',
      aiVerdictTagType: 'success',
      aiReason: '就是山药'
    })
    expect(view.search?.matches[1]).toMatchObject({
      foodName: 'Yambean (jicama), raw',
      aiVerdict: 'IRRELEVANT',
      aiVerdictLabel: '不相关',
      aiVerdictTagType: 'danger',
      aiReason: '凉薯，不是山药'
    })
    expect(view.search?.matches[2]).toMatchObject({
      aiVerdict: 'UNCERTAIN',
      aiVerdictLabel: '存疑',
      aiVerdictTagType: 'warning',
      aiReason: '无法确认'
    })
  })

  it('AI 复核缺失或 verdict 非法时不假装有判断', () => {
    const view = onlyStep([
      {
        name: 'searchLocalNutrition',
        args: { keyword: '山药', state: 'RAW' },
        ok: true,
        result: {
          ok: true,
          found: true,
          keywords: ['山药'],
          candidateCount: 1,
          candidates: [
            {
              sourceRecordId: 'rec-yam',
              foodName: 'Yam, raw',
              matchedBy: 'EN_PARTIAL',
              matchedKeyword: 'yam',
              score: 0.9,
              review: { verdict: 'MAYBE', reason: '不是合法判断' }
            }
          ]
        }
      }
    ])

    expect(view.search?.matches[0]).toMatchObject({
      aiVerdict: null,
      aiVerdictLabel: '',
      aiReason: ''
    })
  })

  it('查本地库零命中时明确写“没有找到匹配词条”，不写成功', () => {
    const view = onlyStep([
      {
        name: 'searchLocalNutrition',
        args: { keyword: '西洋菜', state: 'RAW' },
        ok: true,
        result: {
          ok: true,
          found: false,
          keywords: ['西洋菜', 'watercress'],
          candidateCount: 0,
          candidates: []
        }
      }
    ])

    expect(view.search?.found).toBe(false)
    expect(view.search?.message).toBe('没有找到匹配词条')
    expect(view.summary).toContain('没有找到匹配词条')
    expect(view.summary).not.toContain('成功')
    expect(view.statusLabel).toBe('未找到')
    expect(view.statusType).toBe('warning')
  })

  it('askUser 映射成「向你提问」，摘要带上问题原文', () => {
    const view = onlyStep([
      {
        name: 'askUser',
        args: { question: '牛肉用哪个部位？', options: ['牛腩', '牛腱子'] },
        ok: true
      }
    ])

    expect(view.label).toBe('向你提问')
    expect(view.summary).toBe('牛肉用哪个部位？')
  })

  it('空列表返回空数组', () => {
    expect(toStepView([])).toEqual([])
  })
})

describe('matchMethodLabel', () => {
  it('词典与 AI 翻译的命中方式有中文标签', () => {
    expect(matchMethodLabel('DICTIONARY')).toBe('词典命中')
    expect(matchMethodLabel('AI_TRANSLATION')).toBe('AI 翻译')
  })

  it('未知匹配方式原样显示，不藏信息', () => {
    expect(matchMethodLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(matchMethodLabel('')).toBe('匹配方式未知')
  })
})

describe('查本地库 · 部位分组概览', () => {
  const groups = [
    { key: 'ground', label: '牛绞肉', count: 6, states: ['RAW'] },
    { key: 'tenderloin', label: '牛里脊', count: 3, states: ['RAW'] },
    { key: 'brisket', label: '牛腩', count: 2, states: ['RAW'] }
  ]

  it('工具结果带 groups / totalCandidates / reviewSummary：页面能画分组与条数', () => {
    const view = onlyStep([
      {
        name: 'searchLocalNutrition',
        args: { keyword: '牛肉', state: 'RAW' },
        ok: true,
        result: {
          ok: true,
          found: true,
          keywords: ['牛肉', 'beef'],
          candidateCount: 50,
          totalCandidates: 50,
          reviewSummary: {
            relevantCount: 11,
            uncertainCount: 0,
            irrelevantCount: 0,
            failed: false
          },
          groups,
          candidates: []
        }
      }
    ])

    expect(view.search?.totalCount).toBe(50)
    expect(view.search?.relevantCount).toBe(11)
    expect(view.search?.message).toBe('共 50 条候选 · 11 条相关')
    expect(view.search?.groups).toEqual([
      {
        key: 'ground',
        label: '牛绞肉',
        count: 6,
        states: ['RAW'],
        stateLabel: '生',
        labelWithCount: '牛绞肉（6 条）'
      },
      {
        key: 'tenderloin',
        label: '牛里脊',
        count: 3,
        states: ['RAW'],
        stateLabel: '生',
        labelWithCount: '牛里脊（3 条）'
      },
      {
        key: 'brisket',
        label: '牛腩',
        count: 2,
        states: ['RAW'],
        stateLabel: '生',
        labelWithCount: '牛腩（2 条）'
      }
    ])
    expect(view.search?.groupSummary).toBe(
      '牛绞肉 6 条 · 牛里脊 3 条 · 牛腩 2 条'
    )
    expect(view.summary).toContain('共 50 条候选 · 11 条相关')
  })

  it('流式 step_end 同样还原分组概览；旧事件没有 groups 时保持空数组', () => {
    const evidence = toSearchEvidenceFromEvent({
      found: true,
      keywords: ['牛肉', 'beef'],
      candidateCount: 50,
      totalCandidates: 50,
      reviewSummary: { relevantCount: 11 },
      groups
    })

    expect(evidence?.groups).toHaveLength(3)
    expect(evidence?.groups[0]).toMatchObject({
      label: '牛绞肉',
      labelWithCount: '牛绞肉（6 条）'
    })
    expect(evidence?.message).toBe('共 50 条候选 · 11 条相关')

    const legacy = toSearchEvidenceFromEvent({
      found: true,
      keywords: ['西洋菜'],
      candidateCount: 1,
      matches: []
    })
    expect(legacy?.groups).toEqual([])
    expect(legacy?.groupSummary).toBe('')
    expect(legacy?.message).toBe('命中 1 条')
  })
})
