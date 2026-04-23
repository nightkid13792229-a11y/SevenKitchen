WITH source_rows AS (
  SELECT
    ps.id AS procurement_sku_id,
    ps.ingredient_id,
    ps.current_purchase_price,
    ps.created_at,
    md5(
      ps.id ||
      ':missing-initial-price:' ||
      COALESCE(ps.created_at::TEXT, '') ||
      ':' ||
      ps.current_purchase_price::TEXT
    ) AS stable_hash
  FROM procurement_sku ps
  WHERE ps.current_purchase_price IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM procurement_sku_price_history h
      WHERE h.procurement_sku_id = ps.id
    )
)
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
  NULL,
  current_purchase_price,
  'MANUAL'::"ProcurementSkuPriceHistorySource",
  NULL,
  NULL,
  NULL,
  NULL,
  '系统迁移：补录创建 SKU 时的初始生效采购价',
  COALESCE(created_at, CURRENT_TIMESTAMP)
FROM source_rows;
