import { describe, expect, it } from 'vitest'
import { AGENT_PURPOSES, agentPurposeLabel } from './agentPurposes'

/**
 * 健康模块的模型配置入口（2026-10-01）。
 *
 * 背景：健康模块在代码里早就声明了两个用途（健康报告识别 / 健康分析），
 * 但后台的清单里没有它们 —— 于是这两条一直悄悄借用「全局默认」，
 * 老板想给健康模块单独配密钥、单独换模型都没地方填。
 *
 * 这组断言锁住：
 *   · 两条都在清单里，名字与描述能让人看懂是干什么的；
 *   · 报告识别那条的默认模型是**能读图**的那个（填错的后果是识别直接失败）；
 *   · 分析那条用文本模型即可。
 */
describe('AI 用途清单 · 健康模块', () => {
  const find = (purpose: string) => AGENT_PURPOSES.find((item) => item.purpose === purpose)

  it('健康报告识别在清单里，且默认用能读图的模型', () => {
    const meta = find('HEALTH_REPORT_EXTRACTION')

    expect(meta).toBeTruthy()
    expect(meta?.label).toContain('健康')
    expect(meta?.description).toContain('能读图')
    // 官方正式名：deepseek-flash = DeepSeek-V4.1-Flash（支持读图）；
    // 旧名 deepseek-v4-flash / deepseek-v4-flash-vision-exp 已下线
    expect(meta?.defaultModel).toBe('deepseek-flash')
  })

  it('健康分析在清单里，用文本模型', () => {
    const meta = find('HEALTH_ANALYSIS')

    expect(meta).toBeTruthy()
    expect(meta?.label).toContain('健康')
    expect(meta?.defaultModel).toBe('deepseek-v4-pro')
  })

  it('两个用途的标识与后端代码里的一致（写错了就配不上）', () => {
    const purposes = AGENT_PURPOSES.map((item) => item.purpose)

    expect(purposes).toContain('HEALTH_REPORT_EXTRACTION')
    expect(purposes).toContain('HEALTH_ANALYSIS')
  })

  it('用途标识不重复', () => {
    const purposes = AGENT_PURPOSES.map((item) => item.purpose)

    expect(new Set(purposes).size).toBe(purposes.length)
  })

  it('标签能查出来（后台列表要显示中文名）', () => {
    expect(agentPurposeLabel('HEALTH_REPORT_EXTRACTION')).toContain('健康')
    expect(agentPurposeLabel('HEALTH_ANALYSIS')).toContain('健康')
  })
})

/**
 * AI 添加原料的模型配置入口（2026-10-26）。
 *
 * 背景：后端「原料 Agent」请求配置时用的用途标识就是 `INGREDIENT_INTAKE`，
 * 但后台的清单里一直没有它 —— 于是这条配置在后台无处可填，
 * Agent 只能悄悄借用「AI 食谱设计对话」的配置，老板想单独换模型、单独配密钥都做不到。
 *
 * 这组断言锁住：
 *   · 它在清单里，名字里带「原料」，让人一眼看懂是干什么的；
 *   · 标识与后端完全一致 —— 差一个字母，后台存的配置就永远匹配不上（且不会报错）；
 *   · 默认用 deepseek-v4-pro（原料识别 + 营养词条匹配是文本推理活）。
 */
describe('AI 用途清单 · AI 添加原料', () => {
  const find = (purpose: string) => AGENT_PURPOSES.find((item) => item.purpose === purpose)

  it('AI 添加原料在清单里，默认用 deepseek-v4-pro', () => {
    const meta = find('INGREDIENT_INTAKE')

    expect(meta).toBeTruthy()
    expect(meta?.label).toContain('原料')
    expect(meta?.defaultModel).toBe('deepseek-v4-pro')
  })

  it('标识与后端常量完全一致（写错一个字母，后台配置就永远用不上）', () => {
    // 后端原料 Agent 按字符串 'INGREDIENT_INTAKE' 查配置；
    // agent-settings 的 purpose 是自由字符串，没有任何编译期校验 ——
    // 两边差一个字母不会报错，只会安静地回退到别的用途，所以这里钉死。
    expect(find('INGREDIENT_INTAKE')?.purpose).toBe('INGREDIENT_INTAKE')
    expect(AGENT_PURPOSES.map((item) => item.purpose)).toContain('INGREDIENT_INTAKE')
  })

  it('标签能查出来（后台列表要显示中文名）', () => {
    expect(agentPurposeLabel('INGREDIENT_INTAKE')).toContain('原料')
  })

  it('排在营养复核之前（后台列表按清单顺序展示）', () => {
    const purposes = AGENT_PURPOSES.map((item) => item.purpose)

    expect(purposes.indexOf('INGREDIENT_INTAKE')).toBeGreaterThan(-1)
    expect(purposes.indexOf('INGREDIENT_INTAKE')).toBeLessThan(purposes.indexOf('NUTRITION_REVIEW'))
  })
})
