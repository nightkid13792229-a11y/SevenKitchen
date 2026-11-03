# Staff Order Address Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff create, edit, select, and bind reusable customer addresses from the miniapp workbench order detail page.

**Architecture:** Add staff/admin order-address endpoints that operate on the order customer's address book, then expose them from the miniapp staff order detail flow. Persist an immutable shipping address snapshot on each order when an address is bound so historical order display stays stable even if the address book entry changes later.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Jest, uni-app Vue 3, Vitest, WeChat mini program preview build.

---

## Scope Check

This plan implements one flow: staff-managed order address reuse. It touches backend order/address persistence and miniapp staff order pages. It does not implement shipping carrier integration, payment changes, or customer checkout changes.

## File Structure

- Create `backend/prisma/migrations/202604280001_add_order_shipping_address_snapshot/migration.sql`: add the order-level JSON snapshot column with snake_case SQL naming.
- Modify `backend/prisma/schema.prisma`: expose `Order.shippingAddressSnapshot`.
- Modify `backend/src/domain/order/order.entity.ts`: carry the snapshot in the domain order and update it whenever `updateAddress()` binds an address.
- Modify `backend/src/infrastructure/repositories/prisma-order.repository.ts`: serialize and hydrate `shippingAddressSnapshot`.
- Modify `backend/src/application/address/address.service.ts`: support updating `isDefault` on address edits, with default uniqueness.
- Modify `backend/src/application/order/order.service.ts`: add staff/admin methods to list customer addresses, create customer addresses, bind existing addresses, and edit customer addresses for an order.
- Modify `backend/src/interfaces/controllers/admin.controller.ts`: expose staff/admin endpoints under `/api/v1/admin/orders/:orderId/...`.
- Modify `backend/src/interfaces/dto/orders/order-response.dto.ts`: include address snapshot typing in order DTOs.
- Modify `miniapp/src/api/orders.ts`: add staff order address API helpers and shared address types.
- Modify `miniapp/src/pages/staff-orders/detail.vue`: show address entry actions, select existing customer addresses, create/edit address form modal, bind address, and respect read-only order states.
- Modify `miniapp/src/pages/staff-orders.regression.spec.ts`: add source-level regression checks for the staff address flow.

## Task 1: Backend Snapshot Persistence

**Files:**
- Create: `backend/prisma/migrations/202604280001_add_order_shipping_address_snapshot/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/domain/order/order.entity.ts`
- Modify: `backend/src/infrastructure/repositories/prisma-order.repository.ts`
- Test: `backend/tests/domain/order/order-address-snapshot.spec.ts`

- [ ] **Step 1: Write the failing domain test**

Create `backend/tests/domain/order/order-address-snapshot.spec.ts` with tests that create a minimal `Order`, call `updateAddress()`, and assert that `addressId`, `address`, and `shippingAddressSnapshot` all contain the bound address.

- [ ] **Step 2: Run the test to verify it fails**

Run `cd backend && npm test -- tests/domain/order/order-address-snapshot.spec.ts --runInBand`. Expected: FAIL because `shippingAddressSnapshot` is not on the domain entity yet.

- [ ] **Step 3: Add the migration and Prisma field**

Add SQL:

```sql
ALTER TABLE "order"
ADD COLUMN IF NOT EXISTS shipping_address_snapshot JSONB;
```

Add Prisma field:

```prisma
shippingAddressSnapshot Json? @map("shipping_address_snapshot")
```

- [ ] **Step 4: Implement the domain and repository snapshot support**

Add a `ShippingAddressSnapshot` type, constructor property, `fromPrismaData()` mapping, repository create/update serialization, and repository hydrate mapping. `updateAddress()` should set the snapshot to `{ id, recipientName, phone, region, detail }`.

- [ ] **Step 5: Run the test to verify it passes**

Run `cd backend && npm test -- tests/domain/order/order-address-snapshot.spec.ts --runInBand`. Expected: PASS.

## Task 2: Backend Staff Order Address Service And API

**Files:**
- Modify: `backend/src/application/address/address.service.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/interfaces/controllers/admin.controller.ts`
- Test: `backend/tests/application/order/order-staff-address.spec.ts`

- [ ] **Step 1: Write failing service tests**

Create tests for these behaviors:

- Staff creates a new address for the order customer and the order binds it.
- Staff binds an existing address owned by the order customer.
- Staff cannot bind an address owned by another customer.
- Staff cannot modify address on `SHIPPED`, `COMPLETED`, or `CANCELLED` orders.
- Setting `isDefault: true` clears the customer's previous default address.

- [ ] **Step 2: Run the tests to verify they fail**

Run `cd backend && npm test -- tests/application/order/order-staff-address.spec.ts --runInBand`. Expected: FAIL because the service methods do not exist yet.

- [ ] **Step 3: Implement address service default editing**

Extend `UpdateAddressDto` and `AddressService.updateAddress()` to accept `isDefault?: boolean`. When `isDefault` is `true`, unset other defaults for that address user before saving. When `false`, unset only the current address.

- [ ] **Step 4: Implement order service staff address methods**

Add:

```ts
listOrderCustomerAddresses(orderId: string): Promise<Address[]>
createOrderCustomerAddress(orderId: string, dto: StaffOrderAddressInput): Promise<OrderAddressResult>
bindOrderCustomerAddress(orderId: string, addressId: string): Promise<Order>
updateOrderCustomerAddress(orderId: string, addressId: string, dto: StaffOrderAddressInput): Promise<OrderAddressResult>
```

Each method loads the order, checks terminal status, enforces address ownership, and uses `order.updateAddress()` so the snapshot is saved.

- [ ] **Step 5: Add admin controller endpoints**

Expose:

```text
GET /admin/orders/:orderId/addresses
POST /admin/orders/:orderId/addresses
PUT /admin/orders/:orderId/address
PUT /admin/orders/:orderId/addresses/:addressId
```

Use `@UseGuards(AuthGuard, StaffGuard)` for these endpoints, return unified `ApiResponseDto`, and reuse existing address DTO shape.

- [ ] **Step 6: Run the service tests**

Run `cd backend && npm test -- tests/application/order/order-staff-address.spec.ts --runInBand`. Expected: PASS.

## Task 3: Miniapp Staff Order Detail Flow

**Files:**
- Modify: `miniapp/src/api/orders.ts`
- Modify: `miniapp/src/pages/staff-orders/detail.vue`
- Modify: `miniapp/src/pages/staff-orders.regression.spec.ts`

- [ ] **Step 1: Write failing miniapp regression tests**

Add source checks that `staff-orders/detail.vue` includes address entry buttons, terminal-status read-only handling, staff address API calls, and address selection/create/edit UI state.

- [ ] **Step 2: Run the tests to verify they fail**

Run `cd miniapp && npm test -- src/pages/staff-orders.regression.spec.ts`. Expected: FAIL because the staff address UI is not present yet.

- [ ] **Step 3: Add miniapp API helpers**

Add helpers for listing order customer addresses, creating an order customer address, binding an existing address, and editing an order customer address.

- [ ] **Step 4: Add staff order detail UI and logic**

Show a reusable address card in the staff order detail page. Provide “选择已有地址”, “录入新地址”, “更换地址”, and “编辑地址” actions when the order status is editable. Use a modal or sheet inside the page to keep the implementation scoped to the staff order detail flow.

- [ ] **Step 5: Run the miniapp regression test**

Run `cd miniapp && npm test -- src/pages/staff-orders.regression.spec.ts`. Expected: PASS.

## Task 4: Verification And Build

**Files:**
- No new files.

- [ ] **Step 1: Run backend targeted tests**

Run:

```bash
cd backend
npm test -- tests/domain/order/order-address-snapshot.spec.ts tests/application/order/order-staff-address.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run miniapp targeted tests**

Run:

```bash
cd miniapp
npm test -- src/pages/staff-orders.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run miniapp preview build**

Run:

```bash
cd miniapp
npm run preview
```

Expected: build succeeds and outputs to `miniapp/dist/dev/mp-weixin`.

- [ ] **Step 4: Review git diff**

Run `git status --short` and `git diff --stat`. Confirm only planned files changed.
