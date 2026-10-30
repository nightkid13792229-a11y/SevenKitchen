-- B族维生素复合胶囊（Jarrow B-Right）：按实测成分表逐条列示
-- 注意：泛硫乙胺、肌醇 是否属于《饲料添加剂品种目录》收录范围需另行确认；
-- 若不在，这属于配方层面问题，不应通过从标签上删字来解决。

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array(
    '维生素B1','维生素B2','维生素B3','维生素B5','维生素B6','维生素B7',
    '维生素B9','维生素B12','肌醇','酒石酸胆碱','泛硫乙胺'
  ),
  'label_name_source', 'Jarrow B-Right 成分表；泛硫乙胺/肌醇的目录归属待确认'
)
WHERE name LIKE 'B%族维生素%'
  AND type = 'SUPPLEMENT'
  AND NOT (properties ? 'label_category');
