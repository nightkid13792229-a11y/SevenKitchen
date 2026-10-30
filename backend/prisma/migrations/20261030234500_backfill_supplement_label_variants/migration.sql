-- 生产库存在一些本地没有的同营养素不同剂型/叫法，按模式补齐
-- 只处理名称里已明确包含营养素条目的，其余保持为空待人工核对

-- 维生素D3：胶囊、滴剂、片剂等写法统一写作「维生素D3」
UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('维生素D3'),
  'label_name_source', '2026-10-30 按名称模式回填'
)
WHERE type = 'SUPPLEMENT'
  AND name LIKE '维生素D3%'
  AND NOT (properties ? 'label_category');

-- 维生素E：同理
UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('维生素E'),
  'label_name_source', '2026-10-30 按名称模式回填'
)
WHERE type = 'SUPPLEMENT'
  AND name LIKE '维生素E%'
  AND NOT (properties ? 'label_category');

-- 牛磺酸：同理
UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_ADDITIVE',
  'label_names', jsonb_build_array('牛磺酸'),
  'label_name_source', '2026-10-30 按名称模式回填'
)
WHERE type = 'SUPPLEMENT'
  AND name LIKE '牛磺酸%'
  AND NOT (properties ? 'label_category');
