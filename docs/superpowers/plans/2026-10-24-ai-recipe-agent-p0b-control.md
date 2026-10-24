# 食谱 AI Agent · P0b-3 控制面与模型循环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Agent 真的能跑：控制面（问人/例外/交付/审批）、DeepSeek 工具调用客户端、运行循环、Nest 接线。

**Architecture:** `RecipeAgentControlService` 实现 `RecipeAgentControlPort`，把提问/审批/交付写进会话；`deepseek-tools-chat.ts` 是工具调用客户端；`RecipeAgentRunService` 负责一草稿一运行、循环、超时/步数、WAITING_USER/COMPLETED/FAILED；`RecipeAgentController` 是入口，UI 在 P2。

**Tech Stack:** NestJS、Prisma、DeepSeek Chat Completions（OpenAI 兼容）、Jest（mock fetch/service）。

**Spec:** `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`

**前置：** P0a（18 工具/135 测试）、P0b-1（持久层/163）、P0b-2a（读适配器/标签/191）、P0b-2b（写适配器/225）已 READY。

## Global Constraints

- 只改 `backend/`；UI（抽屉）是 P2，不在本计划。
- 审批状态只能从 `getApprovalState()` 读；模型参数不可信。
- `COMPLIANCE` → `COMPLIANCE_EXCEPTION`；`CATEGORY_OMISSION` 的 categories 从**当前草稿的缺类**算，不解析模型自由文本。
- 一草稿同时只能有一个 RUNNING/WAITING_USER 会话；启动先 `assertNoActiveRun`。
- 循环上限：30 次工具调用 / 6 分钟；每次模型调用计 usage；工具调用计 step。
- 启动时 `markInterruptedRuns()` 只把 RUNNING 改 INTERRUPTED；WAITING_USER 保留。
- 任何写/人工改后用新的 `getDraft` 重建 `DraftHealthTagPolicy`。
- 每个任务只提交自己的文件，`git commit --only <精确路径>`。

## Review Focus

1. `askUser` 真的把问题写进对话并把会话置 WAITING_USER；不是只返回文本。
2. `requestException` 的类型映射、理由长度、缺类来源；模型传的 detail 不参与缺类。
3. `finishDraft` 写快照（含 contentRevision）、置 COMPLETED、把 summary/warnings 写进对话。
4. 模型客户端只发工具定义、不强制 JSON；工具调用参数是字符串，由 loop 解析；非 2xx/超时重试有上限。
5. loop 的停止条件：`ask_user`、`finish_draft`、30 次、6 分钟、模型无 tool_calls 的最终文本。
6. 运行锁：start 有 active 会话时 409；stop 只停自己的会话；重启恢复。
7. 接线：只有内部员工（营养师/管理员）能开跑；draftId 走权限校验；模块能启动。

---

### Task 1: `RecipeAgentControlService`

**Files:**
- Create: `backend/src/application/recipe-designer/agent/recipe-agent-control.service.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-agent-control.service.spec.ts`

**Interfaces:**
```ts
export class RecipeAgentControlService implements RecipeAgentControlPort {
  constructor(
    private readonly sessionService: RecipeAgentSessionService,
    private readonly approvalService: RecipeAgentApprovalService,
    private readonly prisma: PrismaService,
    private readonly port: RecipeAgentDraftPort,
    private readonly sessionId: string,
    private readonly draftId: string,
  ) {}
}
```
- `askUser({ questions })`:
  - content = `questions.map((q, i) => `${i + 1}. ${q.question}${q.options?.length ? `（可选：${q.options.join(' / ')}）` : ''}`).join('\n')`；
  - `appendMessage({ sessionId, role: 'ASSISTANT', content })`；`updateStatus(sessionId, 'WAITING_USER')`。
- `requestException({ type, reason, detail })`:
  - `approvalType = type === 'COMPLIANCE' ? 'COMPLIANCE_EXCEPTION' : 'CATEGORY_OMISSION'`；
  - 缺类：`draft = await port.getDraft(draftId)`；`missing = summarizeFoodCategoryCoverage(draft.items).missing`；`approvalDetail = { categories: missing }`；missing 为空 → `BadRequestException('当前没有缺类需要确认')`；
  - 达标例外：`approvalDetail = detail`（可选字符串，原样存）；
  - `approval = await approvalService.request({ sessionId, type: approvalType, reason, detail: approvalDetail })`；
  - `appendMessage` assistant：`已发起${...}，审批编号 ${approval.id}。`。
- `finishDraft({ summary, warnings })`:
  - `draft = await port.getDraft(draftId)`；
  - `prisma.recipeDesignAgentSnapshot.create({ data: { designRecipeId: draftId, sessionId, contentRevision: draft.contentRevision, snapshot: { draft, summary, warnings } } })`；
  - `updateStatus(sessionId, 'COMPLETED')`；
  - `appendMessage` assistant：summary + warnings 列表。
- `getApprovalState()`：`approvalService.getApprovalState(sessionId)`。

- [ ] **Step 1: 测试**
  - askUser：append 一条 ASSISTANT、内容含两个问题；status WAITING_USER；
  - requestException COMPLIANCE：approval.request 收到 `COMPLIANCE_EXCEPTION`、reason；append；
  - requestException CATEGORY_OMISSION：mock `port.getDraft` 返回缺 CARB/VEGETABLE；approval.request 收到 `{ categories:['CARB','VEGETABLE'] }`，模型传的 detail 字符串不进 detail；missing 空 → BadRequest；
  - finishDraft：snapshot.create 收到 `contentRevision` 和 summary/warnings；status COMPLETED；append；
  - getApprovalState 委托。
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN** + agent 目录全绿
- [ ] **Step 5: 提交**（service + spec；`feat(recipe-agent): add control service`）

---

### Task 2: DeepSeek 工具调用客户端

**Files:**
- Create: `backend/src/application/recipe-designer/deepseek-tools-chat.ts`
- Test: `backend/tests/application/recipe-designer/agent/deepseek-tools-chat.spec.ts`

**Interfaces:**
```ts
export interface DeepSeekToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface DeepSeekToolsMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: DeepSeekToolCall[];
  tool_call_id?: string;
}
export async function callDeepSeekTools(options: {
  baseUrl: string;
  model: string;
  apiKey: string;
  requestTimeoutMs: number;
  messages: DeepSeekToolsMessage[];
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }>;
  temperature?: number;
  maxTokens?: number;
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
}): Promise<{
  content: string | null;
  toolCalls: DeepSeekToolCall[];
  usage: { promptTokens: number; completionTokens: number } | null;
}>;
```
- POST `{baseUrl}/chat/completions`；body `{ model, messages, tools, tool_choice:'auto', temperature, max_tokens }`；**不要** `response_format`。
- 非 2xx/网络错误重试最多 2 次（总 3 次）；超时 abort。
- 解析 `choices[0].message.content`/`tool_calls`；usage 回调。
- 空 tool_calls + content null → 返回 null/[]（loop 处理）。

- [ ] **Step 1: 测试**（mock global.fetch）
  - 返回 content + tool_calls + usage → 解析正确；
  - 500 两次后成功 → 3 次调用；
  - 400 → 抛 BadRequest，不重试；
  - malformed tool_calls → 空数组/忽略。
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN**
- [ ] **Step 5: 提交**（client + spec；`feat(recipe-agent): add tools chat client`）

---

### Task 3: `RecipeAgentRunService` 循环

**Files:**
- Create: `backend/src/application/recipe-designer/agent/recipe-agent-run.service.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-agent-run.service.spec.ts`

**Interfaces:**
```ts
export interface RecipeAgentRunActor {
  userId: string;
  role?: string | null;
  customerId?: string | null;
}
export class RecipeAgentRunService {
  async start(input: { draftId: string; actor: RecipeAgentRunActor; message: string }): Promise<{ sessionId: string }>;
  async resume(input: { sessionId: string; actor: RecipeAgentRunActor; message: string }): Promise<void>;
  async stop(sessionId: string): Promise<void>;
  async markInterruptedOnBoot(): Promise<number>;
}
```
- `start`：
  - `assertNoActiveRun(draftId)`；`createSession({ designRecipeId, createdBy: actor.userId, skillName:'recipe-design', skillVersion:'v1' })`；
  - append user message；`runLoop(sessionId, draftId, actor)`；返回 sessionId。
- `runLoop`：
  - `adapter = new RecipeDesignerAgentAdapter(service, prisma, actor, draftId)`；
  - `control = new RecipeAgentControlService(...)`；
  - `tagPolicy = new DraftHealthTagPolicy(fresh getDraft)`；
  - `toolkit = createRecipeAgentToolkit(...)`；
  - messages: system prompt + session messages (user/assistant/tool) — keep compact; use `listMessages` and map.
  - loop up to 30 tool calls / 6 min:
    - `callDeepSeekTools` with tools definitions;
    - append assistant text/tool_calls as a message (content + tool_calls JSON; the message table has `toolName/toolArgs/toolResult`; for assistant tool_calls, store content and maybe toolArgs? The schema `role` tool; append one tool message per call with toolName/args/result).
    - for each tool call: parse args JSON; `toolkit.handlers[name](args)`; append `role:'TOOL'` message with toolName/args/result; incrementStep; if `ask_user` or `finish_draft` → stop loop;
    - if no tool_calls: append assistant content; break.
    - rebuild tagPolicy/toolkit after write tools (or after every tool call) with fresh getDraft.
  - On success: if not WAITING_USER/COMPLETED, `updateStatus(COMPLETED?)`? If the model stops without finish, set `WAITING_USER` or `COMPLETED`? The design: the run ends when the model stops; the user can continue. Set `WAITING_USER`? The session statuses: COMPLETED only via finishDraft; STOPPED via stop; FAILED on error. If the model returns a final text without finish, set `WAITING_USER` (waiting for user) or `COMPLETED`? The drawer conversation continues; set `WAITING_USER` so the user can reply. Use `WAITING_USER`.
  - On error: `updateStatus(FAILED, message)`; append error message.
- `resume`: find session, status WAITING_USER; append user message; `updateStatus(RUNNING)`; runLoop.
- `stop`: `updateStatus(STOPPED)`.
- `markInterruptedOnBoot`: sessionService.markInterruptedRuns().

- [ ] **Step 1: 测试**（mock model client/session/adapter/toolkit）
  - start: assertNoActiveRun called; session created; messages; model returns tool call `get_draft` then final text → status WAITING_USER; step 1; usage recorded;
  - `ask_user` tool → WAITING_USER, loop stops;
  - `finish_draft` → COMPLETED;
  - 31 tool calls → stops with error/FAILED? The limit; test 30;
  - active session → start throws Conflict.
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN**
- [ ] **Step 5: 提交**（run service + spec；`feat(recipe-agent): add run loop`）

---

### Task 4: Nest 接线

**Files:**
- Create: `backend/src/interfaces/controllers/recipe-agent.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/interfaces/controllers/recipe-agent.controller.spec.ts`

**Endpoints**（内部员工）：
- `POST /recipe-designer/drafts/:draftId/agent/runs` body `{ message }` → `{ sessionId }`（start）；
- `GET /recipe-designer/drafts/:draftId/agent/session` → `{ session, messages }`（latest active/current）；
- `POST /recipe-designer/agent/runs/:sessionId/stop`；
- `POST /recipe-designer/agent/runs/:sessionId/answer` body `{ message }`（resume）；
- `GET /recipe-designer/agent/approvals/:id`? 审批决定是 P0b-3 之后/P2；本计划先不开放 `decide` 端点（管理员在后台审批，后续接）。
- 守卫：`JwtAuthGuard` + 内部员工角色（营养师/管理员）；draft access 由 service/adapter 校验。

**Module**：
- providers: `RecipeAgentSessionService`, `RecipeAgentApprovalService`, `RecipeAgentRunService`;
- controllers: `RecipeAgentController`;
- `OnModuleInit` in `RecipeAgentRunService` or a provider calls `markInterruptedRuns()` once;
- `RecipeDesignerAgentAdapter` is per-run (`new`), not a singleton provider.

- [ ] **Step 1: 测试**（controller mocked run service; auth guard; bad draft/role）
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN** + `npx tsc --noEmit` touched files
- [ ] **Step 5: 提交**（controller + module + spec；`feat(recipe-agent): wire agent endpoints`）

---

## 接下来（P1/P2，不在本计划）

- P1：一个 skill + 系统提示；真实模型 smoke；30 次/6 分钟参数调优。
- P2：抽屉 UI（会话、状态、输入、停止、审批入口）；admin-web。
- 审批决定端点/管理员界面；快照撤销；人工编辑与 RUNNING 的 409 锁。
