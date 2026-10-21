-- 2026-10-22: 补全 NOW Foods Liquid Vitamin D-3 补剂档案。
-- 标签：Serving Size 4 Drops (approx. 0.112 mL), 10 mcg (400 IU) Vitamin D3.
-- 补剂按“滴”使用，归一化为 100 IU/滴（PER_SERVING + servingUnitLabel=滴）。
-- 标签未提供可量化的能量/脂肪，宏量营养保持 null，不臆造。

UPDATE nutrition_food
SET
  name = 'NOW Foods Liquid Vitamin D-3 400 IU/4滴（59 mL）',
  name_en = 'NOW Foods Liquid Vitamin D-3, 400 IU per 4 drops, 59 mL',
  display_name_zh = '维生素D3滴剂',
  category = 'SUPPLEMENT',
  data_source = 'SUPPLEMENT_LABEL',
  external_id = 'SUPPLEMENT_LABEL:6394738e-8986-47bc-bd1c-17bd64922fc2:NOW-Liquid-D3-59ml',
  status = 'VERIFIED',
  preparation_state = 'OIL',
  preparation_state_label = '油脂',
  processing_label = '液体滴剂',
  nutrition_data = '{"meta":{"externalId":"SUPPLEMENT_LABEL:6394738e-8986-47bc-bd1c-17bd64922fc2:NOW-Liquid-D3-59ml","sourceCode":"SUPPLEMENT_LABEL","sourceKind":"PRODUCT_LABEL","sourceType":"LABEL","attachments":[],"sampleState":"OIL","sourceForms":{"vitamins.vitaminD":{"source":"SUPPLEMENT_LABEL","basisType":"PER_SERVING","sourceUnit":"IU","sourceValue":400,"originalValue":400,"originalUnit":"IU","canonicalValue":100,"canonicalUnit":"IU","sourceFoodName":"NOW Foods Liquid Vitamin D-3","sourceComponent":"Vitamin D (as D3 Cholecalciferol) (from Lanolin)","conversion":"400 IU / 4 drops = 100 IU per drop","sourceDetail":"Serving Size 4 Drops (approx. 0.112 mL); 10 mcg (400 IU) per serving"}},"sourceTitle":"NOW Foods Liquid Vitamin D-3, 400 IU per 4 drops, 59 mL","versionNote":"标签：每 4 滴约 0.112 mL，含维生素 D3 10 mcg（400 IU）；换算为每滴 100 IU。","fieldSources":{"vitamins.vitaminD":"PRODUCT_LABEL"},"rawBasisType":"PER_SERVING","densityGPerMl":null,"sourceVersion":"2026-10-22","servingWeightG":null,"sourceProvider":"NOW Foods product label","sourceRecordId":null,"confidenceLevel":"HIGH","conversionNotes":{},"ediblePortionRate":null,"fieldDisplayUnits":{"vitamins.vitaminD":"IU"},"isEdiblePortionBasis":false,"amountUnitLabel":"滴","servingUnitLabel":"滴","usageUnit":"滴"},"macros":{"ash":null,"fiber":null,"crudeFat":null,"moisture":null,"energyKcal":null,"carbohydrate":null,"crudeProtein":null,"solubleFiber":null,"insolubleFiber":null},"minerals":{"iron":null,"zinc":null,"copper":null,"iodine":null,"sodium":null,"calcium":null,"chloride":null,"selenium":null,"magnesium":null,"manganese":null,"potassium":null,"phosphorus":null},"vitamins":{"choline":null,"vitaminA":null,"vitaminC":null,"vitaminD":100,"vitaminE":null,"vitaminK":null,"vitaminB1":null,"vitaminB2":null,"vitaminB3":null,"vitaminB5":null,"vitaminB6":null,"vitaminB7":null,"vitaminB9":null,"vitaminB12":null},"aminoAcids":{"lysine":null,"valine":null,"cystine":null,"glycine":null,"leucine":null,"proline":null,"taurine":null,"arginine":null,"tyrosine":null,"histidine":null,"threonine":null,"isoleucine":null,"methionine":null,"tryptophan":null,"glutamicAcid":null,"phenylalanine":null},"fattyAcids":{"dha":null,"dpa":null,"epa":null,"linoleicAcid":null,"arachidonicAcid":null,"alphaLinolenicAcid":null,"saturatedFattyAcids":null,"monounsaturatedFattyAcids":null,"polyunsaturatedFattyAcids":null},"customItems":[]}'::jsonb,
  notes = '2026-10-22 按 NOW Foods Liquid Vitamin D-3 产品标签补全：每 4 滴约 0.112 mL，含维生素 D3 10 mcg（400 IU，胆钙化醇，来源羊毛脂）；换算为每滴 100 IU。其他成分：MCT 油（椰子/棕榈仁来源）、红花籽油。标签未提供可量化的脂肪/能量，因此不臆造宏量营养值。',
  verified_at = NOW(),
  updated_at = NOW()
WHERE id = '483c2442-1ab3-489f-adeb-753d8d9a849c';

UPDATE nutrition_food_mapping
SET
  is_primary = true,
  notes = '2026-10-22 按产品标签补全：400 IU/4滴，归一化 100 IU/滴。',
  updated_at = NOW()
WHERE nutrition_food_id = '483c2442-1ab3-489f-adeb-753d8d9a849c'
  AND ingredient_id = '6394738e-8986-47bc-bd1c-17bd64922fc2';
