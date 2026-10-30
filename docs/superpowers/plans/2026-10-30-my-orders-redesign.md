# 「我的订单」重构执行方案（2026-10-30）

> **For agentic workers:** 本方案按任务顺序执行，每个任务自带验收命令。任务 1 是后端、2 是纯函数、3 以后才会动页面模板。开工前先确认「决策待定」5 条。

**目标：** 把顾客打开订单页后最关心的三件事（哪单要我先动手、这单到哪一步、什么时候到）在首屏说清楚，同时不破坏现存的售后规则、支付锁、三单合并与客服契约。

**架构：** 后端只给订单摘要补 4 个已有字段，不出新接口；前端把"状态 → 四步进度 / 预计发货日 / 下一步动作"抽成一个纯函数模块并单测；页面模板在原文件内重排，不拆组件、不改既有函数名，以保住 4 套源码级回归测试。

**技术栈：** uni-app（Vue 3 + TS）、NestJS + Prisma、vitest（小程序）/ jest（后端）。

**设计与原型：** `mockups/my-orders-redesign.html`（图片版：`mockups/zoom-compare.png`、`zoom-states.png`）

---

## 一、可行性结论

| 方案点 | 判定 | 依据 |
|---|---|---|
| 合并两层筛选、状态做成胶囊 | ✅ 可做 | 纯前端；`ORDER_TYPE_TABS` 文案源已在 `utils/order-type.ts` |
| 四步进度条 | ✅ 可做（列表） | 详情页 `components/OrderProgressBar.vue` 是 6 步，列表另做 4 步紧凑版；两页并存不冲突 |
| 待付款倒计时 | ✅ 零后端 | `GET /orders` 已返回 `paymentRemainingSeconds / paymentDeadline / paymentAutoCloseEnabled` |
| 卡上取消订单 | ✅ 零后端 | 详情页已在用 `POST /orders/:id/cancel` |
| 预计发货日 | ⚠️ 需后端加 1 字段 | 摘要接口现在没有该字段；详情页规则是"制作日 + 1 天"，已有先例 |
| 可读单号 | ⚠️ 需后端加 1 字段 | `Order.orderNo` 在表里且唯一，但摘要接口没返回；老单可能为 `null`，必须兜底 |
| 卡内物流摘要 | ⚠️ 需后端加 2 字段，且只能显示单号 | 摘要接口无 `trackingNumber/carrierCode`；轨迹要另查物流接口，**本方案不显示轨迹文案** |
| 空态分两种、骨架屏、下拉刷新 | ✅ 可做 | 纯前端；`pages.json` 该页尚未开 `enablePullDownRefresh` |
| 一单最多两个按钮 | ⚠️ 有约束 | 回归测试要求"每张卡都有再次购买、不按状态收起"，**不能删，只能降级** |
| 客服从固定底栏挪走 | ❌ 原方案不可行 | ①原生导航栏不能放自定义按钮；②回归测试要求该页必须有 `customer-service-bottom-bar`，且全站禁止悬浮客服球 |

### 三处硬冲突（必须先定）

1. **再次购买不能消失。** `orders-list.regression.spec.ts` 有一条测试专门防这件事："shows buy again on every order card without status gating"。说明这是过去刻意做的决定（防止某些状态下复购入口消失）。→ 折中：**保留在每张卡**，但从"按钮排"降级为卡片底部的文字入口，主/次按钮仍然 ≤2。这样测试不用改，视觉也不再挤。
2. **客服不能进导航栏。** 页面用的是微信原生导航栏（`pages.json` 里只有 `navigationBarTitleText`），原生栏里加不了按钮；而 `customer-service-placement.regression.spec.ts` 又明确要求这一页有固定底栏、全站不许用悬浮球。→ 折中：**保留固定底栏，把高度从 68px 压到 44px**（只改样式，类名和标题不动），省下的空间给卡片。
3. **详情页进度条是 6 步。** 列表用 4 步会和详情页颗粒度不一致。→ 折中：列表 4 步（已付款/制作中/已发货/已签收）是详情页 6 步的归并，语义不矛盾；**本轮不动详情页**，统一留作后续可选项。

### 不可绕过的成本

- 该页 `index.vue` 2388 行，4 套回归测试全是**源码字符串断言**。重排模板时若不保留既有函数名与调用表达式，十几条读模板的断言会连带失败。
  → 硬规则：保留 `isPaying('food', order.id)`、`hasShownOrdersList`、`payingKey`、`customRefundEntryLabel`、`buyAgain(order)` 等全部既有名字；只新增、不改名。
- 模拟器当前没有登录态（storage 里无 token），自动化跑不了真实登录 → 验收必须老板扫码或真机走一遍。
- 小程序只上传体验版，不发布正式版（项目规则）。

### 量化收益（可验收）

- 首屏被筛选占掉的高度：88px → 49px
- 单卡按钮：最多 4 个 → 最多 2 个（其余为文字入口）
- 处理待付款：3 步（进详情→找取消/支付→返回）→ 1 步
- 删除死代码：卡片上的"收货地址（只显示城市）"从未渲染过（摘要接口 `address` 恒为 `undefined`）

### 工作量

| 阶段 | 内容 | 人天 |
|---|---|---|
| 1 | 后端摘要补 4 字段 + 自检 | 0.5 |
| 2 | 四步进度/ETA 纯函数 + 单测 | 0.5 |
| 3 | 卡片重排 + 待付款倒计时/取消 + 空态/骨架屏/下拉刷新 | 2 |
| 4 | 筛选合并 + 筛选面板 | 0.5 |
| 5 | 客服栏瘦身 + 文案收口 + 单号复制 | 0.5 |
| 6 | 回归测试同步 + 构建 + 体验版 + 走查报告 | 0.5 |
| 合计 | 不含详情页统一 | **≈ 4.5 人天** |

---

## 二、执行前必须确认的 5 个决策

| # | 决策 | 建议 | 影响 |
|---|---|---|---|
| D1 | 再次购买降级为文字入口，可否 | 可以（能力不减，只降视觉权重） | 不改测试 |
| D2 | 客服底栏压到 44px，可否 | 可以 | 省 24px；若想彻底去掉底栏，需改契约 + 改测试 |
| D3 | 预计发货日对外口径 = 制作日 + 1 天，可否 | 可以（与详情页一致），未排产则显示"等待排期" | 后端加 1 字段 |
| D4 | 是否给摘要接口补单号与物流单号 | 建议补（否则卡片没有单号、没有物流信息） | 后端 +0.5 天 |
| D5 | 详情页 6 步是否本轮一起改成 4 步 | 本轮不动 | 动则 +1 天 |

---

## 三、全局约束（每个任务都必须满足）

- 不改既有函数名、类名、模板里的既有调用表达式；只允许新增。
- 保留管理员测试视图（`viewAll=true`）的横幅与两段文案：「全部顾客成品鲜食 + 我的定制/补剂测试单」「我的测试单」。
- 保留支付锁（同一时间只允许一笔支付）、退款/售后判定、三单合并按 `createdAt` 倒序。
- 配色只用现有变量（`#1e3a2f / #b08d4f / #fbfcf7 / #f0f3e9 / #b4553f / #6b6653 / #e3e6d4`），不引入新色。
- 不新增依赖、不新增后端接口。
- 单卡主/次按钮合计 ≤2 个；「再次购买」保留在每张卡，但作为底部文字入口。
- 文案不出现内部说法（"管理员"、"排期"内部词、英文状态码）。

## Review Focus（最容易翻车的 5 处）

1. **老订单没有 `orderNo`**：卡片不得出现"订单号 null/undefined"，无单号时整行不渲染。
2. **未排产订单（`targetProductionDate` 为空）**：不得出现"预计 —— 月 —— 日"，改为"等待排期"。
3. **倒计时的时钟来源**：一律用服务端 `paymentRemainingSeconds` 起算并在本地递减；归零时静默刷新一次，不自己判死。
4. **手势叠加**：下拉刷新 + 吸顶筛选 + 固定底栏三者同时存在时，滚动到顶部不能触发误刷新；筛选面板打开时禁止页面滚动。
5. **三类订单的状态映射**：定制 `DELIVERED`、鲜食 `SHIPPED`、补剂 `PACKED/SHIPPED` 都要能落到同一组四步上，不得出现"第 0 步"或"第 5 步"。

---

## 四、文件清单

**后端**
- 修改：`backend/src/interfaces/dto/orders/order-response.dto.ts:489`（`OrderSummaryDto` 加 4 个可选字段）
- 修改：`backend/src/interfaces/controllers/orders.controller.ts:1248`（`mapOrderToSummaryDto` 填充）
- 新增：`backend/src/domain/order/estimated-shipping.ts`（制作日 + 1 天的纯函数，详情页与摘要共用）
  — 注意：后端 jest 的 `testRegex` 只收 `tests/**/*.spec.ts`，单测必须放 `backend/tests/domain/order/`

**小程序**
- 新增：`miniapp/src/utils/order-progress.ts`（状态 → 四步 / 当前步 / ETA 文案 / 下一步动作）
- 新增：`miniapp/src/utils/order-progress.spec.ts`
- 修改：`miniapp/src/pages/orders-list/index.vue`（模板 + 样式 + 少量脚本）
- 修改：`miniapp/src/pages.json:94`（`enablePullDownRefresh: true`）
- 修改：`miniapp/src/pages/orders-list.regression.spec.ts`（仅在新增行为需要被锁定时追加断言）

---

## 五、任务

### Task 1：后端订单摘要补 4 个字段

**Files**
- Create: `backend/src/domain/order/estimated-shipping.ts`
- Modify: `backend/src/interfaces/dto/orders/order-response.dto.ts:489`
- Modify: `backend/src/interfaces/controllers/orders.controller.ts:1248`
- Test: `backend/tests/domain/order/estimated-shipping.spec.ts`

**Interfaces**
- Produces: `computeEstimatedShippingDate(targetProductionDate: Date | null): string | null`；`OrderSummaryDto` 新增 `orderNo?: string | null`、`estimatedShippingDate?: string | null`、`trackingNumber?: string | null`、`carrierCode?: string | null`

- [ ] **Step 1：写失败测试** — 制作日为 `2026-11-01` 时返回 `2026-11-02`；入参 `null` 返回 `null`。
- [ ] **Step 2：跑测试确认失败** — `cd backend && npx jest tests/domain/order/estimated-shipping.spec.ts`
- [ ] **Step 3：实现纯函数** — 只做日期 +1 天，保持 `toISOString()` 输出。
- [ ] **Step 4：DTO 加 4 个可选字段**（`@ApiPropertyOptional`，注释写清"老订单可能为 null"）。
- [ ] **Step 5：摘要 mapper 填充** — `orderNo: order.orderNo ?? null`、`trackingNumber/carrierCode`、`estimatedShippingDate: computeEstimatedShippingDate(order.targetProductionDate ?? null)`。
- [ ] **Step 6：详情页 mapper 改用同一函数** — 删掉 `orders.controller.ts:1088-1098` 的内联 +1 天逻辑，保证两处口径一致。
- [ ] **Step 7：验证** — `cd backend && npx tsc --noEmit`；`npx jest tests/domain/order`；`curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:3011/api/v1/orders` 看到新字段。
- [ ] **Step 8：提交** — `git commit -m "feat(orders): 订单摘要补单号/预计发货日/物流单号"`

### Task 2：四步进度纯函数

**Files**
- Create: `miniapp/src/utils/order-progress.ts`
- Create: `miniapp/src/utils/order-progress.spec.ts`

**Interfaces**
- Produces:
  - `type OrderStepKey = 'PAID' | 'MAKING' | 'SHIPPED' | 'RECEIVED'`
  - `resolveOrderProgress(input: { kind: 'food' | 'supplement' | 'custom'; status: string }): { steps: Array<{ key: OrderStepKey; label: string }>; currentIndex: number; doneCount: number }`
  - `formatEtaText(input: { kind: 'food' | 'supplement' | 'custom'; status: string; estimatedShippingDate?: string | null; scheduledDate?: string | null }): string`（如「预计 11月2日 发出」「等待排期」，已签收返回空串）
- 下一步动作**不新建**判断函数：继续用现有的 `getAftersaleEntryLabel` + `canApplyAftersale`，避免两套规则打架。

- [ ] **Step 1：写失败测试** — 覆盖 `PAID/PURCHASING/IN_PRODUCTION/FREEZING → currentIndex 1`、`SHIPPED → 2`、`COMPLETED → 3`；补剂 `PACKING/PACKED → 1`；定制 `IN_PROGRESS → 1`、`DELIVERED → 2`；未知状态 `currentIndex 为 0` 且不得抛错。
- [ ] **Step 2：跑测试确认失败** — `cd miniapp && npx vitest run src/utils/order-progress.spec.ts`
- [ ] **Step 3：实现两个导出** — 纯函数、无 `uni` 依赖；标签按类型取（鲜食"制作中"、补剂"分装中"、定制"定制中"）。
- [ ] **Step 4：ETA 文案兜底** — 日期为空返回「等待排期」；已发货返回「已于 X 月 X 日发出」或「在途」；已签收返回空串（不占行）。
- [ ] **Step 5：跑测试确认通过** — 同上，全绿。
- [ ] **Step 6：提交** — `git commit -m "feat(orders): 订单四步进度与预计发货日纯函数"`

### Task 3：卡片结构重排（不含交互）

**Files**
- Modify: `miniapp/src/pages/orders-list/index.vue`（模板 + `<style>`）

**Interfaces**
- Consumes: Task 2 的 `resolveOrderProgress` / `formatEtaText`

- [ ] **Step 1：卡片头重排** — 类型小圆点 + 类型名（沿用 `orderTypeLabel`）、右侧下单日期；标题行：食谱名/定制食谱名/补剂品名 + 金额（`formatAmount` 不动）；副信息行：狗狗 · 餐数 · 每餐克数。
- [ ] **Step 2：插入四步进度** — 用 `resolveOrderProgress`；已完成点打勾，当前点金色描边，未到点置灰；进度下方接 `formatEtaText` 的 ETA 条（有值才渲染）。
- [ ] **Step 3：按钮收敛** — 每张卡保留 1 个主按钮 + 1 个次按钮（次按钮的文案继续由 `getAftersaleEntryLabel` 决定）；「再次购买」移到卡片底部右侧，作为**文字入口**（仍是 `<button class="action-link" @tap="buyAgain(order)">`，不加状态判断，保住回归测试）。
- [ ] **Step 4：补剂卡折叠明细** — 明细一行（`formatSupplementSummary`），`order.orderNo` 保留在卡上（回归测试断言它存在），单价金额收进详情。
- [ ] **Step 5：删死代码** — 移除 `order.address`/`formatAddress` 的城市行（接口恒为 `undefined`，从未渲染过）；保留 `formatAddress` 函数以防他处引用（先 `grep` 确认）。
- [ ] **Step 6：不改名自检** — `grep -n "isPaying('food'\|hasShownOrdersList\|payingKey\|customRefundEntryLabel" src/pages/orders-list/index.vue` 仍能命中。
- [ ] **Step 7：跑回归** — `cd miniapp && npx vitest run src/pages/orders-list`，预期只有"读模板结构"的断言需要同步；逐条确认是"改名导致"还是"结构导致"，并优先改实现、不改断言。
- [ ] **Step 8：提交** — `git commit -m "feat(orders): 订单卡片重排为进度式"`

### Task 4：待付款倒计时 + 卡上取消

**Files**
- Modify: `miniapp/src/pages/orders-list/index.vue`（模板 + 脚本）

- [ ] **Step 1：倒计时** — 以 `paymentRemainingSeconds` 起算，复用现有 `nowTick` 定时器（改为 1 秒一次但在页面隐藏时暂停）；显示「订单将在 23:41 后自动关闭」；`paymentAutoCloseEnabled === false` 时不显示倒计时，只显示"待付款"。
- [ ] **Step 2：归零处理** — 归零后调用一次 `loadOrders()`（静默），不本地改状态。
- [ ] **Step 3：取消按钮** — 待付款卡加次按钮「取消订单」，`uni.showModal` 二次确认后调 `POST /orders/${id}/cancel`，成功 Toast + 刷新；进行中禁用态沿用 `beginPayment` 思路加一个 `cancellingId`（不放支付锁里，避免影响支付）。
- [ ] **Step 4：超时文案** — 已有"支付已超时，订单已关闭"保留，后面加一个文字入口「重新下单」（复用 `buyAgain`）。
- [ ] **Step 5：手测** — 模拟器里用本地订单走一遍取消；确认取消后卡片变"已取消"。
- [ ] **Step 6：提交** — `git commit -m "feat(orders): 待付款倒计时与卡上取消"`

### Task 5：筛选合并 + 筛选面板

**Files**
- Modify: `miniapp/src/pages/orders-list/index.vue`

- [ ] **Step 1：顶部一行** — 状态胶囊（全部/待付款/进行中/待收货/已完成/售后中，带数量）+ 右侧「筛选」；类型筛选（`TYPE_TABS`）不再常驻。
- [ ] **Step 2：筛选面板** — 自写底部弹层（mask + sheet，参照 `components/ReviewForm.vue` 的写法），内含"订单类型"与"时间范围（近 3 个月 / 近 1 年 / 全部）"；重置 + 查看结果。
- [ ] **Step 3：筛选生效** — `selectedType` 沿用现有变量；新增 `selectedRange`，在 `getOrdersByTab` 之后按 `createdAt` 过滤；面板关闭后刷新计数。
- [ ] **Step 4：吸顶修复** — 筛选行 `position: sticky; top: 0` 且**背景不透明**（现在状态 Tab 是透明的，卡片会从字后面透出来）。
- [ ] **Step 5：回归** — `npx vitest run src/pages/orders-list-merge.regression.spec.ts`，`TYPE_TABS`/`ORDER_TYPE_TABS` 相关断言必须仍绿。
- [ ] **Step 6：提交** — `git commit -m "feat(orders): 筛选合并为一行并支持时间范围"`

### Task 6：空态 / 骨架屏 / 下拉刷新 / 静默刷新

**Files**
- Modify: `miniapp/src/pages/orders-list/index.vue`
- Modify: `miniapp/src/pages.json:94`（加 `"enablePullDownRefresh": true`）

- [ ] **Step 1：空态分两种** — 首屏无任何订单：「还没有订单 + 去挑食谱」；筛选后为空：「{分类}下没有订单 + 看全部订单 + 去挑食谱」。保留现有 `emptyTitle/emptyText` 的取名，扩展即可。
- [ ] **Step 2：骨架屏** — 新增 `loadingFirst` 状态；列表为空且加载中时渲染 3 个骨架卡（不用真实数据），替换 `uni.showLoading`。`loadOrders()` 里按 `allOrders.length === 0` 判断是否走骨架。
- [ ] **Step 3：静默刷新** — 有数据时的 `onShow` 刷新不再 `showLoading`；保留 `loadFailed/partialLoadFailed` 提示与「重试」。
- [ ] **Step 4：下拉刷新** — `onPullDownRefresh` 里 `await loadOrders(); uni.stopPullDownRefresh()`。
- [ ] **Step 5：自检** — 模拟器首屏断网看骨架→失败提示→重试；有数据时下拉出现刷新条并结束。
- [ ] **Step 6：提交** — `git commit -m "feat(orders): 骨架屏、下拉刷新与两种空态"`

### Task 7：客服底栏瘦身与文案收口

**Files**
- Modify: `miniapp/src/pages/orders-list/index.vue`

- [ ] **Step 1：底栏瘦身** — `.customer-service-bottom-bar` 内边距 18rpx→8rpx，按钮高度压到 72rpx，整条从 68px 降到 44px；**类名与 `title="订单列表咨询"` 不动**。
- [ ] **Step 2：补剂文案** — 「预计发货 待管理员排期」→「等待安排发货」；「分装中」后补一句"预计 X 日发出"（有 `packingDate` 时）。
- [ ] **Step 3：单号** — 卡片底部显示真实短号 `orderNo`（格式 `SK20261030-001`，13 位；无则整行不渲染）+ 点击复制（`uni.setClipboardData`）；补剂沿用自身 `orderNo`。
- [ ] **Step 4：物流** — 仅用 `carrierCode + trackingNumber` 显示「顺丰速运 SF123…」，不显示轨迹；点击仍走 `viewLogistics`。
- [ ] **Step 5：断言自检** — `npx vitest run src/pages/customer-service-placement.regression.spec.ts` 必须绿（底栏仍在）。
- [ ] **Step 6：提交** — `git commit -m "feat(orders): 客服栏瘦身与顾客化文案"`

### Task 8：全量验证与体验版

**Files**
- 无代码改动（只跑与记录）

- [ ] **Step 1：单测** — `cd miniapp && npx vitest run`（全量，含 4 套订单页回归）。
- [ ] **Step 2：类型** — `cd backend && npx tsc --noEmit`。
- [ ] **Step 3：构建** — `cd miniapp && npm run build:mp-weixin`。
- [ ] **Step 4：自查** — 用开发者工具打开 `miniapp/dist/build/mp-weixin`，按下方验收清单逐条走；需要登录时请老板扫码。
- [ ] **Step 5：上传体验版** — `cd miniapp && /Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --project "$(pwd)" --version "2026.10.30.1" --desc "我的订单改版" --lang zh`（看到 `✔ upload` 才算成功）。
- [ ] **Step 6：报告** — 版本号、改了哪些、哪些是原型上的偏差（客服栏、物流轨迹、详情页仍 6 步）。

---

## 六、验收清单（真机/模拟器）

- [ ] 打开订单页 1 秒内看到卡片（或骨架），不出现全屏"加载中"。
- [ ] 首屏能看到 3 张卡（同样三单）。
- [ ] 待付款卡：看得到倒计时；点"去支付"能拉起微信支付；点"取消订单"二次确认后订单消失/变已取消。
- [ ] 进行中卡：四步进度正确（急冻中也落在"制作中"这一步），ETA 要么有日期要么是"等待排期"。
- [ ] 已发货卡：只有 2 个按钮；物流单号可复制；"确认收货"仍会走微信确认收货。
- [ ] 每张卡都能看到「再次购买」文字入口（含待付款单）。
- [ ] 售后中卡：退款进度入口在，且不会同时出现"申请售后"。
- [ ] 筛选：切"售后中"显示空态与"看全部订单"；切类型不影响状态计数错乱。
- [ ] 下拉刷新可用；吸顶筛选行滚动时不透字。
- [ ] 管理员 `viewAll=true` 进入仍显示测试视图横幅。
- [ ] 无英文状态码、无"管理员"字样。

## 七、回滚

- 前端：一个提交回退（`git revert <task3..task7>`）即可回到现网样子，后端字段是新增可选字段，老前端不受影响。
- 后端：新字段为可选，回滚后端不影响已发版前端（前端按缺省处理）。
- 上线节奏：只上传体验版，正式版待老板确认后再发。
