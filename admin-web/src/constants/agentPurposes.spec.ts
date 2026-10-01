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
    expect(meta?.defaultModel).toBe('deepseek-v4-flash-vision-exp')
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
