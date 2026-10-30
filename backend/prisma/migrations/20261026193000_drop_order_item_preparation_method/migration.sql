-- 2026-10-26：下线订单「打碎/切丁」口感模块。
--
-- order_item.preparation_method 只存 CHOPPED/DICED，前端入口早已隐藏；
-- 生产库 308 条全部是默认 CHOPPED，已备份到
-- /tmp/order-preparation-method-backup-20261026.json。
--
-- cooking_method 是另一个独立字段，保留不动。
ALTER TABLE order_item
  DROP COLUMN IF EXISTS preparation_method;
