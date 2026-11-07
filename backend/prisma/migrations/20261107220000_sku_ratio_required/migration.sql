-- 采购商品必须有换算（2026-11-07 硬门禁）
--
-- 为什么下沉到数据库：代码里「建商品时校验换算 > 0」只覆盖走后端的入口，
-- 脚本、批量导入、直连库都能绕。而一旦某条商品的换算是空，
-- 采购数量就没法折算，只能退回原料档案（食材恒为 1），
-- 「2 盒」会记成「2 克」，库存和成本一起错 500 倍。
--
-- 生产库实测：303 条采购商品，0 条为空或 ≤ 0，所以可以安全加约束。
-- 先体检再 ALTER：不满足就整条迁移回滚，不要在半路炸。

DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM "procurement_sku"
  WHERE "purchase_to_base_ratio" IS NULL OR "purchase_to_base_ratio" <= 0;

  IF bad_count > 0 THEN
    RAISE EXCEPTION '还有 % 条采购商品的换算为空或不大于 0，请先修数据再跑这个迁移', bad_count;
  END IF;
END $$;

ALTER TABLE "procurement_sku"
  ALTER COLUMN "purchase_to_base_ratio" SET NOT NULL;

ALTER TABLE "procurement_sku"
  ADD CONSTRAINT "procurement_sku_purchase_to_base_ratio_positive"
  CHECK ("purchase_to_base_ratio" > 0);
