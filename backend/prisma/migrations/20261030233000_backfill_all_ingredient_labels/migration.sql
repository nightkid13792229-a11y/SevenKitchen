-- 全量回填标签类型 / 标签名称
-- 规则：
--   1) 食材（FOOD）一律「饲料原料」，标签名称先沿用现有名称（个别不符合目录写法的需人工微调）
--   2) 补剂（SUPPLEMENT）逐条指定：有的其实是原料（骨粉片、鱼油、菊粉…），有的才是添加剂
--   3) 包材（PACKAGING）不参与标签，不写入
--   4) 名称无法确认的保持为空（见文件末尾说明）

-- ---------- 1. 食材 ----------
UPDATE ingredient
SET properties = COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', 'FEED_MATERIAL',
  'label_names', jsonb_build_array(name),
  'label_name_source', '沿用现有原料名称（待按《饲料原料目录》微调）'
)
WHERE type = 'FOOD'
  AND NOT (properties ? 'label_category');

-- ---------- 2. 补剂逐一映射 ----------
WITH mapping(ing_name, cat, names) AS (
  VALUES
    -- 添加剂（名称即目录写法）
    ('牛磺酸胶囊',       'FEED_ADDITIVE', jsonb_build_array('牛磺酸')),
    ('柠檬酸钙粉',       'FEED_ADDITIVE', jsonb_build_array('柠檬酸钙')),
    ('柠檬酸钾胶囊',     'FEED_ADDITIVE', jsonb_build_array('柠檬酸钾')),
    ('柠檬酸镁胶囊',     'FEED_ADDITIVE', jsonb_build_array('柠檬酸镁')),
    ('磷酸氢钙',         'FEED_ADDITIVE', jsonb_build_array('磷酸氢钙')),
    ('甘氨酸锰片',       'FEED_ADDITIVE', jsonb_build_array('甘氨酸锰')),
    ('双甘氨酸亚铁胶囊', 'FEED_ADDITIVE', jsonb_build_array('甘氨酸亚铁')),
    ('碘钾片',           'FEED_ADDITIVE', jsonb_build_array('碘化钾')),
    ('B族维生素胶囊',    'FEED_ADDITIVE',
      jsonb_build_array('维生素B1','维生素B2','维生素B3','维生素B6','维生素B9','维生素B12')),
    -- 其实是原料（补剂库里挂了 SUPPLEMENT 类型）
    ('洋车前子壳粉',     'FEED_MATERIAL', jsonb_build_array('洋车前子壳粉')),
    ('海带粉胶囊',       'FEED_MATERIAL', jsonb_build_array('海带粉')),
    ('海带片',           'FEED_MATERIAL', jsonb_build_array('海带粉')),
    ('纤维素粉',         'FEED_MATERIAL', jsonb_build_array('纤维素')),
    ('菊粉',             'FEED_MATERIAL', jsonb_build_array('菊粉')),
    ('营养酵母粉',       'FEED_MATERIAL', jsonb_build_array('酵母粉')),
    ('骨粉片',           'FEED_MATERIAL', jsonb_build_array('骨粉')),
    ('鱼肝油',           'FEED_MATERIAL', jsonb_build_array('鱼肝油')),
    ('藻油',             'FEED_MATERIAL', jsonb_build_array('藻油'))
)
UPDATE ingredient i
SET properties = COALESCE(i.properties, '{}'::jsonb) || jsonb_build_object(
  'label_category', m.cat,
  'label_names', m.names,
  'label_name_source', '2026-10-30 批量回填（待核对目录）'
)
FROM mapping m
WHERE btrim(i.name) = m.ing_name
  AND i.type = 'SUPPLEMENT'
  AND NOT (i.properties ? 'label_category');

-- ---------- 3. 故意留空（名称待核，不可臆造）----------
--   鸡蛋壳粉 ×2      → 目录里是「蛋壳粉」还是别的写法？
--   双甘氨酸铜片      → 「甘氨酸铜」还是「双甘氨酸铜」？
--   Swanson Albion 铜 → 同上（Albion 是双甘氨酸铜）
--   胆碱片            → 「氯化胆碱」还是「酒石酸胆碱」？取决于瓶身成分表
--   NOW L-OptiZinc    → 锌单蛋氨酸，目录对应「蛋氨酸锌」？
--   Jarrow B-Right    → 缺少 active_nutrients，无法枚举维生素条目
