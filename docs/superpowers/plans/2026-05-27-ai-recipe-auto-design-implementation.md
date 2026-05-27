# AI Recipe Auto Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first admin-only AI-first nutrition assessment and recipe auto-design foundation for SevenKitchen.

**Architecture:** Implement the system as independently testable milestones: knowledge governance, evidence confirmation, nutrition assessment, constraint synthesis, recipe draft generation, and miniapp/admin UI. LLM-facing behavior is isolated behind service contracts; nutrition rules, evidence states, FEDIAF checks, and result statuses are deterministic backend decisions.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, Vue 3 admin-web, uni-app miniapp, TypeScript.

---

## Scope Check

The approved spec covers several connected subsystems. This plan intentionally decomposes the work into independently shippable milestones. Do not implement the whole plan in one pass. Each task has a focused verification command and a commit point.

Implementation order:

1. Knowledge and rule package foundation.
2. Evidence extraction confirmation and nutrition assessment.
3. Constraint synthesis and result status engine.
4. Recipe design session and draft candidate generation.
5. Admin maintenance UI.
6. Miniapp AI Agent design entry.
7. Golden case verification.

## File Structure

Backend files:

- Modify `backend/prisma/schema.prisma`: add knowledge, rule package, assessment, evidence, constraint, Agent session, candidate, and audit models.
- Create `backend/prisma/migrations/202605270001_ai_recipe_foundation/migration.sql`: SQL migration for the new models.
- Create `backend/prisma/seed-ai-recipe-knowledge.ts`: seed the five knowledge sources and two initial rule package shells.
- Modify `backend/package.json`: add seed script.
- Create `backend/src/domain/ai-recipe/enums.ts`: shared enums for evidence, rule, assessment, and result states.
- Create `backend/src/domain/ai-recipe/types.ts`: shared JSON contract types for plans, constraints, and audit snapshots.
- Create `backend/src/application/ai-recipe/knowledge-base.service.ts`: knowledge source and rule package queries.
- Create `backend/src/application/ai-recipe/evidence.service.ts`: evidence grading and report-confirmation logic.
- Create `backend/src/application/ai-recipe/nutrition-assessment.service.ts`: dog context loading and nutrition management plan generation.
- Create `backend/src/application/ai-recipe/constraint-synthesis.service.ts`: rule package merge and conflict detection.
- Create `backend/src/application/ai-recipe/recipe-design-session.service.ts`: session, message, candidate, and status orchestration.
- Create `backend/src/interfaces/dto/ai-recipe/knowledge.dto.ts`: knowledge API DTOs.
- Create `backend/src/interfaces/dto/ai-recipe/assessment.dto.ts`: assessment API DTOs.
- Create `backend/src/interfaces/dto/ai-recipe/session.dto.ts`: session API DTOs.
- Create `backend/src/interfaces/controllers/ai-recipe.controller.ts`: admin-only API endpoints.
- Modify `backend/src/app.module.ts`: register controller and services.
- Create `backend/tests/ai-recipe/knowledge-base.service.spec.ts`: knowledge source and rule package service tests.
- Create `backend/tests/ai-recipe/evidence.service.spec.ts`: evidence grading tests.
- Create `backend/tests/ai-recipe/nutrition-assessment.service.spec.ts`: assessment output tests.
- Create `backend/tests/ai-recipe/constraint-synthesis.service.spec.ts`: conflict and result status tests.
- Create `backend/tests/ai-recipe/recipe-design-session.service.spec.ts`: session and candidate behavior tests.

Admin web files:

- Create `admin-web/src/api/aiRecipe.ts`: API client for knowledge sources, rule packages, and assessments.
- Create `admin-web/src/views/AiRecipe/KnowledgeSources.vue`: knowledge source list and review status.
- Create `admin-web/src/views/AiRecipe/RulePackages.vue`: rule package version list.
- Create `admin-web/src/views/AiRecipe/AssessmentDetail.vue`: assessment, evidence, plan, and audit detail.
- Modify `admin-web/src/router/index.ts`: add admin routes.

Miniapp files:

- Create `miniapp/src/api/ai-recipe.ts`: miniapp API client.
- Create `miniapp/src/pages/ai-recipe-designer/index.vue`: AI Agent design entry and dog selector.
- Create `miniapp/src/pages/ai-recipe-designer/assessment.spec.ts`: regression tests for required UI states.
- Modify `miniapp/src/pages.json`: add the AI design page under staff/admin pages.
- Modify `miniapp/src/pages/staff-workbench/index.vue`: add admin-only entry.

Documentation and verification files:

- Create `backend/tests/ai-recipe/golden-cases.spec.ts`: golden case regression tests.
- Create `docs/reports/ai-recipe-auto-design-verification.md`: final verification checklist.

## Milestone 1: Knowledge and Rule Package Foundation

### Task 1: Add AI recipe foundation schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/202605270001_ai_recipe_foundation/migration.sql`

- [ ] **Step 1: Add Prisma enums**

Add these enums near existing enum definitions in `backend/prisma/schema.prisma`:

```prisma
enum KnowledgeSourceStatus {
  DRAFT
  ACTIVE
  RETIRED
}

enum KnowledgeAuthorityLevel {
  FOUNDATIONAL
  HIGH
  SUPPORTING
}

enum KnowledgeEntryStatus {
  DRAFT
  REVIEWED
  ACTIVE
  RETIRED
}

enum NutritionRulePackageStatus {
  DRAFT
  ACTIVE
  RETIRED
}

enum NutritionEvidenceLevel {
  A_CONFIRMED_DIAGNOSIS
  B_TEST_INDICATED
  C_OWNER_REPORTED
  D_ATTACHMENT_OBSERVATION
}

enum NutritionAssessmentStatus {
  DRAFT
  NEEDS_MORE_INFO
  PLAN_READY
  BLOCKED
}

enum AgentRecipeResultStatus {
  REVIEWABLE
  NEEDS_MANUAL_REVIEW
  LIMITED_DRAFT
  UNABLE_TO_COMPLETE
}

enum AgentRecipeSessionStatus {
  OPEN
  ASSESSING
  PLAN_READY
  DESIGNING
  COMPLETED
  ARCHIVED
}
```

- [ ] **Step 2: Add Prisma models**

Add these models after `DesignRecipeAIGenerationLog` in `backend/prisma/schema.prisma`:

```prisma
model KnowledgeSource {
  id                 String                  @id @default(uuid()) @map("id")
  code               String                  @unique @map("code") @db.VarChar(80)
  name               String                  @map("name") @db.VarChar(200)
  versionLabel       String                  @map("version_label") @db.VarChar(100)
  sourceUrl          String                  @map("source_url") @db.VarChar(500)
  scope              String[]                @default([]) @map("scope")
  authorityLevel     KnowledgeAuthorityLevel @map("authority_level")
  status             KnowledgeSourceStatus   @default(DRAFT) @map("status")
  copyrightNote      String?                 @map("copyright_note")
  reviewedBy         String?                 @map("reviewed_by")
  reviewedAt         DateTime?               @map("reviewed_at")
  createdAt          DateTime                @default(now()) @map("created_at")
  updatedAt          DateTime                @updatedAt @map("updated_at")
  entries            KnowledgeEntry[]
  rulePackageSources NutritionRulePackageSource[]

  @@index([status])
  @@index([authorityLevel])
  @@map("knowledge_source")
}

model KnowledgeEntry {
  id             String               @id @default(uuid()) @map("id")
  sourceId       String               @map("source_id")
  title          String               @map("title") @db.VarChar(200)
  species        String               @default("DOG") @map("species") @db.VarChar(40)
  category       String               @map("category") @db.VarChar(80)
  summary        String               @map("summary")
  structuredData Json                 @default("{}") @map("structured_data")
  citation       String?              @map("citation")
  status         KnowledgeEntryStatus @default(DRAFT) @map("status")
  reviewedBy     String?              @map("reviewed_by")
  reviewedAt     DateTime?            @map("reviewed_at")
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")
  source         KnowledgeSource      @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([sourceId])
  @@index([category])
  @@index([status])
  @@map("knowledge_entry")
}

model NutritionRulePackage {
  id              String                     @id @default(uuid()) @map("id")
  code            String                     @unique @map("code") @db.VarChar(80)
  name            String                     @map("name") @db.VarChar(200)
  status          NutritionRulePackageStatus @default(DRAFT) @map("status")
  currentVersion  Int                        @default(1) @map("current_version")
  createdAt       DateTime                   @default(now()) @map("created_at")
  updatedAt       DateTime                   @updatedAt @map("updated_at")
  versions        NutritionRuleVersion[]
  sources         NutritionRulePackageSource[]

  @@index([status])
  @@map("nutrition_rule_package")
}

model NutritionRuleVersion {
  id                 String               @id @default(uuid()) @map("id")
  packageId          String               @map("package_id")
  version            Int                  @map("version")
  requiredEvidence   NutritionEvidenceLevel @map("required_evidence")
  activationCriteria Json                 @default("{}") @map("activation_criteria")
  contraindications  Json                 @default("{}") @map("contraindications")
  requiredFields     String[]             @default([]) @map("required_fields")
  nutrientTargets    Json                 @default("{}") @map("nutrient_targets")
  ingredientPolicy   Json                 @default("{}") @map("ingredient_policy")
  conflictPolicy     Json                 @default("{}") @map("conflict_policy")
  reviewPolicy       Json                 @default("{}") @map("review_policy")
  displayBoundaries  Json                 @default("{}") @map("display_boundaries")
  isActive           Boolean              @default(false) @map("is_active")
  reviewedBy         String?              @map("reviewed_by")
  reviewedAt         DateTime?            @map("reviewed_at")
  createdAt          DateTime             @default(now()) @map("created_at")
  updatedAt          DateTime             @updatedAt @map("updated_at")
  package            NutritionRulePackage @relation(fields: [packageId], references: [id], onDelete: Cascade)

  @@unique([packageId, version])
  @@index([packageId])
  @@index([isActive])
  @@map("nutrition_rule_version")
}

model NutritionRulePackageSource {
  id             String               @id @default(uuid()) @map("id")
  packageId      String               @map("package_id")
  knowledgeSourceId String            @map("knowledge_source_id")
  note           String?              @map("note")
  package        NutritionRulePackage @relation(fields: [packageId], references: [id], onDelete: Cascade)
  knowledgeSource KnowledgeSource     @relation(fields: [knowledgeSourceId], references: [id], onDelete: Cascade)

  @@unique([packageId, knowledgeSourceId])
  @@index([packageId])
  @@index([knowledgeSourceId])
  @@map("nutrition_rule_package_source")
}

model DogNutritionAssessment {
  id              String                    @id @default(uuid()) @map("id")
  dogId           String                    @map("dog_id")
  createdBy       String                    @map("created_by")
  status          NutritionAssessmentStatus @default(DRAFT) @map("status")
  inputSummary    Json                      @default("{}") @map("input_summary")
  completeness    Json                      @default("{}") @map("completeness")
  managementPlan  Json                      @default("{}") @map("management_plan")
  constraintSet   Json                      @default("{}") @map("constraint_set")
  resultStatus    AgentRecipeResultStatus?  @map("result_status")
  createdAt       DateTime                  @default(now()) @map("created_at")
  updatedAt       DateTime                  @updatedAt @map("updated_at")
  dog             Dog                       @relation(fields: [dogId], references: [id], onDelete: Cascade)
  evidenceItems   DogNutritionAssessmentEvidence[]
  sessions        AgentRecipeDesignSession[]

  @@index([dogId])
  @@index([createdBy])
  @@index([status])
  @@map("dog_nutrition_assessment")
}

model DogNutritionAssessmentEvidence {
  id            String                 @id @default(uuid()) @map("id")
  assessmentId  String                 @map("assessment_id")
  sourceType    String                 @map("source_type") @db.VarChar(60)
  evidenceLevel NutritionEvidenceLevel @map("evidence_level")
  title         String                 @map("title") @db.VarChar(200)
  extractedData Json                   @default("{}") @map("extracted_data")
  confirmedData Json                   @default("{}") @map("confirmed_data")
  isConfirmed   Boolean                @default(false) @map("is_confirmed")
  attachmentUrls String[]              @default([]) @map("attachment_urls")
  confirmedBy   String?                @map("confirmed_by")
  confirmedAt   DateTime?              @map("confirmed_at")
  createdAt     DateTime               @default(now()) @map("created_at")
  updatedAt     DateTime               @updatedAt @map("updated_at")
  assessment    DogNutritionAssessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)

  @@index([assessmentId])
  @@index([evidenceLevel])
  @@index([isConfirmed])
  @@map("dog_nutrition_assessment_evidence")
}

model AgentRecipeDesignSession {
  id            String                    @id @default(uuid()) @map("id")
  assessmentId  String                    @map("assessment_id")
  designRecipeId String?                  @map("design_recipe_id")
  status        AgentRecipeSessionStatus  @default(OPEN) @map("status")
  resultStatus  AgentRecipeResultStatus?  @map("result_status")
  createdBy     String                    @map("created_by")
  createdAt     DateTime                  @default(now()) @map("created_at")
  updatedAt     DateTime                  @updatedAt @map("updated_at")
  assessment    DogNutritionAssessment    @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  messages      AgentRecipeDesignMessage[]
  candidates    AgentRecipeDesignCandidate[]
  auditSnapshots AgentRecipeAuditSnapshot[]

  @@index([assessmentId])
  @@index([createdBy])
  @@index([status])
  @@map("agent_recipe_design_session")
}

model AgentRecipeDesignMessage {
  id        String                   @id @default(uuid()) @map("id")
  sessionId String                   @map("session_id")
  role      String                   @map("role") @db.VarChar(40)
  content   String                   @map("content")
  metadata  Json                     @default("{}") @map("metadata")
  createdAt DateTime                 @default(now()) @map("created_at")
  session   AgentRecipeDesignSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@map("agent_recipe_design_message")
}

model AgentRecipeDesignCandidate {
  id             String                   @id @default(uuid()) @map("id")
  sessionId      String                   @map("session_id")
  label          String                   @map("label") @db.VarChar(120)
  recipeDraft    Json                     @default("{}") @map("recipe_draft")
  calculation    Json                     @default("{}") @map("calculation")
  resultStatus   AgentRecipeResultStatus  @map("result_status")
  changeSummary  Json                     @default("{}") @map("change_summary")
  isAdopted      Boolean                  @default(false) @map("is_adopted")
  createdAt      DateTime                 @default(now()) @map("created_at")
  session        AgentRecipeDesignSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@index([resultStatus])
  @@map("agent_recipe_design_candidate")
}

model AgentRecipeAuditSnapshot {
  id        String                   @id @default(uuid()) @map("id")
  sessionId String                   @map("session_id")
  snapshot  Json                     @default("{}") @map("snapshot")
  createdBy String                   @map("created_by")
  createdAt DateTime                 @default(now()) @map("created_at")
  session   AgentRecipeDesignSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@map("agent_recipe_audit_snapshot")
}
```

- [ ] **Step 3: Add relation to Dog**

In the `Dog` model in `backend/prisma/schema.prisma`, add:

```prisma
  nutritionAssessments DogNutritionAssessment[]
```

- [ ] **Step 4: Create migration SQL**

Run:

```bash
cd backend
npx prisma migrate dev --name ai_recipe_foundation --create-only
```

Expected: Prisma creates a migration directory. Rename it to `backend/prisma/migrations/202605270001_ai_recipe_foundation` if the generated timestamp differs.

- [ ] **Step 5: Generate Prisma client**

Run:

```bash
cd backend
npm run prisma:generate:build
```

Expected: command exits with code 0 and prints Prisma client generation success.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/202605270001_ai_recipe_foundation
git commit -m "feat: add ai recipe foundation schema"
```

### Task 2: Seed initial knowledge sources and rule package shells

**Files:**
- Create: `backend/prisma/seed-ai-recipe-knowledge.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Create seed script**

Create `backend/prisma/seed-ai-recipe-knowledge.ts` with this structure:

```ts
import { PrismaClient, KnowledgeAuthorityLevel, KnowledgeSourceStatus, NutritionEvidenceLevel, NutritionRulePackageStatus } from '@prisma/client';

const prisma = new PrismaClient();

const sources = [
  {
    code: 'FEDIAF_2025',
    name: 'FEDIAF Nutritional Guidelines',
    versionLabel: '2025',
    sourceUrl: 'https://europeanpetfood.org/self-regulation/nutritional-guidelines/',
    scope: ['COMPLETE_BALANCED_BASELINE', 'DOG'],
    authorityLevel: KnowledgeAuthorityLevel.FOUNDATIONAL,
    copyrightNote: 'Store source metadata and structured derived rules only.',
  },
  {
    code: 'WSAVA_NUTRITION',
    name: 'WSAVA Global Nutrition Guidelines and Toolkit',
    versionLabel: 'current',
    sourceUrl: 'https://wsava.org/global-guidelines/global-nutrition-guidelines/',
    scope: ['NUTRITION_ASSESSMENT', 'BCS_MCS', 'DIET_HISTORY'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote: 'Store source metadata and reviewed summaries only.',
  },
  {
    code: 'AAHA_2021_NUTRITION_WEIGHT',
    name: 'AAHA 2021 Nutrition and Weight Management Guidelines',
    versionLabel: '2021',
    sourceUrl: 'https://www.aaha.org/aaha-guidelines/2021-aaha-nutrition-and-weight-management-guidelines/home/',
    scope: ['WEIGHT_MANAGEMENT', 'NUTRITION_ASSESSMENT'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote: 'Store source metadata and structured derived rules only.',
  },
  {
    code: 'SACN5',
    name: 'Small Animal Clinical Nutrition 5',
    versionLabel: '5th edition',
    sourceUrl: 'https://www.markmorrisinstitute.org/sacn5',
    scope: ['CLINICAL_NUTRITION_BASELINE'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote: 'Do not store full text or long excerpts; store citation metadata and reviewed structured summaries.',
  },
  {
    code: 'ACVIM_ENDORSED',
    name: 'ACVIM Endorsed Statements',
    versionLabel: 'current',
    sourceUrl: 'https://www.acvim.org/journals-research/research/acvim-endorsed-statements',
    scope: ['DISEASE_SPECIFIC_HIGH_WEIGHT_EVIDENCE'],
    authorityLevel: KnowledgeAuthorityLevel.HIGH,
    copyrightNote: 'Store source metadata and reviewed structured summaries only.',
  },
];

const packages = [
  {
    code: 'PANCREAS_LOW_FAT',
    name: '胰腺呵护 / 低脂',
    requiredEvidence: NutritionEvidenceLevel.A_CONFIRMED_DIAGNOSIS,
    requiredFields: ['currentWeightKg', 'bcsScore', 'medicalRecords', 'dietHistory'],
  },
  {
    code: 'WEIGHT_MANAGEMENT',
    name: '减重 / 肥胖管理',
    requiredEvidence: NutritionEvidenceLevel.C_OWNER_REPORTED,
    requiredFields: ['currentWeightKg', 'bcsScore', 'targetWeightKg', 'dietHistory', 'treats'],
  },
];

async function main() {
  for (const source of sources) {
    await prisma.knowledgeSource.upsert({
      where: { code: source.code },
      update: { ...source, status: KnowledgeSourceStatus.ACTIVE },
      create: { ...source, status: KnowledgeSourceStatus.ACTIVE },
    });
  }

  for (const item of packages) {
    const rulePackage = await prisma.nutritionRulePackage.upsert({
      where: { code: item.code },
      update: { name: item.name, status: NutritionRulePackageStatus.DRAFT },
      create: { code: item.code, name: item.name, status: NutritionRulePackageStatus.DRAFT },
    });

    await prisma.nutritionRuleVersion.upsert({
      where: { packageId_version: { packageId: rulePackage.id, version: 1 } },
      update: {
        requiredEvidence: item.requiredEvidence,
        requiredFields: item.requiredFields,
        isActive: false,
      },
      create: {
        packageId: rulePackage.id,
        version: 1,
        requiredEvidence: item.requiredEvidence,
        requiredFields: item.requiredFields,
        activationCriteria: {},
        contraindications: {},
        nutrientTargets: {},
        ingredientPolicy: {},
        conflictPolicy: {},
        reviewPolicy: { forceManualReview: true },
        displayBoundaries: { noDiagnosis: true, noTreatmentClaim: true },
        isActive: false,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Add package script**

In `backend/package.json`, add:

```json
"seed:ai-recipe-knowledge": "ts-node -r tsconfig-paths/register prisma/seed-ai-recipe-knowledge.ts"
```

- [ ] **Step 3: Run seed**

Run:

```bash
cd backend
npm run seed:ai-recipe-knowledge
```

Expected: command exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed-ai-recipe-knowledge.ts backend/package.json
git commit -m "feat: seed ai recipe knowledge sources"
```

## Milestone 2: Backend Deterministic Services

### Task 3: Add AI recipe domain enums and JSON contracts

**Files:**
- Create: `backend/src/domain/ai-recipe/enums.ts`
- Create: `backend/src/domain/ai-recipe/types.ts`

- [ ] **Step 1: Create enums file**

Create `backend/src/domain/ai-recipe/enums.ts`:

```ts
export enum AiRecipeResultStatus {
  REVIEWABLE = 'REVIEWABLE',
  NEEDS_MANUAL_REVIEW = 'NEEDS_MANUAL_REVIEW',
  LIMITED_DRAFT = 'LIMITED_DRAFT',
  UNABLE_TO_COMPLETE = 'UNABLE_TO_COMPLETE',
}

export enum EvidenceLevel {
  A_CONFIRMED_DIAGNOSIS = 'A_CONFIRMED_DIAGNOSIS',
  B_TEST_INDICATED = 'B_TEST_INDICATED',
  C_OWNER_REPORTED = 'C_OWNER_REPORTED',
  D_ATTACHMENT_OBSERVATION = 'D_ATTACHMENT_OBSERVATION',
}

export enum MissingInfoCode {
  TARGET_WEIGHT = 'TARGET_WEIGHT',
  DIET_HISTORY = 'DIET_HISTORY',
  TREAT_INTAKE = 'TREAT_INTAKE',
  CONFIRMED_REPORT = 'CONFIRMED_REPORT',
  MCS_SCORE = 'MCS_SCORE',
}
```

- [ ] **Step 2: Create types file**

Create `backend/src/domain/ai-recipe/types.ts`:

```ts
import { AiRecipeResultStatus, EvidenceLevel, MissingInfoCode } from './enums';

export type EvidenceSummary = {
  level: EvidenceLevel;
  sourceType: string;
  title: string;
  isConfirmed: boolean;
  confirmedData: Record<string, unknown>;
};

export type NutritionManagementPlan = {
  inputSummary: Record<string, unknown>;
  evidence: EvidenceSummary[];
  missingInfo: MissingInfoCode[];
  enabledRulePackages: string[];
  disabledRulePackages: Array<{ code: string; reason: string }>;
  nutritionTargets: Record<string, unknown>;
  ingredientPolicy: Record<string, unknown>;
  conflictReport: Array<{ code: string; message: string; severity: 'HARD' | 'SOFT' }>;
  feedingPrinciples: string[];
  monitoringPlan: string[];
  citations: Array<{ sourceCode: string; title: string; url?: string }>;
  resultStatus: AiRecipeResultStatus;
};

export type RecipeConstraintSet = {
  dogId: string;
  assessmentId: string;
  rulePackages: string[];
  hardConstraints: Record<string, unknown>;
  softConstraints: Record<string, unknown>;
  reviewRequired: boolean;
  resultStatus: AiRecipeResultStatus;
};
```

- [ ] **Step 3: Type-check backend**

Run:

```bash
cd backend
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add backend/src/domain/ai-recipe
git commit -m "feat: add ai recipe domain contracts"
```

### Task 4: Implement evidence grading service

**Files:**
- Create: `backend/src/application/ai-recipe/evidence.service.ts`
- Create: `backend/tests/ai-recipe/evidence.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/ai-recipe/evidence.service.spec.ts`:

```ts
import { EvidenceService } from '../../src/application/ai-recipe/evidence.service';
import { EvidenceLevel } from '../../src/domain/ai-recipe/enums';

describe('EvidenceService', () => {
  const service = new EvidenceService();

  it('grades confirmed diagnosis reports as A level', () => {
    const result = service.gradeEvidence({
      sourceType: 'MEDICAL_REPORT',
      isConfirmed: true,
      confirmedData: {
        diagnosis: '慢性胰腺炎',
        testIndicators: ['cPLI'],
        reportDate: '2026-05-01',
        clinicName: 'Test Clinic',
      },
      attachmentUrls: ['https://cdn.test/report.pdf'],
    });

    expect(result).toBe(EvidenceLevel.A_CONFIRMED_DIAGNOSIS);
  });

  it('grades unconfirmed report extraction as owner reported level', () => {
    const result = service.gradeEvidence({
      sourceType: 'MEDICAL_REPORT',
      isConfirmed: false,
      confirmedData: { diagnosis: '慢性胰腺炎' },
      attachmentUrls: ['https://cdn.test/report.pdf'],
    });

    expect(result).toBe(EvidenceLevel.C_OWNER_REPORTED);
  });

  it('grades stool photos as D level', () => {
    const result = service.gradeEvidence({
      sourceType: 'STOOL_PHOTO',
      isConfirmed: false,
      confirmedData: {},
      attachmentUrls: ['https://cdn.test/stool.jpg'],
    });

    expect(result).toBe(EvidenceLevel.D_ATTACHMENT_OBSERVATION);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/evidence.service.spec.ts --runInBand
```

Expected: FAIL because `EvidenceService` does not exist.

- [ ] **Step 3: Implement service**

Create `backend/src/application/ai-recipe/evidence.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { EvidenceLevel } from '../../domain/ai-recipe/enums';

export type GradeEvidenceInput = {
  sourceType: string;
  isConfirmed: boolean;
  confirmedData: Record<string, unknown>;
  attachmentUrls: string[];
};

@Injectable()
export class EvidenceService {
  gradeEvidence(input: GradeEvidenceInput): EvidenceLevel {
    if (input.sourceType === 'STOOL_PHOTO') {
      return EvidenceLevel.D_ATTACHMENT_OBSERVATION;
    }

    if (!input.isConfirmed) {
      return EvidenceLevel.C_OWNER_REPORTED;
    }

    const hasDiagnosis = typeof input.confirmedData.diagnosis === 'string' && input.confirmedData.diagnosis.trim().length > 0;
    const hasReportDate = typeof input.confirmedData.reportDate === 'string' && input.confirmedData.reportDate.trim().length > 0;
    const hasClinicName = typeof input.confirmedData.clinicName === 'string' && input.confirmedData.clinicName.trim().length > 0;
    const hasIndicators = Array.isArray(input.confirmedData.testIndicators) && input.confirmedData.testIndicators.length > 0;

    if (hasDiagnosis && hasReportDate && hasClinicName && hasIndicators) {
      return EvidenceLevel.A_CONFIRMED_DIAGNOSIS;
    }

    if (hasIndicators) {
      return EvidenceLevel.B_TEST_INDICATED;
    }

    return EvidenceLevel.C_OWNER_REPORTED;
  }
}
```

- [ ] **Step 4: Run passing test**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/evidence.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/ai-recipe/evidence.service.ts backend/tests/ai-recipe/evidence.service.spec.ts
git commit -m "feat: add evidence grading service"
```

### Task 5: Implement knowledge and rule package service

**Files:**
- Create: `backend/src/application/ai-recipe/knowledge-base.service.ts`
- Create: `backend/tests/ai-recipe/knowledge-base.service.spec.ts`

- [ ] **Step 1: Write service tests with Prisma mock**

Create `backend/tests/ai-recipe/knowledge-base.service.spec.ts`:

```ts
import { KnowledgeBaseService } from '../../src/application/ai-recipe/knowledge-base.service';

describe('KnowledgeBaseService', () => {
  const prisma: any = {
    knowledgeSource: {
      findMany: jest.fn(),
    },
    nutritionRulePackage: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active knowledge sources ordered by name', async () => {
    prisma.knowledgeSource.findMany.mockResolvedValue([{ code: 'FEDIAF_2025', name: 'FEDIAF Nutritional Guidelines' }]);
    const service = new KnowledgeBaseService(prisma);

    const result = await service.listActiveSources();

    expect(prisma.knowledgeSource.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
    expect(result).toEqual([{ code: 'FEDIAF_2025', name: 'FEDIAF Nutritional Guidelines' }]);
  });

  it('returns active rule packages with active versions', async () => {
    prisma.nutritionRulePackage.findMany.mockResolvedValue([{ code: 'WEIGHT_MANAGEMENT', versions: [{ version: 1 }] }]);
    const service = new KnowledgeBaseService(prisma);

    const result = await service.listActiveRulePackages();

    expect(prisma.nutritionRulePackage.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      include: { versions: { where: { isActive: true } }, sources: { include: { knowledgeSource: true } } },
      orderBy: { name: 'asc' },
    });
    expect(result[0].code).toBe('WEIGHT_MANAGEMENT');
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/knowledge-base.service.spec.ts --runInBand
```

Expected: FAIL because `KnowledgeBaseService` does not exist.

- [ ] **Step 3: Implement service**

Create `backend/src/application/ai-recipe/knowledge-base.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveSources() {
    return this.prisma.knowledgeSource.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  async listActiveRulePackages() {
    return this.prisma.nutritionRulePackage.findMany({
      where: { status: 'ACTIVE' },
      include: {
        versions: { where: { isActive: true } },
        sources: { include: { knowledgeSource: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
}
```

- [ ] **Step 4: Run passing test**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/knowledge-base.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/ai-recipe/knowledge-base.service.ts backend/tests/ai-recipe/knowledge-base.service.spec.ts
git commit -m "feat: add ai recipe knowledge service"
```

### Task 6: Implement nutrition assessment service

**Files:**
- Create: `backend/src/application/ai-recipe/nutrition-assessment.service.ts`
- Create: `backend/tests/ai-recipe/nutrition-assessment.service.spec.ts`

- [ ] **Step 1: Write tests for missing info and rule activation**

Create `backend/tests/ai-recipe/nutrition-assessment.service.spec.ts`:

```ts
import { NutritionAssessmentService } from '../../src/application/ai-recipe/nutrition-assessment.service';
import { AiRecipeResultStatus, EvidenceLevel, MissingInfoCode } from '../../src/domain/ai-recipe/enums';

describe('NutritionAssessmentService', () => {
  it('marks target weight and diet history as missing for obese dog context', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: { id: 'dog-1', currentWeightKg: 12, bcsScore: 8, activityLevel: 'LOW' },
      evidence: [],
      confirmedInputs: {},
      activeRulePackages: [{ code: 'WEIGHT_MANAGEMENT', requiredFields: ['targetWeightKg', 'dietHistory'] }],
    });

    expect(plan.missingInfo).toContain(MissingInfoCode.TARGET_WEIGHT);
    expect(plan.missingInfo).toContain(MissingInfoCode.DIET_HISTORY);
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.LIMITED_DRAFT);
  });

  it('enables low fat package only with confirmed A level evidence', () => {
    const service = new NutritionAssessmentService();

    const plan = service.buildPlan({
      dog: { id: 'dog-1', currentWeightKg: 8, bcsScore: 5, activityLevel: 'NORMAL' },
      evidence: [{ level: EvidenceLevel.A_CONFIRMED_DIAGNOSIS, sourceType: 'MEDICAL_REPORT', title: '胰腺炎报告', isConfirmed: true, confirmedData: { diagnosis: '慢性胰腺炎' } }],
      confirmedInputs: { dietHistory: '鸡肉鲜食', targetWeightKg: 8 },
      activeRulePackages: [{ code: 'PANCREAS_LOW_FAT', requiredFields: ['dietHistory'] }],
    });

    expect(plan.enabledRulePackages).toContain('PANCREAS_LOW_FAT');
    expect(plan.resultStatus).toBe(AiRecipeResultStatus.NEEDS_MANUAL_REVIEW);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/nutrition-assessment.service.spec.ts --runInBand
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Create `backend/src/application/ai-recipe/nutrition-assessment.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiRecipeResultStatus, EvidenceLevel, MissingInfoCode } from '../../domain/ai-recipe/enums';
import type { NutritionManagementPlan, EvidenceSummary } from '../../domain/ai-recipe/types';

type DogContext = {
  id: string;
  currentWeightKg: number;
  bcsScore: number;
  activityLevel: string;
};

type RulePackageInput = {
  code: string;
  requiredFields: string[];
};

type BuildPlanInput = {
  dog: DogContext;
  evidence: EvidenceSummary[];
  confirmedInputs: Record<string, unknown>;
  activeRulePackages: RulePackageInput[];
};

@Injectable()
export class NutritionAssessmentService {
  buildPlan(input: BuildPlanInput): NutritionManagementPlan {
    const enabledRulePackages = input.activeRulePackages
      .filter((rulePackage) => this.canEnableRulePackage(rulePackage.code, input.evidence))
      .map((rulePackage) => rulePackage.code);

    const missingInfo = this.resolveMissingInfo(input);
    const resultStatus = this.resolveResultStatus(enabledRulePackages, missingInfo);

    return {
      inputSummary: {
        dogId: input.dog.id,
        currentWeightKg: input.dog.currentWeightKg,
        bcsScore: input.dog.bcsScore,
        activityLevel: input.dog.activityLevel,
      },
      evidence: input.evidence,
      missingInfo,
      enabledRulePackages,
      disabledRulePackages: input.activeRulePackages
        .filter((rulePackage) => !enabledRulePackages.includes(rulePackage.code))
        .map((rulePackage) => ({ code: rulePackage.code, reason: '证据等级不足或缺少确认资料' })),
      nutritionTargets: {},
      ingredientPolicy: {},
      conflictReport: [],
      feedingPrinciples: [],
      monitoringPlan: [],
      citations: [],
      resultStatus,
    };
  }

  private canEnableRulePackage(code: string, evidence: EvidenceSummary[]): boolean {
    if (code === 'PANCREAS_LOW_FAT') {
      return evidence.some((item) => item.level === EvidenceLevel.A_CONFIRMED_DIAGNOSIS && item.isConfirmed);
    }

    if (code === 'WEIGHT_MANAGEMENT') {
      return true;
    }

    return false;
  }

  private resolveMissingInfo(input: BuildPlanInput): MissingInfoCode[] {
    const missing = new Set<MissingInfoCode>();

    for (const rulePackage of input.activeRulePackages) {
      if (rulePackage.requiredFields.includes('targetWeightKg') && input.confirmedInputs.targetWeightKg === undefined) {
        missing.add(MissingInfoCode.TARGET_WEIGHT);
      }
      if (rulePackage.requiredFields.includes('dietHistory') && input.confirmedInputs.dietHistory === undefined) {
        missing.add(MissingInfoCode.DIET_HISTORY);
      }
    }

    return Array.from(missing);
  }

  private resolveResultStatus(enabledRulePackages: string[], missingInfo: MissingInfoCode[]): AiRecipeResultStatus {
    if (missingInfo.length > 0) {
      return AiRecipeResultStatus.LIMITED_DRAFT;
    }

    if (enabledRulePackages.length > 0) {
      return AiRecipeResultStatus.NEEDS_MANUAL_REVIEW;
    }

    return AiRecipeResultStatus.REVIEWABLE;
  }
}
```

- [ ] **Step 4: Run passing test**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/nutrition-assessment.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/application/ai-recipe/nutrition-assessment.service.ts backend/tests/ai-recipe/nutrition-assessment.service.spec.ts
git commit -m "feat: add nutrition assessment service"
```

### Task 7: Implement constraint synthesis service

**Files:**
- Create: `backend/src/application/ai-recipe/constraint-synthesis.service.ts`
- Create: `backend/tests/ai-recipe/constraint-synthesis.service.spec.ts`

- [ ] **Step 1: Write conflict tests**

Create `backend/tests/ai-recipe/constraint-synthesis.service.spec.ts`:

```ts
import { ConstraintSynthesisService } from '../../src/application/ai-recipe/constraint-synthesis.service';
import { AiRecipeResultStatus } from '../../src/domain/ai-recipe/enums';

describe('ConstraintSynthesisService', () => {
  it('returns unable status when hard constraints conflict', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['PANCREAS_LOW_FAT', 'HIGH_FAT_TEST_RULE'],
      hardConstraints: [
        { key: 'fat.maxPercentCalories', value: 18, source: 'PANCREAS_LOW_FAT' },
        { key: 'fat.minPercentCalories', value: 25, source: 'HIGH_FAT_TEST_RULE' },
      ],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.UNABLE_TO_COMPLETE);
    expect(result.reviewRequired).toBe(true);
  });

  it('marks functional constraints as manual review when no hard conflict exists', () => {
    const service = new ConstraintSynthesisService();

    const result = service.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['WEIGHT_MANAGEMENT'],
      hardConstraints: [{ key: 'energy.targetMode', value: 'WEIGHT_LOSS', source: 'WEIGHT_MANAGEMENT' }],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.NEEDS_MANUAL_REVIEW);
    expect(result.reviewRequired).toBe(true);
  });
});
```

- [ ] **Step 2: Implement service**

Create `backend/src/application/ai-recipe/constraint-synthesis.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiRecipeResultStatus } from '../../domain/ai-recipe/enums';
import type { RecipeConstraintSet } from '../../domain/ai-recipe/types';

type ConstraintInput = {
  key: string;
  value: unknown;
  source: string;
};

type SynthesisInput = {
  dogId: string;
  assessmentId: string;
  rulePackages: string[];
  hardConstraints: ConstraintInput[];
  softConstraints: ConstraintInput[];
};

@Injectable()
export class ConstraintSynthesisService {
  synthesize(input: SynthesisInput): RecipeConstraintSet {
    const hasFatConflict = this.hasFatBoundsConflict(input.hardConstraints);

    if (hasFatConflict) {
      return {
        dogId: input.dogId,
        assessmentId: input.assessmentId,
        rulePackages: input.rulePackages,
        hardConstraints: { items: input.hardConstraints, conflicts: ['fat bounds conflict'] },
        softConstraints: { items: input.softConstraints },
        reviewRequired: true,
        resultStatus: AiRecipeResultStatus.UNABLE_TO_COMPLETE,
      };
    }

    return {
      dogId: input.dogId,
      assessmentId: input.assessmentId,
      rulePackages: input.rulePackages,
      hardConstraints: { items: input.hardConstraints },
      softConstraints: { items: input.softConstraints },
      reviewRequired: input.rulePackages.length > 0,
      resultStatus: input.rulePackages.length > 0 ? AiRecipeResultStatus.NEEDS_MANUAL_REVIEW : AiRecipeResultStatus.REVIEWABLE,
    };
  }

  private hasFatBoundsConflict(constraints: ConstraintInput[]): boolean {
    const max = constraints.find((item) => item.key === 'fat.maxPercentCalories');
    const min = constraints.find((item) => item.key === 'fat.minPercentCalories');

    if (!max || !min) {
      return false;
    }

    return Number(min.value) > Number(max.value);
  }
}
```

- [ ] **Step 3: Run test**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/constraint-synthesis.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/application/ai-recipe/constraint-synthesis.service.ts backend/tests/ai-recipe/constraint-synthesis.service.spec.ts
git commit -m "feat: add ai recipe constraint synthesis"
```

### Task 8: Add admin-only backend API

**Files:**
- Create: `backend/src/interfaces/dto/ai-recipe/knowledge.dto.ts`
- Create: `backend/src/interfaces/dto/ai-recipe/assessment.dto.ts`
- Create: `backend/src/interfaces/dto/ai-recipe/session.dto.ts`
- Create: `backend/src/interfaces/controllers/ai-recipe.controller.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create DTO files**

Create `backend/src/interfaces/dto/ai-recipe/assessment.dto.ts`:

```ts
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateNutritionAssessmentDto {
  @IsString()
  dogId!: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsObject()
  confirmedInputs?: Record<string, unknown>;
}

export class AddAssessmentEvidenceDto {
  @IsString()
  sourceType!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsObject()
  extractedData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  confirmedData?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  attachmentUrls?: string[];
}
```

Create `backend/src/interfaces/dto/ai-recipe/knowledge.dto.ts`:

```ts
export type KnowledgeSourceListItemDto = {
  id: string;
  code: string;
  name: string;
  versionLabel: string;
  status: string;
  authorityLevel: string;
};
```

Create `backend/src/interfaces/dto/ai-recipe/session.dto.ts`:

```ts
import { IsString } from 'class-validator';

export class CreateAgentRecipeSessionDto {
  @IsString()
  assessmentId!: string;
}

export class SendAgentRecipeMessageDto {
  @IsString()
  content!: string;
}
```

- [ ] **Step 2: Create controller**

Create `backend/src/interfaces/controllers/ai-recipe.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { AdminGuard } from '../guards/role.guard';
import { ApiResponseDto } from '../dto/common/response.dto';
import { KnowledgeBaseService } from '../../application/ai-recipe/knowledge-base.service';
import { CreateNutritionAssessmentDto } from '../dto/ai-recipe/assessment.dto';

@ApiTags('AI Recipe')
@ApiBearerAuth()
@Controller('api/v1/ai-recipe')
@UseGuards(AuthGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiRecipeController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get('knowledge-sources')
  async listKnowledgeSources(): Promise<ApiResponseDto<any>> {
    const data = await this.knowledgeBaseService.listActiveSources();
    return new ApiResponseDto(0, 'Success', data);
  }

  @Get('rule-packages')
  async listRulePackages(): Promise<ApiResponseDto<any>> {
    const data = await this.knowledgeBaseService.listActiveRulePackages();
    return new ApiResponseDto(0, 'Success', data);
  }

  @Post('assessments')
  async createAssessment(
    @Body() dto: CreateNutritionAssessmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApiResponseDto<any>> {
    return new ApiResponseDto(0, 'Assessment accepted', {
      dogId: dto.dogId,
      createdBy: user.userId,
      status: 'DRAFT',
    });
  }

  @Get('assessments/:id')
  async getAssessment(@Param('id') id: string): Promise<ApiResponseDto<any>> {
    return new ApiResponseDto(0, 'Success', { id });
  }
}
```

- [ ] **Step 3: Register in app module**

Modify `backend/src/app.module.ts`:

```ts
import { AiRecipeController } from './interfaces/controllers/ai-recipe.controller';
import { KnowledgeBaseService } from './application/ai-recipe/knowledge-base.service';
import { EvidenceService } from './application/ai-recipe/evidence.service';
import { NutritionAssessmentService } from './application/ai-recipe/nutrition-assessment.service';
import { ConstraintSynthesisService } from './application/ai-recipe/constraint-synthesis.service';
```

Add `AiRecipeController` to `controllers`.

Add these services to `providers`:

```ts
KnowledgeBaseService,
EvidenceService,
NutritionAssessmentService,
ConstraintSynthesisService,
```

- [ ] **Step 4: Build backend**

Run:

```bash
cd backend
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/dto/ai-recipe backend/src/interfaces/controllers/ai-recipe.controller.ts backend/src/app.module.ts
git commit -m "feat: add admin ai recipe api"
```

## Milestone 3: Recipe Design Sessions

### Task 9: Add recipe design session service

**Files:**
- Create: `backend/src/application/ai-recipe/recipe-design-session.service.ts`
- Create: `backend/tests/ai-recipe/recipe-design-session.service.spec.ts`

- [ ] **Step 1: Write session tests**

Create `backend/tests/ai-recipe/recipe-design-session.service.spec.ts`:

```ts
import { RecipeDesignSessionService } from '../../src/application/ai-recipe/recipe-design-session.service';
import { AiRecipeResultStatus } from '../../src/domain/ai-recipe/enums';

describe('RecipeDesignSessionService', () => {
  const prisma: any = {
    agentRecipeDesignSession: { create: jest.fn() },
    agentRecipeDesignMessage: { create: jest.fn() },
    agentRecipeDesignCandidate: { create: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates an open session for an assessment', async () => {
    prisma.agentRecipeDesignSession.create.mockResolvedValue({ id: 'session-1', status: 'OPEN' });
    const service = new RecipeDesignSessionService(prisma);

    const result = await service.createSession({ assessmentId: 'assessment-1', createdBy: 'admin-1' });

    expect(result.id).toBe('session-1');
    expect(prisma.agentRecipeDesignSession.create).toHaveBeenCalledWith({
      data: { assessmentId: 'assessment-1', createdBy: 'admin-1', status: 'OPEN' },
    });
  });

  it('stores draft candidates with result status', async () => {
    prisma.agentRecipeDesignCandidate.create.mockResolvedValue({ id: 'candidate-1' });
    const service = new RecipeDesignSessionService(prisma);

    await service.createCandidate({
      sessionId: 'session-1',
      label: '初稿',
      recipeDraft: { items: [] },
      calculation: { fediaf: 'not-run' },
      resultStatus: AiRecipeResultStatus.LIMITED_DRAFT,
      changeSummary: { reason: '缺少营养数据' },
    });

    expect(prisma.agentRecipeDesignCandidate.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        label: '初稿',
        recipeDraft: { items: [] },
        calculation: { fediaf: 'not-run' },
        resultStatus: 'LIMITED_DRAFT',
        changeSummary: { reason: '缺少营养数据' },
      },
    });
  });
});
```

- [ ] **Step 2: Implement service**

Create `backend/src/application/ai-recipe/recipe-design-session.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { AiRecipeResultStatus } from '../../domain/ai-recipe/enums';

@Injectable()
export class RecipeDesignSessionService {
  constructor(private readonly prisma: PrismaService) {}

  createSession(input: { assessmentId: string; createdBy: string }) {
    return this.prisma.agentRecipeDesignSession.create({
      data: {
        assessmentId: input.assessmentId,
        createdBy: input.createdBy,
        status: 'OPEN',
      },
    });
  }

  addMessage(input: { sessionId: string; role: 'ADMIN' | 'AGENT' | 'SYSTEM'; content: string; metadata?: Record<string, unknown> }) {
    return this.prisma.agentRecipeDesignMessage.create({
      data: {
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? {},
      },
    });
  }

  createCandidate(input: {
    sessionId: string;
    label: string;
    recipeDraft: Record<string, unknown>;
    calculation: Record<string, unknown>;
    resultStatus: AiRecipeResultStatus;
    changeSummary: Record<string, unknown>;
  }) {
    return this.prisma.agentRecipeDesignCandidate.create({
      data: {
        sessionId: input.sessionId,
        label: input.label,
        recipeDraft: input.recipeDraft,
        calculation: input.calculation,
        resultStatus: input.resultStatus,
        changeSummary: input.changeSummary,
      },
    });
  }
}
```

- [ ] **Step 3: Register service and run tests**

Add `RecipeDesignSessionService` to `backend/src/app.module.ts` providers, then run:

```bash
cd backend
npm test -- tests/ai-recipe/recipe-design-session.service.spec.ts --runInBand
npm run build
```

Expected: both commands pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/application/ai-recipe/recipe-design-session.service.ts backend/tests/ai-recipe/recipe-design-session.service.spec.ts backend/src/app.module.ts
git commit -m "feat: add ai recipe design sessions"
```

## Milestone 4: Admin Knowledge Maintenance UI

### Task 10: Add admin API client and routes

**Files:**
- Create: `admin-web/src/api/aiRecipe.ts`
- Modify: `admin-web/src/router/index.ts`

- [ ] **Step 1: Create admin API client**

Create `admin-web/src/api/aiRecipe.ts`:

```ts
import api from './index'

export type KnowledgeSourceListItem = {
  id: string
  code: string
  name: string
  versionLabel: string
  status: string
  authorityLevel: string
}

export const aiRecipeApi = {
  listKnowledgeSources: (): Promise<KnowledgeSourceListItem[]> =>
    api.get('/ai-recipe/knowledge-sources'),
  listRulePackages: (): Promise<any[]> =>
    api.get('/ai-recipe/rule-packages'),
  getAssessment: (id: string): Promise<any> =>
    api.get(`/ai-recipe/assessments/${id}`),
}
```

If `admin-web/src/api/index.ts` does not default-export `api`, add:

```ts
export default api
```

- [ ] **Step 2: Add routes**

In `admin-web/src/router/index.ts`, add these child routes under the authenticated layout:

```ts
{
  path: 'ai-recipe/knowledge-sources',
  name: 'AiRecipeKnowledgeSources',
  component: () => import('@/views/AiRecipe/KnowledgeSources.vue'),
  meta: { title: 'AI 食谱知识源' }
},
{
  path: 'ai-recipe/rule-packages',
  name: 'AiRecipeRulePackages',
  component: () => import('@/views/AiRecipe/RulePackages.vue'),
  meta: { title: 'AI 食谱规则包' }
},
{
  path: 'ai-recipe/assessments/:id',
  name: 'AiRecipeAssessmentDetail',
  component: () => import('@/views/AiRecipe/AssessmentDetail.vue'),
  meta: { title: '营养评估详情' }
}
```

- [ ] **Step 3: Build admin web**

Run:

```bash
cd admin-web
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add admin-web/src/api/index.ts admin-web/src/api/aiRecipe.ts admin-web/src/router/index.ts
git commit -m "feat: add ai recipe admin routes"
```

### Task 11: Add admin maintenance views

**Files:**
- Create: `admin-web/src/views/AiRecipe/KnowledgeSources.vue`
- Create: `admin-web/src/views/AiRecipe/RulePackages.vue`
- Create: `admin-web/src/views/AiRecipe/AssessmentDetail.vue`

- [ ] **Step 1: Create knowledge sources view**

Create `admin-web/src/views/AiRecipe/KnowledgeSources.vue`:

```vue
<template>
  <div class="ai-recipe-page">
    <div class="page-header">
      <h2>AI 食谱知识源</h2>
      <p>查看已登记的专业知识来源、版本和审核状态。</p>
    </div>
    <el-table :data="sources" v-loading="loading" border>
      <el-table-column prop="code" label="代码" width="180" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="versionLabel" label="版本" width="140" />
      <el-table-column prop="authorityLevel" label="权威等级" width="140" />
      <el-table-column prop="status" label="状态" width="120" />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { aiRecipeApi, type KnowledgeSourceListItem } from '@/api/aiRecipe'

const loading = ref(false)
const sources = ref<KnowledgeSourceListItem[]>([])

onMounted(async () => {
  loading.value = true
  try {
    sources.value = await aiRecipeApi.listKnowledgeSources()
  } finally {
    loading.value = false
  }
})
</script>
```

- [ ] **Step 2: Create rule packages view**

Create `admin-web/src/views/AiRecipe/RulePackages.vue`:

```vue
<template>
  <div class="ai-recipe-page">
    <div class="page-header">
      <h2>AI 食谱规则包</h2>
      <p>首批规则包用于胰腺呵护/低脂和减重/肥胖管理。</p>
    </div>
    <el-table :data="packages" v-loading="loading" border>
      <el-table-column prop="code" label="代码" width="220" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="status" label="状态" width="120" />
      <el-table-column prop="currentVersion" label="当前版本" width="120" />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { aiRecipeApi } from '@/api/aiRecipe'

const loading = ref(false)
const packages = ref<any[]>([])

onMounted(async () => {
  loading.value = true
  try {
    packages.value = await aiRecipeApi.listRulePackages()
  } finally {
    loading.value = false
  }
})
</script>
```

- [ ] **Step 3: Create assessment detail view**

Create `admin-web/src/views/AiRecipe/AssessmentDetail.vue`:

```vue
<template>
  <div class="ai-recipe-page">
    <div class="page-header">
      <h2>营养评估详情</h2>
      <p>查看证据分级、营养管理方案、约束和审计信息。</p>
    </div>
    <el-empty v-if="!assessment" description="暂无评估数据" />
    <el-descriptions v-else :column="1" border>
      <el-descriptions-item label="评估ID">{{ assessment.id }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ assessment.status || '-' }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { aiRecipeApi } from '@/api/aiRecipe'

const route = useRoute()
const assessment = ref<any>(null)

onMounted(async () => {
  assessment.value = await aiRecipeApi.getAssessment(String(route.params.id))
})
</script>
```

- [ ] **Step 4: Build admin web**

Run:

```bash
cd admin-web
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add admin-web/src/views/AiRecipe
git commit -m "feat: add ai recipe admin views"
```

## Milestone 5: Miniapp AI Agent Entry

### Task 12: Add miniapp API client and admin entry

**Files:**
- Create: `miniapp/src/api/ai-recipe.ts`
- Modify: `miniapp/src/pages/staff-workbench/index.vue`
- Modify: `miniapp/src/pages.json`

- [ ] **Step 1: Create miniapp API client**

Create `miniapp/src/api/ai-recipe.ts`:

```ts
import { request } from '../utils/api'

export const aiRecipeApi = {
  createAssessment: (data: { dogId: string; prompt?: string; confirmedInputs?: Record<string, any> }) =>
    request({ url: '/ai-recipe/assessments', method: 'POST', data }),
  listKnowledgeSources: () =>
    request({ url: '/ai-recipe/knowledge-sources', method: 'GET' }),
  listRulePackages: () =>
    request({ url: '/ai-recipe/rule-packages', method: 'GET' }),
}
```

- [ ] **Step 2: Add pages.json entry**

Add this page entry to `miniapp/src/pages.json`:

```json
{
  "path": "pages/ai-recipe-designer/index",
  "style": {
    "navigationBarTitleText": "AI食谱设计"
  }
}
```

- [ ] **Step 3: Add admin-only workbench module**

In `miniapp/src/pages/staff-workbench/index.vue`, add an admin-only module:

```vue
<view v-if="isAdmin" class="module" @tap="goToAiRecipeDesigner">
  <view class="module-icon recipes">
    <text style="font-size: 48rpx;">AI</text>
  </view>
  <view class="module-content">
    <text class="module-title">AI食谱设计</text>
    <text class="module-desc">根据狗狗档案生成营养管理方案与食谱草稿</text>
  </view>
  <text class="module-arrow">›</text>
</view>
```

Add this method:

```ts
const goToAiRecipeDesigner = () => {
  uni.navigateTo({ url: '/pages/ai-recipe-designer/index' });
};
```

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/api/ai-recipe.ts miniapp/src/pages.json miniapp/src/pages/staff-workbench/index.vue
git commit -m "feat: add miniapp ai recipe entry"
```

### Task 13: Add AI recipe designer page skeleton

**Files:**
- Create: `miniapp/src/pages/ai-recipe-designer/index.vue`
- Create: `miniapp/src/pages/ai-recipe-designer/assessment.spec.ts`

- [ ] **Step 1: Write regression test**

Create `miniapp/src/pages/ai-recipe-designer/assessment.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ai recipe designer page', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/ai-recipe-designer/index.vue'), 'utf-8')

  it('starts from dog selection and does not ask for task type first', () => {
    expect(source).toContain('选择狗狗')
    expect(source).toContain('资料完整度检查')
    expect(source).not.toContain('选择任务类型')
    expect(source).not.toContain('严格达标模式')
  })

  it('shows the four result statuses from the design spec', () => {
    expect(source).toContain('可审核发布')
    expect(source).toContain('需人工审核')
    expect(source).toContain('受限草稿')
    expect(source).toContain('无法完成')
  })
})
```

- [ ] **Step 2: Create page skeleton**

Create `miniapp/src/pages/ai-recipe-designer/index.vue`:

```vue
<template>
  <view class="ai-recipe-page">
    <view class="hero">
      <text class="hero__eyebrow">AI Agent 设计</text>
      <text class="hero__title">AI食谱设计</text>
      <text class="hero__subtitle">从一只狗狗开始，生成营养管理方案与食谱草稿。</text>
    </view>

    <view class="section">
      <text class="section__title">选择狗狗</text>
      <picker mode="selector" :range="dogs" range-key="name" :value="selectedDogIndex" @change="onDogChange">
        <view class="picker">
          {{ selectedDog ? selectedDog.name : '请选择狗狗' }}
        </view>
      </picker>
    </view>

    <view class="section">
      <text class="section__title">资料完整度检查</text>
      <text class="section__desc">选择狗狗后，系统会读取健康记录、过敏记录、体重记录和报告附件。</text>
    </view>

    <view class="section">
      <text class="section__title">结果状态</text>
      <view class="status-list">
        <text>可审核发布</text>
        <text>需人工审核</text>
        <text>受限草稿</text>
        <text>无法完成</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dogApi } from '../../api/dogs'

const dogs = ref<any[]>([])
const selectedDogIndex = ref(-1)
const selectedDog = computed(() => selectedDogIndex.value >= 0 ? dogs.value[selectedDogIndex.value] : null)

onMounted(async () => {
  const res: any = await dogApi.list()
  dogs.value = Array.isArray(res.data) ? res.data : []
})

function onDogChange(event: any) {
  selectedDogIndex.value = Number(event.detail.value)
}
</script>
```

- [ ] **Step 3: Run miniapp test**

Run:

```bash
cd miniapp
npm test -- src/pages/ai-recipe-designer/assessment.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add miniapp/src/pages/ai-recipe-designer
git commit -m "feat: add ai recipe designer shell"
```

## Milestone 6: Golden Case Verification

### Task 14: Add golden case backend tests

**Files:**
- Create: `backend/tests/ai-recipe/golden-cases.spec.ts`

- [ ] **Step 1: Create golden tests**

Create `backend/tests/ai-recipe/golden-cases.spec.ts`:

```ts
import { EvidenceService } from '../../src/application/ai-recipe/evidence.service';
import { NutritionAssessmentService } from '../../src/application/ai-recipe/nutrition-assessment.service';
import { ConstraintSynthesisService } from '../../src/application/ai-recipe/constraint-synthesis.service';
import { AiRecipeResultStatus, EvidenceLevel } from '../../src/domain/ai-recipe/enums';

describe('AI recipe golden cases', () => {
  it('does not enable pancreas package from owner text alone', () => {
    const assessment = new NutritionAssessmentService();
    const plan = assessment.buildPlan({
      dog: { id: 'dog-1', currentWeightKg: 8, bcsScore: 5, activityLevel: 'NORMAL' },
      evidence: [{ level: EvidenceLevel.C_OWNER_REPORTED, sourceType: 'OWNER_TEXT', title: '医生说过胰腺炎', isConfirmed: false, confirmedData: {} }],
      confirmedInputs: { dietHistory: '鸡肉鲜食' },
      activeRulePackages: [{ code: 'PANCREAS_LOW_FAT', requiredFields: ['dietHistory'] }],
    });

    expect(plan.enabledRulePackages).not.toContain('PANCREAS_LOW_FAT');
    expect(plan.disabledRulePackages[0].reason).toContain('证据等级不足');
  });

  it('never grades stool photo above D evidence', () => {
    const evidence = new EvidenceService();
    const level = evidence.gradeEvidence({
      sourceType: 'STOOL_PHOTO',
      isConfirmed: true,
      confirmedData: { observation: '软便' },
      attachmentUrls: ['https://cdn.test/stool.jpg'],
    });

    expect(level).toBe(EvidenceLevel.D_ATTACHMENT_OBSERVATION);
  });

  it('blocks impossible hard constraints', () => {
    const constraints = new ConstraintSynthesisService();
    const result = constraints.synthesize({
      dogId: 'dog-1',
      assessmentId: 'assessment-1',
      rulePackages: ['PANCREAS_LOW_FAT', 'HIGH_FAT_TEST_RULE'],
      hardConstraints: [
        { key: 'fat.maxPercentCalories', value: 18, source: 'PANCREAS_LOW_FAT' },
        { key: 'fat.minPercentCalories', value: 25, source: 'HIGH_FAT_TEST_RULE' },
      ],
      softConstraints: [],
    });

    expect(result.resultStatus).toBe(AiRecipeResultStatus.UNABLE_TO_COMPLETE);
  });
});
```

- [ ] **Step 2: Run golden tests**

Run:

```bash
cd backend
npm test -- tests/ai-recipe/golden-cases.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/ai-recipe/golden-cases.spec.ts
git commit -m "test: add ai recipe golden cases"
```

### Task 15: Final verification

**Files:**
- Create: `docs/reports/ai-recipe-auto-design-verification.md`

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd backend
npm test -- tests/ai-recipe --runInBand
```

Expected: all AI recipe tests pass.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd backend
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Run miniapp tests**

Run:

```bash
cd miniapp
npm test -- src/pages/ai-recipe-designer/assessment.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Run admin build**

Run:

```bash
cd admin-web
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Write verification report**

Create `docs/reports/ai-recipe-auto-design-verification.md`:

```md
# AI Recipe Auto Design Verification

## Commands

- `cd backend && npm test -- tests/ai-recipe --runInBand`
- `cd backend && npm run build`
- `cd miniapp && npm test -- src/pages/ai-recipe-designer/assessment.spec.ts`
- `cd admin-web && npm run build`

## Expected Result

All focused tests and builds pass.

## Scope Verified

- Knowledge source foundation
- Evidence grading
- Nutrition assessment plan status
- Constraint conflict detection
- Agent design session records
- Admin knowledge source views
- Miniapp admin AI recipe entry
```

- [ ] **Step 6: Commit**

```bash
git add docs/reports/ai-recipe-auto-design-verification.md
git commit -m "docs: verify ai recipe auto design foundation"
```

## Self-Review Checklist

- The plan covers the approved spec sections: knowledge sources, evidence grading, two-stage workflow, first two rule packages, AI design entry, admin-only permissions, result statuses, audit-ready sessions, and golden cases.
- The plan intentionally defers full LLM integration until deterministic services and golden tests exist.
- The plan does not let unconfirmed report extraction enable a disease package.
- The plan does not let stool photos trigger disease rules.
- The plan does not let a limited draft publish directly.
- The plan keeps FEDIAF evaluation as a later deterministic integration point after the foundation service contracts exist.
