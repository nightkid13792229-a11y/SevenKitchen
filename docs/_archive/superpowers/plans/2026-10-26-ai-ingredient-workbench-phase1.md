# AI 新增原料 · 阶段一（看得见 + 关得住）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 新增原料的右侧两页能看到标准原料全部 30 个字段与营养档案 60 个字段，并把「未授权不落库」从口头约定变成代码强制的闸门。

**Architecture:** 后端先把「原料卡字段」收成一份纯数据契约（键、分组、可写性、入库映射），草稿 DTO 与 commit 都从这份契约取值；核验拆成原料 / 营养两个域，统一成可注册的规则表，每次核验落一条带草稿内容哈希的报告；授权接口要求两份报告都是当前版本、且没有未处置项。前端把原料页从手写 7 个输入框改成按字段目录渲染，加核验弹窗与授权闸门。

**Tech Stack:** TypeScript、NestJS、Prisma、Vue 3、Element Plus、Jest（后端）、Vitest（前端）。

**Spec:** `docs/superpowers/specs/2026-10-25-ai-ingredient-workbench-design.md`

## Global Constraints

- 只改 `backend/` 与 `admin-web/`；不碰 `miniapp/`。
- 不新增 npm 依赖。
- 数据库改动只走 Prisma migration；不改旧 migration。
- 正式表只能由 `IngredientCreationCommitService.commit()` 写；本阶段不新增任何 AI 可调用的写正式表工具。
- 字段公共名 camelCase；`properties` 里的键 snake_case；`edibleYieldPercent` 是 0–100，草稿/库里 `edible_yield_rate` 是 0–1（换算只在前后端边界各做一次）。
- **任何写 `payload.ingredient` 的路径都必须给整份 30 项卡**：草稿 PATCH 是 `payload = payload || $1::jsonb` 的浅替换，只发一部分等于把其余字段抹掉。人保存（Task 5）与 AI 工具 `updateIngredientFields`（已修，commit 1c0a5d2b）都要遵守。
- 只做了前端展示、还没接入来源的字段，来源标记只允许「人工 / AI / 空」三种；真实来源小标在 P3。
- 本期不放「只看必需」筛子；也不实现任何依赖「必需字段清单」的规则。
- 测试命令：后端 `cd backend && npx jest tests/<path> --runInBand`；前端 `cd admin-web && npx vitest run <path>`。
- 每个任务结束提交一次；只 `git add` 本任务的文件（仓库有并发 agent），不 push、不部署。

## Review Focus

这些是规格没写死、但真实输入最容易被咬到的地方；每条都在对应任务的测试里钉住：

1. **可食部被多除/少除一次**：表单 `75%` → 草稿 `edibleYieldRate=0.75` → `properties.edible_yield_rate=0.75`。三段之间**只允许一次 ÷100**；多除一次会变成 0.0075，少除一次变成 75。
2. **空值被当成有值**：`null` / `''` / `undefined` 不能覆盖 commit 的默认采购口径（`purchaseUnit=展示名`、`ratio=1`、`price=0`）；但 `0` 是合法值，必须写进去。
3. **未知字段原样落库**：草稿里出现契约外的键，commit 必须忽略，不能塞进 `properties`。
4. **过期判定失效**：同一毫秒内的两次改动，`updatedAt` 可能一样；过期判定必须用 payload 内容哈希，不用时间戳。
5. **前后端字段目录漂移**：少一项就等于「看不见」，正好违背本阶段的目标；两侧各有一个钉死 30 个键的测试。

---

### Task 1: 原料卡字段契约（后端）

**Files:**
- Create: `backend/src/domain/ingredient-creation/ingredient-card-fields.ts`
- Test: `backend/tests/domain/ingredient-creation/ingredient-card-fields.spec.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `type IngredientCardFieldKey`（30 个字面量，见下）
  - `type IngredientFieldGroup = 'BASIC'|'MEASURE'|'NUTRITION'|'PURCHASE'|'STOCK'|'USAGE'|'STORAGE'`
  - `type IngredientFieldStage = 'CREATABLE'|'AFTER_CREATE'|'SYSTEM'`
  - `interface IngredientCardFieldDef { key: IngredientCardFieldKey; group: IngredientFieldGroup; label: string; stage: IngredientFieldStage; valueType: 'STRING'|'NUMBER'|'BOOLEAN'|'ENUM'|'STRING_ARRAY' }`
  - `const INGREDIENT_CARD_FIELDS: readonly IngredientCardFieldDef[]`
  - `const INGREDIENT_CARD_FIELD_KEYS: readonly IngredientCardFieldKey[]`
  - `const AI_WRITABLE_INGREDIENT_FIELDS: readonly IngredientCardFieldKey[]`
  - `const INGREDIENT_PROPERTY_KEY_BY_FIELD: Partial<Record<IngredientCardFieldKey, string>>`
  - `function isIngredientCardFieldKey(value: unknown): value is IngredientCardFieldKey`

30 个键按组（顺序即展示顺序）：

| 组 | 键 |
|---|---|
| BASIC | `name` `nameEn` `type` `category` `notes` |
| MEASURE | `baseUnit` `unitDisplayLabel` `weightG` `maxCapacityG` |
| NUTRITION | `cfctClass` `edibleYieldPercent` `mainNutrientsDesc` |
| PURCHASE | `procurementStrategy` `purchaseUnit` `purchaseToBaseRatio` `currentPricePerPurchaseUnit` `brand` `productModel` `purchaseChannel` |
| STOCK | `safetyStock` `reorderPoint` `targetStock` |
| USAGE | `diyEnabled` `addTiming` `productionLossRate` `tags` |
| STORAGE | `shelfLifeMonths` `storageCondition` `openedShelfLifeDays` `isOilBased` |

`stage`：`STOCK` 组的 3 项与 `tags` = `AFTER_CREATE`（P0 只读展示，commit 暂不写）；其余 = `CREATABLE`。`AI_WRITABLE_INGREDIENT_FIELDS` = 除了 `AFTER_CREATE` 的 4 项之外的全部 26 项。

`INGREDIENT_PROPERTY_KEY_BY_FIELD` 只映射落 JSON 的 6 项（可食部单独处理，见下）：
`nameEn→name_en`、`category→coverage_category`、`cfctClass→cfct_class`、`mainNutrientsDesc→main_nutrients_desc`、`addTiming→add_timing`、`productionLossRate→production_loss_rate`。其余 23 项都是 `Ingredient` 表列。

可食部是唯一一个**公共名与存储名不同**的字段：契约与 UI 用 `edibleYieldPercent`（0–100），草稿 payload 与 commit 入参仍用 `edibleYieldRate`（0–1），换算只在 `toIngredientDraft` / `toIngredientCard` 两处发生；落库键是 `properties.edible_yield_rate`。因此另导出 `const EDIBLE_YIELD_RATE_PROPERTY_KEY = 'edible_yield_rate'`，**不要**把它塞进上面那张 map。

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/domain/ingredient-creation/ingredient-card-fields.spec.ts
import {
  AI_WRITABLE_INGREDIENT_FIELDS,
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_KEYS,
  INGREDIENT_PROPERTY_KEY_BY_FIELD,
} from 'src/domain/ingredient-creation/ingredient-card-fields';

describe('原料卡字段契约', () => {
  it('恰好 30 项且键不重复', () => {
    expect(INGREDIENT_CARD_FIELDS).toHaveLength(30);
    expect(new Set(INGREDIENT_CARD_FIELD_KEYS).size).toBe(30);
  });

  it('每组顺序与设计一致', () => {
    expect(INGREDIENT_CARD_FIELD_KEYS.slice(0, 5)).toEqual([
      'name', 'nameEn', 'type', 'category', 'notes',
    ]);
    expect(INGREDIENT_CARD_FIELD_KEYS.slice(28)).toEqual([
      'storageCondition', 'openedShelfLifeDays', 'isOilBased',
    ]);
  });

  it('库存三项与标签在建完之后补，AI 本阶段不写', () => {
    expect(AI_WRITABLE_INGREDIENT_FIELDS).not.toContain('safetyStock');
    expect(AI_WRITABLE_INGREDIENT_FIELDS).not.toContain('tags');
    expect(AI_WRITABLE_INGREDIENT_FIELDS).toHaveLength(26);
  });

  it('只有 6 个字段直接落 properties，可食部单列', () => {
    expect(Object.keys(INGREDIENT_PROPERTY_KEY_BY_FIELD).sort()).toEqual([
      'addTiming', 'category', 'cfctClass',
      'mainNutrientsDesc', 'nameEn', 'productionLossRate',
    ]);
    expect(EDIBLE_YIELD_RATE_PROPERTY_KEY).toBe('edible_yield_rate');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/ingredient-card-fields.spec.ts --runInBand`
Expected: FAIL —— 找不到模块 `src/domain/ingredient-creation/ingredient-card-fields`。

- [ ] **Step 3: 实现契约文件**

用 `as const` 定义 30 项数组（每项 `{ key, group, label, stage, valueType }`，label 用中文：名称 / 英文名 / 类型 / 类别 / 备注 / 基准单位 / 展示名 / 单块重量 / 最大容量 / CFCT 分类 / 可食部 / 主要营养价值 / 采购策略 / 采购单位 / 换算倍数 / 当前采购价 / 品牌 / 规格 / 采购渠道 / 安全库存 / 补货点 / 目标库存 / 用于 DIY / 添加时机 / 生产损耗率 / 标签分类 / 保质期 / 储存条件 / 开封后效期 / 内容物油性），再派生 keys / writable / property map / 类型守卫。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation/ingredient-card-fields.spec.ts --runInBand`
Expected: PASS，4 个用例。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient-creation/ingredient-card-fields.ts backend/tests/domain/ingredient-creation/ingredient-card-fields.spec.ts
git commit -m "feat(ingredient-creation): add ingredient card field contract"
```

---

### Task 2: 草稿类型与 PATCH 校验接受全量字段

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation.types.ts`（`IngredientDraft` 与 `IngredientCardField`）
- Modify: `backend/src/interfaces/dto/ingredient-creation/update-draft.dto.ts`（新增 `UpdateDraftIngredientDto`）
- Test: `backend/tests/interfaces/dto/ingredient-creation/update-draft-ingredient.dto.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `IngredientCardFieldKey`、`AI_WRITABLE_INGREDIENT_FIELDS`。
- Produces:
  - `IngredientDraft` 补齐 30 个公共字段对应的存储字段；除 `name` / `type: 'FOOD'` / `baseUnit` / `unitDisplayLabel` 外**全部可选**（`cfctClass`、`edibleYieldRate` 也由必填改为可选）。可食部仍以 `edibleYieldRate`（0–1）存储，公共名 `edibleYieldPercent` 的换算留在前端 `toIngredientDraft` / `toIngredientCard`。
  - `IngredientCardField = IngredientCardFieldKey`（不再单独维护 7 个字面量）
  - `class UpdateDraftIngredientDto`，及其在 `UpdateDraftPayloadDto.ingredient` 上的使用

校验规则（除注明外都允许 `null`）：

> 入站剥键的前提已确认：`ingredient-creation.controller.ts:88` 有类级 `@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))`，未知键会在进 service 前被剥掉。`main.ts` 的全局 `transform:false` 不影响这个控制器——不要去改全局管道。

| 字段 | 规则 |
|---|---|
| `name` | string，1–100 |
| `nameEn` / `brand` / `productModel` / `purchaseChannel` / `storageCondition` / `mainNutrientsDesc` | string 或 null；`brand`/`productModel` ≤100（库是 VarChar(100)），其余 ≤200 |
| `type` | `@IsIn(['FOOD'])` |
| `category` | `@IsIn(['MEAT_ORGAN','STARCHY_VEGETABLE','OTHER'])` 或 null |
| `baseUnit` | `@IsIn(['G','ML','PCS'])` |
| `unitDisplayLabel` | string 1–50 |
| `cfctClass` | string 或 null |
| `procurementStrategy` | `@IsIn(['DAILY_PURCHASE','STOCK_REPLENISHMENT','HYBRID'])` 或 null |
| `purchaseUnit` | string ≤50 或 null（库是 VarChar(50)） |
| `addTiming` | `@IsIn(['BEFORE_MIXING','BEFORE_MEAL'])` 或 null |
| `edibleYieldRate` | number 0–1 或 null（草稿存比例；公共名 `edibleYieldPercent` 只出现在 `manualFields` 里） |
| `purchaseToBaseRatio` | number **> 0**（下游拿它做除数）或 null |
| `currentPricePerPurchaseUnit` / `weightG` / `maxCapacityG` | number ≥ 0 或 null |
| `productionLossRate` | number **1–2** 或 null（这是**倍数**：1.05 = 5% 损耗；不是 0–1 的比率） |
| `shelfLifeMonths` / `openedShelfLifeDays` | int ≥ 0 或 null |
| `diyEnabled` / `isOilBased` | boolean 或 null |
| `notes` | string 或 null |
| `safetyStock` / `reorderPoint` / `targetStock` | number ≥ 0 或 null（只读展示用，仍允许回传） |
| `tags` | string[] |
| `manualFields` | `IngredientCardFieldKey[]` |

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/interfaces/dto/ingredient-creation/update-draft-ingredient.dto.spec.ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDraftIngredientDto } from 'src/interfaces/dto/ingredient-creation/update-draft.dto';

const base = { name: '冷冻三文鱼', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克' };

async function errorsOf(extra: Record<string, unknown>) {
  const dto = plainToInstance(UpdateDraftIngredientDto, { ...base, ...extra });
  return (await validate(dto, { whitelist: true })).map((e) => e.property);
}

describe('UpdateDraftIngredientDto', () => {
  it('接受 30 项全量', async () => {
    expect(await errorsOf({
      weightG: 150, shelfLifeMonths: 12, isOilBased: false,
      brand: '××', purchaseToBaseRatio: 1000, currentPricePerPurchaseUnit: 128,
      edibleYieldRate: 0.75, tags: ['水产'],
    })).toEqual([]);
  });

  it('可食部比例越界被拒', async () => {
    expect(await errorsOf({ edibleYieldRate: 1.5 })).toContain('edibleYieldRate');
  });

  it('未知键被 whitelist 剥掉，不进 payload', async () => {
    const dto = plainToInstance(UpdateDraftIngredientDto, { ...base, evil: 'x' });
    expect((dto as unknown as Record<string, unknown>).evil).toBeUndefined();
  });

  it('manualFields 只接受契约内的键', async () => {
    expect(await errorsOf({ manualFields: ['nope'] })).toContain('manualFields');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/interfaces/dto/ingredient-creation/update-draft-ingredient.dto.spec.ts --runInBand`
Expected: FAIL —— `UpdateDraftIngredientDto` 未导出。

- [ ] **Step 3: 扩类型并新增 DTO**

`IngredientDraft` 里把 7 项之外补齐（全部 `?: T | null`），并把 `IngredientCardField` 改成 `IngredientCardFieldKey` 的别名；`update-draft.dto.ts` 里新增 `UpdateDraftIngredientDto`，用 `@ValidateIf((_, v) => v !== null)` + `@IsOptional()` 组合允许显式 null；`manualFields` 用 `@IsIn(INGREDIENT_CARD_FIELD_KEYS, { each: true })`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/interfaces/dto/ingredient-creation/update-draft-ingredient.dto.spec.ts --runInBand`
Expected: PASS，4 个用例。

- [ ] **Step 5: 回归本模块已有测试**

Run: `cd backend && npx jest tests/application/ingredient-creation --runInBand`
Expected: 全绿（新增字段都是可选的，旧调用不受影响）。

- [ ] **Step 6: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-creation.types.ts backend/src/interfaces/dto/ingredient-creation/update-draft.dto.ts backend/tests/interfaces/dto/ingredient-creation/update-draft-ingredient.dto.spec.ts
git commit -m "feat(ingredient-creation): accept full ingredient card fields in draft payload"
```

---

### Task 3: commit 写入全量字段（有值才写，没值保持默认）

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts`
- Modify: `backend/src/interfaces/dto/ingredient-creation/commit.dto.ts`
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`（把新字段透传给 commit）
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`（追加用例）

**Interfaces:**
- Consumes: Task 1 的 `INGREDIENT_PROPERTY_KEY_BY_FIELD`、Task 2 的 `IngredientDraft`。
- Produces: `IngredientCreationCommitService.commit()` 行为变化 —— 传了值就写，`null`/`undefined` 保持现有默认；`CommitIngredientCreationDto.ingredient` 接受 **26 个可写项**（库存三项与 `tags` 属于建完后补，本阶段不收）。

写入规则：

1. 表列字段：值非 `null`/`undefined`/`''` 才写；否则保持原默认（`diyEnabled=false`、`procurementEnabled=false`、`brand=null`、`purchaseUnit=unitDisplayLabel`、`purchaseToBaseRatio=1`、`currentPricePerPurchaseUnit=0`）。
2. `properties`：先写 `ingredientCreationDraftId`；再按 `INGREDIENT_PROPERTY_KEY_BY_FIELD` 写入**非空**项；可食部直接写 `ingredient.edibleYieldRate`（已经是 0–1），**绝对不要再 ÷100**——换算只在前端表单那一次。
3. `safetyStock` / `reorderPoint` / `targetStock` / `tags`：本阶段**不写**（`AFTER_CREATE`）。
4. 契约外的键：忽略。
5. `manualFields` 的白名单：`ingredient-creation-commit.service.ts` 里那份本地 7 键 `Set` 必须换成 `INGREDIENT_CARD_FIELD_KEYS`；否则人把 `brand` 标记为「人工」时，审计里会被静默丢掉。现有 commit 测试里钉 7 键断言的那条要一起改。

- [ ] **Step 1: 追加失败测试**

复用 `tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts` 里已有的 `store`、`rawProfile` 与 harness；若没有 `baseIngredient`，用 `{ name: '冷冻三文鱼', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克' }` 建一个。在现有 `describe('IngredientCreationCommitService')` 里加：

```ts
it('写入全量采购字段与该进 properties 的 7 项', async () => {
  const result = await service.commit({
    draftId: 'draft-1',
    userId: 'admin-1',
    ingredient: {
      ...baseIngredient,
      brand: '××水产', productModel: '1kg/袋', purchaseChannel: '京东',
      purchaseUnit: '袋', purchaseToBaseRatio: 1000,
      currentPricePerPurchaseUnit: 128, weightG: 150,
      shelfLifeMonths: 12, storageCondition: '-18℃ 冷冻', isOilBased: false,
      cfctClass: '鱼虾蟹贝类', edibleYieldRate: 0.75,
      mainNutrientsDesc: '高蛋白', addTiming: 'BEFORE_MIXING', productionLossRate: 1.05,
      nameEn: 'Atlantic Salmon',
    },
    profiles: [rawProfile],
    primaryProfileIndex: 0,
  });

  const row = store.ingredients.find((i) => i.id === result.ingredientId)!;
  expect(row.brand).toBe('××水产');
  expect(row.purchaseToBaseRatio).toBe(1000);
  expect(row.currentPricePerPurchaseUnit).toBe(128);
  expect(row.properties).toMatchObject({
    name_en: 'Atlantic Salmon',
    cfct_class: '鱼虾蟹贝类',
    edible_yield_rate: 0.75,
    main_nutrients_desc: '高蛋白',
    add_timing: 'BEFORE_MIXING',
    production_loss_rate: 1.05,
  });
});

it('没传的字段保持默认，0 不被当成空', async () => {
  const result = await service.commit({
    draftId: 'draft-1', userId: 'admin-1',
    ingredient: { ...baseIngredient, currentPricePerPurchaseUnit: 0 },
    profiles: [rawProfile], primaryProfileIndex: 0,
  });
  const row = store.ingredients.find((i) => i.id === result.ingredientId)!;
  expect(row.brand).toBeNull();
  expect(row.purchaseUnit).toBe('克');
  expect(row.purchaseToBaseRatio).toBe(1);
  expect(row.currentPricePerPurchaseUnit).toBe(0);
});

it('契约外的键不会进 properties', async () => {
  const result = await service.commit({
    draftId: 'draft-1', userId: 'admin-1',
    ingredient: { ...baseIngredient, rawPageHtml: '<html>' } as never,
    profiles: [rawProfile], primaryProfileIndex: 0,
  });
  const row = store.ingredients.find((i) => i.id === result.ingredientId)!;
  expect(row.properties).not.toHaveProperty('rawPageHtml');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts --runInBand`
Expected: FAIL —— 新字段没写进去（`brand` 仍是 null）。

- [ ] **Step 3: 改 `createIngredient`**

按上面的 4 条规则重建 `data` 与 `properties`；用 `hasValue(v)`（`v !== null && v !== undefined && v !== ''`）判断。注意 `false` 与 `0` 都是有效值。DTO 增加对应可选字段，控制器把整份 ingredient 透传，不再逐字段挑 7 个。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts --runInBand`
Expected: PASS（原有 + 新增用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts backend/src/interfaces/dto/ingredient-creation/commit.dto.ts backend/src/interfaces/controllers/ingredient-creation.controller.ts backend/tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts
git commit -m "feat(ingredient-creation): write full ingredient card on commit"
```

---

### Task 4: 前端字段目录与类型

**Files:**
- Create: `admin-web/src/constants/ingredientCardFields.ts`
- Modify: `admin-web/src/types/ingredientCreation.ts`
- Test: `admin-web/src/constants/ingredientCardFields.spec.ts`

**Interfaces:**
- Consumes: 无（与后端同序的镜像）。
- Produces:
  - `type IngredientCardFieldKey`（30 个字面量）
  - `interface IngredientCardFieldDef { key; group; label; stage; valueType }`
  - `const INGREDIENT_CARD_FIELDS`, `INGREDIENT_CARD_FIELD_GROUPS`（`{ key, label }[]`，7 组）、`INGREDIENT_AFTER_CREATE_FIELDS`
  - `function isIngredientCardField(key: string): key is IngredientCardFieldKey`

- [ ] **Step 1: 写失败的测试**

```ts
// admin-web/src/constants/ingredientCardFields.spec.ts
import {
  INGREDIENT_AFTER_CREATE_FIELDS,
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS,
} from './ingredientCardFields'

describe('前端原料字段目录', () => {
  it('30 项、7 组、键不重复', () => {
    expect(INGREDIENT_CARD_FIELDS).toHaveLength(30)
    expect(INGREDIENT_CARD_FIELD_GROUPS).toHaveLength(7)
    expect(new Set(INGREDIENT_CARD_FIELDS.map((f) => f.key)).size).toBe(30)
  })

  it('建完之后补的正好 4 项', () => {
    expect(INGREDIENT_AFTER_CREATE_FIELDS.map((f) => f.key)).toEqual([
      'safetyStock', 'reorderPoint', 'targetStock', 'tags',
    ])
  })

  it('与后端同序：第一组是基本信息，最后一项是内容物油性', () => {
    expect(INGREDIENT_CARD_FIELDS[0].key).toBe('name')
    expect(INGREDIENT_CARD_FIELDS.at(-1)!.key).toBe('isOilBased')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/constants/ingredientCardFields.spec.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写目录并把类型改成引用它**

`types/ingredientCreation.ts` 里 `IngredientCardField` 改为 `IngredientCardFieldKey` 的别名，`IngredientDraft` 补齐 30 项可选字段（与后端 Task 2 同名），`CheckItem` 增加可选 `suggestion?: string`（供 Task 10 的报告弹窗使用）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/constants/ingredientCardFields.spec.ts`
Expected: PASS，3 个用例。

- [ ] **Step 5: 提交**

```bash
git add admin-web/src/constants/ingredientCardFields.ts admin-web/src/constants/ingredientCardFields.spec.ts admin-web/src/types/ingredientCreation.ts
git commit -m "feat(admin-web): add ingredient card field catalog"
```

---

### Task 5: 原料档案页按目录全量渲染

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/draftReview.ts`
- Create: `admin-web/src/views/Ingredients/ai-agent/ingredientCardView.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`（替换手写的 7 个表单项）
- Test: `admin-web/src/views/Ingredients/ai-agent/ingredientCardView.spec.ts`

**Interfaces:**
- Consumes: Task 4 的 `INGREDIENT_CARD_FIELDS`、`IngredientCardFieldKey`。
- Produces:
  - `interface IngredientCardCell { key; group; label; value: string|number|boolean|string[]|null; display: string; isManual: boolean; isAfterCreate: boolean; kind: 'text'|'number'|'boolean'|'select'|'tags'; options?: readonly {label:string;value:string}[] }`
  - `function buildIngredientCardCells(draft: IngredientDraft | null | undefined, manualFields: readonly string[]): IngredientCardCell[]`
  - `function formatCellDisplay(key: IngredientCardFieldKey, value: unknown): string`
  - `function toIngredientDraftFromCells(draft: IngredientDraft, form: Record<string, unknown>): IngredientDraft`

**渲染规则：**

- 按 `INGREDIENT_CARD_FIELD_GROUPS` 分组，组内按目录顺序；每组一个小标题 + 网格。
- 空值（`null`/`undefined`/`''`/`[]`）渲染成虚线框 + "空"，**不隐藏**；`0` 与 `false` 正常显示。
- `AFTER_CREATE` 的 4 项显示灰底 + 小字"建完后补"，输入框 `disabled`。
- `manualFields` 命中的格子右上角挂「人工」。
- 来源标记：有值且非人工 → 「AI」；人工 → 「人工」；空 → 不显示。P3 再接真实来源。
- 枚举：`type`、`category`、`baseUnit`、`procurementStrategy`、`addTiming` 用 `el-select`，选项来自现有 `COVERAGE_CATEGORY_OPTIONS`、`BASE_UNIT_OPTIONS` 与新增的常量；未知值原样展示、不静默清空。
- **单位语义别搞反**：`edibleYieldPercent` 是 0–100 的百分数（存 0–1）；`productionLossRate` 是 **1–2 的倍数**（1.05 = 5% 损耗），格子里显示 `1.05` 并在旁边注明「= 5%」，不要显示成「105%」或「0.05」。
- 保存前对字符串 `trim()`；只有空白的格子视为空。

- [ ] **Step 1: 写失败的测试**

```ts
// admin-web/src/views/Ingredients/ai-agent/ingredientCardView.spec.ts
import { buildIngredientCardCells, formatCellDisplay } from './ingredientCardView'
import { toIngredientCard, toIngredientDraft } from './draftReview'

describe('buildIngredientCardCells', () => {
  it('30 项全部出现，空格也在', () => {
    const cells = buildIngredientCardCells({ name: '冷冻三文鱼', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克' } as never, [])
    expect(cells).toHaveLength(30)
    expect(cells.find((c) => c.key === 'maxCapacityG')!.display).toBe('空')
    expect(cells.find((c) => c.key === 'storageCondition')!.display).toBe('空')
  })

  it('0 与 false 不显示成空', () => {
    const cells = buildIngredientCardCells({
      name: 'x', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克',
      currentPricePerPurchaseUnit: 0, isOilBased: false,
    } as never, [])
    expect(cells.find((c) => c.key === 'currentPricePerPurchaseUnit')!.display).toBe('0')
    expect(cells.find((c) => c.key === 'isOilBased')!.display).toBe('否')
  })

  it('人工标记只落在指定格子', () => {
    const cells = buildIngredientCardCells({ name: 'x', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克' } as never, ['cfctClass'])
    expect(cells.filter((c) => c.isManual).map((c) => c.key)).toEqual(['cfctClass'])
  })

  it('建完之后补的 4 项被标出来', () => {
    const cells = buildIngredientCardCells({ name: 'x', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克' } as never, [])
    expect(cells.filter((c) => c.isAfterCreate).map((c) => c.key)).toEqual([
      'safetyStock', 'reorderPoint', 'targetStock', 'tags',
    ])
  })
})

describe('formatCellDisplay', () => {
  it('百分比带一位小数、布尔值中文', () => {
    expect(formatCellDisplay('edibleYieldPercent', 75)).toBe('75%')
    expect(formatCellDisplay('isOilBased', true)).toBe('是')
  })
})

describe('可食部换算只做一次', () => {
  it('表单 75% → 草稿 0.75 → 回显 75%', () => {
    const draft = toIngredientDraft({ name: 'x', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克', edibleYieldPercent: 75 } as never)
    expect(draft.edibleYieldRate).toBe(0.75)
    expect(toIngredientCard(draft as never).edibleYieldPercent).toBe(75)
  })
})
```

> 注：`buildIngredientCardCells` 的入参是 `IngredientDraft`，`edibleYieldRate` 要换算成 `edibleYieldPercent` 再展示（见 Task 4 的换算约定）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/ingredientCardView.spec.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `ingredientCardView.ts`**

纯函数，不依赖 Vue。`formatCellDisplay` 按 `valueType` 与 key 特判（百分比、布尔、数组 join）。

- [ ] **Step 4: 改页面**

把 `index.vue` 里手写的 7 个 `el-form-item` 替换成按 `groups` 渲染的循环；`ingredientForm` 改为 `Record<string, unknown>`；`saveIngredientField(key)` 改为 `saveIngredientCell(key)`，与 `loadedCard` 比较后**把整份 30 项 `ingredient` 一起 patch**，并把变化的那格标「人工」。

> ⚠️ 必须整份发，不能只发改动的那一格：后端 PATCH 是 `payload = payload || $1::jsonb` 的**浅替换**，`payload.ingredient` 会被整块覆盖。只发一个键 = 把 AI 填的另外 20 多项悄悄抹掉。这条是复查后端保存路径时确认的，不是猜测。

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent`
Expected: PASS（含原有 `draftReview.spec.ts`、`stepView.spec.ts`）。
Run: `cd admin-web && npx vue-tsc -p tsconfig.app.json --noEmit`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/views/Ingredients/ai-agent/ingredientCardView.ts admin-web/src/views/Ingredients/ai-agent/ingredientCardView.spec.ts admin-web/src/views/Ingredients/ai-agent/index.vue admin-web/src/views/Ingredients/ai-agent/draftReview.ts
git commit -m "feat(admin-web): render all ingredient card fields"
```

---

### Task 6: 营养档案筛子（全部 / 有值 / 缺口）

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/profileFilters.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`
- Test: `admin-web/src/views/Ingredients/ai-agent/profileFilters.spec.ts`

**Interfaces:**
- Consumes: `ProfileFieldRow` 与 `ProfileGroup`（`draftReview.ts` 已导出的现有类型）。
- Produces:
  - `type ProfileFilterMode = 'ALL' | 'FILLED' | 'MISSING'`
  - `function filterProfileRows(rows: ProfileFieldRow[], mode: ProfileFilterMode): ProfileFieldRow[]`
  - `function profileFilterCounts(rows: ProfileFieldRow[]): { all: number; filled: number; missing: number }`
  - `function groupVisibleOnFilter(group: ProfileGroup, mode: ProfileFilterMode): boolean`

- [ ] **Step 1: 写失败的测试**

```ts
// admin-web/src/views/Ingredients/ai-agent/profileFilters.spec.ts
import { filterProfileRows, profileFilterCounts } from './profileFilters'

const rows = [
  { fieldPath: 'macros.energyKcal', value: 195, status: 'DIRECT' },
  { fieldPath: 'macros.crudeProtein', value: null, status: 'PENDING' },
  { fieldPath: 'macros.moisture', value: 0, status: 'MANUAL' },
] as never

describe('营养筛子', () => {
  it('有值包含 0，不包含 null', () => {
    expect(filterProfileRows(rows, 'FILLED').map((r) => r.fieldPath)).toEqual([
      'macros.energyKcal', 'macros.moisture',
    ])
  })

  it('缺口只包含 null', () => {
    expect(filterProfileRows(rows, 'MISSING').map((r) => r.fieldPath)).toEqual(['macros.crudeProtein'])
  })

  it('计数与全量一致', () => {
    expect(profileFilterCounts(rows)).toEqual({ all: 3, filled: 2, missing: 1 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/profileFilters.spec.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现纯函数并在页面加三个筛子**

工具栏放 `全部 60 / 只看有值 28 / 只看缺口 32`（数字来自 `profileFilterCounts`，对当前激活的生/熟档案算）；筛选后某组为空就不渲染该组标题。**不加「只看必需」。**

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add admin-web/src/views/Ingredients/ai-agent/profileFilters.ts admin-web/src/views/Ingredients/ai-agent/profileFilters.spec.ts admin-web/src/views/Ingredients/ai-agent/index.vue
git commit -m "feat(admin-web): add nutrition missing-value filters"
```

---

### Task 7: 原料域核验规则

**Files:**
- Create: `backend/src/domain/ingredient-creation/ingredient-card-check.ts`
- Test: `backend/tests/domain/ingredient-creation/ingredient-card-check.spec.ts`

**Interfaces:**
- Consumes: Task 1 的契约、`CheckItem`（现有 `ingredient-creation.types.ts`）。
- Produces:
  - `CheckItem` 增加可选 `suggestion?: string`（设计 §8.2 要求每条带一句建议；现有类型只有 code/message/fieldPath）
  - `interface IngredientCardCheckInput { ingredient: IngredientDraft | null; existingNames: string[] }`
  - `function runIngredientCardCheck(input: IngredientCardCheckInput): CheckItem[]`
  - `const INGREDIENT_CARD_RULES: readonly { code: string; level: 'blocking'|'exceptionable'|'warning' }[]`（供版本号与报告展示）

规则（`fieldPath` 一律用 `ingredient.<key>` 便于前端定位）：

| code | 判什么 | 档位 |
|---|---|---|
| `NAME_REQUIRED` | `name` 去空白后为空 | blocking |
| `NAME_DUPLICATE` | `existingNames` 里有同名（trim + 全角空格归一后比较） | blocking |
| `BASE_UNIT_INVALID` | `baseUnit` 不在 G/ML/PCS | blocking |
| `UNIT_LABEL_REQUIRED` | `unitDisplayLabel` 为空 | blocking |
| `PURCHASE_RATIO_INVALID` | `purchaseToBaseRatio != null && <= 0` | blocking |
| `PURCHASE_PRICE_NEGATIVE` | `currentPricePerPurchaseUnit != null && < 0` | blocking |
| `EDIBLE_RANGE` | `edibleYieldPercent != null && (<= 0 或 > 100)` | exceptionable |
| `SHELF_LIFE_RANGE` | `shelfLifeMonths != null && (非整数 或 < 1 或 > 120)` | exceptionable |
| `STORAGE_EMPTY` | 采购单位或采购价有值，但 `storageCondition` 为空 | warning |
| `PRICE_LOOKS_PROMO` | 本阶段不做（P3 有来源页后再加） | — |

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/domain/ingredient-creation/ingredient-card-check.spec.ts
import { runIngredientCardCheck } from 'src/domain/ingredient-creation/ingredient-card-check';

const base = { name: '冷冻三文鱼', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克' } as const;

const codes = (input: Parameters<typeof runIngredientCardCheck>[0]) =>
  runIngredientCardCheck(input).map((i) => i.code);

describe('runIngredientCardCheck', () => {
  it('干净草稿零问题', () => {
    expect(runIngredientCardCheck({ ingredient: base, existingNames: [] })).toEqual([]);
  });

  it('同名（含全角空格）算重复', () => {
    expect(codes({ ingredient: { ...base, name: '冷冻　三文鱼' }, existingNames: ['冷冻 三文鱼'] }))
      .toContain('NAME_DUPLICATE');
  });

  it('可食部 0 与 101 都不合格，100 合法', () => {
    expect(codes({ ingredient: { ...base, edibleYieldPercent: 0 }, existingNames: [] })).toContain('EDIBLE_RANGE');
    expect(codes({ ingredient: { ...base, edibleYieldPercent: 101 }, existingNames: [] })).toContain('EDIBLE_RANGE');
    expect(codes({ ingredient: { ...base, edibleYieldPercent: 100 }, existingNames: [] })).not.toContain('EDIBLE_RANGE');
  });

  it('采购价 0 不报负价', () => {
    expect(codes({ ingredient: { ...base, currentPricePerPurchaseUnit: 0 }, existingNames: [] }))
      .not.toContain('PURCHASE_PRICE_NEGATIVE');
  });

  it('每条都带能定位的 fieldPath', () => {
    const items = runIngredientCardCheck({ ingredient: { ...base, baseUnit: 'KG' as never }, existingNames: [] });
    expect(items[0].fieldPath).toBe('ingredient.baseUnit');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/ingredient-card-check.spec.ts --runInBand`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现规则函数**

纯函数、无 IO。`existingNames` 由服务层查库后传入，保证这里可单测。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation/ingredient-card-check.spec.ts --runInBand`
Expected: PASS，5 个用例。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient-creation/ingredient-card-check.ts backend/tests/domain/ingredient-creation/ingredient-card-check.spec.ts
git commit -m "feat(ingredient-creation): add ingredient card check rules"
```

---

### Task 8: 核验报告落库、按域运行、过期判定

**Files:**
- Create: `backend/prisma/migrations/<timestamp>_add_ingredient_check_run/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/application/ingredient-creation/ingredient-check-run.service.ts`
- Create: `backend/src/domain/ingredient-creation/draft-payload-hash.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-check.service.ts`
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`
- Test: `backend/tests/domain/ingredient-creation/draft-payload-hash.spec.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-check-run.service.spec.ts`

**Interfaces:**
- Consumes: Task 7 的 `runIngredientCardCheck`；现有 `evaluateProfiles`。
- Produces:
  - `type CheckDomain = 'INGREDIENT' | 'NUTRITION'`
  - `type CheckTrigger = 'AGENT' | 'USER'`
  - `function hashDraftPayload(payload: unknown): string`（键排序 + SHA-256，`undefined` 与缺键等价）
  - `interface CheckRunView { id; draftId; domain; trigger; rulesVersion: string; payloadHash: string; result: FinalCheckResult; counts: { blocking; exceptionable; warning }; createdAt: string }`
  - `class IngredientCheckRunService { runDomain(draftId, domain, trigger): Promise<CheckRunView>; latestRuns(draftId): Promise<Record<CheckDomain, CheckRunView | null>>; isFresh(run, draft): boolean }`
  - `IngredientCreationCheckService.runDomain(draftId, domain, trigger)` 作为对外入口（controller 只调它）

Prisma 模型（字段名按仓库规范：时间 `At`、外键 `Id`）：

```prisma
model IngredientCheckRun {
  id           String   @id @default(uuid())
  draftId      String   @map("draft_id")
  domain       String   @db.VarChar(20)
  trigger      String   @db.VarChar(20)
  rulesVersion String   @map("rules_version") @db.VarChar(40)
  payloadHash  String   @map("payload_hash") @db.VarChar(64)
  result       Json
  blockingCount     Int @default(0) @map("blocking_count")
  exceptionableCount Int @default(0) @map("exceptionable_count")
  warningCount      Int @default(0) @map("warning_count")
  createdBy    String   @map("created_by")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([draftId, domain, createdAt])
  @@map("ingredient_check_run")
}
```

- [ ] **Step 1: 写失败的测试（哈希）**

```ts
// backend/tests/domain/ingredient-creation/draft-payload-hash.spec.ts
import { hashDraftPayload } from 'src/domain/ingredient-creation/draft-payload-hash';

describe('hashDraftPayload', () => {
  it('键顺序不影响结果', () => {
    expect(hashDraftPayload({ a: 1, b: 2 })).toBe(hashDraftPayload({ b: 2, a: 1 }));
  });
  it('值变化会变哈希', () => {
    expect(hashDraftPayload({ a: 1 })).not.toBe(hashDraftPayload({ a: 2 }));
  });
  it('undefined 与缺键等价', () => {
    expect(hashDraftPayload({ a: 1, b: undefined })).toBe(hashDraftPayload({ a: 1 }));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/draft-payload-hash.spec.ts --runInBand`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现哈希（递归排序键、剔除 undefined、SHA-256 hex）**

- [ ] **Step 4: 写失败的服务测试**

mock `prisma.ingredientCheckRun.create/findFirst` 与 `draftService.get`：

```ts
it('跑一次原料域核验会落一条带哈希的报告', async () => {
  const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');
  expect(run.domain).toBe('INGREDIENT');
  expect(run.payloadHash).toBe(hashDraftPayload(draft.payload));
  expect(prisma.ingredientCheckRun.create).toHaveBeenCalled();
});

it('草稿改过之后旧报告不再新鲜', async () => {
  const run = await service.runDomain('draft-1', 'INGREDIENT', 'USER');
  const draft = { ...baseDraft, payload: { ...baseDraft.payload, ingredient: { name: '改了' } } };
  expect(service.isFresh(run, draft)).toBe(false);
});
```

- [ ] **Step 5: 跑测试确认失败 → 实现 → 通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-check-run.service.spec.ts --runInBand`
Expected: 先 FAIL，实现后 PASS。

- [ ] **Step 6: 加 migration 与接口**

`POST /admin/ingredient-creation/drafts/:id/checks` body `{ domain, trigger }`（trigger 由服务端按登录人固定为 `USER`，不接受前端传 `AGENT`）；`GET /admin/ingredient-creation/drafts/:id/checks` 返回两份最新报告 + `fresh: boolean`。

校验 migration：`cd backend && npx prisma validate && npx prisma generate`。

- [ ] **Step 7: 提交**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/<timestamp>_add_ingredient_check_run backend/src/application/ingredient-creation/ingredient-check-run.service.ts backend/src/application/ingredient-creation/ingredient-creation-check.service.ts backend/src/domain/ingredient-creation/draft-payload-hash.ts backend/src/interfaces/controllers/ingredient-creation.controller.ts backend/tests/domain/ingredient-creation/draft-payload-hash.spec.ts backend/tests/application/ingredient-creation/ingredient-check-run.service.spec.ts
git commit -m "feat(ingredient-creation): persist per-domain check runs with draft hash"
```

---

### Task 9: 授权接口（四条件闸门）

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-creation-authorize.service.ts`
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`
- Modify: `backend/src/interfaces/dto/ingredient-creation/commit.dto.ts`（`authorize` 复用提交入参）
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts`

**Interfaces:**
- Consumes: Task 8 的 `IngredientCheckRunService`、现有 `IngredientCreationCommitService`、`IngredientCreationCheckService.assertCommitAllowed`。
- Produces:
  - `class IngredientCreationAuthorizeService { authorize(input): Promise<CommitIngredientCreationResult & { authorizedAt: string }> }`
  - `interface AuthorizeBlockedReason { code: 'CHECK_MISSING'|'CHECK_STALE'|'CHECK_BLOCKING'|'CHECK_EXCEPTIONABLE'|'SOURCE_PENDING'; domain?: CheckDomain; detail: string }`
  - 失败时抛 `BadRequestException({ message: '授权前还有未满足的条件', reasons: AuthorizeBlockedReason[] })`

四条件（对应设计 §6.4）：

1. 原料域有报告、`payloadHash` 等于当前草稿、**`rulesVersion` 等于当前规则版本**、`blocking=0`；
2. 营养域同上；
3. 两域 `exceptionable` 全部命中 `payload.verify.exceptions`（按 `code` 匹配）；
4. 本阶段没有来源表，`SOURCE_PENDING` 恒不触发（留常量与分支，P3 接）。

> `rulesVersion` 必须参与判定，不能只比哈希：规则表升级后，旧报告即使哈希没变也不该再算“通过”，否则那一列只是摆设。

- [ ] **Step 1: 写失败的测试**

```ts
it('没有核验报告 → CHECK_MISSING，正式表零写入', async () => {
  await expect(service.authorize({ draftId: 'draft-1', userId: 'admin-1', ...commitInput }))
    .rejects.toMatchObject({ response: { reasons: [{ code: 'CHECK_MISSING' }] } });
  expect(commit.commit).not.toHaveBeenCalled();
});

it('报告过期 → CHECK_STALE', async () => {
  // 先跑核验，再改草稿 payload
  await expect(service.authorize(...)).rejects.toMatchObject({
    response: { reasons: expect.arrayContaining([{ code: 'CHECK_STALE' }]) },
  });
});

it('有未登记例外的 exceptionable → CHECK_EXCEPTIONABLE', async () => {
  // 让原料域返回一条 EDIBLE_RANGE
  await expect(service.authorize(...)).rejects.toMatchObject({
    response: { reasons: [{ code: 'CHECK_EXCEPTIONABLE', domain: 'INGREDIENT' }] },
  });
});

it('条件齐了才真正 commit，并带上授权时间', async () => {
  const result = await service.authorize(...);
  expect(commit.commit).toHaveBeenCalledTimes(1);
  expect(result.authorizedAt).toEqual(expect.any(String));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts --runInBand`
Expected: FAIL —— 服务不存在。

- [ ] **Step 3: 实现服务与路由**

`POST /admin/ingredient-creation/drafts/:id/authorize`，body 与 commit 相同；内部先跑四条件，再调 `commit.commit()`。**不修改** `POST commit` 的现有行为（保留给内部/回滚），但前端从此只调 authorize。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts --runInBand`
Expected: PASS，4 个用例。

- [ ] **Step 5: 全模块回归**

Run: `cd backend && npx jest tests/application/ingredient-creation --runInBand`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-creation-authorize.service.ts backend/src/interfaces/controllers/ingredient-creation.controller.ts backend/src/interfaces/dto/ingredient-creation/commit.dto.ts backend/tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts
git commit -m "feat(ingredient-creation): add authorization gate before commit"
```

---

### Task 10: 前端核验弹窗与授权闸门

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/checkReportView.ts`
- Create: `admin-web/src/views/Ingredients/ai-agent/components/CheckReportDialog.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`
- Modify: `admin-web/src/api/ingredientCreation.ts`
- Modify: `admin-web/src/types/ingredientCreation.ts`（`CheckRunView`、`CheckDomain`、`AuthorizeResult`）
- Test: `admin-web/src/views/Ingredients/ai-agent/checkReportView.spec.ts`

**Interfaces:**
- Consumes: Task 8/9 的接口。
- Produces:
  - `interface CheckRunSummary { domain; fresh; blocking; exceptionable; warning; checkedAt: string | null }`
  - `function toCheckRunSummary(run: CheckRunView | null, draft: { payload: unknown }): CheckRunSummary`
  - `function gateState(input: { ingredient: CheckRunSummary; nutrition: CheckRunSummary; saving: boolean }): { ready: boolean; reasons: string[] }`
  - API：`runDomainCheck(id, domain)`、`getChecks(id)`、`authorize(id, input)`

页面行为：

- 每个档案页的标签栏右端一个「核验此页」；点击 → 弹窗，先显示进度（规则逐条跑完后展示报告）。
- 报告按 `blocking / exceptionable / warning` 三档分色；每条显示 `code`、人话、`fieldPath` 定位按钮。
- `exceptionable` 每条带「登记例外」按钮，弹理由输入，写进 `payload.verify.exceptions` 后再跑一次核验。
- 报告不是当前草稿版本的 → 顶部显示过期横幅 + 「重跑核验」，授权按钮置灰。
- 底部授权按钮：`ready` 才可点；不可点时旁边直接写第一条原因（不写"条件不满足"）。
- 点击授权 → 二次确认（写入 1 条原料 + N 份档案、两份报告摘要）→ 成功后切"已写入"视图。

- [ ] **Step 1: 写失败的测试**

```ts
// admin-web/src/views/Ingredients/ai-agent/checkReportView.spec.ts
import { gateState, toCheckRunSummary } from './checkReportView'

const fresh = { domain: 'INGREDIENT', fresh: true, blocking: 0, exceptionable: 0, warning: 1, checkedAt: '2026-10-26T10:00:00.000Z' } as never

describe('授权闸门', () => {
  it('两域都新鲜且无未处置项才放行', () => {
    expect(gateState({ ingredient: toCheckRunSummary(fresh, {} as never), nutrition: toCheckRunSummary(fresh, {} as never) } as never))
      .toEqual({ ready: true, reasons: [] })
  })

  it('营养域没核验 → 不可点，并给出人话原因', () => {
    const gate = gateState({ ingredient: toCheckRunSummary(fresh, {} as never), nutrition: toCheckRunSummary(null, {} as never) } as never)
    expect(gate.ready).toBe(false)
    expect(gate.reasons[0]).toContain('营养档案')
  })

  it('有不合格项也算挡住', () => {
    const bad = { ...fresh, exceptionable: 2 } as never
    expect(gateState({ ingredient: toCheckRunSummary(bad, {} as never), nutrition: toCheckRunSummary(fresh, {} as never) } as never).ready).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/checkReportView.spec.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现纯函数与弹窗组件**

`CheckReportDialog.vue` 只负责渲染与发事件（`@rerun`、`@locate`、`@exception`）；判定逻辑全在 `checkReportView.ts`。

- [ ] **Step 4: 接入页面**

替换现有 `handleSubmit` 的终检逻辑：提交按钮改为「授权写入正式库」，调用 `authorize`；旧 `runCheck` 调用保留给弹窗的「重跑核验」。

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent`
Expected: PASS。
Run: `cd admin-web && npx vue-tsc -p tsconfig.app.json --noEmit`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/views/Ingredients/ai-agent/checkReportView.ts admin-web/src/views/Ingredients/ai-agent/checkReportView.spec.ts admin-web/src/views/Ingredients/ai-agent/components/CheckReportDialog.vue admin-web/src/views/Ingredients/ai-agent/index.vue admin-web/src/api/ingredientCreation.ts admin-web/src/types/ingredientCreation.ts
git commit -m "feat(admin-web): add check report dialog and authorization gate"
```

---

## 收尾验收（本阶段）

1. `cd backend && npx jest tests/application/ingredient-creation tests/domain/ingredient-creation --runInBand` 全绿。
2. `cd admin-web && npx vitest run` 全绿；`npx vue-tsc -p tsconfig.app.json --noEmit` 无错误。
3. 手工路径：新建草稿 → 原料页能看到 30 项（含空格） → 营养页三个筛子数字对得上 → 改一格 → 报告变过期 → 授权按钮置灰并写明原因 → 两页重跑核验 → 授权 → 原料与档案进库且 `PENDING`。
4. `git diff --stat` 只包含 `backend/` 与 `admin-web/`。

**不在本阶段**：留痕五张表、联网/查重/暂停续跑、来源审核页（P2–P4，各有独立计划）。
