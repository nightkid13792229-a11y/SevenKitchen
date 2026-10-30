-- 赠送单（2026-10-30）
--
-- 代客下单页此前把「赠送」当成「实收与报价不一致」处理：
-- 必须把实收改成 0 再手写差异原因，且仍要选一个假的收款渠道。
-- 赠送是常规动作，必须是一个**明确的结算方式**，而不是异常分支。
ALTER TABLE "custom_recipe_order"
ADD COLUMN "is_gift" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "gift_reason" VARCHAR(30),
ADD COLUMN "gift_note" VARCHAR(200);

COMMENT ON COLUMN "custom_recipe_order"."is_gift" IS
  '是否赠送单（0 元）。赠送单金额固定 0，不记收款渠道与流水号';
COMMENT ON COLUMN "custom_recipe_order"."gift_reason" IS
  '赠送原因 code：REPEAT_CUSTOMER / AFTERSALE_COMPENSATION / FRIEND_SERVICE / OTHER';
COMMENT ON COLUMN "custom_recipe_order"."gift_note" IS
  '赠送补充说明（选填；原因为 OTHER 时必填）';
