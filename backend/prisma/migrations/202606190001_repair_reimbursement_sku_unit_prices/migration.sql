WITH sku_reimbursement_rows AS (
  SELECT
    h.id AS history_id,
    h.procurement_sku_id,
    h.ingredient_id,
    h.reimbursement_id,
    h.purchase_record_id,
    h.new_price::numeric AS bad_new_price,
    h.created_at,
    sku.current_purchase_price::numeric AS current_price,
    sku.purchase_to_base_ratio::numeric AS sku_ratio,
    pr.actual_cost::numeric AS actual_cost,
    pr.actual_base_quantity::numeric AS actual_base_quantity
  FROM procurement_sku_price_history h
  JOIN procurement_sku sku ON sku.id = h.procurement_sku_id
  JOIN purchase_record pr ON pr.id = h.purchase_record_id
  WHERE h.source = 'REIMBURSEMENT'
    AND h.purchase_record_id IS NOT NULL
    AND pr.actual_base_quantity IS NOT NULL
    AND pr.actual_base_quantity > 0
    AND sku.current_purchase_price IS NOT NULL
    AND sku.purchase_to_base_ratio IS NOT NULL
    AND sku.purchase_to_base_ratio > 0
),
bad_reimbursement_rows AS (
  SELECT
    *,
    ROUND((actual_cost / (actual_base_quantity / sku_ratio))::numeric, 2) AS corrected_price
  FROM sku_reimbursement_rows
  WHERE ROUND((actual_cost / (actual_base_quantity / sku_ratio))::numeric, 2) >= 1
    AND ROUND((actual_cost / (actual_base_quantity / sku_ratio))::numeric, 2) >= bad_new_price * 10
),
latest_bad_reimbursement_rows AS (
  SELECT DISTINCT ON (procurement_sku_id)
    *
  FROM bad_reimbursement_rows
  ORDER BY procurement_sku_id, created_at DESC, history_id DESC
),
repair_candidates AS (
  SELECT
    *,
    md5(
      procurement_sku_id ||
      ':repair-reimbursement-sku-unit-price:' ||
      history_id ||
      ':' ||
      corrected_price::text
    ) AS stable_hash
  FROM latest_bad_reimbursement_rows
  WHERE current_price = bad_new_price
    AND corrected_price >= current_price * 10
),
inserted_history AS (
  INSERT INTO procurement_sku_price_history (
    id,
    procurement_sku_id,
    ingredient_id,
    old_price,
    new_price,
    source,
    reimbursement_id,
    purchase_record_id,
    rollback_from_history_id,
    operator_id,
    note,
    created_at
  )
  SELECT
    substr(stable_hash, 1, 8) || '-' ||
      substr(stable_hash, 9, 4) || '-' ||
      substr(stable_hash, 13, 4) || '-' ||
      substr(stable_hash, 17, 4) || '-' ||
      substr(stable_hash, 21, 12),
    procurement_sku_id,
    ingredient_id,
    current_price,
    corrected_price,
    'ROLLBACK'::"ProcurementSkuPriceHistorySource",
    reimbursement_id,
    purchase_record_id,
    history_id,
    NULL,
    '修复报销审批回写 SKU 采购价时的单位换算错误',
    CURRENT_TIMESTAMP
  FROM repair_candidates candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM procurement_sku_price_history existing
    WHERE existing.rollback_from_history_id = candidate.history_id
      AND existing.source = 'ROLLBACK'
      AND existing.note = '修复报销审批回写 SKU 采购价时的单位换算错误'
  )
  RETURNING procurement_sku_id
)
UPDATE procurement_sku sku
SET
  current_purchase_price = candidate.corrected_price,
  updated_at = CURRENT_TIMESTAMP
FROM repair_candidates candidate
WHERE sku.id = candidate.procurement_sku_id
  AND sku.current_purchase_price = candidate.current_price;
