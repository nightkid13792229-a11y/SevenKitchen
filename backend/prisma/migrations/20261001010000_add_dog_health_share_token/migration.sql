-- 健康信息分享令牌（2026-10-01，第三期）。
--
-- ── 老板定的六条 ────────────────────────────────────────────
--   1. 主要分享给换新医生，兼顾家人朋友
--   2. 内容三选一：摘要 / 报告原件 / 合并
--   3. 形式只要小程序分享卡片
--   4. **不设有效期**
--   5. 医疗信息默认全给，顾客可以逐项取消
--   6. 医生点开链接不需要登录
--
-- ── 为什么是"快照"而不是实时档案 ────────────────────────────
--
--   第 4 条"不设有效期"如果不配快照，就等于给了一个永久实时档案链接 ——
--   顾客今天分享给医生，半年后新加的化验单也会被同一个链接看到。
--   存快照之后：分享出去的是**生成那一刻的那一份**，之后档案怎么变都不影响它。
--   这也让第 5 条变得可靠：取消掉的项在快照里根本不存在，
--   以后加字段、改逻辑都不会让它意外漏出去。
--
--   撤回靠 revoked_at（非空即失效），不靠过期时间。
--
-- 与已有的 photo_share_token / recipe_share_token 是同一套做法，
-- 区别只在于这两张表存的是"指向哪条记录"，而这里直接存快照 JSON。

CREATE TABLE "dog_health_share_token" (
  "id"           TEXT         NOT NULL,
  "dog_id"       TEXT         NOT NULL,
  "token"        VARCHAR(32)  NOT NULL,
  "snapshot"     JSONB        NOT NULL,
  "content_mode" VARCHAR(16)  NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"   TEXT         NOT NULL,
  "revoked_at"   TIMESTAMP(3),

  CONSTRAINT "dog_health_share_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dog_health_share_token_token_key"
  ON "dog_health_share_token"("token");
CREATE INDEX "dog_health_share_token_token_idx"
  ON "dog_health_share_token"("token");
CREATE INDEX "dog_health_share_token_dog_id_idx"
  ON "dog_health_share_token"("dog_id");
CREATE INDEX "dog_health_share_token_revoked_at_idx"
  ON "dog_health_share_token"("revoked_at");

ALTER TABLE "dog_health_share_token"
  ADD CONSTRAINT "dog_health_share_token_dog_id_fkey"
  FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON COLUMN "dog_health_share_token"."snapshot" IS
  '生成时定稿的健康摘要快照；之后不随档案变化，保证"不设有效期"不会变成永久实时档案';
COMMENT ON COLUMN "dog_health_share_token"."content_mode" IS
  'SUMMARY=只要摘要 / FILES=只要报告原件 / BOTH=合并';
COMMENT ON COLUMN "dog_health_share_token"."revoked_at" IS
  '停止分享的时间；非空即失效（因为不设有效期，撤回必须能主动做）';
