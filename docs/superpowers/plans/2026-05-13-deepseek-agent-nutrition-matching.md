# DeepSeek Agent Nutrition Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins configure DeepSeek in the Web management backend and run batch Agent nutrition-candidate matching while keeping all final profile confirmation manual.

**Architecture:** Add a dedicated Agent provider settings table and service so model credentials never enter public global config. Implement DeepSeek as an OpenAI-compatible chat-completions provider used by `NutritionGovernanceService`; add a persisted batch review job that reviews pending candidates, saves Agent advice/hard gates/review group, and never calls confirmation writes. Extend the existing Vue nutrition governance page with settings, test connection, batch job controls, and progress display.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Node `crypto`, Fetch API, Vue 3, Element Plus, Jest, existing admin-web Node tests.

---

## File Map

- Create `backend/prisma/migrations/202605130001_deepseek_agent_nutrition_matching/migration.sql`: settings and job tables.
- Modify `backend/prisma/schema.prisma`: add `AgentProviderConfig` and `NutritionAgentReviewJob` models.
- Create `backend/src/application/nutrition-governance/agent-provider-config.service.ts`: secure settings read/write, API key encryption, masked responses.
- Modify `backend/src/application/nutrition-governance/nutrition-candidate-review.provider.ts`: export shared prompt/normalization helpers and add DeepSeek provider.
- Modify `backend/src/application/nutrition-governance/nutrition-governance.service.ts`: add settings APIs, batch job lifecycle, DeepSeek provider creation from DB settings.
- Modify `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`: Agent settings and batch job DTOs.
- Modify `backend/src/interfaces/controllers/nutrition-governance.controller.ts`: settings/test/batch job endpoints.
- Modify `backend/src/app.module.ts`: register new settings service.
- Add backend tests:
  - `backend/tests/application/nutrition-governance/agent-provider-config.service.spec.ts`
  - `backend/tests/application/nutrition-governance/deepseek-nutrition-candidate-review.provider.spec.ts`
  - `backend/tests/application/nutrition-governance/nutrition-candidate-batch-agent-review.spec.ts`
  - `backend/tests/prisma/deepseek-agent-nutrition-matching-schema.spec.ts`
- Modify `admin-web/src/types/nutritionGovernance.ts`: settings and job types.
- Modify `admin-web/src/api/nutritionGovernance.ts`: settings/test/job methods.
- Create `admin-web/src/views/NutritionGovernance/components/AgentSettingsDrawer.vue`: settings form.
- Create `admin-web/src/views/NutritionGovernance/components/AgentBatchReviewPanel.vue`: batch job controls/progress.
- Modify `admin-web/src/views/NutritionGovernance/index.vue`: wire settings drawer and batch panel.
- Add `admin-web/tests/nutritionGovernanceDeepSeekAgent.test.js`: source-level regression checks.

## Task 1: Prisma Schema For Settings And Jobs

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605130001_deepseek_agent_nutrition_matching/migration.sql`
- Test: `backend/tests/prisma/deepseek-agent-nutrition-matching-schema.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Create `backend/tests/prisma/deepseek-agent-nutrition-matching-schema.spec.ts`:

```ts
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const readProjectFile = (...segments: string[]) =>
  readFileSync(join(__dirname, '../..', ...segments), 'utf8');

const modelBlock = (schema: string, modelName: string) => {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
};

describe('DeepSeek Agent nutrition matching schema', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('stores admin-only Agent provider configuration outside global config', () => {
    const block = modelBlock(schema, 'AgentProviderConfig');

    expect(block).toContain('purpose');
    expect(block).toContain('provider');
    expect(block).toContain('enabled');
    expect(block).toContain('baseUrl');
    expect(block).toContain('model');
    expect(block).toContain('apiKeyEncrypted');
    expect(block).toContain('apiKeyLast4');
    expect(block).toContain('maxConcurrency');
    expect(block).toContain('requestTimeoutMs');
    expect(block).toContain('retryCount');
    expect(block).toContain('@@unique([purpose, provider])');
    expect(schema).not.toMatch(/model GlobalConfig \\{[\\s\\S]*apiKeyEncrypted/);
  });

  it('stores batch Agent review job progress', () => {
    const block = modelBlock(schema, 'NutritionAgentReviewJob');

    expect(block).toContain('status');
    expect(block).toContain('provider');
    expect(block).toContain('model');
    expect(block).toContain('forceRerun');
    expect(block).toContain('totalCount');
    expect(block).toContain('processedCount');
    expect(block).toContain('successCount');
    expect(block).toContain('failedCount');
    expect(block).toContain('skippedCount');
    expect(block).toContain('failureDetails');
  });

  it('adds a migration for settings and job tables', () => {
    const migrationPath = join(
      __dirname,
      '../../prisma/migrations/202605130001_deepseek_agent_nutrition_matching/migration.sql',
    );

    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('agent_provider_config');
    expect(migration).toContain('nutrition_agent_review_job');
    expect(migration).toContain('api_key_encrypted');
  });
});
```

- [ ] **Step 2: Run the failing schema test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/prisma/deepseek-agent-nutrition-matching-schema.spec.ts --runInBand
```

Expected: FAIL because the models and migration do not exist.

- [ ] **Step 3: Add Prisma models**

Append focused models to `backend/prisma/schema.prisma`:

```prisma
model AgentProviderConfig {
  id               String   @id @default(uuid())
  purpose          String   @db.VarChar(80)
  provider         String   @db.VarChar(40)
  enabled          Boolean  @default(false)
  baseUrl          String   @map("base_url")
  model            String   @db.VarChar(120)
  apiKeyEncrypted  String?  @map("api_key_encrypted")
  apiKeyLast4      String?  @map("api_key_last4") @db.VarChar(12)
  maxConcurrency   Int      @default(1) @map("max_concurrency")
  requestTimeoutMs Int      @default(90000) @map("request_timeout_ms")
  retryCount       Int      @default(2) @map("retry_count")
  updatedBy        String?  @map("updated_by")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@unique([purpose, provider])
  @@map("agent_provider_config")
}

model NutritionAgentReviewJob {
  id             String   @id @default(uuid())
  status         String   @db.VarChar(40)
  provider       String   @db.VarChar(40)
  model          String   @db.VarChar(120)
  scope          Json?
  forceRerun     Boolean  @default(false) @map("force_rerun")
  limit          Int      @default(50)
  totalCount     Int      @default(0) @map("total_count")
  processedCount Int      @default(0) @map("processed_count")
  successCount   Int      @default(0) @map("success_count")
  failedCount    Int      @default(0) @map("failed_count")
  skippedCount   Int      @default(0) @map("skipped_count")
  failureDetails Json?    @map("failure_details")
  lastError      String?  @map("last_error")
  createdBy      String?  @map("created_by")
  startedAt      DateTime? @map("started_at")
  finishedAt     DateTime? @map("finished_at")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([status])
  @@index([createdAt])
  @@map("nutrition_agent_review_job")
}
```

- [ ] **Step 4: Add migration SQL**

Create `backend/prisma/migrations/202605130001_deepseek_agent_nutrition_matching/migration.sql`:

```sql
CREATE TABLE IF NOT EXISTS "agent_provider_config" (
  "id" TEXT NOT NULL,
  "purpose" VARCHAR(80) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "base_url" TEXT NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "api_key_encrypted" TEXT,
  "api_key_last4" VARCHAR(12),
  "max_concurrency" INTEGER NOT NULL DEFAULT 1,
  "request_timeout_ms" INTEGER NOT NULL DEFAULT 90000,
  "retry_count" INTEGER NOT NULL DEFAULT 2,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_provider_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_provider_config_purpose_provider_key"
  ON "agent_provider_config"("purpose", "provider");

CREATE TABLE IF NOT EXISTS "nutrition_agent_review_job" (
  "id" TEXT NOT NULL,
  "status" VARCHAR(40) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "scope" JSONB,
  "force_rerun" BOOLEAN NOT NULL DEFAULT false,
  "limit" INTEGER NOT NULL DEFAULT 50,
  "total_count" INTEGER NOT NULL DEFAULT 0,
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "failure_details" JSONB,
  "last_error" TEXT,
  "created_by" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_agent_review_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "nutrition_agent_review_job_status_idx"
  ON "nutrition_agent_review_job"("status");

CREATE INDEX IF NOT EXISTS "nutrition_agent_review_job_created_at_idx"
  ON "nutrition_agent_review_job"("created_at");
```

- [ ] **Step 5: Validate schema**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npx prisma validate
npm test -- tests/prisma/deepseek-agent-nutrition-matching-schema.spec.ts --runInBand
```

Expected: PASS.

## Task 2: Secure DeepSeek Settings Service

**Files:**
- Create: `backend/src/application/nutrition-governance/agent-provider-config.service.ts`
- Test: `backend/tests/application/nutrition-governance/agent-provider-config.service.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write failing tests**

Create tests for these behaviors:

```ts
describe('AgentProviderConfigService', () => {
  it('masks saved API keys and never returns the plaintext key');
  it('preserves an existing encrypted API key when apiKey is omitted');
  it('clears an API key when clearApiKey is true');
  it('rejects enabled settings without a configured API key');
  it('rejects non-HTTPS DeepSeek base URLs outside local development');
});
```

Use a Prisma mock with `agentProviderConfig.findUnique` and `agentProviderConfig.upsert`. Expected first run: FAIL because the service does not exist.

- [ ] **Step 2: Implement service**

Create a service with:

- `getSettings()`
- `updateSettings(input, userId)`
- `getEnabledDeepSeekRuntimeConfig()`
- `assertCanRun()`
- AES-256-GCM encryption helpers.

Defaults:

```ts
const DEFAULT_DEEPSEEK_SETTINGS = {
  purpose: 'NUTRITION_CANDIDATE_REVIEW',
  provider: 'DEEPSEEK',
  enabled: false,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  maxConcurrency: 1,
  requestTimeoutMs: 90000,
  retryCount: 2,
};
```

Public response shape:

```ts
{
  provider: 'DEEPSEEK',
  enabled: boolean,
  baseUrl: string,
  model: string,
  apiKeyConfigured: boolean,
  apiKeyLast4: string | null,
  maxConcurrency: number,
  requestTimeoutMs: number,
  retryCount: number,
}
```

- [ ] **Step 3: Register service**

Add `AgentProviderConfigService` to `AppModule.providers`.

- [ ] **Step 4: Run tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/application/nutrition-governance/agent-provider-config.service.spec.ts --runInBand
```

Expected: PASS.

## Task 3: DeepSeek Provider

**Files:**
- Modify: `backend/src/application/nutrition-governance/nutrition-candidate-review.provider.ts`
- Test: `backend/tests/application/nutrition-governance/deepseek-nutrition-candidate-review.provider.spec.ts`

- [ ] **Step 1: Write failing tests**

Test that `DeepSeekNutritionCandidateReviewProvider`:

- POSTs to `https://api.deepseek.com/chat/completions`.
- sends `response_format: { type: 'json_object' }`.
- includes an explicit JSON-only instruction in messages.
- parses `choices[0].message.content`.
- returns normalized `provider: 'deepseek'`.
- throws a sanitized error for non-2xx responses.

- [ ] **Step 2: Export shared helpers**

Make prompt, payload builder, JSON parser normalizer reusable:

- `buildNutritionCandidateReviewSystemPrompt`
- `buildNutritionCandidateReviewPayload`
- `normalizeNutritionCandidateAgentReview`

- [ ] **Step 3: Implement DeepSeek provider**

Constructor input:

```ts
{
  apiKey: string;
  baseUrl?: string;
  model?: string;
  requestTimeoutMs?: number;
}
```

Request body:

```ts
{
  model,
  messages: [
    { role: 'system', content: buildNutritionCandidateReviewSystemPrompt() },
    { role: 'user', content: JSON.stringify(buildNutritionCandidateReviewPayload(input)) }
  ],
  response_format: { type: 'json_object' },
  stream: false,
  temperature: 0,
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/application/nutrition-governance/deepseek-nutrition-candidate-review.provider.spec.ts --runInBand
```

Expected: PASS.

## Task 4: Batch Agent Review Job

**Files:**
- Modify: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Test: `backend/tests/application/nutrition-governance/nutrition-candidate-batch-agent-review.spec.ts`

- [ ] **Step 1: Write failing tests**

Test:

- job creates a `NutritionAgentReviewJob` row.
- job reviews pending candidates and stores Agent review, hard gates, review group, and labels.
- job skips candidates with existing Agent review when `forceRerun` is false.
- job does not call `nutritionFood.create`, `nutritionFood.upsert`, `nutritionFoodMapping.upsert`, or `ingredient.update`.
- job marks partial failure when one provider call fails.
- job retries 429 before counting a failure.

- [ ] **Step 2: Implement methods**

Add:

```ts
async getAgentSettings()
async updateAgentSettings(input, userId)
async testAgentSettings()
async startBatchAgentReview(input, userId)
async getLatestAgentReviewJob()
async getAgentReviewJob(jobId: string)
```

Batch selection should only include `NutritionCandidateStatus.CANDIDATE`.

- [ ] **Step 3: Implement retry helper**

Retry only:

- HTTP/provider errors that expose `status === 429`
- transient `5xx`

Backoff can be small in-process delays: `250ms`, `500ms`.

- [ ] **Step 4: Run tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/application/nutrition-governance/nutrition-candidate-batch-agent-review.spec.ts --runInBand
```

Expected: PASS.

## Task 5: Backend DTOs And Controllers

**Files:**
- Modify: `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`
- Modify: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
- Test through Task 4 integration-style service tests plus build.

- [ ] **Step 1: Add DTOs**

Add:

- `UpdateAgentSettingsDto`
- `BatchAgentReviewCandidatesDto`

Validation rules:

- `enabled` optional boolean.
- `baseUrl` optional string.
- `model` optional non-empty string.
- `apiKey` optional string.
- `clearApiKey` optional boolean.
- `maxConcurrency` optional int min `1` max `5`.
- `requestTimeoutMs` optional int min `5000` max `300000`.
- `retryCount` optional int min `0` max `5`.
- batch `limit` optional int min `1` max `500`.
- `forceRerun` optional boolean.
- `confidence` and `reviewGroup` optional filters.

- [ ] **Step 2: Add endpoints**

Controller routes:

```ts
GET  agent-settings
PUT  agent-settings
POST agent-settings/test
POST candidates/batch-agent-review
GET  candidates/agent-review-jobs/latest
GET  candidates/agent-review-jobs/:id
```

- [ ] **Step 3: Build backend**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm run build
```

Expected: PASS.

## Task 6: Admin Web Settings And Batch UI

**Files:**
- Modify: `admin-web/src/types/nutritionGovernance.ts`
- Modify: `admin-web/src/api/nutritionGovernance.ts`
- Create: `admin-web/src/views/NutritionGovernance/components/AgentSettingsDrawer.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/AgentBatchReviewPanel.vue`
- Modify: `admin-web/src/views/NutritionGovernance/index.vue`
- Test: `admin-web/tests/nutritionGovernanceDeepSeekAgent.test.js`

- [ ] **Step 1: Write failing source regression test**

Create `admin-web/tests/nutritionGovernanceDeepSeekAgent.test.js` checking:

- API file exports `getAgentSettings`, `updateAgentSettings`, `testAgentSettings`, `startBatchAgentReview`.
- settings drawer contains `API Key`, `DeepSeek`, and does not bind a saved key field as a visible value.
- batch panel contains `批量 Agent 匹配` and `覆盖已有 Agent 建议`.
- main page imports both new components.

- [ ] **Step 2: Add types and API calls**

Add types:

- `AgentProviderSettings`
- `UpdateAgentProviderSettingsPayload`
- `NutritionAgentReviewJob`
- `BatchAgentReviewPayload`

Add API methods for the new endpoints.

- [ ] **Step 3: Add AgentSettingsDrawer**

Use Element Plus form controls:

- enabled switch
- base URL input
- model input
- API key password input with placeholder `留空则保留现有密钥`
- key status text
- max concurrency input number
- timeout input number
- retry count input number
- save/test/clear buttons

- [ ] **Step 4: Add AgentBatchReviewPanel**

Controls:

- `批量 Agent 匹配`
- limit input
- force rerun checkbox
- latest job progress.

- [ ] **Step 5: Wire index page**

Add:

- `Agent 设置` button in page header.
- batch panel above `FoodCandidatesTable`.
- refresh job after starting.
- reload candidates when batch starts/finishes.

- [ ] **Step 6: Run admin tests and build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
node --test tests/nutritionGovernanceDeepSeekAgent.test.js
npm run build
```

Expected: PASS.

## Task 7: Final Verification And Commit

**Files:** all changed files.

- [ ] **Step 1: Apply local DB schema**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npx prisma db push --skip-generate
```

Expected: database sync succeeds without data-loss prompt.

- [ ] **Step 2: Run backend checks**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npx prisma validate
npm test -- tests/prisma/deepseek-agent-nutrition-matching-schema.spec.ts tests/application/nutrition-governance/agent-provider-config.service.spec.ts tests/application/nutrition-governance/deepseek-nutrition-candidate-review.provider.spec.ts tests/application/nutrition-governance/nutrition-candidate-batch-agent-review.spec.ts --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
node --test tests/nutritionGovernanceDeepSeekAgent.test.js
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual browser sanity check**

Open:

```text
http://localhost:5173/nutrition-governance
```

Confirm:

- `Agent 设置` opens.
- Full API key is not visible after save.
- `批量 Agent 匹配` button is visible.
- Existing manual approval drawer still opens.

- [ ] **Step 5: Commit**

Run:

```bash
git status --short
git add backend/prisma/schema.prisma backend/prisma/migrations/202605130001_deepseek_agent_nutrition_matching/migration.sql backend/src/application/nutrition-governance backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts backend/src/interfaces/controllers/nutrition-governance.controller.ts backend/src/app.module.ts backend/tests admin-web/src/types/nutritionGovernance.ts admin-web/src/api/nutritionGovernance.ts admin-web/src/views/NutritionGovernance admin-web/tests/nutritionGovernanceDeepSeekAgent.test.js docs/superpowers/plans/2026-05-13-deepseek-agent-nutrition-matching.md
git commit -m "feat: add DeepSeek nutrition agent matching"
```

