# Nutrition Source Policy

## Approved Sources

Primary official sources:

- USDA FoodData Central (`USDA_FDC`)
- New Zealand Food Composition Database / FOODfiles (`NZFCD`)
- Dutch Food Composition Database (`NEVO`)
- Japan MEXT Standard Tables (`MEXT`)
- Australian Food Composition Database (`AFCD`)
- AUSNUT (`AUSNUT`)
- Canadian Nutrient File (`CNF`)
- UK CoFID (`COFID`)
- ANSES Ciqual (`CIQUAL`)

Fallback source:

- China Food Composition Tables (`CFCT`) only when no primary official source has a state-matching profile with acceptable completeness.

Rejected as nutrition sources:

- Marketplace product pages for whole-food nutrition.
- Blogs, scraped nutrition snippets, and crowd-sourced food databases.
- LLM-generated nutrition summaries.
- Brand marketing pages, except as supplement label evidence for that exact product.

## Matching Rules

- Match ingredient identity first, then state.
- State tags must be explicit: `raw`, `cooked`, `dried`, `peeled`, `unpeeled`, `oil`, `powder`, or `prepared`.
- A cooked profile cannot satisfy a raw request unless the operator changes the requested state.
- Contradictory tags such as `raw+cooked` or `peeled+unpeeled` are rejected.
- Same-source raw/cooked pair availability is preferred after semantic state match.
- Completeness improves ranking but cannot override a state mismatch.

## Completeness Threshold

Use the backend scorer in `source-policy.ts`. The default primary-source threshold is 60 percent FEDIAF essential coverage. If at least one primary source meets that threshold and matches state, CFCT is filtered out.
