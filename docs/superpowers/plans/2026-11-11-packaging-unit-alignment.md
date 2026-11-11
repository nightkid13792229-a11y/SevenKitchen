# 采购单位与包装层级口径统一 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「采购单位、包装层级、换算倍数」收成一个结构化事实加一份单位字典，让小程序、后台、AI 识别、采购记录、补货、成本全部读同一份口径，消灭静默的整倍数错账。

**Architecture:** 采购商品新增 `packaging`（JSON：中间层 `links` + 末层 `amount`，末层恒为原料基准单位），换算倍数由服务端唯一派生并落库；采购单位改为「选项字典」里的一组数据（`purchase_unit`），三端只读这一份。老数据按“倍数 = 末层、无中间层”无损回填，接口在兼容期继续接受旧的 `packCount + netContentPerPack`。

**Tech Stack:** NestJS + Prisma（PostgreSQL）/ Vue 3 + Element Plus（admin-web）/ uni-app + Vue 3（miniapp）/ jest（后端，测试文件必须在 `tests/` 目录下）/ vitest（前端）。

**Spec:** `docs/design/procurement-packaging-units-2026-11-11.md`（问题清单、根因、取舍都在那份，本计划只写“怎么做”）

## Global Constraints

- 只改一个工位一个分支：`bash scripts/session.sh start "采购单位与包装层级统一"`，分支名 `task/20261111-packaging-units`；禁止在主工作区提交。
- 字段以 `backend/prisma/schema.prisma` 为准；禁止手工改库，只走 Prisma migration。
- 员工端小程序**不要**发布正式版：改完只做 `npm run preview` / `npm run build:mp-weixin`，并明确告知微信开发者工具打开 `miniapp/dist/dev/mp-weixin`（预览）或 `miniapp/dist/build/mp-weixin`（发布构建）。
- 联调期间后端**不要跑 `npm run build`**（会删 `dist/`，把正在跑的联调后端弄死），自检只跑 `npx tsc --noEmit`。
- 换算倍数只允许服务端派生：任何接口都不接受“前端算好的倍数”。兼容期接受 `packCount + netContentPerPack`，但也在服务端折叠。
- 历史单据、历史金额一律不改；回填只新增字段。
- 中文文案面向店员，不出现“ratio / payload / DTO”这类词。

## Review Focus

- 一个商品的「采购单位」与「层级第一层」被编辑成两个不同单位（例如单位=盒、层级=袋）时，必须被拒，而不是取其一。
- 采购记录里手选的单位与商品单位不一致（识别页最容易发生）时，必须拦住并说明，而不是按商品倍数乘。
- 字典里停用/改名的单位，历史商品与历史单据仍要能正常显示和打开。
- 原料基准单位是“个”（PCS）时，末层显示成「枚/张」但换算必须是 1:1，不能按字面数字再乘一次。
- 管理员把倍数改小/改大后，已经卖出去的配方成本是否被悄悄改写（不应改写历史，但当前成本要能重算）。

---

### Task 1: 单位字典（选项集 + 目录服务）

**Files:**
- Create: `backend/src/application/purchasing/purchase-unit-catalog.ts`
- Modify: `backend/src/application/platform-options/option-sets.registry.ts`（新增 `PURCHASE_UNIT_SET` 定义与种子）
- Create: `backend/prisma/migrations/20261111120000_purchase_unit_dictionary/migration.sql`
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts:777`（`getFormOptions` 改读目录）
- Test: `backend/src/application/purchasing/tests/purchase-unit-catalog.spec.ts`

**Interfaces:**
- Produces:
  - `export const PURCHASE_UNIT_SET = 'purchase_unit'`
  - `export type PurchaseUnitOption = { code: string; baseUnits: string[]; aliases: string[]; kind: 'PACKAGING' | 'MEASUREMENT'; multipack: boolean; sortOrder: number }`
  - `export const PURCHASE_UNIT_FALLBACK: Record<'G'|'ML'|'PCS', PurchaseUnitOption[]>`（现有白名单的等价数据，含 `multipack`）
  - `export function unitsForBaseUnit(options: PurchaseUnitOption[], baseUnit: string): PurchaseUnitOption[]`
  - `export function resolvePurchaseUnitCode(options: PurchaseUnitOption[], value: string | null | undefined, baseUnit: string): string | null`（别名归一；认不出返回 `null`）
  - `getFormOptions()` 额外返回 `purchaseUnitOptions: PurchaseUnitOption[]`

- [ ] **Step 1: 写失败测试**

```ts
// backend/src/application/purchasing/tests/purchase-unit-catalog.spec.ts
import {
  PURCHASE_UNIT_FALLBACK,
  resolvePurchaseUnitCode,
  unitsForBaseUnit,
} from '../purchase-unit-catalog';

const g = PURCHASE_UNIT_FALLBACK.G;

describe('unitsForBaseUnit', () => {
  it('只返回适用该基准单位的项，按 sortOrder 升序', () => {
    const codes = unitsForBaseUnit(g, 'G').map((u) => u.code);
    expect(codes).toContain('份');
    expect(codes).not.toContain('卷'); // 卷只在 PCS
  });

  it('箱/桶/提/件 标记为整件', () => {
    const multipack = unitsForBaseUnit(g, 'G')
      .filter((u) => u.multipack)
      .map((u) => u.code);
    expect(multipack).toEqual(expect.arrayContaining(['箱', '桶']));
  });
});

describe('resolvePurchaseUnitCode', () => {
  it.each([
    ['公斤', 'kg'],
    ['千克', 'kg'],
    ['升', 'L'],
    ['盒 ', '盒'],
  ])('%s → %s', (input, expected) => {
    expect(resolvePurchaseUnitCode(PURCHASE_UNIT_FALLBACK.ML.concat(g), input, 'G')).toBe(expected);
  });

  it('字典外的单位返回 null，不抛错、不猜', () => {
    expect(resolvePurchaseUnitCode(g, '挂', 'G')).toBeNull();
  });

  it('该基准单位不允许的单位也返回 null', () => {
    expect(resolvePurchaseUnitCode(g, '卷', 'G')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/application/purchasing/tests/purchase-unit-catalog.spec.ts`
Expected: FAIL —— `Cannot find module '../purchase-unit-catalog'`

- [ ] **Step 3: 实现目录**

`purchase-unit-catalog.ts` 只做三件事：把 `ALLOWED_PURCHASE_UNITS_BY_BASE_UNIT` 转成 `PurchaseUnitOption[]`（`multipack` 取自 `['箱','桶','提','件','组']`；`kind` 把 `g/kg/斤/两/吨/ml/L` 标成 `MEASUREMENT`、其余标成 `PACKAGING`）、按基准单位过滤、按别名归一。别名表复用 `PROCUREMENT_UNIT_ALIASES` 再加 `公斤/千克/升`。

字典读取：`loadPurchaseUnitOptions(prisma)` 优先读 `platform_option_item`（`set_id = 'purchase_unit'`、`enabled = true`），集合为空时返回 `PURCHASE_UNIT_FALLBACK`，并在日志里 `warn` 一次。**不缓存到进程级**（与渠道目录一致，避免后台改完要重启）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/application/purchasing/tests/purchase-unit-catalog.spec.ts`
Expected: PASS

- [ ] **Step 5: 先统计历史值，再加选项集定义与迁移**

先跑一条只读 SQL 统计库里真实出现过的采购单位，结果必须全部出现在种子清单里：

```sql
SELECT "purchase_unit", COUNT(*) FROM "procurement_sku"
WHERE "purchase_unit" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;
```

原因：现有校验对字典外的值是**直接 400**，字典比历史数据窄会让一批老商品突然不可编辑（渠道字典当年就是靠“回填 + 停用项保留”收的）。种子清单 = 现有四份清单的并集（含 `提/件/组/卷/罐` 等），统计里出现的值一个都不能少，缺的先补进种子。

在 `option-sets.registry.ts` 增加 `PURCHASE_UNIT_SET`（`sourceType: 'DATA'`，`seed` = `PURCHASE_UNIT_FALLBACK` 去重后的并集，`extra` 形如 `{ "baseUnits": ["G","ML","PCS"], "aliases": ["公斤","千克"], "multipack": false }`）。迁移文件只做“选项集存在时对齐”，写法照抄 `20261105190000_purchase_channel_dictionary/migration.sql`：`DO $$ ... IF NOT EXISTS (SELECT 1 FROM platform_option_set WHERE code='purchase_unit') THEN RETURN; END IF;`，插入用 `ON CONFLICT DO NOTHING`。

- [ ] **Step 6: 让表单选项接口返回新结构**

`getFormOptions()` 返回 `{ baseUnit, purchaseUnits: string[], purchaseUnitOptions: PurchaseUnitOption[] }`，`purchaseUnits` 保留（旧小程序在用），值从 `purchaseUnitOptions.map(u => u.code)` 取。

- [ ] **Step 7: 提交**

```bash
bash scripts/session.sh commit -m "feat(purchasing): 采购单位改成可维护字典，前后端读同一份"
```

---

### Task 2: 包装层级模型（纯函数 + 字段 + 回填）

**Files:**
- Create: `backend/src/domain/purchasing/packaging.ts`
- Modify: `backend/prisma/schema.prisma`（`ProcurementSku` 加 `packaging Json?`）
- Create: `backend/prisma/migrations/20261111130000_procurement_sku_packaging/migration.sql`
- Test: `backend/src/domain/purchasing/tests/packaging.spec.ts`

**Interfaces:**
- Produces:

```ts
export type PackagingLink = { count: number; unit: string };
export type PackagingSpec = {
  links: PackagingLink[];
  amount: number;
  amountUnit: 'G' | 'ML' | 'PCS';
  amountLabel?: string;   // 显示用「枚/张」，默认按基准单位
  printedText?: string;   // 包装原文
};
export type PackagingProblem =
  | 'EMPTY_AMOUNT' | 'BAD_LINK' | 'TOO_MANY_LINKS'
  | 'AMOUNT_UNIT_MISMATCH' | 'PURCHASE_UNIT_MISSING' | 'PURCHASE_UNIT_NOT_ALLOWED';
export function validatePackaging(input: {
  packaging: unknown; purchaseUnit: string | null; baseUnit: string; allowedUnits: string[];
}): { ok: true; spec: PackagingSpec; ratio: number } | { ok: false; problems: PackagingProblem[] };
export function deriveRatio(spec: PackagingSpec): number;
export function formatPackaging(spec: PackagingSpec, purchaseUnit: string): string; // 「1 箱 = 10 捆 × 500 克」
export function packagingFromLegacy(input: { ratio: number; baseUnit: string; printedText?: string | null }): PackagingSpec;
```

- [ ] **Step 1: 写失败测试**

```ts
// backend/src/domain/purchasing/tests/packaging.spec.ts
import {
  deriveRatio, formatPackaging, packagingFromLegacy, validatePackaging,
} from '../packaging';

const allowed = ['箱', '袋', '盒', '斤', '份'];

const ok = (packaging: unknown, purchaseUnit = '箱', baseUnit = 'G') =>
  validatePackaging({ packaging, purchaseUnit, baseUnit, allowedUnits: allowed });

describe('deriveRatio', () => {
  it('连乘中间层再乘末层', () => {
    expect(deriveRatio({ links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: 'G' })).toBe(5000);
    expect(deriveRatio({ links: [], amount: 500, amountUnit: 'G' })).toBe(500);
    expect(deriveRatio({
      links: [{ count: 10, unit: '捆' }, { count: 2, unit: '包' }],
      amount: 250, amountUnit: 'G',
    })).toBe(5000);
  });
});

describe('validatePackaging', () => {
  it('末层必须是原料基准单位', () => {
    const result = ok({ links: [], amount: 500, amountUnit: 'ML' }, '箱', 'G');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('AMOUNT_UNIT_MISMATCH');
  });

  it('不接受 0 / 负数 / 小数件数', () => {
    for (const bad of [0, -1, 1.5]) {
      const result = ok({ links: [{ count: bad, unit: '捆' }], amount: 500, amountUnit: 'G' });
      expect(result.ok).toBe(false);
    }
  });

  it('采购单位必须在字典里，且必须和第一层默契一致（这里是同一字段，只需在字典里）', () => {
    const result = ok({ links: [], amount: 500, amountUnit: 'G' }, '挂');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('PURCHASE_UNIT_NOT_ALLOWED');
  });

  it('层数超过 3 层拒绝（包装上没有那么多层）', () => {
    const links = [1, 2, 3, 4].map((count) => ({ count, unit: '层' }));
    const result = ok({ links, amount: 1, amountUnit: 'G' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain('TOO_MANY_LINKS');
  });

  it('通过时返回归一化后的 spec 与倍数', () => {
    const result = ok({ links: [{ count: 10, unit: ' 捆 ' }], amount: 500, amountUnit: 'G' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ratio).toBe(5000);
      expect(result.spec.links[0].unit).toBe('捆');
    }
  });
});

describe('packagingFromLegacy', () => {
  it('老数据回填成「只有末层」，倍数不变', () => {
    const spec = packagingFromLegacy({ ratio: 1590, baseUnit: 'G', printedText: '30枚 1.59kg' });
    expect(spec).toEqual({ links: [], amount: 1590, amountUnit: 'G', printedText: '30枚 1.59kg' });
    expect(deriveRatio(spec)).toBe(1590);
  });
});

describe('formatPackaging', () => {
  it('连成一句人话', () => {
    expect(formatPackaging({ links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: 'G' }, '箱'))
      .toBe('1 箱 = 10 捆 × 500 克');
    expect(formatPackaging({ links: [], amount: 500, amountUnit: 'G' }, '斤')).toBe('1 斤 = 500 克');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/domain/purchasing/tests/packaging.spec.ts`
Expected: FAIL —— 模块不存在

- [ ] **Step 3: 实现 `packaging.ts`**

规则：`links` ≤ 3 层；每层 `count` 是正整数、`unit` 去空格后 1~4 字；`amount > 0`；`amountUnit` 必须等于原料 `baseUnit`；`purchaseUnit` 必须在 `allowedUnits` 里（为空报 `PURCHASE_UNIT_MISSING`）。`deriveRatio` 用整数连乘后按 6 位小数取整（`Math.round(x * 1e6) / 1e6`），与现有 `roundNumber(...,6)` 口径一致。`formatPackaging` 的基准单位中文映射：`G→克`、`ML→毫升`、`PCS→个`，有 `amountLabel` 时优先用它。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/domain/purchasing/tests/packaging.spec.ts`
Expected: PASS

- [ ] **Step 5: 加字段与回填迁移**

`schema.prisma` 的 `ProcurementSku` 加：

```prisma
  /// 包装层级（2026-11-11）：中间层 links + 末层 amount（恒为原料基准单位）。
  /// 换算倍数由它派生并写入 purchaseToBaseRatio，任何接口不得单独改倍数。
  packaging Json? @map("packaging")
```

迁移 SQL：

```sql
ALTER TABLE "procurement_sku" ADD COLUMN IF NOT EXISTS "packaging" JSONB;

UPDATE "procurement_sku" s
SET "packaging" = jsonb_build_object(
  'links', '[]'::jsonb,
  'amount', s."purchase_to_base_ratio",
  'amountUnit', i."base_unit",
  'printedText', s."product_model"
)
FROM "ingredient" i
WHERE i."id" = s."ingredient_id"
  AND s."packaging" IS NULL
  AND s."purchase_to_base_ratio" > 0;
```

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(purchasing): 采购商品加包装层级字段，老数据按倍数无损回填"
```

---

### Task 3: 采购商品服务接层级（五个写入点收口）

**Files:**
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`（`create` / `update` / `createFromStaff` / `toSummary`）
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts` DTO 定义（`CreateProcurementSkuDto` / `UpdateProcurementSkuDto`）
- Modify: `backend/src/application/ingredient-creation/commit-procurement-sku.ts`（AI 原料建档，直写库）
- Modify: `backend/src/application/standard-ingredient-import/local-ingredient-import.ts:712`（标准原料导入，直写库）
- Test: `backend/src/application/purchasing/tests/procurement-sku-packaging.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `loadPurchaseUnitOptions` / `resolvePurchaseUnitCode`；Task 2 的 `validatePackaging` / `packagingFromLegacy` / `formatPackaging`
- Produces:
  - `createFromStaff(input)` 新增可选 `packaging?: unknown`；旧字段 `packCount`/`netContentPerPack` 仍在
  - `ProcurementSkuSummary` 新增 `packaging: PackagingSpec | null`、`packagingText: string | null`
  - 不变量：`purchase_unit = spec 的采购单位`、`purchase_to_base_ratio = deriveRatio(spec)`，三者同一事务写入

- [ ] **Step 1: 写失败测试**

```ts
// backend/src/application/purchasing/tests/procurement-sku-packaging.spec.ts
// 用一个最小 prisma 假对象，只实现被调用的方法
it('传层级时：倍数由层级派生，单位和层级一起校验', async () => { /* ... */ });
it('层级与旧字段同时传时，以层级为准', async () => { /* ... */ });
it('层级里的单位不在字典 → 400，且提示里带可用单位', async () => { /* ... */ });
it('只传旧的 packCount + netContentPerPack → 折叠成 links:[] / amount 的层级，倍数与原来一致', async () => { /* ... */ });
it('update 只改倍数而不改层级 → 拒（倍数不是可独立编辑的字段）', async () => { /* ... */ });
it('createFromStaff 的 summary 带上 packagingText「1 箱 = 10 捆 × 500 克」', async () => { /* ... */ });
it('AI 原料建档写 SKU 时单位不在字典 → 拒绝，而不是照写', async () => { /* ... */ });
it('AI 原料建档同时写入 productModel（现在是空的，订单匹配无从比规格）', async () => { /* ... */ });
it('标准原料导入写 SKU 时同时写入 packaging（不再是 null）', async () => { /* ... */ });
it('更新接口收到 packCount + netContentPerPack → 按层级处理，不再静默忽略', async () => { /* ... */ });
it('原料已有在用商品时改基准单位 → 拒绝，并说明要先停用商品', async () => { /* ... */ });
it('同名同渠道但规格不同 → 不再直接返回旧商品', async () => { /* ... */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/application/purchasing/tests/procurement-sku-packaging.spec.ts`
Expected: FAIL —— 断言拿不到 `packaging`

- [ ] **Step 3: 实现**

统一收口到一个私有方法：

```ts
private async resolvePackagingForWrite(input: {
  baseUnit: string; purchaseUnit?: string | null; packaging?: unknown;
  packCount?: number | null; netContentPerPack?: number | null; printedText?: string | null;
}): Promise<{ spec: PackagingSpec; ratio: number; purchaseUnit: string }>
```

顺序：`packaging` 有值 → 校验；否则 `packCount × netContentPerPack` → `packagingFromLegacy`；都没有 → 抛现有那句“必须填写「一件多少克」”。
`update()` 收到 `packaging` 才允许改倍数，单独传 `purchaseToBaseRatio` 一律 400（文案：「换算倍数由包装层级自动算，请在层级里改」）。

**五个写入点都必须走同一个纯函数** `buildProcurementSkuWrite(...)`（放在 `procurement-sku.service.ts` 同目录的 `procurement-sku-write.ts`），返回 `{ purchaseUnit, purchaseToBaseRatio, packaging, productModel }` 四件套：

1. `procurement-sku.service.ts:702`（后台新增）
2. `procurement-sku.service.ts:966`（员工新增）
3. `procurement-sku.service.ts:1030`（编辑）
4. `ingredient-creation-commit.service.ts:637`（AI 原料建档，现在完全绕过校验）
5. `local-ingredient-import.ts:712`（标准原料导入，同样绕过）

第 4、5 处现在是直接 `prisma.procurementSku.create`，只校验“单位非空”，**不校验是否在字典里** —— 这是 P0-6 / P1-8 的根因，必须一起改。另外三件事一起做：

- `UpdateProcurementSkuDto` 声明了 `packCount`/`netContentPerPack` 却没人读（P1-11）：要么接进来一起折叠，要么从 DTO 删掉并返回 400，**不允许“收下但不生效”**；
- 原料基准单位的变更加守卫（P1-13）：已有在用商品时拒绝改 `baseUnit`，文案「先停用/删除该原料的采购商品，再改记账单位」；
- 判重加规格（P1-14）：`名称 + 渠道 + 层级/倍数` 相同才算重复，同名不同规格要建新商品，不能返回旧的那条。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/application/purchasing/tests/procurement-sku-packaging.spec.ts`
Expected: PASS

- [ ] **Step 5: 回归既有采购测试**

Run: `cd backend && npx jest src/application/purchasing src/application/ingredient`
Expected: 全部 PASS（若原本就红，先在干净 `origin/main` 上复跑对照并记录）

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(purchasing): 采购商品三个写入入口收口到包装层级，倍数只由服务端派生"
```

---

### Task 4: 后台编辑与列表使用同一套层级

**Files:**
- Modify: `admin-web/src/views/Ingredients/StaffProcurementSkus.vue:120-160`（编辑弹窗）
- Create: `admin-web/src/components/ProcurementPackagingEditor.vue`（层级编辑器：单位下拉 + 层列表 + 末层数量 + 只读倍数）
- Modify: `admin-web/src/api/ingredients.ts`（类型加 `packaging` / `packagingText`）
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue:1868-1911`（原料档案里的采购商品弹窗，**内联了第四份单位清单**）
- Delete: `admin-web/src/constants/procurementPurchaseUnits.ts`（改由接口下发）
- Test: `admin-web/src/utils/packagingDisplay.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `purchaseUnitOptions`、Task 3 的 `packaging` / `packagingText`
- Produces: `admin-web/src/utils/packagingDisplay.ts` → `formatPackagingText(spec, purchaseUnit)`、`ratioOf(spec)`（与后端同口径，只用于展示和即时预览）

- [ ] **Step 1: 写失败测试（纯函数）**

```ts
// admin-web/src/utils/packagingDisplay.spec.ts
it('渲染成「1 箱 = 10 捆 × 500 克」', () => { /* ... */ });
it('倍数 = 连乘，和输入框里的数字一致', () => { /* ... */ });
it('层级为空时退回「1 盒 = 1500 克」', () => { /* ... */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/utils/packagingDisplay.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现并替换弹窗字段**

编辑弹窗里：采购单位 = 接口下发的下拉；「规格」自由文本降级为「包装原文（选填，用于订单截图匹配）」；原来的「换算倍数」输入框改成**只读展示**，值来自编辑器实时计算，下面一行小字「由层级自动算，不能直接改」。列表的「规格」列改渲染 `packagingText`，`productModel` 只在为空时兜底。

三处收尾：

1. 原料档案里那个“加/改采购商品”的弹窗（`IngredientForm.vue:1868-1911`）也要换成同一个层级编辑器，否则只删了 `procurementPurchaseUnits.ts`，这个弹窗仍然拿着一份拷贝；
2. 原料的「基准单位」在有在用采购商品时置灰，旁边写一句「已有采购商品，改单位会让所有商品的换算失效」；
3. 原料的「采购单位」输入框（补剂/包材）从自由文本改成同一个字典下拉。

- [ ] **Step 4: 跑测试 + 构建**

Run: `cd admin-web && npx vitest run src/utils/packagingDisplay.spec.ts && npm run build`
Expected: PASS 且构建成功

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(admin): 后台采购商品改用包装层级编辑，倍数只读"
```

---

### Task 5: 小程序「新增采购商品」单位与层级同步

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/procurement-sku-create.vue`（单位芯片、层编辑器、错误提示、提交）
- Modify: `miniapp/src/pages/staff-purchasing/procurement-sku-spec-chain.ts`（加 `withSelectedUnit`、`initialPurchaseUnit`、`isUnitAllowed`）
- Modify: `miniapp/src/pages/staff-purchasing/procurement-sku-form.ts`（校验改用 `purchaseUnitOptions`，不再要求“在完整白名单里”）
- Modify: `miniapp/src/pages/staff-purchasing/api/purchasing.ts`（`createStaffProcurementSku` 增加 `packaging`）
- Test: `miniapp/src/pages/staff-purchasing/procurement-sku-units.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `purchaseUnitOptions`（`{ code, multipack }[]`）
- Produces:
  - `withSelectedUnit(list: string[], selected: string | null, limit = 5): string[]`（选中的不在前 5 个就提到第一个，规则与 `withSelectedChannel` 完全一致）
  - `initialPurchaseUnit(draft: { purchaseUnit?: string | null } | null): string`（只认 AI 明确给出且在字典里的值，否则 `''`）
  - `isUnitAllowed(options: { code: string }[], unit: string | null): boolean`
  - 页面提交体：`{ ..., purchaseUnit, packaging: { links, amount, amountUnit, amountLabel, printedText } }`

- [ ] **Step 1: 写失败测试**

```ts
// miniapp/src/pages/staff-purchasing/procurement-sku-units.spec.ts
import { withSelectedUnit } from './procurement-sku-spec-chain';

const seven = ['袋', '箱', '包', '瓶', '盒', '桶', '份'];

it('选中的单位在前 5 个时不动', () => {
  expect(withSelectedUnit(seven, '盒')).toEqual(['袋', '箱', '包', '瓶', '盒']);
});

it('选中的单位被折叠时必须提到第一个（份排第 7）', () => {
  expect(withSelectedUnit(seven, '份')).toEqual(['份', '袋', '箱', '包', '瓶']);
});

it('没选时只返回前 5 个', () => {
  expect(withSelectedUnit(seven, '')).toEqual(['袋', '箱', '包', '瓶', '盒']);
});

it('选中的单位不在候选里（老数据）也照样显示出来', () => {
  expect(withSelectedUnit(seven, '斤')).toEqual(['斤', '袋', '箱', '包', '瓶']);
});

it('进页面不再默认选中「袋」：AI 没读出单位就留空', () => {
  expect(initialPurchaseUnit(null)).toBe('');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing/procurement-sku-units.spec.ts`
Expected: FAIL —— `withSelectedUnit is not a function`

- [ ] **Step 3: 实现 `withSelectedUnit` 并接到页面**

`visibleUnits` 改为 `showAllUnits ? clerkUnits : withSelectedUnit(clerkUnits, form.purchaseUnit, 5)`。同时：

1. **去掉默认单位**：`onLoad` 里 `form.purchaseUnit = clerkUnits.includes('袋') ? '袋' : ...` 删掉，改成 `initialPurchaseUnit(draft)`（只有 AI 明确给出且在字典里才预填）；配合 P0-5，这一条是“静默 10 倍”的根；
2. 「我买的是」这一行加错误态：`errors` 里有 `purchaseUnit` 时芯片行加 `error` 类，下面显示「请选一个采购单位」；单位行补 `AI 识别` 标记（现在四个字段里只有单位没有），清单加载失败时显示「可选项没加载出来，请返回重试」；
3. 单位芯片的来源改成 `purchaseUnitOptions`，按 `kind` 分两组：`PACKAGING` 默认展开显示前 5 个，`MEASUREMENT`（g/kg/斤/两/吨/ml/L）收在「更多」的第二组；`提/件/组` 等不再依赖被后端白名单过滤掉的 `CLERK_UNIT_PRIORITY`；
4. “整件必须补一层”的判断改用 `purchaseUnitOptions.find(o => o.code === unit)?.multipack`，删掉 `MULTIPACK_UNITS` 常量；
5. 层级的最后一层单位固定显示为基准单位（克/毫升/个），不再允许在末层手填单位；
6. 修「这件只有一件」的漏洞：`singleConfirmed` 现在取 `draft.packCount === 1 && !missing.includes('packCount')`，`missing` 不是数组时后半句恒真 → 一箱 10 捆会被存成 1 件，少 10 倍；改成「只有 AI 明确给出 `packCount=1` 且 `missing` 明确不含它」才自动确认；
7. 新增两条本页测试：AI 填了「斤」（`MEASUREMENT`），芯片行第一位必须是「斤」且是选中态；`missing` 缺失时不得自动确认“只有一件”。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd miniapp && npx vitest run src/pages/staff-purchasing`
Expected: PASS（含原有 `procurement-sku-form.spec.ts` / `procurement-sku-spec-chain.spec.ts`）

- [ ] **Step 5: 预览构建**

Run: `cd miniapp && npm run preview`
Expected: 成功；告知老板微信开发者工具打开 `miniapp/dist/dev/mp-weixin`

- [ ] **Step 6: 提交**

```bash
bash scripts/session.sh commit -m "feat(miniapp): 采购商品单位与包装层级同步，选中项永远可见"
```

---

### Task 6: AI 识别输出层级与单位提示

**Files:**
- Modify: `backend/src/application/purchasing/procurement-sku-draft.service.ts`（提示词 + `toDraft`）
- Modify: `miniapp/src/pages/staff-purchasing/procurement-sku-draft-apply.ts`（透传 `packaging` / `purchaseUnitHint`）
- Modify: `miniapp/src/pages/staff-purchasing/procurement-sku-create.vue`（显示“AI 读到「提」，请选一个”）
- Test: `backend/src/application/purchasing/tests/procurement-sku-draft.spec.ts`（追加用例）
- Test: `miniapp/src/pages/staff-purchasing/procurement-sku-draft-apply.spec.ts`（追加用例）

**Interfaces:**
- Produces: `ProcurementSkuDraft` 新增 `packaging: { links: {count,unit}[]; amount: number; amountUnit: string; amountLabel?: string } | null`、`purchaseUnitHint: string | null`（AI 读到的原文，字典里没有时才有值）

- [ ] **Step 1: 追加失败测试**

```ts
// backend/src/application/purchasing/tests/procurement-sku-draft.spec.ts
it('把这道原料允许的单位清单写进提示词', () => {
  expect(buildSystemPrompt(channels, ['箱', '袋', '盒'])).toContain('箱、袋、盒');
});
it('AI 给出字典外单位 → purchaseUnit 为 null，hint 保留原文', () => {
  const draft = toDraft({ purchaseUnit: '提' }, 'G', channels, ['箱', '袋']);
  expect(draft.purchaseUnit).toBeNull();
  expect(draft.purchaseUnitHint).toBe('提');
});
it('AI 给出的单位是别名（公斤）→ 归一成 kg', () => { /* ... */ });
```

```ts
// miniapp/src/pages/staff-purchasing/procurement-sku-draft-apply.spec.ts
it('AI 给的层结构直接透传，不再压成 packCount', () => { /* ... */ });
it('单位被拒时返回 hint，页面据此提示', () => { /* ... */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/application/purchasing/tests/procurement-sku-draft.spec.ts`；`cd miniapp && npx vitest run src/pages/staff-purchasing/procurement-sku-draft-apply.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

提示词加一段（与渠道清单同格式）：“purchaseUnit 只能从以下清单里选，读不到就给 null，不要自己造：箱、袋、盒……”；模型返回的 `purchaseUnit` 先用 `resolvePurchaseUnitCode` 归一，认不出就置 `null` 并写 `purchaseUnitHint`（原文截断 8 字）。页面在单位行下方显示：“AI 读到「{hint}」，请在上面选一个最接近的单位”。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/application/purchasing/tests/procurement-sku-draft.spec.ts`；`cd miniapp && npx vitest run src/pages/staff-purchasing/procurement-sku-draft-apply.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(purchasing): 识别只从单位字典里选，字典外单位保留原文提示"
```

---

### Task 7: 采购记录的数量单位门禁

**Files:**
- Modify: `backend/src/application/purchasing/purchase-order-import.service.ts:1050-1130`（乘倍数前先校验单位）
- Modify: `backend/src/application/purchasing/purchasing.service.ts:1680-1695`（手工记采购同一条校验）
- Modify: `backend/src/application/purchasing/replenishment.service.ts:373-396`（补货记录编辑的“重量单位绕开倍数”口子，P0-7）
- Modify: `miniapp/src/pages/staff-purchasing/order-import/review.vue:120,552,841-855,1545-1600`（单位清单改由商品单位 + 计量单位组成；克数与折合单价按同一单位算；不一致时行上标红；新建入口带上单位/规格/数量，P1-F5）
- Test: `backend/src/application/purchasing/tests/purchase-unit-guard.spec.ts`

**Interfaces:**
- Produces: `assertQuantityUnitMatches({ lineUnit, skuPurchaseUnit, skuName }): void`，不一致时抛 `BadRequestException`：“这行写的是「份」，商品「XX」是按「盒」买的：请把单位改成盒，或换一个按份卖的商品”

- [ ] **Step 1: 写失败测试**

```ts
it('单位一致 → 通过', () => {
  expect(() => assertQuantityUnitMatches({ lineUnit: '盒', skuPurchaseUnit: '盒', skuName: 'x' })).not.toThrow();
});
it('单位不一致 → 400，文案说清怎么办', () => {
  expect(() => assertQuantityUnitMatches({ lineUnit: '份', skuPurchaseUnit: '盒', skuName: '鸡蛋' }))
    .toThrow(/按「盒」买的/);
});
it('别名归一后一致 → 通过', () => {
  expect(() => assertQuantityUnitMatches({ lineUnit: ' 盒 ', skuPurchaseUnit: '盒', skuName: 'x' })).not.toThrow();
});
it('补货记录编辑里写「克/公斤」不再绕开商品倍数', async () => {
  // 1 件 = 5000 克；单位写「克」时不许把 1 当 1 克入账
  await expect(rebuildRecord({ unit: '克', qty: 1, ratio: 5000 })).resolves.toMatchObject({
    actualBaseQuantity: 5000,
  });
});
it('新建入口带过来的单位直接选中（不再一律从「袋」起步）', () => {
  expect(prefillUnitFromEntry({ unit: '份', allowed: ['袋', '份'] })).toBe('份');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/application/purchasing/tests/purchase-unit-guard.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

在 `qty × ratio` 之前调用门禁；识别结果页的单位清单改成“当前商品单位（置顶）+ 计量单位（斤/公斤/克/两/毫升/升）”，并删掉本页的 `UNIT_OPTIONS` 硬编码；选错单位时行内直接提示，生成按钮置灰。

三处必须一起改，否则只堵一半：

1. 识别结果页的“≈ 15000g · 折合 ¥x/kg”现在只按 `数量 × 商品倍数` 算，从不看行单位（`review.vue:841-855`）—— 单位选错时屏幕上的克数和单价也是错的，要和门禁用同一个函数；
2. 从这一行点「新建这个规格」时，把**行上的单位、规格、数量**一起带进新建页（现在只带原料和渠道），否则员工进去又要从「袋」重猜一遍；
3. 补货记录编辑走的是另一条重算路径（`replenishment.service.ts:373-396`），单位命中 g/kg 时会直接按克入账，绕开商品倍数 —— 这条也必须走同一个门禁。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/application/purchasing/tests/purchase-unit-guard.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "fix(purchasing): 采购记录单位与商品单位不一致时拦住，不再静默乘倍数"
```

---

### Task 8: 补货单位口径与成本重算

**Files:**
- Modify: `backend/src/application/purchasing/replenishment.service.ts:770-790`（数量单位不再兜底成基准单位）
- Modify: `backend/src/application/purchasing/purchasing.service.ts:688-712`（执行口径不再退回原料单位）
- Modify: `miniapp/src/pages/staff-purchasing/stock-create.vue:113-118,384-392,520-530`（展示商品的单位与价格，而不是原料档案的）
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts:441-470`（倍数/价格变化时重算原料成本）
- Test: `backend/src/application/purchasing/tests/replenishment-unit.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `packaging`（判断“整件”与单位）
- Produces: `resolveLineQuantityUnit({ skuPurchaseUnit, requestedUnit, baseUnit }): string` —— 只有 `requestedUnit` 明确且与商品单位一致的写法才用它，否则一律用商品单位；**永不返回基准单位**。

- [ ] **Step 1: 写失败测试**

```ts
it('没传单位 → 用商品单位', () => { /* ... */ });
it('传了别的单位 → 仍用商品单位（不静默换成克）', () => { /* ... */ });
it('商品没有单位 → 用「件」，不用克', () => { /* ... */ });
it('补货计划页展示的单位与价格 = 最终落库的那一套（商品优先）', () => { /* ... */ });
it('改层级导致倍数变化 → 原料成本按新倍数重算一次', () => { /* ... */ });
it('规格文本里反解不出单位时，退回商品单位而不是「克」', () => { /* ... */ });
it('报销“上一次单价”改用记录里的实际入库量，不再用原料倍数反算', () => { /* ... */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/application/purchasing/tests/replenishment-unit.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

补货：`quantityUnit` 用 `resolveLineQuantityUnit`，`displayUnit` 同理。成本：`update()` 改层级后，若该原料的 `currentPricePerPurchaseUnit` 是由这个商品初始化的（用现有 `costHistory` 最近一条 `source` 判断），按新倍数重算一次并记一条 `MANUAL` 成本流水；否则只在后台提示「成本未变」。

另外三处口径一起收（都是“同一个数在三个页面三种算法”）：

1. 采购记录表单、采购详情、采购预览各有一套单位换算（`record-form.vue:289-310`、`detail.vue:1206-1230`、`preview.vue:418-446`），支持的单位还不一样，预览页干脆不显示单位 —— 抽成一个 `formatPurchaseQuantity()` 放公共 utils，三处都调它；
2. 小程序从规格文本反解单位只认带 `/` 的写法（`record-form.vue:205-219`、`reimbursement/detail.vue:769-783`），层级上线后没有 `/`，会静默退回「克」—— 有结构化字段就只用结构化字段，文本反解只做兜底且必须标出“按商品单位”；
3. 报销详情的“上一次单价”用原料倍数反算（`reimbursement/detail.vue:730-748`），和同页“本次单价”的算法不一致 —— 统一用记录里的 `actualBaseQuantity`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/application/purchasing/tests/replenishment-unit.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "fix(purchasing): 补货单位不再兜底成克；改层级时重算原料成本"
```

---

### Task 9: 巡检脚本（只报告，不改数据）

**Files:**
- Create: `backend/scripts/audit-packaging-consistency.ts`
- Modify: `backend/package.json`（加 `"audit:packaging"`）
- Test: `backend/src/domain/purchasing/tests/packaging-audit.spec.ts`（纯检查函数）

**Interfaces:**
- Produces: `auditSkuRows(rows): AuditFinding[]`，`type AuditFinding = { skuId: string; name: string; kind: 'RATIO_MISMATCH' | 'UNIT_OUT_OF_DICT' | 'PACKAGING_MISSING' | 'TEXT_CONFLICT'; detail: string }`

- [ ] **Step 1: 写失败测试**

```ts
it('倍数与层级连乘不符 → RATIO_MISMATCH', () => { /* ... */ });
it('采购单位不在字典 → UNIT_OUT_OF_DICT', () => { /* ... */ });
it('老商品没有层级 → PACKAGING_MISSING', () => { /* ... */ });
it('规格原文里的件数×重量与层级算出来的对不上 → TEXT_CONFLICT', () => { /* ... */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/domain/purchasing/tests/packaging-audit.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现脚本**

默认 dry-run，打印表格（商品名 / 原料 / 类型 / 明细）；`--apply` 只做一件事：给缺失层级的商品按 `packagingFromLegacy` 补上（其余类型永不自动改）。

- [ ] **Step 4: 跑测试 + 在测试库上 dry-run**

Run: `cd backend && npx jest src/domain/purchasing/tests/packaging-audit.spec.ts && npm run audit:packaging`
Expected: PASS；输出里 `RATIO_MISMATCH` 为 0 条

- [ ] **Step 5: 提交**

```bash
bash scripts/session.sh commit -m "feat(purchasing): 包装层级一致性巡检脚本（只报告）"
```

---

## 执行顺序与合并

1. Task 1 → 2 → 3 串行（3 依赖 1、2 的接口）；
2. Task 4 / 5 / 6 可在 3 之后并行（后台、员工端、识别各一条）；
3. Task 7 / 8 / 9 在 5、6 之后做，避免同一页面三次冲突；
4. 全部合并到 `main` 后：后端 `npm test` + `npx tsc --noEmit`，后台 `npm run build`，小程序 `npm run build:mp-weixin`，再按授权部署后端/后台（小程序只上传体验版）。

## 自检（写计划时已核对）

- 规格覆盖：P0-1/P0-7 → Task 7；P0-2 → Task 7；P0-3/P0-4/P0-5 → Task 5；P0-6 → Task 3；P1-1/P1-2/P1-3/P1-12/P1-13 → Task 4；P1-4/P1-5 → Task 6；P1-6/P1-9/P1-10 → Task 8；P1-7 → Task 8；P1-8/P1-11/P1-14 → Task 3；P2 → Task 8（口径收敛）+ Task 9（巡检）。
- 命名一致：`packaging` / `links` / `amount` / `amountUnit` / `amountLabel` / `printedText` 在 2、3、4、5、6、9 号任务里同名同义。
- 每个任务都有可独立验收的测试或构建产物；没有“TODO / 适当处理”这类空话。
