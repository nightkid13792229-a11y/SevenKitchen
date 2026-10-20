# 多份食谱履约 Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-20-multi-recipe-order-design.md`

**Goal:** 让一张多份订单能完成 N 份设计、一次交付全部、顾客看到 N 份并分别生成 DIY 制作单，售后可指定份调整。

**Status:** Phase 2. Feature flag stays off until all tasks pass.

## Tasks

1. **Backend batch delivery endpoint**
   - `POST /api/v1/custom-recipe/admin/orders/:orderId/deliver-batch` with `recipeIds`.
   - Reuse `CustomRecipeDeliveryService.deliverBatch`.
   - One delivery notification; no per-item notification.
   - Tests: 2/5 recipes, wrong count, unauthorized, notification once.

2. **Admin-web batch delivery**
   - Admin order detail lists all candidate recipes for the order.
   - Select all N and deliver once; show quantity/progress.
   - Block if selection count != order.recipeQuantity.
   - Build/tests.

3. **Customer delivery API**
   - Order detail returns a `deliveries`/batch summary with N items (names, item codes, deliveredAt).
   - Delivery content endpoint returns N snapshots for a batch, with legacy fallback for old single deliveries.
   - Auth/ownership; no credit fields.

4. **Mini-program order detail**
   - Show N recipe cards with name, delivered time, DIY entry.
   - Confirm receipt once for the whole batch.
   - Legacy single-delivery orders keep current card.
   - Build/tests.

5. **Designer multi-recipe progress**
   - Designer/order admin shows “共 N 份，已设计 X 份”.
   - Allow creating N private recipes under the same order; publish associates them.
   - Do not allow delivery until all N recipes exist.

6. **Per-recipe aftersale**
   - Delivery item cards have “继续调整”.
   - Adjustment form can select one or more delivered recipes, with per-recipe text; one submission = one free adjustment.
   - Backend stores requested delivery item ids and re-delivers selected items only.

7. **Enablement**
   - Full backend/admin/miniapp tests/build.
   - Production migration + deploy in the correct order.
   - Verify config daily capacity >= 5, base delivery=1, feature switch can be enabled.
   - Upload experience version; only then enable switch.

## Global constraints

- Multi switch default off; no customer can create a multi order until task 7.
- No credit/deduction fields.
- Initial delivery is all N at once; later adjustment may re-deliver selected recipes.
- One order, one payment, one confirmation/aftersale ticket.
- Keep legacy single-delivery path working.
