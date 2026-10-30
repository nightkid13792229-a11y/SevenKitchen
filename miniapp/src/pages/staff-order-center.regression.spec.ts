import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const orderCenter = readFileSync(
  resolve(__dirname, 'staff-order-center/index.vue'),
  'utf8',
)
const snapshotPage = readFileSync(
  resolve(__dirname, 'staff-recipe-snapshot/index.vue'),
  'utf8',
)
const dogPage = readFileSync(
  resolve(__dirname, 'staff-dog-profile/index.vue'),
  'utf8',
)

describe('staff order center · 三类订单一眼分开', () => {
  it('三类各一个颜色（卡片左侧色条 + 类型标签同色）', () => {
    expect(orderCenter).toContain("FOOD: { label: '鲜食', className: 'is-food' }")
    expect(orderCenter).toContain(
      "CUSTOM_RECIPE: { label: '定制', className: 'is-custom' }",
    )
    expect(orderCenter).toContain(
      "SUPPLEMENT: { label: '补剂', className: 'is-supp' }",
    )
    expect(orderCenter).toContain('class="type-bar"')
    expect(orderCenter).toContain('.order-card.is-custom .type-bar')
    expect(orderCenter).toContain('.order-card.is-supp .type-bar')
  })

  it('状态栏按类型收窄：定制没有待发货/已发货', () => {
    expect(orderCenter).toContain('TYPE_STATUS_VALUES')
    const customLine = orderCenter
      .split('\n')
      .find((line) => line.includes('CUSTOM_RECIPE: ['))
    expect(customLine).toBeTruthy()
    expect(customLine).not.toContain("'TO_SHIP'")
    expect(customLine).not.toContain("'SHIPPED'")
  })

  it('待付款、已取消都能单独筛', () => {
    expect(orderCenter).toContain("{ label: '待付款', value: 'PENDING_PAYMENT' }")
    expect(orderCenter).toContain("{ label: '已取消', value: 'CANCELLED' }")
    expect(orderCenter).toContain("{ label: '待处理', value: 'PENDING' }")
  })

  it('换类型后当前状态不存在时自动回到「全部」', () => {
    expect(orderCenter).toContain('if (!allowed.includes(status.value)) status.value = \'\'')
  })
})

describe('staff order center · 售后单独筛', () => {
  it('有「只看售后」开关，并把 aftersale 传给后端', () => {
    expect(orderCenter).toContain('只看售后')
    expect(orderCenter).toContain('aftersale: onlyAftersale.value ? true : undefined')
  })

  it('卡片上标出未完结售后和赠送单（¥0 不会被当成价格出错）', () => {
    expect(orderCenter).toContain('item.hasOpenAftersale')
    expect(orderCenter).toContain('item.isGift')
  })
})

describe('staff order center · 食谱 / 狗狗入口', () => {
  it('鲜食按订单项进「下单快照」页', () => {
    expect(orderCenter).toContain('/pages/staff-recipe-snapshot/index?itemId=')
    expect(orderCenter).toContain('看下单食谱')
  })

  it('定制按交付冻结的版本打开食谱（带 orderId）', () => {
    expect(orderCenter).toContain('&orderId=')
    expect(orderCenter).toContain("item.type === 'CUSTOM_RECIPE'")
  })

  it('没有可看的食谱/狗狗时整块入口不出现，而不是置灰', () => {
    expect(orderCenter).toContain('v-if="canOpenRecipe(item) || canOpenDog(item)"')
    expect(orderCenter).toContain('return Boolean(item.itemId || item.recipeId)')
    expect(orderCenter).toContain('return Boolean(item.dogId)')
  })

  it('入口点击不会连带触发整张卡片的跳转', () => {
    expect(orderCenter).toContain('@tap.stop="openRecipe(item)"')
    expect(orderCenter).toContain('@tap.stop="openDog(item)"')
  })

  it('★ 卡片主行显示食谱名，不再显示顾客名和手机号', () => {
    expect(orderCenter).toContain('v-if="item.recipeName"')
    expect(orderCenter).toContain('{{ item.recipeName }}')
    expect(orderCenter).not.toContain('item.customerName')
    expect(orderCenter).not.toContain('item.customerPhone')
  })
})

describe('staff order center · 两个只读页', () => {
  it('快照页走员工端专用接口，并写明这是历史数据', () => {
    expect(snapshotPage).toContain('/admin/order-center/items/')
    expect(snapshotPage).toContain('/snapshot')
    expect(snapshotPage).toContain('不代表当前最新配方')
    expect(snapshotPage).toContain('下单快照 · 只读')
  })

  it('狗狗档案页走员工端健康档案接口，且没有任何写操作', () => {
    expect(dogPage).toContain('/admin/dogs/')
    expect(dogPage).toContain('/health-overview')
    expect(dogPage).toContain('不能修改顾客的狗狗档案')
    expect(dogPage).not.toContain("method: 'POST'")
    expect(dogPage).not.toContain("method: 'PUT'")
    expect(dogPage).not.toContain("method: 'DELETE'")
    expect(dogPage).not.toContain('uni.showModal')
  })

  it('★ 狗狗档案页关掉 AI 分析（否则要等十几秒，15 秒就超时）', () => {
    expect(dogPage).toContain("includeAnalysis: '0'")
  })

  it('★ 狗狗档案页去掉健康标签和饮食板块，补上每日餐数与活动量', () => {
    expect(dogPage).not.toContain('健康标签')
    expect(dogPage).not.toContain('爱吃')
    expect(dogPage).not.toContain('不吃')
    expect(dogPage).toContain('dog.mealsPerDay')
    expect(dogPage).toContain('dog.activityLevelLabel')
  })
})
