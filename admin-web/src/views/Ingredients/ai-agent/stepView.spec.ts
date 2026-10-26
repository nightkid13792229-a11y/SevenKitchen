import { describe, expect, it } from 'vitest'
import {
  matchMethodLabel,
  toRecordEvidenceFromEvent,
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
  it('searchNames 映射成「查名字」，摘要就是关键词（不再有生熟参数）', () => {
    const view = onlyStep([
      {
        name: 'searchNames',
        args: { keyword: '鸡肝' },
        ok: true
      }
    ])

    expect(view.name).toBe('searchNames')
    expect(view.label).toBe('查名字')
    expect(view.summary).toBe('鸡肝')
    expect(view.ok).toBe(true)
    expect(view.error).toBeUndefined()
  })

  it('原子工具各有中文名：汇总 / 读记录 / 写营养 / 改原料卡 / 结束本轮', () => {
    const views = toStepView([
      { name: 'summarizeNames', args: { names: ['a', 'b', 'c'] }, ok: true },
      { name: 'getRecord', args: { id: 'rec-1' }, ok: true },
      {
        name: 'writeNutrition',
        args: {
          profileIndex: 0,
          entries: [
            { fieldPath: 'macros.crudeProtein', value: 19.5, unit: 'g' }
          ]
        },
        ok: true
      },
      {
        name: 'writeIngredient',
        args: { fields: { name: '鸡肝', category: 'MEAT_ORGAN' } },
        ok: true
      },
      { name: 'finish', args: { summary: '好了。' }, ok: true }
    ])

    expect(views.map((view) => view.label)).toEqual([
      '汇总名字',
      '读来源记录',
      '写营养',
      '改原料卡',
      '结束本轮'
    ])
    expect(views[0]?.summary).toContain('3 条名字')
    expect(views[1]?.summary).toBe('rec-1')
    expect(views[2]?.summary).toBe('档案 0 · 1 项')
    expect(views[3]?.summary).toContain('名称=鸡肝')
    expect(views[4]?.summary).toBe('好了。')
  })

  it('writeNutrition 成功：中文名「写营养」，摘要含档案与条目数', () => {
    const view = onlyStep([
      {
        name: 'writeNutrition',
        args: {
          profileIndex: 0,
          entries: [
            {
              fieldPath: 'macros.crudeProtein',
              value: 19.5,
              unit: 'g',
              sourceRecordId: 'rec-1'
            }
          ]
        },
        ok: true
      }
    ])

    expect(view.label).toBe('写营养')
    expect(view.summary).toBe('档案 0 · 1 项')
    expect(view.ok).toBe(true)
    expect(view.error).toBeUndefined()
  })

  it('writeNutrition 省略档案时显示「自动」；失败时 error 保留后端原文', () => {
    const error =
      '缺少 sourceRecordId：没有来源的营养值不能写入草稿。'
    const view = onlyStep([
      {
        name: 'writeNutrition',
        args: {
          entries: [
            {
              fieldPath: 'macros.crudeProtein',
              value: 19500,
              unit: 'mg'
            }
          ]
        },
        ok: false,
        error
      }
    ])

    expect(view.label).toBe('写营养')
    expect(view.summary).toBe('档案 自动 · 1 项')
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
        name: 'searchNames',
        args: { keyword: '西洋菜' },
        ok: true,
        result: {
          ok: true,
          found: true,
          keywords: ['西洋菜', 'watercress'],
          total: 1,
          names: [
            {
              id: 'usda-watercress',
              name: 'Watercress, raw',
              sourceType: 'USDA_FDC'
            }
          ]
        }
      }
    ])

    expect(view.search?.keywords).toEqual(['西洋菜', 'watercress'])
    expect(view.search?.matches).toHaveLength(1)
    expect(view.search?.matches[0]).toMatchObject({
      foodName: 'Watercress, raw',
      matchedByLabel: '名字命中',
      matchedKeyword: '西洋菜',
      scoreLabel: '—'
    })
    expect(view.summary).toContain('共 1 条候选')
    expect(view.statusLabel).toBe('成功')
  })

  it('查本地库候选带 AI 复核时逐条显示 相关/存疑/不相关 标签与一句理由', () => {
    const view = onlyStep([
      {
        name: 'searchNames',
        args: { keyword: '山药' },
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
        name: 'searchNames',
        args: { keyword: '山药' },
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

  it('查库结果带 AI 分类：状态 / 加工方式 / 部位与依据词一起展示', () => {
    const view = onlyStep([
      {
        name: 'searchNames',
        args: { keyword: '牛肉' },
        ok: true,
        result: {
          ok: true,
          found: true,
          keywords: ['牛肉', 'beef'],
          candidateCount: 1,
          candidates: [
            {
              sourceRecordId: 'beef-ground',
              foodName: 'Beef, ground, raw',
              matchedBy: 'EN_PARTIAL',
              matchedKeyword: 'beef',
              score: 0.8,
              classification: {
                state: 'RAW',
                method: 'NONE',
                cutLabel: '牛绞肉 85/15',
                cutGroup: 'ground',
                evidence: 'ground'
              }
            }
          ]
        }
      }
    ])

    expect(view.search?.matches[0]?.classification).toEqual({
      state: 'RAW',
      stateLabel: '生',
      method: 'NONE',
      methodLabel: '无',
      cutLabel: '牛绞肉 85/15',
      cutGroup: 'ground',
      cutGroupLabel: '绞肉',
      label: '生 · 牛绞肉 85/15',
      evidence: 'ground'
    })
  })

  it('查本地库零命中时明确写“没有找到匹配词条”，不写成功', () => {
    const view = onlyStep([
      {
        name: 'searchNames',
        args: { keyword: '西洋菜' },
        ok: true,
        result: {
          ok: true,
          found: false,
          keywords: ['西洋菜', 'watercress'],
          total: 0,
          names: []
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
        name: 'searchNames',
        args: { keyword: '牛肉' },
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

describe('读来源记录 · 来源库与覆盖率', () => {
  it('来源记录摘要带来源库与覆盖率', () => {
    const view = toRecordEvidenceFromEvent({
      name: 'Quail, meat only, raw',
      sourceType: 'USDA',
      coverage: 83.3,
      valueCount: 50
    })

    expect(view?.sourceType).toBe('USDA')
    expect(view?.message).toBe(
      '来源记录「Quail, meat only, raw」· USDA · 覆盖率 83.3% · 读到 50 项'
    )
  })

  it('旧后端没有来源库时写「未知库」，不把摘要留空', () => {
    const view = toRecordEvidenceFromEvent({
      name: 'Chicken, liver, raw',
      coverage: 82,
      valueCount: 12
    })

    expect(view?.sourceType).toBeNull()
    expect(view?.message).toBe(
      '来源记录「Chicken, liver, raw」· 未知库 · 覆盖率 82% · 读到 12 项'
    )
  })
})
