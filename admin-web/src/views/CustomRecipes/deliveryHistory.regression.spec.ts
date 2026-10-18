import { describe, expect, it } from 'vitest'
/**
 * ⚠️ 用 Vite 的 `?raw` 导入，**不要用 `node:fs`** ——
 * 构建的 tsconfig 里没有 node 类型，用 `node:fs` 会让 `npm run build` 直接失败。
 *
 * 这条不是猜的：`scheduleCalendar.regression.spec.ts` 的头部就写着同一句，
 * 而且注明了"我在售后页那次就是这么挂的"。**这次我又踩了一遍** ——
 * 写新 spec 前应该先看一眼同目录下的老 spec 怎么写的。
 */
import page from '@/views/CustomRecipes/OrderDetail.vue?raw'
import api from '@/api/customRecipe.ts?raw'

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
  const cleanPage = stripComments(page)

  it('★ 单独拉全部版本（详情里只有最新一版）', () => {
    expect(api).toContain('getOrderDeliveries')
    expect(api).toContain('/deliveries')
    expect(cleanPage).toContain('getOrderDeliveries')
  })

  it('★ 四个信息都要有：版本 / 时间 / 交付人 / 通知状态', () => {
    expect(cleanPage).toContain('item.version')
    expect(cleanPage).toContain('item.deliveredAt')
    expect(cleanPage).toContain('item.deliveredBy')
    expect(cleanPage).toContain('item.notifyStatus')
  })

  it('★ "当前是哪一版"由后端给（isCurrent），页面不自己判断', () => {
    expect(cleanPage).toContain('item.isCurrent')
    // 不许在页面里拿 replacedByDeliveryId 自己算
    expect(cleanPage).not.toContain('replacedByDeliveryId')
  })

  it('★ PENDING 写明"未发出"，不能写"待发送"', () => {
    // 顾客没点订阅授权时，订阅消息永远发不出去；写"待发送"会被误读成再等等
    expect(cleanPage).toContain("'— 通知未发出'")
    expect(cleanPage).not.toContain('待发送')
  })

  it('拉历史失败不影响订单详情展示', () => {
    expect(cleanPage).toContain('deliveryHistory.value = [];')
  })
})
