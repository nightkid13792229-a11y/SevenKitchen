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
    expect(scan).toContain('识别失败，可以手工填写')
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
    expect(section).toContain("itemList: ['手动填写', '从相册选择（自动识别）']")
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
