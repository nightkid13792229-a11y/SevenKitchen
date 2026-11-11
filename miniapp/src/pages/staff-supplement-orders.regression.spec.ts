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

  it('管理员可以在详情页直接处理售后：走 admin resolve 接口', () => {
    expect(apiSource).toContain(
      '`/admin/supplement-shop/aftersales/${caseId}/resolve`',
    )
    expect(apiSource).toContain(
      "resolutionType: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT'",
    )
    expect(detailSource).toContain('isAdmin')
    expect(detailSource).toContain('canResolve')
    expect(detailSource).toContain('resolveAftersale')
    expect(detailSource).toContain('同意退款')
    expect(detailSource).toContain('驳回')
  })

  it('2026-11-02 起详情页不再提交分装工单：不填批号、不选原瓶到期日', () => {
    // 分装工单整块删掉；员工只用「打印标签」和「发货」。
    expect(detailSource).not.toContain('分装工单')
    expect(detailSource).not.toContain('sourceExpiryDate')
    expect(detailSource).not.toContain('batchNo')
    expect(detailSource).not.toContain('原瓶到期日')
    expect(detailSource).not.toContain('提交分装结果')
  })

  it('标签数据带 bagIndex / bagTotal（加量后一个补剂多袋，每袋一张）', () => {
    expect(apiSource).toContain('bagIndex: number')
    expect(apiSource).toContain('bagTotal: number')
  })
})

describe('工作台补剂订单 · 列表页', () => {
  it('状态文案覆盖后端全部 8 个状态，一个都不能漏', () => {
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
      expect(listSource).toContain(`${value}:`)
    }
  })

  it('三段待办可点筛选：待收款 / 待发货 / 已发货', () => {
    expect(listSource).toContain("selectStatus('PENDING_PAYMENT')")
    expect(listSource).toContain("selectStatus('TO_SHIP')")
    expect(listSource).toContain("selectStatus('SHIPPED')")
  })

  it('待发货是一个合并分组，不再让员工区分待分装/分装中/已分装', () => {
    expect(listSource).toContain("{ label: '待发货', value: 'TO_SHIP' }")
    expect(listSource).toContain('toShipCount')
    expect(listSource).toContain("counts.value.PAID")
    expect(listSource).toContain("counts.value.PACKED")
  })

  it('有未完结售后时，列表卡片挂「售后中/退款中」', () => {
    // 新售后不改订单 status，必须读后端派生的 hasOpenAftersale
    expect(listSource).toContain('order.hasOpenAftersale')
    expect(listSource).toContain('order.openAftersaleLabel')
  })

  it('每个状态都给出了下一步该做什么的提示', () => {
    expect(listSource).toContain('下一步：确认收款')
    expect(listSource).toContain('下一步：打印标签并发货')
  })

  it('加载失败不静默，要给提示', () => {
    expect(listSource).toContain("uni.showToast({ title: '加载失败', icon: 'none' })")
  })
})

describe('工作台补剂订单 · 详情页', () => {
  it('已付款就直接给「打印标签」和「发货」，不再要求先分装', () => {
    expect(detailSource).toContain("['PAID', 'PACKING', 'PACKED']")
    expect(detailSource).toContain('canShip')
    expect(detailSource).toContain('打印标签')
    expect(detailSource).toContain('发货')
  })

  it('只保留待收款的两个动作：确认收款 / 取消订单', () => {
    expect(detailSource).toContain("order.status === 'PENDING_PAYMENT'")
    expect(detailSource).toContain('确认收款')
    expect(detailSource).toContain('取消订单')
  })

  it('打印标签入口把订单 ID 带过去', () => {
    expect(detailSource).toContain('/pages/staff-supplement-orders/labels?id=')
  })

  it('有未完结售后时，状态旁边挂「售后中/退款中」', () => {
    expect(detailSource).toContain('openAftersaleLabel')
    expect(detailSource).toContain("['PENDING', 'PROCESSING']")
    expect(detailSource).toContain('退款中')
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

/**
 * 标签打印页（labels.vue）。
 *
 * 锁住三件容易被悄悄改坏的事：
 *   1. 路由注册 —— 详情页按钮指过来，注册漏了就是白屏
 *   2. 后端文案透传 —— 「请先完成分装，再打印标签」被吞成「加载失败」= 现场不知道干什么
 *   3. 一张一张打 —— 每张标签内容不同（第几袋/共几袋），份数必须固定 1
 */
describe('工作台补剂订单 · 标签打印页', () => {
  const labelsSource = readFileSync(
    resolve(__dirname, 'staff-supplement-orders/labels.vue'),
    'utf8',
  )
  const pagesConfig = JSON.parse(readFileSync(resolve(__dirname, '../pages.json'), 'utf8'))
  const printUtilSource = readFileSync(
    resolve(__dirname, '../utils/supplement-label-print.ts'),
    'utf8',
  )

  it('在补剂订单分包里注册了 labels 页，标题与自定义导航和同分包其他页一致', () => {
    const subPackage = pagesConfig.subPackages.find(
      (item: { root: string }) => item.root === 'pages/staff-supplement-orders',
    )

    expect(subPackage).toBeTruthy()
    const labelsRoute = subPackage.pages.find((page: { path: string }) => page.path === 'labels')

    expect(labelsRoute).toBeTruthy()
    expect(labelsRoute.style.navigationBarTitleText).toBe('补剂标签')
    expect(labelsRoute.style.navigationStyle).toBe('custom')
    expect(existsSync(resolve(__dirname, 'staff-supplement-orders/labels.vue'))).toBe(true)
  })

  it('调用后端标签图片接口，并关掉全局 toast 以免顶掉后端文案', () => {
    expect(apiSource).toContain('labelImages(orderId: string)')
    expect(apiSource).toContain('`/admin/supplement-shop/orders/${orderId}/labels/images`')
    expect(apiSource).toContain('suppressErrorToast: true')
    expect(apiSource).toContain('imageBase64: string')
  })

  it('复用鲜食打印页那套能力：隐藏 canvas + 组件代理 + jcPrinter', () => {
    // 用**分包内的本地副本**，不是主包那份：精臣 SDK 有 180KB+，
    // 是员工打标签才用得到的能力，不该让每个顾客首次打开小程序就下载。
    // （鲜食那边 staff-production 也是同样的做法。）
    expect(labelsSource).toContain("import jcPrinter from './utils/jcing-printer'")
    expect(labelsSource).not.toContain("from '../../utils/jcing-printer'")
    expect(
      existsSync(resolve(__dirname, 'staff-supplement-orders/utils/jcing-printer.ts')),
    ).toBe(true)
    expect(labelsSource).toContain('canvas-id="labelCanvas"')
    expect(labelsSource).toContain('getCurrentInstance()')
    expect(labelsSource).toContain('componentProxy')
    expect(labelsSource).toContain('onReady(')
    expect(labelsSource).toContain('jcPrinter.autoConnect()')
    expect(labelsSource).toContain('connectPrinter')
    // 鲜食那套只读参考，不能反向依赖过去。
    // 只查 import：注释里提到"staff-production"是说明性文字，不该被判违规
    // （本会话已经被这种注释污染误伤过好几次了）。
    expect(labelsSource).not.toMatch(/from\s+['"][^'"]*staff-production/)
  })

  it('一张一张打：份数固定 1，打印中带「第几张/共几张」进度', () => {
    expect(labelsSource).toContain('jcPrinter.printLabelFromImage(')
    expect(labelsSource).toContain('label.imageBase64, 1, CANVAS_ID, componentProxy.value')
    expect(labelsSource).toContain('buildPrintProgressTitle')
    expect(labelsSource).toContain('uni.showLoading({ title: progressTitle')
    expect(printUtilSource).toContain('打印中 ${index + 1}/${total}')
  })

  it('全部打印一张张走完，中途失败要停下并说清是哪种失败', () => {
    expect(labelsSource).toContain('runPrintQueue')
    expect(labelsSource).toContain('showPrintFailure')
    // 上一个任务没吐完就发下一个，精臣 SDK 会报"SDK忙"
    expect(labelsSource).toContain('PRINT_GAP_MS')
    expect(labelsSource).toContain('describeLabelPrintFailure')
    // 三类失败各有各的文案：现场要做的事完全不同
    expect(printUtilSource).toContain('打印机未连接')
    expect(printUtilSource).toContain('图片生成失败')
    expect(printUtilSource).toContain('打印超时')
  })

  it('每张都能单张补打，并标出是第几张', () => {
    expect(labelsSource).toContain('补打这一张')
    expect(labelsSource).toContain('handleReprint')
    expect(labelsSource).toContain('{{ index + 1 }} / {{ labels.length }}')
    expect(labelsSource).toContain('共 {{ labels.length }} 张标签')
  })

  it('加载中 / 加载失败可重试；不再要求先分装才能打标签', () => {
    expect(labelsSource).toContain('加载中')
    expect(labelsSource).toContain('@tap="fetchLabels"')
    expect(labelsSource).toContain('{{ loadError }}')
    // 2026-11-02：分装工单取消后，标签直接从订单生成，不存在「先分装」的拦截
    expect(labelsSource).not.toContain('packRequired')
    expect(labelsSource).not.toContain('请先回订单详情填分装结果')
  })

  it('预览用后端返回的图片，不新增任何图片资源', () => {
    expect(labelsSource).toContain('previewSrcs[index]')
    expect(labelsSource).toContain('mode="widthFix"')
    expect(labelsSource).not.toContain('/static/')
  })

  it('沿用补剂分装的墨绿金色配色，不出现废弃的蓝色系', () => {
    for (const retired of ['#1890ff', '#4a90d9', '#1677ff', '#1989fa', '#40a9ff']) {
      expect(labelsSource).not.toContain(retired)
    }
    expect(labelsSource).toContain('#1e3a2f')
    expect(labelsSource).toContain('#f7f8f2')
    expect(labelsSource).toContain('#a97c33')
  })
})

/**
 * 2026-11-11：补剂发货并进和鲜食共用的发货抽屉。
 * 以前是页面里自己一套弹窗，表单、存根核对、提交都要各自维护。
 */
describe('补剂发货 · 共用发货抽屉', () => {
  const shipDrawerSource = readFileSync(
    resolve(__dirname, '../components/shipping/StaffShipDrawer.vue'),
    'utf8',
  )
  const shipSubmitSource = readFileSync(
    resolve(__dirname, '../api/ship-submit.ts'),
    'utf8',
  )

  it('详情页用共用抽屉，自己那套发货表单删干净', () => {
    expect(detailSource).toContain('StaffShipDrawer')
    expect(detailSource).toContain('kind="supplement"')
    // 旧弹窗的字段不该再出现在页面里
    expect(detailSource).not.toContain("'NOT_REQUIRED'>无需发货")
    expect(detailSource).not.toContain('shipTracking')
    expect(detailSource).not.toContain('shipCarrierIndex')
    // 地址仍由页面自己改：抽屉只发信号
    expect(detailSource).toContain('@fix-address="openAddressEditor"')
    expect(detailSource).toContain(':address-revision="shipAddressRevision"')
  })

  it('地址改完会让存根结论作废（改的是同一套核对口径）', () => {
    expect(detailSource).toContain('shipAddressRevision.value += 1')
    expect(shipDrawerSource).toContain('() => props.addressRevision')
    expect(shipDrawerSource).toContain('resetReceiptState(receipt)')
  })

  it('★ 补剂发货结果里的微信上报状态直接用，不再重复调上报接口', () => {
    expect(shipSubmitSource).toContain('wechatShippingUpload')
    expect(shipSubmitSource).toContain("kind === 'supplement'")
    expect(shipSubmitSource).toContain('staffSupplementOrderApi.ship')
    // 鲜食仍走自己的发货接口 + 单独上报
    expect(shipSubmitSource).toContain('/admin/orders/${orderId}/ship')
    expect(shipSubmitSource).toContain('/staff/shipping/orders/${orderId}/wechat-shipping-upload')
  })
})
