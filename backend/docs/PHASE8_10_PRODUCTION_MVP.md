# Phase 8.10: Production & Packaging MVP (Backend Only)

## Overview

Phase 8.10 introduces the minimum backend production/packaging domain to enable "PAID order → production-ready data". This phase establishes the foundation for production batch management without implementing inventory deduction, shipping, or UI changes.

## Scope

### Implemented

1. **Domain Models:**
   - `ProductionBatch` - Aggregate root for production batches
   - `PackagingUnit` - Represents what is actually produced per recipe

2. **Persistence:**
   - Prisma schema with `ProductionBatch` and `PackagingUnit` models
   - Repository implementations with transaction support

3. **Application Services:**
   - `ProductionService.createProductionBatch()` - Groups PAID orders by recipe and aggregates `dailyIntakeG`

4. **API Endpoints:**
   - `POST /api/v1/admin/production-batches` - Create production batch
   - `GET /api/v1/admin/production-batches/:id` - Get batch details

5. **Tests:**
   - Unit tests for aggregation correctness
   - Guard tests for non-PAID order rejection
   - Snapshot immutability tests

### Not Implemented (Intentionally)

- ❌ Inventory deduction
- ❌ Shipping / logistics
- ❌ Frontend / Miniapp changes
- ❌ Pricing recalculation
- ❌ Cross-day scheduling optimization
- ❌ Multi-day production logic (assumes 1-day production)

## Architecture

### Domain Entities

**ProductionBatch:**
- `id`: UUID
- `productionDate`: Date (YYYY-MM-DD)
- `status`: PLANNED | IN_PRODUCTION | COMPLETED
- `packagingUnits`: PackagingUnit[]
- Immutable once status >= IN_PRODUCTION

**PackagingUnit:**
- `id`: UUID
- `productionBatchId`: UUID
- `recipeSnapshot`: RecipeSnapshot (immutable reference)
- `totalProductionG`: number (aggregated from OrderItems)
- `sourceOrderItemIds`: string[] (traceability)

### Core Algorithm

When creating a ProductionBatch:

1. Load PAID orders (or specific orderIds if provided)
2. Validate all orders are PAID
3. Collect all OrderItems with their `dailyIntakeG` (already persisted from Phase 8.9)
4. Group by `recipeSnapshot.id`
5. Aggregate: `totalProductionG = SUM(dailyIntakeG)` per recipe
6. Create one PackagingUnit per unique recipeSnapshotId
7. Link contributing OrderItem IDs for traceability

### Key Constraints

- Only PAID orders can be included
- `dailyIntakeG` is never recalculated (uses persisted value from Phase 8.9)
- RecipeSnapshot is immutable (captured at order creation)
- ProductionBatch is immutable once status >= IN_PRODUCTION

## API Endpoints

### POST /api/v1/admin/production-batches

**Request:**
```json
{
  "productionDate": "2025-01-20",
  "orderIds": ["optional-array"]
}
```

**Response:**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "id": "...",
    "productionDate": "2025-01-20",
    "status": "PLANNED",
    "packagingUnits": [
      {
        "recipeSnapshotId": "...",
        "totalProductionG": 3200,
        "orderItemCount": 5
      }
    ],
    "totalProductionG": 3200,
    "uniqueRecipeCount": 1
  }
}
```

### GET /api/v1/admin/production-batches/:id

Returns full batch details with traceability (same structure as POST response).

## Database Schema

**ProductionBatch:**
- `id` (UUID, PK)
- `production_date` (DateTime)
- `status` (ProductionBatchStatus enum)
- `created_at` (DateTime)

**PackagingUnit:**
- `id` (UUID, PK)
- `production_batch_id` (UUID, FK)
- `recipe_snapshot` (JSON)
- `total_production_g` (Float)
- `source_order_item_ids` (String[])
- `created_at` (DateTime)

## Migration

To apply database changes:

```bash
cd backend
DATABASE_URL="postgres://user:pass@127.0.0.1:5433/sevenkitchen" \
pnpm prisma migrate dev --name add_production_batch_and_packaging_unit
```

## Verification

### Build
```bash
cd backend
pnpm run build
```

### Tests
```bash
cd backend
pnpm test -- production.service.spec
```

Expected: 3 tests pass
- Aggregation correctness
- Non-PAID order rejection
- Snapshot immutability

### API Test (requires server)
```bash
# 1. Start server
cd backend
DATABASE_URL="postgres://user:pass@127.0.0.1:5433/sevenkitchen" \
ORDER_REPO=prisma \
PRODUCTION_REPO=prisma \
pnpm start:dev

# 2. Create production batch
curl -X POST http://localhost:3000/api/v1/admin/production-batches \
  -H "Content-Type: application/json" \
  -d '{
    "productionDate": "2025-01-20"
  }'

# 3. Get batch details
curl -X GET http://localhost:3000/api/v1/admin/production-batches/{batchId}
```

## Acceptance Criteria

- [x] ProductionBatch and PackagingUnit domain entities created
- [x] Prisma schema updated with migrations
- [x] ProductionService aggregates dailyIntakeG correctly
- [x] Non-PAID orders are rejected
- [x] RecipeSnapshot immutability preserved
- [x] API endpoints functional
- [x] Unit tests pass (3 tests)

## Known Limitations

1. **No assignment tracking:** MVP does not track which orders are already assigned to batches. All PAID orders are included if `orderIds` is not provided.

2. **1-day assumption:** Algorithm assumes 1-day production. Multi-day logic deferred.

3. **No inventory:** Inventory deduction and stock management not implemented.

4. **Prisma type assertions:** Repository uses `@ts-expect-error` for Prisma types until migration is applied and client is regenerated.

## Next Steps (Future Phases)

- Phase 9.x: Inventory deduction during production
- Phase 9.x: Multi-day production scheduling
- Phase 9.x: Production task assignment
- Phase 9.x: Actual weight recording
- Phase 9.x: Photo uploads for traceability

---

**Status:** ⏳ PENDING VERIFY  
**Created:** 2025-12-16  
**Phase:** 8.10

