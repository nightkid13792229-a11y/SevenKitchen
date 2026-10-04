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

    // 点选（常见过敏原）
    expect(source).toContain('addAllergenByName(name)')
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

    expect(source).toContain('读到这些，确认要记的：')
    expect(source).toContain('候选一律先不选中，逐项由家长点')
    expect(source).toContain("emit('scanned', { allergens: [...picked.value] })")
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
