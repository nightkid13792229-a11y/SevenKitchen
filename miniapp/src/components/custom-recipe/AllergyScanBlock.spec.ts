import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 过敏录入搬进定制食谱（2026-10-04）。
 *
 * 老板："把过敏标签及相关的板块内容，从健康管理中全部删除掉，
 * 我们不做过敏计划，也将过敏源的记录放到定制食谱流程中。"
 * 并确认要"全部搬过去：点选 + 手输 + 拍检测报告识别 + 能看已传的报告"。
 */
describe('定制食谱 · 过敏录入', () => {
  const page = () =>
    readFileSync(resolve(process.cwd(), 'src/pages/custom-recipe/index.vue'), 'utf-8')
  const block = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/custom-recipe/AllergyScanBlock.vue'),
      'utf-8',
    )

  it('四条路都在：点选 / 手输 / 拍报告 / 看已传报告', () => {
    const source = page()

    // 点选（常见过敏原）。2026-10-04 起标签是 toggle：点一下选中、再点一下取消，
    // 所以这里锁的是 toggle 那条路，判定是否选中仍走 isAllergenAdded。
    expect(source).toContain('toggleAllergenByName(name)')
    expect(source).toContain('isAllergenAdded(name)')
    // 手输
    expect(source).toContain('addAllergen')
    // 拍报告识别
    expect(source).toContain('<AllergyScanBlock')
    expect(source).toContain('@scanned="onAllergensScanned"')
    // 已传报告
    expect(source).toContain('allergyReports')
    expect(source).toContain('previewAllergyReport')
  })

  it('识别结果要家长确认才生效，不是 AI 自己写进档案', () => {
    const source = block()

    expect(source).toContain('读到这些食物过敏原，已默认记上，不对的点掉：')
    // 2026-10-05 老板选定：读到的食物过敏原默认全部记上（原先一个都不勾，
    // 「加入这一单（0）」是灰的，家长以为坏了），仍然逐项可点掉
    expect(source).toContain('picked.value = foodCandidates.value.map((item) => item.name)')
    expect(source).toContain("emit('scanned', { allergens: [...picked.value] })")
  })

  it('环境类过敏原不记进过敏信息，但要告诉家长读到了（老板第 5 条）', () => {
    const source = block()
    const util = readFileSync(
      resolve(process.cwd(), 'src/utils/allergy-candidates.ts'),
      'utf-8',
    )

    // 规则落在 utils/allergy-candidates.ts（纯函数、可单测），组件只是调用
    expect(source).toContain('candidates.value.filter(isFoodCandidate)')
    expect(util).toContain("item.group !== 'ENVIRONMENT'")
    expect(source).toContain('与吃的东西无关，没有记进过敏信息')
    // 整份报告只有环境项时也要说一句，别让家长以为识别失败
    expect(source).toContain('报告里读到的是环境类过敏原')
  })

  it('报告写的结论等级要照抄进报告实体，不能写死 UNKNOWN（老板第 4 条）', () => {
    const source = block()
    const util = readFileSync(
      resolve(process.cwd(), 'src/utils/allergy-candidates.ts'),
      'utf-8',
    )

    /**
     * 老版本这里写死 `level: 'UNKNOWN'`。后果不是"少一个标签"：
     * 后端按 level 定可信度 —— 阳性 → 确诊（食谱彻底避开）、其余 → 可疑，
     * 写死 UNKNOWN 等于把报告上写着"阳性"的确诊过敏降级成"可疑"。
     */
    expect(source).not.toContain("level: 'UNKNOWN' })")
    expect(source).toContain('results: chosen.map((item) => ({ allergen: item.name, level: item.level }))')
    // 报告上写的阳性/弱阳性要显示出来，家长才知道哪几项最要紧
    expect(source).toContain('candidateLabel(item)')
    expect(util).toContain("POSITIVE: '阳性'")
  })

  it('多页报告：有判定区的那一页说了算（生产实测：颜色条会把弱阳性猜成阳性）', () => {
    const source = block()

    expect(source).toContain('mergeAllergyCandidates(pages)')
    expect(source).toContain("hasVerdict: meta.hasVerdict === true")
    expect(source).toContain('pages.push(')
  })

  it('报告原件存成实体，家长以后翻得出来（不再"读完就丢"）', () => {
    const source = block()

    expect(source).toContain('dogApi.allergyReports.create')
    expect(source).toContain('attachments: imageUrls.value')
  })

  it('识别失败不挡下单：降级为手工添加', () => {
    const source = block()

    expect(source).toContain('识别失败，请手工添加过敏原')
    expect(source).toContain('没识别到过敏原，请在下面手工添加')
  })

  it('扫描确认的过敏原并进这一单，且去重', () => {
    const source = page()

    expect(source).toContain('function onAllergensScanned')
    expect(source).toContain('formData.value.allergies.includes(value)')
    expect(source).toContain('formData.value.allergies.push(value)')
  })
})

/**
 * 2026-10-05 老板第五批：确认 / 取消 两个按钮的文案 + 一键清除过敏原。
 */
describe('过敏报告 · 按钮文案与一键清除', () => {
  const block = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/custom-recipe/AllergyScanBlock.vue'),
      'utf-8',
    )
  const page = () =>
    readFileSync(resolve(process.cwd(), 'src/pages/custom-recipe/index.vue'), 'utf-8')

  it('候选卡片两个按钮改成「确认」「取消」', () => {
    const source = block()
    // 断言"老文案不在了"必须去掉注释再断言（注释里会写明改之前叫什么）
    const live = source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(source).toContain('>确认</text>')
    expect(source).toContain('@tap="discard">取消</text>')
    expect(live).not.toContain('加入这一单')
    expect(live).not.toContain('>都不是<')
  })

  it('上传按钮右侧有「一键清除所有过敏原」，点了要弹窗确认', () => {
    const source = block()

    expect(source).toContain('一键清除所有过敏原')
    // 与上传按钮同一行（head 里）
    const head = source.slice(source.indexOf('allergy-scan__head'), source.indexOf('allergy-scan__candidates'))
    expect(head).toContain('一键清除所有过敏原')
    // 没有过敏原时不显示（点了也没意义）
    expect(source).toContain('const showClearAll = computed')
    expect(source).toContain('v-if="showClearAll"')
    // 不可撤销的批量动作：先问一句
    expect(source).toContain('清除所有过敏原？')
    expect(source).toContain("emit('clearAll')")
  })

  it('清除的是这一单：由父页面清空，档案不动', () => {
    const source = page()

    expect(source).toContain('@clear-all="clearAllAllergies"')
    expect(source).toContain(':has-allergens="formData.allergies.length > 0"')
    const clear = source.match(/function clearAllAllergies\(\)[\s\S]*?\n\}/)?.[0] || ''
    expect(clear).toContain('formData.value.allergies = []')
    // 不该去调删除档案里过敏记录的接口
    expect(clear).not.toContain('remove')
  })
})
