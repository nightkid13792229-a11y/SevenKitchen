# FEDIAF 2025 Dog Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned FEDIAF 2025 dog nutrition standard library with structured seed import, admin review visibility, review markers, and compatibility labels for recipes.

**Architecture:** Replace the unused legacy `nutrition_standard_fediaf` table with a versioned standard model: standard version, nutrient dictionary, standard entries, and review events. FEDIAF 2025 dog data is stored as typed seed data and imported idempotently; the admin web reads backend APIs to display a read-only audit workspace and write review markers only.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, Vue 3, Element Plus, Node static tests, UniApp miniapp label compatibility.

---

## File Structure

Backend schema and seed:

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605170001_replace_fediaf_standard_table/migration.sql`
- Delete: `backend/prisma/seed-nutrition-standards.ts`
- Create: `backend/prisma/seed-fediaf-2025-dog-standards.ts`
- Create: `backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts`
- Create: `backend/src/application/nutrition-standard/nutrition-standard.service.ts`
- Create: `backend/src/interfaces/dto/nutrition-standard/nutrition-standard.dto.ts`
- Create: `backend/src/interfaces/controllers/nutrition-standard.controller.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/domain/recipe/enums.ts`
- Modify: `backend/src/label/label.service.ts`

Backend tests:

- Create: `backend/tests/application/nutrition-standard/schema-models.spec.ts`
- Create: `backend/tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts`
- Create: `backend/tests/application/nutrition-standard/nutrition-standard.service.spec.ts`

Admin web:

- Create: `admin-web/src/types/nutritionStandard.ts`
- Create: `admin-web/src/api/nutritionStandards.ts`
- Create: `admin-web/src/views/NutritionStandards/FediafDogStandard.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Create: `admin-web/tests/fediafDogStandardPage.test.js`
- Create: `admin-web/tests/nutritionStandardApi.test.js`

Miniapp labels:

- Modify: `miniapp/src/utils/label-mapping.ts`
- Modify: `miniapp/src/components/RecipeSnapshotModal.vue`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/recipe-diy/index.vue`
- Modify: `miniapp/src/pages/recipe-order/index.vue`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`

Important workspace note: the current worktree already contains unrelated miniapp changes. Do not stage or revert those files unless this plan explicitly modifies them during Task 6.

---

### Task 1: Replace Legacy FEDIAF Schema With Versioned Standard Models

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605170001_replace_fediaf_standard_table/migration.sql`
- Delete: `backend/prisma/seed-nutrition-standards.ts`
- Test: `backend/tests/application/nutrition-standard/schema-models.spec.ts`

- [ ] **Step 1: Write the failing schema guard test**

Create `backend/tests/application/nutrition-standard/schema-models.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

describe('FEDIAF 2025 dog standard schema', () => {
  const schema = readFileSync(
    join(__dirname, '../../../prisma/schema.prisma'),
    'utf8',
  );

  it('removes the legacy single-version FEDIAF model', () => {
    expect(schema).not.toContain('model NutritionStandardFediaf');
    expect(schema).not.toContain('@@map("nutrition_standard_fediaf")');
  });

  it('defines versioned nutrition standard models', () => {
    expect(schema).toContain('model NutritionStandardVersion');
    expect(schema).toContain('model NutritionNutrientDefinition');
    expect(schema).toContain('model NutritionStandardEntry');
    expect(schema).toContain('model NutritionStandardReviewEvent');
  });

  it('defines controlled enums for species, source type, basis, max type, and review status', () => {
    expect(schema).toContain('enum NutritionStandardSpecies');
    expect(schema).toContain('enum NutritionStandardEntrySourceType');
    expect(schema).toContain('enum NutritionStandardBasis');
    expect(schema).toContain('enum NutritionStandardMaxType');
    expect(schema).toContain('enum NutritionStandardReviewStatus');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm --prefix backend test -- tests/application/nutrition-standard/schema-models.spec.ts --runInBand
```

Expected: FAIL because the old `NutritionStandardFediaf` model still exists and the new models do not.

- [ ] **Step 3: Update Prisma schema**

In `backend/prisma/schema.prisma`, remove the entire `NutritionStandardFediaf` model and add these enums and models before `model Feedback`:

```prisma
enum NutritionStandardSpecies {
  DOG
  CAT
}

enum NutritionStandardEntrySourceType {
  CORE_RECOMMENDATION
  ANNEX_7_8
}

enum NutritionStandardBasis {
  PER_100G_DRY_MATTER
  PER_1000_KCAL_ME
  PER_MJ_ME
  RATIO
}

enum NutritionStandardMaxType {
  LEGAL_MAX
  NUTRITIONAL_MAX
  UNSPECIFIED
}

enum NutritionStandardReviewStatus {
  UNREVIEWED
  REVIEWED
  QUESTION
  NEEDS_FIX
}

model NutritionStandardVersion {
  id               String                    @id @default(uuid()) @map("id")
  code             String                    @unique @map("code") @db.VarChar(80)
  standardCode     String                    @map("standard_code") @db.VarChar(50)
  name             String                    @map("name") @db.VarChar(120)
  species          NutritionStandardSpecies  @map("species")
  publicationMonth String                    @map("publication_month") @db.VarChar(7)
  sourceTitle      String                    @map("source_title") @db.VarChar(300)
  sourceUrl        String                    @map("source_url") @db.VarChar(500)
  pdfUrl           String                    @map("pdf_url") @db.VarChar(500)
  importBatch      String                    @map("import_batch") @db.VarChar(80)
  importStatus     String                    @default("IMPORTED") @map("import_status") @db.VarChar(40)
  isActive         Boolean                   @default(true) @map("is_active")
  importedAt       DateTime                  @default(now()) @map("imported_at")
  createdAt        DateTime                  @default(now()) @map("created_at")
  updatedAt        DateTime                  @updatedAt @map("updated_at")
  entries          NutritionStandardEntry[]

  @@index([standardCode, species])
  @@index([isActive])
  @@map("nutrition_standard_version")
}

model NutritionNutrientDefinition {
  id                    String                    @id @default(uuid()) @map("id")
  code                  String                    @unique @map("code") @db.VarChar(80)
  fieldPath             String?                   @map("field_path") @db.VarChar(120)
  name                  String                    @map("name") @db.VarChar(120)
  nameEn                String                    @map("name_en") @db.VarChar(160)
  category              String                    @map("category") @db.VarChar(60)
  defaultIngredientUnit String?                   @map("default_ingredient_unit") @db.VarChar(20)
  defaultStandardUnit   String                    @map("default_standard_unit") @db.VarChar(30)
  isDirect              Boolean                   @default(true) @map("is_direct")
  isDerived             Boolean                   @default(false) @map("is_derived")
  expression            Json?                     @map("expression")
  sortOrder             Int                       @default(0) @map("sort_order")
  isActive              Boolean                   @default(true) @map("is_active")
  createdAt             DateTime                  @default(now()) @map("created_at")
  updatedAt             DateTime                  @updatedAt @map("updated_at")
  standardEntries       NutritionStandardEntry[]

  @@index([category])
  @@index([isActive])
  @@map("nutrition_nutrient_definition")
}

model NutritionStandardEntry {
  id                 String                           @id @default(uuid()) @map("id")
  versionId          String                           @map("version_id")
  nutrientId         String                           @map("nutrient_id")
  fediafName         String                           @map("fediaf_name") @db.VarChar(160)
  category           String                           @map("category") @db.VarChar(60)
  sourceTable        String                           @map("source_table") @db.VarChar(20)
  sourceType         NutritionStandardEntrySourceType @map("source_type")
  pdfPage            Int                              @map("pdf_page")
  species            NutritionStandardSpecies         @map("species")
  lifeStage          String                           @map("life_stage") @db.VarChar(80)
  basis              NutritionStandardBasis           @map("basis")
  unit               String                           @map("unit") @db.VarChar(30)
  minValue           Float?                           @map("min_value")
  maxValue           Float?                           @map("max_value")
  recommendedValue   Float?                           @map("recommended_value")
  maxType            NutritionStandardMaxType         @default(UNSPECIFIED) @map("max_type")
  footnoteRefs       String[]                         @default([]) @map("footnote_refs")
  notes              String?                          @map("notes")
  sortOrder          Int                              @default(0) @map("sort_order")
  createdAt          DateTime                         @default(now()) @map("created_at")
  updatedAt          DateTime                         @updatedAt @map("updated_at")
  version            NutritionStandardVersion         @relation(fields: [versionId], references: [id], onDelete: Cascade)
  nutrient           NutritionNutrientDefinition      @relation(fields: [nutrientId], references: [id])
  reviewEvents       NutritionStandardReviewEvent[]

  @@unique([versionId, nutrientId, sourceTable, lifeStage, basis, unit])
  @@index([versionId])
  @@index([nutrientId])
  @@index([sourceTable])
  @@index([sourceType])
  @@index([lifeStage])
  @@index([category])
  @@map("nutrition_standard_entry")
}

model NutritionStandardReviewEvent {
  id         String                        @id @default(uuid()) @map("id")
  entryId    String                        @map("entry_id")
  status     NutritionStandardReviewStatus @map("status")
  note       String?                       @map("note")
  reviewedBy String?                       @map("reviewed_by")
  reviewedAt DateTime                      @default(now()) @map("reviewed_at")
  createdAt  DateTime                      @default(now()) @map("created_at")
  entry      NutritionStandardEntry        @relation(fields: [entryId], references: [id], onDelete: Cascade)

  @@index([entryId, reviewedAt])
  @@index([status])
  @@map("nutrition_standard_review_event")
}
```

- [ ] **Step 4: Create migration SQL**

Create `backend/prisma/migrations/202605170001_replace_fediaf_standard_table/migration.sql`:

```sql
DROP TABLE IF EXISTS "nutrition_standard_fediaf";

CREATE TYPE "NutritionStandardSpecies" AS ENUM ('DOG', 'CAT');
CREATE TYPE "NutritionStandardEntrySourceType" AS ENUM ('CORE_RECOMMENDATION', 'ANNEX_7_8');
CREATE TYPE "NutritionStandardBasis" AS ENUM ('PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME', 'PER_MJ_ME', 'RATIO');
CREATE TYPE "NutritionStandardMaxType" AS ENUM ('LEGAL_MAX', 'NUTRITIONAL_MAX', 'UNSPECIFIED');
CREATE TYPE "NutritionStandardReviewStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'QUESTION', 'NEEDS_FIX');

CREATE TABLE "nutrition_standard_version" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "standard_code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "species" "NutritionStandardSpecies" NOT NULL,
  "publication_month" VARCHAR(7) NOT NULL,
  "source_title" VARCHAR(300) NOT NULL,
  "source_url" VARCHAR(500) NOT NULL,
  "pdf_url" VARCHAR(500) NOT NULL,
  "import_batch" VARCHAR(80) NOT NULL,
  "import_status" VARCHAR(40) NOT NULL DEFAULT 'IMPORTED',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_standard_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_nutrient_definition" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "field_path" VARCHAR(120),
  "name" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(160) NOT NULL,
  "category" VARCHAR(60) NOT NULL,
  "default_ingredient_unit" VARCHAR(20),
  "default_standard_unit" VARCHAR(30) NOT NULL,
  "is_direct" BOOLEAN NOT NULL DEFAULT true,
  "is_derived" BOOLEAN NOT NULL DEFAULT false,
  "expression" JSONB,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_nutrient_definition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_standard_entry" (
  "id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "nutrient_id" TEXT NOT NULL,
  "fediaf_name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(60) NOT NULL,
  "source_table" VARCHAR(20) NOT NULL,
  "source_type" "NutritionStandardEntrySourceType" NOT NULL,
  "pdf_page" INTEGER NOT NULL,
  "species" "NutritionStandardSpecies" NOT NULL,
  "life_stage" VARCHAR(80) NOT NULL,
  "basis" "NutritionStandardBasis" NOT NULL,
  "unit" VARCHAR(30) NOT NULL,
  "min_value" DOUBLE PRECISION,
  "max_value" DOUBLE PRECISION,
  "recommended_value" DOUBLE PRECISION,
  "max_type" "NutritionStandardMaxType" NOT NULL DEFAULT 'UNSPECIFIED',
  "footnote_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_standard_entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_standard_review_event" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "status" "NutritionStandardReviewStatus" NOT NULL,
  "note" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_standard_review_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nutrition_standard_version_code_key" ON "nutrition_standard_version"("code");
CREATE INDEX "nutrition_standard_version_standard_code_species_idx" ON "nutrition_standard_version"("standard_code", "species");
CREATE INDEX "nutrition_standard_version_is_active_idx" ON "nutrition_standard_version"("is_active");

CREATE UNIQUE INDEX "nutrition_nutrient_definition_code_key" ON "nutrition_nutrient_definition"("code");
CREATE INDEX "nutrition_nutrient_definition_category_idx" ON "nutrition_nutrient_definition"("category");
CREATE INDEX "nutrition_nutrient_definition_is_active_idx" ON "nutrition_nutrient_definition"("is_active");

CREATE UNIQUE INDEX "nutrition_standard_entry_version_id_nutrient_id_source_table_life_stage_basis_unit_key"
  ON "nutrition_standard_entry"("version_id", "nutrient_id", "source_table", "life_stage", "basis", "unit");
CREATE INDEX "nutrition_standard_entry_version_id_idx" ON "nutrition_standard_entry"("version_id");
CREATE INDEX "nutrition_standard_entry_nutrient_id_idx" ON "nutrition_standard_entry"("nutrient_id");
CREATE INDEX "nutrition_standard_entry_source_table_idx" ON "nutrition_standard_entry"("source_table");
CREATE INDEX "nutrition_standard_entry_source_type_idx" ON "nutrition_standard_entry"("source_type");
CREATE INDEX "nutrition_standard_entry_life_stage_idx" ON "nutrition_standard_entry"("life_stage");
CREATE INDEX "nutrition_standard_entry_category_idx" ON "nutrition_standard_entry"("category");

CREATE INDEX "nutrition_standard_review_event_entry_id_reviewed_at_idx" ON "nutrition_standard_review_event"("entry_id", "reviewed_at");
CREATE INDEX "nutrition_standard_review_event_status_idx" ON "nutrition_standard_review_event"("status");

ALTER TABLE "nutrition_standard_entry"
  ADD CONSTRAINT "nutrition_standard_entry_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "nutrition_standard_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nutrition_standard_entry"
  ADD CONSTRAINT "nutrition_standard_entry_nutrient_id_fkey"
  FOREIGN KEY ("nutrient_id") REFERENCES "nutrition_nutrient_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "nutrition_standard_review_event"
  ADD CONSTRAINT "nutrition_standard_review_event_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "nutrition_standard_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Delete the old seed script**

Delete `backend/prisma/seed-nutrition-standards.ts`. The new seed script is created in Task 2.

- [ ] **Step 6: Run Prisma generation and the schema guard test**

Run:

```bash
npm --prefix backend run prisma:generate:build
npm --prefix backend test -- tests/application/nutrition-standard/schema-models.spec.ts --runInBand
```

Expected: Prisma client generation succeeds, then the schema guard test passes.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202605170001_replace_fediaf_standard_table/migration.sql backend/tests/application/nutrition-standard/schema-models.spec.ts
git rm backend/prisma/seed-nutrition-standards.ts
git commit -m "feat: replace legacy fediaf standard schema"
```

---

### Task 2: Add FEDIAF 2025 Dog Seed Data And Import Script

**Files:**
- Create: `backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts`
- Create: `backend/prisma/seed-fediaf-2025-dog-standards.ts`
- Test: `backend/tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts`

- [ ] **Step 1: Write the failing data-shape test**

Create `backend/tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts`:

```ts
import {
  FEDIAF_2025_DOG_NUTRIENTS,
  FEDIAF_2025_DOG_STANDARD_ENTRIES,
  FEDIAF_2025_DOG_STANDARD_VERSION,
} from '../../../src/application/nutrition-standard/fediaf-2025-dog.data';

const REQUIRED_TABLES = [
  'III-3a',
  'III-3b',
  'III-3c',
  'VII-17a',
  'VII-17b',
  'VII-17c',
  'VII-17d',
];

describe('FEDIAF 2025 dog structured standard data', () => {
  it('declares the canonical FEDIAF 2025 dog version metadata', () => {
    expect(FEDIAF_2025_DOG_STANDARD_VERSION).toEqual(
      expect.objectContaining({
        code: 'FEDIAF_2025_DOG',
        standardCode: 'FEDIAF_2025',
        species: 'DOG',
        publicationMonth: '2025-09',
      }),
    );
  });

  it('contains every required dog source table', () => {
    const tables = new Set(
      FEDIAF_2025_DOG_STANDARD_ENTRIES.map((entry) => entry.sourceTable),
    );

    for (const table of REQUIRED_TABLES) {
      expect(tables.has(table)).toBe(true);
    }
  });

  it('binds every standard entry to a known nutrient definition', () => {
    const nutrientCodes = new Set(
      FEDIAF_2025_DOG_NUTRIENTS.map((nutrient) => nutrient.code),
    );

    for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
      expect(nutrientCodes.has(entry.nutrientCode)).toBe(true);
      expect(entry.fediafName.trim()).not.toHaveLength(0);
      expect(entry.unit.trim()).not.toHaveLength(0);
      expect(entry.pdfPage).toBeGreaterThan(0);
    }
  });

  it('keeps source pages aligned with the approved design scope', () => {
    const expectedPages: Record<string, number> = {
      'III-3a': 15,
      'III-3b': 16,
      'III-3c': 17,
      'VII-17a': 73,
      'VII-17b': 74,
      'VII-17c': 75,
      'VII-17d': 76,
    };

    for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
      expect(entry.pdfPage).toBe(expectedPages[entry.sourceTable]);
    }
  });

  it('includes direct, combination, and ratio nutrient mappings', () => {
    expect(FEDIAF_2025_DOG_NUTRIENTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'calcium',
          fieldPath: 'minerals.calcium',
          isDirect: true,
          isDerived: false,
        }),
        expect.objectContaining({
          code: 'epaDha',
          isDirect: false,
          isDerived: true,
        }),
        expect.objectContaining({
          code: 'calciumPhosphorusRatio',
          isDirect: false,
          isDerived: true,
        }),
      ]),
    );
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm --prefix backend test -- tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts --runInBand
```

Expected: FAIL because `fediaf-2025-dog.data.ts` does not exist yet.

- [ ] **Step 3: Create typed seed data module**

Create `backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts` with the following exported types and constants. Transcribe every row from FEDIAF 2025 dog Tables III-3a, III-3b, III-3c, VII-17a, VII-17b, VII-17c, and VII-17d into `FEDIAF_2025_DOG_STANDARD_ENTRIES`; each row must carry the table ID and page listed in the design document.

```ts
export type NutritionStandardSpecies = 'DOG' | 'CAT';
export type NutritionStandardSourceType =
  | 'CORE_RECOMMENDATION'
  | 'ANNEX_7_8';
export type NutritionStandardBasis =
  | 'PER_100G_DRY_MATTER'
  | 'PER_1000_KCAL_ME'
  | 'PER_MJ_ME'
  | 'RATIO';
export type NutritionStandardMaxType =
  | 'LEGAL_MAX'
  | 'NUTRITIONAL_MAX'
  | 'UNSPECIFIED';

export interface FediafStandardVersionSeed {
  code: string;
  standardCode: string;
  name: string;
  species: NutritionStandardSpecies;
  publicationMonth: string;
  sourceTitle: string;
  sourceUrl: string;
  pdfUrl: string;
  importBatch: string;
  importStatus: string;
  isActive: boolean;
}

export interface NutrientDefinitionSeed {
  code: string;
  fieldPath: string | null;
  name: string;
  nameEn: string;
  category: string;
  defaultIngredientUnit: string | null;
  defaultStandardUnit: string;
  isDirect: boolean;
  isDerived: boolean;
  expression: Record<string, unknown> | null;
  sortOrder: number;
}

export interface FediafStandardEntrySeed {
  nutrientCode: string;
  fediafName: string;
  category: string;
  sourceTable:
    | 'III-3a'
    | 'III-3b'
    | 'III-3c'
    | 'VII-17a'
    | 'VII-17b'
    | 'VII-17c'
    | 'VII-17d';
  sourceType: NutritionStandardSourceType;
  pdfPage: number;
  species: NutritionStandardSpecies;
  lifeStage: string;
  basis: NutritionStandardBasis;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  recommendedValue: number | null;
  maxType: NutritionStandardMaxType;
  footnoteRefs: string[];
  notes: string | null;
  sortOrder: number;
}

export const FEDIAF_2025_DOG_STANDARD_VERSION: FediafStandardVersionSeed = {
  code: 'FEDIAF_2025_DOG',
  standardCode: 'FEDIAF_2025',
  name: 'FEDIAF 2025 犬营养标准',
  species: 'DOG',
  publicationMonth: '2025-09',
  sourceTitle:
    'FEDIAF Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs, Publication September 2025',
  sourceUrl: 'https://europeanpetfood.org/self-regulation/nutritional-guidelines/',
  pdfUrl:
    'https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf',
  importBatch: 'fediaf-2025-dog-v1',
  importStatus: 'IMPORTED',
  isActive: true,
};

export const FEDIAF_2025_DOG_NUTRIENTS: NutrientDefinitionSeed[] = [
  {
    code: 'crudeProtein',
    fieldPath: 'macros.crudeProtein',
    name: '粗蛋白',
    nameEn: 'Crude protein',
    category: 'MACRONUTRIENT',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 10,
  },
  {
    code: 'crudeFat',
    fieldPath: 'macros.crudeFat',
    name: '粗脂肪',
    nameEn: 'Crude fat',
    category: 'MACRONUTRIENT',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 20,
  },
  {
    code: 'calcium',
    fieldPath: 'minerals.calcium',
    name: '钙',
    nameEn: 'Calcium',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 100,
  },
  {
    code: 'phosphorus',
    fieldPath: 'minerals.phosphorus',
    name: '磷',
    nameEn: 'Phosphorus',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: 110,
  },
  {
    code: 'calciumPhosphorusRatio',
    fieldPath: null,
    name: '钙磷比',
    nameEn: 'Calcium:Phosphorus ratio',
    category: 'DERIVED_RATIO',
    defaultIngredientUnit: null,
    defaultStandardUnit: 'ratio',
    isDirect: false,
    isDerived: true,
    expression: {
      op: 'ratio',
      numerator: 'minerals.calcium',
      denominator: 'minerals.phosphorus',
    },
    sortOrder: 120,
  },
  {
    code: 'epaDha',
    fieldPath: null,
    name: 'EPA + DHA',
    nameEn: 'EPA + DHA',
    category: 'FATTY_ACID',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g',
    isDirect: false,
    isDerived: true,
    expression: {
      op: 'sum',
      fields: ['fattyAcids.epa', 'fattyAcids.dha'],
    },
    sortOrder: 300,
  },
  {
    code: 'methionineCystine',
    fieldPath: null,
    name: '蛋氨酸 + 胱氨酸',
    nameEn: 'Methionine + cystine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: false,
    isDerived: true,
    expression: {
      op: 'sum',
      fields: ['aminoAcids.methionine', 'aminoAcids.cystine'],
    },
    sortOrder: 410,
  },
  {
    code: 'phenylalanineTyrosine',
    fieldPath: null,
    name: '苯丙氨酸 + 酪氨酸',
    nameEn: 'Phenylalanine + tyrosine',
    category: 'AMINO_ACID',
    defaultIngredientUnit: 'g',
    defaultStandardUnit: 'g',
    isDirect: false,
    isDerived: true,
    expression: {
      op: 'sum',
      fields: ['aminoAcids.phenylalanine', 'aminoAcids.tyrosine'],
    },
    sortOrder: 420,
  },
];
```

After the type and nutrient definitions, add an exported constant named `FEDIAF_2025_DOG_STANDARD_ENTRIES` typed as `FediafStandardEntrySeed[]`. Its value must contain all rows from the seven approved source tables before the file is committed. Each object must use these exact lifecycle codes where applicable: `EARLY_GROWTH_UNDER_14_WEEKS`, `REPRODUCTION`, `LATE_GROWTH_FROM_14_WEEKS`, `ADULT_MER_110`, and `ADULT_MER_95`. Extend `FEDIAF_2025_DOG_NUTRIENTS` for every nutrient in the approved tables. Use existing project field paths from `backend/src/domain/ingredient/nutrition-field-catalog.ts` for direct nutrients. Use `fieldPath: null` and an explicit `expression` for derived nutrients.

- [ ] **Step 4: Create import script**

Create `backend/prisma/seed-fediaf-2025-dog-standards.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import {
  FEDIAF_2025_DOG_NUTRIENTS,
  FEDIAF_2025_DOG_STANDARD_ENTRIES,
  FEDIAF_2025_DOG_STANDARD_VERSION,
} from '../src/application/nutrition-standard/fediaf-2025-dog.data';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding FEDIAF 2025 dog nutrition standards');

  const version = await prisma.nutritionStandardVersion.upsert({
    where: { code: FEDIAF_2025_DOG_STANDARD_VERSION.code },
    update: {
      standardCode: FEDIAF_2025_DOG_STANDARD_VERSION.standardCode,
      name: FEDIAF_2025_DOG_STANDARD_VERSION.name,
      species: FEDIAF_2025_DOG_STANDARD_VERSION.species,
      publicationMonth: FEDIAF_2025_DOG_STANDARD_VERSION.publicationMonth,
      sourceTitle: FEDIAF_2025_DOG_STANDARD_VERSION.sourceTitle,
      sourceUrl: FEDIAF_2025_DOG_STANDARD_VERSION.sourceUrl,
      pdfUrl: FEDIAF_2025_DOG_STANDARD_VERSION.pdfUrl,
      importBatch: FEDIAF_2025_DOG_STANDARD_VERSION.importBatch,
      importStatus: FEDIAF_2025_DOG_STANDARD_VERSION.importStatus,
      isActive: FEDIAF_2025_DOG_STANDARD_VERSION.isActive,
      importedAt: new Date(),
    },
    create: FEDIAF_2025_DOG_STANDARD_VERSION,
  });

  const nutrientLookup = new Map<string, string>();
  for (const nutrient of FEDIAF_2025_DOG_NUTRIENTS) {
    const record = await prisma.nutritionNutrientDefinition.upsert({
      where: { code: nutrient.code },
      update: nutrient,
      create: nutrient,
    });
    nutrientLookup.set(nutrient.code, record.id);
  }

  await prisma.nutritionStandardReviewEvent.deleteMany({
    where: {
      entry: {
        versionId: version.id,
      },
    },
  });
  await prisma.nutritionStandardEntry.deleteMany({
    where: { versionId: version.id },
  });

  const tableCounts = new Map<string, number>();
  for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
    const nutrientId = nutrientLookup.get(entry.nutrientCode);
    if (!nutrientId) {
      throw new Error(`Missing nutrient definition: ${entry.nutrientCode}`);
    }

    await prisma.nutritionStandardEntry.create({
      data: {
        versionId: version.id,
        nutrientId,
        fediafName: entry.fediafName,
        category: entry.category,
        sourceTable: entry.sourceTable,
        sourceType: entry.sourceType,
        pdfPage: entry.pdfPage,
        species: entry.species,
        lifeStage: entry.lifeStage,
        basis: entry.basis,
        unit: entry.unit,
        minValue: entry.minValue,
        maxValue: entry.maxValue,
        recommendedValue: entry.recommendedValue,
        maxType: entry.maxType,
        footnoteRefs: entry.footnoteRefs,
        notes: entry.notes,
        sortOrder: entry.sortOrder,
      },
    });

    tableCounts.set(entry.sourceTable, (tableCounts.get(entry.sourceTable) ?? 0) + 1);
  }

  console.log(`Inserted ${FEDIAF_2025_DOG_STANDARD_ENTRIES.length} standard entries`);
  for (const [table, count] of [...tableCounts.entries()].sort()) {
    console.log(`${table}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 5: Run the data test**

Run:

```bash
npm --prefix backend test -- tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts --runInBand
```

Expected: PASS after every approved table has been transcribed and each row is bound to a nutrient definition.

- [ ] **Step 6: Run the import script against the local database**

Run:

```bash
cd backend && npx ts-node -r tsconfig-paths/register prisma/seed-fediaf-2025-dog-standards.ts
```

Expected: The script prints the total entry count and one count for each of `III-3a`, `III-3b`, `III-3c`, `VII-17a`, `VII-17b`, `VII-17c`, and `VII-17d`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts backend/prisma/seed-fediaf-2025-dog-standards.ts backend/tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts
git commit -m "feat: seed fediaf 2025 dog standard data"
```

---

### Task 3: Add Backend Standard Query And Review API

**Files:**
- Create: `backend/src/application/nutrition-standard/nutrition-standard.service.ts`
- Create: `backend/src/interfaces/dto/nutrition-standard/nutrition-standard.dto.ts`
- Create: `backend/src/interfaces/controllers/nutrition-standard.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/nutrition-standard/nutrition-standard.service.spec.ts`

- [ ] **Step 1: Write the failing service test**

Create `backend/tests/application/nutrition-standard/nutrition-standard.service.spec.ts`:

```ts
import { NutritionStandardService } from '../../../src/application/nutrition-standard/nutrition-standard.service';

describe('NutritionStandardService', () => {
  const prisma = {
    nutritionStandardVersion: {
      findUnique: jest.fn(),
    },
    nutritionStandardEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    nutritionStandardReviewEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns FEDIAF 2025 dog overview with review status counts', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      name: 'FEDIAF 2025 犬营养标准',
      species: 'DOG',
      publicationMonth: '2025-09',
      sourceTitle: 'FEDIAF Nutritional Guidelines 2025',
      sourceUrl: 'https://europeanpetfood.org/self-regulation/nutritional-guidelines/',
      pdfUrl: 'https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf',
      importBatch: 'fediaf-2025-dog-v1',
      importStatus: 'IMPORTED',
      isActive: true,
      importedAt: new Date('2026-05-17T00:00:00.000Z'),
      entries: [
        { id: 'entry-1', sourceTable: 'III-3b', category: 'MINERAL' },
        { id: 'entry-2', sourceTable: 'VII-17c', category: 'MINERAL' },
      ],
    });
    prisma.nutritionStandardReviewEvent.findMany.mockResolvedValue([
      {
        entryId: 'entry-1',
        status: 'REVIEWED',
        note: null,
        reviewedBy: 'admin-1',
        reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
      },
    ]);

    const service = new NutritionStandardService(prisma);

    await expect(service.getFediaf2025DogOverview()).resolves.toEqual(
      expect.objectContaining({
        version: expect.objectContaining({
          code: 'FEDIAF_2025_DOG',
          species: 'DOG',
        }),
        totalEntries: 2,
        reviewCounts: {
          UNREVIEWED: 1,
          REVIEWED: 1,
          QUESTION: 0,
          NEEDS_FIX: 0,
        },
      }),
    );
  });

  it('lists entries with latest review status and filters', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        fediafName: 'Calcium',
        category: 'MINERAL',
        sourceTable: 'VII-17c',
        sourceType: 'ANNEX_7_8',
        pdfPage: 75,
        species: 'DOG',
        lifeStage: 'ADULT_MER_110',
        basis: 'PER_1000_KCAL_ME',
        unit: 'g/1000kcal',
        minValue: 0.5,
        maxValue: 7.1,
        recommendedValue: null,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: [],
        notes: null,
        sortOrder: 1,
        nutrient: {
          code: 'calcium',
          fieldPath: 'minerals.calcium',
          name: '钙',
          nameEn: 'Calcium',
        },
        reviewEvents: [
          {
            status: 'QUESTION',
            note: '核对最大值',
            reviewedBy: 'admin-1',
            reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
          },
        ],
      },
    ]);

    const service = new NutritionStandardService(prisma);

    await expect(
      service.listFediaf2025DogEntries({
        sourceTable: 'VII-17c',
        lifeStage: 'ADULT_MER_110',
        category: 'MINERAL',
        reviewStatus: 'QUESTION',
        search: 'cal',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'entry-1',
        nutrientCode: 'calcium',
        reviewStatus: 'QUESTION',
      }),
    ]);

    expect(prisma.nutritionStandardEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceTable: 'VII-17c',
          lifeStage: 'ADULT_MER_110',
          category: 'MINERAL',
        }),
      }),
    );
  });

  it('creates a review event without changing the standard entry', async () => {
    prisma.nutritionStandardEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
    });
    prisma.nutritionStandardReviewEvent.create.mockResolvedValue({
      id: 'review-1',
      entryId: 'entry-1',
      status: 'REVIEWED',
      note: '已核对',
      reviewedBy: 'admin-1',
      reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
    });

    const service = new NutritionStandardService(prisma);

    await expect(
      service.createReviewEvent('entry-1', {
        status: 'REVIEWED',
        note: '已核对',
        reviewedBy: 'admin-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'REVIEWED' }));

    expect(prisma.nutritionStandardReviewEvent.create).toHaveBeenCalledWith({
      data: {
        entryId: 'entry-1',
        status: 'REVIEWED',
        note: '已核对',
        reviewedBy: 'admin-1',
      },
    });
  });
});
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
npm --prefix backend test -- tests/application/nutrition-standard/nutrition-standard.service.spec.ts --runInBand
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add DTOs**

Create `backend/src/interfaces/dto/nutrition-standard/nutrition-standard.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  NutritionStandardReviewStatus,
} from '@prisma/client';

export class NutritionStandardEntryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceTable?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lifeStage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: NutritionStandardReviewStatus })
  @IsOptional()
  @IsEnum(NutritionStandardReviewStatus)
  reviewStatus?: NutritionStandardReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateNutritionStandardReviewDto {
  @ApiProperty({ enum: NutritionStandardReviewStatus })
  @IsEnum(NutritionStandardReviewStatus)
  status!: NutritionStandardReviewStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

- [ ] **Step 4: Add service**

Create `backend/src/application/nutrition-standard/nutrition-standard.service.ts` with methods:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NutritionStandardReviewStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type { NutritionStandardEntryQueryDto } from '../../interfaces/dto/nutrition-standard/nutrition-standard.dto';

const FEDIAF_2025_DOG_CODE = 'FEDIAF_2025_DOG';

type ReviewEventLike = {
  status: NutritionStandardReviewStatus;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: Date;
};

@Injectable()
export class NutritionStandardService {
  constructor(private readonly prisma: PrismaService) {}

  private getLatestReview(
    events: ReviewEventLike[] | undefined,
  ): ReviewEventLike | null {
    if (!events || events.length === 0) {
      return null;
    }
    return [...events].sort(
      (a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime(),
    )[0];
  }

  private mapEntry(entry: any) {
    const latestReview = this.getLatestReview(entry.reviewEvents);
    return {
      id: entry.id,
      nutrientCode: entry.nutrient.code,
      nutrientName: entry.nutrient.name,
      nutrientNameEn: entry.nutrient.nameEn,
      fieldPath: entry.nutrient.fieldPath,
      fediafName: entry.fediafName,
      category: entry.category,
      sourceTable: entry.sourceTable,
      sourceType: entry.sourceType,
      pdfPage: entry.pdfPage,
      species: entry.species,
      lifeStage: entry.lifeStage,
      basis: entry.basis,
      unit: entry.unit,
      minValue: entry.minValue,
      maxValue: entry.maxValue,
      recommendedValue: entry.recommendedValue,
      maxType: entry.maxType,
      footnoteRefs: entry.footnoteRefs,
      notes: entry.notes,
      sortOrder: entry.sortOrder,
      reviewStatus: latestReview?.status ?? NutritionStandardReviewStatus.UNREVIEWED,
      reviewNote: latestReview?.note ?? null,
      reviewedBy: latestReview?.reviewedBy ?? null,
      reviewedAt: latestReview?.reviewedAt ?? null,
    };
  }

  async getFediaf2025DogOverview() {
    const version = await this.prisma.nutritionStandardVersion.findUnique({
      where: { code: FEDIAF_2025_DOG_CODE },
      include: {
        entries: {
          select: {
            id: true,
            sourceTable: true,
            category: true,
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('FEDIAF 2025 dog standard has not been imported');
    }

    const reviewEvents =
      await this.prisma.nutritionStandardReviewEvent.findMany({
        where: {
          entry: {
            versionId: version.id,
          },
        },
        orderBy: { reviewedAt: 'desc' },
      });

    const latestByEntry = new Map<string, NutritionStandardReviewStatus>();
    for (const event of reviewEvents) {
      if (!latestByEntry.has(event.entryId)) {
        latestByEntry.set(event.entryId, event.status);
      }
    }

    const reviewCounts = {
      UNREVIEWED: 0,
      REVIEWED: 0,
      QUESTION: 0,
      NEEDS_FIX: 0,
    };

    for (const entry of version.entries) {
      const status = latestByEntry.get(entry.id) ?? 'UNREVIEWED';
      reviewCounts[status] += 1;
    }

    const tableCounts = version.entries.reduce<Record<string, number>>(
      (result, entry) => {
        result[entry.sourceTable] = (result[entry.sourceTable] ?? 0) + 1;
        return result;
      },
      {},
    );

    return {
      version: {
        id: version.id,
        code: version.code,
        standardCode: version.standardCode,
        name: version.name,
        species: version.species,
        publicationMonth: version.publicationMonth,
        sourceTitle: version.sourceTitle,
        sourceUrl: version.sourceUrl,
        pdfUrl: version.pdfUrl,
        importBatch: version.importBatch,
        importStatus: version.importStatus,
        isActive: version.isActive,
        importedAt: version.importedAt,
      },
      totalEntries: version.entries.length,
      tableCounts,
      reviewCounts,
    };
  }

  async listFediaf2025DogEntries(query: NutritionStandardEntryQueryDto) {
    const where: Prisma.NutritionStandardEntryWhereInput = {
      version: { code: FEDIAF_2025_DOG_CODE },
      ...(query.sourceTable && { sourceTable: query.sourceTable }),
      ...(query.sourceType && { sourceType: query.sourceType as any }),
      ...(query.lifeStage && { lifeStage: query.lifeStage }),
      ...(query.category && { category: query.category }),
      ...(query.search && {
        OR: [
          { fediafName: { contains: query.search, mode: 'insensitive' } },
          {
            nutrient: {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
                { nameEn: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
        ],
      }),
    };

    const entries = await this.prisma.nutritionStandardEntry.findMany({
      where,
      include: {
        nutrient: true,
        reviewEvents: {
          orderBy: { reviewedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ sourceTable: 'asc' }, { sortOrder: 'asc' }],
    });

    const mapped = entries.map((entry) => this.mapEntry(entry));
    if (!query.reviewStatus) {
      return mapped;
    }
    return mapped.filter((entry) => entry.reviewStatus === query.reviewStatus);
  }

  async getFediaf2025DogEntryDetail(id: string) {
    const entry = await this.prisma.nutritionStandardEntry.findUnique({
      where: { id },
      include: {
        nutrient: true,
        reviewEvents: {
          orderBy: { reviewedAt: 'desc' },
        },
      },
    });
    if (!entry) {
      throw new NotFoundException(`Nutrition standard entry ${id} not found`);
    }
    return {
      ...this.mapEntry(entry),
      reviewEvents: entry.reviewEvents,
    };
  }

  async createReviewEvent(
    entryId: string,
    input: {
      status: NutritionStandardReviewStatus;
      note?: string;
      reviewedBy?: string;
    },
  ) {
    const entry = await this.prisma.nutritionStandardEntry.findUnique({
      where: { id: entryId },
      select: { id: true },
    });
    if (!entry) {
      throw new NotFoundException(`Nutrition standard entry ${entryId} not found`);
    }

    return this.prisma.nutritionStandardReviewEvent.create({
      data: {
        entryId,
        status: input.status,
        note: input.note?.trim() || null,
        reviewedBy: input.reviewedBy,
      },
    });
  }
}
```

- [ ] **Step 5: Add controller**

Create `backend/src/interfaces/controllers/nutrition-standard.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { NutritionStandardService } from '../../application/nutrition-standard/nutrition-standard.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import {
  CreateNutritionStandardReviewDto,
  NutritionStandardEntryQueryDto,
} from '../dto/nutrition-standard/nutrition-standard.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Nutrition Standards')
@ApiBearerAuth()
@ApiSecurity('wechat-auth')
@Controller('api/v1/admin/nutrition-standards')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NutritionStandardController {
  constructor(private readonly service: NutritionStandardService) {}

  @Get('fediaf-2025-dog/overview')
  @ApiOperation({ summary: 'Get FEDIAF 2025 dog standard overview' })
  async getFediaf2025DogOverview(): Promise<ApiResponseDto<any>> {
    const result = await this.service.getFediaf2025DogOverview();
    return new ApiResponseDto(0, 'Success', result);
  }

  @Get('fediaf-2025-dog/entries')
  @ApiOperation({ summary: 'List FEDIAF 2025 dog standard entries' })
  async listFediaf2025DogEntries(
    @Query() query: NutritionStandardEntryQueryDto,
  ): Promise<ApiResponseDto<any[]>> {
    const result = await this.service.listFediaf2025DogEntries(query);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Get('fediaf-2025-dog/entries/:id')
  @ApiOperation({ summary: 'Get FEDIAF 2025 dog standard entry detail' })
  async getFediaf2025DogEntryDetail(
    @Param('id') id: string,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.getFediaf2025DogEntryDetail(id);
    return new ApiResponseDto(0, 'Success', result);
  }

  @Patch('fediaf-2025-dog/entries/:id/review')
  @ApiOperation({ summary: 'Create review marker for FEDIAF 2025 dog standard entry' })
  async createReviewEvent(
    @Param('id') id: string,
    @Body() dto: CreateNutritionStandardReviewDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    const result = await this.service.createReviewEvent(id, {
      status: dto.status,
      note: dto.note,
      reviewedBy: user?.userId,
    });
    return new ApiResponseDto(0, '审核标记已保存', result);
  }
}
```

- [ ] **Step 6: Register service and controller in AppModule**

Modify `backend/src/app.module.ts`:

- Add imports:

```ts
import { NutritionStandardController } from './interfaces/controllers/nutrition-standard.controller';
import { NutritionStandardService } from './application/nutrition-standard/nutrition-standard.service';
```

- Add `NutritionStandardController` to `controllers`.
- Add `NutritionStandardService` to `providers`.

- [ ] **Step 7: Run service tests**

Run:

```bash
npm --prefix backend test -- tests/application/nutrition-standard/nutrition-standard.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/nutrition-standard/nutrition-standard.service.ts backend/src/interfaces/dto/nutrition-standard/nutrition-standard.dto.ts backend/src/interfaces/controllers/nutrition-standard.controller.ts backend/src/app.module.ts backend/tests/application/nutrition-standard/nutrition-standard.service.spec.ts
git commit -m "feat: expose fediaf 2025 dog standard api"
```

---

### Task 4: Add Admin Web API Types And Static Guards

**Files:**
- Create: `admin-web/src/types/nutritionStandard.ts`
- Create: `admin-web/src/api/nutritionStandards.ts`
- Test: `admin-web/tests/nutritionStandardApi.test.js`

- [ ] **Step 1: Write failing admin API static test**

Create `admin-web/tests/nutritionStandardApi.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('nutrition standard api exposes FEDIAF 2025 dog endpoints', () => {
  const apiSource = readFileSync(
    new URL('../src/api/nutritionStandards.ts', import.meta.url),
    'utf8'
  )

  assert.match(apiSource, /getFediaf2025DogOverview/)
  assert.match(apiSource, /listFediaf2025DogEntries/)
  assert.match(apiSource, /getFediaf2025DogEntryDetail/)
  assert.match(apiSource, /updateFediaf2025DogEntryReview/)
  assert.match(apiSource, /admin\/nutrition-standards\/fediaf-2025-dog\/overview/)
  assert.match(apiSource, /admin\/nutrition-standards\/fediaf-2025-dog\/entries/)
})

test('nutrition standard types include review states and source tables', () => {
  const typeSource = readFileSync(
    new URL('../src/types/nutritionStandard.ts', import.meta.url),
    'utf8'
  )

  assert.match(typeSource, /UNREVIEWED/)
  assert.match(typeSource, /REVIEWED/)
  assert.match(typeSource, /QUESTION/)
  assert.match(typeSource, /NEEDS_FIX/)
  assert.match(typeSource, /III-3a/)
  assert.match(typeSource, /VII-17d/)
})
```

- [ ] **Step 2: Run failing static test**

Run:

```bash
node --test admin-web/tests/nutritionStandardApi.test.js
```

Expected: FAIL because the files do not exist.

- [ ] **Step 3: Create admin types**

Create `admin-web/src/types/nutritionStandard.ts`:

```ts
export type NutritionStandardReviewStatus =
  | 'UNREVIEWED'
  | 'REVIEWED'
  | 'QUESTION'
  | 'NEEDS_FIX'

export type NutritionStandardSourceTable =
  | 'III-3a'
  | 'III-3b'
  | 'III-3c'
  | 'VII-17a'
  | 'VII-17b'
  | 'VII-17c'
  | 'VII-17d'

export type NutritionStandardSourceType =
  | 'CORE_RECOMMENDATION'
  | 'ANNEX_7_8'

export interface NutritionStandardVersionSummary {
  id: string
  code: string
  standardCode: string
  name: string
  species: 'DOG' | 'CAT'
  publicationMonth: string
  sourceTitle: string
  sourceUrl: string
  pdfUrl: string
  importBatch: string
  importStatus: string
  isActive: boolean
  importedAt: string
}

export interface NutritionStandardOverview {
  version: NutritionStandardVersionSummary
  totalEntries: number
  tableCounts: Record<string, number>
  reviewCounts: Record<NutritionStandardReviewStatus, number>
}

export interface NutritionStandardEntry {
  id: string
  nutrientCode: string
  nutrientName: string
  nutrientNameEn: string
  fieldPath: string | null
  fediafName: string
  category: string
  sourceTable: NutritionStandardSourceTable
  sourceType: NutritionStandardSourceType
  pdfPage: number
  species: 'DOG' | 'CAT'
  lifeStage: string
  basis: string
  unit: string
  minValue: number | null
  maxValue: number | null
  recommendedValue: number | null
  maxType: string
  footnoteRefs: string[]
  notes: string | null
  sortOrder: number
  reviewStatus: NutritionStandardReviewStatus
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
}

export interface NutritionStandardReviewEvent {
  id: string
  entryId: string
  status: NutritionStandardReviewStatus
  note: string | null
  reviewedBy: string | null
  reviewedAt: string
}

export interface NutritionStandardEntryDetail extends NutritionStandardEntry {
  reviewEvents: NutritionStandardReviewEvent[]
}

export interface NutritionStandardEntryQuery {
  sourceTable?: string
  sourceType?: string
  lifeStage?: string
  category?: string
  reviewStatus?: NutritionStandardReviewStatus
  search?: string
}
```

- [ ] **Step 4: Create admin API wrapper**

Create `admin-web/src/api/nutritionStandards.ts`:

```ts
import api from './index'
import type {
  NutritionStandardEntry,
  NutritionStandardEntryDetail,
  NutritionStandardEntryQuery,
  NutritionStandardOverview,
  NutritionStandardReviewStatus
} from '@/types/nutritionStandard'

export const nutritionStandardApi = {
  getFediaf2025DogOverview: (): Promise<NutritionStandardOverview> =>
    api.get('/admin/nutrition-standards/fediaf-2025-dog/overview'),

  listFediaf2025DogEntries: (
    params?: NutritionStandardEntryQuery
  ): Promise<NutritionStandardEntry[]> =>
    api.get('/admin/nutrition-standards/fediaf-2025-dog/entries', { params }),

  getFediaf2025DogEntryDetail: (
    id: string
  ): Promise<NutritionStandardEntryDetail> =>
    api.get(`/admin/nutrition-standards/fediaf-2025-dog/entries/${id}`),

  updateFediaf2025DogEntryReview: (
    id: string,
    data: { status: NutritionStandardReviewStatus; note?: string }
  ): Promise<unknown> =>
    api.patch(`/admin/nutrition-standards/fediaf-2025-dog/entries/${id}/review`, data)
}
```

- [ ] **Step 5: Run static test**

Run:

```bash
node --test admin-web/tests/nutritionStandardApi.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-web/src/types/nutritionStandard.ts admin-web/src/api/nutritionStandards.ts admin-web/tests/nutritionStandardApi.test.js
git commit -m "feat: add nutrition standard admin api client"
```

---

### Task 5: Build Admin Read-Only Audit Page With Review Markers

**Files:**
- Create: `admin-web/src/views/NutritionStandards/FediafDogStandard.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`
- Test: `admin-web/tests/fediafDogStandardPage.test.js`

- [ ] **Step 1: Write failing page static test**

Create `admin-web/tests/fediafDogStandardPage.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('FEDIAF 2025 dog standard page is routed and visible in sidebar', () => {
  const routerSource = readFileSync(
    new URL('../src/router/index.ts', import.meta.url),
    'utf8'
  )
  const layoutSource = readFileSync(
    new URL('../src/layouts/MainLayout.vue', import.meta.url),
    'utf8'
  )

  assert.match(routerSource, /nutrition-standards\/fediaf-2025-dog/)
  assert.match(routerSource, /FediafDogStandard/)
  assert.match(layoutSource, /营养标准/)
  assert.match(layoutSource, /FEDIAF 2025 犬标准/)
})

test('FEDIAF 2025 dog standard page is read-only and supports review markers', () => {
  const pageSource = readFileSync(
    new URL('../src/views/NutritionStandards/FediafDogStandard.vue', import.meta.url),
    'utf8'
  )

  assert.match(pageSource, /FEDIAF 2025 犬标准/)
  assert.match(pageSource, /nutritionStandardApi\.getFediaf2025DogOverview/)
  assert.match(pageSource, /nutritionStandardApi\.listFediaf2025DogEntries/)
  assert.match(pageSource, /nutritionStandardApi\.updateFediaf2025DogEntryReview/)
  assert.match(pageSource, /标准值只读/)
  assert.match(pageSource, /已审核/)
  assert.match(pageSource, /有疑问/)
  assert.match(pageSource, /需修正/)
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.minValue"/)
  assert.doesNotMatch(pageSource, /v-model="scope\.row\.maxValue"/)
})
```

- [ ] **Step 2: Run failing static test**

Run:

```bash
node --test admin-web/tests/fediafDogStandardPage.test.js
```

Expected: FAIL because the page and route do not exist.

- [ ] **Step 3: Add route**

In `admin-web/src/router/index.ts`, add this child route near the ingredient/recipe routes:

```ts
      {
        path: 'nutrition-standards/fediaf-2025-dog',
        name: 'FediafDogStandard',
        component: () => import('@/views/NutritionStandards/FediafDogStandard.vue'),
        meta: { title: 'FEDIAF 2025 犬标准' }
      },
```

- [ ] **Step 4: Add sidebar menu**

In `admin-web/src/layouts/MainLayout.vue`, import `DocumentChecked` from `@element-plus/icons-vue` and add this menu item after `食谱管理`:

```vue
        <el-sub-menu index="nutrition-standards">
          <template #title>
            <el-icon><DocumentChecked /></el-icon>
            <span>营养标准</span>
          </template>
          <el-menu-item index="/nutrition-standards/fediaf-2025-dog">FEDIAF 2025 犬标准</el-menu-item>
        </el-sub-menu>
```

- [ ] **Step 5: Create page component**

Create `admin-web/src/views/NutritionStandards/FediafDogStandard.vue`. The component must:

- Load overview and entries on mount.
- Render version metadata and review counts.
- Provide filters for source table, source type, life stage, category, review status, and search.
- Render standard values as plain text.
- Allow review marker updates through a dialog.
- Never bind editable inputs to `minValue`, `maxValue`, `recommendedValue`, `unit`, `basis`, or `lifeStage`.

Use this component structure:

```vue
<template>
  <div class="fediaf-standard-page">
    <div class="page-header">
      <div>
        <h2>FEDIAF 2025 犬标准</h2>
        <p>标准值只读，仅支持审核标记和备注。</p>
      </div>
      <el-button :loading="loading" @click="loadData">刷新</el-button>
    </div>

    <el-row v-if="overview" :gutter="12" class="overview-row">
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">条目总数</div>
          <div class="metric-value">{{ overview.totalEntries }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">已审核</div>
          <div class="metric-value">{{ overview.reviewCounts.REVIEWED }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">有疑问</div>
          <div class="metric-value">{{ overview.reviewCounts.QUESTION }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never">
          <div class="metric-label">需修正</div>
          <div class="metric-value">{{ overview.reviewCounts.NEEDS_FIX }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="overview" shadow="never" class="version-card">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="标准名称">{{ overview.version.name }}</el-descriptions-item>
        <el-descriptions-item label="发布年月">{{ overview.version.publicationMonth }}</el-descriptions-item>
        <el-descriptions-item label="导入批次">{{ overview.version.importBatch }}</el-descriptions-item>
        <el-descriptions-item label="来源">
          <a :href="overview.version.pdfUrl" target="_blank" rel="noreferrer">官方 PDF</a>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filters">
        <el-form-item label="来源表">
          <el-select v-model="filters.sourceTable" clearable placeholder="全部" style="width: 150px">
            <el-option v-for="item in sourceTableOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="表类型">
          <el-select v-model="filters.sourceType" clearable placeholder="全部" style="width: 180px">
            <el-option label="核心推荐表" value="CORE_RECOMMENDATION" />
            <el-option label="Annex 7.8" value="ANNEX_7_8" />
          </el-select>
        </el-form-item>
        <el-form-item label="生命周期">
          <el-input v-model="filters.lifeStage" clearable placeholder="如 ADULT_MER_110" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="filters.category" clearable placeholder="如 MINERAL" />
        </el-form-item>
        <el-form-item label="审核">
          <el-select v-model="filters.reviewStatus" clearable placeholder="全部" style="width: 140px">
            <el-option label="未审核" value="UNREVIEWED" />
            <el-option label="已审核" value="REVIEWED" />
            <el-option label="有疑问" value="QUESTION" />
            <el-option label="需修正" value="NEEDS_FIX" />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索">
          <el-input v-model="filters.search" clearable placeholder="营养素" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadEntries">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="entries" v-loading="loading" border>
        <el-table-column prop="sourceTable" label="来源表" width="90" />
        <el-table-column prop="pdfPage" label="页码" width="70" />
        <el-table-column prop="nutrientName" label="营养素" min-width="130" />
        <el-table-column prop="nutrientCode" label="内部代码" min-width="150" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="lifeStage" label="生命周期" min-width="150" />
        <el-table-column prop="basis" label="口径" min-width="170" />
        <el-table-column prop="unit" label="单位" width="110" />
        <el-table-column label="最小值" width="100">
          <template #default="{ row }">{{ formatValue(row.minValue) }}</template>
        </el-table-column>
        <el-table-column label="最大值" width="100">
          <template #default="{ row }">{{ formatValue(row.maxValue) }}</template>
        </el-table-column>
        <el-table-column label="推荐值" width="100">
          <template #default="{ row }">{{ formatValue(row.recommendedValue) }}</template>
        </el-table-column>
        <el-table-column prop="reviewStatus" label="审核" width="110">
          <template #default="{ row }">
            <el-tag :type="reviewTagType(row.reviewStatus)">
              {{ reviewStatusLabel(row.reviewStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openReviewDialog(row)">审核标记</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="reviewDialogVisible" title="审核标记" width="520px">
      <el-form :model="reviewForm" label-width="90px">
        <el-form-item label="状态">
          <el-select v-model="reviewForm.status" style="width: 100%">
            <el-option label="已审核" value="REVIEWED" />
            <el-option label="有疑问" value="QUESTION" />
            <el-option label="需修正" value="NEEDS_FIX" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="reviewForm.note" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingReview" @click="saveReview">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { nutritionStandardApi } from '@/api/nutritionStandards'
import type {
  NutritionStandardEntry,
  NutritionStandardEntryQuery,
  NutritionStandardOverview,
  NutritionStandardReviewStatus
} from '@/types/nutritionStandard'

const sourceTableOptions = ['III-3a', 'III-3b', 'III-3c', 'VII-17a', 'VII-17b', 'VII-17c', 'VII-17d']

const overview = ref<NutritionStandardOverview | null>(null)
const entries = ref<NutritionStandardEntry[]>([])
const loading = ref(false)
const savingReview = ref(false)
const reviewDialogVisible = ref(false)
const selectedEntry = ref<NutritionStandardEntry | null>(null)

const filters = reactive<NutritionStandardEntryQuery>({})
const reviewForm = reactive<{
  status: Exclude<NutritionStandardReviewStatus, 'UNREVIEWED'>
  note: string
}>({
  status: 'REVIEWED',
  note: ''
})

function formatValue(value: number | null): string {
  return value === null || value === undefined ? '-' : String(value)
}

function reviewStatusLabel(status: NutritionStandardReviewStatus): string {
  const map: Record<NutritionStandardReviewStatus, string> = {
    UNREVIEWED: '未审核',
    REVIEWED: '已审核',
    QUESTION: '有疑问',
    NEEDS_FIX: '需修正'
  }
  return map[status]
}

function reviewTagType(status: NutritionStandardReviewStatus) {
  if (status === 'REVIEWED') return 'success'
  if (status === 'QUESTION') return 'warning'
  if (status === 'NEEDS_FIX') return 'danger'
  return 'info'
}

async function loadOverview() {
  overview.value = await nutritionStandardApi.getFediaf2025DogOverview()
}

async function loadEntries() {
  loading.value = true
  try {
    entries.value = await nutritionStandardApi.listFediaf2025DogEntries({ ...filters })
  } finally {
    loading.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    await Promise.all([loadOverview(), loadEntries()])
  } finally {
    loading.value = false
  }
}

function openReviewDialog(row: NutritionStandardEntry) {
  selectedEntry.value = row
  reviewForm.status = row.reviewStatus === 'UNREVIEWED' ? 'REVIEWED' : row.reviewStatus
  reviewForm.note = row.reviewNote || ''
  reviewDialogVisible.value = true
}

async function saveReview() {
  if (!selectedEntry.value) return
  savingReview.value = true
  try {
    await nutritionStandardApi.updateFediaf2025DogEntryReview(selectedEntry.value.id, {
      status: reviewForm.status,
      note: reviewForm.note
    })
    ElMessage.success('审核标记已保存')
    reviewDialogVisible.value = false
    await loadData()
  } finally {
    savingReview.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.fediaf-standard-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header h2 {
  margin: 0;
}

.page-header p {
  margin: 6px 0 0;
  color: #667085;
}

.metric-label {
  color: #667085;
  font-size: 13px;
}

.metric-value {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
}
</style>
```

- [ ] **Step 6: Run page static test**

Run:

```bash
node --test admin-web/tests/fediafDogStandardPage.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add admin-web/src/views/NutritionStandards/FediafDogStandard.vue admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue admin-web/tests/fediafDogStandardPage.test.js
git commit -m "feat: add fediaf 2025 dog standard review page"
```

---

### Task 6: Add FEDIAF 2025 Recipe Label Compatibility

**Files:**
- Modify: `backend/src/domain/recipe/enums.ts`
- Modify: `backend/src/label/label.service.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Modify: `miniapp/src/utils/label-mapping.ts`
- Modify: `miniapp/src/components/RecipeSnapshotModal.vue`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/recipe-diy/index.vue`
- Modify: `miniapp/src/pages/recipe-order/index.vue`
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Test: `admin-web/tests/fediafDogStandardPage.test.js`

- [ ] **Step 1: Extend the static test for labels**

Append this test to `admin-web/tests/fediafDogStandardPage.test.js`:

```js
test('FEDIAF 2025 label is available in admin recipe form and shared label maps', () => {
  const adminRecipeTypes = readFileSync(
    new URL('../src/types/recipe.ts', import.meta.url),
    'utf8'
  )
  const recipeForm = readFileSync(
    new URL('../src/views/Recipes/RecipeForm.vue', import.meta.url),
    'utf8'
  )

  assert.match(adminRecipeTypes, /FEDIAF_2025/)
  assert.match(recipeForm, /FEDIAF 2025/)
})
```

- [ ] **Step 2: Run failing label static test**

Run:

```bash
node --test admin-web/tests/fediafDogStandardPage.test.js
```

Expected: FAIL until label files are updated.

- [ ] **Step 3: Update backend recipe enum and label service**

In `backend/src/domain/recipe/enums.ts`, add:

```ts
  FEDIAF_2025 = 'FEDIAF_2025',
```

In `backend/src/label/label.service.ts`, add the map entry:

```ts
  FEDIAF_2025: 'FEDIAF 2025',
```

- [ ] **Step 4: Update admin recipe enum and form option**

In `admin-web/src/types/recipe.ts`, add:

```ts
  FEDIAF_2025 = 'FEDIAF_2025',
```

In `admin-web/src/views/Recipes/RecipeForm.vue`, add an option after FEDIAF 2024:

```vue
                  <el-option label="FEDIAF 2025" :value="NutritionStandard.FEDIAF_2025" />
```

- [ ] **Step 5: Update miniapp label maps**

Add `FEDIAF_2025` to every local `getNutritionStandardLabel` map in the listed miniapp files:

```ts
'FEDIAF_2025': 'FEDIAF 2025',
```

Update these files only for the label map:

- `miniapp/src/utils/label-mapping.ts`
- `miniapp/src/components/RecipeSnapshotModal.vue`
- `miniapp/src/pages/recipe-detail/index.vue`
- `miniapp/src/pages/recipe-diy/index.vue`
- `miniapp/src/pages/recipe-order/index.vue`
- `miniapp/src/pages/diy-sheet/index.vue`

- [ ] **Step 6: Run label static test**

Run:

```bash
node --test admin-web/tests/fediafDogStandardPage.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/domain/recipe/enums.ts backend/src/label/label.service.ts admin-web/src/types/recipe.ts admin-web/src/views/Recipes/RecipeForm.vue admin-web/tests/fediafDogStandardPage.test.js miniapp/src/utils/label-mapping.ts miniapp/src/components/RecipeSnapshotModal.vue miniapp/src/pages/recipe-detail/index.vue miniapp/src/pages/recipe-diy/index.vue miniapp/src/pages/recipe-order/index.vue miniapp/src/pages/diy-sheet/index.vue
git commit -m "feat: add fediaf 2025 recipe label support"
```

---

### Task 7: Final Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run backend targeted tests**

Run:

```bash
npm --prefix backend test -- tests/application/nutrition-standard/schema-models.spec.ts tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts tests/application/nutrition-standard/nutrition-standard.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run admin static tests**

Run:

```bash
node --test admin-web/tests/nutritionStandardApi.test.js admin-web/tests/fediafDogStandardPage.test.js
```

Expected: PASS.

- [ ] **Step 3: Run backend build**

Run:

```bash
npm --prefix backend run build
```

Expected: PASS.

- [ ] **Step 4: Run admin build**

Run:

```bash
npm --prefix admin-web run build
```

Expected: PASS.

- [ ] **Step 5: Run miniapp build because label maps were changed**

Run:

```bash
npm --prefix miniapp run build:mp-weixin
```

Expected: PASS. Tell the user that WeChat Developer Tools should open `miniapp/dist/build/mp-weixin`.

- [ ] **Step 6: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 7: Check backend endpoint authentication behavior**

Run:

```bash
cd backend && npm run start:check
curl -i http://127.0.0.1:3000/api/v1/admin/nutrition-standards/fediaf-2025-dog/overview
```

Expected: the server is available, and the unauthenticated request returns `401 Unauthorized`.

- [ ] **Step 8: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentionally modified files from this plan are present. Unrelated pre-existing miniapp changes must not be staged or reverted.

---

## Execution Notes

- The seed data transcription is the most accuracy-sensitive part. Preserve `sourceTable`, `pdfPage`, `footnoteRefs`, `basis`, `lifeStage`, and `unit` for every row.
- Keep FEDIAF standard values read-only in the admin page. Review marker writes must only create `NutritionStandardReviewEvent` records.
- Do not edit historical migration files.
- Do not silently migrate old recipes to `FEDIAF_2025`; only add the new label option.
- If implementation touches `miniapp/`, final verification must include `npm --prefix miniapp run build:mp-weixin` and the final answer must tell the user to open `miniapp/dist/build/mp-weixin` in WeChat Developer Tools.
