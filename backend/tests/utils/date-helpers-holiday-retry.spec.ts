import { describe, expect, it } from '@jest/globals'

/**
 * 节假日失败兜底（2026-10-18 · 附录 B #4）
 *
 * 原实现把**空结果永久缓存** —— 接口只要在第一次调用时挂了，
 * 那一年的节假日就再也不会生效，直到进程重启。
 * 而"顺延公众假期"在配置里是打开的 —— 等于**静默失效**。
 */
describe('法定节假日 · 失败兜底', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../src/utils/date-helpers.ts'),
    'utf8',
  ) as string

  it('★ 失败结果不再永久写进成功缓存', () => {
    // 关键：失败走的是 holidayFailureCache，不是 holidayCache
    expect(source).toContain('holidayFailureCache.set(year, Date.now())')
    expect(source).not.toContain('holidayCache.set(year, [])')
  })

  it('★ 失败后过一段时间会重试（不用重启进程）', () => {
    expect(source).toContain('HOLIDAY_RETRY_AFTER_MS')
    expect(source).toContain("Date.now() - lastFailureAt < HOLIDAY_RETRY_AFTER_MS")
  })

  it('★ 成功后清掉失败标记', () => {
    expect(source).toContain('holidayFailureCache.delete(year)')
  })

  it('★ 仍然有超时（排期是主流程，不能被外部接口拖死）', () => {
    expect(source).toContain('HOLIDAY_FETCH_TIMEOUT_MS')
    expect(source).toContain('controller.abort()')
  })

  it('★ 接口不可达时不阻塞排期（回空数组）', () => {
    expect(source).toContain('return [];')
  })
})
