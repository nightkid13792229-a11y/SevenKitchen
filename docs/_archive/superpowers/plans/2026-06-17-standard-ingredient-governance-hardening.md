# Standard Ingredient Governance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make standard ingredient creation impossible to run with fake production DB alignment, incomplete source search, or ad-hoc canine nutrient conversion rules.

**Architecture:** Strengthen the existing standard ingredient import boundary instead of adding a separate workflow. The backend owns typed validators and deterministic audit functions; the project skill scripts call those validators and refuse local writes or production packages when a hard gate fails. The skill docs and manifest templates become operator-facing wrappers around the same backend rules.

**Tech Stack:** NestJS/TypeScript backend, Prisma PostgreSQL client, Jest tests, local Codex skill scripts under `skills/adding-standard-ingredients`.

---

## File Structure

- Modify `backend/src/application/standard-ingredient-import/db-alignment.ts`: add production read-only connection safety checks and blocking issue codes.
- Modify `skills/adding-standard-ingredients/scripts/check-db-alignment.ts`: load local and production URLs once, reject fake readonly config before collecting alignment snapshots.
- Modify `backend/tests/application/standard-ingredient-import/db-alignment.spec.ts`: cover localhost, identical URLs, write privilege, and readonly-pass cases.
- Modify `backend/src/application/standard-ingredient-import/source-policy.ts`: add required primary-source search coverage validation.
- Modify `backend/src/application/standard-ingredient-import/ingredient-import-manifest.ts`: add typed `sourceSearchLog` evidence and validation errors.
- Modify `backend/tests/application/standard-ingredient-import/source-policy.spec.ts`: cover full-source evidence, USDA-only rejection, and CFCT fallback evidence.
- Modify `backend/tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts`: cover FOOD manifests with and without required source search evidence.
- Modify `skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json`: require `sourceSearchLog` for FOOD manifests.
- Modify `skills/adding-standard-ingredients/assets/ingredient-import-template.food.json`: include all required source search entries.
- Modify `skills/adding-standard-ingredients/references/source-policy.md`: document the full-source search gate.
- Modify `backend/src/domain/ingredient/vitamin-a-conversion.ts`, `backend/src/domain/ingredient/vitamin-e-conversion.ts`, and `backend/src/application/standard-ingredient-import/nutrition-audit.ts`: keep existing conversion logic but expose versioned conversion metadata consistently.
- Create `backend/src/domain/ingredient/canine-conversion-policy.ts`: central, versioned policy metadata for A/E/D conversion.
- Create `backend/tests/domain/ingredient/canine-conversion-policy.spec.ts`: lock the conversion policy version and factors.
- Modify `skills/adding-standard-ingredients/references/nutrition-audit.md`: document fixed canine conversion versioning and when it may be upgraded.
- Modify `backend/src/application/standard-ingredient-import/nutrition-audit.ts`: expose coverage denominator/list in audit result.
- Modify `backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts`: lock the 46-item coverage denominator and missing-list behavior.
- Modify `skills/adding-standard-ingredients/references/operator-checklist.md`: add operator checks for readonly production config, source search log, conversion policy version, and 46-item coverage report.

---

### Task 1: Enforce Real Production Readonly DB Configuration

**Files:**
- Modify: `backend/src/application/standard-ingredient-import/db-alignment.ts`
- Modify: `skills/adding-standard-ingredients/scripts/check-db-alignment.ts`
- Test: `backend/tests/application/standard-ingredient-import/db-alignment.spec.ts`

- [ ] **Step 1: Add failing tests for production connection safety**

Append these tests to `backend/tests/application/standard-ingredient-import/db-alignment.spec.ts`:

```ts
import {
  compareDatabaseConnectionSafety,
  type DatabaseConnectionSafetySnapshot,
} from 'src/application/standard-ingredient-import/db-alignment';

const safeConnection = (
  overrides: Partial<DatabaseConnectionSafetySnapshot> = {},
): DatabaseConnectionSafetySnapshot => ({
  databaseLabel: overrides.databaseLabel ?? 'production',
  urlFingerprint: overrides.urlFingerprint ?? 'prod-url',
  hostname: overrides.hostname ?? 'prod-db.internal',
  databaseName: overrides.databaseName ?? 'sevenkitchen',
  currentUser: overrides.currentUser ?? 'sevenkitchen_readonly',
  isLocalhost: overrides.isLocalhost ?? false,
  isSuperuser: overrides.isSuperuser ?? false,
  canCreateDb: overrides.canCreateDb ?? false,
  canCreateRole: overrides.canCreateRole ?? false,
  writableTables: overrides.writableTables ?? [],
});

describe('compareDatabaseConnectionSafety', () => {
  it('rejects production connections that point to localhost', () => {
    const result = compareDatabaseConnectionSafety({
      local: safeConnection({ databaseLabel: 'local', urlFingerprint: 'local-url' }),
      production: safeConnection({ hostname: 'localhost', isLocalhost: true }),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'PRODUCTION_DATABASE_IS_LOCAL' }),
    );
  });

  it('rejects production connections that reuse the local database URL', () => {
    const result = compareDatabaseConnectionSafety({
      local: safeConnection({ databaseLabel: 'local', urlFingerprint: 'same-url' }),
      production: safeConnection({ urlFingerprint: 'same-url' }),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'PRODUCTION_DATABASE_SAME_AS_LOCAL' }),
    );
  });

  it('rejects production roles with table write privileges', () => {
    const result = compareDatabaseConnectionSafety({
      local: safeConnection({ databaseLabel: 'local', urlFingerprint: 'local-url' }),
      production: safeConnection({ writableTables: ['ingredient'] }),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'PRODUCTION_DATABASE_WRITABLE' }),
    );
  });

  it('passes a non-local readonly production role', () => {
    const result = compareDatabaseConnectionSafety({
      local: safeConnection({ databaseLabel: 'local', urlFingerprint: 'local-url' }),
      production: safeConnection(),
    });

    expect(result).toMatchObject({ ok: true, blockingIssues: [] });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd backend
npm test -- --runInBand tests/application/standard-ingredient-import/db-alignment.spec.ts
```

Expected: fail because `compareDatabaseConnectionSafety` and `DatabaseConnectionSafetySnapshot` do not exist.

- [ ] **Step 3: Implement connection safety types and comparison**

Add to `backend/src/application/standard-ingredient-import/db-alignment.ts`:

```ts
export type DatabaseConnectionSafetyIssueCode =
  | 'PRODUCTION_DATABASE_IS_LOCAL'
  | 'PRODUCTION_DATABASE_SAME_AS_LOCAL'
  | 'PRODUCTION_DATABASE_ROLE_POWERFUL'
  | 'PRODUCTION_DATABASE_WRITABLE';

export interface DatabaseConnectionSafetySnapshot {
  databaseLabel: string;
  urlFingerprint: string;
  hostname: string;
  databaseName: string;
  currentUser: string;
  isLocalhost: boolean;
  isSuperuser: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
  writableTables: string[];
}

export interface DatabaseConnectionSafetyIssue {
  code: DatabaseConnectionSafetyIssueCode;
  message: string;
  subject: string;
  value?: string | boolean | string[];
}

export interface DatabaseConnectionSafetyResult {
  ok: boolean;
  blockingIssues: DatabaseConnectionSafetyIssue[];
}

export function compareDatabaseConnectionSafety(input: {
  local: DatabaseConnectionSafetySnapshot;
  production: DatabaseConnectionSafetySnapshot;
}): DatabaseConnectionSafetyResult {
  const blockingIssues: DatabaseConnectionSafetyIssue[] = [];

  if (input.production.isLocalhost) {
    blockingIssues.push({
      code: 'PRODUCTION_DATABASE_IS_LOCAL',
      subject: input.production.hostname,
      message: 'Production readonly connection must not point to localhost.',
      value: input.production.hostname,
    });
  }

  if (input.production.urlFingerprint === input.local.urlFingerprint) {
    blockingIssues.push({
      code: 'PRODUCTION_DATABASE_SAME_AS_LOCAL',
      subject: input.production.databaseName,
      message: 'Production readonly connection must not reuse the local database URL.',
      value: input.production.urlFingerprint,
    });
  }

  if (
    input.production.isSuperuser ||
    input.production.canCreateDb ||
    input.production.canCreateRole
  ) {
    blockingIssues.push({
      code: 'PRODUCTION_DATABASE_ROLE_POWERFUL',
      subject: input.production.currentUser,
      message: 'Production readonly role must not be superuser or able to create databases/roles.',
      value: input.production.currentUser,
    });
  }

  if (input.production.writableTables.length > 0) {
    blockingIssues.push({
      code: 'PRODUCTION_DATABASE_WRITABLE',
      subject: input.production.currentUser,
      message: 'Production readonly role must not have INSERT, UPDATE, DELETE, TRUNCATE, or REFERENCES on audited tables.',
      value: input.production.writableTables,
    });
  }

  return { ok: blockingIssues.length === 0, blockingIssues };
}
```

- [ ] **Step 4: Add URL fingerprint and DB privilege collection**

Add this export to `backend/src/application/standard-ingredient-import/db-alignment.ts`:

```ts
export async function collectDatabaseConnectionSafetySnapshot(
  prisma: Pick<DatabaseAlignmentPrismaClient, '$queryRaw'>,
  input: {
    databaseLabel: string;
    databaseUrl: string;
    auditedTables?: string[];
  },
): Promise<DatabaseConnectionSafetySnapshot> {
  const url = new URL(input.databaseUrl);
  const auditedTables = input.auditedTables ?? [
    'ingredient',
    'nutrition_food',
    'nutrition_food_mapping',
    'procurement_sku',
    'ingredient_price_change',
  ];
  const [role] = await prisma.$queryRaw<
    Array<{
      current_user: string;
      current_database: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
    }>
  >`
    SELECT
      current_user,
      current_database(),
      rolsuper,
      rolcreatedb,
      rolcreaterole
    FROM pg_roles
    WHERE rolname = current_user
  `;
  const writableRows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${auditedTables})
      AND (
        has_table_privilege(current_user, quote_ident(table_schema) || '.' || quote_ident(table_name), 'INSERT')
        OR has_table_privilege(current_user, quote_ident(table_schema) || '.' || quote_ident(table_name), 'UPDATE')
        OR has_table_privilege(current_user, quote_ident(table_schema) || '.' || quote_ident(table_name), 'DELETE')
        OR has_table_privilege(current_user, quote_ident(table_schema) || '.' || quote_ident(table_name), 'TRUNCATE')
        OR has_table_privilege(current_user, quote_ident(table_schema) || '.' || quote_ident(table_name), 'REFERENCES')
      )
    ORDER BY table_name ASC
  `;

  return {
    databaseLabel: input.databaseLabel,
    urlFingerprint: sha256Hex(normalizeDatabaseUrlForSafety(input.databaseUrl)),
    hostname: url.hostname,
    databaseName: url.pathname.replace(/^\//, ''),
    currentUser: role.current_user,
    isLocalhost: isLocalDatabaseHost(url.hostname),
    isSuperuser: role.rolsuper,
    canCreateDb: role.rolcreatedb,
    canCreateRole: role.rolcreaterole,
    writableTables: writableRows.map((row) => row.table_name),
  };
}

function normalizeDatabaseUrlForSafety(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.password = '';
  return url.toString();
}

function isLocalDatabaseHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname);
}
```

- [ ] **Step 5: Wire the script safety gate before alignment comparison**

Modify `skills/adding-standard-ingredients/scripts/check-db-alignment.ts` so it stores URLs and checks safety before snapshots:

```ts
const {
  collectDatabaseAlignmentSnapshot,
  collectDatabaseConnectionSafetySnapshot,
  compareDatabaseAlignmentSnapshots,
  compareDatabaseConnectionSafety,
} = require('../../../backend/src/application/standard-ingredient-import');

const localDatabaseUrl = await loadDatabaseUrlFromEnvFile(localEnv);
const productionDatabaseUrl = await loadDatabaseUrlFromEnvFile(productionEnv);
const local = createPrismaClient(localDatabaseUrl);
const production = createPrismaClient(productionDatabaseUrl);

const [localSafety, productionSafety] = await Promise.all([
  collectDatabaseConnectionSafetySnapshot(local, {
    databaseLabel: 'local',
    databaseUrl: localDatabaseUrl,
  }),
  collectDatabaseConnectionSafetySnapshot(production, {
    databaseLabel: 'production',
    databaseUrl: productionDatabaseUrl,
  }),
]);
const safety = compareDatabaseConnectionSafety({
  local: localSafety,
  production: productionSafety,
});
if (!safety.ok) {
  await writeJsonFile(out, { safety, localSafety, productionSafety });
  console.log(
    `DB safety failed: ${safety.blockingIssues.length} blocking issue(s)`,
  );
  process.exit(1);
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd backend
npm test -- --runInBand tests/application/standard-ingredient-import/db-alignment.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/application/standard-ingredient-import/db-alignment.ts \
  backend/tests/application/standard-ingredient-import/db-alignment.spec.ts \
  skills/adding-standard-ingredients/scripts/check-db-alignment.ts
git commit -m "feat: enforce readonly production db alignment safety"
```

---

### Task 2: Require Full Official Source Search Evidence

**Files:**
- Modify: `backend/src/application/standard-ingredient-import/source-policy.ts`
- Modify: `backend/src/application/standard-ingredient-import/ingredient-import-manifest.ts`
- Modify: `backend/tests/application/standard-ingredient-import/source-policy.spec.ts`
- Modify: `backend/tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts`

- [ ] **Step 1: Add source search validation tests**

Append to `backend/tests/application/standard-ingredient-import/source-policy.spec.ts`:

```ts
import {
  validateNutritionSourceSearchCoverage,
  type NutritionSourceSearchEntry,
} from 'src/application/standard-ingredient-import/source-policy';

const fullSearchLog = (): NutritionSourceSearchEntry[] =>
  [
    'USDA_FDC',
    'NZFCD',
    'NEVO',
    'MEXT',
    'AFCD',
    'AUSNUT',
    'CNF',
    'COFID',
    'CIQUAL',
  ].map((source) => ({
    source,
    status: source === 'USDA_FDC' ? 'candidate_found' : 'searched_no_match',
    query: 'oat groats',
    searchedAt: '2026-06-17T00:00:00.000Z',
    evidenceUri: `official:${source}`,
    notes: `${source} checked against identity and preparation state.`,
  }));

describe('validateNutritionSourceSearchCoverage', () => {
  it('passes when every primary source has search evidence', () => {
    expect(
      validateNutritionSourceSearchCoverage({
        ingredientName: '燕麦米',
        requestedState: 'raw',
        searchLog: fullSearchLog(),
      }),
    ).toMatchObject({ ok: true, blockingIssues: [] });
  });

  it('rejects USDA-only evidence', () => {
    const result = validateNutritionSourceSearchCoverage({
      ingredientName: '燕麦米',
      requestedState: 'raw',
      searchLog: fullSearchLog().filter((entry) => entry.source === 'USDA_FDC'),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'PRIMARY_SOURCE_SEARCH_MISSING' }),
    );
  });

  it('rejects CFCT fallback unless all primary sources were searched', () => {
    const result = validateNutritionSourceSearchCoverage({
      ingredientName: '燕麦米',
      requestedState: 'raw',
      searchLog: [
        fullSearchLog()[0],
        {
          source: 'CFCT',
          status: 'candidate_found',
          query: '燕麦',
          searchedAt: '2026-06-17T00:00:00.000Z',
          evidenceUri: 'official:CFCT',
          notes: 'Fallback candidate.',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({ code: 'CFCT_FALLBACK_WITHOUT_PRIMARY_EXHAUSTION' }),
    );
  });
});
```

- [ ] **Step 2: Implement source search evidence types and validator**

Add to `backend/src/application/standard-ingredient-import/source-policy.ts`:

```ts
export const primaryOfficialNutritionSources = [
  'USDA_FDC',
  'NZFCD',
  'NEVO',
  'MEXT',
  'AFCD',
  'AUSNUT',
  'CNF',
  'COFID',
  'CIQUAL',
] as const satisfies readonly ApprovedNutritionSource[];

export type PrimaryOfficialNutritionSource =
  (typeof primaryOfficialNutritionSources)[number];

export type NutritionSourceSearchStatus =
  | 'candidate_found'
  | 'searched_no_match'
  | 'state_mismatch'
  | 'coverage_too_low'
  | 'source_unavailable';

export interface NutritionSourceSearchEntry {
  source: ApprovedNutritionSource;
  status: NutritionSourceSearchStatus;
  query: string;
  searchedAt: string;
  evidenceUri: string;
  notes: string;
}

export interface NutritionSourceSearchCoverageIssue {
  code:
    | 'PRIMARY_SOURCE_SEARCH_MISSING'
    | 'SOURCE_SEARCH_EVIDENCE_INCOMPLETE'
    | 'CFCT_FALLBACK_WITHOUT_PRIMARY_EXHAUSTION';
  source?: ApprovedNutritionSource;
  message: string;
}

export function validateNutritionSourceSearchCoverage(input: {
  ingredientName: string;
  requestedState: NutritionStateTag;
  searchLog: NutritionSourceSearchEntry[];
}): {
  ok: boolean;
  blockingIssues: NutritionSourceSearchCoverageIssue[];
} {
  const blockingIssues: NutritionSourceSearchCoverageIssue[] = [];
  const entriesBySource = new Map(
    input.searchLog.map((entry) => [entry.source, entry]),
  );

  for (const source of primaryOfficialNutritionSources) {
    const entry = entriesBySource.get(source);
    if (!entry) {
      blockingIssues.push({
        code: 'PRIMARY_SOURCE_SEARCH_MISSING',
        source,
        message: `${source} must be searched before importing ${input.ingredientName}.`,
      });
      continue;
    }
    if (
      !entry.query.trim() ||
      !entry.searchedAt.trim() ||
      !entry.evidenceUri.trim() ||
      !entry.notes.trim()
    ) {
      blockingIssues.push({
        code: 'SOURCE_SEARCH_EVIDENCE_INCOMPLETE',
        source,
        message: `${source} search evidence must include query, searchedAt, evidenceUri, and notes.`,
      });
    }
  }

  if (entriesBySource.has('CFCT')) {
    const allPrimarySearched = primaryOfficialNutritionSources.every((source) =>
      entriesBySource.has(source),
    );
    if (!allPrimarySearched) {
      blockingIssues.push({
        code: 'CFCT_FALLBACK_WITHOUT_PRIMARY_EXHAUSTION',
        source: 'CFCT',
        message: 'CFCT fallback is only allowed after all primary official sources are searched.',
      });
    }
  }

  return { ok: blockingIssues.length === 0, blockingIssues };
}
```

- [ ] **Step 3: Add `sourceSearchLog` to manifest validation**

Modify `backend/src/application/standard-ingredient-import/ingredient-import-manifest.ts`:

```ts
import {
  validateNutritionSourceSearchCoverage,
  type NutritionSourceSearchEntry,
} from './source-policy';

export interface IngredientImportManifest {
  version: 1;
  ingredient: IngredientImportDescriptor;
  operationMode: IngredientImportMode;
  updateExistingIngredientId?: string;
  nutritionProfiles?: IngredientImportNutritionProfile[];
  sourceCandidates?: IngredientImportSourceCandidate[];
  sourceSearchLog?: NutritionSourceSearchEntry[];
  packageEvidence?: SupplementPackageEvidence;
  supplementLabel?: SupplementLabelEvidence;
  dbAlignmentReport?: DbAlignmentReport;
  operatorConfirmation?: OperatorConfirmation;
  wholeDatabaseMigration?: boolean;
  migrationFlags?: MigrationFlags;
}
```

Extend `ManifestValidationIssue['code']` with:

```ts
| 'FOOD_SOURCE_SEARCH_REQUIRED'
| 'FOOD_SOURCE_SEARCH_INCOMPLETE'
```

In `validateFoodManifest`, after `sourceCandidates` validation:

```ts
  if (!hasItems(manifest.sourceSearchLog)) {
    errors.push({
      code: 'FOOD_SOURCE_SEARCH_REQUIRED',
      path: 'sourceSearchLog',
      message: 'FOOD import manifests must include search evidence for every primary official source.',
    });
  } else {
    const sourceCoverage = validateNutritionSourceSearchCoverage({
      ingredientName: manifest.ingredient.name,
      requestedState:
        (manifest.nutritionProfiles?.[0]?.preparationState as any) ?? 'raw',
      searchLog: manifest.sourceSearchLog,
    });
    sourceCoverage.blockingIssues.forEach((issue) => {
      errors.push({
        code: 'FOOD_SOURCE_SEARCH_INCOMPLETE',
        path: issue.source
          ? `sourceSearchLog.${issue.source}`
          : 'sourceSearchLog',
        message: issue.message,
      });
    });
  }
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend
npm test -- --runInBand \
  tests/application/standard-ingredient-import/source-policy.spec.ts \
  tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts
```

Expected: PASS after existing test fixtures are updated to include `sourceSearchLog`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/standard-ingredient-import/source-policy.ts \
  backend/src/application/standard-ingredient-import/ingredient-import-manifest.ts \
  backend/tests/application/standard-ingredient-import/source-policy.spec.ts \
  backend/tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts
git commit -m "feat: require full nutrition source search evidence"
```

---

### Task 3: Update Skill Templates, Schema, and Operator Checklist

**Files:**
- Modify: `skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json`
- Modify: `skills/adding-standard-ingredients/assets/ingredient-import-template.food.json`
- Modify: `skills/adding-standard-ingredients/references/source-policy.md`
- Modify: `skills/adding-standard-ingredients/references/operator-checklist.md`
- Modify: `skills/adding-standard-ingredients/SKILL.md`

- [ ] **Step 1: Add `sourceSearchLog` to the food template**

Add this array to `skills/adding-standard-ingredients/assets/ingredient-import-template.food.json`:

```json
"sourceSearchLog": [
  {
    "source": "USDA_FDC",
    "status": "candidate_found",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "NZFCD",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "NEVO",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "MEXT",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "AFCD",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "AUSNUT",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "CNF",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "COFID",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  },
  {
    "source": "CIQUAL",
    "status": "searched_no_match",
    "query": "",
    "searchedAt": "",
    "evidenceUri": "",
    "notes": ""
  }
]
```

- [ ] **Step 2: Update the JSON schema**

In `skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json`, add a `sourceSearchLog` property with required `source`, `status`, `query`, `searchedAt`, `evidenceUri`, and `notes`. Include enum values from Task 2.

- [ ] **Step 3: Update operator docs**

Add these rules to `skills/adding-standard-ingredients/references/source-policy.md`:

```markdown
## Required Source Search Evidence

For every FOOD ingredient, the manifest must include `sourceSearchLog` entries
for USDA_FDC, NZFCD, NEVO, MEXT, AFCD, AUSNUT, CNF, COFID, and CIQUAL.

Each entry must include:

- source
- status
- query
- searchedAt
- evidenceUri
- notes explaining identity and state matching

USDA-only evidence is not sufficient for local write or production packaging.
CFCT may appear only after all primary sources are searched and none has an
acceptable state-matching candidate.
```

Add these checks to `skills/adding-standard-ingredients/references/operator-checklist.md`:

```markdown
- Production readonly env exists and passes safety + alignment checks.
- FOOD manifest includes a complete sourceSearchLog for every primary source.
- USDA-only source evidence is rejected unless the other primary sources have documented no-match/state-mismatch/coverage-too-low entries.
- Canine nutrient conversions declare the fixed conversion policy version.
- Coverage report includes denominator 46 and missing nutrient list.
```

- [ ] **Step 4: Validate JSON files**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('skills/adding-standard-ingredients/assets/ingredient-import-template.food.json','utf8')); JSON.parse(require('fs').readFileSync('skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json','utf8')); console.log('json ok')"
```

Expected: `json ok`.

- [ ] **Step 5: Commit**

```bash
git add skills/adding-standard-ingredients/assets/ingredient-import-manifest.schema.json \
  skills/adding-standard-ingredients/assets/ingredient-import-template.food.json \
  skills/adding-standard-ingredients/references/source-policy.md \
  skills/adding-standard-ingredients/references/operator-checklist.md \
  skills/adding-standard-ingredients/SKILL.md
git commit -m "docs: require full source evidence for standard ingredients"
```

---

### Task 4: Version Canine Conversion Policy

**Files:**
- Create: `backend/src/domain/ingredient/canine-conversion-policy.ts`
- Modify: `backend/src/domain/ingredient/index.ts`
- Modify: `backend/src/application/standard-ingredient-import/nutrition-audit.ts`
- Test: `backend/tests/domain/ingredient/canine-conversion-policy.spec.ts`
- Test: `backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts`

- [ ] **Step 1: Add failing policy tests**

Create `backend/tests/domain/ingredient/canine-conversion-policy.spec.ts`:

```ts
import {
  CANINE_CONVERSION_POLICY,
  getCanineConversionPolicyVersion,
} from '../../../src/domain/ingredient/canine-conversion-policy';

describe('canine conversion policy', () => {
  it('locks canine conversion to FEDIAF 2025 dog policy metadata', () => {
    expect(getCanineConversionPolicyVersion()).toBe('FEDIAF_2025_DOG');
    expect(CANINE_CONVERSION_POLICY.vitaminD.microgramToIu).toBe(40);
    expect(CANINE_CONVERSION_POLICY.vitaminE.forms.D_ALPHA_TOCOPHEROL.iuPerMg).toBe(1.49);
    expect(CANINE_CONVERSION_POLICY.reviewOnlyWhenFormUnknown).toBe(true);
  });
});
```

- [ ] **Step 2: Implement policy metadata**

Create `backend/src/domain/ingredient/canine-conversion-policy.ts`:

```ts
import { VITAMIN_E_CONVERSIONS } from './vitamin-e-conversion';

export const CANINE_CONVERSION_POLICY = {
  version: 'FEDIAF_2025_DOG',
  sourceTitle:
    'FEDIAF Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs, Publication September 2025',
  reviewOnlyWhenFormUnknown: true,
  vitaminA: {
    source: 'backend vitamin-a-conversion.ts',
    outputUnit: 'IU',
  },
  vitaminD: {
    ordinaryForms: ['D2', 'D3'],
    microgramToIu: 40,
    outputUnit: 'IU',
  },
  vitaminE: {
    source: 'backend vitamin-e-conversion.ts',
    outputUnit: 'IU',
    forms: VITAMIN_E_CONVERSIONS,
  },
} as const;

export function getCanineConversionPolicyVersion(): string {
  return CANINE_CONVERSION_POLICY.version;
}
```

Export from `backend/src/domain/ingredient/index.ts`:

```ts
export * from './canine-conversion-policy';
```

- [ ] **Step 3: Add conversion policy version to nutrition audit normalized metadata**

In `backend/src/application/standard-ingredient-import/nutrition-audit.ts`, import:

```ts
import { getCanineConversionPolicyVersion } from '../../domain/ingredient/canine-conversion-policy';
```

When building vitamin A, D, and E normalized values, include:

```ts
canineConversionPolicyVersion: getCanineConversionPolicyVersion(),
```

inside the source form metadata passed to `makeNormalizedValue`.

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend
npm test -- --runInBand \
  tests/domain/ingredient/canine-conversion-policy.spec.ts \
  tests/application/standard-ingredient-import/nutrition-audit.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/ingredient/canine-conversion-policy.ts \
  backend/src/domain/ingredient/index.ts \
  backend/src/application/standard-ingredient-import/nutrition-audit.ts \
  backend/tests/domain/ingredient/canine-conversion-policy.spec.ts \
  backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts
git commit -m "feat: version canine nutrient conversion policy"
```

---

### Task 5: Lock and Report the 46-Item Essential Nutrient Coverage Basis

**Files:**
- Modify: `backend/src/application/standard-ingredient-import/nutrition-audit.ts`
- Modify: `backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts`
- Modify: `skills/adding-standard-ingredients/references/nutrition-audit.md`

- [ ] **Step 1: Add failing tests for denominator and list exposure**

Append to `backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts`:

```ts
import { FEDIAF_2025_DOG_NUTRIENTS } from 'src/application/nutrition-standard/fediaf-2025-dog.data';

it('reports the 46-item FEDIAF dog essential nutrient coverage basis', () => {
  const result = auditNutritionProfileForImport({
    profileName: 'empty profile',
    nutrients: {},
  });

  expect(FEDIAF_2025_DOG_NUTRIENTS).toHaveLength(46);
  expect(result.essentialCoverageBasis).toMatchObject({
    standardVersion: 'FEDIAF_2025_DOG',
    denominator: 46,
  });
  expect(result.essentialCoverageBasis.nutrients.map((item) => item.code)).toEqual(
    FEDIAF_2025_DOG_NUTRIENTS.map((item) => item.code),
  );
});
```

- [ ] **Step 2: Extend audit result type**

In `backend/src/application/standard-ingredient-import/nutrition-audit.ts`, extend `NutritionImportAuditResult`:

```ts
essentialCoverageBasis: {
  standardVersion: 'FEDIAF_2025_DOG';
  denominator: number;
  nutrients: Array<{
    code: string;
    name: string;
    nameEn: string;
    defaultIngredientUnit: string | null;
    defaultStandardUnit: string;
  }>;
};
```

Set it in `auditNutritionProfileForImport`:

```ts
essentialCoverageBasis: {
  standardVersion: 'FEDIAF_2025_DOG',
  denominator: FEDIAF_2025_DOG_NUTRIENTS.length,
  nutrients: FEDIAF_2025_DOG_NUTRIENTS.map((nutrient) => ({
    code: nutrient.code,
    name: nutrient.name,
    nameEn: nutrient.nameEn,
    defaultIngredientUnit: nutrient.defaultIngredientUnit,
    defaultStandardUnit: nutrient.defaultStandardUnit,
  })),
},
```

- [ ] **Step 3: Update docs**

Add to `skills/adding-standard-ingredients/references/nutrition-audit.md`:

```markdown
## Essential Coverage Basis

The current denominator is the 46 active `FEDIAF_2025_DOG_NUTRIENTS` entries
from the backend standard data file. The audit output must include:

- standardVersion: `FEDIAF_2025_DOG`
- denominator: `46`
- full nutrient list
- present nutrient list
- missing nutrient list

Changing the denominator requires a standard-version upgrade and updated tests.
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend
npm test -- --runInBand tests/application/standard-ingredient-import/nutrition-audit.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/standard-ingredient-import/nutrition-audit.ts \
  backend/tests/application/standard-ingredient-import/nutrition-audit.spec.ts \
  skills/adding-standard-ingredients/references/nutrition-audit.md
git commit -m "feat: report essential nutrient coverage basis"
```

---

### Task 6: End-to-End Acceptance for the Skill Workflow

**Files:**
- Modify: `skills/adding-standard-ingredients/SKILL.md`
- Modify: `skills/adding-standard-ingredients/references/operator-checklist.md`
- Test by command only.

- [ ] **Step 1: Update workflow order in `SKILL.md`**

Ensure the workflow says:

```markdown
1. Confirm real readonly production DB config exists.
2. Run DB safety + alignment check.
3. Prepare manifest.
4. Complete full primary-source search log.
5. Fill nutrition profiles and conversion evidence.
6. Run manifest audit.
7. Ask operator confirmation for local write.
8. Apply local write only after all hard gates pass.
9. Build production package only after local review approval.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
cd backend
npm test -- --runInBand \
  tests/application/standard-ingredient-import/db-alignment.spec.ts \
  tests/application/standard-ingredient-import/source-policy.spec.ts \
  tests/application/standard-ingredient-import/ingredient-import-manifest.spec.ts \
  tests/application/standard-ingredient-import/nutrition-audit.spec.ts \
  tests/domain/ingredient/canine-conversion-policy.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run local DB status**

Run:

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sevenkitchen" npx prisma migrate status
```

Expected: `Database schema is up to date!`

- [ ] **Step 4: Run acceptance failure for missing production readonly config**

Run:

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/check-db-alignment.ts \
  --local-env .env \
  --production-env .env.production.readonly \
  --out ../.standard-ingredient-import/alignment.json
```

Expected when no real readonly config exists: fail before local write. This confirms the workflow blocks unsafe use.

- [ ] **Step 5: Commit**

```bash
git add skills/adding-standard-ingredients/SKILL.md \
  skills/adding-standard-ingredients/references/operator-checklist.md
git commit -m "docs: update standard ingredient execution workflow"
```

---

## Self-Review

**Spec coverage:** The plan covers production readonly configuration, complete official-source search evidence, fixed/versioned canine conversion, and the 46-item essential nutrient coverage basis.

**Placeholder scan:** No task leaves unspecified future work. Each code-changing task includes concrete code snippets and exact test commands.

**Type consistency:** `sourceSearchLog`, `NutritionSourceSearchEntry`, `DatabaseConnectionSafetySnapshot`, `compareDatabaseConnectionSafety`, and `CANINE_CONVERSION_POLICY` are introduced before later tasks use them.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-standard-ingredient-governance-hardening.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
