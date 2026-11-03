---
⚠️ PATCH PROPOSAL — NOT APPLIED

This document proposes a minimal patch to docs/07_Core_Architecture.md
for human review only.

It has NO EFFECT unless explicitly approved and merged by the project owner.
It MUST NOT be treated as an active or authoritative design document.
---

# Phase 8.0 Minimal Patch Proposal for 07_Core_Architecture.md

Goal: Align 07 with definitions already present in 04/05. No new concepts are introduced.

## 1) Order Status Enum (Section “2.4 订单与生产域 (Order & Production)” → Order)
**Replace** the current status enum `{ PAID, IN_PRODUCTION, SHIPPED, COMPLETED }` with the full set already defined in `04_Domain_Model_and_Algorithms.md`:
- `INIT`
- `PENDING_PAYMENT`
- `PAID`
- `SCHEDULING`
- `IN_PRODUCTION`
- `PACKAGED`
- `SHIPPED`
- `DELIVERED`
- `CANCELED`

(If needed, add a short note that this is the canonical OrderStatus list per 04.)

## 2) Order Amount Fields (Section “2.4 订单与生产域 (Order & Production)” → Order)
**Replace** the single field `total_amount: Decimal` with the three fields already defined in `04_Domain_Model_and_Algorithms.md`:
- `amount_product: Decimal`
- `amount_shipping: Decimal`
- `amount_total: Decimal`

(Optional, if `total_amount` is referenced elsewhere in 07 as legacy: annotate it as a derived/legacy alias of `amount_total` without adding new logic.)

## Notes
- These edits mirror existing definitions from 04; no new fields, enums, or logic are added.
- Apply only in 07 to remove contradictions; lower-level docs remain unchanged.


