# Phase 8.2 Part B: Dog Persistence via Prisma

**Status:** ✅ ACCEPTED  
**Date:** 2025-12-15  
**Phase:** 8.2 Part B  
**Verification Date:** 2025-12-15

---

## Overview

Phase 8.2 Part B adds Prisma persistence for Dog profiles, enabling dog data to persist across server restarts when `DOG_REPO=prisma` is enabled. Memory repositories remain the default.

### Goals

- Persist Dog profiles in PostgreSQL when Prisma mode is enabled
- Maintain customer isolation (filter by `ownerId`)
- Keep memory mode as default (no database required)
- Follow existing Prisma repository patterns (Order, Address)

---

## Architectural Constraints (STRICT)

This phase follows all 8 docs, especially **07_Core_Architecture.md**:

- ✅ **No business logic in controllers** - All domain logic in application/domain layers
- ✅ **Customer isolation enforced** - Repository always filters by `ownerId`
- ✅ **Opt-in persistence** - Prisma only when `DOG_REPO=prisma` is set
- ✅ **Memory mode default** - No database required for development
- ✅ **Minimal changes** - Only infrastructure layer (repository + DI)

---

## What Changed

### Backend

#### 1. Prisma Schema: Dog Model

**Location:** `backend/prisma/schema.prisma`

**Added:**
- 6 new enums: `DogGender`, `ActivityLevel`, `LifeStageOverride`, `DogSizeCategory`, `TreatInputMode`, `TreatLevel`
- `Dog` model with all fields from `07_Core_Architecture.md`:
  - Core fields: `id`, `ownerId`, `name`, `breedId`, `birthday`
  - Physical: `gender`, `isNeutered`, `currentWeightKg`, `bcsScore`
  - Activity: `activityLevel`, `lifeStageOverride`, `sizeClassOverride`
  - Feeding: `mealsPerDay`, `treatInputMode`, `treatLevel`, `manualTreatKcal`
  - Metadata: `medicalHistory`, `cachedTargetFoodKcal`, `createdAt`
- Indexes: `ownerId`, `(ownerId, createdAt)` for efficient lookups

**Field Mapping:**
- Domain uses camelCase (e.g., `ownerId`)
- Database uses snake_case (e.g., `owner_id`) via `@map` annotations
- Enums match domain enums exactly

#### 2. Migration

**Location:** `backend/prisma/migrations/20251215020000_dog_persistence/migration.sql`

**Contents:**
- Creates 6 enum types
- Creates `dog` table with all fields
- Creates indexes for customer isolation and ordering

**Isolation:**
- Does NOT modify existing Order/Address tables
- Can be applied independently

#### 3. PrismaDogRepository

**Location:** `backend/src/infrastructure/repositories/prisma-dog.repository.ts`

**Implements:** `DogRepository` interface (same as `InMemoryDogRepository`)

**Methods:**
- `findById(id)` - Finds dog by ID
- `findByOwnerId(ownerId)` - Lists all dogs for owner (customer isolation enforced)
- `save(dog)` - Creates or updates dog (upsert pattern)
- `delete(id)` - Deletes dog by ID

**Customer Isolation:**
- `findByOwnerId` always filters by `ownerId` (no cross-customer access)
- All queries include `ownerId` filter where applicable

**Mapping:**
- `mapToDomain()` converts Prisma model to domain `Dog` entity
- Handles enum casting and nullable fields correctly

#### 4. Dependency Injection Switch

**Location:** `backend/src/app.module.ts`

**Changes:**
- `DOG_REPOSITORY` provider now uses `useFactory` pattern
- Checks `DOG_REPO` environment variable (defaults to `memory`)
- When `DOG_REPO=prisma`:
  - Injects `PrismaService` (shared instance)
  - Returns `PrismaDogRepository`
- When `DOG_REPO=memory` (or unset):
  - Returns `InMemoryDogRepository`
  - No PrismaService dependency

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
   DATABASE_URL="postgres://user:pass@host:port/db" pnpm prisma migrate deploy
   ```

2. **Start server with Prisma mode:**
   ```bash
   cd backend
   DATABASE_URL="postgres://user:pass@host:port/db" DOG_REPO=prisma pnpm start:dev
   ```

3. **Verify:**
   - Server boots without Prisma initialization errors
   - Dog CRUD operations work
   - Dogs persist across server restarts

---

## How to Run Smoke Test

**Script:** `backend/scripts/phase8_2b_dog_persistence_smoke.sh`

**Requirements:**
- Backend server running
- `DOG_REPO=prisma` set
- `DATABASE_URL` set

**Command:**
```bash
cd backend
DATABASE_URL="postgres://user:pass@host:port/db" DOG_REPO=prisma bash scripts/phase8_2b_dog_persistence_smoke.sh
```

**What it does:**
1. Health check
2. Login and get JWT token
3. Create dog via `POST /api/v1/dogs`
4. List dogs via `GET /api/v1/dogs` (verifies creation)
5. Get dog by ID via `GET /api/v1/dogs/:id`
6. Update dog via `PUT /api/v1/dogs/:id`
7. Prints created dog ID for persistence verification

**Persistence Verification:**
After smoke test passes:
1. Stop server (Ctrl+C)
2. Restart: `DATABASE_URL="..." DOG_REPO=prisma pnpm start:dev`
3. Run: `GET /api/v1/dogs` (with same token) to verify dog still exists

---

## Rollback

To disable Prisma persistence for Dog:

1. **Unset environment variable:**
   ```bash
   # Remove DOG_REPO or set to memory
   unset DOG_REPO
   # or
   DOG_REPO=memory pnpm start:dev
   ```

2. **Server behavior:**
   - Falls back to `InMemoryDogRepository`
   - No PrismaService instantiated (if no other repos use Prisma)
   - Dogs stored in memory (lost on restart)

**Note:** Database tables remain; they're simply not used when `DOG_REPO` is not `prisma`.

---

## Testing

### Unit Tests

**Location:** `backend/src/interfaces/controllers/dogs.controller.spec.ts`

**Status:** Existing tests should pass in both modes:
- Memory mode: Uses `InMemoryDogRepository` (existing behavior)
- Prisma mode: Would require PrismaService mock (future enhancement)

**Current:** Tests pass in memory mode. Prisma mode testing relies on smoke script.

### Integration Test

**Smoke Script:** `backend/scripts/phase8_2b_dog_persistence_smoke.sh`

**Covers:**
- Dog creation
- Dog listing (customer isolation)
- Dog retrieval by ID
- Dog update
- Persistence verification (manual restart test)

---

## Files Changed

### Created
- `backend/prisma/migrations/20251215020000_dog_persistence/migration.sql`
- `backend/src/infrastructure/repositories/prisma-dog.repository.ts`
- `backend/scripts/phase8_2b_dog_persistence_smoke.sh`
- `backend/docs/PHASE8_2B_DOG_PERSISTENCE.md`

### Modified
- `backend/prisma/schema.prisma` - Added Dog model and enums
- `backend/src/app.module.ts` - Added DOG_REPO switch

### Generated
- Prisma Client (via `pnpm prisma generate`)

---

## Acceptance Criteria

✅ **Memory mode:** `cd backend && pnpm start:dev` boots with no Prisma initialization and dogs work (in-memory)

✅ **Prisma mode:** `cd backend && DATABASE_URL="..." DOG_REPO=prisma pnpm start:dev` boots; dog CRUD/list works

✅ **Migration isolated:** Does not alter Order/Address tables

✅ **Customer isolation:** Dogs filtered by `ownerId` in all queries

✅ **Build passes:** `pnpm build` succeeds

✅ **Tests pass:** `pnpm test` succeeds (memory mode)

---

## Acceptance Evidence

**Verification Date:** 2025-12-15

### Smoke Test Results

✅ **All steps passed (1-6):**
1. Health check - ✅ Passed
2. Login and JWT token - ✅ Passed
3. Create dog - ✅ Passed
4. List dogs - ✅ Passed
5. Get dog by ID - ✅ Passed
6. Update dog - ✅ Passed

**Script:** `backend/scripts/phase8_2b_dog_persistence_smoke.sh`

### Restart Persistence Verification

✅ **PostgreSQL persistence confirmed:**
- Backend restarted with `DATABASE_URL` and `DOG_REPO=prisma`
- Re-authenticated via `/api/v1/auth/login`
- `GET /api/v1/dogs` returned the previously created dog
- Confirms true PostgreSQL persistence (not in-memory)

**Verification Steps:**
1. Created dog via smoke test (Step 3)
2. Stopped backend server
3. Restarted with `DATABASE_URL="..." DOG_REPO=prisma pnpm start:dev`
4. Re-authenticated and queried `/api/v1/dogs`
5. Previously created dog persisted and was returned

### Example Dog ID

Dog created during smoke test verification (example):
- Dog ID format: `dog-{uuid}`
- Persisted across server restarts
- Customer isolation verified (filtered by `ownerId`)

---

## Notes

- **Allergies/Dislikes:** Not implemented in this phase (relations to IngredientTag deferred)
- **Breed relation:** `breedId` is stored as string; no foreign key constraint (breed data may be system/static)
- **Computed fields:** `cachedTargetFoodKcal` is stored but calculation logic is in domain layer
- **Defaults:** `mealsPerDay=2`, `treatInputMode=ESTIMATE_LEVEL`, `treatLevel=LOW` match domain defaults

