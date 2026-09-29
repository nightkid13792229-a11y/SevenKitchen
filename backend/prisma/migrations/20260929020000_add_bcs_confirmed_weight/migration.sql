-- 阶段 C8：体况重评提醒需要「确认时的体重」作为参照
-- 规则：每 3 个月，或当前体重相对确认时体重变化 ≥5% → 提醒重新评估体况
ALTER TABLE "dog" ADD COLUMN "bcs_confirmed_weight_kg" DOUBLE PRECISION;
