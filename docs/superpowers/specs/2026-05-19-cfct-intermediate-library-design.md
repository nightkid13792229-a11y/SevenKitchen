# CFCT Intermediate Library Design

## Goal

Pause individual ingredient confirmation work and rebuild the local private CFCT intermediate library as the auditable source layer for future CFCT-based nutrition profiles.

## Scope

- Recreate full CFCT v6 structured artifacts from the two local PDF volumes.
- Keep this layer local/private and do not publish parsed CFCT data.
- Do not write or confirm `NutritionFood` records as part of this work.
- Do not confirm the existing `薏仁米` candidate until the rebuilt intermediate library has been audited.

## Current State

The backend already has OCR and structure scripts:

- `backend/scripts/cfct-ocr-pages.sh`
- `backend/scripts/import-cfct-ocr-source.ts`
- `backend/scripts/structure-cfct-full-source.ts`

The parser can already parse and merge several CFCT table shapes:

- primary macro/B1/B2 rows with `foodCode`
- mineral/vitamin continuation rows with `foodCode`
- amino acid continuation rows with `foodCode`
- fatty acid total rows with `foodCode`
- special no-code tables such as iodine, folate, DHA/EPA, and USDA choline as review-only rows

The missing piece is a durable audit surface. The full structured JSON may be absent or stale, and there is no compact coverage report that tells us whether each `foodCode` has macro, mineral, vitamin, fatty acid, and amino acid coverage.

## Design

The rebuilt intermediate library has two layers:

1. **Structured source artifacts**
   - `backend/reports/cfct-full/cfct-v6-full-structured.json`
   - `backend/reports/cfct-full/cfct-v6-full-auto-ready.json`
   - `backend/reports/cfct-full/cfct-v6-full-needs-review.json`
   - `backend/reports/cfct-full/cfct-v6-full-review-summary.json`
   - `backend/reports/cfct-full/cfct-v6-full-report.csv`

2. **Coverage audit artifacts**
   - Summary JSON for machine checks.
   - Food-code CSV for manual review.
   - No-food-code CSV for special table review.

Coverage is calculated from normalized nutrient keys, not from row count alone. A food-code row is considered stronger when it has coverage across multiple groups: macros, minerals, vitamins, fatty acids, and amino acids.

## Merge Rules

- Rows with the same `volume + foodCode` are merged.
- Primary rows and continuation rows are both retained in `sourceSegments`.
- Rows without `foodCode` remain review-only unless future work adds an explicit manual crosswalk.
- Quality flags are preserved; `MISSING_PRIMARY_ROW` is removed only after the continuation row is successfully merged into a primary row.

## Review Rules

- `AUTO_STRUCTURED` rows can enter the auto-ready artifact only when no quality flags remain.
- Low OCR confidence, missing food code, incomplete continuation coverage, suspicious macro sums, and out-of-range mineral values remain review flags.
- No-food-code special tables are not automatically joined to standard ingredients.

## Validation

- Unit tests cover coverage summary behavior.
- Full structure generation must complete without script errors.
- Coverage audit must report at least one row for known food code `019008` after the full library is rebuilt.
- Backend health on port `3011` should remain OK after the work.
