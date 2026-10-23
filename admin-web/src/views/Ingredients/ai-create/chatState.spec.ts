import { describe, expect, it, vi } from 'vitest'
import type { IntakeClassification } from '@/types/ingredientCreation'
import {
  ERROR_FALLBACK,
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
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * 第一步对话的状态逻辑。
 *
 * 页面没有组件挂载环境，所以把「追加消息 / 建议项等价发送 / 错误气泡 /
 * 发送中单飞」都收在 chatState.ts 里，这里直接驱动控制器。
 */
describe('AI 添加原料 · 判断食材还是补剂的对话状态', () => {
  it('追加消息：进入页面先固定问一句，发送后按「我 → AI」追加气泡', async () => {
    const classify = vi.fn(async (_text: string) =>
      classification({ suggestions: ['牛里脊'] })
    )
    const chat = createIntakeChat(classify)

    expect(chat.state.messages).toHaveLength(1)
    expect(chat.state.messages[0]?.role).toBe('ai')
    expect(chat.state.messages[0]?.text).toBe(WELCOME_TEXT)
    expect(chat.state.kind).toBe('UNKNOWN')

    await chat.send('  牛肉  ')

    expect(classify).toHaveBeenCalledWith('牛肉')
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
  })

  it('建议项点击等价于发送：点击文本就是下一次请求的输入', async () => {
    const classify = vi.fn(async (text: string) =>
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

    expect(classify).toHaveBeenNthCalledWith(2, '牛里脊')
    expect(
      chat.state.messages
        .filter((message) => message.role === 'me')
        .map((message) => message.text)
    ).toEqual(['牛肉', '牛里脊'])
    expect(
      chat.state.messages[chat.state.messages.length - 1]?.text
    ).toBe('好，按牛里脊记。')
  })

  it('错误消息展示：后端中文提示原样变成一条 AI 气泡，不把类型改掉', async () => {
    const classify = vi.fn(async (_text: string): Promise<IntakeClassification> => {
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
    const last = chat.state.messages[chat.state.messages.length - 1]
    expect(last?.role).toBe('ai')
    expect(last?.tone).toBe('error')
    expect(last?.text).toBe('AI 未启用，请联系管理员在 Agent 设置里开启。')
    expect(chat.state.kind).toBe('UNKNOWN')
    expect(chat.state.failedText).toBe('牛肉')
    expect(chat.state.sending).toBe(false)
  })

  it('判断失败时右侧不再保留上一条原料的判断结果', async () => {
    let attempts = 0
    const classify = vi.fn(async (_text: string): Promise<IntakeClassification> => {
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
  })

  it('错误兜底：断网 / 超时这类没有业务原因的失败，显示统一中文提示', async () => {
    const classify = vi.fn(async (_text: string): Promise<IntakeClassification> => {
      throw new Error('Network Error')
    })
    const chat = createIntakeChat(classify)

    await chat.send('锌')

    const last = chat.state.messages[chat.state.messages.length - 1]
    expect(last?.tone).toBe('error')
    expect(last?.text).toBe(ERROR_FALLBACK)
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
    const classify = vi.fn(async (_text: string): Promise<IntakeClassification> => {
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
    expect(classify).toHaveBeenLastCalledWith('葡萄糖酸锌')
    expect(
      chat.state.messages.filter((message) => message.role === 'me')
    ).toHaveLength(1)
    expect(chat.state.kind).toBe('SUPPLEMENT')
    expect(chat.state.failedText).toBeNull()
  })

  it('发送中禁止重复发送：发送按钮、建议项都不会再发第二次请求', async () => {
    const gate = deferred<IntakeClassification>()
    const classify = vi.fn((_text: string) => gate.promise)
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
    const classify = vi.fn(async (_text: string) => classification())
    const chat = createIntakeChat(classify)

    expect(await chat.send('   ')).toBe(false)

    expect(classify).not.toHaveBeenCalled()
    expect(chat.state.messages).toHaveLength(1)
  })

  it('UNKNOWN 时保留追问和建议，右侧仍按「待判断」处理', async () => {
    const classify = vi.fn(async (_text: string) =>
      classification({
        kind: 'UNKNOWN',
        reply: '这个词我不确定指什么，能补充一下形态吗？',
        suggestions: ['葡萄糖酸锌', '牛里脊']
      })
    )
    const chat = createIntakeChat(classify)

    await chat.send('锌')

    expect(chat.state.kind).toBe('UNKNOWN')
    const last = chat.state.messages[chat.state.messages.length - 1]
    expect(last?.text).toBe('这个词我不确定指什么，能补充一下形态吗？')
    expect(last?.suggestions).toEqual(['葡萄糖酸锌', '牛里脊'])
  })
})
