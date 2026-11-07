-- 2026-11-07 清掉「无需采购」与「采购记录」并存的历史数据
--
-- 事故：2026-11-05 的日采清单（先用 43 个原料逐个标「无需采购」），
-- 11-07 确认 AI 订单截图识别时又给其中 7 个原料生成了采购记录。
-- 详情页当时按「无需采购」优先显示，这 7 条记录被藏起来（已录入只剩 2 项），
-- 金额 282.13 却已经算进总数。
--
-- 代码侧已改为：生成采购记录时清标记（purchase-order-import.service.ts），
-- 详情页也改成「有记录就算已采购」。这条 migration 只修历史数据，让旧版小程序
-- 和后台（仍按标记优先显示）也能立刻看到正确状态。
--
-- 幂等：只动「已标无需采购 且 已经有采购记录」的明细；
-- 有记录就不允许再标无需采购（markPurchaseItemNoPurchase 已拦截），所以不会反复命中。
UPDATE purchase_item pi
SET no_purchase_needed = false,
    no_purchase_reason = NULL,
    no_purchase_marked_at = NULL,
    no_purchase_marked_by_id = NULL
WHERE pi.no_purchase_needed = true
  AND EXISTS (
    SELECT 1
    FROM purchase_record pr
    WHERE pr.purchase_item_id = pi.id
  );
