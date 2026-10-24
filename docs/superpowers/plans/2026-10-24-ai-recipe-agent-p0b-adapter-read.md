# 食谱 AI Agent · P0b-2a 读适配器与标签策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 P0a 的草稿端口接到真实数据：`getDraft` / `searchIngredients` / `getIngredient` / `getCatalogUsage` 四个读方法，加一个“低脂 / 单一动物蛋白”可判、易消化人工挂的健康标签策略。

**Architecture:** `RecipeDesignerAgentAdapter`（每次运行绑定 draftId + 当前员工身份）实现 `RecipeAgentDraftPort`；读用现有 `RecipeDesignerService` + 只读 Prisma；写方法在 P0b-2b 补。`DraftHealthTagPolicy` 是纯函数式策略，不碰数据库。

**Tech Stack:** NestJS、Prisma（只读）、Jest（mock service/Prisma）。

**Spec:** `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`

## Global Constraints

- 只改 `backend/`；不接模型、不做 UI、不做写操作（写方法先抛 `CONTROL_NOT_AVAILABLE`，P0b-2b 实现）。
- 读适配器可以只用 Prisma 读；**不要用 Prisma 写**。
- 草稿写入必须走 `RecipeDesignerService`（它负责 `contentRevision` 和事务）；这是 P0b-2b 的约束，本计划只读。
- 健康标签：AI 只自动挂“低脂”（数值门槛）和“单一动物蛋白”（原料判定）；“易消化”一律 `false`，人工挂；其他标签 `false`。
- 易消化/其他标签策略返回 false 时，工具会拒绝，模型应转人工。
- 本仓库有并发 agent：每个任务只提交自己的文件，`git commit --only <精确路径>`。

## Review Focus

1. `assessmentContentRevision` 为 null 或与 `contentRevision` 不一致 → `lastAssessment = null`，不能拿旧评估当新的。
2. `ratioPercent`/`totalWeightG` 从当前 items 现算，不用 DB 里可能过期的值。
3. `searchIngredients` 只返回有已验证营养档案的原料；CFCT 分类要合并 `ingredient.properties`，不能只看 `nutritionFood.category`。
4. `getIngredient` 找不到 → `null`；价格/过敏原/分类映射不能抛。
5. `getCatalogUsage` 只读已发布食谱；`overlappingCategories` 必须是与**当前草稿**的交集，不是整道菜的分类。
6. 低脂门槛按水分分档（<20 → 9，20–65 → 7，>65 → 4，湿基脂肪）；边界值要测。
7. 单一动物蛋白：0 种或 ≥2 种都 false；只有 1 种才 true。
8. 易消化：无论原料多“好”，都 false（人工挂）。

---

### Task 1: 类型扩展 + 适配器骨架

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/agent-types.ts`
- Create: `backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts`
- Modify: `backend/tests/helpers/fake-recipe-agent-port.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts`（本任务先建空壳，Task 2 填）

**Interfaces:**
- `AgentDraftSnapshot` 增加可选字段：
  ```ts
  nutritionSummary?: {
    fatWetPercent: number | null;
    moisturePercent: number | null;
  };
  animalSpecies?: string[];
  ```
  这两个字段只给标签策略用，读工具不展示。
- `AgentIngredientDetail` 增加：
  ```ts
  pricePerPurchaseUnit: number | null;
  purchaseUnit: string | null;
  ```
- `RecipeAgentActor { userId: string; role?: string | null; customerId?: string | null }`
- `RecipeDesignerAgentAdapter` 构造：
  ```ts
  constructor(
    private readonly service: RecipeDesignerService,
    private readonly prisma: PrismaService,
    private readonly actor: RecipeAgentActor,
    private readonly draftId: string,
  )
  ```
- 写方法（`addItem` 等 7 个）先 `throw new Error('P0b-2b: write not implemented')`；读方法在 Task 2–4 实现。
- `private get access(): RecipeDesignerAccessInput` 返回 `{ userId, role, customerId }`。

- [ ] **Step 1: 扩展类型并更新 fake**

`AgentDraftSnapshot` 加两个可选字段；`AgentIngredientDetail` 加 price 字段。更新 `fake-recipe-agent-port.ts` 的 `fakeDraftSnapshot` / `ingredientDetail` 默认值（加 `nutritionSummary: { fatWetPercent: 12, moisturePercent: 60 }`、`animalSpecies: ['鸭']`、price 字段）。读工具测试不应受影响。

- [ ] **Step 2: 建适配器骨架 + 冒烟测试**

```ts
// backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts
import { RecipeDesignerAgentAdapter } from 'src/application/recipe-designer/agent/recipe-designer-agent.adapter';

function createAdapter(service: any, prisma: any = {}) {
  return new RecipeDesignerAgentAdapter(service, prisma, { userId: 'u1', role: 'STAFF' }, 'draft-1');
}

describe('RecipeDesignerAgentAdapter read', () => {
  it('适配器能构造，四个读方法都存在', () => {
    const adapter = createAdapter({}, {});
    expect(typeof adapter.getDraft).toBe('function');
    expect(typeof adapter.searchIngredients).toBe('function');
    expect(typeof adapter.getIngredient).toBe('function');
    expect(typeof adapter.getCatalogUsage).toBe('function');
  });
});
```

- [ ] **Step 3: 实现骨架**

`RecipeDesignerAgentAdapter` 实现 `RecipeAgentDraftPort`；写方法抛 `Error`；`getDraft` 先返回一个空快照（Task 2 实现真实映射），让测试先失败。

- [ ] **Step 4: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts --runInBand`
Expected: PASS（1 个冒烟用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/agent-types.ts backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts backend/tests/helpers/fake-recipe-agent-port.ts backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts
git commit --only <the 4 exact files> -m "feat(recipe-agent): scaffold designer read adapter"
```

---

### Task 2: `getDraft` 映射

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts`
- Modify: `backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts`

**Interfaces:**
- `getDraft(draftId): Promise<AgentDraftSnapshot>`
- 映射规则：
  - `series = prisma.recipeSeries.findUnique({ where: { id: draft.seriesId }, select: { name, coverTitle, sellingPoint, targetHealthTags } })`；`seriesId` 为 null 时跳过。
  - `totalWeightG = sum(items.weightG)`。
  - 每条 item：`name = ingredient?.name ?? nutritionFood.displayNameZh ?? nutritionFood.name`；`cfctClass = (ingredient?.properties as any)?.cfct_class ?? null`；`nutritionCategory = nutritionFood.category`；`category = classifyFoodCategory({ name, cfctClass, nutritionCategory, ingredientType: ingredient?.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD' })`；`ratioPercent = total > 0 ? round(weightG / total * 100, 1) : null`。
  - `copy = { coverTitle: series?.coverTitle ?? draft.coverTitle ?? null, sellingPoint: series?.sellingPoint ?? draft.sellingPoint ?? null, description: draft.description ?? null, targetHealthTags: series?.targetHealthTags ?? draft.targetHealthTags ?? [] }`。
  - `name = series?.name ?? draft.name`。
  - `productionSteps` 用 `service.getDraftProductionSteps(draftId, access)` 返回的数组；空数组兜底。
  - `lastAssessment`：仅当 `draft.assessmentContentRevision != null && draft.assessmentContentRevision === draft.contentRevision` 时，把 `draft.complianceStatus`（数组）映射成 `AgentAssessmentView`；否则 null。
  - `nutritionSummary`：从 `draft.calculatedNutrition` 读 `macros.moisture` / `macros.crudeFat` 总克数，除以 `totalWeightG` × 100；缺失则 null。
  - `animalSpecies`：由 item 名称/过敏原推导（见 Task 2 的实现注释；允许先用名称映射 鸡/鸭/鹅/牛/羊/猪/兔/火鸡/鱼/虾/蟹/贝，取去重结果）。

- [ ] **Step 1: 写测试（在同一个 spec 追加）**

先在 spec 文件顶部加 `serviceDraft()` fixture：7 条原料，`contentRevision: 4`、`assessmentContentRevision: 4`、stored `totalWeightG: 900`（故意是过期值，适配器要按实际权重 821 重算）；每条含 `ingredient: { id, name, type, properties: { cfct_class } }`、`nutritionFood: { id, name, displayNameZh, category, status }`；每条 `nutritionFood.nutritionData` 带每 100g 的 `macros.moisture` / `macros.crudeFat`；`calculatedNutrition` 仅作 fallback；`complianceStatus` 数组（3 条：达标/不足/缺数据）；`productionStepsJson: []`；`targetHealthTags: ['低脂']`。

```ts
it('getDraft 把草稿映射成 AgentDraftSnapshot', async () => {
  const service = {
    getDraft: jest.fn().mockResolvedValue(serviceDraft()),
    getDraftProductionSteps: jest.fn().mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }),
  };
  const prisma = {
    recipeSeries: { findUnique: jest.fn().mockResolvedValue({ name: '鸭肉南瓜餐', coverTitle: '鲜鸭南瓜', sellingPoint: '鲜鸭配南瓜', targetHealthTags: ['低脂'] }) },
  };
  const adapter = createAdapter(service, prisma);
  const draft = await adapter.getDraft('draft-1');
  expect(draft.copy.coverTitle).toBe('鲜鸭南瓜');
  expect(draft.items.find((i) => i.name === '鸭胗')?.category).toBe('ORGAN');
  expect(draft.items.find((i) => i.name === '南瓜')?.category).toBe('VEGETABLE');
  expect(draft.totalWeightG).toBe(821);
  expect(draft.items[0].ratioPercent).toBe(54.8);
  expect(draft.nutritionSummary?.fatWetPercent).toBeGreaterThan(0);
  expect(draft.nutritionSummary?.moisturePercent).toBeGreaterThan(0);
});

it('评估版本不一致时 lastAssessment 为 null', async () => {
  const service = { getDraft: jest.fn().mockResolvedValue({ ...serviceDraft(), contentRevision: 5 }), getDraftProductionSteps: jest.fn().mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }) };
  const adapter = createAdapter(service, { recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) } });
  const draft = await adapter.getDraft('draft-1');
  expect(draft.lastAssessment).toBeNull();
});

it('评估版本一致时映射条目与计数', async () => {
  const adapter = createAdapter({ getDraft: jest.fn().mockResolvedValue(serviceDraft()), getDraftProductionSteps: jest.fn().mockResolvedValue({ draftId: 'draft-1', productionSteps: [] }) }, { recipeSeries: { findUnique: jest.fn().mockResolvedValue(null) } });
  const draft = await adapter.getDraft('draft-1');
  expect(draft.lastAssessment?.contentRevision).toBe(4);
  expect(draft.lastAssessment?.entries.length).toBe(3);
  expect(draft.lastAssessment?.deficient).toBe(1);
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts --runInBand`
Expected: FAIL（映射未实现）。

- [ ] **Step 3: 实现 `getDraft`**

按上面的映射规则实现。`complianceStatus` 是 JSON 数组；每项取 `nutrientKey/label/status/currentValue/minValue/maxValue`；计数 `COMPLIANT/DEFICIENT/EXCESS/MISSING_DATA`；`entries` 用这些项；`marginPercent: null`（P0a 的 `withComputedMargins` 会补）。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts --runInBand`
Expected: PASS（4 个用例：1 个冒烟 + 3 个 getDraft）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts
git commit --only <the 2 exact files> -m "feat(recipe-agent): map draft snapshot for agent"
```

---

### Task 3: `searchIngredients` + `getIngredient`

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts`
- Modify: `backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts`

**Interfaces:**
- `searchIngredients(input)`：调 `service.listIngredientOptions({ search, type, pageSize: 50 })`；对每个 option：
  - 选 profile：`defaultNutritionFoodId` 对应项 → `isPrimary` → 第一个；`status === 'VERIFIED'` 才收。
  - 批量查 `prisma.ingredient.findMany({ where: { id: { in: ingredientIds } }, select: { id, properties } })` 合并 `cfctClass`。
  - `category = classifyFoodCategory(...)`；按 `input.category` 过滤；按 `input.limit` 截断。
  - 返回 `AgentIngredientCandidate[]`。
- `getIngredient({ nutritionFoodId })`：
  - `prisma.nutritionFood.findUnique({ where: { id }, select: { id, name, displayNameZh, status, category, nutritionData, mappings: { select: { ingredientId, isPrimary, ingredient: { select: { id, name, type, properties, currentPricePerPurchaseUnit, purchaseUnit, allergenTags: { select: { allergenTag: { select: { name } } } } } } } } } })`。
  - 找不到 → `null`。
  - 选主映射；`nutritionSummary` 取 `nutritionData.macros`；`allergenNames`；`pricePerPurchaseUnit`/`purchaseUnit`；`verified = status === 'VERIFIED'`；`category = classifyFoodCategory(...)`。

- [ ] **Step 1: 写测试**

```ts
it('searchIngredients 只收已验证档案，并按七类过滤', async () => {
  const service = {
    listIngredientOptions: jest.fn().mockResolvedValue({
      data: [
        { id: 'i1', name: '香菇', type: 'FOOD', defaultNutritionFoodId: 'nf1', nutritionProfiles: [{ nutritionFoodId: 'nf1', name: '香菇', category: 'OTHER', status: 'VERIFIED', isPrimary: true }] },
        { id: 'i2', name: '坏档案', type: 'FOOD', defaultNutritionFoodId: 'nf2', nutritionProfiles: [{ nutritionFoodId: 'nf2', name: '坏档案', category: 'OTHER', status: 'PENDING', isPrimary: true }] },
      ],
    }),
  };
  const prisma = { ingredient: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', properties: { cfct_class: '菌藻类' } }, { id: 'i2', properties: { cfct_class: '菌藻类' } }]) } };
  const adapter = createAdapter(service, prisma);
  const result = await adapter.searchIngredients({ category: 'MUSHROOM', limit: 10 });
  expect(result.map((c) => c.ingredientId)).toEqual(['i1']);
  expect(result[0].cfctClass).toBe('菌藻类');
});

it('getIngredient 找不到返回 null，找到时带价格/过敏原', async () => {
  const prisma = {
    nutritionFood: {
      findUnique: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'nf1', name: '鸭腿肉', displayNameZh: '鸭腿肉', status: 'VERIFIED', category: 'MEAT',
          nutritionData: { macros: { crudeProtein: 18, crudeFat: 6 } },
          mappings: [{ ingredientId: 'i1', isPrimary: true, ingredient: { id: 'i1', name: '鸭腿肉', type: 'FOOD', properties: { cfct_class: '禽肉类及制品' }, currentPricePerPurchaseUnit: 30, purchaseUnit: 'kg', allergenTags: [{ allergenTag: { name: '鸭肉' } }] } }],
        }),
    },
  };
  const adapter = createAdapter({}, prisma);
  expect(await adapter.getIngredient({ nutritionFoodId: 'missing' })).toBeNull();
  const detail = await adapter.getIngredient({ nutritionFoodId: 'nf1' });
  expect(detail?.category).toBe('PROTEIN');
  expect(detail?.allergenNames).toEqual(['鸭肉']);
  expect(detail?.pricePerPurchaseUnit).toBe(30);
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts --runInBand`
Expected: FAIL（未实现）。

- [ ] **Step 3: 实现**

注意：`listIngredientOptions` 返回的 option 不含 `properties`；必须批量查 `Ingredient` 补 `cfct_class`。`nutritionFood.status` 是 `VERIFIED` 才收。`getIngredient` 的 `nutritionData` 是 JSON，`macros` 可能缺失；缺失返回空对象，不抛。

- [ ] **Step 4: 跑测试，确认通过**

Run: 同上
Expected: PASS（6 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts
git commit --only <the 2 exact files> -m "feat(recipe-agent): add ingredient search and detail mapping"
```

---

### Task 4: `getCatalogUsage`

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts`
- Modify: `backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts`

**Interfaces:**
- `getCatalogUsage(input: { mainProteinName?: string; ingredientNames?: string[] }): Promise<AgentCatalogUsage>`
- 查询 `prisma.recipe.findMany({ where: { status: 'PUBLIC' }, select: { id, name, recipeItems: { select: { ingredientId, weightG, ingredient: { select: { name, properties } }, nutritionFood: { select: { name, displayNameZh, category } } } } } })`。
- 当前草稿：`service.getDraft(this.draftId, this.access)`；把当前 items 映射成 `{ name, category }`。
- 每道已发布菜：映射 items 的 `{ name, category }`；主蛋白 = 克数最大的 `PROTEIN` 项的 name（没有则 null）。
- `recipes` 只保留“有分类交集，或主蛋白与 input.mainProteinName 相同”的菜；`overlappingCategories` = 当前草稿与这道菜的分类交集；`overlappingIngredientNames` = 名字交集。
- `mainProteinCount` = 主蛋白与 `input.mainProteinName` 相同的菜数（大小写/空白不敏感）。
- `totalPublishedRecipes` = 所有已发布菜数。

- [ ] **Step 1: 写测试**

```ts
it('目录使用只算与当前草稿的交集，并统计主蛋白', async () => {
  const service = { getDraft: jest.fn().mockResolvedValue(serviceDraft()) };
  const prisma = {
    recipe: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'r1', name: '旧鸭肉餐', recipeItems: [
          { ingredientId: 'i9', weightG: 400, ingredient: { name: '鸭腿肉', properties: { cfct_class: '禽肉类及制品' } }, nutritionFood: { name: '鸭腿肉', displayNameZh: '鸭腿肉', category: 'MEAT' } },
          { ingredientId: 'i10', weightG: 100, ingredient: { name: '燕麦', properties: { cfct_class: '谷类及制品' } }, nutritionFood: { name: '燕麦', displayNameZh: '燕麦', category: 'GRAIN' } },
        ] },
      ]),
    },
  };
  const adapter = createAdapter(service, prisma);
  const usage = await adapter.getCatalogUsage({ mainProteinName: '鸭腿肉' });
  expect(usage.totalPublishedRecipes).toBe(1);
  expect(usage.mainProteinCount).toBe(1);
  expect(usage.recipes[0].overlappingCategories).toEqual(expect.arrayContaining(['PROTEIN', 'CARB']));
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: 同上
Expected: FAIL（未实现）。

- [ ] **Step 3: 实现**

复用 `classifyFoodCategory`；不要写库；`recipeItems` 的 `ingredient.properties` 可能是 JSON，取 `cfct_class` 失败就 null。

- [ ] **Step 4: 跑测试，确认通过**

Run: 同上
Expected: PASS（7 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts
git commit --only <the 2 exact files> -m "feat(recipe-agent): add draft-scoped catalog usage"
```

---

### Task 5: 健康标签策略

**Files:**
- Create: `backend/src/application/recipe-designer/agent/draft-health-tag-policy.ts`
- Test: `backend/tests/application/recipe-designer/agent/draft-health-tag-policy.spec.ts`

**Interfaces:**
- `DraftHealthTagPolicy implements HealthTagPolicy`
- 构造：
  ```ts
  constructor(input: {
    fatWetPercent: number | null;
    moisturePercent: number | null;
    animalSpecies: string[];
  })
  ```
- `isAllowedTag(name: string): boolean`：
  - `低脂` → `fatWetPercent != null && moisturePercent != null` 且 `fatWetPercent <= lowFatLimit(moisturePercent)`；`lowFatLimit`: `<20 → 9`，`<=65 → 7`，`>65 → 4`。
  - `单一动物蛋白` → `animalSpecies` 去重后长度 === 1。
  - `易消化` → `false`（人工挂）。
  - 其他 → `false`。
- 导出 `lowFatLimit(moisturePercent: number): number` 供测试。

- [ ] **Step 1: 写测试**

```ts
// backend/tests/application/recipe-designer/agent/draft-health-tag-policy.spec.ts
import { DraftHealthTagPolicy, lowFatLimit } from 'src/application/recipe-designer/agent/draft-health-tag-policy';

function policy(overrides: Partial<{ fatWetPercent: number | null; moisturePercent: number | null; animalSpecies: string[] }> = {}) {
  return new DraftHealthTagPolicy({ fatWetPercent: 8, moisturePercent: 60, animalSpecies: ['鸭'], ...overrides });
}

describe('DraftHealthTagPolicy', () => {
  it('低脂按水分分档', () => {
    expect(lowFatLimit(19)).toBe(9);
    expect(lowFatLimit(20)).toBe(7);
    expect(lowFatLimit(65)).toBe(7);
    expect(lowFatLimit(66)).toBe(4);
  });

  it('低脂达标/不达标/缺数据', () => {
    expect(policy({ fatWetPercent: 7, moisturePercent: 60 }).isAllowedTag('低脂')).toBe(true);
    expect(policy({ fatWetPercent: 7.1, moisturePercent: 60 }).isAllowedTag('低脂')).toBe(false);
    expect(policy({ fatWetPercent: null, moisturePercent: 60 }).isAllowedTag('低脂')).toBe(false);
  });

  it('单一动物蛋白只认一种', () => {
    expect(policy({ animalSpecies: ['鸭'] }).isAllowedTag('单一动物蛋白')).toBe(true);
    expect(policy({ animalSpecies: ['鸭', '鸡'] }).isAllowedTag('单一动物蛋白')).toBe(false);
    expect(policy({ animalSpecies: [] }).isAllowedTag('单一动物蛋白')).toBe(false);
  });

  it('易消化永远 false，其他标签 false', () => {
    expect(policy({ fatWetPercent: 1, animalSpecies: ['鸭'] }).isAllowedTag('易消化')).toBe(false);
    expect(policy().isAllowedTag('体重管理')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/draft-health-tag-policy.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

实现上面的规则。`animalSpecies` 去重（trim、大小写不敏感）；空数组 false。`lowFatLimit` 用 `if` 分档。

- [ ] **Step 4: 跑测试，确认通过**

Run: 同上
Expected: PASS（4 个用例）。

- [ ] **Step 5: 跑全套**

Run: `cd backend && npx jest tests/domain/recipe-designer/food-category-map.spec.ts tests/application/recipe-designer/agent --runInBand`
Expected: 11 个 spec 全通过（P0a 6 + P0b-1 3 + 本计划读适配器 1 + 标签策略 1）。

- [ ] **Step 6: 提交**

```bash
git add backend/src/application/recipe-designer/agent/draft-health-tag-policy.ts backend/tests/application/recipe-designer/agent/draft-health-tag-policy.spec.ts
git commit --only <the 2 exact files> -m "feat(recipe-agent): add draft health tag policy"
```

---

## 接下来（P0b-2b，不在本计划）

- 写适配器：`addItem` / `replaceItem` / `updateWeight` / `removeItem` / `setPreparation` / `setCopy` / `setProductionSteps` / `runAssessment`。
- 新增 `RecipeDesignerService.replaceItem`（事务：删旧 + 建新 + `contentRevision + 1`）。
- 真实/停用/未验证/重复校验；补剂目标；`preparationMethod` 缺省 `生`。
- `runAssessment` 用 `assessDraftForAgent`；409 → `RecipeAgentPortError('ASSESSMENT_STALE')`；更新 `tool-registry`/`write-tools` 的 boundary，让端口错误码透传。
- `setCopy` 的系列/草稿字段路由。
- 适配器 + toolkit 的集成冒烟。

P0b-3 仍是控制面 + DeepSeek 工具调用客户端 + `app.module` 接线。
