# Phase 8.14: Production Shipment / Fulfillment MVP

## Goal
Close the operational loop after kitchen completion by enabling shipment fulfillment:
- Auto-complete ProductionBatch when all PackagingUnits are COMPLETED
- Auto-transition Orders to READY_FOR_SHIPMENT when batch completes
- Enable Shipping staff to mark orders as SHIPPED with tracking information

## Entities Touched

### 1. Order Entity
- **New Fields** (Phase 8.14):
  - `trackingNumber: string | null` - Shipping tracking number
  - `carrierCode: string | null` - Shipping carrier code (e.g., "SF" for 顺丰)
  - `shippedAt: Date | null` - Timestamp when order was shipped

### 2. ProductionBatch Entity
- **Behavior Change**: Auto-transition to COMPLETED when all PackagingUnits are COMPLETED

### 3. Order Status Transitions
- **New Automatic Transition**: When ProductionBatch completes → Orders transition to READY_FOR_SHIPMENT
- **New Manual Transition**: Staff can transition READY_FOR_SHIPMENT → SHIPPED (with tracking info)

## Endpoints

### 1. GET /api/v1/staff/shipping/orders
**Purpose**: List orders ready for shipment

**Query Parameters**:
- `status` (optional): Filter by status (default: READY_FOR_SHIPMENT)

**Response**:
```typescript
{
  code: 0,
  data: Array<{
    id: string;
    customerId: string;
    status: OrderStatus;
    amountTotal: number;
    addressId: string | null;
    // Shipping-related fields
    trackingNumber: string | null;
    carrierCode: string | null;
    shippedAt: string | null;
    items: Array<{
      id: string;
      recipeSnapshotId: string;
      quantityG: number;
    }>;
  }>
}
```

### 2. POST /api/v1/staff/shipping/orders/{orderId}/ship
**Purpose**: Mark order as shipped with tracking information

**Request Body**:
```typescript
{
  trackingNumber: string; // Required
  carrierCode: string;    // Required (e.g., "SF", "YTO", "ZTO")
}
```

**Constraints**:
- Order must be in READY_FOR_SHIPMENT status
- trackingNumber and carrierCode are required

**Response**:
```typescript
{
  code: 0,
  data: {
    id: string;
    status: OrderStatus.SHIPPED;
    trackingNumber: string;
    carrierCode: string;
    shippedAt: string; // ISO timestamp
  }
}
```

## State Transitions

### ProductionBatch
- **Automatic**: When all PackagingUnits in batch are COMPLETED → Batch transitions to COMPLETED

### Order
- **Automatic**: When ProductionBatch (containing OrderItems) completes → Order transitions to READY_FOR_SHIPMENT
- **Manual (Staff)**: READY_FOR_SHIPMENT → SHIPPED (via POST /staff/shipping/orders/{orderId}/ship)

## Persistence Changes

### Prisma Schema
Add to `Order` model:
```prisma
model Order {
  // ... existing fields ...
  trackingNumber  String?  @map("tracking_number")
  carrierCode     String?  @map("carrier_code")
  shippedAt       DateTime? @map("shipped_at")
}
```

### Migration
Create migration: `YYYYMMDDHHMMSS_add_order_shipping_fields`

## Implementation Plan

### 1. Domain Layer
- **Order Entity**: Add tracking fields (trackingNumber, carrierCode, shippedAt)
- **Order Entity**: Add `markAsShipped(trackingNumber, carrierCode)` method
- **ProductionBatch Entity**: Add `areAllUnitsCompleted()` helper method

### 2. Application Layer
- **ProductionService**: Add `checkAndCompleteBatch(batchId)` method
  - Check if all PackagingUnits are COMPLETED
  - If yes, transition batch to COMPLETED
  - Find all Orders with OrderItems in this batch
  - Transition Orders to READY_FOR_SHIPMENT
- **ShippingService** (NEW): 
  - `listOrdersReadyForShipment()`: Query orders with READY_FOR_SHIPMENT status
  - `markOrderAsShipped(orderId, trackingNumber, carrierCode)`: Transition order to SHIPPED

### 3. Interface Layer
- **StaffShippingController** (NEW):
  - `GET /api/v1/staff/shipping/orders`: List orders ready for shipment
  - `POST /api/v1/staff/shipping/orders/{orderId}/ship`: Mark order as shipped

### 4. Infrastructure Layer
- **PrismaOrderRepository**: Update to handle new tracking fields
- **Migration**: Add tracking fields to Order table

## Acceptance Criteria

1. ✅ When all PackagingUnits in a ProductionBatch are COMPLETED, batch automatically transitions to COMPLETED
2. ✅ When a ProductionBatch completes, all related Orders transition to READY_FOR_SHIPMENT
3. ✅ Staff can list orders with READY_FOR_SHIPMENT status via GET /api/v1/staff/shipping/orders
4. ✅ Staff can mark order as SHIPPED via POST /api/v1/staff/shipping/orders/{orderId}/ship
5. ✅ Tracking information (trackingNumber, carrierCode, shippedAt) is persisted
6. ✅ State machine transitions are validated (cannot ship non-READY_FOR_SHIPMENT orders)
7. ✅ All unit tests pass
8. ✅ E2E verification script passes on macOS bash 3.2

## Test Plan

### Unit Tests
1. **ProductionService.spec.ts**:
   - Test batch auto-completion when all units are COMPLETED
   - Test order auto-transition to READY_FOR_SHIPMENT when batch completes
   - Test batch does not complete if any unit is not COMPLETED

2. **ShippingService.spec.ts** (NEW):
   - Test listOrdersReadyForShipment returns only READY_FOR_SHIPMENT orders
   - Test markOrderAsShipped transitions order to SHIPPED
   - Test markOrderAsShipped rejects non-READY_FOR_SHIPMENT orders
   - Test tracking information is persisted

3. **StaffShippingController.spec.ts** (NEW):
   - Test GET /staff/shipping/orders returns correct list
   - Test POST /staff/shipping/orders/{orderId}/ship with valid data
   - Test POST /staff/shipping/orders/{orderId}/ship rejects invalid status
   - Test POST /staff/shipping/orders/{orderId}/ship validates required fields

### E2E Test
**Script**: `backend/scripts/phase8_14_shipment_fulfillment_e2e_verify.sh`

**Steps**:
1. Health check
2. Login (staff)
3. Create order and pay
4. Create production batch
5. Complete all packaging units (via kitchen task update)
6. Verify batch auto-completes
7. Verify order auto-transitions to READY_FOR_SHIPMENT
8. List orders ready for shipment
9. Mark order as shipped with tracking info
10. Verify order status is SHIPPED
11. Verify tracking info is persisted

## Architecture Compliance

- ✅ Controller validates input structure (DTO validation)
- ✅ Service enforces business rules (state machine, domain logic)
- ✅ Domain state machine remains authoritative
- ✅ Snapshot integrity: no mutable Recipe reads
- ✅ Tests clean: no console noise
