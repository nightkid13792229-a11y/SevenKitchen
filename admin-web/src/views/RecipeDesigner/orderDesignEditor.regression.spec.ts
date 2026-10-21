import { describe, expect, it } from 'vitest'
import editor from '@/views/RecipeDesigner/Editor.vue?raw'
import orderDetail from '@/views/CustomRecipes/OrderDetail.vue?raw'
import workspace from '@/views/RecipeDesigner/OrderDesignWorkspace.vue?raw'

function clean(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('编辑器 · 本单设计横幅', () => {
  const source = clean(editor)

  it('从本单工作台进入的编辑器带 orderId + designId', () => {
    expect(source).toContain("const orderId = String(route.query.orderId || '').trim()")
    expect(source).toContain("const designId = String(route.query.designId || '').trim()")
    expect(source).toContain('v-if="orderId"')
    expect(source).toContain('本单设计')
    expect(source).toContain('订单 {{ orderId }}')
    expect(source).toContain('orderDesignWorkspace?.dogName')
    expect(source).toContain('本单 {{ orderDesignWorkspace?.quantity ?? 0 }} 份')
    expect(source).toContain('已就绪 {{ orderDesignWorkspace?.readyCount ?? 0 }}')
  })

  it('本单狗狗仍然锁定，不能更换参考爱犬', () => {
    expect(source).toContain(':lock-reference-dog="Boolean(route.query.orderId)"')
  })

  it('跳转修订版 / 切换阶段时保留 orderId、designId', () => {
    expect(source).toContain('query: route.query')
  })
})

describe('编辑器 · 管理员加入本单待提交', () => {
  const source = clean(editor)

  it('只有管理员有「加入本单待提交」按钮，员工看到原因', () => {
    expect(source).toContain('useIsAdmin')
    expect(source).toContain('ADMIN_ONLY_TIP')
    expect(source).toContain('加入本单待提交')
    expect(source).toContain('@click="stageOrderDesign"')
    expect(source).toContain('v-if="isAdmin"')
  })

  it('点击先保存未落盘的修改，再调用 ready 接口', () => {
    const start = source.indexOf('async function stageOrderDesign')
    expect(start).toBeGreaterThan(-1)
    const block = source.slice(start, source.indexOf('/**', start) > start ? source.indexOf('/**', start) : start + 3000)

    expect(block).toContain('await flushNow()')
    expect(block).toContain('orderRecipeDesignApi.markReady(orderId, designId)')
    expect(block.indexOf('await flushNow()')).toBeLessThan(
      block.indexOf('orderRecipeDesignApi.markReady'),
    )
  })

  it('加入成功后回到本单工作台，让员工看到进度更新', () => {
    expect(source).toContain('返回本单工作台')
    expect(source).toContain("router.push(`/order-design/${encodeURIComponent(orderId)}`)")
    expect(source).toContain('已加入本单待提交')
  })

  it('本单设计模式不提供目录发布入口，避免绕过待提交', () => {
    expect(source).toContain('v-if="!orderId"')
    expect(source).toContain("if (orderId) {")
  })
})

describe('订单页 · 开始设计 / 继续设计进入工作台', () => {
  const source = clean(orderDetail)

  it('按钮文案根据本单是否已有设计记录切换', () => {
    expect(source).toContain('const designEntryLabel = computed')
    expect(source).toContain("hasOrderDesignSlots.value ? '继续设计' : '开始设计'")
    expect(source).toContain('{{ designEntryLabel }}')
  })

  it('跳转 /order-design/:orderId，不再跳旧设计器创建流程', () => {
    expect(source).toContain('/order-design/${encodeURIComponent(orderId)}')
    expect(source).not.toContain('/recipe-designer?dogId=')
    expect(source).not.toContain('openCreate=1')
  })

  it('新流程订单在订单页只显示工作台提示，旧的单份交付仅留给没有槽位的老订单', () => {
    expect(source).toContain('hasOrderDesignSlots')
    expect(source).toContain('v-if="hasOrderDesignSlots"')
    expect(source).toContain('本单已进入「订单设计」流程')
    expect(source).toContain('legacyOrderWithoutDesignSlots')
    expect(source).toContain('旧候选交付')
  })

  it('未付款仍然不能进入设计工作台', () => {
    expect(source).toContain('订单未付款，付款后才能开始设计')
    expect(source).toContain(':disabled="!canStartDesign || openingDesigner"')
  })
})

describe('订单设计工作台 · 打开编辑器时带 orderId + designId', () => {
  it('路由参数包含本单槽位绑定信息', () => {
    expect(workspace).toContain('orderId: orderId.value')
    expect(workspace).toContain('designId: slot.designId')
    expect(workspace).toContain("name: 'RecipeDesignerEditor'")
  })
})
