# Phase 7.2: Price Explanation & Cost Transparency Display

**Status:** ✅ ACCEPTED  
**Date:** 2025-12-14  
**Phase:** 7.2  
**Verification Date:** 2025-12-14

---

## Overview

Phase 7.2 enables customer-facing price explanation and cost transparency display. This is a **read-only, presentation-focused** phase that does NOT introduce new business logic or modify pricing calculations.

### Goals

- Enable clear, customer-facing price explanation
- Help users understand what they paid and how the price is composed
- Distinguish between costs vs platform service
- **Without exposing sensitive internal formulas or margin rates**

---

## Architectural Constraints (STRICT)

This phase follows all 8 docs, especially **07_Core_Architecture.md**:

- ✅ **No business logic in controllers** - All mapping logic in application layer
- ✅ **No recalculation on read** - All values come directly from `PricingBreakdownSnapshot`
- ✅ **No mutation of persisted snapshots** - Snapshots remain immutable
- ✅ **Only read from snapshot** - No domain service calls for pricing
- ✅ **Pricing math unchanged** - Existing pricing calculations remain exactly the same

**This phase is presentation + DTO mapping + frontend UI only.**

---

## What Changed

### Backend

#### 1. New DTO: `PriceExplanationDto`

**Location:** `backend/src/interfaces/dto/orders/pricing-preview.dto.ts`

**Fields:**
- `productPrice` (CNY) - From snapshot
- `shippingFee` (CNY) - From snapshot
- `totalPrice` (CNY) - From snapshot
- `costIngredients` (CNY) - From snapshot
- `costPackaging` (CNY) - From snapshot
- `costLabor` (CNY) - From snapshot
- `costOverhead` (CNY) - From snapshot
- `marginAmount` (CNY) - **ONLY calculation**: `productPrice - totalProductCost` (simple subtraction)
- `explanationLines` (string[]) - Static, human-readable text

**Rules:**
- All numeric values come directly from snapshot
- No percentages, no formulas, no recomputation
- `marginAmount` is the ONLY computed field (simple subtraction)
- `explanationLines` are static text, not calculated

#### 2. Application Layer: Mapping Method

**Location:** `backend/src/application/order/order.service.ts`

**Method:** `mapToPriceExplanation(snapshot: PricingBreakdownSnapshot | undefined): PriceExplanationDto | null`

**Logic:**
```typescript
// Simple subtraction: marginAmount = productPrice - totalProductCost
const marginAmount = snapshot.productPrice - snapshot.totalProductCost;

// Static explanation lines (human-readable, no formulas)
const explanationLines = [
  'Ingredient cost covers fresh meat and vegetables',
  'Packaging includes vacuum bags and labels',
  'Labor covers preparation and cooking',
  'Platform service supports food safety, R&D, and operations',
];
```

**Returns:** `PriceExplanationDto` if snapshot exists, `null` if missing (legacy orders)

#### 3. Extended Endpoint Response

**Endpoint:** `GET /api/v1/orders/:id/pricing-breakdown` (existing, non-breaking extension)

**Response Structure:**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "costIngredients": 50.0,
    "costPackaging": 2.0,
    "costLabor": 10.0,
    "costOverhead": 5.0,
    "totalProductCost": 67.0,
    "productPrice": 111.67,
    "shippingFee": 12.0,
    "totalPrice": 123.67,
    "shippingTemplateId": "...",
    "marginStrategyName": "targetMargin_40%",
    "createdAt": "2024-01-01T00:00:00Z",
    "ingredientPriceVersionHash": null,
    "priceExplanation": {
      "productPrice": 111.67,
      "shippingFee": 12.0,
      "totalPrice": 123.67,
      "costIngredients": 50.0,
      "costPackaging": 2.0,
      "costLabor": 10.0,
      "costOverhead": 5.0,
      "marginAmount": 44.67,
      "explanationLines": [
        "Ingredient cost covers fresh meat and vegetables",
        "Packaging includes vacuum bags and labels",
        "Labor covers preparation and cooking",
        "Platform service supports food safety, R&D, and operations"
      ]
    }
  }
}
```

**Legacy Orders:** If order has no pricing snapshot, returns `null` for entire response (unchanged behavior)

### Frontend

#### 4. Order Detail: Price Explanation Section

**Location:** `miniapp/src/pages/order-detail/index.vue`

**Features:**
- Collapsible section titled "价格说明" (Price Explanation)
- Displays all cost breakdowns:
  - 商品金额 (Product Amount)
  - 食材成本 (Ingredient Cost)
  - 包装成本 (Packaging Cost)
  - 人工成本 (Labor Cost)
  - 运营成本 (Overhead Cost)
  - 平台服务与保障 (Platform Service & Guarantee) = `marginAmount`
  - 运费 (Shipping Fee)
- Gracefully hides if backend returns `null`
- Read-only display - no client-side calculations

---

## Fields Exposed vs Intentionally Hidden

### ✅ Exposed (Customer-Facing)

- **Cost breakdowns:** Ingredients, packaging, labor, overhead
- **Platform service amount:** Total margin amount (not rate)
- **Total amounts:** Product price, shipping fee, total price
- **Human-readable explanations:** What each cost category covers

### ❌ Intentionally Hidden (IP Protection)

- **Margin rate/percentage:** Not exposed (e.g., "40% margin")
- **Pricing formulas:** How margin is calculated
- **Internal cost allocation logic:** How costs are distributed
- **Ingredient price versions:** Internal tracking data
- **Margin strategy details:** Internal business rules

**Rationale:** Pricing IP (intellectual property) must be protected. Customers see **what** they paid and **what** it covers, but not **how** we calculate margins or **why** certain costs are allocated.

---

## Testing

### Unit Tests

**Location:** `backend/src/interfaces/controllers/orders.controller.spec.ts`

**Tests Added:**
1. ✅ `should include priceExplanation in response when breakdown exists`
2. ✅ `should return null priceExplanation for legacy orders without breakdown`
3. ✅ `should compute marginAmount correctly as productPrice - totalProductCost`

### Verification Script

**Location:** `backend/scripts/phase7_2_price_explanation_verify.sh`

**Validations:**
- Pricing breakdown endpoint returns `priceExplanation`
- `marginAmount > 0`
- `explanationLines` exist and are non-empty
- Numeric values match pricing snapshot (no recalculation)
- `marginAmount = productPrice - totalProductCost` (tolerance 0.01)

**Run:**
```bash
cd backend
bash scripts/phase7_2_price_explanation_verify.sh
```

---

## Verification

### Run Tests

```bash
cd backend
pnpm test
```

### Run Build

```bash
cd backend
pnpm build
```

### Run Verification Script

```bash
# Terminal 1: Start server
cd backend
pnpm start:dev

# Terminal 2: Run verification
bash scripts/phase7_2_price_explanation_verify.sh
```

---

## Files Changed

### Backend
- `backend/src/interfaces/dto/orders/pricing-preview.dto.ts` - Added `PriceExplanationDto`
- `backend/src/application/order/order.service.ts` - Added `mapToPriceExplanation()` method
- `backend/src/interfaces/controllers/orders.controller.ts` - Extended endpoint response
- `backend/src/interfaces/controllers/orders.controller.spec.ts` - Added tests

### Frontend
- `miniapp/src/pages/order-detail/index.vue` - Added price explanation section

### Scripts
- `backend/scripts/phase7_2_price_explanation_verify.sh` (new)

### Documentation
- `backend/docs/PHASE7_2_PRICE_EXPLANATION.md` (this file)

---

## Acceptance Criteria

- [x] `PriceExplanationDto` implemented
- [x] Mapping logic in application layer (not controller)
- [x] `pricing-breakdown` endpoint extended (non-breaking)
- [x] `marginAmount` computed correctly (`productPrice - totalProductCost`)
- [x] `explanationLines` are static, human-readable text
- [x] Legacy orders return `null` explanation (not error)
- [x] Miniapp order detail shows price explanation section
- [x] Frontend gracefully handles missing explanation
- [x] Tests added and passing
- [x] Verification script created
- [x] Documentation completed
- [x] Verification script executed successfully
- [x] All tests passing (`pnpm test`) - **76 tests passed, 0 failed**
- [x] Code compiles (`pnpm build`)

---

## Relation to Phase 7.1

**Phase 7.1** (Pricing Breakdown Snapshot):
- Persists pricing breakdown at order creation
- Exposes technical breakdown via `GET /orders/:id/pricing-breakdown`
- Focus: **Auditability and reconciliation**

**Phase 7.2** (Price Explanation):
- Extends same endpoint with customer-facing explanation
- Maps snapshot to presentation DTO
- Focus: **Customer transparency and understanding**

**Key Difference:**
- Phase 7.1: Technical breakdown (for internal use, reconciliation)
- Phase 7.2: Customer explanation (for user understanding, transparency)

Both use the same immutable snapshot - Phase 7.2 adds a presentation layer on top.

---

## Known Limitations

1. **Static Explanation Lines:** Currently hardcoded in English. In production, these could be:
   - Localized (Chinese, English, etc.)
   - Configurable per product type
   - Dynamic based on order characteristics (but still no formulas)

2. **Margin Amount Only:** We show the total margin amount, not the breakdown of what it covers. This is intentional to protect IP.

3. **No Historical Changes:** If pricing logic changes, old orders still show the snapshot from creation time (immutable).

---

## References

- **07_Core_Architecture.md**: Domain layering, immutability, no business logic in controllers
- **04_Domain_Model_and_Algorithms.md**: Pricing calculation algorithms (not exposed)
- **05_API_Specs.md**: API contract specifications
- **Phase 7.1**: Pricing Breakdown Snapshot foundation

---

## UX Hardening: Pricing Preview Error Handling

**Date:** 2025-12-15  
**Type:** Non-breaking UX polish fix

### Changes

1. **Frontend Pre-flight Guards** (`miniapp/src/pages/order-config/index.vue`)
   - Preview API is only called when:
     - `quantityG >= 1000` (minimum order quantity)
     - `packageSpecG > 0` (valid package specification)
     - `packageCount >= 1` (computed as `ceil(quantityG / packageSpecG)`)
   - Invalid inputs show neutral hint: "未满足起订量，暂不显示价格预览"
   - Preview requests are debounced (500ms) to prevent API spam

2. **Graceful Error Handling**
   - HTTP 400 (validation errors) are treated as expected user-input states
   - No red console errors for validation failures
   - Only unexpected errors (5xx, network) are logged as warnings

3. **Backend Logging** (`backend/src/interfaces/controllers/orders.controller.ts`)
   - Validation failures logged at WARN level (expected user-input state)
   - System errors logged at ERROR level (unexpected failures)

### Manual Testing Notes

**Test Scenario 1: Preview Silent Until Valid Inputs**
1. Navigate to order config page
2. Enter `dailyGrams = 50`, `cycleDays = 10` (total = 500g < 1000g minimum)
3. **Expected:** No preview API call, no console errors, neutral hint shown
4. Increase to `dailyGrams = 100`, `cycleDays = 10` (total = 1000g)
5. **Expected:** Preview appears after 500ms debounce, no errors

**Test Scenario 2: No 400 Errors During Normal UI Interaction**
1. Rapidly type in `dailyGrams` field (e.g., 50, 100, 200, 500, 1000)
2. **Expected:** 
   - No red console errors
   - Preview only appears when inputs meet minimum (1000g)
   - Debounce prevents multiple API calls

**Test Scenario 3: Validation Errors Handled Gracefully**
1. Enter valid inputs that trigger backend validation (if any edge cases exist)
2. **Expected:** 
   - No red console stack traces
   - Preview UI simply hidden (no error message shown)
   - Backend logs at WARN level, not ERROR

**Verification:**
- Open browser console during order config page interaction
- Verify no red errors appear when entering invalid quantities
- Verify preview only appears when `quantityG >= 1000`
- Verify debounce works (preview doesn't fire on every keystroke)

---

## Verification Results

**Execution Date:** 2025-12-14

**Test Results:**
- ✅ All tests passing: **76 tests passed, 0 failed**
- ✅ Test Suites: **8 passed, 8 total**
- ✅ Code compiles successfully

**Verification Script Results:**
- ✅ Script executed successfully
- ✅ Pricing breakdown endpoint includes `priceExplanation`
- ✅ `marginAmount > 0` and computed correctly (54.43 CNY)
- ✅ `explanationLines` exist (4 lines)
- ✅ Numeric values match pricing snapshot (no recalculation)
- ✅ Evidence saved to: `backend/docs/phase7_2_price_explanation_verify_output.txt`

**Evidence File:**
- Path: `backend/docs/phase7_2_price_explanation_verify_output.txt`
- Contains: Full JSON responses, validation results, order ID, customer ID

---

**Status:** ✅ **ACCEPTED** - All acceptance criteria met, verification script passed

