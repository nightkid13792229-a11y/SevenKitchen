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
const supplementDetail = readFileSync(
  resolve(__dirname, 'staff-supplement-orders/detail.vue'),
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
    // 数组现在跨多行，按块取，不能只看 CUSTOM_RECIPE: [ 那一行
    const from = orderCenter.indexOf('CUSTOM_RECIPE: [')
    const to = orderCenter.indexOf('SUPPLEMENT: [')
    expect(from).toBeGreaterThan(-1)
    const customBlock = orderCenter.slice(from, to)
    expect(customBlock).not.toContain("'TO_SHIP'")
    expect(customBlock).not.toContain("'SHIPPED'")
  })

  it('★ 已付款 / 采购中 / 生产中 / 制作中都能单独筛，不再有「处理中」', () => {
    expect(orderCenter).toContain("{ label: '已付款', value: 'PAID' }")
    expect(orderCenter).toContain("{ label: '采购中', value: 'PURCHASING' }")
    expect(orderCenter).toContain("{ label: '生产中', value: 'IN_PRODUCTION' }")
    expect(orderCenter).toContain("{ label: '制作中', value: 'MAKING' }")
    expect(orderCenter).not.toContain("label: '处理中'")
  })

  it('★ 待付款、已取消都能单独筛；草稿「待处理」已移除', () => {
    expect(orderCenter).toContain("{ label: '待付款', value: 'PENDING_PAYMENT' }")
    expect(orderCenter).toContain("{ label: '已取消', value: 'CANCELLED' }")
    // 2026-11-08：草稿单（INIT）不是员工待办，入口和列表一起撤掉
    expect(orderCenter).not.toContain("{ label: '待处理', value: 'PENDING' }")
    expect(orderCenter).not.toContain("'PENDING'")
  })

  it('★ 卡片写真实阶段（已付款/采购中/生产中），不再统一写「处理中」', () => {
    expect(orderCenter).toContain('item.stageLabel || item.statusLabel')
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

  it('★ 已结束的售后也要标出来（退款成功后订单会变成「已取消」）', () => {
    // 有文案就显示，不再只看 hasOpenAftersale
    expect(orderCenter).toContain('item.aftersaleLabel && item.aftersaleLabel !== item.stageLabel')
    expect(orderCenter).toContain(':class="item.hasOpenAftersale ? \'aftersale\' : \'aftersale-closed\'"')
    expect(orderCenter).toContain('.mini-tag.aftersale-closed')
  })
})

describe('staff order center · 补剂订单详情里的售后记录', () => {
  it('★ 补剂订单详情列出这单的全部售后（诉求 / 原因 / 补发单）', () => {
    expect(supplementDetail).toContain('售后记录')
    expect(supplementDetail).toContain('order.aftersaleCases')
    expect(supplementDetail).toContain('requestedReason')
    expect(supplementDetail).toContain('reshipOrderNo')
    expect(supplementDetail).toContain('aftersaleTypeText')
  })

  it('★ 售后状态用跟后台一致的说法，进行中才高亮', () => {
    expect(supplementDetail).toContain("RESOLVED: '已解决'")
    expect(supplementDetail).toContain("REJECTED: '已驳回'")
    expect(supplementDetail).toContain("CANCELLED: '已撤回'")
    expect(supplementDetail).toContain("? 'is-open' : 'is-closed'")
  })

  it('★ 列表点「发货」进来，PAID / PACKED 都要自动弹填单号', () => {
    // 2026-11-08：补剂 PAID 也算待发货；只认 PACKED 会让入口像没反应
    expect(supplementDetail).toContain(
      "['PAID', 'PACKED'].includes(order.value?.status || '')",
    )
  })

  it('★ 员工端不展示退款金额（后端已脱敏，前端也别画出来）', () => {
    expect(supplementDetail).not.toContain('record.refundAmount')
    expect(supplementDetail).not.toContain('refundOutNo')
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
    // 2026-11-10：攒了合并选择后整块收起（整张卡都是勾选热区），条件多了一层
    expect(orderCenter).toContain(
      'v-if="!mergeMode && (canShipItem(item) || canOpenRecipe(item) || canOpenDog(item))"',
    )
    expect(orderCenter).toContain('return Boolean(item.itemId || item.recipeId)')
    expect(orderCenter).toContain('return Boolean(item.dogId)')
  })

  it('★ 待发货的单在列表上就能点「发货」', () => {
    expect(orderCenter).toContain("item.statusGroup === 'TO_SHIP'")
    expect(orderCenter).toContain('function openShip(item: OrderCenterItem)')
    expect(orderCenter).toContain('&action=ship')
    expect(orderCenter).toContain('class="entry primary"')
  })

  it('入口点击不会连带触发整张卡片的跳转', () => {
    expect(orderCenter).toContain('@tap.stop="openRecipe(item)"')
    expect(orderCenter).toContain('@tap.stop="openDog(item)"')
  })

  it('★ 三类卡片都显示顾客姓名和狗狗名，但手机号仍不显示', () => {
    expect(orderCenter).toContain('v-if="item.recipeName"')
    expect(orderCenter).toContain('{{ item.recipeName }}')
    // 2026-11-02：不再只限鲜食，补剂/定制卡片也显示这一行
    expect(orderCenter).toContain('v-if="item.customerName || item.dogName"')
    expect(orderCenter).not.toContain(
      `v-if="item.type === 'FOOD' && (item.customerName || item.dogName)"`,
    )
    expect(orderCenter).toContain('{{ item.customerName }}')
    expect(orderCenter).toContain('{{ item.dogName }}')
    expect(orderCenter).toContain('顾客 ')
    expect(orderCenter).toContain('狗狗 ')
    expect(orderCenter).not.toContain('item.customerPhone')
  })

  it('★ 卡片上只留下单时间，并且用小字说明是「下单时间」', () => {
    expect(orderCenter).toContain('class="time-label"')
    expect(orderCenter).toContain('下单时间')
    // 生产日/分装日不再放到卡片上
    expect(orderCenter).not.toContain('item.scheduledDate')
    expect(orderCenter).not.toContain("'分装'")
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

  it('★ 不再单开「进行中的问题」，但"还没好"要标在就诊记录上', () => {
    expect(dogPage).not.toContain('进行中的问题')
    expect(dogPage).not.toContain('ongoingConditions')
    expect(dogPage).toContain('isOngoingStatus(item.status)')
    expect(dogPage).toContain("['治疗中', '慢性', '未标注结果']")
  })
})

describe('staff order center · 关键词搜索', () => {
  it('★ 把老「后台订单」的关键词搜索平移过来', () => {
    expect(orderCenter).toContain('searchKeyword')
    expect(orderCenter).toContain('performSearch')
    expect(orderCenter).toContain('订单号 / 姓名 / 手机号 / 狗狗名')
    expect(orderCenter).toContain(
      'keyword: searchKeyword.value.trim() || undefined',
    )
  })

  it('清空关键词后重新查询，不会把上一次的结果留在列表里', () => {
    expect(orderCenter).toContain('clearSearchKeyword')
    expect(orderCenter).toContain("searchKeyword.value = ''")
  })
})

describe('staff order center · 定制单卡片（2026-11-08 老板点开报「订单加载失败」）', () => {
  it('★ 不再把定制单卡片指到顾客侧订单详情页（那页只认 orderId、只给下单顾客看）', () => {
    expect(orderCenter).not.toContain('/pages/custom-recipe/order-detail')
  })

  it('★ 定制单卡片点开的是这单交付的食谱；还没交付就给提示，不跳空页', () => {
    const openOrder =
      orderCenter.match(/function openOrder[\s\S]*?\n\}/)?.[0] || ''

    expect(openOrder).toContain('CUSTOM_RECIPE')
    expect(openOrder).toContain('openRecipe(item)')
    expect(openOrder).toContain('这单还没交付食谱')
  })
})

describe('staff order center · 返回列表不显示旧状态（2026-11-08 老板反馈）', () => {
  it('★ 页面每次显示都重新拉列表，从详情页返回不再是进去之前那一份', () => {
    expect(orderCenter).toContain("import { onShow } from '@dcloudio/uni-app'")
    expect(orderCenter).toMatch(/onShow\(\(\) => \{[\s\S]*?load\(\)/)
    // 只在 onMounted 加载一次，正是「详情页点了无需发货、列表还写待发货」的根因
    expect(orderCenter).not.toContain('onMounted(')
  })
})

describe('staff order center · 头部精简（2026-11-08 老板要求）', () => {
  it('★ 代客下单不再单独占一行，收成标题右侧的小按钮，文案只有「代客下单」', () => {
    expect(orderCenter).toContain('class="assist-btn"')
    expect(orderCenter).not.toContain('class="assist-entry"')
    // 原来那行说明文字跟着一起下掉，按钮上不再带「＋」和箭头
    expect(orderCenter).not.toContain('帮顾客补一单成品鲜食')
    expect(orderCenter).not.toContain('assist-arrow')
    expect(orderCenter).not.toMatch(/＋\s*代客下单/)
  })

  it('★ 右上角的「刷新」已删（进页面/返回/换筛选都会自动拉最新数据）', () => {
    expect(orderCenter).not.toContain('>刷新<')
    expect(orderCenter).not.toContain('class="refresh"')
  })
})

describe('staff order center · 合并 / 拆分发货入口（2026-11-10）', () => {
  it('★ 点「合并发货」先把列表收到鲜食 / 待发货，免得满屏都是勾不动的单', () => {
    const toggle = orderCenter.match(/function toggleMergeMode[\s\S]*?\n\}/)?.[0] || ''
    expect(toggle).toContain("type.value = 'FOOD'")
    expect(toggle).toContain("status.value = 'TO_SHIP'")
  })

  it('★ 开过「只看售后」也能合并：进入选择态必须把售后过滤关掉', () => {
    const toggle = orderCenter.match(/function toggleMergeMode[\s\S]*?\n\}/)?.[0] || ''
    // 后端 foodStatusWhere 里 aftersale 会直接覆盖 status（order-center.service.ts），
    // 不关掉的话列表只剩售后单，整页勾不动 —— 2026-11-10 独立评审发现
    expect(toggle).toContain('onlyAftersale.value = false')
    expect(toggle).toMatch(/needReload =\s*onlyAftersale\.value \|\|/)
  })

  it('★ 列表上有「合并发货」开关；不点它时点卡片还是进详情', () => {
    expect(orderCenter).toContain('class="merge-toggle"')
    expect(orderCenter).toContain('toggleMergeMode')
    const cardTap = orderCenter.match(/function onCardTap[\s\S]*?\n\}/)?.[0] || ''
    expect(cardTap).toContain('mergeMode.value')
    expect(cardTap).toContain('openOrder(item)')
  })

  it('★ 只有「待发货的鲜食」能进合并；补剂 / 定制 / 其它阶段都拦住', () => {
    const guard = orderCenter.match(/function canMergeItem[\s\S]*?\n\}/)?.[0] || ''
    expect(guard).toContain("item.type === 'FOOD'")
    expect(guard).toContain("item.statusGroup === 'TO_SHIP'")
    const cardTap = orderCenter.match(/function onCardTap[\s\S]*?\n\}/)?.[0] || ''
    expect(cardTap).toContain('只有待发货的鲜食单能合并')
    // 已经勾上的单永远能取消（哪怕期间被别处发了）
    expect(cardTap.indexOf('indexOf')).toBeGreaterThan(-1)
    expect(cardTap.indexOf('indexOf')).toBeLessThan(cardTap.indexOf('canMergeItem'))
  })

  it('★ 勾第二张前先比顾客；不同顾客直接提示，不让人白填一屏运单', () => {
    expect(orderCenter).toContain('customerId')
    const cardTap = orderCenter.match(/function onCardTap[\s\S]*?\n\}/)?.[0] || ''
    expect(cardTap).toContain('customerId')
    expect(cardTap).toContain('不是同一个顾客')
    // 取消到一张不剩时，顾客锚点也要清空，否则会拿上一轮的顾客误拦
    const reset = orderCenter.match(/function resetMergeSelection[\s\S]*?\n\}/)?.[0] || ''
    expect(reset).toContain('selectedCustomerId.value = null')
  })

  it('★ 勾完点「去发货」进「发货单」页，一票最多 10 单', () => {
    expect(orderCenter).toContain('/pages/staff-orders/batch-ship?orderIds=')
    expect(orderCenter).toContain('const MAX_MERGE_ORDERS = 10')
    // 上限必须真的用 >= 比较，且把勾到的单全部带过去
    const cardTap = orderCenter.match(/function onCardTap[\s\S]*?\n\}/)?.[0] || ''
    expect(cardTap).toContain('selectedOrderIds.value.length >= MAX_MERGE_ORDERS')
    expect(orderCenter).toContain("selectedOrderIds.value.join(',')")
    expect(orderCenter).toContain('一票最多')
    expect(orderCenter).toContain('已选')
    expect(orderCenter).toContain('同一收货地址才能合并')
  })

  it('★ 换类型 / 状态 / 搜索、从详情返回都清掉勾选，不带着上次的选择', () => {
    const reset = orderCenter.match(/function resetMergeSelection[\s\S]*?\n\}/)?.[0] || ''
    expect(reset).toContain('selectedOrderIds.value = []')
    for (const fn of ['switchType', 'switchStatus', 'performSearch', 'toggleAftersale']) {
      const body = orderCenter.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n\\}`))?.[0] || ''
      expect(body, `${fn} 应该清掉勾选`).toContain('resetMergeSelection()')
    }
    // 有界截取：无界 [\s\S]*? 会跨到文件后面任意一个 load()，等于没守住 onShow
    const onShow = orderCenter.match(/onShow\(\(\) => \{[\s\S]{0,600}?\n\}\)/)?.[0] || ''
    expect(onShow).toContain('load()')
    // 切微信回前台也会触发 onShow：只应在「从发货单返回」时清空，
    // 否则老板勾了 8 单去看一眼消息，回来全没了（2026-11-10 独立评审发现）
    expect(onShow).toContain('leavingForShipment')
    expect(onShow).toContain('if (leavingForShipment)')
    const start = orderCenter.match(/function startMergeShipment[\s\S]*?\n\}/)?.[0] || ''
    expect(start).toContain('leavingForShipment = true')
    expect(start).toContain('leavingForShipment')
  })
})

/**
 * 2026-11-10：旧「后台订单」列表下线时，管理员靠这个词挑退款单；
 * 平移回订单中心，口径不变（鲜食单 + 售后中 + 退款类型）。
 */
describe('staff order center · 退款待审核', () => {
  it('管理员才看得到「退款待审核」，员工看不到', () => {
    expect(orderCenter).toContain('class="mini-tag refund-review"')
    expect(orderCenter).toContain('isAdmin && item.needsRefundReview')
    expect(orderCenter).toContain("const isAdmin = getStoredUser()?.role === 'ADMIN'")
    expect(orderCenter).toContain('退款待审核')
    // 标签颜色比「售后中」的橙色更急
    expect(orderCenter).toContain('.mini-tag.refund-review')
  })

  it('接口没返回这个字段时按 false 处理，标签不冒出来', () => {
    expect(orderCenter).toContain('needsRefundReview?: boolean')
  })
})

/**
 * 2026-11-11：老板要求 —— 列表点「发货」别再跳到详情页。
 * 一天多单时，跳进去再退回来每单多点两下。
 */
describe('staff order center · 列表直接发货', () => {
  it('鲜食单在列表里开抽屉，不再跳详情页', () => {
    expect(orderCenter).toContain('StaffShipDrawer')
    expect(orderCenter).toContain('async function openShipDrawer')
    expect(orderCenter).toContain('shipDrawerVisible.value = true')
    // 先拉一次当前地址（列表卡片上只有地址摘要）
    expect(orderCenter).toContain('/admin/orders/${encodeURIComponent(item.id)}')
    // 老做法「跳详情 + 自动打开弹窗」已删掉
    expect(orderCenter).not.toContain(
      '/pages/staff-orders/detail?id=${encodeURIComponent(item.id)}&action=ship',
    )
  })

  it('发完货留在列表：关掉抽屉刷新，接着发下一单', () => {
    expect(orderCenter).toContain('function onShipped()')
    expect(orderCenter).toContain('shipDrawerVisible.value = false')
    expect(orderCenter).toContain('load()')
  })

  it('地址不对时仍去详情页改（列表没有地址面板）', () => {
    expect(orderCenter).toContain('function onFixAddress()')
    expect(orderCenter).toContain('/pages/staff-orders/detail?id=')
    expect(orderCenter).toContain('@fix-address="onFixAddress"')
  })

  it('补剂单仍走它自己的详情页（分装/发货流程不同）', () => {
    expect(orderCenter).toContain(
      '/pages/staff-supplement-orders/detail?id=${encodeURIComponent(item.id)}&action=ship',
    )
  })
})
