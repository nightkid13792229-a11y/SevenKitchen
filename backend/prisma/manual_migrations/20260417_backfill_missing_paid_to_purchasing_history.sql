\set ON_ERROR_STOP on

\if :{?apply}
\else
\set apply false
\endif

\if :{?commit}
\else
\set commit false
\endif

BEGIN;

CREATE TEMP TABLE missing_paid_to_purchasing_history_candidates
ON COMMIT DROP
AS
WITH purchase_order_candidates AS (
  SELECT
    order_record.id AS order_id,
    order_record.status AS current_order_status,
    purchase_list.id AS purchase_list_id,
    purchase_list.created_at AS purchase_list_created_at,
    purchase_list.created_by_id AS purchase_list_created_by_id,
    row_number() OVER (
      PARTITION BY order_record.id
      ORDER BY purchase_list.created_at ASC, purchase_list.id ASC
    ) AS rank_for_order
  FROM purchase_list
  JOIN LATERAL unnest(purchase_list.source_order_ids) AS source_order(order_id)
    ON true
  JOIN "order" order_record ON order_record.id = source_order.order_id
  WHERE purchase_list.kind = 'ORDER_DEMAND'
    AND order_record.status IN (
      'PURCHASING',
      'IN_PRODUCTION',
      'FREEZING',
      'SHIPPED',
      'COMPLETED',
      'CANCELLED',
      'AFTERSALE'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM order_status_history history
      WHERE history.order_id = order_record.id
        AND history.from_status = 'PAID'
        AND history.to_status = 'PURCHASING'
    )
)
SELECT
  order_id,
  current_order_status,
  purchase_list_id,
  purchase_list_created_at,
  purchase_list_created_by_id
FROM purchase_order_candidates
WHERE rank_for_order = 1;

SELECT
  'candidate_rows' AS check_name,
  count(*) AS check_value
FROM missing_paid_to_purchasing_history_candidates;

SELECT
  candidate.order_id,
  candidate.current_order_status,
  candidate.purchase_list_id,
  candidate.purchase_list_created_at,
  candidate.purchase_list_created_by_id
FROM missing_paid_to_purchasing_history_candidates candidate
ORDER BY candidate.purchase_list_created_at DESC, candidate.order_id
LIMIT 50;

\if :apply
WITH inserted AS (
  INSERT INTO order_status_history (
    id,
    order_id,
    from_status,
    to_status,
    timestamp,
    actor,
    actor_id,
    metadata
  )
  SELECT
    'backfill_paid_to_purchasing_' || md5(candidate.order_id) AS id,
    candidate.order_id,
    'PAID'::"OrderStatus" AS from_status,
    'PURCHASING'::"OrderStatus" AS to_status,
    candidate.purchase_list_created_at AS timestamp,
    'staff' AS actor,
    candidate.purchase_list_created_by_id AS actor_id,
    jsonb_build_object(
      'purchaseListId', candidate.purchase_list_id,
      'triggeredBy', 'manual_history_backfill',
      'inferredOriginalTrigger', 'purchase_list_generation',
      'backfillScript', '20260417_backfill_missing_paid_to_purchasing_history.sql',
      'backfilledAt', now(),
      'orderStatusAtBackfill', candidate.current_order_status
    ) AS metadata
  FROM missing_paid_to_purchasing_history_candidates candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM order_status_history history
    WHERE history.order_id = candidate.order_id
      AND history.from_status = 'PAID'
      AND history.to_status = 'PURCHASING'
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING order_id
)
SELECT
  'inserted_rows' AS check_name,
  count(*) AS check_value
FROM inserted;

\if :commit
COMMIT;
\echo 'Committed missing PAID -> PURCHASING history backfill.'
\else
ROLLBACK;
\echo 'Rolled back. Re-run with -v apply=true -v commit=true to persist.'
\endif

\else
ROLLBACK;
\echo 'Preview only. Re-run with -v apply=true to test insert with rollback, or -v apply=true -v commit=true to persist.'
\endif
