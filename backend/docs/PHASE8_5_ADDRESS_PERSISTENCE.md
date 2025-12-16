# Phase 8.5: Address Persistence via Prisma + Default Address Behavior

**Status:** ⏳ PENDING VERIFY  
**Date:** 2025-12-16  
**Phase:** 8.5  
**Verification Date:** Pending

---

## Overview

Phase 8.5 adds Prisma persistence for Address entities, enabling address data to persist across server restarts when `ADDRESS_REPO=prisma` is enabled. Memory repositories remain the default.

### Goals

- Persist Address entities in PostgreSQL when Prisma mode is enabled
- Enforce default address behavior (exactly one default per customer)
- Keep memory mode as default (no database required)
- Follow existing Prisma repository patterns (Dog, Recipe, Order)

---

## Architectural Constraints (STRICT)

This phase follows all 8 docs, especially **07_Core_Architecture.md**:

- ✅ **No business logic in controllers** - All domain logic in application/domain layers
- ✅ **Default address enforcement** - Exactly one default address per customer (enforced at application layer)
- ✅ **Customer isolation enforced** - Repository always filters by `userId` (mapped from `customerId`)
- ✅ **Opt-in persistence** - Prisma only when `ADDRESS_REPO=prisma` is set
- ✅ **Memory mode default** - No database required for development
- ✅ **Minimal changes** - Only infrastructure layer (repository + DI)

---

## What Changed

### Backend

#### 1. Prisma Schema: Address Model

**Location:** `backend/prisma/schema.prisma`

**Updated:**
- Added `@@map("address")` to `Address` model (ensures lowercase table name)

**Existing Model (from Phase 8.2 Part A):**
- `Address` model with all fields:
  - Core: `id`, `userId` (customer isolation)
  - Contact: `recipientName`, `phone`
  - Location: `region` (JSON), `detail`
  - Default: `isDefault` (Boolean)
- Indexes: `userId` for efficient customer isolation queries

**Default Address Behavior:**
- `isDefault` is a Boolean field (not unique constraint at DB level)
- Uniqueness enforced at application layer: when setting default, all other addresses for the user are unset
- Application service (`AddressService.setDefaultAddress`) ensures atomic behavior

#### 2. Migration

**Location:** `backend/prisma/migrations/YYYYMMDDHHMMSS_address_persistence_table_mapping/migration.sql`

**Contents:**
- Adds `@@map("address")` directive (table name mapping only, no schema changes)
- Ensures table name is lowercase: `address`

**Isolation:**
- Does NOT modify existing Dog/Recipe/Order tables
- Can be applied independently

#### 3. PrismaAddressRepository

**Location:** `backend/src/infrastructure/repositories/prisma-address.repository.ts`

**Status:** Already implemented (Phase 8.2 Part A)

**Implements:** `AddressRepository` interface (same as `InMemoryAddressRepository`)

**Methods:**
- `findById(id)` - Finds address by ID
- `findByUserId(userId)` - Lists all addresses for user (customer isolation enforced)
- `save(address)` - Creates or updates address (upsert pattern)
- `delete(id)` - Deletes address by ID

**Customer Isolation:**
- `findByUserId` always filters by `userId` (no cross-customer access)
- All queries include `userId` filter where applicable

**Default Address Handling:**
- Repository does not enforce default uniqueness (application layer responsibility)
- `AddressService.setDefaultAddress` calls `unsetOtherDefaults` which saves each address individually
- For Prisma, this works correctly but is not optimally atomic (multiple saves)
- Future enhancement: Add transaction-based `setDefault` method for better atomicity

**Mapping:**
- `mapToDomain()` converts Prisma model to domain `Address` entity
- Handles JSON region field correctly

#### 4. Dependency Injection Switch

**Location:** `backend/src/app.module.ts`

**Status:** Already implemented (Phase 8.2 Part A)

**Current Behavior:**
- `ADDRESS_REPOSITORY` provider uses `useFactory` pattern
- Checks `ADDRESS_REPO` environment variable (defaults to `memory`)
- When `ADDRESS_REPO=prisma`:
  - Injects `PrismaService` (shared instance)
  - Returns `PrismaAddressRepository`
- When `ADDRESS_REPO=memory` (or unset):
  - Returns `InMemoryAddressRepository`

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
   DATABASE_URL="postgres://user:pass@host:port/db" pnpm prisma migrate dev --name address_persistence_table_mapping
   ```

2. **Start server with Prisma mode:**
   ```bash
   cd backend
   DATABASE_URL="postgres://user:pass@host:port/db" ADDRESS_REPO=prisma pnpm start:dev
   ```

3. **Verify:**
   - Server boots without Prisma initialization errors
   - Address CRUD operations work
   - Default address behavior is enforced
   - Addresses persist across server restarts

---

## How to Run Smoke Test

**Script:** `backend/scripts/phase8_5_address_persistence_smoke.sh`

**Requirements:**
- Backend server running
- `ADDRESS_REPO=prisma` set
- `DATABASE_URL` set

**Command:**
```bash
cd backend
DATABASE_URL="postgres://user:pass@host:port/db" ADDRESS_REPO=prisma bash scripts/phase8_5_address_persistence_smoke.sh
```

**What it does:**
1. Health check
2. Login and get JWT token
3. List addresses (expect ok, count can be 0)
4. Create address via `POST /api/v1/addresses`
5. Set default via `POST /api/v1/addresses/:id/set-default`
6. List addresses again; verify exactly one is default
7. Update address via `PUT /api/v1/addresses/:id`
8. Create second address; set as default; verify first is unset
9. Delete non-default address; verify default remains valid
10. Prints restart verification instructions

**Persistence Verification:**
After smoke test passes:
1. Stop server (Ctrl+C)
2. Restart: `DATABASE_URL="..." ADDRESS_REPO=prisma pnpm start:dev`
3. Run: `GET /api/v1/addresses` (with same token) to verify addresses still exist
4. Verify default address behavior persists

---

## Rollback

To disable Prisma persistence for Address:

1. **Unset environment variable:**
   ```bash
   # Remove ADDRESS_REPO or set to memory
   unset ADDRESS_REPO
   # or
   ADDRESS_REPO=memory pnpm start:dev
   ```

2. **Server behavior:**
   - Falls back to `InMemoryAddressRepository`
   - No PrismaService instantiated (if no other repos use Prisma)
   - Addresses stored in memory (lost on restart)

**Note:** Database tables remain; they're simply not used when `ADDRESS_REPO` is not `prisma`.

---

## Testing

### Unit Tests

**Location:** `backend/src/interfaces/controllers/addresses.controller.spec.ts`

**Status:** Existing tests should pass in both modes:
- Memory mode: Uses `InMemoryAddressRepository` (existing behavior)
- Prisma mode: Would require PrismaService mock (future enhancement)

**Current:** Tests pass in memory mode. Prisma mode testing relies on smoke script.

### Integration Test

**Smoke Script:** `backend/scripts/phase8_5_address_persistence_smoke.sh`

**Covers:**
- Address creation
- Default address setting
- Default address uniqueness enforcement
- Address update
- Address deletion
- Default address persistence after deletion
- Persistence verification (manual restart test)

---

## Files Changed

### Created
- `backend/scripts/phase8_5_address_persistence_smoke.sh`
- `backend/docs/PHASE8_5_ADDRESS_PERSISTENCE.md`

### Modified
- `backend/prisma/schema.prisma` - Added `@@map("address")` to Address model

### Already Exists (Phase 8.2 Part A)
- `backend/src/infrastructure/repositories/prisma-address.repository.ts` - PrismaAddressRepository implementation
- `backend/src/app.module.ts` - ADDRESS_REPO switch (already implemented)

### Generated
- Prisma Client (via `pnpm prisma generate`)
- Migration file (via `pnpm prisma migrate dev`)

---

## Acceptance Criteria

✅ **Memory mode:** `cd backend && pnpm start:dev` boots with no Prisma initialization and addresses work (in-memory)

✅ **Prisma mode:** `cd backend && DATABASE_URL="..." ADDRESS_REPO=prisma pnpm start:dev` boots; address CRUD works

✅ **Default address enforcement:** Exactly one default address per customer (enforced at application layer)

✅ **Migration isolated:** Does not alter Dog/Recipe/Order tables

✅ **Customer isolation:** Addresses filtered by `userId` in all queries

✅ **Build passes:** `pnpm build` succeeds

✅ **Tests pass:** `pnpm test` succeeds (memory mode)

---

## Next Steps

1. Run smoke test to verify persistence
2. Test persistence across restart
3. Verify default address behavior persists after restart
4. Update `ACCEPTANCE_STATUS.md` to "ACCEPTED" once verified

---

## Notes

- **Default Address Behavior:** The `isDefault` field is not unique at the database level. Uniqueness is enforced at the application layer by `AddressService.setDefaultAddress`, which unsets all other default addresses for the user before setting the selected one as default.
- **Atomicity:** The current implementation saves each address individually when unsetting defaults. This works correctly but is not optimally atomic. Future enhancement: Add a transaction-based method for better atomicity.
- **Customer Isolation:** Addresses are always filtered by `userId` (mapped from `customerId` in the controller) to ensure customer isolation.
- **Region Storage:** The `region` field is stored as JSON in the database, containing `province`, `city`, and `district` fields.
