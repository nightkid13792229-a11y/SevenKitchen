# Ingredient Nutrition Database Phase One Design

## Background

SevenKitchen wants to build an ADF/PDD-style canine recipe designer, but the designer should not be built on incomplete or ambiguous ingredient data. Phase one narrows the goal to a reliable ingredient nutrition database with a manual review workflow.

This phase replaces chat-by-chat ingredient confirmation with a governed batch workflow:

1. Generate nutrition candidates from USDA, local CFCT, product labels, or manual entry.
2. Normalize candidates into the project nutrition profile contract.
3. Ask an Agent/model to produce structured semantic review advice for identity, state, edible portion, processing, and primary-mapping suitability.
4. Apply deterministic hard gates for source evidence, nutrition completeness, unit traceability, and primary-mapping safety.
5. Let an admin review and approve candidates in the Web management console.
6. Confirm records into the official nutrition library.
7. Report coverage and remaining gaps.

## Goal

Phase one is complete when every current food and supplement ingredient in the admin ingredient library is represented in the nutrition governance system and can be manually reviewed, confirmed, rejected, or deferred with a clear reason.

The confirmed data must be usable later by the recipe designer without reworking the data model.

## Non-Goals

Phase one does not implement:

- Full recipe optimization.
- AAFCO/FEDIAF/NRC formula evaluation UI.
- Miniapp user-facing recipe design.
- Automatic cooking yield conversion.
- Fully automatic supplement label OCR confirmation.
- Public distribution of parsed CFCT data.
- Agent permission to confirm formal nutrition profiles, publish production recipes, or bypass Web approval.

## Data Ownership Model

The official nutrition library uses these layers:

- `Ingredient`: the standard business ingredient, used by SKU, procurement, recipe rows, DIY flows, and miniapp data.
- `NutritionFood`: one concrete nutrition profile from a source, such as raw brown rice, cooked brown rice, boneless skinless raw chicken breast, or a confirmed supplement label profile.
- `NutritionFoodMapping`: the relationship between one standard ingredient and one or more concrete nutrition profiles.
- `Ingredient.nutritionProfile`: a compatibility cache for the current primary nutrition profile. It should not be treated as the only source of truth once multiple nutrition states exist.
- `NutritionSourceRecord`: source evidence and raw source metadata.
- `IngredientNutritionCandidate`: a proposed match between an `Ingredient` and a `NutritionSourceRecord`.
- `SupplementNutritionDraft`: a proposed supplement profile extracted from product label evidence.
- Agent review advice: structured model output attached to a candidate or supplement draft. It is evidence for human review, not an approval authority.

The recipe designer should eventually read concrete nutrition data through `RecipeItem.nutritionFoodId`, not by assuming one static profile per standard ingredient.

## Phase One Data Contract

Every confirmed `NutritionFood` must carry:

- Canonical nutrition data in `NutritionProfileV2` shape.
- Source metadata:
  - `sourceKind`: `FOOD_DATABASE`, `PRODUCT_LABEL`, `LAB_REPORT`, `SUPPLIER_SPEC`, `LITERATURE`, or `MANUAL_ESTIMATE`.
  - `sourceCode`: for example `USDA_FDC`, `CFCT`, or `SUPPLEMENT_LABEL`.
  - `sourceVersion`: source dataset or label version when known.
  - `sourceProvider`: source owner or product brand when known.
  - `externalId`: source primary key when available.
  - `sourceTitle`: human-readable source record title.
- State metadata:
  - `preparationState`: machine-readable state such as `RAW`, `COOKED`, `DRIED`, `POWDER`, `CANNED`, `FROZEN`, or `OTHER`.
  - `preparationStateLabel`: user-facing label such as `生重`, `熟重`, `干重`, `粉末`, or `沥干罐头`.
  - `ediblePortionLabel`: user-facing edible portion/specification such as `去皮去骨`, `带皮`, `肉和皮`, `去壳`, `去核`, or `沥干`.
  - `processingLabel`: optional user-facing processing marker such as `强化`, `未强化`, `加盐`, `无盐`, `紫外线照射`, or `罐头带汤汁`.
- Review metadata:
  - reviewer.
  - reviewed time.
  - confidence level.
  - review note.
  - whether this profile is the primary mapping for the standard ingredient.
- Agent review metadata when available:
  - model/provider name.
  - review prompt version.
  - identity verdict.
  - state/specification verdict.
  - recommended action.
  - structured risk flags.
  - short human-readable rationale.
  - suggested state labels and primary-mapping choice.

`preparationState` is for program rules. Labels are for humans. Labels may be more specific than the enum.

## Source Priority

Food ingredient source priority:

1. USDA FoodData Central.
2. Local private CFCT structured intermediate library.
3. Manual source record.

USDA remains the preferred food database because it is structured and easier to automate. CFCT is used when USDA lacks a good Chinese/common ingredient match or when CFCT better represents the business ingredient.

The project should not use the online food nutrient query platform that the user rejected. CFCT should come from local documents parsed into a private intermediate library for this local project only.

Supplement source priority:

1. Product label.
2. Supplier specification.
3. Lab report.
4. Manual estimate.

Supplement label OCR or AI extraction must create a draft only. It cannot directly confirm a formal profile.

## Agent-Assisted Matching And Risk Review

Phase one should not depend on an ever-growing list of hand-written special cases. The preferred review model is hybrid:

- deterministic code generates candidates, normalizes nutrients, and runs hard validation gates.
- an Agent/model evaluates semantic fit and produces structured review advice.
- the Web admin console presents the advice, risks, source evidence, and nutrition preview for human approval.
- only an admin action can confirm a profile into the formal nutrition library.

The Agent/model is especially useful for:

- recognizing that `blue mussel` is not the default match for business-defined `青口贝` if the business definition is New Zealand green-lipped mussel.
- recognizing that `Job's tears` or `coix seed` better matches `薏仁米` than barley.
- recognizing that grape tomatoes are not the default profile for ordinary `西红柿`.
- recognizing UV-exposed, fortified, wild, canned, salted, dried, or cooked records that should not silently become the primary profile.
- suggesting state labels such as `生重`, `熟重`, `干重`, `去皮去骨`, or `沥干`.

The Agent/model output must be structured JSON, not free-form prose. It should include:

- `identityVerdict`: `MATCH`, `POSSIBLE_MATCH`, `MISMATCH`, or `UNKNOWN`.
- `stateVerdict`: `MATCH`, `MISMATCH`, `UNKNOWN`, or `NOT_APPLICABLE`.
- `ediblePortionVerdict`: `MATCH`, `MISMATCH`, `UNKNOWN`, or `NOT_APPLICABLE`.
- `processingVerdict`: `ACCEPTABLE`, `RISKY`, `INCOMPATIBLE`, or `UNKNOWN`.
- `recommendedAction`: `CONFIRM_PRIMARY`, `CONFIRM_SECONDARY`, `NEEDS_HUMAN_REVIEW`, `REJECT`, or `FIND_ALTERNATIVE_SOURCE`.
- `preparationState`, `preparationStateLabel`, `ediblePortionLabel`, and `processingLabel` suggestions.
- `riskFlags`: short stable codes for filtering and reporting.
- `rationale`: a short explanation for the admin.
- `confidence`: `HIGH`, `MEDIUM`, or `LOW`.

The system may cache Agent review output on the candidate so admins do not need to rerun model review every time they open the page.

## Deterministic Hard Gates

Hard gates are intentionally small and non-semantic. They protect the data pipeline from unsafe writes.

The system must block batch confirmation when:

- the candidate has no source record.
- the source has no normalized nutrition profile.
- critical nutrients needed for ingredient-level sanity checks are missing.
- the source unit or raw basis cannot be traced.
- the Agent/model output is missing for candidates that require semantic review.
- the Agent/model recommends `REJECT` or `FIND_ALTERNATIVE_SOURCE`.
- the Agent/model confidence is `LOW`.
- confirming as primary would create a second primary mapping without clearing or explicitly replacing the old primary mapping.
- the candidate is a supplement label draft and serving basis has not been reviewed.

Admins may still open blocked candidates in detail view and manually resolve them. Manual override must save a review note and cannot be part of low-risk batch confirmation.

## Matching Rules

The matching system must evaluate more than name similarity. A candidate should carry structured match signals for:

- Ingredient identity.
- English and Chinese names.
- Aliases.
- Biological part or cut.
- Raw/cooked/dried/powder/canned state.
- Edible portion or package basis.
- Fortified/unfortified.
- Salted/unsalted.
- Wild/farmed/domestic when relevant.
- Product label basis for supplements.

Candidates are grouped into:

- `AUTO_REVIEWABLE`: strong deterministic score, Agent semantic approval, and hard gates pass; eligible for Web batch review.
- `NEEDS_REVIEW`: identity likely, but state, edible portion, processing, or source confidence needs human judgment.
- `NOT_RECOMMENDED`: weak identity or incompatible state; cannot be batch confirmed.
- `MISSING_SOURCE`: no usable USDA/CFCT/product-label source found.

Examples:

- Standard ingredient `黑木耳` without `干` in the name should not auto-match a dried cloud ear record as primary.
- Nuts and seeds may default to dry state unless the business ingredient explicitly says fresh, cooked, sprouted, or otherwise.
- Standard ingredient `口蘑` should not auto-confirm a UV-exposed mushroom record as primary unless the standard ingredient explicitly means UV-exposed mushroom.
- Standard ingredient `青口贝` should not auto-confirm blue mussel when the business definition is New Zealand green-lipped mussel.
- Standard ingredient `西红柿` should not auto-confirm grape tomato as primary.
- Standard ingredient `鸭胸` should avoid wild duck unless explicitly marked wild.
- Standard ingredient `薏仁米` should prefer Job's tears/coix seed over barley.

## Primary Mapping Rule

Each standard food ingredient should have at most one primary `NutritionFoodMapping`.

The primary mapping is the default profile used when a recipe item does not explicitly choose a nutrition food.

Default primary choices:

- Common raw edible portion for most meat and fish ingredients.
- Common dry edible portion for nuts, seeds, grains, and dry pulses.
- The business-standard state for ingredients whose name already specifies a state, such as `熟糙米`, `干木耳`, or `南瓜粉`.
- Product label profile for supplements.

Multiple non-primary profiles may be attached when they represent genuinely different nutrition facts, such as raw/cooked, fresh/dried, boneless/with bone, skinless/with skin, fortified/unfortified, salted/unsalted, canned drained/with liquid, or label-specific supplement products.

Do not create separate nutrition profiles for differences that normally do not change the nutrition basis, such as brand, supplier, organic status, cutting shape, or procurement SKU, unless the source provides materially different nutrition data that the business intends to use.

## Manual Review Workflow

The admin review UI should support list-level work, not chat-level decisions.

### Coverage Dashboard

Show:

- Total food ingredients.
- Total supplement ingredients.
- Confirmed primary mappings.
- Ingredients with multiple profiles.
- Ingredients with candidates waiting for review.
- Ingredients with no usable source.
- Candidates blocked by state/specification risk.
- Candidates pending Agent review.
- Candidates blocked by hard gates.
- Supplements waiting for label draft review.

Packaging and non-nutrition materials are excluded from coverage.

### Candidate Review List

Each row should show:

- Standard ingredient name.
- Source type and source record name.
- Match level.
- Agent recommended action.
- Agent confidence and rationale.
- Preparation state.
- Edible portion/specification.
- Processing markers.
- Primary-mapping recommendation.
- Hard-gate status.
- Key nutrients for quick sanity check.
- Match reasons and risk flags.

Admins can:

- Confirm as primary.
- Confirm as secondary profile.
- Reject.
- Defer with reason.
- Edit state labels before confirmation.
- Request or rerun Agent review.
- Open source detail for audit evidence.

Batch confirmation is allowed only for `AUTO_REVIEWABLE` candidates after the list has been filtered and inspected in the Web management console.

### Detail Review

The detail page should show:

- Standard ingredient context.
- Source evidence.
- Agent review advice.
- Hard-gate results.
- Original source nutrients.
- Normalized profile.
- Unit conversion notes.
- State/specification fields.
- Existing mappings for the same ingredient.
- Confirmation impact: whether `Ingredient.nutritionProfile` primary cache will be updated.

## Supplement Label Draft Workflow

Supplement drafts require stricter review because labels often use serving units, capsules, tablets, scoops, IU activity, and chemical forms.

The system should store:

- Label image references.
- OCR text.
- AI extracted structure.
- Original nutrient expression.
- Serving size and serving unit.
- Converted concentration basis.
- Missing parameter flags.
- Confidence and extraction notes.

Confirmation requires an admin to verify serving basis and unit conversions. The formal profile should normalize supplement concentration to a calculable basis, preferably `PER_1_G` or `PER_SERVING` with `servingWeightG`.

## Confirmed Write Behavior

When a candidate is confirmed:

1. Upsert or create the corresponding `NutritionFood`.
2. Store canonical `NutritionProfileV2` in the nutrition food profile.
3. Store state/specification/source/review metadata.
4. Upsert `NutritionFoodMapping` to the standard `Ingredient`.
5. If confirmed as primary, clear other primary mappings for that ingredient.
6. If confirmed as primary, update `Ingredient.nutritionProfile` as a compatibility cache.
7. Store the Agent review snapshot when available.
8. Preserve source evidence and review history.

Manual edits should create a review note or version note. Silent overwrites are not allowed for confirmed profiles.

## User Review Gates

To avoid reviewing every detail in chat, phase one has five user-facing review gates:

1. **Data contract gate**: approve the final fields and source/state conventions before mass import.
2. **Agent review sample gate**: review 10 to 20 Agent-reviewed candidate examples across food categories.
3. **Hard-gate and prompt gate**: review the Agent prompt contract and the small list of deterministic hard gates.
4. **Coverage gate**: review the dashboard after automatic matching to decide which missing ingredients need manual handling.
5. **First Web batch confirmation gate**: approve the first batch write in the Web admin console, then subsequent batches can follow the same rule set.

The user should not need to confirm every high-confidence row through chat.

## Acceptance Criteria

Phase one is accepted when:

- All current food and supplement ingredients appear in the coverage dashboard.
- Every ingredient is in one of these states:
  - primary profile confirmed.
  - candidate waiting for review.
  - supplement draft waiting for review.
  - missing source with reason.
  - intentionally excluded with reason.
- Confirmed food profiles have source, state, edible portion/specification, and review metadata.
- Confirmed supplement profiles have source, serving basis, unit conversion, and review metadata.
- Candidates expose Agent review advice and hard-gate results in the Web admin console.
- Each standard ingredient has zero or one primary mapping.
- The review UI allows batch review for auto-reviewable candidates and detail review for risky candidates.
- Batch confirmation is available only from the Web admin console and only for candidates whose hard gates pass.
- A coverage report can be exported for audit and continued data work.
- Existing miniapp and recipe flows continue to work through `Ingredient.nutritionProfile` primary cache and `RecipeItem.nutritionFoodId` where available.

## Later Phases

After phase one:

1. Build nutrition standard evaluation using NRC, AAFCO, and FEDIAF.
2. Build the recipe designer calculation engine.
3. Add Agent-readable APIs for recipe generation and adjustment.
4. Add supplement label OCR automation improvements.
5. Add recipe publishing and miniapp synchronization workflow.
