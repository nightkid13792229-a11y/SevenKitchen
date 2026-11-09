-- 采购入库来源版本（A1）
-- 1) 台账行记录"同一来源的第几次写入"，供采购撤回后再完成时区分
ALTER TABLE "inventory_ledger_entry" ADD COLUMN "source_version" INTEGER NOT NULL DEFAULT 1;

-- 2) 唯一键从 (来源类型, 来源, 原料) 扩到包含版本
DROP INDEX "inventory_ledger_entry_source_type_source_id_ingredient_id_key";

CREATE UNIQUE INDEX "inventory_ledger_entry_source_ver_ing_key"
  ON "inventory_ledger_entry"("source_type", "source_id", "source_version", "ingredient_id");

-- 3) 采购记录记住"已入账到第几版"；撤回不递减
ALTER TABLE "purchase_record" ADD COLUMN "inbound_version" INTEGER NOT NULL DEFAULT 0;

-- 4) 历史回填：已有入库流水的采购记录标记为第 1 版
UPDATE "purchase_record" pr
SET "inbound_version" = 1
WHERE pr."inbound_version" = 0
  AND EXISTS (
    SELECT 1 FROM "inventory_ledger_entry" e
    WHERE e."source_type" = 'PURCHASE_RECORD'
      AND e."source_id" = pr."id"
      AND e."source_version" = 1
  );
