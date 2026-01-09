# Phase 4.3: UUID v4 Fix for Order Creation

## Root Cause

The seeded recipe ID `11111111-1111-1111-1111-111111111111` is **not a valid UUID v4**.

**UUID v4 Requirements:**
- Format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
- Position 13 (version): Must be `4`
- Position 17 (variant): Must be `8`, `9`, `a`, or `b`

**The Problem:**
- Backend uses `@IsUUID('4')` validation (strict UUID v4)
- Seeded ID had all `1`s → position 13 is `1`, not `4`
- Order creation failed with: `items.0.recipeId must be a UUID`

## Solution

**Replaced invalid UUID with valid UUID v4:**
- **Old:** `11111111-1111-1111-1111-111111111111` (invalid)
- **New:** `3fa85f64-5717-4562-b3fc-2c963f66afa6` (valid UUID v4)

**Verification:**
- Position 13: `4` ✓
- Position 17: `b` ✓
- Format: Valid UUID v4 ✓

## Files Changed

1. **`src/app.module.ts`**
   - Updated `CANONICAL_RECIPE_ID` to valid UUID v4
   - Updated seed log: `[Seed] Seeded MVP recipe: Chicken Pumpkin Bowl (id=3fa85f64-5717-4562-b3fc-2c963f66afa6)`

2. **`src/interfaces/controllers/recipes.controller.ts`**
   - Updated canonical recipe ID check for description

3. **`src/application/recipe/diy-sheet.service.ts`**
   - Updated canonical recipe ID check for default recommended intake

4. **`src/interfaces/controllers/recipes.controller.spec.ts`**
   - Updated test to use new UUID v4

5. **`scripts/phase4_3_verify.sh`**
   - Updated verification script to check for new UUID v4

## Verification

### Backend Startup Log

**First startup:**
```
[Seed] Seeded MVP recipe: Chicken Pumpkin Bowl (id=3fa85f64-5717-4562-b3fc-2c963f66afa6)
```

**Subsequent startups:**
```
[Seed] Recipe exists, skipping seed
```

### API Response

**GET /api/v1/recipes:**
```json
{
  "code": 0,
  "data": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "name": "Chicken Pumpkin Bowl",
      "energyDensityKcalPerKg": 1200
    }
  ]
}
```

### Order Creation

**POST /api/v1/orders** now succeeds with:
```json
{
  "dogId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "FRESH_FOOD",
  "items": [
    {
      "recipeId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "quantityG": 3500,
      "packageCount": 35,
      "packageSpecG": 100
    }
  ],
  "addressId": "660e8400-e29b-41d4-a716-446655440000"
}
```

**No more validation errors:**
- ✅ `recipeId` passes `@IsUUID('4')` validation
- ✅ Order creation succeeds
- ✅ Order confirmation succeeds
- ✅ Order payment (mock) succeeds

## Manual Regression Verification

**Steps:**
1. Restart backend
2. Clear WeChat Mini Program cache (or rebuild)
3. Rebuild miniapp: `cd miniapp && pnpm dev:mp-weixin`
4. In WeChat DevTools:
   - Create dog profile
   - Navigate: Recipe List → Recipe Detail → Order Config
   - Fill in daily grams, cycle days, select address
   - Tap "Create Order → Confirm → Pay (Test)"

**Expected Results:**
- ✅ POST /api/v1/orders succeeds (code=0)
- ✅ No `recipeId must be a UUID` errors
- ✅ Order appears in order list
- ✅ Order detail page opens correctly
- ✅ Snapshot page works

## Summary

- **Files Changed:** 5 files (seed, controller, service, test, script)
- **New Seeded Recipe ID:** `3fa85f64-5717-4562-b3fc-2c963f66afa6` (valid UUID v4)
- **Confirmation:** POST /orders now succeeds with valid UUID v4 recipeId

---

**Fix Date:** 2024-12-14  
**Status:** ✅ Complete - Order creation flow unblocked

