# Recipe Designer Internal Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare and ship the recipe designer as an internal staff/admin production tool, with the ingredient nutrition database and recipe database changes needed for safe recipe assessment, publishing, and backfill.

**Architecture:** Treat recipe designer, ingredient nutrition data, FEDIAF 2025 standards, and recipe publishing/backfill as one release project with staged rollout gates. Backend schema, services, and data scripts land before the miniapp staff entry is relied on; ordinary customer access remains closed by server-side guards. Production data scripts run dry-run first, then apply only after database backup and verification.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, Vue 3, Element Plus, uni-app, Vitest, node:test.

---

## Current Branch Snapshot

- Worktree: `/Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1`
- Branch: `codex/recipe-designer-milestone-1`
- Relative to `origin/main`: 150 commits ahead and 55 commits behind.
- Dirty state: 194 changed paths at the start of rollout sorting, including 107 modified/staged paths and 87 untracked paths.
- Existing staged files are already present. Do not run a broad `git commit` until the index has been intentionally normalized.

## Release Boundary

### Must Ship Together

- Recipe designer schema and migrations:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/20260518010000_mobile_recipe_designer_free_total`
  - `backend/prisma/migrations/20260518020000_allow_design_recipe_missing_energy_density`
  - `backend/prisma/migrations/20260518030000_add_design_recipe_item_ingredient_id`
  - `backend/prisma/migrations/202605200002_add_recipe_designer_reproduction_scenario`
  - `backend/prisma/migrations/202605260001_add_design_recipe_item_include_in_assessment`
  - `backend/prisma/migrations/202605270001_remove_recipe_nutrition_report_url`
  - `backend/prisma/migrations/202605270002_add_recipe_designer_revision_links`
- FEDIAF 2025 and nutrition calculation foundation:
  - `backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts`
  - `backend/src/application/recipe-designer/fediaf-target-provider.ts`
  - `backend/src/domain/recipe-designer/nutrition-profile-reader.ts`
  - `backend/src/domain/recipe-designer/recipe-assessment.ts`
  - `backend/src/domain/recipe-designer/dog-atwater-energy.ts`
- Ingredient nutrition database support:
  - `backend/src/domain/nutrition-governance/*`
  - `backend/src/domain/ingredient/*`
  - `backend/prisma/import-cfct-private-source.ts`
  - reviewed nutrition profile apply/audit scripts listed in Tasks 4 and 6.
- Recipe designer backend API and publish mapping:
  - `backend/src/application/recipe-designer/recipe-designer.service.ts`
  - `backend/src/interfaces/controllers/recipe-designer.controller.ts`
  - `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
  - `backend/src/application/recipe/recipe.service.ts`
  - `backend/src/domain/recipe/*`
  - `backend/src/infrastructure/repositories/prisma-recipe.repository.ts`
- Internal UI:
  - `miniapp/src/pages/recipe-designer/*`
  - `miniapp/src/api/recipe-designer.ts`
  - `miniapp/src/pages.json`
  - admin recipe and ingredient compatibility changes under `admin-web/src`.

### Production Data Tasks In Same Release Window

- FEDIAF seed:
  - `npm run seed:fediaf-2025-dog-standard`
- Nutrition food display name curation:
  - `npm run curate:nutrition-food-display-names`
  - `npm run curate:nutrition-food-display-names:apply`
- Dog Atwater mapping audit and patches:
  - `npm run audit:dog-atwater-food-mappings:check`
  - `npm run apply:dog-atwater-food-profile-patches`
  - `npm run apply:dog-atwater-food-profile-patches:apply`
- Reviewed vitamin recalculation:
  - `npm run recalculate:reviewed-vitamin-a`
  - `npm run recalculate:reviewed-vitamin-a:apply`
  - `npm run recalculate:reviewed-vitamin-e`
  - `npm run recalculate:reviewed-vitamin-e:apply`
- Existing recipe backfill:
  - `npm run backfill:latest-recipes-to-designer`
  - `npm run backfill:latest-recipes-to-designer -- --apply`

### Exclude From Production Commit Set

- Local temp output:
  - `tmp/`
  - `backend/tmp/`
- Local network/debug-only miniapp changes unless separately reviewed:
  - `miniapp/src/pages/network-settings/index.vue`
  - `miniapp/src/utils/runtime-base-url.ts`
  - `miniapp/src/utils/runtime-base-url.spec.ts`
  - `miniapp/src/utils/api.ts`
  - `miniapp/src/utils/api.spec.ts`
  - `miniapp/src/utils/config.ts`
- One-off audit reports that are not operator runbooks:
  - `docs/audits/`
  - `docs/reports/2026-05-26-dog-atwater-food-mapping-audit.md`

---

### Task 1: Protect The Existing Worktree

**Files:**
- Verify only: repository metadata.

- [ ] **Step 1: Capture exact state**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1
git status --short --branch
git rev-list --left-right --count HEAD...origin/main
git diff --cached --name-status
git diff --name-status
git status --porcelain=v1 | wc -l
```

Expected:

```text
## codex/recipe-designer-milestone-1
150 55
194
```

- [ ] **Step 2: Create a local safety branch**

Run:

```bash
git branch backup/recipe-designer-milestone-1-pre-rollout-20260528
git branch --list 'backup/recipe-designer-milestone-1-pre-rollout-20260528'
```

Expected:

```text
  backup/recipe-designer-milestone-1-pre-rollout-20260528
```

- [ ] **Step 3: Normalize the index without changing files**

Run:

```bash
git restore --staged :/
git diff --cached --name-status
git status --short --branch
```

Expected: `git diff --cached --name-status` prints nothing. The worktree still contains the same file content changes.

### Task 2: Harden Internal-Only Access

**Files:**
- Modify: `backend/src/interfaces/controllers/recipe-designer.controller.ts`
- Test: `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`

- [ ] **Step 1: Require admin role on publish endpoint**

Change the role import:

```ts
import { Roles, StaffGuard } from '../guards/role.guard';
```

Add `@Roles('ADMIN')` directly above the publish handler:

```ts
  @Post('drafts/:id/publish')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Publish a recipe design draft as a recipe' })
  async publishDraft(
```

- [ ] **Step 2: Add a controller contract test**

In `backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts`, add a test that reads `backend/src/interfaces/controllers/recipe-designer.controller.ts` and asserts the publish method has `@Roles('ADMIN')` near `@Post('drafts/:id/publish')`.

Use this assertion body:

```ts
const source = readFileSync(
  resolve(process.cwd(), 'src/interfaces/controllers/recipe-designer.controller.ts'),
  'utf8',
);
expect(source).toMatch(
  /@Post\('drafts\/:id\/publish'\)\s+@Roles\('ADMIN'\)/,
);
```

- [ ] **Step 3: Run the targeted controller tests**

Run:

```bash
cd backend
npm test -- --runInBand tests/interfaces/controllers/recipe-designer.controller.spec.ts
```

Expected: all tests in `recipe-designer.controller.spec.ts` pass.

- [ ] **Step 4: Commit access hardening**

Run:

```bash
git add backend/src/interfaces/controllers/recipe-designer.controller.ts backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts
git commit -m "fix: restrict recipe designer publishing to admins"
```

### Task 3: Commit The Runtime Schema And Backend Foundation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Add/modify: `backend/prisma/migrations/*recipe_designer*`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts`
- Modify/add: `backend/src/application/recipe-designer/*`
- Modify/add: `backend/src/domain/recipe-designer/*`
- Modify: `backend/src/domain/recipe/*`
- Modify: `backend/src/application/recipe/recipe.service.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Modify: `backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts`
- Modify: `backend/src/interfaces/controllers/recipes.controller.ts`
- Modify: `backend/src/interfaces/dto/recipes/admin-recipe.dto.ts`
- Modify: `backend/src/interfaces/dto/recipes/recipe-response.dto.ts`
- Modify: `backend/.env.example`
- Modify: `backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts`
- Test: matching backend tests under `backend/tests/application`, `backend/tests/domain`, `backend/tests/interfaces`, and `backend/tests/prisma`.

- [ ] **Step 1: Stage backend runtime files**

Run:

```bash
git add \
  backend/prisma/schema.prisma \
  backend/prisma/migrations/20260518010000_mobile_recipe_designer_free_total \
  backend/prisma/migrations/20260518020000_allow_design_recipe_missing_energy_density \
  backend/prisma/migrations/20260518030000_add_design_recipe_item_ingredient_id \
  backend/prisma/migrations/202605200002_add_recipe_designer_reproduction_scenario \
  backend/prisma/migrations/202605260001_add_design_recipe_item_include_in_assessment \
  backend/prisma/migrations/202605270001_remove_recipe_nutrition_report_url \
  backend/prisma/migrations/202605270002_add_recipe_designer_revision_links \
  backend/src/app.module.ts \
  backend/src/application/nutrition-standard/fediaf-2025-dog.data.ts \
  backend/src/application/recipe-designer \
  backend/src/application/recipe/recipe.service.ts \
  backend/src/domain/recipe-designer \
  backend/src/domain/recipe \
  backend/src/infrastructure/repositories/prisma-recipe.repository.ts \
  backend/src/interfaces/controllers/admin.controller.ts \
  backend/src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts \
  backend/src/interfaces/controllers/recipe-designer.controller.ts \
  backend/src/interfaces/controllers/recipes.controller.ts \
  backend/src/interfaces/dto/recipe-designer/recipe-designer.dto.ts \
  backend/src/interfaces/dto/recipes/admin-recipe.dto.ts \
  backend/src/interfaces/dto/recipes/recipe-response.dto.ts \
  backend/.env.example \
  backend/tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts \
  backend/tests/application/recipe-designer \
  backend/tests/application/recipe/recipe.service.spec.ts \
  backend/tests/domain/recipe-designer \
  backend/tests/interfaces/controllers/recipe-designer.controller.spec.ts \
  backend/tests/prisma/mobile-recipe-designer-schema.spec.ts
```

- [ ] **Step 2: Verify staged scope**

Run:

```bash
git diff --cached --name-status
```

Expected: staged files are backend schema, backend recipe designer runtime files, and matching backend tests only. It must not include `tmp/`, `backend/tmp/`, or miniapp network debug files.

- [ ] **Step 3: Run targeted backend tests**

Run:

```bash
cd backend
npm test -- --runInBand \
  tests/prisma/mobile-recipe-designer-schema.spec.ts \
  tests/application/nutrition-standard/fediaf-2025-dog-data.spec.ts \
  tests/application/recipe-designer/fediaf-target-provider.spec.ts \
  tests/application/recipe-designer/recipe-designer.service.spec.ts \
  tests/application/recipe-designer/supplement-label-extraction.service.spec.ts \
  tests/application/recipe/recipe.service.spec.ts \
  tests/domain/recipe-designer/recipe-assessment.spec.ts \
  tests/interfaces/controllers/recipe-designer.controller.spec.ts
```

Expected: targeted backend tests pass.

- [ ] **Step 4: Commit backend foundation**

Run:

```bash
git commit -m "feat: prepare recipe designer backend foundation"
```

### Task 4: Commit Ingredient Nutrition And Recipe Database Support

**Files:**
- Modify/add: `backend/src/domain/nutrition-governance/*`
- Modify/add: `backend/src/domain/ingredient/*`
- Modify: `backend/prisma/import-cfct-private-source.ts`
- Modify/add: `backend/scripts/audit-cfct-intermediate-library.ts`
- Modify/add: `backend/scripts/audit-dog-atwater-food-mappings.ts`
- Modify/add: `backend/scripts/export-food-nutrition-mapping-audit.ts`
- Modify/add: `backend/scripts/export-nutrition-food-display-name-review.ts`
- Modify/add: `backend/scripts/recalculate-reviewed-vitamin-a.ts`
- Modify/add: `backend/scripts/recalculate-reviewed-vitamin-e.ts`
- Modify/add: `backend/scripts/apply-dog-atwater-food-profile-patches.ts`
- Modify/add: `backend/scripts/apply-red-sweet-pepper-foundation-profile.ts`
- Modify/add: matching tests under `backend/tests/domain`, `backend/tests/prisma`, and `backend/tests/scripts`.
- Modify: `backend/package.json`

- [ ] **Step 1: Stage ingredient and nutrition support files**

Run:

```bash
git add \
  backend/package.json \
  backend/prisma/import-cfct-private-source.ts \
  backend/prisma/apply-curated-nutrition-food-display-names.ts \
  backend/prisma/curated-nutrition-food-display-names.ts \
  backend/prisma/migrations/202605200001_add_tfda_nutrition_governance_source_type \
  backend/prisma/migrations/202605210001_add_nevo_nutrition_source_type \
  backend/src/domain/ingredient \
  backend/src/domain/nutrition-governance \
  backend/scripts/audit-cfct-intermediate-library.ts \
  backend/scripts/audit-dog-atwater-food-mappings.ts \
  backend/scripts/export-food-nutrition-mapping-audit.ts \
  backend/scripts/export-nutrition-food-display-name-review.ts \
  backend/scripts/recalculate-reviewed-vitamin-a.ts \
  backend/scripts/recalculate-reviewed-vitamin-e.ts \
  backend/scripts/apply-dog-atwater-food-profile-patches.ts \
  backend/scripts/apply-red-sweet-pepper-foundation-profile.ts \
  backend/tests/domain/ingredient \
  backend/tests/domain/nutrition-governance \
  backend/tests/prisma/import-cfct-private-source.spec.ts \
  backend/tests/prisma/curated-nutrition-food-display-names.spec.ts \
  backend/tests/scripts/apply-dog-atwater-food-profile-patches.spec.ts
```

- [ ] **Step 2: Run targeted nutrition tests**

Run:

```bash
cd backend
npm test -- --runInBand \
  tests/domain/ingredient/nutrition-source-contract.spec.ts \
  tests/domain/ingredient/vitamin-a-conversion.spec.ts \
  tests/domain/ingredient/vitamin-e-conversion.spec.ts \
  tests/domain/nutrition-governance/nutrition-governance.utils.spec.ts \
  tests/domain/nutrition-governance/usda-nutrient-map.spec.ts \
  tests/domain/nutrition-governance/nzfcd-nutrient-map.spec.ts \
  tests/domain/nutrition-governance/food-nutrition-mapping-audit.spec.ts \
  tests/prisma/import-cfct-private-source.spec.ts \
  tests/prisma/curated-nutrition-food-display-names.spec.ts
```

Expected: targeted nutrition tests pass.

- [ ] **Step 3: Commit database support**

Run:

```bash
git commit -m "feat: prepare ingredient nutrition data for recipe designer"
```

### Task 5: Commit Admin And Miniapp Internal UI

**Files:**
- Modify: `admin-web/src/*`
- Modify/add: `admin-web/tests/*`
- Modify: `miniapp/src/api/recipe-designer.ts`
- Modify/add: `miniapp/src/pages/recipe-designer/*`
- Modify: `miniapp/src/pages.json`
- Modify: `miniapp/src/pages/staff-workbench/index.vue`
- Modify: `miniapp/src/pages/staff-recipes/index.vue` if it is needed for the internal staff workflow.

- [ ] **Step 1: Stage admin UI files**

Run:

```bash
git add \
  admin-web/src/api/recipes.ts \
  admin-web/src/types/ingredient.ts \
  admin-web/src/types/recipe.ts \
  admin-web/src/utils/preparationMethodText.ts \
  admin-web/src/views/CustomRecipes/OrderDetail.vue \
  admin-web/src/views/Ingredients/components/IngredientNutritionDialog.vue \
  admin-web/src/views/Ingredients/components/IngredientNutritionEditor.vue \
  admin-web/src/views/Recipes/RecipeForm.vue \
  admin-web/src/views/Recipes/index.vue \
  admin-web/tests/ingredientManagementCenter.test.js \
  admin-web/tests/preparationMethodText.test.ts \
  admin-web/tests/recipeNutritionState.test.js \
  admin-web/tests/viteProxyConfig.test.js \
  admin-web/vite.config.ts
```

- [ ] **Step 2: Stage miniapp internal recipe designer files**

Run:

```bash
git add \
  miniapp/src/api/recipe-designer.ts \
  miniapp/src/api/recipe-designer.spec.ts \
  miniapp/src/pages.json \
  miniapp/src/pages/recipe-designer \
  miniapp/src/pages/recipe-designer.regression.spec.ts \
  miniapp/src/pages/staff-workbench/index.vue \
  miniapp/src/pages/staff-recipes/index.vue
```

- [ ] **Step 3: Verify excluded debug files remain unstaged**

Run:

```bash
git diff --cached --name-status | rg 'runtime-base-url|network-settings|utils/api.ts|utils/config.ts' && exit 1 || exit 0
```

Expected: command exits 0 and prints nothing.

- [ ] **Step 4: Run UI tests**

Run:

```bash
cd admin-web
node --test tests/preparationMethodText.test.ts tests/recipeNutritionState.test.js tests/ingredientManagementCenter.test.js tests/viteProxyConfig.test.js
npm run build
cd ../miniapp
pnpm test
pnpm run build:mp-weixin
```

Expected: admin tests pass, admin build passes, miniapp tests pass, and `miniapp/dist/build/mp-weixin` is generated.

- [ ] **Step 5: Commit internal UI**

Run:

```bash
git commit -m "feat: add internal recipe designer user interfaces"
```

### Task 6: Commit Production Data Scripts And Operator Docs

**Files:**
- Add/modify: `backend/scripts/backfill-latest-recipes-to-designer.ts`
- Add/modify: `backend/tests/scripts/backfill-latest-recipes-to-designer.spec.ts`
- Add/modify: `backend/scripts/backfill-supplement-nutrition-food-profiles.ts`
- Add/modify: `backend/tests/scripts/backfill-supplement-nutrition-food-profiles.spec.ts`
- Add/modify: rollout docs listed in Step 1.
- Add: operator-focused reports only.

- [ ] **Step 1: Stage data scripts and operator docs**

Run:

```bash
git add \
  backend/scripts/backfill-latest-recipes-to-designer.ts \
  backend/tests/scripts/backfill-latest-recipes-to-designer.spec.ts \
  backend/scripts/backfill-supplement-nutrition-food-profiles.ts \
  backend/tests/scripts/backfill-supplement-nutrition-food-profiles.spec.ts \
  docs/superpowers/plans/2026-05-19-cfct-intermediate-library.md \
  docs/superpowers/plans/2026-05-19-recipe-designer-nutrition-assessment-ui.md \
  docs/superpowers/plans/2026-05-21-recipe-designer-supplement-create.md \
  docs/superpowers/plans/2026-05-22-recipe-designer-publish-admin-integration.md \
  docs/superpowers/plans/2026-05-22-supplement-label-ai-prefill.md \
  docs/superpowers/plans/2026-05-27-latest-recipes-designer-backfill.md \
  docs/superpowers/plans/2026-05-28-recipe-designer-internal-rollout.md \
  docs/superpowers/specs/2026-05-19-cfct-intermediate-library-design.md \
  docs/superpowers/specs/2026-05-19-recipe-designer-nutrition-assessment-ui-design.md \
  docs/superpowers/specs/2026-05-27-latest-recipes-designer-backfill-design.md
```

- [ ] **Step 2: Run data script tests**

Run:

```bash
cd backend
npm test -- --runInBand \
  tests/scripts/backfill-latest-recipes-to-designer.spec.ts \
  tests/scripts/backfill-supplement-nutrition-food-profiles.spec.ts
```

Expected: the listed data script tests pass.

- [ ] **Step 3: Commit scripts and docs**

Run:

```bash
git commit -m "chore: add recipe designer rollout data scripts"
```

### Task 7: Reconcile With Latest Main

**Files:**
- All release files after merge conflict resolution.

- [ ] **Step 1: Fetch latest remote main**

Run:

```bash
git fetch origin
git rev-list --left-right --count HEAD...origin/main
```

Expected: command prints the current ahead/behind count.

- [ ] **Step 2: Merge latest main into the release branch**

Run:

```bash
git merge origin/main
```

Expected: either a clean merge commit or conflict markers requiring manual resolution.

- [ ] **Step 3: Resolve conflicts without dropping remote production fixes**

For each conflicted file, inspect both sides:

```bash
git status --short
git diff --name-only --diff-filter=U
```

Keep remote production fixes from `origin/main` unless they directly conflict with the recipe designer release contract. Keep recipe designer schema/service/UI changes only where they are required by this rollout.

- [ ] **Step 4: Complete merge**

Run:

```bash
git diff --name-only --diff-filter=U | xargs git add
git commit
```

Expected: merge commit completes and `git status --short --branch` shows no unresolved paths.

### Task 8: Full Verification Before PR

**Files:**
- Verify: `backend`, `admin-web`, `miniapp`.

- [ ] **Step 1: Backend verification**

Run:

```bash
cd backend
npm test -- --runInBand
npm run build
bash scripts/pre-deploy-check.sh
```

Expected: all backend tests pass, build passes, and migration history check passes.

- [ ] **Step 2: Admin verification**

Run:

```bash
cd admin-web
node --test tests/*.test.js tests/*.test.ts
npm run build
```

Expected: admin static tests pass and build passes.

- [ ] **Step 3: Miniapp verification**

Run:

```bash
cd miniapp
pnpm test
pnpm run build:mp-weixin
```

Expected: miniapp tests pass and production build is generated at `miniapp/dist/build/mp-weixin`.

### Task 9: Production Data Rehearsal And Deployment

**Files/Data:**
- Production database backup.
- Backend deployment scripts.
- WeChat miniapp production build.

- [ ] **Step 1: Back up production database**

Run from an operator shell with production database credentials:

```bash
mkdir -p tmp/prod-backups
pg_dump "$PROD_DATABASE_URL" > "tmp/prod-backups/pre-recipe-designer-$(date +%Y%m%d%H%M%S).dump"
```

Expected: a non-empty dump file is created under `tmp/prod-backups`.

- [ ] **Step 2: Run production dry-runs**

Run:

```bash
cd backend
DATABASE_URL="$PROD_DATABASE_URL" npm run audit:dog-atwater-food-mappings:check
DATABASE_URL="$PROD_DATABASE_URL" npm run curate:nutrition-food-display-names
DATABASE_URL="$PROD_DATABASE_URL" npm run recalculate:reviewed-vitamin-a
DATABASE_URL="$PROD_DATABASE_URL" npm run recalculate:reviewed-vitamin-e
DATABASE_URL="$PROD_DATABASE_URL" npm run backfill:latest-recipes-to-designer
```

Expected: commands exit 0. Backfill dry-run reports zero errors and zero blocked recipes.

- [ ] **Step 3: Deploy backend**

Run:

```bash
cd backend
bash scripts/remote_deploy_v2.sh
```

Expected: deployment script completes, migrations apply, build passes, service restarts, and health check passes.

- [ ] **Step 4: Apply production data scripts**

Run after backend deploy succeeds:

```bash
cd backend
DATABASE_URL="$PROD_DATABASE_URL" npm run seed:fediaf-2025-dog-standard
DATABASE_URL="$PROD_DATABASE_URL" npm run curate:nutrition-food-display-names:apply
DATABASE_URL="$PROD_DATABASE_URL" npm run apply:dog-atwater-food-profile-patches:apply
DATABASE_URL="$PROD_DATABASE_URL" npm run recalculate:reviewed-vitamin-a:apply
DATABASE_URL="$PROD_DATABASE_URL" npm run recalculate:reviewed-vitamin-e:apply
DATABASE_URL="$PROD_DATABASE_URL" npm run backfill:latest-recipes-to-designer -- --apply
```

Expected: scripts exit 0. Backfill apply reports applied or skipped counts only, with zero errors.

- [ ] **Step 5: Upload miniapp internal build**

Run:

```bash
cd miniapp
pnpm run build:mp-weixin
```

Open `/Users/zhaochen/Documents/SevenKitchen/.worktrees/recipe-designer-milestone-1/miniapp/dist/build/mp-weixin` in WeChat Developer Tools and upload the internal production build.

- [ ] **Step 6: Smoke test internal workflow**

Verify in production:

```text
1. STAFF can open staff workbench and enter recipe designer.
2. STAFF can create a draft, add ingredients, assess the draft, and save changes.
3. STAFF cannot publish a draft through direct API call.
4. ADMIN can publish a draft into a backend recipe draft.
5. Admin web can open the published recipe draft and edit operational fields.
6. Existing latest recipes have backfilled design records or are explicitly skipped by idempotency.
```

### Task 10: PR And Rollback Notes

**Files:**
- PR body only.

- [ ] **Step 1: Push release branch**

Run:

```bash
git push -u origin codex/recipe-designer-milestone-1
```

- [ ] **Step 2: Create PR with release notes**

Use this PR structure:

```markdown
## Summary
- Ships internal staff/admin recipe designer workflow.
- Adds required FEDIAF 2025, ingredient nutrition, and recipe publish/backfill support.
- Keeps ordinary customer access closed; publish is admin-only server-side.

## Verification
- [ ] backend npm test -- --runInBand
- [ ] backend npm run build
- [ ] backend bash scripts/pre-deploy-check.sh
- [ ] admin-web node --test tests/*.test.js tests/*.test.ts
- [ ] admin-web npm run build
- [ ] miniapp pnpm test
- [ ] miniapp pnpm run build:mp-weixin

## Deployment
- [ ] Production database backup created.
- [ ] Production data dry-runs completed with zero errors.
- [ ] Backend deployed through backend/scripts/remote_deploy_v2.sh.
- [ ] Production data apply scripts completed.
- [ ] WeChat miniapp build uploaded from miniapp/dist/build/mp-weixin.
```

- [ ] **Step 3: Rollback decision points**

If backend deploy fails before data apply, revert the application deploy to the previous production commit and do not run apply scripts.

If data apply fails after partial writes, stop miniapp upload, keep backend deployed only for admin remediation, and restore production database from the pre-release dump if data invariants cannot be repaired with idempotent scripts.

If miniapp upload fails, keep backend and admin deployed; internal users can continue with admin-only verification while the miniapp build is fixed.
