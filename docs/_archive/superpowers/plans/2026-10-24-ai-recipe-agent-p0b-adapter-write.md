# 食谱 AI Agent · P0b-2b 写适配器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 8 个写工具接到真实草稿：加/换/改重/删原料、改预处理、写文案、写步骤、跑评估；补 `replaceItem` 事务和端口错误码透传。

**Architecture:** 在现有 `RecipeDesignerAgentAdapter` 上补写方法；所有写必须走 `RecipeDesignerService`，由它维护 `contentRevision` 与事务；适配器只做“真实/已验证/不重复/属于本草稿”的前置校验。`RecipeAgentPortError` 让 `ASSESSMENT_STALE` 等错误码穿过工具边界。

**Tech Stack:** NestJS、Prisma、Jest（service/Prisma mock）。

**Spec:** `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`

**前置：** P0b-2a 已 READY（读适配器 + 标签策略，191 测试）。本计划只做写路径。

## Global Constraints

- 只改 `backend/`；不做模型客户端、控制面、UI（P0b-3）。
- 所有原料/文案/步骤写操作必须调用 `RecipeDesignerService` 的公开方法；**不许 Prisma 写**。Prisma 只用于校验和读。
- 每次写必须确认目标属于 `this.draftId`：`updateItem`/`removeItem` 只收 itemId，服务不校验归属，适配器必须先查 `designRecipeId`。
- 真实/已验证/不重复：
  - nutritionFood 必须存在、`status === 'VERIFIED'`、有 primary mapping；
  - 同一草稿里同一 `nutritionFoodId` 不能重复（replace 时排除自己）；
  - 加/换原料必须传解析出的真实 `ingredientId`，否则服务会跳过补剂目标解析。
- 补剂：没有显式/默认目标时服务会 400；适配器把 400 转成 `INVALID_ARGUMENT`，让模型 `ask_user`。
- 文案：有系列时 `name` 走 `renameSeries`，`coverTitle/sellingPoint/targetHealthTags` 走 `updateSeriesReleaseSettings`，`description` 走 `updateDraftPresentation`；无系列时 `name/targetHealthTags` 走 `updateDraft`。**系列已有已发布食谱时禁止 AI 改名**（改名会重写 recipe 表和历史版本），返回 `INVALID_ARGUMENT`，让模型问人。
- 步骤：工具给的是 `"5 分钟"` / `"180℃"` 字符串，写库前转数字；温度/时长/排序越界直接 `INVALID_ARGUMENT`。
- 评估：`assessDraftForAgent`；409 → `RecipeAgentPortError('ASSESSMENT_STALE')`；已发布/空草稿 → `INVALID_ARGUMENT`。
- 每个任务只提交自己的文件，`git commit --only <精确路径>`。

## Review Focus

1. `replaceItem` 真的在一个事务里：删旧 + 建新 + 只加一次 `contentRevision`；旧 `sortOrder`/`includeInAssessment`/预处理保留（除非显式覆盖）；换入补剂要带目标，换出补剂要清目标字段。
2. 加/换原料必须解析 primary mapping 并传 `ingredientId`；未验证/停用/重复都要在写之前拒绝。
3. `updateWeight`/`removeItem`/`setPreparation` 必须先验证 item 属于当前草稿；不能靠服务兜底。
4. 文案系列/草稿路由正确；系列已发布时改名被拒；多字段 patch 不会只写一半（先校验再写）。
5. 步骤字符串解析失败/越界要报 `INVALID_ARGUMENT`，不能写 NaN。
6. 409 不能被吞成 `CONTROL_NOT_AVAILABLE`；`RecipeAgentPortError.code` 要原样到工具结果。
7. 写后工具结果带 `stale: ['ASSESSMENT','READY']`（P0a 已做；适配器不要清）。
8. 标签策略不在这里重建；P0b-3 每次写后用新 `getDraft` 重建（写适配器只要保证 `getDraft` 最新）。

---

### Task 1: `RecipeDesignerService.replaceItem` 事务

**Files:**
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/application/recipe-designer/agent/replace-item.spec.ts`

**Interfaces:**
```ts
export class ReplaceRecipeDesignItemDto {
  nutritionFoodId!: string;
  ingredientId?: string;
  weightG?: number;
  preparationMethod?: string;
  preparationNote?: string | null;
  preparationSource?: string | null;
}
```
`async replaceItem(itemId, dto: ReplaceRecipeDesignItemDto, access): Promise<DesignRecipeItemWithFood>`

行为：
1. `const context = normalizeRecipeDesignerAccessContext(access)`；
2. `const current = await this.assertItemEditableByUser(itemId, context)`（当前实现返回 draft + 预处理的三个字段；**本任务要先扩展它的 select/return**，补 `weightG`、`sortOrder`、`includeInAssessment`、`nutritionFoodId`、`ingredientId`，这样 replace 才能保留旧值）；
3. `const ingredientId = await this.resolveDesignItemIngredientId({ nutritionFoodId: dto.nutritionFoodId, ingredientId: dto.ingredientId })`；
4. 重复校验：`designRecipeItem.findFirst({ where: { designRecipeId: current.id, nutritionFoodId: dto.nutritionFoodId, id: { not: itemId } } })`；有 → `BadRequestException('这个原料已经在配方里')`；
5. `weightG = dto.weightG ?? current.weightG`；`preparationMethod = dto.preparationMethod ?? current.preparationMethod`；`preparationNote = dto.preparationNote !== undefined ? dto.preparationNote : current.preparationNote`；`preparationSource` 同理；
6. `resolvedPreparationMethod = await this.resolveDesignItemPreparationMethod(preparationMethod, ingredientId, dto.nutritionFoodId)`；
7. `preparationData = this.buildPreparationCreateData({ explicitMethod: preparationMethod, explicitNote: preparationNote, explicitSource: parsePreparationSourceInput(preparationSource), resolvedMethod: resolvedPreparationMethod })`；
8. 补剂目标：
   - `isSupplement = await this.isIngredientIdSupplement(ingredientId)`；
   - 是：`resolveDesignSupplementTargetsForWrite({ nutritionFoodId, explicitTargets: undefined, legacyTargetKey: undefined, legacyTargetValue: undefined, weightG, includeInAssessment: current.includeInAssessment, baseTotalWeightG: current.totalWeightG })`；
   - 不是：目标字段全部 null；
9. `$transaction`：`designRecipeItem.delete({ where: { id: itemId } })`；`designRecipeItem.create({ data: { designRecipeId: current.id, ingredientId, nutritionFoodId, weightG, ...preparationData, ...targets, sortOrder: current.sortOrder, includeInAssessment: current.includeInAssessment }, select: DESIGN_RECIPE_ITEM_CLIENT_SELECT })`；`designRecipe.update({ where: { id: current.id }, data: { contentRevision: { increment: 1 } } })`；返回 created。

- [ ] **Step 1: 写测试**

`replace-item.spec.ts`：用 `Object.create(RecipeDesignerService.prototype)`，覆写 `assertItemEditableByUser`（返回 `{ id:'draft-1', weightG:100, sortOrder:2, includeInAssessment:true, nutritionFoodId:'nf-1', ingredientId:'ing-1', totalWeightG:900, preparationMethod:'生', preparationNote:null, preparationSource:'AUTO' }`）、`resolveDesignItemIngredientId`（→ 'ing-2'）、`resolveDesignItemPreparationMethod`（→ '生'）、`buildPreparationCreateData`（→ `{ preparationMethod:'生', preparationSource:'AUTO' }`）、`isIngredientIdSupplement`（→ false）、`parsePreparationSourceInput`（→ 'AUTO'）。
`prisma`：`designRecipeItem.findFirst` → null；`$transaction` 执行回调，`tx.designRecipeItem.delete/create`、`tx.designRecipe.update` 各 jest.fn；`create` 返回 `{ id:'item-2', name:'鸡胸肉' }`。
断言：delete/create/update 都调用；create data `sortOrder:2`、`includeInAssessment:true`、`weightG:100`；`update` data `contentRevision:{increment:1}`；返回 created。
第二个用例：重复 `findFirst` 返回 `{ id:'item-9' }` → `BadRequestException`，`$transaction` 不调用。

- [ ] **Step 2: RED**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/replace-item.spec.ts --runInBand`
Expected: FAIL（`replaceItem` 不存在）。

- [ ] **Step 3: 实现 DTO + service**

按上面实现。

- [ ] **Step 4: GREEN**

Run 同上 → 2/2。
Run `cd backend && npx jest tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand` → 199/199 不回归。

- [ ] **Step 5: 提交**

```bash
git add backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/agent/replace-item.spec.ts
git commit --only <the 3 exact files> -m "feat(recipe-designer): add replace item transaction"
```

---

### Task 2: 适配器原料写方法

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts`
- Modify: `backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.read.spec.ts`（或新建 `...adapter.write.spec.ts`）

**Interfaces:**
- `addItem(draftId, input)`：
  - `assertDraft(draftId)`；
  - `resolveWritableNutritionFood(input.nutritionFoodId)`：Prisma `nutritionFood.findUnique`，`status==='VERIFIED'`、`mappings` 有 primary；返回 `{ ingredientId, type }`；找不到 → `RecipeAgentPortError('INGREDIENT_NOT_FOUND')`；未验证/无 mapping → `INVALID_ARGUMENT`；
  - `assertNotDuplicate(draftId, nutritionFoodId)`：`designRecipeItem.findFirst`；
  - `service.addItem(draftId, { nutritionFoodId, ingredientId, weightG: input.weightG, ...(input.preparationMethod ? {preparationMethod} : {}) }, access)`；
  - 返回映射后的 `AgentDraftItem`。
- `replaceItem(itemId, input)`：
  - `assertItemInDraft(itemId)`；
  - `resolveWritableNutritionFood`；
  - `assertNotDuplicate(draftId, nutritionFoodId, itemId)`；
  - `service.replaceItem(itemId, { nutritionFoodId, ingredientId, ...(weightG ? {weightG} : {}) }, access)`。
- `updateWeight(itemId, weightG)`：`assertItemInDraft`；`service.updateItem(itemId, { weightG }, access)`。
- `removeItem(itemId)`：`assertItemInDraft`；`service.removeItem(itemId, access)`。
- `setPreparation(itemId, { method, note })`：`assertItemInDraft`；`service.updateItem(itemId, { preparationMethod: method, preparationNote: note ?? null, preparationSource: 'MANUAL' }, access)`。
- `assertItemInDraft(itemId)`：`prisma.designRecipeItem.findUnique({ where:{id}, select:{ designRecipeId:true } })`；不存在/不属于 → `RecipeAgentPortError('INVALID_ARGUMENT', ...)`。
- 所有服务抛出的 `BadRequestException`/`NotFoundException`：适配器不吞，让工具边界映射；`RecipeAgentPortError` 保留 code。

- [ ] **Step 1: 测试**
  - 未验证档案 → `INGREDIENT_NOT_FOUND`/`INVALID_ARGUMENT`，`service.addItem` 不调用；
  - 重复 → `INVALID_ARGUMENT`，不调用；
  - 正常 add：断言 `service.addItem` 收到真实 `ingredientId` 和 `weightG`；
  - 其他草稿的 item → `INVALID_ARGUMENT`，不调用；
  - `replaceItem` 调 `service.replaceItem`；
  - `setPreparation` 传 `MANUAL`。
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN**（read spec + 新写 spec 全绿；agent 目录全绿）
- [ ] **Step 5: 提交**（适配器 + spec；`feat(recipe-agent): add ingredient write methods`）

---

### Task 3: 文案 + 生产步骤

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.write.spec.ts`

**Interfaces:**
- `setCopy(draftId, patch)`：
  - `draft = service.getDraft(draftId, access)`；
  - 若 `patch.name`：
    - 有 `seriesId`：查 `prisma.recipe.count({ where:{ seriesId, status:'PUBLIC' } })`；>0 → `RecipeAgentPortError('INVALID_ARGUMENT','系列已有已发布食谱，改名需要人工确认')`；否则 `service.renameSeries(seriesId, { name }, access)`；
    - 无 seriesId：`service.updateDraft(draftId, { name }, access)`；
  - 有 seriesId 且 `coverTitle/sellingPoint/targetHealthTags` 任一：`service.updateSeriesReleaseSettings(seriesId, { ...only provided }, access)`；
  - 无 seriesId 且 `targetHealthTags`：`service.updateDraft(draftId, { targetHealthTags }, access)`；
  - `coverTitle/sellingPoint/description`：`service.updateDraftPresentation(draftId, { ...only provided }, access)`（有系列时仍写草稿展示字段，保证详情可见；系列值优先由 `getDraft` 读）。
- `setProductionSteps(draftId, steps)`：
  - `parseDuration('5 分钟')` → 5；`parseTemperature('180℃')` → 180；空/非法 → `INVALID_ARGUMENT`；
  - `sortOrder` 1..n；instruction/equipment 非空；duration 1..1440；temperature -50..500；
  - `service.updateDraftProductionSteps(draftId, { steps: parsed }, access)`。

- [ ] **Step 1: 测试**
  - 有系列：name → renameSeries；coverTitle → updateSeriesReleaseSettings；description → updateDraftPresentation；
  - 系列有 PUBLIC → 改名拒绝，renameSeries 不调用；
  - 无系列：name → updateDraft；
  - steps：`'5 分钟'`/`'180℃'` 转 5/180；`'abc'` → `INVALID_ARGUMENT`，服务不调用。
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN**
- [ ] **Step 5: 提交**（适配器 + spec；`feat(recipe-agent): add copy and production step writes`）

---

### Task 4: 评估 + 端口错误码

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/recipe-agent.port.ts`（或 `agent-types.ts`）
- Modify: `backend/src/application/recipe-designer/agent/write-tools.ts`
- Modify: `backend/src/application/recipe-designer/agent/tool-registry.ts`
- Modify: `backend/src/application/recipe-designer/agent/recipe-designer-agent.adapter.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-designer-agent.adapter.write.spec.ts` + `write-tools.spec.ts`/`tool-registry.spec.ts`

**Interfaces:**
```ts
export class RecipeAgentPortError extends Error {
  constructor(public readonly code: AgentToolErrorCode, message: string) {
    super(message);
    this.name = 'RecipeAgentPortError';
  }
}
```
- 适配器 `runAssessment(draftId)`：
  - `service.assessDraftForAgent(draftId, access)`；
  - 成功：用 `assessment.groupedEntries` 映射 `AgentAssessmentView`（entries、counts、contentRevision；marginPercent null）；
  - `ConflictException` → `throw new RecipeAgentPortError('ASSESSMENT_STALE', '草稿在评估期间被修改，请重新评估')`；
  - 其他 `BadRequestException`/`NotFoundException` → `INVALID_ARGUMENT`。
- `write-tools.callPort` 返回 `{ ok:false, code?: AgentToolErrorCode, message }`；`RecipeAgentPortError` 的 code 透传；各工具用 `written.code ?? 'INVALID_ARGUMENT'`。
- `tool-registry.withBoundary`：`error instanceof RecipeAgentPortError` → `{ code: error.code, message }`；其余保持 `CONTROL_NOT_AVAILABLE`。
- `check-tools.run_assessment` 的 port 调用若抛 `RecipeAgentPortError`，同样透传。

- [ ] **Step 1: 测试**
  - 适配器：`assessDraftForAgent` 抛 `ConflictException` → `RecipeAgentPortError` code `ASSESSMENT_STALE`；
  - `run_assessment` 工具在 port 抛 `RecipeAgentPortError('ASSESSMENT_STALE')` 时返回 `{ ok:false, error:{ code:'ASSESSMENT_STALE' } }`，不是 `CONTROL_NOT_AVAILABLE`；
  - `add_ingredient` 的 port 抛 `RecipeAgentPortError('INGREDIENT_NOT_FOUND')` → 工具 error code 保留；
  - 成功评估映射 entries/counts/contentRevision。
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN**
- [ ] **Step 5: 提交**（端口/工具/适配器 + specs；`feat(recipe-agent): preserve port error codes`）

---

## 评审结论（已完成）

P0b-2b 评审：**READY WITH NITS**，无阻塞；13 个 spec / 225 个测试全绿。非阻塞项：nutritionFood 无 primary mapping 时会退到第一条 mapping；`set_copy` 只改名/标签时 `contentRevision` 不一定 +1（P0b-3 的快照/撤销不能只看 revision）；`set_copy` 多字段非原子；评估计数从 grouped entries 重算；重复原料无数据库唯一约束（依赖运行锁）。`setPreparation` 省略备注会清空备注的坑已修（`1a806d38`）。

## 接下来（P0b-3，不在本计划）

- `RecipeAgentControlService`：`askUser`/`requestException`/`finishDraft`/`getApprovalState`；会话/审批落库；`request_exception` 的 `COMPLIANCE` → `COMPLIANCE_EXCEPTION` 映射，`CATEGORY_OMISSION` 从最近一次 `check_coverage` 取缺类，不解析自由文本。
- `deepseek-tools-chat.ts`：工具调用循环、30 次/6 分钟/重试、usage 落库。
- `app.module.ts` 接线；启动时 `markInterruptedRuns()`；一草稿一运行锁。
- 每次写/人工改后用新 `getDraft` 重建 `DraftHealthTagPolicy`。
- 快照表写入（交付时）。
