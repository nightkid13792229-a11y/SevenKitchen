# 食谱 AI Agent · P0a 工具层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不接数据库、不接模型的前提下，把七类映射和 18 个 Agent 工具做成可用内存端口直接驱动、单测覆盖的纯工具层。

**Architecture:** 端口/适配器。工具只依赖 `RecipeAgentDraftPort`（读写草稿）和 `RecipeAgentControlPort`（问人/申请例外/交付）；P0a 用内存假端口测试，P0b 再接 Prisma 和现有 `RecipeDesignerService`。

**Tech Stack:** TypeScript、NestJS（只用到少量常量/异常类型）、Jest。

**Spec:** `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`

## Global Constraints

- 只改 `backend/`；本计划不碰 `admin-web/`、不碰小程序。
- 本计划**不写数据库、不调模型**：只新增纯 TypeScript 文件与测试；Prisma、适配器、DeepSeek 客户端在 P0b。
- 不新增 npm 依赖。
- 工具名一律 snake_case；错误码英文大写；给人看的话用中文。
- 七类：`PROTEIN / ORGAN / CARB / VEGETABLE / MUSHROOM / NUTS / OIL`；可选类：`FRUIT / DAIRY / EGG / LEGUME / SEASONING / SUPPLEMENT / UNCLASSIFIED`。
- 南瓜算蔬菜；蛋/乳不算主蛋白；鱼油算油脂；补剂不参与七类。
- 内脏判定只在畜/禽/水产类里生效，并排除香肠/腊肠/火腿肠。
- 20% 余量：`MARGIN_RATIO = 0.2`；下限 `value >= min * 1.2`，上限 `value <= max * 0.8`；同时有上下限时取离得近的一边；**正好 20% 算通过**。
- 文案长度用 `RECIPE_PRESENTATION_LIMITS`（封面标题 20、卖点 200、描述 4000）；禁用词用 `recipe-copywriting-compliance.ts` 的 `assertCopywritingCompliant`。
- 健康标签白名单由注入的 `HealthTagPolicy` 决定；v1 只允许“低脂 / 易消化 / 单一动物蛋白”。
- 测试命令：`cd backend && npx jest tests/<path>.spec.ts --runInBand`。
- 每个任务结束提交一次。

## Review Focus

这些是规格里没写死、但最容易被真实输入咬到的地方；每个都在对应任务的测试里钉住：

1. 克数为 0、负数、NaN → 工具拒绝，草稿不变。
2. 评估版本落后于草稿 → `check_ready` 必须 BLOCKED，不能拿旧结果交付。
3. 评估出现 `MISSING_DATA` → 当作未达标，不能算 PASS。
4. 内脏词表误伤：心里美萝卜、猪肚菇、香肠 → 不能判成内脏。
5. 文案命中禁用词、或挂了非白名单标签 → `set_copy` 拒绝。
6. 缺类是“有意”还是“忘了” → 只有 `confirmedOmissions` 里的才算有意。
7. 20% 余量边界：正好 20% 算通过；19.9% 是警告。
8. 没有蛋白或多种蛋白 → 主蛋白判定不能崩；`check_catalog_conflicts` 返回空证据而不是抛错。

---

### Task 1: 七类映射

**Files:**
- Create: `backend/src/domain/recipe-designer/food-category-map.ts`
- Test: `backend/tests/domain/recipe-designer/food-category-map.spec.ts`

**Interfaces:**
- Produces:
  - `REQUIRED_FOOD_CATEGORIES: readonly ['PROTEIN','ORGAN','CARB','VEGETABLE','MUSHROOM','NUTS','OIL']`
  - `type RequiredFoodCategory = (typeof REQUIRED_FOOD_CATEGORIES)[number]`
  - `type OptionalFoodCategory = 'FRUIT'|'DAIRY'|'EGG'|'LEGUME'|'SEASONING'|'SUPPLEMENT'|'UNCLASSIFIED'`
  - `type FoodCategory = RequiredFoodCategory | OptionalFoodCategory`
  - `classifyFoodCategory(input: FoodCategoryInput): FoodCategory`
  - `summarizeFoodCategoryCoverage(items: Array<{ category: FoodCategory }>): FoodCategoryCoverage`
  - `interface FoodCategoryInput { name: string; cfctClass?: string | null; nutritionCategory?: string | null; ingredientType: 'FOOD' | 'SUPPLEMENT' }`
  - `interface FoodCategoryCoverage { covered: RequiredFoodCategory[]; missing: RequiredFoodCategory[]; optionalPresent: OptionalFoodCategory[]; supplementCount: number; unclassifiedCount: number }`

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/domain/recipe-designer/food-category-map.spec.ts
import {
  classifyFoodCategory,
  summarizeFoodCategoryCoverage,
  type FoodCategoryInput,
} from 'src/domain/recipe-designer/food-category-map';

function food(name: string, cfctClass: string, nutritionCategory = 'OTHER'): FoodCategoryInput {
  return { name, cfctClass, nutritionCategory, ingredientType: 'FOOD' };
}

describe('classifyFoodCategory', () => {
  it('南瓜按 CFCT 归蔬菜', () => {
    expect(classifyFoodCategory(food('南瓜', '蔬菜类及制品', 'VEGETABLE'))).toBe('VEGETABLE');
  });

  it('鸭胗按业务口径归内脏', () => {
    expect(classifyFoodCategory(food('鸭胗', '禽肉类及制品', 'MEAT'))).toBe('ORGAN');
  });

  it('心里美萝卜不被“心”误判成内脏', () => {
    expect(classifyFoodCategory(food('心里美萝卜', '蔬菜类及制品', 'VEGETABLE'))).toBe('VEGETABLE');
  });

  it('猪肚菇不被“肚”误判成内脏', () => {
    expect(classifyFoodCategory(food('猪肚菇', '菌藻类', 'OTHER'))).toBe('MUSHROOM');
  });

  it('香肠不被“肠”误判成内脏', () => {
    expect(classifyFoodCategory(food('香肠', '畜肉类及制品', 'MEAT'))).toBe('PROTEIN');
  });

  it('鱼油归油脂，不归蛋白', () => {
    expect(classifyFoodCategory(food('鱼油', '油脂类', 'OIL'))).toBe('OIL');
  });

  it('鸡蛋归蛋，不归主蛋白', () => {
    expect(classifyFoodCategory(food('鸡蛋', '蛋类及制品', 'EGG'))).toBe('EGG');
  });

  it('补剂优先归补剂', () => {
    expect(
      classifyFoodCategory({ name: '肝精粉', cfctClass: '畜肉类及制品', nutritionCategory: 'ORGAN', ingredientType: 'SUPPLEMENT' }),
    ).toBe('SUPPLEMENT');
  });

  it('未知分类归未归类', () => {
    expect(classifyFoodCategory({ name: '神秘粉', cfctClass: null, nutritionCategory: null, ingredientType: 'FOOD' })).toBe('UNCLASSIFIED');
  });
});

describe('summarizeFoodCategoryCoverage', () => {
  it('七类齐全，可选类与补剂单独计数', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'PROTEIN' }, { category: 'ORGAN' }, { category: 'CARB' },
      { category: 'VEGETABLE' }, { category: 'MUSHROOM' }, { category: 'NUTS' },
      { category: 'OIL' }, { category: 'FRUIT' }, { category: 'SUPPLEMENT' },
      { category: 'UNCLASSIFIED' },
    ]);
    expect(coverage.covered).toEqual(['PROTEIN', 'ORGAN', 'CARB', 'VEGETABLE', 'MUSHROOM', 'NUTS', 'OIL']);
    expect(coverage.missing).toEqual([]);
    expect(coverage.optionalPresent).toEqual(['FRUIT']);
    expect(coverage.supplementCount).toBe(1);
    expect(coverage.unclassifiedCount).toBe(1);
  });

  it('缺菌藻时 missing 只报菌藻', () => {
    const coverage = summarizeFoodCategoryCoverage([
      { category: 'PROTEIN' }, { category: 'ORGAN' }, { category: 'CARB' },
      { category: 'VEGETABLE' }, { category: 'NUTS' }, { category: 'OIL' },
    ]);
    expect(coverage.missing).toEqual(['MUSHROOM']);
  });
});
```

评审补充用例（同一任务内，和上面的测试一起写）：

- 牛肝：`cfctClass: null` + `nutritionCategory: 'ORGAN'` → `ORGAN`；
- 神秘粉：`cfctClass: '其他'` → `UNCLASSIFIED`；
- 腰果：`cfctClass: '坚果种子类'` → `NUTS`；
- 火腿肠 / 红肠：→ `PROTEIN`；
- 覆盖率：`DAIRY` + `SEASONING` 同时存在时 `optionalPresent` 为 `['DAIRY','SEASONING']`；两个补剂时 `supplementCount` 为 2。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/domain/recipe-designer/food-category-map.spec.ts --runInBand`
Expected: FAIL，`Cannot find module 'src/domain/recipe-designer/food-category-map'`。

- [ ] **Step 3: 实现映射**

实现 `classifyFoodCategory` 时按这个顺序：

1. `ingredientType === 'SUPPLEMENT'` → `SUPPLEMENT`（最优先）。
2. 内脏：`nutritionCategory === 'ORGAN'`；或 `cfctClass` 属于 `['畜肉类及制品','禽肉类及制品','水产类']` **且** 名称命中 `['肝','心','胗','肾','肚','肠','肺','脾','脑','胰','腺','腰']` **且** 名称不含 `['香肠','腊肠','火腿肠','红肠','脆皮肠','鸡肉肠','鱼肠']`。
3. 按 `cfctClass` 映射（用 `Map` 或 `Object.hasOwn` 查表，避免 `toString`/`__proto__` 命中原型）：畜肉/禽肉/水产 → `PROTEIN`；谷类/薯类 → `CARB`；蔬菜 → `VEGETABLE`；菌藻 → `MUSHROOM`；坚果种子 → `NUTS`；油脂 → `OIL`；水果 → `FRUIT`；乳类 → `DAIRY`；蛋类 → `EGG`；干豆 → `LEGUME`；调味品 → `SEASONING`；其余/空 → `UNCLASSIFIED`。

`summarizeFoodCategoryCoverage` 按 `REQUIRED_FOOD_CATEGORIES` 顺序输出 `covered` / `missing`；可选类只收集出现过的；补剂与未归类只计数。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/domain/recipe-designer/food-category-map.spec.ts --runInBand`
Expected: PASS（11 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/recipe-designer/food-category-map.ts backend/tests/domain/recipe-designer/food-category-map.spec.ts
git commit -m "feat(recipe-agent): add seven-category food mapping"
```

---

### Task 2: 端口 + 只读工具

**Files:**
- Create: `backend/src/application/recipe-designer/agent/agent-types.ts`
- Create: `backend/src/application/recipe-designer/agent/recipe-agent.port.ts`
- Create: `backend/src/application/recipe-designer/agent/read-tools.ts`
- Create: `backend/tests/helpers/fake-recipe-agent-port.ts`
- Test: `backend/tests/application/recipe-designer/agent/read-tools.spec.ts`

**Interfaces:**
- Produces `AgentDraftItem`、`AgentDraftSnapshot`、`AgentAssessmentView`、`AgentIngredientCandidate`、`AgentIngredientDetail`、`AgentCatalogUsage`、`AgentProductionStep`、`AgentCopyPatch`、`AgentToolResult<T>`、`AgentToolErrorCode`。
- Produces `RecipeAgentDraftPort`：
  - `getDraft(draftId: string): Promise<AgentDraftSnapshot>`
  - `searchIngredients(input: { search?: string; category?: FoodCategory; type?: 'FOOD' | 'SUPPLEMENT'; limit?: number }): Promise<AgentIngredientCandidate[]>`
  - `getIngredient(input: { nutritionFoodId: string }): Promise<AgentIngredientDetail | null>`
  - `getCatalogUsage(input: { mainProteinName?: string; ingredientNames?: string[] }): Promise<AgentCatalogUsage>`
  - `addItem(draftId: string, input: { nutritionFoodId: string; ingredientId?: string; weightG: number; preparationMethod?: string }): Promise<AgentDraftItem>`
  - `replaceItem(itemId: string, input: { nutritionFoodId: string; ingredientId?: string; weightG: number }): Promise<AgentDraftItem>`
  - `updateWeight(itemId: string, weightG: number): Promise<AgentDraftItem>`
  - `removeItem(itemId: string): Promise<void>`
  - `setPreparation(itemId: string, input: { method: string; note?: string | null }): Promise<AgentDraftItem>`
  - `setCopy(draftId: string, patch: AgentCopyPatch): Promise<void>`
  - `setProductionSteps(draftId: string, steps: AgentProductionStep[]): Promise<void>`
  - `runAssessment(draftId: string): Promise<AgentAssessmentView>`
- Produces `createReadTools(port, draftId)`，返回：
  - `get_draft(): Promise<AgentToolResult<AgentDraftSnapshot>>`
  - `search_ingredients(args): Promise<AgentToolResult<AgentIngredientCandidate[]>>`
  - `get_ingredient(args): Promise<AgentToolResult<AgentIngredientDetail>>`
  - `get_catalog_usage(args): Promise<AgentToolResult<AgentCatalogUsage>>`

关键类型（写进 `agent-types.ts`，后续任务复用）：

```ts
import type { FoodCategory } from '../../../domain/recipe-designer/food-category-map';

export interface AgentDraftItem {
  id: string;
  ingredientId: string | null;
  nutritionFoodId: string;
  name: string;
  cfctClass: string | null;
  nutritionCategory: string | null;
  category: FoodCategory;
  weightG: number;
  ratioPercent: number | null;
  preparationMethod: string | null;
  preparationNote: string | null;
}

export interface AgentAssessmentEntry {
  key: string;
  label: string;
  status: 'COMPLIANT' | 'DEFICIENT' | 'EXCESS' | 'MISSING_DATA' | 'INFO';
  value: number | null;
  min: number | null;
  max: number | null;
  marginPercent: number | null;
}

export interface AgentAssessmentView {
  contentRevision: number;
  compliant: number;
  deficient: number;
  excess: number;
  missingData: number;
  entries: AgentAssessmentEntry[];
}

export interface AgentDraftSnapshot {
  draftId: string;
  seriesId: string | null;
  name: string;
  scenario: string;
  contentRevision: number;
  totalWeightG: number;
  items: AgentDraftItem[];
  copy: {
    coverTitle: string | null;
    sellingPoint: string | null;
    description: string | null;
    targetHealthTags: string[];
  };
  productionSteps: AgentProductionStep[];
  lastAssessment: AgentAssessmentView | null;
}

export interface AgentCopyPatch {
  name?: string;
  coverTitle?: string;
  sellingPoint?: string;
  description?: string;
  targetHealthTags?: string[];
}

export interface AgentProductionStep {
  sortOrder: number;
  instruction: string;
  duration?: string | null;
  temperature?: string | null;
  equipment?: string | null;
}

export interface AgentIngredientCandidate {
  ingredientId: string;
  nutritionFoodId: string;
  name: string;
  nutritionProfileName: string;
  type: 'FOOD' | 'SUPPLEMENT';
  cfctClass: string | null;
  nutritionCategory: string | null;
  verified: boolean;
}

export interface AgentIngredientDetail extends AgentIngredientCandidate {
  nutritionSummary: Record<string, number | null>;
  allergenNames: string[];
  preparationMethods: string[];
}

export interface AgentCatalogUsageRecipe {
  recipeId: string;
  name: string;
  mainProteinName: string | null;
  overlappingCategories: FoodCategory[];
  overlappingIngredientNames: string[];
}

export interface AgentCatalogUsage {
  totalPublishedRecipes: number;
  mainProteinCount: number;
  recipes: AgentCatalogUsageRecipe[];
}

export type AgentToolErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_WEIGHT'
  | 'INGREDIENT_NOT_FOUND'
  | 'DRAFT_EMPTY'
  | 'COPY_FORBIDDEN_CLAIM'
  | 'TAG_NOT_ALLOWED'
  | 'ASSESSMENT_STALE'
  | 'READY_BLOCKED'
  | 'CONTROL_NOT_AVAILABLE';

export type AgentToolResult<T> =
  | { ok: true; data: T; summary: string; stale?: string[] }
  | { ok: false; error: { code: AgentToolErrorCode; message: string } };

export interface HealthTagPolicy {
  isAllowedTag(name: string): boolean;
}
```

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/read-tools.spec.ts
import { createReadTools } from 'src/application/recipe-designer/agent/read-tools';
import { createFakeRecipeAgentPort } from '../../../helpers/fake-recipe-agent-port';

describe('read tools', () => {
  it('get_draft 返回草稿并带人话摘要', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.get_draft();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totalWeightG).toBe(900);
    expect(result.data.items).toHaveLength(7);
    expect(result.summary).toContain('7 种原料');
  });

  it('search_ingredients 把条件传给端口，无结果也返回 ok', async () => {
    const port = createFakeRecipeAgentPort({ searchResults: [] });
    const tools = createReadTools(port, 'draft-1');
    const result = await tools.search_ingredients({ category: 'MUSHROOM', limit: 10 });
    expect(port.searchIngredients).toHaveBeenCalledWith({ category: 'MUSHROOM', limit: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
    expect(result.summary).toContain('没有找到');
  });

  it('search_ingredients 拒绝空条件', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const result = await tools.search_ingredients({});
    expect(result).toEqual({ ok: false, error: { code: 'INVALID_ARGUMENT', message: expect.stringContaining('至少给一个条件') } });
  });

  it('get_ingredient 找不到返回 INGREDIENT_NOT_FOUND', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort({ ingredientDetail: null }), 'draft-1');
    const result = await tools.get_ingredient({ nutritionFoodId: 'missing' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INGREDIENT_NOT_FOUND');
  });

  it('get_catalog_usage 至少要有主蛋白或原料名', async () => {
    const tools = createReadTools(createFakeRecipeAgentPort(), 'draft-1');
    const result = await tools.get_catalog_usage({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });
});
```

`tests/helpers/fake-recipe-agent-port.ts` 提供：

- `fakeDraftSnapshot(overrides?: Partial<AgentDraftSnapshot>): AgentDraftSnapshot`
- `fakeAssessment(overrides?: Partial<AgentAssessmentView>): AgentAssessmentView`
- `createFakeRecipeAgentPort(overrides?: { draft?: AgentDraftSnapshot; assessment?: AgentAssessmentView | null; searchResults?: AgentIngredientCandidate[]; ingredientDetail?: AgentIngredientDetail | null; catalogUsage?: AgentCatalogUsage })`

每个端口方法都是 `jest.fn()`。默认返回 `fakeDraftSnapshot()`（7 条原料、900g、contentRevision 4；每条原料都有 `preparationMethod`；copy 四个字段都有值；3 步制作步骤）与 `fakeAssessment()`（34/34，entries 三条余量 32% / 25% / 21%，都 ≥ 20%）。测试要警告时单独覆盖成 19.9%。`getDraft` 返回的 `lastAssessment` 用传入的 `assessment` 覆盖（没传就是默认 `fakeAssessment()`，显式 `null` 表示还没跑）。`addItem` 要真的把 item 追加到内存草稿并让 `contentRevision + 1`；`runAssessment` 返回与当前草稿 `contentRevision` 一致的结果，**并把内存草稿的 `lastAssessment` 一起更新**（`check_ready` 读的是它，不是重新跑）。后续任务往这个 helper 里加默认返回值。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/read-tools.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现类型、端口与只读工具**

校验规则：

- `search_ingredients`：`search / category / type` 至少一个非空；`limit` 1–50，默认 20。
- `get_ingredient`：`nutritionFoodId` 非空；端口返回 `null` → `INGREDIENT_NOT_FOUND`。
- `get_catalog_usage`：`mainProteinName` 或 `ingredientNames` 至少一个。
- `get_draft`：不加参数，直接返回端口结果。
- 摘要示例：`找到 2 个候选（菌藻）`、`香菇：菌藻类，营养档案已验证`、`目录 26 道菜；主蛋白「鸭肉」出现 2 次`。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/read-tools.spec.ts --runInBand`
Expected: PASS（5 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent backend/tests/helpers/fake-recipe-agent-port.ts backend/tests/application/recipe-designer/agent/read-tools.spec.ts
git commit -m "feat(recipe-agent): add agent ports and read tools"
```

---

### Task 3: 写工具

**Files:**
- Create: `backend/src/application/recipe-designer/agent/write-tools.ts`
- Test: `backend/tests/application/recipe-designer/agent/write-tools.spec.ts`

**Interfaces:**
- Produces `MIN_ITEM_WEIGHT_G = 0.1`、`MAX_ITEM_WEIGHT_G = 10000`、`MAX_PRODUCTION_STEPS = 30`。
- Produces `createWriteTools(deps: { port: RecipeAgentDraftPort; draftId: string; tagPolicy: HealthTagPolicy })`，返回：
  - `add_ingredient(args: { nutritionFoodId: string; ingredientId?: string; weightG: number; preparationMethod?: string })`
  - `replace_ingredient(args: { itemId: string; nutritionFoodId: string; ingredientId?: string; weightG: number })`
  - `update_weight(args: { itemId: string; weightG: number })`
  - `remove_ingredient(args: { itemId: string })`
  - `set_preparation(args: { itemId: string; method: string; note?: string | null })`
  - `set_copy(args: { name?: string; coverTitle?: string; sellingPoint?: string; description?: string; targetHealthTags?: string[] })`
  - `set_production_steps(args: { steps: AgentProductionStep[] })`
- 所有写工具成功时返回 `stale: ['ASSESSMENT', 'READY']`（`set_copy` 只写文案时也一样，因为交付检查依赖文案）。

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/write-tools.spec.ts
import { createWriteTools } from 'src/application/recipe-designer/agent/write-tools';
import { createFakeRecipeAgentPort } from '../../../helpers/fake-recipe-agent-port';

const tagPolicy = { isAllowedTag: (name: string) => ['低脂', '易消化', '单一动物蛋白'].includes(name) };

function setup() {
  const port = createFakeRecipeAgentPort();
  return { port, tools: createWriteTools({ port, draftId: 'draft-1', tagPolicy }) };
}

describe('write tools', () => {
  it.each([0, -1, Number.NaN])('克数 %s 被拒绝', async (weightG) => {
    const { tools, port } = setup();
    const result = await tools.add_ingredient({ nutritionFoodId: 'nf-1', weightG });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_WEIGHT');
    expect(port.addItem).not.toHaveBeenCalled();
  });

  it('加原料成功，并标记评估过期', async () => {
    const { tools, port } = setup();
    const result = await tools.add_ingredient({ nutritionFoodId: 'nf-1', ingredientId: 'ing-1', weightG: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(port.addItem).toHaveBeenCalledWith('draft-1', { nutritionFoodId: 'nf-1', ingredientId: 'ing-1', weightG: 50 });
    expect(result.stale).toEqual(['ASSESSMENT', 'READY']);
  });

  it('卖点命中禁用词被拒绝', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ sellingPoint: '护肝好吸收' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COPY_FORBIDDEN_CLAIM');
    expect(port.setCopy).not.toHaveBeenCalled();
  });

  it('非白名单健康标签被拒绝', async () => {
    const { tools } = setup();
    const result = await tools.set_copy({ targetHealthTags: ['体重管理'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TAG_NOT_ALLOWED');
  });

  it('封面标题超过 20 字被拒绝', async () => {
    const { tools } = setup();
    const result = await tools.set_copy({ coverTitle: '一'.repeat(21) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });

  it('文案合法时写进端口', async () => {
    const { tools, port } = setup();
    const result = await tools.set_copy({ name: '鸭肉南瓜餐', coverTitle: '鲜鸭南瓜', sellingPoint: '鲜鸭配南瓜', targetHealthTags: ['低脂'] });
    expect(result.ok).toBe(true);
    expect(port.setCopy).toHaveBeenCalledWith('draft-1', { name: '鸭肉南瓜餐', coverTitle: '鲜鸭南瓜', sellingPoint: '鲜鸭配南瓜', targetHealthTags: ['低脂'] });
  });

  it('制作步骤为空或超过 30 步被拒绝', async () => {
    const { tools } = setup();
    expect((await tools.set_production_steps({ steps: [] })).ok).toBe(false);
    expect((await tools.set_production_steps({ steps: Array.from({ length: 31 }, (_, i) => ({ sortOrder: i + 1, instruction: '切块' })) })).ok).toBe(false);
  });

  it('预处理方式不能为空', async () => {
    const { tools } = setup();
    const result = await tools.set_preparation({ itemId: 'item-1', method: '  ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/write-tools.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现写工具**

规则：

- `weightG` 必须是有限数，`>= MIN_ITEM_WEIGHT_G` 且 `<= MAX_ITEM_WEIGHT_G`；否则 `INVALID_WEIGHT`。
- `nutritionFoodId` / `itemId` 非空；否则 `INVALID_ARGUMENT`。
- `set_preparation`：`method.trim()` 非空；`note` 最长 500。
- `set_copy`：
  - 至少一个字段；
  - `name` 非空且 ≤ 200；
  - `coverTitle` ≤ 20、`sellingPoint` ≤ 200、`description` ≤ 4000（用 `RECIPE_PRESENTATION_LIMITS`）；
  - `targetHealthTags` 每个都过 `tagPolicy.isAllowedTag`，否则 `TAG_NOT_ALLOWED`；
  - 调 `assertCopywritingCompliant({ sellingPoint: args.sellingPoint ?? '', description: args.description ?? '', suggestedTags: [], basis: '' })`，捕获 `BadRequestException` → `COPY_FORBIDDEN_CLAIM`；
  - 只用 `coverTitle` 时也要用 `scanForbiddenClaims` 扫一遍；
  - **只把传入的字段传给端口**，不要补 `undefined`（测试按精确参数断言）。
- `set_production_steps`：1–30 步；每步 `instruction.trim()` 非空；`sortOrder` 必须从 1 连续递增；不合法 → `INVALID_ARGUMENT`。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/write-tools.spec.ts --runInBand`
Expected: PASS（8 个用例，含 `it.each` 三条）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/write-tools.ts backend/tests/application/recipe-designer/agent/write-tools.spec.ts
git commit -m "feat(recipe-agent): add validated write tools"
```

---

### Task 4: 检查工具与 `check_ready`

**Files:**
- Create: `backend/src/application/recipe-designer/agent/check-tools.ts`
- Test: `backend/tests/application/recipe-designer/agent/check-tools.spec.ts`

**Interfaces:**
- Produces `MARGIN_RATIO = 0.2`。
- Produces `computeMarginPercent(entry: Pick<AgentAssessmentEntry, 'value'|'min'|'max'>): number | null`。
- Produces `createCheckTools(deps: { port: RecipeAgentDraftPort; draftId: string; tagPolicy: HealthTagPolicy })`，返回：
  - `run_assessment(): Promise<AgentToolResult<AgentAssessmentView>>`
  - `check_coverage(args?: { confirmedOmissions?: RequiredFoodCategory[] }): Promise<AgentToolResult<AgentCoverageResult>>`
  - `check_catalog_conflicts(args?: { mainProteinName?: string }): Promise<AgentToolResult<AgentConflictResult[]>>`
  - `check_ready(args?: { confirmedOmissions?: RequiredFoodCategory[]; exceptionApproved?: boolean }): Promise<AgentToolResult<AgentReadyResult>>`
- 类型：
  - `AgentCoverageResult { covered; missing; confirmedOmissions; optionalPresent; supplementCount; unclassifiedCount }`；`missing` 是“没覆盖且没确认”的类，`confirmedOmissions` 是输入里已确认的类。
  - `AgentConflictResult { recipeId; recipeName; severity: 'HARD'|'SOFT'; categories: FoodCategory[] }`
  - `AgentReadyCheck { key: string; label: string; status: 'PASS'|'WARN'|'FAIL'; detail?: string }`
  - `AgentReadyResult { status: 'PASS'|'PASS_WITH_WARNINGS'|'BLOCKED'; checks: AgentReadyCheck[] }`

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/check-tools.spec.ts
import { computeMarginPercent, createCheckTools } from 'src/application/recipe-designer/agent/check-tools';
import { createFakeRecipeAgentPort, fakeAssessment, fakeDraftSnapshot } from '../../../helpers/fake-recipe-agent-port';

const tagPolicy = { isAllowedTag: (name: string) => ['低脂', '易消化', '单一动物蛋白'].includes(name) };

describe('computeMarginPercent', () => {
  it('下限 100、值 120 → 20%', () => {
    expect(computeMarginPercent({ value: 120, min: 100, max: null })).toBe(20);
  });
  it('上限 100、值 80 → 20%', () => {
    expect(computeMarginPercent({ value: 80, min: null, max: 100 })).toBe(20);
  });
  it('同时有上下限时取更近的一边', () => {
    expect(computeMarginPercent({ value: 110, min: 100, max: 200 })).toBe(10);
  });
  it('缺值返回 null', () => {
    expect(computeMarginPercent({ value: null, min: 100, max: null })).toBeNull();
  });
});

describe('check tools', () => {
  it('run_assessment 调端口并返回评估', async () => {
    const port = createFakeRecipeAgentPort();
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.run_assessment();
    expect(result.ok).toBe(true);
    expect(port.runAssessment).toHaveBeenCalledWith('draft-1');
  });

  it('评估过期时 check_ready 必须 BLOCKED', async () => {
    const port = createFakeRecipeAgentPort({
      draft: fakeDraftSnapshot({ contentRevision: 5 }),
      assessment: fakeAssessment({ contentRevision: 4 }),
    });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_ready();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
    expect(result.data.checks.find((c) => c.key === 'ASSESSMENT_FRESH')?.status).toBe('FAIL');
  });

  it('有 MISSING_DATA 时不能 PASS', async () => {
    const port = createFakeRecipeAgentPort({ assessment: fakeAssessment({ missingData: 1 }) });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    const result = await tools.check_ready();
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
  });

  it('正好 20% 余量算 PASS；19.9% 是 PASS_WITH_WARNINGS', async () => {
    const make = (marginPercent: number) =>
      createCheckTools({
        port: createFakeRecipeAgentPort({
          assessment: fakeAssessment({ entries: [{ ...fakeAssessment().entries[0], marginPercent }] }),
        }),
        draftId: 'draft-1',
        tagPolicy,
      });

    const passResult = await make(20).check_ready();
    expect(passResult.ok).toBe(true);
    if (!passResult.ok) return;
    expect(passResult.data.status).toBe('PASS');

    const warnResult = await make(19.9).check_ready();
    expect(warnResult.ok).toBe(true);
    if (!warnResult.ok) return;
    expect(warnResult.data.status).toBe('PASS_WITH_WARNINGS');
  });

  it('缺菌藻且没确认 → BLOCKED；确认过 → PASS_WITH_WARNINGS', async () => {
    const draft = fakeDraftSnapshot({ items: fakeDraftSnapshot().items.filter((i) => i.category !== 'MUSHROOM') });
    const tools = createCheckTools({ port: createFakeRecipeAgentPort({ draft }), draftId: 'draft-1', tagPolicy });
    const blocked = await tools.check_ready();
    const confirmed = await tools.check_ready({ confirmedOmissions: ['MUSHROOM'] });
    if (!blocked.ok || !confirmed.ok) return;
    expect(blocked.data.status).toBe('BLOCKED');
    expect(confirmed.data.status).toBe('PASS_WITH_WARNINGS');
  });

  it('已批例外可以把达标失败降为警告', async () => {
    const tools = createCheckTools({
      port: createFakeRecipeAgentPort({ assessment: fakeAssessment({ deficient: 1 }) }),
      draftId: 'draft-1', tagPolicy,
    });
    const result = await tools.check_ready({ exceptionApproved: true });
    if (!result.ok) return;
    expect(result.data.status).toBe('PASS_WITH_WARNINGS');
    expect(result.data.checks.find((c) => c.key === 'ASSESSMENT_COMPLIANT')?.detail).toContain('已批例外');
  });

  it('check_coverage 报出缺类；确认过的不算缺', async () => {
    const draft = fakeDraftSnapshot({ items: fakeDraftSnapshot().items.filter((i) => i.category !== 'MUSHROOM') });
    const tools = createCheckTools({ port: createFakeRecipeAgentPort({ draft }), draftId: 'draft-1', tagPolicy });
    const open = await tools.check_coverage();
    const confirmed = await tools.check_coverage({ confirmedOmissions: ['MUSHROOM'] });
    if (!open.ok || !confirmed.ok) return;
    expect(open.data.missing).toEqual(['MUSHROOM']);
    expect(open.data.confirmedOmissions).toEqual([]);
    expect(confirmed.data.missing).toEqual([]);
    expect(confirmed.data.confirmedOmissions).toEqual(['MUSHROOM']);
  });

  it('没有主蛋白时目录对比返回空证据，不抛错', async () => {
    const draft = fakeDraftSnapshot({ items: fakeDraftSnapshot().items.filter((i) => i.category !== 'PROTEIN') });
    const tools = createCheckTools({ port: createFakeRecipeAgentPort({ draft }), draftId: 'draft-1', tagPolicy });
    const result = await tools.check_catalog_conflicts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
  });

  it('多种蛋白时取克数最大的作为主蛋白', async () => {
    const items = fakeDraftSnapshot().items.map((item) =>
      item.category === 'PROTEIN' ? { ...item, name: '鸭腿肉', weightG: 450 } : item,
    );
    items.push({ ...items[0], id: 'item-8', name: '鸡胸肉', category: 'PROTEIN', weightG: 100 });
    const port = createFakeRecipeAgentPort({ draft: fakeDraftSnapshot({ items }) });
    const tools = createCheckTools({ port, draftId: 'draft-1', tagPolicy });
    await tools.check_catalog_conflicts();
    expect(port.getCatalogUsage).toHaveBeenCalledWith({ mainProteinName: '鸭腿肉' });
  });

  it('主蛋白重合报 HARD，软类重合只报 SOFT', async () => {
    const catalogUsage = {
      totalPublishedRecipes: 26,
      mainProteinCount: 2,
      recipes: [
        { recipeId: 'r1', name: '南瓜鸭肉餐', mainProteinName: '鸭腿肉', overlappingCategories: ['PROTEIN' as const, 'CARB' as const], overlappingIngredientNames: ['鸭腿肉', '燕麦'] },
      ],
    };
    const tools = createCheckTools({ port: createFakeRecipeAgentPort({ catalogUsage }), draftId: 'draft-1', tagPolicy });
    const result = await tools.check_catalog_conflicts({ mainProteinName: '鸭腿肉' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]?.severity).toBe('HARD');
  });

  it('文案为空、缺预处理、标签不合规都会 BLOCKED', async () => {
    const draft = fakeDraftSnapshot({ copy: { coverTitle: null, sellingPoint: null, description: null, targetHealthTags: ['体重管理'] } });
    const tools = createCheckTools({ port: createFakeRecipeAgentPort({ draft }), draftId: 'draft-1', tagPolicy });
    const result = await tools.check_ready();
    if (!result.ok) return;
    expect(result.data.status).toBe('BLOCKED');
    expect(result.data.checks.filter((c) => c.status === 'FAIL').map((c) => c.key)).toEqual(
      expect.arrayContaining(['COPY', 'TAGS']),
    );
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/check-tools.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现检查工具**

`computeMarginPercent`：有 `min` 且 `value >= min` → `((value - min) / min) * 100`；有 `max` 且 `value <= max` → `((max - value) / max) * 100`；两边都有取较小值；否则 `null`。保留 1 位小数。

`check_ready` 先 `getDraft`，用 `draft.lastAssessment` 判断（不是重新跑评估）；没跑过、或版本对不上，都算“没准备好”。`run_assessment` 才是重新跑并落库的那个工具。**内容版本任何写操作都会 +1，所以 skill 的顺序应是“先改完、再跑评估、再交付”；评估之后再改字段，必须重跑。**

`check_ready` 生成这些检查项（key → 失败后果）：

| key | 通过条件 | 失败 |
|---|---|---|
| `ITEMS` | 至少 1 条、总重 > 0 | FAIL |
| `IDENTITY` | 每条都有 `nutritionFoodId` | FAIL |
| `ASSESSMENT_FRESH` | `draft.lastAssessment` 存在且 `contentRevision === draft.contentRevision` | FAIL |
| `ASSESSMENT_COMPLIANT` | `entries.length > 0 && deficient=0 && excess=0 && missingData=0` | FAIL（`exceptionApproved` 时降为 WARN，detail 带“已批例外”） |
| `MARGIN` | 忽略 `INFO` 条目；其余 `marginPercent == null` 或 `>= 20` | WARN |
| `COVERAGE` | `missing` 全部在 `confirmedOmissions` | FAIL（确认过则 WARN） |
| `COPY` | name/coverTitle/sellingPoint/description 非空 | FAIL |
| `PRODUCTION_STEPS` | ≥ 1 步 | FAIL |
| `PREPARATION` | 每条都有 `preparationMethod` | FAIL |
| `TAGS` | 所有 `targetHealthTags` 都过 `tagPolicy` | FAIL |

`status`：有 FAIL → `BLOCKED`；否则有 WARN → `PASS_WITH_WARNINGS`；否则 `PASS`。

`check_catalog_conflicts`：取草稿里克数最大的 `PROTEIN` 项作为主蛋白（没有就返回空数组 + 摘要“没有主蛋白可对比”）；调 `port.getCatalogUsage({ mainProteinName })`，不要额外塞 `ingredientNames`；`PROTEIN` 重合 → `HARD`，`ORGAN/CARB/VEGETABLE/MUSHROOM/NUTS` 重合 → `SOFT`；同一道菜同时命中硬和软时只报 `HARD`。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/check-tools.spec.ts --runInBand`
Expected: PASS（15 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/check-tools.ts backend/tests/application/recipe-designer/agent/check-tools.spec.ts
git commit -m "feat(recipe-agent): add assessment, coverage and ready checks"
```

---

### Task 5: 控制工具与工具注册表

**Files:**
- Create: `backend/src/application/recipe-designer/agent/control-tools.ts`
- Create: `backend/src/application/recipe-designer/agent/tool-registry.ts`
- Test: `backend/tests/application/recipe-designer/agent/tool-registry.spec.ts`

**Interfaces:**
- Produces `RecipeAgentControlPort`（加到 `recipe-agent.port.ts`）：
  - `askUser(input: { questions: Array<{ question: string; options?: string[] }> }): Promise<void>`
  - `requestException(input: { type: 'COMPLIANCE' | 'CATEGORY_OMISSION'; reason: string; detail?: string }): Promise<void>`
  - `finishDraft(input: { summary: string; warnings: string[] }): Promise<void>`
- Produces `createControlTools(deps: { controlPort; checkReady: (args?) => Promise<AgentToolResult<AgentReadyResult>> })`，返回 `ask_user`、`request_exception`、`finish_draft`。
- Produces `AGENT_TOOL_DEFINITIONS: AgentToolDefinition[]`（18 个）与 `createAgentToolHandlers(deps)`。
- `AgentToolDefinition { name: string; description: string; parameters: Record<string, unknown> }`。

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/tool-registry.spec.ts
import { AGENT_TOOL_DEFINITIONS, createAgentToolHandlers } from 'src/application/recipe-designer/agent/tool-registry';
import { createFakeRecipeAgentPort, fakeAssessment } from '../../../helpers/fake-recipe-agent-port';

const tagPolicy = { isAllowedTag: () => true };

describe('tool registry', () => {
  it('18 个工具，名字唯一', () => {
    const names = AGENT_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toHaveLength(18);
    expect(new Set(names).size).toBe(18);
    expect(names).toEqual(expect.arrayContaining([
      'get_draft', 'search_ingredients', 'get_ingredient', 'get_catalog_usage',
      'add_ingredient', 'replace_ingredient', 'update_weight', 'remove_ingredient',
      'set_preparation', 'set_copy', 'set_production_steps',
      'run_assessment', 'check_coverage', 'check_catalog_conflicts', 'check_ready',
      'ask_user', 'request_exception', 'finish_draft',
    ]));
  });

  it('每个定义都有 handler', () => {
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort(),
      controlPort: { askUser: jest.fn(), requestException: jest.fn(), finishDraft: jest.fn() },
      tagPolicy,
      draftId: 'draft-1',
    });
    for (const def of AGENT_TOOL_DEFINITIONS) {
      expect(typeof handlers[def.name]).toBe('function');
    }
  });

  it('ask_user 最多两个问题，且不能为空', async () => {
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort(),
      controlPort: { askUser: jest.fn(), requestException: jest.fn(), finishDraft: jest.fn() },
      tagPolicy, draftId: 'draft-1',
    });
    expect((await handlers.ask_user({ questions: [] })).ok).toBe(false);
    expect((await handlers.ask_user({ questions: [{ question: 'a' }, { question: 'b' }, { question: 'c' }] })).ok).toBe(false);
  });

  it('check_ready 不通过时 finish_draft 拒绝', async () => {
    const controlPort = { askUser: jest.fn(), requestException: jest.fn(), finishDraft: jest.fn() };
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort({ assessment: fakeAssessment({ contentRevision: 4, deficient: 1 }) }),
      controlPort, tagPolicy, draftId: 'draft-1',
    });
    const result = await handlers.finish_draft({ summary: '交付' });
    expect(result.ok).toBe(false);
    expect(controlPort.finishDraft).not.toHaveBeenCalled();
  });

  it('request_exception 需要合法类型和理由', async () => {
    const controlPort = { askUser: jest.fn(), requestException: jest.fn(), finishDraft: jest.fn() };
    const handlers = createAgentToolHandlers({
      port: createFakeRecipeAgentPort(), controlPort, tagPolicy, draftId: 'draft-1',
    });
    expect((await handlers.request_exception({ type: 'OTHER', reason: 'x' })).ok).toBe(false);
    expect((await handlers.request_exception({ type: 'COMPLIANCE', reason: '急性胰腺炎' })).ok).toBe(true);
    expect(controlPort.requestException).toHaveBeenCalledTimes(1);
  });
});
```

> 上面第三个 `finish_draft` 用例的 fixture 写法只是示意；实现时用 `fakeAssessment({ contentRevision: 4, deficient: 1 })`（与 Task 4 的 helper 一致），确保 `check_ready` 返回 BLOCKED。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/tool-registry.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现控制工具与注册表**

- `ask_user`：1–2 个问题；每个 `question.trim()` 非空且 ≤ 200；`options` 最多 6 个；否则 `INVALID_ARGUMENT`。调 `controlPort.askUser`，成功摘要“已停下来问你”。
- `request_exception`：`type` 只允许两个枚举；`reason.trim()` 非空且 ≤ 500；调 `controlPort.requestException`。
- `finish_draft`：先调 `checkReady`；`BLOCKED` → `READY_BLOCKED`；否则把 `warnings`（所有 WARN 的 detail）传给 `controlPort.finishDraft`，摘要“已生成交付确认卡”。
- `AGENT_TOOL_DEFINITIONS`：18 条，`parameters` 至少 `{ type: 'object', properties: {...}, required: [...] }`。描述用中文、一句话说清“什么时候用”；参数名与端口/工具函数一致。
- `createAgentToolHandlers`：把 Task 2–4 的工厂组合起来，返回 `Record<string, handler>`；handler 统一接 `Record<string, unknown>`，内部做类型收窄。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/tool-registry.spec.ts --runInBand`
Expected: PASS（5 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/control-tools.ts backend/src/application/recipe-designer/agent/tool-registry.ts backend/tests/application/recipe-designer/agent/tool-registry.spec.ts
git commit -m "feat(recipe-agent): add control tools and 18-tool registry"
```

---

### Task 6: 工具箱组装与端到端冒烟

**Files:**
- Create: `backend/src/application/recipe-designer/agent/toolkit.ts`
- Test: `backend/tests/application/recipe-designer/agent/agent-flow.spec.ts`

**Interfaces:**
- Produces `createRecipeAgentToolkit(deps: { port; controlPort; tagPolicy; draftId }): { definitions: AgentToolDefinition[]; handlers: Record<string, (args: Record<string, unknown>) => Promise<AgentToolResult<unknown>>> }`。

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/agent-flow.spec.ts
import { createRecipeAgentToolkit } from 'src/application/recipe-designer/agent/toolkit';
import { createFakeRecipeAgentPort } from '../../../helpers/fake-recipe-agent-port';

it('一条完整链路：读草稿 → 查原料 → 加原料 → 评估 → 写文案 → 交付', async () => {
  const port = createFakeRecipeAgentPort({ assessment: null }); // 第一次评估前没有结果
  const controlPort = { askUser: jest.fn(), requestException: jest.fn(), finishDraft: jest.fn() };
  const toolkit = createRecipeAgentToolkit({
    port, controlPort, draftId: 'draft-1',
    tagPolicy: { isAllowedTag: (n) => ['低脂', '易消化'].includes(n) },
  });

  expect((await toolkit.handlers.get_draft({})).ok).toBe(true);
  expect((await toolkit.handlers.search_ingredients({ category: 'MUSHROOM' })).ok).toBe(true);
  expect((await toolkit.handlers.add_ingredient({ nutritionFoodId: 'nf-8', weightG: 40 })).ok).toBe(true);
  // 文案放在最后一次评估之前：评估之后再改任何字段，内容版本会 +1，评估就过期了。
  expect((await toolkit.handlers.set_copy({ name: '鸭肉南瓜餐', sellingPoint: '鲜鸭配南瓜' })).ok).toBe(true);
  expect((await toolkit.handlers.run_assessment({})).ok).toBe(true);
  expect((await toolkit.handlers.check_ready({})).ok).toBe(true);
  expect((await toolkit.handlers.finish_draft({ summary: '做好了' })).ok).toBe(true);
  expect(controlPort.finishDraft).toHaveBeenCalledTimes(1);
});
```

`createFakeRecipeAgentPort` 的 `addItem` 要真的把 item 追加到内存草稿、`runAssessment` 要返回 `contentRevision` 与草稿一致的 34/34 结果；否则这条链路走不通。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/agent-flow.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 toolkit**

`createRecipeAgentToolkit` 只做组装：读工具 + 写工具 + 检查工具 + 控制工具，返回 `definitions` 与 `handlers`。不要在这里加业务规则。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/agent-flow.spec.ts --runInBand`
Expected: PASS。

- [ ] **Step 5: 跑全套相关测试**

Run: `cd backend && npx jest tests/domain/recipe-designer/food-category-map.spec.ts tests/application/recipe-designer/agent --runInBand`
Expected: 6 个 spec 全通过。

- [ ] **Step 6: 提交**

```bash
git add backend/src/application/recipe-designer/agent/toolkit.ts backend/tests/application/recipe-designer/agent/agent-flow.spec.ts
git commit -m "feat(recipe-agent): assemble toolkit and smoke-test full tool flow"
```

---

## 接下来（P0b，不在本计划）

- Prisma 三张表 + migration（session / message / snapshot）。
- `RecipeDesignerAgentAdapter`：把 `RecipeAgentDraftPort` 接到现有 `RecipeDesignerService` / `PrismaService` / `RecipeCopywritingService`。
- `RecipeAgentControlPort` 的实现：写会话消息、改状态、生成例外/交付卡。
- `deepseek-tools-chat.ts`：支持 `tools` 与多轮 tool 消息；不支持的兜底。
- 应用入口接线（`app.module.ts` 或新的 Agent module）。
- 管理端抽屉（P2）与评测（P3）各自单独成计划。
