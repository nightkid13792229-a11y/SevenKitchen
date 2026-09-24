-- 补剂订单记录「加量」信息
--
-- portion_multiplier：本单买了几份。用途是运营分析（加量订单占比、加量用户画像），
--   以及分装工单核对袋数。
--
-- total_days：本单覆盖的总天数（= 制作单天数 × 份数）。**下单时快照，不做派生。**
--   它是"卖出去的补剂没有超出分装效期"的凭证 —— 如果事后改了加量配置，
--   派生计算会给出与当时不同的答案，凭证就失效了。
--
-- 两个字段都给默认值，历史订单自动落到 1 份 / NULL，不需要回填。

ALTER TABLE "supplement_order"
    ADD COLUMN "portion_multiplier" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "total_days" INTEGER;
