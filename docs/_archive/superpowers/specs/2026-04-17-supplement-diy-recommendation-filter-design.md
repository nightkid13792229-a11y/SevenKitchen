# Supplement DIY Recommendation Filter Design

## Goal

Separate supplement calculation/procurement usage from customer-facing DIY recommendations.

The DIY sheet can still calculate nutrition and cost from the recipe's default supplement ingredient, including self-made procurement supplements. The customer-facing recommendation popup must only show supplement products whose standard ingredient has `diyEnabled = true`.

## Rules

- A supplement standard ingredient with `diyEnabled = false` remains valid for recipe calculation, procurement, and cost.
- The miniapp supplement recommendation popup shows only options with `diyEnabled = true`.
- If the recipe's default supplement has `diyEnabled = false`, it is hidden from the recommendation popup.
- If all options for a supplement are hidden, the miniapp recommendation entry displays `-` and does not open an empty recommendation popup.
- The admin recipe form's supplement alternative selector lists only supplement ingredients with `diyEnabled = true`, excluding the current default supplement.
- Existing saved alternatives that later become `diyEnabled = false` are filtered out at display time in the miniapp.

## Data Flow

1. Admin standard ingredient controls customer-facing recommendation visibility through `diyEnabled`.
2. Admin recipe form uses `diyEnabled` to limit future supplement alternative selection.
3. Recipe API continues returning recipe items and saved alternatives for compatibility.
4. Miniapp filters supplement candidate options before displaying the recommendation popup.

## Testing

- Unit test supplement option building so disabled default and disabled alternatives are excluded from display options.
- Unit test that no enabled options results in an empty recommendation option list.
- Run miniapp DIY sheet tests and build.
- Run admin web build because the recipe form option filter changes.
