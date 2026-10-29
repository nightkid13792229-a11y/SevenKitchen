# AI 添加原料 · 入口分线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 进入「AI 添加原料」时先定线路（食材 / 补剂），本期只放行食材，并在后端三处守住，避免补剂被当成食材建档。

**Architecture:** 前端一个纯函数 `resolveLineEntry` 决定线路（草稿 / 原料锁定 > 用户手选 > 入口预选），页面按线路挂不同身体；草稿类型仍由第一次起草时写入；后端在控制器入参、起草服务、授权服务三处硬拦。

**Tech Stack:** NestJS + Prisma（backend）、Vue 3 + Element Plus + TypeScript（admin-web）、Jest（backend）、Vitest（admin-web）。

**Spec:** `docs/superpowers/specs/2026-10-29-ai-ingredient-line-entry-design.md`

## Global Constraints

- 线路只有两个值：`FOOD`（食材）、`SUPPLEMENT`（补剂）。原料类型的第三个值 `PACKAGING`（包装）**不属于本页面**，决议层必须拒绝。
- 本期只放行 `FOOD`；`SUPPLEMENT` 一律返回中文文案 `LINE_NOT_OPEN_MESSAGE`，不用英文错误码当文案。
- **过渡期兼容（一个版本）**：起草请求缺 `line` 时按 `FOOD` 处理并记 warn，不报错；下个版本才收紧为必填。
- 不改数据库结构（`ingredient_creation_draft.type` 已存在）。
- 后端联调期间**不要**跑 `npm run build`（`deleteOutDir` 会删掉 `dist`，弄死本机后端）；自检只用 `npx tsc --noEmit`。
- 文案为简体中文；面向用户的句子不出现 `INTAKE`、`FOOD` 这类内部词。

## Review Focus

1. 浏览器缓存里的旧页面（请求不带 `line`）：应照常按食材跑通，不能报错。
2. `?line=supplement` 进来后点「改回食材」：应真的进入食材线，不被 URL 再拉回去。
3. 线路是补剂时用回车 / 旧快捷键触发发送：一个起草请求都不应该发出去。
4. 带 `draftId` 的请求却传了 `SUPPLEMENT`：以草稿为准，不报错、不改线。
5. 草稿或原料是 `PACKAGING`：决议拒绝并给错误卡，绝不落到食材逻辑。

---
### Task 1: 后端 · 线路判定纯函数

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-line.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-line.spec.ts`

**Interfaces:**
- Produces:
  - `export const INGREDIENT_LINES = ['FOOD', 'SUPPLEMENT'] as const`
  - `export type IngredientLine = (typeof INGREDIENT_LINES)[number]`
  - `export const LINE_NOT_OPEN_MESSAGE: string`
  - `export interface RequestedLineInput { draftId?: string; line?: IngredientLine }`
  - `export type RequestedLineDecision = { action: 'USE_DRAFT' } | { action: 'CREATE'; line: IngredientLine; compatDefault: boolean } | { action: 'REJECT'; message: string }`
  - `export function decideRequestedLine(input: RequestedLineInput): RequestedLineDecision`

- [ ] **Step 1: 写失败测试**

```ts
import {
  LINE_NOT_OPEN_MESSAGE,
  decideRequestedLine,
} from '../../../src/application/ingredient-creation/ingredient-line';

describe('decideRequestedLine', () => {
  it('有草稿时以草稿为准，忽略线路', () => {
    expect(decideRequestedLine({ draftId: 'draft-1', line: 'SUPPLEMENT' })).toEqual({
      action: 'USE_DRAFT',
    });
  });

  it('选了补剂但没有草稿 → 拒绝并给中文原因', () => {
    expect(decideRequestedLine({ line: 'SUPPLEMENT' })).toEqual({
      action: 'REJECT',
      message: LINE_NOT_OPEN_MESSAGE,
    });
  });

  it('显式选了食材 → 建食材草稿', () => {
    expect(decideRequestedLine({ line: 'FOOD' })).toEqual({
      action: 'CREATE',
      line: 'FOOD',
      compatDefault: false,
    });
  });

  it('过渡期缺线路 → 按食材建，并标记兼容默认', () => {
    expect(decideRequestedLine({})).toEqual({
      action: 'CREATE',
      line: 'FOOD',
      compatDefault: true,
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-line.spec.ts`
Expected: FAIL，`Cannot find module .../ingredient-line`

- [ ] **Step 3: 实现 `ingredient-line.ts`**

按上面的签名实现四个分支；`LINE_NOT_OPEN_MESSAGE` 文案定为：
`补剂线还没开放：补剂和食材的字段、计量口径、核验规则都不一样，这条线正在单独做。`

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-line.spec.ts`
Expected: PASS，4 passed

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-line.ts backend/tests/application/ingredient-creation/ingredient-line.spec.ts
git commit -m "feat(ingredient-creation): decide the requested line before drafting"
```

---
### Task 2: 后端 · 两个起草接口的入参校验

**Files:**
- Modify: `backend/src/interfaces/dto/ingredient-creation/agent-run.dto.ts`
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts:123-187`
- Test: `backend/tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts`（已有的 `describe('POST /api/v1/admin/ingredient-creation/agent/run')` 块内）

**Interfaces:**
- Consumes: Task 1 的 `decideRequestedLine`、`INGREDIENT_LINES`、`IngredientLine`、`LINE_NOT_OPEN_MESSAGE`
- Produces: `RunIngredientAgentDto.line?: IngredientLine`；控制器对两个接口都在 `res.flushHeaders()` **之前**做判定，`REJECT` 时抛 `BadRequestException(decision.message)`

- [ ] **Step 1: 写失败测试**（加在上述 describe 内，沿用已有的 `http()` 与 `agentService`）

```ts
it('流式接口选了补剂 → 400，且不调用起草服务', async () => {
  const response = await http()
    .post(AGENT_STREAM_PATH)
    .set('Authorization', 'Bearer admin-token')
    .send({ line: 'SUPPLEMENT', text: '鱼油' })
    .expect(400);

  expect(response.body.message).toBe(LINE_NOT_OPEN_MESSAGE);
  expect(agentService.run).not.toHaveBeenCalled();
});

it('非流式接口同样拒绝补剂', async () => {
  const response = await http()
    .post(AGENT_PATH)
    .set('Authorization', 'Bearer admin-token')
    .send({ line: 'SUPPLEMENT', text: '鱼油' })
    .expect(400);

  expect(response.body.message).toBe(LINE_NOT_OPEN_MESSAGE);
  expect(agentService.run).not.toHaveBeenCalled();
});

it('带草稿时忽略线路，照常起草且不多传字段', async () => {
  agentService.run.mockResolvedValue({
    draftId: DRAFT_ID, reply: '已填好。', toolCalls: [], steps: 1,
    toolCallCount: 0, transcript: [], mode: 'FUNCTION_CALLING',
    stopReason: null, report: buildRunReport(),
  } as IngredientAgentRunResult);

  await http()
    .post(AGENT_PATH)
    .set('Authorization', 'Bearer admin-token')
    .send({ draftId: DRAFT_ID, line: 'SUPPLEMENT', text: '鸡肝' })
    .expect(201);

  expect(agentService.run).toHaveBeenCalledWith({
    draftId: DRAFT_ID, text: '鸡肝', userId: 'admin-1',
  });
});

it('过渡期旧页面不带线路 → 照常按食材起草', async () => {
  agentService.run.mockResolvedValue({
    draftId: DRAFT_ID, reply: '已填好。', toolCalls: [], steps: 1,
    toolCallCount: 0, transcript: [], mode: 'FUNCTION_CALLING',
    stopReason: null, report: buildRunReport(),
  } as IngredientAgentRunResult);

  await http()
    .post(AGENT_PATH)
    .set('Authorization', 'Bearer admin-token')
    .send({ text: '鸡肝' })
    .expect(201);

  expect(agentService.run).toHaveBeenCalledWith({
    text: '鸡肝', userId: 'admin-1', line: 'FOOD',
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts -t '选了补剂'`
Expected: FAIL，实际 200/201 而不是 400

- [ ] **Step 3: DTO 加线路字段**

`agent-run.dto.ts` 增加 `line?: IngredientLine`，校验用 `@IsOptional()` + `@IsIn(INGREDIENT_LINES)`，Swagger 用 `enum: INGREDIENT_LINES`。

- [ ] **Step 4: 控制器先判定再开跑**

控制器加 `private readonly logger = new Logger(...)` 与私有方法 `decideLine(dto)`：调用 `decideRequestedLine`，`REJECT` 时抛 `BadRequestException(message)`；`CREATE && compatDefault` 时记 warn。
`runAgent` 与 `streamAgent` 都先 `decideLine`；`streamAgent` 必须放在 `res.setHeader(...)` / `res.flushHeaders()` **之前**；组 run 输入时用条件展开，只在 `CREATE` 时带 `line`。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts`
Expected: PASS，原有「已登录时把 draftId / text / userId 交给服务」用例仍通过（`toEqual` 精确匹配，说明没有多传 `line`）

- [ ] **Step 6: 提交**

```bash
git add backend/src/interfaces/dto/ingredient-creation/agent-run.dto.ts backend/src/interfaces/controllers/ingredient-creation.controller.ts backend/tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts
git commit -m "feat(ingredient-creation): reject supplement line before streaming"
```

---
### Task 3: 后端 · 起草服务守住草稿类型

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-draft-agent.service.ts:328-338`（输入结构）、`:1636-1690`（`runLoop` 取草稿处）
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-draft.service.ts:51-67`（`create` 的 `type`）
- Test: `backend/tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts`（新增 describe）

**Interfaces:**
- Consumes: Task 1 的 `IngredientLine`、`LINE_NOT_OPEN_MESSAGE`
- Produces:
  - `RunIngredientAgentInput` 增加 `line?: IngredientLine`
  - `IngredientCreationDraftService.create(input: { name: string; type: 'FOOD' | 'SUPPLEMENT'; createdBy: string })`
  - 草稿类型不是 `FOOD` → 抛 `BadRequestException(LINE_NOT_OPEN_MESSAGE)`，且发生在任何写操作之前

- [ ] **Step 1: 写失败测试**

```ts
describe('IngredientDraftAgentService · 线路守卫', () => {
  it('草稿是补剂 → 拒绝，不调模型、不写字段', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
    const harness = createHarness({ draft: createDraft({ type: 'SUPPLEMENT' }) });

    await expect(
      harness.agent.run({ draftId: DRAFT_ID, text: '鱼油', userId: 'admin-1' }),
    ).rejects.toThrow(LINE_NOT_OPEN_MESSAGE);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(harness.draftService.patch).not.toHaveBeenCalled();
  });

  it('新建时传补剂 → 拒绝，且不建草稿', async () => {
    const harness = createHarness({ draft: null });

    await expect(
      harness.agent.run({ text: '鱼油', line: 'SUPPLEMENT', userId: 'admin-1' }),
    ).rejects.toThrow(LINE_NOT_OPEN_MESSAGE);

    expect(harness.draftService.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts -t '线路守卫'`
Expected: FAIL（补剂草稿被当成食材继续跑，或 `line` 字段不存在导致 TS 报错）

- [ ] **Step 3: 实现守卫**

`runLoop` 里：先算 `const requestedLine = input.line ?? 'FOOD'`，不是 `FOOD` 就直接抛；再取草稿（有 `draftId` 用 `get`，否则 `create({ ..., type: requestedLine })`）；**取到后立刻**校验 `draft.type !== 'FOOD'` 抛 `LINE_NOT_OPEN_MESSAGE`，位置必须在清 `pendingQuestion`、任何 `patch` 之前。同步把测试 harness 里 `create` 的参数类型改成 `'FOOD' | 'SUPPLEMENT'`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts`
Expected: PASS（含新增 2 个用例）

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-draft-agent.service.ts backend/src/application/ingredient-creation/ingredient-creation-draft.service.ts backend/tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts
git commit -m "feat(ingredient-creation): only draft on the food line"
```

---
### Task 4: 后端 · 授权与提交守住草稿类型

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-authorize.service.ts:173-176`（`authorize` 取草稿之后）
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `LINE_NOT_OPEN_MESSAGE`
- Produces: 草稿类型不是 `FOOD` 时，`authorize()` 抛 `BadRequestException(LINE_NOT_OPEN_MESSAGE)`，且**不查核验报告、不进提交事务**

- [ ] **Step 1: 写失败测试**（沿用该文件已有的 `draft` 变量与 `service`）

```ts
it('草稿是补剂 → 400，且不查报告、不提交', async () => {
  draft = { ...draft, type: 'SUPPLEMENT' };

  await expect(service.authorize(authorizeInput)).rejects.toThrow(
    LINE_NOT_OPEN_MESSAGE,
  );
  expect(prisma.ingredientCheckRun.findFirst).not.toHaveBeenCalled();
  expect(commitService.commit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts -t '草稿是补剂'`
Expected: FAIL（现在会继续走闸门，报的是「授权前还有未满足的条件」）

- [ ] **Step 3: 实现守卫**

`authorize()` 在 `const draft = await this.draftService.get(...)` 之后、`readDraftMaterial(draft)` 之前加一行类型校验。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/ingredient-creation/ingredient-creation-authorize.service.ts backend/tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts
git commit -m "feat(ingredient-creation): refuse to authorize supplement drafts"
```

---
### Task 5: 前端 · 线路判定纯函数

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/lineEntry.ts`
- Test: `admin-web/src/views/Ingredients/ai-agent/lineEntry.spec.ts`

**Interfaces:**
- Produces:

```ts
export type IngredientLine = 'FOOD' | 'SUPPLEMENT'
export type LineSource = 'USER' | 'ENTRY' | 'DRAFT' | 'INGREDIENT'

export interface LineEntryInput {
  draftType?: string | null
  ingredientType?: string | null
  entryLine?: string | null
  userPick?: IngredientLine | null
}

export interface LineDecision {
  line: IngredientLine | null
  source: LineSource | null
  locked: boolean
  notice: string | null
  rejected: boolean
}

export const LINE_LABELS: Record<IngredientLine, string>  // 食材线 / 补剂线
export function resolveLineEntry(input: LineEntryInput): LineDecision
```

- [ ] **Step 1: 写失败测试**

```ts
import { resolveLineEntry } from './lineEntry'

describe('resolveLineEntry', () => {
  it('没有任何输入 → 未定，不锁定', () => {
    expect(resolveLineEntry({})).toMatchObject({
      line: null, source: null, locked: false, rejected: false,
    })
  })

  it('用户选食材 → 食材线，可改', () => {
    expect(resolveLineEntry({ userPick: 'FOOD' })).toMatchObject({
      line: 'FOOD', source: 'USER', locked: false,
    })
  })

  it('入口预选补剂、用户改选食材 → 食材线（用户压过预选）', () => {
    expect(resolveLineEntry({ entryLine: 'SUPPLEMENT', userPick: 'FOOD' })).toMatchObject({
      line: 'FOOD', source: 'USER',
    })
  })

  it('只有入口预选 → 按预选，可改', () => {
    expect(resolveLineEntry({ entryLine: 'SUPPLEMENT' })).toMatchObject({
      line: 'SUPPLEMENT', source: 'ENTRY', locked: false,
    })
  })

  it('入口带了不认识的取值 → 当作没有预选', () => {
    expect(resolveLineEntry({ entryLine: 'PACKAGING' })).toMatchObject({
      line: null, source: null, locked: false,
    })
  })

  it('草稿是食材、入口预选补剂 → 以草稿为准并提示已纠正', () => {
    const decision = resolveLineEntry({ draftType: 'FOOD', entryLine: 'SUPPLEMENT' })
    expect(decision).toMatchObject({ line: 'FOOD', source: 'DRAFT', locked: true })
    expect(decision.notice).not.toBeNull()
  })

  it('草稿是补剂、用户选食材 → 仍以草稿为准', () => {
    expect(resolveLineEntry({ draftType: 'SUPPLEMENT', userPick: 'FOOD' })).toMatchObject({
      line: 'SUPPLEMENT', source: 'DRAFT', locked: true,
    })
  })

  it('原料是补剂 → 以原料为准', () => {
    expect(resolveLineEntry({ ingredientType: 'SUPPLEMENT' })).toMatchObject({
      line: 'SUPPLEMENT', source: 'INGREDIENT', locked: true,
    })
  })

  it.each(['draftType', 'ingredientType'])('%s 是包装 → 拒绝', (key) => {
    expect(resolveLineEntry({ [key]: 'PACKAGING' })).toMatchObject({
      line: null, locked: true, rejected: true,
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/lineEntry.spec.ts`
Expected: FAIL，找不到 `./lineEntry`

- [ ] **Step 3: 实现 `lineEntry.ts`**

优先级按顺序：非法 `draftType`/`ingredientType`（`PACKAGING` 等既非 FOOD 也非 SUPPLEMENT）→ 拒绝；合法则锁定；再 `userPick`；再 `entryLine`（只认 `FOOD` / `SUPPLEMENT`，其它取值当没有）；都没有 → 未定。`notice` 只在「对象存在且入口/用户选了不同线路」时给：草稿用「已按草稿类型纠正」，原料用「已按原料类型纠正」。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/lineEntry.spec.ts`
Expected: PASS，10 passed

- [ ] **Step 5: 提交**

```bash
git add admin-web/src/views/Ingredients/ai-agent/lineEntry.ts admin-web/src/views/Ingredients/ai-agent/lineEntry.spec.ts
git commit -m "feat(admin-web): add the line resolver for AI ingredient creation"
```

---
### Task 6: 前端 · 页面线路闸门

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`（表头 `:3-13`、布局 `:15`、`state` `:980-993`、`canRun` `:1098-1104`、`handleRun` `:1445-1513`）
- Modify: `admin-web/src/views/Ingredients/ai-agent/agentStream.ts:883-886`（请求体类型）
- Modify: `admin-web/src/types/ingredientCreation.ts:514-517`（`RunIngredientAgentInput`）
- Test: `admin-web/src/views/Ingredients/aiAgentLineGate.regression.spec.ts`（新建，沿用仓库源码回归写法）

**Interfaces:**
- Consumes: Task 5 的 `resolveLineEntry`、`LINE_LABELS`、`IngredientLine`
- Produces: 页面状态 `entry = { pick: IngredientLine | null; locked: IngredientLine | null }`；`line`、`canSwitchLine`、`resetLine()`；`streamIngredientAgent` 的入参增加 `line?: IngredientLine`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import pageSource from './ai-agent/index.vue?raw'
import streamSource from './ai-agent/agentStream.ts?raw'

function clean(source: string) {
  return source.replace(/<!--[\s\S]*?-->/g, '')
}

describe('AI 添加原料 · 线路闸门', () => {
  const page = clean(pageSource)

  it('进页面先定线路，用决议函数而不是自己拍', () => {
    expect(page).toContain('resolveLineEntry')
    expect(page).toContain('这次添加的是哪一类原料')
  })

  it('补剂给出「未开放」的闸门，而不是偷偷按食材跑', () => {
    expect(page).toContain('补剂线还没开放')
    expect(page).toContain('改回食材')
  })

  it('没建草稿之前可以换线路', () => {
    expect(page).toContain('换线路')
    expect(page).toContain('canSwitchLine')
  })

  it('起草请求带上线路', () => {
    expect(streamSource).toContain('line?: IngredientLine')
    expect(page).toContain('line: sentLine')
  })

  it('线路没定或选了补剂时不能发送', () => {
    expect(page).toContain("line.value === 'FOOD'")
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/aiAgentLineGate.regression.spec.ts`
Expected: FAIL，页面里没有 `resolveLineEntry`

- [ ] **Step 3: 加请求类型**

`types/ingredientCreation.ts` 的 `RunIngredientAgentInput` 加 `line?: 'FOOD' | 'SUPPLEMENT'`；`agentStream.ts` 的 `streamIngredientAgent` 入参改成 `{ draftId?: string; text: string; line?: IngredientLine }`，并从 `./lineEntry` 引入类型。

- [ ] **Step 4: 页面的线路状态与逻辑**

在 `index.vue` 的 `<script setup>` 里：引入 `useRoute`、`resolveLineEntry`、`LINE_LABELS`、`IngredientLine`；建 `entry = reactive<{ pick: IngredientLine | null; locked: IngredientLine | null }>({ pick: null, locked: null })`；`lineDecision = computed(() => resolveLineEntry({ userPick: entry.locked ?? entry.pick, entryLine: typeof route.query.line === 'string' ? route.query.line : null }))`；`line = computed(() => lineDecision.value.line)`；`canSwitchLine = computed(() => entry.locked === null && !state.running && !state.draftId)`；`resetLine()` 把 `entry.pick` 置空。

- [ ] **Step 5: 页面的守卫与请求**

`canRun` 增加 `line.value === 'FOOD'`；`handleRun` 开头 `if (!line.value || line.value !== 'FOOD') return`；进入请求前 `const sentLine = line.value`，`streamIngredientAgent` 的入参写成 `{ ...(state.draftId ? { draftId: state.draftId } : {}), text, ...(sentLine ? { line: sentLine } : {}) }`；`finalState.draftId` 存在时 `entry.locked = sentLine`。

- [ ] **Step 6: 页面的模板**

表头标题改「AI 添加原料」，右侧按 `line` 显示线路标签与 `canSwitchLine` 时的「换线路」。`<div class="ai-agent-layout">` 改成 `v-else`，前面加两张卡：`!line` 时起手卡（标题 `这次添加的是哪一类原料？`，两个按钮，补剂按钮带「暂未开放」小标）；`line === 'SUPPLEMENT'` 时闸门卡（`补剂线还没开放` + `改回食材`，`改回食材` 仅在 `canSwitchLine` 时渲染）。

- [ ] **Step 7: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/aiAgentLineGate.regression.spec.ts src/views/Ingredients/ai-agent/lineEntry.spec.ts`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add admin-web/src/views/Ingredients/ai-agent/index.vue admin-web/src/views/Ingredients/ai-agent/agentStream.ts admin-web/src/types/ingredientCreation.ts admin-web/src/views/Ingredients/aiAgentLineGate.regression.spec.ts
git commit -m "feat(admin-web): gate AI ingredient creation on the chosen line"
```

---
### Task 7: 前端 · 删除旧判断页并留重定向

**Files:**
- Delete: `admin-web/src/views/Ingredients/ai-create/`（`index.vue`、`chatState.ts`、`chatState.spec.ts`）
- Delete: `admin-web/src/views/Ingredients/aiCreateEntry.regression.spec.ts`
- Modify: `admin-web/src/router/index.ts:77-83`（改为重定向）
- Modify: `admin-web/src/api/ingredientCreation.ts:21-23,38-43`（删除 `classifyIntake` 与相关 import）
- Modify: `admin-web/src/types/ingredientCreation.ts:407-425`（删除仅供其使用的 `Intake*` 类型）
- Test: `admin-web/src/views/Ingredients/aiAgentLineGate.regression.spec.ts`（追加断言）

**Interfaces:**
- Produces: `/ingredients/ai-create` → 重定向到 `IngredientAiAgent`；`ingredientCreationApi` 不再导出 `classifyIntake`

- [ ] **Step 1: 追加失败断言**

```ts
import routerSource from '@/router/index.ts?raw'
import apiSource from '@/api/ingredientCreation.ts?raw'

it('旧判断页的地址被重定向到唯一入口', () => {
  expect(routerSource).toContain('path: "ingredients/ai-create"')
  expect(routerSource).toContain('redirect')
  expect(routerSource).not.toContain('IngredientAiCreate')
})

it('前端不再保留没有调用方的判断接口', () => {
  expect(apiSource).not.toContain('classifyIntake')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd admin-web && npx vitest run src/views/Ingredients/aiAgentLineGate.regression.spec.ts`
Expected: FAIL（路由仍在加载 `ai-create/index.vue`，接口仍在）

- [ ] **Step 3: 删页面、改路由**

删除 `ai-create/` 三个文件与 `aiCreateEntry.regression.spec.ts`；路由改成 `{ path: "ingredients/ai-create", redirect: { name: "IngredientAiAgent" } }`。

- [ ] **Step 4: 删客户端方法与类型**

删 `classifyIntake`、`Intake*` 类型与对应 import（删前 `grep -rn "classifyIntake\|IntakeClassification" admin-web/src` 确认无第二个调用方）。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd admin-web && npx vitest run src/views/Ingredients/aiAgentLineGate.regression.spec.ts`
Expected: PASS；再跑 `npx vitest run src/views/Ingredients` 确认没有残留引用

- [ ] **Step 6: 提交**

```bash
git add -A admin-web/src/views/Ingredients admin-web/src/router/index.ts admin-web/src/api/ingredientCreation.ts admin-web/src/types/ingredientCreation.ts
git commit -m "chore(admin-web): drop the half-built line classifier page"
```

---
### Task 8: 全量自检与手工回归

**Files:** 无代码改动

- [ ] **Step 1: 后端类型与测试**

```bash
cd backend && npx tsc --noEmit
cd backend && npx jest tests/application/ingredient-creation/ingredient-line.spec.ts tests/application/ingredient-creation/ingredient-draft-agent.service.spec.ts tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts
```
Expected: 类型零错误；三个测试文件全绿

- [ ] **Step 2: 前端测试与构建**

```bash
cd admin-web && npm test
cd admin-web && npm run build
```
Expected: vitest 全绿；`vue-tsc` 与 vite 构建通过

- [ ] **Step 3: 手工回归（本地起后端，按 CLAUDE.md 用 `npm run start:dev:miniapp`）**

1. 打开「AI 添加原料」→ 看到起手卡，输入框禁用。
2. 点「补剂类原料」→ 看到未开放闸门，输入框仍禁用。
3. 点「改回食材」→ 回到起手卡（带 `?line=supplement` 时也必须能改回）。
4. 选食材 → 输入「鸡蛋清」跑一轮 → 顶部标签「食材线」，「换线路」消失。
5. 旧地址 `/ingredients/ai-create` → 自动跳到上面这个页面。

- [ ] **Step 4: 提交（如有自检期的小修）**

```bash
git add -A
git commit -m "test(ingredient-creation): cover the line gate end to end"
```

## 后续（不在本计划）

- 下个版本：删掉「缺 `line` 按 FOOD」的兼容默认，改为必填。
- 补剂线的字段集、核验规则、工具集（另一份设计）。
- 编辑入口（营养档案 / 原料详情）与草稿续接（相邻问题，各自立项）。

---

## 实施后记（2026-10-29）

- 已按计划落地，提交 `43466373`..`d8f72283`，评审后的修复提交 `6a682e8c`。
- **与计划不同的两处**（都是计划本身的问题，见 ledger）：
  1. Task 7 按行号删 `Intake*` 类型会连「Agent 起草循环」类型一起删；改为按两段注释精确删除。
  2. Task 8 的 `npx tsc --noEmit` 会扫到既有测试文件的类型错误；改为 `prisma generate` + `tsc -p tsconfig.build.json --noEmit`。
- **Task 6 Step 5 的原写法有缺陷**：让 `lineDecision` 每帧从 `route.query.line` 重算，导致 `?line=supplement` 进来后「改回食材 / 换线路」被 URL 拉回去（评审 Critical #1）。已改为**入口预选只消费一次**（`createLineEntryState` + `toLineEntryInput`），「改回食材」直接落到食材线，并补了 4 条生命周期用例 + 2 条页面回归。
- 手工回归（浏览器五步）未在实施会话内执行，留给老板验收。
