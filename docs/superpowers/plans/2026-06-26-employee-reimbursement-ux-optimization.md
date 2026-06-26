# Employee Reimbursement UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved employee-side reimbursement flow: two clear reimbursement types, a purchase-list based purchase reimbursement path, a multi-item operating expense path, separate receipt upload and confirmation steps, no employee-side amortization fields, and packaging purchases routed through purchase/replenishment lists.

**Architecture:** Keep the first implementation inside the existing staff purchasing reimbursement boundary. The miniapp owns the wizard state and employee interaction. The backend keeps the reimbursement data contract consistent, including resubmission updates for editable fee fields. Packaging remains a purchase/inventory concern, not an operating expense shortcut.

**Tech Stack:** UniApp/Vue 3 miniapp, Vitest source and helper tests, NestJS reimbursement service, Prisma-backed purchasing repositories, Jest backend tests.

**Design Source:** `docs/superpowers/specs/2026-06-26-employee-reimbursement-ux-optimization-design.md`

---

## File Structure

- Modify `backend/src/application/purchasing/reimbursement.service.ts`: reuse reimbursement submission validation for new submissions and resubmissions, and make resubmitted fee fields take effect.
- Modify `backend/tests/application/purchasing/reimbursement.service.spec.ts`: lock resubmission behavior for total amount, platform fees, custom fees, receipts, review reset, and invalid totals.
- Create `miniapp/src/pages/staff-purchasing/reimbursement/form-state.ts`: pure helper functions for wizard step validation, total calculation, purchase-list summaries, and operating expense fee normalization.
- Create `miniapp/src/pages/staff-purchasing/reimbursement/form-state.spec.ts`: unit tests for the helper behavior without a miniapp runtime.
- Modify `miniapp/src/pages/staff-purchasing/constants/reimbursement.ts`: add flow type and category copy while keeping packaging out of operating expense categories.
- Modify `miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`: replace the long mixed form with the approved step-by-step employee flow.
- Modify `miniapp/src/pages/staff-purchasing.regression.spec.ts`: add source-level guardrails for the reimbursement wizard, packaging rule, no debug URL, no attribution month, and `purchaseListId` auto-select entry.
- Modify `miniapp/src/pages/staff-purchasing/detail.vue`: after completing a purchase list, offer a direct path to reimbursement with `purchaseListId` in the query.
- Modify `miniapp/src/pages/staff-purchasing/index.vue`: keep the completed-purchase hint aligned with the new reimbursement entry and avoid a separate "multi-list reimbursement" wording.
- Inspect `miniapp/src/pages/staff-purchasing/reimbursement/list.vue` and `miniapp/src/pages/staff-purchasing/reimbursement/detail.vue`: adjust only if copy conflicts with the two-type flow.

## Worktree Safety

- [ ] Before implementation, run `git status --short` from `/Users/zhaochen/Documents/SevenKitchen`.
- [ ] Do not stage or edit unrelated current changes under recipe designer, standard ingredient import, nutrition utilities, or `.standard-ingredient-import/`.
- [ ] Stage only files listed in this plan.

## Task 1: Backend Resubmission Contract Tests

**Files:**
- Modify: `backend/tests/application/purchasing/reimbursement.service.spec.ts`

- [ ] Expand the reimbursement repository mock with `countByDate: jest.fn()`.
- [ ] Expand the purchase-list repository mock with `findById: jest.fn()` and `clearReimbursementId: jest.fn()`.
- [ ] Expand the ingredient pricing mock with `syncPendingChangesForReimbursement: jest.fn()`, `autoApproveEligibleChangesForReimbursement: jest.fn()`, and `rejectChangesForReimbursement: jest.fn()` so existing service side effects are explicit.
- [ ] Add a failing test named `updates editable reimbursement details on resubmit`.

Test shape:

```ts
it('updates editable reimbursement details on resubmit', async () => {
  const rejected = new Reimbursement({
    id: 'reimbursement-1',
    claimNumber: 'BX202606260001',
    status: ReimbursementStatus.REQUIRES_RESUBMIT,
    totalActualCost: 120,
    totalEstimatedCost: 0,
    receiptUrls: ['https://example.com/old.jpg'],
    submittedById: 'staff-1',
    submittedAt: new Date('2026-06-26T02:00:00.000Z'),
    reviewedById: 'admin-1',
    reviewedAt: new Date('2026-06-26T03:00:00.000Z'),
    reviewComment: '请补充金额明细',
    customFees: [{ category: 'OTHER', description: '旧费用', amount: 120 }],
  });
  mockReimbursementRepository.findById.mockResolvedValue(rejected);

  const result = await service.resubmitReimbursement('reimbursement-1', {
    purchaseListIds: [],
    receiptUrls: ['https://example.com/new.jpg'],
    totalActualCost: 260,
    platformShippingFee: 10,
    platformPackagingFee: 0,
    customFees: [
      { category: 'RENT', description: '6月房租', amount: 200 },
      { category: 'UTILITIES', description: '6月水电', amount: 50 },
    ],
  });

  expect(result.status).toBe(ReimbursementStatus.PENDING_REVIEW);
  expect(result.reviewedById).toBeUndefined();
  expect(result.reviewedAt).toBeUndefined();
  expect(result.reviewComment).toBeUndefined();
  expect(result.receiptUrls).toEqual(['https://example.com/new.jpg']);
  expect(result.totalActualCost).toBe(260);
  expect(result.platformShippingFee).toBe(10);
  expect(result.customFees).toEqual([
    { category: 'RENT', description: '6月房租', amount: 200 },
    { category: 'UTILITIES', description: '6月水电', amount: 50 },
  ]);
});
```

- [ ] Add a failing test named `rejects resubmission when total does not match details`.
- [ ] Add a failing test named `allows resubmission to replace selected purchase lists owned by the same reimbursement`.
- [ ] Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/purchasing/reimbursement.service.spec.ts --runInBand
```

- [ ] Confirm the new tests fail because `resubmitReimbursement()` currently calls `reimbursement.resubmit(dto.receiptUrls)` and does not apply the new fee fields.

## Task 2: Backend Resubmission Implementation

**Files:**
- Modify: `backend/src/application/purchasing/reimbursement.service.ts`
- Test: `backend/tests/application/purchasing/reimbursement.service.spec.ts`

- [ ] Extract submission validation from `submitReimbursement()` into a private method named `prepareReimbursementSubmission(dto, options?)`.
- [ ] The helper returns `{ purchaseLists, purchaseListIds, totalEstimatedCost, normalizedCustomFees, purchaseListsTotal, calculatedTotal }`.
- [ ] Keep these validation rules unchanged:
  - receipt count is at least 1 and at most 10.
  - `totalActualCost` is positive.
  - selected purchase lists exist.
  - selected purchase lists are `COMPLETED`.
  - custom fee category is one of `REIMBURSEMENT_CUSTOM_FEE_CATEGORIES`.
  - custom fee amount is not negative.
  - total must equal purchase-list actual totals plus platform shipping plus platform packaging plus custom fees within `0.01`.
- [ ] For resubmission, allow a selected purchase list when its `reimbursementId` is empty or equals the reimbursement being resubmitted. Reject lists linked to any other reimbursement id.
- [ ] In `submitReimbursement()`, call the helper and keep claim-number generation, save, `syncPendingChangesForReimbursement()`, and `autoApproveEligibleChangesForReimbursement()` behavior.
- [ ] In `resubmitReimbursement()`, after status validation, construct an updated `Reimbursement` with the same `id`, `claimNumber`, `submittedById`, `submittedAt`, `createdAt`, payment proof fields, and submitted user, while replacing editable fields from the DTO.
- [ ] Set the resubmitted status to `PENDING_REVIEW`, clear `reviewedById`, `reviewedAt`, and `reviewComment`, and set `updatedAt` to `new Date()`.
- [ ] Call `purchaseListRepository.clearReimbursementId(id)` before saving the reconstructed reimbursement, then save with the selected `purchaseLists`.
- [ ] After save, call:

```ts
await this.ingredientPricingService.syncPendingChangesForReimbursement(
  saved.id,
  purchaseListIds,
);
await this.ingredientPricingService.autoApproveEligibleChangesForReimbursement(
  saved.id,
);
```

- [ ] Re-run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/purchasing/reimbursement.service.spec.ts --runInBand
```

- [ ] Commit after the backend tests pass:

```bash
git add backend/src/application/purchasing/reimbursement.service.ts backend/tests/application/purchasing/reimbursement.service.spec.ts
git commit -m "fix: update reimbursement resubmission details"
```

## Task 3: Miniapp Form Helper Tests

**Files:**
- Create: `miniapp/src/pages/staff-purchasing/reimbursement/form-state.ts`
- Create: `miniapp/src/pages/staff-purchasing/reimbursement/form-state.spec.ts`

- [ ] Create `form-state.spec.ts` with tests for the employee flow rules:
  - `calculateReimbursementTotal()` sums selected purchase lists, platform shipping, platform packaging, and valid operating fees.
  - `normalizeOperatingExpenseFees()` drops blank rows, rejects non-positive filled rows, and requires a description when category is `OTHER`.
  - `validateReimbursementStep()` requires a flow type before leaving type selection.
  - `validateReimbursementStep()` requires at least one purchase list before leaving the purchase details step for purchase reimbursement.
  - `validateReimbursementStep()` requires at least one valid operating fee before leaving the operating details step.
  - `validateReimbursementStep()` requires at least one receipt before confirmation.
  - `getPurchaseListKindLabel()` returns `日采`, `补货`, and `包材` for the current list kinds and item types.
- [ ] Create `form-state.ts` exports used by the tests:

```ts
export type ReimbursementFlowType = 'PURCHASE' | 'OPERATING';
export type ReimbursementFlowStep = 'TYPE' | 'PURCHASE_DETAILS' | 'OPERATING_DETAILS' | 'RECEIPTS' | 'CONFIRM' | 'SUCCESS';
export interface ReimbursementValidationResult {
  ok: boolean;
  message?: string;
}
```

- [ ] Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm test -- src/pages/staff-purchasing/reimbursement/form-state.spec.ts
```

- [ ] Confirm the test initially fails because the helper does not exist, then implement the helper until it passes.

## Task 4: Miniapp Source Regression Guardrails

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing.regression.spec.ts`
- Modify later tasks: `miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`
- Modify later tasks: `miniapp/src/pages/staff-purchasing/constants/reimbursement.ts`
- Modify later tasks: `miniapp/src/pages/staff-purchasing/detail.vue`

- [ ] Add source reads:

```ts
const reimbursementSubmitSource = readPage('staff-purchasing/reimbursement/submit.vue');
const reimbursementConstantsSource = readPage('staff-purchasing/constants/reimbursement.ts');
```

- [ ] Add a `describe('staff reimbursement employee flow')` block with assertions:
  - submit page contains `采购报销` and `经营费用报销`.
  - submit page does not contain `多张采购清单合并报销`.
  - submit page contains `flowType`.
  - submit page contains `purchaseListId`.
  - submit page contains `费用 1` and `添加一项费用`.
  - submit page contains `确认提交` and `提交成功`.
  - submit page does not contain `debug-url`.
  - submit page does not contain `归属月份`, `均摊周期`, or `是否均摊`.
  - reimbursement constants do not contain `{ value: 'PACKAGING'`.
  - submit page contains `包材清单` or `包材`.
  - detail page contains `goToReimbursementAfterCompletion`.
- [ ] Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm test -- src/pages/staff-purchasing.regression.spec.ts
```

- [ ] Confirm the new regression tests fail before the page implementation.

## Task 5: Reimbursement Constants and Copy

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/constants/reimbursement.ts`
- Test: `miniapp/src/pages/staff-purchasing.regression.spec.ts`

- [ ] Add:

```ts
export const reimbursementFlowTypeOptions = [
  {
    value: 'PURCHASE',
    label: '采购报销',
    description: '食材、补剂、包材等已完成采购清单',
  },
  {
    value: 'OPERATING',
    label: '经营费用报销',
    description: '房租、水电、工资/人工、工具、杂物、其它日常支出',
  },
] as const;
```

- [ ] Export `ReimbursementFlowType` from the option values.
- [ ] Rename the displayed payroll label from `工资` to `工资/人工` while keeping the existing value `PAYROLL`.
- [ ] Keep `reimbursementCustomFeeCategoryOptions` limited to `RENT`, `UTILITIES`, `TOOLS`, `SUNDRIES`, `PAYROLL`, and `OTHER`.
- [ ] Do not add `PACKAGING` to operating expense category options.
- [ ] Adjust `inferReimbursementCustomFeeCategory()` only for operating expenses. Do not map `包材`, `包装袋`, `真空袋`, `标签`, `保温袋`, or `泡沫箱` to a dedicated operating category.

## Task 6: Submit Page Wizard Implementation

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/reimbursement/submit.vue`
- Use: `miniapp/src/pages/staff-purchasing/reimbursement/form-state.ts`
- Test: `miniapp/src/pages/staff-purchasing/reimbursement/form-state.spec.ts`
- Test: `miniapp/src/pages/staff-purchasing.regression.spec.ts`

- [ ] Replace the current one-page mixed template with step sections keyed by `currentStep`.
- [ ] Step `TYPE`: show two options only, `采购报销` and `经营费用报销`, with employee-facing examples.
- [ ] Step `PURCHASE_DETAILS`: show completed unreimbursed purchase lists and support selecting one or many lists.
- [ ] Add purchase-list filters: `全部`, `日采`, `补货`, and `包材`.
- [ ] Compute package-list display from list kind or contained item type. Treat a list as package-related when any item type is `PACKAGING`.
- [ ] Show selected purchase-list total, purchase-related shipping fee, and purchase-related packaging fee.
- [ ] Show helper copy when no package list exists: `包材采购请先创建包材补货清单，再回来关联报销。`
- [ ] Step `OPERATING_DETAILS`: show quick categories `房租`, `水电`, `工资/人工`, `工具`, `杂物`, `其它`.
- [ ] Initialize operating fees with one row so the page visibly shows `费用 1`.
- [ ] Add `添加一项费用`, row delete for rows after the first, and a realtime total.
- [ ] Do not render employee fields for attribution month, amortization period, or amortization decision.
- [ ] Step `RECEIPTS`: show upload controls, receipt count, thumbnails, and delete action.
- [ ] Remove `<text class="debug-url" v-if="true">`.
- [ ] Keep `uploadReceiptPhoto()`, `deleteReceiptPhoto()`, and `previewPhoto()` behavior, but remove upload debug console logging.
- [ ] Step `CONFIRM`: show type, selected purchase lists or operating fees, receipt count, total amount, and reminders about amount/time clarity on receipts.
- [ ] Step `SUCCESS`: store `res.data` as `lastSubmittedReimbursement`, show `lastSubmittedReimbursement.claimNumber` when present, always show reimbursement amount, current status, and buttons for detail or list.
- [ ] `onLoad(options)` behavior:
  - when `options.purchaseListId` exists, set `flowType` to `PURCHASE`, load completed purchase lists, select that id if present, and land on `PURCHASE_DETAILS`;
  - when `options.resubmitId` exists, load the existing reimbursement, infer flow type from purchase-list presence, prefill editable fields and receipts, and land on the first detail step;
  - otherwise load completed purchase lists and land on `TYPE`.
- [ ] `canContinue` and `canSubmit` must call helper validation rather than checking receipts only.
- [ ] Submit payload for purchase reimbursement:

```ts
{
  purchaseListIds: selectedListIds.value,
  receiptUrls: urls,
  totalActualCost: totalAmount,
  platformShippingFee: parseFloat(platformShippingFee.value) || 0,
  platformPackagingFee: parseFloat(platformPackagingFee.value) || 0,
  customFees: [],
}
```

- [ ] Submit payload for operating reimbursement:

```ts
{
  purchaseListIds: [],
  receiptUrls: urls,
  totalActualCost: totalAmount,
  platformShippingFee: 0,
  platformPackagingFee: 0,
  customFees: normalizedCustomFees,
}
```

- [ ] In resubmit mode, use the existing `resubmitReimbursement()` API instead of `submitReimbursement()` so the original reimbursement id is preserved.
- [ ] Keep styling dense and work-focused, with stable button heights and no nested card layout.

## Task 7: Purchase Completion Entry

**Files:**
- Modify: `miniapp/src/pages/staff-purchasing/detail.vue`
- Modify: `miniapp/src/pages/staff-purchasing/index.vue`
- Test: `miniapp/src/pages/staff-purchasing.regression.spec.ts`

- [ ] Add a function in `detail.vue`:

```ts
const goToReimbursementAfterCompletion = () => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/reimbursement/submit?purchaseListId=${purchaseListId.value}`,
  });
};
```

- [ ] After `completePurchaseApi()` succeeds and `loadDetail()` finishes, show a modal with:
  - title: `采购已完成`
  - content: `是否现在提交这张采购清单的报销？`
  - confirm text: `去报销`
  - cancel text: `稍后`
- [ ] On confirm, call `goToReimbursementAfterCompletion()`.
- [ ] In `index.vue`, keep the existing completed-state hint and ensure no copy suggests a separate multi-list reimbursement entrance.

## Task 8: Verification

**Files:**
- All files changed by Tasks 1-7

- [ ] Run backend focused tests:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/purchasing/reimbursement.service.spec.ts --runInBand
```

- [ ] Run miniapp focused tests:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm test -- src/pages/staff-purchasing/reimbursement/form-state.spec.ts src/pages/staff-purchasing.regression.spec.ts
```

- [ ] Run the miniapp preview build required for miniapp changes:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm run preview
```

- [ ] Verify the preview build produces `miniapp/dist/dev/mp-weixin`.
- [ ] Manually inspect the compiled miniapp in WeChat DevTools using the route `/pages/staff-purchasing/reimbursement/submit`.
- [ ] Inspect route `/pages/staff-purchasing/reimbursement/submit?purchaseListId=<completed-list-id>` with a real completed, unreimbursed purchase list in local data.
- [ ] Check these user flows in the preview build:
  - new purchase reimbursement with one selected list;
  - new purchase reimbursement with multiple selected lists;
  - package purchase reimbursement through a package-related purchase list;
  - new operating expense reimbursement with two fee rows;
  - resubmit a rejected reimbursement and confirm edited fees persist on detail page;
  - receipt upload, preview, delete, confirmation, and success screen.
- [ ] Run final status check:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git status --short
```

- [ ] Confirm only intended reimbursement files are staged or committed.

## Task 9: Commits

- [ ] Commit backend contract and implementation after Task 2 passes:

```bash
git add backend/src/application/purchasing/reimbursement.service.ts backend/tests/application/purchasing/reimbursement.service.spec.ts
git commit -m "fix: update reimbursement resubmission details"
```

- [ ] Commit miniapp helper, constants, submit page, and purchase completion entry after Tasks 3-8 pass:

```bash
git add miniapp/src/pages/staff-purchasing/reimbursement/form-state.ts miniapp/src/pages/staff-purchasing/reimbursement/form-state.spec.ts miniapp/src/pages/staff-purchasing/constants/reimbursement.ts miniapp/src/pages/staff-purchasing/reimbursement/submit.vue miniapp/src/pages/staff-purchasing.regression.spec.ts miniapp/src/pages/staff-purchasing/detail.vue miniapp/src/pages/staff-purchasing/index.vue
git commit -m "feat: simplify employee reimbursement flow"
```

## Acceptance Criteria

- [ ] Employee reimbursement entry shows exactly two business choices: purchase reimbursement and operating expense reimbursement.
- [ ] Purchase reimbursement supports one or many completed unreimbursed purchase lists in the same path.
- [ ] Package purchases are discoverable through purchase/package list filtering and are not an operating expense shortcut.
- [ ] Operating expense reimbursement visibly supports multiple fee rows.
- [ ] Employees do not enter attribution month, amortization period, or amortization decision.
- [ ] Receipt upload is its own step and no debug URL is visible.
- [ ] Confirmation page summarizes type, details, receipt count, and total before submission.
- [ ] Success page gives a clear next step after submission.
- [ ] Resubmitting a rejected reimbursement updates edited fee fields and receipts on the backend.
- [ ] Focused backend tests, focused miniapp tests, and `npm run preview` pass before completion is reported.
