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

  it('加载中 / 加载失败可重试 / 未分装时给出回去填分装的出口', () => {
    expect(labelsSource).toContain('加载中')
    expect(labelsSource).toContain('@tap="fetchLabels"')
    expect(labelsSource).toContain('{{ loadError }}')
    expect(labelsSource).toContain('packRequired')
    expect(labelsSource).toContain('请先回订单详情填分装结果')
    expect(labelsSource).toContain('goToOrderDetail')
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
