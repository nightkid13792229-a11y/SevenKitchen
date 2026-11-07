import { describe, expect, it } from 'vitest'
import {
  extractEntryScriptSrc,
  normalizeEntryPath,
  isStaleBundle,
  indexHtmlPathOf,
} from './staleBundle'

/**
 * 旧页面检测（2026-11-08）。
 *
 * 事故原型：页面是 14:40 打开的，后端 22:10 上线了「建档必须带采购商品」，
 * 人一直没刷新，点授权直接被后端拒，报的还是一句看不懂的「件数必须是正整数」。
 * 页面自己要先知道自己过期了，才能提示刷新。
 */
describe('旧页面检测', () => {
  it('从 index.html 里取出入口脚本（构建产物的那个 module 脚本）', () => {
    const html =
      '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-DGFl0PsY.js"></script>' +
      '<link rel="stylesheet" href="/assets/index-0Z70u3qE.css"></head><body></body></html>'

    expect(extractEntryScriptSrc(html)).toBe('/assets/index-DGFl0PsY.js')
  })

  it('没有入口脚本时返回 null（拿不到就不许判人旧页面）', () => {
    expect(extractEntryScriptSrc('<html><body>404</body></html>')).toBeNull()
  })

  it('入口脚本换了 → 页面是旧版本', () => {
    const html =
      '<script type="module" src="/assets/index-NEW.js"></script>'

    expect(isStaleBundle('/assets/index-OLD.js', html)).toBe(true)
  })

  it('入口脚本没换 → 不是旧版本', () => {
    const html =
      '<script type="module" src="/assets/index-SAME.js"></script>'

    expect(isStaleBundle('/assets/index-SAME.js', html)).toBe(false)
  })

  it('拿不到当前入口、或拉不到最新 index.html → 一律不拦（宁可放过，不误拦）', () => {
    const html =
      '<script type="module" src="/assets/index-NEW.js"></script>'

    expect(isStaleBundle(null, html)).toBe(false)
    expect(isStaleBundle('', html)).toBe(false)
    expect(isStaleBundle('/assets/index-OLD.js', '<html></html>')).toBe(false)
  })

  it('只比路径，不比域名与查询串', () => {
    const html =
      '<script type="module" src="/assets/index-same.js?v=2"></script>'

    expect(isStaleBundle('https://sevenkitchen.cloud/assets/index-same.js?t=1', html)).toBe(false)
    expect(normalizeEntryPath('https://x.cloud/assets/a.js?v=1#h')).toBe('/assets/a.js')
  })

  /**
   * index.html 的位置要从入口脚本推：SPA 路由下 `document.baseURI` 是当前页地址
   * （如 /ingredients/ai-agent），直接拼 'index.html' 会去拉一个不存在的路径。
   */
  it('从入口脚本推 index.html 的位置（子路径部署也对）', () => {
    expect(indexHtmlPathOf('/assets/index-a.js')).toBe('/index.html')
    expect(indexHtmlPathOf('/app/assets/index-a.js')).toBe('/app/index.html')
    expect(indexHtmlPathOf('/src/main.ts')).toBe('/index.html')
    expect(indexHtmlPathOf(null)).toBeNull()
    expect(indexHtmlPathOf('/index-a.js')).toBe('/index.html')
  })
})
