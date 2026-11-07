-- 订单操作日志（2026-11-07）
--
-- 背景：客服改价、代客下单会把一整行审计文本（[客服改价] ISO时间 操作人:UUID 金额:x -> y 原因:…）
-- 追加进 order.admin_remark。于是「管理员备注」里混进了系统日志：
--   · 生产单打印按字数截断，正好切在 UUID 上，金额/原因全丢；
--   · 人写的备注被挤到日志后面，打印时整段看不到。
--
-- 本次：
--   1) 新建 order_operation_log，审计只写这里；
--   2) 把历史 admin_remark 里的 [客服改价] / [代客下单] 行搬进日志表（raw_text 保留原文，可回滚）；
--   3) 从 admin_remark 中删除这些行，其余人写内容原样保留（含空行）。
--
-- 说明：id 在应用层由 Prisma uuid() 生成；这里用 gen_random_uuid()（PG13+ 内置）。
-- 回滚：把 raw_text 按行拼回 admin_remark 即可（每条日志的 raw_text 就是原始那一行）。

CREATE TABLE "order_operation_log" (
    "id" VARCHAR(36) NOT NULL,
    "order_id" VARCHAR(36) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "operator_id" VARCHAR(64),
    "reason" VARCHAR(200),
    "before_amount" DECIMAL(10,2),
    "after_amount" DECIMAL(10,2),
    "raw_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_operation_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_operation_log_order_id_created_at_idx"
    ON "order_operation_log"("order_id", "created_at");

ALTER TABLE "order_operation_log"
    ADD CONSTRAINT "order_operation_log_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ① 历史审计行搬进日志表
WITH raw_lines AS (
    SELECT
        o.id AS order_id,
        btrim(line) AS line
    FROM "order" o
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(o.admin_remark, ''), E'\n') AS line
    WHERE btrim(line) LIKE '[客服改价]%'
       OR btrim(line) LIKE '[代客下单]%'
),
parsed AS (
    SELECT
        order_id,
        line,
        CASE
            WHEN line LIKE '[客服改价]%' THEN 'PRICE_ADJUST'
            ELSE 'ASSISTED_ORDER'
        END AS action,
        (regexp_match(line, '操作人:(\S+)'))[1] AS operator_id,
        (regexp_match(line, '原因:(.*)$'))[1] AS price_reason,
        (regexp_match(line, '备注:(.*)$'))[1] AS assisted_reason,
        (regexp_match(line, '金额:([0-9.]+)\s*->\s*([0-9.]+)'))[1]::numeric AS before_amount,
        (regexp_match(line, '金额:([0-9.]+)\s*->\s*([0-9.]+)'))[2]::numeric AS after_amount,
        (regexp_match(line, '^\[[^]]+\]\s+(\S+)'))[1] AS occurred_at
    FROM raw_lines
)
INSERT INTO "order_operation_log"
    (id, order_id, action, operator_id, reason, before_amount, after_amount, raw_text, created_at)
SELECT
    gen_random_uuid()::text,
    order_id,
    action,
    operator_id,
    left(COALESCE(price_reason, assisted_reason), 200),
    before_amount,
    after_amount,
    line,
    COALESCE(NULLIF(occurred_at, '')::timestamptz AT TIME ZONE 'UTC', CURRENT_TIMESTAMP)
FROM parsed;

-- ② 从备注里删掉这些审计行
UPDATE "order" o
SET admin_remark = NULLIF((
    SELECT string_agg(kept.line, E'\n' ORDER BY kept.ord)
    FROM (
        SELECT t.line, t.ord
        FROM regexp_split_to_table(COALESCE(o.admin_remark, ''), E'\n')
             WITH ORDINALITY AS t(line, ord)
        WHERE btrim(t.line) NOT LIKE '[客服改价]%'
          AND btrim(t.line) NOT LIKE '[代客下单]%'
    ) AS kept
), '')
WHERE EXISTS (
    SELECT 1
    FROM regexp_split_to_table(COALESCE(o.admin_remark, ''), E'\n') AS line
    WHERE btrim(line) LIKE '[客服改价]%'
       OR btrim(line) LIKE '[代客下单]%'
);
