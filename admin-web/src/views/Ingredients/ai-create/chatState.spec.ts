import { describe, expect, it, vi } from 'vitest'
import type {
  IntakeClassification,
  IntakeCurrentIngredient,
  IntakeHistoryTurn
} from '@/types/ingredientCreation'
import {
  ERROR_FALLBACK,
  INTAKE_HISTORY_LIMIT,
  WELCOME_TEXT,
  createIntakeChat,
  resolveChatErrorMessage
} from './chatState'

function classification(
  overrides: Partial<IntakeClassification> = {}
): IntakeClassification {
  return {
    kind: 'FOOD',
    reply: '我判断这是食材。',
    suggestions: [],
    intent: 'NEW',
    resolvedText: null,
    ...overrides
  }
}

/** 声明完整入参，`mock.calls` 才会带 history / current 的元组类型。 */
type ClassifyMock = (
  text: string,
  history?: IntakeHistoryTurn[],
  current?: IntakeCurrentIngredient
) => Promise<IntakeClassification>

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function lastMessage(chat: ReturnType<typeof createIntakeChat>) {
  return chat.state.messages[chat.state.messages.length - 1]
}

/**
 * 第一步对话的状态逻辑。
 *
 * 页面没有组件挂载环境，所以把「追加消息 / 建议项等价发送 / 错误气泡 /
 * 发送中单飞 / 纠正上下文」都收在 chatState.ts 里，这里直接驱动控制器。
 */
describe('AI 添加原料 · 判断食材还是补剂的对话状态', () => {
  it('追加消息：进入页面先固定问一句，发送后按「我 → AI」追加气泡', async () => {
    const classify = vi.fn<ClassifyMock>(async () =>
      classification({ suggestions: ['牛里脊'] })
    )
    const chat = createIntakeChat(classify)

    expect(chat.state.messages).toHaveLength(1)
    expect(chat.state.messages[0]?.role).toBe('ai')
    expect(chat.state.messages[0]?.text).toBe(WELCOME_TEXT)
    expect(chat.state.kind).toBe('UNKNOWN')
    expect(chat.state.current).toBeNull()

    await chat.send('  牛肉  ')

    expect(classify).toHaveBeenCalledTimes(1)
    // 当前这句单独走 text，不重复塞进 history；首轮只有开场白。
    expect(classify.mock.calls[0]?.[0]).toBe('牛肉')
    expect(classify.mock.calls[0]?.[1]).toEqual([
      { role: 'assistant', content: WELCOME_TEXT }
    ])
    // 还没判出过原料，不带 current。
    expect(classify.mock.calls[0]?.[2]).toBeUndefined()

    expect(chat.state.messages.map((message) => message.role)).toEqual([
      'ai',
      'me',
      'ai'
    ])
    expect(chat.state.messages[1]?.text).toBe('牛肉')
    expect(chat.state.messages[2]?.text).toBe('我判断这是食材。')
    expect(chat.state.messages[2]?.suggestions).toEqual(['牛里脊'])
    expect(chat.state.kind).toBe('FOOD')
    expect(chat.state.judgedText).toBe('牛肉')
    expect(chat.state.current).toEqual({ text: '牛肉', kind: 'FOOD' })
    expect(chat.state.correctingText).toBeNull()
  })

  it('建议项点击等价于发送：点击文本就是下一次请求的输入', async () => {
    const classify = vi.fn<ClassifyMock>(async (text) =>
      text === '牛肉'
        ? classification({
            reply: '「牛肉」没说明部位，选一个。',
            suggestions: ['牛里脊', '牛腩']
          })
        : classification({ reply: '好，按牛里脊记。' })
    )
    const chat = createIntakeChat(classify)

    await chat.send('牛肉')
    await chat.pickSuggestion('牛里脊')

    expect(classify).toHaveBeenCalledTimes(2)
    expect(classify.mock.calls[1]?.[0]).toBe('牛里脊')
    // 上一轮已经判出 FOOD，纠正时把原原料一起带上。
    expect(classify.mock.calls[1]?.[2]).toEqual({
      text: '牛肉',
      kind: 'FOOD'
    })
    expect(
      chat.state.messages
        .filter((message) => message.role === 'me')
        .map((message) => message.text)
    ).toEqual(['牛肉', '牛里脊'])
    expect(lastMessage(chat)?.text).toBe('好，按牛里脊记。')
  })

  it('错误消息展示：后端中文提示原样变成一条 AI 气泡，不把类型改掉', async () => {
    const classify = vi.fn<ClassifyMock>(async () => {
      throw {
        response: {
          status: 503,
          data: { message: 'AI 未启用，请联系管理员在 Agent 设置里开启。' }
        }
      }
    })
    const chat = createIntakeChat(classify)

    const succeeded = await chat.send('牛肉')

    expect(succeeded).toBe(false)
    const last = lastMessage(chat)
    expect(last?.role).toBe('ai')
    expect(last?.tone).toBe('error')
    expect(last?.text).toBe('AI 未启用，请联系管理员在 Agent 设置里开启。')
    expect(chat.state.kind).toBe('UNKNOWN')
    expect(chat.state.failedText).toBe('牛肉')
    expect(chat.state.sending).toBe(false)
  })

  it('判断失败时右侧不再保留上一条原料的判断结果', async () => {
    let attempts = 0
    const classify = vi.fn<ClassifyMock>(async () => {
      attempts += 1
      if (attempts === 1) return classification()
      throw {
        response: {
          status: 503,
          data: { message: 'AI 暂时不可用，请稍后重试。' }
        }
      }
    })
    const chat = createIntakeChat(classify)

    await chat.send('牛肉')
    expect(chat.state.kind).toBe('FOOD')

    await chat.send('故障')

    expect(chat.state.kind).toBe('UNKNOWN')
    expect(chat.state.judgedText).toBe('')
    expect(chat.state.failedText).toBe('故障')
    // 失败不抹掉上一次真正判出的原料，重试 / 下一句纠正还要用。
    expect(chat.state.current).toEqual({ text: '牛肉', kind: 'FOOD' })
  })

  it('错误兜底：断网 / 超时这类没有业务原因的失败，显示统一中文提示', async () => {
    const classify = vi.fn<ClassifyMock>(async () => {
      throw new Error('Network Error')
    })
    const chat = createIntakeChat(classify)

    await chat.send('锌')

    expect(lastMessage(chat)?.tone).toBe('error')
    expect(lastMessage(chat)?.text).toBe(ERROR_FALLBACK)
    expect(resolveChatErrorMessage({ response: { data: { message: 'AI 已停用' } } }))
      .toBe('AI 已停用')
    expect(
      resolveChatErrorMessage({
        response: {
          data: {
            message: 'Cannot POST /api/v1/admin/ingredient-creation/intake/classify'
          }
        }
      })
    ).toBe(ERROR_FALLBACK)
  })

  it('重试只重发失败的那句，不重复追加「我」的气泡', async () => {
    let attempts = 0
    const classify = vi.fn<ClassifyMock>(async () => {
      attempts += 1
      if (attempts === 1) {
        throw {
          response: {
            status: 503,
            data: { message: 'AI 暂时不可用，请稍后重试。' }
          }
        }
      }
      return classification({ kind: 'SUPPLEMENT', reply: '我判断这是补剂。' })
    })
    const chat = createIntakeChat(classify)

    await chat.send('葡萄糖酸锌')
    expect(chat.state.failedText).toBe('葡萄糖酸锌')

    await chat.retry()

    expect(classify).toHaveBeenCalledTimes(2)
    expect(classify.mock.calls[1]?.[0]).toBe('葡萄糖酸锌')
    // 重试沿用失败那次的历史快照，不把失败句再塞进 history。
    expect(classify.mock.calls[1]?.[1]).toEqual(
      classify.mock.calls[0]?.[1]
    )
    expect(
      chat.state.messages.filter((message) => message.role === 'me')
    ).toHaveLength(1)
    expect(chat.state.kind).toBe('SUPPLEMENT')
    expect(chat.state.failedText).toBeNull()
    expect(chat.state.current).toEqual({
      text: '葡萄糖酸锌',
      kind: 'SUPPLEMENT'
    })
  })

  it('发送中禁止重复发送：发送按钮、建议项都不会再发第二次请求', async () => {
    const gate = deferred<IntakeClassification>()
    const classify = vi.fn<ClassifyMock>(() => gate.promise)
    const chat = createIntakeChat(classify)

    const pending = chat.send('牛肉')

    expect(chat.state.sending).toBe(true)
    expect(chat.canSend.value).toBe(false)
    expect(await chat.send('锌')).toBe(false)
    expect(await chat.pickSuggestion('牛里脊')).toBe(false)
    expect(classify).toHaveBeenCalledTimes(1)
    expect(
      chat.state.messages.filter((message) => message.role === 'me')
    ).toHaveLength(1)

    gate.resolve(classification())
    await pending

    expect(chat.state.sending).toBe(false)
    expect(chat.canSend.value).toBe(true)
    expect(chat.state.kind).toBe('FOOD')
  })

  it('空输入不发送、不产生气泡', async () => {
    const classify = vi.fn<ClassifyMock>(async () => classification())
    const chat = createIntakeChat(classify)

    expect(await chat.send('   ')).toBe(false)

    expect(classify).not.toHaveBeenCalled()
    expect(chat.state.messages).toHaveLength(1)
  })

  it('UNKNOWN 时保留追问和建议，右侧仍按「待判断」处理', async () => {
    const classify = vi.fn<ClassifyMock>(async () =>
      classification({
        kind: 'UNKNOWN',
        reply: '这个词我不确定指什么，能补充一下形态吗？',
        suggestions: ['葡萄糖酸锌', '牛里脊']
      })
    )
    const chat = createIntakeChat(classify)

    await chat.send('锌')

    expect(chat.state.kind).toBe('UNKNOWN')
    expect(chat.state.current).toBeNull()
    expect(lastMessage(chat)?.text).toBe(
      '这个词我不确定指什么，能补充一下形态吗？'
    )
    expect(lastMessage(chat)?.suggestions).toEqual(['葡萄糖酸锌', '牛里脊'])
  })

  it('history 只带最近 6 条，角色映射为 user / assistant', async () => {
    let round = 0
    const classify = vi.fn<ClassifyMock>(async () => {
      round += 1
      return classification({ reply: `回复${round}` })
    })
    const chat = createIntakeChat(classify)

    await chat.send('牛肉')
    await chat.send('牛里脊')
    await chat.send('牛腩')
    await chat.send('锌')

    expect(classify).toHaveBeenCalledTimes(4)
    expect(classify.mock.calls[0]?.[1]).toEqual([
      { role: 'assistant', content: WELCOME_TEXT }
    ])

    const history = classify.mock.calls[3]?.[1]
    // 发送第 4 句前已有 7 条消息（开场白 + 3 轮问答），只取最近 6 条。
    expect(history).toHaveLength(INTAKE_HISTORY_LIMIT)
    expect(history).toEqual([
      { role: 'user', content: '牛肉' },
      { role: 'assistant', content: '回复1' },
      { role: 'user', content: '牛里脊' },
      { role: 'assistant', content: '回复2' },
      { role: 'user', content: '牛腩' },
      { role: 'assistant', content: '回复3' }
    ])
    // 只发 role / content，不带页面气泡的 id、tone、suggestions。
    for (const turn of history ?? []) {
      expect(Object.keys(turn).sort()).toEqual(['content', 'role'])
    }
  })

  it('current 只在有判定后带上，且用判出的原料名与类型', async () => {
    const classify = vi.fn<ClassifyMock>(async (text) => {
      if (text === '我想加牛肉') {
        return classification({
          kind: 'FOOD',
          resolvedText: '牛肉',
          reply: '这是食材。'
        })
      }
      return classification({
        kind: 'SUPPLEMENT',
        intent: 'CORRECTION',
        resolvedText: '葡萄糖酸锌',
        reply: '这是补剂。'
      })
    })
    const chat = createIntakeChat(classify)

    await chat.send('我想加牛肉')
    expect(classify.mock.calls[0]?.[2]).toBeUndefined()

    await chat.send('其实我要补锌')

    expect(classify.mock.calls[1]?.[2]).toEqual({ text: '牛肉', kind: 'FOOD' })
    // 右侧以 kind + resolvedText 为准，不直接展示用户原话。
    expect(chat.state.kind).toBe('SUPPLEMENT')
    expect(chat.state.judgedText).toBe('葡萄糖酸锌')
    expect(chat.state.current).toEqual({
      text: '葡萄糖酸锌',
      kind: 'SUPPLEMENT'
    })
    expect(chat.state.correctingText).toBeNull()
  })

  it('CORRECTION 判为 UNKNOWN 时右侧保留原原料，并显示正在纠正', async () => {
    const classify = vi.fn<ClassifyMock>(async (text) => {
      if (text === '牛肉') {
        return classification({
          kind: 'FOOD',
          resolvedText: '牛肉',
          reply: '这是食材。'
        })
      }
      if (text === '牛里脊') {
        return classification({
          kind: 'FOOD',
          intent: 'CORRECTION',
          resolvedText: '牛里脊',
          reply: '好，改成牛里脊。'
        })
      }
      return classification({
        kind: 'UNKNOWN',
        intent: 'CORRECTION',
        resolvedText: null,
        reply: '你想把牛肉改成什么？',
        suggestions: ['牛腩', '牛腱']
      })
    })
    const chat = createIntakeChat(classify)

    await chat.send('牛肉')
    expect(chat.state.kind).toBe('FOOD')
    expect(chat.state.correctingText).toBeNull()

    await chat.send('不对，不是这个')

    expect(chat.state.kind).toBe('FOOD')
    expect(chat.state.judgedText).toBe('牛肉')
    expect(chat.state.current).toEqual({ text: '牛肉', kind: 'FOOD' })
    expect(chat.state.correctingText).toBe('牛肉')
    // AI 的追问和可点建议照常展示在左侧。
    expect(lastMessage(chat)?.text).toBe('你想把牛肉改成什么？')
    expect(lastMessage(chat)?.suggestions).toEqual(['牛腩', '牛腱'])

    // 纠正成功后结束「正在纠正」，换成新原料。
    await chat.pickSuggestion('牛里脊')
    expect(classify.mock.calls[2]?.[2]).toEqual({ text: '牛肉', kind: 'FOOD' })
    expect(chat.state.kind).toBe('FOOD')
    expect(chat.state.judgedText).toBe('牛里脊')
    expect(chat.state.current).toEqual({ text: '牛里脊', kind: 'FOOD' })
    expect(chat.state.correctingText).toBeNull()
  })
})
