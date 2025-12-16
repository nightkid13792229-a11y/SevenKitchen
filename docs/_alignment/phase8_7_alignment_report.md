---
⚠️ NON-AUTHORITATIVE ALIGNMENT REPORT

This document is a temporary analysis artifact used to identify
inconsistencies between existing design documents and current codebase.

It is NOT a source of truth and MUST NOT be used to infer
domain models, schemas, enums, or algorithms.
---

# Phase 8.7 Doc-Code Alignment Report

## Scope

This report documents the alignment status between the 8 core design documents and the current codebase implementation after Phase 8.6 (Comprehensive Persistence Verification).

**Document Priority Order (Highest → Lowest):**
1. `07_Core_Architecture.md` (Level 0 - Source of Truth)
2. `04_Domain_Model_and_Algorithms.md` (Level 1)
3. `05_API_Specs.md` (Level 2)
4. `03_Features_and_UI_Blueprints.md` (Level 3)
5. `02_Roles_and_Core_Flows.md` (Level 4)
6. `00_Tech_Stack_Standards.md` (Level 5)

**Resolution Rule:** When conflicts exist, higher-priority documents override lower-priority ones. Code must align with the highest-priority document that defines the rule.

---

## 1. Current Code Baseline

**Git Commit Hash:** `[TO BE FILLED]`

**Phase Status:**
- Phase 8.6: ✅ ACCEPTED (Comprehensive Persistence Verification)
- Prisma Persistence: ✅ Enabled for Dog, Recipe, Order, Address
- Cross-domain References: ✅ Verified (Order → Dog, Recipe, Address)
- Snapshot Immutability: ✅ Verified
- Restart Persistence: ✅ Verified

**Codebase Snapshot Date:** `[TO BE FILLED]`

---

## 2. Alignment Methodology

### 2.1 Alignment Process

1. **Document Priority Order:** Review documents in order: 07 → 04 → 05 → 03 → 02 → 00
2. **Code Inspection:** For each document, inspect relevant codebase areas:
   - Domain entities and value objects
   - Application services
   - API controllers and DTOs
   - Prisma schema and migrations
   - Repository implementations
3. **Comparison:** Compare documented rules/contracts with actual code implementation
4. **Classification:** Categorize findings as:
   - ✅ **Compliant:** Code matches document specification
   - ⚠️ **Deviation:** Code differs from document (requires assessment)
   - ❌ **Missing:** Document requirement not implemented in code
   - 📝 **Ambiguous:** Document is unclear or code interpretation differs

### 2.2 Evidence Collection

For each finding, collect:
- **Document Reference:** Section/line number in source document
- **Code Reference:** File path and line number(s) in codebase
- **Evidence Snippet:** Relevant code or document excerpt
- **Impact Assessment:** Risk level (High/Medium/Low)

---

## 3. Document-by-Document Alignment Results

### 3.1 07_Core_Architecture.md (Priority 0 - Source of Truth)

**Status:** ⚠️ **PARTIAL COMPLIANCE** - Core entities aligned, but missing DogCalcService implementation and Recipe marketing fields

#### Compliant Items

- **OrderStatus Enum** - Code matches document specification
  - **Evidence:** `backend/src/domain/order/enums.ts:6-17` defines all 10 states: INIT, PENDING_PAYMENT, PAID, WAITING_FOR_PRODUCTION, IN_PRODUCTION, READY_FOR_PACKAGING, READY_FOR_SHIPMENT, SHIPPED, COMPLETED, CANCELLED
  - **Document Reference:** `07_Core_Architecture.md §2.4 Order.status` (line 355)

- **Order Entity Fields** - Core fields match document
  - **Evidence:** `backend/src/domain/order/order.entity.ts:12-28` includes: id, customerId, status, type, targetProductionDate, amountProduct, amountShipping, amountTotal, items, pricingBreakdownSnapshot, dogId, addressId
  - **Document Reference:** `07_Core_Architecture.md §2.4 Order` (lines 352-363)

- **OrderItem Entity Fields** - All fields match document
  - **Evidence:** `backend/prisma/schema.prisma:112-125` includes: id, orderId, recipeSnapshot, quantityG, packageCount, packageSpecG, customRequirements
  - **Document Reference:** `07_Core_Architecture.md §2.4 OrderItem` (lines 368-375)

- **Dog Entity Core Fields** - Most fields match document
  - **Evidence:** `backend/src/domain/dog/dog.entity.ts:17-35` includes: id, ownerId, name, breedId, birthday, gender, isNeutered, currentWeightKg, bcsScore, activityLevel, lifeStageOverride, sizeClassOverride, mealsPerDay, treatInputMode, treatLevel, manualTreatKcal, medicalHistory, cachedTargetFoodKcal
  - **Document Reference:** `07_Core_Architecture.md §2.2 Dog` (lines 60-80)

- **Address Entity Fields** - All fields match document (with field name variation)
  - **Evidence:** `backend/src/domain/address/address.entity.ts:15-22` uses `recipientName` (document uses `recipient_name` in schema, but domain uses camelCase which is correct)
  - **Document Reference:** `07_Core_Architecture.md §2.1 Address` (lines 28-35)

- **Recipe Core Fields** - Basic fields match document
  - **Evidence:** `backend/prisma/schema.prisma:175-194` includes: id, recipeId, version, name, status, energyDensityKcalPerKg, productionLossRate, batchLaborHours
  - **Document Reference:** `07_Core_Architecture.md §2.3 Recipe` (lines 272-277)

- **RecipeItem Fields** - All fields match document
  - **Evidence:** `backend/prisma/schema.prisma:196-211` includes: id, recipeId, recipeVersion, ingredientId, preparationMethod, ratioPercent, isPrimarySource, nutrientTargetKey, nutrientTargetValue
  - **Document Reference:** `07_Core_Architecture.md §2.3 RecipeItem` (lines 330-348)

- **Order State Machine Transitions** - Code implements correct transitions
  - **Evidence:** `backend/src/domain/order/order.entity.ts:110-121` implements valid transitions matching 07 document
  - **Document Reference:** `07_Core_Architecture.md §2.4 Order.status` (line 355)

- **Snapshot Immutability** - Code enforces immutability correctly
  - **Evidence:** `backend/src/infrastructure/repositories/prisma-order.repository.ts:99-114` does not update pricingBreakdownSnapshot or items on existing orders
  - **Document Reference:** `07_Core_Architecture.md §2.4 Order` (line 363, immutability rule)

- **Prisma Table Mapping** - All models use lowercase table names
  - **Evidence:** `backend/prisma/schema.prisma` uses `@@map("order")`, `@@map("order_item")`, `@@map("address")`, `@@map("dog")`, `@@map("recipe")`, `@@map("recipe_item")`
  - **Document Reference:** Consistent with Phase 8.2B/8.3/8.4/8.5 patterns

#### Deviations

- **OrderStatus State Names** - 04 document uses different state names than 07/implementation
  - **Document Requirement (04):** `04_Domain_Model_and_Algorithms.md §2.3` (line 197-206) defines: SCHEDULING, PACKAGED, DELIVERED
  - **Code Implementation:** `backend/src/domain/order/enums.ts:6-17` uses: WAITING_FOR_PRODUCTION, READY_FOR_PACKAGING, READY_FOR_SHIPMENT, COMPLETED (no DELIVERED)
  - **Evidence:** Code follows 07 document (line 355) which is higher priority
  - **Risk:** `Low` - 07 document is source of truth, 04 should be updated to match 07

- **API Path for Order Creation** - Path differs from 05 document
  - **Document Requirement (05):** `05_API_Specs.md §2.4` (line 205) specifies: `POST /orders/draft`
  - **Code Implementation:** `backend/src/interfaces/controllers/orders.controller.ts:62` uses: `POST /orders`
  - **Evidence:** Controller uses `@Post()` without `/draft` suffix
  - **Risk:** `Medium` - API contract mismatch, but functionality works

- **API Path for Order Submit** - Path differs from 05 document
  - **Document Requirement (05):** `05_API_Specs.md §2.4` (line 231) specifies: `POST /orders/{order_id}/submit`
  - **Code Implementation:** `backend/src/interfaces/controllers/orders.controller.ts:111` uses: `POST /orders/:id/confirm`
  - **Evidence:** Controller uses `/confirm` instead of `/submit`
  - **Risk:** `Medium` - API contract mismatch, but functionality works

#### Missing Implementations

- **Dog.allergies and Dog.dislikes Relations** - Not implemented in schema
  - **Document Requirement:** `07_Core_Architecture.md §2.2 Dog` (lines 77-78) specifies: `allergies: Relation -> IngredientTag[]`, `dislikes: Relation -> IngredientTag[]`
  - **Evidence:** `backend/prisma/schema.prisma:145-169` - Dog model has no allergies/dislikes fields
  - **Risk:** `Medium` - Feature not available, but not blocking current MVP

- **DogCalcService Algorithm Implementation** - Only placeholder exists
  - **Document Requirement:** `07_Core_Architecture.md §3.1` (lines 505-977) defines complete DER calculation algorithm with RER, LifeStageFactor, AdultModifiers, BCS_Adjustment, Treat deduction
  - **Code Implementation:** `backend/src/application/dog/dog.service.ts:160-179` - Methods `calculateTotalDer()` and `calculateTreatDeduction()` are placeholders returning hardcoded values
  - **Evidence:** Code has TODO comments: "TODO: Implement based on Doc 07 Section 3.1.5"
  - **Risk:** `High` - Core business logic not implemented, calculations are incorrect

- **Constants Tables (LIFE_STAGE_FACTORS, ACTIVITY_MULTIPLIERS, TREAT_LIMITS)** - Not implemented in code
  - **Document Requirement:** `07_Core_Architecture.md §3.3` (lines 926-976) defines constant tables that MUST be used instead of hardcoded values
  - **Code Implementation:** No constants module found - calculations would need to hardcode values (but calculations are not implemented anyway)
  - **Evidence:** Document explicitly states: "DO NOT hardcode numbers in functions. Use these constants definitions."
  - **Risk:** `High` - Violates architecture constraint, calculations cannot be implemented correctly without constants

- **Recipe Marketing Fields** - Missing visual assets and marketing fields
  - **Document Requirement:** `07_Core_Architecture.md §2.3 Recipe` (lines 279-327) specifies: cover_image_url, detail_images, video_url, description, design_source, target_health_tags, applicable_life_stages, production_steps, nutrition_detailed_data, sales_count, diy_gen_count, like_count, favorite_count
  - **Code Implementation:** `backend/prisma/schema.prisma:175-194` - Recipe model only has: id, recipeId, version, name, status, energyDensityKcalPerKg, productionLossRate, batchLaborHours
  - **Evidence:** Schema missing 11+ fields from document
  - **Risk:** `Medium` - Marketing and analytics features not available

- **Recipe.nutrition_standard Field** - Missing enum field
  - **Document Requirement:** `07_Core_Architecture.md §2.3 Recipe` (line 276) specifies: `nutrition_standard: Enum { NRC_2006, FEDIAF_2021, FEDIAF_2024, AAFCO_2022 }`
  - **Code Implementation:** `backend/prisma/schema.prisma:175-194` - Recipe model does not have nutrition_standard field
  - **Evidence:** Schema missing field
  - **Risk:** `Low` - Field may not be used in current MVP

- **IngredientTag Model** - Not implemented
  - **Document Requirement:** `07_Core_Architecture.md §2.3` (lines 150-154) defines IngredientTag model for ingredient classification
  - **Code Implementation:** No IngredientTag model in `backend/prisma/schema.prisma`
  - **Evidence:** Schema does not contain IngredientTag
  - **Risk:** `Low` - Feature not needed for current MVP, but required for allergies/dislikes

- **UserInteraction Model** - Not implemented
  - **Document Requirement:** `07_Core_Architecture.md §2.1` (lines 37-47) defines UserInteraction model for favorites, likes, DIY generation, shares
  - **Code Implementation:** No UserInteraction model in `backend/prisma/schema.prisma`
  - **Evidence:** Schema does not contain UserInteraction
  - **Risk:** `Low` - Feature not needed for current MVP

- **DogBreed Model** - Not implemented
  - **Document Requirement:** `07_Core_Architecture.md §2.2` (lines 50-58) defines DogBreed model with size_category, growth_curve_type, adult_age_months, senior_age_years, average_adult_weight_kg
  - **Code Implementation:** No DogBreed model in `backend/prisma/schema.prisma`
  - **Evidence:** Schema does not contain DogBreed
  - **Risk:** `Medium` - Required for accurate life stage and size class calculations per 07 document logic

- **GlobalConfig Model** - Not implemented
  - **Document Requirement:** `07_Core_Architecture.md §2.5` (lines 430-449) defines GlobalConfig singleton with labor_hourly_rate, min_order_weight_g, default_batch_capacity_g, target_margin, overhead_cost_per_kg, etc.
  - **Code Implementation:** `backend/src/application/config/global-config.service.ts` exists but uses hardcoded values, no Prisma model
  - **Evidence:** Service exists but no persistence layer
  - **Risk:** `Medium` - Configuration cannot be changed without code deployment

- **ProductionTask Model** - Not implemented
  - **Document Requirement:** `07_Core_Architecture.md §2.4` (lines 399-411) defines ProductionTask model for production workflow
  - **Code Implementation:** No ProductionTask model in `backend/prisma/schema.prisma`
  - **Evidence:** Schema does not contain ProductionTask
  - **Risk:** `Low` - Production domain not implemented yet (future phase)

- **DogEnergyCalcLog Model** - Not implemented
  - **Document Requirement:** `07_Core_Architecture.md §2.2` (lines 119-147) defines DogEnergyCalcLog for calculation audit trail
  - **Code Implementation:** No DogEnergyCalcLog model in `backend/prisma/schema.prisma`
  - **Evidence:** Schema does not contain DogEnergyCalcLog
  - **Risk:** `Low` - Audit logging not implemented, but not blocking MVP

#### Ambiguous Cases

- **Address Field Name** - Document uses `recipient_name` in schema, domain uses `recipientName`
  - **Document Text:** `07_Core_Architecture.md §2.1 Address` (line 31): `recipient_name: String`
  - **Code Interpretation:** `backend/src/domain/address/address.entity.ts:18` uses `recipientName` (camelCase), Prisma schema maps to `recipient_name` (snake_case)
  - **Evidence:** This is correct - domain uses camelCase, Prisma maps to snake_case via `@map("recipient_name")`
  - **Resolution:** ✅ Compliant - Field name mapping is correct

---

### 3.2 04_Domain_Model_and_Algorithms.md (Priority 1)

**Status:** ⚠️ **PARTIAL COMPLIANCE** - Domain entities aligned, but DogCalcService interface not implemented, state machine has naming differences

#### Compliant Items

- **Dog Domain Invariants** - Code enforces document rules
  - **Evidence:** `backend/src/domain/dog/dog.entity.ts:44-76` validates: bcsScore (1-9), currentWeightKg > 0, mealsPerDay > 0, treat logic (EXACT_KCAL requires manualTreatKcal)
  - **Document Reference:** `04_Domain_Model_and_Algorithms.md §2.1` (lines 95-101)

- **Order Domain Invariants** - Code enforces document rules
  - **Evidence:** `backend/src/domain/order/order.entity.ts:40-69` validates: items.length > 0, amountProduct >= 0, amountShipping >= 0, amountTotal >= 0, amountTotal = amountProduct + amountShipping
  - **Document Reference:** `04_Domain_Model_and_Algorithms.md §2.3` (implicit in Order aggregate definition)

- **Order State Machine Transitions** - Code enforces valid transitions
  - **Evidence:** `backend/src/domain/order/order.entity.ts:109-125` implements transition validation with InvalidStateTransitionError
  - **Document Reference:** `04_Domain_Model_and_Algorithms.md §2.3` (lines 208-218)

- **Snapshot Immutability** - Code enforces immutability
  - **Evidence:** `backend/src/domain/order/order.entity.ts:166-176` method `areSnapshotsImmutable()` returns true for PAID and beyond
  - **Document Reference:** `04_Domain_Model_and_Algorithms.md §2.2` (lines 172-174)

- **Address Domain Invariants** - Code enforces document rules
  - **Evidence:** `backend/src/domain/address/address.entity.ts:30-57` validates: recipientName not empty, phone not empty, region has province/city/district, detail not empty
  - **Document Reference:** `04_Domain_Model_and_Algorithms.md §2.6` (lines 287-289)

- **RecipeSnapshot Structure** - Code matches document definition
  - **Evidence:** `backend/src/domain/recipe/types.ts:11-18` defines RecipeSnapshot with: id, version, name, production_loss_rate, nutrition_standard, items
  - **Document Reference:** `04_Domain_Model_and_Algorithms.md §2.2` (lines 160-170)

#### Deviations

- **OrderStatus State Names** - 04 document uses different names than implementation
  - **Document Requirement (04):** `04_Domain_Model_and_Algorithms.md §2.3` (lines 197-206) defines: SCHEDULING, PACKAGED, DELIVERED
  - **Code Implementation:** `backend/src/domain/order/enums.ts:6-17` uses: WAITING_FOR_PRODUCTION, READY_FOR_PACKAGING, READY_FOR_SHIPMENT, COMPLETED
  - **Evidence:** Code follows 07 document (higher priority) which defines different state names
  - **Risk:** `Low` - 07 document is source of truth, 04 should be updated to match 07

- **Order State Machine Transitions** - 04 document defines different transitions
  - **Document Requirement (04):** `04_Domain_Model_and_Algorithms.md §2.3` (lines 208-216) defines: PAID → SCHEDULING → IN_PRODUCTION → PACKAGED → SHIPPED → DELIVERED
  - **Code Implementation:** `backend/src/domain/order/order.entity.ts:110-121` implements: PAID → WAITING_FOR_PRODUCTION → IN_PRODUCTION → READY_FOR_PACKAGING → READY_FOR_SHIPMENT → SHIPPED → COMPLETED
  - **Evidence:** Code follows 07 document state machine (higher priority)
  - **Risk:** `Low` - 07 document is source of truth, 04 should be updated

#### Missing Implementations

- **DogCalcService Interface** - Service interface defined but not implemented
  - **Document Requirement:** `04_Domain_Model_and_Algorithms.md §3.1` (lines 309-376) defines DogCalcService with input (DogCalcInput) and output (DogCalcResult: rer, der, treat_cap_kcal, daily_intake_g)
  - **Code Implementation:** `backend/src/application/dog/dog.service.ts:134-153` has `calcPreview()` method but it calls placeholder methods `calculateTotalDer()` and `calculateTreatDeduction()` that return hardcoded values
  - **Evidence:** Code has TODO: "TODO: Implement calculation logic based on Doc 07 Section 3.1"
  - **Risk:** `High` - Core domain service not implemented, calculations are incorrect

- **DogCalcService Algorithm Steps** - Algorithm not implemented
  - **Document Requirement:** `04_Domain_Model_and_Algorithms.md §3.1` (lines 325-376) defines: Step 1 (RER), Step 2 (DER with factors from 07), Step 3 (treat_cap_kcal), Step 4 (daily_intake_g)
  - **Code Implementation:** `backend/src/application/dog/dog.service.ts:160-179` - Methods return placeholders (500 for DER, 50 for treat deduction)
  - **Evidence:** TODO comments reference Doc 07 Section 3.1.5
  - **Risk:** `High` - Algorithm is core business logic, must be implemented correctly

- **RecipeNutritionService** - Service not implemented
  - **Document Requirement:** `04_Domain_Model_and_Algorithms.md §3.2` (lines 379-394) defines RecipeNutritionService for calculating nutrition_detailed_data
  - **Code Implementation:** No RecipeNutritionService found in codebase
  - **Evidence:** Service does not exist
  - **Risk:** `Medium` - Recipe nutrition calculations not automated

- **Recipe Domain Invariants** - Some invariants not enforced
  - **Document Requirement:** `04_Domain_Model_and_Algorithms.md §2.2` (lines 154-157) specifies: ratio_percent sum = 100, no duplicate ingredient_id, nutrition_detailed_data must be calculated by RecipeNutritionService
  - **Code Implementation:** No Recipe entity class found - only interface in repository
  - **Evidence:** `backend/src/domain/recipe/recipe.repository.ts:16-26` defines Recipe as interface, not class with validation
  - **Risk:** `Medium` - Invariants not enforced at domain layer

#### Ambiguous Cases

- **Recipe Entity Structure** - Document defines Recipe as aggregate root, code uses interface
  - **Document Text:** `04_Domain_Model_and_Algorithms.md §2.2` (line 130): "Aggregate Root: Recipe"
  - **Code Interpretation:** `backend/src/domain/recipe/recipe.repository.ts:16-26` defines Recipe as TypeScript interface, not a class
  - **Evidence:** No Recipe entity class with validation methods found
  - **Resolution:** ⚠️ Deviation - Recipe should be a domain entity class, not just an interface

---

### 3.3 05_API_Specs.md (Priority 2)

**Status:** ⚠️ **PARTIAL COMPLIANCE** - Most endpoints implemented, but some paths differ and some endpoints missing

#### Compliant Items

- **Base URL and Versioning** - Code uses correct base path
  - **Evidence:** All controllers use `@Controller('api/v1/...')` pattern (e.g., `backend/src/interfaces/controllers/orders.controller.ts:53`)
  - **Document Reference:** `05_API_Specs.md §1.1` (lines 21-25)

- **Response Envelope Structure** - Code uses unified response format
  - **Evidence:** Controllers return `ApiResponseDto<T>` with `{ code, message, data }` structure
  - **Document Reference:** `05_API_Specs.md §1.3` (lines 50-61)

- **GET /dogs** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/dogs.controller.ts:148` - `@Get()` method
  - **Document Reference:** `05_API_Specs.md §2.1` (implicit - list dogs endpoint)

- **GET /dogs/{dog_id}** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/dogs.controller.ts:181` - `@Get(':id')` method
  - **Document Reference:** `05_API_Specs.md §2.1` (line 121)

- **POST /dogs/calc-preview** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/dogs.controller.ts:219` - `@Post('calc-preview')` method
  - **Document Reference:** `05_API_Specs.md §2.1` (line 132)

- **GET /recipes** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/recipes.controller.ts:52` - `@Get()` method
  - **Document Reference:** `05_API_Specs.md §2.2` (line 157)

- **GET /recipes/{recipe_id}** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/recipes.controller.ts:85` - `@Get(':id')` method
  - **Document Reference:** `05_API_Specs.md §2.2` (line 171)

- **POST /recipes/{recipe_id}/diy-sheet** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/recipes.controller.ts:123` - `@Post(':id/diy-sheet')` method
  - **Document Reference:** `05_API_Specs.md §2.3` (line 187)

- **GET /orders** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/orders.controller.ts:169` - `@Get()` method
  - **Document Reference:** `05_API_Specs.md §2.4` (line 257)

- **GET /orders/{order_id}** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/orders.controller.ts:197` - `@Get(':id')` method
  - **Document Reference:** `05_API_Specs.md §2.4` (line 244)

- **GET /orders/items/{order_item_id}/snapshot** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/orders.controller.ts:308` - `@Get('items/:itemId/snapshot')` method
  - **Document Reference:** `05_API_Specs.md §2.4` (line 267)

- **GET /addresses** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/addresses.controller.ts:44` - `@Get()` method
  - **Document Reference:** `05_API_Specs.md §2.5` (line 289)

- **POST /addresses** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/addresses.controller.ts:74` - `@Post()` method
  - **Document Reference:** `05_API_Specs.md §2.5` (line 299)

- **PUT /addresses/{address_id}** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/addresses.controller.ts:114` - `@Put(':id')` method
  - **Document Reference:** `05_API_Specs.md §2.5` (line 317)

- **POST /addresses/{address_id}/set-default** - Endpoint implemented
  - **Evidence:** `backend/src/interfaces/controllers/addresses.controller.ts:161` - `@Post(':id/set-default')` method
  - **Document Reference:** `05_API_Specs.md §2.5` (line 329, implied)

#### Deviations

- **POST /orders vs POST /orders/draft** - Path differs from document
  - **Document Requirement:** `05_API_Specs.md §2.4` (line 205) specifies: `POST /orders/draft`
  - **Code Implementation:** `backend/src/interfaces/controllers/orders.controller.ts:62` uses: `POST /orders`
  - **Evidence:** Controller uses `@Post()` without `/draft` suffix
  - **Risk:** `Medium` - API contract mismatch, but functionality works correctly

- **POST /orders/{order_id}/confirm vs POST /orders/{order_id}/submit** - Path differs from document
  - **Document Requirement:** `05_API_Specs.md §2.4` (line 231) specifies: `POST /orders/{order_id}/submit`
  - **Code Implementation:** `backend/src/interfaces/controllers/orders.controller.ts:111` uses: `POST /orders/:id/confirm`
  - **Evidence:** Controller uses `/confirm` instead of `/submit`
  - **Risk:** `Medium` - API contract mismatch, but functionality works correctly (both transition INIT → PENDING_PAYMENT)

#### Missing Implementations

- **PUT /dogs/{dog_id}** - Endpoint exists but may not fully implement document requirements
  - **Document Requirement:** `05_API_Specs.md §2.1` (line 104) specifies: "必须触发 DogCalcService 重算" (must trigger DogCalcService recalculation)
  - **Code Implementation:** `backend/src/interfaces/controllers/dogs.controller.ts:111` - `@Put(':id')` exists
  - **Evidence:** `backend/src/application/dog/dog.service.ts:112-127` - `updateDogProfile()` has TODO: "TODO: Recalculate cachedTargetFoodKcal if relevant fields changed"
  - **Risk:** `High` - Update does not trigger recalculation as required by document

- **POST /dogs** - Endpoint exists but may not fully implement document requirements
  - **Document Requirement:** `05_API_Specs.md §2.1` (line 101) specifies: Response should include "DogCalcResult（首次计算结果）"
  - **Code Implementation:** `backend/src/interfaces/controllers/dogs.controller.ts:55` - `@Post()` exists
  - **Evidence:** `backend/src/application/dog/dog.service.ts:79-106` - `createDogProfile()` has TODO: "TODO: Calculate and set cachedTargetFoodKcal"
  - **Risk:** `High` - Creation does not calculate and return DogCalcResult as required

#### Ambiguous Cases

- **API Response Structure** - Document specifies response fields, code may differ slightly
  - **Document Text:** `05_API_Specs.md` specifies response structures for each endpoint
  - **Code Interpretation:** Controllers use DTOs which may have additional or different field names
  - **Evidence:** DTOs in `backend/src/interfaces/dto/` may not exactly match document specifications
  - **Resolution:** ⚠️ Needs detailed field-by-field comparison (beyond scope of this round)

---

### 3.4 03_Features_and_UI_Blueprints.md (Priority 3)

**Status:** `[TO BE FILLED]`

#### Compliant Items
- `[TO BE FILLED]`
  - **Evidence:** `[Code reference]`
  - **Document Reference:** `[Section/line]`

#### Deviations
- `[TO BE FILLED]`
  - **Document Requirement:** `[What doc says]`
  - **Code Implementation:** `[What code does]`
  - **Evidence:** `[Code reference]`
  - **Risk:** `[High/Medium/Low]`

#### Missing Implementations
- `[TO BE FILLED]`
  - **Document Requirement:** `[What doc says]`
  - **Evidence:** `[Document reference]`
  - **Risk:** `[High/Medium/Low]`

#### Ambiguous Cases
- `[TO BE FILLED]`
  - **Document Text:** `[Excerpt]`
  - **Code Interpretation:** `[How code implements it]`
  - **Evidence:** `[Code reference]`

---

### 3.5 02_Roles_and_Core_Flows.md (Priority 4)

**Status:** `[TO BE FILLED]`

#### Compliant Items
- `[TO BE FILLED]`
  - **Evidence:** `[Code reference]`
  - **Document Reference:** `[Section/line]`

#### Deviations
- `[TO BE FILLED]`
  - **Document Requirement:** `[What doc says]`
  - **Code Implementation:** `[What code does]`
  - **Evidence:** `[Code reference]`
  - **Risk:** `[High/Medium/Low]`

#### Missing Implementations
- `[TO BE FILLED]`
  - **Document Requirement:** `[What doc says]`
  - **Evidence:** `[Document reference]`
  - **Risk:** `[High/Medium/Low]`

#### Ambiguous Cases
- `[TO BE FILLED]`
  - **Document Text:** `[Excerpt]`
  - **Code Interpretation:** `[How code implements it]`
  - **Evidence:** `[Code reference]`

---

### 3.6 00_Tech_Stack_Standards.md (Priority 5)

**Status:** `[TO BE FILLED]`

#### Compliant Items
- `[TO BE FILLED]`
  - **Evidence:** `[Code reference]`
  - **Document Reference:** `[Section/line]`

#### Deviations
- `[TO BE FILLED]`
  - **Document Requirement:** `[What doc says]`
  - **Code Implementation:** `[What code does]`
  - **Evidence:** `[Code reference]`
  - **Risk:** `[High/Medium/Low]`

#### Missing Implementations
- `[TO BE FILLED]`
  - **Document Requirement:** `[What doc says]`
  - **Evidence:** `[Document reference]`
  - **Risk:** `[High/Medium/Low]`

#### Ambiguous Cases
- `[TO BE FILLED]`
  - **Document Text:** `[Excerpt]`
  - **Code Interpretation:** `[How code implements it]`
  - **Evidence:** `[Code reference]`

---

## 4. Gap List

### Gap Template

For each identified gap, document:

| Field | Description | Example |
|-------|-------------|---------|
| **Gap ID** | Unique identifier | `GAP-001` |
| **Document Clause** | Exact reference in source document | `07_Core_Architecture.md §2.4 Order.status` |
| **Code Current State** | What the code currently does | `Order.status enum has 9 states` |
| **Expected State** | What the document requires | `Order.status enum should have 10 states including CANCELLED` |
| **Risk Level** | Impact assessment | `High` - State machine transitions may fail |
| **Fix Recommendation** | Proposed resolution | `Add CANCELLED state to OrderStatus enum in domain/order/order-status.ts` |
| **Assigned Phase** | When to address | `Phase 8.8` or `Future` |
| **Evidence** | Code/document references | `backend/src/domain/order/order-status.ts:15` |

### Gap Entries

#### GAP-001: DogCalcService Algorithm Not Implemented
- **Document Clause:** `07_Core_Architecture.md §3.1` (lines 505-977) - Complete DER calculation algorithm
- **Code Current State:** `backend/src/application/dog/dog.service.ts:160-179` - Methods `calculateTotalDer()` and `calculateTreatDeduction()` are placeholders returning hardcoded values (500, 50)
- **Expected State:** Full implementation of RER calculation, LifeStageFactor lookup, AdultModifiers application, BCS_Adjustment, and Treat deduction with 10% cap
- **Risk Level:** `High` - Core business logic not implemented, all dog energy calculations are incorrect
- **Fix Recommendation:** Implement DogCalcService algorithm following 07 document Section 3.1, using constants from Section 3.3 (LIFE_STAGE_FACTORS, ACTIVITY_MULTIPLIERS, TREAT_LIMITS, BCS_PARAMS)
- **Assigned Phase:** `Phase 8.8` or `Phase 9.0`
- **Evidence:** `backend/src/application/dog/dog.service.ts:157-179` (TODO comments)

#### GAP-002: Constants Tables Not Implemented
- **Document Clause:** `07_Core_Architecture.md §3.3` (lines 926-976) - Constants tables: LIFE_STAGE_FACTORS, ACTIVITY_MULTIPLIERS, TREAT_LIMITS, BCS_PARAMS
- **Code Current State:** No constants module exists - calculations would need to hardcode values
- **Expected State:** Constants module exposing all tables from 07 document, used by DogCalcService instead of hardcoded values
- **Risk Level:** `High` - Violates architecture constraint "DO NOT hardcode numbers in functions"
- **Fix Recommendation:** Create `backend/src/domain/dog/constants.ts` or similar, export all constant tables from 07 document Section 3.3
- **Assigned Phase:** `Phase 8.8` (prerequisite for GAP-001)
- **Evidence:** `07_Core_Architecture.md §3.3` (line 922): "DO NOT hardcode numbers in functions. Use these constants definitions."

#### GAP-003: Recipe Marketing Fields Missing
- **Document Clause:** `07_Core_Architecture.md §2.3 Recipe` (lines 279-327) - Fields: cover_image_url, detail_images, video_url, description, design_source, target_health_tags, applicable_life_stages, production_steps, nutrition_detailed_data, sales_count, diy_gen_count, like_count, favorite_count
- **Code Current State:** `backend/prisma/schema.prisma:175-194` - Recipe model only has: id, recipeId, version, name, status, energyDensityKcalPerKg, productionLossRate, batchLaborHours (missing 11+ fields)
- **Expected State:** Recipe model includes all marketing, visual assets, and analytics fields from 07 document
- **Risk Level:** `Medium` - Marketing and analytics features not available
- **Fix Recommendation:** Add missing fields to Recipe Prisma model and create migration
- **Assigned Phase:** `Phase 9.0` or `Future`
- **Evidence:** `backend/prisma/schema.prisma:175-194` vs `07_Core_Architecture.md §2.3` (lines 279-327)

#### GAP-004: API Path Mismatch - Order Creation
- **Document Clause:** `05_API_Specs.md §2.4` (line 205) - `POST /orders/draft`
- **Code Current State:** `backend/src/interfaces/controllers/orders.controller.ts:62` - `POST /orders`
- **Expected State:** Endpoint should be `POST /orders/draft` to match API specification
- **Risk Level:** `Medium` - API contract mismatch, but functionality works
- **Fix Recommendation:** Change controller path from `@Post()` to `@Post('draft')` or update 05 document to match implementation
- **Assigned Phase:** `Phase 8.8` (if updating code) or document update
- **Evidence:** `backend/src/interfaces/controllers/orders.controller.ts:53,62`

#### GAP-005: API Path Mismatch - Order Submit
- **Document Clause:** `05_API_Specs.md §2.4` (line 231) - `POST /orders/{order_id}/submit`
- **Code Current State:** `backend/src/interfaces/controllers/orders.controller.ts:111` - `POST /orders/:id/confirm`
- **Expected State:** Endpoint should be `POST /orders/{order_id}/submit` to match API specification
- **Risk Level:** `Medium` - API contract mismatch, but functionality works (both transition INIT → PENDING_PAYMENT)
- **Fix Recommendation:** Change controller path from `@Post(':id/confirm')` to `@Post(':id/submit')` or update 05 document to match implementation
- **Assigned Phase:** `Phase 8.8` (if updating code) or document update
- **Evidence:** `backend/src/interfaces/controllers/orders.controller.ts:111`

#### GAP-006: Dog.allergies and Dog.dislikes Relations Missing
- **Document Clause:** `07_Core_Architecture.md §2.2 Dog` (lines 77-78) - `allergies: Relation -> IngredientTag[]`, `dislikes: Relation -> IngredientTag[]`
- **Code Current State:** `backend/prisma/schema.prisma:145-169` - Dog model has no allergies/dislikes fields
- **Expected State:** Dog model includes allergies and dislikes relations to IngredientTag
- **Risk Level:** `Medium` - Feature not available, but not blocking current MVP
- **Fix Recommendation:** Add IngredientTag model first, then add allergies/dislikes relations to Dog model
- **Assigned Phase:** `Phase 9.0` or `Future`
- **Evidence:** `backend/prisma/schema.prisma:145-169` vs `07_Core_Architecture.md §2.2` (lines 77-78)

#### GAP-007: DogBreed Model Missing
- **Document Clause:** `07_Core_Architecture.md §2.2` (lines 50-58) - DogBreed model with size_category, growth_curve_type, adult_age_months, senior_age_years, average_adult_weight_kg
- **Code Current State:** No DogBreed model in `backend/prisma/schema.prisma`
- **Expected State:** DogBreed model exists with all fields from 07 document
- **Risk Level:** `Medium` - Required for accurate life stage and size class calculations per 07 document logic (get_adult_threshold_months, check_is_senior functions)
- **Fix Recommendation:** Create DogBreed Prisma model and migration
- **Assigned Phase:** `Phase 9.0` or `Future`
- **Evidence:** `07_Core_Architecture.md §2.2` (lines 50-58) - Model not found in schema

#### GAP-008: GlobalConfig Persistence Missing
- **Document Clause:** `07_Core_Architecture.md §2.5` (lines 430-449) - GlobalConfig singleton model with labor_hourly_rate, min_order_weight_g, default_batch_capacity_g, target_margin, overhead_cost_per_kg, etc.
- **Code Current State:** `backend/src/application/config/global-config.service.ts` exists but uses hardcoded values, no Prisma model
- **Expected State:** GlobalConfig Prisma model exists, service reads from database
- **Risk Level:** `Medium` - Configuration cannot be changed without code deployment
- **Fix Recommendation:** Create GlobalConfig Prisma model and update GlobalConfigService to read from database
- **Assigned Phase:** `Phase 9.0` or `Future`
- **Evidence:** `backend/src/application/config/global-config.service.ts` - No Prisma model found

#### GAP-009: POST /dogs Does Not Return DogCalcResult
- **Document Clause:** `05_API_Specs.md §2.1` (line 101) - Response should include "DogCalcResult（首次计算结果）"
- **Code Current State:** `backend/src/interfaces/controllers/dogs.controller.ts:55` - `@Post()` exists but `backend/src/application/dog/dog.service.ts:79-106` has TODO: "TODO: Calculate and set cachedTargetFoodKcal"
- **Expected State:** POST /dogs calculates DogCalcResult and includes it in response
- **Risk Level:** `High` - API contract not fulfilled, response missing required field
- **Fix Recommendation:** Implement DogCalcService first (GAP-001), then call it in createDogProfile() and include result in response
- **Assigned Phase:** `Phase 8.8` (depends on GAP-001)
- **Evidence:** `backend/src/application/dog/dog.service.ts:100,103` (TODO comments)

#### GAP-010: PUT /dogs/{dog_id} Does Not Trigger Recalculation
- **Document Requirement:** `05_API_Specs.md §2.1` (line 111) - "必须触发 DogCalcService 重算" (must trigger DogCalcService recalculation)
- **Code Current State:** `backend/src/application/dog/dog.service.ts:112-127` - `updateDogProfile()` has TODO: "TODO: Recalculate cachedTargetFoodKcal if relevant fields changed"
- **Expected State:** PUT /dogs/{dog_id} triggers DogCalcService recalculation and returns updated DogCalcResult
- **Risk Level:** `High` - API contract not fulfilled, recalculation not performed
- **Fix Recommendation:** Implement DogCalcService first (GAP-001), then call it in updateDogProfile() when relevant fields change
- **Assigned Phase:** `Phase 8.8` (depends on GAP-001)
- **Evidence:** `backend/src/application/dog/dog.service.ts:124` (TODO comment)

---

## 5. Summary

### Overall Alignment Status

- **Total Documents Reviewed:** 3 (07, 04, 05) - Round 1 only
- **Compliant Items:** 20+ (core entities, state machines, invariants, most API endpoints)
- **Deviations Found:** 5 (API path mismatches, state name differences between 04 and 07)
- **Missing Implementations:** 10+ (DogCalcService, constants, Recipe marketing fields, DogBreed, etc.)
- **Ambiguous Cases:** 3 (field name mappings, Recipe entity structure, API response details)
- **Total Gaps:** 10 (GAP-001 through GAP-010)

### Priority Actions

1. **GAP-001 & GAP-002: DogCalcService Implementation** - `High` priority
   - Core business logic not implemented
   - Blocks GAP-009 and GAP-010
   - Required for MVP functionality

2. **GAP-004 & GAP-005: API Path Alignment** - `Medium` priority
   - API contract mismatches
   - Should align code with 05 document or update document

3. **GAP-003: Recipe Marketing Fields** - `Medium` priority
   - Missing 11+ fields from Recipe model
   - Blocks marketing and analytics features

### Next Steps

- [x] Step B Round 1: Fill alignment content for 07, 04, 05 documents
- [ ] Review this alignment report
- [ ] Prioritize gaps for resolution (High priority: GAP-001, GAP-002, GAP-009, GAP-010)
- [ ] Assign gaps to specific phases
- [ ] Begin implementation of high-priority gaps

---

## Notes

- This is a **skeleton report** - content will be filled in Step B after approval
- All findings must reference specific document sections and code locations
- Gaps should be prioritized based on risk and impact
- Resolution must follow document priority order (07 > 04 > 05 > 03 > 02 > 00)

---

**Report Generated:** 2025-12-16  
**Last Updated:** 2025-12-16  
**Status:** ✅ Step B Round 1 Complete (07, 04, 05 documents filled)
