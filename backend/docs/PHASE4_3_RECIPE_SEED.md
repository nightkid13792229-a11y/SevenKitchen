# Phase 4.3: Recipe Seed Implementation

## Summary

Seeded ONE canonical recipe to enable real end-to-end order flow and exit frontend demo mode.

## Changes Made

### 1. Recipe Seed (`src/app.module.ts`)

**Location:** `AppModule.onModuleInit()`

**Implementation:**
- Fixed UUID: `11111111-1111-1111-1111-111111111111`
- Idempotent: Checks if recipe exists before seeding
- Logging: `[Seed] Recipe exists, skipping seed` OR `[Seed] Seeded MVP recipe: Chicken Pumpkin Bowl`

**Recipe Properties:**
```typescript
{
  id: '11111111-1111-1111-1111-111111111111',
  version: 1,
  name: 'Chicken Pumpkin Bowl',
  status: 'PUBLIC',
  energyDensityKcalPerKg: 1200, // 120 kcal/100g = 1200 kcal/kg
  productionLossRate: 1.07
}
```

### 2. Recipe Detail Description (`src/interfaces/controllers/recipes.controller.ts`)

**Location:** `RecipesController.getRecipe()`

**Change:**
- Added description for canonical recipe: `"Balanced chicken and pumpkin recipe for MVP end-to-end testing"`
- Only added for canonical recipe ID (hardcoded in controller)

### 3. Deterministic DIY Sheet Steps (`src/application/recipe/diy-sheet.service.ts`)

**Location:** `DiySheetService.generateSteps()`

**Change:**
- Returns deterministic 4-step process for "Chicken Pumpkin Bowl":
  1. Prepare chicken breast (200g)
  2. Steam pumpkin until soft (150g)
  3. Mix chicken and pumpkin together
  4. Add supplements if needed

**Default Recommended Intake:**
- When no `dogId` provided: `350g` (for canonical recipe only)
- When `dogId` provided: Calculated based on dog's energy requirements

## Seed Logic Location

**File:** `src/app.module.ts`  
**Method:** `AppModule.onModuleInit()`  
**Trigger:** On server startup (NestJS lifecycle hook)

**Code:**
```typescript
async onModuleInit() {
  const CANONICAL_RECIPE_ID = '11111111-1111-1111-1111-111111111111';
  const existingRecipe = await this.recipeRepository.findById(CANONICAL_RECIPE_ID);
  if (existingRecipe) {
    console.log('[Seed] Recipe exists, skipping seed');
    return;
  }
  // ... seed recipe
}
```

## API Verification

### 1. GET /api/v1/recipes

**Expected Response:**
```json
{
  "code": 0,
  "message": "Success",
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "version": 1,
      "name": "Chicken Pumpkin Bowl",
      "status": "PUBLIC",
      "energyDensityKcalPerKg": 1200
    }
  ]
}
```

**Curl Command:**
```bash
curl -X GET http://localhost:3000/api/v1/recipes
```

### 2. GET /api/v1/recipes/:id

**Expected Response:**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "version": 1,
    "name": "Chicken Pumpkin Bowl",
    "status": "PUBLIC",
    "energyDensityKcalPerKg": 1200,
    "productionLossRate": 1.07,
    "nutritionStandard": "FEDIAF_2021",
    "targetHealthTags": [],
    "applicableLifeStages": [],
    "description": "Balanced chicken and pumpkin recipe for MVP end-to-end testing"
  }
}
```

**Curl Command:**
```bash
curl -X GET http://localhost:3000/api/v1/recipes/11111111-1111-1111-1111-111111111111
```

### 3. POST /api/v1/recipes/:id/diy-sheet

**Request (without dogId):**
```bash
curl -X POST http://localhost:3000/api/v1/recipes/11111111-1111-1111-1111-111111111111/diy-sheet \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "code": 0,
  "message": "Success",
  "data": {
    "recipeId": "11111111-1111-1111-1111-111111111111",
    "recipeName": "Chicken Pumpkin Bowl",
    "steps": [
      {
        "stepNumber": 1,
        "description": "Prepare chicken breast (200g)"
      },
      {
        "stepNumber": 2,
        "description": "Steam pumpkin until soft (150g)"
      },
      {
        "stepNumber": 3,
        "description": "Mix chicken and pumpkin together"
      },
      {
        "stepNumber": 4,
        "description": "Add supplements if needed"
      }
    ],
    "recommendedDailyIntakeG": 350
  }
}
```

**Request (with dogId):**
```bash
curl -X POST http://localhost:3000/api/v1/recipes/11111111-1111-1111-1111-111111111111/diy-sheet \
  -H "Content-Type: application/json" \
  -d '{"dogId": "your-dog-id-here"}'
```

**Expected Response:**
- Same structure as above
- `recommendedDailyIntakeG` calculated based on dog's energy requirements

### 4. POST /api/v1/orders (Order Creation)

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "dogId": "your-dog-id",
    "type": "FRESH_FOOD",
    "items": [{
      "recipeId": "11111111-1111-1111-1111-111111111111",
      "quantityG": 3500,
      "packageCount": 35,
      "packageSpecG": 100
    }],
    "addressId": "your-address-id"
  }'
```

**Expected Response:**
- Order created successfully
- Returns `orderId` and order status

## Frontend Demo Mode

**✅ Confirmation: Frontend demo mode will NO LONGER trigger**

**Reason:**
- `GET /api/v1/recipes` now returns non-empty array: `[{ id: "11111111-...", name: "Chicken Pumpkin Bowl", ... }]`
- Frontend checks: `if (recipes.length === 0)` → false (recipes.length === 1)
- Empty state with "Use Demo Recipe" button will NOT appear
- Normal recipe list flow will work

**Frontend Behavior:**
1. Recipe list page loads
2. Calls `GET /api/v1/recipes`
3. Receives array with one recipe
4. Displays recipe card: "Chicken Pumpkin Bowl"
5. User can tap recipe → navigate to detail
6. User can generate DIY sheet
7. User can create order with this recipe

## Safety & Idempotency

✅ **Idempotent Seeding:**
- Checks if recipe exists before inserting
- Safe to restart server multiple times
- No duplicate recipes

✅ **Fixed UUID:**
- Recipe ID is constant: `11111111-1111-1111-1111-111111111111`
- Not auto-generated each time
- Predictable for testing

✅ **No Breaking Changes:**
- Existing endpoints unchanged
- Response shapes unchanged
- Backward compatible

## Startup Logs

**First startup (recipe seeded):**
```
[Seed] Seeded MVP recipe: Chicken Pumpkin Bowl
Application is running on: http://localhost:3000
```

**Subsequent startups (recipe exists):**
```
[Seed] Recipe exists, skipping seed
Application is running on: http://localhost:3000
```

## Testing Checklist

- [x] Recipe seeded on startup
- [x] `GET /api/v1/recipes` returns non-empty array
- [x] `GET /api/v1/recipes/:id` returns recipe detail
- [x] `POST /api/v1/recipes/:id/diy-sheet` returns deterministic steps
- [x] `POST /api/v1/orders` accepts recipe ID and creates order
- [x] Idempotent (no duplicates on restart)
- [x] Frontend demo mode no longer triggers

## Next Steps

Once backend has real recipe data:
1. Remove seed logic from `app.module.ts`
2. Update DIY sheet service to use recipe-specific steps from database
3. Remove hardcoded description from controller

---

**Implementation Date:** 2024-12-14  
**Status:** ✅ Complete and Verified
