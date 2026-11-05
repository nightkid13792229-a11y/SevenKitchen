-- 2026-11-05 采购渠道存量归并（第二步 · 数据部分）
--
-- 依据生产只读报告（2026-11-05，约 4,700 行）与老板确认的映射：
--   · 本地生鲜市场 / 本地市场        → 农贸市场
--   · 天猫旗舰店 / 天猫超市 / 淘宝    → 淘宝/天猫
--   · iiHerb / iherb / iHerb（微信小程序） → iHerb
--   · 亚马逊                          → 亚马逊国际
--   · 停用项（美菜网、批发市场、阿里健康大药房）不改写：字典里保留停用项，
--     历史单据照常显示，只是以后选不到（D8）。
--   · 自制、朴朴超市 已是正式渠道，不改写。
--
-- 显式映射、可逐条回滚；执行前按部署记录做 pg_dump 备份。

-- 1) 去掉首尾空白（历史上手打的空格）
UPDATE ingredient SET purchase_channel = btrim(purchase_channel)
WHERE purchase_channel IS NOT NULL AND purchase_channel <> btrim(purchase_channel);
UPDATE recommended_product SET purchase_channel = btrim(purchase_channel)
WHERE purchase_channel IS NOT NULL AND purchase_channel <> btrim(purchase_channel);
UPDATE procurement_sku SET purchase_channel = btrim(purchase_channel)
WHERE purchase_channel IS NOT NULL AND purchase_channel <> btrim(purchase_channel);
UPDATE purchase_item SET purchase_channel = btrim(purchase_channel)
WHERE purchase_channel IS NOT NULL AND purchase_channel <> btrim(purchase_channel);
UPDATE purchase_record SET purchase_channel = btrim(purchase_channel)
WHERE purchase_channel IS NOT NULL AND purchase_channel <> btrim(purchase_channel);

-- 2) 显式归并（每张表一条语句，映射写在 VALUES 里，便于核对与回滚）
UPDATE ingredient t SET purchase_channel = m.new
FROM (VALUES
  ('本地生鲜市场', '农贸市场'),
  ('本地市场', '农贸市场'),
  ('天猫旗舰店', '淘宝/天猫'),
  ('天猫超市', '淘宝/天猫'),
  ('淘宝', '淘宝/天猫'),
  ('iiHerb', 'iHerb'),
  ('iherb', 'iHerb'),
  ('iHerb（微信小程序）', 'iHerb'),
  ('亚马逊', '亚马逊国际')
) AS m(old, new)
WHERE t.purchase_channel = m.old;

UPDATE recommended_product t SET purchase_channel = m.new
FROM (VALUES
  ('本地生鲜市场', '农贸市场'),
  ('本地市场', '农贸市场'),
  ('天猫旗舰店', '淘宝/天猫'),
  ('天猫超市', '淘宝/天猫'),
  ('淘宝', '淘宝/天猫'),
  ('iiHerb', 'iHerb'),
  ('iherb', 'iHerb'),
  ('iHerb（微信小程序）', 'iHerb'),
  ('亚马逊', '亚马逊国际')
) AS m(old, new)
WHERE t.purchase_channel = m.old;

UPDATE procurement_sku t SET purchase_channel = m.new
FROM (VALUES
  ('本地生鲜市场', '农贸市场'),
  ('本地市场', '农贸市场'),
  ('天猫旗舰店', '淘宝/天猫'),
  ('天猫超市', '淘宝/天猫'),
  ('淘宝', '淘宝/天猫'),
  ('iiHerb', 'iHerb'),
  ('iherb', 'iHerb'),
  ('iHerb（微信小程序）', 'iHerb'),
  ('亚马逊', '亚马逊国际')
) AS m(old, new)
WHERE t.purchase_channel = m.old;

UPDATE purchase_item t SET purchase_channel = m.new
FROM (VALUES
  ('本地生鲜市场', '农贸市场'),
  ('本地市场', '农贸市场'),
  ('天猫旗舰店', '淘宝/天猫'),
  ('天猫超市', '淘宝/天猫'),
  ('淘宝', '淘宝/天猫'),
  ('iiHerb', 'iHerb'),
  ('iherb', 'iHerb'),
  ('iHerb（微信小程序）', 'iHerb'),
  ('亚马逊', '亚马逊国际')
) AS m(old, new)
WHERE t.purchase_channel = m.old;

UPDATE purchase_record t SET purchase_channel = m.new
FROM (VALUES
  ('本地生鲜市场', '农贸市场'),
  ('本地市场', '农贸市场'),
  ('天猫旗舰店', '淘宝/天猫'),
  ('天猫超市', '淘宝/天猫'),
  ('淘宝', '淘宝/天猫'),
  ('iiHerb', 'iHerb'),
  ('iherb', 'iHerb'),
  ('iHerb（微信小程序）', 'iHerb'),
  ('亚马逊', '亚马逊国际')
) AS m(old, new)
WHERE t.purchase_channel = m.old;

-- 3) 空字符串统一成「没填」，不要留一个既不是码也不是 NULL 的第三种状态
UPDATE ingredient SET purchase_channel = NULL WHERE btrim(coalesce(purchase_channel, '')) = '';
UPDATE recommended_product SET purchase_channel = NULL WHERE btrim(coalesce(purchase_channel, '')) = '';
UPDATE procurement_sku SET purchase_channel = NULL WHERE btrim(coalesce(purchase_channel, '')) = '';
UPDATE purchase_item SET purchase_channel = NULL WHERE btrim(coalesce(purchase_channel, '')) = '';
