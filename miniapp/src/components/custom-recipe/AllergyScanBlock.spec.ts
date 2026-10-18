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

  it('顾客输入只剩：文本框 / 拍报告 / 看已传报告', () => {
    const source = page()

    // 2026-10-19：过敏原改为纯文本，快捷标签/手输弹窗下线
    expect(source).toContain('v-model="formData.allergyText"')
    expect(source).toContain('<textarea')
    // 拍报告识别
    expect(source).toContain('<AllergyScanBlock')
    expect(source).toContain('@scanned="onAllergensScanned"')
    // 已传报告
    expect(source).toContain('allergyReports')
    expect(source).toContain('previewAllergyReport')
    // 旧的快捷标签/手输入口不再出现
    expect(source).not.toContain('toggleAllergenByName')
    expect(source).not.toContain('addAllergen')
  })

  it('只要求写过敏食物，不要求写吃了会怎样', () => {
    const source = page()
    expect(source).toContain('过敏食物（不能吃的）')
    expect(source).toContain('例如：鸡肉、牛肉、鹿肉')
    expect(source).not.toContain('吃了会怎样')
    expect(source).not.toContain('营养师会核对')
  })

  it('答"有过敏"必须留下文本才能提交', () => {
    const source = page()
    expect(source).toContain('hasFoodAllergy.value === true')
    expect(source).toContain('!formData.value.allergyText.trim()')
    expect(source).toContain('还差：过敏食物')
  })

  it('答"没有过敏"会清掉已填文本，避免隐藏内容跟着提交', () => {
    const source = page()
    const answer = source.match(/function answerFoodAllergy[\s\S]*?\n\}/)?.[0] || ''
    expect(answer).toContain('formData.value.allergies = []')
    expect(answer).toContain("formData.value.allergyText = ''")
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

  it('报告写的结论等级要照抄进草稿，不能写死 UNKNOWN（老板第 4 条）', () => {
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
    expect(source).toContain('results: chosen.map((item) => ({')
    expect(source).toContain('level: item.level')
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

  it('报告原件先作为草稿交给父页面（不直接写狗狗档案）', () => {
    const source = block()

    // 2026-10-19：付款前只存“这一单的草稿”，付款后才转正式报告
    expect(source).not.toContain('dogApi.allergyReports.create')
    expect(source).toContain("emit('draft', draft)")
    expect(source).toContain('attachments: [...imageUrls.value]')
    expect(source).toContain('attachmentKeys: [...imageKeys.value]')
    // 取消/失败时要把已上传的 COS 文件清掉
    expect(source).toContain('cleanupUploadedFiles')
    expect(source).toContain("dogApi.deleteHealthAttachment('allergy'")
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
describe('过敏报告 · 按钮文案与删除方式', () => {
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

  it('上传区只有上传按钮，不再有一键清除', () => {
    const source = block()

    expect(source).not.toContain('一键清除')
    expect(source).not.toContain('showClearAll')
    expect(source).not.toContain("emit('clearAll')")
    // 只有一个入口；点开底部抽屉再分照片 / 文档
    expect(source).toContain("'上传过敏检测报告'")
    expect(source).toContain('pickReportEntry')
    expect(source).toContain('uni.showActionSheet')
    expect(source).toContain("'照片（从相册选）'")
    expect(source).toContain("'PDF / Word 文档（从微信聊天选）'")
  })

  it('PDF/Word 文档：从微信聊天选，上传后走同一套识别与确认', () => {
    const source = block()

    expect(source).toContain('chooseMessageFile')
    expect(source).toContain("extension: ['pdf', 'doc', 'docx']")
    expect(source).toContain("dogApi.uploadHealthAttachment('allergy', picked.path)")
    expect(source).toContain('extractHealthReport({')
    expect(source).toContain('originalFilename: picked.name')
    expect(source).toContain('buildPageItems(data)')
    expect(source).toContain('10 * 1024 * 1024')
    expect(source).not.toContain("'xlsx'")
  })

  it('文本框不再有清空按钮；报告按预览图右上角的叉删除', () => {
    const source = page()

    expect(source).not.toContain('allergy-text__clear')
    expect(source).not.toContain('clearAllAllergies')
    expect(source).not.toContain('undoClearAllergies')
    // 本次报告也用预览图右上角的叉
    expect(source).toContain('removeDraftReportImage(index, url)')
    expect(source).toContain('class="allergy-reports__thumb-remove"')
  })

  it('报告预览右上角可只删一张；最后一张才整份移除', () => {
    const source = page()

    const fn =
      source.match(/function removeDraftReportImage[\s\S]*?\n\}/)?.[0] || ''
    expect(fn).toContain('const isLastImage = images.length <= 1')
    expect(fn).toContain('formData.value.reportDrafts.splice(reportIndex, 1)')
    expect(fn).toContain('report.attachments = images.filter')
    expect(fn).toContain('deleteDraftReportFileKeys')
    // 不再有“重新填入过敏食物”
    expect(source).not.toContain('refillReportAllergens')
  })
})

/**
 * 2026-10-05 第六批（老板实测反馈）。
 */
describe('过敏报告 · 第六批（提醒合并 / 单张删除 / 标签合并 / 撤销）', () => {
  const block = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/custom-recipe/AllergyScanBlock.vue'),
      'utf-8',
    )
  const page = () =>
    readFileSync(resolve(process.cwd(), 'src/pages/custom-recipe/index.vue'), 'utf-8')

  it('多页里只要有一页带判定区，"这页没有判定区"的提醒就不显示', () => {
    /**
     * 老板上传两页报告：判读区在第 2 页，第 1 页只有数值表格。
     * 第 1 页的提醒在合并后的报告层面是错的，会让家长以为系统没读到判定区。
     */
    const source = block()

    expect(source).toContain('filterPageWarnings(collectedWarnings, pages, {')
    const filter = source.match(/function filterPageWarnings\([\s\S]*?\n\}/)?.[0] || ''
    expect(filter).toContain('page.hasVerdict')
    // 有一条真读到等级也算"有判定"
    expect(filter).toContain("item.level !== 'UNKNOWN'")
    // 日期与检测方法同理：别页读到了就不再提示"这份没写"
    expect(filter).toContain('resolved.hasDate')
    expect(filter).toContain('resolved.hasMethod')
    // 局部提醒（某处遮挡 / 某行看不清）不受影响
    expect(filter).toContain('return true')
  })

  it('每张缩略图右上角一个叉，只删那一张（最后一张才整份删）', () => {
    const source = page()

    const remove = source.match(/function removeReportImage\([\s\S]*?\n\}/)?.[0] || ''
    expect(remove).toContain('const isLastImage = images.length <= 1')
    // 还有别的照片：只更新附件（结论与过敏记录都不动）
    expect(remove).toContain('dogApi.allergyReports.update')
    expect(remove).toContain('attachments: images.filter')
    // 最后一张：整份删（后端语义：过敏记录保留）
    expect(remove).toContain('dogApi.allergyReports.remove')
    // 删完要刷新列表（缩略图立刻同步）
    expect(remove).toContain('await loadAllergyReports(dogId)')
  })

  it('不再有常见过敏原快捷标签；报告结果回填到文本', () => {
    const source = page()

    expect(source).not.toContain('allergenChips')
    expect(source).not.toContain('commonAllergens')
    expect(source).not.toContain('toggleAllergenByName')
    const scan = source.match(/function onAllergensScanned[\s\S]*?\n\}/)?.[0] || ''
    expect(scan).toContain('formData.value.allergyText')
    expect(scan).toContain('additions')
  })
})
