# Phase 3 Entry Checklist

**Project:** SevenKitchen Backend (Dog Fresh Food SaaS & ERP)  
**Phase:** 3 - Frontend-Facing API Completion  
**Prepared:** _______________  
**Status:** Ready for Entry

---

## Purpose

This document identifies:
1. ✅ APIs already implemented (Phase 2.1 & 2.2)
2. ❌ APIs missing for Mini Program frontend
3. 📋 Proposed execution order for Phase 3

**Source of Truth:** `/docs/05_API_Specs.md` (Customer APIs section)

---

## Already Implemented APIs

### Dogs Endpoints ✅
- `POST /api/v1/dogs` - Create dog profile
- `PUT /api/v1/dogs/:id` - Update dog profile
- `GET /api/v1/dogs/:id` - Get dog detail
- `POST /api/v1/dogs/calc-preview` - Calculate energy requirement preview (dry-run)

**Implementation:** `backend/src/interfaces/controllers/dogs.controller.ts`  
**Status:** ✅ Complete (Phase 2.1)

### Recipes Endpoints ✅
- `GET /api/v1/recipes` - List public recipes
- `GET /api/v1/recipes/:id` - Get recipe detail

**Implementation:** `backend/src/interfaces/controllers/recipes.controller.ts`  
**Status:** ✅ Complete (Phase 2.1)

### Orders Endpoints ✅
- `POST /api/v1/orders` - Create order draft
- `POST /api/v1/orders/:id/confirm` - Confirm order (submit for payment)
- `POST /api/v1/orders/:id/pay` - Process payment (mock)
- `GET /api/v1/orders/:id` - Get order detail
- `GET /api/v1/orders/items/:itemId/snapshot` - Get order item recipe snapshot

**Implementation:** `backend/src/interfaces/controllers/orders.controller.ts`  
**Status:** ✅ Complete (Phase 2.2)

### Health Endpoint ✅
- `GET /api/v1/health` - Health check

**Implementation:** `backend/src/interfaces/controllers/health.controller.ts`  
**Status:** ✅ Complete

---

## Missing APIs (Required for Mini Program)

### Orders Endpoints - Partial ❌

#### Already Implemented:
- ✅ `POST /api/v1/orders` - Create order draft (Note: Spec says `/orders/draft`, but current implementation uses `/orders`)
- ✅ `POST /api/v1/orders/:id/confirm` - Confirm order (Note: Spec says `/orders/:id/submit`, but implementation uses `/confirm`)
- ✅ `POST /api/v1/orders/:id/pay` - Process payment
- ✅ `GET /api/v1/orders/:id` - Get order detail
- ✅ `GET /api/v1/orders/items/:itemId/snapshot` - Get order item snapshot

#### Missing:
- ❌ **List Orders**
  - **Endpoint:** `GET /api/v1/orders`
  - **Purpose:** Get user's order list (summary)
  - **Spec Reference:** `05_API_Specs.md` Section 2.4, "List Orders"
  - **Response:** Order summary list
  - **Priority:** High (users need to see their order history)

---

### Address Endpoints ❌

#### Missing: Address Management (All)
- **Endpoint:** `GET /api/v1/addresses` - List addresses
- **Endpoint:** `POST /api/v1/addresses` - Create address
- **Endpoint:** `PUT /api/v1/addresses/:id` - Update address
- **Endpoint:** `POST /api/v1/addresses/:id/set-default` - Set default address
- **Purpose:** Manage shipping addresses
- **Spec Reference:** `05_API_Specs.md` Section 2.5
- **Priority:** High (required for order creation)

---

### DIY Process Endpoints ❌

#### Missing: Generate DIY Process Sheet
- **Endpoint:** `POST /api/v1/recipes/:recipeId/diy-sheet`
- **Purpose:** Generate DIY making process sheet for a recipe
- **Request:** `dog_id` (optional, for personalized quantities)
- **Response:** Steps, recommended daily intake (if dog_id provided)
- **Spec Reference:** `05_API_Specs.md` Section 2.3
- **Priority:** Medium (nice-to-have for DIY users)

---

## Phase 3 Execution Order (Proposed)

### Phase 3.1: Address APIs
**Rationale:** Orders need `address_id`, so addresses must be available first.

**Deliverables:**
1. Address entity (domain layer)
2. Address repository interface + InMemory implementation
3. AddressService (application layer)
4. AddressController with CRUD endpoints
5. DTOs with validation
6. API tests

**Dependencies:**
- Domain: Address entity (check `07_Core_Architecture.md` for schema)
- Infrastructure: InMemoryAddressRepository (temporary)

**Estimated Complexity:** Medium

---

### Phase 3.2: Order List Endpoint
**Rationale:** Users need to view their order history.

**Deliverables:**
1. Add `GET /api/v1/orders` endpoint to OrdersController
2. Query by customerId (from auth context)
3. Return order summary list (not full details)
4. API tests

**Dependencies:**
- Address APIs (for order creation flow)
- Auth context (to get customerId)

**Estimated Complexity:** Low (reuses existing OrderService)

---

### Phase 3.3: DIY Process Sheet (Optional)
**Rationale:** Enhances user experience for DIY users, but not critical for MVP.

**Deliverables:**
1. DIY process sheet generation logic (domain/service layer)
2. `POST /api/v1/recipes/:recipeId/diy-sheet` endpoint
3. Response DTO with steps and quantities
4. API tests

**Dependencies:**
- Recipe data (already available)
- DogCalcService (for personalized quantities if dog_id provided)

**Estimated Complexity:** Medium (requires recipe processing logic)

---

## Notes on Implementation

### Address Domain Model
- **Reference:** Check `07_Core_Architecture.md` for Address model definition
- **Fields:** TBD per `/docs` (receiver_name, phone, region, detail_address, is_default, etc.)
- **Relations:** User (customer_id)

### Auth Context (TBD)
- Current implementation uses hardcoded `temp-customer-id`
- Phase 3 should introduce auth middleware or context injection
- **Decision needed:** JWT? Session? OAuth? (TBD per project requirements)

### Order List Filtering
- Filter by status? (TBD per `/docs/05_API_Specs.md`)
- Pagination? (TBD per `/docs`)
- Sorting? (TBD per `/docs`)

---

## Priority Matrix

| Endpoint | Priority | Complexity | Phase 3 Sub-Phase |
|----------|----------|------------|-------------------|
| Address CRUD | 🔴 High | Medium | 3.1 |
| Order List | 🔴 High | Low | 3.2 |
| DIY Sheet | 🟡 Medium | Medium | 3.3 (optional) |

---

## Success Criteria for Phase 3

Phase 3 will be considered complete when:

- ✅ All address endpoints implemented and tested
- ✅ Order list endpoint implemented and tested
- ✅ All APIs follow the same response pattern (`code` field in body)
- ✅ All APIs have Swagger documentation
- ✅ All APIs have at least 3 API-level tests
- ✅ No business logic in controllers
- ✅ State machines and domain rules respected
- ✅ `pnpm build`, `pnpm lint`, `pnpm test` all pass

---

## Dependencies & Blockers

### Must Complete Before Phase 3
- ✅ Phase 2.2 acceptance (DONE)
- ❌ Auth mechanism decision (may block customerId injection)

### Can Proceed in Parallel
- Address domain model design (reference `/docs`)
- Order list response schema design (reference `/docs`)

### External Dependencies
- None identified (Phase 3 uses InMemory repositories, no DB)

---

## Questions for Clarification

1. **Auth Strategy:** What authentication mechanism will be used? (TBD per project requirements)
2. **Address Schema:** Confirm all Address fields from `07_Core_Architecture.md` are needed
3. **Order List Pagination:** Should order list support pagination? (TBD per `/docs`)
4. **DIY Sheet Priority:** Is DIY process sheet required for MVP or can it be Phase 4?

---

## Sign-off

**Prepared by:** _______________  
**Date:** _______________

**Approved for Phase 3 Entry:** _______________  
**Date:** _______________



