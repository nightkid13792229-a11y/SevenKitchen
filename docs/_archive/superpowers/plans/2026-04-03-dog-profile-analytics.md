# Dog Profile Analytics Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture dog-profile create and edit funnel events from the miniapp, persist them in the backend, and expose aggregated metrics in the admin dashboard.

**Architecture:** Add a focused `dog_profile_event` persistence model, a backend analytics service with one miniapp ingest endpoint plus one admin aggregation endpoint, then instrument the new dog-profile pages to emit lifecycle events and render the aggregated funnel data in a new admin-web analytics view.

**Tech Stack:** NestJS, Prisma, Jest, uni-app Vue 3 + TypeScript, Vitest, Vue 3 + Element Plus admin-web

---

## Scope and Execution Order

Run this plan **after** `docs/superpowers/plans/2026-04-03-wechat-miniapp-dog-profile-flow.md`.

This analytics plan assumes the following pages exist:

- `miniapp/src/pages/dog-create/index.vue`
- `miniapp/src/pages/dog-profile-overview/index.vue`
- `miniapp/src/pages/dog-profile-basic/index.vue`
- `miniapp/src/pages/dog-profile-feeding/index.vue`
- `miniapp/src/pages/dog-profile-health/index.vue`

If the flow refactor has not landed yet, complete that plan first so the event names and route mapping stay stable.

## File Structure

### Backend analytics persistence and APIs

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403190000_add_dog_profile_event/migration.sql`
- Create: `backend/src/application/analytics/dog-profile-analytics.service.ts`
- Create: `backend/src/interfaces/dto/analytics/track-dog-profile-event.dto.ts`
- Create: `backend/src/interfaces/dto/analytics/dog-profile-analytics-response.dto.ts`
- Create: `backend/src/interfaces/controllers/dog-profile-analytics.controller.ts`
- Create: `backend/src/interfaces/controllers/admin-dog-profile-analytics.controller.ts`
- Modify: `backend/src/app.module.ts`

### Backend tests

- Create: `backend/tests/application/analytics/dog-profile-analytics.service.spec.ts`
- Create: `backend/tests/interfaces/controllers/dog-profile-analytics.controller.spec.ts`
- Create: `backend/tests/interfaces/controllers/admin-dog-profile-analytics.controller.spec.ts`

### Miniapp event emission

- Create: `miniapp/src/api/analytics.ts`
- Create: `miniapp/src/utils/dog-profile-analytics.ts`
- Create: `miniapp/src/utils/dog-profile-analytics.spec.ts`
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/pages/dog-profile-overview/index.vue`
- Modify: `miniapp/src/pages/dog-profile-basic/index.vue`
- Modify: `miniapp/src/pages/dog-profile-feeding/index.vue`
- Modify: `miniapp/src/pages/dog-profile-health/index.vue`

### Admin dashboard view

- Create: `admin-web/src/api/analytics.ts`
- Create: `admin-web/src/types/analytics.ts`
- Create: `admin-web/src/views/Analytics/DogProfileAnalytics.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

## Task 1: Add Backend Event Persistence and Aggregation Service

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260403190000_add_dog_profile_event/migration.sql`
- Create: `backend/src/application/analytics/dog-profile-analytics.service.ts`
- Create: `backend/tests/application/analytics/dog-profile-analytics.service.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the failing analytics service test**

```ts
// backend/tests/application/analytics/dog-profile-analytics.service.spec.ts
import { DogProfileAnalyticsService } from 'src/application/analytics/dog-profile-analytics.service'

describe('DogProfileAnalyticsService', () => {
  const prisma = {
    dogProfileEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as any

  let service: DogProfileAnalyticsService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new DogProfileAnalyticsService(prisma)
  })

  it('stores one dog-profile event row with normalized nullable fields', async () => {
    prisma.dogProfileEvent.create.mockResolvedValue({ id: 'evt-1' })

    await service.track({
      customerId: 'customer-a',
      eventName: 'dog_profile_create_started',
      mode: 'create',
      dogId: null,
      stepName: 'basic_info',
      moduleName: null,
      entrySource: 'dog_list',
      hasDraft: false,
      calcStatus: null,
      submitStatus: null,
      properties: { route: '/pages/dog-create/index' },
    })

    expect(prisma.dogProfileEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'customer-a',
        eventName: 'dog_profile_create_started',
        mode: 'create',
        entrySource: 'dog_list',
        stepName: 'basic_info',
      }),
    })
  })

  it('builds funnel counts from a time window', async () => {
    prisma.dogProfileEvent.findMany.mockResolvedValue([
      { eventName: 'dog_profile_create_started', createdAt: new Date('2026-04-03T08:00:00Z') },
      { eventName: 'dog_profile_step_completed', stepName: 'basic_info', createdAt: new Date('2026-04-03T08:01:00Z') },
      { eventName: 'dog_profile_calc_succeeded', createdAt: new Date('2026-04-03T08:02:00Z') },
      { eventName: 'dog_profile_submit_succeeded', createdAt: new Date('2026-04-03T08:03:00Z') },
    ])

    await expect(
      service.getSummary({
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-04T00:00:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        createFunnel: expect.objectContaining({
          started: 1,
          basicCompleted: 1,
          recommendationSucceeded: 1,
          submitted: 1,
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `cd backend && npm test -- backend/tests/application/analytics/dog-profile-analytics.service.spec.ts --runInBand`

Expected: FAIL with missing-module errors for `dog-profile-analytics.service` or Prisma model/type errors for `dogProfileEvent`.

- [ ] **Step 3: Add the Prisma model, migration, service, and module registration**

```prisma
// backend/prisma/schema.prisma
model DogProfileEvent {
  id           String   @id @default(uuid())
  customerId   String   @map("customer_id")
  dogId        String?  @map("dog_id")
  eventName    String   @map("event_name")
  mode         String
  entrySource  String?  @map("entry_source")
  stepName     String?  @map("step_name")
  moduleName   String?  @map("module_name")
  hasDraft     Boolean? @map("has_draft")
  calcStatus   String?  @map("calc_status")
  submitStatus String?  @map("submit_status")
  properties   Json?
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([eventName, createdAt])
  @@index([customerId, createdAt])
  @@index([dogId, createdAt])
  @@map("dog_profile_event")
}
```

```sql
-- backend/prisma/migrations/20260403190000_add_dog_profile_event/migration.sql
CREATE TABLE "dog_profile_event" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "dog_id" TEXT,
  "event_name" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "entry_source" TEXT,
  "step_name" TEXT,
  "module_name" TEXT,
  "has_draft" BOOLEAN,
  "calc_status" TEXT,
  "submit_status" TEXT,
  "properties" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dog_profile_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dog_profile_event_event_name_created_at_idx"
ON "dog_profile_event"("event_name", "created_at");

CREATE INDEX "dog_profile_event_customer_id_created_at_idx"
ON "dog_profile_event"("customer_id", "created_at");

CREATE INDEX "dog_profile_event_dog_id_created_at_idx"
ON "dog_profile_event"("dog_id", "created_at");
```

```ts
// backend/src/application/analytics/dog-profile-analytics.service.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../infrastructure/prisma.service'

export interface TrackDogProfileEventInput {
  customerId: string
  dogId?: string | null
  eventName: string
  mode: 'create' | 'edit'
  entrySource?: string | null
  stepName?: string | null
  moduleName?: string | null
  hasDraft?: boolean | null
  calcStatus?: string | null
  submitStatus?: string | null
  properties?: Record<string, any> | null
}

@Injectable()
export class DogProfileAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(input: TrackDogProfileEventInput) {
    return this.prisma.dogProfileEvent.create({
      data: {
        customerId: input.customerId,
        dogId: input.dogId ?? null,
        eventName: input.eventName,
        mode: input.mode,
        entrySource: input.entrySource ?? null,
        stepName: input.stepName ?? null,
        moduleName: input.moduleName ?? null,
        hasDraft: input.hasDraft ?? null,
        calcStatus: input.calcStatus ?? null,
        submitStatus: input.submitStatus ?? null,
        properties: input.properties ?? null,
      },
    })
  }

  async getSummary({ from, to }: { from: string; to: string }) {
    const rows = await this.prisma.dogProfileEvent.findMany({
      where: {
        createdAt: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return {
      createFunnel: {
        started: rows.filter((row) => row.eventName === 'dog_profile_create_started').length,
        basicCompleted: rows.filter(
          (row) => row.eventName === 'dog_profile_step_completed' && row.stepName === 'basic_info',
        ).length,
        recommendationSucceeded: rows.filter(
          (row) => row.eventName === 'dog_profile_calc_succeeded',
        ).length,
        submitted: rows.filter(
          (row) => row.eventName === 'dog_profile_submit_succeeded' && row.mode === 'create',
        ).length,
      },
      editFunnel: {
        moduleOpened: rows.filter((row) => row.eventName === 'dog_profile_edit_module_opened').length,
        calcSucceeded: rows.filter((row) => row.eventName === 'dog_profile_calc_succeeded' && row.mode === 'edit').length,
        saved: rows.filter((row) => row.eventName === 'dog_profile_submit_succeeded' && row.mode === 'edit').length,
      },
      riskSignals: {
        draftRestored: rows.filter((row) => row.eventName === 'dog_profile_draft_restored').length,
        calcFailed: rows.filter((row) => row.eventName === 'dog_profile_calc_failed').length,
        submitFailed: rows.filter((row) => row.eventName === 'dog_profile_submit_failed').length,
        healthSkipped: rows.filter((row) => row.eventName === 'dog_profile_health_skipped').length,
      },
    }
  }
}
```

```ts
// backend/src/app.module.ts
import { DogProfileAnalyticsService } from './application/analytics/dog-profile-analytics.service'

@Module({
  providers: [
    DogProfileAnalyticsService,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Run the service test and ensure it passes**

Run: `cd backend && npm test -- backend/tests/application/analytics/dog-profile-analytics.service.spec.ts --runInBand`

Expected: PASS with both analytics service assertions green.

- [ ] **Step 5: Commit the analytics persistence layer**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260403190000_add_dog_profile_event/migration.sql backend/src/application/analytics/dog-profile-analytics.service.ts backend/src/app.module.ts backend/tests/application/analytics/dog-profile-analytics.service.spec.ts
git commit -m "feat: add dog profile analytics storage"
```

## Task 2: Expose Miniapp Tracking and Admin Summary Endpoints

**Files:**
- Create: `backend/src/interfaces/dto/analytics/track-dog-profile-event.dto.ts`
- Create: `backend/src/interfaces/dto/analytics/dog-profile-analytics-response.dto.ts`
- Create: `backend/src/interfaces/controllers/dog-profile-analytics.controller.ts`
- Create: `backend/src/interfaces/controllers/admin-dog-profile-analytics.controller.ts`
- Modify: `backend/src/app.module.ts`
- Create: `backend/tests/interfaces/controllers/dog-profile-analytics.controller.spec.ts`
- Create: `backend/tests/interfaces/controllers/admin-dog-profile-analytics.controller.spec.ts`

- [ ] **Step 1: Write the failing controller tests**

```ts
// backend/tests/interfaces/controllers/dog-profile-analytics.controller.spec.ts
import { Test } from '@nestjs/testing'
import { DogProfileAnalyticsController } from 'src/interfaces/controllers/dog-profile-analytics.controller'
import { DogProfileAnalyticsService } from 'src/application/analytics/dog-profile-analytics.service'

describe('DogProfileAnalyticsController', () => {
  it('forwards one track request to the analytics service', async () => {
    const track = jest.fn().mockResolvedValue({ id: 'evt-1' })
    const moduleRef = await Test.createTestingModule({
      controllers: [DogProfileAnalyticsController],
      providers: [{ provide: DogProfileAnalyticsService, useValue: { track } }],
    }).compile()

    const controller = moduleRef.get(DogProfileAnalyticsController)

    await controller.trackEvent(
      {
        eventName: 'dog_profile_create_started',
        mode: 'create',
        entrySource: 'dog_list',
        stepName: 'basic_info',
      } as any,
      { customerId: 'customer-a' } as any,
    )

    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-a',
        eventName: 'dog_profile_create_started',
      }),
    )
  })
})
```

```ts
// backend/tests/interfaces/controllers/admin-dog-profile-analytics.controller.spec.ts
import { Test } from '@nestjs/testing'
import { AdminDogProfileAnalyticsController } from 'src/interfaces/controllers/admin-dog-profile-analytics.controller'
import { DogProfileAnalyticsService } from 'src/application/analytics/dog-profile-analytics.service'

describe('AdminDogProfileAnalyticsController', () => {
  it('returns the analytics summary for a requested date range', async () => {
    const getSummary = jest.fn().mockResolvedValue({
      createFunnel: { started: 10, basicCompleted: 8, recommendationSucceeded: 6, submitted: 5 },
      editFunnel: { moduleOpened: 7, calcSucceeded: 5, saved: 4 },
      riskSignals: { draftRestored: 2, calcFailed: 1, submitFailed: 1, healthSkipped: 3 },
    })

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminDogProfileAnalyticsController],
      providers: [{ provide: DogProfileAnalyticsService, useValue: { getSummary } }],
    }).compile()

    const controller = moduleRef.get(AdminDogProfileAnalyticsController)
    await expect(
      controller.getSummary('2026-04-01T00:00:00.000Z', '2026-04-07T00:00:00.000Z'),
    ).resolves.toEqual(
      expect.objectContaining({
        createFunnel: expect.objectContaining({ started: 10 }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run the controller tests to verify they fail**

Run: `cd backend && npm test -- backend/tests/interfaces/controllers/dog-profile-analytics.controller.spec.ts backend/tests/interfaces/controllers/admin-dog-profile-analytics.controller.spec.ts --runInBand`

Expected: FAIL with missing-controller or missing-DTO module errors.

- [ ] **Step 3: Add DTOs, controllers, and controller registration**

```ts
// backend/src/interfaces/dto/analytics/track-dog-profile-event.dto.ts
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator'

export class TrackDogProfileEventDto {
  @IsString()
  eventName!: string

  @IsIn(['create', 'edit'])
  mode!: 'create' | 'edit'

  @IsOptional()
  @IsString()
  dogId?: string

  @IsOptional()
  @IsString()
  entrySource?: string

  @IsOptional()
  @IsString()
  stepName?: string

  @IsOptional()
  @IsString()
  moduleName?: string

  @IsOptional()
  @IsBoolean()
  hasDraft?: boolean

  @IsOptional()
  @IsString()
  calcStatus?: string

  @IsOptional()
  @IsString()
  submitStatus?: string

  @IsOptional()
  @IsObject()
  properties?: Record<string, any>
}
```

```ts
// backend/src/interfaces/dto/analytics/dog-profile-analytics-response.dto.ts
export interface DogProfileAnalyticsSummaryDto {
  createFunnel: {
    started: number
    basicCompleted: number
    recommendationSucceeded: number
    submitted: number
  }
  editFunnel: {
    moduleOpened: number
    calcSucceeded: number
    saved: number
  }
  riskSignals: {
    draftRestored: number
    calcFailed: number
    submitFailed: number
    healthSkipped: number
  }
}
```

```ts
// backend/src/interfaces/controllers/dog-profile-analytics.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { CurrentUser, type RequestUser } from '../auth'
import { AuthGuard } from '../auth/auth.guard'
import { ApiResponseDto } from '../dto/common/response.dto'
import { TrackDogProfileEventDto } from '../dto/analytics/track-dog-profile-event.dto'
import { DogProfileAnalyticsService } from '../../application/analytics/dog-profile-analytics.service'

@ApiTags('DogProfileAnalytics')
@Controller('api/v1/analytics/dog-profile')
export class DogProfileAnalyticsController {
  constructor(private readonly analyticsService: DogProfileAnalyticsService) {}

  @Post('events')
  @UseGuards(AuthGuard)
  async trackEvent(
    @Body() dto: TrackDogProfileEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.analyticsService.track({
      customerId: user.customerId,
      ...dto,
    })
    return ApiResponseDto.success({ ok: true })
  }
}
```

```ts
// backend/src/interfaces/controllers/admin-dog-profile-analytics.controller.ts
import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ApiResponseDto } from '../dto/common/response.dto'
import { DogProfileAnalyticsService } from '../../application/analytics/dog-profile-analytics.service'

@ApiTags('AdminDogProfileAnalytics')
@Controller('api/v1/admin/analytics/dog-profile')
export class AdminDogProfileAnalyticsController {
  constructor(private readonly analyticsService: DogProfileAnalyticsService) {}

  @Get()
  async getSummary(@Query('from') from: string, @Query('to') to: string) {
    const summary = await this.analyticsService.getSummary({ from, to })
    return ApiResponseDto.success(summary)
  }
}
```

```ts
// backend/src/app.module.ts
import { DogProfileAnalyticsController } from './interfaces/controllers/dog-profile-analytics.controller'
import { AdminDogProfileAnalyticsController } from './interfaces/controllers/admin-dog-profile-analytics.controller'

@Module({
  controllers: [
    DogProfileAnalyticsController,
    AdminDogProfileAnalyticsController,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Run controller tests and a backend type-safe test pass**

Run: `cd backend && npm test -- backend/tests/interfaces/controllers/dog-profile-analytics.controller.spec.ts backend/tests/interfaces/controllers/admin-dog-profile-analytics.controller.spec.ts --runInBand`

Expected: PASS with both controller specs green.

- [ ] **Step 5: Commit the analytics endpoints**

```bash
git add backend/src/interfaces/dto/analytics/track-dog-profile-event.dto.ts backend/src/interfaces/dto/analytics/dog-profile-analytics-response.dto.ts backend/src/interfaces/controllers/dog-profile-analytics.controller.ts backend/src/interfaces/controllers/admin-dog-profile-analytics.controller.ts backend/src/app.module.ts backend/tests/interfaces/controllers/dog-profile-analytics.controller.spec.ts backend/tests/interfaces/controllers/admin-dog-profile-analytics.controller.spec.ts
git commit -m "feat: expose dog profile analytics endpoints"
```

## Task 3: Instrument the Miniapp Dog-Profile Pages with Stable Event Emission

**Files:**
- Create: `miniapp/src/api/analytics.ts`
- Create: `miniapp/src/utils/dog-profile-analytics.ts`
- Create: `miniapp/src/utils/dog-profile-analytics.spec.ts`
- Modify: `miniapp/src/pages/dog-create/index.vue`
- Modify: `miniapp/src/pages/dog-profile-overview/index.vue`
- Modify: `miniapp/src/pages/dog-profile-basic/index.vue`
- Modify: `miniapp/src/pages/dog-profile-feeding/index.vue`
- Modify: `miniapp/src/pages/dog-profile-health/index.vue`

- [ ] **Step 1: Write the failing miniapp analytics helper test**

```ts
// miniapp/src/utils/dog-profile-analytics.spec.ts
import { describe, expect, it } from 'vitest'
import { buildDogProfileEventPayload } from './dog-profile-analytics'

describe('dog-profile-analytics', () => {
  it('builds a stable payload for feeding edit calc success', () => {
    expect(
      buildDogProfileEventPayload('dog_profile_calc_succeeded', {
        mode: 'edit',
        dogId: 'dog-1',
        moduleName: 'feeding_info',
        calcStatus: 'success',
      }),
    ).toEqual({
      eventName: 'dog_profile_calc_succeeded',
      mode: 'edit',
      dogId: 'dog-1',
      moduleName: 'feeding_info',
      calcStatus: 'success',
    })
  })
})
```

- [ ] **Step 2: Run the miniapp analytics helper test and verify it fails**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-analytics.spec.ts`

Expected: FAIL with missing-module errors for `dog-profile-analytics`.

- [ ] **Step 3: Add the analytics API wrapper, helper, and page instrumentation**

```ts
// miniapp/src/api/analytics.ts
import { request } from '../utils/api'

export const analyticsApi = {
  trackDogProfileEvent: (data: Record<string, any>) =>
    request({
      url: '/analytics/dog-profile/events',
      method: 'POST',
      data,
    }),
}
```

```ts
// miniapp/src/utils/dog-profile-analytics.ts
import { analyticsApi } from '../api/analytics'

export function buildDogProfileEventPayload(
  eventName: string,
  payload: Record<string, any>,
) {
  return {
    eventName,
    ...payload,
  }
}

export async function trackDogProfileEvent(
  eventName: string,
  payload: Record<string, any>,
) {
  try {
    await analyticsApi.trackDogProfileEvent(buildDogProfileEventPayload(eventName, payload))
  } catch (error) {
    console.warn('[DogProfileAnalytics] track failed', eventName, error)
  }
}
```

```vue
<!-- add excerpts to miniapp/src/pages/dog-create/index.vue -->
<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'

onLoad(() => {
  void trackDogProfileEvent('dog_profile_create_started', {
    mode: 'create',
    entrySource: 'dog_list',
    stepName: 'basic_info',
  })
})

watch(currentStep, (step) => {
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'create',
    stepName:
      step === 'basic' ? 'basic_info' :
      step === 'feeding' ? 'feeding_info' :
      step === 'recommendation' ? 'recommendation' :
      'health',
  })
})

async function previewCalculation() {
  void trackDogProfileEvent('dog_profile_calc_requested', {
    mode: 'create',
    stepName: currentStep.value === 'feeding' ? 'feeding_info' : 'recommendation',
  })
  try {
    const preview: any = await dogApi.preview(buildDogCreatePayload(formData.value))
    calcResult.value = preview.data
    void trackDogProfileEvent('dog_profile_calc_succeeded', {
      mode: 'create',
      stepName: 'recommendation',
      calcStatus: 'success',
    })
  } catch (error) {
    void trackDogProfileEvent('dog_profile_calc_failed', {
      mode: 'create',
      stepName: 'recommendation',
      calcStatus: 'failed',
    })
    throw error
  }
}

async function submit() {
  void trackDogProfileEvent('dog_profile_submit_requested', {
    mode: 'create',
    submitStatus: 'requested',
  })
  try {
    await dogApi.create(buildDogCreatePayload(formData.value))
    void trackDogProfileEvent('dog_profile_submit_succeeded', {
      mode: 'create',
      submitStatus: 'success',
    })
  } catch (error) {
    void trackDogProfileEvent('dog_profile_submit_failed', {
      mode: 'create',
      submitStatus: 'failed',
    })
    throw error
  }
}

function handleSecondaryAction() {
  if (currentStep.value === 'health') {
    void trackDogProfileEvent('dog_profile_health_skipped', {
      mode: 'create',
      stepName: 'health',
    })
  }
}
</script>
```

```vue
<!-- add excerpts to miniapp/src/pages/dog-profile-overview/index.vue -->
<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'

onShow(() => {
  void trackDogProfileEvent('dog_profile_step_viewed', {
    mode: 'edit',
    stepName: 'overview',
  })
})

function openTask(taskKey: string) {
  void trackDogProfileEvent('dog_profile_edit_module_opened', {
    mode: 'edit',
    dogId: dogId.value,
    moduleName:
      taskKey === 'basic' ? 'basic_info' :
      taskKey === 'feeding' ? 'feeding_info' :
      'health',
  })
  const routeMap: Record<string, string> = {
    basic: `/pages/dog-profile-basic/index?dogId=${dogId.value}`,
    feeding: `/pages/dog-profile-feeding/index?dogId=${dogId.value}`,
    health: `/pages/dog-profile-health/index?dogId=${dogId.value}`,
  }
  uni.navigateTo({ url: routeMap[taskKey] })
}
</script>
```

```vue
<!-- add excerpts to miniapp/src/pages/dog-profile-feeding/index.vue -->
<script setup lang="ts">
import { trackDogProfileEvent } from '../../utils/dog-profile-analytics'

watch(dirtyFields, (fields) => {
  if (fields.length > 0) {
    void trackDogProfileEvent('dog_profile_draft_saved', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'feeding_info',
      hasDraft: true,
    })
  }
})

async function save() {
  void trackDogProfileEvent('dog_profile_submit_requested', {
    mode: 'edit',
    dogId: dogId.value,
    moduleName: 'feeding_info',
    submitStatus: 'requested',
  })
  try {
    await dogApi.update(dogId.value, buildDogEditPayload(form.value))
    void trackDogProfileEvent('dog_profile_edit_module_saved', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'feeding_info',
      submitStatus: 'success',
    })
  } catch (error) {
    void trackDogProfileEvent('dog_profile_submit_failed', {
      mode: 'edit',
      dogId: dogId.value,
      moduleName: 'feeding_info',
      submitStatus: 'failed',
    })
    throw error
  }
}
</script>
```

- [ ] **Step 4: Run the miniapp analytics helper test and a miniapp build**

Run: `cd miniapp && npx vitest run src/utils/dog-profile-analytics.spec.ts && npm run build:mp-weixin`

Expected:
- Vitest PASS
- Build PASS after analytics helpers are imported by the profile pages

- [ ] **Step 5: Commit the miniapp instrumentation**

```bash
git add miniapp/src/api/analytics.ts miniapp/src/utils/dog-profile-analytics.ts miniapp/src/utils/dog-profile-analytics.spec.ts miniapp/src/pages/dog-create/index.vue miniapp/src/pages/dog-profile-overview/index.vue miniapp/src/pages/dog-profile-basic/index.vue miniapp/src/pages/dog-profile-feeding/index.vue miniapp/src/pages/dog-profile-health/index.vue
git commit -m "feat: instrument dog profile miniapp events"
```

## Task 4: Add the Admin Analytics View and Wire It into Navigation

**Files:**
- Create: `admin-web/src/api/analytics.ts`
- Create: `admin-web/src/types/analytics.ts`
- Create: `admin-web/src/views/Analytics/DogProfileAnalytics.vue`
- Modify: `admin-web/src/router/index.ts`
- Modify: `admin-web/src/layouts/MainLayout.vue`

- [ ] **Step 1: Write the new admin analytics API client first**

```ts
// admin-web/src/api/analytics.ts
import api from './index'
import type { DogProfileAnalyticsSummary } from '@/types/analytics'

export const analyticsApi = {
  getDogProfileSummary: (params: { from: string; to: string }) =>
    api.get<DogProfileAnalyticsSummary>('/admin/analytics/dog-profile', { params }),
}
```

```ts
// admin-web/src/types/analytics.ts
export interface DogProfileAnalyticsSummary {
  createFunnel: {
    started: number
    basicCompleted: number
    recommendationSucceeded: number
    submitted: number
  }
  editFunnel: {
    moduleOpened: number
    calcSucceeded: number
    saved: number
  }
  riskSignals: {
    draftRestored: number
    calcFailed: number
    submitFailed: number
    healthSkipped: number
  }
}
```

- [ ] **Step 2: Build the analytics page and register the route**

```vue
<!-- admin-web/src/views/Analytics/DogProfileAnalytics.vue -->
<template>
  <div class="analytics-page">
    <el-card class="filters">
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" />
      <el-button type="primary" @click="load">刷新</el-button>
    </el-card>

    <el-row :gutter="20" class="stats-grid">
      <el-col :span="12">
        <el-card>
          <template #header>首次建档漏斗</template>
          <el-steps direction="vertical" :active="4">
            <el-step title="开始建档" :description="String(summary.createFunnel.started)" />
            <el-step title="完成基础信息" :description="String(summary.createFunnel.basicCompleted)" />
            <el-step title="生成喂食建议" :description="String(summary.createFunnel.recommendationSucceeded)" />
            <el-step title="完成建档" :description="String(summary.createFunnel.submitted)" />
          </el-steps>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <template #header>日常编辑漏斗</template>
          <el-steps direction="vertical" :active="3">
            <el-step title="进入编辑模块" :description="String(summary.editFunnel.moduleOpened)" />
            <el-step title="建议计算成功" :description="String(summary.editFunnel.calcSucceeded)" />
            <el-step title="保存成功" :description="String(summary.editFunnel.saved)" />
          </el-steps>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="stats-grid">
      <el-col :span="6"><el-card>草稿恢复：{{ summary.riskSignals.draftRestored }}</el-card></el-col>
      <el-col :span="6"><el-card>试算失败：{{ summary.riskSignals.calcFailed }}</el-card></el-col>
      <el-col :span="6"><el-card>保存失败：{{ summary.riskSignals.submitFailed }}</el-card></el-col>
      <el-col :span="6"><el-card>跳过健康补充：{{ summary.riskSignals.healthSkipped }}</el-card></el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { analyticsApi } from '@/api/analytics'
import type { DogProfileAnalyticsSummary } from '@/types/analytics'

const range = ref<[string, string]>(['2026-04-01', '2026-04-07'])
const summary = ref<DogProfileAnalyticsSummary>({
  createFunnel: { started: 0, basicCompleted: 0, recommendationSucceeded: 0, submitted: 0 },
  editFunnel: { moduleOpened: 0, calcSucceeded: 0, saved: 0 },
  riskSignals: { draftRestored: 0, calcFailed: 0, submitFailed: 0, healthSkipped: 0 },
})

async function load() {
  summary.value = await analyticsApi.getDogProfileSummary({
    from: `${range.value[0]}T00:00:00.000Z`,
    to: `${range.value[1]}T23:59:59.999Z`,
  })
}

onMounted(load)
</script>
```

```ts
// admin-web/src/router/index.ts
{
  path: 'analytics/dog-profile',
  name: 'DogProfileAnalytics',
  component: () => import('@/views/Analytics/DogProfileAnalytics.vue'),
  meta: { title: '狗档案转化分析' }
}
```

```vue
<!-- admin-web/src/layouts/MainLayout.vue -->
<el-menu-item index="/analytics/dog-profile">
  <el-icon><DataBoard /></el-icon>
  <span>狗档案转化分析</span>
</el-menu-item>
```

- [ ] **Step 3: Run the admin build to catch route or typing errors**

Run: `cd admin-web && npm run build`

Expected: PASS with the new analytics page, route, and menu item compiled.

- [ ] **Step 4: Manually verify the new analytics page against seeded data**

Manual verification:
- Start backend with Prisma-enabled environment
- Insert or emit a small set of dog-profile events from the miniapp or curl
- Open `/analytics/dog-profile` in admin-web
- Confirm create funnel, edit funnel, and risk-signal cards match the emitted rows

Example seed call:

```bash
curl -X POST http://127.0.0.1:3001/api/v1/analytics/dog-profile/events \
  -H "Authorization: Bearer <miniapp-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "dog_profile_create_started",
    "mode": "create",
    "entrySource": "dog_list",
    "stepName": "basic_info"
  }'
```

- [ ] **Step 5: Commit the admin analytics view**

```bash
git add admin-web/src/api/analytics.ts admin-web/src/types/analytics.ts admin-web/src/views/Analytics/DogProfileAnalytics.vue admin-web/src/router/index.ts admin-web/src/layouts/MainLayout.vue
git commit -m "feat: add dog profile analytics dashboard"
```

## Self-Review

### Spec coverage

- Event naming: covered by Task 3
- Future metrics capture: covered by Tasks 1 through 3
- Admin viewing location: covered by Task 4
- Risk signals and funnel separation: covered by Tasks 1 and 4

### Placeholder scan

- No placeholder markers remain
- Each task includes exact file paths, code blocks, and commands

### Type consistency

- Event name prefix is consistently `dog_profile_*`
- Backend summary shape matches `admin-web/src/types/analytics.ts`
- Miniapp helper payload keys match the backend DTO names
