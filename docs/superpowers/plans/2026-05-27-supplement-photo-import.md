# Supplement Photo Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only supplement photo recognition import flow in the miniapp recipe designer, with Web admin Agent configuration and guarded backend draft-to-ingredient confirmation.

**Architecture:** Use a draft-governed flow. The backend stores Agent configuration and supplement import drafts, calls an OpenAI-compatible vision model, normalizes only precise fields into the existing `Ingredient.nutritionProfile`, and blocks formal writes until validation and duplicate handling pass. The Web admin adds a standalone Agent configuration page; the miniapp adds supplement library, upload, and confirmation pages under the existing recipe designer path.

**Tech Stack:** NestJS, Prisma/PostgreSQL, existing `IngredientService`, Axios/OpenAI-compatible chat completions, Sharp image metadata checks, Vue 3 + Element Plus admin-web, uni-app miniapp, Jest and Vitest.

---

## Scope And Boundaries

This plan implements the first usable version from `docs/superpowers/specs/2026-05-27-supplement-photo-import-design.md`.

It does not add a staff workbench entry. It does not open the feature to non-admin users. It does not create an independent Web review workflow for drafts.

Existing unrelated miniapp edits in these files must be preserved:

- `miniapp/src/pages/network-settings/index.vue`
- `miniapp/src/utils/api.spec.ts`
- `miniapp/src/utils/api.ts`
- `miniapp/src/utils/config.ts`
- `miniapp/src/utils/runtime-base-url.spec.ts`
- `miniapp/src/utils/runtime-base-url.ts`

## File Structure

### Backend

- Modify `backend/prisma/schema.prisma`: add Agent config and supplement import draft enums/models.
- Create `backend/prisma/migrations/20260527090000_add_supplement_import_agent_and_drafts/migration.sql`: create database tables and indexes.
- Create `backend/src/application/agent/agent-config.types.ts`: shared Agent config DTO-like domain types.
- Create `backend/src/application/agent/agent-secret.service.ts`: encrypt/decrypt API keys before persistence.
- Create `backend/src/application/agent/agent-config.service.ts`: load, upsert, mask, enable/disable, and test config.
- Create `backend/src/application/supplement-import/supplement-import.types.ts`: draft, AI extraction, validation, duplicate, and normalized payload types.
- Create `backend/src/application/supplement-import/supplement-import-normalizer.ts`: deterministic nutrient alias matching, unit conversion, and confirm validation.
- Create `backend/src/application/supplement-import/supplement-import-agent.client.ts`: OpenAI-compatible vision/text model caller.
- Create `backend/src/application/supplement-import/supplement-import.service.ts`: image upload, draft creation, recognition, save, duplicate checks, confirm create/update.
- Create `backend/src/interfaces/dto/agent-config.dto.ts`: Web admin request DTOs.
- Create `backend/src/interfaces/dto/supplement-import.dto.ts`: miniapp request DTOs.
- Create `backend/src/interfaces/controllers/agent-config.controller.ts`: admin-only Agent config endpoints.
- Create `backend/src/interfaces/controllers/recipe-designer-supplement-import.controller.ts`: admin-only miniapp endpoints.
- Modify `backend/src/app.module.ts`: register controllers/services.
- Test `backend/tests/application/agent/agent-config.service.spec.ts`.
- Test `backend/tests/application/supplement-import/supplement-import-normalizer.spec.ts`.
- Test `backend/tests/application/supplement-import/supplement-import.service.spec.ts`.
- Test `backend/tests/interfaces/controllers/agent-config.controller.spec.ts`.
- Test `backend/tests/interfaces/controllers/recipe-designer-supplement-import.controller.spec.ts`.

### Admin Web

- Create `admin-web/src/api/agentConfig.ts`: Agent config API client and types.
- Create `admin-web/src/views/AgentConfig.vue`: standalone Agent configuration page.
- Modify `admin-web/src/router/index.ts`: add `/agent-config`.
- Modify `admin-web/src/layouts/MainLayout.vue`: add `Agent 配置` menu item.

### Miniapp

- Create `miniapp/src/utils/supplement-import.ts`: upload/create/read/update/confirm API helpers and admin role helpers.
- Create `miniapp/src/pages/recipe-diy/supplement-library.vue`: recipe designer supplement library entry surface.
- Create `miniapp/src/pages/recipe-diy/supplement-import.vue`: camera/album upload page.
- Create `miniapp/src/pages/recipe-diy/supplement-import-confirm.vue`: draft review and confirm page.
- Modify `miniapp/src/pages/recipe-diy/index.vue`: add a route into the supplement library under the recipe designer flow.
- Modify `miniapp/src/pages.json`: register the three new recipe designer pages.
- Test `miniapp/src/utils/supplement-import.spec.ts`.
- Test `miniapp/src/pages/recipe-diy.regression.spec.ts`.
- Test `miniapp/src/pages/supplement-import.regression.spec.ts`.

---

### Task 1: Database Schema And Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260527090000_add_supplement_import_agent_and_drafts/migration.sql`
- Test: `backend/tests/prisma/supplement-import-schema.spec.ts`

- [ ] **Step 1: Add schema regression test**

Create `backend/tests/prisma/supplement-import-schema.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('supplement import prisma schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('declares AgentConfig and SupplementImportDraft models', () => {
    expect(schema).toContain('model AgentConfig');
    expect(schema).toContain('model SupplementImportDraft');
    expect(schema).toContain('enum AgentType');
    expect(schema).toContain('SUPPLEMENT_IMPORT');
    expect(schema).toContain('@@unique([agentType])');
    expect(schema).toContain('@@index([status])');
    expect(schema).toContain('@@map("supplement_import_draft")');
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/prisma/supplement-import-schema.spec.ts
```

Expected: FAIL because the schema models are absent.

- [ ] **Step 3: Modify Prisma schema**

Add these enums near existing enums:

```prisma
enum AgentType {
  SUPPLEMENT_IMPORT
}

enum AgentProvider {
  OPENAI_COMPATIBLE
}

enum SupplementImportDraftStatus {
  CREATED
  IMAGE_RISK_DETECTED
  RECOGNIZING
  NEEDS_REVIEW
  READY_TO_CONFIRM
  CONFIRMED
  FAILED
  CANCELLED
}
```

Add these models near `GlobalConfig`:

```prisma
model AgentConfig {
  id                String        @id @default(uuid())
  agentType         AgentType     @map("agent_type")
  enabled           Boolean       @default(false)
  provider          AgentProvider @default(OPENAI_COMPATIBLE)
  baseUrl           String?       @map("base_url") @db.VarChar(500)
  apiKeyEncrypted   String?       @map("api_key_encrypted")
  visionModel       String?       @map("vision_model") @db.VarChar(120)
  textModel         String?       @map("text_model") @db.VarChar(120)
  temperature       Float         @default(0.1)
  timeoutMs         Int           @default(30000) @map("timeout_ms")
  maxRetries        Int           @default(1) @map("max_retries")
  promptVersion     String        @default("supplement-import-v1") @map("prompt_version") @db.VarChar(80)
  schemaVersion     String        @default("supplement-import-schema-v1") @map("schema_version") @db.VarChar(80)
  lastTestStatus    String?       @map("last_test_status") @db.VarChar(20)
  lastTestMessage   String?       @map("last_test_message")
  updatedBy         String?       @map("updated_by")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  @@unique([agentType])
  @@map("agent_config")
}

model SupplementImportDraft {
  id                    String                      @id @default(uuid())
  status                SupplementImportDraftStatus @default(CREATED)
  imageUrls             String[]                    @default([]) @map("image_urls")
  riskFlags             Json                        @default("[]") @map("risk_flags")
  rawOcrText            String?                     @map("raw_ocr_text")
  aiExtractedData       Json?                       @map("ai_extracted_data")
  normalizedDraft       Json?                       @map("normalized_draft")
  duplicateCandidates   Json                        @default("[]") @map("duplicate_candidates")
  validationErrors      Json                        @default("[]") @map("validation_errors")
  agentConfigSnapshot   Json?                       @map("agent_config_snapshot")
  modelUsage            Json?                       @map("model_usage")
  confirmedIngredientId String?                     @map("confirmed_ingredient_id")
  confirmedBy           String?                     @map("confirmed_by")
  confirmedAt           DateTime?                   @map("confirmed_at")
  createdBy             String                      @map("created_by")
  createdAt             DateTime                    @default(now()) @map("created_at")
  updatedAt             DateTime                    @updatedAt @map("updated_at")

  @@index([status])
  @@index([createdBy])
  @@index([confirmedIngredientId])
  @@index([createdAt])
  @@map("supplement_import_draft")
}
```

- [ ] **Step 4: Add SQL migration**

Create `backend/prisma/migrations/20260527090000_add_supplement_import_agent_and_drafts/migration.sql`:

```sql
CREATE TYPE "AgentType" AS ENUM ('SUPPLEMENT_IMPORT');
CREATE TYPE "AgentProvider" AS ENUM ('OPENAI_COMPATIBLE');
CREATE TYPE "SupplementImportDraftStatus" AS ENUM (
  'CREATED',
  'IMAGE_RISK_DETECTED',
  'RECOGNIZING',
  'NEEDS_REVIEW',
  'READY_TO_CONFIRM',
  'CONFIRMED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "agent_config" (
  "id" TEXT NOT NULL,
  "agent_type" "AgentType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" "AgentProvider" NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  "base_url" VARCHAR(500),
  "api_key_encrypted" TEXT,
  "vision_model" VARCHAR(120),
  "text_model" VARCHAR(120),
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
  "max_retries" INTEGER NOT NULL DEFAULT 1,
  "prompt_version" VARCHAR(80) NOT NULL DEFAULT 'supplement-import-v1',
  "schema_version" VARCHAR(80) NOT NULL DEFAULT 'supplement-import-schema-v1',
  "last_test_status" VARCHAR(20),
  "last_test_message" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_config_agent_type_key" ON "agent_config"("agent_type");

CREATE TABLE "supplement_import_draft" (
  "id" TEXT NOT NULL,
  "status" "SupplementImportDraftStatus" NOT NULL DEFAULT 'CREATED',
  "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "risk_flags" JSONB NOT NULL DEFAULT '[]',
  "raw_ocr_text" TEXT,
  "ai_extracted_data" JSONB,
  "normalized_draft" JSONB,
  "duplicate_candidates" JSONB NOT NULL DEFAULT '[]',
  "validation_errors" JSONB NOT NULL DEFAULT '[]',
  "agent_config_snapshot" JSONB,
  "model_usage" JSONB,
  "confirmed_ingredient_id" TEXT,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplement_import_draft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplement_import_draft_status_idx" ON "supplement_import_draft"("status");
CREATE INDEX "supplement_import_draft_created_by_idx" ON "supplement_import_draft"("created_by");
CREATE INDEX "supplement_import_draft_confirmed_ingredient_id_idx" ON "supplement_import_draft"("confirmed_ingredient_id");
CREATE INDEX "supplement_import_draft_created_at_idx" ON "supplement_import_draft"("created_at");
```

- [ ] **Step 5: Run schema test**

Run:

```bash
cd backend && npm test -- --runInBand tests/prisma/supplement-import-schema.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Generate Prisma client**

Run:

```bash
cd backend && DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} npx prisma generate
```

Expected: Prisma client generation succeeds.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260527090000_add_supplement_import_agent_and_drafts/migration.sql backend/tests/prisma/supplement-import-schema.spec.ts
git commit -m "feat: add supplement import draft schema"
```

### Task 2: Agent Config Backend

**Files:**
- Create: `backend/src/application/agent/agent-config.types.ts`
- Create: `backend/src/application/agent/agent-secret.service.ts`
- Create: `backend/src/application/agent/agent-config.service.ts`
- Create: `backend/src/interfaces/dto/agent-config.dto.ts`
- Create: `backend/src/interfaces/controllers/agent-config.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/agent/agent-config.service.spec.ts`
- Test: `backend/tests/interfaces/controllers/agent-config.controller.spec.ts`

- [ ] **Step 1: Write Agent config service tests**

Create `backend/tests/application/agent/agent-config.service.spec.ts`:

```ts
import { AgentConfigService } from '../../../src/application/agent/agent-config.service';
import { AgentSecretService } from '../../../src/application/agent/agent-secret.service';

describe('AgentConfigService', () => {
  const prisma = {
    agentConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AGENT_CONFIG_ENCRYPTION_KEY = 'test-secret';
  });

  it('masks api key on read', async () => {
    const secret = new AgentSecretService();
    prisma.agentConfig.findUnique.mockResolvedValue({
      id: 'cfg-1',
      agentType: 'SUPPLEMENT_IMPORT',
      enabled: true,
      provider: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEncrypted: secret.encrypt('sk-live-value'),
      visionModel: 'gpt-4.1-mini',
      textModel: 'gpt-4.1-mini',
      temperature: 0.1,
      timeoutMs: 30000,
      maxRetries: 1,
      promptVersion: 'supplement-import-v1',
      schemaVersion: 'supplement-import-schema-v1',
      lastTestStatus: null,
      lastTestMessage: null,
      updatedBy: 'admin-1',
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      updatedAt: new Date('2026-05-27T00:00:00.000Z'),
    });

    const service = new AgentConfigService(prisma as any, secret);
    const result = await service.getSupplementImportConfig();

    expect(result.apiKeyConfigured).toBe(true);
    expect((result as any).apiKeyEncrypted).toBeUndefined();
    expect((result as any).apiKey).toBeUndefined();
  });

  it('keeps existing encrypted key when update omits apiKey', async () => {
    prisma.agentConfig.findUnique.mockResolvedValue({
      id: 'cfg-1',
      apiKeyEncrypted: 'encrypted-existing',
    });
    prisma.agentConfig.upsert.mockResolvedValue({
      id: 'cfg-1',
      agentType: 'SUPPLEMENT_IMPORT',
      enabled: false,
      provider: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEncrypted: 'encrypted-existing',
      visionModel: 'vision-model',
      textModel: 'text-model',
      temperature: 0.1,
      timeoutMs: 30000,
      maxRetries: 1,
      promptVersion: 'supplement-import-v1',
      schemaVersion: 'supplement-import-schema-v1',
      lastTestStatus: null,
      lastTestMessage: null,
      updatedBy: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new AgentConfigService(prisma as any, new AgentSecretService());
    await service.updateSupplementImportConfig({ baseUrl: 'https://api.example.com/v1' }, 'admin-1');

    expect(prisma.agentConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ apiKeyEncrypted: 'encrypted-existing' }),
    }));
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/agent/agent-config.service.spec.ts
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Add Agent config types and secret service**

Create `backend/src/application/agent/agent-config.types.ts`:

```ts
export type SupplementImportAgentProvider = 'OPENAI_COMPATIBLE';

export interface SupplementImportAgentConfigView {
  id: string;
  enabled: boolean;
  provider: SupplementImportAgentProvider;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  visionModel: string | null;
  textModel: string | null;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  promptVersion: string;
  schemaVersion: string;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSupplementImportAgentConfigInput {
  enabled?: boolean;
  provider?: SupplementImportAgentProvider;
  baseUrl?: string | null;
  apiKey?: string | null;
  visionModel?: string | null;
  textModel?: string | null;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  promptVersion?: string;
  schemaVersion?: string;
}
```

Create `backend/src/application/agent/agent-secret.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class AgentSecretService {
  private key(): Buffer {
    const source =
      process.env.AGENT_CONFIG_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      'dev-agent-config-encryption-key';
    return crypto.createHash('sha256').update(source).digest();
  }

  encrypt(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [ivRaw, tagRaw, encryptedRaw] = payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivRaw, 'base64'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
```

- [ ] **Step 4: Add service and DTO/controller**

Implement `AgentConfigService` with these public methods:

```ts
async getSupplementImportConfig(): Promise<SupplementImportAgentConfigView>
async updateSupplementImportConfig(input: UpdateSupplementImportAgentConfigInput, userId: string): Promise<SupplementImportAgentConfigView>
async getEnabledSupplementImportConfigForUse(): Promise<{ baseUrl: string; apiKey: string; visionModel: string; textModel: string; temperature: number; timeoutMs: number; maxRetries: number; promptVersion: string; schemaVersion: string; snapshot: Record<string, unknown> }>
async testSupplementImportConfig(userId: string): Promise<{ ok: boolean; message: string }>
```

The controller paths are:

```ts
@Controller('api/v1/admin/agent-configs/supplement-import')
@UseGuards(AuthGuard, AdminGuard)
export class AgentConfigController {
  @Get()
  get()

  @Put()
  update(@Body() dto: UpdateSupplementImportAgentConfigDto, @CurrentUser() user: RequestUser)

  @Post('test')
  test(@CurrentUser() user: RequestUser)
}
```

DTO constraints:

```ts
enabled?: boolean;
provider?: 'OPENAI_COMPATIBLE';
baseUrl?: string | null;
apiKey?: string | null;
visionModel?: string | null;
textModel?: string | null;
temperature?: number;
timeoutMs?: number;
maxRetries?: number;
promptVersion?: string;
schemaVersion?: string;
```

Use `ApiResponseDto.success(...)` for successful responses. Do not return the secret.

- [ ] **Step 5: Add controller tests**

Create `backend/tests/interfaces/controllers/agent-config.controller.spec.ts` with a Nest testing module that verifies:

```ts
expect(Reflect.getMetadata('__guards__', AgentConfigController)).toEqual(
  expect.arrayContaining([expect.any(Function), expect.any(Function)]),
);
```

and verifies `get`, `update`, and `test` delegate to the service and return `code === 0`.

- [ ] **Step 6: Register in AppModule**

Modify `backend/src/app.module.ts`:

```ts
import { AgentConfigController } from './interfaces/controllers/agent-config.controller';
import { AgentConfigService } from './application/agent/agent-config.service';
import { AgentSecretService } from './application/agent/agent-secret.service';
```

Add `AgentConfigController` to `controllers` and `AgentConfigService`, `AgentSecretService` to `providers`.

- [ ] **Step 7: Run tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/agent/agent-config.service.spec.ts tests/interfaces/controllers/agent-config.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/agent backend/src/interfaces/dto/agent-config.dto.ts backend/src/interfaces/controllers/agent-config.controller.ts backend/src/app.module.ts backend/tests/application/agent backend/tests/interfaces/controllers/agent-config.controller.spec.ts
git commit -m "feat: add supplement import agent config API"
```

### Task 3: Supplement Import Normalization

**Files:**
- Create: `backend/src/application/supplement-import/supplement-import.types.ts`
- Create: `backend/src/application/supplement-import/supplement-import-normalizer.ts`
- Test: `backend/tests/application/supplement-import/supplement-import-normalizer.spec.ts`

- [ ] **Step 1: Write normalizer tests**

Create `backend/tests/application/supplement-import/supplement-import-normalizer.spec.ts`:

```ts
import {
  normalizeExtractedSupplementImport,
  validateSupplementImportForConfirm,
  classifySupplementImportDuplicates,
} from '../../../src/application/supplement-import/supplement-import-normalizer';

describe('supplement import normalizer', () => {
  it('maps nutrient aliases and converts mass units into catalog units', () => {
    const result = normalizeExtractedSupplementImport({
      ingredient: {
        name: '海藻碘片',
        brand: 'Ocean',
        productSpec: '90片',
        baseUnit: 'PCS',
        unitDisplayLabel: '片',
        weightG: 0.5,
        addTiming: 'BEFORE_MEAL',
        productionLossRate: 1.05,
        categoryType: 'MINERAL',
      },
      nutrition: {
        rawBasisType: 'PER_SERVING',
        servingWeightG: 0.5,
        items: [
          { name: 'Iodine', value: 0.15, unit: 'mg', confidence: 0.98 },
          { name: 'DHA', value: 0.12, unit: 'g', confidence: 0.97 },
        ],
      },
    } as any, ['https://cdn.example.com/label.jpg']);

    expect(result.ingredient.name).toBe('海藻碘片');
    expect(result.nutritionProfile.minerals.iodine).toBe(150);
    expect(result.nutritionProfile.fattyAcids.dha).toBe(120);
    expect(result.rejectedNutritionItems).toEqual([]);
  });

  it('rejects unmatched nutrients from core nutrition fields', () => {
    const result = normalizeExtractedSupplementImport({
      ingredient: {
        name: '草本粉',
        brand: 'Herb',
        productSpec: '100g',
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        addTiming: 'BEFORE_MIXING',
        productionLossRate: 1.05,
        categoryType: 'FUNCTIONAL',
      },
      nutrition: {
        rawBasisType: 'PER_100_G',
        items: [{ name: '神秘活性物', value: 20, unit: 'mg', confidence: 0.99 }],
      },
    } as any, []);

    expect(result.nutritionProfile.customItems).toEqual([]);
    expect(result.rejectedNutritionItems[0].reason).toContain('无法匹配系统营养字段');
  });

  it('blocks confirmation when key fields or duplicate resolution are missing', () => {
    const validation = validateSupplementImportForConfirm({
      ingredient: {
        name: '',
        type: 'SUPPLEMENT',
        brand: 'Ocean',
        productSpec: '90片',
        baseUnit: 'PCS',
        unitDisplayLabel: '片',
        addTiming: 'BEFORE_MEAL',
        productionLossRate: 1.05,
        categoryType: 'MINERAL',
      },
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING', sourceType: 'LABEL' },
        macros: {},
        minerals: { iodine: 150 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
      duplicateResolution: null,
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'EXACT' }],
    } as any);

    expect(validation.canConfirm).toBe(false);
    expect(validation.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(['INGREDIENT_NAME_REQUIRED', 'DUPLICATE_RESOLUTION_REQUIRED']),
    );
  });

  it('classifies exact duplicate by name brand and product spec', () => {
    const candidates = classifySupplementImportDuplicates({
      name: '海藻碘片',
      brand: 'Ocean',
      productSpec: '90片',
    }, [
      { id: 'ing-1', name: ' 海藻碘片 ', brand: 'ocean', productModel: '90 片' },
    ] as any);

    expect(candidates[0]).toMatchObject({
      ingredientId: 'ing-1',
      matchType: 'EXACT',
    });
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/supplement-import/supplement-import-normalizer.spec.ts
```

Expected: FAIL because the normalizer does not exist.

- [ ] **Step 3: Add supplement import types**

Create type definitions with these exported names:

```ts
export type SupplementImportRiskLevel = 'INFO' | 'WARNING' | 'BLOCKING';
export type SupplementDuplicateMatchType = 'EXACT' | 'LIKELY' | 'POSSIBLE';
export type SupplementDuplicateResolutionAction = 'CREATE_NEW' | 'UPDATE_EXISTING';
export type SupplementAddTiming = 'BEFORE_MIXING' | 'BEFORE_MEAL';
export type SupplementCategoryType = 'MINERAL' | 'VITAMIN' | 'AMINO_ACID' | 'FATTY_ACID' | 'PROBIOTIC' | 'FUNCTIONAL' | 'OTHER';
```

Also export `ExtractedSupplementImportPayload`, `NormalizedSupplementImportDraft`, `SupplementImportValidationResult`, `SupplementDuplicateCandidate`, and `SupplementImportRiskFlag`.

- [ ] **Step 4: Implement deterministic normalizer**

In `supplement-import-normalizer.ts`, import `NUTRITION_FIELD_CATALOG` and implement:

```ts
export function normalizeExtractedSupplementImport(input: ExtractedSupplementImportPayload, imageUrls: string[]): NormalizedSupplementImportDraft
export function validateSupplementImportForConfirm(draft: NormalizedSupplementImportDraft): SupplementImportValidationResult
export function classifySupplementImportDuplicates(draftIngredient: { name: string; brand?: string | null; productSpec?: string | null }, existing: Array<{ id: string; name: string; brand?: string | null; productModel?: string | null }>): SupplementDuplicateCandidate[]
```

Alias map must include:

```ts
const NUTRIENT_ALIASES: Record<string, string> = {
  ca: 'minerals.calcium',
  calcium: 'minerals.calcium',
  钙: 'minerals.calcium',
  p: 'minerals.phosphorus',
  phosphorus: 'minerals.phosphorus',
  磷: 'minerals.phosphorus',
  iodine: 'minerals.iodine',
  iodide: 'minerals.iodine',
  碘: 'minerals.iodine',
  vitamin_d: 'vitamins.vitaminD',
  vitamin_d3: 'vitamins.vitaminD',
  '维生素d': 'vitamins.vitaminD',
  dha: 'fattyAcids.dha',
  epa: 'fattyAcids.epa',
  taurine: 'aminoAcids.taurine',
  牛磺酸: 'aminoAcids.taurine',
};
```

Conversion rules:

```ts
g -> mg: value * 1000
mg -> g: value / 1000
mg -> μg: value * 1000
μg -> mg: value / 1000
kJ -> kcal: value / 4.184
kcal -> kJ: value * 4.184
same unit -> same value
IU -> IU: same value
IU <-> mass: reject unless the standard catalog unit is IU and raw unit is IU
```

Validation must block:

```ts
name missing
brand missing
productSpec missing
baseUnit not in G/ML/PCS
unitDisplayLabel missing
addTiming not BEFORE_MIXING/BEFORE_MEAL
productionLossRate missing or <= 0
duplicate candidate EXACT without UPDATE_EXISTING target
duplicate candidate LIKELY without a resolution
any risk flag with level BLOCKING
```

- [ ] **Step 5: Run test**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/supplement-import/supplement-import-normalizer.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/supplement-import backend/tests/application/supplement-import/supplement-import-normalizer.spec.ts
git commit -m "feat: add supplement import normalization"
```

### Task 4: Draft Service And Agent Client

**Files:**
- Create: `backend/src/application/supplement-import/supplement-import-agent.client.ts`
- Create: `backend/src/application/supplement-import/supplement-import.service.ts`
- Create: `backend/src/interfaces/dto/supplement-import.dto.ts`
- Create: `backend/src/interfaces/controllers/recipe-designer-supplement-import.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/supplement-import/supplement-import.service.spec.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer-supplement-import.controller.spec.ts`

- [ ] **Step 1: Write service tests**

Create `backend/tests/application/supplement-import/supplement-import.service.spec.ts` that verifies:

```ts
it('refuses draft creation when Agent is disabled', async () => {
  agentConfigService.getEnabledSupplementImportConfigForUse.mockRejectedValue(new Error('补剂识别 Agent 未启用'));
  await expect(service.createDraft({ imageUrls: ['https://cdn.example.com/a.jpg'] }, adminUser))
    .rejects.toThrow('补剂识别 Agent 未启用');
});

it('stores recognized normalized draft with validation errors and duplicate candidates', async () => {
  agentConfigService.getEnabledSupplementImportConfigForUse.mockResolvedValue(enabledConfig);
  agentClient.recognize.mockResolvedValue(extractedOceanIodinePayload);
  prisma.ingredient.findMany.mockResolvedValue([{ id: 'ing-1', name: '海藻碘片', brand: 'Ocean', productModel: '90片' }]);
  prisma.supplementImportDraft.create.mockResolvedValue(createdRecord);
  prisma.supplementImportDraft.update.mockResolvedValue(reviewRecord);

  const result = await service.createDraft({ imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'] }, adminUser);

  expect(result.status).toBe('NEEDS_REVIEW');
  expect(result.duplicateCandidates[0].matchType).toBe('EXACT');
});

it('confirms a complete new draft into Ingredient', async () => {
  prisma.supplementImportDraft.findUnique.mockResolvedValue(readyRecordForCreate);
  ingredientService.createIngredient.mockResolvedValue({ id: 'new-ing-1' });

  const result = await service.confirmDraft('draft-1', adminUser);

  expect(ingredientService.createIngredient).toHaveBeenCalledWith(expect.objectContaining({
    type: 'SUPPLEMENT',
    brand: 'Ocean',
    productModel: '90片',
    nutritionProfile: expect.objectContaining({
      meta: expect.objectContaining({ sourceType: 'LABEL' }),
    }),
  }));
  expect(result.confirmedIngredientId).toBe('new-ing-1');
});
```

- [ ] **Step 2: Run service test and verify failure**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/supplement-import/supplement-import.service.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement Agent client**

`SupplementImportAgentClient.recognize(config, imageUrls)` must call:

```ts
POST ${baseUrl.replace(/\/$/, '')}/chat/completions
Authorization: Bearer ${apiKey}
Content-Type: application/json
```

The body must use `visionModel`, `temperature`, and a JSON-only prompt. The response parser must accept `choices[0].message.content` as either a JSON string or fenced JSON and return `ExtractedSupplementImportPayload`.

The prompt must request this JSON shape:

```json
{
  "ingredient": {
    "name": "string",
    "brand": "string",
    "productSpec": "string",
    "baseUnit": "G|ML|PCS",
    "unitDisplayLabel": "string",
    "weightG": 0,
    "addTiming": "BEFORE_MIXING|BEFORE_MEAL",
    "productionLossRate": 1.05,
    "categoryType": "MINERAL|VITAMIN|AMINO_ACID|FATTY_ACID|PROBIOTIC|FUNCTIONAL|OTHER",
    "notes": "string"
  },
  "nutrition": {
    "rawBasisType": "PER_100_G|PER_100_ML|PER_1_G|PER_1_ML|PER_SERVING",
    "servingWeightG": 0,
    "sampleState": "POWDER|OIL|CONCENTRATE|RAW",
    "items": [
      { "name": "string", "value": 0, "unit": "g|mg|μg|IU|kcal|kJ|%", "confidence": 0.95 }
    ]
  },
  "rawOcrText": "string",
  "risks": [
    { "level": "INFO|WARNING|BLOCKING", "code": "string", "message": "string" }
  ]
}
```

- [ ] **Step 4: Implement service**

`SupplementImportService` public methods:

```ts
uploadImages(files: Express.Multer.File[], user: RequestUser): Promise<Array<{ url: string; key: string }>>
createDraft(input: CreateSupplementImportDraftDto, user: RequestUser): Promise<any>
getDraft(id: string, user: RequestUser): Promise<any>
updateDraft(id: string, input: UpdateSupplementImportDraftDto, user: RequestUser): Promise<any>
confirmDraft(id: string, user: RequestUser): Promise<any>
```

Implementation rules:

- `uploadImages` stores files in COS folder `supplement-import`.
- `createDraft` checks enabled Agent config before creating the draft.
- `createDraft` stores an initial `RECOGNIZING` record, calls the Agent, normalizes output, detects duplicates from `Ingredient` records where `type: SUPPLEMENT`, validates, and updates draft to `READY_TO_CONFIRM` when `canConfirm` is true, otherwise `NEEDS_REVIEW`.
- Agent failure updates draft to `FAILED` with one validation error and rethrows a business error.
- `updateDraft` replaces `normalizedDraft`, recalculates validation, and stores `READY_TO_CONFIRM` or `NEEDS_REVIEW`.
- `confirmDraft` reruns validation from persisted data and rejects when `canConfirm` is false.
- New record action uses `IngredientService.createIngredient`.
- Existing update action uses `IngredientService.updateIngredient(targetIngredientId, payload)`.
- Confirmation updates draft `status`, `confirmedIngredientId`, `confirmedBy`, `confirmedAt`.

The ingredient payload must include:

```ts
{
  name,
  type: IngredientType.SUPPLEMENT,
  procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
  diyEnabled: true,
  procurementEnabled: false,
  brand,
  productModel: productSpec,
  notes,
  baseUnit,
  unitDisplayLabel,
  purchaseUnit: unitDisplayLabel,
  purchaseToBaseRatio: 1,
  currentPricePerPurchaseUnit: 0,
  weightG,
  properties: {
    category_type: categoryType,
    add_timing: addTiming,
    production_loss_rate: productionLossRate,
  },
  nutritionProfile,
}
```

- [ ] **Step 5: Implement DTO/controller**

Controller:

```ts
@Controller('api/v1/recipe-designer/supplement-import-drafts')
@UseGuards(AuthGuard, AdminGuard)
export class RecipeDesignerSupplementImportController {
  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 6))
  uploadImages(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: RequestUser)

  @Post()
  create(@Body() dto: CreateSupplementImportDraftDto, @CurrentUser() user: RequestUser)

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: RequestUser)

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplementImportDraftDto, @CurrentUser() user: RequestUser)

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: RequestUser)
}
```

DTOs:

```ts
CreateSupplementImportDraftDto: { imageUrls: string[] }
UpdateSupplementImportDraftDto: { normalizedDraft: NormalizedSupplementImportDraft }
```

- [ ] **Step 6: Register in AppModule**

Register `RecipeDesignerSupplementImportController`, `SupplementImportService`, and `SupplementImportAgentClient`.

- [ ] **Step 7: Run backend draft tests**

Run:

```bash
cd backend && npm test -- --runInBand tests/application/supplement-import/supplement-import.service.spec.ts tests/interfaces/controllers/recipe-designer-supplement-import.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/supplement-import backend/src/interfaces/dto/supplement-import.dto.ts backend/src/interfaces/controllers/recipe-designer-supplement-import.controller.ts backend/src/app.module.ts backend/tests/application/supplement-import backend/tests/interfaces/controllers/recipe-designer-supplement-import.controller.spec.ts
git commit -m "feat: add supplement import draft API"
```

### Task 5: Admin Web Agent Config Page

**Files:**
- Create: `admin-web/src/api/agentConfig.ts`
- Create: `admin-web/src/views/AgentConfig.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Add API client**

Create `admin-web/src/api/agentConfig.ts`:

```ts
import api from './index'

export interface SupplementImportAgentConfig {
  id: string
  enabled: boolean
  provider: 'OPENAI_COMPATIBLE'
  baseUrl: string | null
  apiKeyConfigured: boolean
  visionModel: string | null
  textModel: string | null
  temperature: number
  timeoutMs: number
  maxRetries: number
  promptVersion: string
  schemaVersion: string
  lastTestStatus: string | null
  lastTestMessage: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateSupplementImportAgentConfig = Partial<
  Pick<
    SupplementImportAgentConfig,
    'enabled' | 'provider' | 'baseUrl' | 'visionModel' | 'textModel' | 'temperature' | 'timeoutMs' | 'maxRetries' | 'promptVersion' | 'schemaVersion'
  >
> & {
  apiKey?: string | null
}

export const agentConfigApi = {
  getSupplementImport: (): Promise<SupplementImportAgentConfig> =>
    api.get('/admin/agent-configs/supplement-import'),
  updateSupplementImport: (data: UpdateSupplementImportAgentConfig): Promise<SupplementImportAgentConfig> =>
    api.put('/admin/agent-configs/supplement-import', data),
  testSupplementImport: (): Promise<{ ok: boolean; message: string }> =>
    api.post('/admin/agent-configs/supplement-import/test')
}
```

- [ ] **Step 2: Add page**

Create `admin-web/src/views/AgentConfig.vue` with:

- title `Agent 配置`
- one Element Plus card titled `补剂识别 Agent`
- enable switch
- provider select locked to `OpenAI-compatible`
- base URL input
- API Key password input with helper text showing whether a key is configured
- vision model input
- text model input
- temperature number input
- timeout number input
- max retries number input
- prompt/schema version inputs
- buttons `保存配置` and `测试连接`
- status line for last test result and update time

Form defaults:

```ts
const form = ref({
  enabled: false,
  provider: 'OPENAI_COMPATIBLE' as const,
  baseUrl: '',
  apiKey: '',
  visionModel: 'gpt-4.1-mini',
  textModel: 'gpt-4.1-mini',
  temperature: 0.1,
  timeoutMs: 30000,
  maxRetries: 1,
  promptVersion: 'supplement-import-v1',
  schemaVersion: 'supplement-import-schema-v1',
})
```

Save rule:

```ts
const payload = { ...form.value }
if (!payload.apiKey?.trim()) {
  delete payload.apiKey
}
```

- [ ] **Step 3: Add route and menu**

Add route:

```ts
{
  path: 'agent-config',
  name: 'AgentConfig',
  component: () => import('@/views/AgentConfig.vue'),
  meta: { title: 'Agent 配置' }
}
```

Add menu item near global config:

```vue
<el-menu-item index="/agent-config">
  <el-icon><Connection /></el-icon>
  <span>Agent 配置</span>
</el-menu-item>
```

Import `Connection` from `@element-plus/icons-vue`.

- [ ] **Step 4: Build admin web**

Run:

```bash
cd admin-web && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/api/agentConfig.ts admin-web/src/views/AgentConfig.vue admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue
git commit -m "feat: add agent config admin page"
```

### Task 6: Miniapp API Helpers And Recipe Designer Entry

**Files:**
- Create: `miniapp/src/utils/supplement-import.ts`
- Modify: `miniapp/src/pages/recipe-diy/index.vue`
- Modify: `miniapp/src/pages.json`
- Test: `miniapp/src/utils/supplement-import.spec.ts`
- Test: `miniapp/src/pages/recipe-diy.regression.spec.ts`

- [ ] **Step 1: Add helper tests**

Create `miniapp/src/utils/supplement-import.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  isAdminUser,
  buildSupplementImportUploadUrl,
  canShowSupplementImportEntry,
} from './supplement-import'

describe('supplement import miniapp helpers', () => {
  it('shows import entry only for admin users', () => {
    expect(isAdminUser({ role: 'ADMIN' })).toBe(true)
    expect(isAdminUser({ role: 'STAFF' })).toBe(false)
    expect(isAdminUser({ role: 'CUSTOMER' })).toBe(false)
    expect(canShowSupplementImportEntry({ role: 'ADMIN' })).toBe(true)
  })

  it('builds the backend upload endpoint', () => {
    expect(buildSupplementImportUploadUrl('http://127.0.0.1:3011/api/v1')).toBe(
      'http://127.0.0.1:3011/api/v1/recipe-designer/supplement-import-drafts/images',
    )
  })
})
```

- [ ] **Step 2: Add page regression test**

Extend `miniapp/src/pages/recipe-diy.regression.spec.ts`:

```ts
it('links recipe designer to supplement library without using staff workbench', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/recipe-diy/index.vue'), 'utf-8')

  expect(source).toContain('goToSupplementLibrary')
  expect(source).toContain('/pages/recipe-diy/supplement-library')
  expect(source).not.toContain('/pages/staff-workbench')
})
```

- [ ] **Step 3: Implement API helper**

Create `miniapp/src/utils/supplement-import.ts`:

```ts
import { getBaseUrl } from './config'
import { getToken, request } from './api'

export function isAdminUser(user: any): boolean {
  return user?.role === 'ADMIN' || user?.user?.role === 'ADMIN'
}

export function getStoredMiniappUser(): any {
  const stored = uni.getStorageSync('user') || uni.getStorageSync('userInfo')
  if (!stored) return null
  if (typeof stored === 'string') {
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  }
  return stored
}

export function canShowSupplementImportEntry(user = getStoredMiniappUser()): boolean {
  return isAdminUser(user)
}

export function buildSupplementImportUploadUrl(baseUrl = getBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}/recipe-designer/supplement-import-drafts/images`
}

export function uploadSupplementImportImage(filePath: string): Promise<{ url: string; key: string }> {
  return new Promise((resolve, reject) => {
    const token = getToken()
    uni.uploadFile({
      url: buildSupplementImportUploadUrl(),
      filePath,
      name: 'files',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (uploadRes: any) => {
        try {
          const parsed = JSON.parse(uploadRes.data)
          if ((uploadRes.statusCode === 200 || uploadRes.statusCode === 201) && parsed.code === 0) {
            resolve(Array.isArray(parsed.data) ? parsed.data[0] : parsed.data)
            return
          }
          reject(new Error(parsed.message || '图片上传失败'))
        } catch {
          reject(new Error('图片上传响应解析失败'))
        }
      },
      fail: reject,
    })
  })
}

export const supplementImportApi = {
  createDraft: (imageUrls: string[]) =>
    request({ url: '/recipe-designer/supplement-import-drafts', method: 'POST', data: { imageUrls } }),
  getDraft: (id: string) =>
    request({ url: `/recipe-designer/supplement-import-drafts/${id}`, method: 'GET' }),
  updateDraft: (id: string, normalizedDraft: any) =>
    request({ url: `/recipe-designer/supplement-import-drafts/${id}`, method: 'PUT', data: { normalizedDraft } }),
  confirmDraft: (id: string) =>
    request({ url: `/recipe-designer/supplement-import-drafts/${id}/confirm`, method: 'POST' }),
}
```

- [ ] **Step 4: Add recipe designer entry**

In `miniapp/src/pages/recipe-diy/index.vue`, import:

```ts
import { canShowSupplementImportEntry } from '../../utils/supplement-import'
```

Add computed:

```ts
const showSupplementLibraryEntry = computed(() => canShowSupplementImportEntry())
```

Add function:

```ts
function goToSupplementLibrary() {
  uni.navigateTo({
    url: `/pages/recipe-diy/supplement-library?recipeId=${recipeId.value}`,
  })
}
```

Add a compact action row inside the recipe info section:

```vue
<view v-if="showSupplementLibraryEntry" class="supplement-library-entry" @tap="goToSupplementLibrary">
  <text class="supplement-library-title">补剂库</text>
  <text class="supplement-library-desc">搜索补剂或拍照识别新增</text>
  <text class="supplement-library-arrow">›</text>
</view>
```

- [ ] **Step 5: Register pages**

Add to `miniapp/src/pages.json` top-level pages:

```json
{
  "path": "pages/recipe-diy/supplement-library",
  "style": { "navigationBarTitleText": "补剂库" }
},
{
  "path": "pages/recipe-diy/supplement-import",
  "style": { "navigationBarTitleText": "拍照识别补剂" }
},
{
  "path": "pages/recipe-diy/supplement-import-confirm",
  "style": { "navigationBarTitleText": "确认补剂档案" }
}
```

- [ ] **Step 6: Run miniapp tests**

Run:

```bash
cd miniapp && npm test -- src/utils/supplement-import.spec.ts src/pages/recipe-diy.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add miniapp/src/utils/supplement-import.ts miniapp/src/utils/supplement-import.spec.ts miniapp/src/pages/recipe-diy/index.vue miniapp/src/pages/recipe-diy.regression.spec.ts miniapp/src/pages.json
git commit -m "feat: add recipe designer supplement library entry"
```

### Task 7: Miniapp Supplement Library And Upload Pages

**Files:**
- Create: `miniapp/src/pages/recipe-diy/supplement-library.vue`
- Create: `miniapp/src/pages/recipe-diy/supplement-import.vue`
- Test: `miniapp/src/pages/supplement-import.regression.spec.ts`

- [ ] **Step 1: Add page regression tests**

Create `miniapp/src/pages/supplement-import.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('supplement import pages', () => {
  it('offers camera and album import actions', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/recipe-diy/supplement-import.vue'), 'utf-8')

    expect(source).toContain("sourceType: ['camera']")
    expect(source).toContain("sourceType: ['album']")
    expect(source).toContain('uploadSupplementImportImage')
    expect(source).toContain('createDraft')
  })

  it('keeps supplement import under recipe diy pages', () => {
    const library = readFileSync(resolve(process.cwd(), 'src/pages/recipe-diy/supplement-library.vue'), 'utf-8')

    expect(library).toContain('/pages/recipe-diy/supplement-import')
    expect(library).toContain('拍照识别新增')
  })
})
```

- [ ] **Step 2: Create supplement library page**

`supplement-library.vue` should:

- read `recipeId`
- verify admin role with `canShowSupplementImportEntry`
- show a search input
- call `request({ url: '/admin/ingredients', method: 'GET' })` and filter `type === 'SUPPLEMENT'`
- show supplement cards with name, brand, product spec, unit display, add timing
- show a primary `拍照识别新增` button for admins
- navigate to `/pages/recipe-diy/supplement-import?recipeId=${recipeId.value}`

Use this script shape:

```ts
const recipeId = ref('')
const searchText = ref('')
const supplements = ref<any[]>([])
const loading = ref(false)

const filteredSupplements = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  return supplements.value.filter((item) => {
    if (item.type !== 'SUPPLEMENT') return false
    if (!keyword) return true
    return [item.name, item.brand, item.productModel].filter(Boolean).join(' ').toLowerCase().includes(keyword)
  })
})
```

- [ ] **Step 3: Create upload page**

`supplement-import.vue` should:

- keep `selectedImages: Array<{ localPath: string; uploadedUrl?: string; uploading?: boolean; error?: string }>`
- provide `chooseFromCamera()` and `chooseFromAlbum()`
- call `uni.chooseImage({ count: 6 - selectedImages.value.length, sourceType: ['camera'] })`
- call `uni.chooseImage({ count: 6 - selectedImages.value.length, sourceType: ['album'] })`
- upload each selected image with `uploadSupplementImportImage`
- create draft using uploaded URLs
- navigate to `/pages/recipe-diy/supplement-import-confirm?draftId=${draft.id}&recipeId=${recipeId.value}`

Submit rule:

```ts
const canCreateDraft = computed(() => selectedImages.value.some((item) => item.uploadedUrl) && !isSubmitting.value)
```

- [ ] **Step 4: Run miniapp tests**

Run:

```bash
cd miniapp && npm test -- src/pages/supplement-import.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniapp/src/pages/recipe-diy/supplement-library.vue miniapp/src/pages/recipe-diy/supplement-import.vue miniapp/src/pages/supplement-import.regression.spec.ts
git commit -m "feat: add supplement import upload pages"
```

### Task 8: Miniapp Confirmation Page

**Files:**
- Create: `miniapp/src/pages/recipe-diy/supplement-import-confirm.vue`
- Modify: `miniapp/src/pages/supplement-import.regression.spec.ts`

- [ ] **Step 1: Extend regression test**

Add:

```ts
it('renders confirmation fields and blocks invalid confirmation', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/recipe-diy/supplement-import-confirm.vue'), 'utf-8')

  expect(source).toContain('原料名称')
  expect(source).toContain('产品品牌')
  expect(source).toContain('产品规格')
  expect(source).toContain('营养档案')
  expect(source).toContain('validationErrors')
  expect(source).toContain(':disabled="!canConfirm')
  expect(source).toContain('confirmDraft')
})
```

- [ ] **Step 2: Build confirmation page**

The page should:

- load `draftId`
- call `supplementImportApi.getDraft(draftId)`
- bind `draft.normalizedDraft.ingredient`
- list `riskFlags`
- list `validationErrors`
- show duplicate candidates and require selecting `CREATE_NEW` or `UPDATE_EXISTING`
- show nutrition items grouped by tabs from `nutritionProfile`
- allow deleting rejected/unwanted nutrition items before save
- call `supplementImportApi.updateDraft(draftId, normalizedDraft)` on save
- call `supplementImportApi.confirmDraft(draftId)` on confirm
- return to supplement library after confirm

Computed rule:

```ts
const canConfirm = computed(() => {
  return draft.value?.status === 'READY_TO_CONFIRM' && validationErrors.value.length === 0 && !confirming.value
})
```

Save before confirm:

```ts
async function saveDraftChanges() {
  const response = await supplementImportApi.updateDraft(draftId.value, normalizedDraft.value)
  draft.value = response.data
  normalizedDraft.value = response.data.normalizedDraft
}
```

Confirm:

```ts
async function confirmDraft() {
  confirming.value = true
  try {
    await saveDraftChanges()
    const response = await supplementImportApi.confirmDraft(draftId.value)
    uni.showToast({ title: '已入库', icon: 'success' })
    setTimeout(() => {
      uni.redirectTo({ url: `/pages/recipe-diy/supplement-library?recipeId=${recipeId.value}&ingredientId=${response.data.confirmedIngredientId}` })
    }, 500)
  } finally {
    confirming.value = false
  }
}
```

- [ ] **Step 3: Run miniapp tests**

Run:

```bash
cd miniapp && npm test -- src/pages/supplement-import.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/pages/recipe-diy/supplement-import-confirm.vue miniapp/src/pages/supplement-import.regression.spec.ts
git commit -m "feat: add supplement import confirmation page"
```

### Task 9: End-To-End Verification And Builds

**Files:**
- No source changes expected in this task.

- [ ] **Step 1: Run targeted backend tests**

```bash
cd backend && npm test -- --runInBand tests/application/agent/agent-config.service.spec.ts tests/application/supplement-import/supplement-import-normalizer.spec.ts tests/application/supplement-import/supplement-import.service.spec.ts tests/interfaces/controllers/agent-config.controller.spec.ts tests/interfaces/controllers/recipe-designer-supplement-import.controller.spec.ts tests/prisma/supplement-import-schema.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

```bash
cd backend && npm run build
```

Expected: PASS.

- [ ] **Step 3: Run admin web build**

```bash
cd admin-web && npm run build
```

Expected: PASS.

- [ ] **Step 4: Run miniapp tests**

```bash
cd miniapp && npm test -- src/utils/supplement-import.spec.ts src/pages/recipe-diy.regression.spec.ts src/pages/supplement-import.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run miniapp build**

```bash
cd miniapp && npm run build:mp-weixin
```

Expected: PASS.

- [ ] **Step 6: Manual API smoke**

With an admin token:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/v1/admin/agent-configs/supplement-import
```

Expected: `code: 0`, `apiKeyConfigured` boolean present, no API key plaintext.

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -X POST http://localhost:3000/api/v1/recipe-designer/supplement-import-drafts -d '{"imageUrls":["https://example.com/supplement-label.jpg"]}'
```

Expected when Agent disabled: clear error that the Agent is not enabled. Expected when enabled: draft returned with status `READY_TO_CONFIRM`, `NEEDS_REVIEW`, or `FAILED`.

- [ ] **Step 7: Commit verification fixes only if needed**

If verification reveals compile or test issues, fix the scoped files and commit:

```bash
git add backend admin-web miniapp
git commit -m "fix: stabilize supplement import verification"
```

## Self-Review

Spec coverage:

- Camera and album import: Task 7.
- Accurate extraction and standardization: Tasks 3 and 4.
- Blur/incomplete risk prompts: Tasks 3, 4, 7, and 8.
- Confirmation before one-click write: Tasks 4 and 8.
- Standard ingredient fields and nutrition profile: Tasks 3 and 4.
- AI Agent for semantic extraction and deterministic scripts for unit conversion: Tasks 2, 3, and 4.
- Web admin Agent config: Task 5.
- Admin-only access: Tasks 2, 4, 6, 7, and 8.
- Use recipe designer supplement library, not workbench: Tasks 6 and 7.
- Duplicate handling by name + brand + spec: Tasks 3, 4, and 8.

Completion scan:

- No unfinished marker, empty page, or unspecified field remains in the plan.

Type consistency:

- Backend uses `AgentConfig`, `SupplementImportDraft`, `Ingredient.type = SUPPLEMENT`, `Ingredient.productModel` as product spec, and existing `NutritionProfileV2`.
- Frontend APIs match backend paths under `/api/v1/admin/agent-configs/supplement-import` and `/api/v1/recipe-designer/supplement-import-drafts`.
