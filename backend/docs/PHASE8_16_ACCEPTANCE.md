# Phase 8.16: Order Cancellation Workflow - Acceptance Document

## Overview

Phase 8.16 implements order cancellation functionality, allowing customers and admins to cancel orders based on role-based permissions. This phase adds cancellation fields, domain logic, APIs, and comprehensive validation while maintaining strict scope (no refunds, no partial cancellation).

## What Was Built

### 1. Order Cancellation Domain Logic
- Added `cancelledAt`, `cancellationReason`, and `cancelledBy` fields to Order domain entity
- Added `cancelOrder(reason, cancelledBy)` method to Order entity
- Method enforces role-based cancellation rules:
  - **Customer**: Can cancel only INIT or PENDING_PAYMENT orders
  - **Admin/System**: Can cancel any status except SHIPPED, COMPLETED, and CANCELLED
- Sets cancellation fields automatically
- Transitions order to CANCELLED status
- Idempotent: Re-cancelling a CANCELLED order is rejected with clear error

### 2. State Machine Updates
- Updated state machine to allow CANCELLED transition from:
  - INIT → CANCELLED
  - PENDING_PAYMENT → CANCELLED
  - PAID → CANCELLED (admin only)
  - WAITING_FOR_PRODUCTION → CANCELLED (admin only)
  - IN_PRODUCTION → CANCELLED (admin only)
  - READY_FOR_PACKAGING → CANCELLED (admin only)
  - READY_FOR_SHIPMENT → CANCELLED (admin only)
- SHIPPED and COMPLETED orders cannot be cancelled (terminal states)

### 3. Order Cancellation Service
- Added `cancelOrder(orderId, reason, cancelledBy)` method to `OrderService`
- Validates order existence
- Calls domain method `cancelOrder()`
- Returns updated order with cancellation fields

### 4. Customer API Endpoint
- **POST /api/v1/orders/:id/cancel**: Cancel an order (customer)
  - Requires authentication (X-Customer-Id header)
  - Validates customer owns the order
  - Request body: `{ "reason": string }`
  - Returns updated order with cancellation fields

### 5. Admin API Endpoint
- **POST /api/v1/admin/orders/:id/cancel**: Cancel an order (admin)
  - Request body: `{ "reason": string }`
  - Returns updated order with cancellation fields
  - Can cancel orders in more states than customer endpoint

### 6. Persistence
- Added `cancelled_at`, `cancellation_reason`, and `cancelled_by` fields to Prisma schema
- Updated `PrismaOrderRepository` to persist and load cancellation fields
- Fields are nullable (null until order is cancelled)
- Migration: `20251219193259_add_order_cancellation_fields`

### 7. API Response Updates
- Added `cancelledAt`, `cancellationReason`, and `cancelledBy` fields to `OrderDto`
- Updated `mapOrderToDto()` to include cancellation fields in all order responses
- Fields are included in customer-facing and admin order detail endpoints

## State Transitions

### Order Status Flow
```
INIT → CANCELLED (customer or admin)
PENDING_PAYMENT → CANCELLED (customer or admin)
PAID → CANCELLED (admin only)
WAITING_FOR_PRODUCTION → CANCELLED (admin only)
IN_PRODUCTION → CANCELLED (admin only)
READY_FOR_PACKAGING → CANCELLED (admin only)
READY_FOR_SHIPMENT → CANCELLED (admin only)
SHIPPED → [cannot be cancelled]
COMPLETED → [cannot be cancelled]
CANCELLED → [terminal state, cannot be cancelled again]
```

**Rules**:
- Customer can only cancel INIT or PENDING_PAYMENT orders
- Admin can cancel any status except SHIPPED, COMPLETED, and CANCELLED
- CANCELLED is a terminal state (no further transitions allowed)
- Cancellation fields are set when order is cancelled
- Re-cancelling a CANCELLED order is rejected with clear error message

## Architecture Compliance

✅ **Controller Layer**: Validates input, calls service, returns DTO  
✅ **Service Layer**: Enforces business rules (role-based validation)  
✅ **Domain Layer**: State machine remains authoritative  
✅ **Snapshot Integrity**: No mutable Recipe reads  
✅ **Idempotency**: Safe to call cancellation endpoint on already-cancelled order (returns clear error)  
✅ **Role-Based Access**: Customer and admin have different cancellation permissions

## Database Changes

### Schema Update

**File**: `backend/prisma/schema.prisma`

**Changes**:
- Added `cancelledAt DateTime? @map("cancelled_at")` to `Order` model
- Added `cancellationReason String? @map("cancellation_reason")` to `Order` model
- Added `cancelledBy String? @map("cancelled_by")` to `Order` model

**Migration**: `20251219193259_add_order_cancellation_fields`
```sql
ALTER TABLE "order" ADD COLUMN "cancelled_at" TIMESTAMP(3),
ADD COLUMN "cancellation_reason" TEXT,
ADD COLUMN "cancelled_by" TEXT;
```

## How to Verify

### 1. Run E2E Script

The E2E script has been extended with Steps 13, 14, and 15:

```bash
cd backend
./scripts/phase8_14_shipping_fulfillment_e2e_verify.sh
```

**Expected Output**:
- Step 13: Create order in INIT, cancel by customer → succeeds
- Step 14: Verify cancellation fields are persisted (cancelledAt, cancellationReason, cancelledBy)
- Step 15: Attempt to cancel COMPLETED order → fails with 400

### 2. Manual API Testing

#### Test 1: Customer cancels INIT order
```bash
# Create order
curl -X POST "http://127.0.0.1:3000/api/v1/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {customerToken}" \
  -d '{"dogId":"...","type":"FRESH_FOOD","items":[...]}'

# Cancel order
curl -X POST "http://127.0.0.1:3000/api/v1/orders/{orderId}/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {customerToken}" \
  -d '{"reason":"Customer requested cancellation"}'
```

**Expected Response**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "...",
    "status": "CANCELLED",
    "cancelledAt": "2025-01-20T10:30:00.000Z",
    "cancellationReason": "Customer requested cancellation",
    "cancelledBy": "customer"
  }
}
```

#### Test 2: Customer cannot cancel PAID order
```bash
# Try to cancel a PAID order (should fail)
curl -X POST "http://127.0.0.1:3000/api/v1/orders/{paidOrderId}/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {customerToken}" \
  -d '{"reason":"Customer request"}'
```

**Expected Response**:
```json
{
  "code": 400,
  "message": "Customer cannot cancel order in status: PAID. Only INIT or PENDING_PAYMENT orders can be cancelled by customer."
}
```

#### Test 3: Admin cancels PAID order
```bash
# Login as staff
curl -X POST "http://127.0.0.1:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"staff-user-001"}'

# Cancel order
curl -X POST "http://127.0.0.1:3000/api/v1/admin/orders/{orderId}/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {staffToken}" \
  -d '{"reason":"Admin cancellation"}'
```

**Expected Response**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "...",
    "status": "CANCELLED",
    "cancelledAt": "2025-01-20T10:30:00.000Z",
    "cancellationReason": "Admin cancellation",
    "cancelledBy": "admin"
  }
}
```

#### Test 4: Admin cannot cancel COMPLETED order
```bash
# Try to cancel a COMPLETED order (should fail)
curl -X POST "http://127.0.0.1:3000/api/v1/admin/orders/{completedOrderId}/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {staffToken}" \
  -d '{"reason":"Admin request"}'
```

**Expected Response**:
```json
{
  "code": 400,
  "message": "Admin/system cannot cancel order in status: COMPLETED. SHIPPED and COMPLETED orders cannot be cancelled."
}
```

#### Test 5: Idempotency - Re-cancelling CANCELLED order
```bash
# Cancel an already-cancelled order (should fail)
curl -X POST "http://127.0.0.1:3000/api/v1/orders/{cancelledOrderId}/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {customerToken}" \
  -d '{"reason":"Another reason"}'
```

**Expected Response**:
```json
{
  "code": 400,
  "message": "Order is already cancelled"
}
```

### 3. Verify State Machine Rules

#### Test: Customer cancellation permissions
- ✅ Customer can cancel INIT order
- ✅ Customer can cancel PENDING_PAYMENT order
- ❌ Customer cannot cancel PAID order
- ❌ Customer cannot cancel IN_PRODUCTION order
- ❌ Customer cannot cancel SHIPPED order
- ❌ Customer cannot cancel COMPLETED order

#### Test: Admin cancellation permissions
- ✅ Admin can cancel INIT order
- ✅ Admin can cancel PENDING_PAYMENT order
- ✅ Admin can cancel PAID order
- ✅ Admin can cancel IN_PRODUCTION order
- ✅ Admin can cancel READY_FOR_SHIPMENT order
- ❌ Admin cannot cancel SHIPPED order
- ❌ Admin cannot cancel COMPLETED order
- ❌ Admin cannot cancel already CANCELLED order

## Acceptance Checklist

- [x] Order domain entity has `cancelledAt`, `cancellationReason`, and `cancelledBy` fields
- [x] Order domain entity has `cancelOrder()` method
- [x] `cancelOrder()` enforces role-based cancellation rules
- [x] `cancelOrder()` sets cancellation fields
- [x] `cancelOrder()` transitions order to CANCELLED status
- [x] State machine allows CANCELLED from appropriate states
- [x] Prisma schema includes cancellation fields
- [x] Migration created for cancellation fields
- [x] Repository persists cancellation fields on save
- [x] Repository loads cancellation fields on find
- [x] Service has `cancelOrder()` method
- [x] Customer controller has cancellation endpoint
- [x] Admin controller has cancellation endpoint
- [x] Endpoints validate order existence
- [x] Endpoints validate order status and role permissions
- [x] Endpoints return updated order with cancellation fields
- [x] OrderDto includes cancellation fields
- [x] `mapOrderToDto()` includes cancellation fields
- [x] E2E script includes cancellation test steps (13, 14, 15)
- [x] E2E script verifies cancellation state and fields
- [x] Unit tests cover cancellation scenarios
- [x] All tests pass (`npm test`)
- [x] Build succeeds (`npm run build`)

## Files Changed

### Domain Layer
- `backend/src/domain/order/order.entity.ts`: Added cancellation fields and `cancelOrder()` method, updated state machine

### Application Layer
- `backend/src/application/order/order.service.ts`: Added `cancelOrder()` method
- `backend/src/application/order/order.service.spec.ts`: Added cancellation unit tests

### Infrastructure Layer
- `backend/src/infrastructure/repositories/prisma-order.repository.ts`: Persist and load cancellation fields

### Interface Layer
- `backend/src/interfaces/controllers/orders.controller.ts`: Added customer cancellation endpoint
- `backend/src/interfaces/controllers/admin.controller.ts`: Added admin cancellation endpoint
- `backend/src/interfaces/dto/orders/cancel-order.dto.ts`: Created cancellation request DTO
- `backend/src/interfaces/dto/orders/order-response.dto.ts`: Added cancellation fields to OrderDto

### Schema
- `backend/prisma/schema.prisma`: Added cancellation fields to Order model
- `backend/prisma/migrations/20251219193259_add_order_cancellation_fields/migration.sql`: Migration for cancellation fields

### Testing
- `backend/scripts/phase8_14_shipping_fulfillment_e2e_verify.sh`: Added Steps 13, 14, and 15 for cancellation testing

## Notes

- **Strict Scope**: This phase implements only cancellation workflow. Refunds, payment reversal, partial cancellation, auto-cancellation, and notifications are explicitly excluded.
- **Idempotency**: The cancellation endpoint is idempotent. Calling it on an already-cancelled order returns a clear error message (400 Bad Request).
- **Terminal State**: CANCELLED is a terminal state. Once an order is CANCELLED, no further state transitions are allowed.
- **Role-Based Access**: Customer and admin have different cancellation permissions, enforced at the domain layer.
- **Error Handling**: All invalid cancellation attempts return clear 4xx error messages with descriptive reasons.

## Next Steps (Out of Scope)

- Refund logic
- Payment reversal
- Partial cancellation (order items)
- Auto-cancellation (time-based)
- Notification system
- Cancellation analytics/reporting
