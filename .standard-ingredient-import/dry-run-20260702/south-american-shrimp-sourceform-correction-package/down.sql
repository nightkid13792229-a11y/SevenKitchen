-- SevenKitchen standard ingredient correction rollback
-- Scope: restore prior sourceForms canonicalValue metadata for MEXT:10415 only.

WITH field_map(field_path) AS (
  VALUES
    ('fattyAcids.linoleicAcid'),
    ('fattyAcids.alphaLinolenicAcid'),
    ('fattyAcids.arachidonicAcid'),
    ('aminoAcids.tryptophan'),
    ('aminoAcids.threonine'),
    ('aminoAcids.isoleucine'),
    ('aminoAcids.leucine'),
    ('aminoAcids.lysine'),
    ('aminoAcids.methionine'),
    ('aminoAcids.cystine'),
    ('aminoAcids.phenylalanine'),
    ('aminoAcids.tyrosine'),
    ('aminoAcids.valine'),
    ('aminoAcids.arginine'),
    ('aminoAcids.histidine'),
    ('aminoAcids.glutamicAcid'),
    ('aminoAcids.glycine'),
    ('aminoAcids.proline')
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
          forms.value,
          '{canonicalValue}',
          to_jsonb((forms.value #>> '{originalValue}')::numeric),
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

WITH field_map(field_path) AS (
  VALUES
    ('fattyAcids.linoleicAcid'),
    ('fattyAcids.alphaLinolenicAcid'),
    ('fattyAcids.arachidonicAcid'),
    ('aminoAcids.tryptophan'),
    ('aminoAcids.threonine'),
    ('aminoAcids.isoleucine'),
    ('aminoAcids.leucine'),
    ('aminoAcids.lysine'),
    ('aminoAcids.methionine'),
    ('aminoAcids.cystine'),
    ('aminoAcids.phenylalanine'),
    ('aminoAcids.tyrosine'),
    ('aminoAcids.valine'),
    ('aminoAcids.arginine'),
    ('aminoAcids.histidine'),
    ('aminoAcids.glutamicAcid'),
    ('aminoAcids.glycine'),
    ('aminoAcids.proline')
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
          forms.value,
          '{canonicalValue}',
          to_jsonb((forms.value #>> '{originalValue}')::numeric),
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
