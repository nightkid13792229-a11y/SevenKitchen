-- 止血修复：小米 / 牛脾 的「采购单位单价」被误按「元/克」写入
--
-- 背景：
--   小米 采购单位是 g（purchase_to_base_ratio = 1），但历史数据里存的是
--   「一罐 2.3kg 小米」的整罐价（38.30 元/罐），直接当成 38.30 元/g 使用，
--   放大 2300 倍；牛脾 同理（2.78 元 vs 实际 5.00 元 / 900g）。
--   2026-11-04 上线新算价口径后，算价取「生效价」字段，这两个错误值被直接采用，
--   导致含小米的 5 个食谱显示 864.50 ~ 2522.83 元/100g。
--
-- 修正值来源（生产库真实采购记录）：
--   小米：2026-04-13 采购 3.6kg / 59.94 元 → 0.01665 元/g（字段 2 位小数 → 0.02）
--   牛脾：2026-04-14 采购 900g / 5.00 元   → 0.005556 元/g（字段 2 位小数 → 0.01）
--
-- 只在仍是错误值时修正，避免覆盖之后产生的正常价格。

UPDATE ingredient
SET
  current_price_per_purchase_unit = 0.02,
  effective_price_per_purchase_unit = 0.02,
  updated_at = CURRENT_TIMESTAMP
WHERE name = '小米'
  AND base_unit = 'G'
  AND purchase_to_base_ratio = 1
  AND current_price_per_purchase_unit = 38.30;

UPDATE ingredient
SET
  current_price_per_purchase_unit = 0.01,
  effective_price_per_purchase_unit = 0.01,
  updated_at = CURRENT_TIMESTAMP
WHERE name = '牛脾'
  AND base_unit = 'G'
  AND purchase_to_base_ratio = 1
  AND current_price_per_purchase_unit = 2.78;
