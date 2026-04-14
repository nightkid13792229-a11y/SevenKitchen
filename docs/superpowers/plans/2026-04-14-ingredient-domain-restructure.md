# Ingredient Domain Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将食材保留为三层模型，同时把补剂与包材重构为单层产品模型，并新增食谱补剂替代选项，使补剂计算统一改由 `nutrition_profile` 推导。

**Architecture:** 先在后端补齐“类型分治”的数据模型与 DTO 契约，再把补剂/包材的后台编辑页改为单层产品编辑，随后引入统一的补剂营养浓度解析 helper，逐步替换 `properties.active_nutrients` 的直接消费。最后再补食谱补剂替代选项、小程序 DIY 制作单切换逻辑，以及历史数据迁移脚本与运营治理流程。

**Tech Stack:** NestJS、Prisma、Jest、Vue 3 + Element Plus admin-web、uni-app Vue 3 miniapp

---

## File Structure

### Backend schema and domain

- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260414180000_ingredient_domain_restructure/migration.sql`
- Create: `backend/src/domain/ingredient/supplement-nutrition-resolver.ts`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `backend/src/domain/pricing/pricing.service.ts`
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/application/ingredient/recommended-product.service.ts`
- Modify: `backend/src/application/ingredient/procurement-sku.service.ts`
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`

### Admin web

- Modify: `admin-web/src/types/ingredient.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/api/recipes.ts`
- Modify: `admin-web/src/views/Ingredients/index.vue`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Modify: `admin-web/src/utils/ingredientNutrition.ts`

### Miniapp

- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/staff-production/detail.vue`
- Modify: `miniapp/src/pages/staff-production/print-task.vue`
- Modify: `miniapp/src/utils/canvas-printer.ts`
- Modify: `miniapp/src/utils/label-renderer.ts`

### Migration and verification

- Create: `backend/prisma/backfill-supplement-packaging-single-layer.ts`
- Create: `backend/prisma/backfill-recipe-supplement-alternatives.ts`
- Create: `backend/tests/domain/ingredient/supplement-nutrition-resolver.spec.ts`
- Create: `backend/tests/application/ingredient/ingredient-single-layer-guards.spec.ts`
- Create: `backend/tests/application/recipe/recipe-supplement-alternatives.spec.ts`
- Create: `backend/tests/prisma/backfill-supplement-packaging-single-layer.spec.ts`
- Modify: `docs/reports/2026-04-13-production-deploy-checklist-and-batch-1-governance.md`

## Task 1: Add Type-Specific Ingredient Model Contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260414180000_ingredient_domain_restructure/migration.sql`
- Modify: `backend/src/domain/ingredient/types.ts`
- Modify: `admin-web/src/types/ingredient.ts`
- Test: `backend/tests/application/ingredient/ingredient-single-layer-guards.spec.ts`

- [ ] **Step 1: Write the failing guard test for food-only SKU children**

```ts
it('rejects recommended products for non-food ingredients', async () => {
  await expect(
    service.createRecommendedProduct(supplementId, {
      name: '维生素E推荐商品',
      brand: 'NOW FOODS',
    }),
  ).rejects.toThrow('Only FOOD ingredients can own recommended products');
});

it('rejects procurement skus for packaging once single-layer model is enabled', async () => {
  await expect(
    procurementSkuService.create(packagingId, {
      name: '4号泡沫箱 SKU',
      purchaseChannel: '盒马',
    }),
  ).rejects.toThrow('Only FOOD ingredients can own procurement SKUs');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd backend
npm test -- tests/application/ingredient/ingredient-single-layer-guards.spec.ts --runInBand
```

Expected: fail because current services still allow `SUPPLEMENT` / `PACKAGING` to create child SKU records.

- [ ] **Step 3: Add the schema changes**

Add ingredient-level enable flags and recipe supplement alternative table:

```prisma
model Ingredient {
  id                 String   @id @default(uuid())
  diyEnabled         Boolean  @default(false) @map("diy_enabled")
  procurementEnabled Boolean  @default(false) @map("procurement_enabled")
  // existing fields...
  recipeSupplementAlternatives RecipeSupplementAlternative[]
}

model RecipeSupplementAlternative {
  id                    String   @id @default(uuid())
  recipeItemId          String   @map("recipe_item_id")
  alternativeIngredientId String @map("alternative_ingredient_id")
  sortOrder             Int      @default(0) @map("sort_order")
  isActive              Boolean  @default(true) @map("is_active")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  recipeItem            RecipeItem  @relation(fields: [recipeItemId], references: [id], onDelete: Cascade)
  alternativeIngredient Ingredient  @relation(fields: [alternativeIngredientId], references: [id], onDelete: Restrict)

  @@unique([recipeItemId, alternativeIngredientId])
  @@index([recipeItemId])
  @@index([alternativeIngredientId])
  @@map("recipe_supplement_alternative")
}
```

- [ ] **Step 4: Update domain and frontend ingredient types**

Make the split explicit in shared types:

```ts
export interface SupplementProperties {
  category_type: string;
  add_timing?: string;
  production_loss_rate?: number;
  display_unit?: string;
  purchase_link?: PurchaseLinkConfig;
  image_url?: string | null;
  marketing_highlights?: Record<string, ActiveNutrientValue>;
  active_nutrients?: Record<string, ActiveNutrientValue>; // derived cache only
}

export interface PackagingProperties {
  is_consumable: boolean;
  linked_item_id?: string;
  supplier_name?: string | null;
}
```

- [ ] **Step 5: Enforce the new guard behavior**

In `RecommendedProductService` and `ProcurementSkuService`, gate CRUD to `FOOD` only:

```ts
if (ingredient.type !== IngredientType.FOOD) {
  throw new BadRequestException('Only FOOD ingredients can own recommended products');
}
```

- [ ] **Step 6: Re-run the guard test**

Run:

```bash
cd backend
npm test -- tests/application/ingredient/ingredient-single-layer-guards.spec.ts --runInBand
```

Expected: pass.

## Task 2: Convert Admin Ingredient Editing to Type-Specific Single-Layer Flows

**Files:**
- Modify: `admin-web/src/views/Ingredients/index.vue`
- Modify: `admin-web/src/views/Ingredients/IngredientForm.vue`
- Modify: `admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue`
- Modify: `admin-web/src/api/ingredients.ts`
- Modify: `admin-web/src/types/ingredient.ts`

- [ ] **Step 1: Write a failing UI expectation checklist in comments/tests**

Document the desired UI states before changing code:

```ts
// FOOD: keep DIY 推荐商品 + 采购 SKU sections
// SUPPLEMENT: hide child SKU sections, show diyEnabled/procurementEnabled toggles
// PACKAGING: hide nutrition entry and DIY controls, show procurementEnabled only
```

- [ ] **Step 2: Make ingredient list actions type-aware**

Refactor the operation column rules:

```vue
<el-button v-if="row.type !== IngredientType.PACKAGING" @click="openNutritionDialog(row)">
  营养数据
</el-button>
<el-tag v-if="row.type === IngredientType.SUPPLEMENT">
  DIY {{ row.diyEnabled ? '启用' : '关闭' }}
</el-tag>
<el-tag v-if="row.type !== IngredientType.FOOD">
  采购 {{ row.procurementEnabled ? '启用' : '关闭' }}
</el-tag>
```

- [ ] **Step 3: Split `IngredientForm.vue` into three UI paths**

Keep existing food sections, add supplement/package direct fields:

```vue
<template v-if="formData.type === IngredientType.SUPPLEMENT">
  <el-form-item label="启用 DIY 推荐">
    <el-switch v-model="formData.diyEnabled" />
  </el-form-item>
  <el-form-item label="启用采购/生产">
    <el-switch v-model="formData.procurementEnabled" />
  </el-form-item>
  <el-form-item label="购买链接">
    <PurchaseLinkEditor v-model="supplementProperties.purchase_link" />
  </el-form-item>
</template>
```

- [ ] **Step 4: Remove child SKU editing from supplement and packaging forms**

Guard the existing sections:

```vue
<template v-if="isEdit && formData.type === IngredientType.FOOD">
  <!-- 家庭 DIY 推荐商品 -->
  <!-- 生产采购 SKU -->
</template>
```

- [ ] **Step 5: Update nutrition dialog copy for supplements**

The header should explain that supplement nutrition data directly drives concentration and default dosage:

```vue
<div class="dialog-desc">
  该补剂产品的营养数据将直接影响营养目标、定价预览与 DIY 制作单中的默认添加量。
</div>
```

- [ ] **Step 6: Build admin-web to catch template/type regressions**

Run:

```bash
cd admin-web
npm run build
```

Expected: build passes.

## Task 3: Introduce a Unified Supplement Nutrition Resolver

**Files:**
- Create: `backend/src/domain/ingredient/supplement-nutrition-resolver.ts`
- Modify: `backend/src/application/ingredient/ingredient.service.ts`
- Modify: `backend/src/domain/pricing/pricing.service.ts`
- Modify: `admin-web/src/utils/ingredientNutrition.ts`
- Test: `backend/tests/domain/ingredient/supplement-nutrition-resolver.spec.ts`

- [ ] **Step 1: Write the failing resolver test**

```ts
it('resolves supplement nutrient concentration from nutrition profile instead of legacy active_nutrients', () => {
  const result = resolveSupplementNutrients({
    baseUnit: 'PCS',
    nutritionProfile: {
      meta: { rawBasisType: 'PER_SERVING', servingWeightG: 0.5 },
      vitamins: { vitaminE: 200, vitaminA: null, vitaminD: null, ... },
      minerals: { iodine: null, ... },
      macros: { ... },
      fattyAcids: { ... },
      aminoAcids: { ... },
      customItems: [],
    },
  });

  expect(result['维生素E']).toEqual({ value: 200, unit: 'IU' });
});
```

- [ ] **Step 2: Implement the resolver helper**

```ts
export function resolveSupplementNutrients(ingredient: {
  nutritionProfile: NutritionProfile | null;
  baseUnit: BaseUnit;
}): Record<string, ActiveNutrientValue> {
  const profile = normalizeNutritionProfileForRead(ingredient.nutritionProfile);
  return buildSupplementActiveNutrientsFromNutritionProfile(profile, {});
}
```

- [ ] **Step 3: Use the resolver in ingredient writes**

`ingredient.service.ts` should derive `properties.active_nutrients` from `nutritionProfile` whenever a supplement is created or updated:

```ts
if (nextType === IngredientType.SUPPLEMENT) {
  supplementProperties.active_nutrients = resolveSupplementNutrients({
    baseUnit: nextBaseUnit,
    nutritionProfile: nextNutritionProfile,
  });
}
```

- [ ] **Step 4: Replace direct `active_nutrients` reads in pricing with the resolver output**

```ts
const activeNutrients = resolveSupplementNutrients(ingredient);
const concentration = activeNutrients[targetKey]?.value ?? 0;
```

- [ ] **Step 5: Re-run resolver and pricing tests**

Run:

```bash
cd backend
npm test -- tests/domain/ingredient/supplement-nutrition-resolver.spec.ts tests/application/ingredient/ingredient-domain-refactor.spec.ts --runInBand
```

Expected: pass.

## Task 4: Add Recipe Supplement Alternatives to Backend and Admin Recipe Editing

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`
- Modify: `admin-web/src/types/recipe.ts`
- Modify: `admin-web/src/views/Recipes/RecipeForm.vue`
- Test: `backend/tests/application/recipe/recipe-supplement-alternatives.spec.ts`

- [ ] **Step 1: Write the failing recipe alternatives test**

```ts
it('persists supplement alternatives on a supplement recipe item', async () => {
  const saved = await service.updateRecipe(recipeId, {
    items: [
      {
        ingredientId: vitaminEDefaultId,
        nutrientTargetKey: '维生素E',
        nutrientTargetValue: 1200,
        supplementAlternatives: [vitaminE400Id, vitaminENaturalId],
      },
    ],
  });

  expect(saved.items[0].supplementAlternatives).toHaveLength(2);
});
```

- [ ] **Step 2: Extend recipe DTOs and repository mapping**

```ts
export class AdminRecipeItemDto {
  ingredientId!: string;
  nutrientTargetKey?: string;
  nutrientTargetValue?: number;
  supplementAlternativeIngredientIds?: string[];
}
```

- [ ] **Step 3: Validate alternatives are supplement ingredients and not duplicates**

```ts
if (item.supplementAlternativeIngredientIds?.length) {
  ensureIngredientType(defaultIngredient, IngredientType.SUPPLEMENT);
  ensureAllAlternativeIngredientsAreSupplements(alternativeIngredients);
  ensureUniqueIds(item.supplementAlternativeIngredientIds);
}
```

- [ ] **Step 4: Add admin recipe editor UI**

In the supplement editor section:

```vue
<el-form-item label="替代补剂">
  <el-select
    v-model="ingredientForm.supplementAlternativeIngredientIds"
    multiple
    filterable
    placeholder="可选多个候选补剂"
  >
    <el-option
      v-for="option in availableSupplementAlternatives"
      :key="option.id"
      :label="option.name"
      :value="option.id"
    />
  </el-select>
</el-form-item>
```

- [ ] **Step 5: Re-run recipe tests**

Run:

```bash
cd backend
npm test -- tests/application/recipe/recipe-supplement-alternatives.spec.ts --runInBand
```

Expected: pass.

## Task 5: Switch DIY Sheet and Read Models to Supplement Alternatives

**Files:**
- Modify: `miniapp/src/pages/diy-sheet/index.vue`
- Modify: `miniapp/src/pages/recipe-detail/index.vue`
- Modify: `miniapp/src/pages/staff-production/detail.vue`
- Modify: `miniapp/src/pages/staff-production/print-task.vue`
- Modify: `miniapp/src/utils/canvas-printer.ts`
- Modify: `miniapp/src/utils/label-renderer.ts`

- [ ] **Step 1: Preserve food behavior and fork supplement behavior**

Food keeps `recommendedProductsMap`; supplements switch to recipe alternatives:

```ts
const supplementAlternatives = item.supplementAlternatives || [];
const selectedAlternative = supplementAlternatives[selectedAlternativeIndex] || null;
const supplementIngredient = selectedAlternative?.ingredient || item.ingredient;
```

- [ ] **Step 2: Recalculate supplement amount from selected alternative ingredient**

```ts
const nutrientLookup = supplementIngredient.properties?.active_nutrients || {};
const concentration = nutrientLookup[item.nutrientTargetKey!]?.value;
const totalNutrientNeeded = item.nutrientTargetValue! * (totalFoodNetWeightG.value / 1000);
const amount = totalNutrientNeeded / concentration * (1 + globalSupplementLossRate.value);
```

- [ ] **Step 3: Use ingredient direct product info instead of recommended product for supplements**

```ts
name: supplementIngredient.name,
brand: supplementIngredient.brand || '-',
productModel: supplementIngredient.productModel,
purchaseChannel: supplementIngredient.purchaseChannel,
displayUnit: supplementIngredient.baseUnitDisplayName || supplementIngredient.unitDisplayLabel || item.unit,
```

- [ ] **Step 4: Update recipe detail / print / label rendering to use the same supplement lookup**

Keep these readers aligned so units do not diverge between screens.

- [ ] **Step 5: Build the miniapp**

Run:

```bash
cd miniapp
npm run build:mp-weixin
```

Expected: build passes.

## Task 6: Flatten Historical Supplement and Packaging Data

**Files:**
- Create: `backend/prisma/backfill-supplement-packaging-single-layer.ts`
- Create: `backend/prisma/backfill-recipe-supplement-alternatives.ts`
- Create: `backend/tests/prisma/backfill-supplement-packaging-single-layer.spec.ts`
- Modify: `docs/reports/2026-04-13-production-deploy-checklist-and-batch-1-governance.md`

- [ ] **Step 1: Write the migration script dry-run test**

```ts
it('splits a supplement with multiple product children into separate supplement ingredients in dry-run output', async () => {
  const result = await dryRunSupplementPackagingFlattening(fixtures.multipleSupplementProducts);

  expect(result.createIngredients).toHaveLength(2);
  expect(result.archiveRecommendedProducts).toHaveLength(2);
  expect(result.createRecipeAlternatives).toContainEqual(
    expect.objectContaining({ targetRecipeItemId: 'recipe-item-1' }),
  );
});
```

- [ ] **Step 2: Implement dry-run/apply migration commands**

The script should:

```ts
// 1. flatten simple supplement/package rows in place
// 2. split multi-product supplement/package rows into new ingredients
// 3. generate recipe supplement alternatives for split supplement products
// 4. archive or delete old non-food recommended_product / procurement_sku rows
```

- [ ] **Step 3: Add rollout documentation**

Document:

- preconditions
- dry-run commands
- expected audit output
- apply order
- rollback points

- [ ] **Step 4: Run script tests**

Run:

```bash
cd backend
npm test -- tests/prisma/backfill-supplement-packaging-single-layer.spec.ts --runInBand
```

Expected: pass.

## Task 7: Full Verification and Rollout Readiness

**Files:**
- Modify: none
- Test: all touched backend/admin/miniapp targets

- [ ] **Step 1: Run backend targeted tests**

```bash
cd backend
npm test -- \
  tests/application/ingredient/ingredient-single-layer-guards.spec.ts \
  tests/domain/ingredient/supplement-nutrition-resolver.spec.ts \
  tests/application/recipe/recipe-supplement-alternatives.spec.ts \
  tests/prisma/backfill-supplement-packaging-single-layer.spec.ts \
  --runInBand
```

- [ ] **Step 2: Regenerate Prisma client and build backend**

```bash
cd backend
npx prisma generate
npm run build
```

- [ ] **Step 3: Build admin-web**

```bash
cd admin-web
npm run build
```

- [ ] **Step 4: Build miniapp**

```bash
cd miniapp
npm run build:mp-weixin
```

- [ ] **Step 5: Run a manual smoke checklist**

Verify:

- 食材仍显示 DIY 推荐 SKU / 采购 SKU 区块
- 补剂编辑页不再出现 child SKU 区块
- 包材不再出现营养数据入口
- 食谱编辑页可以给补剂配置替代项
- DIY 制作单切换替代补剂后，用量与品牌信息同步变化
