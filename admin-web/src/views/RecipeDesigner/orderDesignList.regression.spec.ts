import { describe, expect, it } from 'vitest'
import listSource from '@/views/RecipeDesigner/index.vue?raw'
import apiSource from '@/api/recipeDesigner.ts?raw'
import typeSource from '@/types/recipeDesigner.ts?raw'

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const page = stripComments(listSource)

describe('食谱设计列表 · 订单定制食谱（2026-10-22）', () => {
  it('提供产品线 / 订单定制切换，并把 designMode 传给列表接口', () => {
    expect(page).toContain('designModeOptions')
    expect(page).toContain("label: '订单定制食谱'")
    expect(page).toContain('designMode: designModeFilter.value')
    expect(apiSource).toContain("designMode?: 'CATALOG' | 'ORDER'")
  })

  it('模式 / 状态 / 搜索统一登记到地址栏同步，刷新后恢复', () => {
    expect(page).toContain('useQueryFilterSync(')
    expect(page).toContain('mode: designModeFilter')
    expect(page).toContain('status: statusFilter')
    expect(page).toContain('search: searchKeyword')
    expect(page).toContain('statusFilterOptions')
  })

  it('订单卡展示订单号、狗狗、份数和交付状态，并禁止新建/删除等产品线操作', () => {
    expect(page).toContain('card.orderNo')
    expect(page).toContain('card.orderDogName')
    expect(page).toContain('card.orderStatus')
    expect(page).toContain('orderStatusLabel')
    expect(page).toContain("v-if=\"designModeFilter === 'CATALOG'\"")
    expect(page).toContain('v-if="designModeFilter === \'CATALOG\'"')
    expect(typeSource).toContain("orderNo?: string | null")
    expect(typeSource).toContain("orderStatus?: string | null")
  })

  it('从订单定制列表进入编辑器时带上业务订单号，保持锁狗和本单上下文', () => {
    expect(page).toContain('entryOrderId.value =')
    expect(page).toContain("designModeFilter.value === 'ORDER' && card.orderNo")
    expect(page).toContain('?orderId=')
  })
})
