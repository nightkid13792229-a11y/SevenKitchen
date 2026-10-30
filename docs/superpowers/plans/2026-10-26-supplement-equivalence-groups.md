# 补剂原料等价组（P2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用原料级等价组取代逐食谱替代补剂，让 DIY 制作单按组生成候选，并由后端唯一计算用量、写入订单/交付快照。

**Architecture:** 新增 `SupplementEquivalenceGroup` + 审计表；原料挂一个可空组；后端新增 dosage（纯计算）、equivalence（CRUD/审核）、candidate（组优先解析）三个服务；新版本客户端只提交 `recipeItemId + ingredientId`，用量在 `buildQuote` 中由服务端算；旧客户端路径保持原样。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vue3 + Element Plus、uni-app Vue3、Jest、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-26-supplement-equivalence-groups-design.md`

## Global Constraints

- 数据库只通过 Prisma migration；禁止直接写生产库；迁移只加表/列/索引，不 backfill。
- 所有新行为先写失败测试；测试通过再提交。
- 一个原料最多一个组；只有 `APPROVED + isActive + equivalenceEnabled` 参与替换。
- 顾客侧不提交用量；新路径 `amount` 由服务端算，忽略客户端值。
- 候选必须对食谱行**每一个**目标都有浓度；缺一个即排除。
- 单位只做写法归一，不做系数换算（`μg/ug/mcg` 视为同一；`IU`；`亿CFU` 与 `CFU` 不互换）。
- 自定义成分为 `custom:<规范化名称>`；规范化 = `trim().replace(/\s+/g,'').toLowerCase()`。
- 已审核组被修改 → 自动回 `DRAFT`，清空审核字段。
- 旧客户端（不带 `recipeItemId`）的报价/下单路径**完全不变**。
- 小程序只上传体验版，正式版不动；版本号从 `2026.10.26.27` 起。
- 后端全量测试已知 1 个既有 designer-bridge 失败，不算回归。

## Review Focus

- 一条补剂有多个目标、某候选缺其中一个浓度 → 不得作为候选，也不得静默少补。
- 同一食谱里同一补剂出现 2–3 行（线上真实存在）→ 候选按 `recipeItemId` 分别返回；采购按 `ingredientId` 合并金额，但快照保留每一行的目标/浓度。
- 旧版本小程序不带 `recipeItemId` → 必须走旧路径，不能被新逻辑误判。
- 自定义成分改名/大小写/空格 → 匹配失败必须显式提示（体检/审核），不能静默算 0。
- 粉/片/胶囊混组、`PER_SERVING` 与 `PER_100_G` 混用 → 单位/基准折算错误会直接变成错剂量。
- 组内唯一成员、组未审核、总开关关闭 → 行为必须与今天一致（只显示原原料）。

---

### Task 1: Prisma 模型与迁移

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261026120000_supplement_equivalence_group/migration.sql`

**Interfaces:**
- Produces: models `SupplementEquivalenceGroup`、`SupplementEquivalenceGroupAudit`；`Ingredient.equivalenceGroupId/equivalencePriority/equivalenceGroup`；`DIYSheet.supplementSelections`；`SupplementShopConfig.equivalenceEnabled`；`SupplementOrderItem.recipeItemId/sourceIngredientId/dosageSnapshot`。

- [ ] **Step 1: 改 schema**

按设计文档 4.1/4.2 加 enum、两个 model、五个表的字段与索引。`Ingredient.equivalenceGroup` 关系加 `onDelete: SetNull`；`SupplementOrderItem.dosageSnapshot` 为 `Json?`。

- [ ] **Step 2: 生成迁移 SQL**

Run:
```bash
cd backend
npx prisma migrate dev --name supplement_equivalence_group --create-only
npx prisma migrate dev
npx prisma generate
```
Expected: 新迁移只包含 `CREATE TYPE/TABLE/INDEX`、`ALTER TABLE ... ADD COLUMN`；无 DROP、无数据改写。

- [ ] **Step 3: 验证**

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(supplement): add equivalence group schema"
```

---

### Task 2: 用量解析服务（纯计算）

**Files:**
- Create: `backend/src/application/supplement-shop/supplement-dosage.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-dosage.service.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface SupplementTargetInput {
  fieldPath: string; label?: string; unit: string; targetValuePerKg: number;
}
export interface SupplementDosageResult {
  status: 'OK' | 'NO_TARGETS' | 'MISSING_CONCENTRATION' | 'UNIT_MISMATCH';
  amount: number | null;
  unit: string;
  targets: Array<{ fieldPath: string; label: string; unit: string; targetValuePerKg: number }>;
  concentrations: Array<{ fieldPath: string; value: number; unit: string }>;
  missingFieldPaths: string[];
}
export class SupplementDosageService {
  resolveConcentration(ingredient: any, target: SupplementTargetInput): { value: number; unit: string } | null;
  computeDosage(input: { ingredient: any; targets: SupplementTargetInput[]; totalWeightG: number }): SupplementDosageResult;
}
```
- Consumes: `normalizeNutritionProfile`/`getNutritionProfileFieldValue` from `backend/src/domain/ingredient/nutrition-field-catalog.ts`、`normalizeNutritionProfile` from `nutrition-profile.utils.ts`、`isSupplementUnitOneToOne` from `supplement-unit.util.ts`。

- [ ] **Step 1: 写失败测试**

覆盖：
1. `PER_100_G` 碳酸钙 600mg 钙/1.7g → 浓度 352.94mg/g；目标 2192mg/kg × 3kg → 18.64g。
2. `PER_SERVING` 葡萄糖酸锌 50mg/片，目标 75mg/kg × 2kg → 3 片。
3. 派生 `derived.epaDha`：EPA 500 + DHA 250（PER_SERVING）→ 750mg/粒；目标 1000mg/kg × 1kg → 1.333 粒。
4. 自定义成分 `custom:氨糖`：customItems 名称“氨糖”、500mg/粒 → 目标 1000mg/kg × 1kg → 2 粒。
5. 多目标取 max：钙 2192mg/kg 与磷 1000mg/kg，同一原料两个浓度 → 取较大用量。
6. 缺一个目标浓度 → `MISSING_CONCENTRATION`，`amount: null`。
7. 单位不一致（目标 μg、浓度 mg）→ `UNIT_MISMATCH`。
8. 无目标 → `NO_TARGETS`。
9. `μg/ug/mcg` 视为相同；`亿CFU` 与 `CFU` 不同。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-dosage.service.spec.ts --runInBand`
Expected: FAIL（`Cannot find module ...supplement-dosage.service`）

- [ ] **Step 3: 实现服务**

实现 `resolveConcentration` 的四级来源、basis 折算、单位归一、derived 求和/比值、customItems 规范化匹配；`computeDosage` 按 `max` 取限定用量，不乘损耗。浓度来源顺序与设计文档 5.1 一致。

- [ ] **Step 4: 跑测试确认通过**

Run 同上。Expected: PASS（9 个用例）。

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/supplement-shop/supplement-dosage.service.ts backend/tests/application/supplement-shop/supplement-dosage.service.spec.ts
git commit -m "feat(supplement): add dosage resolver with derived and custom nutrients"
```

---

### Task 3: 等价组服务（CRUD/状态机/成员/审计）

**Files:**
- Create: `backend/src/application/supplement-shop/supplement-equivalence.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-equivalence.service.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface UpsertEquivalenceGroupInput {
  code: string; name: string; nutrientKey: string; nutrientLabel: string; nutrientUnit: string;
  formCategory?: string | null; description?: string | null; rationale?: string | null;
  evidenceUrls?: string[]; sortOrder?: number;
}
export class SupplementEquivalenceService {
  list(query: { status?: string; nutrientKey?: string; keyword?: string; page?: number; pageSize?: number }): Promise<{ items: any[]; total: number }>;
  getById(id: string): Promise<any>;
  create(input: UpsertEquivalenceGroupInput, operator: Operator): Promise<any>;
  update(id: string, input: Partial<UpsertEquivalenceGroupInput>, operator: Operator): Promise<any>;
  changeStatus(id: string, status: SupplementEquivalenceStatus, operator: Operator, reviewNote?: string): Promise<any>;
  addMembers(id: string, ingredientIds: string[], operator: Operator): Promise<any>;
  removeMember(id: string, ingredientId: string, operator: Operator): Promise<any>;
  removeGroup(id: string, operator: Operator): Promise<void>;
  listUngrouped(query: { keyword?: string }): Promise<any[]>;
  assign(ingredientIds: string[], groupId: string, operator: Operator): Promise<{ moved: number; skipped: number }>;
  summary(): Promise<{ total: number; approved: number; pending: number; draft: number; disabled: number; ungrouped: number; singleton: number }>;
}
```
- Consumes: PrismaService、SupplementDosageService、`Operator = { id: string; name?: string | null }`。

- [ ] **Step 1: 写失败测试**

覆盖：
1. 建组写入审计 `CREATE`。
2. `DRAFT → PENDING_REVIEW → APPROVED`；approve 要求 `reviewedBy/reviewedAt`、至少 1 条 evidence、每个成员浓度可算且单位一致。
3. 缺 evidence / 成员浓度缺失 → 400，状态不变。
4. `APPROVED` 组改成员 → 自动回 `DRAFT` 并清空 `reviewedBy/At`。
5. 移除成员、批量归组（从旧组移到新组，两个组都写审计）。
6. 非补剂原料不能归组；一个原料只能一个组。
7. 空组可删；有成员只能停用。
8. `summary` 统计未归组/单成员组。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-equivalence.service.spec.ts --runInBand`

- [ ] **Step 3: 实现服务**

状态机、审核校验、审计写入（事务内）、成员变更回退状态、批量归组。所有写操作返回最新详情。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(supplement): add equivalence group service and audit"
```

---

### Task 4: 候选解析服务

**Files:**
- Create: `backend/src/application/supplement-shop/supplement-candidate.service.ts`
- Test: `backend/tests/application/supplement-shop/supplement-candidate.service.spec.ts`

**Interfaces:**
- Produces:
```ts
export class SupplementCandidateService {
  resolveForRecipe(input: {
    recipeId: string; totalWeightG: number; weightSource: 'DIY_SHEET' | 'QUERY';
    audience: 'CUSTOMER';
  }): Promise<{ totalWeightG: number; weightSource: string; items: SupplementCandidateItem[] }>;
  resolveForRecipeItem(input: {
    recipeItem: any; ingredient: any; totalWeightG: number; audience: 'CUSTOMER';
  }): Promise<SupplementCandidateItem>;
}
```
- Consumes: PrismaService、SupplementDosageService、`SupplementShopConfigService`（读 `equivalenceEnabled`）。

- [ ] **Step 1: 写失败测试**

覆盖：
1. 已审核组 3 成员 → 返回 3 个候选，原原料 `isDefault`，按 priority 排序。
2. 组未审核/停用/总开关关 → `DEFAULT_ONLY`。
3. 组只有 1 成员 → `DEFAULT_ONLY`。
4. 成员 A 缺目标浓度 → A 排除；若原原料被排除且还有可售成员，默认选第一个可售成员。
5. `diyEnabled=false` / `supplementRetailEnabled=false` / `LIQUID` / 单位非 1:1 → 排除并给 `unavailableReason`。
6. 全部不可售 → `candidates: []`、`unavailableReason: '暂时买不到...'`，`defaultIngredient.dosage` 仍有值。
7. 跨组：骨粉组不出现碳酸钙。
8. 同一食谱两条同原料行（不同 recipeItemId）→ 返回两条 item，互不覆盖。
9. 自定义成分组能匹配 customItems。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现服务**

按设计文档 6 的规则；`defaultIngredient.dosage` 始终计算（即使不可售）；候选 `selectable` 与 `unavailableReason` 明确。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(supplement): resolve equivalence candidates"
```

---

### Task 5: 自定义补剂目标

**Files:**
- Modify: `backend/src/application/recipe-designer/supplement-target.service.ts`
- Modify: `admin-web/src/utils/recipeDesigner/supplementTargets.ts`
- Test: `backend/tests/application/recipe-designer/supplement-target.service.spec.ts`
- Test: `admin-web/src/utils/recipeDesigner/supplementTargets.spec.ts`

**Interfaces:**
- Produces: target `fieldPath` 允许 `custom:<规范化名称>`；校验时在该原料 `nutritionProfile.customItems` 找到同名项（值 >0、单位一致）；前端 `listSupplementTargetFieldCandidates(profile)` 追加 customItems。
- 营养评估路径不识别 `custom:*`，保持忽略。

- [ ] **Step 1: 写失败测试**

后端：`custom:氨糖` + customItems `{name:'氨糖', value:500, unit:'mg'}` → 通过；名称不存在 → 400；单位不一致 → 400；`custom:xyz` 在标准目录里不存在也不在 customItems → 400。
前端：profile 含两个 customItems → 候选列表多两项，`fieldPath` 为 `custom:...`，label/unit 正确。

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd backend && npx jest tests/application/recipe-designer/supplement-target.service.spec.ts --runInBand
cd admin-web && npx vitest run src/utils/recipeDesigner/supplementTargets.spec.ts
```

- [ ] **Step 3: 实现**

`findAnyNutritionField` 加 custom 分支；`assertProfileFieldHasValue` 支持 custom；`resolveTargetUnit` 用 custom 项单位；前端候选列表追加 customItems（跳过空名/空单位/非正数）。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(recipe): support custom supplement targets"
```

---

### Task 6: 后台 API 与模块装配

**Files:**
- Create: `backend/src/interfaces/controllers/admin-supplement-equivalence.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/interfaces/admin-supplement-equivalence.controller.spec.ts`（如现有 controller 测试模式不适用，改为 service 级覆盖）

**Interfaces:**
- Produces: 设计文档 7.3 的 10 个端点；`@UseGuards(AuthGuard, StaffGuard)` 在类上，`changeStatus` 用 `@UseGuards(AdminGuard)`。
- Consumes: `SupplementEquivalenceService`。

- [ ] **Step 1: 写失败测试**

覆盖：列表/详情/建组/改状态/加成员/未归组/批量归组/summary 的返回结构；非管理员调 approve 返回 403（用 guard mock）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/interfaces/admin-supplement-equivalence.controller.spec.ts --runInBand`

- [ ] **Step 3: 实现 controller + app.module provider**

- [ ] **Step 4: 跑测试确认通过 + `npx tsc --noEmit`**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(admin): expose supplement equivalence APIs"
```

---

### Task 7: 顾客候选接口

**Files:**
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/src/app.module.ts`（如 controller 依赖需要）
- Test: `backend/tests/interfaces/recipes-supplement-candidates.spec.ts`

**Interfaces:**
- Produces: `GET /api/v1/recipes/:id/supplement-candidates?totalWeightG=&diySheetId=&orderId=&shareToken=`，返回设计文档 6.2；声明在 `@Get(':id')` 之前。
- Consumes: `getAccessibleRecipe`（同 controller 私有方法）、`SupplementCandidateService`、Prisma（读 DIYSheet 总重）。

- [ ] **Step 1: 写失败测试**

覆盖：公开食谱 + `totalWeightG` 返回候选；`diySheetId` 归属不符 404/400；无 `totalWeightG` 且无 `diySheetId` → 400；总开关关 → `DEFAULT_ONLY`；路由不被 `:id` 吃掉。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

批次总重：`packagePlan` 求和 `packageSpecG×packageCount`；为 0 时 `dailyIntakeG×cycleDays`；再不行用 query。`weightSource` 对应返回。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(recipe): add supplement candidate endpoint"
```

---

### Task 8: 报价/下单改为服务端算量 + 快照

**Files:**
- Modify: `backend/src/interfaces/dto/supplement-shop.dto.ts`
- Modify: `backend/src/application/supplement-shop/supplement-order.service.ts`
- Modify: `backend/src/application/supplement-shop/supplement-snapshot.service.ts`
- Modify: `backend/src/infrastructure/prisma.service.ts`（如需要）
- Test: `backend/tests/application/supplement-shop/supplement-order-dosage.spec.ts`
- Test: `backend/tests/application/supplement-shop/supplement-snapshot.service.spec.ts`

**Interfaces:**
- Produces: `SupplementQuoteLineDto.recipeItemId?`、`amount?`、`SupplementQuoteRequestDto.diySheetId?`；`buildQuote` 新路径算量；`SupplementOrderItem.dosageSnapshot`。
- `dosageSnapshot` 结构：`{ totalWeightG, weightSource, lines: Array<{ recipeItemId, sourceIngredientId, selectionSource, group, targets, concentrations, calculatedAmount, submittedAmount, unit }> }`。

- [ ] **Step 1: 写失败测试**

覆盖：
1. 新路径（全部行带 recipeItemId + diySheetId）→ `quote.lines[].requestedAmount` 等于服务端算量，忽略客户端 amount。
2. 旧路径（无 recipeItemId）→ 行为与今天一致，amount 原样使用。
3. 混用 → 400。
4. 缺 diySheetId → 400。
5. 同一 ingredientId 两行 → 采购金额合并，`dosageSnapshot.lines` 保留两条。
6. 下单写入 `recipeItemId/sourceIngredientId/dosageSnapshot`。
7. 快照 `supplementLines` 带 `dosageSnapshot`。
8. 旧客户端带 diySheetId 但不带 recipeItemId → 不改单，仅写诊断字段（若实现）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/supplement-shop/supplement-order-dosage.spec.ts tests/application/supplement-shop/supplement-snapshot.service.spec.ts --runInBand`

- [ ] **Step 3: 实现**

`buildQuote` 开头解析新路径（加载 sheet + recipe + 每行 dosage），产出 `lines` 与 `dosageSnapshots`；旧路径不动。`createOrder` 把 `dosageSnapshot` 写入每个 item；`freezeForOrder` 带上。

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(supplement): server-authoritative dosage for supplement orders"
```

---

### Task 9: 后台等价组页面

**Files:**
- Create: `admin-web/src/api/supplementEquivalence.ts`
- Create: `admin-web/src/views/SupplementShop/EquivalenceGroups.vue`
- Create: `admin-web/src/views/SupplementShop/components/EquivalenceGroupDrawer.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`
- Test: `admin-web/src/views/SupplementShop/equivalenceGroups.spec.ts`

**Interfaces:**
- Consumes: Task 6 API；`SupplementTargetField` 目录（`admin-web/src/constants/ingredientNutrition.ts`）。
- Produces: 列表/详情/未分组/批量归组/审核；纯函数 `buildGroupCode(nutrientKey, formCategory)`、`validateApproval(group)` 供测试。

- [ ] **Step 1: 写失败测试**

纯函数：编码生成、审核校验（无成员/无依据/成员浓度缺失/单位不一致 → 对应错误），状态按钮可见性。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/SupplementShop/equivalenceGroups.spec.ts`

- [ ] **Step 3: 实现页面**

列表列：组名/编码、营养素、形态、状态、成员数、引用食谱数、更新时间、操作。详情抽屉：基本信息、成员、审核、变更记录。未分组页签：勾选 + 批量归组 + 导出 CSV。审核按钮仅管理员可见（用 `authStore`/localStorage 角色；若取不到则按钮可点、后端 403 提示）。

- [ ] **Step 4: 构建**

Run: `cd admin-web && npm run build`
Expected: 成功，无 TS 错误。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(admin): supplement equivalence group page"
```

---

### Task 10: 后台原料档案/体检/开关/食谱表单

**Files:**
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/components/SupplementOptionForm.vue`（如新增补剂时也要选组）
- Modify: `backend/src/application/supplement-shop/supplement-catalog.service.ts` + `admin-web/src/views/SupplementShop/Catalog.vue`
- Modify: `backend/src/application/supplement-shop/supplement-shop-config.service.ts` + `admin-web/src/views/SupplementShop/Config.vue`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Test: `backend/tests/application/supplement-shop/supplement-catalog.service.spec.ts`

**Interfaces:**
- Produces: 体检 code `EQUIVALENCE_UNGROUPED / EQUIVALENCE_GROUP_NOT_APPROVED / EQUIVALENCE_GROUP_SINGLETON / EQUIVALENCE_NUTRIENT_MISSING / EQUIVALENCE_UNIT_MISMATCH`（均 WARN）；配置 `equivalenceEnabled`；原料表单 `equivalenceGroupId`。
- Consumes: Task 3/6 API、`SupplementDosageService`。

- [ ] **Step 1: 写失败测试**

Catalog：未归组/未审核/单成员/缺浓度/单位不一致分别产出对应 WARN；`readyToSell` 不受影响。
Config：`equivalenceEnabled` 默认 false，PATCH 后可读回。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

Catalog 查询 include 组与成员数；issue 计算加 5 项。Config DTO/service/constants 加字段。原料表单加下拉（仅补剂），保存 payload 带 `equivalenceGroupId`。食谱表单“替代补剂”改为只读提示。

- [ ] **Step 4: 跑测试 + 构建**

Run:
```bash
cd backend && npx jest tests/application/supplement-shop/supplement-catalog.service.spec.ts --runInBand
cd admin-web && npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(admin): show equivalence health checks and config switch"
```

---

### Task 11: 小程序候选数据层

**Files:**
- Create: `miniapp/src/pages/diy-sheet/supplement-candidates.ts`
- Test: `miniapp/src/pages/diy-sheet/supplement-candidates.spec.ts`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`（仅 import/类型，不含 UI）

**Interfaces:**
- Produces:
```ts
export interface SupplementCandidateItem { ... } // 与后端 6.2 对齐
export function pickDefaultCandidate(item: SupplementCandidateItem): string | null;
export function buildSupplementRows(items: SupplementCandidateItem[], selections: Record<string, string>): SupplementRow[];
export function buildSupplementPurchaseLines(rows: SupplementRow[]): Array<{ recipeItemId: string; ingredientId: string; name: string; unit: string; specText: string }>;
```
- Consumes: 后端响应；不读 `nutritionProfile`，不再算量。

- [ ] **Step 1: 写失败测试**

覆盖：默认候选规则（原原料可售优先；否则第一个可售；都不可售→原原料+unavailable）；行映射（名称/品牌/形态/用量/单位/可购买）；购买行不含 amount；无候选时 `canSwitch=false`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd miniapp && npx vitest run src/pages/diy-sheet/supplement-candidates.spec.ts`

- [ ] **Step 3: 实现 helper**

- [ ] **Step 4: 跑测试确认通过**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(miniapp): add supplement candidate data helpers"
```

---

### Task 12: 小程序 DIY 制作单接入服务端候选

**Files:**
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/utils/api.ts`（如需要）
- Test: `miniapp/src/pages/diy-sheet/diySupplement.regression.spec.ts`（页面级轻量回归；若页面测试成本过高，用 helper 覆盖 + 构建）

**Interfaces:**
- Consumes: Task 7 endpoint、Task 11 helpers、`DIYSheet.supplementSelections`。
- Produces: 补剂表使用服务端行；选择写入 `selectedSupplementMap`；保存 payload `supplementSelections`；购买草稿行带 `recipeItemId`。

- [ ] **Step 1: 写失败测试**

页面/helper：加载后调用候选接口；选择 B 后行显示 B 的服务端用量；购买草稿带 `recipeItemId + B.ingredientId` 且无 `amount`；重新进入页面从最新制作单恢复选择。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

- 把 `supplementItemsDetailed` 改为基于 `supplementCandidateItems`（服务端）；
- `loadData` 顺序：recipe/price → autoSave（拿 id）→ candidates；
- 候选接口失败：降级到原原料 + “补剂信息暂时获取失败”，不阻塞制作单；
- 选择弹窗：候选项带形态/单位/服务端用量；0/1/N 三态；
- `supplementSelections` 随 `autoSaveDiySheet` 保存；加载时从 `GET /user/diy-sheets` 找最新同食谱+同狗、未冻结的单恢复；
- 购买草稿：`recipeItemId + ingredientId` + 展示字段，不带 amount；
- 打印/采购清单用新行。

- [ ] **Step 4: 跑测试 + 构建**

Run:
```bash
cd miniapp && npx vitest run
cd miniapp && npm run build:mp-weixin
```
Expected: 测试全绿；构建成功。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(miniapp): use server-resolved supplement candidates in DIY sheet"
```

---

### Task 13: 小程序补剂下单页改新协议

**Files:**
- Modify: `miniapp/src/pages/supplement-order/index.vue`
- Modify: `miniapp/src/utils/supplement-purchase-draft.ts`（如存在）
- Test: `miniapp/src/pages/supplement-order/*.spec.ts`

**Interfaces:**
- Consumes: 报价接口新增 `diySheetId`；行带 `recipeItemId`。
- Produces: 报价请求带 `diySheetId`；显示报价返回的 `requestedAmount`；下单请求带 `diySheetId`。

- [ ] **Step 1: 写失败测试**

草稿 → 报价请求：行包含 `recipeItemId/ingredientId`，无 `amount`；顶层带 `diySheetId`；显示用 `quote.lines[].requestedAmount`。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测试 + 构建**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(miniapp): send supplement selection instead of dosage"
```

---

### Task 14: 全量测试与部署

- [ ] **Step 1: 后端全量**

Run: `cd backend && npx jest --runInBand`
Expected: 仅既有 designer-bridge 1 个失败；新增用例全绿。

- [ ] **Step 2: 小程序全量**

Run: `cd miniapp && npx vitest run`
Expected: 全绿。

- [ ] **Step 3: 后台构建**

Run: `cd admin-web && npm run build`
Expected: 成功。

- [ ] **Step 4: 合并 main 并推送**

```bash
git fetch origin
git switch main
git merge --ff-only feat/supplement-equivalence  # 或按仓库惯例 merge
git push origin main
```
（若 main 有他人提交，先 rebase；不 force push。）

- [ ] **Step 5: 部署后端/后台**

Run:
```bash
bash backend/scripts/remote_deploy_v2.sh
bash deploy-admin-web.sh
```

- [ ] **Step 6: 上传体验版**

Run:
```bash
cd miniapp
npm run build:mp-weixin
/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload \
  --project "$(pwd)" --version "2026.10.26.27" \
  --desc "补剂等价组：候选与用量由服务端计算" --lang zh
```
Expected: `✔ upload`。

---

### Task 15: 归组、审核与验收

- [ ] **Step 1: 从线上只读导出 35 种补剂原料**（名称/品牌/规格/形态/单位/可售/被食谱使用数），写入 `docs/design/supplement-equivalence-groups.md` 的数据表。
- [ ] **Step 2: 起草分组**：按“营养素 × 形态/来源”给 35 种全部归组，单成员组也建；逐组写依据（NRC/FEDIAF/AAFCO/EFSA/同行评审/兽医营养教材），附可点开出处。
- [ ] **Step 3: 管理员审核**：逐组确认/改成员/拆合；后台点“通过”，填审核人+日期+依据。
- [ ] **Step 4: 打开总开关**，按设计文档 14.1 的 8 条验收。
- [ ] **Step 5: 记录验收结果**（哪些组已通过、哪些单成员、哪些待补浓度）。

---

### Task 16: 删除旧机制（验收通过后）

**Files:**
- Create: `backend/prisma/migrations/20261027_drop_recipe_supplement_alternative/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/application/custom-recipe/custom-recipe-delivery.service.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/application/ingredient/ingredient-batch-replace.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Modify: `miniapp/src/pages/diy-sheet/supplement-alternatives.ts` + spec（删除旧候选函数）

- [ ] **Step 1: 线上只读确认 0 条**

Run（只读）:
```bash
ssh <deploy-host> "sudo -u postgres psql -d sevenkitchen -tAc 'select count(*) from recipe_supplement_alternative'"
```
Expected: `0`。非 0 则停止，先迁移。

- [ ] **Step 2: 删表 migration + 删代码引用**

- [ ] **Step 3: 全量测试/构建**

- [ ] **Step 4: 部署后端/后台；上传体验版 `2026.10.26.28`**

- [ ] **Step 5: 回归**：食谱详情/设计器/交付/批量替换不再依赖旧表；旧版小程序仍正常（字段缺失只会少候选）。
