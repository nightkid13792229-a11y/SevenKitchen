-- 定制单：状态机需要的四个字段（2026-10-16）· 批次 1.2
--
-- 上一个迁移（`20261016234500_custom_recipe_state_machine`）加了
-- `COMPLETED` 状态与 `sub_stage` 列；但没有地方记"什么时候完成的"，
-- 于是这一档只是个标签，报表与售后窗口都算不出来。
--
-- 本次补四个字段：
--
--   · `completed_at`      —— 完成时间。报表与售后窗口的起算点。
--   · `auto_complete_at`  —— 交付时间 + 配置的自动完成天数。
--                            定时任务扫它把超期未确认的单转成 COMPLETED
--                            （老板 2026-10-16 定：3 天，后台可调）。
--   · `accepted_at`       —— 接单时间（后台点「接单」时写）。
--   · `handled_by`        —— 处理人。现阶段只有老板一个人接单/设计/交付，
--                            留痕用；将来加人时不用改表。
--
-- 全部可空、无默认值：
-- 历史订单没有这些时间点，**不该被塞一个假时间**（那会让报表与超期判断失真）。
-- 只加列，回滚直接 drop。
--
-- 注：Prisma schema 里这四个字段是后加的，声明位置在 `health_info_synced_at`
-- 之后；列顺序与声明顺序不一致**不影响 Prisma 行为**（它按列名读写），
-- 故不为此重建表。

ALTER TABLE "custom_recipe_order"
    ADD COLUMN "completed_at" TIMESTAMP(3),
    ADD COLUMN "auto_complete_at" TIMESTAMP(3),
    ADD COLUMN "accepted_at" TIMESTAMP(3),
    ADD COLUMN "handled_by" TEXT;

-- 定时任务要按 auto_complete_at 扫"到点该自动完成的单"，
-- 没有索引会全表扫。加一个部分索引：只索引非空值（绝大多数单是空的）。
CREATE INDEX "custom_recipe_order_auto_complete_at_idx"
    ON "custom_recipe_order"("auto_complete_at")
    WHERE "auto_complete_at" IS NOT NULL;
