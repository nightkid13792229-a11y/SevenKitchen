# 检索方案：可见汇报 + 候选表多选 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让检索方案卡显示「每库用了哪些词、命中多少条」，候选改成可多选的表格（名称/来源库/状态/覆盖率/入选原因），确认后按勾选记录各写一份营养档案，并允许同状态多份。

**Architecture:** 汇报数据由工具在每次 `searchLibraries` 时写进草稿 `payload.searchReport`，方案提交时汇总，不依赖模型复述；候选行由模型给，服务端只补覆盖率（60 项目录、0 不计）并校验记录存在；确认接口从「单选 recordId」改为 `selectedRecordIds[]`，续跑文案列出全部选中项；`writeNutrition` 允许显式 `preparationState` 并强制「一份档案一个来源」；提交服务删掉「生熟各一份」的校验。

**Tech Stack:** NestJS + Prisma + Jest（后端）；Vue 3 + Element Plus + Vitest（admin-web）；TypeScript。

**Spec:** `docs/superpowers/specs/2026-10-31-search-plan-report-and-multi-select-design.md`

## Global Constraints

- 覆盖率口径：分子只数「有值且 ≠ 0」的字段，分母 = `NUTRITION_FIELD_CATALOG.length`（当前 60），保留一位小数。
- 必需营养素覆盖率（46 项、0 算已填）**不改**，继续给导入与 selfCheck 用。
- 检索不做相关性过滤：不按分数筛、不按分数排序；每库最多返回 100 条，`total` 是截断前的真实数。
- 候选表最多 12 行；同一来源库 + 同一 `profileState` 只能选一条。
- 一份营养档案只能有一个 `sourceRecordId`。
- 档案命名：同状态只有一份 → `原料名（生）`；多份 → `原料名（生 · 来源库）`。
- 前端不展示代码/JSON；文案用业务语言。
- 部署前必须：后端 `npx jest` 通过、`npx tsc -p tsconfig.build.json --noEmit` 通过；admin-web `npm test` 与构建通过。

## Review Focus

- **方案还是旧结构**（没有 `libraryReports` / `selections`）时，方案卡与确认接口不能崩，按空数组处理。
- **同一库同状态勾两条**时确认接口要给出可读的拒绝原因，而不是数据库唯一键 500。
- **草稿里已经有档案**时续跑，新写入必须追加，不能覆盖旧档案。
- **记录全为 0 值**时覆盖率为 0%，不能出现 NaN 或除零。
- **模型给的 recordId 不在候选里**时，确认接口拒绝，不能写进 `selections`。

---

### Task 1: 覆盖率工具（60 项目录，0 不计入）

**Files:**
- Create: `backend/src/domain/ingredient/nutrition-coverage.ts`
- Test: `backend/tests/domain/ingredient/nutrition-coverage.spec.ts`

**Interfaces:**
- Consumes: `NUTRITION_FIELD_CATALOG`（`src/domain/ingredient/nutrition-field-catalog.ts`）
- Produces:
  - `readCatalogFieldValue(profile: unknown, fieldPath: string): number | null`
  - `computeCatalogCoverage(profile: unknown): { filled: number; total: number; percent: number }`

- [ ] **Step 1: 写失败测试**

```ts
import { computeCatalogCoverage } from '../../../src/domain/ingredient/nutrition-coverage';

describe('computeCatalogCoverage', () => {
  it('0 值不算已填', () => {
    const c = computeCatalogCoverage({ macros: { crudeProtein: 11.6, crudeFat: 0, moisture: 84.4 } });
    expect(c.filled).toBe(2); // protein + moisture
    expect(c.percent).toBeGreaterThan(0);
  });

  it('全 0 记录覆盖率为 0，不出现 NaN', () => {
    expect(computeCatalogCoverage({ macros: { crudeProtein: 0 } }).percent).toBe(0);
  });

  it('null / 空对象不报错', () => {
    expect(computeCatalogCoverage(null).percent).toBe(0);
    expect(computeCatalogCoverage({}).filled).toBe(0);
  });

  it('分母是目录字段数', () => {
    const c = computeCatalogCoverage({ macros: { crudeProtein: 10 } });
    expect(c.total).toBe(NUTRITION_FIELD_CATALOG.length);
    expect(c.percent).toBeCloseTo(Math.round((1 / c.total) * 1000) / 10, 1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient/nutrition-coverage.spec.ts`
Expected: FAIL，`Cannot find module ...nutrition-coverage`

- [ ] **Step 3: 实现**

把 `ingredient-creation-tools.service.ts` 里私有的 `readCatalogFieldValue` 原样移到新文件并导出；`computeCatalogCoverage` 按目录逐字段读取，`typeof value === 'number' && value !== 0` 才计数，`percent = Math.round((filled / total) * 1000) / 10`（total 为 0 时返回 0）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient/nutrition-coverage.spec.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient/nutrition-coverage.ts backend/tests/domain/ingredient/nutrition-coverage.spec.ts
git commit -m "feat(ingredient): catalog coverage helper that ignores zero values"
```

---

### Task 2: searchLibraries 不筛不排，并把每轮检索记进草稿

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-candidate.service.ts`（`searchByLibrary`）
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts`（`searchLibraries` handler）
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-tools.search-libraries.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `computeCatalogCoverage`（本任务不需要，可忽略）
- Produces:
  - `searchByLibrary({ library, terms, limit? }): Promise<{ library: string; total: number; hits: Array<{ id: string; name: string; sourceType: string; sourceKey: string }> }>`
  - 草稿 `payload.searchReport: Array<{ library: string; terms: string[]; total: number; at: string }>`

- [ ] **Step 1: 写失败测试**

```ts
it('不按分数过滤：低分记录照样返回', async () => { /* mock prisma 返回「蛋清肠」+「鸡蛋白」，terms=['鸡蛋白']，断言两条都在 hits */ });
it('按名称+id 确定性排序，最多 100 条，total 是截断前数量', async () => { /* 120 条 → hits.length=100, total=120 */ });
it('每次检索向草稿追加一条 searchReport', async () => { /* 连查两次 → payload.searchReport 两条 */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-tools.search-libraries.spec.ts`
Expected: FAIL（`dataType`/`filledFieldCount` 仍存在、或 `searchReport` 未写）

- [ ] **Step 3: 实现**

- `searchByLibrary`：删掉 `MIN_MATCH_SCORE` 过滤与分数排序；`findMany` 只按 `foodName/foodNameEn contains term` 查；按 `foodName`、`id` 升序；取前 100，`total` 为过滤后总数；返回行去掉 `dataType`、`filledFieldCount`。
- 工具 handler：查完后 `draftService.patch(draftId, draft.step, { searchReport: [...(draft.payload.searchReport ?? []), ...groups.map(...)] })`；同一次调用里的每个库各写一条（`at` 用同一时间戳）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-tools.search-libraries.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(ingredient): search libraries without relevance filtering and record each round"
```

---

### Task 3: 方案数据结构 v2

**Files:**
- Modify: `backend/src/domain/ingredient-creation/search-plan.ts`
- Test: `backend/tests/domain/ingredient-creation/search-plan.spec.ts`

**Interfaces:**
- Produces:
  - `SearchPlanLibraryReport { library; terms: string[]; total: number; rounds: number }`
  - `SearchPlanCandidate { recordId; name; sourceType; state; profileState: 'RAW' | 'COOKED' | null; coverage: number; reason }`
  - `SearchPlanSelection { recordId; name; sourceType; state; profileState; coverage }`
  - `SearchPlan.libraryReports: SearchPlanLibraryReport[]`、`candidates: SearchPlanCandidate[]`（≤12）、`selections: SearchPlanSelection[]`
  - `SearchPlanApprovalInput { keywords?; libraries?; selectedRecordIds?: unknown }`
  - `buildPendingSearchPlan(input)` 收 `libraryReports`、`candidates`
  - `approveSearchPlan(plan, input, approver)` 校验 ids ∈ candidates，写 `selections`

- [ ] **Step 1: 写失败测试**

```ts
it('确认时只接受候选表里的 recordId', () => {
  const r = approveSearchPlan(plan, { selectedRecordIds: ['not-in-list'] }, { userId: 'u1' });
  expect(r.ok).toBe(false);
});
it('多选落成 selections，状态与覆盖率照抄候选', () => { /* 选两条 → selections.length=2 */ });
it('旧方案没有 libraryReports / selections 时读出来是空数组', () => {
  expect(readSearchPlan({ status: 'PENDING', keywords: [], libraries: [] })?.libraryReports).toEqual([]);
});
it('候选超过 12 条时只保留前 12 条', () => { /* buildPendingSearchPlan 截断 */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/search-plan.spec.ts`
Expected: FAIL（类型不存在/仍要求 chosenRecordId）

- [ ] **Step 3: 实现**

按 Interfaces 改类型与函数；`readSearchPlan` 对缺失字段补 `[]` 与默认值；`approveSearchPlan` 的 `selectedRecordIds` 必须是数组、非空、全部命中候选；`editedByUser` 在 keywords/libraries/selections 与原方案不同时置 true。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation/search-plan.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(ingredient): search plan v2 with library reports and multiple selections"
```

---

### Task 4: proposeSearchPlan 闸门 + 候选补数

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-tools.search-plan.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `SearchPlanCandidate`、`SearchPlanLibraryReport`；Task 1 的 `computeCatalogCoverage`
- Produces: 工具参数 `candidates: Array<{ recordId, name, state, profileState, reason }>`；`libraryReports` 由服务端生成，不接受模型传值

- [ ] **Step 1: 写失败测试**

```ts
it('没有 searchReport 就交方案 → 拒绝，提示先查库', async () => { /* expect error 含 “searchLibraries” */ });
it('候选记录不存在或停用 → 拒绝', async () => { /* findUnique 返回 null → error */ });
it('服务端用记录补全 sourceType 与 coverage（0 不计入）', async () => { /* 断言 plan.candidates[0].coverage */ });
it('profileState 不是 RAW/COOKED → 拒绝', async () => { /* 传 'DRY' → error */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-tools.search-plan.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- 工具 schema：`candidates` 每项 `{ recordId, name, state, profileState, reason }`，`required` 全含；
- handler 先读草稿 `searchReport`，为空直接 error（原文：`还没有按库检索过：先调用 searchLibraries 查库，再交方案。`）；
- 汇总 `libraryReports`：按库分组，terms 去重，total 取最后一轮，rounds 计数；
- 逐条候选 `findUnique`（ACTIVE）→ 补 `sourceType`（记录真实值）、`coverage`（`computeCatalogCoverage`）、保留模型给的 `state`/`profileState`/`reason`；非法 id 或 `profileState` 非法 → error。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-tools.search-plan.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(ingredient): plan gate requires a library search and enriches candidates"
```

---

### Task 5: 确认接口改多选 + 同库同状态校验

**Files:**
- Modify: `backend/src/interfaces/dto/ingredient-creation/confirm-search-plan.dto.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-search-plan.service.ts`
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-search-plan.service.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `SearchPlan`
- Produces: `POST drafts/:id/search-plan/confirm` 入参 `{ keywords?, libraries?, selectedRecordIds: string[] }`；返回已确认的 `SearchPlan`

- [ ] **Step 1: 写失败测试**

```ts
it('选两条（不同库）→ status APPROVED，selections 两条', async () => {});
it('选 0 条 → BadRequest', async () => {});
it('同一库同状态两条 → BadRequest，文案含“同一来源库、同一状态只能选一条”', async () => {});
it('id 不在候选里 → BadRequest', async () => {});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-search-plan.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

DTO：`selectedRecordIds: string[]`，`@IsArray()` + `@ArrayNotEmpty()` + `@IsString({ each: true })`；服务层在 `approveSearchPlan` 失败时抛 `BadRequestException(approved.error)`（已有）。**同库同状态校验放在 `approveSearchPlan`（Task 3 的领域函数）里**，错误文案固定为 `同一来源库、同一状态只能选一条：{库}`，API 与领域测试共用同一处。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-search-plan.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(ingredient): confirm search plan with multiple record selections"
```

---

### Task 6: writeNutrition 支持显式状态 + 一份档案一个来源

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-tools.write-nutrition.spec.ts`

**Interfaces:**
- Produces: `writeNutrition` 新参数 `preparationState?: 'RAW' | 'COOKED'`（仅新建档案时用）；校验：批量 entries 的 `sourceRecordId` 必须全相同；写入已有档案时必须等于该档案的来源

- [ ] **Step 1: 写失败测试**

```ts
it('新建档案时用显式 state，不再依赖来源推导', async () => { /* 来源推不出 state，传 preparationState='RAW' → 建 RAW 档案 */ });
it('同一批 entries 混两个来源 → 拒绝，文案含“一份档案只能有一个来源”', async () => {});
it('写入已有档案但来源不一致 → 拒绝', async () => {});
it('未传 preparationState 且来源推不出 → 仍按旧逻辑报错', async () => {});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-tools.write-nutrition.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`applyFieldWrite` 在 `profileIndex === profiles.length` 分支优先用显式 state（校验 RAW/COOKED）；批量写入前收集 entries 的 sourceRecordId，集合大小 > 1 直接 error；写入已有档案时若 `sourceRecordId !== profile.sourceRecordId` 直接 error。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-tools.write-nutrition.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(ingredient): one source per profile and explicit state for new profiles"
```

---

### Task 7: 提交允许同状态多份，档案名按需带来源

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`

**Interfaces:**
- Produces: 删除 `seenStates` 校验；`buildNutritionFoodData` 的 `name` 规则：同状态只有一份 → `原料名（生）`，多份 → `原料名（生 · CFCT）`

- [ ] **Step 1: 写失败测试**

```ts
it('同一生熟状态两份档案可以提交，生成两条 nutrition_food', async () => { /* 替换原来的拒绝用例 */ });
it('同状态多份时档案名带来源；单份时不带来源', async () => { /* name 断言 */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

删掉 `seenStates` 相关校验；`buildNutritionFoodData` 增加参数 `stateCounts: Map<PreparationState, number>`，据此决定名称后缀。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(ingredient): allow multiple profiles per state and disambiguate names"
```

---

### Task 8: 方案卡：汇报块 + 候选表多选

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/agentStream.ts`（SearchPlan 类型）
- Modify: `admin-web/src/api/ingredientCreation.ts`（confirm 入参）
- Test: `admin-web/src/views/Ingredients/ai-agent/planCard.spec.ts`（新建）

**Interfaces:**
- Consumes: Task 3 的 `SearchPlan` 字段、Task 5 的 `selectedRecordIds`

- [ ] **Step 1: 写失败测试**

```ts
it('汇报块按库显示词与命中数，0 条也显示', () => {});
it('勾选同库同状态第二条时被禁用', () => {});
it('确认时提交 selectedRecordIds 数组', () => {});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/planCard.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

- `state.pendingPlan` 类型补 `libraryReports`、`candidates[].coverage/profileState/reason`、`selections`；
- 模板：`findings` 段替换为汇报块（每库一行：库名、词标签、`命中 N 条`、`N 轮`）；
- radio 组替换为 `el-table` + `el-checkbox`，列：词条名称/来源库/状态/覆盖率/入选原因；
- 勾选状态用 `selectedRecordIds: ref<string[]>`；禁用规则：同 `sourceType + profileState` 已有选中项；
- 确认调用改为传 `selectedRecordIds`，文案改为“检索方案已确认，请按方案写草稿：每条选中记录各写一份档案，profileIndex 从当前档案数开始”。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/planCard.spec.ts && npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(admin-web): plan card shows search report and multi-select candidate table"
```

---

### Task 9: 草稿档案标签按需带来源

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/draftReview.ts`
- Test: `admin-web/src/views/Ingredients/ai-agent/draftReview.spec.ts`

**Interfaces:**
- Produces: `ProfileGroup.stateLabel` 在同状态多份时变成 `生 · CFCT`

- [ ] **Step 1: 写失败测试**

```ts
it('同状态两份档案时标签带来源', () => { /* 两个 RAW → '生 · CFCT' / '生 · MEXT' */ });
it('同状态只有一份时标签不带来源', () => { /* '生' */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/draftReview.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`buildProfileGroups` 先统计每个 `preparationState` 的档案数；>1 时 `stateLabel = ${base} · ${sourceLabel}`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/draftReview.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git commit -m "feat(admin-web): distinguish same-state profiles by source in labels"
```

---

### Task 10: 提示词与技能清理 + 端到端验证

**Files:**
- Modify: `backend/skills/ingredient-agent/core.md`
- Delete/Modify: `skills/ingredient-agent/SKILL.md`（根目录旧文档，仍写着 searchNames）

**Interfaces:**
- Consumes: 无新接口

- [ ] **Step 1: 写失败测试**

```ts
it('core 技能提到交方案前必须先按库检索', () => { /* body 含 'searchLibraries' 与 'proposeSearchPlan' */ });
it('仓库根旧技能文档不再引用 searchNames', () => { /* 文件不存在或内容不含 searchNames */ });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-skill.files.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`core.md` 的作业顺序补一句“交方案前必须先用 searchLibraries 查过目标库”；删除根目录 `skills/ingredient-agent/SKILL.md`（运行时已不使用，避免误导）。

- [ ] **Step 4: 跑测试确认通过 + 全量自检**

Run:
```bash
cd backend && npx jest && npx tsc -p tsconfig.build.json --noEmit
cd admin-web && npm test && npm run build
```
Expected: 后端只剩既有 3 条历史失败；其余全绿；两端构建通过。

- [ ] **Step 5: 端到端手工验证**

跑一次「添加鸡蛋清」：汇报块每库有词与数字；候选表列齐全；勾两条不同库的生档案；确认后草稿出现两份档案（标签带来源）；提交后正式档案名带来源。

- [ ] **Step 6: 提交**

```bash
git commit -m "docs(ingredient): align skill guidance and clean stale skill doc"
```
