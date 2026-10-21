# 代客定制食谱订单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让员工能为有账号或无账号的顾客代下定制食谱订单，线下收款可追溯，交付物可分享，并与顾客自助单共用同一套设计/交付/售后流程。

**Architecture:** 不新增第二套订单。给 `CustomRecipeOrder` 增加来源、操作人、线下收款字段；给 `User` 增加代客客户标识和联系方式；新增后台代客下单入口与只读交付分享链接。订单仍由现有报价、排期、设计、批量交付、售后模块处理。

**Tech Stack:** NestJS + Prisma/PostgreSQL；Vue 3 + Element Plus（admin-web）；现有小程序交付页。

**Spec:** `docs/superpowers/specs/2026-10-21-assisted-custom-recipe-order-design.md`

## Global Constraints

- 一套 `CustomRecipeOrder`，不建第二套订单/状态机。
- 无账号顾客必须建独立代客客户，不能挂在老板个人账号下。
- 线下收款只登记，不调用微信支付/退款；只有 `WECHAT_ONLINE` 自助单走原路退款。
- 代客单仍受 1–5 份、报价、排期、开关约束。
- 分享链接只读、短期、可撤销，不暴露其他顾客/订单。
- 多份开关默认关闭；本计划不改变生产开关。
- 所有金额以服务端报价为准；实际线下收款另存 `actualPaidAmount`。

## Review Focus

- 线下已收款单取消时误调微信退款。
- 无账号顾客的狗被写进员工/老板账号。
- 代客订单被错误展示给其他顾客。
- 分享 token 被枚举、长期有效或撤销后仍可访问。
- 实际收款金额与订单应付金额不一致时，报表/退款口径错误。
- 同一顾客/狗重复创建代客订单。

---

### Task 0: 顾客自助单端到端验收基线（不改代码）

**Files:**
- Create: `docs/superpowers/acceptance/2026-10-21-custom-recipe-self-flow.md`

**Interfaces:**
- Consumes: 现有生产/体验版环境、`multiRecipeEnabled=true`、体验版 `.11`。
- Produces: 自助单缺陷清单；后续代客单复用同一套设计/交付/售后结果。

- [ ] **Step 1: 写验收清单**

覆盖：单份、2 份、5 份；付款；后台设计 N 份；一次性交付；顾客看到 N 份；每份 DIY；确认收到；按份售后；后台重新交付；取消/退款。

- [ ] **Step 2: 用真实测试订单执行**

记录每一步页面、实际结果、失败截图/订单号。

- [ ] **Step 3: 把失败分成阻塞/非阻塞**

阻塞项先修；非阻塞项记录到缺陷清单。

- [ ] **Step 4: 提交验收记录**

```bash
git add docs/superpowers/acceptance/2026-10-21-custom-recipe-self-flow.md
git commit -m "docs: record self-service custom recipe acceptance"
```

---

### Task 1: Schema 与迁移

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261022xxxxxx_assisted_custom_recipe_order/migration.sql`
- Test: `backend/tests/prisma/custom-recipe-assisted-schema.spec.ts`

**Interfaces:**
- Produces:
  - `enum CustomRecipeOrderSource { SELF ASSISTED }`
  - `CustomRecipeOrder.orderSource`, `createdByStaffId`, `paymentChannel`, `externalPaymentRef`, `actualPaidAmount`, `assistedForGuest`
  - `CustomRecipeOrder.refundChannel`, `offlineRefundedAt`, `offlineRefundAmount`, `offlineRefundMethod`, `offlineRefundNote`, `offlineRefundByStaffId`
  - `User.isGuest`, `guestContactName`, `guestContactPhone`, `guestContactWechat`, `guestCreatedByStaffId`
  - `CustomRecipeDeliveryShare`（token、orderId、batchId、expiresAt、revokedAt、createdByStaffId）

- [ ] **Step 1: 写 schema 守卫测试**

断言字段、默认值、订单来源枚举、分享 token 唯一、分享关系只到订单/批次。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/prisma/custom-recipe-assisted-schema.spec.ts --runInBand`  
Expected: FAIL（字段不存在）。

- [ ] **Step 3: 修改 schema**

按 Interfaces 增加字段；`order_source` 默认 `SELF`；`actual_paid_amount` 用 `Decimal(10,2)`；分享 token `@unique`、`expires_at` 必填。

- [ ] **Step 4: 生成 additive migration**

用 `prisma migrate diff --from-schema-datamodel HEAD^ --to-schema-datamodel` 生成；只允许 ADD COLUMN/CREATE TABLE/INDEX/FK。

- [ ] **Step 5: 本地应用并验证**

Run: `cd backend && npx prisma migrate deploy && npx prisma generate`  
Expected: 成功；`npx jest tests/prisma/custom-recipe-assisted-schema.spec.ts --runInBand` PASS。

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/tests/prisma/custom-recipe-assisted-schema.spec.ts
git commit -m "feat: add assisted custom recipe order schema"
```

---

### Task 2: 后台代客客户与狗狗

**Files:**
- Create: `backend/src/application/custom-recipe/guest-customer.service.ts`
- Create: `backend/src/interfaces/controllers/custom-recipe/admin-guest-customer.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/custom-recipe/guest-customer.service.spec.ts`
- Test: `backend/tests/controllers/custom-recipe.guest-customer.spec.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/admin/custom-recipe/guest-customers` body `{ name, phone?, wechat?, note? }` → `{ customerId }`
  - `POST /api/v1/admin/custom-recipe/guest-customers/:customerId/dogs` body `CreateDogDto` → `{ dogId }`
  - `GET /api/v1/admin/custom-recipe/guest-customers?keyword=` → list `{ id, name, phone, wechat, dogCount }`
  - `GuestCustomerService.createGuest`, `createGuestDog`, `search`

- [ ] **Step 1: 写 failing service tests**

断言：创建 `User.isGuest=true`、无 openid/password、记录创建员工；狗 `ownerId` = 代客客户；拒绝给非代客用户建狗。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/application/custom-recipe/guest-customer.service.spec.ts --runInBand`  
Expected: FAIL（service 不存在）。

- [ ] **Step 3: 实现 service**

`createGuest` 用事务；`createGuestDog` 复用 `DogService.createDogProfile`，`ownerId` 为代客客户；`search` 只返回 `isGuest=true`。

- [ ] **Step 4: 写 controller 测试**

覆盖 AdminGuard、员工 403、未登录 401、参数校验、创建成功。

- [ ] **Step 5: 实现 controller 并注册**

挂 `api/v1/admin/custom-recipe/guest-customers`；`@UseGuards(AdminGuard)`（创建/建狗）或 `StaffGuard`（搜索，按现有后台权限）。

- [ ] **Step 6: 运行测试并提交**

Run: `cd backend && npx jest tests/application/custom-recipe/guest-customer.service.spec.ts tests/controllers/custom-recipe.guest-customer.spec.ts --runInBand`  
Expected: PASS。

```bash
git add backend/src/application/custom-recipe/guest-customer.service.ts backend/src/interfaces/controllers/custom-recipe/admin-guest-customer.controller.ts backend/src/app.module.ts backend/tests
git commit -m "feat: add assisted guest customers and dogs"
```

---

### Task 3: 后台代客下单接口

**Files:**
- Create: `backend/src/application/custom-recipe/assisted-order.service.ts`
- Modify: `backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts`
- Test: `backend/tests/application/custom-recipe/assisted-order.service.spec.ts`
- Test: `backend/tests/controllers/custom-recipe.assisted-order.spec.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/admin/custom-recipe/orders/assisted` body:
    ```ts
    {
      customerId: string;
      dogId: string;
      targetGoal: TargetGoal;
      recipeQuantity: number;
      requestedProteinCodes?: string[];
      allergies?: string[];
      allergyText?: string;
      allergyStatus: AllergyAnswerStatus;
      currentFoodMain?: string;
      changeReasons?: string[];
      stomachConditions?: string[];
      additionalNotes?: string;
      payment: {
        collected: boolean;
        channel: 'OFFLINE_WECHAT' | 'OFFLINE_ALIPAY' | 'OTHER';
        amount: number;
        externalRef?: string;
      };
    }
    ```
  - `AssistedOrderService.create(input, operatorId)` → `{ orderId, status, amount, recipeQuantity }`
- Consumes: `CustomRecipePricingService`, schedule capacity methods, `CustomRecipeService.createOrder` 的排期/快照逻辑（抽出可复用私有方法，不复制）。

- [ ] **Step 1: 写 failing tests**

覆盖：有账号顾客正常创建；无账号代客客户 + 狗；2 份优惠价；`payment.collected=true` → `PAID` + `paymentConfirmedAt` + `paymentChannel`；未收款 → `PENDING_PAYMENT`；实际收款金额独立保存；狗不属于顾客时 400；非管理员 403。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/application/custom-recipe/assisted-order.service.spec.ts --runInBand`  
Expected: FAIL。

- [ ] **Step 3: 实现 service**

复用报价/排期/快照；`orderSource=ASSISTED`、`createdByStaffId=operatorId`、`assistedForGuest=dog.owner.isGuest`；`collected=true` 时写 `PAID`、`paymentConfirmedAt`、`paymentChannel`、`externalPaymentRef`、`actualPaidAmount=payment.amount`，**不得调用微信支付**。

- [ ] **Step 4: 写 controller 测试**

AdminGuard、参数校验、返回摘要、错误透传。

- [ ] **Step 5: 实现 controller**

挂在现有 admin custom recipe controller 的 `orders/assisted`，必须在 `orders/:orderId` 路由之前声明。

- [ ] **Step 6: 运行测试并提交**

Run: `cd backend && npx jest tests/application/custom-recipe/assisted-order.service.spec.ts tests/controllers/custom-recipe.assisted-order.spec.ts --runInBand`  
Expected: PASS。

```bash
git add backend/src/application/custom-recipe/assisted-order.service.ts backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts backend/tests
git commit -m "feat: add assisted custom recipe orders"
```

---

### Task 4: 后台代客下单页面

**Files:**
- Create: `admin-web/src/views/CustomRecipes/AssistedOrderCreate.vue`
- Modify: `admin-web/src/views/CustomRecipes/OrderList.vue`
- Modify: `admin-web/src/api/customRecipe.ts`
- Modify: `admin-web/src/router/index.ts`
- Test: `admin-web/src/views/CustomRecipes/assistedOrderCreate.regression.spec.ts`

**Interfaces:**
- Consumes: Task 2/3 APIs.
- Produces: 后台订单列表「代客下单」按钮；页面分四步：选客户/狗 → 填需求 → 报价 → 收款与提交。

- [ ] **Step 1: 写 failing tests**

断言页面存在客户搜索、代客客户新建、狗选择/新建、份数、主蛋白、报价、收款方式、实际收款金额、提交 payload、成功后跳订单详情。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd admin-web && npx vitest run src/views/CustomRecipes/assistedOrderCreate.regression.spec.ts`  
Expected: FAIL。

- [ ] **Step 3: 实现 API 与页面**

添加 `searchGuestCustomers/createGuestCustomer/createGuestDog/createAssistedOrder`；页面表单校验：客户、狗、目标、份数、当前食物、收款金额 > 0；提交前展示服务端报价与实收差额。

- [ ] **Step 4: 接入订单列表与路由**

`OrderList` 顶部按钮进入 `/custom-recipes/assisted-order`；成功后跳 `/custom-recipes/orders/:orderId`。

- [ ] **Step 5: 运行测试/构建**

Run: `cd admin-web && npm test && npm run build`  
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/views/CustomRecipes/AssistedOrderCreate.vue admin-web/src/views/CustomRecipes/OrderList.vue admin-web/src/api/customRecipe.ts admin-web/src/router/index.ts admin-web/src/views/CustomRecipes/assistedOrderCreate.regression.spec.ts
git commit -m "feat: add assisted custom recipe order page"
```

---

### Task 5: 线下收款与退款分流

**Files:**
- Modify: `backend/src/application/custom-recipe/custom-recipe.service.ts`
- Modify: `backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts`
- Test: `backend/tests/application/custom-recipe/custom-recipe-assisted-refund.spec.ts`
- Modify: `admin-web/src/views/CustomRecipes/OrderDetail.vue`
- Test: `admin-web/src/views/CustomRecipes/assistedRefund.regression.spec.ts`

**Interfaces:**
- Produces:
  - `paymentChannel` 非 `WECHAT_ONLINE` 时，取消/退款不调用 `createCustomRecipeRefund`；
  - `POST /api/v1/admin/custom-recipe/orders/:orderId/offline-refund` body `{ amount, method, note }`，仅管理员；
  - 订单详情显示「线下退款登记」而非「补退款」。

- [ ] **Step 1: 写 backend failing tests**

覆盖：线下单取消不调微信退款；登记金额/方式/操作人；已退款不可重复；自助单仍走原微信退款。

- [ ] **Step 2: 实现分流与登记**

Task 1 已加 `refundChannel` 与线下退款登记字段；admin controller 按 `paymentChannel` 分支，线下单只写登记字段，不调用微信退款。

- [ ] **Step 3: 写 admin 页面测试与实现**

线下单显示登记弹窗；自助单保留原「补退款」。

- [ ] **Step 4: 运行测试并提交**

Run: `cd backend && npx jest tests/application/custom-recipe/custom-recipe-assisted-refund.spec.ts --runInBand && cd ../admin-web && npx vitest run src/views/CustomRecipes/assistedRefund.regression.spec.ts`  
Expected: PASS。

```bash
git commit -m "feat: support offline assisted refunds"
```

---

### Task 6: 交付分享链接

**Files:**
- Create: `backend/src/application/custom-recipe/delivery-share.service.ts`
- Create: `backend/src/interfaces/controllers/public-custom-recipe-share.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/custom-recipe/delivery-share.service.spec.ts`
- Test: `backend/tests/controllers/public-custom-recipe-share.controller.spec.ts`
- Modify: `admin-web/src/views/CustomRecipes/OrderDetail.vue`
- Test: `admin-web/src/views/CustomRecipes/deliveryShare.regression.spec.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/admin/custom-recipe/orders/:orderId/delivery-share` → `{ url, expiresAt }`
  - `GET /api/v1/public/custom-recipe/delivery-share/:token` → 只读批次内容；过期/撤销 404
  - token 至少 32 字节随机；默认 7 天；管理员可撤销。
- 分享页可先用后端返回的只读 HTML/JSON；不暴露顾客手机号、其他订单。

- [ ] **Step 1: 写 failing tests**

覆盖：生成、访问、过期、撤销、错误 token、只含本单 N 份内容、不含手机号/openid。

- [ ] **Step 2: 实现 service/controller**

写入 `CustomRecipeDeliveryShare`；读取最新有效批次；返回脱敏内容；控制器公开但 token 校验。

- [ ] **Step 3: 写 admin 测试与按钮**

代客/无账号订单详情出现「复制交付链接」；复制成功后提示有效期；撤销按钮。

- [ ] **Step 4: 运行测试并提交**

```bash
git commit -m "feat: add read-only delivery share links"
```

---

### Task 7: 全流程合验

**Files:**
- Create: `docs/superpowers/acceptance/2026-10-21-custom-recipe-end-to-end.md`

**Interfaces:**
- Consumes: Task 0–6.
- Produces: 三套验收记录与阻塞缺陷清单。

- [ ] **Step 1: 自助单验收**

单份、2 份、5 份；付款；设计；交付；顾客查看 N 份；DIY；确认；售后；重新交付；退款。

- [ ] **Step 2: 有账号代客单验收**

后台选顾客/狗；线下已收款；订单出现在顾客小程序；设计/交付/售后。

- [ ] **Step 3: 无账号代客单验收**

后台建代客客户/狗；老板账号不新增狗；线下收款；设计/交付；分享链接在微信打开；撤销后 404；线下退款登记。

- [ ] **Step 4: 页面交互回归**

后台列表、代客下单、订单详情、设计器进度、交付、售后；小程序确认页、订单详情、交付、DIY、售后。

- [ ] **Step 5: 记录阻塞项并修复**

只修阻塞；非阻塞记录。

- [ ] **Step 6: 提交验收记录**

```bash
git add docs/superpowers/acceptance/2026-10-21-custom-recipe-end-to-end.md
git commit -m "docs: record assisted custom recipe acceptance"
```

## Self-Review

- Spec coverage: 代客客户、线下收款、代客下单、分享、售后、退款均有任务。
- Type consistency: `orderSource`、`paymentChannel`、`actualPaidAmount`、`assistedForGuest`、`delivery-share` 命名统一。
- Review Focus: 微信退款误调、账号归属、token 泄漏、金额不一致、重复订单均已在任务测试中落点。
- 未纳入本计划：代客客户以后注册小程序的自动认领；建议单独做。
