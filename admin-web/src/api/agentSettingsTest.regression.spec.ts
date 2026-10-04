import { describe, expect, it } from 'vitest'
// 用 Vite 的 ?raw 读源码：admin-web 的 tsconfig 只带 vite/client 类型（没有 node 类型），
// 用 fs/process 会让 `npm run build` 的类型检查失败。
import source from '@/api/nutritionGovernance.ts?raw'

/**
 * 「测试连接」这个按钮的两个坑（2026-10-01 老板实测撞到）。
 *
 * 现象：点「测试连接」弹出 Network Error + 连接测试失败。
 *
 * 真因（看服务器日志定位）：
 *   1. 前端把请求体写成了 `null` —— axios 会序列化成字面量字符串 "null"，
 *      后端 JSON 解析器在 strict 模式下直接抛
 *      `Unexpected token 'n', "null" is not valid JSON`，返回 400；
 *   2. 那个 400 是在 body 解析中间件里抛的，响应**没带跨域头** →
 *      浏览器把它当成网络失败 → axios 报 "Network Error"。
 *      所以看着像"网络不通"，其实是请求体不合法。
 *
 * 顺带：这一步会用配置里的模型**真跑一次调用**，可能远超普通接口的 30s 超时，
 * 所以单独放宽到 120s（后端那条配置的超时上限是 90s）。
 *
 * 这组断言把这个坑钉住 —— 这个按钮对**所有用途**都失效，不只是健康模块。
 */
describe('Agent 配置 · 测试连接', () => {
  const testCall = source.slice(
    source.indexOf('testAgentSettings:'),
    source.indexOf('startBatchAgentReview:'),
  )

  it('请求体是 {} 而不是 null（写成 null 会让后端 JSON 解析 500/400）', () => {
    expect(testCall).toContain("'/admin/nutrition-governance/agent-settings/test'")
    expect(testCall).toContain('{},')
    expect(testCall).not.toMatch(/agent-settings\/test',\s*null/)
  })

  it('这一步单独放宽超时（真实模型调用可能超过默认 30s）', () => {
    expect(testCall).toContain('timeout: 120000')
  })

  it('用途参数照旧带上', () => {
    expect(testCall).toContain("params: purpose ? { purpose } : {}")
  })
})
