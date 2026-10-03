import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveHealthTabRecordType } from '../utils/health-records'

/**
 * 每个书签用哪套表单模板（2026-10-04 老板实测）。
 *
 * 老板原话："过敏标签分类下，现在用的也是就诊的模板。请修复回过敏分类自身的模板。"
 *
 * 原因：就诊与体检共用一个列表（`'visit'` 合并模式），拆标签时图省事，
 * 把**三个记录类书签全按 `'visit'`** 传给了组件 —— 过敏也跟着走
 * 「日期 / 症状 / 医生诊断 / 医嘱」，过敏原和过敏反应反而没地方填。
 */
describe('健康管理 · 书签对应的表单模板', () => {
  it('就诊 / 体检走合并模式（两类记录同一个列表）', () => {
    expect(resolveHealthTabRecordType('medical')).toBe('visit')
    expect(resolveHealthTabRecordType('checkup')).toBe('visit')
  })

  it('过敏走它自己的模板，不是就诊那套', () => {
    expect(resolveHealthTabRecordType('allergy')).toBe('allergy')
  })

  it('页面按书签取模板，不再一律当成 visit', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(page).toContain('resolveHealthTabRecordType(activeHealthTab.value)')
    // 老写法（三个记录类书签一律 visit）不能再回来
    expect(page).not.toContain("isRecordTab.value ? 'visit' : 'medical'")
  })

  it('过敏的字段是"过敏原 + 过敏反应/说明"，不是症状/医生诊断', () => {
    const section = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 单一类型分支（v-else）用 getFieldConfig(baseType)；只有 activeType 不是 visit 才会走到
    expect(section).toContain("const isVisitMode = computed(() => (props.activeType as string) === 'visit')")
    expect(section).toContain('return isVisitMode.value ? resolveHealthVisitKind(record) : baseType.value')
    expect(section).toContain("primary: { key: 'allergen', label: '过敏原' }")
    expect(section).toContain("notes: { key: 'notes', label: '过敏反应/说明' }")
  })
})

/**
 * 过敏「新增记录」不能点了没反应（2026-10-04 连带修）。
 *
 * 过敏改回自己的模板之后，记录组件里那套"拍照录入"只在 visit 模式下挂载，
 * 原来那条"记录类"分支在过敏下已经没有组件可调 ——
 * 点「上传图片，AI 识别」会静默什么都不发生。
 */
describe('过敏书签 · 新增记录的两个入口', () => {
  const page = () =>
    readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

  it('过敏单独分支：拍检测报告 / 手动点选，都落在上面那张快速添加卡上', () => {
    const source = page()

    expect(source).toContain("if (activeHealthTab.value === 'allergy')")
    expect(source).toContain("itemList: ['拍检测报告，AI 识别', '手动点选 / 手输']")
    expect(source).toContain('allergySectionRef.value?.pickHealthReport?.()')
    expect(source).toContain("'在上面点选或手输过敏原'")
  })

  it('过敏不再走"新建空记录卡"那条记录分支', () => {
    const source = page()
    const allergyBranch = source.slice(
      source.indexOf("if (activeHealthTab.value === 'allergy')"),
      source.indexOf('const isRecord = isRecordTab.value'),
    )

    expect(allergyBranch.length).toBeGreaterThan(0)
    expect(allergyBranch).not.toContain('recordsSectionRef')
  })
})
