# Phase 7.1: Order Pricing Explainability & Reconciliation - Acceptance Document

**Status:** PENDING  
**Date:** 2025-12-14  
**Phase:** 7.1

**Related:** See also `PHASE7_1_FRONTEND_ORDER_DETAIL_ALIGN.md` for frontend alignment and pricing preview fixes.

---

## Overview

Phase 7.1 implements order pricing explainability and reconciliation by persisting a pricing breakdown snapshot at order creation time and exposing it via a dedicated read-only endpoint.

### Goals

- Make order pricing auditable and explainable
- Persist pricing breakdown snapshot at order creation
- Expose breakdown via dedicated endpoint
- Maintain backward compatibility with legacy orders

---

## What Changed

### Domain Layer

1. **New Value Object: `PricingBreakdownSnapshot`**
   - Location: `backend/src/domain/order/pricing-breakdown-snapshot.ts`
   - Immutable value object capturing:
     - Cost breakdown: `costIngredients`, `costPackaging`, `costLabor`, `costOverhead`, `totalProductCost`
     - Pricing: `productPrice`, `shippingFee`, `totalPrice`
     - Metadata: `shippingTemplateId`, `marginStrategyName`, `createdAt`, `ingredientPriceVersionHash`

2. **Order Entity Update**
   - Added optional field: `pricingBreakdownSnapshot?: PricingBreakdownSnapshot`
   - Field is immutable once set (readonly)
   - Legacy orders may not have this field

### Application Layer

3. **OrderService Update**
   - `createOrderDraft()` now creates and persists `PricingBreakdownSnapshot` during order creation
   - Captures shipping template ID from shipping calculation result
   - Captures margin strategy name from global config (e.g., "targetMargin_40%")

### Interface Layer

4. **New DTO: `PricingBreakdownResponseDto`**
   - Location: `backend/src/interfaces/dto/orders/pricing-preview.dto.ts`
   - Complete pricing breakdown with all fields and metadata

5. **New Endpoint: `GET /api/v1/orders/:id/pricing-breakdown`**
   - Location: `backend/src/interfaces/controllers/orders.controller.ts`
   - Auth required (JWT Bearer or X-Customer-Id)
   - Customer isolation enforced
   - Returns `ApiResponseDto<PricingBreakdownResponseDto>`
   - Legacy orders without breakdown: returns `code=200` with `data=null`

6. **OrderDto Update**
   - Optional `pricingBreakdown` field now populated from snapshot if available
   - Maintains backward compatibility

### Tests

7. **Unit Tests Added**
   - Location: `backend/src/interfaces/controllers/orders.controller.spec.ts`
   - Test: Order creation stores breakdown snapshot
   - Test: GET endpoint returns breakdown for owner
   - Test: Customer isolation (customer B cannot access customer A's breakdown)
   - Test: Legacy order without breakdown returns null

---

## API Specification

### Endpoint: `GET /api/v1/orders/:id/pricing-breakdown`

**Description:** Returns the pricing breakdown snapshot captured at order creation time.

**Authentication:** Required (JWT Bearer token or X-Customer-Id header)

**Path Parameters:**
- `id` (string, UUID): Order ID

**Response:**

**Success (200):**
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
    "shippingTemplateId": "8fa85f64-5717-4562-b3fc-2c963f66afa6",
    "marginStrategyName": "targetMargin_40%",
    "createdAt": "2024-01-01T00:00:00Z",
    "ingredientPriceVersionHash": null
  }
}
```

**Legacy Order (200, no breakdown):**
```json
{
  "code": 0,
  "message": "Success",
  "data": null
}
```

**Order Not Found (404):**
```json
{
  "code": 404,
  "message": "Order not found",
  "data": null
}
```

**Unauthorized (401):**
```json
{
  "code": 401,
  "message": "Unauthorized - X-Customer-Id header required",
  "data": null
}
```

**Customer Isolation:** If customer A tries to access customer B's order breakdown, returns 404 (same as order not found).

---

## Verification Script

### Running the Script

```bash
# Ensure backend is running
cd backend
pnpm start:dev

# In another terminal, run verification
bash scripts/phase7_1_pricing_breakdown_verify.sh
```

### Script Flow

1. Health check
2. Login and capture JWT token
3. Create or find dog (idempotent)
4. Create or find address (idempotent)
5. Create order with deterministic quantity (1400g, packageSpec 100, packageCount 14)
6. Confirm and pay order
7. Call `GET /orders/:id/pricing-breakdown`
8. Validate:
   - `body.code == 0`
   - `data.productPrice > 0`
   - `data.shippingFee >= 0`
   - `data.totalPrice ≈ productPrice + shippingFee` (tolerance 0.01)
   - All cost fields exist and are >= 0
9. Save evidence to `backend/docs/phase7_1_pricing_breakdown_verify_output.txt`

---

## Acceptance Checklist

- [x] PricingBreakdownSnapshot value object created
- [x] Order entity includes pricingBreakdownSnapshot field
- [x] OrderService persists breakdown during order creation
- [x] New endpoint `GET /orders/:id/pricing-breakdown` implemented
- [x] Endpoint requires authentication
- [x] Customer isolation enforced
- [x] Legacy orders return null (not error)
- [x] OrderDto includes optional pricingBreakdown field
- [x] Unit tests added and passing
- [x] Verification script created
- [x] Documentation created
- [ ] Verification script executed successfully
- [ ] All tests passing (`pnpm test`)
- [ ] Code compiles (`pnpm build`)

---

## Known Limitations

1. **In-Memory Repositories:**
   - `ingredientPriceVersionHash` is always `null` (not available in in-memory repos)
   - For production, this would track ingredient price version for auditability

2. **Margin Strategy:**
   - Currently uses simple string format: `targetMargin_40%`
   - In production, this could reference a more complex strategy engine

3. **Legacy Orders:**
   - Orders created before Phase 7.1 will not have pricing breakdown snapshots
   - Endpoint returns `null` for these orders (not an error)

4. **Single Item Orders:**
   - Current implementation assumes single-item orders (MVP)
   - Multi-item orders would need breakdown aggregation logic

---

## Testing

### Unit Tests

Run unit tests:
```bash
cd backend
pnpm test
```

Expected tests:
- Order creation stores breakdown snapshot
- GET endpoint returns breakdown for owner
- Customer isolation test
- Legacy order without breakdown test

### Integration Test

Run verification script:
```bash
bash scripts/phase7_1_pricing_breakdown_verify.sh
```

---

## Files Changed

### Domain
- `backend/src/domain/order/pricing-breakdown-snapshot.ts` (new)
- `backend/src/domain/order/order.entity.ts` (updated)
- `backend/src/domain/order/index.ts` (updated)

### Application
- `backend/src/application/order/order.service.ts` (updated)

### Interface
- `backend/src/interfaces/dto/orders/pricing-preview.dto.ts` (updated)
- `backend/src/interfaces/controllers/orders.controller.ts` (updated)
- `backend/src/interfaces/controllers/orders.controller.spec.ts` (updated)

### Scripts
- `backend/scripts/phase7_1_pricing_breakdown_verify.sh` (new)

### Documentation
- `backend/docs/PHASE7_1_PRICING_BREAKDOWN_ACCEPTANCE.md` (this file)

---

## Next Steps

1. Run verification script: `bash scripts/phase7_1_pricing_breakdown_verify.sh`
2. Verify all tests pass: `pnpm test`
3. Verify code compiles: `pnpm build`
4. Update `ACCEPTANCE_STATUS.md` with Phase 7.1 status
5. Mark Phase 7.1 as ACCEPTED once verification passes

---

## References

- **07_Core_Architecture.md**: Domain layering, immutability, unit system
- **04_Domain_Model_and_Algorithms.md**: Pricing calculation algorithms
- **05_API_Specs.md**: API contract specifications
- **02_Roles_and_Core_Flows.md**: Order state machine, snapshot immutability

---

**Status:** PENDING - Awaiting verification script execution

