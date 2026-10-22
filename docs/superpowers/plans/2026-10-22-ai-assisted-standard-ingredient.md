# Web 端「AI 辅助添加标准原料」实施计划（阶段一：食材）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在后台原料管理里做出一个六站向导，让管理员从输入食材名字开始，由 AI 给出营养来源候选与缝合方案，人逐步确认，最后一次性建成「标准原料 + 营养档案 + 映射」，且每个数字都能追到来源与换算。

**Architecture:** 后端新增一个 `ingredient-creation` 应用模块和一小组纯函数领域模块（状态归一、生熟清单、缝合、单位校验、终检）；草稿与审计各一张表；提交在一个事务里建三样东西。前端在 `views/Ingredients/creation/` 下做全屏向导，按站拆组件，复用现有营养档案编辑器与原料表单。

**Tech Stack:** NestJS + Prisma + PostgreSQL + Jest（后端）；Vue 3 + Element Plus + Vitest（前端）。

**Spec:** `docs/superpowers/specs/2026-10-22-web-ai-assisted-standard-ingredient-design.md`

## Global Constraints

- 营养档案状态只有两种：`RAW`（生）、`COOKED`（熟）。做法不进入状态字段。
- 找数据时，`BOILED`（水煮）与 `STEAMED`（蒸）可作候选；`GRILLED`（烤）与 `FRIED`（煎）**不得**作候选。
- 缝合**只补缺，不覆盖**主来源；同一字段多源冲突**不自动裁决**。
- 熟的档案**不得**由生的档案推算。
- 提交一律落 `PENDING`（待验证）；变成 `VERIFIED` 必须由人点一下，并记录操作人。
- 终检在服务端执行；前端只展示结果，不得自己判定通过。
- 一切数值换算走确定性代码，且必须能反算回原始值；大模型不参与任何数字计算。
- 草稿数据永不进入配方链路；只有提交后的原料与档案才可能被配方使用。
- 单位只接受营养字段目录里规定的单位；不接受自由文本。
- 数据缺失与「值为 0」是两件事，缺失一律保持 `null`。

## Review Focus

这些是规格没说、但一定会碰到、且出错会伤人的输入。每条在对应任务里都要有测试：

1. 单位写法变体：`μg`、`µg`、`mcg`、`MG`、`mg/kg`——必须归一或拒绝，不能静默当成别的单位。
2. 基准口径不一致：来源按「每份」给，档案要「每 100g」——没有份量克数时不得硬算。
3. 缺失与零混淆：来源没给某营养素，不能填 0；填了 0 会改变配方计算结果。
4. 同名不同物：搜「兔肝」返回「兔肉」时不得静默采用，必须标为易混/低匹配。
5. 来源本身异常：宏量之和 > 100g/100g、能量与 4/9/4 反算差得离谱。

---

## 任务总览

| # | 任务 | 交付物 |
|---|------|--------|
| 1 | 草稿与审计的数据模型、迁移、草稿服务 | 两张表 + `IngredientCreationDraftService` |
| 2 | 状态归一与做法分类 | `preparation-state.ts` + 测试 |
| 3 | 生熟清单默认 | `state-coverage.ts` + 测试 |
| 4 | 本地候选检索 | `IngredientCreationCandidateService` |
| 5 | 缝合方案与证据账本 | `nutrition-merge.ts` + 测试 |
| 6 | 终检规则 | `unit-guard.ts`、`final-check.ts` + 测试 |
| 7 | 提交事务与审计 | `IngredientCreationCommitService` |
| 8 | HTTP 接口与权限 | `ingredient-creation.controller.ts` |
| 9 | 前端：类型、API 客户端、向导骨架与入口 | `views/Ingredients/creation/` |
| 10 | 前端：① 起手 与 ② 营养依据 两站 | `StepIntake.vue`、`StepSources.vue` |
| 11 | 前端：③④⑤⑥ 四站 | 其余 Step 组件 |
| 12 | 确认可用 与 记账查看 | 验证按钮 + 审计抽屉 |
| 13 | 线上白名单兜底检索 | `IngredientCreationOnlineService` |

---

### Task 1: 草稿与审计的数据模型、迁移、草稿服务

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261023090000_ingredient_creation_draft/migration.sql`
- Create: `backend/src/domain/ingredient-creation/preparation-state.ts`（本任务只放类型，Task 2 补函数）
- Create: `backend/src/application/ingredient-creation/ingredient-creation.types.ts`
- Create: `backend/src/application/ingredient-creation/ingredient-creation-draft.service.ts`
- Create: `backend/src/application/ingredient-creation/ingredient-creation.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-draft.service.spec.ts`

**Interfaces:**
- Produces:
  - `type CreationStep = 'INTAKE' | 'SOURCES' | 'PROFILE' | 'CHECK' | 'INGREDIENT' | 'COMMIT'`
  - `interface IngredientCreationDraftPayload { intake?: IntakeCard; candidates?: CandidateRow[]; mergePlan?: MergePlan; evidence?: NutritionEvidenceEntry[]; checks?: FinalCheckResult; ingredient?: IngredientDraft; verify?: { exceptions: ExceptionRecord[] } }`
  - `domain/ingredient-creation/preparation-state.ts` 先只导出 `type PreparationState = 'RAW' | 'COOKED'`（Task 2 在同一文件补全归一与分类函数，不新建文件）。
  - 共享类型（都放在 `ingredient-creation.types.ts`，后续任务直接 import）：
    ```ts
    interface IntakeCard { name: string; nameEn: string | null; aliases: string[]; confusables: string[]; category: 'MEAT_ORGAN' | 'STARCHY_VEGETABLE' | 'OTHER'; requiredStates: PreparationState[]; suggestedStates: PreparationState[] }
    interface NutritionEvidenceEntry { fieldPath: string; finalValue: number | null; unit: string; status: 'DIRECT' | 'CONVERTED' | 'FILLED' | 'MANUAL'; sourceRecordId: string | null; sourceValue: number | null; sourceUnit: string | null; formula: string | null; confirmedBy: string | null; confirmedAt: string | null }
    interface ExceptionRecord { code: string; reason: string; approvedBy: string; approvedAt: string }
    interface IngredientDraft { name: string; type: 'FOOD'; baseUnit: 'G' | 'ML' | 'PCS'; unitDisplayLabel: string; cfctClass: string | null; edibleYieldRate: number | null }
    interface ProfileDraft { preparationState: 'RAW' | 'COOKED'; sourceRecordId: string; entries: NutritionEvidenceEntry[]; notes: string | null }
    ```
  - `class IngredientCreationDraftService`：`create(input: { name: string; type: 'FOOD'; createdBy: string }): Promise<IngredientCreationDraft>`、`get(id: string): Promise<IngredientCreationDraft>`、`patch(id: string, step: CreationStep, payload: Partial<IngredientCreationDraftPayload>): Promise<IngredientCreationDraft>`
  - Prisma 模型 `IngredientCreationDraft`（表 `ingredient_creation_draft`）、`IngredientCreationAudit`（表 `ingredient_creation_audit`）

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/ingredient-creation/ingredient-creation-draft.service.spec.ts
it('create 落一条 INTAKE 草稿，并按 name 原样保存', async () => {
  const draft = await service.create({ name: '鸡肝', type: 'FOOD', createdBy: 'u1' });
  expect(draft.step).toBe('INTAKE');
  expect(draft.name).toBe('鸡肝');
});
it('patch 只合并传入的 payload 片段，不覆盖其它键', async () => {
  await service.patch(draftId, 'SOURCES', { candidates: [row] });
  await service.patch(draftId, 'PROFILE', { intake: card });
  const fresh = await service.get(draftId);
  expect(fresh.payload.candidates).toHaveLength(1);
  expect(fresh.payload.intake).toEqual(card);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-draft.service.spec.ts`
Expected: FAIL，提示 `IngredientCreationDraftService` 不存在。

- [ ] **Step 3: 加 Prisma 模型与迁移**

`ingredient_creation_draft`：`id`、`name`、`type`（`IngredientType`）、`step`（字符串，存 `CreationStep`）、`payload`（`Json`）、`created_by`、`created_at`、`updated_at`；索引 `created_by`、`created_at`。
`ingredient_creation_audit`：`id`、`draft_id`、`ingredient_id`、`nutrition_food_ids`（`String[]`）、`proposals`（`Json`）、`changes`（`Json`）、`committed_by`、`committed_at`；索引 `ingredient_id`。
迁移用 `npx prisma migrate dev --name ingredient_creation_draft` 生成，不要手写 SQL。

- [ ] **Step 4: 实现服务**

`create` 写一条 `step = 'INTAKE'` 的草稿；`patch` 先读后浅合并 `payload` 再写回，使用 `prisma.$transaction` 保证读写一致。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-draft.service.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/application/ingredient-creation backend/tests/application/ingredient-creation
git commit -m "feat(ingredient-creation): draft and audit models with draft service"
```

---

### Task 2: 状态归一与做法分类

**Files:**
- Modify: `backend/src/domain/ingredient-creation/preparation-state.ts`（Task 1 已建，只有类型）
- Test: `backend/tests/domain/ingredient-creation/preparation-state.spec.ts`

**Interfaces:**
- Produces:
  - `type PreparationState = 'RAW' | 'COOKED'`
  - `type CookingMethod = 'BOILED' | 'STEAMED' | 'GRILLED' | 'FRIED' | 'OTHER'`
  - `normalizePreparationState(value: string | null | undefined): PreparationState | null`
  - `classifyCookingMethod(value: string | null | undefined): CookingMethod | null`
  - `isCookedSourceAcceptable(method: CookingMethod | null): boolean` — 只有 `BOILED`、`STEAMED` 返回 `true`

- [ ] **Step 1: 写失败的测试**

```ts
expect(normalizePreparationState('raw')).toBe('RAW');
expect(normalizePreparationState('Cooked')).toBe('COOKED');
expect(normalizePreparationState('')).toBeNull();
expect(classifyCookingMethod('boiled, drained')).toBe('BOILED');
expect(classifyCookingMethod('ゆで')).toBe('STEAMED'); // 日文“茹で”按温和烹饪归蒸/煮
expect(classifyCookingMethod('broiled')).toBe('GRILLED');
expect(classifyCookingMethod('pan-fried')).toBe('FRIED');
expect(isCookedSourceAcceptable('GRILLED')).toBe(false);
expect(isCookedSourceAcceptable(null)).toBe(false);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/preparation-state.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

关键词表覆盖英文（raw／cooked／boiled／steamed／broiled／grilled／fried／roasted）与日文（生／ゆで／蒸し／焼き／揚げ），大小写与全角半角统一后再匹配；匹配不到返回 `null`，不要猜。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation/preparation-state.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient-creation/preparation-state.ts backend/tests/domain/ingredient-creation/preparation-state.spec.ts
git commit -m "feat(ingredient-creation): normalize preparation state and cooking method"
```

---

### Task 3: 生熟清单默认

**Files:**
- Create: `backend/src/domain/ingredient-creation/state-coverage.ts`
- Test: `backend/tests/domain/ingredient-creation/state-coverage.spec.ts`

**Interfaces:**
- Produces:
  - `type CoverageCategory = 'MEAT_ORGAN' | 'STARCHY_VEGETABLE' | 'OTHER'`
  - `resolveStateCoverage(category: CoverageCategory): { required: PreparationState[]; suggested: PreparationState[] }`
    - `MEAT_ORGAN` → required `['RAW']`，suggested `['COOKED']`
    - `STARCHY_VEGETABLE` → required `['COOKED']`，suggested `['RAW']`
    - `OTHER` → 两者皆空
  - `resolveDefaultPrimaryState(category: CoverageCategory): PreparationState` — `MEAT_ORGAN` → `RAW`；`STARCHY_VEGETABLE` → `COOKED`；`OTHER` → `RAW`

- [ ] **Step 1: 写失败的测试**

```ts
expect(resolveStateCoverage('MEAT_ORGAN')).toEqual({ required: ['RAW'], suggested: ['COOKED'] });
expect(resolveStateCoverage('STARCHY_VEGETABLE')).toEqual({ required: ['COOKED'], suggested: ['RAW'] });
expect(resolveStateCoverage('OTHER')).toEqual({ required: [], suggested: [] });
expect(resolveDefaultPrimaryState('STARCHY_VEGETABLE')).toBe('COOKED');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/state-coverage.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

纯映射函数，不做关键词猜测；类别由调用方给（前端在起手页让人选）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation/state-coverage.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient-creation/state-coverage.ts backend/tests/domain/ingredient-creation/state-coverage.spec.ts
git commit -m "feat(ingredient-creation): state coverage defaults by ingredient category"
```

---

### Task 4: 本地候选检索

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-creation-candidate.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-candidate.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `normalizePreparationState`、`classifyCookingMethod`、`isCookedSourceAcceptable`；现有 `backend/src/application/standard-ingredient-import/nutrition-audit.ts` 的覆盖率审计函数；`PrismaService`。
- Produces:
  - `interface CandidateRow { sourceRecordId: string; sourceType: string; foodName: string; foodNameEn: string | null; preparationState: PreparationState | null; cookingMethod: CookingMethod | null; coveragePercent: number; missingFields: string[]; matchScore: number; notes: string[] }`
  - `findCandidates(input: { name: string; nameEn?: string; state: PreparationState }): Promise<CandidateRow[]>` — 结果按 `matchScore` 降序；`COOKED` 查询必须过滤掉 `GRILLED`／`FRIED`，并对 `BOILED`／`STEAMED` 加排序权重。

- [ ] **Step 1: 写失败的测试**

用例（Prisma 用内存假实现或 jest mock，不连库）：

```ts
it('生查询不返回熟词条', ...);
it('熟查询过滤掉烤和煎', ...);          // 返回 broiled／fried 的记录必须不出现
it('水煮与蒸排在其它做法的前面', ...);
it('覆盖率与缺失字段来自 nutrition-audit，不是重算一套', ...);
it('名字只差一个“肉/肝”时给出低匹配标记', ...); // notes 含 'DIFFERENT_PART'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-candidate.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

查询 `nutrition_source_record`（`status = 'ACTIVE'`，来源在允许清单内），复用现有名称匹配与覆盖率函数；把做法分类结果写进 `notes`，不要静默丢弃被过滤的记录（返回 `excludedCount` 供页面显示“另有 3 条因烤/煎被排除”）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-candidate.service.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-creation-candidate.service.ts backend/tests/application/ingredient-creation/ingredient-creation-candidate.service.spec.ts
git commit -m "feat(ingredient-creation): local candidate search with cooking-method policy"
```

---

### Task 5: 缝合方案与证据账本

**Files:**
- Create: `backend/src/domain/ingredient-creation/nutrition-merge.ts`
- Test: `backend/tests/domain/ingredient-creation/nutrition-merge.spec.ts`

**Interfaces:**
- Produces:
  - `interface MergeRow { fieldPath: string; value: number | null; unit: string; status: 'DIRECT' | 'FILLED'; sourceRecordId: string | null; sourceValue: number | null; sourceUnit: string | null }`
  - `interface MergeConflict { fieldPath: string; candidates: Array<{ sourceRecordId: string; value: number; unit: string }> }`
  - `interface MergePlan { primarySourceRecordId: string; rows: MergeRow[]; conflicts: MergeConflict[] }`
  - `buildMergePlan(input: { primary: SourceNutrition; supplementals: SourceNutrition[] }): MergePlan`
  - `applyManualResolution(plan: MergePlan, fieldPath: string, choice: { sourceRecordId: string }): MergePlan`

- [ ] **Step 1: 写失败的测试**

```ts
it('主来源有的字段不被补位来源覆盖', ...);
it('只补主来源缺失的字段', ...);
it('同一字段两边都有且不相等时进入 conflicts，不进 rows 的最终值', ...);
it('缺失保持 null，不被写成 0', ...);
it('人工裁决后该字段记入 rows 且状态为 DIRECT', ...);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/nutrition-merge.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

按营养字段目录（`nutrition-field-catalog.ts`）的字段顺序遍历；两边值的相等判定加容差（相对误差 1e-6），避免浮点误差伪造冲突。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation/nutrition-merge.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient-creation/nutrition-merge.ts backend/tests/domain/ingredient-creation/nutrition-merge.spec.ts
git commit -m "feat(ingredient-creation): merge plan with fill-only and explicit conflicts"
```

---

### Task 6: 终检规则

**Files:**
- Create: `backend/src/domain/ingredient-creation/unit-guard.ts`
- Create: `backend/src/domain/ingredient-creation/final-check.ts`
- Test: `backend/tests/domain/ingredient-creation/unit-guard.spec.ts`
- Test: `backend/tests/domain/ingredient-creation/final-check.spec.ts`

**Interfaces:**
- Consumes: `nutrition-field-catalog.ts` 里每个字段的 `unit` 与 `quantityKind`。
- Produces:
  - `normalizeUnit(raw: string): string | null` — `μg`／`µg`／`mcg` → `µg`；`MG`／`mg` → `mg`；`mg/kg` 这类复合单位返回 `null`
  - `interface CheckItem { code: string; message: string; fieldPath?: string }`
  - `interface FinalCheckResult { blocking: CheckItem[]; exceptionable: CheckItem[]; warnings: CheckItem[] }`
  - `runFinalCheck(input: { entries: NutritionEvidenceEntry[]; coverage: { required: PreparationState[]; present: PreparationState[] }; macroSumG: number; energyKcal: number | null; energyFromMacrosKcal: number | null }): FinalCheckResult`
  - 规则码固定为：`UNIT_NOT_ALLOWED`、`UNIT_MISMATCH`、`CONVERSION_NOT_REVERSIBLE`、`BASIS_NOT_CONVERTIBLE`（blocking）；`MACRO_SUM_OVER_100`、`REQUIRED_STATE_MISSING`（exceptionable）；`ENERGY_CROSS_CHECK_DEVIATION`、`MAGNITUDE_OUTLIER`（warnings）。

- [ ] **Step 1: 写失败的测试**

```ts
expect(normalizeUnit('μg')).toBe('µg');
expect(normalizeUnit('mcg')).toBe('µg');
expect(normalizeUnit('mg/kg')).toBeNull();
it('单位不在目录里 → UNIT_NOT_ALLOWED（blocking）', ...);
it('mg 写进 µg 字段 → UNIT_MISMATCH（blocking）', ...);
it('换算反算不闭合 → CONVERSION_NOT_REVERSIBLE（blocking）', ...);
it('来源按每份给、又没给份量克数 → BASIS_NOT_CONVERTIBLE（blocking）', ...);
it('宏量和 103.2 → MACRO_SUM_OVER_100（exceptionable）', ...);
it('肉缺生档案 → REQUIRED_STATE_MISSING（exceptionable）', ...);
it('能量反算差 12% → ENERGY_CROSS_CHECK_DEVIATION（warning）', ...);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/unit-guard.spec.ts tests/domain/ingredient-creation/final-check.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`unit-guard` 只管单位归一与合法性；`final-check` 只做汇总与分级，不改数据。能量反算用 4/9/4（蛋白 4、脂肪 9、碳水 4），偏差阈值 10%。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation/unit-guard.spec.ts tests/domain/ingredient-creation/final-check.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient-creation/unit-guard.ts backend/src/domain/ingredient-creation/final-check.ts backend/tests/domain/ingredient-creation
git commit -m "feat(ingredient-creation): unit guard and final check grading"
```

---

### Task 7: 提交事务与审计

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 的草稿服务与两张表；`PrismaService`。
- Produces: `commit(input: { draftId: string; userId: string; ingredient: IngredientDraft; profiles: ProfileDraft[]; primaryProfileIndex: number }): Promise<{ ingredientId: string; nutritionFoodIds: string[]; auditId: string }>`
  - 行为：一个 `$transaction` 内创建 `Ingredient`、每个 `ProfileDraft` 建一条 `NutritionFood`（`status: 'PENDING'`）、建 `NutritionFoodMapping`（主档案 `isPrimary = true`），最后写一条 `IngredientCreationAudit`。

- [ ] **Step 1: 写失败的测试**

```ts
it('一次事务里建原料、档案、主映射，档案状态是 PENDING', ...);
it('两份档案时只允许一个 isPrimary', ...);      // 传两个 primary → 抛 BadRequest
it('同名同品牌已存在时抛冲突，且不留下半条数据', ...);
it('审计记录保存提案快照与人工改动', ...);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

查重沿用现有 `Ingredient` 的 `@@unique([name, brand, productModel])`；冲突时抛 `ConflictException`，事务回滚。`NutritionFood.dataSource` 取主来源的 `sourceType`，`externalId` 取 `sourceKey`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts backend/tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts
git commit -m "feat(ingredient-creation): transactional commit with pending profiles and audit"
```

---

### Task 8: HTTP 接口与权限

**Files:**
- Create: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`
- Create: `backend/src/interfaces/dto/ingredient-creation/*.dto.ts`
- Modify: `backend/src/app.module.ts`（注册控制器；本仓库 PrismaService 没有独立模块、也没有 export，不建 feature module）
- Test: `backend/tests/interfaces/controllers/ingredient-creation.controller.spec.ts`

**Interfaces:**
- Produces（均挂在 `@Controller('admin/ingredient-creation')`，用 `AuthGuard` + `AdminGuard`，返回 `ApiResponseDto`）：
  - `POST drafts` → `{ draftId, step }`
  - `GET drafts/:id` → 草稿
  - `PATCH drafts/:id` → 更新站点与 payload
  - `POST drafts/:id/candidates` → `{ candidates, excludedCount, coverage }`
  - `POST drafts/:id/check` → `FinalCheckResult`
  - `POST drafts/:id/commit` → `{ ingredientId, nutritionFoodIds, auditId }`

- [ ] **Step 1: 写失败的测试**

```ts
it('未带令牌访问 drafts → 401', ...);
it('POST drafts 返回 draftId 与 step=INTAKE', ...);
it('commit 缺 ingredient 字段 → 400', ...);
it('check 直接调用服务，不在控制器里重算', ...); // 用 spy 断言调用一次
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/interfaces/controllers/ingredient-creation.controller.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

控制器只做参数校验与转发；DTO 用 `class-validator`，与现有 controller 一致的 `ValidationPipe` 风格。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/interfaces/controllers/ingredient-creation.controller.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/interfaces/controllers/ingredient-creation.controller.ts backend/src/interfaces/dto/ingredient-creation backend/src/app.module.ts
git commit -m "feat(ingredient-creation): admin API for drafts, candidates, check, commit"
```

---

### Task 9: 前端：类型、API 客户端、向导骨架与入口

**Files:**
- Create: `admin-web/src/types/ingredientCreation.ts`
- Create: `admin-web/src/api/ingredientCreation.ts`
- Create: `admin-web/src/views/Ingredients/creation/index.vue`
- Modify: `admin-web/src/router/index.ts`、`admin-web/src/views/Ingredients/index.vue`
- Test: `admin-web/src/views/Ingredients/creation/stepState.spec.ts`

**Interfaces:**
- Consumes: Task 8 的接口。
- Produces:
  - `ingredientCreationApi.createDraft(name)`, `getDraft(id)`, `patchDraft(id, step, payload)`, `findCandidates(id, input)`, `runCheck(id)`, `commit(id, body)`
  - `nextStep(step: CreationStep): CreationStep | null`、`stepIndex(step: CreationStep): number`（向导骨架用它算进度条）
  - 路由 `/ingredients/creation/:draftId?`，`meta.title = 'AI 新建标准原料'`

- [ ] **Step 1: 写失败的测试**

```ts
expect(nextStep('INTAKE')).toBe('SOURCES');
expect(nextStep('COMMIT')).toBeNull();
expect(stepIndex('CHECK')).toBe(3);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/creation/stepState.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

向导壳：顶部六站进度条（当前站高亮、已过站可点回）、内容区渲染当前 Step 组件、底部「上一步／下一步」。进页面无 `draftId` 时先建草稿再跳转。原料列表页在「新增标准原料」旁加「AI 新建」按钮。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/creation/stepState.spec.ts`
Expected: PASS。

- [ ] **Step 5: 构建确认不破**

Run: `cd admin-web && npx vue-tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/types/ingredientCreation.ts admin-web/src/api/ingredientCreation.ts admin-web/src/views/Ingredients/creation admin-web/src/router/index.ts admin-web/src/views/Ingredients/index.vue
git commit -m "feat(admin-web): ingredient creation wizard shell and entry"
```

---

### Task 10: 前端：① 起手 与 ② 营养依据

**Files:**
- Create: `admin-web/src/views/Ingredients/creation/StepIntake.vue`
- Create: `admin-web/src/views/Ingredients/creation/StepSources.vue`
- Test: `admin-web/src/views/Ingredients/creation/formatCoverage.spec.ts`

**Interfaces:**
- Consumes: Task 8 的 `candidates`；Task 3 的生熟清单（后端返回）；Task 9 的 API 客户端。
- Produces: `formatCoverage(percent: number, missing: number): string`（如 `26 / 30 · 缺 4`）与两个可直接挂到向导的组件，`emit('next', payload)`。

- [ ] **Step 1: 写失败的测试**

```ts
expect(formatCoverage(86.7, 4)).toBe('26 / 30 · 缺 4');
expect(formatCoverage(0, 30)).toBe('0 / 30 · 缺 30');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/creation/formatCoverage.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 ① 起手页**

名字输入（必填）、类别选择（肉/内脏、根茎淀粉类蔬菜、其他）、生熟清单复选（按类别预填）、口径卡展示（英文名、易混词、基准口径）。底部「下一步」在名字为空时禁用。

- [ ] **Step 4: 实现 ② 营养依据页**

候选列表（库、词条名、状态、覆盖率、缺项、备注标签）；被排除的烤/煎记录显示成一行「另有 N 条因烤/煎被排除」；选中主来源后展开缝合方案表（字段、来源、原始值→换算、最终值、状态），冲突行标红并要求先裁决才能继续；「到线上找一轮」按钮本期只置灰并提示「即将支持」。

- [ ] **Step 5: 跑测试并构建**

Run: `cd admin-web && npx vitest run src/views/Ingredients/creation/formatCoverage.spec.ts && npx vue-tsc --noEmit`
Expected: 测试通过、无类型错误。

- [ ] **Step 6: 提交**

```bash
git add admin-web/src/views/Ingredients/creation
git commit -m "feat(admin-web): intake and nutrition-source steps"
```

---

### Task 11: 前端：③④⑤⑥ 四站

**Files:**
- Create: `admin-web/src/views/Ingredients/creation/StepProfile.vue`
- Create: `admin-web/src/views/Ingredients/creation/StepCheck.vue`
- Create: `admin-web/src/views/Ingredients/creation/StepIngredient.vue`
- Create: `admin-web/src/views/Ingredients/creation/StepFinish.vue`
- Test: `admin-web/src/views/Ingredients/creation/checkPresentation.spec.ts`

**Interfaces:**
- Consumes: `IngredientNutritionEditor.vue`（`v-model` 编辑营养档案）、`IngredientForm.vue`（只取基础字段块）、Task 8 的 `check` 与 `commit`。
- Produces: `groupCheckItems(result: FinalCheckResult): { blocking, exceptionable, warnings }`（按「拦死／可例外／提醒」分组并排序）与四个 Step 组件。

- [ ] **Step 1: 写失败的测试**

```ts
const grouped = groupCheckItems(result);
expect(grouped.blocking).toHaveLength(2);
expect(grouped.warnings).toHaveLength(1);
expect(grouped.blocking[0].code).toBe('UNIT_NOT_ALLOWED');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/creation/checkPresentation.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 ③ 档案成型**

嵌入现有营养档案编辑器；每个字段右侧显示来源与状态点，点开抽屉展示账本（来源记录、原始值、单位、换算公式、确认人）。顶部在覆盖率不足时显示「营养待补：覆盖率 xx%，缺 xx」。

- [ ] **Step 4: 实现 ④ 终检**

三栏：拦死（红，无「继续」按钮，只能改数据）、可例外（黄，登记理由后放行，记录人）、提醒（灰，可忽略但留痕）。页面不自己判断，全部来自后端 `check`。

- [ ] **Step 5: 实现 ⑤ 原料档案 与 ⑥ 收尾**

⑤ 复用原料表单的基础字段块（名称、类型、基准单位、展示名、CFCT 分类、可食部），拿不准的留空并标「待补」；⑥ 展示待提交摘要（原料、档案份数、主档案、例外清单），点「提交」调用 `commit`，成功后显示原料链接与「待验证」状态说明。

- [ ] **Step 6: 跑测试并构建**

Run: `cd admin-web && npx vitest run src/views/Ingredients/creation/checkPresentation.spec.ts && npx vue-tsc --noEmit && npm run build`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add admin-web/src/views/Ingredients/creation
git commit -m "feat(admin-web): profile, final check, ingredient and finish steps"
```

---

### Task 12: 确认可用 与 记账查看

**Files:**
- Create: `admin-web/src/views/Ingredients/components/IngredientCreationAuditDrawer.vue`
- Modify: `admin-web/src/views/Ingredients/creation/StepFinish.vue`、`admin-web/src/api/ingredients.ts`、`backend/src/interfaces/controllers/nutrition-food.controller.ts`（确认 `PATCH :id/verify` 已有权限守卫）
- Test: `backend/tests/interfaces/controllers/nutrition-food-verify.spec.ts`

**Interfaces:**
- Consumes: 现有 `PATCH /nutrition-foods/:id/verify`。
- Produces: `audit.drawer` props `{ ingredientId: string }`；`GET /admin/ingredient-creation/audits/:ingredientId` 返回提案与改动。

- [ ] **Step 1: 写失败的测试**

```ts
it('verify 由登录管理员调用时把状态改成 VERIFIED 并记录 verifiedBy', ...);
it('未登录调用 verify → 401', ...);
it('audit 接口按 ingredientId 返回一条提交记录，含 proposals 与 changes', ...);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/interfaces/controllers/nutrition-food-verify.spec.ts`
Expected: FAIL（或断言现有实现缺少 `verifiedBy`）。

- [ ] **Step 3: 实现**

⑥ 完成页在「待验证」状态下显示「确认可用」按钮（仅管理员可见），点击后调 `verify`，成功后提示「已可在配方中使用」并刷新状态。原料详情页加「创建记录」入口打开审计抽屉。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/interfaces/controllers/nutrition-food-verify.spec.ts && cd ../admin-web && npx vue-tsc --noEmit`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/interfaces/controllers/nutrition-food.controller.ts backend/tests/interfaces/controllers/nutrition-food-verify.spec.ts admin-web/src/views/Ingredients
git commit -m "feat: manual verify action and creation audit drawer"
```

---

### Task 13: 线上白名单兜底检索

> 本地库真的一个都对不上时才用；在此之前 ② 站的那个按钮保持置灰。

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-creation-online.service.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-candidate.service.ts`、`backend/src/interfaces/controllers/ingredient-creation.controller.ts`、`admin-web/src/views/Ingredients/creation/StepSources.vue`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-online.service.spec.ts`

**Interfaces:**
- Consumes: 现有 `backend/src/application/nutrition-governance/trusted-nutrition-web-search.service.ts`（白名单抓取）。
- Produces: `searchOnline(input: { name: string; nameEn?: string; state: PreparationState }): Promise<{ candidates: CandidateRow[]; attemptedHosts: string[]; rejectedHosts: string[] }>`，候选带 `sourceUrl`、`fetchedAt`、`isOnline: true`。

- [ ] **Step 1: 写失败的测试**

```ts
it('只访问白名单主机，非白名单直接被拒并出现在 rejectedHosts', ...);
it('抓到的候选带 sourceUrl 与 fetchedAt', ...);
it('线上候选的排序永远排在本地候选之后', ...);
it('同一网址第二次查询命中缓存，不重复抓取', ...);
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-online.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

复用现有白名单抓取与解析；抓到的数据落成 `nutrition_source_record`（`dataType` 标注线上来源，`sourceDetail` 存网址与抓取时间），下次直接走本地库。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-online.service.spec.ts`
Expected: PASS。

- [ ] **Step 5: 前端接上按钮**

② 站在「本地零候选」时启用「到线上找一轮」；点击后显示抓取进度与结果；线上候选统一带「线上」标记与原始网址。

- [ ] **Step 6: 提交**

```bash
git add backend/src/application/ingredient-creation backend/tests/application/ingredient-creation admin-web/src/views/Ingredients/creation/StepSources.vue
git commit -m "feat(ingredient-creation): whitelisted online fallback search"
```

---

## 端到端验收（全部任务完成后人工走一遍）

用**鸡肝**（本地库有生/熟词条）走完六站：

- [ ] ① 口径卡确认后进入 ②；
- [ ] ② 选主来源，冲突行必须裁决后才能继续；
- [ ] ③ 任一数字点开能看到来源与换算；
- [ ] ④ 故意把一个值改成错误单位 → 出现拦死项且无「继续」；
- [ ] ④ 造出宏量和 > 100 → 能登记例外并记录操作人；
- [ ] ⑥ 提交成功，原料、档案、主映射齐全，档案为「待验证」；
- [ ] 配方设计器的原料选择器里**看不到**它；
- [ ] 点「确认可用」后，选择器里**看得到**；
- [ ] 原料详情能打开「创建记录」，看到 AI 提案与本次人工改动。

## 不在本计划内（下一个计划）

- CFCT 365 页 OCR 结果入库（沿用现有 `import:cfct-ocr-source`，需要先跑 `audit:cfct-intermediate-library` 复核）。
- 德国 BLS、英国 CoFID、法国 Ciqual、挪威 Matvaretabellen 的导入（每个都要单独的解析器）。
- 本地营养库搬生产（需要生产库连接与备份流程）。
- 阶段二（AI 自主建原料）与补剂向导。
