import { describe, expect, it } from 'vitest'
import apiSource from '@/api/nutritionGovernance.ts?raw'
import pageSource from '@/views/AgentConfig/index.vue?raw'

/**
 * 智谱封面图配置入口（2026-10-27）。
 *
 * 守的是：接口路径、页面上真的有一张能填 Key 的卡、Key 输入是密码框、
 * 以及保存后不会把明文 Key 回填。
 */
describe('智谱封面图配置 · 入口', () => {
  it('三个接口路径', () => {
    expect(apiSource).toContain(
      "'/admin/nutrition-governance/agent-providers/zhipu-image'"
    )
    expect(apiSource).toContain(
      "'/admin/nutrition-governance/agent-providers/zhipu-image/test'"
    )
  })

  it('页面有智谱封面图配置卡与关键控件', () => {
    expect(pageSource).toContain('智谱封面图')
    expect(pageSource).toContain('v-model="zhipuForm.apiKey"')
    expect(pageSource).toContain('type="password"')
    expect(pageSource).toContain('连接测试')
    expect(pageSource).toContain('glm-image')
    expect(pageSource).toContain('loadZhipuSettings')
    expect(pageSource).toContain('saveZhipuSettings')
  })

  it('DeepSeek 用途列表不再混入生图用途（避免配错抽屉）', () => {
    expect(pageSource).toContain("meta.purpose !== 'RECIPE_COVER_IMAGE'")
  })

  it('保存后清空 Key 输入，不把明文回填', () => {
    expect(pageSource).toContain("zhipuForm.apiKey = ''")
    expect(pageSource).toContain('apiKeyLast4')
  })
})
