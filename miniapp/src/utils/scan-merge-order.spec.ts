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

    /*
     * 2026-10-08：合并那一段抽成了 mergePageDrafts()（"单独重传某一页"要复用），
     * 所以这条守卫改成盯**新的写法**：先把合并结果解构出来，再碰 merged[0]。
     * 要守的还是同一件事 —— 不许在 merged 拿到值之前用它（2026-10-04 的线上事故）。
     */
    const renderIndex = source.indexOf('function renderMergedResult()')
    const declareIndex = source.indexOf(
      'const { merged, resolvedType, ignoredNote } = mergePageDrafts(pageDraftCache)',
    )
    const assignIndex = source.indexOf('drafts.value = merged')

    expect(renderIndex).toBeGreaterThan(0)
    expect(declareIndex).toBeGreaterThan(renderIndex)
    expect(assignIndex).toBeGreaterThan(declareIndex)

    // 所有 `merged[0]` 都必须出现在"解构出 merged"之后
    let from = 0
    let checked = 0
    for (;;) {
      const at = source.indexOf('merged[0]', from)
      if (at < 0) break
      expect(at).toBeGreaterThan(assignIndex)
      checked += 1
      from = at + 1
    }
    /*
     * 抽取之后 `merged[0]` 只剩一处（逐张提示的过滤），另一处随
     * "内联合并"一起搬进了 mergePageDrafts()（那里不碰 merged[0]）。
     * 所以这里改盯"**每一处**都在 merged 可用之后"，而不是盯出现次数。
     */
    expect(checked).toBeGreaterThanOrEqual(1)
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
