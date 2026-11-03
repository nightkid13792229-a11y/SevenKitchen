# Adding Standard Ingredients Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a project-only Codex Skill that lets agents add new FOOD and SUPPLEMENT standard ingredients through a controlled, auditable workflow. The Skill must check local and production database alignment before any local write, collect source-backed nutrition data, audit units and canine/FEDIAF canonical values, write only to the local development database after explicit confirmation, and export a production migration package containing only the newly added ingredient-related data.

**Architecture:** The Skill lives under `skills/adding-standard-ingredients/` and contains the operator-facing protocol, source policy references, templates, and thin CLI scripts. Reusable validation and data-packaging logic lives in `backend/src/application/standard-ingredient-import/` with Jest coverage in `backend/tests/application/standard-ingredient-import/`. The Skill scripts call backend application services through `ts-node` so the workflow reuses Prisma schema, enum names, and existing vitamin conversion utilities instead of duplicating business rules in markdown.

**Tech Stack:** Codex Skills markdown, Python skill validation scripts, Node.js/TypeScript, NestJS application conventions, Prisma Client, Jest, existing ingredient/nutrition domain utilities, JSON manifests, SQL preview output for reviewed production migration packages.

---

## Source Spec

Implement against the approved design:

- `/Users/zhaochen/Documents/SevenKitchen/docs/superpowers/specs/2026-06-16-adding-standard-ingredients-skill-design.md`

Key decisions from that spec:

- FOOD and SUPPLEMENT are in scope for v1; PACKAGING is out of scope.
- FOOD standard ingredients are logical nutrition objects; procurement variants belong in `ProcurementSku`.
- SUPPLEMENT standard ingredients are concrete products; procurement SKU creation is blocked.
- Before any local development database write, local and production database structure plus critical reference data must be checked.
- Production migration must contain only newly added ingredient-related records, never a whole database sync.
- Nutrition sources are constrained to approved official databases, with CFCT as fallback only.
- Multi-source field supplementation is allowed only after basis, unit, parent-child, and macro/energy consistency checks pass.
- Completeness scoring must prefer sources with both raw/cooked profiles and higher FEDIAF 2025 essential nutrient coverage.
- Vitamins A, D, and E require canine/FEDIAF unit review; existing backend A/E conversion utilities are the implementation truth.
- Supplement intake should request packaging photos when the user has not provided photos or equivalent label evidence.

## File Structure Map

Existing project areas to use:

- `/Users/zhaochen/Documents/SevenKitchen/skills/`
  - Project-only Skills live here. Existing example: `skills/production-ssh/`.
- `/Users/zhaochen/Documents/SevenKitchen/backend/prisma/schema.prisma`
  - Existing models: `Ingredient`, `ProcurementSku`, `NutritionFood`, `NutritionFoodMapping`, tags, inventory logs.
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/domain/ingredient/`
  - Existing nutrition field catalog and vitamin conversion helpers.
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/nutrition-standard/`
  - Existing FEDIAF 2025 dog nutrient data and nutrient value resolver.
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/nutrition-food/`
  - Existing `NutritionFood` service behavior and mapping rules.
- `/Users/zhaochen/Documents/SevenKitchen/backend/tests/`
  - Existing Jest test layout.

New files to create:

- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/SKILL.md`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/agents/openai.yaml`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/references/source-policy.md`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/references/nutrition-audit.md`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/references/operator-checklist.md`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/assets/ingredient-import-template.food.json`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/assets/ingredient-import-template.supplement.json`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/check-db-alignment.ts`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/prepare-ingredient-import.ts`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/apply-local-ingredient-import.ts`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts`
- `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/build-production-migration-package.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/db-alignment.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/ingredient-import-manifest.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/source-policy.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/nutrition-audit.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/local-ingredient-import.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/production-package.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/index.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/source-policy.spec.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/db-alignment.spec.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/local-ingredient-import.spec.ts`
- `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/production-package.spec.ts`

Existing files to inspect before changing imports or script commands:

- `/Users/zhaochen/Documents/SevenKitchen/backend/package.json`
- `/Users/zhaochen/Documents/SevenKitchen/backend/tsconfig.json`
- `/Users/zhaochen/Documents/SevenKitchen/backend/jest.config.js`
- `/Users/zhaochen/Documents/SevenKitchen/backend/prisma/schema.prisma`
- `/Users/zhaochen/Documents/SevenKitchen/docs/DATABASE_NAMING_CONVENTIONS.md`

## Implementation Tasks

### 1. Preflight And Skill Skeleton

- [ ] Read `/Users/zhaochen/Documents/SevenKitchen/docs/DATABASE_NAMING_CONVENTIONS.md` completely before touching any backend database-related logic.
- [ ] Read `/Users/zhaochen/.codex/skills/.system/skill-creator/references/openai_yaml.md` before generating or editing `agents/openai.yaml`.
- [ ] Confirm the current branch and worktree:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git status --short
git branch --show-current
```

- [ ] If unrelated user changes exist, leave them untouched and continue only when they do not conflict with the files in this plan.
- [ ] Create the Skill skeleton with the system generator:

```bash
python3 /Users/zhaochen/.codex/skills/.system/skill-creator/scripts/init_skill.py adding-standard-ingredients \
  --path /Users/zhaochen/Documents/SevenKitchen/skills \
  --resources scripts,references,assets \
  --interface display_name="Adding Standard Ingredients" \
  --interface short_description="Controlled project workflow for adding FOOD and SUPPLEMENT standard ingredients with source-backed nutrition, DB alignment checks, local-only draft writes, and production migration packages." \
  --interface default_prompt="Use this project-only Skill when adding a new FOOD or SUPPLEMENT standard ingredient to SevenKitchen."
```

- [ ] Run quick validation to prove the generated skeleton is structurally valid before custom edits:

```bash
python3 /Users/zhaochen/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients
```

- [ ] Do not change application code in this task.

### 2. Manifest Contract With Failing Tests First

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts`.
- [ ] The tests must fail before implementation and cover these contract rules:
  - A manifest must declare `version: 1`.
  - `ingredient.type` must be `FOOD` or `SUPPLEMENT`; `PACKAGING` is rejected.
  - `operationMode` must be `local-draft` or `production-package`; whole database migration flags are rejected.
  - FOOD may include `procurementSkus`; SUPPLEMENT must not.
  - FOOD must include nutrition profiles and source candidates.
  - SUPPLEMENT must include package evidence metadata; if no package image or equivalent label source exists, the manifest is invalid with a photo prompt code.
  - Empty, null, non-numeric, and zero nutrient values count as missing unless the field is explicitly marked as a measured zero.
  - Local writes require a passing DB alignment report id and `operatorConfirmation.localWriteApproved === true`.
  - Production package export requires `operatorConfirmation.productionPackageApproved === true`.

Test shape:

```ts
import {
  validateIngredientImportManifest,
  type IngredientImportManifest,
} from '@/application/standard-ingredient-import/ingredient-import-manifest';

describe('validateIngredientImportManifest', () => {
  it('rejects PACKAGING because v1 only supports FOOD and SUPPLEMENT', () => {
    const manifest = makeFoodManifest({
      ingredient: { type: 'PACKAGING' as never, name: 'Box' },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INGREDIENT_TYPE_NOT_SUPPORTED' }),
    );
  });

  it('rejects whole database migration modes', () => {
    const manifest = makeFoodManifest({
      operationMode: 'whole-database-sync' as never,
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'WHOLE_DATABASE_MIGRATION_FORBIDDEN' }),
    );
  });

  it('requires supplement package evidence before extraction can proceed', () => {
    const manifest = makeSupplementManifest({
      evidence: { packageImages: [], labelSources: [] },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'SUPPLEMENT_PACKAGE_PHOTO_REQUIRED' }),
    );
  });
});
```

- [ ] Add full helper fixtures inside the spec file using complete sample manifests for one FOOD and one SUPPLEMENT. Do not depend on external fixture files for these first tests.
- [ ] Run the focused test and confirm it fails because the module does not exist:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts --runInBand
```

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/ingredient-import-manifest.ts` with exported TypeScript types and `validateIngredientImportManifest`.
- [ ] Implement the validator as a pure function. It must return all errors, not stop at the first error.

Core implementation contract:

```ts
export type IngredientImportType = 'FOOD' | 'SUPPLEMENT';
export type IngredientImportMode = 'local-draft' | 'production-package';

export interface ManifestValidationIssue {
  code:
    | 'INVALID_VERSION'
    | 'INGREDIENT_TYPE_NOT_SUPPORTED'
    | 'WHOLE_DATABASE_MIGRATION_FORBIDDEN'
    | 'FOOD_NUTRITION_REQUIRED'
    | 'SUPPLEMENT_PACKAGE_PHOTO_REQUIRED'
    | 'SUPPLEMENT_PROCUREMENT_SKU_FORBIDDEN'
    | 'LOCAL_WRITE_ALIGNMENT_REQUIRED'
    | 'LOCAL_WRITE_CONFIRMATION_REQUIRED'
    | 'PRODUCTION_PACKAGE_CONFIRMATION_REQUIRED'
    | 'NUTRIENT_VALUE_MISSING';
  path: string;
  message: string;
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: ManifestValidationIssue[];
  warnings: ManifestValidationIssue[];
}
```

- [ ] Export the module from `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/index.ts`.
- [ ] Re-run the focused test until it passes.

### 3. Source Policy Scorer

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/source-policy.spec.ts`.
- [ ] Write failing tests for approved source handling:
  - USDA, NZFCD, NEVO, MEXT, AFCD, AUSNUT, CNF, CoFID, and Ciqual are accepted as primary candidates.
  - CFCT is accepted only as fallback when no primary source candidate meets semantic and completeness thresholds.
  - Unofficial scraped pages, marketplaces, blogs, and LLM-generated nutrient summaries are rejected as nutrition sources.
  - Source candidates must declare state tags such as raw, cooked, dried, peeled, unpeeled, oil, powder, or prepared.
  - Raw/cooked pair availability gives a completeness preference but does not override a semantic mismatch.
  - A cooked profile cannot satisfy a raw ingredient request unless the operator explicitly changes the requested state.

Test expectations:

```ts
import {
  rankNutritionSourceCandidates,
  type NutritionSourceCandidate,
} from '@/application/standard-ingredient-import/source-policy';

describe('rankNutritionSourceCandidates', () => {
  it('keeps CFCT behind primary official sources', () => {
    const candidates: NutritionSourceCandidate[] = [
      makeCandidate({ source: 'CFCT', essentialCoveragePercent: 91 }),
      makeCandidate({ source: 'USDA_FDC', essentialCoveragePercent: 82 }),
    ];

    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates,
    });

    expect(ranked[0].source).toBe('USDA_FDC');
    expect(ranked[1].fallbackOnly).toBe(true);
  });

  it('rejects unofficial nutrition pages', () => {
    const ranked = rankNutritionSourceCandidates({
      requestedState: 'raw',
      candidates: [
        makeCandidate({ source: 'BLOG', sourceUrl: 'https://example.com/food' }),
      ],
    });

    expect(ranked[0].accepted).toBe(false);
    expect(ranked[0].reasons).toContain('SOURCE_NOT_APPROVED');
  });
});
```

- [ ] Run the focused test and confirm it fails because implementation is missing.
- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/source-policy.ts`.
- [ ] Define approved source ids:

```ts
export type ApprovedNutritionSource =
  | 'USDA_FDC'
  | 'NZFCD'
  | 'NEVO'
  | 'MEXT'
  | 'AFCD'
  | 'AUSNUT'
  | 'CNF'
  | 'COFID'
  | 'CIQUAL'
  | 'CFCT';
```

- [ ] Implement ranking with deterministic score components:
  - `+1000` for primary approved official sources.
  - `+100` for exact semantic state match.
  - `+60` for same-source raw/cooked pair availability.
  - `+0.5 * essentialCoveragePercent`.
  - `-500` for CFCT fallback-only status.
  - reject candidates with unapproved source ids.
  - reject candidates whose state conflicts with the requested state.
- [ ] Add JSDoc explaining that the scores are selection aids and do not replace operator review.
- [ ] Re-run the focused test until it passes.

### 4. Nutrition Audit And Canine Canonicalization

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts`.
- [ ] Write failing tests for completeness and consistency:
  - FEDIAF 2025 essential nutrient coverage treats null, empty string, non-numeric, and zero as missing.
  - Explicit measured zero is allowed only when the source row marks `measuredZero: true`.
  - `linoleicAcidG` greater than `fatG` is a blocking issue.
  - sum of EPA, DHA, and DPA greater than total fat is a blocking issue.
  - amino acid grams greater than protein grams is a blocking issue.
  - macro energy estimate outside configured tolerance is a review issue.
  - vitamin A values call the existing `vitamin-a-conversion.ts` helper and retain source-form metadata.
  - vitamin E values call the existing `vitamin-e-conversion.ts` helper and retain source-form metadata.
  - vitamin D ordinary D2/D3 uses `1 ug = 40 IU`; special forms or unclear forms are review-only and not auto-normalized.
  - multi-source field supplementation refuses a field when it violates parent-child constraints.

Representative test:

```ts
import {
  auditNutritionProfileForImport,
  mergeSupplementalNutritionFields,
} from '@/application/standard-ingredient-import/nutrition-audit';

describe('auditNutritionProfileForImport', () => {
  it('blocks LA values that exceed total fat', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Chicken fat sample',
      nutrients: {
        fatG: { value: 10, unit: 'g' },
        linoleicAcidG: { value: 11, unit: 'g' },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'CHILD_NUTRIENT_EXCEEDS_PARENT' }),
    );
  });

  it('does not merge supplemental fields that break existing totals', () => {
    const result = mergeSupplementalNutritionFields({
      base: {
        fatG: { value: 10, unit: 'g', source: 'USDA_FDC' },
      },
      supplemental: {
        linoleicAcidG: { value: 11, unit: 'g', source: 'MEXT' },
      },
    });

    expect(result.acceptedFields).toEqual({});
    expect(result.rejectedFields.linoleicAcidG.reason).toBe(
      'CHILD_NUTRIENT_EXCEEDS_PARENT',
    );
  });
});
```

- [ ] Run the focused test and confirm it fails because implementation is missing.
- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/nutrition-audit.ts`.
- [ ] Import existing project utilities:
  - `/Users/zhaochen/Documents/SevenKitchen/backend/src/domain/ingredient/vitamin-a-conversion.ts`
  - `/Users/zhaochen/Documents/SevenKitchen/backend/src/domain/ingredient/vitamin-e-conversion.ts`
  - `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts`
- [ ] Implement `auditNutritionProfileForImport` as a pure function returning:

```ts
export interface NutritionImportAuditResult {
  essentialCoveragePercent: number;
  presentEssentialNutrients: string[];
  missingEssentialNutrients: string[];
  blockingIssues: NutritionAuditIssue[];
  reviewIssues: NutritionAuditIssue[];
  normalizedNutrients: Record<string, NormalizedNutrientValue>;
}
```

- [ ] Implement parent-child checks:
  - `linoleicAcidG <= fatG`
  - `alphaLinolenicAcidG <= fatG`
  - `arachidonicAcidG <= fatG`
  - `epaG + dhaG + dpaG <= fatG`
  - all amino-acid gram fields must be `<= proteinG`
  - ash minerals must not sum above `ashG` when `ashG` exists
- [ ] Implement macro/energy sanity using Atwater estimate:
  - protein `4 kcal/g`
  - carbohydrate `4 kcal/g`
  - fat `9 kcal/g`
  - block only if impossible negative values exist
  - emit review issue if source energy differs by more than 25 percent and more than 30 kcal/100g
- [ ] Implement vitamin D normalization in this module:

```ts
const MICROGRAM_TO_IU_VITAMIN_D = 40;
```

Only accept source forms `vitamin_d2_ergocalciferol`, `vitamin_d3_cholecalciferol`, or `total_vitamin_d_d2_d3`. Emit review issue `VITAMIN_D_FORM_REVIEW_REQUIRED` for all other forms.

- [ ] Re-run the focused test until it passes.

### 5. Database Alignment Checker

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/db-alignment.spec.ts`.
- [ ] Write failing pure-function tests for comparing local and production snapshots:
  - identical Prisma migration history passes.
  - production missing a local migration fails.
  - local missing a production migration fails.
  - schema hash mismatch fails.
  - critical reference data mismatch fails for nutrition standards, ingredient tags, and nutrient aliases.
  - row count differences in non-critical transaction tables are warnings only.

Test shape:

```ts
import {
  compareDatabaseAlignmentSnapshots,
  type DatabaseAlignmentSnapshot,
} from '@/application/standard-ingredient-import/db-alignment';

describe('compareDatabaseAlignmentSnapshots', () => {
  it('fails when production does not have the same migration history', () => {
    const local = makeSnapshot({ migrations: ['202606010001_a', '202606020001_b'] });
    const production = makeSnapshot({ migrations: ['202606010001_a'] });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'PRODUCTION_MISSING_LOCAL_MIGRATION' }),
    );
  });
});
```

- [ ] Run the focused test and confirm it fails because implementation is missing.
- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/db-alignment.ts`.
- [ ] Implement pure comparison functions first.
- [ ] Add Prisma-backed snapshot collection helpers that read:
  - `_prisma_migrations`
  - a schema hash derived from `backend/prisma/schema.prisma`
  - `NutritionStandard`
  - nutrient alias or nutrition field catalog data used by the recipe designer
  - `IngredientTag` rows used by ingredient classification
- [ ] Return this shape:

```ts
export interface DatabaseAlignmentResult {
  id: string;
  checkedAt: string;
  ok: boolean;
  localDatabaseLabel: string;
  productionDatabaseLabel: string;
  blockingIssues: DatabaseAlignmentIssue[];
  warnings: DatabaseAlignmentIssue[];
}
```

- [ ] The `id` must be deterministic for the compared snapshot contents, using a short SHA-256 hash.
- [ ] Do not execute any writes in this module.
- [ ] Re-run the focused test until it passes.

### 6. Local Import Application Safety

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/local-ingredient-import.spec.ts`.
- [ ] Write failing tests for local apply behavior:
  - refuses to run when DB alignment is not ok.
  - refuses to run when operator local-write confirmation is false.
  - refuses SUPPLEMENT manifests that include procurement SKUs.
  - creates FOOD in a transaction with `Ingredient`, `NutritionFood`, `NutritionFoodMapping`, tags, and optional `ProcurementSku`.
  - creates SUPPLEMENT in a transaction with `Ingredient`, tags, and package evidence metadata stored in `properties`.
  - does not overwrite an existing standard ingredient unless the manifest declares an explicit `updateExistingIngredientId`.
  - writes an import audit record to a JSON file path passed by the caller, not into production tables.

- [ ] Use Prisma mock or a transaction spy consistent with existing backend tests. Do not require a real database for the unit test.
- [ ] Run the focused test and confirm it fails because implementation is missing.
- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/local-ingredient-import.ts`.
- [ ] Implement a single exported function:

```ts
export async function applyLocalIngredientImport(input: {
  prisma: PrismaClientLike;
  manifest: IngredientImportManifest;
  alignment: DatabaseAlignmentResult;
  auditOutputPath: string;
  now?: Date;
}): Promise<LocalIngredientImportResult>
```

- [ ] Require `alignment.ok === true` and matching `manifest.databaseAlignment.id`.
- [ ] Call `validateIngredientImportManifest` before any Prisma write.
- [ ] Call `auditNutritionProfileForImport` for FOOD manifests and stop on blocking issues.
- [ ] Use one Prisma transaction for all rows in the local apply.
- [ ] For FOOD:
  - create `Ingredient` with `type: 'FOOD'`.
  - create one or more `NutritionFood` rows for accepted source profiles.
  - create `NutritionFoodMapping` with exactly one `isPrimary: true` mapping.
  - create `ProcurementSku` rows only when provided and only for FOOD.
  - keep source metadata, raw/cooked state, and audit results in `NutritionFood.source` or existing metadata fields according to current schema.
- [ ] For SUPPLEMENT:
  - create `Ingredient` with `type: 'SUPPLEMENT'`.
  - store brand, product model, dosage form, package image paths, serving size, extracted nutrient label values, and evidence notes in `Ingredient.properties`.
  - do not create `ProcurementSku`.
- [ ] Write a deterministic JSON audit file with created local ids, source ids, coverage scores, unit conversions, blocking/review issue summaries, and the exact manifest hash.
- [ ] Re-run the focused test until it passes.

### 7. Production Package Builder

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/tests/application/standard-ingredient-import/production-package.spec.ts`.
- [ ] Write failing tests for package export behavior:
  - refuses export without production-package confirmation.
  - refuses export when local apply audit is missing.
  - includes only records created by the import audit.
  - includes `Ingredient`, `NutritionFood`, `NutritionFoodMapping`, `IngredientTagAssignment`, and FOOD-only `ProcurementSku` records when present.
  - never emits SQL for unrelated existing rows.
  - emits a rollback file that deletes only records listed in the package manifest.
  - emits a human-readable review summary with source coverage, raw/cooked pair status, unit audit status, and supplement evidence status.

Test shape:

```ts
import { buildProductionMigrationPackage } from '@/application/standard-ingredient-import/production-package';

describe('buildProductionMigrationPackage', () => {
  it('contains only ids from the local import audit', async () => {
    const pkg = await buildProductionMigrationPackage({
      prisma: makePrismaWithRows({
        ingredients: [{ id: 'new-id' }, { id: 'unrelated-id' }],
      }),
      manifest: makeFoodManifest({
        operationMode: 'production-package',
        operatorConfirmation: { productionPackageApproved: true },
      }),
      localImportAudit: makeAudit({ ingredientIds: ['new-id'] }),
      outputDir: '/tmp/sevenkitchen-standard-ingredient-package',
    });

    expect(pkg.sql).toContain('new-id');
    expect(pkg.sql).not.toContain('unrelated-id');
  });
});
```

- [ ] Run the focused test and confirm it fails because implementation is missing.
- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/backend/src/application/standard-ingredient-import/production-package.ts`.
- [ ] Implement package generation as pure data extraction plus file rendering.
- [ ] Output files:
  - `manifest.json`
  - `review-summary.md`
  - `up.sql`
  - `down.sql`
  - `source-audit.json`
  - `unit-audit.json`
- [ ] Use deterministic ordering:
  - parent `Ingredient`
  - `NutritionFood`
  - `NutritionFoodMapping`
  - `IngredientTagAssignment`
  - `ProcurementSku`
- [ ] In `down.sql`, reverse the order.
- [ ] Include a top comment in `up.sql`:

```sql
-- SevenKitchen standard ingredient package
-- Scope: newly added ingredient-related records only
-- Whole database migration: forbidden
```

- [ ] Re-run the focused test until it passes.

### 8. Skill Scripts

- [ ] Implement `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/check-db-alignment.ts`.
- [ ] CLI contract:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/check-db-alignment.ts \
  --local-env .env \
  --production-env .env.production.readonly \
  --out ../.standard-ingredient-import/alignment.json
```

- [ ] Script behavior:
  - Load local and production connection info from explicit env file paths.
  - Require production connection to be read-only or explicitly labeled readonly in the env var name/path.
  - Collect snapshots using `db-alignment.ts`.
  - Print a concise pass/fail summary.
  - Write the full alignment report JSON to `--out`.
  - Exit nonzero on blocking issues.

- [ ] Implement `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/prepare-ingredient-import.ts`.
- [ ] CLI contract:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/prepare-ingredient-import.ts \
  --type FOOD \
  --name "duck egg" \
  --state raw \
  --out ../.standard-ingredient-import/duck-egg.manifest.json
```

- [ ] Script behavior:
  - Create a manifest draft from `assets/ingredient-import-template.food.json` or `assets/ingredient-import-template.supplement.json`.
  - For SUPPLEMENT, print a required prompt asking for package photos or equivalent label evidence when none is provided.
  - Do not write to any database.

- [ ] Implement `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts`.
- [ ] CLI contract:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts \
  --manifest ../.standard-ingredient-import/duck-egg.manifest.json \
  --out ../.standard-ingredient-import/duck-egg.audit.json
```

- [ ] Script behavior:
  - Validate the manifest.
  - Rank source candidates.
  - Audit completeness and units.
  - Print blocking issues first.
  - Exit nonzero when blocking issues exist.

- [ ] Implement `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/apply-local-ingredient-import.ts`.
- [ ] CLI contract:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-local-ingredient-import.ts \
  --manifest ../.standard-ingredient-import/duck-egg.manifest.json \
  --alignment ../.standard-ingredient-import/alignment.json \
  --audit-out ../.standard-ingredient-import/duck-egg.local-apply.json
```

- [ ] Script behavior:
  - Require `operatorConfirmation.localWriteApproved === true` in the manifest.
  - Refuse apply when alignment is absent, stale, or not ok.
  - Call `applyLocalIngredientImport`.
  - Print created local record ids.

- [ ] Implement `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/scripts/build-production-migration-package.ts`.
- [ ] CLI contract:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/build-production-migration-package.ts \
  --manifest ../.standard-ingredient-import/duck-egg.manifest.json \
  --local-audit ../.standard-ingredient-import/duck-egg.local-apply.json \
  --out-dir ../.standard-ingredient-import/duck-egg-production-package
```

- [ ] Script behavior:
  - Require `operatorConfirmation.productionPackageApproved === true`.
  - Call `buildProductionMigrationPackage`.
  - Print the output directory and package file list.
  - Do not connect to or mutate production.

- [ ] Run `npm test -- tests/application/standard-ingredient-import --runInBand` after scripts compile.

### 9. Skill Markdown And References

- [ ] Replace generated `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/SKILL.md` with a concise skill instruction file.
- [ ] The Skill must contain these sections:
  - Purpose
  - When to Use
  - Non-Negotiable Safety Gates
  - FOOD Workflow
  - SUPPLEMENT Workflow
  - Nutrition Source Policy
  - Completeness And Unit Audit
  - Local Write Rules
  - Production Package Rules
  - User-Facing Communication

- [ ] Mandatory Skill behavior:
  - Ask for the ingredient type if the request is ambiguous.
  - Ask for package photos or label evidence for SUPPLEMENT when not provided.
  - Browse or use official source APIs/pages for current nutrition source data; cite source links in the user-facing summary.
  - Never invent nutrition values.
  - Never write to local DB unless DB alignment passes and the user confirms the local write.
  - Never migrate an entire database.
  - Never apply anything to production directly.
  - Treat CFCT as fallback only.
  - Use existing vitamin A/E utilities and the vitamin D rule before comparing to FEDIAF.
  - Explain decisions to the user in business language.

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/references/source-policy.md` with:
  - Approved primary source order: USDA FDC, NZFCD, NEVO, MEXT, AFCD/AUSNUT, CNF, CoFID, Ciqual.
  - Fallback source: CFCT only after primary sources fail matching or completeness.
  - Rejected sources: blogs, marketplaces, brand marketing pages for whole-food nutrition, LLM summaries, crowd-sourced databases unless the user explicitly approves a manual exception.
  - Matching rules for raw/cooked, dried/fresh, peeled/unpeeled, oil/powder, and prepared foods.
  - Same-source raw/cooked pair preference.

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/references/nutrition-audit.md` with:
  - FEDIAF 2025 essential coverage calculation rule.
  - Empty/null/non-numeric/zero-as-missing rule.
  - Multi-source field supplementation guardrails.
  - Parent-child nutrient constraints.
  - Vitamin A, D, and E canine canonicalization requirements.
  - Unit audit checklist.

- [ ] Create `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/references/operator-checklist.md` with:
  - Pre-write DB alignment check.
  - Source evidence review.
  - Completeness review.
  - Unit conversion review.
  - Local apply confirmation.
  - Production package review.

- [ ] Create manifest schema and templates:
  - `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json`
  - `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/assets/ingredient-import-template.food.json`
  - `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/assets/ingredient-import-template.supplement.json`

- [ ] The FOOD template must include:
  - `ingredient.type: "FOOD"`
  - requested raw/cooked state fields
  - source candidates array
  - nutrition profile entries as empty objects, not fabricated values
  - optional procurement SKUs array
  - operator confirmations set to false

- [ ] The SUPPLEMENT template must include:
  - `ingredient.type: "SUPPLEMENT"`
  - brand/product fields
  - package evidence arrays
  - serving size and active nutrient label fields
  - no procurement SKU array
  - operator confirmations set to false

- [ ] Update `/Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients/agents/openai.yaml` with the display name, short description, and default prompt generated from the approved wording. Keep it valid YAML and do not add unrelated agent metadata.

### 10. Validation, Review, And Commit

- [ ] Run the standard ingredient import test suite:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/standard-ingredient-import --runInBand
```

- [ ] Run focused existing tests that guard reused behavior:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/domain/ingredient/vitamin-a-conversion.spec.ts tests/domain/ingredient/vitamin-e-conversion.spec.ts tests/domain/ingredient/nutrition-field-catalog.spec.ts --runInBand
npm test -- tests/application/ingredient/procurement-sku.service.spec.ts tests/application/nutrition-food/nutrition-food.service.spec.ts --runInBand
```

- [ ] Run TypeScript validation if this project exposes a type-check command in `backend/package.json`; otherwise run the narrow Jest suites above and record that there is no dedicated type-check script.
- [ ] Validate the Skill:

```bash
python3 /Users/zhaochen/.codex/skills/.system/skill-creator/scripts/quick_validate.py /Users/zhaochen/Documents/SevenKitchen/skills/adding-standard-ingredients
```

- [ ] Perform a skill pressure review in a fresh context or subagent:
  - Request adding a FOOD ingredient that has USDA and CFCT candidates; verify CFCT is not selected first.
  - Request adding a SUPPLEMENT without photos; verify the Skill asks for packaging photos or label evidence.
  - Provide nutrition data where LA exceeds total fat; verify the Skill blocks the merge.
  - Ask whether production migration moves all libraries; verify the Skill says only the new ingredient-related package is exported.

- [ ] Inspect changed files:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git diff --stat
git diff -- skills/adding-standard-ingredients backend/src/application/standard-ingredient-import backend/tests/application/standard-ingredient-import
```

- [ ] Commit only the Skill and standard-ingredient-import implementation files:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git add skills/adding-standard-ingredients backend/src/application/standard-ingredient-import backend/tests/application/standard-ingredient-import
git commit -m "feat: add standard ingredient import skill"
```

## Self-Review Checklist For The Implementer

- [ ] The Skill is project-only and lives under `/Users/zhaochen/Documents/SevenKitchen/skills/`.
- [ ] No production write path exists.
- [ ] Local DB writes are impossible without a passing alignment report and explicit user confirmation.
- [ ] Production export is package-scoped to new ingredient-related records only.
- [ ] FOOD and SUPPLEMENT semantics match the approved design.
- [ ] Supplement flow prompts for photos or equivalent label evidence.
- [ ] CFCT is fallback-only.
- [ ] Source selection checks semantic state and completeness, not only text name similarity.
- [ ] FEDIAF coverage counts null, empty, non-numeric, and zero as missing unless measured zero is explicitly documented.
- [ ] Multi-source supplementation refuses impossible parent-child nutrient values.
- [ ] Vitamin A/E use existing backend converters; vitamin D applies the explicit `1 ug = 40 IU` rule only for ordinary D2/D3 forms.
- [ ] Unit audit status appears in both local audit output and production package review summary.
- [ ] Tests prove the safety gates before implementation is considered complete.
