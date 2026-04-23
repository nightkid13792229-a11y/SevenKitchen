-- Merge duplicate FOOD ingredients named "鸡蛋" into a single standard ingredient.
--
-- Keep:
--   59f0ca5c-5e6e-448b-baf0-8d7e82e92750  鸡蛋 / 盒马自营 / 盒马鲜生
--
-- Merge into it:
--   d9df8375-d90c-40ae-9c50-c7962435ddb0  鸡蛋 / 沃集鲜（沃尔玛自营） / 沃尔玛
--   f80f210d-79d3-4aaa-874c-e883a53522a0  鸡蛋 / 山姆自营 / 山姆会员店
--
-- The merged procurement SKUs remain as child SKUs under the retained ingredient.

BEGIN;

DO $$
DECLARE
  target_id CONSTANT text := '59f0ca5c-5e6e-448b-baf0-8d7e82e92750';
  source_ids CONSTANT text[] := ARRAY[
    'd9df8375-d90c-40ae-9c50-c7962435ddb0',
    'f80f210d-79d3-4aaa-874c-e883a53522a0'
  ];
  source_count integer;
BEGIN
  SELECT COUNT(*)
    INTO source_count
  FROM ingredient
  WHERE id = ANY(source_ids)
    AND name = '鸡蛋'
    AND type = 'FOOD';

  IF source_count = 0 THEN
    RAISE NOTICE 'Duplicate egg ingredients already merged.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ingredient
    WHERE id = target_id
      AND name = '鸡蛋'
      AND type = 'FOOD'
  ) THEN
    RAISE EXCEPTION 'Target egg ingredient % does not exist or is not FOOD 鸡蛋', target_id;
  END IF;

  UPDATE recipe_item
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE purchase_item
  SET ingredient_id = target_id
  WHERE ingredient_id = ANY(source_ids);

  UPDATE purchase_record
  SET ingredient_id = target_id
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
  SET ingredient_id = target_id
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

  INSERT INTO ingredient_tag_assignment (ingredient_id, tag_id)
  SELECT DISTINCT target_id, tag_id
  FROM ingredient_tag_assignment
  WHERE ingredient_id = ANY(source_ids)
  ON CONFLICT (ingredient_id, tag_id) DO NOTHING;

  DELETE FROM ingredient_tag_assignment
  WHERE ingredient_id = ANY(source_ids);

  DELETE FROM ingredient
  WHERE id = ANY(source_ids);
END $$;

COMMIT;
