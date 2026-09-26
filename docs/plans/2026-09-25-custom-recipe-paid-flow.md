# 食谱定制 · 入口 + 付费 + 成品抵扣 实施方案

> 版本：v1（2026-09-25）
> 上游：`2026-09-18-finished-fresh-food-top-level-design.md`（顶层设计 v4，产品线 ③ / 四期）
> 范围：小程序顾客端「专属食谱定制」全链路重开 + 微信支付 + 定制费抵扣成品货款
> 状态：**用户已确认口径，执行中**

---

## 一、背景（现状核实，2026-09-25）

「食谱定制」在代码里其实已经存在，但整条链路是断电的。核实结果：

| 组成部分 | 状态 |
|---|---|
| 后端接口（提交定制、我的定制订单、订单详情、排期） | ✅ 已写好 |
| 后台管理页（定制食谱订单列表/详情、确认收款、改状态、创建定制食谱） | ✅ 已上线 |
| 小程序顾客端 3 个页面（填需求 / 提交成功 / 我的定制订单） | ✅ 代码已写好 |
| 数据库表（custom_recipe_order / custom_recipe_schedule / custom_recipe_attachment） | ✅ 已建好 |
| **首页入口** | ❌ 没有 |
| **3 个页面的路由登记** | ❌ 没有（`pages.json` 里查无此页） |
| **顾客端接口地址** | ❌ 控制器缺 `/api/v1` 前缀（全项目仅此两个控制器没加） |
| **顾客端接口返回格式** | ❌ 未包统一 `{code,message,data}`，小程序判断永远失败 |
| **「下单成功却报网络错误」** | ❌ 订单已落库，页面却走进 catch 提示"网络错误" |
| **「查看订单详情」** | ❌ 指向从未存在的 `custom-recipe/order-detail` |
| **提交成功页日期** | ❌ 写死 `2025年1月23日` / `2025年1月28日` |
| **收款方式** | ❌ 只有"加微信客服转账 + 后台人工确认" |
| **定制费** | ❌ 写死 `ORDER_AMOUNT = 299`，与设计文档 ¥300 不一致 |
| **抵扣** | ❌ 完全没有 |

历史原因：`89a08ea7` 那次提交在精简 `pages.json` 时把定制三条路由摘掉了，之后再没恢复；两个定制控制器从建立起就没跟上 `/api/v1` 与统一响应结构的迁移。

---

## 二、已确认的业务口径

| # | 项目 | 决定 |
|---|---|---|
| 1 | 首页入口 | 「给 XX 的推荐」整块下线，替换为常驻「食谱定制」入口卡（未登录也可见） |
| 2 | 定制费 | ¥300，后台可调 |
| 3 | 收款 | 小程序内微信支付 + 超时自动关单；退款走后台人工 |
| 4 | 抵扣对象 | 抵成品**货款**，不抵运费 |
| 5 | 抵扣余额 | **余额结转**，没用完下次继续抵，直到用完 |
| 6 | 抵扣绑定 | 绑定**它产出的那道定制食谱**，不能抵其他食谱 |
| 7 | 配置位置 | 新建独立「食谱定制设置」（与「补剂商城设置」对称） |
| 8 | 调价影响 | **订单快照**，后台改价不影响已提交/已付款的老单 |
| 9 | 抵扣上限 | 可抵扣金额**不得超过定制费**（后台校验） |

---

## 三、新增后台页面：食谱定制设置

| 参数 | 字段（Prisma / 库） | 默认值 | 说明 |
|---|---|---|---|
| 定制费 | `feeAmount` / `fee_amount` | 300 | 下单时从配置取值，写入订单快照 |
| 可抵扣金额 | `creditAmount` / `credit_amount` | 300 | 解耦出的核心参数，≤ 定制费 |
| 交付工作日数 | `deliveryWorkDays` / `delivery_work_days` | 3 | 原 `WORK_DAYS` 硬编码 |
| 每日接单上限 | `dailyCapacity` / `daily_capacity` | 4 | 原 `DEFAULT_CAPACITY` 硬编码 |
| 支付超时（分钟） | `paymentTimeoutMinutes` / `payment_timeout_minutes` | 30 | 与自动关单联动；0 = 不自动关单 |

生效规则：
- **订单快照**：提交定制单时把当时的 `feeAmount` / `creditAmount` 写进订单，之后调价不影响老单；
- **小程序实时读取**：定制页按钮价、入口卡价格从公开配置读取，对**新单**立即生效。

---

## 四、分阶段执行

### 阶段一 · 打通入口与流程

**后端**
1. 新建配置：Prisma model + migration + service + 后台控制器 + 公开控制器 + DTO
2. 定制服务改为读取配置（定制费 / 交付工作日 / 每日接单上限）
3. 顾客端定制控制器：补 `/api/v1` 前缀 + 统一 `ApiResponseDto` 返回

**小程序**
1. `pages.json` 登记 `custom-recipe/index`、`success`、`orders`，并新增 `order-detail`
2. 首页推荐板块 → 常驻「食谱定制」入口卡（含入口埋点）
3. 提交页：修复响应判断、价格跟随配置、真实交付日期
4. 成功页：改为读取真实订单信息
5. 新增订单详情页，接上「查看订单详情」
6. 「我的」页新增「我的定制订单」入口
7. 同步受影响回归测试

**后台**
1. 「食谱定制设置」页面 + 路由 + 菜单 + API 封装

### 阶段二 · 微信支付

**后端**
1. `POST /api/v1/custom-recipe/orders/:orderId/pay` 发起微信支付
2. `handleWechatNotify` 增加 `CR` 前缀分流（与鲜食、`SP` 补剂并列）
3. 支付成功 → `status = PAID` + `paymentConfirmedAt`
4. `POST .../sync-payment` 主动查单兜底
5. 按配置超时自动关单
6. 后台保留「人工确认收款」作为兜底

**小程序**
1. 提交成功页调起支付；取消后可在订单页再次支付
2. 支付通道未配置时降级为人工付款（沿用补剂订单的 `MANUAL` 降级逻辑）

### 阶段三 · 定制费抵扣成品货款

**数据库**
- 定制单：`credit_amount`（快照）、`credit_used`（已用）
- 成品单：`custom_recipe_credit_order_id`（抵扣来源）、`credit_amount_applied`（本单抵扣额）

**后端**
1. 定价预览 + 下单两条路径都计算抵扣
2. 抵扣规则：绑定该定制食谱、只抵货款、余额结转、额度用完为止
3. 订单金额校验由 `货款 + 运费 = 总额` 改为 `货款 + 运费 − 抵扣 = 总额`

**小程序 / 后台**
- 订购页、结算页、订单详情展示「定制费抵扣 −¥XX」
- 后台定制订单详情展示额度与已用，并提供「恢复额度」按钮（人工退款场景）

---

## 五、执行记录

### 阶段一（2026-09-25 完成）

除了计划内的入口与流程修复，实测中挖出并修掉了三个**阻断性缺陷**：

| 缺陷 | 影响 |
|---|---|
| `addWorkDays` 漏 `await`，条件恒假 | **死循环**。任意一次提交定制订单都会锁死 Node 事件循环、无限堆积 Promise，直到进程涨到 2GB 被杀（实测复现） |
| 节假日接口返回对象，代码按数组判断 | `Array.isArray` 恒假 → "遇公众假期顺延"从未生效 |
| 节假日接口无超时 | 第三方接口一慢，下单就挂在网络上 |

另修复：后台"确认收款/改状态/交付"传的是友好单号却被按 uuid 查询，三个动作全部 500。

验证：后端 236 套 / 2084 项、小程序 86 套 / 849 项全通过；`build:mp-weixin` 成功；接口实测提交/列表/详情/后台改配置/后台确认付款全部按预期返回；后台校验实测拒绝"可抵扣 > 定制费"。

### 阶段二（2026-09-25 完成）

- 后端：定制单发起 JSAPI 支付、`CR` 前缀回调分流、主动查单兜底、按「食谱定制设置」超时自动关单（关单同时释放排期名额）、保留后台人工确认兜底
- 小程序：新增 `utils/custom-recipe-payment.ts`；提交成功页 / 订单详情页 / 订单列表三处都能调起支付；支付通道不可用时降级为加客服人工付款
- 数据库：`CustomRecipeStatus` 补 `CANCELLED`；订单加 `payment_transaction_id` / `cancelled_at` / `cancellation_reason`

验证：后端 239 套 / 2107 项、小程序 87 套 / 858 项全通过；`build:mp-weixin` 成功；接口实测：
- 未配置支付时 `POST .../pay` 返回业务错误（小程序据此降级为人工收款），不 500
- 下单后当日排期 `booked_count` +1；调用关单后回到 0，订单置 `CANCELLED` 并留痕；重复关单为 no-op，名额不会被减成负数

### 阶段三 · 待试吃装提交后执行

三个业务口径已确认（2026-09-25）：

| # | 问题 | 决定 |
|---|---|---|
| 1 | 开发顺序 | **等试吃装那批先提交，再做阶段三**（避免两批改动互相覆盖） |
| 2 | 财务口径 | **乙：货款直接减**（改动最小、订单金额校验规则不动） |
| 3 | 退款场景 | 后台**人工点「恢复额度」**，不做自动恢复 |

**已先行完成的部分（刻意避开被并行会话占用的价格/订单文件）**

| 内容 | 位置 |
|---|---|
| 额度台账：`findUsableCredit` / `consumeCredit` / `restoreCredit` / `getCreditSummary` | `application/custom-recipe/custom-recipe.service.ts` |
| 并发安全：CAS（按读到的 `credit_used` 原值条件更新）+ 重试 + 冲突报错，绝不扣超/还超 | 同上 |
| 后台「恢复额度」接口 `POST /api/v1/admin/custom-recipe/orders/:orderId/restore-credit` | `interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts` |
| 后台订单详情：额度总额 / 已抵 / 剩余 + 「恢复额度」按钮 | `admin-web/src/views/CustomRecipes/OrderDetail.vue` |
| 单元测试 16 项（额度绑定食谱、未付款不可用、不足额只扣剩余、并发 CAS、按分对齐、恢复钳制…） | `tests/application/custom-recipe/custom-recipe-credit.spec.ts` |

**剩余部分（等试吃装提交后再做）**：`order` 表两列、`order.service.ts` 定价预览与下单接入、订单响应 DTO、小程序订购页/结算页/订单详情展示。

#### 阶段三可执行方案（口径乙）

**数据库**（新增列，不改既有语义）

| 表 | 字段 | 说明 |
|---|---|---|
| `order` | `custom_recipe_credit_order_id` | 抵扣来源的定制单 uuid。**不加 unique**：余额可跨多张成品单使用 |
| `order` | `credit_amount_applied` | 本单抵扣额（元）。**仅用于展示与审计** —— 金额已经含在净货款里，不参与算术 |
| `custom_recipe_order` | `credit_used` | 已用额度（阶段一已建） |

**后端**

1. 新增额度台账读写（放在 `CustomRecipeService`，不新建模块）：
   - `findUsableCredit({ customerId, recipeId })` → `{ customRecipeOrderId, remaining }`
     条件：同顾客 + `recipeId` 等于该定制单产出的食谱 + 状态 ∈（已付款/制作中/已交付）+ 剩余额度 > 0
   - `consumeCredit({ customRecipeOrderId, amount })`：条件更新 `credit_used += amount`，
     带 `credit_used <= credit_amount - amount` 的 where 兜底，**防止并发超额**
   - `restoreCredit({ customRecipeOrderId, amount })`：供后台「恢复额度」，带下限保护
2. 定价预览（`order.service.ts` 的 `previewPricing`）：算完价格后
   - `applied = min(剩余额度, 货款)` —— 只抵货款、不抵运费
   - 返回里把 `amountProduct` 换成净额、`amountTotal = 净货款 + 运费`，
     同时**新增两个只读字段**：`creditAmountApplied`、`creditOriginalProductAmount`（原货款）
   - `pricing.service.ts` **完全不动**
3. 下单（`createOrder`）：同口径计算，并在**同一事务**里 `consumeCredit`
4. 订单响应 DTO 暴露 `creditAmountApplied` / `creditOriginalProductAmount`
5. 后台新增 `POST /api/v1/admin/custom-recipe/orders/:orderId/restore-credit`（人工恢复）

**小程序**

- 订购页 `pages/recipe-order/index.vue`、结算页 `pages/checkout/index.vue`：价格明细加一行
  「定制费抵扣 −¥XX」，并显示原货款，让顾客看得见省了多少
- 成品订单详情 `pages/order-detail/index.vue`：显示抵扣明细
- 入口/定制订单详情页的额度展示阶段一已就位

**后台**

- 成品订单详情显示抵扣明细
- 定制订单详情显示 额度总额 / 已抵 / 剩余，并提供「恢复额度」按钮 + 抵扣去向（哪几张成品单用了）

**已知风险**

- 订单金额的硬校验规则**不动**，因此退款、结算、财务报表全部沿用现有逻辑 —— 这是选口径乙的主要原因
- 预览与下单**必须同一口径**，否则出现"页面看到的价"与"下单的价"不一致
- 并发下单可能超额，靠条件更新兜底

**验收口径**

| 场景 | 期望 |
|---|---|
| 定制付款 → 从该定制食谱下成品单 | 结算页出现「定制费抵扣 −¥300」，实付减 300，定制单剩余额度 0 |
| 后台把可抵扣额改成 ¥200 | 新单抵 200；已提交的老单不受影响 |
| 货款不足 ¥300 | 本单货款抵到 0，余额结转下次继续抵 |
| 后台点「恢复额度」 | 剩余额度回涨，可再次抵扣 |
| 用别人的定制食谱下单 | **不抵扣**（额度绑定该道食谱） |


## 五、验收

| 阶段 | 验收方式 |
|---|---|
| 一 | 新账号从首页走到提交成功；后台能看到订单；价格跟随后台配置变化 |
| 二 | 走一次真实小额支付；回调后后台自动变「已付款」；超时自动关单生效 |
| 三 | 定制付款 → 从该定制食谱下成品单 → 核对结算页/订单金额/剩余额度；后台改成 ¥0 / ¥200 验证新单生效、老单不变 |

每阶段结束执行构建并告知微信开发者工具目录：
- 发布构建 `cd miniapp && npm run build:mp-weixin` → `miniapp/dist/build/mp-weixin`
- 联调预览 `cd miniapp && npm run preview` → `miniapp/dist/dev/mp-weixin`

---

## 六、并行开发冲突（已记录，阶段三执行前需复核）

工作目录中**有另一个会话在做「试吃装」**，冲突面在持续扩大（截至 2026-09-26 复核）：

| 文件 | 状态 |
|---|---|
| `backend/src/domain/pricing/pricing.service.ts` | 该会话重写，527 增 / 251 删（未提交） |
| `backend/src/domain/order/order-package-plan.ts` | 该会话修改（未提交） |
| `backend/src/application/order/order.service.ts` | **该会话正在改，270 增 / 163 删（未提交）—— 阶段三下单接线必须改这个文件** |
| `miniapp/src/pages.json` | 该会话也在改 —— 阶段一新增的 4 条定制路由与它同处一个文件 |
| `miniapp/src/pages/checkout/index.vue`、`order-detail/index.vue` | 该会话在改 —— 正是阶段三要展示抵扣的位置 |
| `backend/prisma/schema.prisma` | **共享文件**；本会话定义曾被它整体覆盖过一次（已恢复并核对数据库一致） |

**已确认的处理方式：等试吃装那批先提交，再做阶段三。**
在对方持有 `order.service.ts` 与 `pages.json` 的情况下强行改动，会有**覆盖对方未提交工作**的风险（`schema.prisma` 已经真实发生过一次）。

阶段三开工前的检查清单：
1. 确认上述文件已提交、工作区干净；
2. 复核 `schema.prisma` 仍包含本会话的三个模型/字段（`CustomRecipeConfig`、`custom_recipe_order.credit_amount/credit_used`、`CustomRecipeStatus.CANCELLED`）；
3. 重跑 `npx prisma migrate status`，确认无漂移。

**已加的自动守卫（防止改动被静默冲掉）**

| 守卫 | 覆盖 |
|---|---|
| `backend/tests/prisma/custom-recipe-schema.spec.ts` | schema.prisma 里的配置表、额度/支付/关单字段、`CANCELLED`、两个 migration 文件与其 SQL 内容 |
| `miniapp/src/pages/custom-recipe.regression.spec.ts` | 4 条定制路由、接口统一封装、支付接入与人工收款降级 |

