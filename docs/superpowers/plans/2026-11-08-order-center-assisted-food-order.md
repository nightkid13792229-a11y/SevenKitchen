# 订单中心代客下单（成品鲜食）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在微信小程序订单中心提供一条管理员专用的「代客下单」流程：搜顾客（含无账号顾客）→ 选狗 → 选食谱（橱窗 + 全部定制）→ 确认克数/地址/报价 → 生成线下已收款的成品鲜食订单。

**Architecture:** 后端先在现有 `StaffCustomerServiceController` 上补 5 个能力（新食谱选项接口、饭量预览、报价预览不落快照、建地址、搜索含无账号顾客），并把代客下单接口收口到 `AdminGuard`；小程序新增一个 `pages/staff-assisted-order/` 分包承载三步流程与三个建档小页，旧 `staff-customer-service/assisted-order.vue` 下线。

**Tech Stack:** NestJS 11 + Prisma 6 + Jest（后端）、uni-app + Vue 3 `<script setup>` + Vitest（小程序）。

**Spec:** `docs/superpowers/specs/2026-11-08-order-center-assisted-food-order-design.md`

## Global Constraints

- 只做成品鲜食（`OrderType.FRESH_FOOD`），不碰定制食谱订单、补剂、试吃装。
- 代客下单只给管理员：前端按 `role === 'ADMIN'` 渲染入口，后端 `orders/assisted`、建顾客/建狗/建地址、饭量预览、报价预览一律 `AdminGuard`；`customers/search` 保持 `StaffGuard`。
- 一单 = 一只狗 + 一条食谱（`createOrderFromItems` 只读 `items[0]`）。
- 收货地址必填；实收与系统报价不一致必须填 `amountAdjustReason`。
- 报价预览不得新增 `pricing_snapshot` 记录。
- 1000g 起订量不豁免；默认 7 天，不足 1000g 时自动抬天数。
- 小程序默认 API 地址 `http://127.0.0.1:3011/api/v1`（本机联调用）。
- 后端不得在联调期间跑 `npm run build`（会删 `dist` 把 `start:dev` 弄死），自检用 `npx tsc --noEmit`。
- 每个任务结束必须单独提交，提交走 `bash scripts/session.sh commit -m "..." <files>`，不在主工作区提交。

## Review Focus

1. **员工令牌调用任何代客下单接口** —— 必须是 403，不能因为只藏了前端按钮就放行。
2. **顾客只存在于 `guestContactPhone`（`phone` 为 null）** —— 搜索必须命中，且结果标 `isGuest`。
3. **无账号顾客建地址** —— 落库的 `Address.userId` 必须是顾客本人，不是操作人，否则下单时归属校验会 400。
4. **报价预览被反复刷新** —— 不能每次都在 `pricing_snapshot` 留一条垃圾记录。
5. **小体重狗（3kg）默认 7 天不足 1000g** —— 确认页必须自动抬天数到 1000g，否则后端定价硬校验直接 400。

---

## 文件结构

**后端**

| 文件 | 职责 |
|---|---|
| `backend/src/application/order/order.service.ts` | 改：`pricingPurpose` 加 `STAFF_PREVIEW` 早退；新增 `previewPortionForDog` |
| `backend/src/interfaces/dto/orders/pricing-preview.dto.ts` | 改：`pricingPurpose` 联合类型 |
| `backend/src/interfaces/controllers/staff-customer-service.controller.ts` | 改/加：新食谱选项、饭量预览、报价预览、建地址、搜索含无账号、assisted 加 AdminGuard 与差额原因 |
| `backend/tests/application/order/order-assisted-portion.spec.ts` | 新增 |
| `backend/tests/interfaces/controllers/staff-assisted-order.controller.spec.ts` | 新增 |

**小程序**

| 文件 | 职责 |
|---|---|
| `miniapp/src/api/staffAssistedOrder.ts` | 新增：本流程全部接口封装与类型 |
| `miniapp/src/pages/staff-assisted-order/index.vue` | 选顾客/选狗 + 新建无账号顾客弹层 |
| `miniapp/src/pages/staff-assisted-order/recipe.vue` | 选食谱（四档筛选 + 搜索 + 归属 + 适配提示） |
| `miniapp/src/pages/staff-assisted-order/confirm.vue` | 确认下单（饭量/分装/日期/地址/报价/实收） |
| `miniapp/src/pages/staff-assisted-order/guest-dog.vue` | 新建狗狗档案（8 项） |
| `miniapp/src/pages/staff-assisted-order/address.vue` | 新增收货地址 |
| `miniapp/src/pages.json` | 改：注册分包 |
| `miniapp/src/pages/staff-order-center/index.vue` | 改：管理员入口 |
| `miniapp/src/pages/staff-customer-service/customers.vue` | 改：按钮跳新流程且仅管理员 |
| `miniapp/src/pages/staff-customer-service/assisted-order.vue` | 删 |
| `miniapp/src/pages/staff-customer-service.regression.spec.ts` | 改：旧页面断言改跳转断言 |
| `miniapp/src/pages/staff-assisted-order.regression.spec.ts` | 新增 |

---

### Task 1: 报价预览支持「只算不存」

**Files:**
- Modify: `backend/src/application/order/order.service.ts:117`（`pricingPurpose` 联合类型）、`:2333` 附近（早退判断）、`:2476` 附近（日志字段）
- Modify: `backend/src/interfaces/dto/orders/pricing-preview.dto.ts:144`
- Test: `backend/tests/application/order/order-assisted-pricing-preview.spec.ts`

**Interfaces:**
- Consumes: 现有 `OrderService.previewPricing(dto)`。
- Produces: `dto.pricingPurpose` 允许 `'STAFF_PREVIEW'`；该用途下返回 `{ amountProduct, amountShipping, amountTotal, pricingBreakdown }` 且**不**调用 `pricingSnapshotRepository.create`。

- [ ] **Step 1: 写失败测试**

```ts
// order-assisted-pricing-preview.spec.ts
it('STAFF_PREVIEW 不写价格快照', async () => {
  const create = jest.fn();
  const service = buildService({ pricingSnapshotRepository: { create } });
  const result = await service.previewPricing({
    customerId: 'c1', dogId: 'd1', type: 'FRESH_FOOD',
    pricingPurpose: 'STAFF_PREVIEW',
    items: [{ recipeId: 'r1', quantityG: 3129, packageCount: 14, packageSpecG: 224 }],
  });
  expect(create).not.toHaveBeenCalled();
  expect(result.amountTotal).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/order/order-assisted-pricing-preview.spec.ts -t "STAFF_PREVIEW"`
Expected: FAIL（`create` 被调用）

- [ ] **Step 3: 实现**

把两处联合类型改成 `'ORDER' | 'DIY_SHEET' | 'STAFF_PREVIEW'`；在 `previewPricing` 里把
`const isDiySheetPreview = dto.pricingPurpose === 'DIY_SHEET'` 旁加 `const isNonPersistingPreview = isDiySheetPreview || dto.pricingPurpose === 'STAFF_PREVIEW'`，
并在落快照之前改成 `if (isNonPersistingPreview) { return pricingResult; }`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/order/order-assisted-pricing-preview.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(order): 报价预览支持 STAFF_PREVIEW 不落快照" backend/src/application/order/order.service.ts backend/src/interfaces/dto/orders/pricing-preview.dto.ts backend/tests/application/order/order-assisted-pricing-preview.spec.ts
```

---

### Task 2: 饭量预览（管理员给顾客的狗算）

**Files:**
- Modify: `backend/src/application/order/order.service.ts`（新增 public 方法）
- Test: `backend/tests/application/order/order-assisted-portion.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  previewPortionForDog(dogId: string, recipeId: string, days = 7): Promise<{
    dailyIntakeG: number; perMealIntakeG: number; mealsPerDay: number;
    days: number; totalG: number;
    suggestedPackagePlan: Array<{ packageSpecG: number; packageCount: number }>;
    minOrderG: number;
  }>
  ```
- 规则：`dailyIntakeG` 复用 `calculateDogEnergy` → `resolvePlanAwareFinalKcal` → `calculateDailyIntakeG`；`perMealIntakeG = Math.round(dailyIntakeG / mealsPerDay)`；分装建议"1 袋 = 1 顿"（`packageSpecG = perMealIntakeG`，`packageCount = days * mealsPerDay`）；`totalG = days * dailyIntakeG`；`minOrderG = 1000`。狗缺体重或配方缺能量密度时抛 `BadRequestException`。

- [ ] **Step 1: 写失败测试**

```ts
it('按体重和餐次算出每日克数与分装建议', async () => {
  const result = await service.previewPortionForDog('dog12kg', 'recipe-300kcal', 7);
  expect(result.dailyIntakeG).toBeGreaterThan(300);
  expect(result.mealsPerDay).toBe(2);
  expect(result.suggestedPackagePlan).toEqual([
    { packageSpecG: result.perMealIntakeG, packageCount: 14 },
  ]);
  expect(result.minOrderG).toBe(1000);
});

it('体重缺失直接报错，不返回 0', async () => {
  await expect(service.previewPortionForDog('dog-no-weight', 'r1')).rejects.toThrow(/体重/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/order/order-assisted-portion.spec.ts`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现 `previewPortionForDog`**

放在 `previewPricing` 之前。取 dog/recipe（走已有 `dogRepository.findById` / `recipeRepository.findById`），
体重 `<= 0` 或配方 `energyDensityKcalPerKg <= 0` 抛 `BadRequestException('狗狗档案缺少体重，无法计算饭量')`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/order/order-assisted-portion.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(order): 新增代客下单饭量预览" backend/src/application/order/order.service.ts backend/tests/application/order/order-assisted-portion.spec.ts
```

---

### Task 3: 后端暴露三个新接口 + 搜索含无账号顾客 + 建地址 + 收口权限

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-customer-service.controller.ts`
- Test: `backend/tests/interfaces/controllers/staff-assisted-order.controller.spec.ts`

**Interfaces:**
- Consumes: `OrderService.previewPortionForDog`（Task 2）、`OrderService.previewPricing`（Task 1）、`AddressService.createAddress`。
- Produces（全部 `@UseGuards(AuthGuard, StaffGuard)` 类级，方法级再 `@UseGuards(AdminGuard)`）：

| 方法 | 路由 | 返回 |
|---|---|---|
| GET | `dogs/:dogId/assisted-recipe-options?scope=all&keyword=&page=&pageSize=` | `{ items, total }` |
| GET | `dogs/:dogId/portion-preview?recipeId=&days=` | Task 2 的返回体 |
| POST | `orders/pricing-preview` | `{ amountProduct, amountShipping, amountTotal }` |
| POST | `customers/:customerId/addresses` | 新建地址 |

- `items[]` 结构：`{ id, name, status, sourceLabel, coverImageUrl, ownership: { kind: 'WINDOW'|'OWN_CUSTOM'|'OTHER_CUSTOM', customerId, customerName, dogId, dogName, breedName }, fit: { level: 'OK'|'WARN', reasons: string[] } }`。
- 搜索 `customers/search` 加 `isGuest`，并把 `guestContactPhone` / `guestContactName` 纳入 OR。
- `orders/assisted` 方法级加 `AdminGuard`，新增可选 `amountAdjustReason`：金额与系统报价不一致且为空 → 400。

- [ ] **Step 1: 写失败测试**

```ts
it('员工令牌调代客下单接口被拒（AdminGuard）', async () => {
  const guard = new AdminGuard(reflector);
  expect(() => guard.canActivate(ctxWithRole('STAFF'))).toThrow(ForbiddenException);
});

it('assisted-recipe-options 返回别人家的定制食谱并标 OTHER_CUSTOM', async () => {
  const res = await controller.listAssistedRecipeOptions('dog1', { scope: 'all' });
  expect(res.data.items.some((i) => i.ownership.kind === 'OTHER_CUSTOM')).toBe(true);
});

it('搜索能命中只存在于 guestContactPhone 的顾客', async () => {
  const res = await controller.searchCustomers({ keyword: '13800001111' });
  expect(res.data[0].isGuest).toBe(true);
});

it('建地址落在顾客名下而不是操作人', async () => {
  const res = await controller.createCustomerAddress('cust1', { recipientName: '张三', phone: '138', region: {...}, detail: 'x' });
  expect(addressService.createAddress).toHaveBeenCalledWith(expect.objectContaining({ userId: 'cust1' }));
});

it('实收≠报价且没填原因 → 400', async () => {
  const res = await controller.createAssistedOrder({ ..., actualAmount: 1 }, adminUser);
  expect(res.code).toBe(400);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/interfaces/controllers/staff-assisted-order.controller.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- 旧 `dogs/:dogId/finished-food-recipe-options` **保持原样**（旧页面还没下线，避免发版窗口里打断线上）。
- `assisted-recipe-options`：`status=PUBLIC`（系列已发布）∪ `PRIVATE_CUSTOM`（不限 owner），排除系列 `createdBy` 是 `CUSTOMER` 的、排除系列 `deletedAt != null` 或 `status != 'ACTIVE'`；`ownership.kind` 判定：`PUBLIC` → `WINDOW`；`PRIVATE_CUSTOM` 且 `customerOwnerId === 当前顾客` → `OWN_CUSTOM`；否则 `OTHER_CUSTOM`。
- `fit`：过敏原（`dog.allergyFoods` + `allergyRecord.allergen`）与配方原料名做"包含匹配"（去空白、小写），命中 → `WARN`；生命阶段不在 `applicableLifeStages` → `WARN`。原料名一次 `recipeItem.findMany({ where: { recipeId: { in: [...] } }, include: { ingredient: { select: { name: true } } } })` 取。
- `portion-preview` / `pricing-preview` 直接转调 service；`pricing-preview` 传 `customerId` 用入参、`pricingPurpose: 'STAFF_PREVIEW'`。
- `createCustomerAddress` 复用 `addressService.createAddress({ userId: customerId, ... })`，先校验顾客存在。
- `createAssistedOrder` 里：`const systemAmount = toNumber(createdOrder.amountTotal)`；若 `actualAmount` 有值且与 `systemAmount` 相差 > 0.005 且没 `amountAdjustReason` → 返回 400，**在 `updateOrderAmount` 之前拦**。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/interfaces/controllers/staff-assisted-order.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: 全量类型检查 + 相关回归**

Run: `cd backend && npx tsc --noEmit && npx jest tests/application/order tests/interfaces/controllers`
Expected: 全绿（除已知基线红外）

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(order): 代客下单后端接口（食谱/饭量/报价/建地址/权限收口）" backend/src/interfaces/controllers/staff-customer-service.controller.ts backend/tests/interfaces/controllers/staff-assisted-order.controller.spec.ts
```

---

### Task 4: 小程序 API 封装与分包注册

**Files:**
- Create: `miniapp/src/api/staffAssistedOrder.ts`
- Modify: `miniapp/src/pages.json`

**Interfaces:**
- Produces：`searchCustomersForAssist(keyword)`、`listAssistedRecipeOptions(dogId, params)`、`previewPortion(dogId, recipeId, days)`、`previewAssistedPricing(payload)`、`createCustomerAddress(customerId, payload)`、`createGuestCustomer(payload)`、`createGuestDog(customerId, payload)`、`createAssistedOrder(payload)`，以及类型 `AssistedRecipeOption`、`PortionPreview`、`AssistedPricing`、`GuestDogPayload`。

- [ ] **Step 1: 写实现**（纯封装，无逻辑；沿用 `miniapp/src/utils/api.ts` 的 `request`）

- [ ] **Step 2: 注册分包**——`pages.json` 加：

```json
{ "root": "pages/staff-assisted-order", "pages": [
  { "path": "index", "style": { "navigationBarTitleText": "代客下单" } },
  { "path": "recipe", "style": { "navigationBarTitleText": "选食谱" } },
  { "path": "confirm", "style": { "navigationBarTitleText": "确认订单" } },
  { "path": "guest-dog", "style": { "navigationBarTitleText": "新建狗狗档案" } },
  { "path": "address", "style": { "navigationBarTitleText": "新增收货地址" } }
] }
```

- [ ] **Step 3: 构建验证**

Run: `cd miniapp && npm run build:mp-weixin`
Expected: 成功，`dist/build/mp-weixin` 生成

- [ ] **Step 4: 提交**

---

### Task 5: 选顾客/选狗页

**Files:**
- Create: `miniapp/src/pages/staff-assisted-order/index.vue`
- Test: `miniapp/src/pages/staff-assisted-order.regression.spec.ts`（本任务先建文件写第一条）

**Interfaces:**
- Consumes: Task 4 的 `searchCustomersForAssist`、`createGuestCustomer`。
- Produces: 跳转 `recipe?customerId=&dogId=`；接受可选入参 `customerId`/`dogId`（从旧入口直进时跳过选狗）。

- [ ] **Step 1: 写回归断言**

```ts
it('选狗页：搜索、无账号标、新建顾客入口只对管理员', () => {
  expect(page).toContain('searchCustomersForAssist')
  expect(page).toContain('无账号')
  expect(page).toContain("role === 'ADMIN'")
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd miniapp && npx vitest run src/pages/staff-assisted-order.regression.spec.ts`

- [ ] **Step 3: 实现页面**——搜索框（回车/按钮触发，空词不请求）、顾客卡片（`isGuest` 打灰标"无账号"）、狗行可选中、选中后底部主按钮"下一步：选食谱"；管理员可见"＋ 新建无账号顾客"弹层（姓名 + 电话 + 微信可选），成功后就地刷新搜索结果并自动选中新顾客。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交**

---

### Task 6: 选食谱页

**Files:**
- Create: `miniapp/src/pages/staff-assisted-order/recipe.vue`
- Test: 追加到 `staff-assisted-order.regression.spec.ts`

**Interfaces:**
- Consumes: `listAssistedRecipeOptions`。
- Produces: 跳转 `confirm?customerId=&dogId=&recipeId=`。

- [ ] **Step 1: 写回归断言**

```ts
it('食谱页：四档筛选 + 其他定制提示 + 分页', () => {
  expect(page).toContain("value: 'WINDOW'")
  expect(page).toContain("value: 'OWN_CUSTOM'")
  expect(page).toContain("value: 'OTHER_CUSTOM'")
  expect(page).toContain('这条是给')
  expect(page).toContain('pageSize')
})
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现页面**——顶部横向筛选（全部/橱窗已上架/这位顾客的定制/其他定制）+ 搜索框 + 列表（封面、名称、归属、`fit.level === 'WARN'` 时展示 reasons）；选中 `OTHER_CUSTOM` 时卡片下出现确认提示；触底加载下一页。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交**

---

### Task 7: 新建狗狗页

**Files:**
- Create: `miniapp/src/pages/staff-assisted-order/guest-dog.vue`
- Test: 追加回归断言

**Interfaces:**
- Consumes: `createGuestDog`；品种列表用现成的 `dogApi.breeds()`（`GET /dogs/breeds`，见 `miniapp/src/api/dogs.ts:123`），不要新写。
- Produces: 成功后 `uni.navigateBack()` 并把 `dogId` 通过 eventChannel 回传给选狗页。

- [ ] **Step 1: 写回归断言**：断言页面含 8 个字段标签与 `createGuestDog`。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现页面**——名字、品种（picker）、生日（date picker）、性别、是否绝育、当前体重、体况评分（1-9 选择）、活动量；必填校验与后端 DTO 对齐；提交成功后回传 dogId。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交**

---

### Task 8: 确认页（核心）

**Files:**
- Create: `miniapp/src/pages/staff-assisted-order/confirm.vue`
- Test: 追加回归断言

**Files（本任务先加一个纯函数，再写页面）:**
- Create: `miniapp/src/utils/assistedOrder.ts` + `miniapp/src/utils/assistedOrder.spec.ts`
- Create: `miniapp/src/pages/staff-assisted-order/confirm.vue`

**Interfaces:**
- Consumes: `previewPortion`、`previewAssistedPricing`、`listStaffCustomerAddresses`（已有）、`createAssistedOrder`、`QuickCyclePackagePlan`。
- Produces:
  ```ts
  // miniapp/src/utils/assistedOrder.ts
  resolveDaysForMinOrder(dailyIntakeG: number, days: number, minOrderG?: number): { days: number; raised: boolean }
  needsAmountAdjustReason(systemAmount: number, actualAmount: number): boolean
  ```
  `resolveDaysForMinOrder`：`totalG = dailyIntakeG * days`；`totalG < minOrderG` 时返回 `{ days: Math.ceil(minOrderG / dailyIntakeG), raised: true }`，否则原样返回 `{ days, raised: false }`；`dailyIntakeG <= 0` 直接抛错。
  成功后跳 `/pages/staff-orders/detail?id=`。

- [ ] **Step 0: 写纯函数测试**

```ts
it('3kg 的小狗 7 天不足 1000g，自动抬到够 1000g 的天数', () => {
  expect(resolveDaysForMinOrder(100, 7)).toEqual({ days: 10, raised: true });
});
it('够 1000g 就不动', () => {
  expect(resolveDaysForMinOrder(447, 7)).toEqual({ days: 7, raised: false });
});
it('实收与报价差 1 分钱就算不一致', () => {
  expect(needsAmountAdjustReason(428, 428.01)).toBe(true);
  expect(needsAmountAdjustReason(428, 428)).toBe(false);
});
```

Run: `cd miniapp && npx vitest run src/utils/assistedOrder.spec.ts` → FAIL（文件不存在）

- [ ] **Step 1: 写回归断言**

```ts
it('确认页：自动饭量、报价、差额原因拦截、地址必填、无微信通知提示', () => {
  expect(page).toContain('previewPortion')
  expect(page).toContain('previewAssistedPricing')
  expect(page).toContain('amountAdjustReason')
  expect(page).toContain('不会给顾客发微信通知')
  expect(page).toContain('resolveDaysForMinOrder')
})
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现页面**
  - 进页先 `previewPortion(days=7)`；`totalG < 1000` 时按 `Math.ceil(1000 / dailyIntakeG)` 抬天数并提示原因。
  - 分装用 `QuickCyclePackagePlan`；任何影响价格的改动（天数/分装）都触发 `previewAssistedPricing`（防抖 300ms）。
  - 地址区：列出顾客地址，无地址时显示"＋ 新增收货地址"跳 `address?customerId=`；地址必填。
  - 金额区：`系统报价`（只读）+ `实收金额`（默认等于报价）+ 差额原因输入（不一致时必填）。
  - 提交前校验：地址、食谱、金额、差额原因；提交成功提示"这单不会给顾客发微信通知，请人工告知"。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 构建验证** — `cd miniapp && npm run build:mp-weixin`

- [ ] **Step 6: 提交**

---

### Task 9: 新增收货地址页

**Files:**
- Create: `miniapp/src/pages/staff-assisted-order/address.vue`
- Test: 追加回归断言

**Interfaces:**
- Consumes: `createCustomerAddress`。
- Produces: 成功后 `navigateBack()` 并回传新建地址。

- [ ] **Step 1: 写回归断言**：断言含省市区 picker 与 `createCustomerAddress`。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现页面**——照 `miniapp/src/pages/address-edit/index.vue` 的表单与校验（收件人、手机号、省市区、详细地址、设为默认），只把接口换成 `createCustomerAddress(customerId, ...)`。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: 提交**

---

### Task 10: 入口改造与旧页下线

**Files:**
- Modify: `miniapp/src/pages/staff-order-center/index.vue`
- Modify: `miniapp/src/pages/staff-customer-service/customers.vue`
- Delete: `miniapp/src/pages/staff-customer-service/assisted-order.vue`
- Modify: `miniapp/src/pages.json`（删旧页注册）
- Modify: `miniapp/src/pages/staff-customer-service.regression.spec.ts`

**Interfaces:**
- 入口只在 `role === 'ADMIN'` 时渲染。

- [ ] **Step 1: 改回归 spec**——把指向 `assisted-order.vue` 的 12 条断言删掉，改成断言 `customers.vue` 跳 `/pages/staff-assisted-order/index` 且带 `role === 'ADMIN'` 判断。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/staff-customer-service.regression.spec.ts`

- [ ] **Step 3: 实现**——订单中心顶部加「＋ 代客下单」卡片（仅管理员）；`customers.vue` 的「代客下单」按钮改跳新流程并加角色判断；删除旧页面文件与 `pages.json` 注册。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/staff-customer-service.regression.spec.ts src/pages/staff-assisted-order.regression.spec.ts`

- [ ] **Step 5: 提交**

---

### Task 11: 端到端自检与交付

- [ ] **Step 1: 后端全量自检** — `cd backend && npx tsc --noEmit && npx jest tests/application/order tests/interfaces/controllers`
- [ ] **Step 2: 小程序全量测试** — `cd miniapp && npx vitest run`
- [ ] **Step 3: 小程序生产构建** — `cd miniapp && npm run build:mp-weixin`，产物 `miniapp/dist/build/mp-weixin`
- [ ] **Step 4: 合并到 main** — `bash scripts/session.sh merge`
- [ ] **Step 5: 部署后端** — `bash backend/scripts/remote_deploy_v2.sh`
- [ ] **Step 6: 上传体验版** — `bash scripts/upload-trial.sh "订单中心代客下单"`
- [ ] **Step 7: 派独立 Agent 审查整个分支，并把审查发现逐条处理**
