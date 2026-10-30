-- 回填原料的标签合规字段（存放在 ingredient.properties JSON 内）
-- 标签类型：FEED_MATERIAL = 饲料原料（进「原料组成」）；FEED_ADDITIVE = 饲料添加剂（进「添加剂组成」）
-- 标签名称：目录规范写法，不带片/胶囊/粉等剂型
--
-- 只回填名称已确认的原料。以下 4 个名称需人工核对目录后再填，故意留空：
--   鸡蛋壳粉（蛋壳粉？）、双甘氨酸铜片（甘氨酸铜？）、胆碱片（氯化胆碱？）、NOW Foods L-OptiZinc（蛋氨酸锌？）

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_MATERIAL',
  'label_names', jsonb_build_array('海藻粉')
)
WHERE name = '海藻粉'
  AND (properties->>'label_category') IS NULL;

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_MATERIAL',
  'label_names', jsonb_build_array('骨粉')
)
WHERE name = '骨粉'
  AND (properties->>'label_category') IS NULL;

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_MATERIAL',
  'label_names', jsonb_build_array('鱼油')
)
WHERE name = '鱼油胶囊'
  AND (properties->>'label_category') IS NULL;

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('葡萄糖酸锌')
)
WHERE name = '葡萄糖酸锌片'
  AND (properties->>'label_category') IS NULL;

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('维生素D3')
)
WHERE name = '维生素D3胶囊'
  AND (properties->>'label_category') IS NULL;

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('碳酸钙')
)
WHERE name = '碳酸钙粉'
  AND (properties->>'label_category') IS NULL;

UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('维生素E')
)
WHERE btrim(name) = '维生素E胶囊'
  AND (properties->>'label_category') IS NULL;
