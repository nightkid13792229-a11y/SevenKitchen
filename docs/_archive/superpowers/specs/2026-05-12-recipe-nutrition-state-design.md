# Recipe Nutrition State Design

## Goal

Support multiple nutrition states for the same standard ingredient, such as raw, cooked, dried, or powdered, without splitting the standard ingredient itself.

## Decision

Use the existing nutrition library layer as the variant layer:

- `Ingredient` remains the standard ingredient abstraction used by SKU, procurement, DIY recommendations, and inventory.
- `NutritionFood` represents a concrete nutrition dataset, including its preparation state.
- `NutritionFoodMapping` connects one standard ingredient to one or more concrete nutrition datasets.
- `RecipeItem` stores the selected `nutritionFoodId` so recipe nutrition calculation and display can know which dataset was intended.

This avoids creating another parallel "nutrition profile variant" model while preserving compatibility with USDA, CFCT, labels, and future databases.

## Data Model

Add structured state metadata to `NutritionFood`:

- `preparationState`: machine-readable state such as `RAW`, `COOKED`, `DRIED`, `POWDER`, `FROZEN`, or `OTHER`.
- `preparationStateLabel`: user-facing label such as `生重`, `熟重`, `干重`, or `粉末`.

Add an optional `nutritionFoodId` to `RecipeItem`:

- Food recipe items should select one mapped `NutritionFood` when available.
- Existing recipe items without this field remain valid.
- When saving a recipe item without a selected nutrition food, the backend may use the ingredient's primary mapping as the default.

## Admin Flow

When adding or editing a food ingredient in `RecipeForm`:

1. The admin selects the standard ingredient as before.
2. If the ingredient has mapped nutrition foods, the form shows a required nutrition state selector.
3. If there is exactly one or one primary mapping, the form preselects it.
4. The existing free-text preparation method remains a separate field for kitchen instructions.

The selected state is displayed in the recipe item table beside the ingredient name or preparation method.

## Miniapp Flow

The user-facing miniapp should not ask users to choose raw or cooked state.

- Recipe detail shows a small nutrition state label for each food item when available.
- DIY sheet food rows show the selected state with the ingredient name or preparation method.
- Recipe snapshots preserve the selected state so orders, production, and labels remain stable after later nutrition library edits.

## Backward Compatibility

Existing recipes continue to work:

- Missing `nutritionFoodId` is allowed.
- Public APIs include state fields only when available.
- Old recipe snapshots without state fields still render normally.

## Out of Scope

This change does not implement cooking yield conversion, automatic nutrient recalculation, or ADF/PDD optimization. It prepares the data contract needed for those later steps.
