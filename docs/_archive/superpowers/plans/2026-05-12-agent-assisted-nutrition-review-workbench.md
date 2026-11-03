# Agent-Assisted Nutrition Review Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Web-admin approval workbench where nutrition candidates are semantically reviewed by an Agent/model, protected by deterministic hard gates, and confirmed into the nutrition library only after admin approval.

**Architecture:** Keep deterministic code responsible for candidate generation, nutrient normalization, hard gates, persistence, and confirmation writes. Add a provider-style Agent review layer that returns structured JSON advice and cache that advice on candidates. Upgrade the existing `NutritionGovernance` admin page into an approval queue with filters, detail drawer, editable state/spec fields, primary/secondary confirmation, and batch confirmation for low-risk candidates.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Vue 3, Element Plus, existing admin API client, Jest/Vitest-style focused tests, Node built-in test for lightweight admin-web source regressions.

---

## File Map

- `backend/prisma/schema.prisma`: add candidate review cache fields and nutrition profile specification labels.
- `backend/prisma/migrations/202605120002_agent_assisted_nutrition_review/migration.sql`: database migration for the new fields.
- `backend/src/domain/nutrition-governance/agent-review.types.ts`: structured Agent review schema and constants.
- `backend/src/domain/nutrition-governance/nutrition-candidate-hard-gates.ts`: deterministic hard-gate evaluator.
- `backend/src/application/nutrition-governance/nutrition-candidate-review.provider.ts`: provider interface plus disabled/local fallback provider.
- `backend/src/application/nutrition-governance/nutrition-governance.service.ts`: run Agent review, list enriched candidates, confirm primary/secondary with labels, batch-confirm safe candidates.
- `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`: request DTOs for Agent review, candidate confirmation, batch confirmation, and candidate filters.
- `backend/src/interfaces/controllers/nutrition-governance.controller.ts`: new admin endpoints.
- `admin-web/src/types/nutritionGovernance.ts`: review advice, hard-gate, confirm body, filter types.
- `admin-web/src/api/nutritionGovernance.ts`: new API functions.
- `admin-web/src/views/NutritionGovernance/index.vue`: queue filters and batch actions.
- `admin-web/src/views/NutritionGovernance/components/FoodCandidatesTable.vue`: list columns for Agent advice and hard gates.
- `admin-web/src/views/NutritionGovernance/components/CandidateReviewDrawer.vue`: detail approval drawer with source evidence, nutrition preview, editable labels, and confirm controls.
- Tests:
  - `backend/tests/prisma/agent-assisted-nutrition-review-schema.spec.ts`
  - `backend/tests/domain/nutrition-governance/nutrition-candidate-hard-gates.spec.ts`
  - `backend/tests/application/nutrition-governance/nutrition-candidate-agent-review.spec.ts`
  - `backend/tests/application/nutrition-governance/nutrition-candidate-confirmation-workbench.spec.ts`
  - `admin-web/tests/nutritionGovernanceWorkbench.test.js`

## Task 1: Schema For Agent Advice, Hard Gates, And Specification Labels

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605120002_agent_assisted_nutrition_review/migration.sql`
- Test: `backend/tests/prisma/agent-assisted-nutrition-review-schema.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Create `backend/tests/prisma/agent-assisted-nutrition-review-schema.spec.ts`:

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

describe('agent-assisted nutrition review schema', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('stores Agent review and hard-gate cache on food candidates', () => {
    const block = modelBlock(schema, 'IngredientNutritionCandidate');

    expect(block).toMatch(/agentReview\\s+Json\\?/);
    expect(block).toMatch(/agentReviewStatus\\s+String\\?/);
    expect(block).toMatch(/hardGateResults\\s+Json\\?/);
    expect(block).toMatch(/reviewGroup\\s+String\\?/);
    expect(block).toMatch(/preparationState\\s+String\\?/);
    expect(block).toMatch(/preparationStateLabel\\s+String\\?/);
    expect(block).toMatch(/ediblePortionLabel\\s+String\\?/);
    expect(block).toMatch(/processingLabel\\s+String\\?/);
    expect(block).toMatch(/reviewNote\\s+String\\?/);
  });

  it('stores edible portion and processing labels on confirmed nutrition foods', () => {
    const block = modelBlock(schema, 'NutritionFood');

    expect(block).toMatch(/ediblePortionLabel\\s+String\\?/);
    expect(block).toMatch(/processingLabel\\s+String\\?/);
  });

  it('adds a migration for the review workbench fields', () => {
    const migrationPath = join(
      __dirname,
      '../../prisma/migrations/202605120002_agent_assisted_nutrition_review/migration.sql',
    );
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('agent_review');
    expect(migration).toContain('hard_gate_results');
    expect(migration).toContain('review_group');
    expect(migration).toContain('edible_portion_label');
    expect(migration).toContain('processing_label');
  });
});
```

- [ ] **Step 2: Run the failing schema test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/prisma/agent-assisted-nutrition-review-schema.spec.ts --runInBand
```

Expected: FAIL because the schema fields and migration do not exist yet.

- [ ] **Step 3: Add Prisma fields**

In `backend/prisma/schema.prisma`, add these fields to `NutritionFood` near the existing preparation fields:

```prisma
  ediblePortionLabel    String?                @map("edible_portion_label") @db.VarChar(100)
  processingLabel       String?                @map("processing_label") @db.VarChar(100)
```

Add these fields to `IngredientNutritionCandidate` near `matchReasons` and `normalizedNutrition`:

```prisma
  agentReview           Json?                     @map("agent_review")
  agentReviewStatus     String?                   @map("agent_review_status") @db.VarChar(40)
  hardGateResults       Json?                     @map("hard_gate_results")
  reviewGroup           String?                   @map("review_group") @db.VarChar(40)
  preparationState      String?                   @map("preparation_state") @db.VarChar(50)
  preparationStateLabel String?                   @map("preparation_state_label") @db.VarChar(100)
  ediblePortionLabel    String?                   @map("edible_portion_label") @db.VarChar(100)
  processingLabel       String?                   @map("processing_label") @db.VarChar(100)
  reviewNote            String?                   @map("review_note")
```

- [ ] **Step 4: Add migration SQL**

Create `backend/prisma/migrations/202605120002_agent_assisted_nutrition_review/migration.sql`:

```sql
ALTER TABLE "nutrition_food" ADD COLUMN "edible_portion_label" VARCHAR(100);
ALTER TABLE "nutrition_food" ADD COLUMN "processing_label" VARCHAR(100);

ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "agent_review" JSONB;
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "agent_review_status" VARCHAR(40);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "hard_gate_results" JSONB;
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "review_group" VARCHAR(40);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "preparation_state" VARCHAR(50);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "preparation_state_label" VARCHAR(100);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "edible_portion_label" VARCHAR(100);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "processing_label" VARCHAR(100);
ALTER TABLE "ingredient_nutrition_candidate" ADD COLUMN "review_note" TEXT;

CREATE INDEX "ingredient_nutrition_candidate_review_group_idx"
  ON "ingredient_nutrition_candidate"("review_group");

CREATE INDEX "ingredient_nutrition_candidate_agent_review_status_idx"
  ON "ingredient_nutrition_candidate"("agent_review_status");
```

- [ ] **Step 5: Run schema validation and the schema test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npx prisma validate
npm test -- tests/prisma/agent-assisted-nutrition-review-schema.spec.ts --runInBand
```

Expected: PASS.

## Task 2: Structured Agent Review Contract And Hard Gates

**Files:**
- Create: `backend/src/domain/nutrition-governance/agent-review.types.ts`
- Create: `backend/src/domain/nutrition-governance/nutrition-candidate-hard-gates.ts`
- Test: `backend/tests/domain/nutrition-governance/nutrition-candidate-hard-gates.spec.ts`

- [ ] **Step 1: Write the failing hard-gate tests**

Create `backend/tests/domain/nutrition-governance/nutrition-candidate-hard-gates.spec.ts`:

```ts
import {
  evaluateNutritionCandidateHardGates,
  resolveCandidateReviewGroup,
} from 'src/domain/nutrition-governance/nutrition-candidate-hard-gates';

const nutritionProfile = {
  macros: {
    energyKcal: 120,
    crudeProtein: 20,
    crudeFat: 5,
  },
  meta: {
    rawBasisType: 'PER_100_G',
    sourceCode: 'USDA_FDC',
  },
};

const baseCandidate = {
  id: 'candidate-1',
  normalizedNutrition: nutritionProfile,
  sourceRecord: { id: 'source-1', sourceKey: 'USDA:123', foodName: 'Chicken breast, raw' },
  agentReview: {
    recommendedAction: 'CONFIRM_PRIMARY',
    confidence: 'HIGH',
    identityVerdict: 'MATCH',
    stateVerdict: 'MATCH',
    ediblePortionVerdict: 'MATCH',
    processingVerdict: 'ACCEPTABLE',
    riskFlags: [],
  },
};

describe('nutrition candidate hard gates', () => {
  it('allows an Agent-approved candidate with source and critical nutrients', () => {
    const result = evaluateNutritionCandidateHardGates(baseCandidate);

    expect(result.canBatchConfirm).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(resolveCandidateReviewGroup(result, baseCandidate.agentReview)).toBe('AUTO_REVIEWABLE');
  });

  it('blocks batch confirmation when Agent recommends finding another source', () => {
    const result = evaluateNutritionCandidateHardGates({
      ...baseCandidate,
      agentReview: {
        ...baseCandidate.agentReview,
        recommendedAction: 'FIND_ALTERNATIVE_SOURCE',
      },
    });

    expect(result.canBatchConfirm).toBe(false);
    expect(result.blockingReasons).toContain('AGENT_RECOMMENDS_ALTERNATIVE');
    expect(resolveCandidateReviewGroup(result, baseCandidate.agentReview)).toBe('NOT_RECOMMENDED');
  });

  it('blocks missing critical nutrition data', () => {
    const result = evaluateNutritionCandidateHardGates({
      ...baseCandidate,
      normalizedNutrition: { macros: { crudeProtein: 20 }, meta: { rawBasisType: 'PER_100_G' } },
    });

    expect(result.canBatchConfirm).toBe(false);
    expect(result.blockingReasons).toContain('MISSING_CRITICAL_NUTRIENTS');
  });
});
```

- [ ] **Step 2: Run the failing hard-gate tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/nutrition-governance/nutrition-candidate-hard-gates.spec.ts --runInBand
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add Agent review types**

Create `backend/src/domain/nutrition-governance/agent-review.types.ts`:

```ts
export type AgentReviewVerdict = 'MATCH' | 'POSSIBLE_MATCH' | 'MISMATCH' | 'UNKNOWN' | 'NOT_APPLICABLE';
export type AgentProcessingVerdict = 'ACCEPTABLE' | 'RISKY' | 'INCOMPATIBLE' | 'UNKNOWN';
export type AgentReviewRecommendedAction =
  | 'CONFIRM_PRIMARY'
  | 'CONFIRM_SECONDARY'
  | 'NEEDS_HUMAN_REVIEW'
  | 'REJECT'
  | 'FIND_ALTERNATIVE_SOURCE';
export type AgentReviewConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CandidateReviewGroup =
  | 'AUTO_REVIEWABLE'
  | 'NEEDS_REVIEW'
  | 'NOT_RECOMMENDED'
  | 'MISSING_SOURCE';

export interface NutritionCandidateAgentReview {
  provider?: string;
  model?: string;
  promptVersion?: string;
  identityVerdict: AgentReviewVerdict;
  stateVerdict: AgentReviewVerdict;
  ediblePortionVerdict: AgentReviewVerdict;
  processingVerdict: AgentProcessingVerdict;
  recommendedAction: AgentReviewRecommendedAction;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  riskFlags: string[];
  rationale: string;
  confidence: AgentReviewConfidence;
}

export interface CandidateHardGateResult {
  canBatchConfirm: boolean;
  blockingReasons: string[];
  warningReasons: string[];
}
```

- [ ] **Step 4: Add hard-gate evaluator**

Create `backend/src/domain/nutrition-governance/nutrition-candidate-hard-gates.ts`:

```ts
import { normalizeNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../ingredient/types';
import type {
  CandidateHardGateResult,
  CandidateReviewGroup,
  NutritionCandidateAgentReview,
} from './agent-review.types';

const CRITICAL_FIELDS = ['macros.energyKcal', 'macros.crudeProtein', 'macros.crudeFat'] as const;

export interface NutritionCandidateHardGateInput {
  normalizedNutrition?: unknown;
  sourceRecord?: unknown;
  agentReview?: Partial<NutritionCandidateAgentReview> | null;
}

export function evaluateNutritionCandidateHardGates(
  candidate: NutritionCandidateHardGateInput,
): CandidateHardGateResult {
  const blockingReasons: string[] = [];
  const warningReasons: string[] = [];

  if (!candidate.sourceRecord) {
    blockingReasons.push('MISSING_SOURCE_RECORD');
  }

  const profile = normalizeNutritionProfile(candidate.normalizedNutrition as NutritionProfile);
  if (!profile) {
    blockingReasons.push('MISSING_NORMALIZED_NUTRITION');
  } else {
    const missingCritical = CRITICAL_FIELDS.filter((field) => !hasFiniteField(profile, field));
    if (missingCritical.length > 0) {
      blockingReasons.push('MISSING_CRITICAL_NUTRIENTS');
    }
    if (!profile.meta?.rawBasisType) {
      warningReasons.push('MISSING_RAW_BASIS');
    }
  }

  if (!candidate.agentReview) {
    blockingReasons.push('MISSING_AGENT_REVIEW');
  } else {
    if (candidate.agentReview.confidence === 'LOW') {
      blockingReasons.push('LOW_AGENT_CONFIDENCE');
    }
    if (candidate.agentReview.recommendedAction === 'REJECT') {
      blockingReasons.push('AGENT_RECOMMENDS_REJECT');
    }
    if (candidate.agentReview.recommendedAction === 'FIND_ALTERNATIVE_SOURCE') {
      blockingReasons.push('AGENT_RECOMMENDS_ALTERNATIVE');
    }
  }

  return {
    canBatchConfirm: blockingReasons.length === 0,
    blockingReasons,
    warningReasons,
  };
}

export function resolveCandidateReviewGroup(
  hardGateResult: CandidateHardGateResult,
  agentReview?: Partial<NutritionCandidateAgentReview> | null,
): CandidateReviewGroup {
  if (hardGateResult.blockingReasons.includes('MISSING_SOURCE_RECORD')) {
    return 'MISSING_SOURCE';
  }
  if (
    hardGateResult.blockingReasons.includes('AGENT_RECOMMENDS_REJECT') ||
    hardGateResult.blockingReasons.includes('AGENT_RECOMMENDS_ALTERNATIVE')
  ) {
    return 'NOT_RECOMMENDED';
  }
  if (hardGateResult.canBatchConfirm && agentReview?.recommendedAction === 'CONFIRM_PRIMARY') {
    return 'AUTO_REVIEWABLE';
  }
  return 'NEEDS_REVIEW';
}

function hasFiniteField(value: unknown, fieldPath: string): boolean {
  const fieldValue = fieldPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);

  return typeof fieldValue === 'number' && Number.isFinite(fieldValue);
}
```

- [ ] **Step 5: Run hard-gate tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/domain/nutrition-governance/nutrition-candidate-hard-gates.spec.ts --runInBand
```

Expected: PASS.

## Task 3: Agent Review Provider And Candidate Review Endpoint

**Files:**
- Create: `backend/src/application/nutrition-governance/nutrition-candidate-review.provider.ts`
- Modify: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`
- Modify: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
- Test: `backend/tests/application/nutrition-governance/nutrition-candidate-agent-review.spec.ts`

- [ ] **Step 1: Write the failing Agent review service test**

Create `backend/tests/application/nutrition-governance/nutrition-candidate-agent-review.spec.ts`:

```ts
import { NutritionGovernanceService } from 'src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceService Agent review', () => {
  const mockPrisma = {
    ingredientNutritionCandidate: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const reviewProvider = {
    reviewFoodCandidate: jest.fn(),
  };

  let service: NutritionGovernanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NutritionGovernanceService(mockPrisma, undefined, reviewProvider as any);
  });

  it('runs Agent review, evaluates hard gates, and caches review metadata', async () => {
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      id: 'candidate-1',
      normalizedNutrition: {
        macros: { energyKcal: 120, crudeProtein: 20, crudeFat: 5 },
        meta: { rawBasisType: 'PER_100_G' },
      },
      ingredient: { id: 'ingredient-1', name: '鸡胸肉', type: 'FOOD' },
      sourceRecord: {
        id: 'source-1',
        sourceKey: 'USDA:123',
        foodName: 'Chicken breast, boneless, skinless, raw',
        category: 'Poultry Products',
      },
    });
    reviewProvider.reviewFoodCandidate.mockResolvedValue({
      recommendedAction: 'CONFIRM_PRIMARY',
      confidence: 'HIGH',
      identityVerdict: 'MATCH',
      stateVerdict: 'MATCH',
      ediblePortionVerdict: 'MATCH',
      processingVerdict: 'ACCEPTABLE',
      preparationState: 'RAW',
      preparationStateLabel: '生重',
      ediblePortionLabel: '去皮去骨',
      processingLabel: null,
      riskFlags: [],
      rationale: 'Matches chicken breast raw edible portion.',
      provider: 'test',
      model: 'test-model',
      promptVersion: 'nutrition-candidate-review-v1',
    });
    mockPrisma.ingredientNutritionCandidate.update.mockImplementation(async ({ data }) => ({
      id: 'candidate-1',
      ...data,
    }));

    const result = await service.reviewCandidateWithAgent('candidate-1');

    expect(result.reviewGroup).toBe('AUTO_REVIEWABLE');
    expect(result.preparationStateLabel).toBe('生重');
    expect(result.ediblePortionLabel).toBe('去皮去骨');
    expect(result.hardGateResults).toEqual(
      expect.objectContaining({ canBatchConfirm: true }),
    );
  });
});
```

- [ ] **Step 2: Run the failing Agent review test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/application/nutrition-governance/nutrition-candidate-agent-review.spec.ts --runInBand
```

Expected: FAIL because the provider and `reviewCandidateWithAgent` do not exist.

- [ ] **Step 3: Add the provider interface and fallback**

Create `backend/src/application/nutrition-governance/nutrition-candidate-review.provider.ts`:

```ts
import type { NutritionCandidateAgentReview } from '../../domain/nutrition-governance/agent-review.types';

export const NUTRITION_CANDIDATE_REVIEW_PROVIDER = Symbol('NUTRITION_CANDIDATE_REVIEW_PROVIDER');

export interface NutritionCandidateReviewInput {
  ingredient: { id: string; name: string; type: string };
  sourceRecord: {
    id: string;
    sourceType?: string;
    sourceKey?: string | null;
    foodName?: string | null;
    foodNameEn?: string | null;
    category?: string | null;
    dataType?: string | null;
  };
  normalizedNutrition: unknown;
}

export interface NutritionCandidateReviewProvider {
  reviewFoodCandidate(input: NutritionCandidateReviewInput): Promise<NutritionCandidateAgentReview>;
}

export class DisabledNutritionCandidateReviewProvider implements NutritionCandidateReviewProvider {
  async reviewFoodCandidate(): Promise<NutritionCandidateAgentReview> {
    return {
      provider: 'disabled',
      model: 'disabled',
      promptVersion: 'nutrition-candidate-review-v1',
      identityVerdict: 'UNKNOWN',
      stateVerdict: 'UNKNOWN',
      ediblePortionVerdict: 'UNKNOWN',
      processingVerdict: 'UNKNOWN',
      recommendedAction: 'NEEDS_HUMAN_REVIEW',
      preparationState: null,
      preparationStateLabel: null,
      ediblePortionLabel: null,
      processingLabel: null,
      riskFlags: ['AGENT_REVIEW_PROVIDER_DISABLED'],
      rationale: 'Agent review provider is not configured; manual review is required.',
      confidence: 'MEDIUM',
    };
  }
}
```

- [ ] **Step 4: Wire provider into service and module**

Update the `NutritionGovernanceService` constructor to accept the new provider:

```ts
constructor(
  private readonly prisma: PrismaService,
  @Optional()
  @Inject(LABEL_RECOGNITION_PROVIDER)
  private readonly labelRecognitionProvider?: LabelRecognitionProvider,
  @Optional()
  @Inject(NUTRITION_CANDIDATE_REVIEW_PROVIDER)
  private readonly candidateReviewProvider?: NutritionCandidateReviewProvider,
) {}
```

Add this provider to `backend/src/app.module.ts` next to the existing label recognition provider:

```ts
{
  provide: NUTRITION_CANDIDATE_REVIEW_PROVIDER,
  useClass: DisabledNutritionCandidateReviewProvider,
},
```

- [ ] **Step 5: Implement `reviewCandidateWithAgent`**

Add this method to `NutritionGovernanceService`:

```ts
async reviewCandidateWithAgent(candidateId: string) {
  const candidate = await this.prisma.ingredientNutritionCandidate.findUnique({
    where: { id: candidateId },
    include: { ingredient: true, sourceRecord: true },
  });

  if (!candidate) {
    throw new NotFoundException('营养候选不存在');
  }

  const agentReview = await this.getCandidateReviewProvider().reviewFoodCandidate({
    ingredient: {
      id: candidate.ingredient.id,
      name: candidate.ingredient.name,
      type: candidate.ingredient.type,
    },
    sourceRecord: candidate.sourceRecord,
    normalizedNutrition: candidate.normalizedNutrition,
  });

  const hardGateResults = evaluateNutritionCandidateHardGates({
    normalizedNutrition: candidate.normalizedNutrition,
    sourceRecord: candidate.sourceRecord,
    agentReview,
  });
  const reviewGroup = resolveCandidateReviewGroup(hardGateResults, agentReview);

  return this.prisma.ingredientNutritionCandidate.update({
    where: { id: candidate.id },
    data: {
      agentReview: toJsonInput(agentReview),
      agentReviewStatus: 'COMPLETED',
      hardGateResults: toJsonInput(hardGateResults),
      reviewGroup,
      preparationState: agentReview.preparationState ?? null,
      preparationStateLabel: agentReview.preparationStateLabel ?? null,
      ediblePortionLabel: agentReview.ediblePortionLabel ?? null,
      processingLabel: agentReview.processingLabel ?? null,
    },
    include: { ingredient: true, sourceRecord: true },
  });
}

private getCandidateReviewProvider(): NutritionCandidateReviewProvider {
  return this.candidateReviewProvider ?? new DisabledNutritionCandidateReviewProvider();
}
```

Import `evaluateNutritionCandidateHardGates`, `resolveCandidateReviewGroup`, `NUTRITION_CANDIDATE_REVIEW_PROVIDER`, `NutritionCandidateReviewProvider`, and `DisabledNutritionCandidateReviewProvider`.

- [ ] **Step 6: Add API endpoint**

Add DTO to `nutrition-governance.dto.ts`:

```ts
export class ReviewCandidateWithAgentDto {
  @ApiPropertyOptional({ description: '强制重新生成 Agent 审核结果' })
  @IsOptional()
  force?: boolean;
}
```

Add controller endpoint:

```ts
@Post('candidates/:id/agent-review')
@ApiOperation({ summary: '运行 Agent 语义审核并缓存结果' })
async reviewCandidateWithAgent(@Param('id') id: string) {
  const result = await this.nutritionGovernanceService.reviewCandidateWithAgent(id);
  return new ApiResponseDto(0, 'Agent 审核已完成', result);
}
```

- [ ] **Step 7: Run the Agent review test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/application/nutrition-governance/nutrition-candidate-agent-review.spec.ts --runInBand
```

Expected: PASS.

## Task 4: Confirmation Workbench API

**Files:**
- Modify: `backend/src/application/nutrition-governance/nutrition-governance.service.ts`
- Modify: `backend/src/interfaces/dto/nutrition-governance/nutrition-governance.dto.ts`
- Modify: `backend/src/interfaces/controllers/nutrition-governance.controller.ts`
- Test: `backend/tests/application/nutrition-governance/nutrition-candidate-confirmation-workbench.spec.ts`

- [ ] **Step 1: Write the failing confirmation API test**

Create `backend/tests/application/nutrition-governance/nutrition-candidate-confirmation-workbench.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { NutritionCandidateStatus } from '@prisma/client';
import { NutritionGovernanceService } from 'src/application/nutrition-governance/nutrition-governance.service';

describe('NutritionGovernanceService confirmation workbench', () => {
  const mockPrisma = {
    ingredientNutritionCandidate: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    ingredient: { update: jest.fn() },
    nutritionFood: { upsert: jest.fn() },
    nutritionFoodMapping: { updateMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  } as any;

  let service: NutritionGovernanceService;

  const candidate = {
    id: 'candidate-1',
    ingredientId: 'ingredient-1',
    sourceRecordId: 'source-1',
    status: NutritionCandidateStatus.CANDIDATE,
    confidence: 'HIGH',
    score: 0.95,
    normalizedNutrition: {
      macros: { energyKcal: 120, crudeProtein: 20, crudeFat: 5 },
      meta: { rawBasisType: 'PER_100_G' },
    },
    agentReview: { recommendedAction: 'CONFIRM_PRIMARY', confidence: 'HIGH', riskFlags: [] },
    hardGateResults: { canBatchConfirm: true, blockingReasons: [], warningReasons: [] },
    preparationState: 'RAW',
    preparationStateLabel: '生重',
    ediblePortionLabel: '去皮去骨',
    processingLabel: null,
    ingredient: { id: 'ingredient-1', type: 'FOOD', name: '鸡胸肉' },
    sourceRecord: {
      id: 'source-1',
      sourceType: 'USDA',
      sourceKey: 'USDA:123',
      sourceTitle: 'USDA Chicken Breast',
      sourceDetail: { provider: 'USDA FoodData Central' },
      foodName: 'Chicken breast, boneless, skinless, raw',
      foodNameEn: 'Chicken breast, boneless, skinless, raw',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(mockPrisma));
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue(candidate);
    mockPrisma.nutritionFood.upsert.mockResolvedValue({ id: 'nutrition-food-1' });
    mockPrisma.ingredientNutritionCandidate.update.mockResolvedValue({ id: 'candidate-1', status: 'CONFIRMED' });
    service = new NutritionGovernanceService(mockPrisma);
  });

  it('confirms an Agent-reviewed candidate as primary with state/spec labels', async () => {
    await service.confirmCandidateFromWorkbench('candidate-1', 'admin-1', {
      mappingRole: 'PRIMARY',
      preparationState: 'RAW',
      preparationStateLabel: '生重',
      ediblePortionLabel: '去皮去骨',
      processingLabel: null,
      reviewNote: 'Reviewed in workbench',
    });

    expect(mockPrisma.nutritionFood.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          preparationState: 'RAW',
          preparationStateLabel: '生重',
          ediblePortionLabel: '去皮去骨',
        }),
      }),
    );
    expect(mockPrisma.nutritionFoodMapping.updateMany).toHaveBeenCalled();
    expect(mockPrisma.nutritionFoodMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isPrimary: true }),
        update: expect.objectContaining({ isPrimary: true }),
      }),
    );
  });

  it('blocks batch confirmation when hard gates fail', async () => {
    mockPrisma.ingredientNutritionCandidate.findUnique.mockResolvedValue({
      ...candidate,
      hardGateResults: { canBatchConfirm: false, blockingReasons: ['LOW_AGENT_CONFIDENCE'] },
    });

    await expect(
      service.confirmCandidateFromWorkbench('candidate-1', 'admin-1', {
        mappingRole: 'PRIMARY',
        batchMode: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the failing confirmation test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/application/nutrition-governance/nutrition-candidate-confirmation-workbench.spec.ts --runInBand
```

Expected: FAIL because `confirmCandidateFromWorkbench` does not exist.

- [ ] **Step 3: Add confirmation DTOs**

Add to `nutrition-governance.dto.ts`:

```ts
export class ConfirmNutritionCandidateDto {
  @ApiProperty({ description: '映射角色', enum: ['PRIMARY', 'SECONDARY'] })
  @IsString()
  mappingRole!: 'PRIMARY' | 'SECONDARY';

  @ApiPropertyOptional({ description: '生熟/干鲜状态' })
  @IsOptional()
  @IsString()
  preparationState?: string | null;

  @ApiPropertyOptional({ description: '状态显示名' })
  @IsOptional()
  @IsString()
  preparationStateLabel?: string | null;

  @ApiPropertyOptional({ description: '可食部/规格显示名' })
  @IsOptional()
  @IsString()
  ediblePortionLabel?: string | null;

  @ApiPropertyOptional({ description: '加工标记显示名' })
  @IsOptional()
  @IsString()
  processingLabel?: string | null;

  @ApiPropertyOptional({ description: '审核备注' })
  @IsOptional()
  @IsString()
  reviewNote?: string | null;

  @ApiPropertyOptional({ description: '是否批量确认模式' })
  @IsOptional()
  batchMode?: boolean;
}

export class BatchConfirmNutritionCandidatesDto {
  @ApiProperty({ description: '候选ID列表', type: [String] })
  candidateIds!: string[];
}
```

- [ ] **Step 4: Implement workbench confirmation service**

Add `confirmCandidateFromWorkbench(candidateId, userId, dto)` to `NutritionGovernanceService` by extracting the existing `confirmCandidate` write logic and adding:

```ts
if (dto.batchMode && !candidate.hardGateResults?.canBatchConfirm) {
  throw new BadRequestException('该候选未通过批量确认硬闸门');
}

const isPrimary = dto.mappingRole === 'PRIMARY';
const preparationState = dto.preparationState ?? candidate.preparationState ?? null;
const preparationStateLabel = dto.preparationStateLabel ?? candidate.preparationStateLabel ?? null;
const ediblePortionLabel = dto.ediblePortionLabel ?? candidate.ediblePortionLabel ?? null;
const processingLabel = dto.processingLabel ?? candidate.processingLabel ?? null;
```

Use these fields when upserting `NutritionFood`, when writing `confirmationSnapshot`, and when updating the candidate review fields.

When `isPrimary` is false:

```ts
await client.nutritionFoodMapping.upsert({
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
    isPrimary: false,
    notes: dto.reviewNote ?? candidate.sourceRecord.sourceTitle,
  },
  update: {
    isPrimary: false,
    notes: dto.reviewNote ?? candidate.sourceRecord.sourceTitle,
  },
});
```

Only update `Ingredient.nutritionProfile` when `isPrimary` is true.

- [ ] **Step 5: Add controller endpoints**

Replace the existing confirm handler to accept a body and call workbench confirmation:

```ts
@Post('candidates/:id/confirm')
async confirmCandidate(
  @Param('id') id: string,
  @Body() dto: ConfirmNutritionCandidateDto,
) {
  const result = await this.nutritionGovernanceService.confirmCandidateFromWorkbench(
    id,
    'admin',
    dto,
  );
  return new ApiResponseDto(0, '确认成功', result);
}
```

Add batch endpoint:

```ts
@Post('candidates/batch-confirm')
async batchConfirmCandidates(@Body() dto: BatchConfirmNutritionCandidatesDto) {
  const result = await this.nutritionGovernanceService.batchConfirmCandidatesFromWorkbench(
    dto.candidateIds,
    'admin',
  );
  return new ApiResponseDto(0, '批量确认成功', result);
}
```

- [ ] **Step 6: Run confirmation tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm test -- tests/application/nutrition-governance/nutrition-candidate-confirmation-workbench.spec.ts tests/application/nutrition-governance/nutrition-governance.service.spec.ts --runInBand
```

Expected: PASS. Existing confirmation tests may need to pass `{ mappingRole: 'PRIMARY' }` through the existing controller/service compatibility path.

## Task 5: Admin-Web Approval Workbench

**Files:**
- Modify: `admin-web/src/types/nutritionGovernance.ts`
- Modify: `admin-web/src/api/nutritionGovernance.ts`
- Modify: `admin-web/src/views/NutritionGovernance/index.vue`
- Modify: `admin-web/src/views/NutritionGovernance/components/FoodCandidatesTable.vue`
- Create: `admin-web/src/views/NutritionGovernance/components/CandidateReviewDrawer.vue`
- Test: `admin-web/tests/nutritionGovernanceWorkbench.test.js`

- [ ] **Step 1: Write the failing admin-web source regression test**

Create `admin-web/tests/nutritionGovernanceWorkbench.test.js`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8')

test('nutrition governance types expose Agent review and hard-gate fields', () => {
  const types = read('admin-web/src/types/nutritionGovernance.ts')

  assert.match(types, /NutritionCandidateAgentReview/)
  assert.match(types, /CandidateHardGateResults/)
  assert.match(types, /reviewGroup\\?:/)
  assert.match(types, /ediblePortionLabel\\?:/)
})

test('nutrition governance API exposes Agent review and batch confirmation', () => {
  const api = read('admin-web/src/api/nutritionGovernance.ts')

  assert.match(api, /reviewCandidateWithAgent/)
  assert.match(api, /batchConfirmCandidates/)
  assert.match(api, /ConfirmNutritionCandidatePayload/)
})

test('nutrition governance workbench shows review queue controls and detail drawer', () => {
  const page = read('admin-web/src/views/NutritionGovernance/index.vue')
  const table = read('admin-web/src/views/NutritionGovernance/components/FoodCandidatesTable.vue')
  const drawer = read('admin-web/src/views/NutritionGovernance/components/CandidateReviewDrawer.vue')

  assert.match(page, /reviewGroupFilter/)
  assert.match(page, /handleBatchConfirm/)
  assert.match(table, /Agent建议/)
  assert.match(table, /硬闸门/)
  assert.match(drawer, /营养状态/)
  assert.match(drawer, /确认为主档案/)
  assert.match(drawer, /确认为次级档案/)
})
```

- [ ] **Step 2: Run the failing admin-web test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
node --test tests/nutritionGovernanceWorkbench.test.js
```

Expected: FAIL because the workbench fields and drawer do not exist yet.

- [ ] **Step 3: Extend admin-web types and API**

In `admin-web/src/types/nutritionGovernance.ts`, add:

```ts
export type NutritionCandidateReviewGroup =
  | 'AUTO_REVIEWABLE'
  | 'NEEDS_REVIEW'
  | 'NOT_RECOMMENDED'
  | 'MISSING_SOURCE'

export interface NutritionCandidateAgentReview {
  provider?: string
  model?: string
  promptVersion?: string
  recommendedAction: string
  confidence: NutritionMatchConfidence
  rationale: string
  riskFlags: string[]
  preparationState?: string | null
  preparationStateLabel?: string | null
  ediblePortionLabel?: string | null
  processingLabel?: string | null
}

export interface CandidateHardGateResults {
  canBatchConfirm: boolean
  blockingReasons: string[]
  warningReasons: string[]
}

export interface ConfirmNutritionCandidatePayload {
  mappingRole: 'PRIMARY' | 'SECONDARY'
  preparationState?: string | null
  preparationStateLabel?: string | null
  ediblePortionLabel?: string | null
  processingLabel?: string | null
  reviewNote?: string | null
}
```

Add matching optional fields to `IngredientNutritionCandidate`.

In `admin-web/src/api/nutritionGovernance.ts`, add:

```ts
  reviewCandidateWithAgent: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/agent-review`),

  confirmCandidate: (
    id: string,
    data: ConfirmNutritionCandidatePayload
  ): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/confirm`, data),

  batchConfirmCandidates: (candidateIds: string[]): Promise<IngredientNutritionCandidate[]> =>
    api.post('/admin/nutrition-governance/candidates/batch-confirm', { candidateIds }),
```

- [ ] **Step 4: Add candidate review drawer**

Create `CandidateReviewDrawer.vue` with props:

```ts
defineProps<{
  modelValue: boolean
  candidate: IngredientNutritionCandidateListItem | null
  busy?: boolean
}>()
```

It must display:

- standard ingredient name.
- source food name and source key.
- Agent rationale and risk flags.
- hard-gate blocking/warning reasons.
- nutrition preview using `NutritionProfilePreview`.
- editable `preparationStateLabel`, `ediblePortionLabel`, `processingLabel`, `reviewNote`.
- buttons emitting:
  - `review-agent`
  - `confirm-primary`
  - `confirm-secondary`
  - `reject`

- [ ] **Step 5: Upgrade table and page**

In `FoodCandidatesTable.vue`, add columns:

- `Agent建议`: display `row.agentReview?.recommendedAction`, `row.agentReview?.confidence`, and short rationale.
- `营养状态`: display `row.preparationStateLabel`, `row.ediblePortionLabel`, `row.processingLabel`.
- `硬闸门`: display pass/fail from `row.hardGateResults?.canBatchConfirm`.
- `队列`: display `row.reviewGroup`.

In `index.vue`, add:

- `reviewGroupFilter`.
- batch selection state from `el-table` selection events.
- `handleRunAgentReview(candidate)`.
- `handleOpenCandidate(candidate)`.
- `handleConfirmCandidateFromDrawer(payload)`.
- `handleBatchConfirm()`.

- [ ] **Step 6: Run admin-web test and build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
node --test tests/nutritionGovernanceWorkbench.test.js
npm run build
```

Expected: PASS. Vite may print existing chunk-size warnings; those are acceptable if exit code is 0.

## Task 6: Final Verification

**Files:**
- All touched files

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npx prisma validate
npm test -- tests/prisma/agent-assisted-nutrition-review-schema.spec.ts tests/domain/nutrition-governance/nutrition-candidate-hard-gates.spec.ts tests/application/nutrition-governance/nutrition-candidate-agent-review.spec.ts tests/application/nutrition-governance/nutrition-candidate-confirmation-workbench.spec.ts tests/application/nutrition-governance/nutrition-governance.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run admin-web focused tests and build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/admin-web
node --test tests/nutritionGovernanceWorkbench.test.js
npm run build
```

Expected: PASS.

- [ ] **Step 4: Review diff and commit**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance
git diff --stat
git status --short
```

If verification passes, commit:

```bash
git add backend admin-web docs/superpowers/specs/2026-05-12-ingredient-nutrition-database-phase-one-design.md docs/superpowers/plans/2026-05-12-agent-assisted-nutrition-review-workbench.md
git commit -m "feat: add agent-assisted nutrition review workbench"
```

Expected: a clean worktree after commit.
