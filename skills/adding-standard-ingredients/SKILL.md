---
name: adding-standard-ingredients
description: Use when adding a new FOOD or SUPPLEMENT standard ingredient to SevenKitchen, including source-backed nutrition lookup, supplement package-label extraction, local DB draft writes, and production migration package export.
---

# Adding Standard Ingredients

## Purpose

Use this project-only workflow to add standard ingredients safely. It separates local draft writes from production migration packages and blocks work when nutrition evidence, units, or database alignment are not sufficient.

## Non-Negotiable Gates

- Local development writes do not require production DB alignment, but they must pass local schema, manifest, source, nutrition, unit, duplicate, and operator-confirmation checks.
- Never build a production package until local and production database alignment passes.
- Never apply data directly to production.
- Never migrate or sync the whole database.
- Never invent nutrition values or supplement concentrations.
- Use FOOD for logical food ingredients; use SUPPLEMENT for concrete supplement products.
- Do not create procurement SKUs for SUPPLEMENT ingredients.
- Ask the user for supplement package photos or equivalent label evidence when none is provided.

## Required References

Load these only when needed:

- `references/source-policy.md` for nutrition source selection.
- `references/nutrition-audit.md` for completeness, unit, and canine/FEDIAF checks.
- `references/operator-checklist.md` before local apply and production package export.

## Workflow

1. Classify the ingredient as FOOD or SUPPLEMENT. Ask if ambiguous.
2. Prepare a manifest from `assets/ingredient-import-template.food.json` or `assets/ingredient-import-template.supplement.json`.
3. Collect source evidence and fill the manifest.
4. Audit the manifest:

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/audit-ingredient-import.ts \
  --manifest ../.standard-ingredient-import/ingredient.manifest.json \
  --out ../.standard-ingredient-import/ingredient.audit.json
```

5. Ask the user to confirm local write only after source, nutrition, unit, duplicate, and local schema checks pass.
6. Apply to the local development database only. DB alignment is optional for local apply; when a passing alignment file exists, pass it for audit provenance:

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-local-ingredient-import.ts \
  --manifest ../.standard-ingredient-import/ingredient.manifest.json \
  --audit-out ../.standard-ingredient-import/ingredient.local-apply.json
```

7. Before production package export, run DB alignment:

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/check-db-alignment.ts \
  --local-env .env \
  --production-env .env.production.readonly \
  --out ../.standard-ingredient-import/alignment.json
```

8. After user review, build a production package only. The manifest must include the passing production alignment report id and production-package confirmation:

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/build-production-migration-package.ts \
  --manifest ../.standard-ingredient-import/ingredient.manifest.json \
  --local-audit ../.standard-ingredient-import/ingredient.local-apply.json \
  --out-dir ../.standard-ingredient-import/ingredient-production-package
```

If a passing alignment file is available during local apply, it can be attached:

```bash
cd backend
node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-local-ingredient-import.ts \
  --manifest ../.standard-ingredient-import/ingredient.manifest.json \
  --audit-out ../.standard-ingredient-import/ingredient.local-apply.json \
  --alignment ../.standard-ingredient-import/alignment.json
```

## FOOD Rules

- Select official nutrition sources according to `references/source-policy.md`.
- Prefer the most complete source that has both raw and cooked profiles for the same source.
- CFCT is fallback-only.
- Audit FEDIAF 2025 essential nutrient coverage before local write.
- Treat null, blank, non-numeric, and unmeasured zero values as missing.
- Multi-source field supplementation is allowed only when parent-child and unit checks pass.
- FOOD may have procurement SKUs.

## SUPPLEMENT Rules

- Require package photos or equivalent label evidence.
- Extract brand, product model, serving size, active nutrients, units, net content, and evidence notes.
- Do not infer missing concentrations.
- Store label evidence in `Ingredient.properties`.
- Do not create procurement SKUs.

## Canine/FEDIAF Canonicalization

- Vitamin A and E must use the backend converters in `backend/src/domain/ingredient/`.
- Vitamin D may auto-convert only ordinary D2/D3 forms using `1 ug = 40 IU`.
- Unclear vitamin A/D/E forms are review-only.

## User Communication

Explain decisions in business language. Tell the user when the workflow stops and why, especially for failed DB alignment, weak sources, missing supplement photos, incomplete essential nutrients, or unit conflicts.

For local development writes, failed or missing production-readonly DB alignment is a production-package blocker, not a local-write blocker. Report it clearly, but continue local write only when the user has approved and all local/source/nutrition checks pass.
