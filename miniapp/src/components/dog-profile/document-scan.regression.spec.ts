import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * AI 录入扩展（2026-10-01，第六期）。
 *
 * 老板第 4 条：拍照识别覆盖到除过敏报告以外的体检报告和疫苗本。
 * 老板第 5 条：识别后不需逐条确认，确认一次就自动录入表单。
 * 老板第 6 条：顾客可选 AI 识别，也可以手动填写。
 */
describe('拍照录入 · 组件', () => {
  function readScan() {
    return readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthDocumentScan.vue'),
      'utf-8',
    )
  }

  it('第 4 条：支持四类文档', () => {
    const scan = readScan()

    expect(scan).toContain("'ALLERGY_REPORT' | 'CHECKUP_REPORT' | 'VACCINE_BOOK' | 'MEDICAL_RECORD'")
  })

  it('第 5 条：识别后只确认一次，且明确告诉顾客"确认后自动填入表单"', () => {
    const scan = readScan()

    expect(scan).toContain('识别到以下内容，确认后自动填入表单')
    expect(scan).toContain('确认，填入表单')
    // 只有一次确认，没有逐条勾选
    expect(scan).toContain('@tap="accept"')
    expect(scan).not.toContain('逐条确认')
  })

  it('第 5 条：识别的结果只填表、不直接保存（顾客还能改、还能不存）', () => {
    const scan = readScan()

    // 组件只 emit，不调用任何保存接口
    expect(scan).toContain("emit('scanned'")
    expect(scan).not.toContain('createHealthRecord')
    expect(scan).not.toContain('saveRecord')
    expect(scan).toContain('填入后你还可以逐项修改')
  })

  it('第 6 条：明确写着也可以手填，且任何一步失败都不挡人', () => {
    const scan = readScan()

    expect(scan).toContain('也可以直接手填')
    // 失败时降级提示，不是死路
    // 2026-10-01：失败文案统一走 resolveHealthScanErrorMessage ——
    // 腾讯云自己的报错（如"服务未开通，请前往控制台…"）不能直接弹给顾客
    expect(scan).toContain('resolveHealthScanErrorMessage(error?.message)')
  })

  it('不做医学判断：界面只展示"照抄来的"字段', () => {
    const scan = readScan()

    expect(scan).toContain('识别把握')
    // 不出现任何诊断性措辞
    expect(scan).not.toContain('可能是')
    expect(scan).not.toContain('建议治疗')
  })

  it('识别结果为空时不假装成功', () => {
    const scan = readScan()

    expect(scan).toContain('没识别到内容，请换一张更清晰的图片')
  })

  it('一次最多选 9 张（微信上限），逐张识别后合并成一份确认结果', () => {
    const scan = readScan()

    expect(scan).toContain('count: 9')
    expect(scan).toContain("sizeType: ['compressed']")
    // 相册里同一张图选两次没必要识别两次
    expect(scan).toContain('new Set(paths.filter(Boolean))')
    expect(scan).toContain('识别中 ${index + 1}/${filePaths.length}…')
  })

  it('识别出的记录带上顾客拍的原图当附件（识别只是抄字，原图才是凭证）', () => {
    const scan = readScan()

    // 后端返回的 drafts.attachments 是空数组，图片地址只有上传这一步知道
    expect(scan).toContain('attachments: [uploaded.url]')
    // 张数与条数的关系要如实告诉顾客
    expect(scan).toContain('scanCountSummary')
  })

  it('多张图算一份资料：合成一条记录，疫苗本除外（老板 2026-10-01 定的）', () => {
    const scan = readScan()

    expect(scan).toContain('mergeScannedReportDrafts')
    // 疫苗本一张本子读出多条接种记录，合并会把几针并成一针
    expect(scan).toContain("detectedType === 'VACCINE_BOOK'")
    expect(scan).toContain('? collectedDrafts')
  })

  it('合成时要如实说明「N 张 → 1 条」，否则顾客以为剩下的没识别成功', () => {
    const scan = readScan()

    expect(scan).toContain('本次共 ${images} 张图片，合成 1 条记录')
    expect(scan).toContain('读出 ${records} 条记录')
    // 选了几张要按"顾客选的总数"算，不是"识别成功的张数"
    expect(scan).toContain('requestedImageCount.value = filePaths.length')
  })
})

describe('拍照录入 · 接线', () => {
  it('病历与体检报告挂在「病历/检查」板块，入口合并成底部一个「新增记录」', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(section).toContain('<HealthDocumentScan')
    expect(section).toContain('v-if="isVisitMode && dogId && scanActive"')
    // 2026-10-01 老板要求：三个入口并成一个，且**不再让顾客先选文档类型** ——
    // 传 AUTO 由后端判断，两个选项就合并成了「从相册选择（自动识别）」
    expect(section).toContain("itemList: ['手动填写', '从相册选择（自动识别检查报告）']")
    expect(section).toContain('function openAddRecordChooser()')
    expect(section).toContain('function startScan()')
    expect(section).toContain('document-type="AUTO"')
    expect(section).toContain('hide-trigger')
    // 判成别的资料（过敏报告 / 疫苗本）时不硬填成病历，提示去对应板块
    expect(section).toContain('这看起来是过敏原检测报告，请到「过敏」板块上传')
    expect(section).toContain('这看起来是疫苗本，请到「疫苗」板块上传')
  })

  it('疫苗本挂在「疫苗」板块', () => {
    const vaccine = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

    expect(vaccine).toContain('<HealthDocumentScan')
    expect(vaccine).toContain('document-type="VACCINE_BOOK"')
    expect(vaccine).toContain('拍疫苗本')
  })

  it('过敏报告那条老路没被动过', () => {
    const allergy = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/AllergyQuickAddSection.vue'),
      'utf-8',
    )

    // 仍然调用同一个识别接口；不传 documentType 即走缺省的过敏报告
    expect(allergy).toContain('extractHealthReport')
  })

  it('API 层把 documentType 与 drafts 暴露出来', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('documentType?')
    expect(api).toContain('drafts: Record<string, any>[]')
  })
})
