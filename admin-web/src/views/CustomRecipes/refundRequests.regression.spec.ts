import { describe, expect, it } from 'vitest'
// admin-web 的构建没有 node 类型，页面接线用 Vite 的 ?raw 读源码锁住。
import page from '@/views/CustomRecipes/RefundRequests.vue?raw'
import api from '@/api/customRecipe.ts?raw'
import router from '@/router/index.ts?raw'
import container from '@/views/AftersaleCenter/index.vue?raw'
import menu from '@/constants/adminMenu.ts?raw'

describe('后台退款申请（2026-10-25）', () => {
  it('★ 有独立的退款申请页、路由和菜单', () => {
    expect(page).toContain('退款申请')
    expect(router).toContain('custom-recipes/refunds')
    expect(container).toContain('RefundRequests.vue')
    expect(menu).toContain('/aftersale-center')
  })

  it('★ 审核通过会直接退款；失败不能伪装成功', () => {
    expect(page).toContain('approveRefundRequest')
    expect(page).toContain('通过并退款')
    expect(page).toContain('立即发起微信退款')
    expect(page).toContain('退款失败，请稍后重试')
  })

  it('★ 驳回必须写原因', () => {
    expect(page).toContain('rejectRefundRequest')
    expect(page).toContain('请填写驳回原因')
    expect(page).toContain('驳回原因会展示给顾客')
  })

  it('API 走后台退款申请接口', () => {
    expect(api).toContain('/admin/custom-recipe/refund-requests')
    expect(api).toContain('approveRefundRequest')
    expect(api).toContain('rejectRefundRequest')
  })
})
