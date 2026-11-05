-- 原料价格写入闸（2026-11-06「单一来源」改造 · 阶段 A）
--
-- 背景：价格原来有两条实现 —— 写入时由报销审批写一次，读取时又由
-- IngredientPriceBasisService 按四档来源重新推导一次。改造后只在写入时确定价格，
-- 因此写入侧需要留下「这次为什么写入 / 为什么没写入」的痕迹。
--
--   ① 必须为正        —— 0 元 / 负数一律拒绝
--   ② 不得离谱        —— 与基准价相差超过 5 倍，拒绝
--   ③ 波动可控        —— 与基准价相差超过阈值（默认 8%），挂起待人工确认
--
-- gate_action: APPLY / HOLD / REJECT；gate_reason 给后台直接展示。
-- 可空：历史记录没有闸门结果，保持 NULL。

ALTER TABLE "ingredient_price_change"
  ADD COLUMN IF NOT EXISTS "gate_action" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "gate_reason" VARCHAR(300);
