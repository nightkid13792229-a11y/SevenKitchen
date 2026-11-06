-- 2026-11-06 补剂默认无需采购（数据回填）
--
-- 补剂都是库存商品，日采清单里默认按「无需采购」处理，采购员不用逐条点。
-- 只回填还没完成的订单需求采购清单；补货清单（STOCK_REPLENISHMENT）是人工挑着补库存的，
-- 不动；已经有采购记录的明细也不动，避免出现「无需采购 + 采购记录」并存。
-- 真要买补剂时，在小程序里点「取消」即可恢复成待采购，再手动记录。

UPDATE purchase_item pi
SET no_purchase_needed = true,
    no_purchase_reason = '补剂默认无需采购',
    no_purchase_marked_at = NOW()
FROM purchase_list pl
WHERE pi.purchase_list_id = pl.id
  AND pi.type = 'SUPPLEMENT'
  AND pi.no_purchase_needed = false
  AND pl.status = 'PENDING'
  AND pl.kind = 'ORDER_DEMAND'
  AND NOT EXISTS (
    SELECT 1
    FROM purchase_record pr
    WHERE pr.purchase_item_id = pi.id
  );
