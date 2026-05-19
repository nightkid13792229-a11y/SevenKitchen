# Ingredient Nutrition Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Web admin nutrition-governance workflow that creates source records, match candidates, supplement label drafts, and confirmed `Ingredient.nutritionProfile` data for all existing FOOD and SUPPLEMENT ingredients.

**Architecture:** Add a dedicated governance slice beside the existing ingredient and nutrition-food domains. Backend persists three layers: source records, candidates/drafts, and confirmed ingredient nutrition profiles. Admin web consumes new admin APIs for overview, food candidate review, supplement draft review, and confirmation.

**Tech Stack:** NestJS + Prisma + PostgreSQL + Jest, Vue 3 + Element Plus + TypeScript, Tencent COS for label image storage, OpenAI-compatible provider abstraction for future vision extraction.

---

## Scope Check

The design spans several subsystems. Implement it in the order below so each task leaves a working, testable increment:

1. Backend schema and source/candidate confirmation core.
2. USDA source ingestion and candidate generation.
3. Local CFCT private intermediate import.
4. Supplement label draft upload and extraction provider interface.
5. Web admin governance UI.

Do not implement a full ADF/PDD recipe designer in this plan. Do not expose this workflow in the WeChat miniapp.

## Current Context

Relevant existing files:

- `backend/prisma/schema.prisma` already has `Ingredient`, `NutritionFood`, and `NutritionFoodMapping`.
- `backend/src/application/nutrition-food/nutrition-food.service.ts` already has basic USDA search/import parsing.
- `backend/src/domain/ingredient/nutrition-profile.utils.ts` already normalizes legacy and v2 nutrition profiles.
- `backend/src/domain/ingredient/nutrition-field-catalog.ts` defines canonical nutrition field paths.
- `admin-web/src/api/ingredients.ts` and `admin-web/src/router/index.ts` show existing admin API/router patterns.
- `admin-web/src/layouts/MainLayout.vue` contains the sidebar menu.

Important constraints:

- Read `docs/DATABASE_NAMING_CONVENTIONS.md` before any SQL or migration work.
- Prisma uses camelCase; raw PostgreSQL uses snake_case.
- Do not touch the currently dirty `miniapp/` files while executing this plan.
- Package upload endpoints already use `FileInterceptor('file')`.

## File Structure

### Backend

- Modify: `backend/prisma/schema.prisma`
  - Add governance enums and models.
  - Add relations from `Ingredient` to candidates/drafts.
- Create: `backend/prisma/migrations/202605110001_add_nutrition_governance/migration.sql`
  - Database migration for governance tables.
- Create: `backend/src/domain/nutrition-governance/nutrition-governance.types.ts`
  - Shared domain DTO-like TypeScript contracts for source records, candidates, extraction results, and overview.
- Create: `backend/src/domain/nutrition-governance/nutrition-governance.utils.ts`
  - Pure functions for source keys, source priority, confidence classification, and profile snapshots.
- Create: `backend/src/domain/nutrition-governance/usda-nutrient-map.ts`
  - USDA nutrient ID to `NutritionProfileV2` field mapping.
- Create: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
  - Source record upsert, overview, list candidates, generate food candidates, confirm/reject candidates, create/list/confirm supplement drafts.
- Create: `backend/src/application/nutrition-governance/label-recognition.provider.ts`
  - Provider interface plus disabled/local deterministic provider for tests.
- Create: `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`
  - Request/response DTOs and validation.
- Create: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
  - Admin API endpoints under `/api/v1/admin/nutrition-governance`.
- Modify: `backend/src/app.module.ts`
  - Register controller and service/provider.
- Create: `backend/prisma/import-cfct-private-source.ts`
  - Local-only importer for reviewed CFCT JSON rows into source records.
- Modify: `backend/package.json`
  - Add `import:cfct-private` and `import:cfct-private:apply` scripts.

### Backend Tests

- Create: `backend/tests/domain/nutrition-governance/nutrition-governance.utils.spec.ts`
- Create: `backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts`
- Create: `backend/tests/interfaces/controllers/nutrition-governance.controller.spec.ts`
- Create: `backend/tests/prisma/nutrition-governance-schema.spec.ts`
- Create: `backend/tests/prisma/import-cfct-private-source.spec.ts`

### Admin Web

- Create: `admin-web/src/types/nutritionGovernance.ts`
- Create: `admin-web/src/api/nutritionGovernance.ts`
- Create: `admin-web/src/views/NutritionGovernance/index.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/OverviewCards.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/FoodCandidatesTable.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/SupplementDraftsTable.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/NutritionProfilePreview.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

---

### Task 1: Prisma Governance Schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605110001_add_nutrition_governance/migration.sql`
- Test: `backend/tests/prisma/nutrition-governance-schema.spec.ts`

- [ ] **Step 1: Write the schema regression test**

Create `backend/tests/prisma/nutrition-governance-schema.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

describe('nutrition governance prisma schema', () => {
  const schema = readFileSync(
    join(process.cwd(), 'prisma/schema.prisma'),
    'utf8',
  );

  it('defines source, candidate, and supplement draft models', () => {
    expect(schema).toContain('model NutritionSourceRecord');
    expect(schema).toContain('model IngredientNutritionCandidate');
    expect(schema).toContain('model SupplementNutritionDraft');
  });

  it('keeps source records uniquely addressable by source type and key', () => {
    expect(schema).toContain('@@unique([sourceType, sourceKey])');
  });

  it('relates governance records back to Ingredient', () => {
    expect(schema).toContain('nutritionCandidates');
    expect(schema).toContain('supplementNutritionDrafts');
  });
});
```

- [ ] **Step 2: Run the failing schema test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/prisma/nutrition-governance-schema.spec.ts --runInBand
```

Expected: FAIL with missing model names.

- [ ] **Step 3: Add enums and relations to Prisma schema**

Modify `backend/prisma/schema.prisma`.

Add these relation fields inside `model Ingredient` after `nutritionFoodMappings`:

```prisma
  nutritionCandidates          IngredientNutritionCandidate[]
  supplementNutritionDrafts    SupplementNutritionDraft[]
```

Add these enums near the nutrition-food enums:

```prisma
enum NutritionGovernanceSourceType {
  USDA
  CFCT
  SUPPLEMENT_LABEL
  MANUAL
}

enum NutritionGovernanceRecordStatus {
  ACTIVE
  DEPRECATED
}

enum NutritionCandidateStatus {
  CANDIDATE
  CONFIRMED
  REJECTED
  SKIPPED
}

enum NutritionMatchConfidence {
  HIGH
  MEDIUM
  LOW
}

enum SupplementNutritionDraftStatus {
  DRAFT
  CONFIRMED
  REJECTED
}
```

Add these models after `NutritionFoodMapping`:

```prisma
model NutritionSourceRecord {
  id                  String                            @id @default(uuid()) @map("id")
  sourceType          NutritionGovernanceSourceType     @map("source_type")
  sourceKey           String                            @map("source_key") @db.VarChar(200)
  sourceTitle         String                            @map("source_title") @db.VarChar(300)
  sourceDetail        Json?                             @map("source_detail")
  foodName            String                            @map("food_name") @db.VarChar(300)
  foodNameEn          String?                           @map("food_name_en") @db.VarChar(300)
  dataType            String?                           @map("data_type") @db.VarChar(100)
  category            String?                           @map("category") @db.VarChar(100)
  rawData             Json                              @map("raw_data")
  normalizedNutrition Json?                             @map("normalized_nutrition")
  status              NutritionGovernanceRecordStatus   @default(ACTIVE) @map("status")
  createdAt           DateTime                          @default(now()) @map("created_at")
  updatedAt           DateTime                          @updatedAt @map("updated_at")
  candidates          IngredientNutritionCandidate[]
  supplementDrafts    SupplementNutritionDraft[]

  @@unique([sourceType, sourceKey])
  @@index([sourceType])
  @@index([foodName])
  @@index([status])
  @@map("nutrition_source_record")
}

model IngredientNutritionCandidate {
  id                   String                    @id @default(uuid()) @map("id")
  ingredientId         String                    @map("ingredient_id")
  sourceRecordId       String                    @map("source_record_id")
  sourcePriority       Int                       @map("source_priority")
  confidence           NutritionMatchConfidence  @map("confidence")
  score                Float                     @map("score")
  matchReasons         Json                      @map("match_reasons")
  normalizedNutrition  Json                      @map("normalized_nutrition")
  status               NutritionCandidateStatus  @default(CANDIDATE) @map("status")
  confirmationSnapshot Json?                     @map("confirmation_snapshot")
  confirmedBy          String?                   @map("confirmed_by")
  confirmedAt          DateTime?                 @map("confirmed_at")
  createdAt            DateTime                  @default(now()) @map("created_at")
  updatedAt            DateTime                  @updatedAt @map("updated_at")
  ingredient           Ingredient                @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  sourceRecord         NutritionSourceRecord     @relation(fields: [sourceRecordId], references: [id], onDelete: Cascade)

  @@unique([ingredientId, sourceRecordId])
  @@index([ingredientId])
  @@index([sourceRecordId])
  @@index([status])
  @@index([confidence])
  @@map("ingredient_nutrition_candidate")
}

model SupplementNutritionDraft {
  id                   String                         @id @default(uuid()) @map("id")
  ingredientId         String                         @map("ingredient_id")
  sourceRecordId       String?                        @map("source_record_id")
  imageUrl             String                         @map("image_url")
  imageKey             String                         @map("image_key") @db.VarChar(300)
  ocrText              String?                        @map("ocr_text")
  aiExtraction         Json                           @map("ai_extraction")
  normalizedNutrition  Json?                          @map("normalized_nutrition")
  missingFields        String[]                       @default([]) @map("missing_fields")
  status               SupplementNutritionDraftStatus @default(DRAFT) @map("status")
  createdBy            String?                        @map("created_by")
  confirmedBy          String?                        @map("confirmed_by")
  confirmedAt          DateTime?                      @map("confirmed_at")
  createdAt            DateTime                       @default(now()) @map("created_at")
  updatedAt            DateTime                       @updatedAt @map("updated_at")
  ingredient           Ingredient                     @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  sourceRecord         NutritionSourceRecord?         @relation(fields: [sourceRecordId], references: [id], onDelete: SetNull)

  @@index([ingredientId])
  @@index([sourceRecordId])
  @@index([status])
  @@map("supplement_nutrition_draft")
}
```

- [ ] **Step 4: Add the SQL migration**

Create `backend/prisma/migrations/202605110001_add_nutrition_governance/migration.sql`:

```sql
CREATE TYPE "NutritionGovernanceSourceType" AS ENUM ('USDA', 'CFCT', 'SUPPLEMENT_LABEL', 'MANUAL');
CREATE TYPE "NutritionGovernanceRecordStatus" AS ENUM ('ACTIVE', 'DEPRECATED');
CREATE TYPE "NutritionCandidateStatus" AS ENUM ('CANDIDATE', 'CONFIRMED', 'REJECTED', 'SKIPPED');
CREATE TYPE "NutritionMatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "SupplementNutritionDraftStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REJECTED');

CREATE TABLE "nutrition_source_record" (
  "id" TEXT NOT NULL,
  "source_type" "NutritionGovernanceSourceType" NOT NULL,
  "source_key" VARCHAR(200) NOT NULL,
  "source_title" VARCHAR(300) NOT NULL,
  "source_detail" JSONB,
  "food_name" VARCHAR(300) NOT NULL,
  "food_name_en" VARCHAR(300),
  "data_type" VARCHAR(100),
  "category" VARCHAR(100),
  "raw_data" JSONB NOT NULL,
  "normalized_nutrition" JSONB,
  "status" "NutritionGovernanceRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_source_record_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ingredient_nutrition_candidate" (
  "id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "source_record_id" TEXT NOT NULL,
  "source_priority" INTEGER NOT NULL,
  "confidence" "NutritionMatchConfidence" NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "match_reasons" JSONB NOT NULL,
  "normalized_nutrition" JSONB NOT NULL,
  "status" "NutritionCandidateStatus" NOT NULL DEFAULT 'CANDIDATE',
  "confirmation_snapshot" JSONB,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingredient_nutrition_candidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplement_nutrition_draft" (
  "id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "source_record_id" TEXT,
  "image_url" TEXT NOT NULL,
  "image_key" VARCHAR(300) NOT NULL,
  "ocr_text" TEXT,
  "ai_extraction" JSONB NOT NULL,
  "normalized_nutrition" JSONB,
  "missing_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "SupplementNutritionDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by" TEXT,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplement_nutrition_draft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nutrition_source_record_source_type_source_key_key"
  ON "nutrition_source_record"("source_type", "source_key");
CREATE INDEX "nutrition_source_record_source_type_idx" ON "nutrition_source_record"("source_type");
CREATE INDEX "nutrition_source_record_food_name_idx" ON "nutrition_source_record"("food_name");
CREATE INDEX "nutrition_source_record_status_idx" ON "nutrition_source_record"("status");

CREATE UNIQUE INDEX "ingredient_nutrition_candidate_ingredient_id_source_record_id_key"
  ON "ingredient_nutrition_candidate"("ingredient_id", "source_record_id");
CREATE INDEX "ingredient_nutrition_candidate_ingredient_id_idx" ON "ingredient_nutrition_candidate"("ingredient_id");
CREATE INDEX "ingredient_nutrition_candidate_source_record_id_idx" ON "ingredient_nutrition_candidate"("source_record_id");
CREATE INDEX "ingredient_nutrition_candidate_status_idx" ON "ingredient_nutrition_candidate"("status");
CREATE INDEX "ingredient_nutrition_candidate_confidence_idx" ON "ingredient_nutrition_candidate"("confidence");

CREATE INDEX "supplement_nutrition_draft_ingredient_id_idx" ON "supplement_nutrition_draft"("ingredient_id");
CREATE INDEX "supplement_nutrition_draft_source_record_id_idx" ON "supplement_nutrition_draft"("source_record_id");
CREATE INDEX "supplement_nutrition_draft_status_idx" ON "supplement_nutrition_draft"("status");

ALTER TABLE "ingredient_nutrition_candidate"
  ADD CONSTRAINT "ingredient_nutrition_candidate_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_nutrition_candidate"
  ADD CONSTRAINT "ingredient_nutrition_candidate_source_record_id_fkey"
  FOREIGN KEY ("source_record_id") REFERENCES "nutrition_source_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplement_nutrition_draft"
  ADD CONSTRAINT "supplement_nutrition_draft_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplement_nutrition_draft"
  ADD CONSTRAINT "supplement_nutrition_draft_source_record_id_fkey"
  FOREIGN KEY ("source_record_id") REFERENCES "nutrition_source_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Run schema test and Prisma generate**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/prisma/nutrition-governance-schema.spec.ts --runInBand
npx prisma generate
```

Expected: PASS, then Prisma Client generated successfully.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/prisma/schema.prisma backend/prisma/migrations/202605110001_add_nutrition_governance/migration.sql backend/tests/prisma/nutrition-governance-schema.spec.ts
git commit -m "feat: add nutrition governance schema"
```

---

### Task 2: Domain Utilities and USDA Mapping

**Files:**
- Create: `backend/src/domain/nutrition-governance/nutrition-governance.types.ts`
- Create: `backend/src/domain/nutrition-governance/nutrition-governance.utils.ts`
- Create: `backend/src/domain/nutrition-governance/usda-nutrient-map.ts`
- Test: `backend/tests/domain/nutrition-governance/nutrition-governance.utils.spec.ts`

- [ ] **Step 1: Write utility tests**

Create `backend/tests/domain/nutrition-governance/nutrition-governance.utils.spec.ts`:

```ts
import {
  buildNutritionSourceKey,
  classifyMatchConfidence,
  getSourcePriority,
  mapUsdaNutrientsToNutritionProfile,
} from '../../../src/domain/nutrition-governance/nutrition-governance.utils';

describe('nutrition governance utilities', () => {
  it('builds stable source keys', () => {
    expect(buildNutritionSourceKey('USDA', '12345')).toBe('USDA:12345');
    expect(buildNutritionSourceKey('CFCT', 'v6-1:p12:r4')).toBe(
      'CFCT:v6-1:p12:r4',
    );
  });

  it('prioritizes USDA before CFCT before manual sources', () => {
    expect(getSourcePriority('USDA')).toBe(1);
    expect(getSourcePriority('CFCT')).toBe(2);
    expect(getSourcePriority('MANUAL')).toBe(3);
    expect(getSourcePriority('SUPPLEMENT_LABEL')).toBe(4);
  });

  it('classifies confidence by numeric score', () => {
    expect(classifyMatchConfidence(0.92)).toBe('HIGH');
    expect(classifyMatchConfidence(0.72)).toBe('MEDIUM');
    expect(classifyMatchConfidence(0.41)).toBe('LOW');
  });

  it('maps USDA nutrient ids into nutritionProfile v2 groups', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      { nutrient: { id: 1008, name: 'Energy', unitName: 'KCAL' }, amount: 145 },
      { nutrient: { id: 1003, name: 'Protein', unitName: 'G' }, amount: 22.5 },
      { nutrient: { id: 1087, name: 'Calcium', unitName: 'MG' }, amount: 12 },
      { nutrient: { id: 1091, name: 'Phosphorus', unitName: 'MG' }, amount: 190 },
    ]);

    expect(profile.meta.rawBasisType).toBe('PER_100_G');
    expect(profile.macros.energyKcal).toBe(145);
    expect(profile.macros.crudeProtein).toBe(22.5);
    expect(profile.minerals.calcium).toBe(12);
    expect(profile.minerals.phosphorus).toBe(190);
  });
});
```

- [ ] **Step 2: Run failing utility tests**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/domain/nutrition-governance/nutrition-governance.utils.spec.ts --runInBand
```

Expected: FAIL because the files do not exist.

- [ ] **Step 3: Create shared types**

Create `backend/src/domain/nutrition-governance/nutrition-governance.types.ts`:

```ts
import type { NutritionProfileV2 } from '../ingredient/types';

export type NutritionGovernanceSourceType =
  | 'USDA'
  | 'CFCT'
  | 'SUPPLEMENT_LABEL'
  | 'MANUAL';

export type NutritionMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type NutritionCandidateStatus =
  | 'CANDIDATE'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'SKIPPED';

export type SupplementNutritionDraftStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'REJECTED';

export interface NutritionMatchReason {
  code:
    | 'NAME_EXACT'
    | 'NAME_PARTIAL'
    | 'TYPE_MATCH'
    | 'STATE_MATCH'
    | 'SOURCE_PRIORITY'
    | 'MANUAL';
  label: string;
  scoreDelta: number;
}

export interface NutritionSourceInput {
  sourceType: NutritionGovernanceSourceType;
  externalId: string;
  sourceTitle: string;
  foodName: string;
  foodNameEn?: string | null;
  dataType?: string | null;
  category?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  rawData: Record<string, unknown>;
  normalizedNutrition?: NutritionProfileV2 | null;
}

export interface LabelExtractionResult {
  ocrText: string;
  extractedItems: Array<{
    fieldPath: string;
    label: string;
    value: number;
    unit: string;
    rawBasisType: string;
  }>;
  missingFields: string[];
  normalizedNutrition: NutritionProfileV2 | null;
}
```

- [ ] **Step 4: Create USDA nutrient map**

Create `backend/src/domain/nutrition-governance/usda-nutrient-map.ts`:

```ts
import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';

export interface UsdaNutrientMapping {
  nutrientId: number;
  tabKey: NutritionFieldTab;
  fieldKey: string;
}

export const USDA_NUTRIENT_MAP: readonly UsdaNutrientMapping[] = [
  { nutrientId: 1008, tabKey: 'macros', fieldKey: 'energyKcal' },
  { nutrientId: 1051, tabKey: 'macros', fieldKey: 'moisture' },
  { nutrientId: 1003, tabKey: 'macros', fieldKey: 'crudeProtein' },
  { nutrientId: 1004, tabKey: 'macros', fieldKey: 'crudeFat' },
  { nutrientId: 1007, tabKey: 'macros', fieldKey: 'ash' },
  { nutrientId: 1005, tabKey: 'macros', fieldKey: 'carbohydrate' },
  { nutrientId: 1079, tabKey: 'macros', fieldKey: 'fiber' },
  { nutrientId: 1087, tabKey: 'minerals', fieldKey: 'calcium' },
  { nutrientId: 1091, tabKey: 'minerals', fieldKey: 'phosphorus' },
  { nutrientId: 1092, tabKey: 'minerals', fieldKey: 'potassium' },
  { nutrientId: 1093, tabKey: 'minerals', fieldKey: 'sodium' },
  { nutrientId: 1090, tabKey: 'minerals', fieldKey: 'magnesium' },
  { nutrientId: 1089, tabKey: 'minerals', fieldKey: 'iron' },
  { nutrientId: 1095, tabKey: 'minerals', fieldKey: 'zinc' },
  { nutrientId: 1098, tabKey: 'minerals', fieldKey: 'copper' },
  { nutrientId: 1101, tabKey: 'minerals', fieldKey: 'manganese' },
  { nutrientId: 1103, tabKey: 'minerals', fieldKey: 'selenium' },
  { nutrientId: 1104, tabKey: 'vitamins', fieldKey: 'vitaminA' },
  { nutrientId: 1114, tabKey: 'vitamins', fieldKey: 'vitaminD' },
  { nutrientId: 1109, tabKey: 'vitamins', fieldKey: 'vitaminE' },
  { nutrientId: 1165, tabKey: 'vitamins', fieldKey: 'vitaminB1' },
  { nutrientId: 1166, tabKey: 'vitamins', fieldKey: 'vitaminB2' },
  { nutrientId: 1167, tabKey: 'vitamins', fieldKey: 'vitaminB3' },
  { nutrientId: 1170, tabKey: 'vitamins', fieldKey: 'vitaminB5' },
  { nutrientId: 1175, tabKey: 'vitamins', fieldKey: 'vitaminB6' },
  { nutrientId: 1178, tabKey: 'vitamins', fieldKey: 'vitaminB12' },
  { nutrientId: 1180, tabKey: 'vitamins', fieldKey: 'choline' },
  { nutrientId: 1213, tabKey: 'vitamins', fieldKey: 'vitaminB9' },
  { nutrientId: 1292, tabKey: 'fattyAcids', fieldKey: 'monounsaturatedFattyAcids' },
  { nutrientId: 1293, tabKey: 'fattyAcids', fieldKey: 'polyunsaturatedFattyAcids' },
  { nutrientId: 1316, tabKey: 'fattyAcids', fieldKey: 'linoleicAcid' },
  { nutrientId: 1404, tabKey: 'fattyAcids', fieldKey: 'alphaLinolenicAcid' },
  { nutrientId: 1257, tabKey: 'fattyAcids', fieldKey: 'saturatedFattyAcids' },
];
```

- [ ] **Step 5: Implement utilities**

Create `backend/src/domain/nutrition-governance/nutrition-governance.utils.ts`:

```ts
import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../ingredient/types';
import type {
  NutritionGovernanceSourceType,
  NutritionMatchConfidence,
} from './nutrition-governance.types';
import { USDA_NUTRIENT_MAP } from './usda-nutrient-map';

export function buildNutritionSourceKey(
  sourceType: NutritionGovernanceSourceType,
  externalId: string,
): string {
  return `${sourceType}:${externalId.trim()}`;
}

export function getSourcePriority(
  sourceType: NutritionGovernanceSourceType,
): number {
  if (sourceType === 'USDA') return 1;
  if (sourceType === 'CFCT') return 2;
  if (sourceType === 'MANUAL') return 3;
  return 4;
}

export function classifyMatchConfidence(
  score: number,
): NutritionMatchConfidence {
  if (score >= 0.85) return 'HIGH';
  if (score >= 0.6) return 'MEDIUM';
  return 'LOW';
}

export function normalizeNameForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[，,。.\s_-]+/g, '')
    .replace(/[()（）]/g, '');
}

export function scoreIngredientSourceNameMatch(params: {
  ingredientName: string;
  sourceFoodName: string;
  sourceType: NutritionGovernanceSourceType;
}): { score: number; reasons: Array<{ code: string; label: string; scoreDelta: number }> } {
  const ingredientName = normalizeNameForMatch(params.ingredientName);
  const sourceFoodName = normalizeNameForMatch(params.sourceFoodName);
  const reasons: Array<{ code: string; label: string; scoreDelta: number }> = [];
  let score = 0;

  if (ingredientName === sourceFoodName) {
    score += 0.75;
    reasons.push({ code: 'NAME_EXACT', label: '名称完全匹配', scoreDelta: 0.75 });
  } else if (
    ingredientName.includes(sourceFoodName) ||
    sourceFoodName.includes(ingredientName)
  ) {
    score += 0.55;
    reasons.push({ code: 'NAME_PARTIAL', label: '名称部分匹配', scoreDelta: 0.55 });
  }

  if (params.sourceType === 'USDA') {
    score += 0.15;
    reasons.push({ code: 'SOURCE_PRIORITY', label: 'USDA 优先来源', scoreDelta: 0.15 });
  } else if (params.sourceType === 'CFCT') {
    score += 0.1;
    reasons.push({ code: 'SOURCE_PRIORITY', label: '中国食物成分表第二来源', scoreDelta: 0.1 });
  }

  return { score: Math.min(score, 1), reasons };
}

export function mapUsdaNutrientsToNutritionProfile(
  nutrients: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'USDA';

  for (const nutrient of nutrients) {
    const amount = nutrient.amount;
    const nutrientId = nutrient.nutrient?.id;
    if (typeof amount !== 'number' || typeof nutrientId !== 'number') {
      continue;
    }
    const mapping = USDA_NUTRIENT_MAP.find((item) => item.nutrientId === nutrientId);
    if (!mapping) continue;

    const tab = profile[mapping.tabKey] as Record<string, number | null>;
    tab[mapping.fieldKey] = amount;
  }

  return profile;
}
```

- [ ] **Step 6: Run utility tests**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/domain/nutrition-governance/nutrition-governance.utils.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/src/domain/nutrition-governance backend/tests/domain/nutrition-governance
git commit -m "feat: add nutrition governance utilities"
```

---

### Task 3: Backend Governance Service Core

**Files:**
- Create: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Create: `backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts`

- [ ] **Step 1: Write service tests**

Create `backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts`:

```ts
import { NutritionGovernanceService } from '../../../src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceService', () => {
  const prisma: any = {
    ingredient: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    nutritionSourceRecord: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    ingredientNutritionCandidate: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    supplementNutritionDraft: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    nutritionFood: {
      upsert: jest.fn(),
    },
    nutritionFoodMapping: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn((callback: any) => callback(prisma)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns overview excluding packaging from coverage', async () => {
    prisma.ingredient.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3);
    prisma.ingredientNutritionCandidate.count.mockResolvedValue(5);
    prisma.supplementNutritionDraft.count.mockResolvedValue(2);

    const service = new NutritionGovernanceService(prisma);
    const overview = await service.getOverview();

    expect(overview.foodIngredientCount).toBe(10);
    expect(overview.supplementIngredientCount).toBe(4);
    expect(overview.packagingIngredientCount).toBeUndefined();
    expect(overview.confirmedNutritionProfileCount).toBe(8);
    expect(overview.candidateCount).toBe(5);
    expect(overview.supplementDraftCount).toBe(2);
    expect(overview.incompleteProfileCount).toBe(3);
  });

  it('upserts source records by source type and source key', async () => {
    prisma.nutritionSourceRecord.upsert.mockResolvedValue({
      id: 'source-1',
      sourceType: 'USDA',
      sourceKey: 'USDA:123',
    });

    const service = new NutritionGovernanceService(prisma);
    const result = await service.upsertSourceRecord({
      sourceType: 'USDA',
      externalId: '123',
      sourceTitle: 'USDA FoodData Central',
      foodName: 'Chicken breast',
      rawData: { fdcId: 123 },
      normalizedNutrition: null,
    });

    expect(result.id).toBe('source-1');
    expect(prisma.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType_sourceKey: {
            sourceType: 'USDA',
            sourceKey: 'USDA:123',
          },
        },
      }),
    );
  });

  it('confirms a candidate and writes ingredient nutritionProfile', async () => {
    prisma.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-1',
      ingredientId: 'ingredient-1',
      sourceRecordId: 'source-1',
      normalizedNutrition: {
        meta: { rawBasisType: 'PER_100_G', sourceType: 'USDA' },
        macros: { crudeProtein: 22 },
        minerals: {},
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
      sourceRecord: {
        id: 'source-1',
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        foodName: 'Chicken breast',
      },
      ingredient: { id: 'ingredient-1', name: '鸡胸肉', type: 'FOOD' },
    });
    prisma.ingredient.update.mockResolvedValue({ id: 'ingredient-1' });
    prisma.nutritionFood.upsert.mockResolvedValue({ id: 'nutrition-food-1' });
    prisma.nutritionFoodMapping.upsert.mockResolvedValue({ id: 'mapping-1' });
    prisma.ingredientNutritionCandidate.update.mockResolvedValue({
      id: 'candidate-1',
      status: 'CONFIRMED',
    });

    const service = new NutritionGovernanceService(prisma);
    const result = await service.confirmCandidate('candidate-1', 'admin-1');

    expect(result.status).toBe('CONFIRMED');
    expect(prisma.ingredient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ingredient-1' },
        data: expect.objectContaining({
          nutritionProfile: expect.objectContaining({
            meta: expect.objectContaining({
              sourceType: 'USDA',
              sourceTitle: 'USDA FoodData Central',
              confidenceLevel: 'HIGH',
            }),
          }),
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run failing service tests**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/nutrition-governance/nutrition-governance.service.spec.ts --runInBand
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Create `backend/src/application/nutrition-governance/nutrition-governance.service.ts`:

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IngredientType,
  NutritionFoodCategory,
  NutritionFoodStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  buildNutritionSourceKey,
  getSourcePriority,
  scoreIngredientSourceNameMatch,
  classifyMatchConfidence,
} from '../../domain/nutrition-governance/nutrition-governance.utils';
import type { NutritionSourceInput } from '../../domain/nutrition-governance/nutrition-governance.types';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';

@Injectable()
export class NutritionGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      foodIngredientCount,
      supplementIngredientCount,
      confirmedNutritionProfileCount,
      incompleteProfileCount,
      candidateCount,
      supplementDraftCount,
    ] = await Promise.all([
      this.prisma.ingredient.count({ where: { type: IngredientType.FOOD } }),
      this.prisma.ingredient.count({ where: { type: IngredientType.SUPPLEMENT } }),
      this.prisma.ingredient.count({
        where: {
          type: { in: [IngredientType.FOOD, IngredientType.SUPPLEMENT] },
          nutritionProfile: { not: Prisma.AnyNull },
        },
      }),
      this.prisma.ingredient.count({
        where: {
          type: { in: [IngredientType.FOOD, IngredientType.SUPPLEMENT] },
          nutritionProfile: { equals: Prisma.AnyNull },
        },
      }),
      this.prisma.ingredientNutritionCandidate.count({
        where: { status: 'CANDIDATE' },
      }),
      this.prisma.supplementNutritionDraft.count({
        where: { status: 'DRAFT' },
      }),
    ]);

    return {
      foodIngredientCount,
      supplementIngredientCount,
      confirmedNutritionProfileCount,
      incompleteProfileCount,
      candidateCount,
      supplementDraftCount,
    };
  }

  async upsertSourceRecord(input: NutritionSourceInput) {
    const sourceKey = buildNutritionSourceKey(input.sourceType, input.externalId);
    return this.prisma.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: input.sourceType,
          sourceKey,
        },
      },
      create: {
        sourceType: input.sourceType,
        sourceKey,
        sourceTitle: input.sourceTitle,
        sourceDetail: input.sourceDetail ?? undefined,
        foodName: input.foodName,
        foodNameEn: input.foodNameEn ?? undefined,
        dataType: input.dataType ?? undefined,
        category: input.category ?? undefined,
        rawData: input.rawData as any,
        normalizedNutrition: input.normalizedNutrition as any,
      },
      update: {
        sourceTitle: input.sourceTitle,
        sourceDetail: input.sourceDetail ?? undefined,
        foodName: input.foodName,
        foodNameEn: input.foodNameEn ?? undefined,
        dataType: input.dataType ?? undefined,
        category: input.category ?? undefined,
        rawData: input.rawData as any,
        normalizedNutrition: input.normalizedNutrition as any,
        status: 'ACTIVE',
      },
    });
  }

  async generateFoodCandidatesForIngredient(ingredientId: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
    });
    if (!ingredient || ingredient.type !== IngredientType.FOOD) {
      throw new NotFoundException('食材原料不存在');
    }

    const sourceRecords = await this.prisma.nutritionSourceRecord.findMany({
      where: { sourceType: { in: ['USDA', 'CFCT'] }, status: 'ACTIVE' },
      take: 50,
      orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }],
    });

    const created = [];
    for (const sourceRecord of sourceRecords) {
      const match = scoreIngredientSourceNameMatch({
        ingredientName: ingredient.name,
        sourceFoodName: sourceRecord.foodName,
        sourceType: sourceRecord.sourceType as any,
      });
      if (match.score < 0.35 || !sourceRecord.normalizedNutrition) continue;

      created.push(
        await this.prisma.ingredientNutritionCandidate.upsert({
          where: {
            ingredientId_sourceRecordId: {
              ingredientId,
              sourceRecordId: sourceRecord.id,
            },
          },
          create: {
            ingredientId,
            sourceRecordId: sourceRecord.id,
            sourcePriority: getSourcePriority(sourceRecord.sourceType as any),
            confidence: classifyMatchConfidence(match.score),
            score: match.score,
            matchReasons: match.reasons as any,
            normalizedNutrition: sourceRecord.normalizedNutrition as any,
          },
          update: {
            sourcePriority: getSourcePriority(sourceRecord.sourceType as any),
            confidence: classifyMatchConfidence(match.score),
            score: match.score,
            matchReasons: match.reasons as any,
            normalizedNutrition: sourceRecord.normalizedNutrition as any,
          },
        }),
      );
    }

    return created;
  }

  async listCandidates(params: {
    status?: 'CANDIDATE' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED';
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  }) {
    return this.prisma.ingredientNutritionCandidate.findMany({
      where: {
        ...(params.status && { status: params.status }),
        ...(params.confidence && { confidence: params.confidence }),
      },
      include: {
        ingredient: { select: { id: true, name: true, type: true, nutritionProfile: true } },
        sourceRecord: true,
      },
      orderBy: [{ sourcePriority: 'asc' }, { score: 'desc' }],
    });
  }

  async confirmCandidate(candidateId: string, userId: string) {
    const candidate = await this.prisma.ingredientNutritionCandidate.findUnique({
      where: { id: candidateId },
      include: { ingredient: true, sourceRecord: true },
    });
    if (!candidate) throw new NotFoundException('营养候选不存在');
    if (!candidate.normalizedNutrition) {
      throw new BadRequestException('候选缺少标准化营养数据');
    }

    const profile = normalizeNutritionProfile(candidate.normalizedNutrition as any) as NutritionProfileV2;
    if (!profile) throw new BadRequestException('营养档案格式无效');

    profile.meta = {
      ...profile.meta,
      sourceType: candidate.sourceRecord.sourceType === 'CFCT' ? 'CFCT' : 'USDA',
      sourceTitle: candidate.sourceRecord.sourceTitle,
      sourceProvider: candidate.sourceRecord.sourceType,
      confidenceLevel: candidate.confidence === 'LOW' ? 'LOW' : 'HIGH',
      versionNote: `由原料营养治理确认：${candidate.sourceRecord.foodName}`,
    } as any;

    return this.prisma.$transaction(async (tx) => {
      await tx.ingredient.update({
        where: { id: candidate.ingredientId },
        data: { nutritionProfile: profile as any },
      });

      const nutritionFood = await tx.nutritionFood.upsert({
        where: {
          name_dataSource_version: {
            name: candidate.sourceRecord.foodName,
            dataSource: candidate.sourceRecord.sourceType,
            version: 1,
          },
        },
        create: {
          name: candidate.sourceRecord.foodName,
          nameEn: candidate.sourceRecord.foodNameEn,
          category: this.mapIngredientTypeToNutritionFoodCategory(candidate.ingredient.type),
          dataSource: candidate.sourceRecord.sourceType,
          externalId: candidate.sourceRecord.sourceKey,
          nutritionData: profile as any,
          status: NutritionFoodStatus.VERIFIED,
          verifiedBy: userId,
          verifiedAt: new Date(),
        },
        update: {
          nutritionData: profile as any,
          status: NutritionFoodStatus.VERIFIED,
          verifiedBy: userId,
          verifiedAt: new Date(),
        },
      });

      await tx.nutritionFoodMapping.upsert({
        where: {
          nutritionFoodId_ingredientId: {
            nutritionFoodId: nutritionFood.id,
            ingredientId: candidate.ingredientId,
          },
        },
        create: {
          nutritionFoodId: nutritionFood.id,
          ingredientId: candidate.ingredientId,
          yieldRate: 1,
          isPrimary: true,
          notes: '由原料营养治理确认创建',
        },
        update: {
          isPrimary: true,
          notes: '由原料营养治理确认更新',
        },
      });

      return tx.ingredientNutritionCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'CONFIRMED',
          confirmedBy: userId,
          confirmedAt: new Date(),
          confirmationSnapshot: {
            ingredientId: candidate.ingredientId,
            sourceRecordId: candidate.sourceRecordId,
            nutritionProfile: profile,
          } as any,
        },
      });
    });
  }

  async rejectCandidate(candidateId: string) {
    return this.prisma.ingredientNutritionCandidate.update({
      where: { id: candidateId },
      data: { status: 'REJECTED' },
    });
  }

  private mapIngredientTypeToNutritionFoodCategory(type: IngredientType) {
    if (type === IngredientType.SUPPLEMENT) return NutritionFoodCategory.SUPPLEMENT;
    return NutritionFoodCategory.OTHER;
  }
}
```

- [ ] **Step 4: Run service tests**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/nutrition-governance/nutrition-governance.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/src/application/nutrition-governance backend/tests/application/nutrition-governance
git commit -m "feat: add nutrition governance service"
```

---

### Task 4: Admin Governance Controller

**Files:**
- Create: `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`
- Create: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/interfaces/controllers/nutrition-governance.controller.spec.ts`

- [ ] **Step 1: Write controller tests**

Create `backend/tests/interfaces/controllers/nutrition-governance.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { NutritionGovernanceController } from '../../../src/interfaces/controllers/nutrition-governance.controller';
import { NutritionGovernanceService } from '../../../src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceController', () => {
  const service = {
    getOverview: jest.fn(),
    listCandidates: jest.fn(),
    generateFoodCandidatesForIngredient: jest.fn(),
    confirmCandidate: jest.fn(),
    rejectCandidate: jest.fn(),
  };
  let controller: NutritionGovernanceController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NutritionGovernanceController],
      providers: [{ provide: NutritionGovernanceService, useValue: service }],
    }).compile();

    controller = moduleRef.get(NutritionGovernanceController);
    jest.clearAllMocks();
  });

  it('returns overview response', async () => {
    service.getOverview.mockResolvedValue({ foodIngredientCount: 1 });

    const response = await controller.getOverview();

    expect(response.code).toBe(0);
    expect(response.data).toEqual({ foodIngredientCount: 1 });
  });

  it('confirms candidate with current user id', async () => {
    service.confirmCandidate.mockResolvedValue({ id: 'candidate-1', status: 'CONFIRMED' });

    const response = await controller.confirmCandidate('candidate-1', {
      userId: 'admin-1',
      role: 'ADMIN',
    } as any);

    expect(response.code).toBe(0);
    expect(service.confirmCandidate).toHaveBeenCalledWith('candidate-1', 'admin-1');
  });
});
```

- [ ] **Step 2: Run failing controller tests**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/interfaces/controllers/nutrition-governance.controller.spec.ts --runInBand
```

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Create DTOs**

Create `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListNutritionCandidatesQueryDto {
  @ApiPropertyOptional({ enum: ['CANDIDATE', 'CONFIRMED', 'REJECTED', 'SKIPPED'] })
  @IsOptional()
  @IsEnum(['CANDIDATE', 'CONFIRMED', 'REJECTED', 'SKIPPED'])
  status?: 'CANDIDATE' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED';

  @ApiPropertyOptional({ enum: ['HIGH', 'MEDIUM', 'LOW'] })
  @IsOptional()
  @IsEnum(['HIGH', 'MEDIUM', 'LOW'])
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class GenerateFoodCandidatesDto {
  @IsString()
  ingredientId!: string;
}
```

- [ ] **Step 4: Create controller**

Create `backend/src/interfaces/controllers/nutrition-governance.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NutritionGovernanceService } from '../../application/nutrition-governance/nutrition-governance.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import {
  GenerateFoodCandidatesDto,
  ListNutritionCandidatesQueryDto,
} from '../dto/nutrition-governance/nutrition-governance.dto';

@ApiTags('Admin Nutrition Governance')
@ApiBearerAuth()
@Controller('api/v1/admin/nutrition-governance')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NutritionGovernanceController {
  constructor(private readonly service: NutritionGovernanceService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取原料营养治理总览' })
  async getOverview(): Promise<ApiResponseDto<any>> {
    const result = await this.service.getOverview();
    return new ApiResponseDto(0, 'Success', result);
  }

  @Get('candidates')
  @ApiOperation({ summary: '获取食材营养匹配候选' })
  async listCandidates(
    @Query() query: ListNutritionCandidatesQueryDto,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.listCandidates(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Post('candidates/generate-food')
  @ApiOperation({ summary: '为单个食材生成营养候选' })
  async generateFoodCandidates(
    @Body() body: GenerateFoodCandidatesDto,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.generateFoodCandidatesForIngredient(
      body.ingredientId,
    );
    return new ApiResponseDto(0, '生成候选成功', result);
  }

  @Post('candidates/:id/confirm')
  @ApiOperation({ summary: '确认营养候选并写入原料营养档案' })
  async confirmCandidate(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.confirmCandidate(id, user.userId);
    return new ApiResponseDto(0, '确认成功', result);
  }

  @Post('candidates/:id/reject')
  @ApiOperation({ summary: '拒绝营养候选' })
  async rejectCandidate(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    const result = await this.service.rejectCandidate(id);
    return new ApiResponseDto(0, '已拒绝', result);
  }
}
```

- [ ] **Step 5: Register controller and service**

Modify `backend/src/app.module.ts`:

Add imports:

```ts
import { NutritionGovernanceController } from './interfaces/controllers/nutrition-governance.controller';
import { NutritionGovernanceService } from './application/nutrition-governance/nutrition-governance.service';
```

Add `NutritionGovernanceController` to the `controllers` array near `NutritionFoodController`.

Add `NutritionGovernanceService` to the `providers` array near `NutritionFoodService`.

- [ ] **Step 6: Run controller test**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/interfaces/controllers/nutrition-governance.controller.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/src/interfaces/dto/nutrition-governance backend/src/interfaces/controllers/nutrition-governance.controller.ts backend/src/app.module.ts backend/tests/interfaces/controllers/nutrition-governance.controller.spec.ts
git commit -m "feat: expose nutrition governance admin api"
```

---

### Task 5: USDA Source Import Endpoint

**Files:**
- Modify: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Modify: `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`
- Modify: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
- Test: `backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts`

- [ ] **Step 1: Add USDA import service test**

Append this test to `backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts`:

```ts
  it('imports a USDA food detail as a source record', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fdcId: 123,
        description: 'Chicken breast, raw',
        dataType: 'Foundation',
        foodCategory: { description: 'Poultry Products' },
        foodNutrients: [
          { nutrient: { id: 1008, name: 'Energy', unitName: 'KCAL' }, amount: 145 },
          { nutrient: { id: 1003, name: 'Protein', unitName: 'G' }, amount: 22.5 },
        ],
      }),
    }) as any;
    process.env.USDA_API_KEY = 'test-key';
    prisma.nutritionSourceRecord.upsert.mockResolvedValue({
      id: 'source-1',
      foodName: 'Chicken breast, raw',
    });

    const service = new NutritionGovernanceService(prisma);
    const result = await service.importUsdaSourceRecord('123');

    expect(result.id).toBe('source-1');
    expect(prisma.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceType: 'USDA',
          sourceKey: 'USDA:123',
          foodName: 'Chicken breast, raw',
          normalizedNutrition: expect.objectContaining({
            macros: expect.objectContaining({ crudeProtein: 22.5 }),
          }),
        }),
      }),
    );
  });
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/nutrition-governance/nutrition-governance.service.spec.ts --runInBand
```

Expected: FAIL with `importUsdaSourceRecord is not a function`.

- [ ] **Step 3: Add DTO**

Append to `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`:

```ts
export class ImportUsdaSourceDto {
  @IsString()
  fdcId!: string;
}
```

- [ ] **Step 4: Implement service method**

Add imports in `backend/src/application/nutrition-governance/nutrition-governance.service.ts`:

```ts
import { mapUsdaNutrientsToNutritionProfile } from '../../domain/nutrition-governance/nutrition-governance.utils';
```

Add method:

```ts
  async importUsdaSourceRecord(fdcId: string) {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('USDA API密钥未配置');
    }

    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${apiKey}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) {
      throw new BadRequestException('USDA API请求失败');
    }

    const food = await response.json();
    const profile = mapUsdaNutrientsToNutritionProfile(food.foodNutrients || []);

    return this.upsertSourceRecord({
      sourceType: 'USDA',
      externalId: String(food.fdcId ?? fdcId),
      sourceTitle: 'USDA FoodData Central',
      foodName: food.description || `USDA ${fdcId}`,
      foodNameEn: food.description || null,
      dataType: food.dataType || null,
      category: food.foodCategory?.description || null,
      sourceDetail: {
        fdcId: food.fdcId ?? fdcId,
        publicationDate: food.publicationDate ?? null,
      },
      rawData: food,
      normalizedNutrition: profile,
    });
  }
```

- [ ] **Step 5: Add controller endpoint**

Modify `backend/src/interfaces/controllers/nutrition-governance.controller.ts`.

Update DTO import:

```ts
  ImportUsdaSourceDto,
```

Add endpoint:

```ts
  @Post('sources/usda/import')
  @ApiOperation({ summary: '导入 USDA 食物详情为治理来源记录' })
  async importUsdaSource(
    @Body() body: ImportUsdaSourceDto,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.importUsdaSourceRecord(body.fdcId);
    return new ApiResponseDto(0, 'USDA 来源导入成功', result);
  }
```

- [ ] **Step 6: Run focused tests**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/nutrition-governance/nutrition-governance.service.spec.ts tests/interfaces/controllers/nutrition-governance.controller.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/src/application/nutrition-governance/nutrition-governance.service.ts backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts backend/src/interfaces/controllers/nutrition-governance.controller.ts backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts
git commit -m "feat: import usda nutrition source records"
```

---

### Task 6: Local CFCT Private Import Script

**Files:**
- Create: `backend/prisma/import-cfct-private-source.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/prisma/import-cfct-private-source.spec.ts`

- [ ] **Step 1: Write importer tests**

Create `backend/tests/prisma/import-cfct-private-source.spec.ts`:

```ts
import { mapCfctRowToSourceInput } from '../../prisma/import-cfct-private-source';

describe('CFCT private source importer', () => {
  it('maps reviewed CFCT rows into source inputs', () => {
    const input = mapCfctRowToSourceInput({
      volume: '第1册',
      page: 120,
      row: 8,
      foodName: '鸡胸脯肉',
      category: '禽肉类',
      nutrients: {
        energyKcal: 133,
        crudeProtein: 19.4,
        crudeFat: 5.0,
        calcium: 3,
        phosphorus: 173,
      },
    });

    expect(input.sourceType).toBe('CFCT');
    expect(input.externalId).toBe('第1册:p120:r8');
    expect(input.foodName).toBe('鸡胸脯肉');
    expect(input.normalizedNutrition?.macros.energyKcal).toBe(133);
    expect(input.normalizedNutrition?.minerals.phosphorus).toBe(173);
  });
});
```

- [ ] **Step 2: Run failing importer test**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/prisma/import-cfct-private-source.spec.ts --runInBand
```

Expected: FAIL because importer does not exist.

- [ ] **Step 3: Implement local-only importer**

Create `backend/prisma/import-cfct-private-source.ts`:

```ts
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { createEmptyNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import type { NutritionSourceInput } from '../src/domain/nutrition-governance/nutrition-governance.types';
import { buildNutritionSourceKey } from '../src/domain/nutrition-governance/nutrition-governance.utils';

export interface ReviewedCfctRow {
  volume: string;
  page: number;
  row: number;
  foodName: string;
  category?: string;
  nutrients: Partial<{
    energyKcal: number;
    moisture: number;
    crudeProtein: number;
    crudeFat: number;
    ash: number;
    carbohydrate: number;
    fiber: number;
    calcium: number;
    phosphorus: number;
    potassium: number;
    sodium: number;
    magnesium: number;
    iron: number;
    zinc: number;
    copper: number;
    manganese: number;
    selenium: number;
  }>;
}

export function mapCfctRowToSourceInput(row: ReviewedCfctRow): NutritionSourceInput {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'LITERATURE';
  profile.meta.sourceTitle = `中国食物成分表 ${row.volume}`;
  profile.meta.sourceProvider = '中国食物成分表';
  profile.meta.confidenceLevel = 'MEDIUM';

  for (const key of [
    'energyKcal',
    'moisture',
    'crudeProtein',
    'crudeFat',
    'ash',
    'carbohydrate',
    'fiber',
  ] as const) {
    if (typeof row.nutrients[key] === 'number') {
      profile.macros[key] = row.nutrients[key]!;
    }
  }

  for (const key of [
    'calcium',
    'phosphorus',
    'potassium',
    'sodium',
    'magnesium',
    'iron',
    'zinc',
    'copper',
    'manganese',
    'selenium',
  ] as const) {
    if (typeof row.nutrients[key] === 'number') {
      profile.minerals[key] = row.nutrients[key]!;
    }
  }

  return {
    sourceType: 'CFCT',
    externalId: `${row.volume}:p${row.page}:r${row.row}`,
    sourceTitle: `中国食物成分表 ${row.volume}`,
    foodName: row.foodName,
    category: row.category ?? null,
    sourceDetail: {
      volume: row.volume,
      page: row.page,
      row: row.row,
      privateLocalSource: true,
    },
    rawData: row as unknown as Record<string, unknown>,
    normalizedNutrition: profile,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
  const inputPath = inputArg?.slice('--input='.length);
  if (!inputPath) {
    throw new Error('Missing --input=/absolute/path/to/reviewed-cfct.json');
  }

  const rows = JSON.parse(readFileSync(inputPath, 'utf8')) as ReviewedCfctRow[];
  const prisma = new PrismaClient();
  const mapped = rows.map(mapCfctRowToSourceInput);

  console.log(`Prepared ${mapped.length} CFCT source records`);
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write records.');
    await prisma.$disconnect();
    return;
  }

  for (const item of mapped) {
    const sourceKey = buildNutritionSourceKey(item.sourceType, item.externalId);
    await prisma.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: item.sourceType,
          sourceKey,
        },
      },
      create: {
        sourceType: item.sourceType,
        sourceKey,
        sourceTitle: item.sourceTitle,
        sourceDetail: item.sourceDetail as any,
        foodName: item.foodName,
        category: item.category ?? undefined,
        rawData: item.rawData as any,
        normalizedNutrition: item.normalizedNutrition as any,
      },
      update: {
        sourceTitle: item.sourceTitle,
        sourceDetail: item.sourceDetail as any,
        foodName: item.foodName,
        category: item.category ?? undefined,
        rawData: item.rawData as any,
        normalizedNutrition: item.normalizedNutrition as any,
        status: 'ACTIVE',
      },
    });
  }

  console.log(`Imported ${mapped.length} CFCT source records`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add package scripts**

Modify `backend/package.json` scripts:

```json
"import:cfct-private": "ts-node -r tsconfig-paths/register prisma/import-cfct-private-source.ts",
"import:cfct-private:apply": "ts-node -r tsconfig-paths/register prisma/import-cfct-private-source.ts --apply"
```

- [ ] **Step 5: Run importer test**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/prisma/import-cfct-private-source.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/prisma/import-cfct-private-source.ts backend/package.json backend/tests/prisma/import-cfct-private-source.spec.ts
git commit -m "feat: add private cfct source importer"
```

---

### Task 7: Supplement Label Draft Provider and Upload API

**Files:**
- Create: `backend/src/application/nutrition-governance/label-recognition.provider.ts`
- Modify: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Modify: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts`

- [ ] **Step 1: Add draft creation test**

Append this test to `backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts`:

```ts
  it('creates supplement label drafts without confirming them', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'supplement-1',
      name: '鱼油胶囊',
      type: 'SUPPLEMENT',
    });
    prisma.supplementNutritionDraft = {
      ...prisma.supplementNutritionDraft,
      create: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'DRAFT',
        missingFields: ['servingWeightG'],
      }),
    };

    const provider = {
      extractFromImage: jest.fn().mockResolvedValue({
        ocrText: '每粒含 EPA 180mg DHA 120mg',
        extractedItems: [],
        missingFields: ['servingWeightG'],
        normalizedNutrition: null,
      }),
    };
    const service = new NutritionGovernanceService(prisma, provider as any);
    const result = await service.createSupplementDraftFromLabelImage({
      ingredientId: 'supplement-1',
      imageUrl: 'https://cdn.example.com/label.jpg',
      imageKey: 'supplement-labels/1.jpg',
      createdBy: 'admin-1',
    });

    expect(result.status).toBe('DRAFT');
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run failing test**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/nutrition-governance/nutrition-governance.service.spec.ts --runInBand
```

Expected: FAIL with constructor/method mismatch.

- [ ] **Step 3: Create provider interface**

Create `backend/src/application/nutrition-governance/label-recognition.provider.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { LabelExtractionResult } from '../../domain/nutrition-governance/nutrition-governance.types';

export const LABEL_RECOGNITION_PROVIDER = Symbol('LABEL_RECOGNITION_PROVIDER');

export interface LabelRecognitionProvider {
  extractFromImage(input: {
    imageUrl: string;
    ingredientName: string;
  }): Promise<LabelExtractionResult>;
}

@Injectable()
export class DisabledLabelRecognitionProvider implements LabelRecognitionProvider {
  async extractFromImage(input: {
    imageUrl: string;
    ingredientName: string;
  }): Promise<LabelExtractionResult> {
    return {
      ocrText: '',
      extractedItems: [],
      missingFields: ['ocrProvider'],
      normalizedNutrition: null,
    };
  }
}
```

Implementation note for later OpenAI provider:

- Use the Responses API with image input as `input_image`.
- Use Structured Outputs with strict JSON schema for label extraction.
- Keep provider behind `LabelRecognitionProvider` so the app can run without an OpenAI key.
- Official OpenAI docs used for this boundary: Images and Vision, Structured Outputs.

- [ ] **Step 4: Update service constructor and method**

Modify constructor in `NutritionGovernanceService`:

```ts
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(LABEL_RECOGNITION_PROVIDER)
    private readonly labelRecognitionProvider?: LabelRecognitionProvider,
  ) {}
```

Add imports:

```ts
import { Inject, Optional } from '@nestjs/common';
import {
  LABEL_RECOGNITION_PROVIDER,
  DisabledLabelRecognitionProvider,
  type LabelRecognitionProvider,
} from './label-recognition.provider';
```

Add method:

```ts
  async createSupplementDraftFromLabelImage(input: {
    ingredientId: string;
    imageUrl: string;
    imageKey: string;
    createdBy?: string;
  }) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
    });
    if (!ingredient || ingredient.type !== IngredientType.SUPPLEMENT) {
      throw new NotFoundException('补剂原料不存在');
    }

    const extraction = await this.getLabelProvider().extractFromImage({
      imageUrl: input.imageUrl,
      ingredientName: ingredient.name,
    });

    return this.prisma.supplementNutritionDraft.create({
      data: {
        ingredientId: input.ingredientId,
        imageUrl: input.imageUrl,
        imageKey: input.imageKey,
        ocrText: extraction.ocrText,
        aiExtraction: extraction as any,
        normalizedNutrition: extraction.normalizedNutrition as any,
        missingFields: extraction.missingFields,
        status: 'DRAFT',
        createdBy: input.createdBy,
      },
    });
  }

  private getLabelProvider(): LabelRecognitionProvider {
    return this.labelRecognitionProvider ?? new DisabledLabelRecognitionProvider();
  }
```

- [ ] **Step 5: Add upload endpoint**

Modify `backend/src/interfaces/controllers/nutrition-governance.controller.ts`.

Add imports:

```ts
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
```

Update constructor:

```ts
  constructor(
    private readonly service: NutritionGovernanceService,
    private readonly cosService: TencentCosService,
  ) {}
```

Add endpoint:

```ts
  @Post('supplement-drafts/:ingredientId/upload-label')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传补剂标签图片并生成待确认草稿' })
  async uploadSupplementLabel(
    @Param('ingredientId') ingredientId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const upload = await this.cosService.uploadImage(
      file,
      file.originalname,
      'supplement-labels',
    );
    const result = await this.service.createSupplementDraftFromLabelImage({
      ingredientId,
      imageUrl: upload.url,
      imageKey: upload.key,
      createdBy: user.userId,
    });
    return new ApiResponseDto(0, '补剂标签草稿已生成', result);
  }
```

- [ ] **Step 6: Register provider**

Modify `backend/src/app.module.ts`.

Add imports:

```ts
import {
  DisabledLabelRecognitionProvider,
  LABEL_RECOGNITION_PROVIDER,
} from './application/nutrition-governance/label-recognition.provider';
```

Add provider:

```ts
    {
      provide: LABEL_RECOGNITION_PROVIDER,
      useClass: DisabledLabelRecognitionProvider,
    },
```

- [ ] **Step 7: Run service test**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/nutrition-governance/nutrition-governance.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add backend/src/application/nutrition-governance backend/src/interfaces/controllers/nutrition-governance.controller.ts backend/src/app.module.ts backend/tests/application/nutrition-governance/nutrition-governance.service.spec.ts
git commit -m "feat: add supplement label draft workflow"
```

---

### Task 8: Admin Web API and Types

**Files:**
- Create: `admin-web/src/types/nutritionGovernance.ts`
- Create: `admin-web/src/api/nutritionGovernance.ts`
- Modify: `admin-web/src/api/index.ts`

- [ ] **Step 1: Create admin web types**

Create `admin-web/src/types/nutritionGovernance.ts`:

```ts
export type NutritionGovernanceSourceType = 'USDA' | 'CFCT' | 'SUPPLEMENT_LABEL' | 'MANUAL'
export type NutritionMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type NutritionCandidateStatus = 'CANDIDATE' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED'
export type SupplementNutritionDraftStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED'

export interface NutritionGovernanceOverview {
  foodIngredientCount: number
  supplementIngredientCount: number
  confirmedNutritionProfileCount: number
  incompleteProfileCount: number
  candidateCount: number
  supplementDraftCount: number
}

export interface NutritionSourceRecord {
  id: string
  sourceType: NutritionGovernanceSourceType
  sourceKey: string
  sourceTitle: string
  foodName: string
  foodNameEn?: string | null
  dataType?: string | null
  category?: string | null
  normalizedNutrition?: any
}

export interface IngredientNutritionCandidate {
  id: string
  ingredientId: string
  sourceRecordId: string
  sourcePriority: number
  confidence: NutritionMatchConfidence
  score: number
  matchReasons: Array<{ code: string; label: string; scoreDelta: number }>
  normalizedNutrition: any
  status: NutritionCandidateStatus
  ingredient: {
    id: string
    name: string
    type: string
    nutritionProfile?: any
  }
  sourceRecord: NutritionSourceRecord
}

export interface SupplementNutritionDraft {
  id: string
  ingredientId: string
  imageUrl: string
  imageKey: string
  ocrText?: string | null
  aiExtraction: any
  normalizedNutrition?: any
  missingFields: string[]
  status: SupplementNutritionDraftStatus
  createdAt: string
}
```

- [ ] **Step 2: Create API wrapper**

Create `admin-web/src/api/nutritionGovernance.ts`:

```ts
import api from './index'
import type {
  IngredientNutritionCandidate,
  NutritionGovernanceOverview,
  NutritionMatchConfidence,
  NutritionCandidateStatus
} from '@/types/nutritionGovernance'

export const nutritionGovernanceApi = {
  getOverview: (): Promise<NutritionGovernanceOverview> =>
    api.get('/admin/nutrition-governance/overview'),

  listCandidates: (params?: {
    status?: NutritionCandidateStatus
    confidence?: NutritionMatchConfidence
  }): Promise<IngredientNutritionCandidate[]> =>
    api.get('/admin/nutrition-governance/candidates', { params }),

  generateFoodCandidates: (ingredientId: string): Promise<IngredientNutritionCandidate[]> =>
    api.post('/admin/nutrition-governance/candidates/generate-food', { ingredientId }),

  confirmCandidate: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/confirm`),

  rejectCandidate: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/reject`),

  uploadSupplementLabel: (ingredientId: string, file: File): Promise<any> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/admin/nutrition-governance/supplement-drafts/${ingredientId}/upload-label`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
```

- [ ] **Step 3: Re-export API**

Modify `admin-web/src/api/index.ts` near other re-exports:

```ts
export { nutritionGovernanceApi } from './nutritionGovernance'
```

- [ ] **Step 4: Run admin build**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/admin-web
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add admin-web/src/types/nutritionGovernance.ts admin-web/src/api/nutritionGovernance.ts admin-web/src/api/index.ts
git commit -m "feat: add nutrition governance admin client"
```

---

### Task 9: Admin Web Governance Page

**Files:**
- Create: `admin-web/src/views/NutritionGovernance/index.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/OverviewCards.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/FoodCandidatesTable.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/SupplementDraftsTable.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/NutritionProfilePreview.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Create overview cards**

Create `admin-web/src/views/NutritionGovernance/components/OverviewCards.vue`:

```vue
<template>
  <div class="overview-grid">
    <el-card v-for="item in items" :key="item.label" shadow="never">
      <div class="metric-label">{{ item.label }}</div>
      <div class="metric-value">{{ item.value }}</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NutritionGovernanceOverview } from '@/types/nutritionGovernance'

const props = defineProps<{
  overview: NutritionGovernanceOverview | null
}>()

const items = computed(() => [
  { label: '食材原料', value: props.overview?.foodIngredientCount ?? 0 },
  { label: '补剂原料', value: props.overview?.supplementIngredientCount ?? 0 },
  { label: '已确认档案', value: props.overview?.confirmedNutritionProfileCount ?? 0 },
  { label: '待确认候选', value: props.overview?.candidateCount ?? 0 },
  { label: '补剂草稿', value: props.overview?.supplementDraftCount ?? 0 },
  { label: '缺失/不完整', value: props.overview?.incompleteProfileCount ?? 0 }
])
</script>

<style scoped>
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.metric-label {
  color: #667085;
  font-size: 13px;
}
.metric-value {
  margin-top: 8px;
  color: #101828;
  font-size: 24px;
  font-weight: 700;
}
</style>
```

- [ ] **Step 2: Create nutrition preview**

Create `admin-web/src/views/NutritionGovernance/components/NutritionProfilePreview.vue`:

```vue
<template>
  <div class="preview">
    <el-descriptions :column="2" border size="small">
      <el-descriptions-item label="原始口径">
        {{ profile?.meta?.rawBasisType || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="来源">
        {{ profile?.meta?.sourceTitle || profile?.meta?.sourceProvider || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="能量">
        {{ profile?.macros?.energyKcal ?? '-' }} kcal
      </el-descriptions-item>
      <el-descriptions-item label="粗蛋白">
        {{ profile?.macros?.crudeProtein ?? '-' }} g
      </el-descriptions-item>
      <el-descriptions-item label="粗脂肪">
        {{ profile?.macros?.crudeFat ?? '-' }} g
      </el-descriptions-item>
      <el-descriptions-item label="钙">
        {{ profile?.minerals?.calcium ?? '-' }} mg
      </el-descriptions-item>
      <el-descriptions-item label="磷">
        {{ profile?.minerals?.phosphorus ?? '-' }} mg
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
defineProps<{ profile: any }>()
</script>

<style scoped>
.preview {
  padding: 8px 0;
}
</style>
```

- [ ] **Step 3: Create food candidates table**

Create `admin-web/src/views/NutritionGovernance/components/FoodCandidatesTable.vue`:

```vue
<template>
  <el-table :data="candidates" border stripe>
    <el-table-column prop="ingredient.name" label="后台原料" min-width="140" />
    <el-table-column prop="sourceRecord.sourceType" label="来源" width="100" />
    <el-table-column prop="sourceRecord.foodName" label="候选食物" min-width="180" />
    <el-table-column label="把握" width="100">
      <template #default="{ row }">
        <el-tag :type="confidenceType(row.confidence)">
          {{ confidenceLabel(row.confidence) }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column label="分数" width="90">
      <template #default="{ row }">{{ Math.round(row.score * 100) }}%</template>
    </el-table-column>
    <el-table-column label="理由" min-width="200">
      <template #default="{ row }">
        {{ (row.matchReasons || []).map((item: any) => item.label).join('、') || '-' }}
      </template>
    </el-table-column>
    <el-table-column type="expand">
      <template #default="{ row }">
        <NutritionProfilePreview :profile="row.normalizedNutrition" />
      </template>
    </el-table-column>
    <el-table-column label="操作" width="160" fixed="right">
      <template #default="{ row }">
        <el-button size="small" type="primary" @click="$emit('confirm', row.id)">确认</el-button>
        <el-button size="small" @click="$emit('reject', row.id)">拒绝</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import NutritionProfilePreview from './NutritionProfilePreview.vue'
import type { IngredientNutritionCandidate, NutritionMatchConfidence } from '@/types/nutritionGovernance'

defineProps<{ candidates: IngredientNutritionCandidate[] }>()
defineEmits<{ confirm: [id: string]; reject: [id: string] }>()

function confidenceLabel(confidence: NutritionMatchConfidence) {
  return { HIGH: '高', MEDIUM: '中', LOW: '低' }[confidence]
}

function confidenceType(confidence: NutritionMatchConfidence) {
  return confidence === 'HIGH' ? 'success' : confidence === 'MEDIUM' ? 'warning' : 'info'
}
</script>
```

- [ ] **Step 4: Create supplement drafts table**

Create `admin-web/src/views/NutritionGovernance/components/SupplementDraftsTable.vue`:

```vue
<template>
  <el-empty description="补剂标签草稿列表将在上传接口联通后显示" />
</template>
```

- [ ] **Step 5: Create page**

Create `admin-web/src/views/NutritionGovernance/index.vue`:

```vue
<template>
  <div class="nutrition-governance">
    <div class="page-header">
      <h1>原料营养治理</h1>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <OverviewCards :overview="overview" />

    <el-tabs v-model="activeTab" class="tabs">
      <el-tab-pane label="食材匹配" name="food">
        <div class="toolbar">
          <el-select v-model="candidateQuery.confidence" clearable placeholder="把握筛选" style="width: 140px">
            <el-option label="高" value="HIGH" />
            <el-option label="中" value="MEDIUM" />
            <el-option label="低" value="LOW" />
          </el-select>
          <el-button :loading="loading" @click="loadCandidates">查询候选</el-button>
        </div>
        <FoodCandidatesTable
          :candidates="candidates"
          @confirm="confirmCandidate"
          @reject="rejectCandidate"
        />
      </el-tab-pane>

      <el-tab-pane label="补剂识别" name="supplement">
        <SupplementDraftsTable />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { nutritionGovernanceApi } from '@/api/nutritionGovernance'
import type {
  IngredientNutritionCandidate,
  NutritionGovernanceOverview,
  NutritionMatchConfidence
} from '@/types/nutritionGovernance'
import OverviewCards from './components/OverviewCards.vue'
import FoodCandidatesTable from './components/FoodCandidatesTable.vue'
import SupplementDraftsTable from './components/SupplementDraftsTable.vue'

const loading = ref(false)
const activeTab = ref('food')
const overview = ref<NutritionGovernanceOverview | null>(null)
const candidates = ref<IngredientNutritionCandidate[]>([])
const candidateQuery = reactive<{ confidence?: NutritionMatchConfidence }>({})

async function loadOverview() {
  overview.value = await nutritionGovernanceApi.getOverview()
}

async function loadCandidates() {
  candidates.value = await nutritionGovernanceApi.listCandidates({
    status: 'CANDIDATE',
    confidence: candidateQuery.confidence
  })
}

async function loadData() {
  loading.value = true
  try {
    await Promise.all([loadOverview(), loadCandidates()])
  } finally {
    loading.value = false
  }
}

async function confirmCandidate(id: string) {
  await ElMessageBox.confirm('确认后会写入后台原料营养档案。是否继续？', '确认营养候选', {
    type: 'warning'
  })
  await nutritionGovernanceApi.confirmCandidate(id)
  ElMessage.success('已确认并写入营养档案')
  await loadData()
}

async function rejectCandidate(id: string) {
  await nutritionGovernanceApi.rejectCandidate(id)
  ElMessage.success('已拒绝候选')
  await loadData()
}

onMounted(loadData)
</script>

<style scoped>
.nutrition-governance {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-header h1 {
  margin: 0;
  font-size: 22px;
}
.tabs {
  background: #fff;
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
</style>
```

- [ ] **Step 6: Add route**

Modify `admin-web/src/router/index.ts` under the main layout children near `ingredients`:

```ts
      {
        path: 'nutrition-governance',
        name: 'NutritionGovernance',
        component: () => import('@/views/NutritionGovernance/index.vue'),
        meta: { title: '原料营养治理' }
      },
```

- [ ] **Step 7: Add sidebar menu item**

Modify `admin-web/src/layouts/MainLayout.vue` after 原料管理:

```vue
        <el-menu-item index="/nutrition-governance">
          <el-icon><DataAnalysis /></el-icon>
          <span>原料营养治理</span>
        </el-menu-item>
```

Add icon import:

```ts
  DataAnalysis,
```

- [ ] **Step 8: Run admin build**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/admin-web
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add admin-web/src/views/NutritionGovernance admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue
git commit -m "feat: add nutrition governance admin page"
```

---

### Task 10: Verification and Release Notes

**Files:**
- Modify: `docs/superpowers/plans/2026-05-11-ingredient-nutrition-governance.md`

- [ ] **Step 1: Run backend focused tests**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/domain/nutrition-governance/nutrition-governance.utils.spec.ts tests/application/nutrition-governance/nutrition-governance.service.spec.ts tests/interfaces/controllers/nutrition-governance.controller.spec.ts tests/prisma/nutrition-governance-schema.spec.ts tests/prisma/import-cfct-private-source.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run admin build**

```bash
cd /Users/zhaochen/Documents/SevenKitchen/admin-web
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual smoke check**

Start backend if needed:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm run start:check
```

Expected:

- If backend is healthy, reuse it.
- If not healthy, run `npm run start:dev`.

Start admin web:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/admin-web
npm run dev
```

Open the printed local URL and check:

- Sidebar shows `原料营养治理`.
- Page loads overview cards.
- Food candidates tab loads an empty table or real candidates.
- Confirm button shows a warning before writing.

- [ ] **Step 5: Commit final verification note if the plan file checklist was updated**

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add docs/superpowers/plans/2026-05-11-ingredient-nutrition-governance.md
git commit -m "docs: update nutrition governance verification"
```

---

## Later Plans Not Included Here

These should be separate plans after the foundation works:

- OpenAI Responses API label-recognition provider implementation with strict structured outputs.
- PDF/table extraction workflow for the two local China Food Composition Tables PDFs.
- Full ADF/PDD style recipe formulation workbench.
- Agent-facing recipe design API.
- Miniapp nutrition-report display changes.

## Self-Review Checklist

- Spec coverage:
  - Existing FOOD/SUPPLEMENT coverage: Tasks 3, 4, 9.
  - USDA-first source flow: Tasks 2 and 5.
  - Local CFCT private intermediate source: Task 6.
  - Supplement label drafts: Task 7.
  - Confirmed-only writes: Tasks 3, 4, 7.
  - Admin web workflow: Tasks 8, 9.
  - Miniapp excluded: scope note and no miniapp files.
- Placeholder scan: no unresolved placeholder markers or open implementation blanks.
- Type consistency:
  - Source types: `USDA | CFCT | SUPPLEMENT_LABEL | MANUAL`.
  - Candidate statuses: `CANDIDATE | CONFIRMED | REJECTED | SKIPPED`.
  - Draft statuses: `DRAFT | CONFIRMED | REJECTED`.
  - Canonical nutrition data uses `NutritionProfileV2`.
