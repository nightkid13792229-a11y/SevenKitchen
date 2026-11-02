# 员工新增采购商品（含 AI 读商品截图）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让员工在小程序「添加采购记录」弹窗里直接新增采购商品（可上传商品详情页截图由 AI 填表），当场生效；管理员在电脑后台能看到、编辑、删除员工新增的商品。

**Architecture:** 后端新增三个员工侧接口（上传截图 / AI 草稿 / 创建）与一个后台列表接口，复用既有的 COS 上传与 `callDeepSeekJson` 视觉能力；`procurement_sku` 表加三列记录"谁加的、来源、截图"。前端：小程序新增一页（A 版：先传图），后台新增一个清单页。

**Tech Stack:** NestJS + Prisma(PostgreSQL) + Jest；Vue3 + Element Plus + Vitest；uni-app (Vue3) 小程序 + Vitest。

**Spec:** `docs/superpowers/specs/2026-11-01-staff-procurement-sku-creation-design.md`

## Global Constraints

- 净含量口径：`purchaseToBaseRatio = packCount × netContentPerPack`，**服务端计算**，不信客户端传的乘积（spec §5.1）。
- 净含量单位固定为原料基准单位（`G`/`ML`/`PCS`），不做单位切换；跨维度（克↔毫升）不换算，判 `missing`。
- 采购单位只能取 `ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT`，前端不给自由输入框。
- 只有 `Ingredient.type = FOOD` 能挂采购商品；补剂、包材不显示入口、接口拒绝。
- AI 结果只是草稿，**永不直接入库**；读不到的字段一律 `null` 并进 `missing`。
- AI 任何失败（超时/报错/解析失败）都降级为手填，不阻断员工。
- 员工只能新增，不能改删；`PUT`/`DELETE` 采购 SKU 接口收紧为 `AdminGuard`。
- 后端类型检查基线：`npx tsc --noEmit` 当前有 **309** 条历史报错，判据是"改动路径没有新增报错"，不是"零报错"。
- 联调期间**不跑** `cd backend && npm run build`（会删 `dist`，弄死 `start:dev`）。
- 小程序改动结束前必须跑 `npm run build:mp-weixin` 或 `npm run preview`，并告知用户打开 `miniapp/dist/build/mp-weixin`（或 `miniapp/dist/dev/mp-weixin`）。

## Review Focus

- **整箱商品只填了单件规格**（如箱规 24×330ml 的 330 被当成一箱的量）→ 账目静默差 24 倍。期望：`ratio` 恒等于 `packCount × netContentPerPack`。（Task 3）
- **在补剂/包材上仍能看到"新增采购商品"入口** → 一点就 400，员工在店里卡死。期望：非 FOOD 不渲染入口。（Task 9）
- **采购单位被自由输入**（"罐""提""件"）→ 服务端白名单拒绝。期望：选项来自接口，不出现输入框。（Task 5、8）
- **AI 返回残缺或编造的数字**（只认出单件规格、跨维度单位、多商品订单列表）→ 脏数据入库。期望：这些情况一律落进 `missing` 或直接判失败。（Task 4）
- **同一原料下重复添加同名商品** → 两个 id 指向同一件货，采购记录分裂。期望：重名不创建，返回既有那条让员工选。（Task 3）

## 文件结构

**后端（新增）**

- `backend/src/application/purchasing/procurement-sku-net-content.ts` —— 净含量归一化与规格拼装（纯函数，无依赖）
- `backend/src/application/purchasing/procurement-sku-draft.service.ts` —— 截图 → 草稿
- `backend/src/application/purchasing/procurement-sku-draft-quota.service.ts` —— 按人每天 + 全系统每月配额
- `backend/src/interfaces/dto/staff/procurement-sku-create.dto.ts` —— 员工侧入参
- `backend/src/interfaces/dto/admin/procurement-sku-list-query.dto.ts` —— 后台列表查询

**后端（修改）**

- `backend/prisma/schema.prisma` —— `ProcurementSku` 加三列；新增 `ProcurementSkuDraftUsage`
- `backend/src/application/ingredient/procurement-sku.service.ts` —— `createFromStaff()`、`listStaffCreated()`
- `backend/src/interfaces/controllers/staff-purchasing.controller.ts` —— 四个员工侧接口
- `backend/src/interfaces/controllers/procurement-sku.controller.ts` —— 列表接口 + 守卫收紧

**小程序（新增）**

- `miniapp/src/pages/staff-purchasing/procurement-sku-create.vue` —— 新增页
- `miniapp/src/pages/staff-purchasing/procurement-sku-create.spec.ts` —— 表单校验单测
- `miniapp/src/static/procurement-sku-sample.jpg` —— 示例图（老板提供）

**小程序（修改）**

- `miniapp/src/pages/staff-purchasing/api/purchasing.ts`
- `miniapp/src/pages/staff-purchasing/detail.vue`、`record-form.vue`
- `miniapp/src/pages.json`

**后台（新增）**

- `admin-web/src/views/Ingredients/StaffProcurementSkus.vue`

**后台（修改）**

- `admin-web/src/api/ingredients.ts`、路由文件、`admin-web/src/views/Ingredients/IngredientForm.vue`
- `admin-web/src/constants/agentPurposes.ts`

---

### Task 1: 数据模型

**Files:**
- Modify: `backend/prisma/schema.prisma`（`model ProcurementSku` 约 1157 行附近；新增一个 model）

**Interfaces:**
- Produces: `ProcurementSku.createdById`/`createdSource`/`sourceScreenshotUrl`；`prisma.procurementSkuDraftUsage`

- [ ] **Step 1: 给 `ProcurementSku` 加三列与索引**

在 `model ProcurementSku` 内加：

```prisma
  createdById         String?  @map("created_by_id") @db.VarChar(36)
  createdSource       String?  @map("created_source") @db.VarChar(20)
  sourceScreenshotUrl String?  @map("source_screenshot_url") @db.VarChar(500)
  createdBy           User?    @relation("ProcurementSkuCreator", fields: [createdById], references: [id], onDelete: SetNull)
  @@index([createdSource, createdAt])
```

- [ ] **Step 2: 新增配额用量表**

```prisma
model ProcurementSkuDraftUsage {
  id        String   @id @default(uuid()) @db.VarChar(36)
  userId    String   @map("user_id") @db.VarChar(36)
  usedOn    DateTime @map("used_on") @db.Date
  count     Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  @@unique([userId, usedOn])
  @@index([usedOn])
  @@map("procurement_sku_draft_usage")
}
```

- [ ] **Step 3: 在 `model User` 上补反向关系**

加一行 `procurementSkusCreated ProcurementSku[] @relation("ProcurementSkuCreator")`。

- [ ] **Step 4: 生成并应用迁移**

Run: `cd backend && npx prisma migrate dev --name add_procurement_sku_creator_fields`
Expected: 迁移文件生成、`prisma generate` 成功、无 drift 警告。

- [ ] **Step 5: 确认表结构**

Run: `cd backend && npx prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 6: Commit**

```bash
git add backend/prisma
git commit -m "feat(db): track creator and source screenshot on procurement sku"
```

---

### Task 2: 净含量归一化（纯函数）

**Files:**
- Create: `backend/src/application/purchasing/procurement-sku-net-content.ts`
- Test: `backend/tests/application/purchasing/procurement-sku-net-content.spec.ts`

**Interfaces:**
- Produces:
  - `normalizeNetContentToBaseUnit(input: { value: number | null; unit: string | null }, baseUnit: 'G' | 'ML' | 'PCS'): { ok: true; inBaseUnit: number } | { ok: false; reason: 'MISSING' | 'CROSS_DIMENSION' | 'UNSUPPORTED_UNIT' | 'INVALID_VALUE' }`
  - `composePackSpec(input: { packCount: number; value: number; unit: string }): string`

- [ ] **Step 1: 写失败测试**

```ts
// backend/tests/application/purchasing/procurement-sku-net-content.spec.ts
import {
  normalizeNetContentToBaseUnit,
  composePackSpec,
} from '../../../src/application/purchasing/procurement-sku-net-content';

describe('normalizeNetContentToBaseUnit', () => {
  it('把 kg 换算成克', () => {
    expect(normalizeNetContentToBaseUnit({ value: 1, unit: 'kg' }, 'G')).toEqual({ ok: true, inBaseUnit: 1000 });
  });
  it('把 L 换算成毫升', () => {
    expect(normalizeNetContentToBaseUnit({ value: 1.5, unit: 'L' }, 'ML')).toEqual({ ok: true, inBaseUnit: 1500 });
  });
  it('按个记账时原样返回', () => {
    expect(normalizeNetContentToBaseUnit({ value: 30, unit: '个' }, 'PCS')).toEqual({ ok: true, inBaseUnit: 30 });
  });
  it('跨维度不换算，判 CROSS_DIMENSION', () => {
    expect(normalizeNetContentToBaseUnit({ value: 330, unit: 'ml' }, 'G')).toEqual({ ok: false, reason: 'CROSS_DIMENSION' });
  });
  it('斤、两、枚这类不自动转，判 UNSUPPORTED_UNIT', () => {
    expect(normalizeNetContentToBaseUnit({ value: 1, unit: '斤' }, 'G')).toEqual({ ok: false, reason: 'UNSUPPORTED_UNIT' });
  });
  it('缺值判 MISSING', () => {
    expect(normalizeNetContentToBaseUnit({ value: null, unit: 'g' }, 'G')).toEqual({ ok: false, reason: 'MISSING' });
  });
  it('非正数判 INVALID_VALUE', () => {
    expect(normalizeNetContentToBaseUnit({ value: 0, unit: 'g' }, 'G')).toEqual({ ok: false, reason: 'INVALID_VALUE' });
  });
});

describe('composePackSpec', () => {
  it('多件装写成 24×330ml', () => {
    expect(composePackSpec({ packCount: 24, value: 330, unit: 'ml' })).toBe('24×330ml');
  });
  it('单件不写乘号', () => {
    expect(composePackSpec({ packCount: 1, value: 1, unit: 'kg' })).toBe('1kg');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/purchasing/procurement-sku-net-content.spec.ts`
Expected: FAIL，`Cannot find module ... procurement-sku-net-content`

- [ ] **Step 3: 实现两个函数**

单位识别表：`g`/`克`/`kg`/`公斤`/`千克`/`ml`/`毫升`/`l`/`升`/`个`/`枚`/`片`/`粒`/`包`/`袋`/`瓶`/`罐`。
`G` 只吸收 `g`/`kg` 及其同义写法；`ML` 只吸收 `ml`/`l`；`PCS` 只吸收计件单位。其余一律 `UNSUPPORTED_UNIT`。
换算系数：kg→×1000、L→×1000，其它 ×1。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/purchasing/procurement-sku-net-content.spec.ts`
Expected: PASS（9 个用例全绿）

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/purchasing/procurement-sku-net-content.ts backend/tests/application/purchasing/procurement-sku-net-content.spec.ts
git commit -m "feat(purchasing): normalize net content to ingredient base unit"
```

---

### Task 3: 员工创建采购商品（服务层）

**Files:**
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
- Test: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeNetContentToBaseUnit`（Task 2）、`composePackSpec`（Task 2）
- Produces:
  ```ts
  createFromStaff(input: {
    ingredientId: string;
    createdById: string;
    name: string;
    purchaseChannel: string;
    purchaseUnit: string;
    packCount: number;
    netContentPerPack: number;
    currentPurchasePrice?: number | null;
    brand?: string | null;
    productModel?: string | null;
    sourceScreenshotUrl?: string | null;
  }): Promise<{ status: 'created' | 'duplicate'; sku: ProcurementSkuSummary }>
  ```

- [ ] **Step 1: 写失败测试**（追加到已有 spec 的 `describe` 内）

```ts
it('createFromStaff 用件数乘每件净含量算出换算，而不是照抄单件规格', async () => {
  mockPrismaService.ingredient.findUnique.mockResolvedValue({ id: 'ing-1', type: 'FOOD', baseUnit: 'ML' });
  mockPrismaService.procurementSku.findFirst.mockResolvedValue(null);
  mockPrismaService.procurementSku.create.mockImplementation(async ({ data }: any) => ({ ...data, id: 'sku-1', createdAt: new Date(), updatedAt: new Date() }));

  const result = await service.createFromStaff({
    ingredientId: 'ing-1', createdById: 'user-1', name: '椰汁',
    purchaseChannel: '山姆', purchaseUnit: '箱',
    packCount: 24, netContentPerPack: 330,
  });

  expect(result.status).toBe('created');
  const data = mockPrismaService.procurementSku.create.mock.calls[0][0].data;
  expect(data.purchaseToBaseRatio).toBe(7920);
  expect(data.createdSource).toBe('STAFF_APP');
  expect(data.createdById).toBe('user-1');
  expect(data.productModel).toBe('24×330ml');
});

it('createFromStaff 遇到同名同原料的商品时不创建，返回既有那条', async () => {
  mockPrismaService.ingredient.findUnique.mockResolvedValue({ id: 'ing-1', type: 'FOOD', baseUnit: 'G' });
  mockPrismaService.procurementSku.findFirst.mockResolvedValue({ id: 'sku-exist', ingredientId: 'ing-1', name: '沃集鲜 糙米 1kg', isActive: true, createdAt: new Date(), updatedAt: new Date() });

  const result = await service.createFromStaff({
    ingredientId: 'ing-1', createdById: 'user-1', name: ' 沃集鲜 糙米 1kg ',
    purchaseChannel: '沃尔玛', purchaseUnit: '袋', packCount: 1, netContentPerPack: 1000,
  });

  expect(result.status).toBe('duplicate');
  expect(result.sku.id).toBe('sku-exist');
  expect(mockPrismaService.procurementSku.create).not.toHaveBeenCalled();
});

it('createFromStaff 拒绝非食材原料', async () => {
  mockPrismaService.ingredient.findUnique.mockResolvedValue({ id: 'ing-2', type: 'SUPPLEMENT', baseUnit: 'G' });
  await expect(service.createFromStaff({
    ingredientId: 'ing-2', createdById: 'user-1', name: 'x',
    purchaseChannel: '山姆', purchaseUnit: '瓶', packCount: 1, netContentPerPack: 60,
  })).rejects.toBeInstanceOf(BadRequestException);
});

it('createFromStaff 拒绝白名单外的采购单位', async () => {
  mockPrismaService.ingredient.findUnique.mockResolvedValue({ id: 'ing-1', type: 'FOOD', baseUnit: 'G' });
  await expect(service.createFromStaff({
    ingredientId: 'ing-1', createdById: 'user-1', name: 'x',
    purchaseChannel: '山姆', purchaseUnit: '提', packCount: 1, netContentPerPack: 100,
  })).rejects.toBeInstanceOf(BadRequestException);
});

it('createFromStaff 拒绝件数或净含量非正数', async () => {
  mockPrismaService.ingredient.findUnique.mockResolvedValue({ id: 'ing-1', type: 'FOOD', baseUnit: 'G' });
  await expect(service.createFromStaff({
    ingredientId: 'ing-1', createdById: 'user-1', name: 'x',
    purchaseChannel: '山姆', purchaseUnit: '袋', packCount: 0, netContentPerPack: 1000,
  })).rejects.toBeInstanceOf(BadRequestException);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient/procurement-sku.service.spec.ts -t createFromStaff`
Expected: FAIL，`service.createFromStaff is not a function`

- [ ] **Step 3: 实现 `createFromStaff`**

顺序：查原料 → `assertFoodIngredientCanOwnProcurementSkus` → 校验 `packCount`/`netContentPerPack` 为正整数/正数 →
`normalizeOptionalPurchaseUnit(purchaseUnit, baseUnit)` → 重名查（`ingredientId` + `isActive: true` + `name` 忽略大小写且去空格）→
命中则返回 `duplicate`；未命中则 `purchaseToBaseRatio = packCount * netContentPerPack`，
`productModel` 传了就用、没传就 `composePackSpec`，`createdSource` 写死 `'STAFF_APP'`，价格走既有 `buildPriceHistoryData` 逻辑。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient/procurement-sku.service.spec.ts`
Expected: PASS（新 5 个 + 原有全部）

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/ingredient/procurement-sku.service.ts backend/tests/application/ingredient/procurement-sku.service.spec.ts
git commit -m "feat(purchasing): staff can create procurement sku with pack-count math"
```

---

### Task 4: AI 草稿 + 配额

**Files:**
- Create: `backend/src/application/purchasing/procurement-sku-draft.service.ts`
- Create: `backend/src/application/purchasing/procurement-sku-draft-quota.service.ts`
- Test: `backend/tests/application/purchasing/procurement-sku-draft.service.spec.ts`
- Test: `backend/tests/application/purchasing/procurement-sku-draft-quota.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeNetContentToBaseUnit`（Task 2）、`callDeepSeekJson`、`AgentProviderConfigService`
- Produces:
  ```ts
  // quota
  consume(userId: string, now?: Date): Promise<void>            // 超限抛 BadRequestException
  // draft
  draftFromScreenshot(input: { imageUrl: string; ingredientId: string; userId: string }): Promise<ProcurementSkuDraft>
  export interface ProcurementSkuDraft {
    name: string | null; brand: string | null; productModel: string | null;
    purchaseChannel: string | null; purchaseUnit: string | null;
    packCount: number | null; netContentPerPack: number | null; netContentUnitText: string | null;
    unitPrice: number | null;
    missing: string[]; confidence: Record<string, 'high' | 'low'>;
  }
  export const PROCUREMENT_SKU_DRAFT_PURPOSE = 'PROCUREMENT_SKU_DRAFT';
  ```

- [ ] **Step 1: 写配额失败测试**

```ts
// backend/tests/application/purchasing/procurement-sku-draft-quota.service.spec.ts
it('同一个人同一天第 31 次被拒绝', async () => {
  prisma.procurementSkuDraftUsage.upsert.mockResolvedValue({ count: 31 });
  await expect(service.consume('user-1', new Date('2026-11-01T10:00:00'))).rejects.toBeInstanceOf(BadRequestException);
});

it('全系统当月已满 3000 次时第 1 次也拒绝', async () => {
  prisma.procurementSkuDraftUsage.aggregate.mockResolvedValue({ _sum: { count: 3000 } });
  await expect(service.consume('user-1', new Date('2026-11-01T10:00:00'))).rejects.toBeInstanceOf(BadRequestException);
});

it('同一个人当天第 30 次通过', async () => {
  prisma.procurementSkuDraftUsage.aggregate.mockResolvedValue({ _sum: { count: 10 } });
  prisma.procurementSkuDraftUsage.upsert.mockResolvedValue({ count: 30 });
  await expect(service.consume('user-1', new Date('2026-11-01T10:00:00'))).resolves.toBeUndefined();
});

it('usedOn 取当天零点，跨天重新计次', async () => {
  prisma.procurementSkuDraftUsage.aggregate.mockResolvedValue({ _sum: { count: 0 } });
  prisma.procurementSkuDraftUsage.upsert.mockResolvedValue({ count: 1 });
  await service.consume('user-1', new Date('2026-11-02T01:00:00'));
  const arg = prisma.procurementSkuDraftUsage.upsert.mock.calls[0][0];
  expect(arg.where.userId_usedOn.usedOn.toISOString()).toBe('2026-11-02T00:00:00.000Z');
});
```

- [ ] **Step 2: 跑配额测试确认失败**

Run: `cd backend && npx jest tests/application/purchasing/procurement-sku-draft-quota.service.spec.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现配额服务**

`usedOn` 取当天零点（服务器本地时区）。用 `upsert` 原子自增；写入前先查月合计。
常量：`DAILY_LIMIT_PER_USER = 30`、`MONTHLY_SYSTEM_LIMIT = 3000`。

- [ ] **Step 4: 写草稿服务失败测试**

```ts
// backend/tests/application/purchasing/procurement-sku-draft.service.spec.ts
it('1kg 归一成 1000 克，packCount=1', async () => {
  model.callDeepSeekJson.mockResolvedValue({ name: '沃集鲜 糙米 1kg', netContent: { value: 1, unit: 'kg' }, packCount: 1, purchaseChannel: '沃尔玛', purchaseUnit: '袋', unitPrice: 14.99 });
  const draft = await service.draftFromScreenshot({ imageUrl: 'https://x/a.jpg', ingredientId: 'ing-g', userId: 'u1' });
  expect(draft.netContentPerPack).toBe(1000);
  expect(draft.packCount).toBe(1);
  expect(draft.missing).toEqual([]);
});

it('只读到单件规格 330ml 时 packCount 留 null 并进 missing', async () => {
  model.callDeepSeekJson.mockResolvedValue({ name: '椰汁', netContent: { value: 330, unit: 'ml' }, purchaseUnit: '箱' });
  const draft = await service.draftFromScreenshot({ imageUrl: 'https://x/a.jpg', ingredientId: 'ing-ml', userId: 'u1' });
  expect(draft.netContentPerPack).toBe(330);
  expect(draft.packCount).toBeNull();
  expect(draft.missing).toContain('packCount');
});

it('跨维度不换算，净含量判 missing', async () => {
  model.callDeepSeekJson.mockResolvedValue({ name: '糙米', netContent: { value: 330, unit: 'ml' } });
  const draft = await service.draftFromScreenshot({ imageUrl: 'https://x/a.jpg', ingredientId: 'ing-g', userId: 'u1' });
  expect(draft.netContentPerPack).toBeNull();
  expect(draft.missing).toContain('netContentPerPack');
});

it('识别成订单列表时抛 BadRequest 提示重新截图', async () => {
  model.callDeepSeekJson.mockResolvedValue({ productList: [{ name: 'a' }, { name: 'b' }] });
  await expect(service.draftFromScreenshot({ imageUrl: 'https://x/a.jpg', ingredientId: 'ing-g', userId: 'u1' }))
    .rejects.toBeInstanceOf(BadRequestException);
});

it('模型抛错时向上抛出，由控制器降级', async () => {
  model.callDeepSeekJson.mockRejectedValue(new Error('timeout'));
  await expect(service.draftFromScreenshot({ imageUrl: 'https://x/a.jpg', ingredientId: 'ing-g', userId: 'u1' }))
    .rejects.toThrow('timeout');
});
```

- [ ] **Step 5: 跑草稿测试确认失败**

Run: `cd backend && npx jest tests/application/purchasing/procurement-sku-draft.service.spec.ts`
Expected: FAIL，模块不存在

- [ ] **Step 6: 实现草稿服务**

用 `AgentProviderConfigService` 取 `PROCUREMENT_SKU_DRAFT` 用途配置（未配置回退 DEFAULT），模型默认 `deepseek-flash`；
`callDeepSeekJson({ userContent: [{type:'text',...},{type:'image_url',image_url:{url:imageUrl}}], temperature: 0 })`；
prompt 要求：只认商品详情页、返回 JSON、**没有的字段必须给 null 并列入 missing**、多商品时返回 `{ productList: [...] }`；
返回后按 Task 2 归一化，凡是 `ok:false` 的字段一律置 `null` 并塞进 `missing`。

- [ ] **Step 7: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/purchasing/procurement-sku-draft`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/purchasing/procurement-sku-draft*.ts backend/tests/application/purchasing/procurement-sku-draft*.spec.ts
git commit -m "feat(purchasing): draft procurement sku from product screenshot via vision model"
```

---

### Task 5: 员工侧接口

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-purchasing.controller.ts`
- Create: `backend/src/interfaces/dto/staff/procurement-sku-create.dto.ts`
- Test: `backend/tests/controllers/staff-purchasing-procurement-sku.controller.spec.ts`

**Interfaces:**
- Consumes: `ProcurementSkuService.createFromStaff`（Task 3）、`ProcurementSkuDraftService.draftFromScreenshot`（Task 4）、`TencentCosService`
- Produces（HTTP）:
  - `POST /api/v1/staff/purchasing/upload-sku-screenshot` → `{ url, key }`
  - `GET /api/v1/staff/purchasing/procurement-sku-form-options?ingredientId=` → `{ baseUnit, purchaseUnits: string[] }`
  - `POST /api/v1/staff/purchasing/procurement-sku-draft` → `{ draft: ProcurementSkuDraft | null, degraded: boolean }`
  - `POST /api/v1/staff/purchasing/ingredients/:ingredientId/procurement-skus` → `{ status, sku }`

- [ ] **Step 1: 写失败测试**

```ts
it('upload-sku-screenshot 落到 procurement-sku-screenshots 目录', ...);
it('form-options 返回该原料基准单位下允许的采购单位', ...);  // FOOD/G → 含 '斤'、'箱'，不含 '罐'
it('非食材原料调 form-options 抛 BadRequest', ...);
it('draft 在服务抛错时返回 { draft: null, degraded: true } 而不是 500', ...);
it('create 把当前登录用户写进 createdById', ...);            // req.user.userId
it('create 的 DTO 拒绝多余字段', ...);                        // forbidNonWhitelisted 生效
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/controllers/staff-purchasing-procurement-sku.controller.spec.ts`
Expected: FAIL，路由未注册

- [ ] **Step 3: 实现 DTO 与四个路由**

DTO `CreateStaffProcurementSkuDto`：`name`（`@IsString @Length(1,100)`）、`purchaseChannel`（`@IsString @IsNotEmpty`）、
`purchaseUnit`（`@IsString @IsNotEmpty`）、`packCount`（`@IsInt @Min(1)`）、`netContentPerPack`（`@IsNumber @IsPositive`）、
`currentPurchasePrice?`、`brand?`、`productModel?`、`sourceScreenshotUrl?`。
控制器方法一律从 `@Req() req` 取 `req.user.userId`，不接受前端传的操作人。
`ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT` 目前是 `procurement-sku.service.ts` 的模块私有常量，
**需要 `export`**，供 `form-options` 路由使用（唯一事实来源，不在控制器里另抄一份）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/controllers/staff-purchasing-procurement-sku.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: 类型检查（只看改动路径）**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep "error TS" | grep -E "purchasing|procurement-sku" || echo "NO NEW ERRORS"`
Expected: `NO NEW ERRORS`

- [ ] **Step 6: Commit**

```bash
git add backend/src/interfaces/controllers/staff-purchasing.controller.ts backend/src/interfaces/dto/staff backend/tests/controllers/staff-purchasing-procurement-sku.controller.spec.ts
git commit -m "feat(api): staff endpoints for creating procurement sku from screenshot"
```

---

### Task 6: 后台列表接口 + 守卫收紧

**Files:**
- Modify: `backend/src/interfaces/controllers/procurement-sku.controller.ts`
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
- Create: `backend/src/interfaces/dto/admin/procurement-sku-list-query.dto.ts`
- Test: `backend/tests/application/ingredient/procurement-sku.service.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  listStaffCreated(query: {
    ingredientId?: string; createdById?: string;
    createdFrom?: string; createdTo?: string;
    keyword?: string; page: number; pageSize: number;
  }): Promise<{ items: StaffCreatedProcurementSkuView[]; total: number }>
  ```
  每项含 `id, ingredientId, ingredientName, name, brand, productModel, purchaseChannel, purchaseUnit,
  purchaseToBaseRatio, baseUnit, currentPurchasePrice, isActive, createdById, createdByName, createdAt, sourceScreenshotUrl`

- [ ] **Step 1: 写失败测试**

```ts
it('listStaffCreated 只返回 createdSource=STAFF_APP 的行', ...);
it('listStaffCreated 把 baseUnit 与 ingredientName 一起带出来', ...);
it('listStaffCreated 按时间范围过滤并分页', ...);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient/procurement-sku.service.spec.ts -t listStaffCreated`
Expected: FAIL，方法不存在

- [ ] **Step 3: 实现服务方法与查询 DTO**

默认 `createdSource: 'STAFF_APP'` 写死在 where 里（不允许前端改）。排序 `createdAt desc`。

- [ ] **Step 4: 加 `GET /api/v1/admin/procurement-skus`，并把 PUT/DELETE 换成 `AdminGuard`**

控制器类上保留 `AuthGuard`；`create` 保持 `StaffGuard`（员工要能建），`update`/`delete` 加 `@UseGuards(AdminGuard)`。

- [ ] **Step 5: 跑测试与类型检查**

Run: `cd backend && npx jest tests/application/ingredient/procurement-sku.service.spec.ts`
Run: `cd backend && npx tsc --noEmit 2>&1 | grep "error TS" | grep -E "procurement-sku" || echo "NO NEW ERRORS"`
Expected: PASS / `NO NEW ERRORS`

- [ ] **Step 6: Commit**

```bash
git add backend/src/interfaces/controllers/procurement-sku.controller.ts backend/src/application/ingredient/procurement-sku.service.ts backend/src/interfaces/dto/admin
git commit -m "feat(api): admin list of staff-created procurement skus"
```

---

### Task 7: 后台前端 —— 员工新增的采购商品

**Files:**
- Modify: `admin-web/src/api/ingredients.ts`
- Create: `admin-web/src/views/Ingredients/StaffProcurementSkus.vue`
- Modify: 路由文件（新增路由 `/ingredients/staff-procurement-skus`，挂在原料管理下，标题「员工新增的采购商品」）
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`（SKU 卡片加"谁加的"小字）

**Interfaces:**
- Consumes: `GET /api/v1/admin/procurement-skus`（Task 6）、既有 `updateProcurementSku` / `deleteProcurementSku`
- Produces: 前端类型 `StaffCreatedProcurementSku`（Task 6 后台视图 `StaffCreatedProcurementSkuView` 的镜像，字段一一对应）

- [ ] **Step 1: 加 API 客户端方法**

```ts
listStaffCreatedProcurementSkus: (params: {
  ingredientId?: string; createdById?: string; createdFrom?: string; createdTo?: string;
  keyword?: string; page?: number; pageSize?: number;
}): Promise<{ items: StaffCreatedProcurementSku[]; total: number }>
```

- [ ] **Step 2: 建清单页**

表格列：原料 / 新增的采购商品 / 规格净含量 / 采购单位 / 渠道 / 参考单价 / 添加人 / 添加时间 / 操作（编辑、删除、查看截图）。
筛选条：原料、添加人、时间范围、关键字。顶部一条说明条。删除二次确认，文案：`会从该原料下移除，历史采购记录不受影响`。

- [ ] **Step 3: 编辑弹窗**

字段：名称、品牌、规格、采购单位（`el-select`，选项来自 `PROCUREMENT_PURCHASE_UNITS_BY_BASE_UNIT`）、
换算（= 这一采购单位合计多少基准单位）、渠道、参考价、是否启用。保存调既有 `updateProcurementSku`。

- [ ] **Step 4: 原料编辑页加小字**

`IngredientForm.vue` 的 SKU 卡片：当 `createdSource === 'STAFF_APP'` 时，卡片底部显示
`{createdByName} · {createdAt 的 YYYY-MM-DD} 添加` 与「员工新增」小标签。

- [ ] **Step 5: 构建校验**

Run: `cd admin-web && npm run build`
Expected: 构建成功，无新增 TS 报错

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/api/ingredients.ts admin-web/src/views/Ingredients admin-web/src/router
git commit -m "feat(admin): staff-created procurement sku list and creator badge"
```

---

### Task 8: 小程序 —— API 客户端与新增页

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/api/purchasing.ts`
- Create: `miniapp/src/pages/staff-purchasing/procurement-sku-create.vue`
- Create: `miniapp/src/pages/staff-purchasing/procurement-sku-create.spec.ts`
- Modify: `miniapp/src/pages.json`
- Create: `miniapp/src/static/procurement-sku-sample.jpg`（老板提供的「沃集鲜 糙米 1kg」截图）

**Interfaces:**
- Consumes: Task 5 的四个接口
- Produces（页面参数）：`ingredientId`、`ingredientName`、`baseUnit`；
  返回时 `uni.$emit('procurement-sku:created', { ingredientId, skuId })`

- [ ] **Step 1: 写失败测试（表单校验纯逻辑）**

```ts
// procurement-sku-create.spec.ts
it('件数或净含量为空时不允许保存', ...);
it('件数乘净含量得出合计，24×330 得 7920', ...);
it('采购单位不在允许清单里时不提交', ...);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing/procurement-sku-create.spec.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 加 API 客户端方法**

```ts
uploadProcurementSkuScreenshot(filePath: string): Promise<{ url: string; key: string }>
getProcurementSkuFormOptions(ingredientId: string): Promise<{ baseUnit: string; purchaseUnits: string[] }>
draftProcurementSku(input: { imageUrl: string; ingredientId: string }): Promise<{ draft: ProcurementSkuDraft | null; degraded: boolean }>
createStaffProcurementSku(ingredientId: string, input: CreateStaffProcurementSkuInput): Promise<{ status: 'created' | 'duplicate'; sku: ProcurementSkuOption }>
```

- [ ] **Step 4: 建页面（A 版：先传图）**

布局顺序：顶部 `挂到原料：{name} · 基准单位 {unit}` → 大上传区（`uni.chooseImage` → 上传 → 调草稿）→
示例引导卡（`/static/procurement-sku-sample.jpg` + 三条要点）→ 分隔线「或手动填写」→ 表单 → 底部取消/保存。
表单字段与校验按 spec §8.2。AI 填过的字段带「AI 识别」小标，低置信字段带「AI 推测·可改」，
`missing` 里的字段标红并在下方显示提示文案。保存成功后 `uni.$emit` 再 `uni.navigateBack()`。

- [ ] **Step 5: 注册路由**

`pages.json` 的 `pages/staff-purchasing` 分组下加 `procurement-sku-create`，标题「新增采购商品」。

- [ ] **Step 6: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing/procurement-sku-create.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/pages/staff-purchasing miniapp/src/static/procurement-sku-sample.jpg miniapp/src/pages.json
git commit -m "feat(miniapp): create procurement sku from product screenshot"
```

---

### Task 9: 小程序 —— 弹窗入口与回填

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/detail.vue`
- Modify: `miniapp/src/pages/staff-purchasing/record-form.vue`

**Interfaces:**
- Consumes: 页面 `procurement-sku-create`（Task 8）、`uni.$emit('procurement-sku:created', ...)`

- [ ] **Step 1: 写失败测试（入口可见性）**

```ts
// detail.spec.ts 或既有回归 spec 内追加
it('食材原料显示新增采购商品入口', ...);            // item.ingredientType === 'FOOD'
it('补剂/包材原料不显示新增采购商品入口', ...);       // 'SUPPLEMENT' | 'PACKAGING'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing`
Expected: FAIL，入口不存在

- [ ] **Step 3: 加入口**

`detail.vue`：`recordProcurementSkuOptions.length > 0` 时在列表末尾渲染
`<view class="sku-add">＋ 没有我要买的商品？新增一个</view>`；
为空时把原提示换成按钮。两者都包在"是否食材"的判断里。
`record-form.vue` 做同样处理。

点击 → `uni.navigateTo({ url: '/pages/staff-purchasing/procurement-sku-create?ingredientId=...&ingredientName=...&baseUnit=...' })`。

- [ ] **Step 4: 回来时刷新并选中**

在 `onShow` / `uni.$on('procurement-sku:created')` 里：重新拉清单详情 → 找到新 SKU →
`recordForm.procurementSkuId = skuId` → 若弹窗已关闭则重新打开并选中。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/pages/staff-purchasing/detail.vue miniapp/src/pages/staff-purchasing/record-form.vue
git commit -m "feat(miniapp): entry point for creating procurement sku in record modal"
```

---

### Task 10: 收尾 —— AI 用途配置、示例图、构建验证

**Files:**
- Modify: `admin-web/src/constants/agentPurposes.ts`
- Create: `miniapp/src/static/procurement-sku-sample.jpg`（若 Task 8 未落）

**Interfaces:**
- Consumes: 无

- [ ] **Step 1: 注册 AI 用途**

在 `AGENT_PURPOSES` 追加：

```ts
{
  purpose: 'PROCUREMENT_SKU_DRAFT',
  label: '采购商品识别',
  description: '从商品详情页截图读出名称、净含量、单价，供员工新增采购商品时核对',
  defaultModel: 'deepseek-flash',
}
```

- [ ] **Step 2: 构建后台**

Run: `cd admin-web && npm run build`
Expected: 成功

- [ ] **Step 3: 构建小程序**

Run: `cd miniapp && npm run build:mp-weixin`
Expected: 成功；产物在 `miniapp/dist/build/mp-weixin`

- [ ] **Step 4: 后端全量测试**

Run: `cd backend && npx jest --silent`
Expected: 全绿（或与改动前相同的既有失败集合）

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/constants/agentPurposes.ts miniapp/src/static
git commit -m "chore: register procurement sku draft AI purpose and sample screenshot"
```

---

## 部署（按 CLAUDE.md 的授权，无需再逐次请示）

1. 先合并到 `main` 并推到 `origin/main`。
2. 后端有改动 → `bash backend/scripts/remote_deploy_v2.sh`；报结果时说明部署的是哪个提交。
3. 后台有改动 → `bash /Users/zhaochen/Documents/SevenKitchen/deploy-admin-web.sh`（用主工作区这份）。
4. 小程序 → `bash scripts/upload-trial.sh "员工新增采购商品 + AI 读商品截图"`，**不上正式版**；报告体验版版本号。

## 交付前检查

- [ ] 拿「沃集鲜 糙米 1kg」截图走完整流程：上传 → 识别 → 核对 → 保存 → 记一笔采购记录 → 库存变了
- [ ] 手工造一个 24×330ml 的箱子，确认库存增加的是 7920 × 袋数，不是 330 × 袋数
- [ ] 补剂/包材的采购项上没有"新增采购商品"入口
- [ ] 后台能看到刚加的商品，添加人是当前员工、时间是今天
- [ ] 员工端的接口调不通 `update`/`delete`（403）
- [ ] 小程序构建产物路径已告知用户
