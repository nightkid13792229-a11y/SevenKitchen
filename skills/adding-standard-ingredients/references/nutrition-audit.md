# Nutrition Audit

## Completeness

- Calculate coverage against FEDIAF 2025 dog essential nutrients.
- Count null, blank, non-numeric, and unmeasured zero values as missing.
- Count a zero value only when the source explicitly marks it as measured zero.
- Report both the coverage percentage and missing nutrient list.

## Unit Audit

- Preserve source units and normalized units in audit output.
- Unsuffixed canonical macros, fatty acids, and amino acids default to grams.
- Mineral default units come from FEDIAF nutrient definitions; iodine and selenium are micrograms, not milligrams.
- Block negative nutrient values.
- Emit review issues when Atwater energy estimate differs from source energy by more than 25 percent and 30 kcal/100g.

## Parent-Child Checks

Block impossible merges:

- `linoleicAcid <= total fat`
- `alphaLinolenicAcid <= total fat`
- `arachidonicAcid <= total fat`
- `EPA + DHA + DPA <= total fat`
- each amino acid <= crude protein
- summed ash minerals <= ash when ash exists

When supplementing fields from another source, reject either child-field or parent-field additions that create one of these conflicts.

## Canine/FEDIAF Conversions

- Vitamin A uses the backend vitamin A converter and FEDIAF 2025 dog activity metadata.
- Vitamin E uses the backend vitamin E converter and FEDIAF 2025 activity metadata.
- Vitamin D ordinary D2/D3 forms use `1 ug = 40 IU`.
- Unclear vitamin D forms, special metabolites, or ambiguous total vitamin D sources are review-only.

