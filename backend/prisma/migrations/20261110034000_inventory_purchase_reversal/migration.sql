-- 采购撤回改为冲红（A2）：新增来源类型，负数行冲掉当前版本的入库
ALTER TYPE "InventorySourceType" ADD VALUE 'PURCHASE_RECORD_REVERSAL';
