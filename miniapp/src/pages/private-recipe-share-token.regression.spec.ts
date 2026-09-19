import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('private recipe share token regressions', () => {
  it('preserves a detail-page share token when opening DIY configuration', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
      'utf-8',
    )
    // 首单路径修剪后，DIY 路由统一由 buildDiyRoute() 组装（登录后靠它直达配置页），
    // 因此 shareToken 的拼装点从 generateDiySheet() 移到了这里。
    const diyRouteBuilder = source.match(
      /function buildDiyRoute\(\)[\s\S]*?\n}\n/,
    )?.[0] || ''

    expect(diyRouteBuilder).toContain(
      'query.push(`shareToken=${encodeURIComponent(shareToken.value)}`)',
    )
  })

  it('uses a share token for recipe loading, DIY generation, and sheet navigation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'),
      'utf-8',
    )

    expect(source).toContain("shareToken.value = options.shareToken || ''")
    expect(source).toContain('shareToken: shareToken.value')
    expect(source).toContain("...(shareToken.value ? { shareToken: shareToken.value } : {})")
  })

  it('uses and retains a share token on the DIY sheet page and its shares', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/diy-sheet/index.vue'),
      'utf-8',
    )

    expect(source).toContain("shareToken.value = options.shareToken || ''")
    expect(source).toContain("...(shareToken.value ? { shareToken: shareToken.value } : {})")
    expect(source).toContain('shareToken=${encodeURIComponent(shareToken.value)}')
  })
})
