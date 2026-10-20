# 多份食谱下单（第一阶段：价格与下单）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有单份订单行为的前提下，为定制订单增加 1–5 份的服务端权威报价、价格快照和确认页份数选择；多份开关保持关闭，交付能力由下一阶段实现。

**Architecture:** 新增独立 `CustomRecipePricingService` 负责折扣、抵扣和金额计算；配置与优惠档位仍由 `CustomRecipeConfigService` 提供；`createOrder` 只接受后端计算结果。小程序确认页只展示后端报价，不自行计算最终金额。所有多份能力由 `multiRecipeEnabled` 开关挡住，默认关闭。

**Tech Stack:** NestJS、Prisma/PostgreSQL、Jest、Vue 3、uni-app、Vitest、admin-web Vue 3。

**Spec:** `docs/superpowers/specs/2026-10-20-multi-recipe-order-design.md`

## Global Constraints

- 单笔最少 1 份，最多 5 份；6 份必须被拒绝。
- 1 份不允许折扣。
- 默认优惠档位：2 份 5%、3 份 8%、4 份 10%、5 份 12%。
- 最高折扣 20%，后台不能配置超过。
- 每份抵扣默认 150 元；抵扣总额 = 每份抵扣 × 份数。
- 份数越高，折扣率不能降低。
- 所有金额必须由后端计算；前端传金额一律不采信。
- 价格、折扣、原价、应付、抵扣必须在提交订单时快照。
- 老订单份数视为 1，金额和抵扣不变。
- 多份购买开关默认关闭；关闭时创建 quantity > 1 的订单必须报错。
- 本期不做多份设计、多份交付、指定食谱售后；这些属于后续计划。
- 不做每份单独备注；备注仍共用一份。
- 后端测试用 `npx jest <path> --runInBand`；小程序测试用 `npx vitest run <path>`；admin-web 构建用 `npm run build`。

## Review Focus

- 份数为 0、负数、6 或非整数时，报价和下单都必须拒绝，不能生成负金额或 6 份订单。
- 优惠配置出现重复份数、折扣下降、超过 20% 或缺少档位时，后台保存必须失败；报价不能静默使用坏配置。
- 金额舍入错误：900 × 8% 必须得到 72 优惠、828 应付，不能出现 827.99 或 828.01。
- `multiRecipeEnabled=false` 时，任何 quantity > 1 的请求都必须被拒绝，不能只靠前端隐藏。
- 老订单、单份订单的金额、抵扣和状态不能被新逻辑改变。
- 前端展示金额与后端创建订单金额不一致时，支付金额必须以创建订单返回的 amount 为准。
- 订单创建后配置被修改，不能影响已创建订单的快照。

---

## File Structure

### Backend

- Modify: `backend/prisma/schema.prisma` — 配置字段、订单份数与价格快照字段。
- Modify: `backend/src/application/custom-recipe/custom-recipe-config.service.ts` — 配置读取、公开配置、校验、DTO。
- Create: `backend/src/application/custom-recipe/custom-recipe-pricing.service.ts` — 折扣与报价唯一实现。
- Modify: `backend/src/application/custom-recipe/custom-recipe.service.ts` — 创建订单时使用报价并写快照。
- Modify: `backend/src/application/custom-recipe/dto/custom-recipe.dto.ts` — 接收份数。
- Modify: `backend/src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts` — 报价接口。
- Modify: `backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts` — 配置保存复用校验。
- Tests:
  - Create: `backend/tests/application/custom-recipe/custom-recipe-pricing.service.spec.ts`
  - Create: `backend/tests/application/custom-recipe/custom-recipe-multi-order.spec.ts`
  - Modify: `backend/tests/application/custom-recipe/custom-recipe-config.service.spec.ts`

### Admin Web

- Modify: `admin-web/src/api/customRecipe.ts` — 配置类型。
- Modify: `admin-web/src/views/CustomRecipes/Config.vue` — 优惠档位与设计工时配置。
- Create: `admin-web/src/views/CustomRecipes/multiRecipeConfig.regression.spec.ts` — 配置页面回归。

### MiniApp

- Modify: `miniapp/src/api/custom-recipe.ts` — 报价与公开配置类型。
- Create: `miniapp/src/utils/custom-recipe-pricing.ts` — 金额展示与报价请求封装。
- Modify: `miniapp/src/pages/custom-recipe/confirm.vue` — 份数选择与价格明细。
- Modify: `miniapp/src/pages/custom-recipe-confirm.regression.spec.ts` — 确认页回归。

---

### Task 1: Add persisted multi-recipe configuration and order snapshot fields

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Test: `backend/tests/application/custom-recipe/custom-recipe-config.service.spec.ts`

**Interfaces:**
- Produces Prisma fields:
  - `CustomRecipeConfig.multiRecipeEnabled: boolean`
  - `CustomRecipeConfig.maxRecipeQuantity: number`
  - `CustomRecipeConfig.multiRecipeDiscounts: Json`
  - `CustomRecipeConfig.dailyDesignMinutes: number`
  - `CustomRecipeConfig.minutesPerRecipe: number`
  - `CustomRecipeOrder.recipeQuantity: number`
  - `CustomRecipeOrder.requestedProteinCodes: string[]`
  - `CustomRecipeOrder.unitAmount: Decimal`
  - `CustomRecipeOrder.originalAmount: Decimal`
  - `CustomRecipeOrder.discountRate: Decimal`
  - `CustomRecipeOrder.discountAmount: Decimal`
  - `CustomRecipeOrder.pricingSnapshot: Json?`
- `multiRecipeDiscounts` shape: `Array<{ quantity: number; discountRate: number; label: string }>`.

- [ ] **Step 1: Write the failing config test**

Add to `custom-recipe-config.service.spec.ts`:

```ts
it('多份配置默认关闭，最多 5 份，默认优惠档位可读', async () => {
  const config = await service.getConfig();
  expect(config.multiRecipeEnabled).toBe(false);
  expect(config.maxRecipeQuantity).toBe(5);
  expect(config.multiRecipeDiscounts).toEqual([
    { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
    { quantity: 3, discountRate: 0.08, label: '3 份享 92 折' },
    { quantity: 4, discountRate: 0.10, label: '4 份享 9 折' },
    { quantity: 5, discountRate: 0.12, label: '5 份享 88 折' },
  ]);
  expect(config.dailyDesignMinutes).toBe(480);
  expect(config.minutesPerRecipe).toBe(96);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/application/custom-recipe/custom-recipe-config.service.spec.ts --runInBand`
Expected: FAIL because fields do not exist.

- [ ] **Step 3: Add schema fields and create migration**

Add to `CustomRecipeConfig`:

```prisma
multiRecipeEnabled   Boolean @default(false) @map("multi_recipe_enabled")
maxRecipeQuantity    Int     @default(5) @map("max_recipe_quantity")
multiRecipeDiscounts Json    @default("[]") @map("multi_recipe_discounts")
dailyDesignMinutes   Int     @default(480) @map("daily_design_minutes")
minutesPerRecipe     Int     @default(96) @map("minutes_per_recipe")
```

Add to `CustomRecipeOrder`:

```prisma
recipeQuantity         Int      @default(1) @map("recipe_quantity")
requestedProteinCodes  String[] @default([]) @map("requested_protein_codes")
unitAmount             Decimal  @default(300) @map("unit_amount") @db.Decimal(10, 2)
originalAmount         Decimal  @default(300) @map("original_amount") @db.Decimal(10, 2)
discountRate           Decimal  @default(0) @map("discount_rate") @db.Decimal(5, 4)
discountAmount         Decimal  @default(0) @map("discount_amount") @db.Decimal(10, 2)
pricingSnapshot        Json?    @map("pricing_snapshot")
```

Run:

```bash
cd backend
npx prisma migrate dev --name multi_recipe_pricing
npx prisma generate
```

- [ ] **Step 4: Update config DTO/defaults/read-write mapping**

In `custom-recipe-config.service.ts`:

- Extend `CustomRecipeConfigDto` and `PublicCustomRecipeConfigDto`.
- Add defaults in `toDto`/`toWriteData` fallback.
- Do not expose `dailyDesignMinutes`, `minutesPerRecipe`, or discount tiers in public config until the customer UI needs them; public config needs `multiRecipeEnabled`, `maxRecipeQuantity`, `multiRecipeDiscounts`.
- Keep `maxRecipeQuantity` fixed at 5 even if row is malformed.

- [ ] **Step 5: Run tests**

Run: `cd backend && npx jest tests/application/custom-recipe/custom-recipe-config.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/application/custom-recipe/custom-recipe-config.service.ts backend/tests/application/custom-recipe/custom-recipe-config.service.spec.ts
git commit -m "feat: add multi recipe config and order pricing fields"
```

---

### Task 2: Implement server-authoritative pricing and discount validation

**Files:**
- Create: `backend/src/application/custom-recipe/custom-recipe-pricing.service.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe-config.service.ts`
- Create: `backend/tests/application/custom-recipe/custom-recipe-pricing.service.spec.ts`

**Interfaces:**
- Consumes `CustomRecipeConfigDto`.
- Produces:

```ts
export interface CustomRecipeQuote {
  quantity: number;
  unitAmount: number;
  originalAmount: number;
  discountRate: number;
  discountAmount: number;
  payableAmount: number;
  creditPerRecipe: number;
  creditAmount: number;
}

quote(quantity: number, config: CustomRecipeConfigDto): CustomRecipeQuote;
```

- [ ] **Step 1: Write failing pricing tests**

Create `custom-recipe-pricing.service.spec.ts` with exact cases:

```ts
it.each([
  [1, 300, 0, 0, 300, 150],
  [2, 300, 0.05, 30, 570, 300],
  [3, 300, 0.08, 72, 828, 450],
  [4, 300, 0.10, 120, 1080, 600],
  [5, 300, 0.12, 180, 1320, 750],
])('quantity %i', (quantity, unit, rate, discount, payable, credit) => {
  const quote = service.quote(quantity, config);
  expect(quote).toMatchObject({
    quantity,
    unitAmount: unit,
    discountRate: rate,
    discountAmount: discount,
    payableAmount: payable,
    creditAmount: credit,
  });
});

it.each([0, -1, 6, 1.5, Number.NaN])('rejects invalid quantity %s', (quantity) => {
  expect(() => service.quote(quantity, config)).toThrow();
});

it('rejects discount tiers that go down, duplicate quantities, or exceed 20%', () => {
  expect(() => service.quote(3, badConfig)).toThrow('优惠配置不合法');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/application/custom-recipe/custom-recipe-pricing.service.spec.ts --runInBand`
Expected: FAIL because service/module does not exist.

- [ ] **Step 3: Implement pricing service**

Create `CustomRecipePricingService` with:

- validate quantity integer 1..5;
- sort tiers by quantity;
- reject quantities outside 2..5, duplicate quantities, decreasing rates, rate < 0, rate > 0.20;
- find highest tier where `quantity >= tier.quantity`;
- `originalAmount = unitAmount * quantity`;
- `discountAmount = round2(originalAmount * discountRate)`;
- `payableAmount = round2(originalAmount - discountAmount)`;
- `creditPerRecipe = config.creditAmount`;
- `creditAmount = round2(creditPerRecipe * quantity)`;
- ensure numeric values are finite and non-negative;
- return the quote object.

Use `Decimal`-free number math but round at each public amount with `Math.round(value * 100) / 100`.

- [ ] **Step 4: Add config validation**

In `CustomRecipeConfigService.assertValid`:

- `maxRecipeQuantity` must equal 5;
- discount tiers must be arrays with integer quantities 2–5;
- no duplicate quantity;
- nondecreasing rates by quantity;
- each rate > 0 and <= 0.20;
- `minutesPerRecipe > 0`, `dailyDesignMinutes > 0`;
- throw the same human error text `优惠配置不合法` for pricing-related invalid input.

- [ ] **Step 5: Run tests**

Run: `cd backend && npx jest tests/application/custom-recipe/custom-recipe-pricing.service.spec.ts tests/application/custom-recipe/custom-recipe-config.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/custom-recipe/custom-recipe-pricing.service.ts backend/src/application/custom-recipe/custom-recipe-config.service.ts backend/tests/application/custom-recipe/custom-recipe-pricing.service.spec.ts
git commit -m "feat: add authoritative multi recipe pricing"
```

---

### Task 3: Accept quantity in order creation and snapshot the quote

**Files:**
- Modify: `backend/src/application/custom-recipe/dto/custom-recipe.dto.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe.service.ts`
- Create: `backend/tests/application/custom-recipe/custom-recipe-multi-order.spec.ts`

**Interfaces:**
- Consumes `CustomRecipePricingService.quote`.
- DTO adds:

```ts
@IsOptional()
@IsInt()
@Min(1)
@Max(5)
recipeQuantity?: number;

@IsOptional()
@IsArray()
@IsString({ each: true })
requestedProteinCodes?: string[];
```

- Order creation:
  - `quantity = data.recipeQuantity ?? 1`;
  - if `quantity > 1 && !config.multiRecipeEnabled` throw `多份购买暂未开放`;
  - if `requestedProteinCodes.length` is not 0 or `quantity`, throw;
  - if selected, length must equal quantity and all codes must be unique;
  - call quote;
  - store `recipeQuantity`, `requestedProteinCodes`, `unitAmount`, `originalAmount`, `discountRate`, `discountAmount`, `pricingSnapshot`, `amount = quote.payableAmount`, `creditAmount = quote.creditAmount`.

- [ ] **Step 1: Write failing order tests**

Add tests:

```ts
it('creates a 3-recipe order with 8% discount and 450 credit', async () => {
  const order = await service.createOrder({ ...baseDto, recipeQuantity: 3 });
  expect(order.amount).toEqual(828);
  expect(order.creditAmount).toEqual(450);
  expect(order.recipeQuantity).toEqual(3);
  expect(order.pricingSnapshot).toMatchObject({
    quantity: 3,
    discountRate: 0.08,
    discountAmount: 72,
    payableAmount: 828,
  });
});

it('rejects quantity 6 and quantity 0', async () => {
  await expect(service.createOrder({ ...baseDto, recipeQuantity: 6 }))
    .rejects.toThrow('份数');
});

it('rejects multi quantity when the feature is disabled', async () => {
  await expect(service.createOrder({ ...baseDto, recipeQuantity: 2 }))
    .rejects.toThrow('多份购买暂未开放');
});

it('rejects duplicate requested proteins', async () => {
  await expect(service.createOrder({
    ...baseDto,
    recipeQuantity: 2,
    requestedProteinCodes: ['CHICKEN', 'CHICKEN'],
  })).rejects.toThrow('肉类');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/application/custom-recipe/custom-recipe-multi-order.spec.ts --runInBand`
Expected: FAIL on missing fields/validation.

- [ ] **Step 3: Add DTO fields and service validation**

Update DTO and `createOrder` as above. Do not trust any amount fields from the client. Keep old behaviour when quantity is 1 and no proteins.

- [ ] **Step 4: Run tests and existing custom recipe tests**

Run:

```bash
cd backend
npx jest tests/application/custom-recipe tests/controllers/custom-recipe --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/custom-recipe/dto/custom-recipe.dto.ts backend/src/application/custom-recipe/custom-recipe.service.ts backend/tests/application/custom-recipe/custom-recipe-multi-order.spec.ts
git commit -m "feat: create multi recipe orders with price snapshot"
```

---

### Task 4: Expose config and quote through the customer API

**Files:**
- Modify: `backend/src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe-config.service.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe-pricing.service.ts`
- Test: `backend/tests/controllers/custom-recipe.multi-quote.spec.ts`

**Interfaces:**
- `GET /api/v1/custom-recipe/quote?quantity=3` returns `ApiResponseDto.success(CustomRecipeQuote)`.
- Public config includes `multiRecipeEnabled`, `maxRecipeQuantity`, `multiRecipeDiscounts`.

- [ ] **Step 1: Write failing controller test**

```ts
it('returns 828 payable for quantity 3', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/v1/custom-recipe/quote?quantity=3')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  expect(res.body.data.payableAmount).toBe(828);
  expect(res.body.data.creditAmount).toBe(450);
});

it('rejects quantity 6', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/custom-recipe/quote?quantity=6')
    .set('Authorization', `Bearer ${token}`)
    .expect(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/controllers/custom-recipe.multi-quote.spec.ts --runInBand`
Expected: FAIL 404/undefined.

- [ ] **Step 3: Implement endpoint and public config**

Add route before wildcard order routes:

```ts
@Get('quote')
@ApiOperation({ summary: 'Quote multi recipe order' })
async quote(@Query('quantity') quantity: string) {
  const parsed = Number(quantity);
  const config = await this.configService.getConfig();
  return ApiResponseDto.success(this.pricingService.quote(parsed, config));
}
```

Wire `CustomRecipePricingService` into the controller module. Reject non-finite/non-integer quantity with 400.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/controllers/custom-recipe.multi-quote.spec.ts tests/application/custom-recipe --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts backend/src/application/custom-recipe/custom-recipe-config.service.ts backend/src/application/custom-recipe/custom-recipe-pricing.service.ts backend/tests/controllers/custom-recipe.multi-quote.spec.ts
git commit -m "feat: expose multi recipe quote API"
```

---

### Task 5: Add discount and design-capacity configuration to admin-web

**Files:**
- Modify: `admin-web/src/api/customRecipe.ts`
- Modify: `admin-web/src/views/CustomRecipes/Config.vue`
- Create: `admin-web/src/views/CustomRecipes/multiRecipeConfig.regression.spec.ts`

**Interfaces:**
- Config type adds:
  - `multiRecipeEnabled: boolean`
  - `maxRecipeQuantity: number`
  - `multiRecipeDiscounts: Array<{ quantity: number; discountRate: number; label: string }>`
  - `dailyDesignMinutes: number`
  - `minutesPerRecipe: number`
- UI table rows for 2–5 份；editable rate and label.
- Save sends rates as decimals (0.05), not percent strings.
- UI shows read-only max 5 and derived daily capacity (`floor(dailyDesignMinutes / minutesPerRecipe)`).

- [ ] **Step 1: Write failing regression test**

Assert the page contains:

```ts
expect(page).toContain('多份购买')
expect(page).toContain('最多 5 份')
expect(page).toContain('每日设计工时')
expect(page).toContain('每份设计工时')
expect(page).toContain('多份优惠')
expect(page).toContain('discountRate')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd admin-web && npx vitest run src/views/CustomRecipes/multiRecipeConfig.regression.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement form section and save mapping**

Add to `form` defaults:

```ts
multiRecipeEnabled: false,
maxRecipeQuantity: 5,
multiRecipeDiscounts: [
  { quantity: 2, discountRate: 0.05, label: '2 份享 95 折' },
  { quantity: 3, discountRate: 0.08, label: '3 份享 92 折' },
  { quantity: 4, discountRate: 0.10, label: '4 份享 9 折' },
  { quantity: 5, discountRate: 0.12, label: '5 份享 88 折' },
],
dailyDesignMinutes: 480,
minutesPerRecipe: 96,
```

Render a table with `el-input-number` for quantity, percentage and label. Convert percent input to decimal before save and back when loading.

- [ ] **Step 4: Run tests and build**

Run:

```bash
cd admin-web
npx vitest run src/views/CustomRecipes/multiRecipeConfig.regression.spec.ts
npm run build
```

Expected: PASS and build success.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/api/customRecipe.ts admin-web/src/views/CustomRecipes/Config.vue admin-web/src/views/CustomRecipes/multiRecipeConfig.regression.spec.ts
git commit -m "feat: configure multi recipe discounts and design capacity"
```

---

### Task 6: Add quantity selection and quote display to the mini program confirmation page

**Files:**
- Modify: `miniapp/src/api/custom-recipe.ts`
- Create: `miniapp/src/utils/custom-recipe-pricing.ts`
- Modify: `miniapp/src/pages/custom-recipe/confirm.vue`
- Modify: `miniapp/src/pages/custom-recipe-confirm.regression.spec.ts`

**Interfaces:**
- `fetchMultiRecipeQuote(quantity: number): Promise<CustomRecipeQuote>`
- Confirm page local state `recipeQuantity = ref(1)`, `quote = ref<CustomRecipeQuote | null>(null)`.
- Submit payload adds `recipeQuantity`.
- UI hidden unless `config.multiRecipeEnabled === true`; when false only quantity 1 and no selector.
- Price block shows original, discount, payable, per-recipe average, credit.
- The payment button amount uses `quote.payableAmount` when quote exists.

- [ ] **Step 1: Write failing regression test**

Add to `custom-recipe-confirm.regression.spec.ts`:

```ts
it('多份开关关闭时不显示份数选择器', () => {
  expect(confirm).toContain('multiRecipeEnabled');
  expect(confirm).toContain('recipeQuantity');
  expect(confirm).toContain('fetchMultiRecipeQuote');
  expect(confirm).toContain('payableAmount');
});

it('提交订单带 recipeQuantity，且金额以后端报价为准', () => {
  const submit = confirm.match(/async function submitConfirmedOrder\\([\\s\\S]*?\\n}\\n\\nonLoad/)?.[0] || '';
  expect(submit).toContain('recipeQuantity');
  expect(submit).toContain('payableAmount');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd miniapp && npx vitest run src/pages/custom-recipe-confirm.regression.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement API and utility**

Add `fetchMultiRecipeQuote` using `GET /custom-recipe/quote?quantity=...`. Return shape:

```ts
export interface CustomRecipeQuote {
  quantity: number;
  unitAmount: number;
  originalAmount: number;
  discountRate: number;
  discountAmount: number;
  payableAmount: number;
  creditPerRecipe: number;
  creditAmount: number;
}
```

Create `miniapp/src/utils/custom-recipe-pricing.ts` with:

```ts
export function formatDiscountRate(rate: number): string
export function perRecipeAverage(quote: CustomRecipeQuote): number
```

- [ ] **Step 4: Add UI and submit payload**

In confirm page:

- When `multiRecipeEnabled` true, render stepper 1–5.
- On change, call quote and update all displayed amounts.
- When false, force quantity 1 and hide selector.
- Add `recipeQuantity` to payload.
- Use quote amount for button; if quote fails, disable pay and show retry.

- [ ] **Step 5: Run tests/build**

Run:

```bash
cd miniapp
npx vitest run src/pages/custom-recipe-confirm.regression.spec.ts
npm run build:mp-weixin
```

Expected: PASS and build success.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/api/custom-recipe.ts miniapp/src/utils/custom-recipe-pricing.ts miniapp/src/pages/custom-recipe/confirm.vue miniapp/src/pages/custom-recipe-confirm.regression.spec.ts
git commit -m "feat: add multi recipe quantity to confirm page"
```

---

### Task 7: Verification and safe rollout gate

**Files:**
- Modify: `docs/superpowers/specs/2026-10-20-multi-recipe-order-design.md` (status note)
- Test: existing suites

- [ ] **Step 1: Run full backend tests**

Run: `cd backend && npx jest --runInBand`
Expected: all suites pass, including existing single-recipe tests.

- [ ] **Step 2: Run full mini program tests and build**

Run:

```bash
cd miniapp
npm test
npm run build:mp-weixin
```

Expected: all tests pass and build succeeds.

- [ ] **Step 3: Run admin tests and build**

Run:

```bash
cd admin-web
npm test
npm run build
```

Expected: all tests pass and build succeeds.

- [ ] **Step 4: Verify the gate manually**

With `multiRecipeEnabled=false`:

- 小程序不显示份数选择；
- 调用 quote quantity=2 可以返回报价，但创建订单必须被拒绝；
- 老订单详情、支付、取消、售后不变。

With `multiRecipeEnabled=true` in a local/dev database:

- 1、2、3、4、5 份报价金额正确；
- 6 份被拒绝；
- 前端展示金额与创建订单 amount 一致；
- 配置修改后新订单使用新价格，老订单不变。

- [ ] **Step 5: Mark phase status**

Update the design doc with:

> 第一阶段（价格与下单）已完成；多份开关保持关闭，等待第二阶段多份设计与交付完成后再开启。

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-10-20-multi-recipe-order-design.md
git commit -m "docs: mark multi recipe pricing phase complete"
```

---

## Follow-up plans

This plan intentionally stops before multi-recipe fulfillment. It does not make multi-recipe orders customer-usable.

Next plans:

1. `2026-10-20-multi-recipe-fulfillment.md` — order items, designer N recipes, one-batch delivery, order detail N cards, capacity by design minutes, feature flag enablement.
2. `2026-10-20-multi-recipe-aftersale.md` — per-recipe adjustment selection, admin display, re-deliver selected recipes, one free adjustment per submission.

Do not enable `multiRecipeEnabled` after this plan.
