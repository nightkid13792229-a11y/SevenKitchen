\set ON_ERROR_STOP on

-- Repair fatty-acid unit mistakes found during the 2026-06-11 nutrition audit.
--
-- 1. NZFCD green-lipped mussel records T1024/T1026 stored linoleic acid,
--    alpha-linolenic acid, and arachidonic acid as 1000x too high values.
--    NZFCD reports these fields in g/100g; SevenKitchen stores these three
--    omega fatty acids as g per 100g.
--
-- 2. Some MEXT arachidonic-acid profiles used the source mg/100g value as the
--    canonical g value. This converts canonical arachidonicAcid from mg to g
--    everywhere the source form still marks canonicalUnit = mg.
--
-- The script is idempotent. Re-running it after repair should produce zero
-- update counts and zero audit anomalies.

BEGIN;

CREATE TEMP TABLE tmp_nzfcd_fatty_acid_patch (
  source_key text NOT NULL,
  nutrient_key text NOT NULL,
  corrected_value numeric NOT NULL,
  original_value numeric NOT NULL,
  source_nutrient_id text NOT NULL,
  source_nutrient_name text NOT NULL,
  PRIMARY KEY (source_key, nutrient_key)
) ON COMMIT DROP;

INSERT INTO tmp_nzfcd_fatty_acid_patch
  (source_key, nutrient_key, corrected_value, original_value, source_nutrient_id, source_nutrient_name)
VALUES
  ('NZFCD:T1024', 'linoleicAcid',       0.032, 0.032, 'F18D2N6', 'Fatty acid 18:2 omega-6'),
  ('NZFCD:T1024', 'alphaLinolenicAcid', 0.018, 0.018, 'F18D3N3', 'Fatty acid 18:3 omega-3'),
  ('NZFCD:T1024', 'arachidonicAcid',    0.016, 0.016, 'F20D4N6', 'Fatty acid 20:4 omega-6'),
  ('NZFCD:T1026', 'linoleicAcid',       0.048, 0.048, 'F18D2N6', 'Fatty acid 18:2 omega-6'),
  ('NZFCD:T1026', 'alphaLinolenicAcid', 0.027, 0.027, 'F18D3N3', 'Fatty acid 18:3 omega-3'),
  ('NZFCD:T1026', 'arachidonicAcid',    0.023, 0.023, 'F20D4N6', 'Fatty acid 20:4 omega-6');

CREATE OR REPLACE FUNCTION pg_temp.to_numeric_or_null(value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value ~ '^-?[0-9]+(\.[0-9]+)?$' THEN value::numeric
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION pg_temp.needs_nzfcd_fatty_acid_patch(
  profile jsonb,
  nutrient_key text,
  corrected_value numeric,
  original_value numeric
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  source_form_key text := 'fattyAcids.' || nutrient_key;
  current_value numeric;
  current_original_value numeric;
  current_canonical_value numeric;
BEGIN
  IF profile IS NULL THEN
    RETURN false;
  END IF;

  current_value := pg_temp.to_numeric_or_null(profile #>> ARRAY['fattyAcids', nutrient_key]);
  current_original_value := pg_temp.to_numeric_or_null(profile #>> ARRAY['meta', 'sourceForms', source_form_key, 'originalValue']);
  current_canonical_value := pg_temp.to_numeric_or_null(profile #>> ARRAY['meta', 'sourceForms', source_form_key, 'canonicalValue']);

  RETURN current_value IS NULL
    OR abs(current_value - corrected_value) > 0.000000001
    OR current_original_value IS NULL
    OR abs(current_original_value - original_value) > 0.000000001
    OR current_canonical_value IS NULL
    OR abs(current_canonical_value - corrected_value) > 0.000000001
    OR (profile #>> ARRAY['meta', 'sourceForms', source_form_key, 'originalUnit']) IS DISTINCT FROM 'g/100g'
    OR (profile #>> ARRAY['meta', 'sourceForms', source_form_key, 'canonicalUnit']) IS DISTINCT FROM 'g';
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.patch_nzfcd_fatty_acid(
  profile jsonb,
  nutrient_key text,
  corrected_value numeric,
  original_value numeric,
  source_nutrient_id text,
  source_nutrient_name text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  source_form_key text := 'fattyAcids.' || nutrient_key;
  base_profile jsonb;
  source_form jsonb;
BEGIN
  base_profile := CASE
    WHEN jsonb_typeof(profile) = 'object' THEN profile
    ELSE '{}'::jsonb
  END;

  source_form :=
    coalesce(base_profile #> ARRAY['meta', 'sourceForms', source_form_key], '{}'::jsonb)
    || jsonb_build_object(
      'basisType', 'PER_100_G',
      'originalUnit', 'g/100g',
      'canonicalUnit', 'g',
      'originalValue', original_value,
      'canonicalValue', corrected_value,
      'sourceNutrientId', source_nutrient_id,
      'sourceNutrientName', source_nutrient_name
    );

  RETURN jsonb_set(
    jsonb_set(base_profile, ARRAY['fattyAcids', nutrient_key], to_jsonb(corrected_value), true),
    ARRAY['meta', 'sourceForms', source_form_key],
    source_form,
    true
  );
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.profile_has_mext_arachidonic_mg(profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  canonical_value numeric;
BEGIN
  IF profile IS NULL THEN
    RETURN false;
  END IF;

  IF (profile #>> '{meta,sourceForms,fattyAcids.arachidonicAcid,canonicalUnit}') IS DISTINCT FROM 'mg' THEN
    RETURN false;
  END IF;

  canonical_value := pg_temp.to_numeric_or_null(profile #>> '{meta,sourceForms,fattyAcids.arachidonicAcid,canonicalValue}');
  RETURN canonical_value IS NOT NULL;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.patch_mext_arachidonic_mg_to_g(profile jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  source_form_key CONSTANT text := 'fattyAcids.arachidonicAcid';
  canonical_value_mg numeric;
  corrected_value_g numeric;
  source_form jsonb;
BEGIN
  IF NOT pg_temp.profile_has_mext_arachidonic_mg(profile) THEN
    RETURN profile;
  END IF;

  canonical_value_mg := pg_temp.to_numeric_or_null(profile #>> ARRAY['meta', 'sourceForms', source_form_key, 'canonicalValue']);
  corrected_value_g := canonical_value_mg / 1000;

  source_form :=
    coalesce(profile #> ARRAY['meta', 'sourceForms', source_form_key], '{}'::jsonb)
    || jsonb_build_object(
      'canonicalUnit', 'g',
      'canonicalValue', corrected_value_g
    );

  RETURN jsonb_set(
    jsonb_set(profile, '{fattyAcids,arachidonicAcid}', to_jsonb(corrected_value_g), true),
    ARRAY['meta', 'sourceForms', source_form_key],
    source_form,
    true
  );
END
$$;

\echo 'Repairing NZFCD green-lipped mussel fatty acid values...'

DO $$
DECLARE
  patch record;
  changed_rows integer;
BEGIN
  FOR patch IN
    SELECT *
    FROM tmp_nzfcd_fatty_acid_patch
    ORDER BY source_key, nutrient_key
  LOOP
    UPDATE nutrition_food nf
    SET nutrition_data = pg_temp.patch_nzfcd_fatty_acid(
          nf.nutrition_data,
          patch.nutrient_key,
          patch.corrected_value,
          patch.original_value,
          patch.source_nutrient_id,
          patch.source_nutrient_name
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE nf.data_source = 'NZFCD'
      AND (
        nf.external_id = patch.source_key
        OR nf.external_id = replace(patch.source_key, 'NZFCD:', '')
        OR nf.nutrition_data #>> '{meta,externalId}' = replace(patch.source_key, 'NZFCD:', '')
      )
      AND pg_temp.needs_nzfcd_fatty_acid_patch(
        nf.nutrition_data,
        patch.nutrient_key,
        patch.corrected_value,
        patch.original_value
      );
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    RAISE NOTICE 'nutrition_food % % updated rows: %', patch.source_key, patch.nutrient_key, changed_rows;

    UPDATE nutrition_source_record nsr
    SET normalized_nutrition = pg_temp.patch_nzfcd_fatty_acid(
          nsr.normalized_nutrition,
          patch.nutrient_key,
          patch.corrected_value,
          patch.original_value,
          patch.source_nutrient_id,
          patch.source_nutrient_name
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE nsr.source_type = 'NZFCD'
      AND nsr.source_key = patch.source_key
      AND pg_temp.needs_nzfcd_fatty_acid_patch(
        nsr.normalized_nutrition,
        patch.nutrient_key,
        patch.corrected_value,
        patch.original_value
      );
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    RAISE NOTICE 'nutrition_source_record % % updated rows: %', patch.source_key, patch.nutrient_key, changed_rows;

    UPDATE ingredient_nutrition_candidate inc
    SET normalized_nutrition = pg_temp.patch_nzfcd_fatty_acid(
          inc.normalized_nutrition,
          patch.nutrient_key,
          patch.corrected_value,
          patch.original_value,
          patch.source_nutrient_id,
          patch.source_nutrient_name
        ),
        updated_at = CURRENT_TIMESTAMP
    FROM nutrition_source_record nsr
    WHERE inc.source_record_id = nsr.id
      AND nsr.source_type = 'NZFCD'
      AND nsr.source_key = patch.source_key
      AND pg_temp.needs_nzfcd_fatty_acid_patch(
        inc.normalized_nutrition,
        patch.nutrient_key,
        patch.corrected_value,
        patch.original_value
      );
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    RAISE NOTICE 'ingredient_nutrition_candidate.normalized_nutrition % % updated rows: %', patch.source_key, patch.nutrient_key, changed_rows;

    UPDATE ingredient_nutrition_candidate inc
    SET confirmation_snapshot = jsonb_set(
          inc.confirmation_snapshot,
          '{nutritionProfile}',
          pg_temp.patch_nzfcd_fatty_acid(
            inc.confirmation_snapshot #> '{nutritionProfile}',
            patch.nutrient_key,
            patch.corrected_value,
            patch.original_value,
            patch.source_nutrient_id,
            patch.source_nutrient_name
          ),
          true
        ),
        updated_at = CURRENT_TIMESTAMP
    FROM nutrition_source_record nsr
    WHERE inc.source_record_id = nsr.id
      AND nsr.source_type = 'NZFCD'
      AND nsr.source_key = patch.source_key
      AND inc.confirmation_snapshot ? 'nutritionProfile'
      AND pg_temp.needs_nzfcd_fatty_acid_patch(
        inc.confirmation_snapshot #> '{nutritionProfile}',
        patch.nutrient_key,
        patch.corrected_value,
        patch.original_value
      );
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    RAISE NOTICE 'ingredient_nutrition_candidate.confirmation_snapshot % % updated rows: %', patch.source_key, patch.nutrient_key, changed_rows;

    IF patch.source_key = 'NZFCD:T1024' THEN
      UPDATE ingredient i
      SET nutrition_profile = pg_temp.patch_nzfcd_fatty_acid(
            CASE
              WHEN jsonb_typeof(i.nutrition_profile) = 'object' THEN i.nutrition_profile
              ELSE inc.normalized_nutrition
            END,
            patch.nutrient_key,
            patch.corrected_value,
            patch.original_value,
            patch.source_nutrient_id,
            patch.source_nutrient_name
          ),
          updated_at = CURRENT_TIMESTAMP
      FROM ingredient_nutrition_candidate inc
      JOIN nutrition_source_record nsr ON nsr.id = inc.source_record_id
      WHERE i.type = 'FOOD'
        AND i.name = '青口贝'
        AND inc.ingredient_id = i.id
        AND inc.status = 'CONFIRMED'
        AND nsr.source_type = 'NZFCD'
        AND nsr.source_key = 'NZFCD:T1024'
        AND (
          jsonb_typeof(i.nutrition_profile) IS DISTINCT FROM 'object'
          OR pg_temp.needs_nzfcd_fatty_acid_patch(
            i.nutrition_profile,
            patch.nutrient_key,
            patch.corrected_value,
            patch.original_value
          )
        );
      GET DIAGNOSTICS changed_rows = ROW_COUNT;
      RAISE NOTICE 'ingredient 青口贝 % updated rows: %', patch.nutrient_key, changed_rows;
    END IF;
  END LOOP;
END $$;

\echo 'Repairing MEXT arachidonic acid mg-to-g canonical values...'

WITH updated AS (
  UPDATE nutrition_food
  SET nutrition_data = pg_temp.patch_mext_arachidonic_mg_to_g(nutrition_data),
      updated_at = CURRENT_TIMESTAMP
  WHERE pg_temp.profile_has_mext_arachidonic_mg(nutrition_data)
  RETURNING 1
)
SELECT 'nutrition_food_mext_arachidonic_updated' AS metric, count(*) AS value
FROM updated;

WITH updated AS (
  UPDATE nutrition_source_record
  SET normalized_nutrition = pg_temp.patch_mext_arachidonic_mg_to_g(normalized_nutrition),
      updated_at = CURRENT_TIMESTAMP
  WHERE pg_temp.profile_has_mext_arachidonic_mg(normalized_nutrition)
  RETURNING 1
)
SELECT 'nutrition_source_record_mext_arachidonic_updated' AS metric, count(*) AS value
FROM updated;

WITH updated AS (
  UPDATE ingredient_nutrition_candidate
  SET normalized_nutrition = pg_temp.patch_mext_arachidonic_mg_to_g(normalized_nutrition),
      updated_at = CURRENT_TIMESTAMP
  WHERE pg_temp.profile_has_mext_arachidonic_mg(normalized_nutrition)
  RETURNING 1
)
SELECT 'ingredient_candidate_mext_arachidonic_updated' AS metric, count(*) AS value
FROM updated;

WITH updated AS (
  UPDATE ingredient_nutrition_candidate
  SET confirmation_snapshot = jsonb_set(
        confirmation_snapshot,
        '{nutritionProfile}',
        pg_temp.patch_mext_arachidonic_mg_to_g(confirmation_snapshot #> '{nutritionProfile}'),
        true
      ),
      updated_at = CURRENT_TIMESTAMP
  WHERE confirmation_snapshot ? 'nutritionProfile'
    AND pg_temp.profile_has_mext_arachidonic_mg(confirmation_snapshot #> '{nutritionProfile}')
  RETURNING 1
)
SELECT 'ingredient_candidate_snapshot_mext_arachidonic_updated' AS metric, count(*) AS value
FROM updated;

WITH updated AS (
  UPDATE ingredient
  SET nutrition_profile = pg_temp.patch_mext_arachidonic_mg_to_g(nutrition_profile),
      updated_at = CURRENT_TIMESTAMP
  WHERE pg_temp.profile_has_mext_arachidonic_mg(nutrition_profile)
  RETURNING 1
)
SELECT 'ingredient_mext_arachidonic_updated' AS metric, count(*) AS value
FROM updated;

WITH updated AS (
  UPDATE supplement_nutrition_draft
  SET normalized_nutrition = pg_temp.patch_mext_arachidonic_mg_to_g(normalized_nutrition),
      updated_at = CURRENT_TIMESTAMP
  WHERE pg_temp.profile_has_mext_arachidonic_mg(normalized_nutrition)
  RETURNING 1
)
SELECT 'supplement_draft_mext_arachidonic_updated' AS metric, count(*) AS value
FROM updated;

COMMIT;

\echo 'Post-repair audit counts. All anomaly_count values should be 0.'

WITH profiles AS (
  SELECT 'nutrition_food' AS table_name, id, nutrition_data AS profile
  FROM nutrition_food
  UNION ALL
  SELECT 'nutrition_source_record' AS table_name, id, normalized_nutrition AS profile
  FROM nutrition_source_record
  WHERE normalized_nutrition IS NOT NULL
  UNION ALL
  SELECT 'ingredient' AS table_name, id, nutrition_profile AS profile
  FROM ingredient
  WHERE nutrition_profile IS NOT NULL
  UNION ALL
  SELECT 'ingredient_nutrition_candidate.normalized_nutrition' AS table_name, id, normalized_nutrition AS profile
  FROM ingredient_nutrition_candidate
  UNION ALL
  SELECT 'ingredient_nutrition_candidate.confirmation_snapshot' AS table_name, id, confirmation_snapshot #> '{nutritionProfile}' AS profile
  FROM ingredient_nutrition_candidate
  WHERE confirmation_snapshot ? 'nutritionProfile'
  UNION ALL
  SELECT 'supplement_nutrition_draft' AS table_name, id, normalized_nutrition AS profile
  FROM supplement_nutrition_draft
  WHERE normalized_nutrition IS NOT NULL
),
nutrients(nutrient_key) AS (
  VALUES ('linoleicAcid'), ('alphaLinolenicAcid'), ('arachidonicAcid')
)
SELECT
  'source_form_1000x_g_to_g_anomalies' AS audit_name,
  count(*) AS anomaly_count
FROM profiles p
CROSS JOIN nutrients n
WHERE lower(coalesce(p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'originalUnit'], '')) LIKE 'g%'
  AND (p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'canonicalUnit']) = 'g'
  AND pg_temp.to_numeric_or_null(p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'originalValue']) IS NOT NULL
  AND pg_temp.to_numeric_or_null(p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'originalValue']) <> 0
  AND pg_temp.to_numeric_or_null(p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'canonicalValue']) IS NOT NULL
  AND abs(
    pg_temp.to_numeric_or_null(p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'canonicalValue'])
    - pg_temp.to_numeric_or_null(p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'originalValue']) * 1000
  ) <= 0.000000001;

WITH profiles AS (
  SELECT 'nutrition_food' AS table_name, id, nutrition_data AS profile
  FROM nutrition_food
  UNION ALL
  SELECT 'nutrition_source_record' AS table_name, id, normalized_nutrition AS profile
  FROM nutrition_source_record
  WHERE normalized_nutrition IS NOT NULL
  UNION ALL
  SELECT 'ingredient' AS table_name, id, nutrition_profile AS profile
  FROM ingredient
  WHERE nutrition_profile IS NOT NULL
  UNION ALL
  SELECT 'ingredient_nutrition_candidate.normalized_nutrition' AS table_name, id, normalized_nutrition AS profile
  FROM ingredient_nutrition_candidate
  UNION ALL
  SELECT 'ingredient_nutrition_candidate.confirmation_snapshot' AS table_name, id, confirmation_snapshot #> '{nutritionProfile}' AS profile
  FROM ingredient_nutrition_candidate
  WHERE confirmation_snapshot ? 'nutritionProfile'
  UNION ALL
  SELECT 'supplement_nutrition_draft' AS table_name, id, normalized_nutrition AS profile
  FROM supplement_nutrition_draft
  WHERE normalized_nutrition IS NOT NULL
),
profile_values AS (
  SELECT
    table_name,
    id,
    pg_temp.to_numeric_or_null(profile #>> '{macros,crudeFat}') AS fat_g,
    pg_temp.to_numeric_or_null(profile #>> '{fattyAcids,polyunsaturatedFattyAcids}') AS pufa_g,
    pg_temp.to_numeric_or_null(profile #>> '{fattyAcids,linoleicAcid}') AS la_g,
    pg_temp.to_numeric_or_null(profile #>> '{fattyAcids,alphaLinolenicAcid}') AS ala_g,
    pg_temp.to_numeric_or_null(profile #>> '{fattyAcids,arachidonicAcid}') AS aa_g
  FROM profiles
),
thresholds AS (
  SELECT
    table_name,
    id,
    fat_g,
    pufa_g,
    la_g,
    ala_g,
    aa_g,
    greatest(coalesce(fat_g, 0), coalesce(pufa_g, 0)) AS comparison_g
  FROM profile_values
)
SELECT
  'physical_fatty_acid_anomalies' AS audit_name,
  count(*) AS anomaly_count
FROM thresholds
WHERE comparison_g > 0
  AND (
    coalesce(la_g, 0) > comparison_g * 5 + 0.001
    OR coalesce(ala_g, 0) > comparison_g * 5 + 0.001
    OR coalesce(aa_g, 0) > comparison_g * 5 + 0.001
    OR coalesce(la_g, 0) + coalesce(ala_g, 0) + coalesce(aa_g, 0) > comparison_g * 5 + 0.001
  );

WITH profiles AS (
  SELECT 'nutrition_food' AS table_name, id, nutrition_data AS profile
  FROM nutrition_food
  UNION ALL
  SELECT 'nutrition_source_record' AS table_name, id, normalized_nutrition AS profile
  FROM nutrition_source_record
  WHERE normalized_nutrition IS NOT NULL
  UNION ALL
  SELECT 'ingredient' AS table_name, id, nutrition_profile AS profile
  FROM ingredient
  WHERE nutrition_profile IS NOT NULL
  UNION ALL
  SELECT 'ingredient_nutrition_candidate.normalized_nutrition' AS table_name, id, normalized_nutrition AS profile
  FROM ingredient_nutrition_candidate
  UNION ALL
  SELECT 'ingredient_nutrition_candidate.confirmation_snapshot' AS table_name, id, confirmation_snapshot #> '{nutritionProfile}' AS profile
  FROM ingredient_nutrition_candidate
  WHERE confirmation_snapshot ? 'nutritionProfile'
  UNION ALL
  SELECT 'supplement_nutrition_draft' AS table_name, id, normalized_nutrition AS profile
  FROM supplement_nutrition_draft
  WHERE normalized_nutrition IS NOT NULL
),
nutrients(nutrient_key) AS (
  VALUES ('linoleicAcid'), ('alphaLinolenicAcid'), ('arachidonicAcid')
)
SELECT
  'g_field_sourceforms_marked_mg' AS audit_name,
  count(*) AS anomaly_count
FROM profiles p
CROSS JOIN nutrients n
WHERE (p.profile #>> ARRAY['meta', 'sourceForms', 'fattyAcids.' || n.nutrient_key, 'canonicalUnit']) = 'mg';

\echo 'Green-lipped mussel verification.'

SELECT
  nf.external_id,
  nf.name,
  nf.nutrition_data #>> '{fattyAcids,linoleicAcid}' AS linoleic_acid_g_per_100g,
  (pg_temp.to_numeric_or_null(nf.nutrition_data #>> '{fattyAcids,linoleicAcid}') * 5 / 100)::numeric(12, 6) AS contribution_at_5g_g,
  (pg_temp.to_numeric_or_null(nf.nutrition_data #>> '{fattyAcids,linoleicAcid}') * 10 / 100)::numeric(12, 6) AS contribution_at_10g_g
FROM nutrition_food nf
WHERE nf.data_source = 'NZFCD'
  AND nf.external_id IN ('NZFCD:T1024', 'NZFCD:T1026')
ORDER BY nf.external_id;

SELECT
  i.id,
  i.name,
  i.nutrition_profile #>> '{fattyAcids,linoleicAcid}' AS linoleic_acid_g_per_100g,
  (pg_temp.to_numeric_or_null(i.nutrition_profile #>> '{fattyAcids,linoleicAcid}') * 5 / 100)::numeric(12, 6) AS contribution_at_5g_g,
  (pg_temp.to_numeric_or_null(i.nutrition_profile #>> '{fattyAcids,linoleicAcid}') * 10 / 100)::numeric(12, 6) AS contribution_at_10g_g
FROM ingredient i
WHERE i.name = '青口贝'
ORDER BY i.id;
