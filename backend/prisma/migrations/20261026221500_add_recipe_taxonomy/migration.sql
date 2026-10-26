-- 食谱需求分类（2026-10-26）
--
-- 说明：本迁移为手写。
-- `prisma migrate dev` 无法生成它，因为历史迁移 20260109000000 在 shadow database
-- 重放时报 P3006（同一迁移里新增枚举值又立即使用该值）。
-- 因此这里只包含本次新增的对象，随后用 `migrate resolve --applied` 标记已应用。

-- CreateEnum
CREATE TYPE "taxonomy_node_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "recipe_taxonomy_kind" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_taxonomy_kind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_taxonomy_node" (
    "id" TEXT NOT NULL,
    "kind_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" VARCHAR(50) NOT NULL,
    "definition" VARCHAR(200) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" "taxonomy_node_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_taxonomy_node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_series_taxonomy" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "kind_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_series_taxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_taxonomy_kind_code_key" ON "recipe_taxonomy_kind"("code");

-- CreateIndex
CREATE INDEX "recipe_taxonomy_node_kind_id_parent_id_sort_idx" ON "recipe_taxonomy_node"("kind_id", "parent_id", "sort");

-- CreateIndex
CREATE INDEX "recipe_taxonomy_node_parent_id_idx" ON "recipe_taxonomy_node"("parent_id");

-- CreateIndex
CREATE INDEX "recipe_series_taxonomy_node_id_idx" ON "recipe_series_taxonomy"("node_id");

-- CreateIndex
CREATE INDEX "recipe_series_taxonomy_kind_id_idx" ON "recipe_series_taxonomy"("kind_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_series_taxonomy_series_id_kind_id_key" ON "recipe_series_taxonomy"("series_id", "kind_id");

-- AddForeignKey
ALTER TABLE "recipe_taxonomy_node" ADD CONSTRAINT "recipe_taxonomy_node_kind_id_fkey" FOREIGN KEY ("kind_id") REFERENCES "recipe_taxonomy_kind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_taxonomy_node" ADD CONSTRAINT "recipe_taxonomy_node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "recipe_taxonomy_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_series_taxonomy" ADD CONSTRAINT "recipe_series_taxonomy_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "recipe_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_series_taxonomy" ADD CONSTRAINT "recipe_series_taxonomy_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "recipe_taxonomy_node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
