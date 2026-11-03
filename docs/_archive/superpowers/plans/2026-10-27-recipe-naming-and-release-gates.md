# 食谱命名与发布门禁 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在产品线发布页与定制上线检查抽屉里，给食谱名加一个「AI 生成」按钮；产品线发布新增「已归类」门禁，并在抽屉内提供快速归类；名称硬限 12 字。

**Architecture:** 后端新增一个一次性的命名生成服务（与现有 `recipe-copywriting.service.ts` 同构，复用 `callDeepSeekJson`），发布门槛在纯函数 `series-release-readiness.ts` 里加一条 blocker；前端抽一个 `AiNameField` 组件两处复用，抽屉内嵌一个精简版归类面板。

**Tech Stack:** NestJS + Prisma（后端）；Vue 3 + Element Plus + Vitest（admin-web）

**Spec:** `docs/superpowers/specs/2026-10-27-recipe-naming-and-release-gates-design.md`

## Global Constraints

- 命名字数**硬限 12 字**（全角计，含「｜」）；其余全部软约束。
- 命名格式 `价值点｜食材`，分隔符用全角「｜」。
- AI 只能读系统事实（配料占比、营养评估、生命阶段），不得虚构。
- 命名**不写分类**：不做任何"起名顺带归类"的回填。
- 主蛋白**不必填**；`TAXONOMY_REQUIRED` 的口径是"至少一条归属"，不是"必须有主蛋白"。
- 定制（`designMode=ORDER` / `businessStatus=PRIVATE_CUSTOM`）**不计算** `TAXONOMY_REQUIRED`。
- 禁用词只做软提示，**不阻断**保存与发布。
- 后端验证：`cd backend && npx jest <path>`；类型检查 `npx tsc --noEmit`，只要求本次触碰文件不新增错误（仓库基线有 297 个历史错误）。**联调期间不要跑 `npm run build`。**
- 前端验证：`cd admin-web && npx vitest run`；类型检查 `npx vue-tsc --noEmit`。
- 提交信息中文，格式 `feat(recipe-naming): ...`。

## Review Focus

- **AI 返回超长名字** → 必须在前端丢弃而不是截断，截断会造出一个意思不通的名字。
- **AI 返回非 JSON / 空候选 / 接口超时** → 按钮要恢复可点，并给一句人话，不能卡在 loading。
- **未归类的双拼菜** → 只挂了"场景"也应放行；不能因为主蛋白为空就拦住。
- **定制食谱走发布检查** → 不应出现"未归类"阻断项。
- **老名字 12 字整** → 正好卡线的名字必须能保存能发布，不能因 > 或 >= 写错被拦。
- **AI 服务未配置** → 按钮应禁用并说明原因，而不是点了报 500。

---

### Task 1: 命名生成服务与提示词

**Files:**
- Create: `backend/src/application/recipe-designer/recipe-naming.service.ts`
- Create: `backend/tests/application/recipe-designer/recipe-naming.service.spec.ts`

**Interfaces:**
```ts
export interface RecipeNamingInput {
  foodItems: Array<{ name: string; ratio: number | null }>;
  energyDensityKcalPerKg?: number | null;
  moisturePercent?: number | null;
  proteinPercentDm?: number | null;
  fatPercentDm?: number | null;
  lifeStageLabels: string[];
  currentName?: string | null;
}
export interface RecipeNameCandidate {
  name: string;
  valuePoint: string;
  ingredients: string;
  reason: string;
}
generate(input: RecipeNamingInput): Promise<{ candidates: RecipeNameCandidate[]; provider: string }>
buildRecipeNamingSystemPrompt(): string
```

- [ ] **Step 1: 写失败测试** —— 断言：超过 12 字的候选被丢弃；命中 `getForbiddenClaimPatterns()` 的候选被标记（不丢弃）；返回不足 1 条候选时抛 `BadRequestException`。
- [ ] **Step 2: 运行确认失败** —— `npx jest tests/application/recipe-designer/recipe-naming.service.spec.ts`
- [ ] **Step 3: 实现** —— 照 `recipe-copywriting.service.ts` 的结构：取 Provider 配置（purpose 用新常量 `RECIPE_NAMING`）、`callDeepSeekJson`、`temperature: 0.7`（命名要发散）、归一化候选。
- [ ] **Step 4: 提示词** —— `buildRecipeNamingSystemPrompt()` 写明：格式 `价值点｜食材`、每条 ≤12 字（全角）、价值点必须能从输入事实推出、禁止疾病/医疗/功效词、食材按占比取真实配料、输出 JSON。
- [ ] **Step 5: 运行确认通过**
- [ ] **Step 6: 提交**

```bash
git add backend/src/application/recipe-designer/recipe-naming.service.ts backend/tests/application/recipe-designer/recipe-naming.service.spec.ts
git commit -m "feat(recipe-naming): generate name candidates from recipe facts"
```

---

### Task 2: 命名接口

**Files:**
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`（发布页与抽屉都走 admin 域）
- Modify: `backend/src/app.module.ts`（注册 `RecipeNamingService`）
- Create: `backend/tests/controllers/recipe-naming.controller.spec.ts`

**Interfaces:**
- `GET api/v1/admin/recipe-designer/naming/availability` → `{ available: boolean }`
- `POST api/v1/admin/recipe-designer/series/:seriesId/name-candidates` → `{ candidates, provider }`
- 服务端按 `seriesId` 自行取草稿配料与评估，不接受前端传配方事实（防伪造）

- [ ] **Step 1: 路由契约测试**（沿用仓库 `Reflect.getMetadata` 写法）
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现** —— 控制器取 `seriesId` → 调 `RecipeDesignerService` 拿最新草稿的配料/评估 → 组 `RecipeNamingInput` → 调服务。
- [ ] **Step 4: 注册 provider，运行测试 + `npx tsc --noEmit`**
- [ ] **Step 5: 提交**

---

### Task 3: 发布门禁「已归类」

**Files:**
- Modify: `backend/src/domain/recipe-designer/series-release-readiness.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts:4498`（`buildSeriesReleaseReadinessForSeries` 传入归属数）
- Test: `backend/tests/domain/recipe-designer/series-release-readiness.taxonomy.spec.ts`

**Interfaces:**
- `SeriesReleaseBlockerCode` 增加 `'TAXONOMY_REQUIRED'`
- `BuildSeriesReleaseReadinessInput` 增加 `taxonomyLinkCount?: number`
- blocker 形状：`{ code: 'TAXONOMY_REQUIRED', scope: 'SERIES', message: '这道菜还没有任何需求分类，发布后它进不了货架分组' }`

- [ ] **Step 1: 写失败测试** —— 归属数为 0 时产生 blocker；为 1 时不产生；`businessStatus=PRIVATE_CUSTOM` 或 `designMode=ORDER` 时不产生。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（纯函数加一条判断，不碰数据库）
- [ ] **Step 4: 服务层接线** —— 在 `buildSeriesReleaseReadinessForSeries` 里 `count` 一次归属并传入。
- [ ] **Step 5: 运行确认通过 + 提交**

---

### Task 4: 名称 12 字后端校验

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`（系列改名）
- Modify: `backend/src/application/recipe/recipe.service.ts`（单条发布）
- Test: `backend/tests/application/recipe-designer/series-name-length.spec.ts`

**Interfaces:**
- `SERIES_NAME_MAX_LENGTH = 12`，导出给前端复用口径
- 超长抛 `BadRequestException('食谱名称最多 12 个字，超了标签印不下（当前 N 字）')`

- [ ] **Step 1: 写失败测试** —— 12 字通过、13 字拒绝、空名拒绝、**11 字与 12 字边界都要测**。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（放在改名的入口，不做逐字符裁剪）
- [ ] **Step 4: 运行确认通过 + 提交**

---

### Task 5: 前端 `AiNameField` 组件

**Files:**
- Create: `admin-web/src/views/RecipeDesigner/components/AiNameField.vue`
- Create: `admin-web/src/api/recipeNaming.ts`
- Test: `admin-web/src/views/RecipeDesigner/aiNameField.regression.spec.ts`

**Interfaces:**
```ts
props: { modelValue: string; seriesId: string; placeholder?: string }
emits: 'update:modelValue'
```
- 内部：输入框 + `字数/12` + `✦ AI 生成` + 候选面板（每行显示名字、理由、字数、「采用」）
- 候选超过 12 字**不展示**；命中禁用词标红但仍可选

- [ ] **Step 1: 写回归测试** —— 断言含 `12`、`AI 生成`、`采用`、`candidates`、`filter(c => c.name.length <= 12)`。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现组件与 api 客户端**
- [ ] **Step 4: 运行测试 + `npx vue-tsc --noEmit`**
- [ ] **Step 5: 提交**

---

### Task 6: 接到产品线发布页

**Files:**
- Modify: `admin-web/src/views/RecipeDesigner/Publish.vue:198-215`
- Test: 并入 `aiNameField.regression.spec.ts`

- [ ] **Step 1: 写断言** —— Publish.vue 引用 `AiNameField`，并把采用结果写回系列名（沿用现有改名接口）。
- [ ] **Step 2: 实现** —— 「发布名称」行由只读输入框换成 `AiNameField`；无系列的独立食谱仍走原 `publishForm.name`。
- [ ] **Step 3: 运行测试 + 类型检查**
- [ ] **Step 4: 提交**

---

### Task 7: 上线检查抽屉：AI 命名 + 快速归类 + 新门禁

**Files:**
- Modify: `admin-web/src/views/RecipeDesigner/components/LaunchReadinessDrawer.vue`
- Modify: `admin-web/src/utils/recipeDesigner/launchReadiness.ts`（加 `TAXONOMY_REQUIRED`）
- Create: `admin-web/src/views/RecipeDesigner/components/QuickTaxonomyPicker.vue`
- Test: `admin-web/src/views/RecipeDesigner/quickTaxonomyPicker.regression.spec.ts`

- [ ] **Step 1: 写回归测试** —— 抽屉里有「快速归类」「已归类」「AI 生成」；`TAXONOMY_REQUIRED` 出现在检查项定义里；定制分支不渲染该门禁。
- [ ] **Step 2: 实现 `QuickTaxonomyPicker`** —— 五个分类各一行，点开复用归类树，选完即调 `replaceLinks` 并回调刷新。
- [ ] **Step 3: 接线** —— 抽屉顶部插入快速归类；门禁项点击「去挂」滚到该区。
- [ ] **Step 4: 运行测试 + 类型检查 + 提交**

---

### Task 8: 端到端验收

- [ ] **Step 1:** 本地起后端 + admin-web，用一条算好的草稿跑通：生成 3 条候选 → 采用 → 发布被「未归类」拦 → 快速归类 → 放行。
- [ ] **Step 2:** 造一条 13 字名字，确认保存被拒且文案带当前字数。
- [ ] **Step 3:** 打开一条定制配方，确认抽屉里没有「未归类」项，AI 命名按钮可用。
- [ ] **Step 4:** 后端 `npx jest tests/application/recipe-designer tests/domain/recipe-designer`、前端 `npx vitest run` 全绿后提交。

## 验收

1. 两处都能一键生成并采用；
2. 未归类拦发布、补一个分类后放行；
3. 双拼菜不挂主蛋白也能发布；
4. 老菜（12 字整名）能保存能发布；
5. 定制无该门禁。

---

## 执行记录（2026-10-27）

分支：`feature/recipe-naming`（基于 `22246b28`）

| 任务 | 提交 | 结果 |
|---|---|---|
| 1 命名生成服务 | `ed1ecb8f` | ✅ 超长候选丢弃不截断；12 字边界有测试 |
| 2 命名接口 | `b5dd00ca` | ✅ 两条路由；只生成不落库（契约测试断言） |
| 3 发布门禁「已归类」 | `cddd2ed9` | ✅ 整系列发布链路 |
| 4 12 字硬校验 | `70977240` | ✅ 纯函数 + 改名入口；边界 11/12/13 都测了 |
| 5 前端 AI 命名字段 | `93d9dbef` | ✅ 计数器、超长丢弃、禁用词软提示、不可用置灰 |
| 6 接发布页 | `372443dc` | ✅ 本地草稿 +「保存名称」，不逐字写库 |
| 抽屉门禁 | `5216ae5f` `e72eef1f` | ✅ 补到 `launch-readiness.ts` 这条链路 |
| readiness 带 seriesId | `7ee03d6c` | ✅ 抽屉要按系列命名/归类，原先只拿到 draftId |
| 抽屉命名 + 快速归类 | `9828a747` | ✅ 定制不显示归类面板；无系列的历史草稿整块不显示 |

### 实现中偏离计划的地方（都是被现实纠正的）

1. **门禁落在两个门槛函数**：计划只写了 `series-release-readiness.ts`，
   实际上线检查抽屉走的是 `launch-readiness.ts`，两条都要加。
2. **门禁改成"调用方传了计数才检查"**：直接默认 0 会把 64 个既有用例和历史草稿
   全部打成阻断。查不到分类时**跳过**而不是阻断——分类服务挂了不该让人发不出菜。
3. **没有系列的独立草稿**传 `undefined`，不传 0。

### 验证

- 后端 `npx jest tests/domain tests/application tests/controllers` → **4510 / 4511 通过**
  （唯一失败是 `supplement-aftersale.service.spec.ts` 的售后窗口用例，与实际日期相关，
  该文件 10-20 起未改动，与本次无关）
- 前端 `npx vitest run` → **81 文件 / 952 用例全绿**
- 类型：本次触碰的文件无新增错误（后端基线仍有历史错误）

### 没做的

计划里的 Task 8「端到端点击验收」只做了自动化部分，**没有在本地起服务点一遍**。
上线后需要人工验：生成候选 → 采用 → 被「未归类」拦 → 抽屉里挂一个分类 → 放行。
