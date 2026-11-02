import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 员工端「添加采购记录」：让员工看到顾客将看到什么（2026-11-02）
 *
 * 顾客在订单详情里只会看到「渠道 + 采购产品名称」，
 * 品牌和规格不展示；这里用一条预览把口径说清楚，避免员工误以为规格也会发出去。
 */
describe('员工采购记录 · 顾客可见预览', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/staff-purchasing/record-form.vue'),
    'utf-8',
  )

  it('在选中的采购商品上展示「顾客将看到」', () => {
    expect(source).toContain('顾客将看到')
    expect(source).toContain('sku-customer-preview')
    expect(source).toContain("sku.purchaseChannel || '未填渠道'")
    expect(source).toContain('采购产品')
    expect(source).toContain('{{ sku.name }}')
  })

  it('预览只包含渠道和商品名，不再有来源等级', () => {
    expect(source).not.toContain('sourceTier')
    expect(source).not.toContain('未标来源')
    expect(source).not.toContain('sku-customer-preview-brand')
    expect(source).not.toContain('sku-customer-preview-model')
  })
})
