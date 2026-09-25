import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const listSource = readFileSync(
  resolve(__dirname, 'staff-supplement-orders/index.vue'),
  'utf8',
)
const detailSource = readFileSync(
  resolve(__dirname, 'staff-supplement-orders/detail.vue'),
  'utf8',
)
const apiSource = readFileSync(resolve(__dirname, '../api/staff-supplement-orders.ts'), 'utf8')

describe('工作台补剂订单 · 接口契约', () => {
  it('接口路径与后端 admin-supplement-shop 控制器一致', () => {
    // 路径写错不会编译报错，只会线上 404 —— 所以钉死
    expect(apiSource).toContain("url: '/admin/supplement-shop/orders'")
    expect(apiSource).toContain('`/admin/supplement-shop/orders/${orderId}`')
    expect(apiSource).toContain('`/admin/supplement-shop/orders/${orderId}/confirm-payment`')
    expect(apiSource).toContain('`/admin/supplement-shop/orders/${orderId}/pack`')
    expect(apiSource).toContain('`/admin/supplement-shop/orders/${orderId}/ship`')
    expect(apiSource).toContain('`/admin/supplement-shop/orders/${orderId}/cancel`')
    expect(apiSource).toContain('`/admin/supplement-shop/orders/${orderId}/labels`')
  })

  it('分装提交用 itemId（订单行 ID），不是 labelId 或别的名字', () => {
    // 后端 SupplementPackItemDto 校验的是 itemId，且要求覆盖全部订单行；
    // 写成 labelId 会被 400 挡回来
    expect(apiSource).toContain('itemId: string')
    expect(detailSource).toContain('itemId: item.id')
    expect(detailSource).not.toContain('itemId: item.labelId')
  })

  it('标签数据带 bagIndex / bagTotal（加量后一个补剂多袋，每袋一张）', () => {
    expect(apiSource).toContain('bagIndex: number')
    expect(apiSource).toContain('bagTotal: number')
  })
})

describe('工作台补剂订单 · 列表页', () => {
  it('覆盖后端全部 8 个状态，一个都不能漏', () => {
    // 漏掉某个状态，那个状态的订单在这张列表里就会"消失"
    for (const value of [
      'PENDING_PAYMENT',
      'PAID',
      'PACKING',
      'PACKED',
      'SHIPPED',
      'COMPLETED',
      'AFTERSALE',
      'CANCELLED',
    ]) {
      expect(listSource).toContain(`value: '${value}'`)
    }
  })

  it('三段待办可点筛选，对应三个真正需要人动手的状态', () => {
    expect(listSource).toContain("selectStatus('PENDING_PAYMENT')")
    expect(listSource).toContain("selectStatus('PAID')")
    expect(listSource).toContain("selectStatus('PACKED')")
  })

  it('每个状态都给出了下一步该做什么的提示', () => {
    expect(listSource).toContain('下一步：确认收款')
    expect(listSource).toContain('下一步：分装并打标签')
    expect(listSource).toContain('下一步：填单号发货')
  })

  it('加载失败不静默，要给提示', () => {
    expect(listSource).toContain("uni.showToast({ title: '加载失败', icon: 'none' })")
  })
})

describe('工作台补剂订单 · 详情页', () => {
  it('分装表单每个补剂一条，批号可空、原瓶到期日必填', () => {
    expect(detailSource).toContain('sourceExpiryDate')
    // 缺到期日必须挡住，否则后端会退回来、白填一遍
    expect(detailSource).toContain('没填原瓶到期日')
  })

  it('已分装过的补剂带出原值，补打标签时不用重填', () => {
    expect(detailSource).toContain('item.sourceExpiryDate')
  })

  it('按状态给不同操作：待收款→确认收款，待发货→打印标签与发货', () => {
    expect(detailSource).toContain("order.status === 'PENDING_PAYMENT'")
    expect(detailSource).toContain("order.status === 'PACKED'")
    expect(detailSource).toContain('确认收款')
    expect(detailSource).toContain('打印标签')
  })

  it('打印标签入口把订单 ID 带过去', () => {
    expect(detailSource).toContain('/pages/staff-supplement-orders/labels?id=')
  })
})

describe('工作台补剂订单 · 视觉规范', () => {
  it('没有回到已废弃的蓝紫配色', () => {
    for (const retired of ['#1890ff', '#4a90d9', '#667eea', '#764ba2', '#6c4bbb']) {
      expect(listSource).not.toContain(retired)
      expect(detailSource).not.toContain(retired)
    }
  })

  it('新图标存在且是包内资源（不引外链）', () => {
    expect(existsSync(resolve(__dirname, '../static/ui-icons/supplement-orders.png'))).toBe(true)
    expect(listSource).not.toContain('http://')
  })
})
