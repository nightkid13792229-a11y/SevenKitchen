import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 老板 2026-10-04 阶段性收尾时拍板的两条（连同一条更正）。
 *
 * ① "删除一次确认就可以了，不用输入删除再生效。"
 * ② "不保留识别把握低的提示。"
 * ③ 更正："我确认了七页的日期都是 7 月 15 号" —— 我此前把**更早那批**（已删掉的
 *    那条记录）的四个日期错安到了现在这 7 页头上。现在这 7 页确实全是 07-15，
 *    所以"按日期自动分条"这件事**不需要做**。
 */
describe('阶段性收尾 · 老板拍板的两条', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8')

  it('删除记录 = 一次确认弹窗，不要"输入删除才生效"那种二次门槛', () => {
    const section = read('src/components/dog-profile/HealthRecordsSection.vue')

    expect(section).toContain("title: '删除记录'")
    expect(section).not.toContain('输入删除')
    expect(section).not.toContain('请键入')
    expect(section).not.toContain('editable: true')

    // 附件删除同样只要一次确认
    expect(section).toContain("title: '删除这份附件？'")
  })

  it('识别把握一个字都不给顾客看（连"低"的那句也不要）', () => {
    const scan = read('src/components/dog-profile/HealthDocumentScan.vue')

    expect(scan).not.toContain('lowConfidenceHint')
    expect(scan).not.toContain('confirm__confidence')
    expect(scan).not.toContain('有几处没读准')
    /*
     * ⚠️ 2026-10-08 又往前一步：**连采集都不要了**。
     * 老板："AI 模型也有可能无法精准的判断哪些是高风险的问题吧，
     *        它也有可能乱说自己没把握的是哪几条吧？"
     * → 这个自评分既不可信、界面又不显示，留着只会误导，所以
     *   前端不再收、后端也不再问模型要（省 token）。
     */
    expect(scan).not.toContain('const confidence = ref')
    expect(scan).not.toContain('CONFIDENCE_RANK')
  })
})
