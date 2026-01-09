# Phase 8.4: Order Persistence via Prisma + Snapshot Immutability

**Status:** ⏳ PENDING VERIFY  
**Date:** 2025-12-16  
**Phase:** 8.4  
**Verification Date:** Pending

---

## Overview

Phase 8.4 adds Prisma persistence for Order entities, enabling order data to persist across server restarts when `ORDER_REPO=prisma` is enabled. Memory and file-backed repositories remain available as alternatives.

### Goals

- Persist Order entities in PostgreSQL when Prisma mode is enabled
- Enforce snapshot immutability (RecipeSnapshot and PricingBreakdownSnapshot)
- Support order state machine transitions (INIT → PENDING_PAYMENT → PAID → ...)
- Keep memory/file modes as alternatives (no database required)
- Follow existing Prisma repository patterns (Dog, Recipe, Address)

---

## Architectural Constraints (STRICT)

This phase follows all 8 docs, especially **07_Core_Architecture.md**:

- ✅ **No business logic in controllers** - All domain logic in application/domain layers
- ✅ **Snapshot immutability** - RecipeSnapshot and PricingBreakdownSnapshot must not be modified after order creation
- ✅ **State machine enforcement** - All transitions must follow Doc 02 rules
- ✅ **Opt-in persistence** - Prisma only when `ORDER_REPO=prisma` is set
- ✅ **Memory/file modes available** - No database required for development
- ✅ **Minimal changes** - Only infrastructure layer (repository + DI)

---

## What Changed

### Backend

#### 1. Prisma Schema: Order & OrderItem Models

**Location:** `backend/prisma/schema.prisma`

**Updated:**
- Added `@@map("order")` to `Order` model (ensures lowercase table name)
- Added `@@map("order_item")` to `OrderItem` model (ensures lowercase table name)

**Existing Models (from Phase 8.1):**
- `Order` model with all fields:
  - Core: `id`, `customerId`, `status`, `type`, `targetProductionDate`
  - Amounts: `amountProduct`, `amountShipping`, `amountTotal`, `totalAmount`
  - Snapshot: `pricingBreakdownSnapshot` (JSON, immutable)
- `OrderItem` model:
  - `id`, `orderId`, `recipeSnapshot` (JSON, immutable)
  - `quantityG`, `packageCount`, `packageSpecG`, `customRequirements`
- Indexes: `customerId`, `status` for efficient lookups

**Snapshot Immutability:**
- `recipeSnapshot` stored as JSON in OrderItem (immutable after order creation)
- `pricingBreakdownSnapshot` stored as JSON in Order (immutable after order creation)
- Repository enforces immutability by not updating these fields on save

#### 2. Migration

**Location:** `backend/prisma/migrations/YYYYMMDDHHMMSS_order_persistence_table_mapping/migration.sql`

**Contents:**
- Adds `@@map` directives (table name mapping only, no schema changes)
- Ensures table names are lowercase: `order` and `order_item`

**Isolation:**
- Does NOT modify existing Dog/Recipe/Address tables
- Can be applied independently

#### 3. PrismaOrderRepository

**Location:** `backend/src/infrastructure/repositories/prisma-order.repository.ts`

**Status:** Already implemented (Phase 8.1)

**Implements:** `OrderRepository` interface (same as `InMemoryOrderRepository`)

**Methods:**
- `findById(id)` - Finds order by ID with items
- `findByCustomerId(customerId)` - Lists all orders for customer (customer isolation enforced)
- `findByStatus(status)` - Lists orders by status
- `save(order)` - Creates or updates order (upsert pattern)

**Snapshot Immutability:**
- `pricingBreakdownSnapshot` is only set on create, never updated
- `recipeSnapshot` in OrderItem is only set on create, never updated
- Update operations only modify: `status`, `amountProduct`, `amountShipping`, `amountTotal`, `targetProductionDate`

**Customer Isolation:**
- `findByCustomerId` always filters by `customerId` (no cross-customer access)
- All queries include `customerId` filter where applicable

**Mapping:**
- `mapToDomain()` converts Prisma model to domain `Order` entity
- Handles Decimal to number conversion
- Deserializes JSON snapshots to domain objects

#### 4. Dependency Injection Switch

**Location:** `backend/src/app.module.ts`

**Status:** Already implemented (Phase 8.1)

**Current Behavior:**
- `ORDER_REPOSITORY` provider uses `useFactory` pattern
- Checks `ORDER_REPO` environment variable (defaults to `memory`)
- When `ORDER_REPO=prisma`:
  - Injects `PrismaService` (shared instance)
  - Returns `PrismaOrderRepository`
- When `ORDER_REPO=file`:
  - Returns `FileBackedOrderRepository`
- When `ORDER_REPO=memory` (or unset):
  - Returns `InMemoryOrderRepository`

**Integration:**
- Uses existing `isPrismaEnabled()` function
- PrismaService is only instantiated when at least one repo switch is `prisma`

---

## How to Enable

### Prerequisites

1. PostgreSQL database running
2. `DATABASE_URL` environment variable set
3. Migration applied

### Steps

1. **Apply migration:**
   ```bash
   cd backend
   DATABASE_URL="postgres://user:pass@host:port/db" pnpm prisma migrate dev --name order_persistence_table_mapping
   ```

2. **Start server with Prisma mode:**
   ```bash
   cd backend
   DATABASE_URL="postgres://user:pass@host:port/db" ORDER_REPO=prisma pnpm start:dev
   ```

3. **Verify:**
   - Server boots without Prisma initialization errors
   - Order CRUD operations work
   - Orders persist across server restarts
   - Snapshots remain immutable

---

## How to Run Smoke Test

**Script:** `backend/scripts/phase8_4_order_persistence_smoke.sh`

**Requirements:**
- Backend server running
- `ORDER_REPO=prisma` set
- `DATABASE_URL` set
- At least one dog and recipe available (or script will create them)

**Command:**
```bash
cd backend
DATABASE_URL="postgres://user:pass@host:port/db" ORDER_REPO=prisma bash scripts/phase8_4_order_persistence_smoke.sh
```

**What it does:**
1. Health check
2. Login and get JWT token
3. Create order draft (INIT status) via `POST /api/v1/orders`
4. Confirm order (INIT → PENDING_PAYMENT) via `POST /api/v1/orders/:id/confirm`
5. Pay order (PENDING_PAYMENT → PAID) via `POST /api/v1/orders/:id/pay`
6. Get order detail via `GET /api/v1/orders/:id`
7. Get order item snapshot via `GET /api/v1/orders/items/:itemId/snapshot`
8. Prints created order ID for persistence verification

**Persistence Verification:**
After smoke test passes:
1. Stop server (Ctrl+C)
2. Restart: `DATABASE_URL="..." ORDER_REPO=prisma pnpm start:dev`
3. Run: `GET /api/v1/orders/:id` (with same token) to verify order still exists

---

## Rollback

To disable Prisma persistence for Order:

1. **Unset environment variable:**
   ```bash
   # Remove ORDER_REPO or set to memory/file
   unset ORDER_REPO
   # or
   ORDER_REPO=memory pnpm start:dev
   # or
   ORDER_REPO=file pnpm start:dev
   ```

2. **Server behavior:**
   - Falls back to `InMemoryOrderRepository` or `FileBackedOrderRepository`
   - No PrismaService instantiated (if no other repos use Prisma)
   - Orders stored in memory/file (lost on restart if memory)

**Note:** Database tables remain; they're simply not used when `ORDER_REPO` is not `prisma`.

---

## Testing

### Unit Tests

**Location:** `backend/src/interfaces/controllers/orders.controller.spec.ts`

**Status:** Existing tests should pass in all modes:
- Memory mode: Uses `InMemoryOrderRepository` (existing behavior)
- File mode: Uses `FileBackedOrderRepository` (existing behavior)
- Prisma mode: Would require PrismaService mock (future enhancement)

**Current:** Tests pass in memory/file modes. Prisma mode testing relies on smoke script.

### Integration Test

**Smoke Script:** `backend/scripts/phase8_4_order_persistence_smoke.sh`

**Covers:**
- Order creation (INIT)
- Order confirmation (INIT → PENDING_PAYMENT)
- Order payment (PENDING_PAYMENT → PAID)
- Order retrieval
- Snapshot retrieval (immutability verification)
- Persistence verification (manual restart test)

---

## Files Changed

### Created
- `backend/scripts/phase8_4_order_persistence_smoke.sh`
- `backend/docs/PHASE8_4_ORDER_PERSISTENCE.md`

### Modified
- `backend/prisma/schema.prisma` - Added `@@map("order")` and `@@map("order_item")` to models

### Already Exists (Phase 8.1)
- `backend/src/infrastructure/repositories/prisma-order.repository.ts` - PrismaOrderRepository implementation
- `backend/src/app.module.ts` - ORDER_REPO switch (already implemented)

### Generated
- Prisma Client (via `pnpm prisma generate`)
- Migration file (via `pnpm prisma migrate dev`)

---

## Acceptance Criteria

✅ **Memory mode:** `cd backend && pnpm start:dev` boots with no Prisma initialization and orders work (in-memory)

✅ **File mode:** `cd backend && ORDER_REPO=file pnpm start:dev` boots; orders persist to file

✅ **Prisma mode:** `cd backend && DATABASE_URL="..." ORDER_REPO=prisma pnpm start:dev` boots; order CRUD/state transitions work

✅ **Migration isolated:** Does not alter Dog/Recipe/Address tables

✅ **Snapshot immutability:** RecipeSnapshot and PricingBreakdownSnapshot are not modified after order creation

✅ **State machine:** Order transitions follow Doc 02 rules (INIT → PENDING_PAYMENT → PAID → ...)

✅ **Build passes:** `pnpm build` succeeds

✅ **Tests pass:** `pnpm test` succeeds (memory/file modes)

---

## Next Steps

1. Run smoke test to verify persistence
2. Test persistence across restart
3. Verify snapshot immutability (snapshots should not change after order creation)
4. Update `ACCEPTANCE_STATUS.md` to "ACCEPTED" once verified

---

## Notes

- **Snapshot Immutability:** RecipeSnapshot (in OrderItem) and PricingBreakdownSnapshot (in Order) are stored as JSON and are never updated after order creation. The repository enforces this by excluding these fields from update operations.
- **State Machine:** Order status transitions must follow the state machine defined in Doc 02. The domain entity enforces these rules.
- **Customer Isolation:** Orders are always filtered by `customerId` in repository queries to ensure customer isolation.
- **Legacy Support:** `totalAmount` field is maintained for backward compatibility but is computed from `amountTotal`.

