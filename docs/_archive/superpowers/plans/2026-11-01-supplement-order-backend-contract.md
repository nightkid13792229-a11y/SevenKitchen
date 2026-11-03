# 预分装补剂下单页重构 · 后端契约与后台配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让补剂报价/下单接口支持"不设份数上限 + 金额可校验 + 重复提交可幂等"，并给后台加上"大单提示袋数"配置。前端页面重构见配套计划。

**Architecture:** 分五步：先加配置字段（含一次 Prisma 迁移），再改定价服务（档位固定 1/2/3、份数不再被配置夹住），然后改报价响应（全部不可买时返回零值报价 + 暴露三个新字段），接着改下单（1–99、期望金额、幂等键），最后改后台配置页。

**Tech Stack:** NestJS + Prisma + PostgreSQL（后端），Vue 3 + Element Plus（admin-web），Jest（后端测试）。

**Spec:** `docs/superpowers/specs/2026-11-01-supplement-order-page-redesign-design.md`

## Global Constraints

- 不改补剂的**定价算法**：加价倍率、服务费、包材费、运费、包邮/免服务费门槛的计算一行都不动。
- 补剂**不再有"天"**：`totalDays` / `perDayCost` 恒为 `null`；不要重新引入天数或效期天数判断。
- 份数的可购买范围是 **1–99**；三张卡的档位固定 **[1, 2, 3]**，与后台配置无关。
- `quote` 响应里的 `maxPortionMultiplier` **恒返回 3**（老客户端靠它渲染三张卡，返回 99 会让老页面渲染 99 张卡）。
- 金额比较一律用**整数分**（`Math.round(x * 100)`），禁止直接比浮点。
- 数据库只能通过 Prisma migration 修改，不手写 SQL 直连库。
- 错误文案是中文、说人话、能直接展示给顾客。
- 每步改完都要 `cd backend && npx tsc --noEmit` 干净；联调期间**不要跑 `npm run build`**（会删 `dist/` 弄死在跑的服务）。

## Review Focus

1. **老版本小程序的兼容**：`quote` 若变成 `null` 或 `maxPortionMultiplier` 变成 99，线上旧版本会崩或渲染 99 张卡 —— 必须零值报价 + 恒 3。
2. **一分钱的误差**：`expectedTotal` 用浮点比较会让正常下单偶发失败，必须整数分。
3. **幂等键的并发**：两个请求带同一个 `clientRequestId` 同时到达时，只能有一笔订单 —— 唯一索引 + 冲突后回查，不能只靠"先查再插"。
4. **全部不可买时不能建单**：`buildQuote` 不再抛错之后，`createOrder` 必须仍然拦住（它现在依赖那句 throw）。
5. **配置字段加进 DTO 后**：6 个测试文件里的 `buildConfig` 夹具会全部编译失败，必须一起补。

---

### Task 1: 配置项「大单提示袋数」

**Files:**
- Modify: `backend/prisma/schema.prisma`（`model SupplementShopConfig`，加量段之后）
- Create: `backend/prisma/migrations/20261101235500_supplement_bulk_bag_threshold/migration.sql`
- Modify: `backend/src/application/supplement-shop/supplement-shop-config.constants.ts`
- Modify: `backend/src/application/supplement-shop/supplement-shop-config.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-shop-config.service.spec.ts`
- Modify (补齐夹具): `backend/tests/application/supplement-shop/supplement-pricing.service.spec.ts`、`supplement-order.service.spec.ts`、`supplement-order-workflow.spec.ts`、`supplement-shop-config.constants.spec.ts`、`backend/tests/interfaces/controllers/admin-supplement-shop.controller.spec.ts`

**Interfaces:**
- Produces: `SupplementShopConfigDto.bulkBagThreshold: number`（默认 60，允许 1–500 的整数）；`UpdateSupplementShopConfigDto` 因是 `Partial<...>` 自动获得该字段。

- [ ] **Step 1: 写失败测试**

在 `supplement-shop-config.service.spec.ts` 追加：

```ts
it('大单提示袋数默认 60', async () => {
  const config = await service.getConfig();
  expect(config.bulkBagThreshold).toBe(60);
});

it('大单提示袋数可以改，且必须是 1~500 的整数', async () => {
  await service.updateConfig({ bulkBagThreshold: 120 });
  expect((await service.getConfig()).bulkBagThreshold).toBe(120);
  await expect(service.updateConfig({ bulkBagThreshold: 0 })).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.updateConfig({ bulkBagThreshold: 501 })).rejects.toBeInstanceOf(BadRequestException);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-shop-config.service.spec.ts -t "大单提示袋数"`
Expected: FAIL —— `bulkBagThreshold` 不存在（TS 报错或 undefined）。

- [ ] **Step 3: 改 schema 与迁移**

`prisma/schema.prisma` 在 `maxTotalDays` 之后加：

```prisma
  /// 单笔分装袋数超过这个值就在下单页提示"发货会顺延"（只提示，不拦单）
  bulkBagThreshold          Int                          @default(60) @map("bulk_bag_threshold")
```

`migration.sql`：

```sql
ALTER TABLE "supplement_shop_config" ADD COLUMN "bulk_bag_threshold" INTEGER NOT NULL DEFAULT 60;
```

- [ ] **Step 4: 改常量与服务**

- `supplement-shop-config.constants.ts`：`DEFAULTS` 加 `bulkBagThreshold: 60`；`TARGET_LABELS` 加 `bulkBagThreshold: '大单提示袋数'`。
- `supplement-shop-config.service.ts`：`SupplementShopConfigDto` 加 `bulkBagThreshold: number`（放在 `maxTotalDays` 附近并注明用途）；`assertValid` 加 1–500 整数校验（文案：「大单提示袋数必须是 1~500 的整数」）；`toWriteData` 加透传；`toDto`/行映射处加 `bulkBagThreshold: Number(row.bulkBagThreshold)`。

- [ ] **Step 5: 补 6 个夹具并跑测试**

Run: `cd backend && npx tsc --noEmit && npx jest tests/application/supplement-shop -t "大单提示袋数"`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/prisma backend/src/application/supplement-shop backend/tests
git commit -m "feat(supplement): 补剂配置新增大单提示袋数"
```

---

### Task 2: 档位固定 1/2/3，份数不再被配置夹住

**Files:**
- Modify: `backend/src/application/supplement-shop/supplement-pricing.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-pricing.service.spec.ts`

**Interfaces:**
- Produces: `PORTION_CARD_TIERS: readonly [1, 2, 3]`、`MAX_PURCHASABLE_PORTIONS = 99`（两个都从 pricing service 导出）。
- Produces: `calculateQuote(config, lineInputs, shipping, { portionMultiplier })` 的规则变化 —— 5 份就按 5 份算，不再收敛；`portionOptions` 恒为三档；返回的 `maxPortionMultiplier` 恒为 3。
- Consumes: Task 1 的 `config.bulkBagThreshold`（本任务不用，但夹具已包含）。

- [ ] **Step 1: 写失败测试**

在 `supplement-pricing.service.spec.ts` 末尾追加一个新的 `describe`（用能被整除的参数，避免圆整规则干扰断言）：

```ts
describe('份数（2026-11-01 取消产品上限）', () => {
  const config = buildConfig({
    markupMultiplier: 1,
    priceRoundingMode: 'NONE',
    serviceFeeAmount: 0,
    packagingFeePerBag: 0,
    freeShippingThreshold: null,
    minOrderAmount: 0,
  });
  const lines = [
    { ingredientId: 'x', name: '测试补剂', unit: '粒', amount: 10, unitCost: 1, physicalForm: 'CAPSULE' as const },
  ];
  const shipping = { fee: 0, description: '无运费' };

  it('5 份就按 5 份算，不再被配置上限夹住', () => {
    const one = service.calculateQuote(config, lines, shipping, { portionMultiplier: 1 });
    const five = service.calculateQuote(config, lines, shipping, { portionMultiplier: 5 });
    expect(one.goodsSubtotal).toBe(10);
    expect(five.portionMultiplier).toBe(5);
    expect(five.lines[0].bags).toBe(5);
    expect(five.goodsSubtotal).toBe(50);
  });

  it('份数档位恒为 1/2/3，maxPortionMultiplier 恒为 3', () => {
    const quote = service.calculateQuote(config, lines, shipping, { portionMultiplier: 7 });
    expect(quote.portionOptions.map((o) => o.multiplier)).toEqual([1, 2, 3]);
    expect(quote.maxPortionMultiplier).toBe(3);
  });

  it('份数必须是 1~99 的整数', () => {
    expect(() => service.calculateQuote(config, lines, shipping, { portionMultiplier: 0 })).toThrow(BadRequestException);
    expect(() => service.calculateQuote(config, lines, shipping, { portionMultiplier: 100 })).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-pricing.service.spec.ts -t "份数"`
Expected: FAIL（5 份被夹到 3；`portionOptions` 长度为 3 但 main 报价也是 3）。

- [ ] **Step 3: 实现**

- 导出 `PORTION_CARD_TIERS = [1, 2, 3] as const`、`MAX_PURCHASABLE_PORTIONS = 99`。
- `calculateQuote`：`portionMultiplier` 只做 1–99 的合法性校验（越界抛 `BadRequestException`），**删掉** `Math.min(portionMultiplier, maxPortionMultiplier)` 与"超出上限按 X 份计价"的 warning。
- `portionOptions` 改为遍历 `PORTION_CARD_TIERS`（m 等于当前份数时复用 primary，否则单独算）。
- 返回对象里的 `maxPortionMultiplier` 固定为 `3`。
- `resolveMaxPortionMultiplier` 保留导出（其它地方引用），但不再参与报价收敛；函数体保持"只看 `maxPortionMultiplier`"，并更新注释说明它现在只服务于老客户端的三张卡。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-pricing.service.spec.ts`
Expected: PASS（含原有的效期相关用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/supplement-shop/supplement-pricing.service.ts backend/tests/application/supplement-shop/supplement-pricing.service.spec.ts
git commit -m "feat(supplement): 份数档位固定 1/2/3，购买份数上限放到 99"
```

---

### Task 3: 报价响应：零值报价 + 三个新字段

**Files:**
- Modify: `backend/src/application/supplement-shop/supplement-order.service.ts`（`buildQuote` / `quote`）
- Test: `backend/tests/application/supplement-shop/supplement-order.service.spec.ts`

**Interfaces:**
- Produces: `quote()` 返回 `{ quote: SupplementQuote, unavailable, enabled, inventoryWarnings, minOrderAmount: number, paymentTimeoutMinutes: number, bulkBagThreshold: number }`。
- Produces: `buildQuote()` 不再抛"没有可购买的补剂"，而是返回零值 quote；`createOrder` 自己拦。

- [ ] **Step 1: 写失败测试**

```ts
it('全部补剂都不可买时，报价正常返回零值报价而不是报错', async () => {
  const res = await service.quote({ lines: [{ ingredientId: unavailableId, amount: 100 }] });
  expect(res.quote.lines).toEqual([]);
  expect(res.quote.bagCount).toBe(0);
  expect(res.quote.total).toBe(0);
  expect(res.quote.portionOptions).toEqual([]);
  expect(res.quote.maxPortionMultiplier).toBe(3);
  expect(res.unavailable).toHaveLength(1);
});

it('报价响应带上最低起送、支付超时、大单提示袋数', async () => {
  const res = await service.quote({ lines: [{ ingredientId: okId, amount: 100 }] });
  expect(res.minOrderAmount).toBe(0);
  expect(res.paymentTimeoutMinutes).toBe(30);
  expect(res.bulkBagThreshold).toBe(60);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-order.service.spec.ts -t "零值报价"`
Expected: FAIL —— 抛 `BadRequestException`。

- [ ] **Step 3: 实现**

- 新增私有函数 `buildEmptyQuote(): SupplementQuote`：`lines: []`、`bagCount: 0`、各金额 0、`warnings: []`、`portionMultiplier: 1`、`totalDays: null`、`perDayCost: null`、`maxPortionMultiplier: 3`、`portionOptions: []`（其余必需字段给 0 或 false，照 `SupplementQuote` 接口补齐）。
- `buildQuote`：`available.length === 0` 时不再抛错，`quote = this.buildEmptyQuote()`，跳过 `pricingService.previewQuote`；其余分支不变。
- `quote()` 的返回对象补三个字段（从 `config` 读）。
- `createOrder`：保留 `if (unavailable.length > 0) throw` 的位置在取 `quote` 之后、写库之前（现在它依赖 buildQuote 抛错，要确认这行在 buildQuote 改造后仍然生效）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-order.service.spec.ts`
Expected: PASS；同时确认 `createOrder` 的既有"不可购买"用例仍 PASS（说明拦截没丢）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/supplement-shop/supplement-order.service.ts backend/tests/application/supplement-shop/supplement-order.service.spec.ts
git commit -m "feat(supplement): 全部不可买返回零值报价，报价补三个配置字段"
```

---

### Task 4: 下单：1–99、期望金额校验、幂等键

**Files:**
- Modify: `backend/prisma/schema.prisma`（`model SupplementOrder`）
- Create: `backend/prisma/migrations/20261101235600_supplement_order_client_request_id/migration.sql`
- Modify: `backend/src/application/supplement-shop/supplement-order.service.ts`（`CreateSupplementOrderRequest` / `createOrder`）
- Test: `backend/tests/application/supplement-shop/supplement-order.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `MAX_PURCHASABLE_PORTIONS`。
- Produces: `CreateSupplementOrderRequest.clientRequestId?: string`、`expectedTotal?: number`（**整数分**）。
- Produces: 同一 `(userId, clientRequestId)` 第二次提交返回**同一笔订单**（不再建第二笔）。

- [ ] **Step 1: 写失败测试**

```ts
it('期望金额不一致时拒绝建单', async () => {
  await expect(service.createOrder(userId, { ...baseRequest, expectedTotal: 1 }))
    .rejects.toThrow(/价格已更新/);
});

it('同一个 clientRequestId 重复提交只产生一笔订单', async () => {
  const req = { ...baseRequest, clientRequestId: 'req-abc' };
  const first = await service.createOrder(userId, req);
  const second = await service.createOrder(userId, req);
  expect(second.id).toBe(first.id);
  expect(await prisma.supplementOrder.count({ where: { userId } })).toBe(1);
});

it('份数 100 被拒绝，5 份可以通过', async () => {
  await expect(service.createOrder(userId, { ...baseRequest, portionMultiplier: 100 }))
    .rejects.toBeInstanceOf(BadRequestException);
  const ok = await service.createOrder(userId, { ...baseRequest, portionMultiplier: 5 });
  expect(ok.portionMultiplier).toBe(5);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-order.service.spec.ts -t "clientRequestId"`
Expected: FAIL（字段不存在 / 建了两笔）。

- [ ] **Step 3: 改 schema 与迁移**

```prisma
  /// 小程序一次提交流程生成的幂等键；重试复用同一个值，用来防重复建单
  clientRequestId           String?               @map("client_request_id") @db.VarChar(64)
  @@unique([userId, clientRequestId])
```

```sql
ALTER TABLE "supplement_order" ADD COLUMN "client_request_id" VARCHAR(64);
CREATE UNIQUE INDEX "supplement_order_user_id_client_request_id_key"
  ON "supplement_order"("user_id", "client_request_id");
```

- [ ] **Step 4: 实现**

- `CreateSupplementOrderRequest` 加两个可选字段。
- 份数校验：`requestedMultiplier` 是 1–`MAX_PURCHASABLE_PORTIONS` 的整数，越界抛 `BadRequestException('购买套数必须是 1~99 的整数')`；删掉基于 `resolveMaxPortionMultiplier` 的上限拒绝。
- `expectedTotal`：若传了，校验 `Number.isInteger(expectedTotal) && expectedTotal >= 0`，再与 `Math.round(quote.total * 100)` 比较，不等抛 `BadRequestException('价格已更新，请确认新价格后重新提交')`。
- 幂等：`createOrder` 开头若 `clientRequestId` 存在，先按 `(userId, clientRequestId)` 查，命中就直接 `return this.getOrder(userId, existing.id)`；创建时把 `clientRequestId` 写进 `data`，并对 Prisma `P2002` 冲突做 catch → 回查 → 返回已有订单。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-order.service.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/prisma backend/src/application/supplement-shop/supplement-order.service.ts backend/tests
git commit -m "feat(supplement): 下单支持 1-99 套、期望金额校验与幂等键"
```

---

### Task 5: 后台配置页：删「加量份数上限」，加「大单提示袋数」

**Files:**
- Modify: `admin-web/src/api/supplementShop.ts`（`SupplementShopConfig` 类型）
- Modify: `admin-web/src/views/SupplementShop/Config.vue`

**Interfaces:**
- Consumes: Task 1 的 `bulkBagThreshold` 字段。

- [ ] **Step 1: 改类型与表单**

- `supplementShop.ts`：`SupplementShopConfig` 加 `bulkBagThreshold: number`。
- `Config.vue`：删掉整个「加量」`el-divider` 分组与其 `el-form-item`（"加量份数上限"），在"排期/产能"或"售后"附近新增一个 `el-form-item label="大单提示袋数"`，`:min="1" :max="500"`，提示文案：「单笔分装袋数超过这个值，下单页会提示『发货会顺延』，只提示不拦单。」
- `form` 默认值加 `bulkBagThreshold: 60`、提交 payload 带上该字段；删掉 `maxPortionMultiplier` 的提交（后端字段保留，不再由界面维护）。

- [ ] **Step 2: 构建验证**

Run: `cd admin-web && npm run build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 3: 提交**

```bash
git add admin-web/src/api/supplementShop.ts admin-web/src/views/SupplementShop/Config.vue
git commit -m "feat(admin): 补剂配置去掉加量上限，新增大单提示袋数"
```

---

## 交付后必须做

- `cd backend && npm test` 全绿；`npx tsc --noEmit` 干净。
- 后端与 admin-web 可以直接部署到生产（按项目规则，先合并 `main`、推 `origin/main`，再跑部署脚本）；**小程序不随这次部署**。
- 部署后在后台确认："加量份数上限"已消失、"大单提示袋数"为 60。
