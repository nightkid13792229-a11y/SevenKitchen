---
⚠️ NON-AUTHORITATIVE ALIGNMENT REPORT

This document is a temporary analysis artifact used to identify
inconsistencies between existing design documents.

It is NOT a source of truth and MUST NOT be used to infer
domain models, schemas, enums, or algorithms.
---

# Phase 8.0 Doc Gap Report

## Scope
Source-of-truth hierarchy (from 06_Cursor_Collaboration_Guide.md):
- Level 0: `07_Core_Architecture.md`
- Level 1: `04_Domain_Model_and_Algorithms.md`
- Level 2: `05_API_Specs.md`

This report lists contradictions where 07 conflicts with lower-priority docs (04/05). Resolution must align 07 to what 04/05 already define—no new concepts added.

---

## Contradictions

### 1) Order Status Enum Inconsistency
- **Where (higher priority):** `07_Core_Architecture.md` → Section “2.4 订单与生产域 (Order & Production)” (Order)
  - Status enum: `{ PAID, IN_PRODUCTION, SHIPPED, COMPLETED }`
- **Where (lower priority but authoritative for alignment):** `04_Domain_Model_and_Algorithms.md` → Section “## 2.3 Order Domain” → “状态机（State Machine）”
  - Status enum: `INIT, PENDING_PAYMENT, PAID, SCHEDULING, IN_PRODUCTION, PACKAGED, SHIPPED, DELIVERED, CANCELED`
- **Conflict:** 07 lists only four states and omits INIT/PENDING_PAYMENT/etc. 04 defines a richer state machine used by the domain.
- **Minimal resolution options:**
  - Update 07 Order status enum to include the full set from 04 (no new states invented), or explicitly defer to 04 for the canonical OrderStatus list.

### 2) Order Amount Fields Inconsistency
- **Where (higher priority):** `07_Core_Architecture.md` → Section “2.4 订单与生产域 (Order & Production)” (Order)
  - Field: `total_amount: Decimal`
- **Where (lower priority but authoritative for alignment):** `04_Domain_Model_and_Algorithms.md` → Section “## 2.3 Order Domain”
  - Fields: `amount_product`, `amount_shipping`, `amount_total`
- **Conflict:** 07 exposes only `total_amount`, while 04 (and downstream phases) define split amounts (`amount_product`, `amount_shipping`, `amount_total`).
- **Minimal resolution options:**
  - Update 07 to list the three amount fields (`amount_product`, `amount_shipping`, `amount_total`) as defined in 04, optionally noting `total_amount` only as a legacy/derived alias if already referenced elsewhere.

---

## Summary
To eliminate contradictions without introducing new concepts, 07 should be adjusted to mirror the Order status enum and amount field set already defined in 04 (and reflected in APIs/tests). No new fields or logic are proposed—only aligning 07 to the existing lower-level definitions.


