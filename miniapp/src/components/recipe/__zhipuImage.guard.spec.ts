import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 智谱生图客户端 · 契约守卫（2026-10-18）
 *
 * 这个文件的每一条断言都对应**官方文档里的一句话** ——
 * 因为它是外部接口，写错了不会有编译错误，只会运行时报错。
 *
 * 文档：https://docs.z.ai/api-reference/image/generate-image.md
 */
describe('智谱 glm-image 客户端', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../backend/src/application/recipe-designer/zhipu-image.ts'),
    'utf-8',
  )

  it('★ 路径是 /paas/v4/images/generations（不是 chat/completions）', () => {
    expect(source).toContain("const ZHIPU_IMAGE_PATH = '/paas/v4/images/generations'")
    /**
     * ⚠️ 断言"不含某字符串"前**必须先剥注释** ——
     * 源码注释里正写着"不是 `/chat/completions`"，不剥的话断言必然误报。
     * 这个坑在本项目已经踩过好几次了。
     */
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    expect(code).not.toContain('chat/completions')
  })

  it('★ 鉴权用 Bearer（官方 securitySchemes: bearerAuth）', () => {
    expect(source).toContain('Authorization: `Bearer ${options.apiKey}`')
  })

  it('★ 请求体字段是 model / prompt / size / quality / user_id', () => {
    for (const field of ['model:', 'prompt:', 'size:', 'quality:', 'user_id']) {
      expect(source).toContain(field)
    }
    // 智谱没有 messages 这个概念
    expect(source).not.toContain('messages:')
  })

  it('★ 响应取 data[0].url（官方 ImageGenerationResponse）', () => {
    expect(source).toContain('parsed?.data?.[0]?.url')
  })

  it('★ 错误体是 { code, message }，要把 message 透出来', () => {
    expect(source).toContain('parsed?.message')
    // 不能只说"失败了"，管理员要知道该改哪儿
    expect(source).toContain('生图失败：')
  })

  it('★ 默认尺寸 1280x1280、质量 hd（官方默认值）', () => {
    expect(source).toContain("options.size || '1280x1280'")
    expect(source).toContain("options.quality || 'hd'")
  })

  it('★ 超时要单独报（AbortError ≠ 网络错误）', () => {
    expect(source).toContain("error?.name === 'AbortError'")
    expect(source).toContain('生图超时')
  })

  it('★ 提示词里明确排除文字/水印（模型画的字基本是乱的）', () => {
    expect(source).toContain('No text, no watermark, no logo')
  })

  it('★ 源码里写清"返回的 URL 30 天过期、必须转存"', () => {
    expect(source).toContain('30 天')
    expect(source).toContain('必须')
  })
})
