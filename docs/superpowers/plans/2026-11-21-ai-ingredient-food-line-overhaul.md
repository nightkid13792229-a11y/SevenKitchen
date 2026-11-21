# AI 添加原料 · 食材线整体优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-11-21-ai-ingredient-food-line-overhaul-design.md` 把食材线从“能起草、不能收尾”改成一条可走完、可回查、成本不会填错的闭环。

**Architecture:** 前端仍是一屏（左 Agent、右两页审核 + 采购收尾卡），后端仍是草稿 → 两页核验 → 授权写入。改动集中在四处：授权写入（写入即确认、确认报告、审计基线）、核验（来源数值一致性、规则版本）、采购收尾（文案/预览/必填/规格）、页面生命周期（运行冻结、草稿恢复、方案卡）。

**Tech Stack:** NestJS + Prisma（后端）、Vue 3 + Element Plus + Vitest（admin-web）、Jest（backend）。

**Spec:** `docs/superpowers/specs/2026-11-21-ai-ingredient-food-line-overhaul-design.md`

## Global Constraints

- 所有代码只在工位 `.worktrees/20261121-ai-ingredient-food-line-overhaul` 内改；主工作区只读。
- 提交只走 `bash scripts/session.sh commit -m "..."`；合并只走 `bash scripts/session.sh merge`。
- **不做数据库迁移**：本计划只改已有表/已有字段/JSON payload；任何新字段先确认 `schema.prisma` 已存在。
- 文案面向非技术用户：不出现 `INTAKE/COMMIT/FOOD/SUPPLEMENT` 等内部码，不出现 21 位 ID。
- 后端测试命令在 `backend/` 下跑；前端测试在 `admin-web/` 下跑。每个任务先写失败测试，再写实现。
- 每次改完至少跑对应测试文件 + 前端 `vue-tsc`；全量验收见 Task 12。
- 页面上的“授权写入”只能在 AI 空闲、草稿未提交、两页报告可授权、已勾选确认时可用。

## Review Focus

1. 一箱多件（packCount > 1）时，采购价按单件价填写会静默把成本算成 1/N；预览必须与后端同式。
2. 按个（PCS）计量的原料，把净含量填成克会让成本差几十倍；单位与提示必须是“个”。
3. 授权时 AI 仍在跑或草稿在保存，写入的是旧版本；必须锁住。
4. 刷新/关页后，草稿与“写入即确认”的结果必须可恢复；不能出现已写入但原料永远选不到。
5. 营养值来源是每份/每 100ml 或来源里没有该字段时，不能静默当每 100g。

---

### Task 1: 后端 · 写入即确认

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`

**Interfaces:**
- `buildNutritionFoodData(ingredient, prepared, draftId, createdBy, stateCounts, verifiedAt: Date)` — add the last param; return `status: 'VERIFIED'`, `verifiedBy: createdBy`, `verifiedAt`.
- `buildAuditChanges` return adds `confirmation: { mode: 'AUTHORIZE_WRITES_VERIFIED'; verifiedAt: string; verifiedBy: string }`.

- [ ] **Step 1: Write failing test** — in the commit spec add `it('授权写入时营养档案直接是 VERIFIED，并记录确认人/时间', ...)` asserting `prisma.nutritionFood.create` data has `status: 'VERIFIED'`, `verifiedBy: baseInput.userId`, `verifiedAt instanceof Date`; update existing PENDING expectation to VERIFIED.
- [ ] **Step 2: Run** `cd backend && npx jest tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts --silent` — expect FAIL on status `PENDING`.
- [ ] **Step 3: Implement** — in `commit()`, `const verifiedAt = new Date()`; pass to every `buildNutritionFoodData`; set status/verifiedBy/verifiedAt; extend `buildAuditChanges(draft, profiles, verifiedAt, verifiedBy)` and include `confirmation`.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "feat(ingredient): 授权写入即确认可用"`.

---

### Task 2: 后端 · 营养值对源 + 口径守卫 + 人工值保护

**Files:**
- Create: `backend/src/domain/ingredient-creation/source-consistency.ts`
- Create: `backend/tests/domain/ingredient-creation/source-consistency.spec.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-draft-final-check.evaluator.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-check-run.service.ts` (`CHECK_RULES_VERSION.NUTRITION = 'final-check-v2'`)
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-tools.write-nutrition.spec.ts`

**Interfaces:**
```ts
export type SourceBasis = 'PER_100_G' | 'PER_100_ML' | 'PER_SERVING' | 'OTHER';
export interface SourceConsistencyRecord { id: string; basis: SourceBasis; values: Record<string, number>; }
export function checkProfileSourceConsistency(
  profiles: readonly ProfileDraft[],
  records: ReadonlyMap<string, SourceConsistencyRecord>,
): CheckItem[];
```
- `writeNutrition` result adds `skipped: Array<{ fieldPath: string; reason: 'MANUAL' }>`.
- Entry written by AI: `sourceValue` = source's catalog value, `sourceUnit` = field unit, `status: 'DIRECT'`.
- Reject when: source basis ≠ `PER_100_G`; source has no value for the field; |written − source| > max(1e-6, 0.5% of source).
- Manual entry (`status === 'MANUAL'` or `confirmedBy` non-empty) is skipped, not replaced.

- [ ] **Step 1: Write failing tests**
  - `source-consistency.spec.ts`: missing source → `SOURCE_RECORD_MISSING`; basis `PER_SERVING` → `SOURCE_BASIS_NOT_PER_100G`; missing field → `SOURCE_FIELD_MISSING`; value 45 vs 25 → `SOURCE_VALUE_MISMATCH`; manual entry skipped; exact value passes.
  - `write-nutrition.spec.ts`: mismatch → `ok=false` and error contains source value; `PER_SERVING` → `ok=false`; manual existing entry → `ok=true`, `skipped[0].reason='MANUAL'`, persisted profiles unchanged.
- [ ] **Step 2: Run** `cd backend && npx jest tests/domain/ingredient-creation/source-consistency.spec.ts tests/application/ingredient-creation/ingredient-creation-tools.write-nutrition.spec.ts --silent` — expect FAIL (module missing).
- [ ] **Step 3: Implement** — add the domain file; in `applyFieldWrite` read `normalizedNutrition.meta.rawBasisType` and `readCatalogFieldValue`; return `skipped` outcome; `writeNutrition` collects skipped; `getRecord` output adds `basis`; evaluator loads sources for profiles and appends `checkProfileSourceConsistency` items to `result.blocking`; bump the nutrition rules version.
- [ ] **Step 4: Run** both specs — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "feat(ingredient): 营养值对源与口径守卫"`.

---

### Task 3: 前端 · 采购收尾卡（价格口径/预览/件数/PCS/规格）

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/procurementClosing.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/procurementClosing.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`

**Interfaces:**
```ts
export type ClosingState = 'MISSING_PRICE' | 'MISSING_COUNT' | 'MISSING_UNIT' | 'READY';
export interface ClosingInput { pricePerPackage; netContent; packCount; purchaseUnit; }
export function computeClosingState(input: ClosingInput): ClosingState;
export function formatCostPreview(price, packCount, netContent, baseUnitLabel): string;
export function formatPerItemPrice(price, packCount): string;
export function closingBaseUnitLabel(baseUnit: 'G'|'ML'|'PCS'|null|undefined): string;
export interface ClosingForm { name; purchaseChannel; purchaseUnit; packCount; netContentPerPack; currentPurchasePrice; productModel; }
export function buildClosingSkuInput(form): { ...; productModel?: string };
```
- PCS label: `G→'g'`、`ML→'ml'`、`PCS→'个'`。
- Page label: `这一{{ purchaseUnit || '箱/袋' }}多少钱`; preview uses `packCount * netContent`; show `折合每件 ¥x` when count>1; add `productModel` input; `closingStateLabel` covers `MISSING_COUNT`.

- [ ] **Step 1: Write failing tests** in `procurementClosing.spec.ts`:
  - `computeClosingState({ price:79.9, net:330, packCount:24, unit:'箱' }) === 'READY'`; `packCount: null` → `MISSING_COUNT`; `packCount: 0` → `MISSING_COUNT`.
  - `formatCostPreview(79.9, 24, 330, 'ml') === '≈ ¥0.010088 / ml'`.
  - `formatPerItemPrice(79.9, 24) === '≈ ¥3.33 / 件'`; count 1 → `''`.
  - `closingBaseUnitLabel('PCS') === '个'`.
  - `buildClosingSkuInput({...})` includes `productModel: '24×330ml'`.
- [ ] **Step 2: Run** `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/procurementClosing.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** helpers + page wiring; `closingForm.productModel = ''`; OCR fill `productModel` from `recognized.productModel` into the form.
- [ ] **Step 4: Run** the spec + `npx vue-tsc -b` — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "fix(ingredient): 采购价口径与预览按整箱价"`.

---

### Task 4: 后端 · 授权确认 + 规格 + 例外服务端盖章

**Files:**
- Modify: `backend/src/interfaces/dto/ingredient-creation/authorize.dto.ts`
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-authorize.service.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts`
- Create: `backend/src/domain/ingredient-creation/verify-exceptions.ts`
- Create: `backend/tests/domain/ingredient-creation/verify-exceptions.spec.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-authorize.service.spec.ts`, `backend/tests/interfaces/controllers/ingredient-creation.controller.spec.ts`

**Interfaces:**
- `AuthorizeProcurementSkuDto` add `productModel?: string` (`@IsOptional @IsString @Length(1,100)`).
- `AuthorizeIngredientCreationDto` add `reportAcknowledged!: boolean` (`@IsBoolean()`).
- `AuthorizeInput` add `reportAcknowledged: boolean`; false → `BadRequestException('授权前请勾选“我已核对两页报告与采购价”')`.
- `CommitIngredientCreationInput` add `reportAcknowledgedAt: string`; audit `changes.authorization = { acknowledgedAt, acknowledgedBy: userId }`.
- `sanitizeVerifyExceptions(value, approvedBy, now): { ok: true; exceptions } | { ok: false; error }`: require non-empty `code` + `reason`; overwrite `approvedBy`/`approvedAt`; invalid → error.
- `approvedExceptionCodes` requires `reason.trim()` non-empty.

- [ ] **Step 1: Write failing tests**
  - authorize spec: `reportAcknowledged:false` → 400 and commit not called; true → commit input has `reportAcknowledgedAt`.
  - verify-exceptions spec: fake approver overwritten with server id/time; empty reason → `ok:false`; malformed → drop/error per signature.
  - controller spec: PATCH with fake approver writes server user id; empty reason → 400.
- [ ] **Step 2: Run** the three specs — expect FAIL.
- [ ] **Step 3: Implement** DTO/service/controller/domain.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "feat(ingredient): 授权确认、规格与例外盖章"`.

---

### Task 5: 前端 · 授权体验（写入即确认/自动核验文案/必勾确认/清理）

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/components/CheckReportDialog.vue`
- Modify: `admin-web/src/views/Ingredients/ai-agent/checkReportView.ts` + `checkReportView.spec.ts`
- Modify: `admin-web/src/api/ingredientCreation.ts` (authorize input type)

**Interfaces:**
- `reportTriggerLabel(trigger: 'USER' | 'AGENT'): string` — `USER→'人工核验'`, `AGENT→'系统自动核验（与人工核验同规则）'`.
- `canAuthorize` adds `reportAcknowledged === true` and `!state.running`.
- Authorize body: `reportAcknowledged: true`, `procurementSku.productModel`.

- [ ] **Step 1: Write failing test** `checkReportView.spec.ts`: both trigger labels; an AGENT report is not described as “不算”.
- [ ] **Step 2: Run** `cd admin-web && npx vitest run src/views/Ingredients/ai-agent/checkReportView.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** label helper + dialog; remove `verified/verifying/verifyError/handleVerify/verify button/nutritionFoodApi`; commit banner “已写入并确认可用”; add `reportAcknowledged` checkbox and reset on `markChecksStale`/`loadDraft`/run start; remove “当前站点”/冲突 tag/长草稿 ID; remove `--muted`; adjust footer copy.
- [ ] **Step 4: Run** spec + `npx vue-tsc -b` — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "feat(ingredient): 写入即确认与授权前确认"`.

---

### Task 6: 前端 · 运行中冻结 + 检索方案守卫

**Files:**
- Create: `admin-web/src/views/Ingredients/ai-agent/reviewLock.ts`
- Create: `admin-web/src/views/Ingredients/ai-agent/reviewLock.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`

**Interfaces:**
```ts
export function isReviewLocked(input: { running; saving; submitting; committed }): boolean;
export function shouldBlockRunForPendingPlan(input: { pendingPlan: unknown; running: boolean }): boolean;
```
- `handleRun` awaits `saveQueue`; if `hasUnsavedIngredientChanges` → `flushIngredientCard()`; failure → return; then re-check `saving`.
- `handleAuthorize` guard on `state.running`.
- Form / nutrition inputs / authorize disabled while locked.

- [ ] **Step 1: Write failing tests** `reviewLock.spec.ts`: any of running/saving/submitting/committed → true; all false → false; pendingPlan non-null and not running → true.
- [ ] **Step 2: Run** `npx vitest run .../reviewLock.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** helpers + page wiring + running hint.
- [ ] **Step 4: Run** spec + `vue-tsc -b` — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "fix(ingredient): AI 运行时冻结审核区"`.

---

### Task 7: 草稿恢复/放弃（后端 + 前端）

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-draft.service.ts`
- Modify: `backend/src/interfaces/controllers/ingredient-creation.controller.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-draft-agent.service.ts` (error event `draftId`)
- Create: `admin-web/src/views/Ingredients/ai-agent/draftResume.ts` + `draftResume.spec.ts`
- Modify: `admin-web/src/api/ingredientCreation.ts`, `admin-web/src/types/ingredientCreation.ts`, `index.vue`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-draft.service.spec.ts`, `backend/tests/interfaces/controllers/ingredient-creation.controller.spec.ts`

**Interfaces:**
- `draftService.remove(id, userId): Promise<void>` — 404 if missing, 403 if not owner, 409 if `step='COMMIT'`; delete check runs + draft in a transaction.
- `DELETE /api/v1/admin/ingredient-creation/drafts/:id` → `ApiResponseDto<null>`.
- Agent error event gains `draftId?: string`; set when the draft was created before the failure.
- Frontend `draftResume.ts`: `readDraftIdFromQuery`, `formatDraftUpdatedAt`, `pickLatestDraft`, `readPendingPlan`.
- Page: `?draftId=` load on mount; `router.replace` after a run; unfinished banner with select + continue + discard; `draftCommitted` banner and disabled actions; restore `pendingQuestion` + pending `searchPlan`.

- [ ] **Step 1: Write failing tests** — backend remove (owner/COMMIT/check-run deletion); frontend draftResume pure functions.
- [ ] **Step 2: Run** both — expect FAIL.
- [ ] **Step 3: Implement** backend then frontend.
- [ ] **Step 4: Run** specs + `vue-tsc -b` — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "feat(ingredient): 草稿恢复与放弃"`.

---

### Task 8: 后端 · AI 基线 + 审计差异

**Files:**
- Create: `backend/src/domain/ingredient-creation/ai-baseline.ts`
- Create: `backend/tests/domain/ingredient-creation/ai-baseline.spec.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation.types.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-tools.service.ts`
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-commit.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-commit.service.spec.ts`

**Interfaces:**
```ts
export interface AiFieldBaseline { value: unknown; unit?: string | null; at: string; }
export interface AiBaseline { profiles: Record<string, Record<string, AiFieldBaseline>>; ingredient: Record<string, AiFieldBaseline>; updatedAt: string; }
export function mergeProfileBaseline(base, sourceRecordId, entries, at): AiBaseline;
export function mergeIngredientBaseline(base, fields, at): AiBaseline;
```
- `IngredientCreationDraftPayload` add `aiBaseline?: AiBaseline`.
- `writeNutrition` patch includes `aiBaseline` for written fields; `writeIngredient` includes it for written fields.
- `buildAuditChanges` compares final vs `aiBaseline` when present; add `ingredientFieldChanges: Array<{ field; aiValue; finalValue }>`; `proposals` stores `{ aiBaseline, proposalHistory }`.

- [ ] **Step 1: Write failing tests** — baseline merge pure; write tools patch baseline; commit audit reports `VALUE_CHANGED` when 25→45 and `MANUALLY_ADDED` when no baseline + MANUAL.
- [ ] **Step 2: Run** specs — expect FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** specs — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "feat(ingredient): 记录 AI 基线并审计人工改动"`.

---

### Task 9: 前端 · 来源值展示 + 营养页提示

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/draftReview.ts` + `draftReview.spec.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`
- Modify: `admin-web/src/types/ingredientCreation.ts` (source fields already exist in entry type)

**Interfaces:**
- `ProfileFieldRow` adds `sourceValue: number | null`, `sourceUnit: string | null`, `sourceDisplay: string`.
- `toProfileRows` sets `sourceDisplay`: manual → `''`; stored source value → `来源 25 g`; final differs → `来源 25 g → 45 g`.

- [ ] **Step 1: Write failing test** in `draftReview.spec.ts`: entry with `sourceValue 25`, `finalValue 45` → `sourceDisplay` includes both; sourceValue null → `''`.
- [ ] **Step 2: Run** the spec — expect FAIL.
- [ ] **Step 3: Implement** mapping + template line under the row.
- [ ] **Step 4: Run** spec + `vue-tsc -b` — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "feat(ingredient): 营养页展示来源值"`.

---

### Task 10: 前端/后端 · 规则版本进闸门

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-check.service.ts`
- Modify: `admin-web/src/views/Ingredients/ai-agent/checkReportView.ts` + spec
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-check.service.spec.ts`

**Interfaces:**
- `IngredientDraftChecksView` adds `rulesVersion: Record<CheckDomain,string>` and `versionFresh: Record<CheckDomain,boolean>`.
- `GateInput` adds `currentRulesVersion` (or summaries carry `versionFresh`); `gateState` adds reason `“X 域报告是旧规则版本，重跑核验”`.

- [ ] **Step 1: Write failing tests** — backend `latestChecks` reports version mismatch; frontend gate reason.
- [ ] **Step 2: Run** both — expect FAIL.
- [ ] **Step 3: Implement** + types + page wiring.
- [ ] **Step 4: Run** specs + `vue-tsc -b` — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "fix(ingredient): 前端闸门校验规则版本"`.

---

### Task 11: 后端 · 候选来源元数据缓存

**Files:**
- Modify: `backend/src/application/ingredient-creation/ingredient-creation-candidate.service.ts`
- Test: `backend/tests/application/ingredient-creation/ingredient-creation-candidate.service.spec.ts`

**Interfaces:**
- Private `loadActiveSourceMeta()` caches `SourceRecordMeta[]` for 5 minutes; `findCandidates` and `listNutritionNames` use it.
- No behavior change to matching; only the query count.

- [ ] **Step 1: Write failing test** — two `findCandidates` calls in one service instance → `nutritionSourceRecord.findMany` called once.
- [ ] **Step 2: Run** the spec — expect FAIL.
- [ ] **Step 3: Implement** the cache.
- [ ] **Step 4: Run** the spec — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "perf(ingredient): 缓存候选来源元数据"`.

---

### Task 12: P2 清理 + 文案 + 文档 + 类型

**Files:**
- Modify: `admin-web/src/views/Ingredients/ai-agent/index.vue` (station/conflict/short id/muted/paste guard/banner copy)
- Modify: `backend/src/application/ingredient-creation/ingredient-line.ts` + its spec
- Modify: `admin-web/src/api/ingredientCreation.ts`, `admin-web/src/types/ingredientCreation.ts`
- Create: `docs/ai-ingredient-food-line.md`
- Modify: `docs/README.md` (index row)

**Interfaces/behavior:**
- Remove the station code span; draft ID shows only 6 chars; remove conflict tag unless a merge plan exists (or remove entirely).
- Supplement line button no longer muted; `LINE_NOT_OPEN_MESSAGE` → “补剂走独立建档流程（选品 → 建档），不在本页的对话起草里处理。”
- Global paste only when `showProcurementCard` is true.
- Types: `AuthorizeIngredientCreationPayload` includes `productModel/purchaseChannel/sourceScreenshotUrl/reportAcknowledged`; `IngredientCreationDraftPayload` includes `searchPlan/aiBaseline`; add `IngredientCreationDraftSummary`.
- Doc: flow, gates, decisions D1–D10, troubleshooting, deferred list.

- [ ] **Step 1: Write failing test** for the line message change in the backend spec.
- [ ] **Step 2: Run** it — expect FAIL.
- [ ] **Step 3: Implement** copy/UI/types/doc.
- [ ] **Step 4: Run** spec + `vue-tsc -b` — expect PASS.
- [ ] **Step 5: Commit** `bash scripts/session.sh commit -m "chore(ingredient): 食材线文案与类型清理"`.

---

### Task 13: 全量验收、评审、合并

- [ ] **Step 1: Backend food suite** `cd backend && npx jest tests/application/ingredient-creation tests/domain/ingredient-creation tests/interfaces/dto/ingredient-creation tests/interfaces/controllers/ingredient-creation.controller.spec.ts tests/interfaces/controllers/ingredient-creation-audit.controller.spec.ts --testPathIgnorePatterns=supplement --silent` — expect all green; record the exact count.
- [ ] **Step 2: Frontend suite** `cd admin-web && npx vitest run src/views/Ingredients/ai-agent` — expect all green; record the count.
- [ ] **Step 3: Type/build** `cd admin-web && npm run build` (expect exit 0); `cd backend && npx tsc --noEmit` (expect exit 0).
- [ ] **Step 4: Full backend suite** `cd backend && npx jest --silent` — expect only the pre-existing 5 supplement failures (baseline); record them; do not fix in this task.
- [ ] **Step 5: Fresh review** — dispatch one fresh subagent with the whole-branch diff; fix Critical/Important with RED→GREEN tests; ledger minors.
- [ ] **Step 6: Merge** `bash scripts/session.sh merge` (respect the gate); if it fails, report and stop.
- [ ] **Step 7: Deploy backend/admin-web** only after merge; use `bash backend/scripts/remote_deploy_v2.sh` and `bash /Users/zhaochen/Documents/SevenKitchen/deploy-admin-web.sh`; report the commit hash.
- [ ] **Step 8: Cleanup** `bash scripts/session.sh cleanup task/20261121-ai-ingredient-food-overhaul` after merge (if allowed), and report.

---

## Self-Review

- Spec D1 → Task 1/5; D2 → Task 4/5; D3 → Task 3; D4 → Task 2; D5 → Task 2; D6 → Task 6; D7 → Task 7; D8 → Task 8; D9 → Task 3/4; D10 → Task 12.
- Review Focus 1/2 → Task 3; 3 → Task 6; 4 → Task 1/7; 5 → Task 2.
- Deferred items are listed in the spec §2 and will be reported as deferred, not silently omitted.
