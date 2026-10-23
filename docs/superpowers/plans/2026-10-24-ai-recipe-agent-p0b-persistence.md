# 食谱 AI Agent · P0b-1 持久层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给食谱 Agent 补上持久层：四张会话/审批/快照表、草稿的评估版本号、会话与审批两个服务。不接适配器、不调模型、不做 UI。

**Architecture:** Prisma migration + 两个 Nest 服务。`RecipeAgentSessionService` 管会话与消息；`RecipeAgentApprovalService` 管例外/缺类审批；`assessDraftForAgent` 把“评估跑在哪个内容版本”原子地写进草稿。

**Tech Stack:** NestJS、Prisma、PostgreSQL、Jest（Prisma mock）。

**Spec:** `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`

## Global Constraints

- 只改 `backend/`；不碰 `admin-web/`、小程序。
- 本计划**不接真实模型、不写适配器、不做 UI**；这些是 P0b-2 / P0b-3。
- 数据库改动一律走 Prisma migration；不手写 `ALTER TABLE` 到生产。
- 测试用 Prisma mock，不连生产库；迁移验证用本地库。
- 表名 `snake_case`、字段 `@map` 到 `snake_case`；枚举名 PascalCase。
- `assessmentContentRevision` 必须与评估结果**同一个 `updateMany`** 写入；`count === 0` → `ConflictException`，不能把旧结果当新的。
- 审批状态只认 `APPROVED`；`PENDING` / `REJECTED` 不算。缺类审批的 payload 只能是 `REQUIRED_FOOD_CATEGORIES` 里的值。
- 本仓库有并发 agent：每个任务只 `git add` 自己的文件，提交用 `git commit --only <精确路径>`；不要 `git add -A`。

## Review Focus

这 8 条是持久层最容易被真实并发/重启/脏数据咬到的地方，每条都要有测试或验证命令：

1. 评估刚跑完、草稿在评估期间又被改：`updateMany` 0 行必须报冲突，不能返回“新鲜”结果。
2. 同一会话追加消息的 `seq`：唯一约束 + 单写者（run lock 保证同一草稿只有一个运行）；测试覆盖 `max(seq)+1`。
3. 服务重启：`RUNNING` → `INTERRUPTED`；`WAITING_USER` 保留，人等回答。
4. `getActiveSession`：同一草稿最多一个活跃会话；`assertNoActiveRun` 要拦第二个。
5. 审批状态：只有 `APPROVED` 生效；`REJECTED`/`PENDING` 不算；重复/空白缺类要拒绝。
6. token 用量：`recordUsage` 是累加，不是覆盖。
7. 级联删除：删草稿/会话时，消息、审批、快照跟着走；快照的 `sessionId` 删除时置空。
8. 迁移 SQL 与 schema 一致：`prisma validate` / `prisma generate` 通过。

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: 由 Prisma 生成的 migration 目录（名字含时间戳 + `_add_recipe_agent_tables`，不要手写时间戳）

**Interfaces:**
- `DesignRecipe.assessmentContentRevision Int? @map("assessment_content_revision")`
- 复用 `DesignRecipe.agentSessions` / `agentSnapshots` 关系。
- 新枚举：`RecipeAgentSessionStatus`、`RecipeAgentMessageRole`、`RecipeAgentApprovalType`、`RecipeAgentApprovalStatus`。
- 新模型：`RecipeDesignAgentSession`、`RecipeDesignAgentMessage`、`RecipeDesignAgentApproval`、`RecipeDesignAgentSnapshot`。

- [ ] **Step 1: 改 schema**

在 `DesignRecipe` 里加：

```prisma
  /// 评估结果对应的内容版本；null = 从未评估。
  assessmentContentRevision Int?   @map("assessment_content_revision")
  agentSessions             RecipeDesignAgentSession[]
  agentSnapshots            RecipeDesignAgentSnapshot[]
```

在文件末尾加：

```prisma
enum RecipeAgentSessionStatus {
  RUNNING
  WAITING_USER
  COMPLETED
  STOPPED
  FAILED
  INTERRUPTED
}

enum RecipeAgentMessageRole {
  USER
  ASSISTANT
  TOOL
}

enum RecipeAgentApprovalType {
  COMPLIANCE_EXCEPTION
  CATEGORY_OMISSION
}

enum RecipeAgentApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

model RecipeDesignAgentSession {
  id               String                    @id @default(uuid())
  designRecipeId   String                    @map("design_recipe_id")
  status           RecipeAgentSessionStatus  @default(RUNNING)
  skillName        String                    @map("skill_name") @db.VarChar(80)
  skillVersion     String                    @map("skill_version") @db.VarChar(40)
  stepCount        Int                       @default(0) @map("step_count")
  promptTokens     Int                       @default(0) @map("prompt_tokens")
  completionTokens Int                       @default(0) @map("completion_tokens")
  startedAt        DateTime                  @default(now()) @map("started_at")
  endedAt          DateTime?                 @map("ended_at")
  lastError        String?                   @map("last_error")
  createdBy        String                    @map("created_by")
  createdAt        DateTime                  @default(now()) @map("created_at")
  updatedAt        DateTime                  @updatedAt @map("updated_at")
  designRecipe     DesignRecipe              @relation(fields: [designRecipeId], references: [id], onDelete: Cascade)
  messages         RecipeDesignAgentMessage[]
  approvals        RecipeDesignAgentApproval[]
  snapshots        RecipeDesignAgentSnapshot[]

  @@index([designRecipeId, status])
  @@map("recipe_design_agent_session")
}

model RecipeDesignAgentMessage {
  id         String                   @id @default(uuid())
  sessionId  String                   @map("session_id")
  seq        Int
  role       RecipeAgentMessageRole
  content    String                   @db.Text
  toolName   String?                  @map("tool_name") @db.VarChar(80)
  toolArgs   Json?                    @map("tool_args")
  toolResult Json?                    @map("tool_result")
  createdAt  DateTime                 @default(now()) @map("created_at")
  session    RecipeDesignAgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, seq])
  @@index([sessionId, seq])
  @@map("recipe_design_agent_message")
}

model RecipeDesignAgentApproval {
  id          String                    @id @default(uuid())
  sessionId   String                    @map("session_id")
  type        RecipeAgentApprovalType
  status      RecipeAgentApprovalStatus @default(PENDING)
  reason      String                    @db.Text
  detail      Json?
  requestedAt DateTime                  @default(now()) @map("requested_at")
  decidedAt   DateTime?                 @map("decided_at")
  decidedBy   String?                   @map("decided_by")
  session     RecipeDesignAgentSession  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, status])
  @@map("recipe_design_agent_approval")
}

model RecipeDesignAgentSnapshot {
  id              String                    @id @default(uuid())
  designRecipeId  String                    @map("design_recipe_id")
  sessionId       String?                   @map("session_id")
  contentRevision Int                       @map("content_revision")
  snapshot        Json
  createdAt       DateTime                  @default(now()) @map("created_at")
  designRecipe    DesignRecipe              @relation(fields: [designRecipeId], references: [id], onDelete: Cascade)
  session         RecipeDesignAgentSession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)

  @@index([designRecipeId, createdAt])
  @@map("recipe_design_agent_snapshot")
}
```

- [ ] **Step 2: 生成 migration 并验证**

Run（本地库，不碰生产）：

```bash
cd backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen \
  npx prisma migrate dev --name add_recipe_agent_tables
npx prisma validate
npx prisma generate
```

Expected: migration 文件生成；`validate` 输出 “The schema at prisma/schema.prisma is valid”；`generate` 成功。检查 SQL 里包含 4 张表 + `design_recipe.assessment_content_revision`，没有多余的表/列改动。

- [ ] **Step 3: 提交**

```bash
# 把 <生成的目录> 换成 prisma 实际生成的 migration 目录（含时间戳）
git add backend/prisma/schema.prisma backend/prisma/migrations/<生成的目录>
git commit --only backend/prisma/schema.prisma backend/prisma/migrations/<生成的目录> -m "feat(recipe-agent): add session approval and snapshot tables"
```

---

### Task 2: `assessDraftForAgent` + 评估版本

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/application/recipe-designer/agent/assessment-revision.spec.ts`

**Interfaces:**
- `DesignRecipeWithItems` 加 `assessmentContentRevision?: number | null`。
- `assessDraftForAgent(id: string, access: RecipeDesignerAccessInput): Promise<{ contentRevision: number; assessment: DesignRecipeAssessmentResult }>`
- `buildAssessmentUpdateData(result)` 保持私有；`assessDraftForAgent` 在它的返回值上追加 `assessmentContentRevision: draft.contentRevision`。

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/assessment-revision.spec.ts
import { ConflictException } from '@nestjs/common';
import { RecipeDesignerService } from 'src/application/recipe-designer/recipe-designer.service';

function makeService(updateMany: jest.Mock) {
  const service = Object.create(RecipeDesignerService.prototype) as any;
  service.getDraft = jest.fn().mockResolvedValue({
    id: 'draft-1',
    contentRevision: 7,
    fediafDogScenario: 'ADULT_MER_110',
    items: [],
  });
  service.targetProvider = { getTargets: jest.fn().mockResolvedValue([]) };
  service.assessLoadedDraft = jest.fn().mockResolvedValue({
    items: [],
    groupedEntries: [],
    entries: [],
  });
  service.buildAssessmentUpdateData = jest.fn().mockReturnValue({ isCompliant: true });
  service.prisma = { designRecipe: { updateMany } };
  return service;
}

describe('assessDraftForAgent', () => {
  it('把 assessmentContentRevision 和评估结果原子写入', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = makeService(updateMany);

    const result = await service.assessDraftForAgent('draft-1', { userId: 'u1', role: 'STAFF' });

    expect(result.contentRevision).toBe(7);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', contentRevision: 7 },
      data: { isCompliant: true, assessmentContentRevision: 7 },
    });
  });

  it('评估期间草稿被改（count=0）→ 冲突，不返回新鲜结果', async () => {
    const service = makeService(jest.fn().mockResolvedValue({ count: 0 }));
    await expect(
      service.assessDraftForAgent('draft-1', { userId: 'u1', role: 'STAFF' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/assessment-revision.spec.ts --runInBand`
Expected: FAIL，`assessDraftForAgent is not a function`。

- [ ] **Step 3: 实现**

在 `DesignRecipeWithItems` 类型里加 `assessmentContentRevision?: number | null;`。

在服务里加：

```ts
async assessDraftForAgent(
  id: string,
  access: RecipeDesignerAccessInput,
): Promise<{ contentRevision: number; assessment: DesignRecipeAssessmentResult }> {
  const draft = await this.getDraft(id, access);
  const targets = await this.targetProvider.getTargets(draft.fediafDogScenario);
  const result = await this.assessLoadedDraft(draft, targets);
  const { count } = await this.prisma.designRecipe.updateMany({
    where: { id, contentRevision: draft.contentRevision },
    data: {
      ...this.buildAssessmentUpdateData(result),
      assessmentContentRevision: draft.contentRevision,
    },
  });
  if (count === 0) {
    throw new ConflictException('草稿在评估期间被修改，请重新评估');
  }
  return { contentRevision: draft.contentRevision, assessment: result };
}
```

不要改现有 `assessDraft` 的返回形状；它继续给编辑器用。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/assessment-revision.spec.ts --runInBand`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/agent/assessment-revision.spec.ts
git commit --only backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/agent/assessment-revision.spec.ts -m "feat(recipe-agent): persist assessment content revision"
```

---

### Task 3: 会话服务

**Files:**
- Create: `backend/src/application/recipe-designer/agent/recipe-agent-session.service.ts`
- Create: `backend/src/application/recipe-designer/agent/recipe-agent-session.types.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-agent-session.service.spec.ts`

**Interfaces:**

```ts
export type AgentSessionStatus = 'RUNNING' | 'WAITING_USER' | 'COMPLETED' | 'STOPPED' | 'FAILED' | 'INTERRUPTED';
export type AgentMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

export interface AgentSessionRecord {
  id: string;
  designRecipeId: string;
  status: AgentSessionStatus;
  skillName: string;
  skillVersion: string;
  stepCount: number;
  promptTokens: number;
  completionTokens: number;
  startedAt: Date;
  endedAt: Date | null;
  lastError: string | null;
  createdBy: string;
}

export interface AgentMessageRecord {
  id: string;
  sessionId: string;
  seq: number;
  role: AgentMessageRole;
  content: string;
  toolName: string | null;
  toolArgs: unknown;
  toolResult: unknown;
  createdAt: Date;
}
```

`RecipeAgentSessionService`（构造函数注入 `PrismaService`）：

- `createSession(input: { designRecipeId; createdBy; skillName; skillVersion }): Promise<AgentSessionRecord>`
- `appendMessage(input: { sessionId; role; content; toolName?; toolArgs?; toolResult? }): Promise<AgentMessageRecord>`
- `listMessages(sessionId: string, afterSeq?: number): Promise<AgentMessageRecord[]>`
- `updateStatus(sessionId: string, status: AgentSessionStatus, lastError?: string | null): Promise<void>`
- `recordUsage(sessionId: string, promptTokens: number, completionTokens: number): Promise<void>`
- `incrementStep(sessionId: string): Promise<void>`
- `getActiveSession(designRecipeId: string): Promise<AgentSessionRecord | null>`
- `assertNoActiveRun(designRecipeId: string): Promise<void>`
- `markInterruptedRuns(): Promise<number>`

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/recipe-agent-session.service.spec.ts
import { ConflictException } from '@nestjs/common';
import { RecipeAgentSessionService } from 'src/application/recipe-designer/agent/recipe-agent-session.service';

function makePrisma() {
  const tx = {
    recipeDesignAgentMessage: {
      aggregate: jest.fn().mockResolvedValue({ _max: { seq: 3 } }),
      create: jest.fn().mockResolvedValue({ id: 'm1', seq: 4 }),
    },
  };
  const prisma = {
    recipeDesignAgentSession: {
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    recipeDesignAgentMessage: {
      aggregate: jest.fn().mockResolvedValue({ _max: { seq: 3 } }),
      create: jest.fn().mockResolvedValue({ id: 'm1', seq: 4 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, tx };
}

describe('RecipeAgentSessionService', () => {
  it('appendMessage 用 max(seq)+1，并在事务里创建', async () => {
    const { prisma, tx } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    await service.appendMessage({ sessionId: 's1', role: 'ASSISTANT', content: 'hi' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.recipeDesignAgentMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: 's1', seq: 4, role: 'ASSISTANT', content: 'hi' }),
    });
  });

  it('listMessages 按 seq 升序、支持 afterSeq', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    await service.listMessages('s1', 2);
    expect(prisma.recipeDesignAgentMessage.findMany).toHaveBeenCalledWith({
      where: { sessionId: 's1', seq: { gt: 2 } },
      orderBy: { seq: 'asc' },
    });
  });

  it('recordUsage 是累加', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    await service.recordUsage('s1', 100, 20);
    expect(prisma.recipeDesignAgentSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { promptTokens: { increment: 100 }, completionTokens: { increment: 20 } },
    });
  });

  it('有活跃会话时 assertNoActiveRun 抛冲突', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.findFirst.mockResolvedValue({ id: 's1' });
    const service = new RecipeAgentSessionService(prisma as any);
    await expect(service.assertNoActiveRun('draft-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('markInterruptedRuns 只把 RUNNING 改成 INTERRUPTED', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    const count = await service.markInterruptedRuns();
    expect(count).toBe(2);
    expect(prisma.recipeDesignAgentSession.updateMany).toHaveBeenCalledWith({
      where: { status: 'RUNNING' },
      data: expect.objectContaining({ status: 'INTERRUPTED' }),
    });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-agent-session.service.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

要点：

- `appendMessage` 在 `$transaction` 里先 `aggregate({ _max: { seq: true } })`，再 `create({ seq: (max ?? 0) + 1 })`；`AgentMessageRecord.seq` 从 1 开始。
- `updateStatus` 对 `COMPLETED` / `STOPPED` / `FAILED` / `INTERRUPTED` 同时写 `endedAt: new Date()`；`RUNNING` / `WAITING_USER` 不写。
- `recordUsage` 用 `{ increment }`。
- `incrementStep` 用 `{ stepCount: { increment: 1 } }`。
- `getActiveSession` 查 `status: { in: ['RUNNING', 'WAITING_USER'] }`，按 `startedAt desc` 取第一条。
- `assertNoActiveRun` 有活跃会话 → `ConflictException('这个草稿已经有一个 AI 运行；先停掉它')`。
- `markInterruptedRuns` 只改 `RUNNING` → `INTERRUPTED`，`endedAt` 设为当前时间，返回 `count`。
- 所有返回值映射到 `AgentSessionRecord` / `AgentMessageRecord`，不要把 Prisma 的 `Date` 变成字符串。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-agent-session.service.spec.ts --runInBand`
Expected: PASS（5 个用例）。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/recipe-designer/agent/recipe-agent-session.service.ts backend/src/application/recipe-designer/agent/recipe-agent-session.types.ts backend/tests/application/recipe-designer/agent/recipe-agent-session.service.spec.ts
git commit --only backend/src/application/recipe-designer/agent/recipe-agent-session.service.ts backend/src/application/recipe-designer/agent/recipe-agent-session.types.ts backend/tests/application/recipe-designer/agent/recipe-agent-session.service.spec.ts -m "feat(recipe-agent): add session and message persistence"
```

---

### Task 4: 审批服务

**Files:**
- Create: `backend/src/application/recipe-designer/agent/recipe-agent-approval.service.ts`
- Test: `backend/tests/application/recipe-designer/agent/recipe-agent-approval.service.spec.ts`

**Interfaces:**

```ts
export type AgentApprovalType = 'COMPLIANCE_EXCEPTION' | 'CATEGORY_OMISSION';
export type AgentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AgentApprovalState {
  approvedException: boolean;
  confirmedOmissions: RequiredFoodCategory[];
}

export interface AgentApprovalRecord {
  id: string;
  sessionId: string;
  type: AgentApprovalType;
  status: AgentApprovalStatus;
  reason: string;
  detail: unknown;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
}
```

`RecipeAgentApprovalService`：

- `request(input: { sessionId; type; reason; detail? }): Promise<AgentApprovalRecord>`
- `decide(approvalId: string, input: { status: 'APPROVED' | 'REJECTED'; decidedBy: string }): Promise<AgentApprovalRecord>`
- `getApprovalState(sessionId: string): Promise<AgentApprovalState>`

- [ ] **Step 1: 写失败的测试**

```ts
// backend/tests/application/recipe-designer/agent/recipe-agent-approval.service.spec.ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { RecipeAgentApprovalService } from 'src/application/recipe-designer/agent/recipe-agent-approval.service';

function makePrisma() {
  return {
    recipeDesignAgentApproval: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'a1', ...data })),
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'a1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('RecipeAgentApprovalService', () => {
  it('缺类审批的 categories 必须是合法七类', async () => {
    const service = new RecipeAgentApprovalService(makePrisma() as any);
    await expect(
      service.request({ sessionId: 's1', type: 'CATEGORY_OMISSION', reason: '无谷', detail: { categories: ['BOGUS'] } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('重复缺类去重后写入', async () => {
    const prisma = makePrisma();
    const service = new RecipeAgentApprovalService(prisma as any);
    await service.request({ sessionId: 's1', type: 'CATEGORY_OMISSION', reason: '无谷', detail: { categories: ['CARB', 'CARB'] } });
    expect(prisma.recipeDesignAgentApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ detail: { categories: ['CARB'] }, status: 'PENDING' }),
    });
  });

  it('只有 PENDING 能决定', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findUnique.mockResolvedValue({ id: 'a1', status: 'APPROVED' });
    const service = new RecipeAgentApprovalService(prisma as any);
    await expect(
      service.decide('a1', { status: 'APPROVED', decidedBy: 'admin-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('getApprovalState 只认 APPROVED', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findMany.mockResolvedValue([
      { type: 'COMPLIANCE_EXCEPTION', status: 'APPROVED', detail: null },
      { type: 'CATEGORY_OMISSION', status: 'APPROVED', detail: { categories: ['CARB', 'MUSHROOM'] } },
      { type: 'CATEGORY_OMISSION', status: 'REJECTED', detail: { categories: ['OIL'] } },
    ]);
    const service = new RecipeAgentApprovalService(prisma as any);
    const state = await service.getApprovalState('s1');
    expect(state.approvedException).toBe(true);
    expect(state.confirmedOmissions).toEqual(['CARB', 'MUSHROOM']);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-agent-approval.service.spec.ts --runInBand`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

要点：

- `request`：`reason.trim()` 非空且 ≤ 500；`CATEGORY_OMISSION` 的 `detail.categories` 必须是 `REQUIRED_FOOD_CATEGORIES` 的非空子集，去重保序；`COMPLIANCE_EXCEPTION` 的 detail 原样存。
- `decide`：`findUnique`；不存在 → `NotFoundException`；`status !== 'PENDING'` → `ConflictException`；只接受 `APPROVED` / `REJECTED`；写 `decidedAt` / `decidedBy`。
- `getApprovalState`：查询条件写 `status: 'APPROVED'`，**代码里再过滤一遍** `record.status === 'APPROVED'`（防 adapter/mock 返回脏数据）；`COMPLIANCE_EXCEPTION` → `approvedException = true`；`CATEGORY_OMISSION` 的 `detail.categories` 合并去重，保持 `REQUIRED_FOOD_CATEGORIES` 顺序；畸形 detail 忽略，不抛。
- 审批服务只管记录；管理员权限在 controller/guard 层。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npx jest tests/application/recipe-designer/agent/recipe-agent-approval.service.spec.ts --runInBand`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 跑 P0a + 持久层测试**

Run: `cd backend && npx jest tests/domain/recipe-designer/food-category-map.spec.ts tests/application/recipe-designer/agent --runInBand`
Expected: 9 个 spec 全通过（P0a 6 个 + 本计划 3 个；Task 2 的 spec 也在 agent 目录下）。

- [ ] **Step 6: 提交**

```bash
git add backend/src/application/recipe-designer/agent/recipe-agent-approval.service.ts backend/tests/application/recipe-designer/agent/recipe-agent-approval.service.spec.ts
git commit --only backend/src/application/recipe-designer/agent/recipe-agent-approval.service.ts backend/tests/application/recipe-designer/agent/recipe-agent-approval.service.spec.ts -m "feat(recipe-agent): add approval persistence"
```

---

## 接下来（不在本计划）

- **P0b-2 适配器**：`RecipeDesignerAgentAdapter` 实现 `RecipeAgentDraftPort`（读草稿/搜索/详情/目录使用/写原料/写文案/写步骤/跑评估），加真实/停用/未验证/去重校验、`totalWeightG`/`ratioPercent` 重算、系列/草稿文案路由、补剂目标、健康标签举证策略。
- **P0b-3 控制面 + 模型客户端 + 接线**：`RecipeAgentControlService` 实现 `RecipeAgentControlPort`（问人/例外/交付/审批状态）；`deepseek-tools-chat.ts` 支持 `tools` 与多轮 tool 消息；`app.module.ts` 接线；管理端抽屉（P2）与评测（P3）各自单独成计划。
