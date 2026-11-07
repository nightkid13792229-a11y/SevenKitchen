# 成品参考价口径修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首页/详情页的「约 ¥X/100g」与真实下单走同一张运费模板、按 1kg=10 袋×100g 的标准分装计算，并去掉「起」这个不成立的字。

**Architecture:** 三处最小改动，不新增第二套算价逻辑：① 运费模板解析收口到 `ShippingService` 一处，按「显式指定 → 后台默认模板 → 唯一生效模板」的顺序解析，解析不出就报错而不是随便猜；② 参考价的包材输入从 1 袋改为「起订量 ÷ 100g」袋；③ 小程序只改展示文案与取价来源，后端接口结构不变。

**Tech Stack:** NestJS + Prisma（后端）、uni-app / Vue 3（小程序）、Jest（后端测试）、Vitest（小程序回归测试）。

**Spec:** 本文件「设计决策」一节（2026-11-07 老板顾问拍板的三条口径）。

---

## 设计决策（来自 2026-11-07 对话）

| # | 决策 | 落地方式 |
|---|------|----------|
| D1 | 每 100g 参考价、真实下单都用「首重 23 元」那张运费模板 | **不写死 23 这个数字**。代码读后台「全局配置 → 默认运费模板」，运营把默认设成首重 23 元那张，并停用另一张。这样调价只改一处，且参考价与订单永远同步 |
| D2 | 参考价按 1kg = 10 袋 × 100g 计算 | 包材输入改为 `totalPacks = round(minOrderWeightG / 100)`、`singlePackSpecG = 100` |
| D3 | 删掉「起」 | 首页/详情页统一为「约 ¥X/100g」；首页改为显示**这张卡片自己那个生命阶段**的价格（不再用跨阶段最低价） |

**实测依据（本地同一套定价引擎，改前/改后/真实订单）：**

| 口径 | 每 100g | 说明 |
|------|---------|------|
| 改前：1 袋 × 1000g | ¥20.89 | 包材只算 1 个袋 + 1 张标签 |
| 改后：10 袋 × 100g | ¥21.34 | 包材 ¥5.58，运费 ¥37.71 |
| 真实 5kg 犬 7 天单（1050g，14 袋 × 75g） | ¥21.37 | 与改后只差 0.1% |
| 真实 10kg 犬 7 天单（2100g） | ¥19.65 | 仍比参考价低 8%；文案保留「约」 |

---

## Global Constraints

- 只在工位 `.worktrees/20261107-reference-price-caliber`（分支 `task/20261107-reference-price-caliber`）提交，不在主工作区改动。
- 不新增数据库字段、不写 migration、不直接改库；运费模板的去留由后台配置完成。
- 后端只跑增量测试与 `npx tsc --noEmit`；联调期间**不要**跑 `npm run build`（会删 `dist/`，弄死本机 `start:dev`）。
- 小程序改完必须执行 `cd miniapp && npm run build:mp-weixin`，并向用户报告 `miniapp/dist/build/mp-weixin`。
- 金额一律走现有定价引擎（`PricingService.calculateOrderPrice`），不许在展示层再乘除出第二个价格。
- 文案铁律：所有「每 100g」数字前必须带「约」，且不得再出现「起」。

---

## Review Focus

1. **默认运费模板被停用或删除** → 参考价与下单都必须报错并隐藏价格，绝不能静默换一张模板。
2. **库里存在多张生效模板、而默认模板为空** → 结账必须报错，不能靠"取第一张"猜。
3. **起订量不是 100 的整数倍**（如 1250g）→ 袋数取整后包材估算偏差不得超过 1 袋，不得除零。
4. **接口没有返回某张卡片的版本价 / 返回 0 或 null** → 首页必须回退到系列最低价且不显示 ¥0.00。
5. **顾客实付与参考价仍有 ±3% 偏差** → 文案必须保留「约」，详情页必须写清"最终价格以下单页为准"。

---

## File Structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `backend/src/domain/shipping/shipping-template.repository.ts` | 仓储接口补 `findAll` | 修改 |
| `backend/src/infrastructure/repositories/in-memory-shipping-template.repository.ts` | 内存实现补 `findAll` | 修改 |
| `backend/src/application/shipping/shipping.service.ts` | 运费模板解析的唯一入口 | 修改 |
| `backend/src/domain/pricing/reference-packaging.ts` | 参考价标准分装的纯函数 | 新建 |
| `backend/src/application/order/order.service.ts` | `computeRecipeReferencePrice` 改用标准分装 | 修改（约 2494–2587 行） |
| `backend/tests/application/shipping/shipping-template-resolution.spec.ts` | 模板解析的 7 个分支 | 新建 |
| `backend/tests/domain/pricing/reference-packaging.spec.ts` | 袋数换算 | 新建 |
| `backend/tests/application/order/recipe-reference-price.spec.ts` | 参考价传给定价引擎的参数 | 新建 |
| `miniapp/src/pages/home/index.vue` | 首页卡片取价与文案 | 修改（224、497–499、1534–1560 行） |
| `miniapp/src/pages/recipe-detail/index.vue` | 详情页价格条 | 修改（355–366 行） |
| `miniapp/src/pages/home.regression.spec.ts` | 首页文案/取价回归 | 修改 |
| `miniapp/src/pages/recipe-detail.regression.spec.ts` | 详情页文案回归 | 修改 |

---

### Task 1: 运费模板单一来源

**Files:**
- Modify: `backend/src/domain/shipping/shipping-template.repository.ts`（接口补 `findAll`）
- Modify: `backend/src/infrastructure/repositories/in-memory-shipping-template.repository.ts`（实现 `findAll`）
- Modify: `backend/src/application/shipping/shipping.service.ts`
- Test: `backend/tests/application/shipping/shipping-template-resolution.spec.ts`（新建）

**Interfaces:**
- Consumes: `GlobalConfigService.getGlobalConfig()`（返回的 `GlobalConfig` 里已有 `defaultShippingTemplateId: string | null`）
- Produces: `calculateShippingFeePreview(input: ShippingFeeInput): Promise<ShippingFeeResult>` 签名不变；内部新增 `private async resolveTemplate(explicitId?: string | null): Promise<ShippingTemplate>`；`ShippingTemplateRepository.findAll(): Promise<ShippingTemplate[]>`

> `PrismaShippingTemplateRepository` 已经有 `findAll()`（`prisma-shipping-template.repository.ts:39`），只是接口没声明；内存实现需要补一个同名方法。

- [ ] **Step 1: 写失败的测试**

新建 `backend/tests/application/shipping/shipping-template-resolution.spec.ts`：

```ts
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ShippingService } from 'src/application/shipping/shipping.service';

const template = (id: string, name: string, isActive = true) => ({
  id,
  name,
  baseWeightKg: 1,
  baseFee: 23,
  stepWeightKg: 1,
  stepFee: 13,
  vasFeePerOrder: 5,
  isActive,
});

describe('ShippingService · 运费模板解析', () => {
  const feeService = {
    calculateShippingFee: jest.fn((_input: unknown, tpl: { id: string }) => ({
      amountShipping: 1,
      templateId: tpl.id,
      ruleAppliedDescription: '',
    })),
  };
  const repo = {
    findById: jest.fn(),
    findActive: jest.fn(),
    findAll: jest.fn(),
  };
  const config = { getGlobalConfig: jest.fn() };
  let service: ShippingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ShippingService(feeService as any, repo as any, config as any);
  });

  it('无显式模板时，用后台配置的默认模板', async () => {
    config.getGlobalConfig.mockResolvedValue({ defaultShippingTemplateId: 'tpl-23' });
    repo.findById.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）'));

    const result = await service.calculateShippingFeePreview({ totalWeightG: 1700 });

    expect(repo.findById).toHaveBeenCalledWith('tpl-23');
    expect(repo.findActive).not.toHaveBeenCalled();
    expect(result.templateId).toBe('tpl-23');
  });

  it('调用方显式指定模板时优先使用它', async () => {
    repo.findById.mockResolvedValue(template('tpl-9', '指定模板'));

    const result = await service.calculateShippingFeePreview({
      totalWeightG: 1700,
      shippingTemplateId: 'tpl-9',
    });

    expect(repo.findById).toHaveBeenCalledWith('tpl-9');
    expect(config.getGlobalConfig).not.toHaveBeenCalled();
    expect(result.templateId).toBe('tpl-9');
  });

  it('默认模板不存在时报错，不偷换别的模板', async () => {
    config.getGlobalConfig.mockResolvedValue({ defaultShippingTemplateId: 'tpl-gone' });
    repo.findById.mockResolvedValue(null);

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(repo.findAll).not.toHaveBeenCalled();
  });

  it('默认模板已停用时拒绝使用', async () => {
    config.getGlobalConfig.mockResolvedValue({ defaultShippingTemplateId: 'tpl-23' });
    repo.findById.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）', false));

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('没有默认模板但只有一张生效模板时用它', async () => {
    config.getGlobalConfig.mockResolvedValue({ defaultShippingTemplateId: null });
    repo.findAll.mockResolvedValue([template('tpl-only', '唯一模板')]);

    const result = await service.calculateShippingFeePreview({ totalWeightG: 1700 });

    expect(result.templateId).toBe('tpl-only');
  });

  it('没有默认模板且多张生效时报错，不猜', async () => {
    config.getGlobalConfig.mockResolvedValue({ defaultShippingTemplateId: null });
    repo.findAll.mockResolvedValue([
      template('tpl-23', '顺丰特快（生鲜）'),
      template('tpl-12', 'Default CN Template'),
    ]);

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('一张生效模板都没有时报 404', async () => {
    config.getGlobalConfig.mockResolvedValue({ defaultShippingTemplateId: null });
    repo.findAll.mockResolvedValue([]);

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/shipping/shipping-template-resolution.spec.ts`
Expected: FAIL —— `new ShippingService` 只收两个参数，默认模板分支不生效。

- [ ] **Step 3: 实现模板解析**

先补仓储接口（两处）：

- `backend/src/domain/shipping/shipping-template.repository.ts`：加一行 `findAll(): Promise<ShippingTemplate[]>;`，注释写「按创建顺序返回全部模板，供"未配置默认模板时判断是否唯一"使用」。
- `backend/src/infrastructure/repositories/in-memory-shipping-template.repository.ts`：加 `async findAll(): Promise<ShippingTemplate[]> { return Array.from(this.templates.values()); }`。

再改 `backend/src/application/shipping/shipping.service.ts`：注入 `GlobalConfigService`，新增私有方法 `resolveTemplate`。解析顺序固定为：

1. `input.shippingTemplateId` 有值 → `findById`；查不到报 `NotFoundException(运费模板不存在：<id>)`，已停用报 `InternalServerErrorException`。
2. 否则读 `globalConfig.defaultShippingTemplateId`：有值 → `findById`；查不到或已停用 → `Logger.error` 记录具体原因，抛 `InternalServerErrorException('运费模板配置异常，请稍后重试或联系客服')`。
3. 没有默认模板 → `findAll()` 取 `isActive`：
   - 恰好 1 张 → 用它（并 `Logger.warn` 提示"未配置默认运费模板"）；
   - 0 张 → `NotFoundException('No active shipping template found')`；
   - ≥2 张 → `Logger.error`，抛 `InternalServerErrorException('存在多张生效的运费模板，请到后台指定默认模板')`。

`calculateShippingFeePreview` 改为 `const template = await this.resolveTemplate(input.shippingTemplateId)`，其余不变。注意：`findActive()` 在本方法中不再使用。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/shipping/shipping-template-resolution.spec.ts`
Expected: PASS，7 个用例全绿。

- [ ] **Step 5: 回归既有运费相关测试**

Run: `cd backend && npx jest tests/application/shipping tests/application/order/order-shipping-notification.spec.ts tests/domain/order/estimated-shipping.spec.ts`
Expected: PASS。若有既有用例断言"走 findActive"，改为断言"走默认模板"，不要放宽断言。

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "fix(shipping): 运费模板统一读后台默认配置，禁止静默挑模板" \
  backend/src/domain/shipping/shipping-template.repository.ts \
  backend/src/infrastructure/repositories/in-memory-shipping-template.repository.ts \
  backend/src/application/shipping/shipping.service.ts \
  backend/tests/application/shipping/shipping-template-resolution.spec.ts
```

---

### Task 2: 参考价按 1kg = 10 袋 × 100g 计算

**Files:**
- Create: `backend/src/domain/pricing/reference-packaging.ts`
- Modify: `backend/src/application/order/order.service.ts:2494-2587`
- Test: `backend/tests/domain/pricing/reference-packaging.spec.ts`（新建）
- Test: `backend/tests/application/order/recipe-reference-price.spec.ts`（新建）

**Interfaces:**
- Produces: `REFERENCE_PACK_SPEC_G = 100`；`resolveReferencePackCount(totalWeightG: number, packSpecG?: number): number`
- Consumes: Task 1 的 `ShippingService.calculateShippingFeePreview`（签名不变，参考价继续传 `shippingTemplateId: null`，由 Task 1 解析成默认模板）

- [ ] **Step 1: 写袋数换算的失败测试**

新建 `backend/tests/domain/pricing/reference-packaging.spec.ts`：

```ts
import {
  REFERENCE_PACK_SPEC_G,
  resolveReferencePackCount,
} from 'src/domain/pricing/reference-packaging';

describe('参考价标准分装 · resolveReferencePackCount', () => {
  it('标准袋是 100g', () => {
    expect(REFERENCE_PACK_SPEC_G).toBe(100);
  });

  it('起订量 1000g → 10 袋', () => {
    expect(resolveReferencePackCount(1000)).toBe(10);
  });

  it('起订量调成 1500g → 15 袋', () => {
    expect(resolveReferencePackCount(1500)).toBe(15);
  });

  it('起订量不是整百时向上取整（1250g → 13 袋）', () => {
    expect(resolveReferencePackCount(1250)).toBe(13);
  });

  it('小于一袋的极端值至少算 1 袋', () => {
    expect(resolveReferencePackCount(50)).toBe(1);
    expect(resolveReferencePackCount(0)).toBe(1);
    expect(resolveReferencePackCount(Number.NaN)).toBe(1);
  });

  it('袋规非法时退化成 1 袋，不返回 Infinity', () => {
    expect(resolveReferencePackCount(1000, 0)).toBe(1);
    expect(resolveReferencePackCount(1000, Number.NaN)).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/domain/pricing/reference-packaging.spec.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现纯函数**

新建 `backend/src/domain/pricing/reference-packaging.ts`：

```ts
/** 参考价的"标准袋"规格：每袋 100g（2026-11-07 拍板）。 */
export const REFERENCE_PACK_SPEC_G = 100;

/**
 * 参考价按标准袋分装时一共几袋。
 * 非有限值 / 非正数一律退化为 1 袋，避免除零或 Infinity。
 */
export function resolveReferencePackCount(
  totalWeightG: number,
  packSpecG: number = REFERENCE_PACK_SPEC_G,
): number {
  if (!Number.isFinite(totalWeightG) || totalWeightG <= 0) return 1;
  if (!Number.isFinite(packSpecG) || packSpecG <= 0) return 1;
  return Math.max(1, Math.round(totalWeightG / packSpecG));
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/domain/pricing/reference-packaging.spec.ts`
Expected: PASS。

- [ ] **Step 5: 写参考价传参的失败测试**

新建 `backend/tests/application/order/recipe-reference-price.spec.ts`。用 `Test.createTestingModule` 组装 `OrderService`，provider 列表如下（只测参考价，未被用到的依赖给空对象即可）。

```ts
import { Test } from '@nestjs/testing';
import {
  OrderService,
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
} from 'src/order.service';
import { RECIPE_REPOSITORY, DOG_REPOSITORY } from 'src/dog/dog.service';
import { INGREDIENT_REPOSITORY } from 'src/ingredient/ingredient.service';
import { ADDRESS_REPOSITORY } from 'src/address/address.service';
import { PrismaService } from 'src/infrastructure/prisma.service';
import { PricingService } from 'src/domain/pricing/pricing.service';
import { GlobalConfigService } from 'src/config/global-config.service';
import { ShippingService } from 'src/shipping/shipping.service';

describe('OrderService · computeRecipeReferencePrice', () => {
  const recipeRepo = { findById: jest.fn() };
  const pricing = { calculateOrderPrice: jest.fn() };
  const shipping = { calculateShippingFeePreview: jest.fn() };
  const config = { getGlobalConfig: jest.fn() };
  let service: OrderService;

  const recipe = {
    id: 'recipe-1',
    productionLossRate: 1.05,
    batchLaborHours: 2,
    items: [
      {
        id: 'item-1',
        ingredientId: 'ingredient-1',
        ratioPercent: 100,
        exampleWeight: null,
        preparationMethod: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
      },
    ],
  };

  const buildService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: RECIPE_REPOSITORY, useValue: recipeRepo },
        { provide: INGREDIENT_REPOSITORY, useValue: {} },
        { provide: PricingService, useValue: pricing },
        { provide: GlobalConfigService, useValue: config },
        { provide: ShippingService, useValue: shipping },
        { provide: ORDER_REPOSITORY, useValue: {} },
        { provide: ORDER_STATUS_HISTORY_REPOSITORY, useValue: {} },
        { provide: DOG_REPOSITORY, useValue: {} },
        { provide: ADDRESS_REPOSITORY, useValue: {} },
        { provide: 'IOrderPricingSnapshotRepository', useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(OrderService);
    jest
      .spyOn(service as any, 'resolveOrderRecipeIngredientMap')
      .mockResolvedValue(new Map([['ingredient-1', { id: 'ingredient-1', name: '牛肉' }]]));
    jest.spyOn(service as any, 'loadPreparationMethodNameMap').mockResolvedValue(new Map());
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    recipeRepo.findById.mockResolvedValue(recipe);
    config.getGlobalConfig.mockResolvedValue({ minOrderWeightG: 1000 });
    pricing.calculateOrderPrice.mockResolvedValue({
      productPrice: 200,
      weightPackagingG: 700,
    });
    shipping.calculateShippingFeePreview.mockResolvedValue({ amountShipping: 30 });
  });

  it('按 100g × 10 袋算包材，并按 1kg 摊运费', async () => {
    await buildService();
    const result = await service.computeRecipeReferencePrice('recipe-1');

    expect(pricing.calculateOrderPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        totalNetFoodWeightG: 1000,
        totalPacks: 10,
        singlePackSpecG: 100,
        dailyG: 1000,
        days: 1,
      }),
    );
    expect(shipping.calculateShippingFeePreview).toHaveBeenCalledWith({
      totalWeightG: 1700,
      shippingTemplateId: null,
    });
    expect(result).toEqual({
      recipeId: 'recipe-1',
      pricePer100g: 23,
      amountProduct: 200,
      amountShipping: 30,
    });
  });

  it('起订量改成 1500g 时袋数跟着变', async () => {
    config.getGlobalConfig.mockResolvedValue({ minOrderWeightG: 1500 });
    await buildService();
    await service.computeRecipeReferencePrice('recipe-1');

    expect(pricing.calculateOrderPrice).toHaveBeenCalledWith(
      expect.objectContaining({ totalPacks: 15, singlePackSpecG: 100 }),
    );
  });
});
```

- [ ] **Step 6: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/order/recipe-reference-price.spec.ts`
Expected: FAIL —— 实际收到 `totalPacks: 1, singlePackSpecG: 1000`。

- [ ] **Step 7: 修改 `computeRecipeReferencePrice`**

在 `backend/src/application/order/order.service.ts` 该方法内：

- 引入 `REFERENCE_PACK_SPEC_G`、`resolveReferencePackCount`；
- 把 `totalPacks: 1, singlePackSpecG: referenceWeightG` 改为：

```ts
const referencePackSpecG = REFERENCE_PACK_SPEC_G;
const referencePackCount = resolveReferencePackCount(
  referenceWeightG,
  referencePackSpecG,
);
// ...
totalPacks: referencePackCount,
singlePackSpecG: referencePackSpecG,
```

- 同步更新方法头注释：删掉已过期的"最近一次采购价 → 原料创建价（2026-11-02 起）"，写明"价格走原料档案价（2026-11-06 起）"、"参考量 = 起订量、按 100g/袋标准分装、运费按起订量分摊"。

- [ ] **Step 8: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/order/recipe-reference-price.spec.ts tests/domain/pricing/reference-packaging.spec.ts`
Expected: PASS。

- [ ] **Step 9: 类型检查**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 error。

- [ ] **Step 10: 提交**

```bash
bash scripts/session.sh commit -m "feat(pricing): 参考价按起订量×100g标准袋计算包材" \
  backend/src/domain/pricing/reference-packaging.ts \
  backend/src/application/order/order.service.ts \
  backend/tests/domain/pricing/reference-packaging.spec.ts \
  backend/tests/application/order/recipe-reference-price.spec.ts
```

---

### Task 3: 小程序去掉「起」，首页显示本卡片版本价

**Files:**
- Modify: `miniapp/src/pages/home/index.vue:224,497-499,1534-1560`
- Modify: `miniapp/src/pages/recipe-detail/index.vue:355-366`
- Test: `miniapp/src/pages/home.regression.spec.ts`
- Test: `miniapp/src/pages/recipe-detail.regression.spec.ts`

**Interfaces:**
- Consumes: `GET /recipes/reference-prices` 现有返回（`items[].minPricePer100g` + `items[].lifeStagePrices[].recipeId/pricePer100g`），**接口不改**
- Produces: `referencePriceMap` 的每一项变为 `{ minPricePer100g: number; priceByRecipeId: Record<string, number> }`

- [ ] **Step 1: 写失败的回归测试**

在 `miniapp/src/pages/home.regression.spec.ts` 末尾追加：

```ts
it('参考价不再带"起"，且按卡片自己的版本价显示', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/home/index.vue'),
    'utf-8',
  );
  const template = source.slice(0, source.indexOf('<script setup'));

  expect(template).toContain('约¥');
  expect(template).not.toContain('/100g起');
  expect(template).toContain('priceByRecipeId[recipe.id]');
});

it('价格为 0 / 空时不写入参考价（避免 ¥0.00）', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/home/index.vue'),
    'utf-8',
  );

  expect(source).toContain('minPricePer100g > 0');
});
```

在 `miniapp/src/pages/recipe-detail.regression.spec.ts` 末尾追加：

```ts
it('详情页参考价不再带"起"，并写清最终价以下单页为准', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/recipe-detail/index.vue'),
    'utf-8',
  );
  const template = source.slice(0, source.indexOf('<script setup'));

  expect(template).toContain('约¥');
  expect(template).not.toContain('/100g起');
  expect(template).not.toContain("? '起'");
  expect(template).toContain('最终价格以下单页为准');
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd miniapp && npx vitest run src/pages/home.regression.spec.ts src/pages/recipe-detail.regression.spec.ts`
Expected: FAIL —— 两处仍含 `/100g起`。

- [ ] **Step 3: 改首页取价与文案**

- `referencePriceMap` 类型改为 `Record<string, { minPricePer100g: number; priceByRecipeId: Record<string, number> }>`；
- `loadReferencePrices` 里除 `minPricePer100g` 外，遍历 `item.lifeStagePrices` 组装 `priceByRecipeId`（只收 `recipeId` 非空、价格是有限正数的项）；`minPricePer100g` 也要 `> 0` 才写入（挡住 `Number(null) === 0` 显示 ¥0.00 的隐患）；
- 模板第 224 行改为：

```vue
<text class="recipe-price-text">约¥{{ formatReferencePrice(referencePriceMap[recipe.id].priceByRecipeId[recipe.id] ?? referencePriceMap[recipe.id].minPricePer100g) }}/100g</text>
```

- 第 498 行注释里的「每100g起」同步改成「每100g」。

- [ ] **Step 4: 改详情页价格条**

`miniapp/src/pages/recipe-detail/index.vue:355-366` 改为：

```vue
<view v-if="displayReferencePrice" class="reference-price-strip">
  <view class="reference-price-copy">
    <text class="reference-price-value">
      约¥{{ formatReferencePrice(displayReferencePrice.amount) }}/100g
    </text>
    <text class="reference-price-note">
      {{ displayReferencePrice.isMin ? '已含冷链配送 · 最终价格以下单页为准' : '按狗狗体重精确计算最终价格 · 已含冷链配送' }}
    </text>
  </view>
</view>
```

`isMin` 仍保留：无狗狗档案时它是「系列最低价」，有档案时是「该阶段价」，说明文字据此区分。第 653 行注释里的「每100g、已含运费」保留，删掉注释中的「起」。

- [ ] **Step 5: 跑测试，确认通过**

Run: `cd miniapp && npx vitest run src/pages/home.regression.spec.ts src/pages/recipe-detail.regression.spec.ts`
Expected: PASS。

- [ ] **Step 6: 跑全量小程序回归**

Run: `cd miniapp && npm test`
Expected: 全绿；若基线本来就红，先在干净 `origin/main` 上复跑同一条命令做对照，只处理本次引入的红色。

- [ ] **Step 7: 构建**

Run: `cd miniapp && npm run build:mp-weixin`
Expected: 构建成功，产物在 `miniapp/dist/build/mp-weixin`。

- [ ] **Step 8: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 参考价去掉"起"，首页按本卡片版本价展示" \
  miniapp/src/pages/home/index.vue \
  miniapp/src/pages/recipe-detail/index.vue \
  miniapp/src/pages/home.regression.spec.ts \
  miniapp/src/pages/recipe-detail.regression.spec.ts
```

---

### Task 4: 上线配置与抽查（非代码）

**Files:** 无（后台配置 + 接口抽查）

- [ ] **Step 1: 后台确认默认运费模板**

打开后台「全局配置 → 默认运费模板」，确认选中的是**首重 23 元**那张（本地库是「顺丰特快（生鲜）」；生产当前配置的 id 是 `5ed09368-de0d-4998-961b-dba7a384737c`，需在列表里核对费率确为 23 元）。若不是，改成 23 元那张并保存。

- [ ] **Step 2: 停用另一张**

打开「运费模板」列表，把首重 12 元的 `Default CN Template` 停用。生产上只需保留一张生效模板。

- [ ] **Step 3: 本地接口抽查**

在工位起后端：`cd backend && PORT=3016 npm run start:dev:miniapp`，然后：

```bash
curl -s "http://127.0.0.1:3016/api/v1/recipes/reference-prices?ids=<任一公开食谱id>"
```

Expected: `minPricePer100g` 比改动前高约 2%（本地库「燕麦山药牛肉饭」应从 ¥20.89 变为 ≈ ¥21.34）。若数值不变，说明包材仍按 1 袋算。

- [ ] **Step 4: 真实首单对账**

用一只 5kg 犬、默认 7 天、2 餐的小程序账号走到结算页，记录实付总价 ÷ 重量 × 100，与首页显示值相差应 ≤ 3%（本地实测 ¥21.37 vs ¥21.34，差 0.1%）。

- [ ] **Step 5: 生产部署后复核**

合并到 `main` 并部署后端后：

```bash
curl -s "https://api.sevenkitchen.cloud/api/v1/recipes/reference-prices?ids=<生产首页某食谱id>"
```

Expected: 同一食谱的数值比部署前高约 2%（包材口径变化）；若此前生产实际用的是 12 元模板，则数值会变高更多（运费涨 ¥1.1/100g 左右）——这是本次决策的预期结果，需在部署报告中写明。

---

## Non-goals（本次不做，另行决定）

1. **0 价原料拦截**：本地库有 14 个原料价格为 0（含 6 道公开食谱用到的「鸡蛋壳粉」），现在被当免费计入。属独立问题，建议下一轮单独修（算价时拒绝出价 + 后台缺价清单）。
2. **不可购买食谱的价格条**：顾客自建食谱详情页仍会显示价格但无购买按钮，建议单独加一个 `canBuyFinishedFood` 判断。
3. **参考价缓存/去重**：生产实测 10 张卡片 24 次完整定价、1.3–1.45 秒。本次不改，建议后续加 5–10 分钟缓存与同系列去重。
4. **后台"只能有一张生效模板"的硬校验**：本次靠"默认模板优先 + 无默认时多张即报错"兜住，后台层面的唯一性校验另议。
5. 根目录 `P0_OPTIMIZATION_PLAN.md` 是历史文档，不改写。
