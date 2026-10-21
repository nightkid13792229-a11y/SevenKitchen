-- 2026-10-22 订单绑定食谱设计 · Task 1：Schema 与迁移
--
-- 全程 **additive**（由 `prisma migrate diff --from-schema-datamodel HEAD --to-schema-datamodel` 生成）：
--   · 新增枚举 RecipeDesignMode（CATALOG / ORDER）与 OrderRecipeDesignStatus
--     （EDITING / READY / DELIVERED / REMOVED）；
--   · recipe_series 加 design_mode（老系列全部落 CATALOG）、order_id、order_quantity；
--   · 新建订单待提交仓库 order_recipe_design（一单 N 槽位）。
-- 不删表、不删列、不改既有列类型；回滚只需 drop 新表 / 新列 / 新枚举。
--
-- 为什么必须这样：
--   · 设计上下文必须持久化在系列上，刷新后才能恢复订单与 N 份进度；
--   · 订单绑定系列不出现在产品线列表（靠 design_mode 过滤）；
--   · 一份订单设计 = 一个独立系列 + 草稿，槽位唯一，最终提交只消费本单 READY；
--   · 老系列 design_mode 默认 CATALOG，行为完全不变。

-- CreateEnum
CREATE TYPE "RecipeDesignMode" AS ENUM ('CATALOG', 'ORDER');

-- CreateEnum
CREATE TYPE "OrderRecipeDesignStatus" AS ENUM ('EDITING', 'READY', 'DELIVERED', 'REMOVED');

-- AlterTable
ALTER TABLE "recipe_series" ADD COLUMN     "design_mode" "RecipeDesignMode" NOT NULL DEFAULT 'CATALOG',
ADD COLUMN     "order_id" TEXT,
ADD COLUMN     "order_quantity" INTEGER;

-- CreateTable
CREATE TABLE "order_recipe_design" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "design_draft_id" TEXT NOT NULL,
    "recipe_id" TEXT,
    "source_recipe_id" TEXT,
    "source_recipe_version" INTEGER,
    "source_kind" VARCHAR(20),
    "status" "OrderRecipeDesignStatus" NOT NULL DEFAULT 'EDITING',
    "stage_warning" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_recipe_design_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_recipe_design_series_id_key" ON "order_recipe_design"("series_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_recipe_design_design_draft_id_key" ON "order_recipe_design"("design_draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_recipe_design_recipe_id_key" ON "order_recipe_design"("recipe_id");

-- CreateIndex
CREATE INDEX "order_recipe_design_order_id_idx" ON "order_recipe_design"("order_id");

-- CreateIndex
CREATE INDEX "order_recipe_design_dog_id_idx" ON "order_recipe_design"("dog_id");

-- CreateIndex
CREATE INDEX "order_recipe_design_status_idx" ON "order_recipe_design"("status");

-- CreateIndex
CREATE UNIQUE INDEX "order_recipe_design_order_id_series_id_key" ON "order_recipe_design"("order_id", "series_id");

-- CreateIndex
CREATE INDEX "recipe_series_design_mode_idx" ON "recipe_series"("design_mode");

-- CreateIndex
CREATE INDEX "recipe_series_order_id_idx" ON "recipe_series"("order_id");

-- AddForeignKey
ALTER TABLE "order_recipe_design" ADD CONSTRAINT "order_recipe_design_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "custom_recipe_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_recipe_design" ADD CONSTRAINT "order_recipe_design_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_recipe_design" ADD CONSTRAINT "order_recipe_design_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "recipe_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_recipe_design" ADD CONSTRAINT "order_recipe_design_design_draft_id_fkey" FOREIGN KEY ("design_draft_id") REFERENCES "design_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_recipe_design" ADD CONSTRAINT "order_recipe_design_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
