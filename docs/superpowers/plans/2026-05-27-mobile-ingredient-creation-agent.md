# Mobile Ingredient Creation Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end miniapp workflow for creating food standard-ingredient drafts with an AI-style task interface, reviewing generated nutrition-profile drafts, and confirming them into formal ingredient records.

**Architecture:** Add a dedicated ingredient-creation draft domain instead of writing directly to formal ingredient tables. The backend owns task state, messages, drafts, draft profiles, completeness reporting, and admin confirmation transactions. The miniapp exposes a staff workbench entry, a task chat page, and a draft review page.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, uni-app Vue 3, Vitest, existing NutritionGovernanceService/NutritionProfileV2 utilities, WeChat miniapp dev output in `miniapp/dist/dev/mp-weixin`.

---

## File Structure

- Modify `backend/prisma/schema.prisma`: add ingredient-creation enums and models.
- Create `backend/prisma/migrations/202605270003_add_ingredient_creation_agent/migration.sql`: create database enums, tables, indexes, and foreign keys.
- Create `backend/tests/prisma/ingredient-creation-schema.spec.ts`: schema regression test for model and enum presence.
- Create `backend/src/application/ingredient-creation/ingredient-creation.types.ts`: shared service DTO/result interfaces and status constants.
- Create `backend/src/application/ingredient-creation/ingredient-creation-completeness.ts`: summarize `NutritionProfileV2` as non-zero, zero, empty, missing field labels.
- Create `backend/src/application/ingredient-creation/ingredient-creation.service.ts`: task CRUD, messages, draft edits, draft-profile edits, rejection, and admin confirmation transaction.
- Create `backend/src/application/ingredient-creation/ingredient-creation-agent.service.ts`: first-version deterministic orchestration that creates a reviewable draft from existing source records and records agent-style messages.
- Create `backend/src/interfaces/dto/ingredient-creation.dto.ts`: request DTOs for create job, add message, answer question, edit draft, edit profile, rerun, confirm, and reject.
- Create `backend/src/interfaces/controllers/ingredient-creation.controller.ts`: admin API routes under `/api/v1/admin/ingredient-creation`.
- Modify `backend/src/app.module.ts`: register the new services and controller.
- Create `backend/tests/application/ingredient-creation/ingredient-creation-completeness.spec.ts`: completeness summary tests.
- Create `backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts`: lifecycle and confirmation transaction tests.
- Create `backend/tests/interfaces/controllers/ingredient-creation.controller.spec.ts`: controller routing/delegation and permission-sensitive method tests.
- Create `miniapp/src/api/ingredient-creation.ts`: miniapp API client and types.
- Create `miniapp/src/api/ingredient-creation.spec.ts`: request path and payload tests.
- Modify `miniapp/src/pages/staff-workbench/index.vue`: add `AI 新增食材` module and navigation.
- Modify `miniapp/src/pages.json`: register ingredient-creation list, detail, and draft review pages.
- Create `miniapp/src/pages/ingredient-creation/list.vue`: task list and create task sheet.
- Create `miniapp/src/pages/ingredient-creation/detail.vue`: task chat/progress page.
- Create `miniapp/src/pages/ingredient-creation/draft.vue`: draft review and admin confirm page.
- Create `miniapp/src/pages/ingredient-creation.regression.spec.ts`: source-level regression tests for entry, pages, API usage, status rendering, and admin-only confirmation guard.

---

### Task 1: Prisma Schema For Ingredient-Creation Drafts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605270003_add_ingredient_creation_agent/migration.sql`
- Test: `backend/tests/prisma/ingredient-creation-schema.spec.ts`

- [ ] **Step 1: Write the failing schema regression test**

Create `backend/tests/prisma/ingredient-creation-schema.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ingredient creation agent schema', () => {
  const schema = readFileSync(
    resolve(__dirname, '../../prisma/schema.prisma'),
    'utf-8',
  );

  it('declares task, message, draft, and draft profile models', () => {
    expect(schema).toContain('model IngredientCreationJob');
    expect(schema).toContain('model IngredientCreationMessage');
    expect(schema).toContain('model IngredientCreationDraft');
    expect(schema).toContain('model IngredientCreationDraftProfile');
  });

  it('declares status and role enums used by the draft workflow', () => {
    expect(schema).toContain('enum IngredientCreationJobStatus');
    expect(schema).toContain('WAITING_USER');
    expect(schema).toContain('READY_FOR_REVIEW');
    expect(schema).toContain('enum IngredientCreationMessageRole');
    expect(schema).toContain('enum IngredientCreationDraftProfileRole');
  });

  it('keeps drafts linked to the creating user and formal confirmation target', () => {
    expect(schema).toContain('createdBy                     String');
    expect(schema).toContain('confirmedIngredientId         String?');
    expect(schema).toContain('ingredient_creation_job');
    expect(schema).toContain('ingredient_creation_draft_profile');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/prisma/ingredient-creation-schema.spec.ts
```

Expected: FAIL because the schema does not yet contain the new models and enums.

- [ ] **Step 3: Add Prisma enums and models**

Append these enums near the existing nutrition governance enums in `backend/prisma/schema.prisma`:

```prisma
enum IngredientCreationJobStatus {
  DRAFTING
  SEARCHING_SOURCES
  WAITING_USER
  BUILDING_REPORT
  READY_FOR_REVIEW
  CONFIRMED
  FAILED
  CANCELED
}

enum IngredientCreationMessageRole {
  USER
  AGENT
  PROGRESS
  QUESTION
  SYSTEM
}

enum IngredientCreationDraftStatus {
  DRAFT
  READY_FOR_REVIEW
  CONFIRMED
  REJECTED
}

enum IngredientCreationDraftProfileRole {
  PRIMARY
  SECONDARY
}
```

Append these models after `IngredientNutritionCandidate`:

```prisma
model IngredientCreationJob {
  id              String                         @id @default(uuid()) @map("id")
  createdBy       String                         @map("created_by")
  status          IngredientCreationJobStatus    @default(DRAFTING) @map("status")
  requestText     String                         @map("request_text")
  currentStage    String?                        @map("current_stage") @db.VarChar(100)
  progress        Int                            @default(0) @map("progress")
  waitingQuestion String?                        @map("waiting_question")
  errorMessage    String?                        @map("error_message")
  agentProvider   String?                        @map("agent_provider") @db.VarChar(80)
  agentModel      String?                        @map("agent_model") @db.VarChar(120)
  createdAt       DateTime                       @default(now()) @map("created_at")
  updatedAt       DateTime                       @updatedAt @map("updated_at")
  completedAt     DateTime?                      @map("completed_at")
  messages        IngredientCreationMessage[]
  draft           IngredientCreationDraft?

  @@index([createdBy])
  @@index([status])
  @@index([createdAt])
  @@map("ingredient_creation_job")
}

model IngredientCreationMessage {
  id        String                        @id @default(uuid()) @map("id")
  jobId     String                        @map("job_id")
  role      IngredientCreationMessageRole @map("role")
  content   String                        @map("content")
  payload   Json?                         @map("payload")
  createdAt DateTime                      @default(now()) @map("created_at")
  job       IngredientCreationJob         @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId])
  @@index([role])
  @@index([createdAt])
  @@map("ingredient_creation_message")
}

model IngredientCreationDraft {
  id                    String                         @id @default(uuid()) @map("id")
  jobId                 String                         @unique @map("job_id")
  status                IngredientCreationDraftStatus  @default(DRAFT) @map("status")
  suggestedName         String                         @map("suggested_name") @db.VarChar(120)
  aliases               String[]                       @default([]) @map("aliases")
  type                  IngredientType                 @default(FOOD) @map("type")
  baseUnit              BaseUnit                       @default(G) @map("base_unit")
  unitDisplayLabel      String?                        @map("unit_display_label") @db.VarChar(50)
  procurementStrategy   IngredientProcurementStrategy  @default(DAILY_PURCHASE) @map("procurement_strategy")
  diyEnabled            Boolean                        @default(true) @map("diy_enabled")
  procurementEnabled    Boolean                        @default(false) @map("procurement_enabled")
  notes                 String?                        @map("notes")
  agentSummary          String?                        @map("agent_summary")
  reviewReport          Json?                          @map("review_report")
  confirmedIngredientId String?                        @map("confirmed_ingredient_id")
  confirmedBy           String?                        @map("confirmed_by")
  confirmedAt           DateTime?                      @map("confirmed_at")
  createdAt             DateTime                       @default(now()) @map("created_at")
  updatedAt             DateTime                       @updatedAt @map("updated_at")
  job                   IngredientCreationJob          @relation(fields: [jobId], references: [id], onDelete: Cascade)
  profiles              IngredientCreationDraftProfile[]

  @@index([status])
  @@index([suggestedName])
  @@index([confirmedIngredientId])
  @@map("ingredient_creation_draft")
}

model IngredientCreationDraftProfile {
  id                      String                             @id @default(uuid()) @map("id")
  draftId                 String                             @map("draft_id")
  role                    IngredientCreationDraftProfileRole @map("role")
  sourceRecordId          String?                            @map("source_record_id")
  sourceType              NutritionGovernanceSourceType?     @map("source_type")
  sourceKey               String?                            @map("source_key") @db.VarChar(200)
  sourceFoodName          String                             @map("source_food_name") @db.VarChar(300)
  sourceFoodNameEn        String?                            @map("source_food_name_en") @db.VarChar(300)
  suggestedDisplayNameZh  String?                            @map("suggested_display_name_zh") @db.VarChar(200)
  preparationState        String?                            @map("preparation_state") @db.VarChar(50)
  preparationStateLabel   String?                            @map("preparation_state_label") @db.VarChar(100)
  ediblePortionLabel      String?                            @map("edible_portion_label") @db.VarChar(100)
  processingLabel         String?                            @map("processing_label") @db.VarChar(100)
  nutritionData           Json                               @map("nutrition_data")
  completenessSummary     Json                               @map("completeness_summary")
  fieldSourceSummary      Json?                              @map("field_source_summary")
  supplementRiskSummary   Json?                              @map("supplement_risk_summary")
  agentRationale          String?                            @map("agent_rationale")
  sortOrder               Int                                @default(0) @map("sort_order")
  createdAt               DateTime                           @default(now()) @map("created_at")
  updatedAt               DateTime                           @updatedAt @map("updated_at")
  draft                   IngredientCreationDraft            @relation(fields: [draftId], references: [id], onDelete: Cascade)
  sourceRecord            NutritionSourceRecord?             @relation(fields: [sourceRecordId], references: [id], onDelete: SetNull)

  @@index([draftId])
  @@index([sourceRecordId])
  @@index([sourceType])
  @@index([role])
  @@map("ingredient_creation_draft_profile")
}
```

Add these relation fields to `NutritionSourceRecord`:

```prisma
  ingredientCreationDraftProfiles IngredientCreationDraftProfile[]
```

- [ ] **Step 4: Add SQL migration**

Create `backend/prisma/migrations/202605270003_add_ingredient_creation_agent/migration.sql`:

```sql
CREATE TYPE "IngredientCreationJobStatus" AS ENUM (
  'DRAFTING',
  'SEARCHING_SOURCES',
  'WAITING_USER',
  'BUILDING_REPORT',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'FAILED',
  'CANCELED'
);

CREATE TYPE "IngredientCreationMessageRole" AS ENUM (
  'USER',
  'AGENT',
  'PROGRESS',
  'QUESTION',
  'SYSTEM'
);

CREATE TYPE "IngredientCreationDraftStatus" AS ENUM (
  'DRAFT',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'REJECTED'
);

CREATE TYPE "IngredientCreationDraftProfileRole" AS ENUM (
  'PRIMARY',
  'SECONDARY'
);

CREATE TABLE "ingredient_creation_job" (
  "id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "status" "IngredientCreationJobStatus" NOT NULL DEFAULT 'DRAFTING',
  "request_text" TEXT NOT NULL,
  "current_stage" VARCHAR(100),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "waiting_question" TEXT,
  "error_message" TEXT,
  "agent_provider" VARCHAR(80),
  "agent_model" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "ingredient_creation_job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_creation_message" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "role" "IngredientCreationMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ingredient_creation_message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_creation_draft" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "status" "IngredientCreationDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "suggested_name" VARCHAR(120) NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "type" "IngredientType" NOT NULL DEFAULT 'FOOD',
  "base_unit" "BaseUnit" NOT NULL DEFAULT 'G',
  "unit_display_label" VARCHAR(50),
  "procurement_strategy" "IngredientProcurementStrategy" NOT NULL DEFAULT 'DAILY_PURCHASE',
  "diy_enabled" BOOLEAN NOT NULL DEFAULT true,
  "procurement_enabled" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "agent_summary" TEXT,
  "review_report" JSONB,
  "confirmed_ingredient_id" TEXT,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingredient_creation_draft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_creation_draft_profile" (
  "id" TEXT NOT NULL,
  "draft_id" TEXT NOT NULL,
  "role" "IngredientCreationDraftProfileRole" NOT NULL,
  "source_record_id" TEXT,
  "source_type" "NutritionGovernanceSourceType",
  "source_key" VARCHAR(200),
  "source_food_name" VARCHAR(300) NOT NULL,
  "source_food_name_en" VARCHAR(300),
  "suggested_display_name_zh" VARCHAR(200),
  "preparation_state" VARCHAR(50),
  "preparation_state_label" VARCHAR(100),
  "edible_portion_label" VARCHAR(100),
  "processing_label" VARCHAR(100),
  "nutrition_data" JSONB NOT NULL,
  "completeness_summary" JSONB NOT NULL,
  "field_source_summary" JSONB,
  "supplement_risk_summary" JSONB,
  "agent_rationale" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingredient_creation_draft_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredient_creation_draft_job_id_key" ON "ingredient_creation_draft"("job_id");
CREATE INDEX "ingredient_creation_job_created_by_idx" ON "ingredient_creation_job"("created_by");
CREATE INDEX "ingredient_creation_job_status_idx" ON "ingredient_creation_job"("status");
CREATE INDEX "ingredient_creation_job_created_at_idx" ON "ingredient_creation_job"("created_at");
CREATE INDEX "ingredient_creation_message_job_id_idx" ON "ingredient_creation_message"("job_id");
CREATE INDEX "ingredient_creation_message_role_idx" ON "ingredient_creation_message"("role");
CREATE INDEX "ingredient_creation_message_created_at_idx" ON "ingredient_creation_message"("created_at");
CREATE INDEX "ingredient_creation_draft_status_idx" ON "ingredient_creation_draft"("status");
CREATE INDEX "ingredient_creation_draft_suggested_name_idx" ON "ingredient_creation_draft"("suggested_name");
CREATE INDEX "ingredient_creation_draft_confirmed_ingredient_id_idx" ON "ingredient_creation_draft"("confirmed_ingredient_id");
CREATE INDEX "ingredient_creation_draft_profile_draft_id_idx" ON "ingredient_creation_draft_profile"("draft_id");
CREATE INDEX "ingredient_creation_draft_profile_source_record_id_idx" ON "ingredient_creation_draft_profile"("source_record_id");
CREATE INDEX "ingredient_creation_draft_profile_source_type_idx" ON "ingredient_creation_draft_profile"("source_type");
CREATE INDEX "ingredient_creation_draft_profile_role_idx" ON "ingredient_creation_draft_profile"("role");

ALTER TABLE "ingredient_creation_message"
  ADD CONSTRAINT "ingredient_creation_message_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "ingredient_creation_job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_creation_draft"
  ADD CONSTRAINT "ingredient_creation_draft_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "ingredient_creation_job"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_creation_draft_profile"
  ADD CONSTRAINT "ingredient_creation_draft_profile_draft_id_fkey"
  FOREIGN KEY ("draft_id") REFERENCES "ingredient_creation_draft"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_creation_draft_profile"
  ADD CONSTRAINT "ingredient_creation_draft_profile_source_record_id_fkey"
  FOREIGN KEY ("source_record_id") REFERENCES "nutrition_source_record"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Generate Prisma client and rerun schema test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} npx prisma generate
npm test -- --runInBand tests/prisma/ingredient-creation-schema.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add backend/prisma/schema.prisma backend/prisma/migrations/202605270003_add_ingredient_creation_agent/migration.sql backend/tests/prisma/ingredient-creation-schema.spec.ts
git commit -m "feat: add ingredient creation draft schema"
```

---

### Task 2: Nutrition Completeness Utility

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-creation-completeness.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-completeness.spec.ts`

- [ ] **Step 1: Write the failing completeness tests**

Create `backend/tests/application/ingredient-creation/ingredient-creation-completeness.spec.ts`:

```ts
import {
  summarizeIngredientCreationProfileCompleteness,
  INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS,
} from '../../../src/application/ingredient-creation/ingredient-creation-completeness';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/types';

describe('summarizeIngredientCreationProfileCompleteness', () => {
  it('counts non-zero, zero, and empty values separately', () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = 143;
    profile.macros.crudeProtein = 20;
    profile.macros.crudeFat = 0;
    profile.minerals.calcium = null;

    const summary = summarizeIngredientCreationProfileCompleteness(profile);

    expect(summary.total).toBe(INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS.length);
    expect(summary.nonZero).toBe(2);
    expect(summary.zero).toBe(1);
    expect(summary.empty).toBe(summary.total - 3);
    expect(summary.missingFields).toEqual(
      expect.arrayContaining([
        { fieldPath: 'minerals.calcium', label: '钙' },
      ]),
    );
  });

  it('summarizes source coverage when fieldSources are present', () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = 143;
    profile.meta.fieldSources = {
      'macros.energyKcal': {
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
    } as any;

    const summary = summarizeIngredientCreationProfileCompleteness(profile);

    expect(summary.sourceCoverage.filledWithSource).toBe(1);
    expect(summary.sourceCoverage.filledWithoutSource).toBe(0);
    expect(summary.fieldSources).toEqual([
      {
        fieldPath: 'macros.energyKcal',
        label: '能量',
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation-completeness.spec.ts
```

Expected: FAIL because the completeness module does not exist.

- [ ] **Step 3: Implement the completeness utility**

Create `backend/src/application/ingredient-creation/ingredient-creation-completeness.ts`:

```ts
import type { NutritionProfileV2 } from '../../domain/ingredient/types';

export interface IngredientCreationProfileFieldDefinition {
  fieldPath: string;
  label: string;
}

export interface IngredientCreationProfileCompletenessSummary {
  total: number;
  filled: number;
  nonZero: number;
  zero: number;
  empty: number;
  missingFields: IngredientCreationProfileFieldDefinition[];
  sourceCoverage: {
    filledWithSource: number;
    filledWithoutSource: number;
  };
  fieldSources: Array<{
    fieldPath: string;
    label: string;
    sourceType?: string;
    sourceKey?: string;
    confidenceLevel?: string;
    compatibility?: string;
  }>;
}

export const INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS: readonly IngredientCreationProfileFieldDefinition[] =
  [
    { fieldPath: 'macros.energyKcal', label: '能量' },
    { fieldPath: 'macros.moisture', label: '水分' },
    { fieldPath: 'macros.crudeProtein', label: '粗蛋白' },
    { fieldPath: 'macros.crudeFat', label: '粗脂肪' },
    { fieldPath: 'macros.crudeFiber', label: '粗纤维' },
    { fieldPath: 'macros.ash', label: '灰分' },
    { fieldPath: 'macros.carbohydrate', label: '碳水化合物' },
    { fieldPath: 'minerals.calcium', label: '钙' },
    { fieldPath: 'minerals.phosphorus', label: '磷' },
    { fieldPath: 'minerals.potassium', label: '钾' },
    { fieldPath: 'minerals.sodium', label: '钠' },
    { fieldPath: 'minerals.chloride', label: '氯' },
    { fieldPath: 'minerals.magnesium', label: '镁' },
    { fieldPath: 'minerals.iron', label: '铁' },
    { fieldPath: 'minerals.copper', label: '铜' },
    { fieldPath: 'minerals.manganese', label: '锰' },
    { fieldPath: 'minerals.zinc', label: '锌' },
    { fieldPath: 'minerals.iodine', label: '碘' },
    { fieldPath: 'minerals.selenium', label: '硒' },
    { fieldPath: 'vitamins.vitaminA', label: '维生素 A' },
    { fieldPath: 'vitamins.vitaminD', label: '维生素 D' },
    { fieldPath: 'vitamins.vitaminE', label: '维生素 E' },
    { fieldPath: 'vitamins.vitaminK', label: '维生素 K' },
    { fieldPath: 'vitamins.thiamine', label: '维生素 B1' },
    { fieldPath: 'vitamins.riboflavin', label: '维生素 B2' },
    { fieldPath: 'vitamins.niacin', label: '维生素 B3' },
    { fieldPath: 'vitamins.pantothenicAcid', label: '维生素 B5' },
    { fieldPath: 'vitamins.pyridoxine', label: '维生素 B6' },
    { fieldPath: 'vitamins.folicAcid', label: '维生素 B9' },
    { fieldPath: 'vitamins.cobalamin', label: '维生素 B12' },
    { fieldPath: 'vitamins.choline', label: '胆碱' },
    { fieldPath: 'vitamins.vitaminC', label: '维生素 C' },
    { fieldPath: 'fattyAcids.saturatedFat', label: '饱和脂肪酸' },
    { fieldPath: 'fattyAcids.monounsaturatedFat', label: '单不饱和脂肪酸' },
    { fieldPath: 'fattyAcids.polyunsaturatedFat', label: '多不饱和脂肪酸' },
    { fieldPath: 'fattyAcids.linoleicAcid', label: '亚油酸 LA' },
    { fieldPath: 'fattyAcids.alphaLinolenicAcid', label: 'α-亚麻酸 ALA' },
    { fieldPath: 'fattyAcids.arachidonicAcid', label: '花生四烯酸 AA' },
    { fieldPath: 'fattyAcids.epa', label: 'EPA' },
    { fieldPath: 'fattyAcids.dpa', label: 'DPA' },
    { fieldPath: 'fattyAcids.dha', label: 'DHA' },
    { fieldPath: 'aminoAcids.arginine', label: '精氨酸' },
    { fieldPath: 'aminoAcids.histidine', label: '组氨酸' },
    { fieldPath: 'aminoAcids.isoleucine', label: '异亮氨酸' },
    { fieldPath: 'aminoAcids.leucine', label: '亮氨酸' },
    { fieldPath: 'aminoAcids.lysine', label: '赖氨酸' },
    { fieldPath: 'aminoAcids.methionine', label: '蛋氨酸' },
    { fieldPath: 'aminoAcids.methionineCystine', label: '蛋氨酸+胱氨酸' },
    { fieldPath: 'aminoAcids.phenylalanine', label: '苯丙氨酸' },
    { fieldPath: 'aminoAcids.phenylalanineTyrosine', label: '苯丙氨酸+酪氨酸' },
    { fieldPath: 'aminoAcids.threonine', label: '苏氨酸' },
    { fieldPath: 'aminoAcids.tryptophan', label: '色氨酸' },
    { fieldPath: 'aminoAcids.valine', label: '缬氨酸' },
  ];

function readPath(source: Record<string, any>, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function isFilled(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function summarizeIngredientCreationProfileCompleteness(
  profile: NutritionProfileV2,
): IngredientCreationProfileCompletenessSummary {
  let nonZero = 0;
  let zero = 0;
  let filledWithSource = 0;
  let filledWithoutSource = 0;
  const missingFields: IngredientCreationProfileFieldDefinition[] = [];
  const fieldSources: IngredientCreationProfileCompletenessSummary['fieldSources'] =
    [];
  const sourceMap = profile.meta?.fieldSources ?? {};

  for (const definition of INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS) {
    const value = readPath(profile as unknown as Record<string, any>, definition.fieldPath);
    if (!isFilled(value)) {
      missingFields.push(definition);
      continue;
    }
    if (value === 0) zero += 1;
    else nonZero += 1;

    const source = (sourceMap as Record<string, any>)[definition.fieldPath];
    if (source) {
      filledWithSource += 1;
      fieldSources.push({
        fieldPath: definition.fieldPath,
        label: definition.label,
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
        confidenceLevel: source.confidenceLevel,
        compatibility: source.compatibility,
      });
    } else {
      filledWithoutSource += 1;
    }
  }

  const total = INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS.length;
  return {
    total,
    filled: nonZero + zero,
    nonZero,
    zero,
    empty: total - nonZero - zero,
    missingFields,
    sourceCoverage: {
      filledWithSource,
      filledWithoutSource,
    },
    fieldSources,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation-completeness.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add backend/src/application/ingredient-creation/ingredient-creation-completeness.ts backend/tests/application/ingredient-creation/ingredient-creation-completeness.spec.ts
git commit -m "feat: summarize ingredient creation nutrition completeness"
```

---

### Task 3: Backend Service Lifecycle

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-creation.types.ts`
- Create: `backend/src/application/ingredient-creation/ingredient-creation.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts`

- [ ] **Step 1: Write the failing lifecycle tests**

Create `backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IngredientCreationService } from '../../../src/application/ingredient-creation/ingredient-creation.service';

function createPrismaMock() {
  return {
    ingredientCreationJob: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ingredientCreationMessage: {
      create: jest.fn(),
    },
    ingredientCreationDraft: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ingredientCreationDraftProfile: {
      update: jest.fn(),
    },
  };
}

describe('IngredientCreationService', () => {
  it('creates a draft job without creating a formal ingredient', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.create.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉',
      status: 'DRAFTING',
      messages: [],
      draft: null,
    });
    const service = new IngredientCreationService(prisma as any);

    const result = await service.createJob({
      requestText: '新增鸭胸肉',
      userId: 'staff-1',
    });

    expect(prisma.ingredientCreationJob.create).toHaveBeenCalledWith({
      data: {
        createdBy: 'staff-1',
        requestText: '新增鸭胸肉',
        status: 'DRAFTING',
        currentStage: '已创建任务',
        progress: 0,
        messages: {
          create: [
            {
              role: 'USER',
              content: '新增鸭胸肉',
            },
            {
              role: 'SYSTEM',
              content: '已创建 AI 新增食材任务，等待 Agent 开始研究。',
            },
          ],
        },
      },
      include: expect.any(Object),
    });
    expect(result.id).toBe('job-1');
  });

  it('rejects empty job requests', async () => {
    const service = new IngredientCreationService(createPrismaMock() as any);

    await expect(
      service.createJob({ requestText: '   ', userId: 'staff-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('limits staff users to their own job detail', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      createdBy: 'staff-2',
      messages: [],
      draft: null,
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.getJobDetail('job-1', { userId: 'staff-1', role: 'STAFF' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows admins to edit draft metadata', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      status: 'READY_FOR_REVIEW',
      job: { id: 'job-1', createdBy: 'staff-1' },
    });
    prisma.ingredientCreationDraft.update.mockResolvedValue({
      id: 'draft-1',
      suggestedName: '鸭胸肉',
      notes: '优先水煮熟档案',
    });
    const service = new IngredientCreationService(prisma as any);

    const result = await service.updateDraft(
      'draft-1',
      { suggestedName: '鸭胸肉', notes: '优先水煮熟档案' },
      { userId: 'admin-1', role: 'ADMIN' },
    );

    expect(prisma.ingredientCreationDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: {
        suggestedName: '鸭胸肉',
        notes: '优先水煮熟档案',
      },
      include: expect.any(Object),
    });
    expect(result.suggestedName).toBe('鸭胸肉');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation.service.spec.ts
```

Expected: FAIL because `IngredientCreationService` does not exist.

- [ ] **Step 3: Add shared service types**

Create `backend/src/application/ingredient-creation/ingredient-creation.types.ts`:

```ts
export interface IngredientCreationUserContext {
  userId: string;
  role: string;
}

export interface CreateIngredientCreationJobInput {
  requestText: string;
  userId: string;
}

export interface AddIngredientCreationMessageInput {
  content: string;
}

export interface UpdateIngredientCreationDraftInput {
  suggestedName?: string;
  unitDisplayLabel?: string | null;
  procurementStrategy?: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  notes?: string | null;
}

export interface UpdateIngredientCreationDraftProfileInput {
  role?: 'PRIMARY' | 'SECONDARY';
  suggestedDisplayNameZh?: string | null;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  agentRationale?: string | null;
  sortOrder?: number;
}
```

- [ ] **Step 4: Implement lifecycle service**

Create `backend/src/application/ingredient-creation/ingredient-creation.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  AddIngredientCreationMessageInput,
  CreateIngredientCreationJobInput,
  IngredientCreationUserContext,
  UpdateIngredientCreationDraftInput,
  UpdateIngredientCreationDraftProfileInput,
} from './ingredient-creation.types';

const JOB_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  draft: {
    include: {
      profiles: { orderBy: [{ role: 'asc' as const }, { sortOrder: 'asc' as const }] },
    },
  },
};

function trimRequired(value: string, message: string): string {
  const next = value.trim();
  if (!next) throw new BadRequestException(message);
  return next;
}

function assertAdmin(user: IngredientCreationUserContext) {
  if (user.role !== 'ADMIN') {
    throw new ForbiddenException('需要管理员权限');
  }
}

function assertCanReadJob(job: { createdBy: string }, user: IngredientCreationUserContext) {
  if (user.role === 'ADMIN') return;
  if (job.createdBy !== user.userId) {
    throw new ForbiddenException('只能查看自己创建的任务');
  }
}

@Injectable()
export class IngredientCreationService {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(input: CreateIngredientCreationJobInput) {
    const requestText = trimRequired(input.requestText, '新增食材需求不能为空');
    return this.prisma.ingredientCreationJob.create({
      data: {
        createdBy: input.userId,
        requestText,
        status: 'DRAFTING',
        currentStage: '已创建任务',
        progress: 0,
        messages: {
          create: [
            { role: 'USER', content: requestText },
            {
              role: 'SYSTEM',
              content: '已创建 AI 新增食材任务，等待 Agent 开始研究。',
            },
          ],
        },
      },
      include: JOB_INCLUDE,
    });
  }

  async listJobs(user: IngredientCreationUserContext) {
    return this.prisma.ingredientCreationJob.findMany({
      where: user.role === 'ADMIN' ? {} : { createdBy: user.userId },
      include: {
        draft: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJobDetail(jobId: string, user: IngredientCreationUserContext) {
    const job = await this.prisma.ingredientCreationJob.findUnique({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });
    if (!job) throw new NotFoundException('AI 新增食材任务不存在');
    assertCanReadJob(job, user);
    return job;
  }

  async addUserMessage(
    jobId: string,
    input: AddIngredientCreationMessageInput,
    user: IngredientCreationUserContext,
  ) {
    const job = await this.getJobDetail(jobId, user);
    const content = trimRequired(input.content, '补充内容不能为空');
    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'USER',
        content,
      },
    });
    return this.getJobDetail(jobId, user);
  }

  async answerQuestion(
    jobId: string,
    input: AddIngredientCreationMessageInput,
    user: IngredientCreationUserContext,
  ) {
    const job = await this.getJobDetail(jobId, user);
    if (job.status !== 'WAITING_USER') {
      throw new BadRequestException('当前任务不在等待用户回答状态');
    }
    const content = trimRequired(input.content, '回答内容不能为空');
    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'USER',
        content,
        payload: { answerTo: job.waitingQuestion } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'SEARCHING_SOURCES',
        waitingQuestion: null,
        currentStage: '已收到回答，等待 Agent 继续研究',
      },
    });
    return this.getJobDetail(jobId, user);
  }

  async updateDraft(
    draftId: string,
    input: UpdateIngredientCreationDraftInput,
    user: IngredientCreationUserContext,
  ) {
    assertAdmin(user);
    const draft = await this.prisma.ingredientCreationDraft.findUnique({
      where: { id: draftId },
      include: { job: true },
    });
    if (!draft) throw new NotFoundException('新增食材草稿不存在');
    if (draft.status === 'CONFIRMED') {
      throw new BadRequestException('已确认草稿不能继续编辑');
    }
    const data: Prisma.IngredientCreationDraftUpdateInput = {};
    if (input.suggestedName !== undefined) {
      data.suggestedName = trimRequired(input.suggestedName, '标准原料名称不能为空');
    }
    if (input.unitDisplayLabel !== undefined) data.unitDisplayLabel = input.unitDisplayLabel;
    if (input.procurementStrategy !== undefined) data.procurementStrategy = input.procurementStrategy;
    if (input.diyEnabled !== undefined) data.diyEnabled = input.diyEnabled;
    if (input.procurementEnabled !== undefined) data.procurementEnabled = input.procurementEnabled;
    if (input.notes !== undefined) data.notes = input.notes;
    return this.prisma.ingredientCreationDraft.update({
      where: { id: draftId },
      data,
      include: {
        profiles: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
  }

  async updateDraftProfile(
    profileId: string,
    input: UpdateIngredientCreationDraftProfileInput,
    user: IngredientCreationUserContext,
  ) {
    assertAdmin(user);
    return this.prisma.ingredientCreationDraftProfile.update({
      where: { id: profileId },
      data: {
        role: input.role,
        suggestedDisplayNameZh: input.suggestedDisplayNameZh,
        preparationState: input.preparationState,
        preparationStateLabel: input.preparationStateLabel,
        ediblePortionLabel: input.ediblePortionLabel,
        processingLabel: input.processingLabel,
        agentRationale: input.agentRationale,
        sortOrder: input.sortOrder,
      },
    });
  }
}
```

- [ ] **Step 5: Run lifecycle tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add backend/src/application/ingredient-creation/ingredient-creation.types.ts backend/src/application/ingredient-creation/ingredient-creation.service.ts backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts
git commit -m "feat: add ingredient creation task lifecycle"
```

---

### Task 4: Draft Agent Orchestration MVP

**Files:**
- Create: `backend/src/application/ingredient-creation/ingredient-creation-agent.service.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-agent.service.spec.ts`

- [ ] **Step 1: Write the failing agent orchestration tests**

Create `backend/tests/application/ingredient-creation/ingredient-creation-agent.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { IngredientCreationAgentService } from '../../../src/application/ingredient-creation/ingredient-creation-agent.service';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/types';

function createPrismaMock() {
  return {
    ingredientCreationJob: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ingredientCreationMessage: {
      create: jest.fn(),
    },
    ingredientCreationDraft: {
      create: jest.fn(),
    },
    nutritionSourceRecord: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback) => callback(createPrismaMock())),
  };
}

describe('IngredientCreationAgentService', () => {
  it('builds a ready-for-review draft from the best active source record', async () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = 132;
    profile.macros.crudeProtein = 19.8;
    profile.meta.fieldSources = {
      'macros.energyKcal': { sourceType: 'USDA', sourceKey: 'USDA:123' },
      'macros.crudeProtein': { sourceType: 'USDA', sourceKey: 'USDA:123' },
    } as any;

    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉，最好有生和水煮档案',
      status: 'DRAFTING',
      createdBy: 'staff-1',
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([
      {
        id: 'source-1',
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        sourceTitle: 'USDA FoodData Central',
        foodName: 'Duck, breast, meat only, raw',
        foodNameEn: 'Duck, breast, meat only, raw',
        normalizedNutrition: profile,
      },
    ]);
    prisma.ingredientCreationDraft.create.mockResolvedValue({ id: 'draft-1' });
    const service = new IngredientCreationAgentService(prisma as any);

    const result = await service.runJob('job-1');

    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'READY_FOR_REVIEW',
        currentStage: '草稿已生成，等待审核',
        progress: 100,
        completedAt: expect.any(Date),
      }),
    });
    expect(prisma.ingredientCreationDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: 'job-1',
        status: 'READY_FOR_REVIEW',
        suggestedName: '鸭胸肉',
        profiles: {
          create: [
            expect.objectContaining({
              role: 'PRIMARY',
              sourceRecordId: 'source-1',
              sourceFoodName: 'Duck, breast, meat only, raw',
              suggestedDisplayNameZh: '鸭胸肉（生）',
            }),
          ],
        },
      }),
      include: expect.any(Object),
    });
    expect(result.id).toBe('draft-1');
  });

  it('asks a key semantic question when no source candidate is found', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestText: '新增很少见的本地食材',
      status: 'DRAFTING',
      createdBy: 'staff-1',
    });
    prisma.nutritionSourceRecord.findMany.mockResolvedValue([]);
    const service = new IngredientCreationAgentService(prisma as any);

    await expect(service.runJob('job-1')).rejects.toThrow(BadRequestException);
    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        status: 'WAITING_USER',
        waitingQuestion: expect.stringContaining('没有找到'),
      }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation-agent.service.spec.ts
```

Expected: FAIL because the agent service does not exist.

- [ ] **Step 3: Implement deterministic first-version orchestration**

Create `backend/src/application/ingredient-creation/ingredient-creation-agent.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import { summarizeIngredientCreationProfileCompleteness } from './ingredient-creation-completeness';

function resolveSuggestedName(requestText: string): string {
  const cleaned = requestText
    .replace(/^新增/u, '')
    .replace(/，.*$/u, '')
    .replace(/,.*$/u, '')
    .trim();
  return cleaned || requestText.trim();
}

function buildSearchWords(requestText: string): string[] {
  return requestText
    .replace(/[，,。；;、]/gu, ' ')
    .split(/\s+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

function scoreSourceRecord(foodName: string, words: string[]): number {
  const normalized = foodName.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (normalized.includes(word.toLowerCase())) score += 1;
  }
  if (/raw|生/u.test(normalized)) score += 0.5;
  if (/boiled|steamed|水煮|蒸/u.test(normalized)) score += 0.25;
  return score;
}

function inferPreparationState(foodName: string) {
  const lower = foodName.toLowerCase();
  if (/boiled|steamed|cooked|水煮|蒸|熟/u.test(lower)) {
    return {
      preparationState: 'COOKED',
      preparationStateLabel: '熟',
      processingLabel: lower.includes('boiled') ? '水煮' : '轻烹饪',
    };
  }
  return {
    preparationState: 'RAW',
    preparationStateLabel: '生',
    processingLabel: '未加工',
  };
}

function suggestDisplayNameZh(suggestedName: string, foodName: string): string {
  const state = inferPreparationState(foodName);
  return state.preparationState === 'COOKED'
    ? `${suggestedName}（熟）`
    : `${suggestedName}（生）`;
}

@Injectable()
export class IngredientCreationAgentService {
  constructor(private readonly prisma: PrismaService) {}

  async runJob(jobId: string) {
    const job = await this.prisma.ingredientCreationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) throw new NotFoundException('AI 新增食材任务不存在');

    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'SEARCHING_SOURCES',
        currentStage: '正在查找可信营养来源',
        progress: 25,
      },
    });
    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'PROGRESS',
        content: '正在从本地营养来源库召回候选档案。',
      },
    });

    const suggestedName = resolveSuggestedName(job.requestText);
    const searchWords = buildSearchWords(job.requestText);
    const sourceRecords = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        normalizedNutrition: { not: Prisma.JsonNull },
        OR: [
          { foodName: { contains: suggestedName, mode: 'insensitive' } },
          { foodNameEn: { contains: suggestedName, mode: 'insensitive' } },
          ...searchWords.map((word) => ({
            foodName: { contains: word, mode: 'insensitive' as const },
          })),
        ],
      },
      orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }],
      take: 12,
    });

    const ranked = sourceRecords
      .map((record) => ({
        record,
        score: scoreSourceRecord(record.foodName, [suggestedName, ...searchWords]),
      }))
      .sort((a, b) => b.score - a.score)
      .filter((entry) => entry.score > 0);

    if (ranked.length === 0) {
      const waitingQuestion =
        `没有找到「${suggestedName}」的可信营养来源。请补充英文名、常见别名、采购形态或可接受的近似来源。`;
      await this.prisma.ingredientCreationJob.update({
        where: { id: job.id },
        data: {
          status: 'WAITING_USER',
          waitingQuestion,
          currentStage: '等待补充食材语义',
          progress: 35,
        },
      });
      await this.prisma.ingredientCreationMessage.create({
        data: {
          jobId: job.id,
          role: 'QUESTION',
          content: waitingQuestion,
        },
      });
      throw new BadRequestException(waitingQuestion);
    }

    const selected = ranked.slice(0, 2);
    const profiles = selected.map(({ record }, index) => {
      const state = inferPreparationState(record.foodName);
      const nutritionData = record.normalizedNutrition as unknown as NutritionProfileV2;
      return {
        role: index === 0 ? 'PRIMARY' : 'SECONDARY',
        sourceRecordId: record.id,
        sourceType: record.sourceType,
        sourceKey: record.sourceKey,
        sourceFoodName: record.foodName,
        sourceFoodNameEn: record.foodNameEn,
        suggestedDisplayNameZh: suggestDisplayNameZh(suggestedName, record.foodName),
        preparationState: state.preparationState,
        preparationStateLabel: state.preparationStateLabel,
        ediblePortionLabel: '可食部',
        processingLabel: state.processingLabel,
        nutritionData: nutritionData as unknown as Prisma.InputJsonValue,
        completenessSummary: summarizeIngredientCreationProfileCompleteness(
          nutritionData,
        ) as unknown as Prisma.InputJsonValue,
        fieldSourceSummary: {
          sourceType: record.sourceType,
          sourceKey: record.sourceKey,
        } as Prisma.InputJsonValue,
        supplementRiskSummary: {
          level: 'LOW',
          noteZh: '第一版按本地可信来源生成草稿；正式确认前仍需人工审核语义和字段来源。',
        } as Prisma.InputJsonValue,
        agentRationale: '按来源名称与用户需求的语义匹配排序生成。',
        sortOrder: index,
      };
    });

    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'BUILDING_REPORT',
        currentStage: '正在生成草稿和审核报告',
        progress: 75,
      },
    });

    const draft = await this.prisma.ingredientCreationDraft.create({
      data: {
        jobId: job.id,
        status: 'READY_FOR_REVIEW',
        suggestedName,
        aliases: searchWords.filter((word) => word !== suggestedName),
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        procurementStrategy: 'DAILY_PURCHASE',
        diyEnabled: true,
        procurementEnabled: false,
        agentSummary: '已根据本地可信营养来源生成食材标准原料草稿。',
        reviewReport: {
          conclusionZh: '建议人工审核后创建正式原料。',
          candidateCount: ranked.length,
          selectedProfileCount: profiles.length,
        } as Prisma.InputJsonValue,
        profiles: { create: profiles },
      },
      include: {
        profiles: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] },
      },
    });

    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'AGENT',
        content: `已生成「${suggestedName}」草稿，包含 ${profiles.length} 个营养档案建议。`,
      },
    });
    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'READY_FOR_REVIEW',
        currentStage: '草稿已生成，等待审核',
        progress: 100,
        completedAt: new Date(),
      },
    });
    return draft;
  }
}
```

- [ ] **Step 4: Add service entrypoint method**

Modify `backend/src/application/ingredient-creation/ingredient-creation.service.ts` constructor and add a rerun method:

```ts
import { IngredientCreationAgentService } from './ingredient-creation-agent.service';

constructor(
  private readonly prisma: PrismaService,
  private readonly agentService?: IngredientCreationAgentService,
) {}

async rerunDraft(jobId: string, user: IngredientCreationUserContext) {
  const job = await this.getJobDetail(jobId, user);
  if (job.status === 'CONFIRMED') {
    throw new BadRequestException('已确认任务不能重新运行');
  }
  if (!this.agentService) {
    throw new BadRequestException('AI 新增食材 Agent 服务未注册');
  }
  return this.agentService.runJob(jobId);
}
```

- [ ] **Step 5: Run agent tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation-agent.service.spec.ts tests/application/ingredient-creation/ingredient-creation.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add backend/src/application/ingredient-creation/ingredient-creation-agent.service.ts backend/src/application/ingredient-creation/ingredient-creation.service.ts backend/tests/application/ingredient-creation/ingredient-creation-agent.service.spec.ts backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts
git commit -m "feat: generate ingredient creation drafts"
```

---

### Task 5: Formal Confirmation Transaction

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts`

- [ ] **Step 1: Add failing confirmation tests**

Append to `backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts`:

```ts
it('confirms a ready draft into formal ingredient and nutrition mappings', async () => {
  const profile = { macros: { energyKcal: 120 }, meta: { rawBasisType: 'PER_100_G' } };
  const draft = {
    id: 'draft-1',
    status: 'READY_FOR_REVIEW',
    suggestedName: '鸭胸肉',
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    procurementStrategy: 'DAILY_PURCHASE',
    diyEnabled: true,
    procurementEnabled: false,
    notes: 'Agent 草稿',
    job: { id: 'job-1', createdBy: 'staff-1' },
    profiles: [
      {
        id: 'profile-1',
        role: 'PRIMARY',
        sourceFoodName: 'Duck, breast, raw',
        sourceFoodNameEn: 'Duck, breast, raw',
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        suggestedDisplayNameZh: '鸭胸肉（生）',
        nutritionData: profile,
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '可食部',
        processingLabel: '未加工',
      },
    ],
  };
  const tx = {
    ingredient: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'ingredient-1' }),
    },
    nutritionFood: {
      upsert: jest.fn().mockResolvedValue({ id: 'food-1' }),
    },
    nutritionFoodMapping: {
      create: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
    },
    ingredientCreationDraft: {
      update: jest.fn().mockResolvedValue({ id: 'draft-1', status: 'CONFIRMED' }),
    },
    ingredientCreationJob: {
      update: jest.fn().mockResolvedValue({ id: 'job-1', status: 'CONFIRMED' }),
    },
  };
  const prisma = createPrismaMock() as any;
  prisma.ingredientCreationDraft.findUnique.mockResolvedValue(draft);
  prisma.$transaction = jest.fn(async (callback) => callback(tx));
  const service = new IngredientCreationService(prisma);

  const result = await service.confirmDraft('draft-1', {
    userId: 'admin-1',
    role: 'ADMIN',
  });

  expect(tx.ingredient.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      name: '鸭胸肉',
      type: 'FOOD',
      baseUnit: 'G',
      nutritionProfile: profile,
    }),
  });
  expect(tx.nutritionFood.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        displayNameZh: '鸭胸肉（生）',
        status: 'VERIFIED',
      }),
    }),
  );
  expect(tx.nutritionFoodMapping.create).toHaveBeenCalledWith({
    data: {
      ingredientId: 'ingredient-1',
      nutritionFoodId: 'food-1',
      isPrimary: true,
      yieldRate: 1,
      notes: 'AI 新增食材草稿确认',
    },
  });
  expect(result.status).toBe('CONFIRMED');
});

it('prevents non-admin confirmation', async () => {
  const service = new IngredientCreationService(createPrismaMock() as any);

  await expect(
    service.confirmDraft('draft-1', { userId: 'staff-1', role: 'STAFF' }),
  ).rejects.toThrow(ForbiddenException);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation.service.spec.ts
```

Expected: FAIL because `confirmDraft` is not implemented.

- [ ] **Step 3: Implement `confirmDraft`**

Add to `backend/src/application/ingredient-creation/ingredient-creation.service.ts`:

```ts
async confirmDraft(draftId: string, user: IngredientCreationUserContext) {
  assertAdmin(user);
  const draft = await this.prisma.ingredientCreationDraft.findUnique({
    where: { id: draftId },
    include: {
      job: true,
      profiles: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] },
    },
  });
  if (!draft) throw new NotFoundException('新增食材草稿不存在');
  if (draft.status !== 'READY_FOR_REVIEW') {
    throw new BadRequestException('只有待审核草稿可以确认入库');
  }
  const primaryProfile = draft.profiles.find((profile) => profile.role === 'PRIMARY');
  if (!primaryProfile) {
    throw new BadRequestException('确认入库必须包含一个主营养档案');
  }

  const confirmedAt = new Date();
  return this.prisma.$transaction(async (tx) => {
    const existing = await tx.ingredient.findFirst({
      where: {
        name: draft.suggestedName,
        brand: null,
        productModel: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`标准原料已存在：${draft.suggestedName}`);
    }

    const ingredient = await tx.ingredient.create({
      data: {
        name: draft.suggestedName,
        type: 'FOOD',
        procurementStrategy: draft.procurementStrategy,
        diyEnabled: draft.diyEnabled,
        procurementEnabled: draft.procurementEnabled,
        brand: null,
        productModel: null,
        purchaseChannel: null,
        notes: draft.notes,
        baseUnit: draft.baseUnit,
        unitDisplayLabel: draft.unitDisplayLabel,
        nutritionProfile: primaryProfile.nutritionData as Prisma.InputJsonValue,
        purchaseUnit: draft.unitDisplayLabel ?? 'g',
        purchaseToBaseRatio: 1,
        currentPricePerPurchaseUnit: 0,
        effectivePricePerPurchaseUnit: 0,
        properties: {},
      },
    });

    for (const draftProfile of draft.profiles) {
      const nutritionFood = await tx.nutritionFood.upsert({
        where: {
          name_dataSource_version: {
            name: draftProfile.sourceFoodName,
            dataSource: draftProfile.sourceType ?? 'MANUAL',
            version: 1,
          },
        },
        create: {
          name: draftProfile.sourceFoodName,
          nameEn: draftProfile.sourceFoodNameEn,
          displayNameZh: draftProfile.suggestedDisplayNameZh,
          displayNameZhSource: 'AI_DRAFT_REVIEWED',
          displayNameZhReviewedAt: confirmedAt,
          displayNameZhReviewedBy: user.userId,
          category: 'OTHER',
          dataSource: draftProfile.sourceType ?? 'MANUAL',
          externalId: draftProfile.sourceKey,
          version: 1,
          status: 'VERIFIED',
          preparationState: draftProfile.preparationState,
          preparationStateLabel: draftProfile.preparationStateLabel,
          ediblePortionLabel: draftProfile.ediblePortionLabel,
          processingLabel: draftProfile.processingLabel,
          nutritionData: draftProfile.nutritionData as Prisma.InputJsonValue,
          notes: 'AI 新增食材草稿确认',
          verifiedBy: user.userId,
          verifiedAt: confirmedAt,
        },
        update: {
          nameEn: draftProfile.sourceFoodNameEn,
          displayNameZh: draftProfile.suggestedDisplayNameZh,
          displayNameZhSource: 'AI_DRAFT_REVIEWED',
          displayNameZhReviewedAt: confirmedAt,
          displayNameZhReviewedBy: user.userId,
          status: 'VERIFIED',
          preparationState: draftProfile.preparationState,
          preparationStateLabel: draftProfile.preparationStateLabel,
          ediblePortionLabel: draftProfile.ediblePortionLabel,
          processingLabel: draftProfile.processingLabel,
          nutritionData: draftProfile.nutritionData as Prisma.InputJsonValue,
          verifiedBy: user.userId,
          verifiedAt: confirmedAt,
        },
      });

      await tx.nutritionFoodMapping.create({
        data: {
          ingredientId: ingredient.id,
          nutritionFoodId: nutritionFood.id,
          isPrimary: draftProfile.role === 'PRIMARY',
          yieldRate: 1,
          notes: 'AI 新增食材草稿确认',
        },
      });
    }

    await tx.ingredientCreationJob.update({
      where: { id: draft.jobId },
      data: {
        status: 'CONFIRMED',
        currentStage: '已确认创建正式标准原料',
        progress: 100,
        completedAt: confirmedAt,
      },
    });

    return tx.ingredientCreationDraft.update({
      where: { id: draft.id },
      data: {
        status: 'CONFIRMED',
        confirmedIngredientId: ingredient.id,
        confirmedBy: user.userId,
        confirmedAt,
      },
    });
  });
}
```

- [ ] **Step 4: Run confirmation tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/application/ingredient-creation/ingredient-creation.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add backend/src/application/ingredient-creation/ingredient-creation.service.ts backend/tests/application/ingredient-creation/ingredient-creation.service.spec.ts
git commit -m "feat: confirm ingredient creation drafts"
```

---

### Task 6: Backend Controller And DTOs

**Files:**
- Create: `backend/src/interfaces/dto/ingredient-creation.dto.ts`
- Create: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/interfaces/controllers/ingredient-creation.controller.spec.ts`

- [ ] **Step 1: Write the failing controller tests**

Create `backend/tests/interfaces/controllers/ingredient-creation.controller.spec.ts`:

```ts
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';

describe('IngredientCreationController', () => {
  const user = { userId: 'staff-1', customerId: 'staff-1', role: 'STAFF' };

  it('creates ingredient creation jobs for current staff user', async () => {
    const service = {
      createJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const controller = new IngredientCreationController(service as any);

    const result = await controller.createJob(
      { requestText: '新增鸭胸肉' },
      user,
    );

    expect(service.createJob).toHaveBeenCalledWith({
      requestText: '新增鸭胸肉',
      userId: 'staff-1',
    });
    expect(result.code).toBe(0);
    expect(result.data).toEqual({ id: 'job-1' });
  });

  it('passes current role when confirming a draft', async () => {
    const service = {
      confirmDraft: jest.fn().mockResolvedValue({ id: 'draft-1', status: 'CONFIRMED' }),
    };
    const controller = new IngredientCreationController(service as any);

    const result = await controller.confirmDraft('draft-1', {
      userId: 'admin-1',
      customerId: 'admin-1',
      role: 'ADMIN',
    });

    expect(service.confirmDraft).toHaveBeenCalledWith('draft-1', {
      userId: 'admin-1',
      role: 'ADMIN',
    });
    expect(result.data.status).toBe('CONFIRMED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/interfaces/controllers/ingredient-creation.controller.spec.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Add DTOs**

Create `backend/src/interfaces/dto/ingredient-creation.dto.ts`:

```ts
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateIngredientCreationJobDto {
  @IsString()
  requestText!: string;
}

export class IngredientCreationMessageDto {
  @IsString()
  content!: string;
}

export class UpdateIngredientCreationDraftDto {
  @IsOptional()
  @IsString()
  suggestedName?: string;

  @IsOptional()
  @IsString()
  unitDisplayLabel?: string | null;

  @IsOptional()
  @IsIn(['DAILY_PURCHASE', 'STOCK_REPLENISHMENT', 'HYBRID'])
  procurementStrategy?: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';

  @IsOptional()
  @IsBoolean()
  diyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  procurementEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateIngredientCreationDraftProfileDto {
  @IsOptional()
  @IsIn(['PRIMARY', 'SECONDARY'])
  role?: 'PRIMARY' | 'SECONDARY';

  @IsOptional()
  @IsString()
  suggestedDisplayNameZh?: string | null;

  @IsOptional()
  @IsString()
  preparationState?: string | null;

  @IsOptional()
  @IsString()
  preparationStateLabel?: string | null;

  @IsOptional()
  @IsString()
  ediblePortionLabel?: string | null;

  @IsOptional()
  @IsString()
  processingLabel?: string | null;

  @IsOptional()
  @IsString()
  agentRationale?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 4: Add controller**

Create `backend/src/interfaces/controllers/ingredient-creation.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IngredientCreationService } from '../../application/ingredient-creation/ingredient-creation.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { StaffGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CreateIngredientCreationJobDto,
  IngredientCreationMessageDto,
  UpdateIngredientCreationDraftDto,
  UpdateIngredientCreationDraftProfileDto,
} from '../dto/ingredient-creation.dto';

function userContext(user: RequestUser) {
  return {
    userId: user.userId,
    role: user.role,
  };
}

@ApiTags('Admin Ingredient Creation')
@ApiBearerAuth()
@Controller('api/v1/admin/ingredient-creation')
@UseGuards(AuthGuard, StaffGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class IngredientCreationController {
  constructor(private readonly ingredientCreationService: IngredientCreationService) {}

  @Post('jobs')
  async createJob(
    @Body() dto: CreateIngredientCreationJobDto,
    @CurrentUser() user: RequestUser,
  ) {
    const result = await this.ingredientCreationService.createJob({
      requestText: dto.requestText,
      userId: user.userId,
    });
    return ApiResponseDto.success(result);
  }

  @Get('jobs')
  async listJobs(@CurrentUser() user: RequestUser) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.listJobs(userContext(user)),
    );
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.getJobDetail(id, userContext(user)),
    );
  }

  @Post('jobs/:id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: IngredientCreationMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.addUserMessage(
        id,
        { content: dto.content },
        userContext(user),
      ),
    );
  }

  @Post('jobs/:id/answer')
  async answerQuestion(
    @Param('id') id: string,
    @Body() dto: IngredientCreationMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.answerQuestion(
        id,
        { content: dto.content },
        userContext(user),
      ),
    );
  }

  @Post('jobs/:id/rerun')
  async rerunJob(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.rerunDraft(id, userContext(user)),
    );
  }

  @Patch('drafts/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientCreationDraftDto,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.updateDraft(id, dto, userContext(user)),
    );
  }

  @Patch('draft-profiles/:id')
  async updateDraftProfile(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientCreationDraftProfileDto,
    @CurrentUser() user: RequestUser,
  ) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.updateDraftProfile(
        id,
        dto,
        userContext(user),
      ),
    );
  }

  @Post('drafts/:id/confirm')
  async confirmDraft(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return ApiResponseDto.success(
      await this.ingredientCreationService.confirmDraft(id, userContext(user)),
    );
  }
}
```

- [ ] **Step 5: Register controller and services**

Modify `backend/src/app.module.ts`:

```ts
import { IngredientCreationController } from './interfaces/controllers/ingredient-creation.controller';
import { IngredientCreationService } from './application/ingredient-creation/ingredient-creation.service';
import { IngredientCreationAgentService } from './application/ingredient-creation/ingredient-creation-agent.service';
```

Add `IngredientCreationController` to the controllers array and both services to the providers array.

- [ ] **Step 6: Run controller tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand tests/interfaces/controllers/ingredient-creation.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add backend/src/interfaces/dto/ingredient-creation.dto.ts backend/src/interfaces/controllers/ingredient-creation.controller.ts backend/src/app.module.ts backend/tests/interfaces/controllers/ingredient-creation.controller.spec.ts
git commit -m "feat: expose ingredient creation API"
```

---

### Task 7: Miniapp API Client

**Files:**
- Create: `miniapp/src/api/ingredient-creation.ts`
- Test: `miniapp/src/api/ingredient-creation.spec.ts`

- [ ] **Step 1: Write the failing miniapp API tests**

Create `miniapp/src/api/ingredient-creation.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/api', () => ({
  request: vi.fn((options) => Promise.resolve(options)),
}));

import { request } from '../utils/api';
import { ingredientCreationApi } from './ingredient-creation';

describe('ingredientCreationApi', () => {
  it('creates ingredient creation jobs under the admin endpoint', async () => {
    await ingredientCreationApi.createJob({ requestText: '新增鸭胸肉' });

    expect(request).toHaveBeenCalledWith({
      url: '/admin/ingredient-creation/jobs',
      method: 'POST',
      data: { requestText: '新增鸭胸肉' },
    });
  });

  it('confirms drafts through the admin endpoint', async () => {
    await ingredientCreationApi.confirmDraft('draft-1');

    expect(request).toHaveBeenCalledWith({
      url: '/admin/ingredient-creation/drafts/draft-1/confirm',
      method: 'POST',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
npm test -- src/api/ingredient-creation.spec.ts
```

Expected: FAIL because the API module does not exist.

- [ ] **Step 3: Implement miniapp API module**

Create `miniapp/src/api/ingredient-creation.ts`:

```ts
import { request } from '../utils/api';

export type IngredientCreationJobStatus =
  | 'DRAFTING'
  | 'SEARCHING_SOURCES'
  | 'WAITING_USER'
  | 'BUILDING_REPORT'
  | 'READY_FOR_REVIEW'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELED';

export interface CreateIngredientCreationJobPayload {
  requestText: string;
}

export interface IngredientCreationMessagePayload {
  content: string;
}

export interface UpdateIngredientCreationDraftPayload {
  suggestedName?: string;
  unitDisplayLabel?: string | null;
  procurementStrategy?: 'DAILY_PURCHASE' | 'STOCK_REPLENISHMENT' | 'HYBRID';
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  notes?: string | null;
}

export interface UpdateIngredientCreationDraftProfilePayload {
  role?: 'PRIMARY' | 'SECONDARY';
  suggestedDisplayNameZh?: string | null;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  agentRationale?: string | null;
  sortOrder?: number;
}

export const ingredientCreationApi = {
  createJob: (data: CreateIngredientCreationJobPayload) =>
    request({ url: '/admin/ingredient-creation/jobs', method: 'POST', data }),
  listJobs: () =>
    request({ url: '/admin/ingredient-creation/jobs', method: 'GET' }),
  getJob: (id: string) =>
    request({ url: `/admin/ingredient-creation/jobs/${id}`, method: 'GET' }),
  addMessage: (id: string, data: IngredientCreationMessagePayload) =>
    request({
      url: `/admin/ingredient-creation/jobs/${id}/messages`,
      method: 'POST',
      data,
    }),
  answerQuestion: (id: string, data: IngredientCreationMessagePayload) =>
    request({
      url: `/admin/ingredient-creation/jobs/${id}/answer`,
      method: 'POST',
      data,
    }),
  rerunJob: (id: string) =>
    request({
      url: `/admin/ingredient-creation/jobs/${id}/rerun`,
      method: 'POST',
    }),
  updateDraft: (id: string, data: UpdateIngredientCreationDraftPayload) =>
    request({ url: `/admin/ingredient-creation/drafts/${id}`, method: 'PATCH', data }),
  updateDraftProfile: (
    id: string,
    data: UpdateIngredientCreationDraftProfilePayload,
  ) =>
    request({
      url: `/admin/ingredient-creation/draft-profiles/${id}`,
      method: 'PATCH',
      data,
    }),
  confirmDraft: (id: string) =>
    request({
      url: `/admin/ingredient-creation/drafts/${id}/confirm`,
      method: 'POST',
    }),
};
```

- [ ] **Step 4: Run miniapp API tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
npm test -- src/api/ingredient-creation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add miniapp/src/api/ingredient-creation.ts miniapp/src/api/ingredient-creation.spec.ts
git commit -m "feat: add miniapp ingredient creation API"
```

---

### Task 8: Miniapp Entry And Pages

**Files:**
- Modify: `miniapp/src/pages/staff-workbench/index.vue`
- Modify: `miniapp/src/pages.json`
- Create: `miniapp/src/pages/ingredient-creation/list.vue`
- Create: `miniapp/src/pages/ingredient-creation/detail.vue`
- Create: `miniapp/src/pages/ingredient-creation/draft.vue`
- Test: `miniapp/src/pages/ingredient-creation.regression.spec.ts`

- [ ] **Step 1: Write the failing miniapp regression tests**

Create `miniapp/src/pages/ingredient-creation.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (path: string) => {
  const absolutePath = resolve(process.cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
};

const workbenchSource = readSource('src/pages/staff-workbench/index.vue');
const pagesJsonSource = readSource('src/pages.json');
const listSource = readSource('src/pages/ingredient-creation/list.vue');
const detailSource = readSource('src/pages/ingredient-creation/detail.vue');
const draftSource = readSource('src/pages/ingredient-creation/draft.vue');

describe('ingredient creation miniapp workflow', () => {
  it('adds AI ingredient creation to the staff workbench', () => {
    expect(workbenchSource).toContain('AI 新增食材');
    expect(workbenchSource).toContain('goToIngredientCreation');
    expect(workbenchSource).toContain('/pages/ingredient-creation/list');
  });

  it('registers ingredient creation pages', () => {
    expect(pagesJsonSource).toContain('pages/ingredient-creation/list');
    expect(pagesJsonSource).toContain('pages/ingredient-creation/detail');
    expect(pagesJsonSource).toContain('pages/ingredient-creation/draft');
  });

  it('creates jobs from the list page', () => {
    expect(listSource).toContain('ingredientCreationApi.createJob');
    expect(listSource).toContain('新增食材需求');
    expect(listSource).toContain('AI 新增食材');
  });

  it('shows task messages and answers waiting questions on the detail page', () => {
    expect(detailSource).toContain('ingredientCreationApi.getJob');
    expect(detailSource).toContain('ingredientCreationApi.answerQuestion');
    expect(detailSource).toContain('WAITING_USER');
    expect(detailSource).toContain('查看草稿');
  });

  it('keeps draft confirmation admin-only in the draft page', () => {
    expect(draftSource).toContain('ingredientCreationApi.confirmDraft');
    expect(draftSource).toContain('isAdmin');
    expect(draftSource).toContain('确认创建正式原料');
    expect(draftSource).toContain('完整性');
    expect(draftSource).toContain('非零');
    expect(draftSource).toContain('零值');
    expect(draftSource).toContain('空值');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
npm test -- src/pages/ingredient-creation.regression.spec.ts
```

Expected: FAIL because the new pages and workbench entry do not exist.

- [ ] **Step 3: Add workbench entry**

Modify `miniapp/src/pages/staff-workbench/index.vue`:

Add a module after the recipe designer module:

```vue
<view class="module" @tap="goToIngredientCreation">
  <view class="module-icon ingredient-agent">
    <text class="module-icon-symbol">AI</text>
  </view>
  <view class="module-content">
    <text class="module-title">AI 新增食材</text>
    <text class="module-desc">自然语言创建标准食材与营养档案草稿</text>
  </view>
  <text class="module-arrow">›</text>
</view>
```

Add script function:

```ts
const goToIngredientCreation = () => {
  uni.navigateTo({ url: '/pages/ingredient-creation/list' });
};
```

Add icon style:

```scss
&.ingredient-agent {
  background: linear-gradient(135deg, #e8fff3 0%, #b7eb8f 100%);
  color: #237804;
}
```

- [ ] **Step 4: Register pages**

Modify `miniapp/src/pages.json` and add these page entries:

```json
{
  "path": "pages/ingredient-creation/list",
  "style": {
    "navigationBarTitleText": "AI 新增食材"
  }
},
{
  "path": "pages/ingredient-creation/detail",
  "style": {
    "navigationBarTitleText": "新增食材任务"
  }
},
{
  "path": "pages/ingredient-creation/draft",
  "style": {
    "navigationBarTitleText": "食材草稿审核"
  }
}
```

- [ ] **Step 5: Create list page**

Create `miniapp/src/pages/ingredient-creation/list.vue`:

```vue
<template>
  <view class="ingredient-creation-list">
    <view class="header">
      <text class="title">AI 新增食材</text>
      <text class="subtitle">自然语言创建标准食材与营养档案草稿</text>
    </view>

    <view class="create-panel">
      <text class="field-label">新增食材需求</text>
      <textarea
        v-model="requestText"
        class="request-input"
        placeholder="例如：新增鸭胸肉，最好有生和水煮档案"
      />
      <button class="primary-btn" :disabled="creating" @tap="createJob">
        {{ creating ? '创建中' : '创建任务' }}
      </button>
    </view>

    <view class="task-list">
      <view v-for="job in jobs" :key="job.id" class="task-card" @tap="openJob(job.id)">
        <text class="task-title">{{ job.draft?.suggestedName || job.requestText }}</text>
        <text class="task-status">{{ getStatusLabel(job.status) }}</text>
        <text class="task-stage">{{ job.currentStage || '等待处理' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { ingredientCreationApi } from '../../api/ingredient-creation';

const jobs = ref<any[]>([]);
const requestText = ref('');
const creating = ref(false);

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFTING: '草稿中',
    SEARCHING_SOURCES: '查找来源',
    WAITING_USER: '等待补充',
    BUILDING_REPORT: '生成报告',
    READY_FOR_REVIEW: '待审核',
    CONFIRMED: '已入库',
    FAILED: '失败',
    CANCELED: '已取消',
  };
  return labels[status] || status;
}

async function loadJobs() {
  const result: any = await ingredientCreationApi.listJobs();
  jobs.value = result.data || result || [];
}

async function createJob() {
  const text = requestText.value.trim();
  if (!text) {
    uni.showToast({ title: '请填写新增食材需求', icon: 'none' });
    return;
  }
  creating.value = true;
  try {
    const result: any = await ingredientCreationApi.createJob({ requestText: text });
    const job = result.data || result;
    requestText.value = '';
    uni.navigateTo({ url: `/pages/ingredient-creation/detail?id=${job.id}` });
  } finally {
    creating.value = false;
  }
}

function openJob(id: string) {
  uni.navigateTo({ url: `/pages/ingredient-creation/detail?id=${id}` });
}

onMounted(loadJobs);
onShow(loadJobs);
</script>
```

- [ ] **Step 6: Create detail page**

Create `miniapp/src/pages/ingredient-creation/detail.vue` with these required script behaviors:

```vue
<template>
  <view class="ingredient-creation-detail">
    <view class="status-panel">
      <text class="status">{{ getStatusLabel(job?.status) }}</text>
      <text class="stage">{{ job?.currentStage || '等待处理' }}</text>
    </view>

    <scroll-view scroll-y class="message-list">
      <view v-for="message in messages" :key="message.id" class="message" :class="message.role">
        <text>{{ message.content }}</text>
      </view>
    </scroll-view>

    <view v-if="job?.status === 'WAITING_USER'" class="answer-panel">
      <text class="question">{{ job.waitingQuestion }}</text>
      <textarea v-model="inputText" class="message-input" placeholder="回答 Agent 的问题" />
      <button class="primary-btn" @tap="answerQuestion">提交回答</button>
    </view>
    <view v-else class="answer-panel">
      <textarea v-model="inputText" class="message-input" placeholder="补充要求，例如：不要用干烤档案" />
      <button class="secondary-btn" @tap="addMessage">补充要求</button>
    </view>

    <button v-if="job?.draft" class="primary-btn" @tap="openDraft">查看草稿</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ingredientCreationApi } from '../../api/ingredient-creation';

const jobId = ref('');
const job = ref<any>(null);
const inputText = ref('');
const messages = computed(() => job.value?.messages || []);

function getStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    DRAFTING: '草稿中',
    SEARCHING_SOURCES: '查找来源',
    WAITING_USER: '等待补充',
    BUILDING_REPORT: '生成报告',
    READY_FOR_REVIEW: '待审核',
    CONFIRMED: '已入库',
    FAILED: '失败',
    CANCELED: '已取消',
  };
  return status ? labels[status] || status : '加载中';
}

async function loadJob() {
  const result: any = await ingredientCreationApi.getJob(jobId.value);
  job.value = result.data || result;
}

async function addMessage() {
  const content = inputText.value.trim();
  if (!content) return;
  await ingredientCreationApi.addMessage(jobId.value, { content });
  inputText.value = '';
  await loadJob();
}

async function answerQuestion() {
  const content = inputText.value.trim();
  if (!content) return;
  await ingredientCreationApi.answerQuestion(jobId.value, { content });
  inputText.value = '';
  await loadJob();
}

function openDraft() {
  uni.navigateTo({ url: `/pages/ingredient-creation/draft?id=${job.value.draft.id}` });
}

onLoad((query) => {
  jobId.value = String(query?.id || '');
  loadJob();
});
</script>
```

- [ ] **Step 7: Create draft page**

Create `miniapp/src/pages/ingredient-creation/draft.vue` with these required script behaviors:

```vue
<template>
  <view class="ingredient-creation-draft">
    <view class="draft-card">
      <text class="title">{{ draft?.suggestedName || '食材草稿' }}</text>
      <text class="summary">{{ draft?.agentSummary || '等待 Agent 生成总结' }}</text>
    </view>

    <view v-for="profile in profiles" :key="profile.id" class="profile-card">
      <text class="profile-role">{{ profile.role === 'PRIMARY' ? '主档案' : '次级档案' }}</text>
      <text class="profile-name">{{ profile.suggestedDisplayNameZh || profile.sourceFoodName }}</text>
      <text class="profile-source">{{ profile.sourceType }} {{ profile.sourceKey }}</text>
      <view class="completeness">
        <text>完整性 {{ profile.completenessSummary?.filled }}/{{ profile.completenessSummary?.total }}</text>
        <text>非零 {{ profile.completenessSummary?.nonZero }}</text>
        <text>零值 {{ profile.completenessSummary?.zero }}</text>
        <text>空值 {{ profile.completenessSummary?.empty }}</text>
      </view>
    </view>

    <button v-if="isAdmin && draft?.status === 'READY_FOR_REVIEW'" class="primary-btn" @tap="confirmDraft">
      确认创建正式原料
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ingredientCreationApi } from '../../api/ingredient-creation';

const draftId = ref('');
const job = ref<any>(null);
const draft = computed(() => job.value?.draft || null);
const profiles = computed(() => draft.value?.profiles || []);
const user = uni.getStorageSync('user') || uni.getStorageSync('userInfo') || {};
const isAdmin = computed(() => user?.role === 'ADMIN');

async function loadDraft() {
  const jobsResult: any = await ingredientCreationApi.listJobs();
  const jobs = jobsResult.data || jobsResult || [];
  const found = jobs.find((candidate: any) => candidate.draft?.id === draftId.value);
  if (found) {
    const detail: any = await ingredientCreationApi.getJob(found.id);
    job.value = detail.data || detail;
  }
}

async function confirmDraft() {
  const result = await uni.showModal({
    title: '确认创建正式原料',
    content: '确认后会写入正式标准原料和营养档案。',
  });
  if (!result.confirm) return;
  await ingredientCreationApi.confirmDraft(draftId.value);
  uni.showToast({ title: '已创建正式原料', icon: 'success' });
  await loadDraft();
}

onLoad((query) => {
  draftId.value = String(query?.id || '');
  loadDraft();
});
</script>
```

- [ ] **Step 8: Run miniapp regression tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
npm test -- src/pages/ingredient-creation.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Compile miniapp dev output**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
npm run dev:mp-weixin
```

Expected: compiles to `miniapp/dist/dev/mp-weixin`. Do not use `miniapp/dist/build/mp-weixin` for validation.

- [ ] **Step 10: Commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git add miniapp/src/pages/staff-workbench/index.vue miniapp/src/pages.json miniapp/src/pages/ingredient-creation/list.vue miniapp/src/pages/ingredient-creation/detail.vue miniapp/src/pages/ingredient-creation/draft.vue miniapp/src/pages/ingredient-creation.regression.spec.ts
git commit -m "feat: add miniapp ingredient creation workflow"
```

---

### Task 9: End-To-End Verification And Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-05-27-mobile-ingredient-creation-agent-design.md` only if implementation decisions differ from the approved spec.

- [ ] **Step 1: Run backend targeted tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm test -- --runInBand \
  tests/prisma/ingredient-creation-schema.spec.ts \
  tests/application/ingredient-creation/ingredient-creation-completeness.spec.ts \
  tests/application/ingredient-creation/ingredient-creation.service.spec.ts \
  tests/application/ingredient-creation/ingredient-creation-agent.service.spec.ts \
  tests/interfaces/controllers/ingredient-creation.controller.spec.ts
```

Expected: all listed suites PASS.

- [ ] **Step 2: Run miniapp targeted tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
npm test -- src/api/ingredient-creation.spec.ts src/pages/ingredient-creation.regression.spec.ts
```

Expected: all listed suites PASS.

- [ ] **Step 3: Run Prisma generate**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 4: Run backend build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
npm run build
```

Expected: Nest build completes without TypeScript errors.

- [ ] **Step 5: Compile miniapp development output**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp
npm run dev:mp-weixin
```

Expected: development build emits `miniapp/dist/dev/mp-weixin`. Do not inspect or validate `miniapp/dist/build/mp-weixin`.

- [ ] **Step 6: Manual smoke check with backend on port 3011**

Run backend:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/backend
PORT=3011 DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} npm run start:dev:miniapp
```

Smoke flow:

1. Open WeChat devtools against `miniapp/dist/dev/mp-weixin`.
2. Log in as a staff or admin user.
3. Open `员工工作台`.
4. Tap `AI 新增食材`.
5. Create a task with `新增鸭胸肉，最好有生和水煮档案`.
6. Confirm the task appears in the list and opens the detail page.
7. Confirm messages render in the detail page.
8. Confirm a generated draft can be opened when the backend has matching source records.
9. Log in as non-admin staff and confirm the draft page does not expose `确认创建正式原料`.
10. Log in as admin and confirm the button appears for `READY_FOR_REVIEW` drafts.

Expected: flow completes without client runtime errors.

- [ ] **Step 7: Final git status and commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git status --short --branch
git add backend miniapp docs/superpowers/specs/2026-05-27-mobile-ingredient-creation-agent-design.md
git commit -m "feat: add mobile ingredient creation agent"
```

Expected: commit contains only files touched by this plan. Existing unrelated dirty files remain unmodified by the implementation worker.

---

## Self-Review

- Spec coverage: the plan covers the draft data model, async job lifecycle, task messages, draft profiles, completeness reporting, admin-only confirmation, miniapp entry, chat task page, draft review page, errors through waiting/failed states, and tests.
- Scope control: the plan delivers the first closed loop using local source records. More advanced online source search and richer Agent prompt work remain compatible with `IngredientCreationAgentService` and do not block the first workflow.
- Boundary check: no task writes formal `Ingredient`, `NutritionFood`, `NutritionFoodMapping`, or `Ingredient.nutritionProfile` before `confirmDraft`.
- Type consistency: statuses and roles match the Prisma enums and miniapp type aliases used throughout the tasks.
- Validation commands: backend uses Jest commands from `backend/package.json`; miniapp uses Vitest commands from `miniapp/package.json`; miniapp validation explicitly uses `miniapp/dist/dev/mp-weixin`.
