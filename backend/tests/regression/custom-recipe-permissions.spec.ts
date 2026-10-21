import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'

/**
 * 后台权限守卫（2026-10-18 · 需求 2.8.7）
 *
 * | 动作 | 谁能做 |
 * |---|---|
 * | 确认收款 / 查看订单 / 处理售后 | 员工 / 管理员 |
 * | **交付食谱 / 取消订单 / 改配置** | **仅管理员** |
 */
describe('后台定制食谱 · 权限', () => {
  const source = readFileSync(
    join(
      __dirname,
      '../../src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts',
    ),
    'utf8',
  )

  /** 取某个路由装饰器之后、下一个路由之前的那一段 */
  function blockAfter(route: string): string {
    const start = source.indexOf(route)
    expect(start).toBeGreaterThan(-1)
    const next = source.indexOf('@ApiOperation', start + route.length)
    return source.slice(start, next > 0 ? next + 400 : start + 600)
  }

  it('★ 交付食谱仅管理员', () => {
    expect(blockAfter("@Post('orders/:orderId/deliver-recipe')")).toContain(
      'AdminGuard',
    )
  })

  it('★ 多份批量交付仅管理员', () => {
    expect(blockAfter("@Post('orders/:orderId/deliver-batch')")).toContain(
      'AdminGuard',
    )
  })

  it('★ 改配置仅管理员', () => {
    expect(blockAfter("@Put('config')")).toContain('AdminGuard')
  })

  it('★ 取消订单仅管理员（状态变更接口能改成 CANCELLED）', () => {
    /**
     * 这个接口名字叫"更新状态"，但它能写 `CANCELLED` —— 就是取消订单。
     *
     * ⚠️ 此前只有类级的 `StaffGuard`，**员工能取消订单**，
     * 与"交付"那个接口（有 AdminGuard）不一致。已补。
     */
    const block = blockAfter("@Patch('orders/:orderId/status')")
    expect(source).toContain('CustomRecipeStatus.CANCELLED')
    expect(block).toContain('AdminGuard')
  })

  it('★ 手工补退款仅管理员（已取消的已付款单）', () => {
    /**
     * 2026-10-21：生产单 CR202610201196 取消时漏退，需要一个补退入口。
     * 退款是资金动作，与取消订单同级 —— 只有管理员能点。
     */
    const block = blockAfter("@Post('orders/:orderId/refund')")
    expect(block).toContain('AdminGuard')
    // 必须走既有退款 helper（幂等/原路退回都在里面），不能自己另发退款
    expect(block).toContain('createCustomRecipeRefund')
  })

  it('处理售后 **不**要求管理员（员工能做）', () => {
    const block = blockAfter("@Post('aftersales/:id/resolve')")
    expect(block).not.toContain('AdminGuard')
  })
})
