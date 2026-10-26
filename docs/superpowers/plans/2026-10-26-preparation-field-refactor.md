# 原料「部位 / 状态 / 预处理」字段重构实施计划（Phase 1–3，已执行）

> **实施状态（2026-10-26 更新）：** Phase 1、Phase 2、Phase 3 已执行并上线；订单「打碎/切丁」口感模块已作为后续独立任务下线。剩余未决项见文末「未完成/未决」。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 把原料预处理字段统一为「部位 / 状态 / 预处理」，用最近发布/交付历史做自动带出和 3 条下拉建议，去掉字典管理/来源标签，并按食材类别收窄上线检查。

**Architecture:** 新增一个只读的历史服务，统一从「橱窗 PUBLIC 食谱 + 当前有效交付定制食谱」取历史；设计器/食谱编辑页/上线检查/AI 检查共用这个口径。前端输入框从「字典选项」改为「历史文案」；保留黄字状态提示，删除自动改写。

**Tech Stack:** NestJS + Prisma + PostgreSQL；Vue 3 + Element Plus；uni-app（Vue 3）。

**Spec:** `docs/superpowers/specs/2026-10-26-preparation-field-refactor-design.md`

## Global Constraints

- 不重命名数据库列 `preparation_method`，不重写历史 JSON 快照。
- 订单「打碎/切丁」口感模块：原计划本次不碰；2026-10-26 已作为独立任务下线（见 Phase 3 补充）。
- 用户可见全称固定为 `部位 / 状态 / 预处理`；表单/详情/DIY 用全称。
- 字段是单一自由文本，最长 100 字；不强制三段校验。
- 历史只包含：`Recipe.status=PUBLIC` 且非定制；以及有当前有效交付（`revokedAt=null`、`replacedByDeliveryId=null`）的定制食谱。不含设计草稿。
- 自动带出取最近 1 条；下拉最多 3 条不同文案；不显示「橱窗/定制」或「人工/自动」标签。
- 保留黄字状态提示；删除所有自动改写称重口径的写路径调用。
- 上线检查必填类别：PROTEIN、ORGAN、AQUATIC、EGG、CARB、VEGETABLE、MUSHROOM、NUTS、LEGUME、FRUIT。豁免：SUPPLEMENT、OIL、SEASONING、DAIRY、UNCLASSIFIED。
- AI `check_ready` 与后台上线检查使用同一套类别规则。
- 旧字典 ID 仍由 `resolvePreparationMethodText` 兼容解析，Phase 1 不移除字典表。

## Review Focus

- 历史查询把「已撤销/已被替换/未交付」的定制食谱带进下拉（应排除）。
- 自动带出又悄悄改写「生重/熟重/干重」（应原样保留，只提示）。
- 黄字提示只认「生重」不认「生/熟/干」（应两者都认）。
- 上线检查仍卡补剂/盐/油，或 AI 说通过、后台拦截（两边应同口径）。
- 去掉管理/来源标签后行布局被长标签挤坏，或输入框没有变宽。

---

### Task 1: 新增共享历史服务

**Files:**
- Create: `backend/src/application/recipe/ingredient-preparation-history.service.ts`
- Test: `backend/tests/application/recipe/ingredient-preparation-history.service.spec.ts`
- Modify: `backend/src/app.module.ts`（providers 增加该服务）

**Interfaces:**
- Produces:
  ```ts
  interface IngredientPreparationHistoryEntry {
    text: string;
    usageCount: number;
    lastUsedAt: Date;
  }
  class IngredientPreparationHistoryService {
    constructor(prisma: PrismaService)
    getHistory(ingredientId: string, limit?: number): Promise<IngredientPreparationHistoryEntry[]>
    getLatestText(ingredientId: string): Promise<string | null>
    getLatestTextMap(ingredientIds: string[]): Promise<Map<string, string>>
  }
  ```

- [x] **Step 1: Write failing tests**

覆盖：
- 只包含 `Recipe.status=PUBLIC && isCustomRecipe=false` 的 `RecipeItem`；
- 定制只包含 `isCustomRecipe=true` 且有当前有效交付（`revokedAt=null`、`replacedByDeliveryId=null`）的项；
- 排除设计草稿、未交付、已撤销、已被替换；
- 目录 `lastUsedAt = Recipe.createdAt`，定制 `lastUsedAt = 最近有效交付.deliveredAt`；
- 同文去重、按 `lastUsedAt` 倒序、`limit=3`；
- `getLatestText` 返回第一条；`getLatestTextMap` 每个原料取最新一条。

Test name examples:
```
it('includes PUBLIC non-custom recipe items')
it('includes only current effective custom deliveries')
it('excludes draft / undelivered / revoked / replaced recipes')
it('dedupes normalized text and limits to 3')
it('getLatestTextMap picks the newest text per ingredient')
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/application/recipe/ingredient-preparation-history.service.spec.ts --runInBand`
Expected: FAIL（服务不存在）

- [x] **Step 3: Implement the service**

Prisma 查询要点：
```ts
this.prisma.recipeItem.findMany({
  where: {
    ingredientId,
    OR: [
      { recipe: { status: 'PUBLIC', isCustomRecipe: false } },
      {
        recipe: {
          isCustomRecipe: true,
          deliveries: {
            some: { revokedAt: null, replacedByDeliveryId: null },
          },
        },
      },
    ],
  },
  select: {
    ingredientId: true,
    preparationMethod: true,
    recipe: {
      select: {
        isCustomRecipe: true,
        status: true,
        createdAt: true,
        deliveries: {
          where: { revokedAt: null, replacedByDeliveryId: null },
          orderBy: { deliveredAt: 'desc' },
          take: 1,
          select: { deliveredAt: true },
        },
      },
    },
  },
});
```
- 用 `resolvePreparationMethodText` + `normalizePreparationMethodHistoryText` 解析；
- 聚合 `usageCount`，`lastUsedAt` 取最大；
- 排序：`lastUsedAt desc`，再 `usageCount desc`，再 `text.localeCompare`；
- `limit` 为空返回全部；`getLatestTextMap` 用同一查询按 `ingredientId` 分组取第一条。

- [x] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/application/recipe/ingredient-preparation-history.service.spec.ts --runInBand`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/src/application/recipe/ingredient-preparation-history.service.ts backend/src/app.module.ts backend/tests/application/recipe/ingredient-preparation-history.service.spec.ts
git commit -m "feat(recipe): add ingredient preparation history service"
```

---

### Task 2: 历史接口支持 limit，并委托共享服务

**Files:**
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `admin-web/src/api/recipes.ts`
- Test: `backend/tests/recipe.service.preparation-method-history.spec.ts`

**Interfaces:**
- Consumes: `IngredientPreparationHistoryService.getHistory`
- Produces: `RecipeService.getIngredientPreparationMethodHistory(ingredientId, limit?)`；HTTP `GET /admin/ingredients/:id/preparation-method-history?limit=3`

- [x] **Step 1: Write failing tests**

在现有 history spec 里加：
- `limit=3` 只返回 3 条；
- 接口返回的 `lastUsedAt` 是 ISO 字符串；
- 不传 `limit` 返回全部；
- 定制/橱窗历史都包含（由 Task 1 保证，可在 controller 层只测透传）。

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/recipe.service.preparation-method-history.spec.ts --runInBand`
Expected: FAIL（limit 未生效 / 未委托）

- [x] **Step 3: Implement**

- `RecipeService` 注入 `IngredientPreparationHistoryService`（构造参数末尾 `@Optional()`，避免旧测试按位置实例化失败）；
- `getIngredientPreparationMethodHistory(ingredientId, limit?)` 调 `history.getHistory`，把 `lastUsedAt: Date` 转 ISO；
- `AdminController` 增加 `@Query('limit') limit?: string`，解析正整数，最大 50；
- 前端 API `getIngredientPreparationMethodHistory(ingredientId, limit?)` 增加 `params: { limit }`（无值不传）。

- [x] **Step 4: Run tests**

Run: `cd backend && npx jest tests/recipe.service.preparation-method-history.spec.ts --runInBand`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/src/application/recipe/recipe.service.ts backend/src/interfaces/controllers/admin.controller.ts admin-web/src/api/recipes.ts backend/tests/recipe.service.preparation-method-history.spec.ts
git commit -m "feat(recipe): expose preparation history limit"
```

---

### Task 3: 设计器自动带出改用历史服务，删除自动改写

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

**Interfaces:**
- Consumes: `IngredientPreparationHistoryService.getLatestText` / `getLatestTextMap`
- Produces: `resolveDesignItemPreparationMethod` 返回历史原文；发布兜底默认值同样使用历史原文。

- [x] **Step 1: Write failing tests**

更新/新增：
- 新增原料且没有显式预处理时，取历史最新文案；
- 历史文案是「生重、打碎、充分搅拌」而档案是 COOKED 时，**仍然原样保存**（不再改写成「熟重」）；
- 显式传入的预处理原样保留；
- 发布兜底：没填预处理的原料使用历史最新文案，不改写；
- 没有历史服务或没有历史时保持 null。

现有测试 `aligns the auto-generated preparation method...` 改名为 `uses the latest history text without rewriting the basis`，期望值改为原文。

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand`
Expected: FAIL（仍走旧 `recipeItem` 查询/自动改写）

- [x] **Step 3: Implement**

- 构造函数末尾加 `@Optional() private readonly ingredientPreparationHistoryService?: IngredientPreparationHistoryService`；
- `resolveDesignItemPreparationMethod`：显式值优先；否则 `getLatestText(ingredientId)`；`normalizePreparationMethod` 后返回；
- 删除 `resolveDefaultPreparationMethodForIngredient`、`loadDefaultPreparationMethodMap`；
- 发布路径：`defaultPreparationMethods = await this.ingredientPreparationHistoryService?.getLatestTextMap(ingredientIds) ?? new Map()`；
- `buildPublishedRecipeItemCreateData` 删除 `alignPreparationMethodBasis` 调用，默认值直接用；
- 删除 `alignPreparationMethodBasis` import 和线上写路径的三处调用；
- 给 `AddRecipeDesignItemDto` / `UpdateRecipeDesignItemDto` 的 `preparationMethod` 加 `@MaxLength(100)`，和数据库 `VarChar(100)` 对齐；
- 保留 `domain/recipe-designer/preparation-basis.ts` 仅供只读巡检脚本使用，不再从写路径调用。

- [x] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "feat(recipe-designer): use history text for preparation autofill"
```

---

### Task 4: 上线检查按食材类别要求预处理

**Files:**
- Create: `backend/src/domain/recipe-designer/preparation-field.constants.ts`
- Modify: `backend/src/domain/recipe-designer/launch-readiness.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/domain/recipe-designer/launch-readiness-branch.spec.ts`
- Test: `backend/tests/application/recipe-designer/launch-readiness.spec.ts`

**Interfaces:**
- `LaunchReadinessItemInput` 增加 `preparationRequired: boolean`
- 新增 `PREPARATION_REQUIRED_FOOD_CATEGORIES`
- 域函数只在 `item.preparationRequired` 时检查空值

- [x] **Step 1: Write failing tests**

- 10 类食材（PROTEIN/ORGAN/AQUATIC/EGG/CARB/VEGETABLE/MUSHROOM/NUTS/LEGUME/FRUIT）空值产生 `PREPARATION_METHOD_REQUIRED`；
- SUPPLEMENT/OIL/SEASONING/DAIRY/UNCLASSIFIED 空值不产生 blocker；
- 非空时全部通过；
- 服务层 `launchItems` 正确计算 `preparationRequired`。

- [x] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/domain/recipe-designer/launch-readiness-branch.spec.ts tests/application/recipe-designer/launch-readiness.spec.ts --runInBand`
Expected: FAIL

- [x] **Step 3: Implement**

- 在 `food-category-map.ts` 或 `launch-readiness.ts` 增加类别常量；
- `LaunchReadinessItemInput.preparationRequired`；
- `buildDraftLaunchReadiness` 的条件改为 `item.preparationRequired && !hasPreparationMethod(...)`；
- `RecipeDesignerService` 的 `launchItems` 用 `resolveDraftItemDisplayCategory(item)` 计算；
- 消息改为 `食材「X」未填写部位 / 状态 / 预处理，不能发布或加入待提交`。

- [x] **Step 4: Run tests**

Run: `cd backend && npx jest tests/domain/recipe-designer/launch-readiness-branch.spec.ts tests/application/recipe-designer/launch-readiness.spec.ts --runInBand`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/src/domain/recipe-designer/launch-readiness.ts backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/domain/recipe-designer/launch-readiness-branch.spec.ts backend/tests/application/recipe-designer/launch-readiness.spec.ts
git commit -m "feat(recipe-designer): require preparation only for selected food categories"
```

---

### Task 5: AI check_ready 同步类别规则

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/check-tools.ts`
- Test: `backend/tests/application/recipe-designer/agent/check-tools.spec.ts`

- [x] **Step 1: Write failing tests**

- 10 类食材空值 → PREPARATION FAIL；
- 补剂/油脂/调味/乳制品/未分类空值 → PREPARATION PASS；
- 消息使用新术语。

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/check-tools.spec.ts --runInBand`
Expected: FAIL

- [x] **Step 3: Implement**

- 复用 `PREPARATION_REQUIRED_FOOD_CATEGORIES`；
- `draft.items.filter(item => isPreparationRequired(item) && !isNonEmptyString(item.preparationMethod))`；
- 标签 `PREPARATION: '部位 / 状态 / 预处理'`；
- pass 消息改为「必填食材都有部位 / 状态 / 预处理」。

- [x] **Step 4: Run test**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/check-tools.spec.ts --runInBand`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/agent/check-tools.ts backend/tests/application/recipe-designer/agent/check-tools.spec.ts
git commit -m "feat(recipe-agent): align preparation check with launch readiness"
```

---

### Task 6: 设计器输入框改为历史建议，去掉管理/来源标签

**Files:**
- Create: `admin-web/src/constants/preparationField.ts`
- Modify: `admin-web/src/views/RecipeDesigner/components/PreparationMethodField.vue`
- Modify: `admin-web/src/views/RecipeDesigner/Editor.vue`
- Delete: `admin-web/src/views/RecipeDesigner/components/PreparationMethodManagerDialog.vue`
- Delete: `admin-web/src/api/preparationMethods.ts`
- Modify: `admin-web/src/utils/recipeDesigner/preparationMethodField.ts`
- Test: `admin-web/src/utils/recipeDesigner/preparationMethodField.spec.ts`
- Test: `admin-web/src/views/RecipeDesigner/supplementTargetUi.regression.spec.ts`

**Interfaces:**
- `PreparationMethodField` props: `modelValue`, `label`, `ingredientId`, `legacyOptions`, `placeholder`, `tabindex`
- `resolvePreparationMethodDisplayText(value, label, options)` 保留，`options` 只用于 legacy ID 显示
- 新增 `filterPreparationHistory(texts: string[], query: string): string[]`

- [x] **Step 1: Write failing tests**

- 新标签「部位 / 状态 / 预处理」出现在编辑器；
- 不再有 `PreparationMethodManagerDialog`、`preparation-manage-btn`、`preparationSource === 'MANUAL'` 标签；
- 输入框宽度 >= 220px、`maxlength=100`；
- 历史过滤按最后一段、最多 3 条；
- 组件按 `ingredientId` 拉历史，不显示来源标签；
- legacy 选项只用于显示，不出现在下拉建议里。

- [x] **Step 2: Run tests to verify they fail**

Run: `cd admin-web && npx vitest run src/utils/recipeDesigner/preparationMethodField.spec.ts src/views/RecipeDesigner/supplementTargetUi.regression.spec.ts`
Expected: FAIL

- [x] **Step 3: Implement**

- `PreparationMethodField`：
  - 聚焦时调用 `recipeApi.getIngredientPreparationMethodHistory(ingredientId, 3)`；模块级 `Map` 缓存；
  - `fetchSuggestions` 从历史文本过滤；`select-when-unmatched` 保持；
  - 删除 `options` 作为建议来源，保留 `legacyOptions` 用于显示；
  - placeholder `牛里脊/生/去油`；`maxlength=100`；
- `Editor.vue`：
  - 标签改为 `部位 / 状态 / 预处理`；
  - 删除管理按钮、来源 tag、`PreparationMethodManagerDialog` import/state/functions；
  - 传 `:ingredient-id="element.ingredientId"`、`:legacy-options="preparationMethodOptions"`；
  - CSS 宽度 220–260px；`item-preparation-inline` 允许换行；
- 删除不再使用的组件/API 文件；
- 更新回归测试中的旧 class/文案断言。

- [x] **Step 4: Run tests**

Run: `cd admin-web && npx vitest run src/utils/recipeDesigner/preparationMethodField.spec.ts src/views/RecipeDesigner/supplementTargetUi.regression.spec.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add admin-web/src/views/RecipeDesigner/Editor.vue admin-web/src/views/RecipeDesigner/components/PreparationMethodField.vue admin-web/src/utils/recipeDesigner/preparationMethodField.ts admin-web/src/utils/recipeDesigner/preparationMethodField.spec.ts admin-web/src/views/RecipeDesigner/supplementTargetUi.regression.spec.ts
git rm admin-web/src/views/RecipeDesigner/components/PreparationMethodManagerDialog.vue admin-web/src/api/preparationMethods.ts
git commit -m "feat(admin-web): use preparation history suggestions in designer"
```

---

### Task 7: 黄字提示识别「生/熟/干」，保持非阻塞

**Files:**
- Modify: `admin-web/src/utils/preparationBasis.ts`
- Test: `admin-web/src/utils/__tests__/preparationBasis.spec.ts`

- [x] **Step 1: Write failing tests**

- `牛里脊/生/去油` + RAW → 无提示；
- `牛里脊/熟/去油` + RAW → 提示；
- `牛里脊/生重/去油` + RAW → 无提示（兼容）；
- `牛里脊/熟重/去油` + RAW → 提示；
- 无状态词 → 不提示；
- 提示文案使用「部位 / 状态 / 预处理」；
- 后端只读巡检保持旧口径（不作为门禁）；Phase 1 只要求前端黄字提示识别新格式。

- [x] **Step 2: Run test to verify it fails**

Run: `cd admin-web && npx vitest run src/utils/__tests__/preparationBasis.spec.ts`
Expected: FAIL

- [x] **Step 3: Implement**

- 分段正则支持 `/`、`、`、`,`、`，`；
- 状态 token：`生/熟/干/生重/熟重/干重`；
- 营养状态映射：RAW→生、COOKED→熟、DRIED/AIR_DRIED→干；
- 提示文案更新；不修改输入内容。

- [x] **Step 4: Run test**

Run: `cd admin-web && npx vitest run src/utils/__tests__/preparationBasis.spec.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add admin-web/src/utils/preparationBasis.ts admin-web/src/utils/__tests__/preparationBasis.spec.ts
git commit -m "feat(admin-web): warn on preparation state mismatch for 生/熟/干"
```

---

### Task 8: 后台食谱编辑页 / AI 抽屉 / 上线检查文案

**Files:**
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Modify: `admin-web/src/views/RecipeDesigner/components/RecipeAgentDrawer.vue`
- Modify: `admin-web/src/utils/recipeDesigner/launchReadiness.ts`
- Test: `admin-web/src/views/RecipeDesigner/launchReadiness.regression.spec.ts`
- Test: `admin-web/src/views/Recipes/recipeFormReadonly.regression.spec.ts`

- [x] **Step 1: Write failing tests**

- RecipeForm 表头/表单 label/历史标题/占位/空状态使用新术语；
- AgentDrawer 工具结果字段标签使用新术语；
- 上线检查 label 改为「部位/状态/预处理完整」；
- 「制备方法」不再作为原料字段出现（订单模块除外）。

- [x] **Step 2: Run tests to verify they fail**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/launchReadiness.regression.spec.ts src/views/Recipes/recipeFormReadonly.regression.spec.ts`
Expected: FAIL

- [x] **Step 3: Implement**

- 文案替换；历史标题改为「历史记录」；
- 保留 `preparationBasisHint` 黄字提示；
- 不删除 `preparationNote` 数据，但不再新增 UI。

- [x] **Step 4: Run tests**

Run: `cd admin-web && npx vitest run src/views/RecipeDesigner/launchReadiness.regression.spec.ts src/views/Recipes/recipeFormReadonly.regression.spec.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add admin-web/src/views/Recipes/RecipeForm.vue admin-web/src/views/RecipeDesigner/components/RecipeAgentDrawer.vue admin-web/src/utils/recipeDesigner/launchReadiness.ts
git commit -m "feat(admin-web): rename ingredient preparation labels"
```

---

### Task 9: 小程序展示层文案替换

**Files:**
- Create: `miniapp/src/constants/preparationField.ts`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/components/recipe/RecipeIngredientUsageTable.vue`
- Modify: `miniapp/src/pages/staff-production/detail.vue`
- Modify: `miniapp/src/pages/staff-production/print-task.vue`
- Modify: `miniapp/src/utils/canvas-printer.ts`
- Modify: `miniapp/src/pages/staff-production/utils/canvas-printer.ts`
- Modify: `miniapp/src/pages/staff-purchasing/preview.vue`
- Test: `miniapp/src/pages/diy-sheet.regression.spec.ts`
- Test: `miniapp/src/components/recipe/RecipeIngredientTables.spec.ts`

- [x] **Step 1: Write failing tests**

- 食谱详情两个表头、DIY 食材表头/打印表头、采购预览列名使用新术语；
- 补剂「添加时机」保持不变；
- 不改接口字段/逻辑。

- [x] **Step 2: Run tests to verify they fail**

Run: `cd miniapp && npx vitest run src/pages/diy-sheet.regression.spec.ts src/components/recipe/RecipeIngredientTables.spec.ts`
Expected: FAIL

- [x] **Step 3: Implement**

- 只改中文文案；全称优先；打印/采购列如果过挤，先用全称并允许换行（后续实际预览再定）。
- 保留 `preparation_methods` 等接口键不变。

- [x] **Step 4: Run tests**

Run: `cd miniapp && npx vitest run src/pages/diy-sheet.regression.spec.ts src/components/recipe/RecipeIngredientTables.spec.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add miniapp/src/pages/recipe-detail/index.vue miniapp/src/pages/diy-sheet/index.vue miniapp/src/components/recipe/RecipeIngredientUsageTable.vue miniapp/src/pages/staff-production/detail.vue miniapp/src/pages/staff-production/print-task.vue miniapp/src/utils/canvas-printer.ts miniapp/src/pages/staff-production/utils/canvas-printer.ts miniapp/src/pages/staff-purchasing/preview.vue
git commit -m "feat(miniapp): rename ingredient preparation label"
```

---

### Task 10: 后端接口说明 / AI 工具文案统一

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/tool-registry.ts`
- Modify: `backend/src/application/recipe-designer/agent/recipe-agent-run.service.ts`
- Modify: `backend/src/interfaces/dto/diy-sheets.dto.ts`
- Modify: `backend/src/domain/recipe/types.ts`
- Modify: `backend/src/domain/pricing/pricing.service.ts`（仅注释文案）
- Test: `backend/tests/application/recipe-designer/agent/tool-registry.spec.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-agent-run.service.spec.ts`

- [x] **Step 1: Write failing tests**

- `search_recipes` / `get_recipe` / `set_preparation` 描述使用新术语；
- SYSTEM_PROMPT 使用新术语，并说明黄字状态提示交给 AI/人复核；
- 不再用「制备方法」指代原料字段。

- [x] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/tool-registry.spec.ts tests/application/recipe-designer/agent/recipe-agent-run.service.spec.ts --runInBand`
Expected: FAIL

- [x] **Step 3: Implement**

- 工具描述/参数 description/prompt 替换；
- `set_preparation` 继续只接受中文文案；
- 不加新的代码级状态校验；prompt 里只提示 AI 复核。

- [x] **Step 4: Run tests**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/tool-registry.spec.ts tests/application/recipe-designer/agent/recipe-agent-run.service.spec.ts --runInBand`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/src/application/recipe-designer/agent/tool-registry.ts backend/src/application/recipe-designer/agent/recipe-agent-run.service.ts backend/src/interfaces/dto/diy-sheets.dto.ts backend/src/domain/recipe/types.ts backend/src/domain/pricing/pricing.service.ts
git commit -m "docs(recipe-agent): align preparation terminology"
```

---

### Task 11: 整体验证

- [x] **Step 1: Backend targeted tests**

Run:
```bash
cd backend && npx jest tests/application/recipe tests/application/recipe-designer tests/domain/recipe-designer --runInBand
```
Expected: 0 failures.

- [x] **Step 2: Admin tests + type-check + build**

Run:
```bash
cd admin-web && npm test && npx vue-tsc -b && npm run build
```
Expected: 0 failures, build success.

- [x] **Step 3: Miniapp tests**

Run:
```bash
cd miniapp && npm test
```
Expected: 0 failures.

- [x] **Step 4: Manual acceptance**

- 新增一个主蛋白原料：自动带出最近历史；下拉最多 3 条，无来源标签；
- 改写为「牛里脊/熟/去油」但档案是生：出现黄字提示，保存内容不被改写；
- 补剂/盐/油不填：上线检查不拦；主蛋白不填：拦；
- 长标签 + 220–260px 输入框不挤坏行；
- 食谱详情/DIY/打印/采购显示新术语。

- [x] **Step 5: Commit verification fixes only**

如手动验收发现布局/文案问题，按小修复提交，不扩大范围。

---

## Phase 2（已执行 · 2026-10-26）

实施结果：
- 36 条纯字典 ID 回填成中文（设计器 24 + 正式食谱 12）；
- 2 条混合旧值按老板确认删掉未知 ID，保留可读文案；
- 管理接口 `/admin/preparation-methods` 已下线（404），字典表转只读；
- 158 份历史发布快照未改写，继续由 legacy resolver 解析。



## Phase 3（已执行 · 2026-10-26）

实施结果：
- `preparationSource` / `preparationNote` 两列已删除（备份后执行迁移）；
- 设计器 `preparationMethodOptions` 兼容字段已移除；
- 订单「打碎/切丁」模块已独立下线：DTO、枚举、OrderItem、数据库列、结算/员工端展示全部清理；
- 字典表保留只读，未删除。




## 未完成/未决（2026-10-26）

- **字典表最终下线**：阻塞。仍有 158 份历史发布快照存字典 ID；当前保持只读，不重写快照。
- **窄列命名**：生产打印暂用紧凑「部位/状态/预处理」，采购/DIY 用全称；是否统一改短名「原料处理」未拍板。
- **AI 状态一致性提示词**：已于 2026-10-26 补充到系统提示词（只提醒、不改写、不阻断）。
- **订单口感手工回归**：单元测试和构建通过；真实下单/结算/员工端完整手点回归待安排。


## 10 字收敛执行记录（2026-10-26）

- 可编辑数据共 10,610 条；补剂 2,923 条，最长 6 字，未改。
- 非补剂超 10 字 2,006 条，全部压缩；补剂、10 字以内数据保持原样。
- 压缩后为空 23 条，按营养档案/原文补 `生/熟/干`。
- 执行后生产数据最大内容字符数 10；补剂最大 6。
- 历史发布/订单/生产/交付快照不重写，旧任务仍显示旧文案。
- 补剂运行时不再自动带出/接受该字段；接口/设计器/食谱编辑页统一为 10 个内容字符。
