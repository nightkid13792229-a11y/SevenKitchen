import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  answerInputFromPendingQuestion,
  createAgentStreamState,
  parseSseChunk,
  pendingOptionBadge,
  readPendingQuestion,
  reduceAgentEvents,
  streamIngredientAgent,
  type AgentPendingQuestionOption,
  type AgentStreamEvent,
  type AgentStreamState
} from './agentStream'

function stepStart(index = 1): AgentStreamEvent {
  return {
    type: 'step_start',
    index,
    name: 'searchLocalNutrition',
    summary: '查本地库 西洋菜·生'
  }
}

type StepEndOverrides = Partial<
  Omit<Extract<AgentStreamEvent, { type: 'step_end' }>, 'type' | 'index'>
>

function stepEnd(
  index = 1,
  overrides: StepEndOverrides = {}
): AgentStreamEvent {
  return {
    type: 'step_end',
    index,
    ok: overrides.ok ?? true,
    resultSummary: overrides.resultSummary ?? '命中 1 条',
    ...(overrides.found === undefined ? {} : { found: overrides.found }),
    ...(overrides.error === undefined ? {} : { error: overrides.error }),
    ...(overrides.keywords === undefined
      ? {}
      : { keywords: overrides.keywords }),
    ...(overrides.candidateCount === undefined
      ? {}
      : { candidateCount: overrides.candidateCount }),
    ...(overrides.matches === undefined ? {} : { matches: overrides.matches }),
    ...(overrides.record === undefined ? {} : { record: overrides.record })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSseChunk', () => {
  it('只消费完整帧，半帧留在 rest 里', () => {
    const buffer =
      'data: {"type":"step_start","index":1,"name":"searchLocalNutrition","summary":"查本地库 西洋菜·生"}\n\n' +
      'data: {"type":"step_end","index":1,'

    const parsed = parseSseChunk(buffer)

    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0]).toMatchObject({ type: 'step_start', index: 1 })
    expect(parsed.rest).toContain('"type":"step_end"')
    expect(parsed.rest).not.toContain('"type":"step_start"')
  })

  it('一次分片里多个帧、CRLF 与心跳注释都能处理', () => {
    const buffer = [
      ': keep-alive',
      '',
      'data: {"type":"step_start","index":1,"name":"runCheck","summary":"跑终检"}',
      '',
      'data: {"type":"step_end","index":1,"ok":true,"resultSummary":"终检通过"}',
      '',
      ''
    ].join('\r\n')

    const parsed = parseSseChunk(buffer)

    expect(parsed.events.map((event) => event.type)).toEqual([
      'step_start',
      'step_end'
    ])
    expect(parsed.rest).toBe('')
  })

  it('坏 JSON 不抛错，直接跳过', () => {
    const parsed = parseSseChunk('data: {not-json}\n\n')

    expect(parsed.events).toEqual([])
    expect(parsed.rest).toBe('')
  })
})

describe('reduceAgentEvents', () => {
  it('step_start 后立即进入「执行中」，带上中文工具名与摘要', () => {
    const state = reduceAgentEvents(createAgentStreamState(), stepStart())

    expect(state.steps).toHaveLength(1)
    expect(state.steps[0]).toMatchObject({
      index: 1,
      name: 'searchLocalNutrition',
      label: '查本地库',
      summary: '查本地库 西洋菜·生',
      status: 'running',
      ok: null
    })
  })

  it('step_end 后变成功，并保留 found / resultSummary', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(state, stepEnd(1, { found: true }))

    expect(state.steps[0]).toMatchObject({
      status: 'success',
      ok: true,
      found: true,
      resultSummary: '命中 1 条'
    })
    expect(state.steps[0]?.error).toBeUndefined()
  })

  it('step_end 带 matches / keywords 时，查库步骤的展开数据完整', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(
      state,
      stepEnd(1, {
        found: true,
        resultSummary: '命中 2 条',
        keywords: ['西洋菜', 'watercress'],
        candidateCount: 2,
        matches: [
          {
            name: 'Watercress, raw',
            matchedBy: 'EN_PARTIAL',
            matchedKeyword: 'watercress',
            score: 0.86
          },
          {
            name: '西洋菜',
            matchedBy: 'ZH_ALIAS',
            matchedKeyword: '西洋菜',
            score: 0.72
          }
        ]
      })
    )

    const search = state.steps[0]?.search
    expect(search).toBeDefined()
    expect(search?.keywords).toEqual(['西洋菜', 'watercress'])
    expect(search?.found).toBe(true)
    expect(search?.totalCount).toBe(2)
    expect(search?.message).toBe('命中 2 条')
    expect(search?.matches).toHaveLength(2)
    expect(search?.matches[0]).toMatchObject({
      foodName: 'Watercress, raw',
      foodNameEn: null,
      matchedBy: 'EN_PARTIAL',
      matchedByLabel: '英文名部分匹配',
      matchedKeyword: 'watercress',
      score: 0.86,
      scoreLabel: '0.86'
    })
    expect(search?.matches[1]).toMatchObject({
      foodName: '西洋菜',
      matchedBy: 'ZH_ALIAS',
      matchedByLabel: '中英别名匹配',
      matchedKeyword: '西洋菜',
      scoreLabel: '0.72'
    })
  })

  it('零命中的 step_end 仍给出空 matches 与「没有找到匹配词条」', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(
      state,
      stepEnd(1, {
        found: false,
        resultSummary: '没有找到匹配词条',
        keywords: ['西洋菜', 'watercress'],
        candidateCount: 0,
        matches: []
      })
    )

    expect(state.steps[0]).toMatchObject({
      found: false,
      status: 'success'
    })
    expect(state.steps[0]?.search).toMatchObject({
      keywords: ['西洋菜', 'watercress'],
      found: false,
      totalCount: 0,
      matches: [],
      message: '没有找到匹配词条'
    })
  })

  it('读来源记录的 step_end 带 record 摘要（词条名 / 覆盖率 / 项数）', () => {
    let state = reduceAgentEvents(createAgentStreamState(), {
      type: 'step_start',
      index: 2,
      name: 'getNutritionRecord',
      summary: '读来源记录 rec-liver-raw'
    })
    state = reduceAgentEvents(
      state,
      stepEnd(2, {
        resultSummary: '读到 12 项营养值',
        record: {
          name: 'Chicken, liver, raw',
          coverage: 82,
          valueCount: 12
        }
      })
    )

    expect(state.steps[0]).toMatchObject({
      label: '读来源记录',
      status: 'success',
      resultSummary: '读到 12 项营养值'
    })
    expect(state.steps[0]?.record).toEqual({
      name: 'Chicken, liver, raw',
      coverage: 82,
      coverageLabel: '82%',
      valueCount: 12,
      message: '来源记录「Chicken, liver, raw」· 覆盖率 82% · 读到 12 项'
    })
  })

  it('step_end 失败时保留下游 error 原文', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart(2))
    state = reduceAgentEvents(
      state,
      stepEnd(2, {
        ok: false,
        resultSummary: '执行失败',
        error: '来源记录 rec-x 不存在'
      })
    )

    expect(state.steps[0]).toMatchObject({
      index: 2,
      status: 'failed',
      ok: false,
      error: '来源记录 rec-x 不存在'
    })
  })

  it('乱序 step_end（没有 start）也能落成一条已完成步骤', () => {
    const state = reduceAgentEvents(
      createAgentStreamState(),
      stepEnd(3, { found: false, resultSummary: '没有找到匹配词条' })
    )

    expect(state.steps).toHaveLength(1)
    expect(state.steps[0]).toMatchObject({
      index: 3,
      status: 'success',
      found: false,
      resultSummary: '没有找到匹配词条'
    })
    expect(state.steps[0]?.label).toBe('步骤 3')
  })

  it('未知事件与坏事件不崩、不改变状态', () => {
    const base = reduceAgentEvents(createAgentStreamState(), stepStart())

    expect(() =>
      reduceAgentEvents(base, { type: 'heartbeat', at: 1 })
    ).not.toThrow()
    expect(reduceAgentEvents(base, { type: 'heartbeat' })).toEqual(base)
    expect(reduceAgentEvents(base, null)).toEqual(base)
    expect(reduceAgentEvents(base, { type: 'step_start' })).toEqual(base)
  })

  it('reply 记录总结与计数，done 标记结束', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(state, stepEnd())
    state = reduceAgentEvents(state, {
      type: 'reply',
      reply: '已填好，请审核。',
      draftId: 'draft-1',
      steps: 2,
      toolCallCount: 1
    })

    expect(state.reply).toBe('已填好，请审核。')
    expect(state.draftId).toBe('draft-1')
    expect(state.meta).toEqual({ steps: 2, toolCallCount: 1 })
    expect(state.done).toBe(false)

    state = reduceAgentEvents(state, { type: 'done' })
    expect(state.done).toBe(true)
  })

  it('error 事件保留已收到的步骤，只加错误信息', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(state, stepEnd())
    state = reduceAgentEvents(state, {
      type: 'error',
      message: 'AI 暂时不可用，请稍后重试'
    })

    expect(state.steps).toHaveLength(1)
    expect(state.error).toBe('AI 暂时不可用，请稍后重试')
  })
})

describe('streamIngredientAgent · 实时渲染', () => {
  it('step_start 一到达 onState 就给出 running，不等 step_end', async () => {
    const encoder = new TextEncoder()
    let push!: (chunk: string) => void
    let close!: () => void
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (chunk) => controller.enqueue(encoder.encode(chunk))
        close = () => controller.close()
      }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 }))
    )

    const states: AgentStreamState[] = []
    const pending = streamIngredientAgent(
      { text: '帮我加西洋菜' },
      { onState: (next) => states.push(next) }
    )

    push(
      'data: {"type":"step_start","index":1,"name":"searchLocalNutrition","summary":"查本地库 西洋菜·生"}\n\n'
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    const latest = states[states.length - 1]
    expect(latest?.steps).toHaveLength(1)
    expect(latest?.steps[0]).toMatchObject({
      index: 1,
      status: 'running',
      label: '查本地库'
    })

    push(
      'data: {"type":"step_end","index":1,"ok":true,"found":true,"resultSummary":"命中 1 条"}\n\n'
    )
    push(
      'data: {"type":"reply","reply":"已找到。","draftId":"draft-1","steps":2,"toolCallCount":1}\n\n'
    )
    push('data: {"type":"done"}\n\n')
    close()

    const final = await pending
    expect(final.steps[0]?.status).toBe('success')
    expect(final.reply).toBe('已找到。')
  })
})

describe('streamIngredientAgent · 网络中断', () => {
  it('读到一半断网时，已收到的步骤仍留在 state 里，并给出明确提示', async () => {
    const encoder = new TextEncoder()
    let scheduled = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"step_start","index":1,"name":"searchLocalNutrition","summary":"查本地库 西洋菜·生"}\n\n'
          )
        )
      },
      pull(controller) {
        if (scheduled) return
        scheduled = true
        // 让第一条帧先被读走，再模拟连接断开。
        setTimeout(() => controller.error(new Error('network down')), 0)
      }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 }))
    )

    const snapshots: number[] = []
    const state = await streamIngredientAgent(
      { text: '帮我加西洋菜' },
      {
        onState: (next) => snapshots.push(next.steps.length)
      }
    )

    expect(snapshots).toContain(1)
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0]).toMatchObject({
      index: 1,
      status: 'running'
    })
    expect(state.error).toContain('已保留收到的 1 个步骤')
  })

  it('HTTP 失败时返回可读错误，不抛异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"message":"登录已过期，请重新登录"}', { status: 401 })
      )
    )

    const state = await streamIngredientAgent({ text: '鸡肝' })

    expect(state.error).toContain('登录已过期')
    expect(state.steps).toEqual([])
  })
})

describe('ask 事件 · 先问人再动手', () => {
  const QUESTION = '牛肉用哪个部位？'
  const OPTIONS = ['牛腩', '牛腱子', '牛里脊']

  it('收到 ask 事件后记住问题、选项与当前 draftId', () => {
    const state = reduceAgentEvents(createAgentStreamState(), {
      type: 'ask',
      question: QUESTION,
      options: OPTIONS,
      draftId: 'draft-beef'
    })

    expect(state.pendingQuestion).toEqual({
      question: QUESTION,
      options: OPTIONS
    })
    expect(state.draftId).toBe('draft-beef')
    expect(state.done).toBe(false)
  })

  it('ask 之后紧接着 done：不算「没有最终回复」的断流错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'ask',
                  question: QUESTION,
                  options: OPTIONS,
                  draftId: 'draft-beef'
                })}\n\n`
              )
            )
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'))
            controller.close()
          }
        })
        return new Response(body, { status: 200 })
      })
    )

    const state = await streamIngredientAgent({
      draftId: 'draft-beef',
      text: '牛肉'
    })

    expect(state.pendingQuestion).toEqual({
      question: QUESTION,
      options: OPTIONS
    })
    expect(state.draftId).toBe('draft-beef')
    expect(state.done).toBe(true)
    expect(state.error).toBeNull()
  })

  it('点选项 = 用当前 draftId 把选项文本发出去', async () => {
    let state = reduceAgentEvents(createAgentStreamState(), {
      type: 'ask',
      question: QUESTION,
      options: OPTIONS,
      draftId: 'draft-beef'
    })

    const input = answerInputFromPendingQuestion(state, '牛腱子')
    expect(input).toEqual({ draftId: 'draft-beef', text: '牛腱子' })
    // 不在选项里的文本不能冒充点击；没有待答问题时返回 null。
    expect(answerInputFromPendingQuestion(state, '牛尾')).toBeNull()
    expect(
      answerInputFromPendingQuestion(createAgentStreamState(), '牛腩')
    ).toBeNull()

    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response('data: {"type":"done"}\n\n', { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    await streamIngredientAgent(input!)

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    const init = call?.[1]
    expect(JSON.parse(String(init?.body))).toEqual({
      draftId: 'draft-beef',
      text: '牛腱子'
    })

    state = reduceAgentEvents(state, { type: 'done' })
    expect(state.pendingQuestion).not.toBeNull()
  })

  it('非流式路径：草稿 payload 里的 pendingQuestion 也能还原成问题与选项', () => {
    expect(
      readPendingQuestion({
        question: QUESTION,
        options: OPTIONS,
        askedAt: '2026-10-24T12:00:00.000Z'
      })
    ).toEqual({ question: QUESTION, options: OPTIONS })

    expect(readPendingQuestion(null)).toBeNull()
    expect(readPendingQuestion({ question: '   ' })).toBeNull()
  })
})

describe('ask 事件 · 选项库内核实标记', () => {
  const QUESTION = '山药你指的是哪一种？'
  const OPTIONS = ['铁棍山药', '菜山药', '毛山药']
  const CHECKS: AgentPendingQuestionOption[] = [
    {
      label: '铁棍山药',
      inLibrary: true,
      matchedName: 'Yam, raw',
      displayLabel: '铁棍山药'
    },
    {
      label: '菜山药',
      inLibrary: false,
      matchedName: null,
      displayLabel: '菜山药（库里未收录，选了会去线上找）'
    },
    {
      label: '毛山药',
      inLibrary: null,
      matchedName: null,
      displayLabel: '毛山药'
    }
  ]

  it('ask 事件保留字符串选项，并附带同序的 inLibrary 标记', () => {
    const state = reduceAgentEvents(createAgentStreamState(), {
      type: 'ask',
      question: QUESTION,
      options: OPTIONS,
      optionChecks: CHECKS,
      draftId: 'draft-yam'
    })

    expect(state.pendingQuestion?.options).toEqual(OPTIONS)
    expect(state.pendingQuestion?.optionChecks).toEqual(CHECKS)
    expect(state.draftId).toBe('draft-yam')
  })

  it('已收录 / 未收录两种标签不同，核实失败显示未核实', () => {
    expect(pendingOptionBadge(CHECKS[0])).toEqual({
      label: '库里已收录',
      type: 'success'
    })
    expect(pendingOptionBadge(CHECKS[1])).toEqual({
      label: '未收录',
      type: 'warning'
    })
    expect(pendingOptionBadge(CHECKS[2])).toEqual({
      label: '未核实',
      type: 'info'
    })
    expect(pendingOptionBadge(undefined)).toBeNull()
  })

  it('点击未收录选项仍发送原始 label，不把展示后缀当答案', () => {
    const state = reduceAgentEvents(createAgentStreamState(), {
      type: 'ask',
      question: QUESTION,
      options: OPTIONS,
      optionChecks: CHECKS,
      draftId: 'draft-yam'
    })

    expect(answerInputFromPendingQuestion(state, '菜山药')).toEqual({
      draftId: 'draft-yam',
      text: '菜山药'
    })
  })

  it('草稿里缺少 displayLabel 时，未收录选项自动补“会去线上找”的后缀', () => {
    const parsed = readPendingQuestion({
      question: QUESTION,
      options: ['菜山药', '铁棍山药'],
      optionChecks: [
        { label: '菜山药', inLibrary: false, matchedName: null },
        { label: '铁棍山药', inLibrary: true, matchedName: 'Yam, raw' }
      ],
      askedAt: '2026-10-24T12:00:00.000Z'
    })

    expect(parsed?.optionChecks?.[0]?.displayLabel).toBe(
      '菜山药（库里未收录，选了会去线上找）'
    )
    expect(parsed?.optionChecks?.[1]?.displayLabel).toBe('铁棍山药')
  })

  it('旧草稿没有 optionChecks 时保持原样，不凭空造标记', () => {
    const parsed = readPendingQuestion({
      question: QUESTION,
      options: OPTIONS,
      askedAt: '2026-10-24T12:00:00.000Z'
    })

    expect(parsed).toEqual({ question: QUESTION, options: OPTIONS })
  })
})
