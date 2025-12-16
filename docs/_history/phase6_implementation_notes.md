NON-AUTHORITATIVE IMPLEMENTATION NOTES
This file summarizes what was implemented/verified during Phase 6.
It is NOT a source of truth. Do not use it to infer domain fields, enums, schemas, or algorithms.
Source of truth: docs/07_Core_Architecture.md (and docs/04, docs/05).

# Phase 6 Implementation Notes (Shipping & Pricing Preview)

- Endpoints implemented and verified:
  - `GET /api/v1/shipping/fee/preview`
  - `POST /api/v1/orders/pricing/preview`
- Persisted order amounts (as implemented in code/tests):
  - `amountProduct`, `amountShipping`, `amountTotal`; legacy `totalAmount` remains for backward compatibility.
- Verification script (passing): `backend/scripts/phase6_verify.sh`
- Seeds present in code: shipping template id `8fa85f64-5717-4562-b3fc-2c963f66afa6`

Note: This file is informational only and must not override or extend the authoritative docs.

