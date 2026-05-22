# Search Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-domain search governance system with managed alias groups, search logs, Agent-generated suggestions, approval workflow, and first-wave integrations for ingredient, nutrition-food, breed, and order search.

**Architecture:** Add Prisma-backed search governance models and a focused backend `SearchGovernanceService` that owns normalization, alias expansion, matching, logging, suggestion review, and suggestion application. Add a Web admin “搜索治理” page for operations, then connect the shared service to high-frequency miniapp/backend search flows in a controlled order: ingredient/nutrition first, breed second, order third.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3, Element Plus, node:test admin source checks, uni-app Vue 3, Vitest.

---

## Scope Check

The design spans database, backend services, admin UI, and several search entry points. This remains one coherent feature because each subsystem depends on the same shared search governance domain model and approval workflow. The execution is split into independently testable tasks so the project can stop after any task with a working baseline.

## File Structure

### Backend Domain And Application

- Create: `backend/src/domain/search-governance/search-governance.types.ts`
  - Shared TypeScript unions and interfaces for domains, alias groups, search events, match results, and suggestion payloads.
- Create: `backend/src/domain/search-governance/search-text.ts`
  - Pure text normalization, CJK detection, edit distance, and safe query token helpers.
- Create: `backend/src/domain/search-governance/search-matcher.ts`
  - Pure scoring and ranking helpers. No Prisma dependency.
- Create: `backend/src/application/search-governance/search-governance.service.ts`
  - Prisma-backed alias group CRUD, query logging, insights, suggestion approval, suggestion application, and domain-specific expansion.
- Create: `backend/src/application/search-governance/search-governance-agent.provider.ts`
  - Agent prompt and parser for alias suggestions. Uses existing Agent provider settings patterns where available.
- Create: `backend/src/interfaces/dto/search-governance/search-governance.dto.ts`
  - Validated DTOs for admin search governance endpoints.
- Create: `backend/src/interfaces/controllers/search-governance.controller.ts`
  - Admin-protected API under `/api/v1/admin/search-governance`.
- Modify: `backend/src/app.module.ts`
  - Register the controller and service.

### Database

- Modify: `backend/prisma/schema.prisma`
  - Add enums and models for alias groups, query logs, suggestions, and audit logs.
- Create: `backend/prisma/migrations/202605220001_add_search_governance/migration.sql`
  - SQL migration matching the Prisma schema.
- Create: `backend/prisma/seed-search-governance-aliases.ts`
  - Idempotent seed for initial ingredient aliases, breed aliases, and order status terms.

### Integrations

- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
  - Replace hard-coded ingredient alias groups with search governance expansion and ranking.
- Modify: `backend/src/application/nutrition-food/nutrition-food.service.ts`
  - Use search governance for nutrition-food search expansion.
- Modify: `backend/src/application/dog/dog.service.ts`
  - Use shared normalization/alias lookup when backend breed search is needed and log selected breed searches where backend receives search input.
- Modify: `miniapp/src/utils/dog-breed-search.ts`
  - Keep current local UX behavior, but move constants and scoring toward the shared governance contract shape.
- Modify: `backend/src/application/order/order.service.ts`
  - Apply order keyword normalization and status word mapping.
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
  - Route admin order keyword search through the order service behavior and log admin order searches.
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
  - Reuse ingredient search governance for stock replenishment ingredient keyword matching.

### Admin Web

- Create: `admin-web/src/types/searchGovernance.ts`
  - TypeScript API response and payload types.
- Create: `admin-web/src/api/searchGovernance.ts`
  - Axios helpers for the new admin API.
- Create: `admin-web/src/views/SearchGovernance/index.vue`
  - Search governance page with tabs: Overview, Alias Groups, Insights, Agent Suggestions, Scope.
- Modify: `admin-web/src/router/index.ts`
  - Register `/search-governance`.
- Modify: `admin-web/src/layouts/MainLayout.vue`
  - Add sidebar menu item.

### Tests

- Create: `backend/tests/prisma/search-governance-schema.spec.ts`
- Create: `backend/tests/domain/search-governance/search-text.spec.ts`
- Create: `backend/tests/domain/search-governance/search-matcher.spec.ts`
- Create: `backend/tests/application/search-governance/search-governance.service.spec.ts`
- Create: `backend/tests/application/search-governance/search-governance-agent.provider.spec.ts`
- Create: `backend/tests/interfaces/controllers/search-governance.controller.spec.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Modify: `backend/tests/application/nutrition-food/nutrition-food.service.spec.ts`
- Modify: `backend/tests/application/order/order.service.spec.ts`
- Modify: `backend/tests/application/purchasing/purchasing.service.spec.ts`
- Create: `admin-web/tests/searchGovernancePage.test.js`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
- Modify: `miniapp/src/pages/staff-orders.regression.spec.ts`
- Add or modify: `miniapp/src/utils/dog-breed-search.spec.ts`

---

### Task 1: Database Schema And Seed Contract

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605220001_add_search_governance/migration.sql`
- Create: `backend/prisma/seed-search-governance-aliases.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/prisma/search-governance-schema.spec.ts`

- [ ] **Step 1: Write schema guard tests**

Create `backend/tests/prisma/search-governance-schema.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(process.cwd(), 'prisma/schema.prisma'),
  'utf8',
);

describe('search governance schema', () => {
  it('defines isolated search governance domains and alias tables', () => {
    expect(schema).toContain('enum SearchGovernanceDomain');
    expect(schema).toContain('INGREDIENT');
    expect(schema).toContain('NUTRITION_FOOD');
    expect(schema).toContain('BREED');
    expect(schema).toContain('ORDER');
    expect(schema).toContain('model SearchAliasGroup');
    expect(schema).toContain('model SearchQueryLog');
    expect(schema).toContain('model SearchAliasSuggestion');
    expect(schema).toContain('model SearchAliasAuditLog');
  });

  it('keeps alias suggestions approval based and auditable', () => {
    expect(schema).toContain('enum SearchAliasSuggestionStatus');
    expect(schema).toContain('PENDING');
    expect(schema).toContain('APPROVED');
    expect(schema).toContain('REJECTED');
    expect(schema).toContain('APPLIED');
    expect(schema).toContain('FAILED');
    expect(schema).toContain('suggestionId');
    expect(schema).toContain('@map("suggestion_id")');
  });

  it('stores query logs without requiring a selected entity', () => {
    expect(schema).toContain('rawQuery');
    expect(schema).toContain('@map("raw_query")');
    expect(schema).toContain('normalizedQuery');
    expect(schema).toContain('@map("normalized_query")');
    expect(schema).toContain('resultCount');
    expect(schema).toContain('@map("result_count")');
    expect(schema).toContain('selectedEntityId');
    expect(schema).toContain('@map("selected_entity_id")');
  });
});
```

- [ ] **Step 2: Run the failing schema guard**

Run:

```bash
cd backend && npm test -- tests/prisma/search-governance-schema.spec.ts --runInBand
```

Expected: fail because the search governance enums and models do not exist yet.

- [ ] **Step 3: Add Prisma enums and models**

Add these enums and models to `backend/prisma/schema.prisma` near the other governance/nutrition models:

```prisma
enum SearchGovernanceDomain {
  INGREDIENT
  NUTRITION_FOOD
  BREED
  ORDER
}

enum SearchAliasGroupStatus {
  ACTIVE
  DISABLED
}

enum SearchAliasRiskLevel {
  LOW
  MEDIUM
  HIGH
}

enum SearchAliasSuggestionAction {
  CREATE_GROUP
  ADD_ALIAS
  MERGE_GROUPS
  DISABLE_ALIAS
  UPDATE_CANONICAL
}

enum SearchAliasSuggestionStatus {
  PENDING
  APPROVED
  REJECTED
  APPLIED
  FAILED
}

model SearchAliasGroup {
  id            String                 @id @default(uuid())
  domain        SearchGovernanceDomain @map("domain")
  canonicalTerm String                 @map("canonical_term") @db.VarChar(200)
  aliases       String[]               @default([]) @map("aliases")
  status        SearchAliasGroupStatus @default(ACTIVE) @map("status")
  riskLevel     SearchAliasRiskLevel   @default(LOW) @map("risk_level")
  notes         String?                @map("notes")
  createdBy     String?                @map("created_by")
  updatedBy     String?                @map("updated_by")
  createdAt     DateTime               @default(now()) @map("created_at")
  updatedAt     DateTime               @updatedAt @map("updated_at")

  @@unique([domain, canonicalTerm])
  @@index([domain, status])
  @@map("search_alias_group")
}

model SearchQueryLog {
  id                 String                 @id @default(uuid())
  domain             SearchGovernanceDomain @map("domain")
  source             String                 @map("source") @db.VarChar(120)
  rawQuery           String                 @map("raw_query") @db.VarChar(300)
  normalizedQuery    String                 @map("normalized_query") @db.VarChar(300)
  resultCount        Int                    @default(0) @map("result_count")
  selectedEntityType String?                @map("selected_entity_type") @db.VarChar(80)
  selectedEntityId   String?                @map("selected_entity_id") @db.VarChar(120)
  selectedEntityName String?                @map("selected_entity_name") @db.VarChar(300)
  userId             String?                @map("user_id") @db.VarChar(120)
  createdAt          DateTime               @default(now()) @map("created_at")

  @@index([domain, createdAt])
  @@index([domain, normalizedQuery])
  @@map("search_query_log")
}

model SearchAliasSuggestion {
  id             String                      @id @default(uuid())
  domain         SearchGovernanceDomain      @map("domain")
  action         SearchAliasSuggestionAction @map("action")
  status         SearchAliasSuggestionStatus @default(PENDING) @map("status")
  payload        Json                        @map("payload")
  evidence       Json                        @default("{}") @map("evidence")
  riskLevel      SearchAliasRiskLevel        @default(LOW) @map("risk_level")
  agentRationale String?                     @map("agent_rationale")
  errorMessage   String?                     @map("error_message")
  reviewerId     String?                     @map("reviewer_id")
  reviewedAt     DateTime?                   @map("reviewed_at")
  appliedAt      DateTime?                   @map("applied_at")
  createdAt      DateTime                    @default(now()) @map("created_at")
  updatedAt      DateTime                    @updatedAt @map("updated_at")

  @@index([domain, status, createdAt])
  @@map("search_alias_suggestion")
}

model SearchAliasAuditLog {
  id           String                 @id @default(uuid())
  domain       SearchGovernanceDomain @map("domain")
  action       String                 @map("action") @db.VarChar(80)
  before       Json?                  @map("before")
  after        Json?                  @map("after")
  suggestionId String?                @map("suggestion_id")
  operatorId   String?                @map("operator_id")
  createdAt    DateTime               @default(now()) @map("created_at")

  @@index([domain, createdAt])
  @@index([suggestionId])
  @@map("search_alias_audit_log")
}
```

- [ ] **Step 4: Add SQL migration**

Create `backend/prisma/migrations/202605220001_add_search_governance/migration.sql` with the SQL generated by Prisma for the new enums and tables. Ensure the SQL creates these tables:

```sql
CREATE TABLE "search_alias_group" (
  "id" TEXT NOT NULL,
  "domain" "SearchGovernanceDomain" NOT NULL,
  "canonical_term" VARCHAR(200) NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "SearchAliasGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  "risk_level" "SearchAliasRiskLevel" NOT NULL DEFAULT 'LOW',
  "notes" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "search_alias_group_pkey" PRIMARY KEY ("id")
);
```

The migration must also create `search_query_log`, `search_alias_suggestion`, `search_alias_audit_log`, all enum types, indexes, and the unique index on `("domain", "canonical_term")`.

- [ ] **Step 5: Add idempotent seed script**

Create `backend/prisma/seed-search-governance-aliases.ts`:

```ts
import { PrismaClient, SearchGovernanceDomain } from '@prisma/client';

const prisma = new PrismaClient();

const initialGroups = [
  {
    domain: SearchGovernanceDomain.INGREDIENT,
    canonicalTerm: '西兰花',
    aliases: ['西蓝花', '青花菜', '绿花椰菜', 'broccoli'],
  },
  {
    domain: SearchGovernanceDomain.INGREDIENT,
    canonicalTerm: '鸡胸',
    aliases: ['鸡胸肉', 'chicken breast'],
  },
  {
    domain: SearchGovernanceDomain.INGREDIENT,
    canonicalTerm: '三文鱼',
    aliases: ['鲑鱼', 'salmon'],
  },
  {
    domain: SearchGovernanceDomain.ORDER,
    canonicalTerm: '待支付',
    aliases: ['未付款', '未支付', '待付款'],
  },
  {
    domain: SearchGovernanceDomain.ORDER,
    canonicalTerm: '已支付',
    aliases: ['已付款', '付款成功'],
  },
];

async function main() {
  for (const group of initialGroups) {
    await prisma.searchAliasGroup.upsert({
      where: {
        domain_canonicalTerm: {
          domain: group.domain,
          canonicalTerm: group.canonicalTerm,
        },
      },
      create: group,
      update: {
        aliases: group.aliases,
        status: 'ACTIVE',
        riskLevel: 'LOW',
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  });
```

- [ ] **Step 6: Add package script**

Add this script to `backend/package.json`:

```json
"seed:search-governance-aliases": "DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} ts-node -r tsconfig-paths/register prisma/seed-search-governance-aliases.ts"
```

- [ ] **Step 7: Verify schema tests and Prisma generation**

Run:

```bash
cd backend && npm test -- tests/prisma/search-governance-schema.spec.ts --runInBand
cd backend && DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} npx prisma generate
```

Expected: schema test passes and Prisma client generation succeeds.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202605220001_add_search_governance/migration.sql backend/prisma/seed-search-governance-aliases.ts backend/package.json backend/tests/prisma/search-governance-schema.spec.ts
git commit -m "feat: add search governance schema"
```

### Task 2: Pure Search Matching Domain

**Files:**
- Create: `backend/src/domain/search-governance/search-governance.types.ts`
- Create: `backend/src/domain/search-governance/search-text.ts`
- Create: `backend/src/domain/search-governance/search-matcher.ts`
- Test: `backend/tests/domain/search-governance/search-text.spec.ts`
- Test: `backend/tests/domain/search-governance/search-matcher.spec.ts`

- [ ] **Step 1: Write text normalization tests**

Create `backend/tests/domain/search-governance/search-text.spec.ts`:

```ts
import {
  calculateEditDistance,
  isCjkOnlyQuery,
  normalizeSearchText,
} from '../../../src/domain/search-governance/search-text';

describe('search text helpers', () => {
  it('normalizes whitespace, width, case, and punctuation', () => {
    expect(normalizeSearchText('  Ｃhicken Breast（生） ')).toBe('chickenbreast生');
    expect(normalizeSearchText('鸡 胸-肉')).toBe('鸡胸肉');
  });

  it('recognizes short CJK-only queries for conservative typo matching', () => {
    expect(isCjkOnlyQuery('西蓝花')).toBe(true);
    expect(isCjkOnlyQuery('broccoli')).toBe(false);
    expect(isCjkOnlyQuery('西蓝花broccoli')).toBe(false);
  });

  it('calculates edit distance for Chinese near matches', () => {
    expect(calculateEditDistance('西蓝花', '西兰花')).toBe(1);
    expect(calculateEditDistance('鸡胸肉', '鸡胸')).toBe(1);
  });
});
```

- [ ] **Step 2: Write matcher tests**

Create `backend/tests/domain/search-governance/search-matcher.spec.ts`:

```ts
import {
  getSearchMatch,
  rankSearchCandidates,
} from '../../../src/domain/search-governance/search-matcher';

describe('search matcher', () => {
  it('scores exact, prefix, contains, reverse contains, and near CJK matches', () => {
    expect(getSearchMatch('鸡胸', '鸡胸')?.type).toBe('EXACT');
    expect(getSearchMatch('鸡胸', '鸡')?.type).toBe('PREFIX');
    expect(getSearchMatch('去皮鸡胸', '鸡胸')?.type).toBe('CONTAINS');
    expect(getSearchMatch('鸡胸', '鸡胸肉')?.type).toBe('REVERSE_CONTAINS');
    expect(getSearchMatch('西兰花', '西蓝花')?.type).toBe('NEAR_CJK');
  });

  it('ranks primary field matches ahead of aliases and secondary fields', () => {
    const ranked = rankSearchCandidates(
      [
        {
          id: 'brand-match',
          label: 'A',
          primaryTexts: ['鸭胸'],
          aliasTexts: [],
          secondaryTexts: ['鸡胸肉品牌'],
        },
        {
          id: 'alias-match',
          label: 'B',
          primaryTexts: ['鸡胸'],
          aliasTexts: ['鸡胸肉'],
          secondaryTexts: [],
        },
        {
          id: 'exact-match',
          label: 'C',
          primaryTexts: ['鸡胸肉'],
          aliasTexts: [],
          secondaryTexts: [],
        },
      ],
      '鸡胸肉',
    );

    expect(ranked.map((item) => item.id)).toEqual([
      'exact-match',
      'alias-match',
      'brand-match',
    ]);
    expect(ranked[0].match?.type).toBe('EXACT');
  });
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
cd backend && npm test -- tests/domain/search-governance/search-text.spec.ts tests/domain/search-governance/search-matcher.spec.ts --runInBand
```

Expected: fail because the new domain files do not exist.

- [ ] **Step 4: Add domain types**

Create `backend/src/domain/search-governance/search-governance.types.ts`:

```ts
export type SearchGovernanceDomain =
  | 'INGREDIENT'
  | 'NUTRITION_FOOD'
  | 'BREED'
  | 'ORDER';

export type SearchMatchType =
  | 'EXACT'
  | 'ALIAS_EXACT'
  | 'PREFIX'
  | 'CONTAINS'
  | 'REVERSE_CONTAINS'
  | 'NEAR_CJK'
  | 'SECONDARY';

export interface SearchCandidate {
  id: string;
  label: string;
  primaryTexts: string[];
  aliasTexts?: string[];
  secondaryTexts?: string[];
  popularityScore?: number;
  payload?: unknown;
}

export interface SearchMatch {
  type: SearchMatchType;
  score: number;
  matchedText: string;
  query: string;
}

export interface RankedSearchCandidate<T extends SearchCandidate = SearchCandidate>
  extends T {
  match: SearchMatch | null;
}
```

- [ ] **Step 5: Add text helpers**

Create `backend/src/domain/search-governance/search-text.ts`:

```ts
const SEARCH_PUNCTUATION_PATTERN = /[()（）【】[\]{}_\-\\/·•.,，。:：;；'"`]/g;
const CJK_PATTERN = /^[\u3400-\u9fff]+$/u;

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .replace(SEARCH_PUNCTUATION_PATTERN, '');
}

export function isCjkOnlyQuery(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return normalized.length >= 2 && normalized.length <= 8 && CJK_PATTERN.test(normalized);
}

export function calculateEditDistance(left: string, right: string): number {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);
  const rows = normalizedLeft.length + 1;
  const cols = normalizedRight.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = normalizedLeft[row - 1] === normalizedRight[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[normalizedLeft.length][normalizedRight.length];
}
```

- [ ] **Step 6: Add matcher helpers**

Create `backend/src/domain/search-governance/search-matcher.ts`:

```ts
import type {
  RankedSearchCandidate,
  SearchCandidate,
  SearchMatch,
  SearchMatchType,
} from './search-governance.types';
import {
  calculateEditDistance,
  isCjkOnlyQuery,
  normalizeSearchText,
} from './search-text';

const MATCH_SCORES: Record<SearchMatchType, number> = {
  EXACT: 120,
  ALIAS_EXACT: 116,
  PREFIX: 105,
  CONTAINS: 95,
  REVERSE_CONTAINS: 90,
  NEAR_CJK: 72,
  SECONDARY: 60,
};

export function getSearchMatch(
  candidateText: string,
  rawQuery: string,
  typeOverride?: SearchMatchType,
): SearchMatch | null {
  const text = normalizeSearchText(candidateText);
  const query = normalizeSearchText(rawQuery);

  if (!text || !query) {
    return null;
  }

  if (text === query) {
    const type = typeOverride ?? 'EXACT';
    return { type, score: MATCH_SCORES[type], matchedText: candidateText, query: rawQuery };
  }

  if (text.startsWith(query)) {
    return { type: 'PREFIX', score: MATCH_SCORES.PREFIX, matchedText: candidateText, query: rawQuery };
  }

  if (text.includes(query)) {
    return { type: 'CONTAINS', score: MATCH_SCORES.CONTAINS, matchedText: candidateText, query: rawQuery };
  }

  if (query.includes(text)) {
    return {
      type: 'REVERSE_CONTAINS',
      score: MATCH_SCORES.REVERSE_CONTAINS,
      matchedText: candidateText,
      query: rawQuery,
    };
  }

  if (
    isCjkOnlyQuery(text) &&
    isCjkOnlyQuery(query) &&
    Math.abs(text.length - query.length) <= 1 &&
    calculateEditDistance(text, query) <= 1
  ) {
    return { type: 'NEAR_CJK', score: MATCH_SCORES.NEAR_CJK, matchedText: candidateText, query: rawQuery };
  }

  return null;
}

function bestMatchForTexts(
  texts: readonly string[],
  query: string,
  typeOverride?: SearchMatchType,
): SearchMatch | null {
  return texts.reduce<SearchMatch | null>((best, text) => {
    const next = getSearchMatch(text, query, typeOverride);
    if (!next) {
      return best;
    }
    return !best || next.score > best.score ? next : best;
  }, null);
}

export function rankSearchCandidates<T extends SearchCandidate>(
  candidates: readonly T[],
  rawQuery: string,
): RankedSearchCandidate<T>[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return candidates.map((candidate) => ({ ...candidate, match: null }));
  }

  return candidates
    .map((candidate) => {
      const primaryMatch = bestMatchForTexts(candidate.primaryTexts, rawQuery);
      const aliasMatch = bestMatchForTexts(candidate.aliasTexts ?? [], rawQuery, 'ALIAS_EXACT');
      const secondaryMatch = bestMatchForTexts(candidate.secondaryTexts ?? [], rawQuery, 'SECONDARY');
      const match = [primaryMatch, aliasMatch, secondaryMatch]
        .filter((item): item is SearchMatch => Boolean(item))
        .sort((left, right) => right.score - left.score)[0] ?? null;

      return { ...candidate, match };
    })
    .filter((candidate) => candidate.match)
    .sort((left, right) => {
      const scoreDiff = (right.match?.score ?? 0) - (left.match?.score ?? 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const popularityDiff = (right.popularityScore ?? 0) - (left.popularityScore ?? 0);
      if (popularityDiff !== 0) {
        return popularityDiff;
      }

      return left.label.localeCompare(right.label, 'zh-Hans-CN');
    });
}
```

- [ ] **Step 7: Run domain tests**

Run:

```bash
cd backend && npm test -- tests/domain/search-governance/search-text.spec.ts tests/domain/search-governance/search-matcher.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/domain/search-governance backend/tests/domain/search-governance
git commit -m "feat: add search governance matcher"
```

### Task 3: Backend Search Governance Service

**Files:**
- Create: `backend/src/application/search-governance/search-governance.service.ts`
- Test: `backend/tests/application/search-governance/search-governance.service.spec.ts`

- [ ] **Step 1: Write service tests for alias groups and expansion**

Create `backend/tests/application/search-governance/search-governance.service.spec.ts` with these cases:

```ts
import { BadRequestException } from '@nestjs/common';
import { SearchGovernanceService } from '../../../src/application/search-governance/search-governance.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('SearchGovernanceService', () => {
  const prisma = {
    searchAliasGroup: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    searchQueryLog: {
      create: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    searchAliasSuggestion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    searchAliasAuditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  let service: SearchGovernanceService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    service = new SearchGovernanceService(prisma as PrismaService);
  });

  it('expands query terms from active alias groups in the same domain only', async () => {
    prisma.searchAliasGroup.findMany.mockResolvedValue([
      {
        id: 'group-1',
        domain: 'INGREDIENT',
        canonicalTerm: '西兰花',
        aliases: ['西蓝花', 'broccoli'],
        status: 'ACTIVE',
      },
    ]);

    await expect(service.expandQuery('INGREDIENT', '西蓝花')).resolves.toEqual([
      '西蓝花',
      '西兰花',
      'broccoli',
    ]);

    expect(prisma.searchAliasGroup.findMany).toHaveBeenCalledWith({
      where: { domain: 'INGREDIENT', status: 'ACTIVE' },
      orderBy: { canonicalTerm: 'asc' },
    });
  });

  it('rejects alias conflicts inside the same active domain', async () => {
    prisma.searchAliasGroup.findMany.mockResolvedValue([
      {
        id: 'group-existing',
        domain: 'INGREDIENT',
        canonicalTerm: '三文鱼',
        aliases: ['salmon'],
        status: 'ACTIVE',
      },
    ]);

    await expect(
      service.createAliasGroup(
        {
          domain: 'INGREDIENT',
          canonicalTerm: '鲑鱼',
          aliases: ['salmon'],
          riskLevel: 'LOW',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records search events with normalized query text', async () => {
    prisma.searchQueryLog.create.mockResolvedValue({ id: 'log-1' });

    await service.recordSearchEvent({
      domain: 'ORDER',
      source: 'miniapp.staff-orders',
      rawQuery: '  待 支付 ',
      resultCount: 3,
      selectedEntityType: 'Order',
      selectedEntityId: 'order-1',
      selectedEntityName: 'NO20260522001',
      userId: 'staff-1',
    });

    expect(prisma.searchQueryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: 'ORDER',
        rawQuery: '  待 支付 ',
        normalizedQuery: '待支付',
        resultCount: 3,
      }),
    });
  });
});
```

- [ ] **Step 2: Run the failing service tests**

Run:

```bash
cd backend && npm test -- tests/application/search-governance/search-governance.service.spec.ts --runInBand
```

Expected: fail because the service does not exist.

- [ ] **Step 3: Implement service public methods**

Create `backend/src/application/search-governance/search-governance.service.ts` with these exported methods:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SearchAliasRiskLevel,
  SearchAliasSuggestionAction,
  SearchAliasSuggestionStatus,
  SearchGovernanceDomain,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { normalizeSearchText } from '../../domain/search-governance/search-text';

export interface CreateSearchAliasGroupInput {
  domain: SearchGovernanceDomain;
  canonicalTerm: string;
  aliases: string[];
  riskLevel?: SearchAliasRiskLevel;
  notes?: string | null;
}

export interface RecordSearchEventInput {
  domain: SearchGovernanceDomain;
  source: string;
  rawQuery: string;
  resultCount: number;
  selectedEntityType?: string | null;
  selectedEntityId?: string | null;
  selectedEntityName?: string | null;
  userId?: string | null;
}

@Injectable()
export class SearchGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async expandQuery(domain: SearchGovernanceDomain, rawQuery?: string | null) {
    const query = rawQuery?.trim();
    if (!query) {
      return [];
    }

    const normalizedQuery = normalizeSearchText(query);
    const terms = new Set<string>([query]);
    const groups = await this.prisma.searchAliasGroup.findMany({
      where: { domain, status: 'ACTIVE' },
      orderBy: { canonicalTerm: 'asc' },
    });

    groups.forEach((group) => {
      const allTerms = [group.canonicalTerm, ...group.aliases];
      const matched = allTerms.some((term) => {
        const normalizedTerm = normalizeSearchText(term);
        return (
          normalizedTerm === normalizedQuery ||
          normalizedTerm.includes(normalizedQuery) ||
          normalizedQuery.includes(normalizedTerm)
        );
      });

      if (matched) {
        allTerms.forEach((term) => terms.add(term));
      }
    });

    return Array.from(terms);
  }

  async createAliasGroup(input: CreateSearchAliasGroupInput, userId?: string | null) {
    await this.assertNoActiveAliasConflict(input.domain, input.aliases, null);

    return this.prisma.searchAliasGroup.create({
      data: {
        domain: input.domain,
        canonicalTerm: input.canonicalTerm.trim(),
        aliases: this.normalizeAliasList(input.aliases),
        riskLevel: input.riskLevel ?? 'LOW',
        notes: input.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  async recordSearchEvent(input: RecordSearchEventInput) {
    const trimmed = input.rawQuery.trim();
    if (!trimmed) {
      return null;
    }

    return this.prisma.searchQueryLog.create({
      data: {
        domain: input.domain,
        source: input.source,
        rawQuery: input.rawQuery,
        normalizedQuery: normalizeSearchText(input.rawQuery),
        resultCount: input.resultCount,
        selectedEntityType: input.selectedEntityType ?? null,
        selectedEntityId: input.selectedEntityId ?? null,
        selectedEntityName: input.selectedEntityName ?? null,
        userId: input.userId ?? null,
      },
    });
  }

  private normalizeAliasList(aliases: readonly string[]) {
    return Array.from(
      new Set(aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0)),
    );
  }

  private async assertNoActiveAliasConflict(
    domain: SearchGovernanceDomain,
    aliases: readonly string[],
    currentGroupId: string | null,
  ) {
    const normalizedAliases = new Set(aliases.map((alias) => normalizeSearchText(alias)));
    const groups = await this.prisma.searchAliasGroup.findMany({
      where: { domain, status: 'ACTIVE' },
    });

    const conflict = groups.find((group) => {
      if (currentGroupId && group.id === currentGroupId) {
        return false;
      }

      return [group.canonicalTerm, ...group.aliases].some((term) =>
        normalizedAliases.has(normalizeSearchText(term)),
      );
    });

    if (conflict) {
      throw new BadRequestException(`别名与 ${conflict.canonicalTerm} 冲突`);
    }
  }
}
```

Extend this skeleton in later steps with list/update/disable/insight/suggestion methods instead of creating a second service.

- [ ] **Step 4: Add list, update, disable, overview, and insights methods**

Add these methods to the same service:

```ts
async listAliasGroups(params: { domain?: SearchGovernanceDomain; status?: string }) {
  return this.prisma.searchAliasGroup.findMany({
    where: {
      ...(params.domain ? { domain: params.domain } : {}),
      ...(params.status ? { status: params.status as any } : {}),
    },
    orderBy: [{ domain: 'asc' }, { canonicalTerm: 'asc' }],
  });
}

async updateAliasGroup(id: string, input: CreateSearchAliasGroupInput, userId?: string | null) {
  const existing = await this.prisma.searchAliasGroup.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException('搜索别名组不存在');
  }

  await this.assertNoActiveAliasConflict(input.domain, input.aliases, id);

  return this.prisma.searchAliasGroup.update({
    where: { id },
    data: {
      domain: input.domain,
      canonicalTerm: input.canonicalTerm.trim(),
      aliases: this.normalizeAliasList(input.aliases),
      riskLevel: input.riskLevel ?? existing.riskLevel,
      notes: input.notes ?? null,
      updatedBy: userId ?? null,
    },
  });
}

async disableAliasGroup(id: string, userId?: string | null) {
  return this.prisma.searchAliasGroup.update({
    where: { id },
    data: {
      status: 'DISABLED',
      updatedBy: userId ?? null,
    },
  });
}

async getOverview() {
  const [aliasGroups, pendingSuggestions, recentNoResultLogs] = await Promise.all([
    this.prisma.searchAliasGroup.findMany({
      where: { status: 'ACTIVE' },
      select: { domain: true, id: true },
    }),
    this.prisma.searchAliasSuggestion.findMany({
      where: { status: 'PENDING' },
      select: { domain: true, id: true },
    }),
    this.prisma.searchQueryLog.findMany({
      where: { resultCount: 0 },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    activeAliasGroupCount: aliasGroups.length,
    pendingSuggestionCount: pendingSuggestions.length,
    recentNoResultQueries: recentNoResultLogs,
  };
}

async getQueryInsights(params: { domain?: SearchGovernanceDomain; days?: number }) {
  const since = new Date();
  since.setDate(since.getDate() - (params.days ?? 14));

  return this.prisma.searchQueryLog.findMany({
    where: {
      ...(params.domain ? { domain: params.domain } : {}),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}
```

Add tests for these methods in `backend/tests/application/search-governance/search-governance.service.spec.ts` by mocking `searchAliasGroup.findMany`, `searchAliasSuggestion.findMany`, and `searchQueryLog.findMany`, then asserting that `getOverview()` returns `activeAliasGroupCount`, `pendingSuggestionCount`, and `recentNoResultQueries`.

- [ ] **Step 5: Run service tests**

Run:

```bash
cd backend && npm test -- tests/application/search-governance/search-governance.service.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/application/search-governance/search-governance.service.ts backend/tests/application/search-governance/search-governance.service.spec.ts
git commit -m "feat: add search governance service"
```

### Task 4: Agent Suggestions And Approval Flow

**Files:**
- Create: `backend/src/application/search-governance/search-governance-agent.provider.ts`
- Modify: `backend/src/application/search-governance/search-governance.service.ts`
- Test: `backend/tests/application/search-governance/search-governance-agent.provider.spec.ts`
- Test: `backend/tests/application/search-governance/search-governance.service.spec.ts`

- [ ] **Step 1: Write Agent provider parser tests**

Create `backend/tests/application/search-governance/search-governance-agent.provider.spec.ts`:

```ts
import {
  normalizeSearchAliasSuggestionOutput,
} from '../../../src/application/search-governance/search-governance-agent.provider';

describe('search governance agent provider', () => {
  it('normalizes valid agent suggestions and drops malformed entries', () => {
    const result = normalizeSearchAliasSuggestionOutput({
      suggestions: [
        {
          domain: 'INGREDIENT',
          action: 'ADD_ALIAS',
          canonicalTerm: '鸡胸',
          aliases: ['鸡胸肉'],
          riskLevel: 'LOW',
          rationale: '用户高频搜索鸡胸肉后选择鸡胸。',
        },
        {
          domain: 'ORDER',
          action: 'CREATE_GROUP',
          canonicalTerm: '',
          aliases: [],
          riskLevel: 'LOW',
          rationale: 'invalid',
        },
      ],
    });

    expect(result).toEqual([
      {
        domain: 'INGREDIENT',
        action: 'ADD_ALIAS',
        payload: {
          canonicalTerm: '鸡胸',
          aliases: ['鸡胸肉'],
        },
        riskLevel: 'LOW',
        agentRationale: '用户高频搜索鸡胸肉后选择鸡胸。',
      },
    ]);
  });
});
```

- [ ] **Step 2: Write service tests for approval and rejection**

Add these cases to `backend/tests/application/search-governance/search-governance.service.spec.ts`:

```ts
it('applies approved ADD_ALIAS suggestions in a transaction', async () => {
  prisma.searchAliasSuggestion.findUnique.mockResolvedValue({
    id: 'suggestion-1',
    domain: 'INGREDIENT',
    action: 'ADD_ALIAS',
    status: 'PENDING',
    payload: { canonicalTerm: '鸡胸', aliases: ['鸡胸肉'] },
  });
  prisma.searchAliasGroup.findMany.mockResolvedValue([]);
  prisma.searchAliasGroup.findUnique.mockResolvedValue({
    id: 'group-1',
    domain: 'INGREDIENT',
    canonicalTerm: '鸡胸',
    aliases: ['chicken breast'],
  });
  prisma.searchAliasGroup.update.mockResolvedValue({
    id: 'group-1',
    aliases: ['chicken breast', '鸡胸肉'],
  });
  prisma.searchAliasSuggestion.update.mockResolvedValue({ id: 'suggestion-1', status: 'APPLIED' });

  await service.approveSuggestion('suggestion-1', 'admin-1');

  expect(prisma.searchAliasGroup.update).toHaveBeenCalledWith({
    where: { id: 'group-1' },
    data: expect.objectContaining({
      aliases: ['chicken breast', '鸡胸肉'],
      updatedBy: 'admin-1',
    }),
  });
  expect(prisma.searchAliasAuditLog.create).toHaveBeenCalled();
});

it('rejects suggestions without mutating alias groups', async () => {
  prisma.searchAliasSuggestion.update.mockResolvedValue({ id: 'suggestion-1', status: 'REJECTED' });

  await service.rejectSuggestion('suggestion-1', 'admin-1');

  expect(prisma.searchAliasGroup.update).not.toHaveBeenCalled();
  expect(prisma.searchAliasSuggestion.update).toHaveBeenCalledWith({
    where: { id: 'suggestion-1' },
    data: expect.objectContaining({
      status: 'REJECTED',
      reviewerId: 'admin-1',
    }),
  });
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
cd backend && npm test -- tests/application/search-governance/search-governance-agent.provider.spec.ts tests/application/search-governance/search-governance.service.spec.ts --runInBand
```

Expected: fail because the provider and approval methods are missing.

- [ ] **Step 4: Implement Agent provider normalizer**

Create `backend/src/application/search-governance/search-governance-agent.provider.ts`:

```ts
import {
  SearchAliasRiskLevel,
  SearchAliasSuggestionAction,
  SearchGovernanceDomain,
} from '@prisma/client';

const DOMAINS = new Set<string>(['INGREDIENT', 'NUTRITION_FOOD', 'BREED', 'ORDER']);
const ACTIONS = new Set<string>([
  'CREATE_GROUP',
  'ADD_ALIAS',
  'MERGE_GROUPS',
  'DISABLE_ALIAS',
  'UPDATE_CANONICAL',
]);
const RISK_LEVELS = new Set<string>(['LOW', 'MEDIUM', 'HIGH']);

export interface NormalizedSearchAliasSuggestion {
  domain: SearchGovernanceDomain;
  action: SearchAliasSuggestionAction;
  payload: Record<string, unknown>;
  riskLevel: SearchAliasRiskLevel;
  agentRationale: string;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)))
    : [];
}

export function normalizeSearchAliasSuggestionOutput(
  value: unknown,
): NormalizedSearchAliasSuggestion[] {
  const suggestions = Array.isArray((value as any)?.suggestions)
    ? (value as any).suggestions
    : [];

  return suggestions
    .map((item: any): NormalizedSearchAliasSuggestion | null => {
      const domain = String(item?.domain ?? '');
      const action = String(item?.action ?? '');
      const canonicalTerm = String(item?.canonicalTerm ?? '').trim();
      const aliases = normalizeStringArray(item?.aliases);
      const riskLevel = String(item?.riskLevel ?? 'MEDIUM');
      const agentRationale = String(item?.rationale ?? '').trim();

      if (!DOMAINS.has(domain) || !ACTIONS.has(action) || !canonicalTerm || aliases.length === 0) {
        return null;
      }

      return {
        domain: domain as SearchGovernanceDomain,
        action: action as SearchAliasSuggestionAction,
        payload: { canonicalTerm, aliases },
        riskLevel: (RISK_LEVELS.has(riskLevel) ? riskLevel : 'MEDIUM') as SearchAliasRiskLevel,
        agentRationale,
      };
    })
    .filter((item): item is NormalizedSearchAliasSuggestion => Boolean(item));
}
```

- [ ] **Step 5: Implement suggestion service methods**

Add methods to `SearchGovernanceService`:

```ts
async listSuggestions(params: { domain?: SearchGovernanceDomain; status?: SearchAliasSuggestionStatus }) {
  return this.prisma.searchAliasSuggestion.findMany({
    where: {
      ...(params.domain ? { domain: params.domain } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

async createSuggestion(input: {
  domain: SearchGovernanceDomain;
  action: SearchAliasSuggestionAction;
  payload: Prisma.InputJsonValue;
  evidence?: Prisma.InputJsonValue;
  riskLevel?: SearchAliasRiskLevel;
  agentRationale?: string | null;
}) {
  return this.prisma.searchAliasSuggestion.create({
    data: {
      domain: input.domain,
      action: input.action,
      payload: input.payload,
      evidence: input.evidence ?? {},
      riskLevel: input.riskLevel ?? 'MEDIUM',
      agentRationale: input.agentRationale ?? null,
    },
  });
}

async rejectSuggestion(id: string, reviewerId: string) {
  return this.prisma.searchAliasSuggestion.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewerId,
      reviewedAt: new Date(),
    },
  });
}

async generateSuggestions(params: { domain?: SearchGovernanceDomain; days?: number }) {
  const logs = await this.getQueryInsights(params);
  const noResultLogs = logs.filter((log: any) => log.resultCount === 0);
  const selectionLogs = logs.filter((log: any) => log.selectedEntityName);
  const suggestions = buildDeterministicSuggestionsFromLogs(noResultLogs, selectionLogs);

  return Promise.all(
    suggestions.map((suggestion) =>
      this.createSuggestion({
        domain: suggestion.domain,
        action: suggestion.action,
        payload: suggestion.payload as Prisma.InputJsonValue,
        evidence: suggestion.evidence as Prisma.InputJsonValue,
        riskLevel: suggestion.riskLevel,
        agentRationale: suggestion.agentRationale,
      }),
    ),
  );
}

async approveSuggestion(id: string, reviewerId: string) {
  return this.prisma.$transaction(async (tx) => {
    const suggestion = await tx.searchAliasSuggestion.findUnique({ where: { id } });
    if (!suggestion) {
      throw new NotFoundException('搜索建议不存在');
    }
    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException('只能审批待处理建议');
    }

    const payload = suggestion.payload as any;
    const canonicalTerm = String(payload.canonicalTerm ?? '').trim();
    const aliases = this.normalizeAliasList(payload.aliases ?? []);

    if (suggestion.action === 'ADD_ALIAS') {
      const group = await tx.searchAliasGroup.findFirst({
        where: { domain: suggestion.domain, canonicalTerm, status: 'ACTIVE' },
      });
      if (!group) {
        throw new BadRequestException('目标别名组不存在');
      }

      const nextAliases = this.normalizeAliasList([...group.aliases, ...aliases]);
      await tx.searchAliasGroup.update({
        where: { id: group.id },
        data: { aliases: nextAliases, updatedBy: reviewerId },
      });
      await tx.searchAliasAuditLog.create({
        data: {
          domain: suggestion.domain,
          action: 'ADD_ALIAS',
          before: group as any,
          after: { ...group, aliases: nextAliases },
          suggestionId: suggestion.id,
          operatorId: reviewerId,
        },
      });

      return tx.searchAliasSuggestion.update({
        where: { id },
        data: {
          status: 'APPLIED',
          reviewerId,
          reviewedAt: new Date(),
          appliedAt: new Date(),
        },
      });
    }

    if (suggestion.action === 'CREATE_GROUP') {
      const group = await tx.searchAliasGroup.create({
        data: {
          domain: suggestion.domain,
          canonicalTerm,
          aliases,
          riskLevel: suggestion.riskLevel,
          createdBy: reviewerId,
          updatedBy: reviewerId,
        },
      });
      await tx.searchAliasAuditLog.create({
        data: {
          domain: suggestion.domain,
          action: 'CREATE_GROUP',
          before: null,
          after: group as any,
          suggestionId: suggestion.id,
          operatorId: reviewerId,
        },
      });

      return tx.searchAliasSuggestion.update({
        where: { id },
        data: {
          status: 'APPLIED',
          reviewerId,
          reviewedAt: new Date(),
          appliedAt: new Date(),
        },
      });
    }

    return tx.searchAliasSuggestion.update({
      where: { id },
      data: {
        status: 'FAILED',
        reviewerId,
        reviewedAt: new Date(),
        errorMessage: `暂不支持自动应用 ${suggestion.action}`,
      },
    });
  });
}
```

Add `buildDeterministicSuggestionsFromLogs` below the service class. It should group records by `domain + normalizedQuery + selectedEntityName`, create `ADD_ALIAS` suggestions when the selected entity name exists and differs from the query, and create `CREATE_GROUP` suggestions only when at least three no-result logs share the same normalized query.

- [ ] **Step 6: Run Agent and service tests**

Run:

```bash
cd backend && npm test -- tests/application/search-governance/search-governance-agent.provider.spec.ts tests/application/search-governance/search-governance.service.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/application/search-governance/search-governance-agent.provider.ts backend/src/application/search-governance/search-governance.service.ts backend/tests/application/search-governance/search-governance-agent.provider.spec.ts backend/tests/application/search-governance/search-governance.service.spec.ts
git commit -m "feat: add search alias suggestion workflow"
```

### Task 5: Admin Search Governance API

**Files:**
- Create: `backend/src/interfaces/dto/search-governance/search-governance.dto.ts`
- Create: `backend/src/interfaces/controllers/search-governance.controller.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/interfaces/controllers/search-governance.controller.spec.ts`

- [ ] **Step 1: Write controller delegation tests**

Create `backend/tests/interfaces/controllers/search-governance.controller.spec.ts`:

```ts
import { SearchGovernanceController } from '../../../src/interfaces/controllers/search-governance.controller';

describe('SearchGovernanceController', () => {
  const service = {
    getOverview: jest.fn(),
    listAliasGroups: jest.fn(),
    createAliasGroup: jest.fn(),
    updateAliasGroup: jest.fn(),
    disableAliasGroup: jest.fn(),
    getQueryInsights: jest.fn(),
    listSuggestions: jest.fn(),
    generateSuggestions: jest.fn(),
    approveSuggestion: jest.fn(),
    rejectSuggestion: jest.fn(),
  } as any;

  const currentUser = { userId: 'admin-1', role: 'ADMIN' } as any;
  let controller: SearchGovernanceController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new SearchGovernanceController(service);
  });

  it('creates alias groups with CurrentUser id', async () => {
    service.createAliasGroup.mockResolvedValue({ id: 'group-1' });

    await expect(
      controller.createAliasGroup(
        {
          domain: 'INGREDIENT',
          canonicalTerm: '鸡胸',
          aliases: ['鸡胸肉'],
          riskLevel: 'LOW',
        },
        currentUser,
      ),
    ).resolves.toMatchObject({ code: 0, data: { id: 'group-1' } });

    expect(service.createAliasGroup).toHaveBeenCalledWith(
      {
        domain: 'INGREDIENT',
        canonicalTerm: '鸡胸',
        aliases: ['鸡胸肉'],
        riskLevel: 'LOW',
      },
      'admin-1',
    );
  });

  it('approves suggestions with CurrentUser id', async () => {
    service.approveSuggestion.mockResolvedValue({ id: 'suggestion-1', status: 'APPLIED' });

    await controller.approveSuggestion('suggestion-1', currentUser);

    expect(service.approveSuggestion).toHaveBeenCalledWith('suggestion-1', 'admin-1');
  });
});
```

- [ ] **Step 2: Run failing controller test**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/search-governance.controller.spec.ts --runInBand
```

Expected: fail because controller and DTOs do not exist.

- [ ] **Step 3: Add DTOs**

Create `backend/src/interfaces/dto/search-governance/search-governance.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const SEARCH_GOVERNANCE_DOMAINS = [
  'INGREDIENT',
  'NUTRITION_FOOD',
  'BREED',
  'ORDER',
] as const;

export const SEARCH_ALIAS_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;

export class ListSearchAliasGroupsQueryDto {
  @IsOptional()
  @IsIn(SEARCH_GOVERNANCE_DOMAINS)
  domain?: (typeof SEARCH_GOVERNANCE_DOMAINS)[number];

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

export class UpsertSearchAliasGroupDto {
  @IsIn(SEARCH_GOVERNANCE_DOMAINS)
  domain!: (typeof SEARCH_GOVERNANCE_DOMAINS)[number];

  @IsString()
  canonicalTerm!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  aliases!: string[];

  @IsOptional()
  @IsIn(SEARCH_ALIAS_RISK_LEVELS)
  riskLevel?: (typeof SEARCH_ALIAS_RISK_LEVELS)[number];

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class SearchInsightsQueryDto {
  @IsOptional()
  @IsIn(SEARCH_GOVERNANCE_DOMAINS)
  domain?: (typeof SEARCH_GOVERNANCE_DOMAINS)[number];

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  days?: number;
}
```

- [ ] **Step 4: Add controller**

Create `backend/src/interfaces/controllers/search-governance.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SearchGovernanceService } from '../../application/search-governance/search-governance.service';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AdminGuard } from '../guards/role.guard';
import {
  ListSearchAliasGroupsQueryDto,
  SearchInsightsQueryDto,
  UpsertSearchAliasGroupDto,
} from '../dto/search-governance/search-governance.dto';

@ApiTags('Admin Search Governance')
@ApiBearerAuth()
@Controller('api/v1/admin/search-governance')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SearchGovernanceController {
  constructor(private readonly searchGovernanceService: SearchGovernanceService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取搜索治理概览' })
  @ApiResponse({ status: 200, description: '搜索治理概览' })
  async getOverview(): Promise<ApiResponseDto<unknown>> {
    return new ApiResponseDto(0, 'Success', await this.searchGovernanceService.getOverview());
  }

  @Get('alias-groups')
  async listAliasGroups(@Query() query: ListSearchAliasGroupsQueryDto): Promise<ApiResponseDto<unknown>> {
    return new ApiResponseDto(0, 'Success', await this.searchGovernanceService.listAliasGroups(query));
  }

  @Post('alias-groups')
  async createAliasGroup(
    @Body() dto: UpsertSearchAliasGroupDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.createAliasGroup(dto as any, user.userId);
    return new ApiResponseDto(0, '别名组已创建', result);
  }

  @Put('alias-groups/:id')
  async updateAliasGroup(
    @Param('id') id: string,
    @Body() dto: UpsertSearchAliasGroupDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.updateAliasGroup(id, dto as any, user.userId);
    return new ApiResponseDto(0, '别名组已更新', result);
  }

  @Post('alias-groups/:id/disable')
  async disableAliasGroup(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    const result = await this.searchGovernanceService.disableAliasGroup(id, user.userId);
    return new ApiResponseDto(0, '别名组已停用', result);
  }

  @Get('query-insights')
  async getQueryInsights(@Query() query: SearchInsightsQueryDto): Promise<ApiResponseDto<unknown>> {
    return new ApiResponseDto(0, 'Success', await this.searchGovernanceService.getQueryInsights(query as any));
  }

  @Get('suggestions')
  async listSuggestions(@Query() query: any): Promise<ApiResponseDto<unknown>> {
    return new ApiResponseDto(0, 'Success', await this.searchGovernanceService.listSuggestions(query));
  }

  @Post('suggestions/generate')
  async generateSuggestions(@Body() body: any): Promise<ApiResponseDto<unknown>> {
    return new ApiResponseDto(0, 'Agent 建议已生成', await this.searchGovernanceService.generateSuggestions(body));
  }

  @Post('suggestions/:id/approve')
  async approveSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    return new ApiResponseDto(0, '建议已应用', await this.searchGovernanceService.approveSuggestion(id, user.userId));
  }

  @Post('suggestions/:id/reject')
  async rejectSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<unknown>> {
    return new ApiResponseDto(0, '建议已拒绝', await this.searchGovernanceService.rejectSuggestion(id, user.userId));
  }
}
```

- [ ] **Step 5: Register controller and service**

Modify `backend/src/app.module.ts`:

```ts
import { SearchGovernanceController } from './interfaces/controllers/search-governance.controller';
import { SearchGovernanceService } from './application/search-governance/search-governance.service';
```

Add `SearchGovernanceController` to `controllers` and `SearchGovernanceService` to `providers`.

- [ ] **Step 6: Run controller tests**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/search-governance.controller.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/interfaces/dto/search-governance backend/src/interfaces/controllers/search-governance.controller.ts backend/src/app.module.ts backend/tests/interfaces/controllers/search-governance.controller.spec.ts
git commit -m "feat: expose search governance admin api"
```

### Task 6: Admin Web Search Governance Page

**Files:**
- Create: `admin-web/src/types/searchGovernance.ts`
- Create: `admin-web/src/api/searchGovernance.ts`
- Create: `admin-web/src/views/SearchGovernance/index.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`
- Test: `admin-web/tests/searchGovernancePage.test.js`

- [ ] **Step 1: Write admin source tests**

Create `admin-web/tests/searchGovernancePage.test.js`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('search governance route and sidebar entry exist', () => {
  const router = read('src/router/index.ts')
  const layout = read('src/layouts/MainLayout.vue')

  assert.match(router, /path:\s*"search-governance"/)
  assert.match(router, /name:\s*"SearchGovernance"/)
  assert.match(router, /title:\s*"搜索治理"/)
  assert.match(layout, /index="\/search-governance"/)
  assert.match(layout, /搜索治理/)
})

test('search governance API exposes alias groups, insights, and suggestions', () => {
  const api = read('src/api/searchGovernance.ts')

  assert.match(api, /listAliasGroups/)
  assert.match(api, /createAliasGroup/)
  assert.match(api, /updateAliasGroup/)
  assert.match(api, /disableAliasGroup/)
  assert.match(api, /getQueryInsights/)
  assert.match(api, /generateSuggestions/)
  assert.match(api, /approveSuggestion/)
  assert.match(api, /rejectSuggestion/)
})

test('search governance page includes all operational tabs', () => {
  const page = read('src/views/SearchGovernance/index.vue')

  assert.match(page, /搜索概览/)
  assert.match(page, /词库管理/)
  assert.match(page, /搜索洞察/)
  assert.match(page, /Agent 建议/)
  assert.match(page, /应用范围/)
  assert.match(page, /handleApproveSuggestion/)
  assert.match(page, /handleRejectSuggestion/)
  assert.match(page, /aliasFormVisible/)
})
```

- [ ] **Step 2: Run failing admin test**

Run:

```bash
cd admin-web && node --test tests/searchGovernancePage.test.js
```

Expected: fail because files and route are missing.

- [ ] **Step 3: Add types**

Create `admin-web/src/types/searchGovernance.ts`:

```ts
export type SearchGovernanceDomain = 'INGREDIENT' | 'NUTRITION_FOOD' | 'BREED' | 'ORDER'
export type SearchAliasGroupStatus = 'ACTIVE' | 'DISABLED'
export type SearchAliasRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type SearchAliasSuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'FAILED'

export interface SearchAliasGroup {
  id: string
  domain: SearchGovernanceDomain
  canonicalTerm: string
  aliases: string[]
  status: SearchAliasGroupStatus
  riskLevel: SearchAliasRiskLevel
  notes?: string | null
  createdBy?: string | null
  updatedBy?: string | null
  createdAt: string
  updatedAt: string
}

export interface SearchAliasSuggestion {
  id: string
  domain: SearchGovernanceDomain
  action: string
  status: SearchAliasSuggestionStatus
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
  riskLevel: SearchAliasRiskLevel
  agentRationale?: string | null
  errorMessage?: string | null
  createdAt: string
}

export interface UpsertSearchAliasGroupPayload {
  domain: SearchGovernanceDomain
  canonicalTerm: string
  aliases: string[]
  riskLevel?: SearchAliasRiskLevel
  notes?: string | null
}
```

- [ ] **Step 4: Add API helper**

Create `admin-web/src/api/searchGovernance.ts`:

```ts
import api from './index'
import type {
  SearchAliasGroup,
  SearchAliasSuggestion,
  SearchGovernanceDomain,
  UpsertSearchAliasGroupPayload
} from '@/types/searchGovernance'

export const searchGovernanceApi = {
  getOverview: (): Promise<any> =>
    api.get('/admin/search-governance/overview'),

  listAliasGroups: (params?: {
    domain?: SearchGovernanceDomain
    status?: string
  }): Promise<SearchAliasGroup[]> =>
    api.get('/admin/search-governance/alias-groups', { params }),

  createAliasGroup: (data: UpsertSearchAliasGroupPayload): Promise<SearchAliasGroup> =>
    api.post('/admin/search-governance/alias-groups', data),

  updateAliasGroup: (id: string, data: UpsertSearchAliasGroupPayload): Promise<SearchAliasGroup> =>
    api.put(`/admin/search-governance/alias-groups/${id}`, data),

  disableAliasGroup: (id: string): Promise<SearchAliasGroup> =>
    api.post(`/admin/search-governance/alias-groups/${id}/disable`),

  getQueryInsights: (params?: { domain?: SearchGovernanceDomain; days?: number }): Promise<any> =>
    api.get('/admin/search-governance/query-insights', { params }),

  listSuggestions: (params?: {
    domain?: SearchGovernanceDomain
    status?: string
  }): Promise<SearchAliasSuggestion[]> =>
    api.get('/admin/search-governance/suggestions', { params }),

  generateSuggestions: (data: { domain?: SearchGovernanceDomain; days?: number }): Promise<SearchAliasSuggestion[]> =>
    api.post('/admin/search-governance/suggestions/generate', data, { timeout: 180000 }),

  approveSuggestion: (id: string): Promise<SearchAliasSuggestion> =>
    api.post(`/admin/search-governance/suggestions/${id}/approve`),

  rejectSuggestion: (id: string): Promise<SearchAliasSuggestion> =>
    api.post(`/admin/search-governance/suggestions/${id}/reject`)
}

export default searchGovernanceApi
```

Add `export { searchGovernanceApi } from './searchGovernance'` to `admin-web/src/api/index.ts`.

- [ ] **Step 5: Add page skeleton**

Create `admin-web/src/views/SearchGovernance/index.vue` with Element Plus tabs and these state/function names:

```ts
const activeTab = ref('overview')
const selectedDomain = ref<SearchGovernanceDomain | ''>('')
const aliasGroups = ref<SearchAliasGroup[]>([])
const suggestions = ref<SearchAliasSuggestion[]>([])
const aliasFormVisible = ref(false)
const aliasForm = reactive<UpsertSearchAliasGroupPayload>({
  domain: 'INGREDIENT',
  canonicalTerm: '',
  aliases: [],
  riskLevel: 'LOW',
  notes: ''
})

async function loadAliasGroups() {
  aliasGroups.value = await searchGovernanceApi.listAliasGroups({
    domain: selectedDomain.value || undefined
  })
}

async function handleApproveSuggestion(row: SearchAliasSuggestion) {
  await searchGovernanceApi.approveSuggestion(row.id)
  await loadSuggestions()
  await loadAliasGroups()
}

async function handleRejectSuggestion(row: SearchAliasSuggestion) {
  await searchGovernanceApi.rejectSuggestion(row.id)
  await loadSuggestions()
}
```

The visible tabs must be named exactly: `搜索概览`, `词库管理`, `搜索洞察`, `Agent 建议`, `应用范围`.

- [ ] **Step 6: Add route and menu item**

Modify `admin-web/src/router/index.ts` under the authenticated children:

```ts
{
  path: "search-governance",
  name: "SearchGovernance",
  component: () => import("@/views/SearchGovernance/index.vue"),
  meta: { title: "搜索治理" },
},
```

Modify `admin-web/src/layouts/MainLayout.vue` to add:

```vue
<el-menu-item index="/search-governance">
  <el-icon><Search /></el-icon>
  <span>搜索治理</span>
</el-menu-item>
```

Import `Search` from `@element-plus/icons-vue`.

- [ ] **Step 7: Run admin tests and build**

Run:

```bash
cd admin-web && node --test tests/searchGovernancePage.test.js
cd admin-web && npm run build
```

Expected: source test and admin build pass.

- [ ] **Step 8: Commit**

```bash
git add admin-web/src/types/searchGovernance.ts admin-web/src/api/searchGovernance.ts admin-web/src/api/index.ts admin-web/src/views/SearchGovernance/index.vue admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue admin-web/tests/searchGovernancePage.test.js
git commit -m "feat: add search governance admin page"
```

### Task 7: Ingredient And Nutrition Search Integration

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/application/nutrition-food/nutrition-food.service.ts`
- Modify: `backend/src/application/purchasing/purchasing.service.ts`
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Test: `backend/tests/application/nutrition-food/nutrition-food.service.spec.ts`
- Test: `backend/tests/application/purchasing/purchasing.service.spec.ts`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Add recipe designer search tests**

Add tests in `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`:

```ts
it('uses search governance to expand ingredient aliases and long-short names', async () => {
  const searchGovernance = {
    expandQuery: jest.fn().mockResolvedValue(['鸡胸肉', '鸡胸', 'chicken breast']),
    recordSearchEvent: jest.fn(),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      RecipeDesignerService,
      { provide: PrismaService, useValue: prisma },
      { provide: 'FediafTargetProvider', useValue: targetProvider },
      { provide: 'SearchGovernanceService', useValue: searchGovernance },
    ],
  }).compile();

  const governedService = moduleRef.get(RecipeDesignerService);
  prisma.ingredient.count.mockResolvedValue(0);
  prisma.ingredient.findMany.mockResolvedValue([]);

  await governedService.listIngredientOptions({ search: '鸡胸肉', page: 1, pageSize: 20 });

  const where = prisma.ingredient.count.mock.calls[0][0].where;
  expect(searchGovernance.expandQuery).toHaveBeenCalledWith('INGREDIENT', '鸡胸肉');
  expect(where.OR).toEqual(
    expect.arrayContaining([
      { name: { contains: '鸡胸', mode: 'insensitive' } },
      { name: { contains: 'chicken breast', mode: 'insensitive' } },
    ]),
  );
});
```

- [ ] **Step 2: Run failing recipe designer test**

Run:

```bash
cd backend && npm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts --runInBand
```

Expected: fail until `RecipeDesignerService` injects and uses search governance.

- [ ] **Step 3: Inject search governance into RecipeDesignerService**

Modify constructor in `backend/src/application/recipe-designer/recipe-designer.service.ts`:

```ts
constructor(
  private readonly prisma: PrismaService,
  @Inject(FEDIAF_TARGET_PROVIDER)
  private readonly targetProvider: FediafTargetProvider,
  private readonly searchGovernanceService: SearchGovernanceService,
) {}
```

Import:

```ts
import { SearchGovernanceService } from '../search-governance/search-governance.service';
```

Replace `expandIngredientSearchTerms(dto.search)` with:

```ts
const searchTerms = await this.searchGovernanceService.expandQuery(
  'INGREDIENT',
  dto.search,
);
```

Keep the existing Prisma `contains` conditions for prescreening. Add a fallback: when `dto.search` is present and `ingredients.length` is less than `pageSize`, rank the returned options with `rankSearchCandidates` before pagination.

- [ ] **Step 4: Update miniapp empty state copy**

Modify `miniapp/src/pages/recipe-designer/editor.vue` empty state for ingredient picker to include:

```vue
<text class="picker-state-hint">仅显示已维护并验证营养档案的原料，可尝试缩短关键词</text>
```

Add regression expectations in `miniapp/src/pages/recipe-designer.regression.spec.ts`:

```ts
expect(editorSource).toContain('仅显示已维护并验证营养档案的原料')
expect(editorSource).toContain('可尝试缩短关键词')
```

- [ ] **Step 5: Add nutrition-food service search expansion test and implementation**

In `backend/tests/application/nutrition-food/nutrition-food.service.spec.ts`, add a test that `findAll({ search: '西蓝花' })` calls `searchGovernanceService.expandQuery('NUTRITION_FOOD', '西蓝花')` and includes expanded terms in `OR`.

Modify `NutritionFoodService` constructor to accept `SearchGovernanceService`, then build `OR` from expanded terms for `name`, `nameEn`, and `displayNameZh`.

- [ ] **Step 6: Add purchasing ingredient search test and implementation**

In `backend/tests/application/purchasing/purchasing.service.spec.ts`, add a test where keyword `鸡胸肉` matches an ingredient named `鸡胸` after `expandQuery('INGREDIENT', '鸡胸肉')`.

Modify `getStockReplenishmentIngredients` to expand the keyword through `SearchGovernanceService` and match against ingredient name, purchase channel, product model, and procurement SKU fields.

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd backend && npm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts tests/application/nutrition-food/nutrition-food.service.spec.ts tests/application/purchasing/purchasing.service.spec.ts --runInBand
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/src/application/nutrition-food/nutrition-food.service.ts backend/src/application/purchasing/purchasing.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts backend/tests/application/nutrition-food/nutrition-food.service.spec.ts backend/tests/application/purchasing/purchasing.service.spec.ts miniapp/src/pages/recipe-designer/editor.vue miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "feat: connect ingredient search governance"
```

### Task 8: Breed Search Integration

**Files:**
- Modify: `miniapp/src/utils/dog-breed-search.ts`
- Add or modify: `miniapp/src/utils/dog-breed-search.spec.ts`
- Modify: `backend/src/application/dog/dog.service.ts`
- Test: `backend/tests/application/dog/dog.service.spec.ts`

- [ ] **Step 1: Add miniapp breed search tests**

Create or update `miniapp/src/utils/dog-breed-search.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filterBreedsByKeyword } from './dog-breed-search'

describe('dog breed governed search', () => {
  it('matches aliases, normalized text, and light typo variants', () => {
    const breeds = [
      { name: '拉布拉多寻回犬', aliases: ['拉布拉多', 'labrador retriever'], isCommon: true },
      { name: '金毛寻回犬', aliases: ['金毛', 'golden retriever'], isCommon: true },
    ]

    expect(filterBreedsByKeyword(breeds, 'labrador')[0].name).toBe('拉布拉多寻回犬')
    expect(filterBreedsByKeyword(breeds, '拉布拉多犬')[0].name).toBe('拉布拉多寻回犬')
    expect(filterBreedsByKeyword(breeds, '金毛犬')[0].name).toBe('金毛寻回犬')
  })
})
```

- [ ] **Step 2: Run miniapp breed test**

Run:

```bash
cd miniapp && npm test -- src/utils/dog-breed-search.spec.ts
```

Expected: pass if current local helper already supports these cases; if it fails, adjust helper using the shared matching rules from the backend domain.

- [ ] **Step 3: Add backend breed logging/expansion test**

In `backend/tests/application/dog/dog.service.spec.ts`, add a service-level test for any backend breed search method that receives a keyword. If the current backend service only lists breeds without keyword filtering, add a small method `searchBreeds(keyword)` that expands `BREED` aliases and returns ranked breeds.

Expected service behavior:

```ts
expect(searchGovernance.expandQuery).toHaveBeenCalledWith('BREED', '拉布拉多犬');
```

- [ ] **Step 4: Implement backend breed search integration**

Modify `backend/src/application/dog/dog.service.ts` to use `SearchGovernanceService` for backend breed keyword searches. Keep miniapp local filtering intact for instant UI, but make backend search governance the source for logging and future server-side breed search.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd backend && npm test -- tests/application/dog/dog.service.spec.ts --runInBand
cd miniapp && npm test -- src/utils/dog-breed-search.spec.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/utils/dog-breed-search.ts miniapp/src/utils/dog-breed-search.spec.ts backend/src/application/dog/dog.service.ts backend/tests/application/dog/dog.service.spec.ts
git commit -m "feat: connect breed search governance"
```

### Task 9: Order Search Integration

**Files:**
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `miniapp/src/pages/staff-orders/index.vue`
- Modify: `miniapp/src/pages/staff-orders.regression.spec.ts`
- Test: `backend/tests/application/order/order.service.spec.ts`
- Test: `backend/tests/interfaces/controllers/admin.controller.spec.ts`

- [ ] **Step 1: Add order service tests**

In `backend/tests/application/order/order.service.spec.ts`, add tests for keyword matching:

```ts
it('matches order keyword by status alias and phone suffix', async () => {
  searchGovernance.expandQuery.mockResolvedValue(['待支付', '未付款', '未支付']);

  await service.listOrders({
    keyword: '未付款',
  } as any);

  expect(searchGovernance.expandQuery).toHaveBeenCalledWith('ORDER', '未付款');
});
```

Add another test that a keyword `1388` matches customer phone suffix when phone is present in the searchable order projection.

- [ ] **Step 2: Run failing order tests**

Run:

```bash
cd backend && npm test -- tests/application/order/order.service.spec.ts --runInBand
```

Expected: fail until order service uses search governance expansion.

- [ ] **Step 3: Implement order keyword normalization and status mapping**

Modify `backend/src/application/order/order.service.ts`:

- Inject `SearchGovernanceService`.
- Call `expandQuery('ORDER', keyword)`.
- Match expanded terms against order ID, order number, dog name, customer nickname, phone suffix, and status label.
- Preserve existing exact status filters.
- Keep broad semantic aliasing disabled; only use configured status alias groups and deterministic text normalization.

- [ ] **Step 4: Update staff order search copy**

Modify `miniapp/src/pages/staff-orders/index.vue` quick search placeholder to:

```vue
placeholder="按订单号/狗狗名/手机号后四位/状态搜索"
```

Modify `miniapp/src/pages/staff-orders.regression.spec.ts`:

```ts
expect(source).toContain('按订单号/狗狗名/手机号后四位/状态搜索')
expect(source).toContain('params.keyword = keyword')
```

- [ ] **Step 5: Add admin controller delegation test**

In `backend/tests/interfaces/controllers/admin.controller.spec.ts`, add or update a test proving `keyword` is passed to the service and not split into separate ad hoc fields.

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd backend && npm test -- tests/application/order/order.service.spec.ts tests/interfaces/controllers/admin.controller.spec.ts --runInBand
cd miniapp && npm test -- src/pages/staff-orders.regression.spec.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/application/order/order.service.ts backend/src/interfaces/controllers/admin.controller.ts backend/tests/application/order/order.service.spec.ts backend/tests/interfaces/controllers/admin.controller.spec.ts miniapp/src/pages/staff-orders/index.vue miniapp/src/pages/staff-orders.regression.spec.ts
git commit -m "feat: connect order search governance"
```

### Task 10: End-To-End Verification And Build

**Files:**
- No planned source edits.

- [ ] **Step 1: Run backend search governance tests**

Run:

```bash
cd backend && npm test -- tests/prisma/search-governance-schema.spec.ts tests/domain/search-governance/search-text.spec.ts tests/domain/search-governance/search-matcher.spec.ts tests/application/search-governance/search-governance.service.spec.ts tests/application/search-governance/search-governance-agent.provider.spec.ts tests/interfaces/controllers/search-governance.controller.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 2: Run backend integration-focused tests**

Run:

```bash
cd backend && npm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts tests/application/nutrition-food/nutrition-food.service.spec.ts tests/application/purchasing/purchasing.service.spec.ts tests/application/dog/dog.service.spec.ts tests/application/order/order.service.spec.ts tests/interfaces/controllers/admin.controller.spec.ts --runInBand
```

Expected: pass.

- [ ] **Step 3: Run admin source tests and build**

Run:

```bash
cd admin-web && node --test tests/searchGovernancePage.test.js tests/nutritionGovernanceAgentSettings.test.ts tests/nutritionGovernanceWorkbench.test.js
cd admin-web && npm run build
```

Expected: source tests and build pass.

- [ ] **Step 4: Run miniapp focused tests**

Run:

```bash
cd miniapp && npm test -- src/pages/recipe-designer.regression.spec.ts src/pages/staff-orders.regression.spec.ts src/utils/dog-breed-search.spec.ts
```

Expected: pass.

- [ ] **Step 5: Run Prisma generate and backend build**

Run:

```bash
cd backend && DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen} npx prisma generate
cd backend && npm run build
```

Expected: Prisma generation and Nest build pass.

- [ ] **Step 6: Run miniapp build**

Run:

```bash
cd miniapp && npm run build:mp-weixin
```

Expected: build completes and writes `miniapp/dist/build/mp-weixin`.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short --branch
```

Expected: only intended source/test changes are present before final commit or PR workflow.

- [ ] **Step 8: Handle verification failures through the owning task**

If Step 1 through Step 6 fails, return to the task that owns the failing file, add or adjust the focused test there, and make the smallest source change needed for that task. Do not make ad hoc verification-only changes outside a task boundary.
