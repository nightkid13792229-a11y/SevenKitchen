import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 后台交付历史守卫（2026-10-18 · 需求 2.8.6）
 *
 * 这条需求的由来：顾客说"我收到的是旧版"时，**此前查不出来** ——
 * 交付完只是改一个状态，没有任何地方记着"交过几版、谁交的、通知发没发"。
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('后台订单详情 · 交付历史', () => {
  const page = stripComments(
    readFileSync(
      resolve(process.cwd(), 'src/views/CustomRecipes/OrderDetail.vue'),
      'utf-8',
    ),
  )
  const api = readFileSync(
    resolve(process.cwd(), 'src/api/customRecipe.ts'),
    'utf-8',
  )

  it('★ 单独拉全部版本（详情里只有最新一版）', () => {
    expect(api).toContain('getOrderDeliveries')
    expect(api).toContain('/deliveries')
    expect(page).toContain('getOrderDeliveries')
  })

  it('★ 四个信息都要有：版本 / 时间 / 交付人 / 通知状态', () => {
    expect(page).toContain('item.version')
    expect(page).toContain('item.deliveredAt')
    expect(page).toContain('item.deliveredBy')
    expect(page).toContain('item.notifyStatus')
  })

  it('★ "当前是哪一版"由后端给（isCurrent），页面不自己判断', () => {
    expect(page).toContain('item.isCurrent')
    // 不许在页面里拿 replacedByDeliveryId 自己算
    expect(page).not.toContain('replacedByDeliveryId')
  })

  it('★ PENDING 写明"未发出"，不能写"待发送"', () => {
    // 顾客没点订阅授权时，订阅消息永远发不出去；写"待发送"会被误读成再等等
    expect(page).toContain("'— 通知未发出'")
    expect(page).not.toContain('待发送')
  })

  it('拉历史失败不影响订单详情展示', () => {
    expect(page).toContain('deliveryHistory.value = [];')
  })
})
