# Staff-Assisted Orders And Dog Recipe History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build staff/admin assisted offline ordering from customer dog profiles and show finished-food recipe history to both customers and staff.

**Architecture:** Add staff customer/dog search and assisted-order endpoints to the existing staff customer-service controller, add a customer dog history endpoint to the dogs controller, and reuse the existing order creation, confirmation, offline payment, and amount-adjustment services. Add focused miniapp staff pages for customer/dog search and assisted order setup, plus a reusable dog finished-food history section in the customer dog profile.

**Tech Stack:** NestJS, Prisma, Jest, UniApp/Vue 3, Vitest.

---

## File Structure

- Modify `backend/src/interfaces/controllers/staff-customer-service.controller.ts`: staff search, assisted offline order creation, staff dog finished-food history, and pre-shipment amount lock.
- Modify `backend/src/interfaces/controllers/dogs.controller.ts`: customer dog finished-food history endpoint.
- Modify `backend/src/application/order/order.service.ts`: shared finished-food history query and optional offline amount safety helper.
- Create `backend/tests/interfaces/controllers/staff-customer-service.controller.spec.ts`: staff API unit tests.
- Modify `backend/tests/controllers/dogs.controller.spec.ts`: customer dog history endpoint test.
- Modify `miniapp/src/api/orders.ts`: staff search, assisted order, staff history helpers.
- Modify `miniapp/src/api/dogs.ts`: customer finished-food history helper.
- Modify `miniapp/src/pages.json`: register staff customer/dog pages.
- Modify `miniapp/src/pages/staff-workbench/index.vue`: add `客户与狗狗` module.
- Create `miniapp/src/pages/staff-customer-service/customers.vue`: staff customer/dog search.
- Create `miniapp/src/pages/staff-customer-service/assisted-order.vue`: staff assisted finished-food order setup.
- Modify `miniapp/src/pages/dog-profile-overview/index.vue`: show customer finished-food history.
- Create or modify `miniapp/src/pages/staff-customer-service.regression.spec.ts`: miniapp regression checks.

## Task 1: Backend Staff Customer/Dog Operations

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-customer-service.controller.ts`
- Modify: `backend/src/application/order/order.service.ts`
- Test: `backend/tests/interfaces/controllers/staff-customer-service.controller.spec.ts`

- [ ] **Step 1: Write failing controller tests**

Add tests that instantiate `StaffCustomerServiceController` with mocked Prisma and `OrderService`:

```ts
it('searches customers by keyword and returns dogs grouped under each customer', async () => {
  prisma.user.findMany.mockResolvedValue([{ id: 'customer-1', nickname: '王女士', phone: '13800000000', dogs: [{ id: 'dog-1', name: 'Seven' }] }]);
  const result = await controller.searchCustomers({ keyword: 'Seven' } as any);
  expect(prisma.user.findMany).toHaveBeenCalled();
  expect(result.data[0].dogs[0].name).toBe('Seven');
});

it('creates an assisted offline order and marks it paid without customer payment', async () => {
  prisma.dog.findUnique.mockResolvedValue({ id: 'dog-1', ownerId: 'customer-1' });
  prisma.address.findUnique.mockResolvedValue({ id: 'address-1', userId: 'customer-1' });
  orderService.createOrderDraft.mockResolvedValue({ id: 'order-1', status: 'INIT', amountTotal: 128 });
  orderService.confirmOrder.mockResolvedValue({ id: 'order-1', status: 'PENDING_PAYMENT' });
  orderService.updateOrderAmount.mockResolvedValue({ id: 'order-1', amountTotal: 118 });
  orderService.processPayment.mockResolvedValue({ id: 'order-1', status: 'PAID', paymentMethod: 'OFFLINE' });
  const result = await controller.createAssistedOrder({ customerId: 'customer-1', dogId: 'dog-1', addressId: 'address-1', actualAmount: 118, items: [{ recipeId: 'recipe-1', quantityG: 1400, packageSpecG: 100, packageCount: 14 }] } as any, { userId: 'staff-1', role: 'STAFF' } as any);
  expect(orderService.processPayment).toHaveBeenCalledWith('order-1', 'OFFLINE', 'staff', 'staff-1', expect.stringContaining('OFFLINE_'));
  expect(result.data.status).toBe('PAID');
});

it('rejects amount edits after shipment', async () => {
  prisma.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'SHIPPED', paymentStatus: 'SUCCESS', paidAt: new Date(), amountTotal: 128, adminRemark: null });
  const result = await controller.updateUnpaidOrderAmount('order-1', { amount: 100, reason: '补录' }, { userId: 'staff-1', role: 'STAFF' } as any);
  expect(result.code).toBe(400);
  expect(orderService.updateOrderAmount).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/staff-customer-service.controller.spec.ts --runInBand
```

Expected: fail because new controller methods do not exist.

- [ ] **Step 3: Implement staff endpoints**

Add:

- `GET customers/search`
- `POST orders/assisted`
- `GET dogs/:dogId/finished-food-history`

The assisted order method must validate `dog.ownerId === customerId` and `address.userId === customerId`, call `createOrderDraft`, call `confirmOrder`, optionally call `updateOrderAmount`, then call `processPayment(order.id, 'OFFLINE', actor, user.userId, transactionId)`.

- [ ] **Step 4: Lock amount edits after shipment**

Update `updateUnpaidOrderAmount` so it allows offline paid orders before shipment, but rejects `SHIPPED`, `COMPLETED`, and `CANCELLED`.

- [ ] **Step 5: Run staff backend tests**

Run:

```bash
cd backend && npm test -- tests/interfaces/controllers/staff-customer-service.controller.spec.ts --runInBand
```

Expected: pass.

## Task 2: Backend Dog Finished-Food History

**Files:**
- Modify: `backend/src/application/order/order.service.ts`
- Modify: `backend/src/interfaces/controllers/dogs.controller.ts`
- Test: `backend/tests/controllers/dogs.controller.spec.ts`

- [ ] **Step 1: Write failing customer endpoint test**

Add a test that calls `controller.listFinishedFoodHistory('dog-1', { customerId: 'owner-1' })`, expects ownership validation through `dogRepository.findById`, and expects `orderService.listDogFinishedFoodHistory('dog-1', 'owner-1')`.

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
cd backend && npm test -- tests/controllers/dogs.controller.spec.ts --runInBand
```

Expected: fail because the endpoint and injected order service are missing.

- [ ] **Step 3: Implement shared history query**

Add `OrderService.listDogFinishedFoodHistory(dogId: string, customerId?: string)` using Prisma `orderItem.findMany` with:

- `where.dogId = dogId`
- `where.order.type = FRESH_FOOD`
- optional `where.order.customerId = customerId`
- `orderBy.order.createdAt = desc`

Return recipe name, cover image, order id, order status, created time, quantity, package summary, amount, and payment method.

- [ ] **Step 4: Expose customer dogs endpoint**

Add `GET /dogs/:id/finished-food-history` after verifying `dog.ownerId === user.customerId`.

- [ ] **Step 5: Run dog controller tests**

Run:

```bash
cd backend && npm test -- tests/controllers/dogs.controller.spec.ts --runInBand
```

Expected: pass.

## Task 3: Miniapp API Contracts And Routes

**Files:**
- Modify: `miniapp/src/api/orders.ts`
- Modify: `miniapp/src/api/dogs.ts`
- Modify: `miniapp/src/pages.json`
- Test: `miniapp/src/pages/staff-customer-service.regression.spec.ts`
- Test: `miniapp/src/api/dogs.spec.ts`

- [ ] **Step 1: Write failing miniapp regression tests**

Assert that `orders.ts` contains helpers for staff customer search, assisted order creation, and staff dog history; assert that `dogs.ts` contains `finishedFoodHistory`; assert that `pages.json` registers `pages/staff-customer-service/customers` and `pages/staff-customer-service/assisted-order`.

- [ ] **Step 2: Run miniapp tests and verify they fail**

Run:

```bash
cd miniapp && npm test -- src/pages/staff-customer-service.regression.spec.ts src/api/dogs.spec.ts
```

Expected: fail because helpers and routes are missing.

- [ ] **Step 3: Add API helpers and routes**

Add typed request helpers and page routes matching the backend endpoints.

- [ ] **Step 4: Run miniapp API/route tests**

Run:

```bash
cd miniapp && npm test -- src/pages/staff-customer-service.regression.spec.ts src/api/dogs.spec.ts
```

Expected: pass.

## Task 4: Staff Customer/Dog Search And Assisted Order Pages

**Files:**
- Modify: `miniapp/src/pages/staff-workbench/index.vue`
- Create: `miniapp/src/pages/staff-customer-service/customers.vue`
- Create: `miniapp/src/pages/staff-customer-service/assisted-order.vue`
- Test: `miniapp/src/pages/staff-customer-service.regression.spec.ts`

- [ ] **Step 1: Write failing page tests**

Assert that workbench contains `客户与狗狗`, `goToCustomerDogs`, and `/pages/staff-customer-service/customers`. Assert the customer search page contains `searchStaffCustomers`, `代客下单`, `成品食谱历史`, and `openAssistedOrder`. Assert assisted order page contains `createStaffAssistedOrder`, `线下收款`, `实际收款金额`, and redirects to `/pages/staff-orders/detail`.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd miniapp && npm test -- src/pages/staff-customer-service.regression.spec.ts
```

Expected: fail because pages and workbench entry are missing.

- [ ] **Step 3: Implement pages**

Implement a compact staff search page and a focused assisted order setup page. The assisted page can use simple inputs and recipe id search in this first version; it must preserve the staff flow and call the new assisted order endpoint.

- [ ] **Step 4: Run page tests**

Run:

```bash
cd miniapp && npm test -- src/pages/staff-customer-service.regression.spec.ts
```

Expected: pass.

## Task 5: Customer Dog Profile Finished-Food History

**Files:**
- Modify: `miniapp/src/pages/dog-profile-overview/index.vue`
- Test: `miniapp/src/pages/dog-profile-overview.regression.spec.ts`

- [ ] **Step 1: Write failing profile test**

Assert that dog profile overview imports `dogApi`, calls `finishedFoodHistory`, displays `成品食谱历史`, and excludes DIY wording.

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
cd miniapp && npm test -- src/pages/dog-profile-overview.regression.spec.ts
```

Expected: fail because the history block is missing.

- [ ] **Step 3: Add history block**

Load history after dog profile load, display an empty state when no finished-food orders exist, and link rows to `/pages/order-detail/index?orderId=...`.

- [ ] **Step 4: Run profile test**

Run:

```bash
cd miniapp && npm test -- src/pages/dog-profile-overview.regression.spec.ts
```

Expected: pass.

## Task 6: Build Verification

**Files:**
- All changed files

- [ ] **Step 1: Run focused backend tests**

```bash
cd backend && npm test -- tests/interfaces/controllers/staff-customer-service.controller.spec.ts tests/controllers/dogs.controller.spec.ts --runInBand
```

- [ ] **Step 2: Run focused miniapp tests**

```bash
cd miniapp && npm test -- src/pages/staff-customer-service.regression.spec.ts src/pages/dog-profile-overview.regression.spec.ts src/api/dogs.spec.ts
```

- [ ] **Step 3: Run required miniapp build verification**

```bash
cd miniapp && npm run build:mp-weixin
```

Expected: success. Tell the user to open `miniapp/dist/build/mp-weixin` in WeChat Developer Tools.
