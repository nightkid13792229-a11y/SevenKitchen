# 补剂草稿式建档与统一写入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把补剂从“先写入、再去上架页配置”改成“AI 起草 → 服务端草稿 → 人最终审核 → 一次性写入 → 写入后逐项核验”。

**Architecture:** 新增 `supplement_creation_draft` 表和服务端草稿 API；AI 起草只写草稿，不写正式库；最终写入在一个 Prisma 事务里完成原料、营养档案、映射、证据、标签、等价组和审计，事务内回读直接字段，提交后核验功能可见性。admin-web 新增草稿列表、分区编辑页、最终审核页和核验结果页，旧两段式流程留在开关后面。

**Tech Stack:** NestJS + Prisma + PostgreSQL（backend）；Vue 3 + Element Plus + Vitest（admin-web）；Jest（backend tests）。

**Spec:** `docs/superpowers/specs/2026-11-21-supplement-draft-finalize-design.md`

## Global Constraints

- 所有命令在工位根目录执行：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/20261121-supplement-draft-design`；分支 `task/20261121-supplement-draft-design`。
- 主工作区只读；只在工位里改、提交。提交统一用 `bash scripts/session.sh commit -m "..." <文件路径...>`。
- 禁止直接操作数据库。只写 Prisma migration 文件；不要对生产库执行 `migrate dev/deploy`。本地联调需要落库时，先确认 `DATABASE_URL` 指向本地库。
- 每粒值只由服务端按“每份含量 ÷ 每份量”计算；客户端不送、服务端不信任 `perUnitNutrients`。
- 两本目录只用来查规范名；**不看** `dogAllowed` / 适用范围，不做任何适用性门禁或提醒。
- 草稿存服务端、按创建人私有；只有手动“放弃”才清掉；不自动过期；进入页面先看列表，不自动打开上一张。
- 最终写入必须是一个事务；有阻断项或未确认提醒项就不写；失败时草稿保留，不能留半成品。
- 写入后必须核验；功能核验不通过时页面不能显示“全部成功”。
- 旧流程保留：admin-web `VITE_SUPPLEMENT_DRAFT_FLOW` 默认 `false`；后端新接口仅管理员可用，只有 `SUPPLEMENT_DRAFT_FLOW=true` 才启用，未设置/false 时返回 404（默认关，便于回滚）。
- 用户可见文案用中文；后端错误信息用中文。
- 联调期间不要跑 backend `npm run build`（会删 `dist` 弄死本机后端）；用 `npx tsc --noEmit` 自检。

## Review Focus

1. **粉剂/液体小数**：每份 0.9 g / 2.5 ml 时，证据表必须能存小数，营养档案基准必须是 `PER_1_G` / `PER_1_ML`，浓度解析能通过；写入 0/1 或 `PER_SERVING` 都算失败。
2. **人工改完再重跑 AI**：人改过的字段不能被 AI 静默覆盖；删掉某个营养素后，旧的每粒值/旧字段不能继续写进档案。
3. **开关打开但依赖缺失**：上架缺保质期、DIY 缺平台、采购缺价格时必须是阻断项，不能静默把开关关掉或写入一个“看起来成功”的档案。DIY 购买链接是选填，不阻断。
4. **事务失败**：任何一步失败都不能留下半条原料/营养/证据/标签/组关系；草稿必须保留。
5. **写入后功能核验失败**：字段写进去了但上架清单/配方候选/DIY/采购/等价组查不到时，页面必须显示“已写入，但功能未生效”，不能显示“全部成功”。

## 执行前基线

当前 `main` 上补剂建档测试是红的（4 条：仍期待 `PENDING`、两处旧查询字段、客户端每粒值对不上要 400）。这不是执行者造成的；Task 9 会按本设计更新。开始前先记录基线：

```bash
cd backend
npx jest tests/application/ingredient-creation/supplement-ingredient.service.spec.ts --runInBand
```

预期：4 failed / 12 passed。完成后应为全绿。

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261121230000_supplement_creation_draft/migration.sql`
- Test: `backend/tests/prisma/supplement-creation-draft.schema.spec.ts`

**Interfaces:**
- Produces: `SupplementCreationDraft` model, `SupplementCreationDraftStatus` enum, `SupplementLabelEvidence.servingUnitsPerDose: Float`.

- [ ] **Step 1: Write the failing schema test**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, '../..', ...parts), 'utf8');

const modelBlock = (schema: string, name: string) => {
  const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
};

describe('supplement creation draft schema', () => {
  const schema = read('prisma/schema.prisma');
  const sql = read(
    'prisma/migrations/20261121230000_supplement_creation_draft/migration.sql',
  );

  it('adds the draft model and status enum', () => {
    expect(schema).toContain('model SupplementCreationDraft');
    expect(schema).toContain('enum SupplementCreationDraftStatus');
    const block = modelBlock(schema, 'SupplementCreationDraft');
    expect(block).toMatch(/status\s+SupplementCreationDraftStatus/);
    expect(block).toMatch(/payload\s+Json/);
    expect(block).toMatch(/manualFields\s+String\[\]/);
    expect(block).toMatch(/verification\s+Json\?/);
  });

  it('makes standing evidence serving size decimal', () => {
    const block = modelBlock(schema, 'SupplementLabelEvidence');
    expect(block).toMatch(/servingUnitsPerDose\s+Float/);
  });

  it('migration creates the table and alters the evidence column', () => {
    expect(sql).toContain('CREATE TABLE "supplement_creation_draft"');
    expect(sql).toContain(
      'ALTER COLUMN "serving_units_per_dose" TYPE DOUBLE PRECISION',
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd backend && npx jest tests/prisma/supplement-creation-draft.schema.spec.ts --runInBand`
Expected: FAIL — model/migration missing.

- [ ] **Step 3: Add the model, enum and evidence type**

In `schema.prisma`:

- Add `enum SupplementCreationDraftStatus { DRAFT FINALIZED DISCARDED }`.
- Add `model SupplementCreationDraft` with the exact fields from spec §5.1: `id`, `createdBy`, `status`, `schemaVersion`, `name`, `payload`, `aiSnapshot`, `manualFields`, `verification`, `finalizedIngredientId`, `finalizedNutritionFoodId`, `finalizedEvidenceId`, `finalizedAt`, `createdAt`, `updatedAt`; indexes `[createdBy, status, updatedAt]` and `[status, updatedAt]`; map `supplement_creation_draft`.
- Change `SupplementLabelEvidence.servingUnitsPerDose` from `Int` to `Float`.
- Write the migration SQL manually: `CREATE TYPE "SupplementCreationDraftStatus" AS ENUM (...)`, `CREATE TABLE ...`, indexes, and:

```sql
ALTER TABLE "supplement_label_evidence"
  ALTER COLUMN "serving_units_per_dose" TYPE DOUBLE PRECISION
  USING "serving_units_per_dose"::DOUBLE PRECISION;
```

- [ ] **Step 4: Validate and generate the client**

Run: `cd backend && npx prisma validate && npx prisma generate`
Expected: both succeed. Do not apply the migration to any database.

- [ ] **Step 5: Run the schema test**

Run: `cd backend && npx jest tests/prisma/supplement-creation-draft.schema.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 草稿表与证据小数迁移" \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/20261121230000_supplement_creation_draft/migration.sql \
  backend/tests/prisma/supplement-creation-draft.schema.spec.ts
```

---

### Task 2: Draft payload, completeness, unit helper

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-draft.types.ts`
- Create: `backend/src/application/ingredient-creation/supplement-draft-completeness.ts`
- Modify: `backend/src/application/supplement-shop/supplement-unit.util.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-draft-completeness.spec.ts`
- Test: `backend/tests/application/supplement-shop/supplement-unit.util.spec.ts` (add cases)

**Interfaces:**
- Produces:
  - `SupplementDraftPayload` (exact shape in spec §5.2, plus `retail.openedShelfLifeDays: number | null` from §12.4).
  - `emptySupplementDraftPayload(): SupplementDraftPayload`.
  - `normalizeSupplementDraftPayload(input: unknown): SupplementDraftPayload` — deep-fills missing keys from empty; unknown keys dropped.
  - `DraftCompleteness { totalRequired: number; filledRequired: number; missing: string[] }`.
  - `computeDraftCompleteness(payload: SupplementDraftPayload): DraftCompleteness`.
  - `isSupplementUnitOneToOne` now accepts `胶囊` for PCS; still rejects `份`.

- [ ] **Step 1: Write the failing tests**

`supplement-draft-completeness.spec.ts`:

```ts
import {
  emptySupplementDraftPayload,
  normalizeSupplementDraftPayload,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import { computeDraftCompleteness } from '../../../src/application/ingredient-creation/supplement-draft-completeness';

describe('draft completeness', () => {
  it('empty draft reports required fields', () => {
    const empty = emptySupplementDraftPayload();
    const result = computeDraftCompleteness(empty);
    expect(result.filledRequired).toBe(0);
    expect(result.missing).toEqual(
      expect.arrayContaining(['name', 'physicalForm', 'nutrition', 'labelNames']),
    );
    expect(result.totalRequired).toBeGreaterThan(5);
  });

  it('fully filled draft has nothing missing', () => {
    const payload = normalizeSupplementDraftPayload({
      basic: {
        name: '鱼油',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        physicalForm: 'CAPSULE',
        servingUnitsPerDose: 2,
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 120,
        currentPricePerPurchaseUnit: 398,
        addTiming: 'BEFORE_MIXING',
      },
      nutrition: { servingNutrients: { 'fattyAcids.epa': 650 }, defaultTargetFields: ['fattyAcids.epa'] },
      label: { labelCategory: 'FEED_ADDITIVE', labelNames: ['鱼油'], tagNames: ['油脂类'] },
      retail: { enabled: true, shelfLifeMonths: 24, noSaleReason: null },
      diy: { enabled: false },
      procurement: { enabled: true },
      equivalence: { groupId: '__SKIP__' },
    });
    expect(computeDraftCompleteness(payload).missing).toEqual([]);
  });

  it('retail off requires a reason; retail on requires shelf life', () => {
    const payload = emptySupplementDraftPayload();
    payload.basic = { ...payload.basic, name: '鱼油' };
    payload.nutrition = { ...payload.nutrition, servingNutrients: { 'fattyAcids.epa': 650 }, defaultTargetFields: ['fattyAcids.epa'] };
    payload.label = { ...payload.label, labelCategory: 'FEED_ADDITIVE', labelNames: ['鱼油'], tagNames: ['油脂类'] };
    payload.equivalence = { ...payload.equivalence, groupId: '__SKIP__' };
    const off = { ...payload, retail: { ...payload.retail, enabled: false, shelfLifeMonths: null } };
    expect(computeDraftCompleteness(off).missing).toContain('noSaleReason');
    const on = { ...payload, retail: { ...payload.retail, enabled: true, shelfLifeMonths: null } };
    expect(computeDraftCompleteness(on).missing).toContain('shelfLifeMonths');
  });
});
```

Add to `supplement-unit.util.spec.ts`:

```ts
it('胶囊按个计，和粒/片一样 1:1', () => {
  expect(isSupplementUnitOneToOne('胶囊', 'PCS')).toBe(true);
});
it('份不是 1:1 单位', () => {
  expect(isSupplementUnitOneToOne('份', 'PCS')).toBe(false);
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-completeness.spec.ts tests/application/supplement-shop/supplement-unit.util.spec.ts --runInBand`
Expected: FAIL — modules/functions missing.

- [ ] **Step 3: Implement types, normalization, completeness and the unit alias**

- Put `SupplementDraftPayload` and helpers in `supplement-draft.types.ts` (the completeness function can live there or in `supplement-draft-completeness.ts`; export from the types file so tests import one path).
- Required fields follow spec §12:
  - basic: name, baseUnit, unitDisplayLabel, physicalForm, servingUnitsPerDose, purchaseUnit, purchaseToBaseRatio, currentPricePerPurchaseUnit, addTiming.
  - nutrition: at least one nutrient > 0, at least one default target.
  - label: labelCategory, labelNames length > 0, tagNames length > 0.
  - retail: if enabled → shelfLifeMonths; else → noSaleReason.
  - diy: if enabled → platform; linkUrl is optional.
  - procurement: no extra.
  - equivalence: groupId not null (including `__SKIP__`).
- `normalizeSupplementDraftPayload` must deep-merge nested objects from `emptySupplementDraftPayload()` and keep only known keys.
- Add `'胶囊'` to the PCS aliases in `supplement-unit.util.ts`; leave `'份'` out.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-completeness.spec.ts tests/application/supplement-shop/supplement-unit.util.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 草稿载荷与完整度计算" \
  backend/src/application/ingredient-creation/supplement-draft.types.ts \
  backend/src/application/ingredient-creation/supplement-draft-completeness.ts \
  backend/src/application/supplement-shop/supplement-unit.util.ts \
  backend/tests/application/ingredient-creation/supplement-draft-completeness.spec.ts \
  backend/tests/application/supplement-shop/supplement-unit.util.spec.ts
```

---

### Task 3: Catalog issues pure function

**Files:**
- Create: `backend/src/application/supplement-shop/supplement-catalog-issues.ts`
- Modify: `backend/src/application/supplement-shop/supplement-catalog.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-catalog-issues.spec.ts`

**Interfaces:**
- Produces:
  - `SupplementCatalogIssueCode`, `SupplementCatalogIssue` (move from catalog service; service re-exports them for existing imports).
  - `evaluateSupplementIssues(input: SupplementIssueInput): SupplementCatalogIssue[]`.
  - `SupplementIssueInput` includes price/ratio/physicalForm/baseUnit/unitDisplayLabel/displayUnit/propertiesDisplayUnit/shelfLifeMonths/storageCondition/sameNameCount/equivalenceGroup/concentration.

- [ ] **Step 1: Write the failing pure-function tests**

Cover every branch: `NO_PRICE`, `FORM_MISSING`, `LIQUID_UNSUPPORTED`, `UNIT_INCOMPATIBLE`, `SHELF_LIFE_MISSING`, `STORAGE_MISSING`, `UNIT_INCONSISTENT`, `DUPLICATE_NAME`, `EQUIVALENCE_UNGROUPED`, `EQUIVALENCE_GROUP_NOT_APPROVED`, `EQUIVALENCE_GROUP_SINGLETON`, `EQUIVALENCE_NUTRIENT_MISSING`, `EQUIVALENCE_UNIT_MISMATCH`. Example:

```ts
it('blocks liquid retail', () => {
  const issues = evaluateSupplementIssues({
    ...base,
    physicalForm: 'LIQUID',
  });
  expect(issues).toContainEqual(
    expect.objectContaining({ code: 'LIQUID_UNSUPPORTED', level: 'ERROR' }),
  );
});

it('warns when group is not approved', () => {
  const issues = evaluateSupplementIssues({
    ...base,
    equivalenceGroup: { name: '锌', status: 'DRAFT', isActive: true, memberCount: 2, nutrientLabel: '锌', nutrientUnit: 'mg' },
    concentration: { status: 'OK' },
  });
  expect(issues).toContainEqual(
    expect.objectContaining({ code: 'EQUIVALENCE_GROUP_NOT_APPROVED', level: 'WARN' }),
  );
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-catalog-issues.spec.ts --runInBand`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the pure function and refactor the service**

- Move the issue code/type declarations to the new file; in `supplement-catalog.service.ts`, import `evaluateSupplementIssues` and re-export the types with `export type { ... } from './supplement-catalog-issues'`.
- In `SupplementCatalogService.toItem`, replace the inlined issue block with one call:
  - price/ratio, physicalForm, baseUnit, unitDisplayLabel, displayUnit, propertiesDisplayUnit, shelfLifeMonths, storageCondition, sameNameCount, group info, and `concentration` from `this.dosage.resolveConcentration(ingredient, groupTarget)`.
  - Keep `normalizePhysicalForm`, suggestions, and the returned item shape unchanged.
- `evaluateSupplementIssues` must produce byte-for-byte the same codes/levels/messages as the current code.

- [ ] **Step 4: Run pure + existing catalog tests**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-catalog-issues.spec.ts tests/application/supplement-shop/supplement-catalog.service.spec.ts --runInBand`
Expected: PASS (existing catalog spec is the regression guard).

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "refactor(supplement): 抽出上架体检纯函数" \
  backend/src/application/supplement-shop/supplement-catalog-issues.ts \
  backend/src/application/supplement-shop/supplement-catalog.service.ts \
  backend/tests/application/supplement-shop/supplement-catalog-issues.spec.ts
```

---

### Task 4: Supplement profile builder + basic validation

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-draft-profile.ts`
- Create: `backend/src/application/ingredient-creation/supplement-draft-validation.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-draft-profile.spec.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-draft-validation.spec.ts`

**Interfaces:**
- Produces:
  - `buildSupplementProfile(payload: SupplementDraftPayload): NutritionProfileV2`.
  - `SupplementDraftIssueCode` union, `SupplementDraftIssue { code; level: 'BLOCKER'|'WARNING'; message; fieldPath? }`.
  - `validateSupplementDraftBasics(payload): SupplementDraftIssue[]`.

- [ ] **Step 1: Write failing profile tests**

Import `readProfileFieldAmount` from `../../../src/domain/recipe-designer/nutrition-profile-reader` for the reader regression case.

```ts
it('PCS: per-unit values and PER_SERVING basis', () => {
  const payload = normalizeSupplementDraftPayload({
    basic: { baseUnit: 'PCS', servingUnitsPerDose: 2 },
    nutrition: { servingNutrients: { 'fattyAcids.epa': 650 } },
  });
  const profile = buildSupplementProfile(payload);
  expect(profile.meta.rawBasisType).toBe('PER_SERVING');
  expect((profile.fattyAcids as any).epa).toBe(325);
});

it('powder: 0.9 g stays 0.9 and uses PER_1_G', () => {
  const payload = normalizeSupplementDraftPayload({
    basic: { baseUnit: 'G', unitDisplayLabel: 'g', servingUnitsPerDose: 0.9 },
    nutrition: { servingNutrients: { 'aminoAcids.taurine': 0.875 } },
  });
  const profile = buildSupplementProfile(payload);
  expect(profile.meta.rawBasisType).toBe('PER_1_G');
  expect((profile.aminoAcids as any).taurine).toBeCloseTo(0.972222, 5);
});

it('reader can read the PCS profile (PER_1_PCS is not a supported raw basis)', () => {
  const payload = normalizeSupplementDraftPayload({
    basic: { baseUnit: 'PCS', unitDisplayLabel: '粒', servingUnitsPerDose: 2 },
    nutrition: { servingNutrients: { 'fattyAcids.epa': 650 } },
  });
  const profile = buildSupplementProfile(payload);
  expect(readProfileFieldAmount(profile, 'fattyAcids.epa', 3)).toEqual({
    amount: 975,
    missing: false,
  });
});
```

- [ ] **Step 2: Write failing basic-validation tests**

Table-driven cases for: name required; name ending in a dosage form word (`胶囊`/`片`/`粉剂`…) → warning; brand/model/channel length limits; PCS integer; display/base 1:1; powder/liquid decimal; at least one nutrient; nutrient field known; target exists and has value; purchase unit/ratio/price; loss rate 1–2; label category/names/tag names/timing. Assert exact codes, e.g.:

```ts
expect(codes(validateSupplementDraftBasics(empty))).toEqual(
  expect.arrayContaining(['NAME_REQUIRED', 'UNIT_PHYSICAL_FORM_MISMATCH', 'NUTRIENT_EMPTY']),
);
```

- [ ] **Step 3: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-profile.spec.ts tests/application/ingredient-creation/supplement-draft-validation.spec.ts --runInBand`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement the profile builder and basic validation**

- `buildSupplementProfile`: start from `createEmptyNutritionProfile()`, set `rawBasisType` by `baseUnit` (`PER_SERVING` for PCS / `PER_1_G` / `PER_1_ML`), set `amountUnitLabel`/`servingUnitLabel`, `sourceType: 'SUPPLEMENT_LABEL'`, and write per-unit values (`serving / servingUnitsPerDose`). Invalid serving/values are skipped; validation blocks them.
- Basic validation includes the name form-word warning, brand/model/channel length checks, and `openedShelfLifeDays` (if present, must be a positive integer; otherwise optional).
- Basic validation uses `findNutritionField` / the backend `nutrition-field-catalog` to validate field paths; it must not import frontend constants.
- `isSupplementUnitOneToOne` for display/base; `Number.isInteger` for PCS.
- Codes are fixed and used by the UI; do not put raw field paths in user-facing messages except as a hint.

- [ ] **Step 5: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-profile.spec.ts tests/application/ingredient-creation/supplement-draft-validation.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 营养档案基准与基础校验" \
  backend/src/application/ingredient-creation/supplement-draft-profile.ts \
  backend/src/application/ingredient-creation/supplement-draft-validation.ts \
  backend/tests/application/ingredient-creation/supplement-draft-profile.spec.ts \
  backend/tests/application/ingredient-creation/supplement-draft-validation.spec.ts
```

---

### Task 5: Draft service CRUD

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-draft.service.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-draft.service.spec.ts`

**Interfaces:**
- Produces:
  - `SupplementDraftView` (fields from spec §5.1 + `completeness`).
  - `SupplementDraftSummary { id; name; updatedAt; completeness }`.
  - `UpdateSupplementDraftInput { name?; payload?; manualFields?; expectedUpdatedAt?; aiSnapshot? }`.
  - `SupplementDraftService.create(createdBy, { name? })`, `list(createdBy)`, `get(id, createdBy)`, `update(id, createdBy, input)`, `discard(id, createdBy)`, `markFinalized(tx, id, result)`, `saveVerification(id, createdBy, verification)`.

- [ ] **Step 1: Write failing service tests**

Use a mocked `PrismaService`; cover:
- create sets `createdBy`, `status: 'DRAFT'`, empty payload.
- list filters `createdBy` + `status: 'DRAFT'`, orders by `updatedAt desc`, excludes payload.
- get throws 404 for another user's draft.
- update deep-normalizes payload, updates `manualFields`, rejects stale `expectedUpdatedAt` with 409.
- discard sets `DISCARDED`; second discard is idempotent.
- markFinalized sets `FINALIZED` + ids.
- saveVerification writes the verification report for a FINALIZED draft owned by the user.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft.service.spec.ts --runInBand`
Expected: FAIL — service missing.

- [ ] **Step 3: Implement the service**

- Use `PrismaService.supplementCreationDraft`.
- `create` uses `emptySupplementDraftPayload()` and `normalizeSupplementDraftPayload`.
- `update` only accepts `payload`/`name`/`manualFields`/`aiSnapshot`; never status/ids. If `expectedUpdatedAt` is provided and differs from the row's ISO timestamp, throw `ConflictException('草稿已被更新，请刷新后再试')`.
- `list` returns only DRAFT, `orderBy: { updatedAt: 'desc' }`, and computes completeness from payload.
- `get` filters `{ id, createdBy }`; not found → `NotFoundException('草稿不存在')`.
- `discard` only DRAFT → DISCARDED; idempotent.
- `markFinalized` accepts `Prisma.TransactionClient` and sets ids/status.
- `saveVerification` accepts a verification object and updates only `verification`/`updatedAt`; not found → 404.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 服务端草稿 CRUD" \
  backend/src/application/ingredient-creation/supplement-draft.service.ts \
  backend/tests/application/ingredient-creation/supplement-draft.service.spec.ts
```

---

### Task 6: Feature validation + review context

**Files:**
- Modify: `backend/src/application/ingredient-creation/supplement-draft-validation.ts`
- Create: `backend/src/application/ingredient-creation/supplement-draft-review.service.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-draft-review.service.spec.ts`

**Interfaces:**
- Produces:
  - `SupplementDraftValidationContext` with `issues`, `duplicate`, `equivalenceGroup`, `concentration`, `config`, `catalog`.
  - `catalog` shape: `{ allExact: boolean; missingNames: string[]; candidatesByName: Record<string, string[]> }` (built from `label.labelNames`, not `basic.name`).
  - `validateSupplementDraftFeatures(payload, context): SupplementDraftIssue[]`.
  - `SupplementDraftReviewService.validate(userId, draftId): Promise<SupplementDraftReview>`.
  - `SupplementDraftReviewService.recommendGroups(userId, draftId): Promise<{ equivalenceEnabled: boolean; candidates: Array<RecommendationCandidate & { reason: string }> }>`.
  - `SupplementDraftReviewService.recommendGroupsForPayload(payload): Promise<{ equivalenceEnabled: boolean; candidates: Array<RecommendationCandidate & { reason: string }> }>` — no ingredient row needed; AI uses the in-memory provisional payload before it is saved.
  - `SupplementDraftReview { draft: SupplementDraftView; blockers: SupplementDraftIssue[]; warnings: SupplementDraftIssue[]; completeness: DraftCompleteness }`.
  - `buildContext(payload): Promise<SupplementDraftValidationContext>` (public so the AI service can reuse it).
  - `SupplementDraftIssue` gains `ackKey?: string` — stable `${code}:${paramsHash}` for every warning (including `NAME_FORM_WORD`), so finalize can require acknowledgment.

- [ ] **Step 1: Write failing feature-validation tests**

Cover: duplicate; catalog exact → pass, non-exact labelNames → warning with candidates (not basic.name); retail on with ERROR; retail off without reason; shelfLifeMonths present but invalid (0/negative/decimal, including retail off); noSaleReason not in the four-value whitelist; DIY on without platform; DIY on with empty linkUrl → no blocker; DIY platform not in the allowed whitelist; storageCondition >200; purchaseUnit >50; group not approved/singleton/skip; group concentration MISSING/UNIT_MISMATCH → warning; global shop/equivalence off warnings; missing evidence images → warning with per-image ackKey (not blocker). Assert levels and codes.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-review.service.spec.ts --runInBand`
Expected: FAIL — function/service missing.

- [ ] **Step 3: Implement feature validation and the review service**

- `validateSupplementDraftFeatures`:
  - Duplicate → `DUPLICATE_INGREDIENT` blocker with existing name.
  - Catalog: exact match in either catalog → pass; exact absent → `LABEL_NAME_UNVERIFIED` warning with up to 5 substring candidates (never a blocker; the human acknowledges).
  - Map catalog issues: any `ERROR` when retail enabled → blocker `RETAIL_BLOCKED_BY_ISSUES` + the issue messages; `WARN` when retail enabled → warning. Filter `EQUIVALENCE_*` (handled separately) and `DUPLICATE_NAME` (handled by the duplicate check) to avoid duplicate warnings.
  - Retail off + no reason → `NO_SALE_REASON_REQUIRED` blocker; reason not in SELF_MADE/BULK/NO_SUPPLY/UNDECIDED → `NO_SALE_REASON_INVALID` blocker.
  - Retail shelfLifeMonths present but not a positive integer → `SHELF_LIFE_INVALID` blocker (the catalog issue only checks missing, not invalid).
  - DIY on + no link/platform → `DIY_LINK_REQUIRED` blocker; platform not in TAOBAO/JD/PINDUODUO/IHERB/OTHER → `DIY_PLATFORM_INVALID` blocker.
  - `storageCondition` >200 chars → `STORAGE_CONDITION_TOO_LONG` blocker; `purchaseUnit` >50 chars → `PURCHASE_UNIT_TOO_LONG` blocker (finalize bypasses the old DTO).
  - Group: not chosen (`groupId === null`) → `GROUP_NOT_CHOSEN` blocker; not found or inactive/disabled → blocker; not APPROVED or memberCount <= 1 → warning; `__SKIP__` → warning.
  - Config shop/equivalence off → warnings.
  - Evidence: if either front or label image is missing → `EVIDENCE_MISSING` warning (AI drafting requires both, but manual entry may not).
- `buildContext`:
  - Build a synthetic ingredient from the payload (`id: 'draft'`, `type: 'SUPPLEMENT'`, baseUnit/unitDisplayLabel/purchaseUnit/properties/nutritionProfile/physicalForm/price/ratio/shelfLife/storage/retail/group) and call `dosage.resolveConcentration` for the selected group.
  - Query duplicate via `ingredient.findFirst({ type: SUPPLEMENT, name, brand, productModel })`.
  - Query group with `_count` and `nutrientKey/Label/Unit`.
  - Query `supplementShopConfig`.
  - Catalog exact via `feedAdditive.get(name)`/`feedMaterial.get(name)`; candidates via `lookup(name, 5)`.
  - Issue list via `evaluateSupplementIssues`.
- `validate` loads the draft via `draftService.get(draftId, userId)`, calls basics + features, merges. Test that every merged warning has `ackKey` and every blocker does not (including `NAME_FORM_WORD`).
- `recommendGroups` loads the draft and delegates to `recommendGroupsForPayload`; `recommendGroupsForPayload` builds a synthetic ingredient from the payload and lists groups (same query as `SupplementEquivalenceRecommendService`), resolves each candidate with `dosage.resolveConcentration`, then uses `sortRecommendations` + `describeRecommendation`; returns `{ equivalenceEnabled, candidates }` even when the ingredient doesn't exist yet.
- Set `ackKey` on every warning: `NAME_FORM_WORD:${name}`, label names `:${missingNames.sort().join('|')}`, group warnings `:${groupId}`, DIY `:${platform}`, retail `:${noSaleReason}`, evidence `:${missing.sort().join('+')}`; simple warnings can use `code` alone.
- Add group concentration warnings: selected group + concentration MISSING → `GROUP_NUTRIENT_MISSING`; UNIT_MISMATCH → `GROUP_UNIT_MISMATCH`; both WARNING with groupId ackKey.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-review.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 最终校验上下文与审核服务" \
  backend/src/application/ingredient-creation/supplement-draft-validation.ts \
  backend/src/application/ingredient-creation/supplement-draft-review.service.ts \
  backend/tests/application/ingredient-creation/supplement-draft-review.service.spec.ts
```

---

### Task 7: AI result schema, parser and prompt

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-draft-ai.schema.ts`
- Create: `backend/src/application/ingredient-creation/supplement-draft-ai.prompt.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-draft-ai.schema.spec.ts`

**Interfaces:**
- Produces:
  - `SupplementAiDraft` (fields/decisions/missing/warnings per spec §6.2; decisions include `recommendCreate: { value; reason }` so AI can suggest “不建议建档” without dropping the draft).
  - `SupplementAiSnapshot = SupplementAiDraft & { status: 'OK' | 'PARTIAL' }`.
  - `parseSupplementAiDraft(text, context): SupplementAiDraft | null`.
  - `buildSupplementDraftPrompt(input): string`.

- [ ] **Step 1: Write failing parser/prompt tests**

- Parses plain JSON and fenced JSON.
- Drops unknown field paths; keeps allowed ones.
- Rejects invalid group id (not in `groupIds`) → decision `null` + warning.
- Filters tagNames/addTiming/labelCategory to allowed values.
- Keeps reasons/confidence/source.
- Prompt includes label text, front text, link preview, catalog names, group candidates, allowed values, and the JSON schema.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-ai.schema.spec.ts --runInBand`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement schema/parser/prompt**

- Reuse `parseAnalysisJson` from `supplement-label-analysis.ts`.
- Context:
```ts
interface SupplementAiParseContext {
  allowedFields: string[];
  allowedTags: string[];
  allowedTimings: string[];
  allowedNoSaleReasons: string[];
  allowedPlatforms: string[];
  groupIds: string[];
}
```
- Parser returns `null` only if no JSON object; otherwise a normalized `SupplementAiDraft` with safe defaults (`decisions.retail.enabled=false` if absent, reasons `''`).
- Prompt must tell the model: no inventing, null/missing when unknown, reasons required, catalog names only for names, no dog applicability, output JSON only; include `recommendCreate` + reason in the decisions.
- Prompt must enumerate allowed enums: `baseUnit` PCS/G/ML, `physicalForm` POWDER/TABLET/CAPSULE/LIQUID, `labelCategory` FEED_MATERIAL/FEED_ADDITIVE, plus tags/timings/no-sale reasons/DIY platforms.
- Parser must reject top-level arrays even when preceded by prose or fenced as ``` json; invalid enum field values are dropped and recorded as AI warnings/missing, not silently lost.
- Prompt input includes `manualFields: string[]` and lists the human-edited paths so a re-run can avoid overwriting them.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-ai.schema.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): AI 起草结果解析与提示词" \
  backend/src/application/ingredient-creation/supplement-draft-ai.schema.ts \
  backend/src/application/ingredient-creation/supplement-draft-ai.prompt.ts \
  backend/tests/application/ingredient-creation/supplement-draft-ai.schema.spec.ts
```

---

### Task 8: AI orchestration service

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-draft-ai.service.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-draft-ai.service.spec.ts`

**Interfaces:**
- Produces: `SupplementDraftAiService.fill(userId, draftId, input): Promise<SupplementDraftView>`.
- Input: `{ frontImageUrl: string; labelImageUrl: string; productUrl?: string; selectionNote?: string }`.
- Consumes: `SupplementDraftService`, `SupplementDraftReviewService.buildContext`, `SupplementLabelIntakeService.read`, `SupplementLabelVisionService.analyze`, `SupplementLinkPreviewService.preview`.

- [ ] **Step 1: Write failing merge/orchestration tests**

- Rejects if either image is missing (`BadRequestException` with “正面图和标签图都要有”).
- Calls `intake.read` with both URLs; calls link preview only when a URL is present.
- Builds a provisional payload from facts; calls `review.buildContext`; calls `vision.analyze`; parses.
- Merges AI fields but skips paths in `manualFields` (assert `name` unchanged).
- Writes `aiSnapshot` and `manualFields` through `draftService.update(draftId, userId, ...)`; `recommendCreate=false` is stored in the snapshot but does not change draft status or discard it.
- If `vision.analyze` returns null, still saves facts and `aiSnapshot.status='PARTIAL'`.
- Does not write any ingredient/nutrition/evidence.
- A second `get` returns a newer draft/manual field before save → merge uses the newer payload and `expectedUpdatedAt`, not the stale first read.
- AI-only fields/decisions reach the payload (brand/purchaseChannel/retail/labelNames/`__SKIP__`); deleting the AI apply loop must fail tests.
- AI omits retail/DIY/procurement decisions → existing non-default values are preserved; snapshot decisions match effective payload.
- FINALIZED/DISCARDED draft → 409 before intake.
- AI `reapproveGroup=false` is ignored; link image beats AI image; lock releases after an intake failure.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-ai.service.spec.ts --runInBand`
Expected: FAIL — service missing.

- [ ] **Step 3: Implement the orchestration**

- Require both image URLs.
- `intake.read({ frontImageUrl, labelImageUrl })`; if product URL, `linkPreview.preview(productUrl)`.
- Use `intake.analysis` as the first-pass facts (name/brand/baseUnit/physicalForm/labelCategory/labelNames/tagNames/addTiming/defaultTargets); the decision call fills/overrides the rest, subject to the precedence rules.
- Facts:
  - `basic`: name/brand/productModel/purchaseChannel/price/purchaseUnit/ratio/servingUnitsPerDose/physicalForm/baseUnit/unitDisplayLabel from intake/front/link; `productionLossRate` default 1.05; `addTiming` from AI or default.
  - `nutrition`: `servingNutrients` from intake (canonical units), `labelText`.
  - `label`: catalog exact names/candidates + AI.
  - `diy.imageUrl` from link preview.
- Build a provisional payload with current draft values overridden by facts; call `review.buildContext` for issues/config/catalog and `review.recommendGroupsForPayload(provisional)` for candidate groups (do not use the persisted draft, it may still be empty).
- Call `vision.analyze(buildSupplementDraftPrompt(...))` with label/front text, link preview, catalog names/candidates, group candidates, config, and the provisional draft; parse with context.
- Merge precedence: `manualFields` (never overwrite) > parser/link deterministic facts (nutrients, serving, price, brand, model, image) > `intake.analysis` first-pass facts > decision-call result > missing.
  - AI fills decisions and fields without facts.
  - Skip any path in `manualFields`.
- **Re-read the draft immediately before merging/saving** (`latest = draftService.get(draftId, userId)`), merge against `latest.payload` + `latest.manualFields`, and pass `expectedUpdatedAt: latest.updatedAt` to `draftService.update`. This prevents a human autosave/rename during the AI run from being silently overwritten; a 409 must propagate.
- Only apply decisions the AI actually supplied: a decision with an empty reason is absent. Do not let parser defaults (`retail=false`, `diy=false`, `noSaleReason=null`, `procurement=false`) reset existing non-default values; normalize `aiSnapshot.decisions` to the effective merged values (so snapshot and payload never disagree, especially procurement).
- Keep the raw AI decisions in `aiSnapshot.proposedDecisions` (including reasons) so Task 10 can audit “AI 当初提了什么”; `decisions` is the effective merged value. Test a case where they differ.
- Ignore AI `equivalence.reapproveGroup`; keep the current value/default true (only the human can cancel in review).
- Deterministic link image beats AI `diy.imageUrl`; do not let AI override it.
- Save via `draftService.update(draftId, userId, { name: basic.name || latest.name, payload: mergedPayload, aiSnapshot: { status, ...aiDraft }, expectedUpdatedAt: latest.updatedAt })`. **`update` replaces `payload`; it does not merge**, so pass the full merged payload (latest payload + facts + AI fields). `aiDraft` already contains fields/decisions/missing/warnings; do not invent a top-level `reasons` key. Do not send `manualFields` (preserve the server-side list).
- In-memory `Set<string>` guard: if `draftId` is already running, throw 409.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-draft-ai.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): AI 起草编排" \
  backend/src/application/ingredient-creation/supplement-draft-ai.service.ts \
  backend/tests/application/ingredient-creation/supplement-draft-ai.service.spec.ts
```

---

### Task 9: Refactor create-in-transaction, profile basis, stale tests

**Files:**
- Modify: `backend/src/application/ingredient-creation/supplement-ingredient.service.ts`
- Modify: `backend/src/interfaces/dto/ingredient-creation/create-supplement-ingredient.dto.ts`
- Modify: `backend/tests/application/ingredient-creation/supplement-ingredient.service.spec.ts`

**Interfaces:**
- Produces: `SupplementIngredientService.createInTransaction(tx, input): Promise<CreateSupplementIngredientResult>`.
- `CreateSupplementIngredientInput` gains optional `shelfLifeMonths`, `openedShelfLifeDays`, `storageCondition`, `isOilBased`, `supplementRetailEnabled`, `purchaseLink`, `imageUrl`, `noSaleReason`.
- `create()` becomes a thin `$transaction` wrapper around `createInTransaction`.

- [ ] **Step 1: Update the existing test to the new contract**

- Expect `VERIFIED` (not `PENDING`) for nutrition food status.
- Expect the duplicate `findFirst` select to include `name`, `brand`, `productModel`.
- Replace “客户端每粒值与折算对不上要 400” with “客户端每粒值被忽略，档案按每份 ÷ 份数”:

```ts
await service.create({
  ...input,
  servingNutrients: { 'fattyAcids.epa': 650 },
  perUnitNutrients: { 'fattyAcids.epa': 300 },
});
expect(profile.fattyAcids.epa).toBe(325);
```

- Add a powder case: `servingUnitsPerDose: 0.9`, `aminoAcids.taurine: 0.875` → evidence sees `0.9`; profile basis `PER_1_G`; taurine `0.972222`.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-ingredient.service.spec.ts --runInBand`
Expected: FAIL — new expectations not met.

- [ ] **Step 3: Refactor the service**

- Extract the transaction body into `createInTransaction(tx, input)`; keep duplicate check, orphan reuse, ingredient/nutrition/mapping/evidence/tags writes.
- `create()` calls `this.prisma.$transaction((tx) => this.createInTransaction(tx, input))` and keeps the unique-violation catch.
- `buildProfile` uses `PER_SERVING` for PCS / `PER_1_G` / `PER_1_ML` by base unit; still writes per-unit values.
- Ignore `input.perUnitNutrients` entirely; remove it from `derivePerUnitNutrients` or leave the parameter unused. Update the input JSDoc.
- Set optional launch fields on the ingredient create: `shelfLifeMonths`, `openedShelfLifeDays`, `storageCondition`, `isOilBased`, `supplementRetailEnabled`; add `purchase_link`, `image_url`, `no_sale_reason` to `properties` when provided.
- Keep old callers working (optional fields).

- [ ] **Step 4: Run the service spec**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-ingredient.service.spec.ts --runInBand`
Expected: PASS (all 16+ including new powder case).

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "refactor(supplement): 建档事务复用与基准修正" \
  backend/src/application/ingredient-creation/supplement-ingredient.service.ts \
  backend/src/interfaces/dto/ingredient-creation/create-supplement-ingredient.dto.ts \
  backend/tests/application/ingredient-creation/supplement-ingredient.service.spec.ts
```

---

### Task 10: Finalize input + direct verification + finalize service

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-finalize.service.ts`
- Create: `backend/src/application/ingredient-creation/supplement-verification.ts`
- Modify: `backend/src/application/supplement-shop/supplement-equivalence.service.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-finalize.service.spec.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-verification.spec.ts`
- Test: `backend/tests/application/supplement-shop/supplement-equivalence.service.spec.ts` (add cases)

**Interfaces:**
- Produces:
  - `buildFinalizeInput(payload): CreateSupplementIngredientInput` (pure).
  - `buildDirectVerification(expected, actual): { fields: VerificationField[]; mismatches: string[] }` (pure).
  - `VerificationField { key; label; target; expected; actual; ok }`.
  - `VerificationFeature { code; label; ok; severity: 'INFO'|'WARN'|'ERROR'; detail; action? }`.
  - `SupplementWriteVerification { ok; checkedAt; fields: VerificationField[]; features: VerificationFeature[] }`.
  - `SupplementFinalizeService.finalize(user: { id: string; name?: string }, draftId, input?): Promise<FinalizeResult>`.
  - `FinalizeResult { ingredientId; nutritionFoodId; evidenceId; verification: SupplementWriteVerification }`.
  - `SupplementEquivalenceService.assignInTransaction(tx, ingredientIds, groupId, operator, options?: { reapprove?: boolean; priority?: number | null }): Promise<{ moved: number; skipped: number }>`.

- [ ] **Step 1: Write failing pure tests**

- `buildFinalizeInput` maps every payload field to the create input, including `properties` (`add_timing`, `production_loss_rate`, `label_category`, `label_names`, `label_name_source`, `tags`, `no_sale_reason`, `purchase_link`, `image_url`), and sends no `perUnitNutrients`.
- `buildDirectVerification` covers every row in spec §9.1; test at least shelf life, opened shelf life, retail, DIY link, serving size, and a match for the rest. Add a divergence test where `ingredient.nutritionProfile` matches but `nutrition_food.nutritionData` differs → must fail.
- `finalize`:
  - blockers → 400, no transaction.
  - warnings not acknowledged → 400.
  - successful tx → calls `createInTransaction` with no per-unit, updates launch fields, assigns group, marks draft finalized, writes audit, returns ids + verification.
  - transaction read-back mismatch → throws and rolls back.
  - duplicate preflight → 409.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-verification.spec.ts tests/application/ingredient-creation/supplement-finalize.service.spec.ts --runInBand`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the pure builders and the service**

- `buildFinalizeInput`:
  - base fields from payload.basic; nutrition from payload.nutrition; label from payload.label; evidence from payload.evidence; `productionLossRate`; `diyEnabled`/`procurementEnabled`.
  - `evidence.selection = { source: payload.evidence.selectionNote ? 'SKILL' : 'MANUAL', note: payload.evidence.selectionNote || null, recordedAt: new Date().toISOString() }`.
  - `shelfLifeMonths`, `openedShelfLifeDays`, `storageCondition`, `isOilBased`, `supplementRetailEnabled` from payload.retail.
  - `purchaseLink`/`imageUrl` from payload.diy.
  - `noSaleReason` only when retail disabled.
- `finalize`:
  - Load draft; if status is already `FINALIZED`, return its existing ids + stored verification (idempotent), do not write again.
  - Run `SupplementDraftReviewService.validate`.
  - The group step calls the new `assignInTransaction` (below), not `assign` (which opens its own transaction).
  - AI warnings are informational only: finalize checks only `SupplementDraftIssue` warnings from the validation service (fixed codes/ackKeys), never AI-invented warning codes.
  - If blockers or unacknowledged warnings → `BadRequestException({ message, blockers, warnings })`.
    - Build the acknowledged set from `payload.review.acknowledgedWarnings` as `${code}:${paramsHash}` (or `code` when `paramsHash` is empty) and compare with each warning's `ackKey`; any missing → 400.
  - Duplicate preflight **before** the blocker gate: if a same name/brand/model supplement exists, return 409 with `{ ingredientId, name }` (do not let the `DUPLICATE_INGREDIENT` validation blocker turn it into 400); the validation blocker remains for the review UI.
  - `$transaction`:
    - `createInTransaction(tx, input)`.
    - `tx.ingredient.update` for launch fields/properties if not already set by the create input.
    - Group assignment: if `equivalence.groupId` is not `__SKIP__`, call `equivalence.assignInTransaction(tx, [ingredientId], groupId, user, { reapprove: payload.equivalence.reapproveGroup !== false, priority: payload.equivalence.priority })`. Do not call `assign()` (it opens its own transaction). An explicit priority is insert-at-position: existing members at/after it shift +1.
    - `draftService.markFinalized(tx, ...)`.
    - `ingredientCreationAudit.create` with `proposals=aiSnapshot`, `changes=manualFields+values`.
    - Read back ingredient/nutrition/mapping/evidence/tags/group; `buildDirectVerification`; throw on mismatch. **Actual nutrient values come from `nutrition_food.nutrition_data`** (the recipe designer's source of truth), not only `ingredient.nutrition_profile`; verify both sinks.
  - Catch Prisma `P2002` from the transaction and convert to `ConflictException` with the existing record message.
  - After commit, `saveVerification` must be wrapped in try/catch + log: a verification-persistence failure must not make a successful write look like a failed write; return the report and let `reverify` heal it.
  - Return ids + direct verification; feature verification is added in Task 11 (call a placeholder `features: []` until then, then wire it).

- [ ] **Step 3b: Add transaction-safe equivalence assignment**

- In `SupplementEquivalenceService`, extract the `assign` body into `assignInTransaction(tx, ...)`; add `assertProductionLimitInTransaction(tx, ...)` and `nextPrioritiesInTransaction(tx, ...)` (or make the existing private helpers accept a `tx` argument).
- `assign()` becomes `this.prisma.$transaction((tx) => this.assignInTransaction(tx, ...))` and keeps its public signature. `assignInTransaction` accepts `priority`; when provided for one member, existing members with priority ≥ it shift +1 before insert.
- `assignInTransaction`:
  - Validates group/ingredient types using `tx`.
  - Rejects moving to another group with the existing message.
  - Checks production limit; computes next priorities; updates ingredients; resets an APPROVED group to DRAFT; writes `MEMBER_ADD` audit.
  - If `options.reapprove` is true: re-check `buildApprovalErrors` against the group after the member is added; if clean, set `APPROVED` + `reviewedBy`/`reviewedAt`; write `STATUS_CHANGE` audit. If not clean, throw `BadRequestException` with the approval errors (the finalize transaction rolls back).
- Keep the existing `assign`/`addMembers`/`removeMember` behavior and tests green.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-verification.spec.ts tests/application/ingredient-creation/supplement-finalize.service.spec.ts tests/application/supplement-shop/supplement-equivalence.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 一次性写入与直接字段核验" \
  backend/src/application/ingredient-creation/supplement-finalize.service.ts \
  backend/src/application/ingredient-creation/supplement-verification.ts \
  backend/src/application/supplement-shop/supplement-equivalence.service.ts \
  backend/tests/application/ingredient-creation/supplement-finalize.service.spec.ts \
  backend/tests/application/ingredient-creation/supplement-verification.spec.ts \
  backend/tests/application/supplement-shop/supplement-equivalence.service.spec.ts
```

---

### Task 11: Feature verification + reverify

**Files:**
- Create: `backend/src/application/ingredient-creation/supplement-verification.service.ts`
- Modify: `backend/src/application/ingredient-creation/supplement-finalize.service.ts`
- Test: `backend/tests/application/ingredient-creation/supplement-verification.service.spec.ts`

**Interfaces:**
- Produces:
  - `SupplementVerificationService.verifyFeatures(draft, ids): Promise<VerificationFeature[]>`.
  - `SupplementVerificationService.getVerification(userId, draftId): Promise<SupplementWriteVerification | null>`.
  - `SupplementVerificationService.reverify(userId, draftId): Promise<SupplementWriteVerification>`.
  - `SupplementWriteVerification { ok; checkedAt; fields; features }`.
- Finalize service calls `verifyFeatures` after the transaction and merges with direct fields.

- [ ] **Step 1: Write failing feature-verification tests**

Cover each feature:
- RETAIL: catalog item exists, retail flag matches, no ERROR issues.
- RECIPE: ingredient has primary mapping + `nutritionFood.status='VERIFIED'` + non-empty default targets.
- DIY: `diyEnabled` matches; when on, `properties.purchase_link.url` exists.
- PROCUREMENT: `procurementEnabled` matches; when on, purchase unit/ratio/price usable.
- EQUIVALENCE: group id/priority match; if should participate, group APPROVED/member ≥2/`resolveConcentration` OK.
- DUPLICATE: no second name/brand/model.
- PACKAGING: query enabled `POUCH` rules that match `physicalForm` (null = any); if none match, return `ok:false` with `severity:'WARN'` and action `/supplement-shop/packaging`; it must not make `verification.ok` false on its own.
- RECIPE/EQUIVALENCE actions use real routes; a missing stored report in reverify is an ERROR feature, not a silent ok=true.
- DIY on + LIQUID is a WARN.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-verification.service.spec.ts --runInBand`
Expected: FAIL — service missing.

- [ ] **Step 3: Implement the service**

- Use `PrismaService`, `SupplementDosageService`, `SupplementCatalogService` (or `supplementShopApi` equivalent query), `SupplementEquivalenceGroup` query.
- `verifyFeatures` queries by ingredient id; builds `VerificationFeature[]` with `ok`, `detail`, `action` (path strings for the UI).
- `getVerification` loads a FINALIZED draft owned by the user and returns its stored `verification` (or null).
- `reverify` loads a FINALIZED draft owned by the user, re-runs features, calls `draftService.saveVerification(draftId, userId, verification)`, returns it. Treat **empty direct-field evidence as missing** (`!stored || stored.fields.length === 0`), not only `!stored`; every such call must return `ok=false` plus `DIRECT_FIELDS_MISSING` ERROR (“缺少写入时字段核验记录，不能判定全部成功”), and a second reverify must not flip to ok=true. Add a two-call test.
- Fix-entry action paths must be real admin-web routes: RECIPE → `/ingredients?tab=nutrition`, EQUIVALENCE → `/supplement-shop/equivalence-groups`, PACKAGING → `/supplement-shop/packaging`; assert them in tests.
- DIY on + physicalForm LIQUID → DIY feature `ok:false` severity WARN (liquid not supported for DIY packing), in addition to the link check. Use the group's `nutrientKey` for the equivalence concentration check, not the draft's default targets.
- Update `finalize` to call `verifyFeatures` after commit; `verification.ok` is false only when a `severity='ERROR'` feature fails (or a direct field mismatches). A packaging `WARN` is shown but does not fail the report; the write is already committed, so do not throw.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/ingredient-creation/supplement-verification.service.spec.ts tests/application/ingredient-creation/supplement-finalize.service.spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 写入后功能核验与重核" \
  backend/src/application/ingredient-creation/supplement-verification.service.ts \
  backend/src/application/ingredient-creation/supplement-finalize.service.ts \
  backend/tests/application/ingredient-creation/supplement-verification.service.spec.ts
```

---

### Task 12: Draft/finalize/AI controller + DTOs + app module

**Files:**
- Create: `backend/src/interfaces/dto/ingredient-creation/supplement-draft.dto.ts`
- Create: `backend/src/interfaces/controllers/supplement-draft.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/interfaces/controllers/supplement-draft.controller.spec.ts`

**Interfaces:**
- Produces routes:
  - `GET/POST /api/v1/admin/ingredient-creation/supplement-drafts`
  - `GET/PATCH/DELETE .../:id`
  - `POST .../:id/ai-fill`
  - `POST .../:id/validate`
  - `POST .../:id/finalize`
  - `GET .../:id/verification`
  - `POST .../:id/reverify`
  - `POST .../:id/recommend-groups`
- All guarded by `AuthGuard, AdminGuard`; `@CurrentUser()` passes `userId`.
- Only `SUPPLEMENT_DRAFT_FLOW=true` enables routes; unset/false → 404 for all routes (test with env). Normal delegation tests set env true.

- [ ] **Step 1: Write the failing controller test**

Mock `SupplementDraftService`, `SupplementDraftAiService`, `SupplementDraftReviewService`, `SupplementFinalizeService`, `SupplementVerificationService`. Assert each route delegates with the current user (id + name for finalize) and returns `ApiResponseDto.success`; assert disabled flag returns 404.

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && npx jest tests/interfaces/controllers/supplement-draft.controller.spec.ts --runInBand`
Expected: FAIL — controller missing.

- [ ] **Step 3: Implement DTOs and controller**

- DTOs use `class-validator`: `CreateSupplementDraftDto { name? }`, `UpdateSupplementDraftDto { name?; payload: object; manualFields?: string[]; expectedUpdatedAt?: string }`, `AiFillSupplementDraftDto { frontImageUrl; labelImageUrl; productUrl?; selectionNote? }`, `FinalizeSupplementDraftDto { expectedUpdatedAt? }`.
- Controller uses `@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))`.
- Feature check: if `process.env.SUPPLEMENT_DRAFT_FLOW !== 'true'`, throw `NotFoundException('补剂草稿流程未开启')`; add `SUPPLEMENT_DRAFT_FLOW=false` to `backend/.env.example` so deploy env is explicit.
- Register controller and new services in `app.module.ts`.

- [ ] **Step 4: Run controller test + typecheck**

Run: `cd backend && npx jest tests/interfaces/controllers/supplement-draft.controller.spec.ts --runInBand && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 草稿/审核/写入接口" \
  backend/src/interfaces/dto/ingredient-creation/supplement-draft.dto.ts \
  backend/src/interfaces/controllers/supplement-draft.controller.ts \
  backend/src/app.module.ts \
  backend/tests/interfaces/controllers/supplement-draft.controller.spec.ts
```

---

### Task 13: Frontend API, types, composable, test setup

**Files:**
- Create: `admin-web/src/api/supplementDrafts.ts`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/useSupplementDraft.ts`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/supplementDraftState.ts`
- Modify: `admin-web/vitest.config.ts`
- Modify: `admin-web/package.json` / lockfile (devDeps `@vue/test-utils`, `jsdom`)
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/supplementDraftState.spec.ts`

**Interfaces:**
- Produces:
  - API client `supplementDraftsApi` with list/create/get/update/discard/aiFill/validate/finalize/reverify/recommendGroups.
  - Types mirroring backend: `SupplementDraftPayload`, `SupplementDraftView`, `SupplementDraftSummary`, `SupplementDraftReview`, `SupplementWriteVerification` (feature code union includes `DIRECT_FIELDS_MISSING`).
  - `useSupplementDraft(draftId)` returns `{ draft, loading, saving, aiRunning, validating, error, load, save, runAi, validate, finalize, discard }`.
  - Pure helpers: `hasBlocker(review)`, `canFinalize(review, acknowledged)`, `diffDraft(before, after)`, `fieldMapRows`.

- [ ] **Step 1: Add test deps and Vue plugin**

Run: `cd admin-web && npm install -D @vue/test-utils jsdom`
Modify `vitest.config.ts` to add `plugins: [vue()]` and keep `environment: 'node'` (component specs opt into jsdom with a file docblock).

- [ ] **Step 2: Write failing pure state tests**

- `canFinalize` false with blockers, false with unacknowledged warnings, true when clear.
- `diffDraft` returns changed paths for basic/nutrition/retail/diy/equivalence.
- `fieldMapRows` includes `name`, `shelfLifeMonths`, `purchase_link`, `equivalenceGroupId`.
- `useSupplementDraft` autosave test with mocked API (optional, using `vi.mock`).

- [ ] **Step 3: Run and confirm failure**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft/supplementDraftState.spec.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement API/types/composable/state**

- API paths match backend; `api` instance unwraps `{code,message,data}`.
- Composable uses a debounced `watch` (800ms) on payload; skips while `loading`; `save` sends `expectedUpdatedAt`; on 409 shows “草稿已被更新，请刷新”.
- `runAi` sends both image URLs from payload.evidence plus productUrl/selectionNote; sets `aiRunning`; replaces draft with response.
- `validate` calls the validate endpoint; stores review.
- `finalize` calls validate first; if blockers/ack missing, does not call finalize; otherwise calls finalize and stores verification.
- `discard` calls DELETE; on success route back to list (emit or callback).

- [ ] **Step 5: Run tests + build**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft/supplementDraftState.spec.ts && npm run build`
Expected: PASS + build succeeds (build may be slow; if `vue-tsc` fails on unrelated baseline, record it).

- [ ] **Step 6: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 草稿前端 API 与状态" \
  admin-web/src/api/supplementDrafts.ts \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/useSupplementDraft.ts \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/supplementDraftState.ts \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/supplementDraftState.spec.ts \
  admin-web/vitest.config.ts \
  admin-web/package.json \
  admin-web/package-lock.json
```

---

### Task 14: Draft list + editor shell + basic/nutrition sections

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftFlow.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftList.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftEditor.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/BasicSection.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/NutritionSection.vue`
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftList.component.spec.ts`

**Interfaces:**
- `SupplementDraftFlow` owns `view: 'list'|'editor'|'review'|'verification'`, `selectedDraftId`; no auto-open.
- `SupplementDraftList` props `drafts`, `loading`; emits `new`, `continue`, `discard`.
- `SupplementDraftEditor` props `draft`, `saving`, `aiRunning`; emits `save`, `run-ai`, `review`, `back`, `discard`.
- Sections use `defineModel` for their sub-object and emit updates.

- [ ] **Step 1: Write failing list component test**

Mount `SupplementDraftList` with `@vue/test-utils` + jsdom and `global.plugins: [ElementPlus]`. Assert empty state, rows, and emitted `continue`/`discard`/`new`.

- [ ] **Step 2: Run and confirm failure**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftList.component.spec.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement flow/list/editor/sections**

- Flow: on mount, load draft list; default list; “新建” creates a draft via API then opens editor; “继续” opens editor; “放弃” confirms then deletes and refreshes.
- Editor: top bar with draft name, save status, “让 AI 起草”, “最终审核”; left nav for 8 sections; right content; bottom “保存并离开”/“放弃草稿”.
- BasicSection fields: name, brand, model, channel, base unit, display unit, physical form, serving size, purchase unit, ratio, price, loss rate, add timing. Show AI/source badges from `draft.aiSnapshot` if available; mark missing fields. Product URL lives in EvidenceSection only (single source).
- NutritionSection: nutrient groups, serving values, per-unit preview, default targets, label text. The default-target cleanup watcher must use `{ deep: true, immediate: true }`.
- Disable “胶囊”/“份” issues: display unit options from `supplementUsageUnitOptions` minus `份`; show “胶囊” option (Task 2 backend accepts).
- “让 AI 起草” disabled unless both `evidence.frontImageUrl` and `evidence.labelImageUrl` are set; tooltip explains.

- [ ] **Step 4: Run component test + typecheck**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft && npx vue-tsc -b`
Expected: PASS; record unrelated baseline errors if any.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 草稿列表与建档编辑页" \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftFlow.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftList.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftEditor.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/BasicSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/NutritionSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftList.component.spec.ts
```

---

### Task 15: Remaining sections + AI diff

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/LabelSection.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/RetailSection.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/DiySection.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/ProcurementSection.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/EquivalenceSection.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/EvidenceSection.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftAiDiffDialog.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftEditor.vue` (replace the placeholder sections with the 6 new components + imports)
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftFlow.vue` (capture before/after around runAi and apply selected diff paths)
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/useSupplementDraft.ts` (markManual/manualFields, reload for 409, save-and-leave dirty check)
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/BasicSection.vue` and `NutritionSection.vue` (mark manual paths on human input only)
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftAiDiffDialog.component.spec.ts`

**Interfaces:**
- Sections use `defineModel` for their sub-objects; read-only badges from `draft.aiSnapshot`.
- `DraftAiDiffDialog` props `before`, `after`, `manualFields`; emits `apply` with selected paths.
- Evidence section handles image upload/paste and “从链接抓取”/“采用主图” (reuse existing upload API and `previewSupplementLink`).
- Equivalence section lists groups (existing API), recommendation button, current group status, members with priorities, “插到最前” shortcut, and “本次一并审核通过” default checked for any selected group.

- [ ] **Step 1: Write failing diff dialog test**

- Shows changed paths; manual fields are labeled “人改，AI 未覆盖”; “采用” emits selected paths; “保留我的” emits empty.

- [ ] **Step 2: Run and confirm failure**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft/DraftAiDiffDialog.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the sections and diff dialog**

- **Manual-field tracking (critical)**: Basic/Nutrition/Retail/DIY/Procurement/Equivalence/Evidence sections must call a composable `markManual(path)` on **human input only** (not on initial load or AI-applied values); `manualFields` is sent on every PATCH. Without this, the backend/AI cannot honor “不覆盖人改” and the diff dialog's manual labels are meaningless.
- **AI-in-flight safety**: disable the form (or show a blocking overlay) while `aiRunning`; capture `before` before calling runAi, and show `DraftAiDiffDialog` after; if the user somehow edits during AI, do not silently overwrite — merge with manual paths and surface the conflict.
- **Save-and-leave**: after `save()`, if `dirty` is still true or a pending autosave exists, stay on the editor and tell the user; do not navigate away with unsaved edits.
- **409 recovery**: show a “重新加载草稿” action (reload from server) alongside the 409 message; do not require a browser refresh.
- RetailSection: switch, shelf life, opened shelf life (days), storage, oil, no-sale reason (visible when off), price preview from existing quote API (optional).
- DiySection: switch, platform/link/image, upload/paste, link fetch, “采用” with image transfer.
- ProcurementSection: procurement switch + read-only purchase summary; no internal procurement SKU hint for supplements (they buy from product links, not internal SKUs).
- EquivalenceSection: group select, recommendation list, group status/members/priority, reapprove checkbox default `true`.
- LabelSection: category, label names (catalog candidates clickable; no dog applicability), tag names, add timing.
- EvidenceSection: front/label images, product URL, selection note, AI reasons/missing list.
- After AI fill, compare old/new payload and show `DraftAiDiffDialog`; apply selected paths to the draft; do not apply manual paths.

- [ ] **Step 4: Run tests + vue-tsc**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft && npx vue-tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 上架/DIY/采购/等价组/证据区块" \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/LabelSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/RetailSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/DiySection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/ProcurementSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/EquivalenceSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/EvidenceSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftAiDiffDialog.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftEditor.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftFlow.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/useSupplementDraft.ts \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/BasicSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/sections/NutritionSection.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftAiDiffDialog.component.spec.ts
```

---

### Task 16: Final review + verification pages

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftReview.vue`
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftVerification.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftFlow.vue` (replace the review/verification placeholder branches with the real pages; destructure `finalizing`/`verification` from the composable)
- Test: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftReview.component.spec.ts`

**Interfaces:**
- `DraftReview` props `review`, `draft`; emits `finalize`, `back`, `update:acknowledged`.
- Displays completeness, blockers, warnings with checkboxes, AI decision log, field mapping table, “确认写入” disabled until blockers empty and all warnings acknowledged.
- Add a **pre-write feature readiness card** derived from the draft (retail/shelf life/liquid; DIY/link/liquid; procurement fields; equivalence group + reapprove consequence; default targets; evidence images) labeled “按草稿意向估算”.
- Add a **post-write verification checklist** card listing the 7 feature checks (RETAIL/RECIPE/DIY/PROCUREMENT/EQUIVALENCE/DUPLICATE/PACKAGING).
- Show AI missing items and labelNames/defaultTargetFields decisions; show the equivalence reapprove consequence (“加入已审核组会打回待审核；取消则留 DRAFT”).
- On finalize 400/409, re-run validate and refresh the review; for duplicate 409 show the existing record if the body has ingredientId; for stale 409 show “重新加载草稿”.
- `DraftVerification` props `verification`; displays fields/features pass/fail and action links; “去原料库/上架清单/配方设计器”.

- [ ] **Step 1: Write failing review test**

Mount `DraftReview` with `@vue/test-utils` + jsdom and `global.plugins: [ElementPlus]`.
- Blockers → button disabled.
- Warnings not acknowledged → disabled; after checking all → enabled; emits `finalize`.
- Decision log shows `recommendCreate` (“AI 建议不建档” if false), retail/DIY/procurement/group reasons.

- [ ] **Step 2: Run and confirm failure**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft/DraftReview.component.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement review/verification**

- Review loads via `useSupplementDraft.validate` on mount; if the draft is dirty or `validatedSignature` no longer matches, re-validate before enabling finalize; show loading/error.
- While `finalize` is pending, show a non-dismissible overlay with the steps (校验 → 写原料 → 写营养 → 写证据/标签 → 归组 → 回读核验); on failure keep the review data, show the error, and re-run validate to refresh blockers/warnings.
- Lock the editor while `validating`/`finalizing`; before entering review, flush/save and refuse if still dirty; if edits happen during validate, revalidate before enabling finalize.
- Use `fieldMapRows` for “字段 → 生产落点”.
- Acknowledge warnings using the backend-provided `ackKey` (fallback to `code` only if absent); call `canFinalize`.
- Verification shows “已写入并核验通过” when `ok`, otherwise “已写入，但以下功能未生效” with per-feature action links; “重新核验” calls reverify; add “再建一条”/“返回草稿列表”.

- [ ] **Step 4: Run tests + vue-tsc**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft && npx vue-tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 最终审核与核验结果页" \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftReview.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftVerification.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/SupplementDraftFlow.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/DraftReview.component.spec.ts
```

---

### Task 17: Flow integration + feature flag

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/supplement/steps/SupplementFlow.vue` (keep old; no behavior change)
- Test: `admin-web/src/views/Ingredients/ai-agent/index.spec.ts` (optional; if the page is hard to mount, test the flag helper instead)
- Create: `admin-web/src/views/Ingredients/ai-agent/supplement/draft/featureFlag.ts`

**Interfaces:**
- `isSupplementDraftFlowEnabled()` reads `import.meta.env.VITE_SUPPLEMENT_DRAFT_FLOW === 'true'`.
- `index.vue` renders `<SupplementDraftFlow v-if="isSupplementDraftFlowEnabled()" />` else `<SupplementFlow />` for the supplement line.
- Update the supplement header copy: remove “写完后点确认可用才会进配方”; say “AI 起草，最后确认写入”。

- [ ] **Step 1: Write failing flag test**

```ts
it('defaults off', () => {
  expect(isSupplementDraftFlowEnabled()).toBe(false);
});
```

(Use `vi.stubEnv` for the enabled case.)

- [ ] **Step 2: Run and confirm failure**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft/featureFlag.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the flag and integration**

- Add `featureFlag.ts`.
- In `index.vue`, import both flows; use the flag in the `v-else-if="line === 'SUPPLEMENT'"` branch.
- Update the header text; keep the old copy for the old flow? Use a conditional text based on the flag.
- Ensure the old `SupplementFlow` remains reachable when the flag is off.
- When the flag is on, do not read the old `supplement-flow-v4` session snapshot; leave the key untouched (no migration).

- [ ] **Step 4: Run tests + build**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/supplement/draft && npm run build`
Expected: PASS + build succeeds.

- [ ] **Step 5: Commit**

```bash
bash scripts/session.sh commit -m "feat(supplement): 草稿流程开关与入口" \
  admin-web/src/views/Ingredients/ai-agent/index.vue \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/featureFlag.ts \
  admin-web/src/views/Ingredients/ai-agent/supplement/draft/featureFlag.spec.ts
```

---

### Task 18: Full verification + manual QA

**Files:**
- Modify: `docs/superpowers/specs/2026-11-21-supplement-draft-finalize-design.md` only if implementation reveals a real spec error (keep decisions in sync).

- [ ] **Step 1: Run backend targeted tests**

```bash
cd backend
npx jest tests/prisma/supplement-creation-draft.schema.spec.ts \
  tests/application/ingredient-creation/supplement-draft-completeness.spec.ts \
  tests/application/ingredient-creation/supplement-draft-profile.spec.ts \
  tests/application/ingredient-creation/supplement-draft-validation.spec.ts \
  tests/application/ingredient-creation/supplement-draft-review.service.spec.ts \
  tests/application/ingredient-creation/supplement-draft.service.spec.ts \
  tests/application/ingredient-creation/supplement-draft-ai.schema.spec.ts \
  tests/application/ingredient-creation/supplement-draft-ai.service.spec.ts \
  tests/application/ingredient-creation/supplement-ingredient.service.spec.ts \
  tests/application/ingredient-creation/supplement-finalize.service.spec.ts \
  tests/application/ingredient-creation/supplement-verification.spec.ts \
  tests/application/ingredient-creation/supplement-verification.service.spec.ts \
  tests/application/supplement-shop/supplement-catalog-issues.spec.ts \
  tests/application/supplement-shop/supplement-catalog.service.spec.ts \
  tests/application/supplement-shop/supplement-unit.util.spec.ts \
  tests/application/supplement-shop/supplement-equivalence.service.spec.ts \
  tests/interfaces/controllers/supplement-draft.controller.spec.ts \
  --runInBand
```

Expected: all PASS.

- [ ] **Step 2: Backend typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS. Do not run `npm run build` (kills local backend).

- [ ] **Step 3: Frontend tests + build**

```bash
cd admin-web
npx vitest run src/views/Ingredients/ai-agent/supplement/draft
npm run build
```

Expected: PASS + build succeeds. If build fails on unrelated baseline, record the exact error; do not hide it.

- [ ] **Step 4: Manual QA (local/staging only)**

Set `VITE_SUPPLEMENT_DRAFT_FLOW=true` for admin-web and `SUPPLEMENT_DRAFT_FLOW=true` for backend. Use local/staging DB with the migration applied. Walk spec §15:

- 草稿列表不自动打开上一张；新建 → 两张图 → AI 起草 → 8 个区块。
- 人改一个字段 → 刷新后还在；重跑 AI → 人改字段不被覆盖。
- 粉剂 0.9 g / 液体 2.5 ml → 证据读回小数；营养基准 PER_1_G/ML。
- 上架=开缺保质期 → 阻断；补后通过；写入后开关真的开。
- 等价组加入已审核组/草稿组 → 默认勾选本次一并审核 → 写入时组 APPROVED；取消 → 保持/ DRAFT，并提示需去分组页提交。
- DIY=开没平台 → 阻断；DIY=开没链接 → 允许写入；制作单/DIY 核验不因缺链接失败。
- 优先级填 0（或点“插到最前”）→ 新成员排第一，原 0 及以后顺延；再写入。
- 采购=开缺价格 → 阻断；补后写入；采购需求能查到。
- 重复建档 → 409 + 已有记录；草稿保留。
- 模拟事务失败 → 无正式记录；草稿还在。
- 写入成功但功能核验失败 → 页面显示“已写入，但功能未生效”。

- [ ] **Step 5: Commit any fixes + final status**

If Step 5 made fixes, commit the exact files listed by `git status --porcelain` (do not use `--all`); otherwise skip the commit.

```bash
git status --porcelain
# 逐个列出本次修复的文件
bash scripts/session.sh commit -m "test(supplement): 草稿流程回归与验收" <本次修复的文件...>
bash scripts/session.sh status
```

Expected: clean worktree; all relevant tests green; no half-applied DB migration in production.

---

## 自检

- 规格覆盖：§4 流程 → Task 5/8/14-17；§5 数据模型 → Task 1/5；§6 AI → Task 7/8；§7 校验 → Task 4/6；§8 写入 → Task 9/10; §9 核验 → Task 3/10/11; §10-11 页面/接口 → Task 12-17; §12 字段矩阵 → Task 2/4/6/10; §13 迁移 → Task 1/9; §14 测试 → 每个任务的测试 + Task 18; §15 验收 → Task 18; §16 决策 → 已写入实现（目录只查名字、等价组默认勾选、旧流程保留）。
- 类型一致性：`SupplementDraftPayload`/`SupplementDraftView`/`SupplementDraftReview`/`SupplementWriteVerification` 在 backend 与 frontend 任务中同名同形；`createInTransaction` 只在 Task 9 定义，Task 10 使用；`evaluateSupplementIssues` 只在 Task 3 定义，Task 6 使用；`buildSupplementProfile` 只在 Task 4 定义，Task 6/10 使用。
- 审查重点的测试归属：粉/液 → Task 2/4/9/18；人改不被覆盖 → Task 8/15；开关缺依赖 → Task 6/8；事务失败 → Task 10/18；功能核验失败 → Task 11/16/18。
- 比例：计划按任务给签名/测试/命令，不写完整组件/服务实现；细节以 spec 的字段矩阵和校验表为准。
