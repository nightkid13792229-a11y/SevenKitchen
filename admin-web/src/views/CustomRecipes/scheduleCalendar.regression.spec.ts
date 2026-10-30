import { describe, expect, it } from 'vitest'
// ⚠️ 用 Vite 的 `?raw` 导入，不要用 node:fs ——
// 构建的 tsconfig 里没有 node 类型，用 node:fs 会让 `npm run build` 直接失败
// （我在售后页那次就是这么挂的）。
import page from '@/views/CustomRecipes/ScheduleCalendar.vue?raw'
import apiSource from '@/api/customRecipe.ts?raw'
import routerSource from '@/router/index.ts?raw'
import menuSource from '@/constants/adminMenu.ts?raw'

/**
 * 排期日历页 · 守卫（2026-10-16，批次 4.2）
 *
 * ## 这一页最容易出的事
 *
 * **自己算一遍"能不能约"。** 三层优先级（具体某天 > 按星期规则 > 全局配置）
 * 与接单/交付两套容量的判定都在后端领域层。
 * 前端再算一遍就会出现两套口径 —— 而"某一天到底能不能约"这种错，
 * **顾客会比老板先发现**。
 *
 * 同理，剩余名额也不该在这里减：后端已经算好 `remaining` 了。
 */

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('排期日历页 · 判定全在后端', () => {
  const pageCode = stripComments(page)
  const apiCode = stripComments(apiSource)

  it('★ 不自己算剩余名额（后端已给 remaining）', () => {
    /**
     * ⚠️ 2026-10-18：需求 2.8.5 拿掉了「接单」维度（接单不限量），
     * 所以 `activeDay.remaining` 那一行被删了 —— 但**意图没变**：
     * 剩余名额必须用后端给的，不能在页面里做减法。
     * 现在只剩交付这一套容量，断言盯 `deliveryRemaining`。
     */
    expect(pageCode).toContain('activeDay.deliveryRemaining')
    expect(pageCode).toContain('deliveryRemaining')
    /**
     * 不许在页面里做 `capacity - bookedCount` 这类减法。
     *
     * ⚠️ **要允许成员访问前缀**：真实写法是 `d.capacity - d.bookedCount`，
     * 中间隔着 `d.`。第一版没允许，我故意加了一处计算，守卫居然没红 ——
     * 与小程序交付页那次是同一个坑（见那里的注释）。
     */
    const MEMBER = '[A-Za-z_$][\\w$]*\\.'
    expect(pageCode).not.toMatch(
      new RegExp(`(?:${MEMBER})?capacity\\s*[-+]\\s*(?:${MEMBER})?bookedCount`),
    )
    expect(pageCode).not.toMatch(
      new RegExp(`(?:${MEMBER})?bookedCount\\s*[-+]`),
    )
  })

  it('★ 不自己判断"能不能约"（用后端给的 isOpen）', () => {
    expect(pageCode).toContain('isOpen')
    // 不许把三层优先级在页面里写一遍
    expect(pageCode).not.toContain('isPublicHoliday &&')
    expect(pageCode).not.toContain('weekdayRule')
  })

  it('★ "不能约的原因"显示后端给的，不是前端编的', () => {
    expect(pageCode).toContain('activeDay.closedReason')
    // 不许在页面里写死那几句原因
    expect(pageCode).not.toContain('这天是公众假期')
    expect(pageCode).not.toContain('这天的接单名额已满')
  })

  it('★ "这一天的设置来自哪一层"也用后端给的 source', () => {
    expect(pageCode).toContain('sourceLabel')
    expect(pageCode).toContain('activeDay.source')
  })

  it('每天的情况来自日历接口，不是前端按星期推的', () => {
    expect(pageCode).toContain('getCalendar')
    expect(pageCode).toContain('calendar?.days')
  })

  it('只剩「每天最多交几份」（2026-10-18 · 需求 2.8.5：接单不限量）', () => {
    /**
     * 原来这里断言"接单 / 交付两套容量分开显示"。
     * 老板 2026-10-18 定：**接单不限量**，那个数没意义，从界面拿掉。
     *
     * ⚠️ 但 `row.capacity` 仍留在表单状态里（只从界面移除，不删数据）——
     * 跟配置页那 5 个字段一样的处理方式。
     */
    expect(pageCode).toContain('每天最多交几份')
    expect(pageCode).not.toContain('每天最多接几单')
    // 数据字段还在表单状态里（只从界面移除，不删数据）
    expect(pageCode).toContain('capacity: rule.capacity ?? null')
  })

  it('每周规则的开关叫「营业」而不是「接单」', () => {
    expect(pageCode).toContain('label="营业"')
    expect(pageCode).not.toContain('label="接单"')
  })

  it('保存失败时显示后端给的原因（比如"周日的接单上限必须是 1~200"）', () => {
    expect(pageCode).toContain('getApiErrorMessage')
  })

  it('规则没配过时给出说明，而不是假装已经配好了', () => {
    expect(pageCode).toContain('isDefaultRules')
    expect(pageCode).toContain('按星期的规则还没设置过')
  })

  it('路由与菜单都挂上了', () => {
    expect(routerSource).toContain('custom-recipes/schedule')
    expect(routerSource).toContain('ScheduleCalendar.vue')
    expect(menuSource).toContain('/custom-recipes/schedule')
  })

  it('API 层调的是后台地址', () => {
    expect(apiCode).toContain('/admin/custom-recipe/weekday-rules')
    expect(apiCode).toContain('/admin/custom-recipe/calendar')
  })

  it('★ 月历格子的排版是纯排版，不含业务判断', () => {
    // calendarCells 只把日期摆进星期网格 —— 不许在里面判"能不能约"
    const start = pageCode.indexOf('const calendarCells')
    const end = pageCode.indexOf('const load =')
    const block = pageCode.slice(start, end)
    expect(block).toContain('leading')
    expect(block).not.toContain('isOpen')
    expect(block).not.toContain('capacity')
  })
})
