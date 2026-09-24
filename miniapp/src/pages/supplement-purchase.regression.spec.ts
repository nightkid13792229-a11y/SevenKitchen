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

    /**
     * 2026-09-24：**翻转** 2026-09-22 的"费用不逐项展示、只给一个包邮价"。
     * 现在补剂费 / 分装服务费 / 运费都要列出来。
     * 明细摆出来是为了让加量可计算：用户能亲眼看到固定费用不随份数变。
     */
    it('费用逐项展示：补剂费、分装服务费、运费、合计', () => {
      expect(template).toContain('fee-card')
      expect(template).toContain('补剂费')
      expect(template).toContain('分装服务费')
      expect(template).toContain('运费')
      expect(template).toContain('合计')
      // 金额一律取服务端算好的值，前端不做乘法/加法
      expect(template).toContain('summary.supplementPrice')
      expect(template).toContain('summary.serviceFee')
      expect(template).toContain('summary.shippingFee')
      expect(template).toContain('summary.total')
    })

    it('包邮时运费显示「包邮」，未包邮时显示金额与凑单提示', () => {
      expect(template).toContain('summary.freeShipping')
      expect(template).toContain('fee-value-free')
      // 门槛来自服务端（后台改了界面跟着变），不再在合计下方写"再买 X 可包邮"
      expect(source).toContain('freeShippingThresholdText')
      expect(source).toContain('freeShippingThreshold')
      expect(source).not.toContain('freeShippingHint')
      expect(template).not.toContain('fee-hint')
    })

    it('底部金额下方不再放说明小字，但保留取价失败的重试出口', () => {
      // 费用明细里已有独立的运费行，底部再写一遍是冗余。
      //
      // 只看**渲染出来的 <text> 内容**，不看原始源码 —— 解释"为什么撤掉"的注释里
      // 必然会出现这些字，扫源码会误伤自己的注释（这个坑踩了三次，所以这里
      // 统一改成提取文本节点再断言）。
      const footer = template.slice(template.indexOf('<view class="footer">'))
      const renderedText = [...footer.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
        .map((m) => m[1])
        .join('｜')

      expect(source).not.toContain('footerShippingLabel')
      expect(renderedText).not.toContain('包邮')
      expect(renderedText).not.toContain('含运费')
      expect(renderedText).toContain('价格获取失败')
      // ⚠️ 但重试必须留着：那是取价失败时唯一的出口，删了按钮会永久灰死。
      // 它是功能，不是说明 —— 别一起删掉。
      expect(template).toContain('footer-ship-retry')
      expect(template).toContain('价格获取失败，点击重试')
      expect(source).toContain('handleRetryQuote')
    })

    it('空态给出可点的出口', () => {
      expect(template).toContain('@tap="goToDiySheetList"')
      expect(source).toContain("'/pages/diy-sheet-list/index'")
    })

    it('首次报价期间有加载态，不会显示成空白页', () => {
      expect(template).toContain('v-else-if="initializing"')
      expect(template).toContain('正在核对补剂')
    })

    it('补剂全部不可购买时给出说明与出口，而不是一片灰', () => {
      expect(template).toContain('selectableLines.length === 0')
      expect(template).toContain('这些补剂暂时无法购买')
      expect(template).toContain('返回我的制作单')
    })

    it('多种补剂时提供全选/全不选', () => {
      expect(template).toContain('@tap="toggleSelectAll"')
      expect(template).toContain('allSelectableSelected')
      expect(source).toContain('selectableLines')
    })

    it('全选会跳过不可购买的补剂，不会污染报价', () => {
      // 可选项的定义必须排除 unavailableReason
      const selectableBlock = source.slice(
        source.indexOf('const selectableLines'),
        source.indexOf('const allSelectableSelected'),
      )
      expect(selectableBlock).toContain('!line.unavailableReason')
    })

    it('支付成功与降级人工收款，两种弹窗文案各自成立', () => {
      // 页面上的说明小字已按产品要求撤掉（见下方「页脚上方不放说明小字」那条），
      // 但提交后的弹窗仍然必须区分两种情况：
      // 在线支付已经成功，却告诉顾客"我们会尽快与你确认收款"，那就是错的。
      const paidBlock = source.slice(
        source.indexOf('function showPaidModal'),
        source.indexOf('function showManualConfirmModal'),
      )
      const manualBlock = source.slice(source.indexOf('function showManualConfirmModal'))

      expect(paidBlock).toContain('我们会尽快分装发货')
      expect(paidBlock).not.toContain('确认收款')
      expect(manualBlock).toContain('我们会尽快与你确认收款')
    })

    it('价格重算失败会明确提示，不会静默保留旧合计', () => {
      const block = source.slice(
        source.indexOf('async function refreshSummaryOnly'),
        source.indexOf('function isSelected'),
      )
      expect(block).toContain('价格重算失败')
      expect(block).toContain('showToast')
    })

    it('提交后按支付结果分流，通道不可用时降级人工确认', () => {
      expect(source).toContain('runSupplementPayment')
      expect(source).toContain('showPaidModal')
      expect(source).toContain('showManualConfirmModal')
    })

    it('报价失败时在合计下方给重试出口，不再让按钮永久灰死', () => {
      // 原来只弹一次 toast，按钮永久灰、只能退出重进
      expect(source).toContain('const quoteFailed = ref(false)')
      expect(source).toContain('quoteFailed.value = true')
      expect(template).toContain('quoteFailed')
      expect(template).toContain('@tap="handleRetryQuote"')
      expect(template).toContain('价格获取失败')
      expect(source).toContain('async function handleRetryQuote')
    })

    it('补剂行右侧展示分装用量，不再展示价格', () => {
      expect(template).toContain('line-packed')
      expect(template).toContain('formatAmount(line.packedAmount)')
      // 行内价格标记已移除
      expect(template).not.toContain('line-price')
      expect(template).not.toContain('line.price.toFixed')
    })

    it('补剂行小字只展示品牌与规格，不展示价格 / 保质期 / 用量', () => {
      expect(template).toContain('line.specText')
      expect(template).not.toContain('分装后保质期')
      expect(template).not.toContain('制作单用量')
      expect(source).not.toContain('function formatUnitPrice')
    })

    it('清单前有「预分装」说明图，且排在补剂清单之前', () => {
      // 图是这一页"什么叫预分装"的唯一解释，删掉用户就只能对着清单干猜
      expect(template).toContain('prepack-card')
      expect(template).toContain('/static/mall/prepack-explainer.jpg')
      // 顺序：来源制作单 → 预分装说明 → 补剂清单
      const iSource = template.indexOf('source-card')
      const iPrepack = template.indexOf('prepack-image')
      const iList = template.indexOf('选择要买的补剂')
      expect(iSource).toBeGreaterThan(-1)
      expect(iPrepack).toBeGreaterThan(iSource)
      expect(iList).toBeGreaterThan(iPrepack)
    })

    it('加量：份数上限来自服务端，界面只照着渲染', () => {
      // 上限是"份数上限 + 效期天数上限"两个约束算出来的，只能服务端说了算
      expect(source).toContain('maxPortionMultiplier')
      expect(template).toContain('portionOptionCards')
      expect(template).toContain('@tap="selectPortion(opt.multiplier)"')
      // 没有可选项时整块不出现，避免出现只有一个"1 份"的废控件
      expect(template).toContain('v-if="showPortionPicker"')
    })

    it('加量：每个选项直接显示总价与是否包邮（零点击可见）', () => {
      // v1 只在选项上写"1 份/2 份/3 份"，顾客要来回点才知道多少钱、哪档包邮
      expect(source).toContain('portionOptionCards')
      expect(source).toContain('portionOptions')
      expect(template).toContain('portion-option-price')
      // 包邮做成右上角标，不占正文位置
      expect(template).toContain('portion-badge')
      expect(template).toContain('已包邮')
      // 金额必须取服务端算好的，前端不做乘法
      expect(source).toMatch(/opt\.goodsSubtotal\.toFixed/)
      expect(source).not.toMatch(/summary\.value\.supplementPrice\s*\*\s*portionMultiplier/)
      // ⚠️ 选项上必须是「商品金额」而不是含运费的合计 —— 否则会出现
      // "写着 ¥49.50、门槛 49，却没包邮"（那 49.50 里含着 8 元运费）
      expect(source).not.toMatch(/priceLabel:\s*`¥\$\{opt\.total/)
    })

    it('费用明细把「商品金额小计」与「运费」分层，跟份数选择器对得上', () => {
      // 没有这一行，用户无法把"选项上的价格"和"明细里的三项"对应起来
      expect(template).toContain('fee-row-subtotal')
      expect(template).toContain('商品金额小计')
      expect(template).toContain('summary.goodsSubtotal')
      // 小计必须在运费之前
      expect(template.indexOf('fee-row-subtotal')).toBeLessThan(template.indexOf('>运费<'))
    })

    it('费用明细要读出三层：明细项 < 商品金额小计 < 合计', () => {
      // 五个数字平铺在一起时，用户分不清哪个是哪个 —— 必须靠视觉层次区分
      // ① 小计：浅色底带 + 墨绿加粗
      const sub = source.slice(
        source.indexOf('.fee-row-subtotal {'),
        source.indexOf('.fee-row-total {'),
      )
      expect(sub).toContain('background-color')
      expect(sub).toContain('#2b5040')
      expect(sub).toMatch(/font-weight:\s*600/)
      // ② 合计：比小计更大更粗
      const total = source.slice(source.indexOf('.fee-value-total {'))
      expect(total).toMatch(/font-size:\s*34rpx/)
      expect(total).toMatch(/font-weight:\s*700/)
    })

    it('页脚上方不放说明小字（2026-09-25 按产品要求撤掉，别再放回来）', () => {
      // 原先这里有两条：一条讲分装与支付方式，一条讲分装小样的保质期。
      // 后者要传达的信息（袋上印「有效期至」）在实物标签上本来就直接看得到。
      // 断言只针对**渲染出来的文本节点**，避免被解释性注释里的同名字样误伤。
      const renderedText = [...template.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
        .map((m) => m[1])
        .join('\n')

      expect(renderedText).not.toContain('有效期至')
      expect(renderedText).not.toContain('按需购买')
      expect(renderedText).not.toContain('确认收款后发货')
      // 样式也一并清掉，别留下没人用的死规则
      expect(source).not.toContain('.notice-expiry')
      expect(source).not.toContain('.notice-text')
    })

    it('加量卡片紧贴费用明细，顾客看钱的地方就能调整', () => {
      const iPortion = template.indexOf('portion-card')
      const iFee = template.indexOf('fee-card')
      expect(iPortion).toBeGreaterThan(-1)
      expect(iFee).toBeGreaterThan(iPortion)
    })

    it('制作单卡片提供「改用量」入口，而不是让顾客在这一页干着急', () => {
      expect(template).toContain('改用量')
      expect(template).toContain('@tap="goToRecipeDiy"')
      expect(source).toContain('/pages/recipe-diy/index?')
      // 没有 recipeId 时不显示（点了也进不去）
      expect(source).toContain('canEditUsage')
    })

    it('加量：报价与下单都要把份数和制作单天数传给服务端', () => {
      // 金额一律服务端算，前端不做乘法
      expect(source).toContain('portionMultiplier: portionMultiplier.value')
      expect(source).toContain('cycleDays: cycleDays.value || undefined')
      // 下单时也要带上，否则订单落库的份数永远是 1
      expect(source).toMatch(/portionMultiplier:\s*portionMultiplier\.value/)
    })

    it('加量：标题是「选择份数」，副标题是包邮门槛', () => {
      expect(template).toContain('选择份数')
      expect(template).toContain('portion-subtip-gold')
      expect(source).toContain('满${label}元包邮')
      // 副标题里不再重复啰嗦"每份是原量、服务费只收一次"
      expect(template).not.toContain('分装服务费只收一次')
    })

    it('加量：选项正文只留「几份 / 多少钱」，不显示天数', () => {
      expect(template).toContain('portion-option-price')
      // ⚠️ 天数是**故意**不显示的：狗狗档案里的"每天两顿"是吃饭频率，
      // 不等于"会吃几袋这个"。鲜食+干粮混吃的人做了 30 袋、每天只喂 1 袋，
      // 系统无从知道 —— 给一个可能错的数字比不给更糟。
      //
      // 只看选项本身那段，别扫整个模板：解释"为什么不显示"的注释里
      // 也会出现这两个字，全模板断言会误伤自己的注释。
      const optionBlock = template.slice(
        template.indexOf('portion-options'),
        template.indexOf('fee-card'),
      )
      expect(optionBlock).not.toContain('天量')
      expect(optionBlock).not.toContain('daysLabel')
      expect(source).not.toContain('daysLabel')
      expect(template).not.toContain('portion-option-days')
      // 每天成本与包邮文字也都从正文移除（包邮改角标）
      expect(optionBlock).not.toContain('每天')
      expect(template).not.toContain('portion-option-perday')
      expect(template).not.toContain('portion-option-ship')
    })

    it('天数仍由服务端算（用于效期校验），只是不给用户看', () => {
      // 内部保留、外部去掉：效期安全红线还需要它
      expect(source).toContain('cycleDays: cycleDays.value')
      expect(source).toContain('portionMultiplier: portionMultiplier.value')
    })

    it('加量：服务端收敛份数后，界面要跟着回到合法档位', () => {
      // 换了更长的制作单时上限会变小，界面不能停在后端不认的档位上
      expect(source).toContain('maxPortionMultiplier ?? 1')
      expect(source).toMatch(/if \(portionMultiplier\.value > allowed\)/)
    })

    it('加量控件用品牌墨绿，不是旧的蓝紫', () => {
      expect(source).toContain('.portion-option-active')
      expect(source).toMatch(/\.portion-option-active[^}]*#1e3a2f/)
      // 旧的蓝紫配色不许回来
      expect(source).not.toContain('#1890ff')
      expect(source).not.toContain('#6c4bbb')
    })

    it('说明图整幅贴满卡片、不写死高度', () => {
      // 图自带米白底，套白卡内边距会变成"白框里嵌一块米色"
      expect(source).toContain('.prepack-card {')
      expect(source).toMatch(/\.prepack-card\s*\{[^}]*padding:\s*0/)
      // 写死高度会和 mode="widthFix" 打架，把图压变形
      expect(template).toContain('mode="widthFix"')
      expect(source).not.toMatch(/\.prepack-image\s*\{[^}]*height:\s*\d/)
    })
  })

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
    it('入口在底部固定栏，且只有一行文案', () => {
      const bottomBarAt = template.indexOf('class="bottom-actions"')
      const entryAt = template.indexOf('@tap="handleBuySupplements"')

      expect(bottomBarAt).toBeGreaterThan(-1)
      expect(entryAt).toBeGreaterThan(bottomBarAt)
      expect(template).toContain('购买预分装补剂')
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
      expect(source).toContain('specText: item.selectedProductDisplayText')
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
})
