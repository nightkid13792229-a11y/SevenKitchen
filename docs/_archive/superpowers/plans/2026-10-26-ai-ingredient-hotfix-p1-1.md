# AI 新增原料 · P1.1 补丁（停摆修复 + 完整度提醒 + 独立配置）Implementation Plan

**Goal:** 修掉上线后第一次真实使用暴露的卡点——AI 读几份词条就被判“原地打转”、步骤只显示中文标签不显示调用了哪个工具、来源记录不显示来自哪个库、核验报告对空字段零提示、没核验过时改动没有明确文案；并把「AI 添加原料」加进后台 AI 用途清单，让它能有独立配置。

**Architecture:** 不动架构。把「是否算有进展」从“有没有写字段”改成“这次调用是不是新的（工具＋参数指纹）”＋原有信号；给原料核验加一条**只提醒不阻断**的完整度规则；把核验横幅文案抽成纯函数并区分“从没跑过”和“改动后没跑过”。

**Tech Stack:** NestJS、Jest、Vue 3、Element Plus、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-25-ai-ingredient-workbench-design.md`
**事故证据:** 2026-10-26 19:07–19:11 生产日志，草稿 `80a515f9-0d1b-4576-a3ed-2b1531376f01`：第三轮 `searchNames` + 3×`getRecord`（三个不同 id）被 `NO_PROGRESS` 停止；草稿 `profiles=null`、提案 0 条、仅 5 个字段有值。

## Global Constraints

- 只改 `backend/` 与 `admin-web/`；不碰 `miniapp/`。
- 不新增 npm 依赖；不改 Prisma schema / migration。
- 不改变授权闸门的判定口径；完整度只进 `warnings`，不得进入 `blocking`/`exceptionable`。
- 停止阈值仍是连续 3 次“没有新信息”，但**不同参数的调用不算重复**。
- AI 用途标识必须与后端常量完全一致：`INGREDIENT_INTAKE`（`ingredient-creation-intake.service.ts`）。
- 测试命令：后端 `cd backend && npx jest <path> --runInBand`；前端 `cd admin-web && npx vitest run <path>`。
- 每个任务一次提交；只 `git add` 本任务文件；不 push（最后统一部署）。

## Review Focus

1. **不同参数的只读调用被误判为重复**：连续读 3 个不同 `getRecord` 必须继续；同一 id 读 3 次才停。
2. **新调用永远算进展**：只要工具或参数变了就算探索，哪怕没有写字段；否则模型换个思路也会被杀。
3. **完整度提醒不能拦住授权**：只出现在 `warnings`，`blocking`/`exceptionable` 计数不许变。
4. **用途标识写错**：`INGREDIENT_INTAKE` 拼错就永远回落，后台配了也不生效。
5. **横幅文案**：从没跑过 vs 改动后没跑过，必须是两句不同的话。
6. **工具名与来源库**：步骤行要能看见 `searchNames` / `getRecord` 这类原始工具名；来源摘要要写清 USDA / CNF 等库名，别只给覆盖率。
7. **searchNames 不许冒充“已读”**：它只列清单，不能把命中 id 当成已消费；否则真正去读时会被误判为重复。

---

### Task 1: 进展判定改为「调用指纹」

**Files:**
- Create: `backend/src/application/ingredient-creation/agent-progress.ts`
- Create: `backend/tests/application/ingredient-creation/agent-progress.spec.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-draft-agent.service.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts`
- Modify: `backend/tests/application/ingredient-creation/ingredient-creation-tools.ingredient.spec.ts`
- Modify: `backend/tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts`（若已有可用的脚本化运行时用例，补一条端到端）

**Interfaces:**
- `interface AgentProgressInput { sourceRecordIds?: readonly string[]; writtenFieldPaths?: readonly string[] }`
- `function trackAgentProgress(input: { progress: AgentProgressInput | undefined; signature: string; seenSignatures: Set<string>; seenSourceRecordIds: Set<string> }): boolean` —— 纯判定，副作用只有向两个 Set 里加值：返回“这次调用是否算有新信息”。
- 规则：
  1. `signature` 不在 `seenSignatures` → 加入并返回 `true`（新探索）。
  2. 出现 `seenSourceRecordIds` 里没有的来源 id → 加入并返回 `true`。
  3. `writtenFieldPaths.length > 0` → 返回 `true`。
  4. 以上都不满足 → `false`（真正的原地打转）。

- 同时修一个语义错误：`searchNames` 现在把**命中的全部 id** 都报成“已见过的来源”（`tools.service.ts` 约 1210 行），可它只是列了个清单、并没有读。于是后面真正 `getRecord` 读其中三条时，系统认为“这些早知道了”，连续三次判为没有新进展——这正是本次停摆的直接原因。改成：`searchNames` 不再上报 `sourceRecordIds`；只有 `getRecord` 上报它真正读过的 id。

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/ingredient-creation/agent-progress.spec.ts
import { trackAgentProgress } from 'src/application/ingredient-creation/agent-progress';

const sets = () => ({ seenSignatures: new Set<string>(), seenSourceRecordIds: new Set<string>() });

describe('trackAgentProgress', () => {
  it('同一工具同一参数第二次不算进展', () => {
    const s = sets();
    expect(trackAgentProgress({ progress: undefined, signature: 'getRecord:1', ...s })).toBe(true);
    expect(trackAgentProgress({ progress: undefined, signature: 'getRecord:1', ...s })).toBe(false);
  });

  it('同工具不同参数每次都是新信息', () => {
    const s = sets();
    expect(trackAgentProgress({ progress: undefined, signature: 'getRecord:1', ...s })).toBe(true);
    expect(trackAgentProgress({ progress: undefined, signature: 'getRecord:2', ...s })).toBe(true);
    expect(trackAgentProgress({ progress: undefined, signature: 'getRecord:3', ...s })).toBe(true);
  });

  it('重复调用但带回新来源 id 仍算进展', () => {
    const s = sets();
    trackAgentProgress({ progress: undefined, signature: 'search:x', ...s });
    expect(trackAgentProgress({ progress: { sourceRecordIds: ['src-1'] }, signature: 'search:x', ...s })).toBe(true);
  });

  it('写入字段永远算进展', () => {
    const s = sets();
    trackAgentProgress({ progress: undefined, signature: 'update:x', ...s });
    expect(trackAgentProgress({ progress: { writtenFieldPaths: ['ingredient.name'] }, signature: 'update:x', ...s })).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/agent-progress.spec.ts --runInBand`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `trackAgentProgress`**

按上面的 4 条规则实现；不读环境、不写日志。

- [ ] **Step 4: 接入循环**

`runLoop` 里维护 `seenCallSignatures = new Set<string>()`；每执行完一个工具调用，用
`` `${toolName}:${hashDraftPayload(args ?? {})}` `` 生成指纹（复用 `draft-payload-hash.ts`，避免参数键顺序导致“同一次调用两个指纹”）。

`recordProgress` 有**两个调用点**（function-calling 分支与 JSON 动作分支），两处都要换成 `trackAgentProgress`，旧方法删除。`askUser` 仍走 `pendingQuestion` 立即收尾，不参与计数。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/agent-progress.spec.ts tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts --runInBand`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/src/application/ingredient-creation/agent-progress.ts backend/tests/application/ingredient-creation/agent-progress.spec.ts backend/src/application/ingredient-creation/ingredient-draft-agent.service.ts
git commit -m "fix(ingredient-creation): count new tool calls as agent progress"
```

---

### Task 2: 核验报告加「完整度」提醒

**Files:**
- Modify: `backend/src/domain/ingredient-creation/ingredient-card-check.ts`
- Modify: `backend/tests/domain/ingredient-creation/ingredient-card-check.spec.ts`
- Modify: `backend/tests/application/ingredient-creation/ingredient-check-run.service.spec.ts`（断言分档：完整度只进 warning）

**Interfaces:**
- 新规则码：`FIELDS_EMPTY`，档位 `warning`，追加在 `INGREDIENT_CARD_RULES` 末尾。
- 统计范围：`INGREDIENT_CARD_FIELDS` 里 `stage === 'CREATABLE'` 且不在 `['name','type','baseUnit','unitDisplayLabel']` 的字段；空值口径复用现有 `hasValue`（`null`/`undefined`/`''` 为空，`0`/`false` 不算空）。
- 消息：`还有 N 项没填：<最多 8 个标签，顿号分隔>${N>8?' 等':''}`；`suggestion`：`这些不是阻断项，补不补由你定`。不带 `fieldPath`（无法定位到单格）。
- 不影响 `blocking` / `exceptionable`。

- [ ] **Step 1: 写失败的测试**

```ts
it('空字段给出完整度提醒，但不阻断', () => {
  const items = runIngredientCardCheck({
    ingredient: { name: '鹌鹑肉', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克' },
    existingNames: [],
  });
  const warning = items.find((i) => i.code === 'FIELDS_EMPTY');
  expect(warning).toBeTruthy();
  expect(warning?.message).toMatch(/还有 \d+ 项没填/);
  expect(INGREDIENT_CARD_RULES.find((r) => r.code === 'FIELDS_EMPTY')?.level).toBe('warning');
});

it('填满可填字段后不再提示完整度', () => {
  // 需要从契约文件额外 import INGREDIENT_CARD_FIELDS
  // 用契约生成：CREATABLE 且非 4 个必填项，每项给一个合法非空值
  const full: Record<string, unknown> = {
    name: '鹌鹑肉', type: 'FOOD', baseUnit: 'G', unitDisplayLabel: '克',
  };
  for (const field of INGREDIENT_CARD_FIELDS) {
    if (field.stage !== 'CREATABLE') continue;
    if (field.key === 'name' || field.key === 'type' || field.key === 'baseUnit' || field.key === 'unitDisplayLabel') continue;
    full[field.key] =
      field.key === 'category' ? 'MEAT_ORGAN'
      : field.key === 'procurementStrategy' ? 'DAILY_PURCHASE'
      : field.key === 'addTiming' ? 'BEFORE_MIXING'
      : field.valueType === 'NUMBER' || field.valueType === 'BOOLEAN' ? 1
      : 'x';
  }
  const items = runIngredientCardCheck({ ingredient: full as never, existingNames: [] });
  expect(items.some((i) => i.code === 'FIELDS_EMPTY')).toBe(false);
});
```

> 分档不在这个纯函数里做：`IngredientCheckRunService` 按 `INGREDIENT_CARD_RULES` 把 code 分到 blocking/exceptionable/warning。补一条服务层用例——只填 4 个必填项的草稿跑 INGREDIENT 域，`counts.blocking === 0` 且 `counts.warning >= 1`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/domain/ingredient-creation/ingredient-card-check.spec.ts --runInBand`
Expected: FAIL —— 没有 `FIELDS_EMPTY`。

- [ ] **Step 3: 实现规则并调整既有断言**

既有的“干净草稿零问题”（只给 4 个必填字段）现在会多一条 warning：把它改成断言“没有 blocking/exceptionable”，或显式断言只有 `FIELDS_EMPTY` 一条。其它用 `toContain`/按 code 过滤的用例不受影响。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/domain/ingredient-creation tests/application/ingredient-creation --runInBand`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/domain/ingredient-creation/ingredient-card-check.ts backend/tests/domain/ingredient-creation/ingredient-card-check.spec.ts
git commit -m "feat(ingredient-creation): warn about empty ingredient fields"
```

---

### Task 3: 横幅区分「还没核验」与「改动后没核验」

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/checkReportView.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/checkReportView.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`

**Interfaces:**
- `function staleBannerText(input: { hasRun: boolean; fresh: boolean; touchedSinceLoad: boolean }): string`
  - `fresh` → `''`
  - 有报告但不新鲜 → `'报告已过期，改过之后要重跑'`
  - 没报告且 `touchedSinceLoad` → `'改动后还没核验，跑一次才能授权'`
  - 没报告且没改过 → `'这一页还没核验，跑一次才能授权'`

- [ ] **Step 1: 写失败的测试**

```ts
it('没报告但改过 → 说“改动后还没核验”', () => {
  expect(staleBannerText({ hasRun: false, fresh: false, touchedSinceLoad: true }))
    .toBe('改动后还没核验，跑一次才能授权');
});
it('没报告也没改 → 说“这一页还没核验”', () => {
  expect(staleBannerText({ hasRun: false, fresh: false, touchedSinceLoad: false }))
    .toBe('这一页还没核验，跑一次才能授权');
});
it('有报告且新鲜 → 不提示', () => {
  expect(staleBannerText({ hasRun: true, fresh: true, touchedSinceLoad: true })).toBe('');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/checkReportView.spec.ts`
Expected: FAIL —— `staleBannerText` 不存在。

- [ ] **Step 3: 实现并在页面接线**

页面新增 `draftTouched` ref：任何一次成功的草稿保存（原料格、营养格、例外）置 `true`；`loadDraft` 成功时置 `false`。横幅改调 `staleBannerText`。

- [ ] **Step 4: 跑测试 + 类型检查**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent` 与 `npx vue-tsc -p tsconfig.app.json --noEmit`
Expected: 全绿、exit 0。

- [ ] **Step 5: 提交**

```bash
git add admin-web/src/views/Ingredients/ai-agent/checkReportView.ts admin-web/src/views/Ingredients/ai-agent/checkReportView.spec.ts admin-web/src/views/Ingredients/ai-agent/index.vue
git commit -m "fix(admin-web): distinguish never-checked from edited-since-check"
```

---

### Task 4: 后台 AI 用途清单加「AI 添加原料」

**Files:**
- Modify: `admin-web/src/constants/agentPurposes.ts`
- Modify: `admin-web/src/constants/agentPurposes.spec.ts`

**Interfaces:**
- 在 `AGENT_PURPOSES` 里新增：
  ```ts
  {
    purpose: 'INGREDIENT_INTAKE',
    label: 'AI 添加原料',
    description: '原料识别、营养词条匹配与草稿起草（对话式 Agent）',
    defaultModel: 'deepseek-v4-pro',
  }
  ```
- 后端不用改：`agent-settings` 的 `purpose` 是自由字符串，按 `purpose` 存一行配置。

- [ ] **Step 1: 写失败的测试（沿用健康模块那组断言的写法）**

```ts
it('AI 添加原料在清单里，标识与后端一致', () => {
  const meta = find('INGREDIENT_INTAKE');
  expect(meta).toBeTruthy();
  expect(meta?.label).toContain('原料');
  expect(meta?.defaultModel).toBe('deepseek-v4-pro');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/constants/agentPurposes.spec.ts`
Expected: FAIL —— 找不到该用途。

- [ ] **Step 3: 加进清单并跑绿**

Run: `cd admin-web && npx vitest run src/constants/agentPurposes.spec.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add admin-web/src/constants/agentPurposes.ts admin-web/src/constants/agentPurposes.spec.ts
git commit -m "feat(admin-web): expose INGREDIENT_INTAKE agent purpose"
```

---

### Task 5: 步骤里显示工具名与来源库

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts`（`getRecord` 返回 `sourceType`）
- Modify: `backend/src/application/ingredient-creation/ingredient-draft-agent.service.ts`（`buildToolStepSummary` 去掉 UUID）
- Modify: `backend/tests/application/ingredient-creation/ingredient-creation-tools.ingredient.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/stepView.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/stepView.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`

**Interfaces:**
- `getRecord` 的返回增加 `record.sourceType: string`（如 `USDA` / `CNF` / `NZFCD` / `MEXT`）。
- `buildToolStepSummary('getRecord', args)` 不再把 UUID 拼进步骤标题（现在显示成「读来源记录 ee93ecc5-…」，用户会当成乱码）；标题只写「读来源记录」，真正的名字与库名由执行后的 `resultSummary` 给出，UUID 留在展开明细里。
- `AgentRecordEvidenceView` 增加 `sourceType: string | null`；`message` 改成
  `来源记录「${name}」· ${sourceType ?? '未知库'} · 覆盖率 ${coverageLabel} · 读到 ${count} 项`。
- 步骤行（`index.vue`）在中文标签旁渲染一个等宽小标签，内容就是原始工具名 `step.name`（`searchNames` / `summarizeByKeyword` / `getRecord` / `writeNutrition` / `writeIngredient` / `runCheck` / `askUser` / `finish`）。

- [ ] **Step 1: 写失败的测试**

后端：
```ts
it('getRecord 返回来源库', async () => {
  const result = await service.execute({ /* 读一条 USDA 记录 */ });
  expect(result.content).toContain('USDA');
});
```
前端：
```ts
it('来源记录摘要带来源库与覆盖率', () => {
  const view = toRecordEvidenceFromEvent({ record: { name: 'Quail, meat only, raw', sourceType: 'USDA', coverage: 83.3, values: new Array(50).fill(null) } });
  expect(view?.message).toContain('USDA');
  expect(view?.message).toContain('83.3%');
  expect(view?.message).toContain('读到 50 项');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-tools.ingredient.spec.ts --runInBand` 与 `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/stepView.spec.ts`
Expected: FAIL —— 没有 `sourceType`、摘要里没有来源库。

- [ ] **Step 3: 实现并在步骤行加工具名标签**

后端 `getRecord` 的 `select` 加 `sourceType: true` 并透传；前端证据视图与摘要字符串按上面的格式；`index.vue` 的步骤标题旁加 `<code>{{ step.name }}</code>`（样式沿用现有小标签，别抢中文标签的视觉层级）。

- [ ] **Step 4: 跑测试 + 类型检查**

Run: `cd backend && npx jest tests/application/ingredient-creation --runInBand`；`cd admin-web && npx vitest run src/views/Ingredients/ai-agent && npx vue-tsc -p tsconfig.app.json --noEmit`
Expected: 全绿、exit 0。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts backend/tests/application/ingredient-creation/ingredient-creation-tools.ingredient.spec.ts admin-web/src/views/Ingredients/ai-agent/stepView.ts admin-web/src/views/Ingredients/ai-agent/stepView.spec.ts admin-web/src/views/Ingredients/ai-agent/index.vue
git commit -m "feat(ingredient-creation): show tool names and source libraries in steps"
```

---

### Task 6: 回归与部署

- [ ] **Step 1: 后端**

Run: `cd backend && npx jest tests/application/ingredient-creation tests/domain/ingredient-creation tests/interfaces/controllers/ingredient-creation.controller.spec.ts tests/interfaces/common --runInBand`
Expected: 全绿。

- [ ] **Step 2: 前端**

Run: `cd admin-web && npx vitest run` 与 `npx vue-tsc -p tsconfig.app.json --noEmit`
Expected: 全绿、exit 0。

- [ ] **Step 3: 合并到 main 并推送**

先 `git fetch origin`，把 `origin/main` 合进本分支、解冲突、重跑上面两组测试，再 `git push origin HEAD:main`。

- [ ] **Step 4: 部署**

后端有改动 → `bash backend/scripts/remote_deploy_v2.sh`；前端有改动 → `bash deploy-admin-web.sh`。两边都要发。

- [ ] **Step 5: 上线后自查**

1. 后台「AI 设置」出现「AI 添加原料」，能单独启用/选模型。
2. 完整跑一单：AI 读多份词条不再停；只有同一调用重复 3 次才停。
3. 原料核验在字段没填满时出现一条「还有 N 项没填」的提醒，阻断仍为 0，授权不被它拦住。
4. 从没核验时改一格 → 横幅出现「改动后还没核验」；跑过再改 → 出现「报告已过期」。

**不在本补丁**：P2 留痕、P3 循环重写/联网/来源审核、P4 经验本。它们按原设计另行出计划。
