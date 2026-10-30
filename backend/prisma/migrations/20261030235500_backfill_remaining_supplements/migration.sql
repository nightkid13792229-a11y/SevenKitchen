-- 补齐最后一批：依据产品实物成分
--   胆碱片 Nature's Way 500mg → 酒石酸胆碱 + 肌醇（每 2 粒 500mg）
--   鸡蛋壳粉 → 原料（业主确认可用于饲料）
--   双甘氨酸铜片 NOW / 氨基酸螯合铜 Swanson Albion → 甘氨酸铜
--   蛋氨酸锌胶囊 NOW L-OptiZinc → 蛋氨酸锌 + 甘氨酸铜（含 0.3mg 铜）

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('酒石酸胆碱', '肌醇'),
  'label_name_source', '产品成分表：Choline (as choline bitartrate) 500mg + Inositol 500mg / 2粒'
)
WHERE btrim(name) = '胆碱片' AND NOT (properties ? 'label_category');

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_MATERIAL',
  'label_names', jsonb_build_array('蛋壳粉'),
  'label_name_source', '业主确认可用于饲料'
)
WHERE btrim(name) = '鸡蛋壳粉' AND NOT (properties ? 'label_category');

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('甘氨酸铜'),
  'label_name_source', '产品：NOW Copper Glycinate / Swanson Albion Copper'
)
WHERE btrim(name) IN ('双甘氨酸铜片', '氨基酸螯合铜') AND NOT (properties ? 'label_category');

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('蛋氨酸锌', '甘氨酸铜'),
  'label_name_source', '产品：NOW L-OptiZinc（锌单蛋氨酸），另含 0.3mg 铜'
)
WHERE btrim(name) = '蛋氨酸锌胶囊' AND NOT (properties ? 'label_category');
