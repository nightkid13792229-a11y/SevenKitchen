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
    expect(page).toContain("route.query.mode")
    expect(page).toContain('<el-radio-button value="ORDER">订单定制食谱</el-radio-button>')
    expect(page).toContain('designMode: designModeFilter.value')
    expect(apiSource).toContain("designMode?: 'CATALOG' | 'ORDER'")
  })

  it('设计模式写进地址栏：刷新后仍然停在订单定制，不会跳回产品线', () => {
    expect(page).toContain("String(route.query.mode || '').trim().toUpperCase()")
    expect(page).toContain("query.mode = 'ORDER'")
    expect(page).toContain('delete query.mode')
    expect(page).toContain('router.replace({ query })')
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
