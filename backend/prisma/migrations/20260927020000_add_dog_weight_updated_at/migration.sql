-- 狗狗「当前体重」的最后更新时间
--
-- 背景（2026-09-27）：老板定了「体重超过 60 天就提醒顾客更新（但仍采纳该体重、不阻断下单）」。
-- 但 dog 表原本只有 created_at 和 birthday，**没有任何"体重是什么时候录的"信息**，
-- 这条规则算不出来。补一列，并回填历史数据，让规则对已有的 4500+ 只狗立刻可用。

ALTER TABLE "dog" ADD COLUMN "weight_updated_at" TIMESTAMP(3);

-- 回填策略（按可信度从高到低）：
--   1) 该狗最近一条体重记录的测量日期 —— 这是"体重是什么时候量的"最准确的来源
--   2) 该狗最近一条体重记录的创建时间 —— 测量日期缺失时的退路
--   3) 建档时间 —— 完全没有体重记录的狗，只能认为体重是建档时录的
UPDATE "dog" d
SET "weight_updated_at" = COALESCE(
  (
    SELECT MAX(w."record_date")::timestamp
    FROM "weight_record" w
    WHERE w."dog_id" = d."id"
  ),
  (
    SELECT MAX(w."created_at")
    FROM "weight_record" w
    WHERE w."dog_id" = d."id"
  ),
  d."created_at"
);
