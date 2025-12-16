# Phase 4.3 Fixes: Recipe Seed DI & GET /api/v1/dogs

## Summary

Fixed two critical issues:
1. **Part A**: Recipe seed not visible in GET /api/v1/recipes (DI instance mismatch)
2. **Part B**: Implemented GET /api/v1/dogs endpoint (was returning 404)

## Root Cause Analysis

### Part A: Recipe Repository DI Issue

**Problem:**
- `AppModule.onModuleInit()` injected using `RECIPE_REPOSITORY` token
- `RecipesController` injected using `RECIPE_REPOSITORY_TOKEN` token
- Both were provided with `useClass: InMemoryRecipeRepository`
- **NestJS created separate instances for each token** → seed wrote to one instance, controller read from another

**Solution:**
- Changed `RECIPE_REPOSITORY_TOKEN` provider to use `useExisting: RECIPE_REPOSITORY`
- This creates an alias, ensuring both tokens resolve to the same singleton instance
- Seed and controller now share the same in-memory storage

### Part B: Missing GET /api/v1/dogs Endpoint

**Problem:**
- Frontend calls `GET /api/v1/dogs` but endpoint didn't exist
- Returned 404, forcing frontend to use cache-only fallback

**Solution:**
- Implemented `GET /api/v1/dogs` in `DogsController`
- Uses existing `findByOwnerId()` repository method
- Customer-scoped via `@CurrentUser()` and `AuthGuard`
- Returns unified `ApiResponseDto<DogProfileDto[]>`

## Files Changed

### Part A: Recipe Repository DI Fix

**File:** `src/app.module.ts`
- Changed `RECIPE_REPOSITORY_TOKEN` provider from `useClass` to `useExisting: RECIPE_REPOSITORY`
- Ensures singleton instance shared between seed and controller

### Part B: GET /api/v1/dogs Implementation

**File:** `src/interfaces/controllers/dogs.controller.ts`
- Added `GET /api/v1/dogs` endpoint
- Placed before `GET /api/v1/dogs/:id` to avoid route conflict
- Uses `@UseGuards(AuthGuard)` and `@CurrentUser()` for customer scoping
- Returns `ApiResponseDto<DogProfileDto[]>`

**No changes needed:**
- `DogRepository.findByOwnerId()` already existed
- `InMemoryDogRepository` already implemented it
- Service layer not needed (direct repository call is acceptable for list operation)

### Tests Added

**File:** `src/interfaces/controllers/recipes.controller.spec.ts`
- Added test: `should return seeded recipe after app initialization`
- Verifies seeded recipe ID `11111111-1111-1111-1111-111111111111` appears in list

**File:** `src/interfaces/controllers/dogs.controller.spec.ts`
- Added test: `should return empty array when customer has no dogs`
- Added test: `should return dogs created by current customer`
- Added test: `should return 401 when X-Customer-Id header is missing`
- Tests verify customer isolation (customer A cannot see customer B's dogs)

### Verification Script

**File:** `scripts/phase4_3_verify.sh`
- Comprehensive verification script
- Tests recipe seed visibility
- Tests GET /api/v1/dogs endpoint
- Tests customer isolation
- Creates dog and verifies it appears in list

## How to Verify

### Quick Verification

1. **Start backend:**
   ```bash
   cd backend && pnpm start:dev
   ```

2. **Check recipe seed:**
   ```bash
   curl http://127.0.0.1:3000/api/v1/recipes
   ```
   Expected: `{"code":0,"data":[{"id":"11111111-1111-1111-1111-111111111111",...}]}`

3. **Check dogs endpoint (requires auth):**
   ```bash
   # Login first
   TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"customerId":"mvp-user-001"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
   
   # List dogs
   curl http://127.0.0.1:3000/api/v1/dogs \
     -H "Authorization: Bearer $TOKEN" \
     -H "X-Customer-Id: mvp-user-001"
   ```
   Expected: `{"code":0,"data":[]}` (or array with dogs)

### Automated Verification

Run the verification script:
```bash
cd backend
bash scripts/phase4_3_verify.sh
```

### Run Tests

```bash
cd backend
pnpm test
```

All tests should pass, including:
- Recipe seed visibility test
- GET /api/v1/dogs tests (empty list, customer isolation, auth)

## API Behavior

### GET /api/v1/recipes

**Before fix:**
- Returned `{"code":0,"data":[]}` (empty array)
- Seed ran but recipe not visible

**After fix:**
- Returns `{"code":0,"data":[{"id":"11111111-...","name":"Chicken Pumpkin Bowl",...}]}`
- Seeded recipe visible immediately

### GET /api/v1/dogs

**Before fix:**
- Returned 404 Not Found

**After fix:**
- Returns `{"code":0,"data":[]}` (empty array when no dogs)
- Returns `{"code":0,"data":[{...}]}` (array of dogs for current customer)
- Requires `Authorization: Bearer <token>` and `X-Customer-Id` header
- Returns 401 if auth missing
- Customer isolation: only returns dogs for authenticated customer

## Customer Isolation Verification

The endpoint ensures:
- Customer A can only see their own dogs
- Customer B can only see their own dogs
- No cross-customer data leakage

Tested in:
- Unit tests (`dogs.controller.spec.ts`)
- Verification script (`phase4_3_verify.sh`)

## Acceptance Criteria

✅ **Part A:**
- [x] Recipe seed visible in GET /api/v1/recipes
- [x] Seeded recipe ID `11111111-1111-1111-1111-111111111111` appears in list
- [x] Tests pass
- [x] Verification script confirms fix

✅ **Part B:**
- [x] GET /api/v1/dogs returns code=0 (no 404)
- [x] Returns empty array when customer has no dogs
- [x] Returns dogs for current customer
- [x] Customer isolation verified (no cross-customer leakage)
- [x] Requires authentication (401 if missing)
- [x] Tests pass
- [x] Verification script confirms fix

## Technical Notes

### DI Pattern Used

**Before:**
```typescript
{
  provide: RECIPE_REPOSITORY_TOKEN,
  useClass: InMemoryRecipeRepository, // Creates new instance
}
```

**After:**
```typescript
{
  provide: RECIPE_REPOSITORY_TOKEN,
  useExisting: RECIPE_REPOSITORY, // Aliases to existing instance
}
```

This ensures both tokens resolve to the same singleton, maintaining shared state.

### Route Ordering

`GET /api/v1/dogs` must be defined **before** `GET /api/v1/dogs/:id` to avoid route conflict. NestJS matches routes in order, so `/dogs/:id` would match `/dogs` if defined first.

---

**Implementation Date:** 2024-12-14  
**Status:** ✅ Complete and Verified
