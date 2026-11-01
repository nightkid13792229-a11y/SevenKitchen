import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readPage(pagePath: string) {
  return readFileSync(resolve(process.cwd(), pagePath), 'utf-8')
}

/**
 * 补剂购买链路回归。
 *
 * 锁住 2026-09-22 这一轮的改动，避免以后被无意改回：
 *   · 费用只给一个最终价格，不再逐项摊开货款 / 服务费 / 运费
 *   · 包邮状态来自服务端，不写死
 *   · 两个页面的空态都要有出口
 *   · 多种补剂要能全选，且不可购买的不能被选中
 */
describe('supplement purchase regressions', () => {
  describe('补剂下单页', () => {
    const source = readPage('src/pages/supplement-order/index.vue')
    const template = source.slice(0, source.indexOf('<script setup'))

    it('费用逐项展示：商品金额、分装服务费、运费、合计', () => {
      expect(template).toContain('补剂商品金额')
      expect(template).toContain('分装服务费')
      expect(template).toContain('运费')
      expect(template).toContain('合计')
    })

    it('包邮时运费显示「包邮」，状态来自服务端', () => {
      expect(template).toContain('包邮')
      expect(template).toContain('summary.freeShipping')
    })

    it('空态给出可点的出口', () => {
      expect(template).toContain('去我的制作单')
      expect(source).toContain("uni.navigateTo({ url: '/pages/diy-sheet-list/index' })")
    })

    it('首次报价期间有加载态，不会显示成空白页', () => {
      expect(template).toContain('正在核对补剂')
      expect(template).toContain('initializing')
    })

    it('补剂全部不可购买时逐条给出原因与出口', () => {
      expect(template).toContain('这些补剂暂时无法购买')
      expect(template).toContain('item.reason')
      expect(template).toContain('返回我的制作单')
    })

    it('多种补剂时提供全选/全不选，且只作用于可购买的行', () => {
      expect(template).toContain('全选')
      expect(template).toContain('全不选')
      expect(source).toContain('allSelectableSelected')
    })

    it('支付成功与降级人工收款，两种弹窗文案各自成立', () => {
      const paidBlock = source.slice(
        source.indexOf('function showPaidModal'),
        source.indexOf('function showManualConfirmModal'),
      )
      const manualBlock = source.slice(source.indexOf('function showManualConfirmModal'))

      expect(paidBlock).toContain('我们会尽快分装发货')
      expect(paidBlock).not.toContain('确认收款')
      expect(manualBlock).toContain('我们会尽快与你确认收款')
    })

    it('报价失败时行内提示 + 重试，不再弹通用 toast', () => {
      expect(template).toContain('价格没拿到')
      expect(source).toContain('onRetryQuote')
      expect(source).not.toContain('报价失败，请稍后重试')
      expect(source).not.toContain('价格重算失败，请稍后重试')
    })

    it('提交后按支付结果分流，通道不可用时降级人工确认', () => {
      expect(source).toContain('runSupplementPayment')
      expect(source).toContain('showPaidModal')
      expect(source).toContain('showManualConfirmModal')
    })

    it('补剂行右侧展示整单分装用量，不展示价格', () => {
      expect(template).toContain('lineAmount(line)')
      expect(template).not.toContain('line.price')
    })

    it('「预分装」说明图常显在页面最顶部', () => {
      const iImage = template.indexOf('prepack-explainer.jpg')
      const iList = template.indexOf('本制作单需要的补剂')
      expect(iImage).toBeGreaterThan(-1)
      expect(iList).toBeGreaterThan(iImage)
      expect(template).not.toContain('prepack-collapse')
    })

    it('袋数选项直接显示服务端算好的总价', () => {
      expect(template).toContain('portionOptionCards')
      expect(template).toContain('portion-option-price')
      expect(source).toContain('opt.goodsSubtotal')
      // 前端不做乘法
      expect(source).not.toMatch(/summary\.value\.supplementPrice\s*\*/)
    })

    it('天数只用来显示当初的选择，不参与任何计算', () => {
      expect(template).not.toContain('天用量')
      // 报价与下单都不传天数
      const quoteStart = source.indexOf('const quoteState = useSupplementQuote')
      expect(source.slice(quoteStart, quoteStart + 400)).not.toContain('cycleDays')
      const submitBlock = source.slice(
        source.indexOf('async function submitOrder'),
        source.indexOf('async function settlePayment'),
      )
      expect(submitBlock).not.toContain('cycleDays')
    })
  });

  describe('补剂订单页', () => {
    const source = readPage('src/pages/supplement-orders/index.vue')
    const template = source.slice(0, source.indexOf('<script setup'))

    it('空态给出可点的出口', () => {
      expect(template).toContain('@tap="goToDiySheetList"')
      expect(source).toContain("'/pages/diy-sheet-list/index'")
    })

    it('待付款订单提供去支付入口', () => {
      expect(template).toContain("order.status === 'PENDING_PAYMENT'")
      expect(template).toContain('@tap="handlePay(order)"')
    })

    it('状态文案走统一的中文映射', () => {
      expect(source).toContain('SUPPLEMENT_ORDER_STATUS_LABELS')
    })
  })

  /**
   * 口径统一：这个入口的按钮实际叫「购买预分装补剂」，
   * 空态文案却一直写成旧的「一键购买补剂」——用户照着文案去找按钮会找不到。
   * 两个页面的空态都要跟按钮对齐。
   */
  describe('补剂入口口径统一', () => {
    const pages = [
      'src/pages/supplement-order/index.vue',
      'src/pages/supplement-orders/index.vue',
    ]

    it.each(pages)('%s 的空态文案与按钮同名', (page) => {
      const template = readPage(page).slice(0, readPage(page).indexOf('<script setup'))
      expect(template).toContain('购买预分装补剂')
      // 旧的叫法不能再出现在任何用户可见的文案里
      expect(template).not.toContain('一键购买补剂')
    })

    it('制作单页的按钮文案就是唯一口径', () => {
      const sheet = readPage('src/pages/diy-sheet/index.vue')
      const template = sheet.slice(0, sheet.indexOf('<script setup'))
      expect(template).toContain('购买预分装补剂')
      expect(template).not.toContain('一键购买补剂')
    })
  })

  /**
   * 补剂入口只在 DIY 制作单页出现，是这条链路的唯一曝光点，
   * 因此它的位置、信息量与「不可用时是否解释」都要被锁住。
   */
  describe('补剂入口（DIY 制作单页）', () => {
    const source = readPage('src/pages/diy-sheet/index.vue')
    const template = source.slice(0, source.indexOf('<script setup'))

    /**
     * 2026-09-22：入口从清单卡片挪到底部固定栏，任何滚动位置都能点到。
     * 文案只有一行，不再有数量 / 发货方 / 价格预期等小字。
     */
    it('入口在底部固定栏，补剂清单下方另有引导按钮（2026-10-24）', () => {
      const bottomBarAt = template.indexOf('class="bottom-actions"')
      // 清单下方的引导按钮在前，底栏按钮在后 —— 取最后一个
      const entryAt = template.lastIndexOf('@tap="handleBuySupplements"')

      expect(bottomBarAt).toBeGreaterThan(-1)
      expect(entryAt).toBeGreaterThan(bottomBarAt)
      expect(template).toContain('购买预分装补剂')
      expect(template).toContain('supplement-buy-note')
      expect(template).toContain('不想购买所有的商品补剂？')
      expect(template).toContain('可以购买本次制作需要的')
      expect(template).toContain('一次性预分装补剂')
      expect(template).toContain('supplement-buy-note-line')
      expect(template).not.toContain('supplement-buy-card')
      expect(template).not.toContain('supplementEntryCountText')
      expect(template).not.toContain('结算页显示总价')
      expect(template).not.toContain('由赛文的食堂按用量分装后发货')
      // 可购买时才出现
      expect(source).toContain('const canBuySupplements = computed')
    })

    it('商城关闭或状态查询失败时给出说明并可重试，不再静默隐藏', () => {
      expect(source).toContain("const supplementShopStatus = ref<'loading' | 'enabled' | 'disabled' | 'failed'>('loading')")
      expect(source).toContain('handleSupplementStatusRetry')
      expect(template).toContain('supplement-unavailable-card')
      expect(template).toContain('supplementUnavailableText')
      // 两句文案在 computed 里，模板通过 supplementUnavailableText 渲染
      expect(source).toContain('补剂商城暂未开放')
      expect(source).toContain('补剂信息暂时获取失败，点击重试')
      // 旧的静默降级写法不能回来
      expect(source).not.toContain('商城未开放或接口异常时静默降级')
    })

    it('把品牌规格带进购买草稿，供下单页小字展示', () => {
      // 2026-10-26：购买行改由 supplement-candidates 生成，行内不带 amount
      expect(source).toContain('buildSupplementPurchaseLines(')
      const helper = readFileSync(
        resolve(process.cwd(), 'src/pages/diy-sheet/supplement-candidates.ts'),
        'utf-8',
      )
      expect(helper).toContain('specText:')
    })
  })

  /**
   * DIY 配置页是补剂路径的上游：这里卡住，后面所有页面都没有流量。
   */
  describe('DIY 配置页', () => {
    const source = readPage('src/pages/recipe-diy/index.vue')
    const template = source.slice(0, source.indexOf('<script setup'))

    it('按钮上方不再常驻说明小字', () => {
      expect(template).not.toContain('不产生订单、不扣款')
    })

    it('按钮不可点时才显示真实原因，不再只变灰', () => {
      expect(source).toContain('const generateBlockReason = computed')
      expect(template).toContain('generateBlockReason')
      expect(template).toContain('bottom-bar-block-reason')
      // 具体原因在 computed 里，模板通过 generateBlockReason 渲染
      expect(source).toContain('请先在上方选择要制作的爱犬')
    })

    it('饭量计算失败会给出错误态与重试，不再永久锁死', () => {
      expect(source).toContain('const dogCalcFailed = ref(false)')
      expect(source).toContain('function retryDogCalc')
      expect(template).toContain('@tap="retryDogCalc"')
      expect(template).toContain('饭量计算失败')
      // 把失败说成「生成中」的旧文案不能再回来
      expect(source).not.toContain('饭量和分装生成中，请稍后')
    })
  })

  /**
   * 食谱详情页的「自己做」是 DIY 链路的入口，按需求保持单行文案。
   */
  describe('食谱详情页 DIY 入口', () => {
    const source = readPage('src/pages/recipe-detail/index.vue')
    const template = source.slice(0, source.indexOf('<script setup'))

    it('「自己做」按钮不再带副标题小字', () => {
      expect(template).not.toContain('diy-label-sub')
      expect(template).not.toContain('含补剂清单，不扣款')
      expect(template).toContain('自己做')
    })
  })

/**
 * 2026-11-01 下单页重构：这一组断言锁的是新契约。
 * 老的那一组（上面的「补剂下单页」）里凡是与新契约冲突的，随后一并改写。
 */
describe('supplement order page redesign (2026-11-01)', () => {
  const source = readPage('src/pages/supplement-order/index.vue')
  const template = source.slice(0, source.indexOf('<script setup'))

  it('清单只写每袋用量，多袋时带 ×N 袋', () => {
    expect(template).toContain('lineAmount(line)')
    expect(template).toContain('× {{ portionMultiplier }} 袋')
    expect(template).not.toContain('整单')
    // 2026-11-02：袋数合计与下方小字说明按老板要求删除
    expect(template).not.toContain('这个量是按你制作单里')
  })

  it('标题与入口口径统一，不再出现「改用量」', () => {
    const pagesJson = readPage('src/pages.json')
    expect(pagesJson).toContain('"navigationBarTitleText": "购买预分装补剂"')
    expect(pagesJson).not.toContain('"navigationBarTitleText": "一键购买补剂"')
    expect(template).not.toContain('改用量')
  })

  it('袋数：只保留 1/2/3 三个按钮，贴在补剂清单下方', () => {
    expect(template).toContain('portionOptionCards')
    expect(template).toContain('袋数')
    expect(template).not.toContain('选择套数')
    expect(template).not.toContain('自定义')
    expect(template).not.toContain('showCustomPortion')
    const iList = template.indexOf('本制作单需要的补剂')
    const iPortion = template.indexOf('class="portion-block"')
    const iAddress = template.indexOf('收货地址')
    expect(iPortion).toBeGreaterThan(iList)
    expect(iPortion).toBeLessThan(iAddress)
  })

  it('费用明细只出现一个商品金额，包材费按需出现', () => {
    expect(template).toContain('补剂商品金额')
    expect(template).not.toContain('补剂商品小计')
    expect(template).not.toContain('>补剂费<')
    expect(template).toContain('summary.packagingFee > 0')
  })

  it('大单有一句提示；6 个月效期那句按要求删除', () => {
    expect(template).toContain('发货会顺延')
    expect(template).not.toContain('6 个月内吃完')
  })

  it('金额未确认时不能提交', () => {
    expect(template).toContain('isAmountReady')
    expect(template).toContain('更新中')
  })

  it('地址：回页面就重拉列表，且兼容字符串型事件载荷', () => {
    expect(source).toContain('void loadAddresses()')
    expect(source).toMatch(/typeof payload === 'string'/)
    expect(source).toContain('地址已失效')
  })

  it('提交前有确认弹层，弹层里重新取价', () => {
    expect(template).toContain('确认订单')
    expect(source).toContain('openConfirmSheet')
    expect(source).toContain('await retry()')
    expect(template).toContain('提交并支付')
  })

  it('建单与支付分开处理：建单失败不继续支付', () => {
    const block = source.slice(
      source.indexOf('async function submitOrder'),
      source.indexOf('async function settlePayment'),
    )
    expect(block).toContain('if (!order)')
    // settlePayment 必须在建单的 try/finally 之后，不能被建单的 catch 吞掉
    expect(block.indexOf('await settlePayment(order)')).toBeGreaterThan(
      block.indexOf('finally'),
    )
    expect(block).not.toContain('提交失败，请稍后重试')
  })

  it('同一次进页面只生成一次幂等键，关掉弹层再提交也不会重复下单', () => {
    const openBlock = source.slice(
      source.indexOf('async function openConfirmSheet'),
      source.indexOf('function closeConfirmSheet'),
    )
    expect(openBlock).not.toContain('createRequestId()')
    expect(source).toMatch(/onLoad\(\(\) => \{[\s\S]*?createRequestId\(\)/)
  })

  it('提交带幂等键与期望金额，建单成功后一定跳详情', () => {
    expect(source).toContain('clientRequestId')
    expect(source).toContain('expectedTotal: toCents(')
    expect(source).toContain('redirectTo')
    expect(source).not.toContain('提交失败，请稍后重试')
  })

  it('主按钮与勾选框用品牌色，不再有旧蓝', () => {
    expect(source).not.toContain('#4a90d9')
    expect(source).toContain('#1e3a2f')
    expect(source).toMatch(/\.checkbox\s*\{[^}]*border-radius:\s*6rpx/)
  })

  it('库存提示块已删除', () => {
    expect(template).not.toContain('库存提示')
    expect(source).not.toContain('inventoryWarnings')
  })

  it('带客服入口', () => {
    expect(source).toContain('CustomerServiceInlineButton')
    expect(template).toContain('补剂下单咨询')
  })
})

describe('2026-11-02 老板反馈的七处调整', () => {
  const page = readPage('src/pages/supplement-order/index.vue')
  const template = page.slice(0, page.indexOf('<script setup'))
  const detail = readPage('src/pages/supplement-order-detail/index.vue')
  const api = readPage('src/api/supplements.ts')

  it('订阅消息只保留发货提醒', () => {
    expect(api).toContain("kinds: SupplementSubscribeKind[] = ['shipped']")
    expect(api).not.toContain("['scheduled', 'shipped', 'delay']")
  })

  it('支付未完成的弹窗去掉预计发货/确认收款，且能关掉', () => {
    const cancelled = page.slice(
      page.indexOf('function showCancelledModal'),
      page.indexOf('function showManualConfirmModal'),
    )
    expect(cancelled).not.toContain('预计发货')
    expect(cancelled).not.toContain('待管理员排期')
    expect(cancelled).not.toContain('确认收款')
    expect(cancelled).toContain("cancelText: '关闭'")
    expect(cancelled).toContain('订单详情里继续支付')
  })

  it('人工确认收款的弹窗也能关掉、不再写预计发货', () => {
    const manual = page.slice(
      page.indexOf('function showManualConfirmModal'),
      page.indexOf('function readErrorMessage'),
    )
    expect(manual).not.toContain('预计发货')
    expect(manual).toContain("cancelText: '关闭'")
  })

  it('订单详情不再列出每样补剂的金额，只留补剂商品小计', () => {
    expect(detail).not.toContain('item-price')
    expect(detail).toContain('补剂商品小计')
  })

  it('订单详情不再展示制作单快照', () => {
    expect(detail).not.toContain('制作单快照')
    expect(detail).not.toContain('fetchSupplementSnapshot')
  })

  it('下单页内嵌「快速天数 + 自定义分装」，不再跳回配置页', () => {
    expect(page).toContain('QuickCyclePackagePlan')
    expect(page).toContain('updateDiySheetPlan')
    expect(page).toContain('fetchMyDiySheets')
    // 已冻结的制作单会新建一张，必须换 id
    expect(page).toContain('draft.value.diySheetId = res.data.id')
    // 改分装期间禁止提交
    expect(page).toContain('!replanning.value')
    expect(page).not.toContain('改制作单')
  })

  it('DIY 配置页选的天数/自定义状态会带到下单页', () => {
    const recipeDiy = readPage('src/pages/recipe-diy/index.vue')
    const sheetPage = readPage('src/pages/diy-sheet/index.vue')
    expect(recipeDiy).toContain("custom: '1'")
    expect(recipeDiy).toContain('cycleDays: String(selectedCycleDays.value')
    expect(sheetPage).toContain('isCustomPlan.value = options.custom')
    expect(sheetPage).toContain('packagePlanIsCustom: isCustomPlan.value')
    // 下单页优先用草稿里的选择，老草稿再反推
    expect(page).toContain('draft.value?.packagePlanIsCustom')
    expect(page).toContain('inferPackagePlanMode')
  })

  it('订单详情的操作按钮改为纵向铺满', () => {
    expect(detail).toContain('flex-direction: column')
    expect(detail).toMatch(/\.primary-btn, \.ghost-btn \{[^}]*width: 100%/)
  })
})
})
