-- 食谱定制配置 · 扩充参数（2026-10-16）· 食谱定制重构 批次 1.4
--
-- ## 为什么加这些列
--
-- 老板要求「把所有的字段、算法等解耦出来」。加这一批之前，
-- 下面这些参数**写死在代码里**，改一个值要改代码、发版、部署：
--
--   · 附件大小上限 10MB —— 在**两个控制器里各写一遍**
--   · 排期往前找 45 天、占位冲突重试 5 次、订单号前缀 'CR'
--   · 后勤手工建食谱时的默认营养标准 / 能量密度 3200 / 工时 2
--   · 交付后自动完成天数、售后窗口、免费调整次数
--
-- 从这一批起，它们都从 `custom_recipe_config` 读，后台可改、改完即时生效。
--
-- ## 口径冲突：production_loss_rate
--
-- ⚠️ 这个字段**加了但暂不改现有取值**，因为项目里现在有两个不同的值：
--
--   · 设计器发布路径用 `1.05`（recipe-designer.service.ts 的
--     PUBLISHED_RECIPE_PRODUCTION_LOSS_RATE）
--   · 后台「手工建定制食谱」用 `1.07`（admin-custom-recipe.controller.ts 里写死）
--   · 小程序 DIY 制作单按 `7%` 展示给顾客
--
-- 也就是说：**同一条食谱，从设计器发布和从后台手工建，损耗率不一样**。
-- 改任何一边都会改变生产用料量，属于业务口径，需要老板拍板后再动。
-- 本次只把字段建好（默认取 1.07，与顾客在小程序里看到的一致），
-- 并在代码注释里标明冲突。**不修改任何现有的计算结果。**
--
-- ## 只加列、不改既有列
--
-- 全部是 ADD COLUMN 且都带 DEFAULT，因此对已有数据无影响；
-- 回滚只需 DROP 这些列（老代码不读它们，删掉不影响运行）。

-- CreateTable 之外的一次性 ALTER：给配置单例加参数
ALTER TABLE "custom_recipe_config"
    ADD COLUMN "daily_delivery_capacity" INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN "aftersale_window_days" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "free_revision_count" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "free_revision_window_days" INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN "auto_complete_days" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "require_customer_confirm" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "delivery_item_codes" TEXT[] DEFAULT ARRAY['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT']::TEXT[],
    ADD COLUMN "attachment_max_count" INTEGER NOT NULL DEFAULT 9,
    ADD COLUMN "attachment_max_size_mb" INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN "default_nutrition_standard" TEXT NOT NULL DEFAULT 'FEDIAF_2025',
    ADD COLUMN "default_energy_density_kcal_per_kg" INTEGER NOT NULL DEFAULT 3200,
    ADD COLUMN "production_loss_rate" DECIMAL(6,4) NOT NULL DEFAULT 1.07,
    ADD COLUMN "default_labor_hours" DECIMAL(6,2) NOT NULL DEFAULT 2,
    ADD COLUMN "schedule_lookahead_days" INTEGER NOT NULL DEFAULT 45,
    ADD COLUMN "slot_retry_times" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "order_no_prefix" VARCHAR(8) NOT NULL DEFAULT 'CR';
