-- Merge duplicate FOOD ingredients named "糙米" into a single standard ingredient.
--
-- Keep as the standard ingredient:
--   7dff8839-3134-48e4-b46f-f34792b7e13e  糙米
--
-- Merge into it:
--   cec7304f-ff4e-4606-840a-51a0769bf6fa  糙米 / 山姆自营 / MM有机三色糙米2.1kg/罐
--
-- The source procurement SKU remains as a child SKU under the retained ingredient.

BEGIN;

DO $$
DECLARE
  target_id CONSTANT text := '7dff8839-3134-48e4-b46f-f34792b7e13e';
  source_ids CONSTANT text[] := ARRAY[
    'cec7304f-ff4e-4606-840a-51a0769bf6fa'
  ];
  source_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ingredient
    WHERE id = target_id
      AND name = '糙米'
      AND type = 'FOOD'
  ) THEN
    RAISE EXCEPTION 'Target brown rice ingredient % does not exist or is not FOOD 糙米', target_id;
  END IF;

  SELECT COUNT(*)
    INTO source_count
  FROM ingredient
  WHERE id = ANY(source_ids)
    AND name = '糙米'
    AND type = 'FOOD';

  UPDATE ingredient
  SET
    brand = NULL,
    product_model = NULL,
    purchase_channel = NULL,
    purchase_unit = 'g',
    purchase_to_base_ratio = 1,
    current_price_per_purchase_unit = 0,
    effective_price_per_purchase_unit = 0,
    procurement_strategy = 'STOCK_REPLENISHMENT',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = target_id;

  IF source_count = 0 THEN
    RAISE NOTICE 'Duplicate brown rice ingredients already merged.';
    RETURN;
  END IF;

  UPDATE recipe_item
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE purchase_item
  SET ingredient_id = target_id,
      ingredient_name = '糙米'
  WHERE ingredient_id = ANY(source_ids);

  UPDATE purchase_record
  SET ingredient_id = target_id,
      ingredient_name = '糙米'
  WHERE ingredient_id = ANY(source_ids);

  UPDATE inventory_ledger_entry
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE inventory_adjustment
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE inventory_allocation_line
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE inventory_stocktake_line
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE ingredient_price_change
  SET ingredient_id = target_id,
      ingredient_name = '糙米'
  WHERE ingredient_id = ANY(source_ids);

  UPDATE procurement_sku
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE procurement_sku_price_history
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE recommended_product
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE nutrition_food_mapping
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE recipe_supplement_alternative
  SET alternative_ingredient_id = target_id
  WHERE alternative_ingredient_id = ANY(source_ids);

  INSERT INTO ingredient_tag_assignment (id, ingredient_id, tag_id)
  SELECT DISTINCT
    gen_random_uuid()::text,
    target_id,
    tag_id
  FROM ingredient_tag_assignment
  WHERE ingredient_id = ANY(source_ids)
  ON CONFLICT (ingredient_id, tag_id) DO NOTHING;

  DELETE FROM ingredient_tag_assignment
  WHERE ingredient_id = ANY(source_ids);

  DELETE FROM ingredient
  WHERE id = ANY(source_ids);
END $$;

COMMIT;
