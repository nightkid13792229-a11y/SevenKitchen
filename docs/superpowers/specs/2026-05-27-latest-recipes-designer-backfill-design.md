# Latest Recipes Designer Backfill Design

## Goal

Deploying the new recipe designer should preserve production recipe data while giving every current production recipe an immutable published designer source draft. Only the latest version for each business `recipeId` is backfilled into the designer workflow.

## Scope

In scope:
- Read existing `Recipe` and `RecipeItem` records.
- Select one latest version per `recipeId`.
- Create missing `DesignRecipe`, `DesignRecipeItem`, and `DesignRecipePublishSnapshot` records.
- Resolve each item nutrition profile from `RecipeItem.nutritionFoodId`, the ingredient's primary `NutritionFoodMapping`, or a compatibility `NutritionFood` created from a legacy ingredient nutrition profile.
- Provide a dry-run report before any write.
- Make the write path idempotent and guarded by `--apply`.

Out of scope:
- Rebuilding historical designer drafts for older recipe versions.
- Replacing production recipe tables with local data.
- Mutating orders, favorite records, reviews, share tokens, or production tasks.
- Broad ingredient/nutrition master-data reconciliation. A local mirror can overlay already-reviewed local nutrition master data before this script runs.

## Data Model Mapping

Each latest `Recipe` maps to one published `DesignRecipe`.

- `DesignRecipe.name` comes from `Recipe.name`.
- `DesignRecipe.version` uses the next available designer draft version for the recipe name.
- `DesignRecipe.status` is `PUBLISHED`.
- `DesignRecipe.publishedRecipeId` is `Recipe.recipeId`.
- `DesignRecipe.publishedRecipeVersion` is `Recipe.version`.
- `DesignRecipe.createdBy` is a script actor, `recipe-designer-backfill`.
- `DesignRecipe.totalWeightG` is the sum of included item `exampleWeight` values.
- `DesignRecipe.energyDensityKcalPerKg` comes from `Recipe.energyDensityKcalPerKg`.
- `DesignRecipe.targetHealthTags` and `applicableLifeStages` are normalized from recipe JSON arrays.
- `DesignRecipe.notes` comes from `Recipe.description`.

Each `RecipeItem` maps to one `DesignRecipeItem`.

- `DesignRecipeItem.ingredientId` comes from `RecipeItem.ingredientId`.
- `DesignRecipeItem.nutritionFoodId` comes from `RecipeItem.nutritionFoodId`, then the ingredient primary mapping, then a script-created compatibility profile if the ingredient has a usable legacy `nutritionProfile`.
- `DesignRecipeItem.weightG` comes from `RecipeItem.exampleWeight`; supplement items without a positive weight are kept at `0`.
- `DesignRecipeItem.ratioPercent`, `preparationMethod`, nutrient target fields, and `sortOrder` are copied.
- `DesignRecipeItem.includeInAssessment` is `true` only when the source item has a positive `exampleWeight`.

Each backfilled design draft gets one `DesignRecipePublishSnapshot` pointing to the existing latest recipe version.

## Safety Rules

- The script defaults to dry-run and never writes unless `--apply` is present.
- The script must not delete recipes.
- The script must skip a recipe if a published designer draft already points to the same `recipeId` and `recipeVersion`.
- The script reports blocking issues before apply:
  - item missing `nutritionFoodId`, ingredient mapping, and usable legacy nutrition profile
  - non-supplement item missing finite positive `exampleWeight`
  - recipe missing items
  - recipe missing finite `energyDensityKcalPerKg`
- Apply should create data in a transaction per recipe.
- Production use requires a DB backup and a dry-run report with zero blocking issues.

## Local Mirror Procedure

For the 2026-05-27 production mirror, production recipe rows were restored into a separate local database and current local nutrition master data was overlaid before running the backfill:

- Local mirror DB: `sevenkitchen_prod_mirror_20260527`
- Production dump: `tmp/prod-mirror/sevenkitchen_prod_20260527_221110.dump`
- Mirror pre-overlay backup: `tmp/prod-mirror/before-local-nutrition-overlay-20260527.dump`
- Local nutrition overlay dump: `tmp/prod-mirror/local-nutrition-master-overlay-20260527.dump`

The overlay included `nutrition_food`, `nutrition_food_mapping`, `nutrition_source_record`, `ingredient_nutrition_candidate`, `supplement_nutrition_draft`, `nutrition_nutrient_definition`, `nutrition_standard_version`, and `nutrition_standard_entry`.

## CLI

Script path:

```bash
backend/scripts/backfill-latest-recipes-to-designer.ts
```

Dry run:

```bash
ENV_FILE=.env.production-readonly npm run backfill:latest-recipes-to-designer
```

Apply:

```bash
ENV_FILE=.env.production npm run backfill:latest-recipes-to-designer -- --apply
```

Optional filters:

```bash
npm run backfill:latest-recipes-to-designer -- --recipe-id recipe-123
npm run backfill:latest-recipes-to-designer -- --include-draft-status
```

## Verification

Tests must cover:
- Latest version selection.
- Dry-run produces a report without writes.
- Apply creates design drafts, items, and snapshots.
- Existing backfilled drafts are skipped.
- Invalid recipe items are reported and skipped.
