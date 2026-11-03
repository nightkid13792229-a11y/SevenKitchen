# 取消定制费抵扣成品货款 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除“定制费可抵扣成品鲜食”模块，包括配置、订单字段、成品订单抵扣、恢复额度、后台/小程序展示和测试。

**Architecture:** 余额只属于测试订单，没有真实历史顾客，因此采用直接删除而不是兼容保留。先删后端字段和业务逻辑，再删三端展示；最后跑全量测试、迁移、部署。

**Tech Stack:** NestJS、Prisma/PostgreSQL、Jest、Vue 3、uni-app、Vitest、admin-web Vue 3。

**Spec:** `docs/superpowers/specs/2026-10-20-multi-recipe-order-design.md` 第 5.4 节。

## Global Constraints

- 不存在真实历史订单；唯一已支付订单为测试订单，不需要保留抵扣余额。
- 不保留兼容字段、兼容接口或“余额迁移”。
- 删除后新订单不得再出现任何抵扣字段、接口、扣除、恢复或展示。
- 自定义定制订单的金额仍是最终应付定制费；不得因删除抵扣改变定制费算法。
- 成品订单不再扣减定制抵扣，不再记录“本单使用定制费抵扣”。
- 所有测试、构建通过后才可提交/部署。
- 后端用 `npx jest --runInBand`；admin-web 用 `npm test` + `npm run build`；小程序用 `npm test` + `npm run build:mp-weixin`。

## Review Focus

- 删除配置字段后，旧配置读取/保存不能报 Prisma unknown field。
- 删除成品订单字段后，下单、取消、退款、财务展示不能崩溃。
- 小程序确认页/订单详情不得残留“可抵扣”或空白金额行。
- 后台配置页、订单详情、订单列表不得残留恢复额度按钮或列。
- 测试订单不需要余额；不要为了保留它而留下兼容代码。
- 迁移删除字段前先确认生产没有真实订单余额；只保留测试订单。

---

### Task 1: Backend schema, config, and order credit removal

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/application/custom-recipe/custom-recipe-config.service.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe.service.ts`
- Modify: `backend/src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts`
- Modify: `backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/interfaces/controllers/orders.controller.ts`
- Modify: `backend/src/interfaces/dto/orders/order-response.dto.ts`
- Tests: backend credit-related specs.

- [ ] **Step 1: Add failing tests that assert no credit fields/endpoints**

Add/update backend tests to expect:
- `CustomRecipeConfigDto` has no `creditAmount`.
- Order create response has no `creditAmount`/`creditUsed`/`creditRemaining`.
- `POST /custom-recipe/admin/orders/:id/restore-credit` returns 404.
- A normal consumable order creates without any `creditAmountApplied` or `customRecipeCreditOrderId`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npx jest tests/application/custom-recipe tests/controllers/custom-recipe tests/application/order --runInBand
```

- [ ] **Step 3: Remove fields from schema and create migration**

Remove:
- `CustomRecipeConfig.creditAmount`
- `CustomRecipeOrder.creditAmount`
- `CustomRecipeOrder.creditUsed`
- `Order.creditAmountApplied`
- `Order.customRecipeCreditOrderId`

Run:

```bash
cd backend
npx prisma migrate dev --name remove_custom_recipe_credit
npx prisma generate
```

- [ ] **Step 4: Remove backend credit flows**

Delete/stop using:
- config defaults, DTO, validation, public config, toDto/toWriteData for credit;
- `createOrder` writes `creditAmount`;
- order-detail/admin/list serializers returning credit fields;
- `findUsableCredit`, `consumeCredit`, `restoreCredit`, `getCreditSummary` and related constants;
- admin `restore-credit` endpoint;
- `OrderService` `resolveCustomRecipeCredit`, `readCustomRecipeCreditFromSnapshot`, credit write in create/cancel/refund/preview;
- `orders.controller` credit display fields;
- response DTO fields and comments.

Keep “用这份食谱订购成品” action, but it no longer mentions or applies credit.

- [ ] **Step 5: Run backend tests**

```bash
cd backend
npx jest --runInBand
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "refactor: remove custom recipe finished-food credit backend"
```

---

### Task 2: Admin-web credit removal

**Files:**
- Modify: `admin-web/src/api/customRecipe.ts`
- Modify: `admin-web/src/views/CustomRecipes/Config.vue`
- Modify: `admin-web/src/views/CustomRecipes/OrderDetail.vue`
- Modify: `admin-web/src/views/CustomRecipes/OrderList.vue`
- Modify: `admin-web/src/views/Orders/Detail.vue`
- Modify: `admin-web/src/types/order.ts`
- Tests/build: admin-web.

- [ ] **Step 1: Add failing regression test**

Assert the admin config page does not contain:
- `可抵扣金额`
- `成品抵扣额度`
- `恢复额度`
- `creditAmountApplied`
- `customRecipeCreditOrderId`

- [ ] **Step 2: Run test to verify it fails**

```bash
cd admin-web
npx vitest run src/views/CustomRecipes
```

- [ ] **Step 3: Remove UI/API borrow fields and restore action**

- Delete credit config form item and validation;
- Delete credit ledger/columns from order detail/list;
- Delete restore-credit API call and button;
- Delete credit display from finished order detail and order types;
- Delete any “用定制费抵扣” copy.

- [ ] **Step 4: Run admin tests and build**

```bash
cd admin-web
npm test
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add admin-web
git commit -m "refactor: remove custom recipe credit from admin web"
```

---

### Task 3: Mini-program credit removal

**Files:**
- Modify: `miniapp/src/api/custom-recipe.ts`
- Modify: `miniapp/src/pages/custom-recipe/confirm.vue`
- Modify: `miniapp/src/pages/custom-recipe/order-detail.vue`
- Modify: `miniapp/src/pages/custom-recipe/index.vue`
- Modify: `miniapp/src/pages/home/index.vue`
- Modify: `miniapp/src/pages/custom-recipe-confirm.regression.spec.ts`
- Modify: `miniapp/src/pages/custom-recipe.regression.spec.ts`
- Modify: `miniapp/src/pages/orders-list/index.vue` if it renders credit.

- [ ] **Step 1: Add failing mini-program regression test**

Assert confirm/order-detail sources do not contain:
- `可抵扣`
- `成品抵扣`
- `creditAmount`
- `creditUsed`
- `creditRemaining`

- [ ] **Step 2: Run test to verify it fails**

```bash
cd miniapp
npx vitest run src/pages/custom-recipe-confirm.regression.spec.ts src/pages/custom-recipe.regression.spec.ts
```

- [ ] **Step 3: Remove UI and API types**

- Delete credit rows/sections/notes;
- Delete credit fields from API types;
- Remove credit phrase from comments/copy that still reach users;
- Keep order amount and discount only.

- [ ] **Step 4: Run mini-program tests and build**

```bash
cd miniapp
npm test
npm run build:mp-weixin
```

- [ ] **Step 5: Commit**

```bash
git add miniapp
git commit -m "refactor: remove custom recipe credit from mini program"
```

---

### Task 4: Full verification, migration, and deployment

- [ ] **Step 1: Run all tests**
  - backend: `npx jest --runInBand`
  - admin-web: `npm test && npm run build`
  - miniapp: `npm test && npm run build:mp-weixin`
- [ ] **Step 2: Run Prisma migration in production only after backup/confirmation**
- [ ] **Step 3: Deploy backend/admin-web**
- [ ] **Step 4: Upload mini-program experience version**
- [ ] **Step 5: Verify production health and key pages**
- [ ] **Step 6: Commit any migration/docs updates**
