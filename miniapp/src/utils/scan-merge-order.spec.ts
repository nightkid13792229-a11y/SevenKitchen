import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveHealthScanErrorMessage } from './health-records'

/**
 * 2026-10-04 线上事故：老板传完 7 张报告，界面上是一句英文报错
 * 「Cannot read properties of undefined (reading '0')」。
 *
 * 原因：逐张提示的过滤写在了 `let merged = []` **之前** ——
 * 小程序编译成 var 之后变量被提升成 undefined，`merged[0]` 直接抛错。
 * 识别本身是成功的，卡在最后合并这一步，家长看到的就是"没识别到内容"。
 */
describe('识别合并 · 顺序不能错', () => {
  const scan = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )

  it('`merged` 只在赋值之后才能用', () => {
    const source = scan()
    const declareIndex = source.indexOf('let merged: Record<string, any>[] = []')
    const assignIndex = source.indexOf('drafts.value = merged')

    expect(declareIndex).toBeGreaterThan(0)
    expect(assignIndex).toBeGreaterThan(declareIndex)

    // 所有 `merged[0]` 都必须出现在 `drafts.value = merged` 之后
    let from = 0
    let checked = 0
    for (;;) {
      const at = source.indexOf('merged[0]', from)
      if (at < 0) break
      expect(at).toBeGreaterThan(assignIndex)
      checked += 1
      from = at + 1
    }
    expect(checked).toBeGreaterThanOrEqual(2)
  })

  it('程序自己的报错不甩给家长（换成能行动的一句话）', () => {
    expect(resolveHealthScanErrorMessage("Cannot read properties of undefined (reading '0')"))
      .toBe('识别时出了点问题，请再传一次；如果还是不行，先用「手动填写」')
    expect(resolveHealthScanErrorMessage('xxx is not a function'))
      .toContain('请再传一次')
    expect(resolveHealthScanErrorMessage('Script error.'))
      .toContain('请再传一次')
  })

  it('后端给顾客看的话照原样保留，别被上面那条吃掉', () => {
    expect(resolveHealthScanErrorMessage('没识别到内容，请换一张更清晰的图片'))
      .toBe('没识别到内容，请换一张更清晰的图片')
    expect(resolveHealthScanErrorMessage('这看起来不是宠物医疗资料'))
      .toBe('这看起来不是宠物医疗资料')
  })
})
