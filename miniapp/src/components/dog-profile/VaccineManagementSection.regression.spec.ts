import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 疫苗管理（2026-09-27）
 *
 * 后端的 /dogs/:dogId/vaccines 接口早就存在（含到期查询与订阅提醒），
 * 但顾客端**一个入口都没有** —— 生产 4544 只狗里疫苗记录为 0 条。
 * 老板要求把它并入「健康管理」板块。
 */
describe('疫苗管理', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('接的是后端已有的疫苗接口，没有另造一套', () => {
    const source = readComponent()

    expect(source).toContain('dogApi.healthRecords.vaccine.list')
    expect(source).toContain('dogApi.healthRecords.vaccine.create')
    expect(source).toContain('dogApi.healthRecords.vaccine.update')
    expect(source).toContain('dogApi.healthRecords.vaccine.delete')
  })

  it('五项信息齐全：疫苗名 / 接种日期 / 下次到期 / 状态 / 备注', () => {
    const source = readComponent()

    for (const field of ['vaccineName', 'vaccinationDate', 'nextDueDate', 'status', 'notes']) {
      expect(source).toContain(field)
    }

    expect(source).toContain("label: '已接种'")
    expect(source).toContain("label: '已预约'")
    expect(source).toContain("label: '已逾期'")
  })

  it('常见疫苗名一点即选，不用顾客手打', () => {
    const source = readComponent()

    expect(source).toContain('commonVaccineNames')
    expect(source).toContain('狂犬疫苗')
    expect(source).toContain('犬瘟热')
    expect(source).toContain('犬细小病毒')
  })

  it('保存前校验疫苗名与接种日期，空值不静默丢弃', () => {
    const source = readComponent()

    expect(source).toContain('请填写疫苗名称')
    expect(source).toContain('请选择接种日期')
  })

  it('下次到期日留空时不把空字符串传给后端（日期字段会被拒）', () => {
    const source = readComponent()

    expect(source).toContain('if (draft.nextDueDate) {')
    expect(source).toContain('payload.nextDueDate = draft.nextDueDate')
  })

  it('到期提醒只做页面内提示：未来 30 天内到期 + 已过期', () => {
    const source = readComponent()

    expect(source).toContain('dueSummaryText')
    expect(source).toContain('已过期')
    expect(source).toContain('30 天内到期')
    expect(source).toContain('daysUntil')
    expect(source).toContain('还有 ${days} 天到期')
  })

  it('删除前必须二次确认，避免误删接种史', () => {
    const source = readComponent()

    expect(source).toContain('uni.showModal')
    expect(source).toContain('删除疫苗记录？')
    expect(source).toContain("confirmText: '删除'")
    expect(source).toContain("cancelText: '保留'")
  })

  it('记录变化后统一重建编辑草稿（防止索引错位把 A 的内容写到 B）', () => {
    const source = readComponent()

    expect(source).toContain('function ensureDrafts()')
    // 载入、新增、删除草稿后都要重建
    expect((source.match(/ensureDrafts\(\)/g) || []).length).toBeGreaterThanOrEqual(4)
    // 草稿不允许在渲染期间惰性创建
    expect(source).toContain('草稿绝不能"边渲染边创建"')
  })
})

/**
 * 疫苗本原图留档（2026-10-01，健康管理第九期）。
 *
 * 老板：拍疫苗本上传的图片，原图也要留档（像病历/检查那样）。
 * 疫苗本是接种凭证 —— 出行、寄养、换医院都可能要看原件。
 */
describe('疫苗本原图留档', () => {
  const readComponent = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/VaccineManagementSection.vue'),
      'utf-8',
    )

  it('识别出的接种记录带着当页原图（不再是写死的空数组）', () => {
    const source = readComponent()

    expect(source).toContain('attachments: attachmentList(draft)')
    expect(source).not.toContain('attachments: [],')
  })

  it('保存时把原图一起提交给后端', () => {
    const source = readComponent()

    expect(source).toContain('attachments: attachmentList(record)')
    // 保存那条路要把记录本身传进 buildPayload，否则拿不到附件
    expect(source).toContain('buildPayload(draft, record)')
  })

  it('卡片上能看原图：有原件才显示「报告原件」，点开可预览', () => {
    const source = readComponent()

    expect(source).toContain('v-if="attachmentList(record).length > 0"')
    expect(source).toContain('报告原件')
    expect(source).toContain('@tap="previewAttachment(attachment)"')
    // 图片/PDF 的打开逻辑与病历卡片共用一份，不各写一套
    expect(source).toContain('previewHealthAttachment')
    expect(source).toContain('buildHealthAttachmentDisplayMeta')
  })

  it('接口类型带上 attachments 字段', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/api/dogs.ts'), 'utf-8')

    expect(api).toContain('attachments?: string[]')
  })
})
