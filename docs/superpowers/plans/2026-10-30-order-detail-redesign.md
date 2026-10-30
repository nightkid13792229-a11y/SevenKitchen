# 「鲜食订单详情」重构执行方案（2026-10-30）

> **For agentic workers:** 本方案按任务顺序执行，每个任务自带验收命令。开工前先读「三、必须先确认的 3 件事」。原型：`mockups/order-detail-redesign.html`。

**目标：** 顾客打开这一页，第一屏就知道"这单到哪一步、什么时候到、我要做什么"；把同一件事说两遍的地方收口，把内部说法改成顾客话；页面标题与类型名统一成「鲜食」。

**架构：** 不新增接口、不改后端。首屏卡片合并现成的三个区块；进度条从 6 步换成与列表一致的 4 步（抽成共用组件）；其余改动全部在 `order-detail/index.vue` 内部重排，保持 106 条源码断言中的绝大多数不变。

**技术栈：** uni-app（Vue 3 + TS）、vitest。

**原型：** `mockups/order-detail-redesign.html`（图片：`zoom-detail-before.png` / `zoom-detail-after.png` / `zoom-detail-states.png`）

---

## 一、可行性结论（逐条对着代码核过）

| 方案点 | 判定 | 依据 |
|---|---|---|
| 首屏合并成一张主卡 | ✅ 可做 | 数据全在现有详情接口里（status/items/amount/estimatedShippingDate）；这页没有任何测试断言"订单中心卡"或"购买人与配送"的结构 |
| 六类信息去重 | ✅ 可做（需改 1 条断言） | 唯一冲突见下 |
| 四步进度（替换 6 步蓝条） | ✅ 可做 | `OrderProgressBar` 只被这一页引用，无测试断言；列表页已有同款四步，抽组件即可 |
| 待付款第一步显示"待付款" | ✅ 可做 | 改 `utils/order-progress.ts` 的标签，列表页同款受益；现有测试只断言"完成度/步位"，不断言该状态下的标签 |
| 底部空白栏不再出现 | ✅ 可做 | 现在是 `v-if="order"` 的固定容器里放空数组，包一层条件即可 |
| 售后入口合一 | ✅ 可做（有约束） | 必须保留 `canCancelOrder / isAftersaleLocked / canApplyAftersale` 的判定与三套文案，测试锁着 |
| 生产结算改人话 | ⚠️ 只能改展示，不能删 | 测试要求源码里保留「生产结算 / fetchOrderFinancialSummary / adjustmentSummary」等字样 |
| 商品卡精简（版本号/营养标准） | ⚠️ 只能折叠，不能删 | 测试要求 `getNutritionStandardLabel(...)`、`formatIngredientSourcePlan(...)`、`formatPackagePlan(...)` 仍在模板里 |
| 物流"查看轨迹" | ❌ 做不了 | 全站没有轨迹数据，列表页的"物流详情"其实也只是个弹窗 |
| 改成"食用与保存提醒"入口 | ✅ 可做 | 现成页面 `pages/order-shipping-notice/index?orderId=`（消息中心在用），有烹饪/保存/货损三块 |
| 订单编号统一短号 | ✅ 可做 | 页面已有 `formatOrderId`，只是顶部那张卡没用 |
| 成品鲜食 → 鲜食 / 页面改名 | ✅ 可做 | 文案源 1 处 + 硬编码 4 处 + 断言 4 条 |

### 实际改动到的断言（执行后校正）

原以为要改"地址必须在基本信息里"那条；执行时核对发现它只断言两件事：`收货地址:` 存在、且没有 `<view class="section-title">收货信息</view>`。合并后两条**自动满足**，不用改。

真正改到的是另外两条：

1. `order-detail.regression.spec.ts` 的"金额行仍在"锚点：`订单金额:` → `实付金额`（金额并进首屏主卡）。
2. `tasting-pack.regression.spec.ts` 的现货断言：`v-if="!isStockOrder" class="buyer-row"` → `v-if="!isStockOrder && order.targetProductionDate"`（制作日期并进「收货与配送」，与发货方式按现货切换）。

---

## 二、工作量

| 阶段 | 内容 | 人天 |
|---|---|---|
| 1 | 共用四步进度组件 + 待付款文案（含列表页） | 1.5 |
| 2 | 首屏主卡 + 三块合并去重 + 订单号 | 1 |
| 3 | 售后入口合一 + 底部栏条件渲染 | 0.5 |
| 4 | 结算人话 + 商品卡折叠 + 说明折叠 + 食用提醒入口 | 1 |
| 5 | 改名 + 测试同步 + 构建 + 体验版 | 0.5 |
| 合计 | | **≈ 4.5 人天** |

---

## 三、必须先确认的 3 件事

| # | 事项 | 建议 | 影响 |
|---|---|---|---|
| D1 | 允许修改那条"地址必须在基本信息里"的断言 | 允许（全页仍只一处地址） | 否则布局无法合并 |
| D2 | "生产结算"改成"有退款/补款才出现" | 建议这样：没有调整时整块隐藏，连"无需补收"都不显示 | 与现在"结算完成就显示"不同 |
| D3 | 物流入口改成「食用与保存提醒」 | 建议：已发货/已完成给一个入口，跳到现成页面 | 没有轨迹可看，别再写"查看轨迹" |

---

## 四、全局约束

- 不改既有函数名、类名、模板里既有调用表达式；只允许新增（与上一轮同一套做法）。
- 保留：`canCancelOrder / isAftersaleLocked / canApplyAftersale / canApplyRefund / canApplyRemake / canApplyComplaint` 的判定逻辑与三套文案。
- 保留：`生产结算`、`fetchOrderFinancialSummary`、`adjustmentSummary`、`shouldFetchOrderFinancialSummary` 的字符串与判定时机。
- 保留：`getNutritionStandardLabel(...)`、`formatIngredientSourcePlan(...)`、`formatPackagePlan(item)`、`分装明细`、`总袋数`、`每袋重量`。
- 保留：确认收货必须走 `confirmWechatReceiptBeforeInternalComplete`；超时只能"重新下单"；已取消单要拉退款汇总。
- 保留员工/管理员能力：地址管理入口、管理员备注、`getAdminOrderFinancialSummary`。
- 不改后端、不新增接口、不引新依赖。
- 配色只用现有变量；进度条换回墨绿金。

## Review Focus（最容易翻车的 6 处）

1. **老订单没有 `orderNo`**：顶部主卡必须落回 `formatOrderId`，不得出现"订单号 undefined"。
2. **未排产单**：`estimatedShippingDate` 为空时显示"等待排期"，不得出现"预计 —— 月 —— 日"。
3. **现货试吃装与补发单**：`isStockOrder`（不绑狗狗、按套数）与 `isReshipOrder`（免费补发、不收费）在合并区块后都必须还在。
4. **员工/管理员视角**：同一页有两个接口（顾客/管理员财务汇总）、三个只在 staff 下出现的入口，重排时不能按"顾客版"一刀切。
5. **底部栏消失**：没有动作时页面底部不能留下原来给固定栏预留的空白，也不能盖住最后一张卡。
6. **售后三块互斥**：取消 / 锁定 / 售后 三个区块只能出现一个，合并后规则不得重复计算。

---

## 五、文件清单

- 新增：`miniapp/src/components/OrderProgressSteps.vue`（四步进度，列表与详情共用）
- 修改：`miniapp/src/utils/order-progress.ts`（待付款第一步文案）+ `order-progress.spec.ts`
- 修改：`miniapp/src/pages/orders-list/index.vue`（改用共用组件，删掉内联进度）
- 修改：`miniapp/src/pages/order-detail/index.vue`（主体）
- 修改：`miniapp/src/pages.json`（标题改「鲜食订单详情」）
- 修改：`miniapp/src/utils/order-type.ts` + `order-type.spec.ts`（成品鲜食 → 鲜食）
- 修改：`miniapp/src/pages/orders-list/index.vue`（管理员横幅「全部顾客成品鲜食」文案）+ `orders-list-merge.regression.spec.ts`
- 修改：`miniapp/src/pages/recipe-order/index.vue`（两处占位文案）
- 修改：`miniapp/src/pages/order-detail.regression.spec.ts`（地址那一处 + 新增断言）

---

## 六、任务

### Task 1：共用四步进度 + 待付款文案

**Files**
- Create: `miniapp/src/components/OrderProgressSteps.vue`
- Modify: `miniapp/src/utils/order-progress.ts`、`miniapp/src/pages/orders-list/index.vue`
- Test: `miniapp/src/utils/order-progress.spec.ts`

**Interfaces**
- Produces: `<OrderProgressSteps :kind="'food'|'supplement'|'custom'" :status="string" />`，内部复用 `resolveOrderProgress`，渲染四步 + 完成/当前/未完成三种态
- 修改 `resolveOrderProgress`：`PENDING_PAYMENT` 时第一步 label 返回 `待付款`

- [ ] **Step 1：写失败测试** — `resolveOrderProgress({kind:'food',status:'PENDING_PAYMENT'}).steps[0].label` 等于 `待付款`；`PAID` 时仍是 `已付款`
- [ ] **Step 2：跑测试确认失败** — `cd miniapp && npx vitest run src/utils/order-progress.spec.ts`
- [ ] **Step 3：改实现** — 在 `resolveOrderProgress` 里按状态覆盖第一步标签
- [ ] **Step 4：跑测试确认通过**
- [ ] **Step 5：抽组件** — 把列表页 `.progress` 那段模板与样式搬到 `OrderProgressSteps.vue`，列表页改为引用
- [ ] **Step 6：列表页回归** — `npx vitest run src/pages/orders-list`（24 条全绿）
- [ ] **Step 7：提交**

### Task 2：首屏主卡 + 三块合并

**Files**
- Modify: `miniapp/src/pages/order-detail/index.vue`

- [ ] **Step 1：主卡** — 类型 + 状态 + `OrderProgressSteps` + 预计发货 + 商品（食谱名/袋数/总重）+ 实付 + 单号/下单时间一行
- [ ] **Step 2：合并去重** — 删除 `order-center-section` 的重复字段与「微信订单中心…」副标题；「基本信息」只留 `目标制作日期`（可改）与员工入口；新建「收货与配送」卡承接地址
- [ ] **Step 3：单号** — 全部改用 `order.orderNo || formatOrderId(order.id)`
- [ ] **Step 4：保留现货/补发分支** — `isStockOrder`、`isReshipOrder` 的判断与文案原样搬进新卡
- [ ] **Step 5：同步断言** — 更新"地址归属"那一条（见 D1），补一条"全页只有一处收货地址"
- [ ] **Step 6：跑回归** — `npx vitest run src/pages/order-detail.regression.spec.ts`
- [ ] **Step 7：提交**

### Task 3：售后合一 + 底部栏条件渲染

- [ ] **Step 1：三块合并** — 取消 / 锁定提示 / 售后 合成一张「售后与修改」卡，规则与文案不变
- [ ] **Step 2：底部栏** — 只在 `hasBottomActions` 为真时渲染，并同步页面底部留白
- [ ] **Step 3：手测** — 六个状态（待付款/已付款/锁定期/已发货/售后中/已完成）各看一次
- [ ] **Step 4：提交**

### Task 4：结算人话 + 商品卡折叠 + 说明折叠 + 食用提醒

- [ ] **Step 1：结算** — 只在 `pendingRefundAmount > 0` 或 `pendingExtraPaymentAmount > 0` 时渲染，正文改成"少了 Xg，退了 ¥Y / 需要补 ¥Y"
- [ ] **Step 2：商品卡** — `v3`/营养标准/原料来源收进可展开的「规格与来源」
- [ ] **Step 3：说明折叠** — 五条商家说明收成一行，点开展开
- [ ] **Step 4：食用提醒入口** — 已发货/已完成给「食用与保存提醒 ›」，跳 `/pages/order-shipping-notice/index?orderId=`
- [ ] **Step 5：回归 + 提交**

### Task 5：改名 + 全量验证

- [ ] **Step 1：文案源** — `ORDER_TYPE_META.food.label = '鲜食'`；同步 `order-type.spec.ts` 三处
- [ ] **Step 2：硬编码** — 列表管理员横幅、recipe-order 两处、详情页首标签
- [ ] **Step 3：标题** — `pages.json` 改「鲜食订单详情」
- [ ] **Step 4：全量** — `npx vitest run`（预期 2028+ 通过、1 个既有失败文件）
- [ ] **Step 5：构建** — `npm run build:mp-weixin`
- [ ] **Step 6：上传体验版** — 版本号递增，看到 `✔ upload`
- [ ] **Step 7：报告** — 版本号 + 与原型的三处偏差

---

## 七、验收清单

- [ ] 打开详情页首屏能看到：进度、商品、实付、预计发货、单号
- [ ] 待付款：第一步显示"待付款"，底部有取消/支付
- [ ] 锁定期：没有底部空白栏，有"联系客服"入口
- [ ] 已发货：物流字段 + 食用提醒入口 + 确认收货
- [ ] 售后中：售后信息可见，底部无空栏
- [ ] 已完成 + 有退款：一张人话结算卡；无调整时看不到结算块
- [ ] 现货试吃装、补发单的标记仍在
- [ ] 员工进入：地址管理、管理员备注、管理员结算接口都正常
- [ ] 页面标题是「鲜食订单详情」，类型叫「鲜食」
- [ ] 无英文状态码、无"管理员"字样出现在顾客视图

## 八、回滚

纯前端，`git revert` 对应提交即可；不涉及数据库与接口。
