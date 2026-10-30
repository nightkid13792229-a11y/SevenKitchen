-- 订单锅不再复制整份配方，改为引用来源订单明细
--
-- 背景：包装单元的 recipe_snapshot 原先是订单快照的完整副本。上游修正
-- 订单快照后，锅里的副本不会跟着变（2026-10-28 修完订单快照，只能把
-- 批次删掉重排）。改成「引用」后，一口锅只记自己独有的信息：
-- 净重、来源订单条目，以及"配方从哪条订单明细取"。
--
-- 存量数据保持原样：已有锅仍然存着完整快照（recipe_snapshot 非空、
-- 引用列为空），读取逻辑优先用引用、没有引用再用存着的快照。

ALTER TABLE "packaging_unit"
  ADD COLUMN "recipe_snapshot_ref_order_item_id" TEXT;

ALTER TABLE "packaging_unit"
  ALTER COLUMN "recipe_snapshot" DROP NOT NULL;

CREATE INDEX "packaging_unit_recipe_snapshot_ref_order_item_id_idx"
  ON "packaging_unit"("recipe_snapshot_ref_order_item_id");
