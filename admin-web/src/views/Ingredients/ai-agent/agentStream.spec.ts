import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  answerInputFromPendingQuestion,
  askOptionAiBadge,
  buildAgentReportSummary,
  createAgentStreamState,
  formatAgentDuration,
  formatAgentTokenCount,
  parseSseChunk,
  pendingOptionBadge,
  readPendingQuestion,
  reduceAgentEvents,
  streamIngredientAgent,
  type AgentPendingQuestionOption,
  type AgentRunReport,
  type AgentStreamEvent,
  type AgentStreamState
} from './agentStream'

function stepStart(index = 1): AgentStreamEvent {
  return {
    type: 'step_start',
    index,
    name: 'searchNames',
    summary: '查名字 西洋菜'
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
    ...(overrides.totalCandidates === undefined
      ? {}
      : { totalCandidates: overrides.totalCandidates }),
    ...(overrides.groups === undefined ? {} : { groups: overrides.groups }),
    ...(overrides.reviewSummary === undefined
      ? {}
      : { reviewSummary: overrides.reviewSummary }),
    ...(overrides.matches === undefined ? {} : { matches: overrides.matches }),
    ...(overrides.record === undefined ? {} : { record: overrides.record }),
    ...(overrides.durationMs === undefined
      ? {}
      : { durationMs: overrides.durationMs })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSseChunk', () => {
  it('只消费完整帧，半帧留在 rest 里', () => {
    const buffer =
      'data: {"type":"step_start","index":1,"name":"searchNames","summary":"查名字 西洋菜"}\n\n' +
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

describe('reduceAgentEvents · 检索方案', () => {
  it('收到 plan 事件 → 记下待确认方案与草稿号', () => {
    const state = reduceAgentEvents(createAgentStreamState(), {
      type: 'plan',
      draftId: 'draft-1',
      plan: {
        status: 'PENDING',
        keywords: [{ term: '鸡蛋清', language: 'zh' }],
        libraries: ['CFCT', 'USDA'],
        findings: 'CFCT 0 条',
        candidates: [
          { recordId: 'rec-1', name: 'Egg, white, raw', sourceType: 'USDA', state: 'RAW' }
        ],
        chosenRecordId: null,
        chosenRecordName: null,
        rationale: '',
        proposedAt: '2026-10-29T00:00:00.000Z',
        approvedAt: null,
        approvedBy: null,
        editedByUser: false
      }
    })

    expect(state.pendingPlan).toMatchObject({
      status: 'PENDING',
      libraries: ['CFCT', 'USDA']
    })
    expect(state.pendingPlan?.candidates).toEqual([
      { recordId: 'rec-1', name: 'Egg, white, raw', sourceType: 'USDA', state: 'RAW' }
    ])
    expect(state.draftId).toBe('draft-1')
    expect(state.done).toBe(false)
  })

  it('没有 plan 事件时 pendingPlan 为 null', () => {
    expect(createAgentStreamState().pendingPlan).toBeNull()
  })
})

describe('reduceAgentEvents', () => {
  it('step_start 后立即进入「执行中」，带上中文工具名与摘要', () => {
    const state = reduceAgentEvents(createAgentStreamState(), stepStart())

    expect(state.steps).toHaveLength(1)
    expect(state.steps[0]).toMatchObject({
      index: 1,
      name: 'searchNames',
      label: '查名字',
      summary: '查名字 西洋菜',
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

  it('step_end.matches 带 review 时，查库展开数据逐条带 AI 判断与理由', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(
      state,
      stepEnd(1, {
        found: true,
        resultSummary: '命中 2 条',
        keywords: ['山药', 'yam'],
        candidateCount: 2,
        matches: [
          {
            name: 'Yam, raw',
            matchedBy: 'EN_PARTIAL',
            matchedKeyword: 'yam',
            score: 0.9,
            review: { verdict: 'RELEVANT', reason: '就是山药' }
          },
          {
            name: 'Yambean (jicama), raw',
            matchedBy: 'EN_PARTIAL',
            matchedKeyword: 'yam',
            score: 0.8,
            review: { verdict: 'IRRELEVANT', reason: '凉薯，不是山药' }
          }
        ]
      })
    )

    expect(state.steps[0]?.search?.matches).toHaveLength(2)
    expect(state.steps[0]?.search?.matches[0]).toMatchObject({
      foodName: 'Yam, raw',
      aiVerdict: 'RELEVANT',
      aiVerdictLabel: '相关',
      aiVerdictTagType: 'success',
      aiReason: '就是山药'
    })
    expect(state.steps[0]?.search?.matches[1]).toMatchObject({
      foodName: 'Yambean (jicama), raw',
      aiVerdict: 'IRRELEVANT',
      aiVerdictLabel: '不相关',
      aiVerdictTagType: 'danger',
      aiReason: '凉薯，不是山药'
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

  it('读来源记录的 step_end 带 record 摘要（词条名 / 来源库 / 覆盖率 / 项数）', () => {
    let state = reduceAgentEvents(createAgentStreamState(), {
      type: 'step_start',
      index: 2,
      name: 'getRecord',
      summary: '读来源记录'
    })
    state = reduceAgentEvents(
      state,
      stepEnd(2, {
        resultSummary: '读到 12 项营养值',
        record: {
          name: 'Chicken, liver, raw',
          sourceType: 'USDA',
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
      sourceType: 'USDA',
      coverage: 82,
      coverageLabel: '82%',
      valueCount: 12,
      message:
        '来源记录「Chicken, liver, raw」· USDA · 覆盖率 82% · 读到 12 项'
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

  it('reply 携带 report：记录完整报告，摘要显示工具数 / 耗时 / token', () => {
    const report: AgentRunReport = {
      runId: 'run-1',
      draftId: 'draft-1',
      text: '鸡肝',
      steps: 7,
      toolCalls: 12,
      tokensIn: 18_000,
      tokensOut: 6_000,
      durationMs: 38_000,
      stopReason: null,
      tools: ['searchNames', 'finish'],
      failedTools: [],
      result: 'FINISHED'
    }
    let state = reduceAgentEvents(createAgentStreamState(), {
      type: 'reply',
      reply: '已填好，请审核。',
      draftId: 'draft-1',
      steps: 7,
      toolCallCount: 12,
      report
    })

    expect(state.report).toEqual(report)
    expect(buildAgentReportSummary(state.report)).toBe(
      '12 次工具 · 38s · 24k tokens'
    )
  })

  it('report 字段不合法时不记录，页面保持旧行为', () => {
    const state = reduceAgentEvents(createAgentStreamState(), {
      type: 'reply',
      reply: '好了。',
      draftId: 'draft-1',
      steps: 1,
      toolCallCount: 0,
      report: { runId: 'broken' }
    })

    expect(state.report).toBeNull()
    expect(buildAgentReportSummary(state.report)).toBe('')
  })

  it('step_end 的 durationMs 落到步骤上，展开能看到每个工具耗时', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(state, stepEnd(1, { durationMs: 1_500 }))

    expect(state.steps[0]?.durationMs).toBe(1_500)
  })

  it('耗时与 token 的展示格式：秒 / 分秒、千位缩写', () => {
    expect(formatAgentDuration(38_000)).toBe('38s')
    expect(formatAgentDuration(1_500)).toBe('2s')
    expect(formatAgentDuration(65_000)).toBe('1m5s')
    expect(formatAgentDuration(120_000)).toBe('2m')
    expect(formatAgentTokenCount(24_000)).toBe('24k')
    expect(formatAgentTokenCount(1_500)).toBe('1.5k')
    expect(formatAgentTokenCount(999)).toBe('999')
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
      'data: {"type":"step_start","index":1,"name":"searchNames","summary":"查名字 西洋菜"}\n\n'
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    const latest = states[states.length - 1]
    expect(latest?.steps).toHaveLength(1)
    expect(latest?.steps[0]).toMatchObject({
      index: 1,
      status: 'running',
      label: '查名字'
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
            'data: {"type":"step_start","index":1,"name":"searchNames","summary":"查名字 西洋菜"}\n\n'
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

  it('ask 选项带 AI 判断：候选名 / 标签 / 理由可结构化展示', () => {
    const checks: AgentPendingQuestionOption[] = [
      {
        label: 'Yam, raw —— 相关：就是山药',
        candidateLabel: 'Yam, raw',
        aiVerdict: 'RELEVANT',
        aiReason: '就是山药',
        inLibrary: true,
        matchedName: 'Yam, raw',
        displayLabel: 'Yam, raw'
      },
      {
        label: 'Yambean (jicama) —— 不相关：凉薯',
        candidateLabel: 'Yambean (jicama)',
        aiVerdict: 'IRRELEVANT',
        aiReason: '凉薯',
        inLibrary: true,
        matchedName: 'Yambean (jicama), raw',
        displayLabel: 'Yambean (jicama)'
      },
      {
        label: 'Celery —— 存疑：不确定',
        candidateLabel: 'Celery',
        aiVerdict: 'UNCERTAIN',
        aiReason: '不确定',
        inLibrary: true,
        matchedName: 'Celery, raw',
        displayLabel: 'Celery'
      }
    ]

    const state = reduceAgentEvents(createAgentStreamState(), {
      type: 'ask',
      question: QUESTION,
      options: checks.map((check) => check.label),
      optionChecks: checks,
      draftId: 'draft-yam'
    })

    expect(state.pendingQuestion?.optionChecks).toEqual(checks)
    expect(askOptionAiBadge(checks[0])).toEqual({
      label: '相关',
      type: 'success',
      reason: '就是山药'
    })
    expect(askOptionAiBadge(checks[1])).toEqual({
      label: '不相关',
      type: 'danger',
      reason: '凉薯'
    })
    expect(askOptionAiBadge(checks[2])).toEqual({
      label: '存疑',
      type: 'warning',
      reason: '不确定'
    })
    // 普通部位 / 加工问题没有 AI 判断，不显示标签。
    expect(askOptionAiBadge(CHECKS[0])).toBeNull()
  })

  it('旧草稿只有「候选名 —— 相关：理由」文案时，从文案里还原 AI 判断', () => {
    const parsed = readPendingQuestion({
      question: QUESTION,
      options: [
        'Yam, raw —— 相关：就是山药',
        'Yambean (jicama) —— 不相关：凉薯'
      ],
      optionChecks: [
        {
          label: 'Yam, raw —— 相关：就是山药',
          inLibrary: true,
          matchedName: 'Yam, raw'
        },
        {
          label: 'Yambean (jicama) —— 不相关：凉薯',
          inLibrary: true,
          matchedName: 'Yambean (jicama), raw'
        }
      ],
      askedAt: '2026-10-24T12:00:00.000Z'
    })

    expect(parsed?.optionChecks?.[0]).toMatchObject({
      candidateLabel: 'Yam, raw',
      aiVerdict: 'RELEVANT',
      aiReason: '就是山药',
      displayLabel: 'Yam, raw'
    })
    expect(parsed?.optionChecks?.[1]).toMatchObject({
      candidateLabel: 'Yambean (jicama)',
      aiVerdict: 'IRRELEVANT',
      aiReason: '凉薯',
      displayLabel: 'Yambean (jicama)'
    })
    expect(askOptionAiBadge(parsed?.optionChecks?.[0])).toEqual({
      label: '相关',
      type: 'success',
      reason: '就是山药'
    })
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

describe('候选先收窄 · 分组概览与选项类型', () => {
  it('step_end 带 groups / totalCandidates / reviewSummary 时落进 search 展开数据', () => {
    let state = reduceAgentEvents(createAgentStreamState(), stepStart())
    state = reduceAgentEvents(
      state,
      stepEnd(1, {
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
        groups: [
          { key: 'ground', label: '牛绞肉', count: 6, states: ['RAW'] },
          { key: 'tenderloin', label: '牛里脊', count: 3, states: ['RAW'] }
        ]
      })
    )

    expect(state.steps[0]?.search?.groups).toHaveLength(2)
    expect(state.steps[0]?.search?.groups[0]).toMatchObject({
      key: 'ground',
      label: '牛绞肉',
      count: 6,
      labelWithCount: '牛绞肉（6 条）',
      stateLabel: '生'
    })
    expect(state.steps[0]?.search?.message).toBe('共 50 条候选 · 11 条相关')
  })

  it('收窄问题 5 个分组 + 兜底共 6 个选项：全部保留，不截成 5 个', () => {
    const options = [
      '牛绞肉（6 条）',
      '牛里脊（3 条）',
      '牛腩（2 条）',
      '牛腱（1 条）',
      '牛肋排（1 条）',
      '都不对，我直接说'
    ]
    const pending = readPendingQuestion({
      question: '牛肉有 13 条相关，先按部位收窄：',
      options,
      optionChecks: [
        {
          label: options[0],
          kind: 'GROUP',
          inLibrary: null,
          matchedName: null,
          displayLabel: options[0]
        },
        {
          label: options[1],
          kind: 'GROUP',
          inLibrary: null,
          matchedName: null,
          displayLabel: options[1]
        },
        {
          label: options[2],
          kind: 'GROUP',
          inLibrary: null,
          matchedName: null,
          displayLabel: options[2]
        },
        {
          label: options[3],
          kind: 'GROUP',
          inLibrary: null,
          matchedName: null,
          displayLabel: options[3]
        },
        {
          label: options[4],
          kind: 'GROUP',
          inLibrary: null,
          matchedName: null,
          displayLabel: options[4]
        },
        {
          label: options[5],
          kind: 'FREE',
          inLibrary: null,
          matchedName: null,
          displayLabel: options[5]
        }
      ]
    })

    expect(pending?.options).toEqual(options)
    expect(pending?.optionChecks).toHaveLength(6)
    expect(pending?.optionChecks?.[0]?.kind).toBe('GROUP')
    expect(pending?.optionChecks?.[5]?.kind).toBe('FREE')
    expect(pending?.optionChecks?.[5]?.displayLabel).toBe('都不对，我直接说')
  })

  it('分组 / 生熟 / 兜底选项不显示「未收录」或「未核实」小标', () => {
    expect(
      pendingOptionBadge({
        label: '牛绞肉（6 条）',
        kind: 'GROUP',
        inLibrary: null,
        matchedName: null,
        displayLabel: '牛绞肉（6 条）'
      })
    ).toEqual({ label: '分组', type: 'info' })
    expect(
      pendingOptionBadge({
        label: '生（查生档案）',
        kind: 'STATE',
        inLibrary: null,
        matchedName: null,
        displayLabel: '生（查生档案）'
      })
    ).toEqual({ label: '生熟', type: 'info' })
    expect(
      pendingOptionBadge({
        label: '都不对，我直接说',
        kind: 'FREE',
        inLibrary: null,
        matchedName: null,
        displayLabel: '都不对，我直接说'
      })
    ).toBeNull()
    // 旧草稿没有 kind：维持原来的「未核实」。
    expect(
      pendingOptionBadge({
        label: '铁棍山药',
        inLibrary: null,
        matchedName: null,
        displayLabel: '铁棍山药'
      })
    ).toEqual({ label: '未核实', type: 'info' })
  })

  it('刷新恢复旧草稿时从文案识别兜底选项', () => {
    const pending = readPendingQuestion({
      question: '这一组 3 条，请选一条：',
      options: ['Yam, raw', 'Yam, cooked', '都不对，我直接说'],
      optionChecks: [
        {
          label: 'Yam, raw',
          inLibrary: true,
          matchedName: 'Yam, raw',
          displayLabel: 'Yam, raw'
        },
        {
          label: 'Yam, cooked',
          inLibrary: true,
          matchedName: 'Yam, cooked',
          displayLabel: 'Yam, cooked'
        }
      ]
    })

    expect(pending?.optionChecks?.[2]).toMatchObject({
      label: '都不对，我直接说',
      kind: 'FREE',
      displayLabel: '都不对，我直接说'
    })
  })
  it('状态收窄选项显示真实条数，「生 + 熟都要」是一个合法选项；词条选项保留 AI 分类', () => {
    const options = ['生（4 条）', '熟（2 条）', '生 + 熟都要（6 条）']
    const pending = readPendingQuestion({
      question: '「牛肉」共 6 条：生 4 条、熟 2 条；要哪些状态？',
      options,
      optionChecks: options.map((label) => ({
        label,
        kind: 'STATE',
        inLibrary: null,
        matchedName: null,
        displayLabel: label
      }))
    })

    expect(pending?.options).toEqual(options)
    expect(pending?.optionChecks?.map((option) => option.kind)).toEqual([
      'STATE',
      'STATE',
      'STATE'
    ])
    expect(pending?.optionChecks?.[2]?.displayLabel).toBe('生 + 熟都要（6 条）')

    const entry = readPendingQuestion({
      question: '绞肉这一组共 2 条，请选一条：',
      options: [
        'Beef, ground, raw · 来源 USDA_FDC · 覆盖率 80% · 相关：就是牛肉',
        '都不对，我直接说'
      ],
      optionChecks: [
        {
          label:
            'Beef, ground, raw · 来源 USDA_FDC · 覆盖率 80% · 相关：就是牛肉',
          kind: undefined,
          inLibrary: true,
          matchedName: 'Beef, ground, raw',
          displayLabel:
            'Beef, ground, raw · 来源 USDA_FDC · 覆盖率 80% · 相关：就是牛肉',
          classification: {
            state: 'RAW',
            method: 'NONE',
            cutLabel: '牛绞肉',
            cutGroup: 'ground',
            evidence: 'ground'
          }
        },
        {
          label: '都不对，我直接说',
          kind: 'FREE',
          inLibrary: null,
          matchedName: null,
          displayLabel: '都不对，我直接说'
        }
      ]
    })

    expect(entry?.optionChecks?.[0]?.classification).toEqual({
      state: 'RAW',
      method: 'NONE',
      cutLabel: '牛绞肉',
      cutGroup: 'ground',
      evidence: 'ground'
    })
  })

})
