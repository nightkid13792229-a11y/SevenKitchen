# Recipe Designer Public Private Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the miniapp recipe designer to regular logged-in users as a private life-stage recipe drafting tool while keeping formal recipe publishing admin-only.

**Architecture:** Reuse the existing `DesignRecipe`, `DesignRecipeItem`, and `RecipeSeries` model, but split capabilities by authenticated user role. Backend controller guards move from class-wide staff-only to method-level staff/admin restrictions, while service-layer ownership filters keep regular customer drafts private and keep them out of formal `Recipe` flows. The miniapp adds a home quick action and reuses the existing designer pages with a customer mode that hides internal maintenance and publishing language.

**Tech Stack:** NestJS, Prisma, Jest, uni-app Vue 3, Vitest, WeChat miniapp static PNG assets.

---

## File Structure

- `backend/src/interfaces/controllers/recipe-designer.controller.ts`  
  Adjust controller guards so all authenticated users can use private draft endpoints, while supplement maintenance, revision creation, and publish remain staff/admin/admin-only.

- `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`  
  Lock the guard metadata and controller delegation contract, especially that `StaffGuard` still runs on methods with `@Roles`.

- `backend/src/application/recipe-designer/recipe-designer.service.ts`  
  Add an access context helper, role-aware series/draft visibility, and series ownership checks for create-stage/rename/delete.

- `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`  
  Lock customer private visibility, cross-user denial, and staff/admin internal visibility.

- `miniapp/src/pages/home/index.vue`  
  Add the fifth quick action after `建议反馈`, route unauthenticated users to login, and keep quick action sizing stable.

- `miniapp/src/pages/home.regression.spec.ts`  
  Lock the new homepage entry order, route, and static asset.

- `miniapp/src/static/home-actions/recipe-designer.png`  
  New quick action icon. First pass can copy the current feedback icon so layout and build assets are stable; replace with a final design asset later without touching behavior.

- `miniapp/src/pages/recipe-designer/list.vue`  
  Add customer mode copy and hide `补剂库`/published-stage counts for non-staff users.

- `miniapp/src/pages/recipe-designer/editor.vue`  
  Keep normal editing and nutrition report access, but prevent non-staff users from auto-revising published formal drafts or seeing supplement-library maintenance prompts.

- `miniapp/src/pages/recipe-designer/publish.vue`  
  Keep this as the nutrition report page for customers while showing publish controls only to admins and avoiding backend/publish copy for non-admins.

- `miniapp/src/pages/recipe-designer.regression.spec.ts`  
  Lock customer-mode copy and hidden internal capabilities.

---

### Task 1: Lock Backend Controller Authorization

**Files:**
- Modify: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`
- Modify later: `backend/src/interfaces/controllers/recipe-designer.controller.ts`

- [ ] **Step 1: Replace the class guard test with customer-open guard expectations**

In `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`, replace the current test named `requires authentication and staff guards` with:

```ts
it('requires authentication at class level while leaving staff restrictions to selected methods', () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    RecipeDesignerController,
  );

  expect(guards).toEqual([AuthGuard]);
});
```

- [ ] **Step 2: Add method guard contract tests**

In the same `describe('RecipeDesignerController authorization', () => { ... })` block, add these tests after the class guard test:

```ts
it('keeps supplement maintenance and revision routes staff-only', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/interfaces/controllers/recipe-designer.controller.ts',
    ),
    'utf8',
  );

  expect(source).toMatch(
    /@Post\('supplement-options'\)\s+@UseGuards\(StaffGuard\)/,
  );
  expect(source).toMatch(
    /@Post\('supplement-label\/extract'\)[\s\S]*?@UseGuards\(StaffGuard\)/,
  );
  expect(source).toMatch(
    /@Post\('drafts\/:id\/revisions'\)\s+@UseGuards\(StaffGuard\)/,
  );
});

it('keeps publishing protected by StaffGuard plus admin role metadata', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/interfaces/controllers/recipe-designer.controller.ts',
    ),
    'utf8',
  );

  expect(source).toMatch(
    /@Post\('drafts\/:id\/publish'\)\s+@UseGuards\(StaffGuard\)\s+@Roles\('ADMIN'\)/,
  );
});
```

- [ ] **Step 3: Update controller delegation expectations to pass access context where role matters**

In `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`, update the expectations in `delegates draft CRUD with CurrentUser ids`:

```ts
expect(service.listDrafts).toHaveBeenCalledWith({
  userId: 'staff-1',
  role: 'STAFF',
});
expect(service.getDraft).toHaveBeenCalledWith('design-1', {
  userId: 'staff-1',
  role: 'STAFF',
});
expect(service.createDraft).toHaveBeenCalledWith(
  { name: 'new', scenario: 'ADULT_MER_110' },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
expect(service.updateDraft).toHaveBeenCalledWith(
  'design-1',
  { name: 'new' },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
expect(service.deleteDraft).toHaveBeenCalledWith('design-1', {
  userId: 'staff-1',
  role: 'STAFF',
});
```

In `delegates series workbench endpoints with CurrentUser ids`, update the expectations:

```ts
expect(service.listSeries).toHaveBeenCalledWith({
  userId: 'staff-1',
  role: 'STAFF',
});
expect(service.createSeries).toHaveBeenCalledWith(
  { name: '牛肉南瓜鲜食', scenario: 'ADULT_MER_110' },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
expect(service.renameSeries).toHaveBeenCalledWith(
  'series-1',
  { name: '新名字' },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
expect(service.deleteSeries).toHaveBeenCalledWith(
  'series-1',
  {
    confirmName: '新名字',
    confirmUserVisibleRemoval: true,
  },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
expect(service.createSeriesStageDraft).toHaveBeenCalledWith(
  'series-1',
  { scenario: 'ADULT_MER_95' },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
```

In `delegates published recipe revision creation with CurrentUser ids`, update:

```ts
expect(service.createRevisionDraft).toHaveBeenCalledWith(
  'design-published',
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
```

In `delegates item mutations, assessment, and publish with CurrentUser ids`, update the expectations that pass user ids:

```ts
expect(service.addItem).toHaveBeenCalledWith(
  'design-1',
  {
    ingredientId: 'ingredient-1',
    nutritionFoodId: 'food-1',
    weightG: 100,
  },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
expect(service.updateItem).toHaveBeenCalledWith(
  'item-1',
  { weightG: 120 },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
expect(service.removeItem).toHaveBeenCalledWith('item-1', {
  userId: 'staff-1',
  role: 'STAFF',
});
expect(service.publishDraft).toHaveBeenCalledWith(
  'design-1',
  { reviewNote: 'ok' },
  {
    userId: 'staff-1',
    role: 'STAFF',
  },
);
```

- [ ] **Step 4: Run the controller tests and verify they fail**

Run:

```bash
cd backend
npm test -- --runInBand tests/interfaces/controllers/recipe-designer.controller.spec.ts
```

Expected: FAIL because `RecipeDesignerController` still has class-level `StaffGuard`, protected methods do not yet have method-level `@UseGuards(StaffGuard)`, and controller methods still pass `user.userId` strings.

- [ ] **Step 5: Implement controller guard and delegation changes**

In `backend/src/interfaces/controllers/recipe-designer.controller.ts`, keep the current imports and change the class decorator from:

```ts
@UseGuards(AuthGuard, StaffGuard)
```

to:

```ts
@UseGuards(AuthGuard)
```

Add this helper near the upload constants:

```ts
function toRecipeDesignerAccessContext(user: RequestUser) {
  return {
    userId: user.userId,
    role: user.role,
  };
}
```

Add `@UseGuards(StaffGuard)` directly below each of these route decorators:

```ts
  @Post('supplement-options')
  @UseGuards(StaffGuard)
```

```ts
  @Post('supplement-label/extract')
  @UseGuards(StaffGuard)
```

```ts
  @Post('drafts/:id/revisions')
  @UseGuards(StaffGuard)
```

For publish, use this exact decorator order:

```ts
  @Post('drafts/:id/publish')
  @UseGuards(StaffGuard)
  @Roles('ADMIN')
```

Update every service call that currently passes `user.userId` for draft/series/item/publish/revision operations to pass `toRecipeDesignerAccessContext(user)`. For example:

```ts
const series = await this.recipeDesignerService.listSeries(
  toRecipeDesignerAccessContext(user),
);
```

```ts
const draft = await this.recipeDesignerService.createSeries(
  dto,
  toRecipeDesignerAccessContext(user),
);
```

```ts
const item = await this.recipeDesignerService.addItem(
  id,
  dto,
  toRecipeDesignerAccessContext(user),
);
```

Do not change `createSupplementOption` or `extractSupplementLabel` yet; those services only need the creator id:

```ts
user.userId
```

- [ ] **Step 6: Run the controller tests and verify they pass**

Run:

```bash
cd backend
npm test -- --runInBand tests/interfaces/controllers/recipe-designer.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit backend controller authorization**

Run:

```bash
git add backend/src/interfaces/controllers/recipe-designer.controller.ts backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts
git commit -m "fix: open recipe designer private draft endpoints"
```

---

### Task 2: Lock Backend Private Series And Draft Visibility

**Files:**
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`
- Modify later: `backend/src/application/recipe-designer/recipe-designer.service.ts`

- [ ] **Step 1: Extend the Prisma mock with user lookups**

In `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`, add this to the `prisma` mock object after `favoriteRecipe`:

```ts
    user: {
      findMany: jest.fn(),
    },
```

In `beforeEach`, add:

```ts
    prisma.user.findMany.mockResolvedValue([
      { id: 'staff-1' },
      { id: 'admin-1' },
    ]);
```

- [ ] **Step 2: Add a helper for series records in the service spec**

In the same file, after the existing `draft()` helper, add:

```ts
  function seriesRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'series-1',
      name: '成犬鸡肉配方',
      status: 'ACTIVE',
      deletedAt: null,
      deletedBy: null,
      createdBy: 'customer-1',
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
      designs: [],
      recipes: [],
      ...overrides,
    };
  }
```

- [ ] **Step 3: Add failing list visibility tests**

Add these tests after the existing draft creation tests:

```ts
  it('lists only the current customer private recipe series for customer access', async () => {
    prisma.recipeSeries.findMany.mockResolvedValue([
      seriesRecord({ id: 'series-customer-1', createdBy: 'customer-1' }),
    ]);

    await expect(
      service.listSeries({ userId: 'customer-1', role: 'CUSTOMER' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'series-customer-1' }),
    ]);

    expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          createdBy: 'customer-1',
        },
      }),
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('lists only internal staff/admin series for staff access', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'staff-1' },
      { id: 'admin-1' },
    ]);
    prisma.recipeSeries.findMany.mockResolvedValue([
      seriesRecord({ id: 'series-staff-1', createdBy: 'staff-1' }),
    ]);

    await expect(
      service.listSeries({ userId: 'staff-1', role: 'STAFF' }),
    ).resolves.toEqual([expect.objectContaining({ id: 'series-staff-1' })]);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: { in: ['STAFF', 'ADMIN'] } },
      select: { id: true },
    });
    expect(prisma.recipeSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          createdBy: { in: ['staff-1', 'admin-1'] },
        },
      }),
    );
  });

  it('lists only current customer drafts for customer access', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft({ id: 'design-customer-1', createdBy: 'customer-1' }),
    ]);

    await expect(
      service.listDrafts({ userId: 'customer-1', role: 'CUSTOMER' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'design-customer-1' }),
    ]);

    expect(prisma.designRecipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdBy: 'customer-1' },
      }),
    );
  });

  it('keeps published internal designs available only to staff or admin draft lists', async () => {
    prisma.designRecipe.findMany.mockResolvedValue([
      draft({ id: 'design-staff-1', createdBy: 'staff-1' }),
      draft({
        id: 'design-published-1',
        status: 'PUBLISHED',
        publishedRecipeId: 'recipe-1',
      }),
    ]);

    await expect(
      service.listDrafts({ userId: 'staff-1', role: 'STAFF' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'design-staff-1' }),
      expect.objectContaining({ id: 'design-published-1' }),
    ]);

    expect(prisma.designRecipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { createdBy: 'staff-1' },
            {
              status: 'PUBLISHED',
              publishedRecipeId: { not: null },
            },
          ],
        },
      }),
    );
  });
```

- [ ] **Step 4: Add failing ownership tests for series mutations**

Add these tests after existing series tests or after the visibility tests:

```ts
  it('rejects customer stage draft creation for another user series', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(
      seriesRecord({ id: 'series-other', createdBy: 'customer-2' }),
    );

    await expect(
      service.createSeriesStageDraft(
        'series-other',
        { scenario: 'ADULT_MER_110' },
        { userId: 'customer-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects customer rename for another user series', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(
      seriesRecord({ id: 'series-other', createdBy: 'customer-2' }),
    );

    await expect(
      service.renameSeries(
        'series-other',
        { name: '新名字' },
        { userId: 'customer-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.recipeSeries.update).not.toHaveBeenCalled();
  });

  it('rejects customer delete for another user series', async () => {
    prisma.recipeSeries.findUnique.mockResolvedValue(
      seriesRecord({ id: 'series-other', createdBy: 'customer-2' }),
    );

    await expect(
      service.deleteSeries(
        'series-other',
        {
          confirmName: '成犬鸡肉配方',
          confirmUserVisibleRemoval: true,
        },
        { userId: 'customer-1', role: 'CUSTOMER' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects customer access to another user draft detail', async () => {
    prisma.designRecipe.findUnique.mockResolvedValue(
      draft({ id: 'design-other', createdBy: 'customer-2' }),
    );

    await expect(
      service.getDraft('design-other', {
        userId: 'customer-1',
        role: 'CUSTOMER',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
```

- [ ] **Step 5: Run service tests and verify they fail**

Run:

```bash
cd backend
npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: FAIL because service methods still accept plain strings and do not filter/mutate series by role-aware access context.

---

### Task 3: Implement Backend Access Context And Ownership

**Files:**
- Modify: `backend/src/application/recipe-designer/recipe-designer.service.ts`
- Modify: `backend/tests/application/recipe-designer/recipe-designer.service.spec.ts`

- [ ] **Step 1: Add role imports and access-context types**

In `backend/src/application/recipe-designer/recipe-designer.service.ts`, extend the `@prisma/client` import to include `UserRole`:

```ts
import {
  DesignRecipeReviewStatus,
  DesignRecipeStatus,
  FediafDogScenario,
  NutritionFoodCategory,
  NutritionFoodStatus,
  Prisma,
  RecipeSeriesStatus,
  RecipeStatus,
  UserRole,
} from '@prisma/client';
```

Near the local type declarations, add:

```ts
type RecipeDesignerAccessInput =
  | string
  | {
      userId: string;
      role?: string | null;
    };

interface RecipeDesignerAccessContext {
  userId: string;
  role: string;
}

function normalizeRecipeDesignerAccessContext(
  input: RecipeDesignerAccessInput,
): RecipeDesignerAccessContext {
  if (typeof input === 'string') {
    return { userId: input, role: UserRole.STAFF };
  }
  return {
    userId: input.userId,
    role: String(input.role || UserRole.CUSTOMER).toUpperCase(),
  };
}

function isInternalRecipeDesignerRole(
  context: RecipeDesignerAccessContext,
): boolean {
  return context.role === UserRole.STAFF || context.role === UserRole.ADMIN;
}
```

- [ ] **Step 2: Add internal-user visibility helpers**

Inside `RecipeDesignerService`, add these private methods near `listSeries`:

```ts
  private async listInternalRecipeDesignerUserIds() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.STAFF, UserRole.ADMIN] } },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  private async buildSeriesVisibilityWhere(
    context: RecipeDesignerAccessContext,
  ) {
    const baseWhere = {
      status: RecipeSeriesStatus.ACTIVE,
      deletedAt: null,
    };

    if (!isInternalRecipeDesignerRole(context)) {
      return {
        ...baseWhere,
        createdBy: context.userId,
      };
    }

    const internalUserIds = await this.listInternalRecipeDesignerUserIds();
    return {
      ...baseWhere,
      createdBy: { in: internalUserIds },
    };
  }

  private async assertSeriesAccessibleByContext(
    series: { id: string; createdBy?: string | null } | null,
    context: RecipeDesignerAccessContext,
  ) {
    if (!series) return false;
    if (!isInternalRecipeDesignerRole(context)) {
      return series.createdBy === context.userId;
    }

    const internalUserIds = await this.listInternalRecipeDesignerUserIds();
    return Boolean(series.createdBy && internalUserIds.includes(series.createdBy));
  }
```

- [ ] **Step 3: Update list methods to use access context**

Change `listSeries` from:

```ts
  async listSeries(userId: string) {
```

to:

```ts
  async listSeries(accessInput: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(accessInput);
```

Change its `findMany` `where` block to:

```ts
      where: await this.buildSeriesVisibilityWhere(context),
```

Change the mapping call to:

```ts
      this.buildSeriesWorkbenchCard(record, context.userId),
```

Change `listDrafts` from:

```ts
  async listDrafts(createdBy: string) {
```

to:

```ts
  async listDrafts(accessInput: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(accessInput);
    const where = isInternalRecipeDesignerRole(context)
      ? {
          OR: [
            { createdBy: context.userId },
            {
              status: DesignRecipeStatus.PUBLISHED,
              publishedRecipeId: { not: null },
            },
          ],
        }
      : { createdBy: context.userId };
```

Then use:

```ts
      where,
```

inside `prisma.designRecipe.findMany`.

- [ ] **Step 4: Update draft and item methods to normalize context**

For each public method below, change its user argument from `userId: string` to `accessInput: RecipeDesignerAccessInput`, then add `const context = normalizeRecipeDesignerAccessContext(accessInput);` at the top and pass `context.userId` into existing helper calls:

```ts
  async getDraft(id: string, accessInput: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(accessInput);
    const draft = await this.loadDraft(id);

    if (draft.createdBy !== context.userId && !this.isPublishedDraft(draft)) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }
    if (!isInternalRecipeDesignerRole(context) && draft.createdBy !== context.userId) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }

    return draft;
  }
```

Apply the same normalization pattern to:

```ts
createDraft(dto, accessInput)
updateDraft(id, dto, accessInput)
deleteDraft(id, accessInput)
createRevisionDraft(id, accessInput)
addItem(designRecipeId, dto, accessInput)
updateItem(itemId, dto, accessInput)
removeItem(itemId, accessInput)
publishDraft(id, dto, accessInput)
```

For `publishDraft`, use:

```ts
const context = normalizeRecipeDesignerAccessContext(accessInput);
const userId = context.userId;
```

and leave the rest of the method using `userId` as before. Controller guards block customers; this normalization keeps service tests and future callers consistent.

- [ ] **Step 5: Update series creation and mutation methods**

Change `createSeries` from `userId: string` to `accessInput: RecipeDesignerAccessInput` and add:

```ts
const context = normalizeRecipeDesignerAccessContext(accessInput);
const userId = context.userId;
```

Change `createSeriesStageDraft` from `userId: string` to `accessInput: RecipeDesignerAccessInput` and add:

```ts
const context = normalizeRecipeDesignerAccessContext(accessInput);
const userId = context.userId;
```

After the existing invalid-series check in `createSeriesStageDraft`, add:

```ts
            if (!(await this.assertSeriesAccessibleByContext(series, context))) {
              throw new NotFoundException(
                `Recipe series ${seriesId} not found`,
              );
            }
```

Change `renameSeries` to:

```ts
  async renameSeries(
    seriesId: string,
    dto: RenameRecipeSeriesDto,
    accessInput: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(accessInput);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('请填写系列名称');
    }

    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
    });
    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt ||
      !(await this.assertSeriesAccessibleByContext(series, context))
    ) {
      throw new NotFoundException(`Recipe series ${seriesId} not found`);
    }

    return this.prisma.recipeSeries.update({
      where: { id: seriesId },
      data: { name },
    });
  }
```

Change `deleteSeries` to normalize context:

```ts
  async deleteSeries(
    seriesId: string,
    dto: DeleteRecipeSeriesDto,
    accessInput: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(accessInput);
    const userId = context.userId;
```

And update its invalid-series check to include access:

```ts
      !(await this.assertSeriesAccessibleByContext(series, context))
```

- [ ] **Step 6: Run backend service tests**

Run:

```bash
cd backend
npm test -- --runInBand tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run controller tests again**

Run:

```bash
cd backend
npm test -- --runInBand tests/interfaces/controllers/recipe-designer.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit backend service ownership**

Run:

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
git commit -m "fix: isolate recipe designer private drafts"
```

---

### Task 4: Lock Homepage Public Entry

**Files:**
- Modify: `miniapp/src/pages/home.regression.spec.ts`
- Modify later: `miniapp/src/pages/home/index.vue`
- Create later: `miniapp/src/static/home-actions/recipe-designer.png`

- [ ] **Step 1: Update homepage quick-action tests**

In `miniapp/src/pages/home.regression.spec.ts`, add this test after `keeps the feedback quick action entry on the home page`:

```ts
  it('adds a recipe designer quick action immediately after feedback', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    );

    expect(source).toContain('食谱设计');
    expect(source).toContain('@tap="goToRecipeDesigner"');
    expect(source).toContain('src="/static/home-actions/recipe-designer.png"');
    expect(source).toContain("/pages/recipe-designer/list");

    const feedbackIndex = source.indexOf('@tap="goToFeedback"');
    const designerIndex = source.indexOf('@tap="goToRecipeDesigner"');
    expect(feedbackIndex).toBeGreaterThan(-1);
    expect(designerIndex).toBeGreaterThan(feedbackIndex);
  });
```

- [ ] **Step 2: Extend the static asset test**

In `keeps each homepage quick action backed by a static PNG asset`, change the array to:

```ts
    const actionIconNames = [
      'calculate-portion',
      'weight-management',
      'health-records',
      'feedback',
      'recipe-designer',
    ];
```

- [ ] **Step 3: Run homepage tests and verify they fail**

Run:

```bash
cd miniapp
npm test -- src/pages/home.regression.spec.ts
```

Expected: FAIL because the homepage does not yet include `食谱设计`, `goToRecipeDesigner`, or the static PNG.

---

### Task 5: Implement Homepage Public Entry

**Files:**
- Modify: `miniapp/src/pages/home/index.vue`
- Create: `miniapp/src/static/home-actions/recipe-designer.png`
- Modify: `miniapp/src/pages/home.regression.spec.ts`

- [ ] **Step 1: Add the new quick-action markup**

In `miniapp/src/pages/home/index.vue`, add this block immediately after the existing `建议反馈` quick action:

```vue
      <view class="action-item" @tap="goToRecipeDesigner">
        <image class="action-icon" src="/static/home-actions/recipe-designer.png" mode="aspectFit" />
        <text class="action-text">食谱设计</text>
      </view>
```

- [ ] **Step 2: Add the route handler**

In the `<script setup>` section, after `goToFeedback`, add:

```ts
const goToRecipeDesigner = () => {
  if (!isLoggedIn.value) {
    goToLogin()
    return
  }
  uni.navigateTo({ url: '/pages/recipe-designer/list' })
}
```

- [ ] **Step 3: Stabilize five quick-action layout**

In the `.quick-actions` CSS block, add `gap: 8px;`:

```scss
.quick-actions {
  display: flex;
  justify-content: space-around;
  gap: 8px;
  background: white;
  margin: 15px 15px 15px;
  border-radius: 12px;
  padding: 20px 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}
```

In `.action-item`, add flex constraints:

```scss
.action-item {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 4: Create the recipe designer static PNG**

Run:

```bash
cp miniapp/src/static/home-actions/feedback.png miniapp/src/static/home-actions/recipe-designer.png
```

Expected: `miniapp/src/static/home-actions/recipe-designer.png` exists. This preserves the static asset contract; a final custom icon can replace the copied asset later.

- [ ] **Step 5: Run homepage tests**

Run:

```bash
cd miniapp
npm test -- src/pages/home.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit homepage entry**

Run:

```bash
git add miniapp/src/pages/home/index.vue miniapp/src/pages/home.regression.spec.ts miniapp/src/static/home-actions/recipe-designer.png
git commit -m "feat: add public recipe designer home entry"
```

---

### Task 6: Lock Miniapp Customer Mode

**Files:**
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`
- Modify later: `miniapp/src/pages/recipe-designer/list.vue`
- Modify later: `miniapp/src/pages/recipe-designer/editor.vue`
- Modify later: `miniapp/src/pages/recipe-designer/publish.vue`

- [ ] **Step 1: Add customer-mode list page regression**

In `miniapp/src/pages/recipe-designer.regression.spec.ts`, inside `describe('recipe designer mobile entry', () => { ... })`, add:

```ts
  it('supports a customer mode list copy for private life-stage drafts', () => {
    expect(listSource).toContain('isCustomerMode')
    expect(listSource).toContain('按生命阶段维护通用食谱草稿')
    expect(listSource).toContain('暂无食谱草稿')
    expect(listSource).toContain('点击新建食谱开始设计')
    expect(listSource).toContain('v-if="canManageSupplementLibrary"')
    expect(listSource).toContain('formatSeriesMeta(seriesItem)')
    expect(listSource).not.toContain('为某只狗设计')
  })
```

- [ ] **Step 2: Add customer-mode editor regression**

Inside `describe('recipe designer editor guardrails', () => { ... })`, add:

```ts
  it('keeps customer mode out of internal supplement and revision flows', () => {
    expect(editorSource).toContain('isCustomerMode')
    expect(editorSource).toContain('canCreateRevisionDraft')
    expect(editorSource).toContain('if (!canCreateRevisionDraft.value)')
    expect(editorSource).toContain('showSupplementLibraryTip')
    expect(editorSource).toContain('canCreateSupplementOption.value')
    expect(editorSource).toContain('当前草稿评估结果')
    expect(editorSource).not.toContain('为某只狗设计')
  })
```

- [ ] **Step 3: Add nutrition report publish-copy regression**

Inside the existing publish/report regression area in `miniapp/src/pages/recipe-designer.regression.spec.ts`, add:

```ts
  it('shows nutrition report copy to customers without backend publish language', () => {
    expect(publishSource).toContain('isCustomerMode')
    expect(publishSource).toContain('reportPageTitle')
    expect(publishSource).toContain('营养报告')
    expect(publishSource).toContain('提交后台草稿')
    expect(publishSource).toContain('canPublishRecipe')
    expect(publishSource).toContain("currentUserRole.value === 'ADMIN'")
  })
```

- [ ] **Step 4: Run recipe designer regressions and verify they fail**

Run:

```bash
cd miniapp
npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: FAIL because customer-mode helpers and copy do not yet exist.

---

### Task 7: Implement Miniapp Customer Mode

**Files:**
- Modify: `miniapp/src/pages/recipe-designer/list.vue`
- Modify: `miniapp/src/pages/recipe-designer/editor.vue`
- Modify: `miniapp/src/pages/recipe-designer/publish.vue`
- Modify: `miniapp/src/pages/recipe-designer.regression.spec.ts`

- [ ] **Step 1: Add role helpers to the list page**

In `miniapp/src/pages/recipe-designer/list.vue`, import `computed`:

```ts
import { computed, ref } from 'vue'
```

Add these refs/computed values near the existing state refs:

```ts
const currentUserRole = ref('')

const isCustomerMode = computed(() => {
  return currentUserRole.value !== 'STAFF' && currentUserRole.value !== 'ADMIN'
})

const canManageSupplementLibrary = computed(() => !isCustomerMode.value)

const listSubtitle = computed(() =>
  isCustomerMode.value ? '按生命阶段维护通用食谱草稿' : '食谱系列与生命阶段',
)

const emptyTitle = computed(() =>
  isCustomerMode.value ? '暂无食谱草稿' : '暂无食谱系列',
)

const emptySubtitle = computed(() =>
  isCustomerMode.value ? '点击新建食谱开始设计' : '点击新建食谱开始设计',
)
```

Add this helper near `formatDateTime`:

```ts
function getCurrentUserRole() {
  try {
    const rawUserInfo = uni.getStorageSync('userInfo') || uni.getStorageSync('user')
    const userInfo =
      typeof rawUserInfo === 'string'
        ? rawUserInfo
          ? JSON.parse(rawUserInfo)
          : null
        : rawUserInfo
    return String(userInfo?.role || userInfo?.user?.role || '').toUpperCase()
  } catch (error) {
    console.warn('[RecipeDesignerList] Failed to read current user role:', error)
    return ''
  }
}
```

In `onShow`, set the role before loading:

```ts
onShow(() => {
  currentUserRole.value = getCurrentUserRole()
  loadSeries()
})
```

- [ ] **Step 2: Update list page template copy and hidden library button**

In `miniapp/src/pages/recipe-designer/list.vue`, change:

```vue
        <text class="page-subtitle">食谱系列与生命阶段</text>
```

to:

```vue
        <text class="page-subtitle">{{ listSubtitle }}</text>
```

Change:

```vue
        <button class="library-btn" @tap="goToSupplementLibrary">补剂库</button>
```

to:

```vue
        <button v-if="canManageSupplementLibrary" class="library-btn" @tap="goToSupplementLibrary">补剂库</button>
```

Change empty state copy:

```vue
      <text class="empty-title">{{ emptyTitle }}</text>
      <text class="empty-subtitle">{{ emptySubtitle }}</text>
```

Replace the series meta text:

```vue
              {{ formatSeriesMeta(seriesItem) }}
```

and add this helper:

```ts
function formatSeriesMeta(seriesItem: RecipeDesignerSeriesCard) {
  const editedText = `最近编辑 ${formatDateTime(seriesItem.updatedAt)}`
  if (isCustomerMode.value) {
    return editedText
  }
  return `${editedText} · 已发布 ${seriesItem.publishedStageCount || 0}/5`
}
```

- [ ] **Step 3: Gate published template copying for customers**

In `openSeriesStage`, change:

```ts
  const templateStages = getPublishedTemplateStages(seriesItem, stage)
```

to:

```ts
  const templateStages = isCustomerMode.value ? [] : getPublishedTemplateStages(seriesItem, stage)
```

This prevents customer mode from offering internal published-stage templates even if a malformed response includes them.

- [ ] **Step 4: Add customer mode to the editor**

In `miniapp/src/pages/recipe-designer/editor.vue`, add:

```ts
const isCustomerMode = computed(() => {
  return currentUserRole.value !== 'STAFF' && currentUserRole.value !== 'ADMIN'
})

const canCreateRevisionDraft = computed(() => !isCustomerMode.value)
```

Change `ensureEditableDraftAfterLoad` so customer mode does not call the revision endpoint:

```ts
async function ensureEditableDraftAfterLoad(draft: any) {
  if (!isPublishedDraftRecord({
    status: String(draft?.status || ''),
    publishedRecipeId: draft?.publishedRecipeId,
    publishedAt: draft?.publishedAt,
  })) {
    return false
  }
  if (!canCreateRevisionDraft.value) {
    uni.showToast({ title: '该食谱草稿不可编辑', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return true
  }
  if (!draftId.value || redirectingToEditableDraft.value) return true
```

Change `assessmentStandardContextLabel` fallback copy to include the customer-safe phrase. If the computed currently returns only standard/life-stage text, prepend:

```ts
return `当前草稿评估结果 · ${standardName} · ${lifeStage}`
```

Keep `showSupplementLibraryTip` as-is, because it already depends on `canCreateSupplementOption.value`.

- [ ] **Step 5: Add customer mode to the nutrition report page**

In `miniapp/src/pages/recipe-designer/publish.vue`, add:

```ts
const isCustomerMode = computed(() => {
  return currentUserRole.value !== 'STAFF' && currentUserRole.value !== 'ADMIN'
})

const reportPageTitle = computed(() =>
  isCustomerMode.value ? '营养报告' : '提交后台草稿',
)
```

Change the navigation title setup from:

```ts
uni.setNavigationBarTitle({ title: '提交后台草稿' })
```

to:

```ts
uni.setNavigationBarTitle({ title: reportPageTitle.value })
```

Add a watcher after `onLoad`/`onShow` setup:

```ts
watch(reportPageTitle, (title) => {
  uni.setNavigationBarTitle({ title })
})
```

If the template has a static page title or submit-only explanatory copy, bind it to `reportPageTitle` for the title while keeping publish controls guarded by:

```vue
v-if="canPublishRecipe"
```

- [ ] **Step 6: Run recipe designer regressions**

Run:

```bash
cd miniapp
npm test -- src/pages/recipe-designer.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit miniapp customer mode**

Run:

```bash
git add miniapp/src/pages/recipe-designer/list.vue miniapp/src/pages/recipe-designer/editor.vue miniapp/src/pages/recipe-designer/publish.vue miniapp/src/pages/recipe-designer.regression.spec.ts
git commit -m "feat: add customer mode for recipe designer"
```

---

### Task 8: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
cd backend
npm test -- --runInBand tests/interfaces/controllers/recipe-designer.controller.spec.ts tests/application/recipe-designer/recipe-designer.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted miniapp tests**

Run:

```bash
cd miniapp
npm test -- src/pages/home.regression.spec.ts src/pages/recipe-designer.regression.spec.ts src/api/recipe-designer.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Build the miniapp if targeted tests pass**

Run:

```bash
cd miniapp
npm run build:mp-weixin
```

Expected: build exits with code 0. If build fails because of unrelated local configuration, record the exact error and keep the targeted test results as the minimum verification.

- [ ] **Step 4: Review git diff for scope**

Run:

```bash
git diff --stat HEAD
git diff --name-status HEAD
```

Expected changed files are limited to:

```text
backend/src/application/recipe-designer/recipe-designer.service.ts
backend/src/interfaces/controllers/recipe-designer.controller.ts
backend/tests/application/recipe-designer/recipe-designer.service.spec.ts
backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts
miniapp/src/pages/home.regression.spec.ts
miniapp/src/pages/home/index.vue
miniapp/src/pages/recipe-designer.regression.spec.ts
miniapp/src/pages/recipe-designer/editor.vue
miniapp/src/pages/recipe-designer/list.vue
miniapp/src/pages/recipe-designer/publish.vue
miniapp/src/static/home-actions/recipe-designer.png
```

There may already be unrelated dirty files in this worktree. Do not stage or revert unrelated files.

- [ ] **Step 5: Manual smoke checklist**

Use WeChat DevTools or the miniapp build output to check:

```text
1. Customer account sees homepage quick action order:
   饭量计算, 体重管理, 健康记录, 建议反馈, 食谱设计.
2. Customer tapping 食谱设计 enters /pages/recipe-designer/list.
3. Customer list page says 按生命阶段维护通用食谱草稿.
4. Customer can create a series and open a life-stage draft.
5. Customer does not see 补剂库 on list or supplement maintenance prompts in editor.
6. Customer nutrition report does not show publish controls.
7. Staff/admin can still access supplement library from the designer list.
8. Admin can still publish through the existing report/publish page.
```

- [ ] **Step 6: Final commit if there are verification-only fixes**

If any small verification fixes were needed after the task commits, run:

```bash
git add backend/src/application/recipe-designer/recipe-designer.service.ts backend/src/interfaces/controllers/recipe-designer.controller.ts backend/tests/application/recipe-designer/recipe-designer.service.spec.ts backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts miniapp/src/pages/home.regression.spec.ts miniapp/src/pages/home/index.vue miniapp/src/pages/recipe-designer.regression.spec.ts miniapp/src/pages/recipe-designer/editor.vue miniapp/src/pages/recipe-designer/list.vue miniapp/src/pages/recipe-designer/publish.vue miniapp/src/static/home-actions/recipe-designer.png
git commit -m "test: verify public recipe designer private drafts"
```

Expected: commit succeeds only if there were post-task verification edits. Skip this commit if the previous task commits already contain all changes.
