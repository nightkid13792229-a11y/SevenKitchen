# Customer Dog-First Recipe Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ordinary-user recipe designer behave like a dog-first personal recipe workspace, with dog-based creation, recipe naming, private recipe snapshots, and direct order/DIY continuation.

**Architecture:** Keep the existing administrator `RecipeSeries + five life-stage stages` model intact. Add dog context to customer-owned `RecipeSeries`, `DesignRecipe`, and private `Recipe` snapshots; customer API responses become a compact card list while staff/admin responses remain the existing stage workbench. Private snapshots bridge editable `DesignRecipe` records into the existing `recipe-order` and `recipe-diy` pages without making customer recipes public.

**Tech Stack:** NestJS, Prisma, Jest, Vue 3 / uni-app, Vitest.

---

## File Structure

Backend:

- Modify: `backend/prisma/schema.prisma`
  - Add nullable customer dog/owner/source fields for customer series, drafts, and private recipe snapshots.
- Create: `backend/prisma/migrations/20260611180000_add_customer_recipe_designer_context/migration.sql`
  - Add database columns and indexes.
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
  - Add `dogId` to customer series creation and add private snapshot request DTO.
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
  - Add private snapshot endpoint and pass `dogId` through existing `createSeries`.
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
  - Validate customer dogs, infer FEDIAF scenario, return customer card list, persist dog context, and create/update private recipe snapshots.
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
  - Allow owners and staff/admin to read private custom recipe snapshots by id.
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
  - Cover customer dog validation, customer list shape, and snapshot rules.
- Modify: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`
  - Cover DTO delegation and new endpoint.

Miniapp:

- Modify: `miniapp/src/api/recipe-designer.ts`
  - Add customer card types, `dogId` create payload field, and private snapshot API.
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
  - Replace customer series-stage list with dog-filtered recipe cards and dog-first create sheet.
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
  - Show dog context, hide staff-only affordances, and expose order/DIY next actions for customer drafts.
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
  - Update source-level assertions for customer dog-first behavior.
- Modify: `miniapp/src/api/recipe-designer.spec.ts`
  - Cover new API payloads and snapshot endpoint.

Validation:

- Run backend targeted Jest tests.
- Run miniapp Vitest regression tests.
- Run `git diff --check`.

---

### Task 1: Backend Dog Context and Customer Cards

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260611180000_add_customer_recipe_designer_context/migration.sql`
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write failing backend tests for customer dog context**

Add tests to `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`:

```ts
it('requires ordinary customers to create recipe series for their own dog', async () => {
  prisma.dog.findFirst.mockResolvedValue(null);

  await expect(
    service.createSeries(
      { name: 'Star 的鲜食食谱', dogId: 'dog-other' } as any,
      { userId: 'customer-1', role: 'CUSTOMER' },
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
});

it('creates ordinary customer series with inferred dog scenario and dog context', async () => {
  prisma.dog.findFirst.mockResolvedValue({
    id: 'dog-1',
    ownerId: 'customer-1',
    name: 'Star',
    birthday: new Date('2021-06-01T00:00:00.000Z'),
    lifeStageOverride: 'NONE',
    activityLevel: 'LOW',
    breed: { adultAgeMonths: 12, seniorAgeYears: 7 },
  });
  prisma.recipeSeries.create.mockResolvedValue(
    seriesRecord({ id: 'series-dog', customerDogId: 'dog-1' }),
  );
  prisma.designRecipe.create.mockResolvedValue(
    draft({
      id: 'design-dog',
      seriesId: 'series-dog',
      seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      fediafDogScenario: 'ADULT_MER_95',
      customerDogId: 'dog-1',
      series: { id: 'series-dog', name: 'Star 的鲜食食谱' },
    }),
  );

  await service.createSeries(
    { name: 'Star 的鲜食食谱', dogId: 'dog-1' } as any,
    { userId: 'customer-1', role: 'CUSTOMER' },
  );

  expect(prisma.recipeSeries.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      name: 'Star 的鲜食食谱',
      createdBy: 'customer-1',
      customerDogId: 'dog-1',
    }),
  });
  expect(prisma.designRecipe.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        fediafDogScenario: 'ADULT_MER_95',
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
        customerDogId: 'dog-1',
      }),
    }),
  );
});

it('returns compact dog-first cards for ordinary customer listSeries', async () => {
  prisma.recipeSeries.findMany.mockResolvedValue([
    seriesRecord({
      id: 'series-1',
      name: 'Star 控重鸡肉餐',
      customerDogId: 'dog-1',
      dog: { id: 'dog-1', name: 'Star' },
      designs: [
        draft({
          id: 'design-1',
          seriesId: 'series-1',
          seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
          fediafDogScenario: 'ADULT_MER_95',
          customerDogId: 'dog-1',
          isCompliant: true,
          totalWeightG: 100,
          energyDensityKcalPerKg: 1200,
          missingDataReport: [],
        }),
      ],
      recipes: [],
    }),
  ]);

  await expect(
    service.listSeries({ userId: 'customer-1', role: 'CUSTOMER' }),
  ).resolves.toEqual([
    expect.objectContaining({
      id: 'series-1',
      name: 'Star 控重鸡肉餐',
      customerDogId: 'dog-1',
      customerDogName: 'Star',
      scenario: 'ADULT_MER_95',
      scenarioLabel: '低能量需求成年犬（95ME）',
      primaryDraftId: 'design-1',
      customerStatus: 'READY',
      actionAvailability: expect.objectContaining({
        canContinueEditing: true,
        canOrder: true,
        canGenerateDiy: true,
      }),
    }),
  ]);
});
```

Also add `dog: { findFirst: jest.fn() }` to the mocked Prisma object and reset defaults.

- [ ] **Step 2: Run backend tests and verify they fail**

Run:

```bash
cd backend
pnpm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: fails because `dogId`, `customerDogId`, and customer card shape are not implemented.

- [ ] **Step 3: Add Prisma fields and migration**

Add nullable scalar fields and indexes:

```prisma
model Recipe {
  customerOwnerId      String? @map("customer_owner_id")
  customerDogId        String? @map("customer_dog_id")
  sourceDesignRecipeId String? @map("source_design_recipe_id")

  @@index([customerOwnerId])
  @@index([customerDogId])
  @@index([sourceDesignRecipeId])
}

model RecipeSeries {
  customerDogId String? @map("customer_dog_id")

  @@index([customerDogId])
}

model DesignRecipe {
  customerDogId String? @map("customer_dog_id")

  @@index([customerDogId])
}
```

Create migration SQL:

```sql
ALTER TABLE "recipe_series"
  ADD COLUMN IF NOT EXISTS "customer_dog_id" TEXT;

ALTER TABLE "design_recipe"
  ADD COLUMN IF NOT EXISTS "customer_dog_id" TEXT;

ALTER TABLE "recipe"
  ADD COLUMN IF NOT EXISTS "customer_owner_id" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_dog_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_design_recipe_id" TEXT;

CREATE INDEX IF NOT EXISTS "recipe_series_customer_dog_id_idx"
  ON "recipe_series"("customer_dog_id");
CREATE INDEX IF NOT EXISTS "design_recipe_customer_dog_id_idx"
  ON "design_recipe"("customer_dog_id");
CREATE INDEX IF NOT EXISTS "recipe_customer_owner_id_idx"
  ON "recipe"("customer_owner_id");
CREATE INDEX IF NOT EXISTS "recipe_customer_dog_id_idx"
  ON "recipe"("customer_dog_id");
CREATE INDEX IF NOT EXISTS "recipe_source_design_recipe_id_idx"
  ON "recipe"("source_design_recipe_id");
```

- [ ] **Step 4: Extend DTOs and selects**

In `CreateRecipeSeriesDto`, add:

```ts
@IsOptional()
@IsString()
dogId?: string;
```

Extend service selects/types with `customerDogId` and `dog` names where series are loaded.

- [ ] **Step 5: Implement customer dog validation and inference**

In `recipe-designer.service.ts`, import `mapDogProfileToSeriesLifeStage`. Add helpers:

```ts
private async loadCustomerDogForRecipeDesigner(
  dogId: string | undefined,
  context: RecipeDesignerAccessContext,
) {
  if (isInternalRecipeDesignerRole(context)) return null;
  if (!dogId) {
    throw new BadRequestException('请选择狗狗后再创建食谱');
  }
  const dog = await this.prisma.dog.findFirst({
    where: { id: dogId, ownerId: context.userId },
    include: { breed: true },
  });
  if (!dog) {
    throw new NotFoundException('未找到可用狗狗档案');
  }
  return dog;
}
```

Use `mapDogProfileToSeriesLifeStage(dog)` and `mapSeriesLifeStageToScenario(lifeStage)` when customer `scenario` is absent. Persist `customerDogId` to the series and initial draft.

- [ ] **Step 6: Return customer card list for ordinary users**

Keep `buildSeriesWorkbenchCard` unchanged for staff/admin. For customers, map each series to a compact card:

```ts
private buildCustomerSeriesCard(record: RecipeSeriesWorkbenchRecord) {
  const primaryDraft = record.designs[0] as DesignRecipeWithItems | undefined;
  const privateRecipe = record.recipes.find(
    (recipe) => recipe.status === RecipeStatus.PRIVATE_CUSTOM,
  );
  const scenario = primaryDraft?.fediafDogScenario ?? 'ADULT_MER_110';
  const ready = this.isCustomerDraftReadyForSnapshot(primaryDraft);

  return {
    id: record.id,
    name: record.name,
    customerDogId: record.customerDogId ?? primaryDraft?.customerDogId ?? null,
    customerDogName: record.dog?.name ?? '',
    scenario,
    scenarioLabel: this.getScenarioDisplayLabel(scenario),
    primaryDraftId: primaryDraft?.id ?? '',
    privateRecipeId: privateRecipe?.recipeId ?? '',
    customerStatus: ready ? 'READY' : primaryDraft ? 'DRAFT' : 'EMPTY',
    updatedAt: primaryDraft?.updatedAt ?? record.updatedAt,
    actionAvailability: {
      canContinueEditing: Boolean(primaryDraft?.id),
      canOrder: ready,
      canGenerateDiy: ready,
      disabledReason: ready ? '' : '当前食谱还未达到可用条件',
    },
  };
}
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
cd backend
pnpm run prisma:generate:build
pnpm test -- tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: PASS.

Commit:

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260611180000_add_customer_recipe_designer_context/migration.sql backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "feat: add customer dog context to recipe designer"
```

---

### Task 2: Backend Private Snapshot and Recipe Access

**Files:**
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`
- Test: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Write failing tests for private snapshot endpoint**

Add controller test:

```ts
it('delegates private recipe snapshot creation with CurrentUser ids', async () => {
  service.createPrivateRecipeSnapshot = jest.fn().mockResolvedValue({
    recipeId: 'private-recipe-1',
    dogId: 'dog-1',
    targetUrl: '/pages/recipe-order/index?recipeId=private-recipe-1&dogId=dog-1',
  });

  await expect(
    controller.createPrivateRecipeSnapshot(
      'design-1',
      { target: 'ORDER' },
      { userId: 'customer-1', role: 'CUSTOMER' } as any,
    ),
  ).resolves.toEqual(expect.objectContaining({ code: 0 }));

  expect(service.createPrivateRecipeSnapshot).toHaveBeenCalledWith(
    'design-1',
    { target: 'ORDER' },
    { userId: 'customer-1', role: 'CUSTOMER' },
  );
});
```

Add service tests:

```ts
it('rejects private snapshot generation for non-ready customer drafts', async () => {
  prisma.designRecipe.findUnique.mockResolvedValue(
    draft({
      id: 'design-1',
      createdBy: 'customer-1',
      customerDogId: 'dog-1',
      isCompliant: false,
      totalWeightG: 100,
      energyDensityKcalPerKg: 1200,
      missingDataReport: [],
      items: [item()],
    }),
  );

  await expect(
    service.createPrivateRecipeSnapshot(
      'design-1',
      { target: 'ORDER' },
      { userId: 'customer-1', role: 'CUSTOMER' },
    ),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('creates a private custom recipe snapshot for ready customer drafts', async () => {
  prisma.designRecipe.findUnique.mockResolvedValue(
    draft({
      id: 'design-1',
      name: 'Star 控重鸡肉餐',
      createdBy: 'customer-1',
      customerDogId: 'dog-1',
      isCompliant: true,
      totalWeightG: 100,
      energyDensityKcalPerKg: 1200,
      missingDataReport: [],
      seriesId: 'series-1',
      seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      fediafDogScenario: 'ADULT_MER_95',
      calculatedNutrition: { energyDensityKcalPerKg: 1200 },
      items: [item({ weightG: 100 })],
    }),
  );
  prisma.recipe.findFirst.mockResolvedValue(null);
  prisma.recipe.create.mockResolvedValue({
    id: 'private-row-1',
    recipeId: 'private-recipe-1',
    version: 1,
    customerDogId: 'dog-1',
  });

  await expect(
    service.createPrivateRecipeSnapshot(
      'design-1',
      { target: 'DIY' },
      { userId: 'customer-1', role: 'CUSTOMER' },
    ),
  ).resolves.toEqual({
    recipeId: 'private-recipe-1',
    dogId: 'dog-1',
    targetUrl: '/pages/recipe-diy/index?recipeId=private-recipe-1&dogId=dog-1',
  });

  expect(prisma.recipe.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: 'PRIVATE_CUSTOM',
        isCustomRecipe: true,
        customerOwnerId: 'customer-1',
        customerDogId: 'dog-1',
        sourceDesignRecipeId: 'design-1',
      }),
    }),
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd backend
pnpm test -- tests/interfaces/controllers/recipe-designer.controller.spec.ts tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: FAIL for missing DTO, controller method, service method.

- [ ] **Step 3: Add DTO and controller route**

In DTO:

```ts
export const PRIVATE_RECIPE_SNAPSHOT_TARGETS = ['ORDER', 'DIY'] as const;
export type PrivateRecipeSnapshotTarget =
  (typeof PRIVATE_RECIPE_SNAPSHOT_TARGETS)[number];

export class CreatePrivateRecipeSnapshotDto {
  @IsIn(PRIVATE_RECIPE_SNAPSHOT_TARGETS)
  target!: PrivateRecipeSnapshotTarget;
}
```

In controller:

```ts
@Post('drafts/:id/private-recipe-snapshot')
@ApiOperation({ summary: 'Create or update a private recipe snapshot for order or DIY' })
async createPrivateRecipeSnapshot(
  @Param('id') id: string,
  @Body() dto: CreatePrivateRecipeSnapshotDto,
  @CurrentUser() user: RequestUser,
): Promise<ApiResponseDto<any>> {
  const snapshot = await this.recipeDesignerService.createPrivateRecipeSnapshot(
    id,
    dto,
    toRecipeDesignerAccessContext(user),
  );
  return ApiResponseDto.success(snapshot);
}
```

- [ ] **Step 4: Implement snapshot readiness and conversion**

In service:

```ts
private isCustomerDraftReadyForSnapshot(draft?: DesignRecipeWithItems | null) {
  if (!draft) return false;
  const missing = Array.isArray(draft.missingDataReport)
    ? draft.missingDataReport
    : [];
  return (
    draft.createdBy &&
    draft.customerDogId &&
    draft.items.some((item) => item.includeInAssessment !== false) &&
    draft.totalWeightG > 0 &&
    Number(draft.energyDensityKcalPerKg) > 0 &&
    draft.isCompliant &&
    missing.length === 0
  );
}
```

Implement `createPrivateRecipeSnapshot` by loading the draft with `DESIGN_RECIPE_INCLUDE`, enforcing owner access for customers, building `recipeItem.create` rows from design items, and creating/updating `Recipe.status = PRIVATE_CUSTOM`. Use target URL:

```ts
const page =
  dto.target === 'DIY' ? '/pages/recipe-diy/index' : '/pages/recipe-order/index';
return {
  recipeId: recipe.recipeId,
  dogId: draft.customerDogId,
  targetUrl: `${page}?recipeId=${recipe.recipeId}&dogId=${draft.customerDogId}`,
};
```

- [ ] **Step 5: Allow owner access to private snapshots**

In `RecipesController.getAccessibleRecipe` or the nearest helper, add owner access for `PRIVATE_CUSTOM`:

```ts
if (
  user &&
  recipe.status === RecipeStatus.PRIVATE_CUSTOM &&
  ((recipe as any).customerOwnerId === (user.customerId || user.userId) ||
    user.role === 'STAFF' ||
    user.role === 'ADMIN')
) {
  return recipe;
}
```

Keep list/recommendation queries using `buildPublicRecipeWhere`, so private snapshots never enter public feeds.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cd backend
pnpm test -- tests/interfaces/controllers/recipe-designer.controller.spec.ts tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: PASS.

Commit:

```bash
git add backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts backend/src/interfaces/controllers/recipe-designer.controller.ts backend/src/application/recipe-designer/recipe-designer.service.ts backend/src/interfaces/controllers/recipes.controller.ts backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "feat: create private recipe snapshots from customer drafts"
```

---

### Task 3: Miniapp Dog-First Customer List and Create Flow

**Files:**
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
- Test: `miniapp/src/api/recipe-designer.spec.ts`
- Test: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write failing miniapp tests for dog-first customer list**

Update `miniapp/src/api/recipe-designer.spec.ts` to assert:

```ts
expect(source).toContain('dogId?: string')
expect(source).toContain('RecipeDesignerCustomerSeriesCard')
expect(source).toContain('createPrivateRecipeSnapshot')
expect(source).toContain("/private-recipe-snapshot")
```

Update `recipe-designer.regression.spec.ts` to assert:

```ts
expect(listSource).toContain('我的食谱设计')
expect(listSource).toContain('customerSeriesCards')
expect(listSource).toContain('dogFilterOptions')
expect(listSource).toContain('selectedCreateDogId')
expect(listSource).toContain('recipeNameInput')
expect(listSource).toContain('resolveScenarioForDog')
expect(listSource).toContain('dogApi.list')
expect(listSource).toContain("dogId: selectedCreateDogId.value")
expect(listSource).toContain("name: recipeNameInput.value.trim()")
expect(listSource).toContain('Star 的鲜食食谱')
expect(listSource).not.toContain('按生命阶段维护通用食谱草稿')
```

- [ ] **Step 2: Run miniapp tests and verify failure**

Run:

```bash
cd miniapp
pnpm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts
```

Expected: FAIL because dog-first API/list flow is not implemented.

- [ ] **Step 3: Extend API types**

In `miniapp/src/api/recipe-designer.ts`, extend `CreateRecipeSeriesPayload`:

```ts
export interface CreateRecipeSeriesPayload {
  name: string
  scenario?: FediafDogScenario
  dogId?: string
}
```

Add customer card type:

```ts
export interface RecipeDesignerCustomerSeriesCard {
  id: string
  name: string
  customerDogId?: string | null
  customerDogName?: string
  scenario?: FediafDogScenario
  scenarioLabel?: string
  primaryDraftId?: string
  privateRecipeId?: string
  customerStatus?: 'EMPTY' | 'DRAFT' | 'READY'
  updatedAt?: string
  actionAvailability?: {
    canContinueEditing: boolean
    canOrder: boolean
    canGenerateDiy: boolean
    disabledReason?: string
  }
}
```

Add API:

```ts
createPrivateRecipeSnapshot: (draftId: string, data: { target: 'ORDER' | 'DIY' }) =>
  request({ url: `/recipe-designer/drafts/${draftId}/private-recipe-snapshot`, method: 'POST', data }),
```

- [ ] **Step 4: Load dogs and render customer cards**

In `list.vue`, import `dogApi` and add state:

```ts
const dogs = ref<any[]>([])
const selectedDogFilterId = ref('')
const selectedCreateDogId = ref('')
const recipeNameInput = ref('')
```

In `onShow`, load dogs for customer mode before/alongside series:

```ts
async function loadDogsForCustomerMode() {
  if (!isCustomerMode.value) return
  const res: any = await dogApi.list()
  dogs.value = Array.isArray(res?.data) ? res.data : res?.data?.items || []
}
```

Add computed customer cards:

```ts
const customerSeriesCards = computed(() => {
  if (!isCustomerMode.value) return []
  return series.value.filter((item: any) =>
    selectedDogFilterId.value ? item.customerDogId === selectedDogFilterId.value : true,
  )
})
```

Template: use a customer-only branch that displays compact cards rather than `.stage-list`.

- [ ] **Step 5: Implement dog-first create sheet**

For customer mode, replace scenario picker with:

- dog selection list
- inferred stage text
- recipe name input

Default name:

```ts
function buildDefaultRecipeName(dog?: any) {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${dog?.name || '爱犬'} 的鲜食食谱 ${mm}/${dd}`
}
```

Create payload for customer:

```ts
await recipeDesignerApi.createSeries({
  name: recipeNameInput.value.trim(),
  dogId: selectedCreateDogId.value,
  scenario: newDraftScenario.value,
})
```

Keep staff/admin creation behavior compatible with existing `name + scenario`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cd miniapp
pnpm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts src/utils/life-stage-match.spec.ts
```

Expected: PASS.

Commit:

```bash
git add miniapp/src/api/recipe-designer.ts miniapp/src/pages/recipe-designer/list.vue miniapp/src/api/recipe-designer.spec.ts miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "feat: add dog-first customer recipe designer list"
```

---

### Task 4: Miniapp Editor Next Actions

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Write failing tests for customer editor next actions**

In `recipe-designer.regression.spec.ts`, add:

```ts
expect(editorSource).toContain('customerNextActions')
expect(editorSource).toContain('createPrivateRecipeSnapshot')
expect(editorSource).toContain("target: 'ORDER'")
expect(editorSource).toContain("target: 'DIY'")
expect(editorSource).toContain('goToPrivateRecipeTarget')
expect(editorSource).toContain('为 {{ customerDogName }} 设计')
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd miniapp
pnpm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: FAIL because editor next actions are missing.

- [ ] **Step 3: Read dog context from draft**

In `editor.vue`, add refs for:

```ts
const customerDogId = ref('')
const customerDogName = ref('')
const privateSnapshotCreatingTarget = ref<'ORDER' | 'DIY' | ''>('')
```

When draft loads, set:

```ts
customerDogId.value = draft.customerDogId || draft.series?.customerDogId || ''
customerDogName.value = draft.customerDogName || draft.series?.dog?.name || ''
```

If current backend response only supplies `customerDogId`, show `为爱犬设计` until backend card/detail includes the name.

- [ ] **Step 4: Add customer next actions**

Template after assessment/actions area:

```vue
<view v-if="isCustomerMode && customerDogId" class="customer-next-actions">
  <button
    class="primary-btn"
    :disabled="!canCreatePrivateSnapshot || privateSnapshotCreatingTarget === 'ORDER'"
    @tap="goToPrivateRecipeTarget('ORDER')"
  >
    订购成品
  </button>
  <button
    class="secondary-btn"
    :disabled="!canCreatePrivateSnapshot || privateSnapshotCreatingTarget === 'DIY'"
    @tap="goToPrivateRecipeTarget('DIY')"
  >
    生成 DIY 制作单
  </button>
  <button class="link-btn" @tap="goBackToRecipeDesignerList">仅保存</button>
</view>
```

Computed readiness should use backend draft fields:

```ts
const canCreatePrivateSnapshot = computed(() =>
  Boolean(customerDogId.value && isCompliant.value && currentTotalWeightG.value > 0),
)
```

Method:

```ts
async function goToPrivateRecipeTarget(target: 'ORDER' | 'DIY') {
  if (!draftId.value || privateSnapshotCreatingTarget.value) return
  privateSnapshotCreatingTarget.value = target
  try {
    const res: any = await recipeDesignerApi.createPrivateRecipeSnapshot(draftId.value, { target })
    const data = res?.data ?? res
    const url = data?.targetUrl || (
      target === 'DIY'
        ? `/pages/recipe-diy/index?recipeId=${data.recipeId}&dogId=${data.dogId}`
        : `/pages/recipe-order/index?recipeId=${data.recipeId}&dogId=${data.dogId}`
    )
    uni.navigateTo({ url })
  } catch (error) {
    uni.showToast({ title: '暂时无法进入下一步', icon: 'none' })
  } finally {
    privateSnapshotCreatingTarget.value = ''
  }
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd miniapp
pnpm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: PASS.

Commit:

```bash
git add miniapp/src/pages/recipe-designer/editor.vue miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "feat: add customer recipe designer next actions"
```

---

### Task 5: Integrated Verification

**Files:**
- Modify tests only if a legitimate assertion needs final alignment.

- [ ] **Step 1: Run targeted backend tests**

```bash
cd backend
pnpm run prisma:generate:build
pnpm test -- tests/interfaces/controllers/recipe-designer.controller.spec.ts tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted miniapp tests**

```bash
cd miniapp
pnpm test -- src/api/recipe-designer.spec.ts src/pages/recipe-designer.regression.spec.ts src/utils/life-stage-match.spec.ts src/pages/life-stage-warning.regression.spec.ts src/pages/recipe-diy.regression.spec.ts src/pages/recipe-order.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run diff hygiene**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` has no output. `git status --short` should only show intentional changes if final commits are not yet made.

- [ ] **Step 4: Final review and commit if needed**

If integration fixes are needed:

```bash
git add <changed-files>
git commit -m "test: verify customer dog-first recipe designer flow"
```

Expected: branch contains focused commits for backend, miniapp list, miniapp editor, and any integration fixes.
