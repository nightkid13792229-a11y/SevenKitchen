DO $$
DECLARE
  missing_names text[];
  duplicate_names text[];
  wrong_type_names text[];
  mismatch_names text[];
  updated_count integer;
BEGIN
  WITH target(name, target_rate) AS (
    VALUES
      ('青口贝', 0.55::numeric),
      ('鸡蛋', 0.88::numeric),
      ('三文鱼', 0.92::numeric),
      ('青花鱼', 0.95::numeric),
      ('猪里脊', 0.95::numeric),
      ('牛肝', 0.95::numeric),
      ('猪肝', 0.95::numeric),
      ('鸡肝', 0.95::numeric),
      ('牛霖', 0.95::numeric),
      ('兔里脊', 0.97::numeric),
      ('猪心', 0.90::numeric),
      ('鸡心', 0.90::numeric),
      ('鸡腿肉', 0.95::numeric)
  )
  SELECT array_agg(t.name ORDER BY t.name)
  INTO missing_names
  FROM target t
  LEFT JOIN "ingredient" i ON i."name" = t.name
  WHERE i."id" IS NULL;

  IF COALESCE(array_length(missing_names, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Missing target ingredients: %', array_to_string(missing_names, ', ');
  END IF;

  WITH target(name, target_rate) AS (
    VALUES
      ('青口贝', 0.55::numeric),
      ('鸡蛋', 0.88::numeric),
      ('三文鱼', 0.92::numeric),
      ('青花鱼', 0.95::numeric),
      ('猪里脊', 0.95::numeric),
      ('牛肝', 0.95::numeric),
      ('猪肝', 0.95::numeric),
      ('鸡肝', 0.95::numeric),
      ('牛霖', 0.95::numeric),
      ('兔里脊', 0.97::numeric),
      ('猪心', 0.90::numeric),
      ('鸡心', 0.90::numeric),
      ('鸡腿肉', 0.95::numeric)
  )
  SELECT array_agg(name ORDER BY name)
  INTO duplicate_names
  FROM (
    SELECT t.name
    FROM target t
    JOIN "ingredient" i ON i."name" = t.name
    GROUP BY t.name
    HAVING COUNT(*) <> 1
  ) duplicated;

  IF COALESCE(array_length(duplicate_names, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Target ingredients must match exactly one row: %', array_to_string(duplicate_names, ', ');
  END IF;

  WITH target(name, target_rate) AS (
    VALUES
      ('青口贝', 0.55::numeric),
      ('鸡蛋', 0.88::numeric),
      ('三文鱼', 0.92::numeric),
      ('青花鱼', 0.95::numeric),
      ('猪里脊', 0.95::numeric),
      ('牛肝', 0.95::numeric),
      ('猪肝', 0.95::numeric),
      ('鸡肝', 0.95::numeric),
      ('牛霖', 0.95::numeric),
      ('兔里脊', 0.97::numeric),
      ('猪心', 0.90::numeric),
      ('鸡心', 0.90::numeric),
      ('鸡腿肉', 0.95::numeric)
  )
  SELECT array_agg(t.name ORDER BY t.name)
  INTO wrong_type_names
  FROM target t
  JOIN "ingredient" i ON i."name" = t.name
  WHERE i."type" <> 'FOOD'::"IngredientType";

  IF COALESCE(array_length(wrong_type_names, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Target ingredients must be FOOD type: %', array_to_string(wrong_type_names, ', ');
  END IF;

  WITH target(name, target_rate) AS (
    VALUES
      ('青口贝', 0.55::numeric),
      ('鸡蛋', 0.88::numeric),
      ('三文鱼', 0.92::numeric),
      ('青花鱼', 0.95::numeric),
      ('猪里脊', 0.95::numeric),
      ('牛肝', 0.95::numeric),
      ('猪肝', 0.95::numeric),
      ('鸡肝', 0.95::numeric),
      ('牛霖', 0.95::numeric),
      ('兔里脊', 0.97::numeric),
      ('猪心', 0.90::numeric),
      ('鸡心', 0.90::numeric),
      ('鸡腿肉', 0.95::numeric)
  )
  UPDATE "ingredient" i
  SET
    "properties" = jsonb_set(
      i."properties",
      '{edible_yield_rate}',
      to_jsonb(target.target_rate),
      true
    ),
    "updated_at" = CURRENT_TIMESTAMP
  FROM target
  WHERE i."name" = target.name
    AND i."type" = 'FOOD'::"IngredientType";

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> 13 THEN
    RAISE EXCEPTION 'Expected to update 13 ingredient rows, updated %', updated_count;
  END IF;

  WITH target(name, target_rate) AS (
    VALUES
      ('青口贝', 0.55::numeric),
      ('鸡蛋', 0.88::numeric),
      ('三文鱼', 0.92::numeric),
      ('青花鱼', 0.95::numeric),
      ('猪里脊', 0.95::numeric),
      ('牛肝', 0.95::numeric),
      ('猪肝', 0.95::numeric),
      ('鸡肝', 0.95::numeric),
      ('牛霖', 0.95::numeric),
      ('兔里脊', 0.97::numeric),
      ('猪心', 0.90::numeric),
      ('鸡心', 0.90::numeric),
      ('鸡腿肉', 0.95::numeric)
  )
  SELECT array_agg(t.name ORDER BY t.name)
  INTO mismatch_names
  FROM target t
  JOIN "ingredient" i ON i."name" = t.name
  WHERE (i."properties" ->> 'edible_yield_rate')::numeric <> t.target_rate;

  IF COALESCE(array_length(mismatch_names, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Ingredient edible_yield_rate verification failed: %', array_to_string(mismatch_names, ', ');
  END IF;
END $$;
