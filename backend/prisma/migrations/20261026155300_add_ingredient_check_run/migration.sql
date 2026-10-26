-- CreateTable
-- AI 新增原料 · 按域核验报告（只追加）。result 存三档问题明细，
-- payload_hash 是实现「改一格即过期」的内容哈希（不能用 updated_at 代判）。
CREATE TABLE "ingredient_check_run" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "domain" VARCHAR(20) NOT NULL,
    "trigger" VARCHAR(20) NOT NULL,
    "rules_version" VARCHAR(40) NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "blocking_count" INTEGER NOT NULL DEFAULT 0,
    "exceptionable_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_check_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 读「某草稿某域的最新一份」走这个索引：draft_id + domain 定位，created_at 排序。
CREATE INDEX "ingredient_check_run_draft_id_domain_created_at_idx" ON "ingredient_check_run"("draft_id", "domain", "created_at");
