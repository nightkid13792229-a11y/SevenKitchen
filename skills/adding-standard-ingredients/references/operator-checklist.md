# Operator Checklist

## Before Local Write

- Ingredient type is FOOD or SUPPLEMENT.
- Local and production DB alignment report is passing.
- Manifest alignment id matches the latest alignment report.
- Nutrition source links or supplement label evidence are attached.
- Source policy ranking has been reviewed.
- FEDIAF essential coverage and missing nutrients are reviewed.
- Unit audit has no blocking issues.
- User explicitly confirms local write.

## Before Production Package

- User has reviewed local development data.
- Local apply audit file exists.
- Production package confirmation is true in the manifest.
- Package contains only ids listed in the local apply audit.
- `up.sql`, `down.sql`, `review-summary.md`, `source-audit.json`, and `unit-audit.json` are present.
- No whole-database migration, dump, restore, or sync is included.

