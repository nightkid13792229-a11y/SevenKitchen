-- SevenKitchen standard ingredient correction package
-- Scope: fix sourceForms canonicalValue metadata for MEXT:10415 only
-- Actual nutrition values are intentionally unchanged.

WITH field_map(field_path, value_path) AS (
  VALUES
    ('fattyAcids.linoleicAcid', ARRAY['fattyAcids', 'linoleicAcid']::text[]),
    ('fattyAcids.alphaLinolenicAcid', ARRAY['fattyAcids', 'alphaLinolenicAcid']::text[]),
    ('fattyAcids.arachidonicAcid', ARRAY['fattyAcids', 'arachidonicAcid']::text[]),
    ('aminoAcids.tryptophan', ARRAY['aminoAcids', 'tryptophan']::text[]),
    ('aminoAcids.threonine', ARRAY['aminoAcids', 'threonine']::text[]),
    ('aminoAcids.isoleucine', ARRAY['aminoAcids', 'isoleucine']::text[]),
    ('aminoAcids.leucine', ARRAY['aminoAcids', 'leucine']::text[]),
    ('aminoAcids.lysine', ARRAY['aminoAcids', 'lysine']::text[]),
    ('aminoAcids.methionine', ARRAY['aminoAcids', 'methionine']::text[]),
    ('aminoAcids.cystine', ARRAY['aminoAcids', 'cystine']::text[]),
    ('aminoAcids.phenylalanine', ARRAY['aminoAcids', 'phenylalanine']::text[]),
    ('aminoAcids.tyrosine', ARRAY['aminoAcids', 'tyrosine']::text[]),
    ('aminoAcids.valine', ARRAY['aminoAcids', 'valine']::text[]),
    ('aminoAcids.arginine', ARRAY['aminoAcids', 'arginine']::text[]),
    ('aminoAcids.histidine', ARRAY['aminoAcids', 'histidine']::text[]),
    ('aminoAcids.glutamicAcid', ARRAY['aminoAcids', 'glutamicAcid']::text[]),
    ('aminoAcids.glycine', ARRAY['aminoAcids', 'glycine']::text[]),
    ('aminoAcids.proline', ARRAY['aminoAcids', 'proline']::text[])
)
UPDATE nutrition_food nf
SET nutrition_data = jsonb_set(
  nf.nutrition_data,
  '{meta,sourceForms}',
  (
    SELECT jsonb_object_agg(
      forms.key,
      CASE
        WHEN field_map.field_path IS NULL THEN forms.value
        ELSE jsonb_set(
          jsonb_set(
            forms.value,
            '{canonicalValue}',
            to_jsonb((nf.nutrition_data #>> field_map.value_path)::numeric),
            false
          ),
          '{canonicalUnit}',
          to_jsonb('g'::text),
          false
        )
      END
    )
    FROM jsonb_each(nf.nutrition_data #> '{meta,sourceForms}') AS forms(key, value)
    LEFT JOIN field_map ON field_map.field_path = forms.key
  ),
  false
)
WHERE nf.id = '3a11ef71-44f1-4b74-8e10-9c28e6e6b259'
  AND nf.data_source = 'MEXT'
  AND nf.external_id = 'MEXT:10415';

WITH field_map(field_path, value_path) AS (
  VALUES
    ('fattyAcids.linoleicAcid', ARRAY['fattyAcids', 'linoleicAcid']::text[]),
    ('fattyAcids.alphaLinolenicAcid', ARRAY['fattyAcids', 'alphaLinolenicAcid']::text[]),
    ('fattyAcids.arachidonicAcid', ARRAY['fattyAcids', 'arachidonicAcid']::text[]),
    ('aminoAcids.tryptophan', ARRAY['aminoAcids', 'tryptophan']::text[]),
    ('aminoAcids.threonine', ARRAY['aminoAcids', 'threonine']::text[]),
    ('aminoAcids.isoleucine', ARRAY['aminoAcids', 'isoleucine']::text[]),
    ('aminoAcids.leucine', ARRAY['aminoAcids', 'leucine']::text[]),
    ('aminoAcids.lysine', ARRAY['aminoAcids', 'lysine']::text[]),
    ('aminoAcids.methionine', ARRAY['aminoAcids', 'methionine']::text[]),
    ('aminoAcids.cystine', ARRAY['aminoAcids', 'cystine']::text[]),
    ('aminoAcids.phenylalanine', ARRAY['aminoAcids', 'phenylalanine']::text[]),
    ('aminoAcids.tyrosine', ARRAY['aminoAcids', 'tyrosine']::text[]),
    ('aminoAcids.valine', ARRAY['aminoAcids', 'valine']::text[]),
    ('aminoAcids.arginine', ARRAY['aminoAcids', 'arginine']::text[]),
    ('aminoAcids.histidine', ARRAY['aminoAcids', 'histidine']::text[]),
    ('aminoAcids.glutamicAcid', ARRAY['aminoAcids', 'glutamicAcid']::text[]),
    ('aminoAcids.glycine', ARRAY['aminoAcids', 'glycine']::text[]),
    ('aminoAcids.proline', ARRAY['aminoAcids', 'proline']::text[])
)
UPDATE ingredient i
SET nutrition_profile = jsonb_set(
  i.nutrition_profile,
  '{meta,sourceForms}',
  (
    SELECT jsonb_object_agg(
      forms.key,
      CASE
        WHEN field_map.field_path IS NULL THEN forms.value
        ELSE jsonb_set(
          jsonb_set(
            forms.value,
            '{canonicalValue}',
            to_jsonb((i.nutrition_profile #>> field_map.value_path)::numeric),
            false
          ),
          '{canonicalUnit}',
          to_jsonb('g'::text),
          false
        )
      END
    )
    FROM jsonb_each(i.nutrition_profile #> '{meta,sourceForms}') AS forms(key, value)
    LEFT JOIN field_map ON field_map.field_path = forms.key
  ),
  false
)
WHERE i.id = 'b60e08c5-73c0-4219-ba91-9afff5c5268f'
  AND i.name = '南美对虾虾仁'
  AND i.type = 'FOOD';
