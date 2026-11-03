# Dog Breed Health Risk Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-managed breed health risk knowledge base and show read-only, source-backed breed health education in the miniapp.

**Architecture:** Store disease master data, breed-to-disease associations, and visible sources in backend Prisma tables. Expose one breed-detail endpoint from the existing dog API, then let the miniapp render a reusable progressive-disclosure section on the health page and a standalone lookup page.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, Vue 3 `script setup`, uni-app, Vitest

---

## File Structure

Backend:

- Create `backend/src/domain/dog/breed-health-risk.entity.ts` for attention-priority labels, source types, and normalized domain shapes.
- Create `backend/src/domain/dog/breed-health-risk.repository.ts` for the read repository interface.
- Modify `backend/src/domain/index.ts` to export the new domain contracts.
- Modify `backend/prisma/schema.prisma` to add three knowledge-base tables and two enums.
- Create `backend/prisma/migrations/20260517120000_add_breed_health_risks/migration.sql`.
- Create `backend/src/infrastructure/repositories/prisma-breed-health-risk.repository.ts` for Prisma reads.
- Create `backend/src/application/dog/breed-health-risk.service.ts` for breed existence checks and response mapping.
- Create `backend/src/interfaces/dto/dogs/breed-health-risk-response.dto.ts` for Swagger/API response shape.
- Modify `backend/src/interfaces/controllers/dogs.controller.ts` to add `GET /api/v1/dogs/breeds/:breedId/health-risks`.
- Modify `backend/src/app.module.ts` to wire the repository and service.
- Modify backend tests under `backend/tests/...`.

Miniapp:

- Modify `miniapp/src/api/dogs.ts` and `miniapp/src/api/dogs.spec.ts` for the new API adapter.
- Create `miniapp/src/utils/breed-health-risks.ts` and `miniapp/src/utils/breed-health-risks.spec.ts` for normalization, labels, and empty-state logic.
- Create `miniapp/src/components/dog-profile/BreedHealthRiskSection.vue`.
- Modify `miniapp/src/pages/dog-profile-health/index.vue` and `miniapp/src/pages/dog-profile-health.regression.spec.ts`.
- Create `miniapp/src/pages/breed-health-risk-lookup/index.vue`.
- Modify `miniapp/src/pages.json`.
- Create `miniapp/src/pages/breed-health-risk-lookup.regression.spec.ts`.

### Task 1: Add Backend Domain Contracts

**Files:**
- Create: `backend/tests/domain/dog/breed-health-risk.entity.spec.ts`
- Create: `backend/src/domain/dog/breed-health-risk.entity.ts`
- Create: `backend/src/domain/dog/breed-health-risk.repository.ts`
- Modify: `backend/src/domain/index.ts`

- [ ] **Step 1: Write the failing domain test**

Create `backend/tests/domain/dog/breed-health-risk.entity.spec.ts`:

```ts
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
  getBreedHealthAttentionLabel,
} from 'src/domain/dog/breed-health-risk.entity';

describe('breed health risk domain contracts', () => {
  it('maps editorial attention priorities to user-facing labels', () => {
    expect(getBreedHealthAttentionLabel(BreedHealthAttentionPriority.KEY_ATTENTION)).toBe('重点关注');
    expect(getBreedHealthAttentionLabel(BreedHealthAttentionPriority.RECOMMENDED_AWARENESS)).toBe('建议了解');
    expect(getBreedHealthAttentionLabel(BreedHealthAttentionPriority.SUPPLEMENTAL_AWARENESS)).toBe('补充了解');
  });

  it('keeps source types explicit for visible evidence rows', () => {
    expect(BreedHealthRiskSourceType.CIDD).toBe('CIDD');
    expect(BreedHealthRiskSourceType.OFA_CHIC).toBe('OFA_CHIC');
    expect(BreedHealthRiskSourceType.OMIA).toBe('OMIA');
    expect(BreedHealthRiskSourceType.WSAVA).toBe('WSAVA');
  });
});
```

- [ ] **Step 2: Run the domain test to verify it fails**

Run:

```bash
cd backend && npm test -- --runInBand tests/domain/dog/breed-health-risk.entity.spec.ts
```

Expected: FAIL because `src/domain/dog/breed-health-risk.entity` does not exist.

- [ ] **Step 3: Add the minimal domain implementation**

Create `backend/src/domain/dog/breed-health-risk.entity.ts`:

```ts
export enum BreedHealthAttentionPriority {
  KEY_ATTENTION = 'KEY_ATTENTION',
  RECOMMENDED_AWARENESS = 'RECOMMENDED_AWARENESS',
  SUPPLEMENTAL_AWARENESS = 'SUPPLEMENTAL_AWARENESS',
}

export enum BreedHealthRiskSourceType {
  CIDD = 'CIDD',
  OFA_CHIC = 'OFA_CHIC',
  OMIA = 'OMIA',
  WSAVA = 'WSAVA',
  VETERINARY_LITERATURE = 'VETERINARY_LITERATURE',
  BREED_CLUB = 'BREED_CLUB',
  OTHER = 'OTHER',
}

export const BREED_HEALTH_ATTENTION_LABELS: Record<BreedHealthAttentionPriority, string> = {
  [BreedHealthAttentionPriority.KEY_ATTENTION]: '重点关注',
  [BreedHealthAttentionPriority.RECOMMENDED_AWARENESS]: '建议了解',
  [BreedHealthAttentionPriority.SUPPLEMENTAL_AWARENESS]: '补充了解',
};

export interface BreedHealthCondition {
  id: string;
  nameCn: string;
  nameEn: string | null;
  aliases: string[];
  category: string;
  summary: string;
  commonSigns: string[];
  screeningAdvice: string | null;
  careAdvice: string | null;
  isActive: boolean;
}

export interface BreedHealthRiskSource {
  id: string;
  riskId: string;
  sourceType: BreedHealthRiskSourceType;
  sourceName: string;
  publisher: string | null;
  title: string;
  url: string;
  accessedAt: Date;
  note: string | null;
}

export interface BreedHealthRisk {
  id: string;
  breedId: string;
  conditionId: string;
  attentionPriority: BreedHealthAttentionPriority;
  oneLineSummary: string;
  breedSpecificReason: string | null;
  displayOrder: number;
  isPublished: boolean;
  condition: BreedHealthCondition;
  sources: BreedHealthRiskSource[];
}

export function getBreedHealthAttentionLabel(priority: BreedHealthAttentionPriority): string {
  return BREED_HEALTH_ATTENTION_LABELS[priority] || priority;
}
```

Create `backend/src/domain/dog/breed-health-risk.repository.ts`:

```ts
import type { BreedHealthRisk } from './breed-health-risk.entity';

export interface BreedHealthRiskRepository {
  findPublishedByBreedId(breedId: string): Promise<BreedHealthRisk[]>;
}
```

Modify `backend/src/domain/index.ts` by adding these exports in the Dog Domain section:

```ts
export * from './dog/breed-health-risk.entity';
export * from './dog/breed-health-risk.repository';
```

- [ ] **Step 4: Run the domain test to verify it passes**

Run:

```bash
cd backend && npm test -- --runInBand tests/domain/dog/breed-health-risk.entity.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/domain/dog/breed-health-risk.entity.spec.ts \
  backend/src/domain/dog/breed-health-risk.entity.ts \
  backend/src/domain/dog/breed-health-risk.repository.ts \
  backend/src/domain/index.ts
git commit -m "feat: add breed health risk domain contracts"
```

### Task 2: Add Prisma Tables And Repository

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260517120000_add_breed_health_risks/migration.sql`
- Create: `backend/tests/infrastructure/repositories/prisma-breed-health-risk.repository.spec.ts`
- Create: `backend/src/infrastructure/repositories/prisma-breed-health-risk.repository.ts`

- [ ] **Step 1: Write the failing repository test**

Create `backend/tests/infrastructure/repositories/prisma-breed-health-risk.repository.spec.ts`:

```ts
import { PrismaBreedHealthRiskRepository } from 'src/infrastructure/repositories/prisma-breed-health-risk.repository';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
} from 'src/domain/dog/breed-health-risk.entity';

describe('PrismaBreedHealthRiskRepository', () => {
  const findMany = jest.fn();
  const prisma = {
    breedHealthRisk: { findMany },
  } as any;

  beforeEach(() => {
    findMany.mockReset();
  });

  it('returns only published risks with visible sources for one breed', async () => {
    findMany.mockResolvedValue([
      {
        id: 'risk-1',
        breedId: 'breed-1',
        conditionId: 'condition-1',
        attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
        oneLineSummary: '该品种资料中较常被提及的骨骼关节关注项。',
        breedSpecificReason: '大型犬资料中常见。',
        displayOrder: 1,
        isPublished: true,
        condition: {
          id: 'condition-1',
          nameCn: '髋关节发育不良',
          nameEn: 'Hip Dysplasia',
          aliases: ['CHD'],
          category: '骨骼关节',
          summary: '髋关节相关疾病。',
          commonSigns: ['后肢跛行'],
          screeningAdvice: '可与兽医讨论髋关节检查。',
          careAdvice: '出现疼痛或跛行请咨询兽医。',
          isActive: true,
        },
        sources: [
          {
            id: 'source-1',
            riskId: 'risk-1',
            sourceType: BreedHealthRiskSourceType.OFA_CHIC,
            sourceName: 'OFA CHIC',
            publisher: 'Orthopedic Foundation for Animals',
            title: 'Breed screening recommendation',
            url: 'https://ofa.org/diseases/',
            accessedAt: new Date('2026-05-17T00:00:00.000Z'),
            note: null,
          },
        ],
      },
    ]);

    const repository = new PrismaBreedHealthRiskRepository(prisma);
    const risks = await repository.findPublishedByBreedId('breed-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        breedId: 'breed-1',
        isPublished: true,
        condition: { isActive: true },
        sources: { some: {} },
      },
      include: {
        condition: true,
        sources: {
          orderBy: [{ sourceType: 'asc' }, { sourceName: 'asc' }],
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    expect(risks).toHaveLength(1);
    expect(risks[0].condition.nameCn).toBe('髋关节发育不良');
    expect(risks[0].sources[0].sourceType).toBe(BreedHealthRiskSourceType.OFA_CHIC);
  });
});
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run:

```bash
cd backend && npm test -- --runInBand tests/infrastructure/repositories/prisma-breed-health-risk.repository.spec.ts
```

Expected: FAIL because `PrismaBreedHealthRiskRepository` does not exist.

- [ ] **Step 3: Add Prisma schema and migration**

Modify `backend/prisma/schema.prisma`.

Add this relation field inside the existing `model DogBreed`:

```prisma
  healthRisks          BreedHealthRisk[]
```

Add these enums near the other enum declarations:

```prisma
enum BreedHealthAttentionPriority {
  KEY_ATTENTION
  RECOMMENDED_AWARENESS
  SUPPLEMENTAL_AWARENESS
}

enum BreedHealthRiskSourceType {
  CIDD
  OFA_CHIC
  OMIA
  WSAVA
  VETERINARY_LITERATURE
  BREED_CLUB
  OTHER
}
```

Add these models near `DogBreed` and `Dog`:

```prisma
model BreedHealthCondition {
  id              String             @id @default(uuid()) @map("id")
  nameCn          String             @map("name_cn") @db.VarChar(120)
  nameEn          String?            @map("name_en") @db.VarChar(160)
  aliases         String[]           @default([]) @map("aliases")
  category        String             @map("category") @db.VarChar(80)
  summary         String             @map("summary")
  commonSigns     String[]           @default([]) @map("common_signs")
  screeningAdvice String?            @map("screening_advice")
  careAdvice      String?            @map("care_advice")
  isActive        Boolean            @default(true) @map("is_active")
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")
  risks           BreedHealthRisk[]

  @@index([category])
  @@index([isActive])
  @@map("breed_health_condition")
}

model BreedHealthRisk {
  id                   String                       @id @default(uuid()) @map("id")
  breedId              String                       @map("breed_id")
  conditionId          String                       @map("condition_id")
  attentionPriority    BreedHealthAttentionPriority @map("attention_priority")
  oneLineSummary       String                       @map("one_line_summary")
  breedSpecificReason  String?                      @map("breed_specific_reason")
  displayOrder         Int                          @default(0) @map("display_order")
  isPublished          Boolean                      @default(false) @map("is_published")
  createdAt            DateTime                     @default(now()) @map("created_at")
  updatedAt            DateTime                     @updatedAt @map("updated_at")
  breed                DogBreed                     @relation(fields: [breedId], references: [id], onDelete: Cascade)
  condition            BreedHealthCondition         @relation(fields: [conditionId], references: [id], onDelete: Cascade)
  sources              BreedHealthRiskSource[]

  @@unique([breedId, conditionId])
  @@index([breedId, isPublished, displayOrder])
  @@index([conditionId])
  @@map("breed_health_risk")
}

model BreedHealthRiskSource {
  id          String                    @id @default(uuid()) @map("id")
  riskId      String                    @map("risk_id")
  sourceType  BreedHealthRiskSourceType @map("source_type")
  sourceName  String                    @map("source_name") @db.VarChar(120)
  publisher   String?                   @map("publisher") @db.VarChar(160)
  title       String                    @map("title") @db.VarChar(240)
  url         String                    @map("url")
  accessedAt  DateTime                  @map("accessed_at")
  note        String?                   @map("note")
  createdAt   DateTime                  @default(now()) @map("created_at")
  updatedAt   DateTime                  @updatedAt @map("updated_at")
  risk        BreedHealthRisk           @relation(fields: [riskId], references: [id], onDelete: Cascade)

  @@index([riskId])
  @@index([sourceType])
  @@map("breed_health_risk_source")
}
```

Create `backend/prisma/migrations/20260517120000_add_breed_health_risks/migration.sql`:

```sql
CREATE TYPE "BreedHealthAttentionPriority" AS ENUM (
  'KEY_ATTENTION',
  'RECOMMENDED_AWARENESS',
  'SUPPLEMENTAL_AWARENESS'
);

CREATE TYPE "BreedHealthRiskSourceType" AS ENUM (
  'CIDD',
  'OFA_CHIC',
  'OMIA',
  'WSAVA',
  'VETERINARY_LITERATURE',
  'BREED_CLUB',
  'OTHER'
);

CREATE TABLE "breed_health_condition" (
  "id" TEXT NOT NULL,
  "name_cn" VARCHAR(120) NOT NULL,
  "name_en" VARCHAR(160),
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "category" VARCHAR(80) NOT NULL,
  "summary" TEXT NOT NULL,
  "common_signs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "screening_advice" TEXT,
  "care_advice" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breed_health_condition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "breed_health_risk" (
  "id" TEXT NOT NULL,
  "breed_id" TEXT NOT NULL,
  "condition_id" TEXT NOT NULL,
  "attention_priority" "BreedHealthAttentionPriority" NOT NULL,
  "one_line_summary" TEXT NOT NULL,
  "breed_specific_reason" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breed_health_risk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "breed_health_risk_source" (
  "id" TEXT NOT NULL,
  "risk_id" TEXT NOT NULL,
  "source_type" "BreedHealthRiskSourceType" NOT NULL,
  "source_name" VARCHAR(120) NOT NULL,
  "publisher" VARCHAR(160),
  "title" VARCHAR(240) NOT NULL,
  "url" TEXT NOT NULL,
  "accessed_at" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breed_health_risk_source_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "breed_health_condition_category_idx" ON "breed_health_condition"("category");
CREATE INDEX "breed_health_condition_is_active_idx" ON "breed_health_condition"("is_active");
CREATE UNIQUE INDEX "breed_health_risk_breed_id_condition_id_key" ON "breed_health_risk"("breed_id", "condition_id");
CREATE INDEX "breed_health_risk_breed_id_is_published_display_order_idx" ON "breed_health_risk"("breed_id", "is_published", "display_order");
CREATE INDEX "breed_health_risk_condition_id_idx" ON "breed_health_risk"("condition_id");
CREATE INDEX "breed_health_risk_source_risk_id_idx" ON "breed_health_risk_source"("risk_id");
CREATE INDEX "breed_health_risk_source_source_type_idx" ON "breed_health_risk_source"("source_type");

ALTER TABLE "breed_health_risk"
ADD CONSTRAINT "breed_health_risk_breed_id_fkey"
FOREIGN KEY ("breed_id") REFERENCES "dog_breed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breed_health_risk"
ADD CONSTRAINT "breed_health_risk_condition_id_fkey"
FOREIGN KEY ("condition_id") REFERENCES "breed_health_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "breed_health_risk_source"
ADD CONSTRAINT "breed_health_risk_source_risk_id_fkey"
FOREIGN KEY ("risk_id") REFERENCES "breed_health_risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Add the Prisma repository**

Create `backend/src/infrastructure/repositories/prisma-breed-health-risk.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { BreedHealthRiskRepository } from '../../domain/dog/breed-health-risk.repository';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
  type BreedHealthRisk,
} from '../../domain/dog/breed-health-risk.entity';

@Injectable()
export class PrismaBreedHealthRiskRepository implements BreedHealthRiskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublishedByBreedId(breedId: string): Promise<BreedHealthRisk[]> {
    const records = await this.prisma.breedHealthRisk.findMany({
      where: {
        breedId,
        isPublished: true,
        condition: { isActive: true },
        sources: { some: {} },
      },
      include: {
        condition: true,
        sources: {
          orderBy: [{ sourceType: 'asc' }, { sourceName: 'asc' }],
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return records.map((record: any) => ({
      id: record.id,
      breedId: record.breedId,
      conditionId: record.conditionId,
      attentionPriority: record.attentionPriority as BreedHealthAttentionPriority,
      oneLineSummary: record.oneLineSummary,
      breedSpecificReason: record.breedSpecificReason,
      displayOrder: record.displayOrder,
      isPublished: record.isPublished,
      condition: {
        id: record.condition.id,
        nameCn: record.condition.nameCn,
        nameEn: record.condition.nameEn,
        aliases: record.condition.aliases || [],
        category: record.condition.category,
        summary: record.condition.summary,
        commonSigns: record.condition.commonSigns || [],
        screeningAdvice: record.condition.screeningAdvice,
        careAdvice: record.condition.careAdvice,
        isActive: record.condition.isActive,
      },
      sources: (record.sources || []).map((source: any) => ({
        id: source.id,
        riskId: source.riskId,
        sourceType: source.sourceType as BreedHealthRiskSourceType,
        sourceName: source.sourceName,
        publisher: source.publisher,
        title: source.title,
        url: source.url,
        accessedAt: source.accessedAt,
        note: source.note,
      })),
    }));
  }
}
```

- [ ] **Step 5: Generate Prisma client and run the repository test**

Run:

```bash
cd backend && npx prisma generate
npm test -- --runInBand tests/infrastructure/repositories/prisma-breed-health-risk.repository.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma \
  backend/prisma/migrations/20260517120000_add_breed_health_risks/migration.sql \
  backend/tests/infrastructure/repositories/prisma-breed-health-risk.repository.spec.ts \
  backend/src/infrastructure/repositories/prisma-breed-health-risk.repository.ts
git commit -m "feat: add breed health risk persistence"
```

### Task 3: Add Backend Service And API Endpoint

**Files:**
- Create: `backend/src/application/dog/breed-health-risk.service.ts`
- Create: `backend/src/interfaces/dto/dogs/breed-health-risk-response.dto.ts`
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/tests/interfaces/controllers/dogs.controller.spec.ts`

- [ ] **Step 1: Write the failing controller tests**

Modify `backend/tests/interfaces/controllers/dogs.controller.spec.ts`.

Add imports:

```ts
import {
  BREED_HEALTH_RISK_REPOSITORY,
  BreedHealthRiskService,
} from 'src/application/dog/breed-health-risk.service';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
} from 'src/domain/dog/breed-health-risk.entity';
```

Add this mock near the other mocks:

```ts
  const mockBreedHealthRiskRepository = {
    findPublishedByBreedId: jest.fn(),
  };
```

Add these providers to the testing module:

```ts
        BreedHealthRiskService,
        {
          provide: BREED_HEALTH_RISK_REPOSITORY,
          useValue: mockBreedHealthRiskRepository,
        },
```

Add this reset in `beforeEach`:

```ts
    mockBreedHealthRiskRepository.findPublishedByBreedId.mockResolvedValue([]);
```

Add this test block after the hot breeds tests:

```ts
  describe('GET /api/v1/dogs/breeds/:breedId/health-risks', () => {
    it('returns published breed health risks with visible source metadata', async () => {
      mockDogBreedRepository.findById.mockResolvedValue(mockBreed);
      mockBreedHealthRiskRepository.findPublishedByBreedId.mockResolvedValue([
        {
          id: 'risk-1',
          breedId: mockBreed.id,
          conditionId: 'condition-1',
          attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
          oneLineSummary: '该品种资料中较常被提及的骨骼关节关注项。',
          breedSpecificReason: '该品种体型和遗传资料中较常被提及。',
          displayOrder: 1,
          isPublished: true,
          condition: {
            id: 'condition-1',
            nameCn: '髋关节发育不良',
            nameEn: 'Hip Dysplasia',
            aliases: ['CHD'],
            category: '骨骼关节',
            summary: '髋关节相关疾病。',
            commonSigns: ['后肢跛行', '运动不愿意'],
            screeningAdvice: '可与兽医讨论髋关节相关检查。',
            careAdvice: '如出现疼痛或跛行表现，请咨询兽医。',
            isActive: true,
          },
          sources: [
            {
              id: 'source-1',
              riskId: 'risk-1',
              sourceType: BreedHealthRiskSourceType.OFA_CHIC,
              sourceName: 'OFA CHIC',
              publisher: 'Orthopedic Foundation for Animals',
              title: 'Breed screening recommendation',
              url: 'https://ofa.org/diseases/',
              accessedAt: new Date('2026-05-17T00:00:00.000Z'),
              note: null,
            },
          ],
        },
      ]);

      const response = await request(app.getHttpAdapter().getInstance())
        .get(`/api/v1/dogs/breeds/${mockBreed.id}/health-risks`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data.breed).toEqual({
        id: mockBreed.id,
        name: mockBreed.name,
      });
      expect(response.body.data.risks).toHaveLength(1);
      expect(response.body.data.risks[0]).toMatchObject({
        id: 'risk-1',
        conditionId: 'condition-1',
        conditionName: '髋关节发育不良',
        category: '骨骼关节',
        attentionPriority: 'KEY_ATTENTION',
        attentionLabel: '重点关注',
        sourceCount: 1,
      });
      expect(response.body.data.risks[0].sources[0]).toMatchObject({
        sourceType: 'OFA_CHIC',
        sourceName: 'OFA CHIC',
        accessedAt: '2026-05-17',
      });
      expect(mockBreedHealthRiskRepository.findPublishedByBreedId).toHaveBeenCalledWith(mockBreed.id);
    });

    it('returns an empty risk list for a known breed with no published risk content', async () => {
      mockDogBreedRepository.findById.mockResolvedValue(mockBreed);
      mockBreedHealthRiskRepository.findPublishedByBreedId.mockResolvedValue([]);

      const response = await request(app.getHttpAdapter().getInstance())
        .get(`/api/v1/dogs/breeds/${mockBreed.id}/health-risks`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data).toEqual({
        breed: {
          id: mockBreed.id,
          name: mockBreed.name,
        },
        risks: [],
      });
    });

    it('returns a friendly 404 envelope for an unknown breed', async () => {
      mockDogBreedRepository.findById.mockResolvedValue(null);

      const response = await request(app.getHttpAdapter().getInstance())
        .get('/api/v1/dogs/breeds/missing-breed/health-risks')
        .expect(200);

      expect(response.body).toEqual({
        code: 404,
        message: '未找到该品种',
        data: null,
      });
      expect(mockBreedHealthRiskRepository.findPublishedByBreedId).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the controller tests to verify they fail**

Run:

```bash
cd backend && npm test -- --runInBand tests/interfaces/controllers/dogs.controller.spec.ts
```

Expected: FAIL because `BreedHealthRiskService`, the provider token, and the route do not exist.

- [ ] **Step 3: Add response DTOs**

Create `backend/src/interfaces/dto/dogs/breed-health-risk-response.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
} from '../../../domain/dog/breed-health-risk.entity';

export class BreedHealthRiskBreedDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class BreedHealthRiskSourceDto {
  @ApiProperty({ enum: BreedHealthRiskSourceType })
  sourceType!: BreedHealthRiskSourceType;

  @ApiProperty()
  sourceName!: string;

  @ApiPropertyOptional({ nullable: true })
  publisher?: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ example: '2026-05-17' })
  accessedAt!: string;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;
}

export class BreedHealthRiskItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  conditionId!: string;

  @ApiProperty()
  conditionName!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ enum: BreedHealthAttentionPriority })
  attentionPriority!: BreedHealthAttentionPriority;

  @ApiProperty()
  attentionLabel!: string;

  @ApiProperty()
  oneLineSummary!: string;

  @ApiPropertyOptional({ nullable: true })
  breedSpecificReason?: string | null;

  @ApiProperty({ type: [String] })
  commonSigns!: string[];

  @ApiPropertyOptional({ nullable: true })
  screeningAdvice?: string | null;

  @ApiPropertyOptional({ nullable: true })
  careAdvice?: string | null;

  @ApiProperty()
  sourceCount!: number;

  @ApiProperty({ type: [BreedHealthRiskSourceDto] })
  sources!: BreedHealthRiskSourceDto[];
}

export class BreedHealthRiskResponseDto {
  @ApiProperty({ type: BreedHealthRiskBreedDto })
  breed!: BreedHealthRiskBreedDto;

  @ApiProperty({ type: [BreedHealthRiskItemDto] })
  risks!: BreedHealthRiskItemDto[];
}
```

- [ ] **Step 4: Add the application service**

Create `backend/src/application/dog/breed-health-risk.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import { DOG_BREED_REPOSITORY } from './dog.service';
import type { BreedHealthRiskRepository } from '../../domain/dog/breed-health-risk.repository';
import {
  getBreedHealthAttentionLabel,
  type BreedHealthRisk,
} from '../../domain/dog/breed-health-risk.entity';
import type { BreedHealthRiskResponseDto } from '../../interfaces/dto/dogs/breed-health-risk-response.dto';

export const BREED_HEALTH_RISK_REPOSITORY = Symbol('BreedHealthRiskRepository');

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapRiskToDto(risk: BreedHealthRisk) {
  return {
    id: risk.id,
    conditionId: risk.conditionId,
    conditionName: risk.condition.nameCn,
    category: risk.condition.category,
    attentionPriority: risk.attentionPriority,
    attentionLabel: getBreedHealthAttentionLabel(risk.attentionPriority),
    oneLineSummary: risk.oneLineSummary,
    breedSpecificReason: risk.breedSpecificReason,
    commonSigns: risk.condition.commonSigns,
    screeningAdvice: risk.condition.screeningAdvice,
    careAdvice: risk.condition.careAdvice,
    sourceCount: risk.sources.length,
    sources: risk.sources.map((source) => ({
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      publisher: source.publisher,
      title: source.title,
      url: source.url,
      accessedAt: formatDateOnly(source.accessedAt),
      note: source.note,
    })),
  };
}

@Injectable()
export class BreedHealthRiskService {
  constructor(
    @Inject(DOG_BREED_REPOSITORY)
    private readonly dogBreedRepository: DogBreedRepository,
    @Inject(BREED_HEALTH_RISK_REPOSITORY)
    private readonly breedHealthRiskRepository: BreedHealthRiskRepository,
  ) {}

  async findPublishedByBreedId(
    breedId: string,
  ): Promise<BreedHealthRiskResponseDto | null> {
    const breed = await this.dogBreedRepository.findById(breedId);
    if (!breed) {
      return null;
    }

    const risks = await this.breedHealthRiskRepository.findPublishedByBreedId(breedId);

    return {
      breed: {
        id: breed.id,
        name: breed.name,
      },
      risks: risks.map(mapRiskToDto),
    };
  }
}
```

- [ ] **Step 5: Add the controller endpoint**

Modify `backend/src/interfaces/controllers/dogs.controller.ts`.

Add imports:

```ts
import { BreedHealthRiskService } from '../../application/dog/breed-health-risk.service';
import { BreedHealthRiskResponseDto } from '../dto/dogs/breed-health-risk-response.dto';
```

Add this constructor dependency after `private readonly dogService: DogService`:

```ts
    private readonly breedHealthRiskService: BreedHealthRiskService,
```

Add this route after `listHotBreeds()` and before `@Get()`:

```ts
  @Get('breeds/:breedId/health-risks')
  @ApiOperation({ summary: 'Get published breed health risk knowledge for one breed' })
  @ApiParam({ name: 'breedId', description: 'Dog breed ID' })
  @ApiResponse({
    status: 200,
    description: 'Published breed health risk knowledge',
    type: BreedHealthRiskResponseDto,
  })
  async getBreedHealthRisks(
    @Param('breedId') breedId: string,
  ): Promise<ApiResponseDto<BreedHealthRiskResponseDto> | ApiResponseDto<null>> {
    const result = await this.breedHealthRiskService.findPublishedByBreedId(breedId);
    if (!result) {
      return ApiResponseDto.error(404, '未找到该品种');
    }

    return ApiResponseDto.success(result);
  }
```

- [ ] **Step 6: Wire the service and repository in AppModule**

Modify `backend/src/app.module.ts`.

Add imports:

```ts
import {
  BreedHealthRiskService,
  BREED_HEALTH_RISK_REPOSITORY,
} from './application/dog/breed-health-risk.service';
import { PrismaBreedHealthRiskRepository } from './infrastructure/repositories/prisma-breed-health-risk.repository';
```

Add providers near the dog breed repository provider:

```ts
    BreedHealthRiskService,
    {
      provide: BREED_HEALTH_RISK_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaBreedHealthRiskRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
```

- [ ] **Step 7: Run the controller tests to verify they pass**

Run:

```bash
cd backend && npm test -- --runInBand tests/interfaces/controllers/dogs.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/application/dog/breed-health-risk.service.ts \
  backend/src/interfaces/dto/dogs/breed-health-risk-response.dto.ts \
  backend/src/interfaces/controllers/dogs.controller.ts \
  backend/src/app.module.ts \
  backend/tests/interfaces/controllers/dogs.controller.spec.ts
git commit -m "feat: expose breed health risk API"
```

### Task 4: Add Miniapp API Adapter And Helpers

**Files:**
- Modify: `miniapp/src/api/dogs.ts`
- Modify: `miniapp/src/api/dogs.spec.ts`
- Create: `miniapp/src/utils/breed-health-risks.ts`
- Create: `miniapp/src/utils/breed-health-risks.spec.ts`

- [ ] **Step 1: Write the failing miniapp tests**

Append to `miniapp/src/api/dogs.spec.ts`:

```ts
describe('dogApi breedHealthRisks', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
  })

  it('loads breed health risks by breed id', () => {
    dogApi.breedHealthRisks('breed-1')

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/dogs/breeds/breed-1/health-risks',
      method: 'GET',
    })
  })
})
```

Create `miniapp/src/utils/breed-health-risks.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  canRequestBreedHealthRisks,
  getBreedHealthAttentionLabel,
  normalizeBreedHealthRiskResponse,
  resolveBreedHealthRiskEmptyText,
} from './breed-health-risks'

describe('breed-health-risks helpers', () => {
  it('maps attention priorities to product labels', () => {
    expect(getBreedHealthAttentionLabel('KEY_ATTENTION')).toBe('重点关注')
    expect(getBreedHealthAttentionLabel('RECOMMENDED_AWARENESS')).toBe('建议了解')
    expect(getBreedHealthAttentionLabel('SUPPLEMENTAL_AWARENESS')).toBe('补充了解')
    expect(getBreedHealthAttentionLabel('UNKNOWN')).toBe('补充了解')
  })

  it('normalizes wrapped backend responses into safe display data', () => {
    const normalized = normalizeBreedHealthRiskResponse({
      data: {
        breed: { id: 'breed-1', name: '金毛' },
        risks: [
          {
            id: 'risk-1',
            conditionId: 'condition-1',
            conditionName: '髋关节发育不良',
            category: '骨骼关节',
            attentionPriority: 'KEY_ATTENTION',
            oneLineSummary: '该品种资料中较常被提及。',
            commonSigns: ['后肢跛行'],
            sourceCount: 1,
            sources: [
              {
                sourceType: 'OFA_CHIC',
                sourceName: 'OFA CHIC',
                title: 'Breed screening recommendation',
                url: 'https://ofa.org/diseases/',
                accessedAt: '2026-05-17',
              },
            ],
          },
        ],
      },
    })

    expect(normalized.breedName).toBe('金毛')
    expect(normalized.risks[0].attentionLabel).toBe('重点关注')
    expect(normalized.risks[0].sources[0].sourceName).toBe('OFA CHIC')
  })

  it('only requests standard breeds', () => {
    expect(canRequestBreedHealthRisks({ breedId: 'breed-1', customBreedName: '' })).toBe(true)
    expect(canRequestBreedHealthRisks({ breedId: '00000000-0000-0000-0000-000000000000', customBreedName: '串串' })).toBe(false)
    expect(canRequestBreedHealthRisks({ breedId: '', customBreedName: '' })).toBe(false)
  })

  it('uses cautious empty-state copy', () => {
    expect(resolveBreedHealthRiskEmptyText('mixed')).toContain('混血/手动填写品种')
    expect(resolveBreedHealthRiskEmptyText('no-data')).toContain('暂未收录')
  })
})
```

- [ ] **Step 2: Run the miniapp tests to verify they fail**

Run:

```bash
cd miniapp && pnpm test -- src/api/dogs.spec.ts src/utils/breed-health-risks.spec.ts
```

Expected: FAIL because `dogApi.breedHealthRisks` and the helper module do not exist.

- [ ] **Step 3: Add the API adapter**

Modify `miniapp/src/api/dogs.ts` by adding this method near `breeds()` and `hotBreeds()`:

```ts
  breedHealthRisks: (breedId: string) =>
    request({ url: `/dogs/breeds/${breedId}/health-risks`, method: 'GET' }),
```

- [ ] **Step 4: Add helper implementation**

Create `miniapp/src/utils/breed-health-risks.ts`:

```ts
const MIXED_BREED_VIRTUAL_ID = '00000000-0000-0000-0000-000000000000'

const ATTENTION_LABELS: Record<string, string> = {
  KEY_ATTENTION: '重点关注',
  RECOMMENDED_AWARENESS: '建议了解',
  SUPPLEMENTAL_AWARENESS: '补充了解',
}

export interface BreedHealthRiskSource {
  sourceType: string
  sourceName: string
  publisher?: string | null
  title: string
  url: string
  accessedAt: string
  note?: string | null
}

export interface BreedHealthRiskItem {
  id: string
  conditionId: string
  conditionName: string
  category: string
  attentionPriority: string
  attentionLabel: string
  oneLineSummary: string
  breedSpecificReason: string
  commonSigns: string[]
  screeningAdvice: string
  careAdvice: string
  sourceCount: number
  sources: BreedHealthRiskSource[]
}

export interface BreedHealthRiskLookup {
  breedId: string
  breedName: string
  risks: BreedHealthRiskItem[]
}

function readData(response: any) {
  return response?.data && response.data.breed ? response.data : response
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(item => readString(item)).filter(Boolean)
    : []
}

export function getBreedHealthAttentionLabel(priority: string) {
  return ATTENTION_LABELS[priority] || ATTENTION_LABELS.SUPPLEMENTAL_AWARENESS
}

export function canRequestBreedHealthRisks(profile: {
  breedId?: string | null
  customBreedName?: string | null
}) {
  const breedId = readString(profile.breedId)
  return Boolean(breedId && breedId !== MIXED_BREED_VIRTUAL_ID && !readString(profile.customBreedName))
}

export function resolveBreedHealthRiskEmptyText(reason: 'mixed' | 'no-data') {
  if (reason === 'mixed') {
    return '混血/手动填写品种暂不展示品种专属资料，可使用品种查询页查看相近标准品种。'
  }

  return '暂未收录该品种的健康关注项，后续会逐步补充。'
}

export function normalizeBreedHealthRiskResponse(response: any): BreedHealthRiskLookup {
  const data = readData(response) || {}
  const breed = data.breed || {}
  const risks = Array.isArray(data.risks) ? data.risks : []

  return {
    breedId: readString(breed.id),
    breedName: readString(breed.name),
    risks: risks.map((risk: any): BreedHealthRiskItem => {
      const attentionPriority = readString(risk.attentionPriority) || 'SUPPLEMENTAL_AWARENESS'
      const sources = Array.isArray(risk.sources) ? risk.sources : []

      return {
        id: readString(risk.id),
        conditionId: readString(risk.conditionId),
        conditionName: readString(risk.conditionName),
        category: readString(risk.category),
        attentionPriority,
        attentionLabel: readString(risk.attentionLabel) || getBreedHealthAttentionLabel(attentionPriority),
        oneLineSummary: readString(risk.oneLineSummary),
        breedSpecificReason: readString(risk.breedSpecificReason),
        commonSigns: readStringArray(risk.commonSigns),
        screeningAdvice: readString(risk.screeningAdvice),
        careAdvice: readString(risk.careAdvice),
        sourceCount: Number(risk.sourceCount) || sources.length,
        sources: sources.map((source: any) => ({
          sourceType: readString(source.sourceType),
          sourceName: readString(source.sourceName),
          publisher: readString(source.publisher) || null,
          title: readString(source.title),
          url: readString(source.url),
          accessedAt: readString(source.accessedAt),
          note: readString(source.note) || null,
        })),
      }
    }),
  }
}
```

- [ ] **Step 5: Run the miniapp tests to verify they pass**

Run:

```bash
cd miniapp && pnpm test -- src/api/dogs.spec.ts src/utils/breed-health-risks.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/api/dogs.ts \
  miniapp/src/api/dogs.spec.ts \
  miniapp/src/utils/breed-health-risks.ts \
  miniapp/src/utils/breed-health-risks.spec.ts
git commit -m "feat: add breed health risk miniapp adapter"
```

### Task 5: Add Reusable Miniapp Risk Section And Health Page Entry

**Files:**
- Create: `miniapp/src/components/dog-profile/BreedHealthRiskSection.vue`
- Modify: `miniapp/src/pages/dog-profile-health/index.vue`
- Modify: `miniapp/src/pages/dog-profile-health.regression.spec.ts`

- [ ] **Step 1: Write failing source-level regression tests**

Append to `miniapp/src/pages/dog-profile-health.regression.spec.ts`:

```ts
  it('loads and renders source-backed breed health risks for standard breeds', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('BreedHealthRiskSection')
    expect(source).toContain('dogApi.breedHealthRisks')
    expect(source).toContain('normalizeBreedHealthRiskResponse')
    expect(source).toContain('canRequestBreedHealthRisks')
    expect(source).toContain('breedHealthRiskLookup.risks')
    expect(source).toContain('loadBreedHealthRisksForProfile')
  })
```

Create `miniapp/src/components/dog-profile/BreedHealthRiskSection.vue` with a minimal stub first:

```vue
<template>
  <view />
</template>
```

This stub lets the first test fail for the missing page integration, not for a missing component file.

- [ ] **Step 2: Run the regression test to verify it fails**

Run:

```bash
cd miniapp && pnpm test -- src/pages/dog-profile-health.regression.spec.ts
```

Expected: FAIL because the health page does not import or render the risk section.

- [ ] **Step 3: Implement the reusable component**

Replace `miniapp/src/components/dog-profile/BreedHealthRiskSection.vue` with:

```vue
<template>
  <view class="section-card breed-risk-card">
    <view class="section-card__header">
      <view>
        <text class="section-card__title">本品种健康关注项</text>
        <text class="section-card__desc">{{ headerDescription }}</text>
      </view>
      <text v-if="showRetry" class="section-link" @tap="$emit('retry')">重试</text>
    </view>

    <view v-if="loading" class="breed-risk-state">
      <text class="breed-risk-state__title">正在加载本品种健康关注项</text>
    </view>

    <view v-else-if="error" class="breed-risk-state">
      <text class="breed-risk-state__title">暂时无法加载</text>
      <text class="breed-risk-state__desc">{{ error }}</text>
    </view>

    <view v-else-if="risks.length === 0" class="breed-risk-state">
      <text class="breed-risk-state__title">暂无可展示内容</text>
      <text class="breed-risk-state__desc">{{ emptyText }}</text>
    </view>

    <view v-else class="breed-risk-list">
      <view
        v-for="risk in risks"
        :key="risk.id"
        class="breed-risk-item"
      >
        <view class="breed-risk-item__summary" @tap="toggleRisk(risk.id)">
          <view>
            <text class="breed-risk-item__label">{{ risk.attentionLabel }}</text>
            <text class="breed-risk-item__name">{{ risk.conditionName }}</text>
          </view>
          <text class="breed-risk-item__source">{{ risk.sourceCount }} 个来源</text>
        </view>
        <text class="breed-risk-item__line">{{ risk.oneLineSummary }}</text>

        <view v-if="expandedRiskId === risk.id" class="breed-risk-detail">
          <view v-if="risk.breedSpecificReason" class="breed-risk-detail__block">
            <text class="breed-risk-detail__title">为什么需要关注</text>
            <text class="breed-risk-detail__text">{{ risk.breedSpecificReason }}</text>
          </view>
          <view v-if="risk.commonSigns.length" class="breed-risk-detail__block">
            <text class="breed-risk-detail__title">常见表现</text>
            <text class="breed-risk-detail__text">{{ risk.commonSigns.join('、') }}</text>
          </view>
          <view v-if="risk.screeningAdvice" class="breed-risk-detail__block">
            <text class="breed-risk-detail__title">建议检查</text>
            <text class="breed-risk-detail__text">{{ risk.screeningAdvice }}</text>
          </view>
          <view v-if="risk.careAdvice" class="breed-risk-detail__block">
            <text class="breed-risk-detail__title">护理/就医提醒</text>
            <text class="breed-risk-detail__text">{{ risk.careAdvice }}</text>
          </view>
          <view class="breed-risk-sources">
            <text class="breed-risk-detail__title">资料来源</text>
            <view
              v-for="source in risk.sources"
              :key="`${risk.id}-${source.sourceType}-${source.url}`"
              class="breed-risk-source"
            >
              <text class="breed-risk-source__name">{{ source.sourceName }}</text>
              <text class="breed-risk-source__title">{{ source.title }}</text>
              <text class="breed-risk-source__meta">{{ source.publisher || source.sourceType }} · {{ source.accessedAt }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="breed-risk-note">
      <text>本页面为品种资料科普，不替代兽医诊断。如有症状，请及时咨询兽医。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BreedHealthRiskItem } from '../../utils/breed-health-risks'

const props = defineProps<{
  breedName?: string
  risks: BreedHealthRiskItem[]
  loading?: boolean
  error?: string
  emptyText: string
}>()

defineEmits<{
  (event: 'retry'): void
}>()

const expandedRiskId = ref('')
const showRetry = computed(() => Boolean(props.error && !props.loading))
const headerDescription = computed(() => {
  if (props.loading) return '正在读取资料来源'
  if (props.breedName && props.risks.length > 0) {
    return `${props.breedName} · 已收录 ${props.risks.length} 个关注项`
  }
  return props.breedName ? `${props.breedName} · 品种资料` : '按品种展示资料来源明确的健康科普'
})

function toggleRisk(riskId: string) {
  expandedRiskId.value = expandedRiskId.value === riskId ? '' : riskId
}
</script>

<style scoped>
.breed-risk-card {
  margin-top: 24rpx;
}

.breed-risk-state {
  padding: 28rpx;
  border-radius: 24rpx;
  background: #f7fbf8;
}

.breed-risk-state__title,
.breed-risk-state__desc,
.breed-risk-item__name,
.breed-risk-item__line,
.breed-risk-detail__text,
.breed-risk-source__title,
.breed-risk-note {
  display: block;
}

.breed-risk-state__title {
  color: #1f2d26;
  font-size: 28rpx;
  font-weight: 700;
}

.breed-risk-state__desc {
  margin-top: 8rpx;
  color: #6c7a72;
  font-size: 24rpx;
  line-height: 1.6;
}

.breed-risk-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.breed-risk-item {
  padding: 24rpx;
  border: 1rpx solid #dce8df;
  border-radius: 24rpx;
  background: #ffffff;
}

.breed-risk-item__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.breed-risk-item__label {
  display: inline-flex;
  margin-bottom: 8rpx;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  background: #e8f6ee;
  color: #167a43;
  font-size: 22rpx;
}

.breed-risk-item__name {
  color: #1f2d26;
  font-size: 30rpx;
  font-weight: 700;
}

.breed-risk-item__source {
  flex-shrink: 0;
  color: #6c7a72;
  font-size: 22rpx;
}

.breed-risk-item__line {
  margin-top: 12rpx;
  color: #516058;
  font-size: 24rpx;
  line-height: 1.6;
}

.breed-risk-detail {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #edf3ef;
}

.breed-risk-detail__block {
  margin-bottom: 18rpx;
}

.breed-risk-detail__title {
  display: block;
  margin-bottom: 8rpx;
  color: #1f2d26;
  font-size: 24rpx;
  font-weight: 700;
}

.breed-risk-detail__text {
  color: #516058;
  font-size: 24rpx;
  line-height: 1.6;
}

.breed-risk-source {
  margin-top: 12rpx;
  padding: 16rpx;
  border-radius: 18rpx;
  background: #f7fbf8;
}

.breed-risk-source__name {
  display: block;
  color: #167a43;
  font-size: 24rpx;
  font-weight: 700;
}

.breed-risk-source__title,
.breed-risk-source__meta {
  margin-top: 6rpx;
  color: #516058;
  font-size: 22rpx;
  line-height: 1.5;
}

.breed-risk-note {
  margin-top: 20rpx;
  color: #7b8a82;
  font-size: 22rpx;
  line-height: 1.6;
}
</style>
```

- [ ] **Step 4: Integrate the component into the health page**

Modify `miniapp/src/pages/dog-profile-health/index.vue`.

Add the component after the selected dog loading block and before `<HealthRecordsSection ...>`:

```vue
        <BreedHealthRiskSection
          :breed-name="breedHealthRiskLookup.breedName || form.breedName || form.customBreedName"
          :risks="breedHealthRiskLookup.risks"
          :loading="isBreedHealthRiskLoading"
          :error="breedHealthRiskError"
          :empty-text="breedHealthRiskEmptyText"
          @retry="loadBreedHealthRisksForProfile(latestRequestedDogId || dogId)"
        />
```

Add imports:

```ts
import BreedHealthRiskSection from '../../components/dog-profile/BreedHealthRiskSection.vue'
import {
  canRequestBreedHealthRisks,
  normalizeBreedHealthRiskResponse,
  resolveBreedHealthRiskEmptyText,
  type BreedHealthRiskLookup,
} from '../../utils/breed-health-risks'
```

Add state near `savedPickyFoods`:

```ts
const breedHealthRiskLookup = reactive<BreedHealthRiskLookup>({
  breedId: '',
  breedName: '',
  risks: [],
})
const isBreedHealthRiskLoading = ref(false)
const breedHealthRiskError = ref('')
```

Add this computed near `dietReminderStatusText`:

```ts
const breedHealthRiskEmptyText = computed(() =>
  canRequestBreedHealthRisks(form)
    ? resolveBreedHealthRiskEmptyText('no-data')
    : resolveBreedHealthRiskEmptyText('mixed'),
)
```

Add this reset logic inside `resetHealthForm()`:

```ts
  breedHealthRiskLookup.breedId = ''
  breedHealthRiskLookup.breedName = ''
  breedHealthRiskLookup.risks = []
  isBreedHealthRiskLoading.value = false
  breedHealthRiskError.value = ''
```

Call risk loading at the end of `populateForm(res.data.profile)` inside `loadDogProfile()`:

```ts
    populateForm(res.data.profile)
    void loadBreedHealthRisksForProfile(requestedDogId)
```

Add this function before `recordApiForType`:

```ts
async function loadBreedHealthRisksForProfile(requestedDogId: string) {
  if (!requestedDogId || shouldDiscardDogHealthProfileResponse({
    requestedDogId,
    latestRequestedDogId: latestRequestedDogId.value,
  })) {
    return
  }

  if (!canRequestBreedHealthRisks(form)) {
    breedHealthRiskLookup.breedId = ''
    breedHealthRiskLookup.breedName = form.customBreedName || form.breedName || ''
    breedHealthRiskLookup.risks = []
    breedHealthRiskError.value = ''
    isBreedHealthRiskLoading.value = false
    return
  }

  const targetBreedId = String(form.breedId || '')
  isBreedHealthRiskLoading.value = true
  breedHealthRiskError.value = ''

  try {
    const res: any = await dogApi.breedHealthRisks(targetBreedId)
    if (shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      return
    }

    if (res.code !== 0) {
      throw new Error(res.message || '加载本品种健康关注项失败')
    }

    const normalized = normalizeBreedHealthRiskResponse(res)
    breedHealthRiskLookup.breedId = normalized.breedId
    breedHealthRiskLookup.breedName = normalized.breedName
    breedHealthRiskLookup.risks = normalized.risks
  } catch (error: any) {
    if (shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      return
    }

    breedHealthRiskLookup.breedId = targetBreedId
    breedHealthRiskLookup.breedName = form.breedName || ''
    breedHealthRiskLookup.risks = []
    breedHealthRiskError.value = error?.message || '加载本品种健康关注项失败'
  } finally {
    if (!shouldDiscardDogHealthProfileResponse({
      requestedDogId,
      latestRequestedDogId: latestRequestedDogId.value,
    })) {
      isBreedHealthRiskLoading.value = false
    }
  }
}
```

- [ ] **Step 5: Run the health page regression test**

Run:

```bash
cd miniapp && pnpm test -- src/pages/dog-profile-health.regression.spec.ts src/utils/breed-health-risks.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/components/dog-profile/BreedHealthRiskSection.vue \
  miniapp/src/pages/dog-profile-health/index.vue \
  miniapp/src/pages/dog-profile-health.regression.spec.ts
git commit -m "feat: show breed health risks on health page"
```

### Task 6: Add Standalone Breed Health Risk Lookup Page

**Files:**
- Create: `miniapp/src/pages/breed-health-risk-lookup/index.vue`
- Modify: `miniapp/src/pages.json`
- Create: `miniapp/src/pages/breed-health-risk-lookup.regression.spec.ts`

- [ ] **Step 1: Write the failing page regression test**

Create `miniapp/src/pages/breed-health-risk-lookup.regression.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('breed health risk lookup page regressions', () => {
  it('registers a standalone breed health risk lookup page', () => {
    const pagesJson = readFileSync(resolve(process.cwd(), 'src/pages.json'), 'utf-8')

    expect(pagesJson).toContain('pages/breed-health-risk-lookup/index')
    expect(pagesJson).toContain('品种疾病风险查询')
  })

  it('uses breed search and the shared risk section', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/breed-health-risk-lookup/index.vue'),
      'utf-8',
    )

    expect(source).toContain('filterBreedsByKeyword')
    expect(source).toContain('dogApi.breeds()')
    expect(source).toContain('dogApi.breedHealthRisks')
    expect(source).toContain('BreedHealthRiskSection')
    expect(source).toContain('normalizeBreedHealthRiskResponse')
  })
})
```

- [ ] **Step 2: Run the page regression test to verify it fails**

Run:

```bash
cd miniapp && pnpm test -- src/pages/breed-health-risk-lookup.regression.spec.ts
```

Expected: FAIL because the page is not registered and the page file does not exist.

- [ ] **Step 3: Register the page**

Modify `miniapp/src/pages.json` by adding this page after the health page entry:

```json
    {
      "path": "pages/breed-health-risk-lookup/index",
      "style": {
        "navigationBarTitleText": "品种疾病风险查询"
      }
    },
```

- [ ] **Step 4: Implement the lookup page**

Create `miniapp/src/pages/breed-health-risk-lookup/index.vue`:

```vue
<template>
  <view class="page">
    <view class="hero-card">
      <text class="hero-card__eyebrow">品种资料</text>
      <text class="hero-card__title">品种疾病风险查询</text>
      <text class="hero-card__subtitle">按标准品种查看资料来源明确的健康关注项。</text>
    </view>

    <view class="section-card">
      <text class="section-card__title">选择品种</text>
      <view class="search-field">
        <text class="search-field__icon">🔍</text>
        <input
          class="field-input field-input--search"
          type="text"
          placeholder="搜索品种名称"
          v-model="breedSearchKeyword"
        />
      </view>

      <view v-if="isBreedListLoading" class="lookup-state">
        <text class="lookup-state__title">正在加载品种列表</text>
      </view>

      <view v-else-if="breedListError" class="lookup-state">
        <text class="lookup-state__title">加载失败</text>
        <text class="lookup-state__desc">{{ breedListError }}</text>
        <button class="lookup-state__button" @tap="loadBreeds">重试</button>
      </view>

      <view v-else class="breed-list">
        <view
          v-for="breed in displayedBreeds"
          :key="breed.id"
          class="breed-chip"
          :class="{ 'breed-chip--active': selectedBreed?.id === breed.id }"
          @tap="selectBreed(breed)"
        >
          <text class="breed-chip__name">{{ breed.name }}</text>
        </view>
      </view>
    </view>

    <BreedHealthRiskSection
      :breed-name="selectedBreed?.name || breedHealthRiskLookup.breedName"
      :risks="breedHealthRiskLookup.risks"
      :loading="isRiskLoading"
      :error="riskError"
      :empty-text="riskEmptyText"
      @retry="selectedBreed && loadBreedHealthRisks(selectedBreed)"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import BreedHealthRiskSection from '../../components/dog-profile/BreedHealthRiskSection.vue'
import { dogApi } from '../../api/dogs'
import { filterBreedsByKeyword } from '../../utils/dog-breed-search'
import {
  normalizeBreedHealthRiskResponse,
  resolveBreedHealthRiskEmptyText,
  type BreedHealthRiskLookup,
} from '../../utils/breed-health-risks'

interface DogBreedItem {
  id: string
  name: string
  aliases?: string[]
  sizeCategory?: string | null
  isCommon?: boolean
}

const breeds = ref<DogBreedItem[]>([])
const selectedBreed = ref<DogBreedItem | null>(null)
const breedSearchKeyword = ref('')
const isBreedListLoading = ref(false)
const breedListError = ref('')
const isRiskLoading = ref(false)
const riskError = ref('')
const breedHealthRiskLookup = reactive<BreedHealthRiskLookup>({
  breedId: '',
  breedName: '',
  risks: [],
})

const displayedBreeds = computed(() => {
  const keyword = breedSearchKeyword.value.trim()
  if (keyword) {
    return filterBreedsByKeyword(breeds.value, keyword).slice(0, 16)
  }

  return breeds.value.slice(0, 16)
})
const riskEmptyText = computed(() => (
  selectedBreed.value
    ? resolveBreedHealthRiskEmptyText('no-data')
    : '请选择一个标准品种后查看健康关注项。'
))

onLoad(() => {
  void loadBreeds()
})

async function loadBreeds() {
  isBreedListLoading.value = true
  breedListError.value = ''

  try {
    const res: any = await dogApi.breeds()
    if (res.code !== 0 || !Array.isArray(res.data)) {
      throw new Error(res.message || '加载品种列表失败')
    }

    breeds.value = res.data
  } catch (error: any) {
    breedListError.value = error?.message || '加载品种列表失败'
  } finally {
    isBreedListLoading.value = false
  }
}

function selectBreed(breed: DogBreedItem) {
  selectedBreed.value = breed
  breedSearchKeyword.value = breed.name
  void loadBreedHealthRisks(breed)
}

async function loadBreedHealthRisks(breed: DogBreedItem) {
  isRiskLoading.value = true
  riskError.value = ''
  breedHealthRiskLookup.breedId = breed.id
  breedHealthRiskLookup.breedName = breed.name
  breedHealthRiskLookup.risks = []

  try {
    const res: any = await dogApi.breedHealthRisks(breed.id)
    if (res.code !== 0) {
      throw new Error(res.message || '加载本品种健康关注项失败')
    }

    const normalized = normalizeBreedHealthRiskResponse(res)
    breedHealthRiskLookup.breedId = normalized.breedId
    breedHealthRiskLookup.breedName = normalized.breedName || breed.name
    breedHealthRiskLookup.risks = normalized.risks
  } catch (error: any) {
    riskError.value = error?.message || '加载本品种健康关注项失败'
  } finally {
    isRiskLoading.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background:
    radial-gradient(circle at top right, rgba(7, 193, 96, 0.14), transparent 24%),
    linear-gradient(180deg, #f4faf7 0%, #eef5f1 100%);
}

.hero-card,
.section-card {
  border-radius: 34rpx;
  background: #ffffff;
  box-shadow: 0 18rpx 42rpx rgba(23, 71, 45, 0.08);
}

.hero-card {
  padding: 32rpx;
  color: #ffffff;
  background: linear-gradient(135deg, #19a65a 0%, #167a43 100%);
}

.hero-card__eyebrow,
.hero-card__title,
.hero-card__subtitle,
.section-card__title,
.lookup-state__title,
.lookup-state__desc,
.breed-chip__name {
  display: block;
}

.hero-card__eyebrow {
  font-size: 22rpx;
  opacity: 0.84;
}

.hero-card__title {
  margin-top: 10rpx;
  font-size: 40rpx;
  font-weight: 800;
}

.hero-card__subtitle {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  opacity: 0.9;
}

.section-card {
  margin-top: 24rpx;
  padding: 28rpx;
}

.section-card__title {
  margin-bottom: 18rpx;
  color: #1f2d26;
  font-size: 30rpx;
  font-weight: 800;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 0 20rpx;
  border-radius: 22rpx;
  background: #f4faf7;
}

.search-field__icon {
  color: #6c7a72;
  font-size: 26rpx;
}

.field-input {
  min-height: 84rpx;
  flex: 1;
  color: #1f2d26;
  font-size: 28rpx;
}

.lookup-state {
  margin-top: 20rpx;
  padding: 24rpx;
  border-radius: 22rpx;
  background: #f7fbf8;
}

.lookup-state__title {
  color: #1f2d26;
  font-size: 26rpx;
  font-weight: 700;
}

.lookup-state__desc {
  margin-top: 8rpx;
  color: #6c7a72;
  font-size: 24rpx;
}

.lookup-state__button {
  margin-top: 18rpx;
  background: #19a65a;
  color: #ffffff;
}

.breed-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 20rpx;
}

.breed-chip {
  max-width: 100%;
  padding: 16rpx 22rpx;
  border: 1rpx solid #dce8df;
  border-radius: 999rpx;
  background: #ffffff;
}

.breed-chip--active {
  border-color: #19a65a;
  background: #e8f6ee;
}

.breed-chip__name {
  color: #1f2d26;
  font-size: 24rpx;
}
</style>
```

- [ ] **Step 5: Run the lookup regression test**

Run:

```bash
cd miniapp && pnpm test -- src/pages/breed-health-risk-lookup.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniapp/src/pages/breed-health-risk-lookup/index.vue \
  miniapp/src/pages.json \
  miniapp/src/pages/breed-health-risk-lookup.regression.spec.ts
git commit -m "feat: add breed health risk lookup page"
```

### Task 7: Seed Validation And Final Verification

**Files:**
- Create: `backend/scripts/validate-breed-health-risk-sources.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Add a source validation script**

Create `backend/scripts/validate-breed-health-risk-sources.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const publishedWithoutSources = await prisma.breedHealthRisk.findMany({
    where: {
      isPublished: true,
      sources: { none: {} },
    },
    select: {
      id: true,
      breedId: true,
      conditionId: true,
    },
  });

  if (publishedWithoutSources.length > 0) {
    console.error('[breed-health-risk] Published risks without sources:', publishedWithoutSources);
    process.exit(1);
  }

  console.log('[breed-health-risk] Published risk source validation passed');
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

Modify `backend/package.json` scripts:

```json
    "validate:breed-health-risk-sources": "ts-node -r tsconfig-paths/register scripts/validate-breed-health-risk-sources.ts",
```

- [ ] **Step 2: Run backend targeted verification**

Run:

```bash
cd backend && npm test -- --runInBand \
  tests/domain/dog/breed-health-risk.entity.spec.ts \
  tests/infrastructure/repositories/prisma-breed-health-risk.repository.spec.ts \
  tests/interfaces/controllers/dogs.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run miniapp targeted verification**

Run:

```bash
cd miniapp && pnpm test -- \
  src/api/dogs.spec.ts \
  src/utils/breed-health-risks.spec.ts \
  src/pages/dog-profile-health.regression.spec.ts \
  src/pages/breed-health-risk-lookup.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Run miniapp build verification**

Run:

```bash
cd miniapp && npm run build:mp-weixin
```

Expected: PASS. After this succeeds, tell the user to open this directory in WeChat DevTools:

```text
/Users/zhaochen/Documents/SevenKitchen/miniapp/dist/build/mp-weixin
```

- [ ] **Step 5: Check for accidental diagnostic wording**

Run:

```bash
rg -n "你的狗高风险|一定会得|高风险疾病诊断|权威风险等级" backend/src miniapp/src
```

Expected: no matches.

- [ ] **Step 6: Commit verification support**

```bash
git add backend/scripts/validate-breed-health-risk-sources.ts backend/package.json
git commit -m "chore: validate breed health risk sources"
```

## Self-Review

Spec coverage:

- Backend-owned knowledge base: covered by Tasks 1-3 and Task 7.
- Three data groups: covered by Task 2 schema and repository.
- Source-backed published content: covered by Task 2 repository filter and Task 7 validation.
- Existing dog health page entry: covered by Task 5.
- Standalone lookup page: covered by Task 6.
- Progressive disclosure: covered by Task 5 component.
- Wording that avoids diagnosis and universal risk scoring: covered by Tasks 4-7.
- No one-click health record creation or reminders: absent from all tasks.

Placeholder scan:

- No task asks an engineer to invent missing behavior.
- All new public functions, providers, endpoints, and files are named before use.
- Every implementation step includes exact paths and concrete code.

Type consistency:

- Backend uses `BreedHealthAttentionPriority`, `BreedHealthRiskSourceType`, and `BreedHealthRiskRepository` consistently across domain, repository, service, and tests.
- Miniapp uses `BreedHealthRiskLookup` and `BreedHealthRiskItem` consistently across API helpers, component props, and pages.
