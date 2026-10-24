import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentStreamState,
  parseSseChunk,
  reduceAgentEvents,
  streamIngredientAgent,
  type AgentStreamEvent
} from './agentStream'

function stepStart(index = 1): AgentStreamEvent {
  return {
    type: 'step_start',
    index,
    name: 'searchLocalNutrition',
    summary: '查本地库 西洋菜·生'
  }
}

function stepEnd(
  index = 1,
  overrides: Partial<{
    ok: boolean
    found: boolean
    resultSummary: string
    error: string
  }> = {}
): AgentStreamEvent {
  return {
    type: 'step_end',
    index,
    ok: overrides.ok ?? true,
    resultSummary: overrides.resultSummary ?? '命中 1 条',
    ...(overrides.found === undefined ? {} : { found: overrides.found }),
    ...(overrides.error === undefined ? {} : { error: overrides.error })
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
