\set ON_ERROR_STOP on

SELECT
  order_record.id AS order_id,
  order_record.status,
  order_record.payment_status,
  order_record.target_production_date::date AS target_production_date,
  detail.value->>'ingredientId' AS ingredient_id,
  detail.value->>'name' AS ingredient_name,
  (detail.value->>'amount')::numeric AS snapshot_amount,
  detail.value->>'unit' AS snapshot_unit,
  nullif(detail.value->>'purchaseAmount', '')::numeric AS snapshot_purchase_amount,
  (detail.value->>'cost')::numeric AS snapshot_cost,
  (detail.value->>'unitCost')::numeric AS snapshot_unit_cost,
  ingredient.purchase_unit,
  ingredient.purchase_to_base_ratio,
  ingredient.current_price_per_purchase_unit,
  ingredient.effective_price_per_purchase_unit,
  round(
    (
      (detail.value->>'amount')::numeric *
      CASE WHEN detail.value->>'unit' = 'kg' THEN 1000 ELSE 1 END *
      ingredient.current_price_per_purchase_unit /
      nullif(ingredient.purchase_to_base_ratio, 0)
    )::numeric,
    2
  ) AS estimated_cost_from_catalog_amount
FROM "order" order_record
CROSS JOIN LATERAL jsonb_array_elements(
  order_record.pricing_breakdown_snapshot->'ingredientDetails'
) AS detail(value)
JOIN ingredient ingredient ON ingredient.id = detail.value->>'ingredientId'
WHERE order_record.pricing_breakdown_snapshot ? 'ingredientDetails'
  AND COALESCE((detail.value->>'cost')::numeric, 0) = 0
  AND COALESCE(ingredient.current_price_per_purchase_unit, 0) > 0
ORDER BY order_record.target_production_date DESC, order_record.id, ingredient.name;
