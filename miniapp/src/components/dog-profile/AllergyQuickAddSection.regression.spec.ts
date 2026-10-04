import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 过敏快速添加（2026-09-27）
 *
 * 建档流程从这一天起完全不收集健康信息（老板决定），
 * 于是建档里那套「一点即选 + 上传报告 AI 识别」整体搬到了这里 ——
 * 「健康管理」页过敏类别的唯一快捷入口。
 *
 * 三条不能退让的约束：
 *   1. 识别结果只是**候选**，顾客确认后才写入档案（AI 不得直接落库）
 *   2. 识别失败**降级为手工填写**，不阻断顾客维护别的记录
 *   3. 写入的是结构化过敏记录（allergy_record），不是没人能维护的旧文本字段
 */
describe('过敏快速添加', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/AllergyQuickAddSection.vue'),
      'utf-8',
    )

  it('常见过敏原一点即选，不用顾客手打', () => {
    const source = readComponent()

    expect(source).toContain('commonAllergens')
    expect(source).toContain('addAllergen')
    // 至少要覆盖最常见的几类
    for (const allergen of ['鸡肉', '牛肉', '鸡蛋', '牛奶']) {
      expect(source).toContain(`'${allergen}'`)
    }
  })

  it('点一下就写进结构化过敏记录，而不是攒在表单里等提交', () => {
    const source = readComponent()

    // 「健康管理」是顾客随时来随时走的地方：攒着不落库，中途离开就丢了
    expect(source).toContain('dogApi.healthRecords.allergy.create(props.dogId, {')
    expect(source).toContain('allergen,')
    expect(source).toContain("emit('saved', allergen)")
  })

  it('档案里已有的过敏原不重复写入', () => {
    const source = readComponent()

    expect(source).toContain('recordedAllergens')
    expect(source).toContain('isRecorded')
    expect(source).toContain('档案里已经有这一条了')
    // 手输多条时同样跳过已存在的
    expect(source).toContain('// 档案里已有的直接跳过，不制造重复记录')
  })

  it('手输支持逗号/顿号/分号分隔，失败的那条留在输入框里', () => {
    const source = readComponent()

    expect(source).toContain('splitAllergenText')
    expect(source).toContain('/[,，、;；\\n\\r]/')
    expect(source).toContain('customInput.value = failed.join')
  })

  it('提供上传入口，并走「上传 → 识别」两步', () => {
    const source = readComponent()

    expect(source).toContain('pickHealthReport')
    expect(source).toContain('上传报告')
    expect(source).toContain('dogApi.uploadHealthAttachment(')
    expect(source).toContain('dogApi.extractHealthReport(')
  })

  it('识别结果先放进候选区，顾客勾选确认后才写进档案', () => {
    const source = readComponent()

    expect(source).toContain('candidates')
    expect(source).toContain('pickedCandidates')
    expect(source).toContain('识别到以下过敏原，请确认')
    // 候选一律先不选中
    expect(source).toContain('pickedCandidates.value = []')
    // 确认后才落库
    expect(source).toContain('confirmCandidates')
    expect(source).toContain('确认记入档案')
    // 也允许顾客说"都不是"
    expect(source).toContain('discardCandidates')
    expect(source).toContain('都不是')
  })

  it('从报告点选来的过敏原，把报告原图一并留档当附件', () => {
    const source = readComponent()

    // 识别只是抄字，报告原件才是凭证；此前 attachments 一律写成空数组，原图就丢了。
    //
    // 2026-10-04 第二期把这条路升级成"存一份检测报告"：
    // 原图挂在 AllergyReport 上（还带检测日期 / 方式 / 识别原文），
    // 而不是在每条过敏记录上各挂一份 —— 一份 12 项的报告
    // 原来会变成 12 条记录各带同一张图，既没有日期、也看不出是同一份报告。
    expect(source).toContain('const reportImageUrls = ref<string[]>([])')
    // 每一页原图都留住（一份报告常常不止一页）
    expect(source).toContain('collectedImageUrls.push(imageUrl)')
    expect(source).toContain('dogApi.allergyReports.create(props.dogId, {')
    expect(source).toContain(
      'attachments: sourceImageUrls.length > 0 ? sourceImageUrls : undefined',
    )
    // 报告存不成时退回逐条落库，不能让顾客白拍一张照
    expect(source).toContain('if (!savedAsReport)')
    // 一点即选 / 手输这两条没有图片的路仍然不带附件
    expect(source).toContain('await createAllergyRecord(allergen)')
    // 报告状态复位时一并清掉图片地址，避免下一次误挂上一张
    expect(source).toContain('reportImageUrls.value = []')
  })

  it('识别失败时降级为手工填写，不阻断顾客做别的事', () => {
    const source = readComponent()

    expect(source).toContain('手工补充')
    // 失败路径只提示，不抛出、不拦截
    const catchBlock =
      source.match(/catch \(error: any\) \{[\s\S]*?extracting.value = false/)?.[0] || ''
    expect(catchBlock).not.toBe('')
    expect(catchBlock).toContain('uni.showToast')
  })

  it('顾客取消选图不算失败（静默返回）', () => {
    const source = readComponent()

    expect(source).toContain('顾客取消选图：静默返回，不算失败')
  })
})
