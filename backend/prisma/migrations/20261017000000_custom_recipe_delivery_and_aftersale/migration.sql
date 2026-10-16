-- 交付 / 售后 / 日历 / 问卷 四张表（2026-10-16）· 批次 1.6
--
-- ## 这批表解决什么
--
-- 在它们存在之前：
--   · **交付** = 往订单上写一个 `recipe_id` ＋ 改状态 ＋ 发条通知，
--     没有交付记录、没有内容留档。而且私密食谱是"就地覆盖同一行"，
--     营养师交付后再改配方，**顾客下次打开看到的内容会跟着变**，查不到改了哪。
--   · **售后完全没有** —— 通用售后页只认成品订单，定制单点进去是错的页面。
--     顾客交付后不满意，只能微信找客服，系统里一点痕迹都不留。
--   · **排期规则**只有"按天"的，没有"每周日固定休息"这种规律；
--     而且只有接单容量，没有交付容量。
--   · **定制问卷字段**写死在小程序里，老板连着改了 6 批，每次都要发版。
--
-- ## 四张表的分工
--
--   `custom_recipe_delivery`     一次交付 = 一条记录（含**内容快照**，可回溯）
--   `custom_recipe_aftersale`    售后单（独立于订单状态，避免互相覆盖）
--   `custom_recipe_weekday_rule` 按星期的接单/交付规律
--   `custom_recipe_form_field`   定制问卷字段（后台可配，改字段不用发版）
--
-- ## 安全边界
--
-- 全部**只新增**：不改任何既有表的结构，也不改任何既有列的类型。
-- 回滚直接 drop 这四张表 + 那个新枚举即可，不影响现有功能。
--
-- 另外顺带补了 4 列（见文件末尾）：订单的 `answers` / `form_schema_version`
-- 与排期的 `delivery_capacity` / `delivery_count`，都是 ADD COLUMN 带默认值。

-- CreateEnum
CREATE TYPE "CustomRecipeAftersaleStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PROCESSING', 'RESOLVED', 'REJECTED');

-- CreateTable：交付单
CREATE TABLE "custom_recipe_delivery" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    -- 第几次交付，从 1 开始；同一订单内唯一（见下方唯一索引）
    "version" INTEGER NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_version" INTEGER,
    -- 【核心】交付时刻冻结的内容快照 —— 之后改配方不影响顾客看到的这一版
    "content_snapshot" JSONB NOT NULL,
    -- 这一版包含哪些交付物（取值来自选项集 custom_recipe_delivery_item）
    "items" JSONB NOT NULL DEFAULT '[]',
    -- 营养师给定的喂食参数（几餐/每餐多少/做几天），决定采购量与制作量
    "feeding_params" JSONB,
    "delivered_by" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- PENDING / SENT / FAILED；失败由定时任务重试
    "notify_status" VARCHAR(20),
    "notified_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    -- CUSTOMER（顾客主动确认）/ AUTO（超期自动完成）
    "confirm_channel" VARCHAR(20),
    -- 被哪一版替换；null = 当前有效版本
    "replaced_by_delivery_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_recipe_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable：售后单
CREATE TABLE "custom_recipe_aftersale" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    -- 针对哪一版交付提出的（可空：交付前也可能提）
    "delivery_id" TEXT,
    -- 取值来自选项集 custom_recipe_aftersale_type
    "type" VARCHAR(48) NOT NULL,
    "status" "CustomRecipeAftersaleStatus" NOT NULL DEFAULT 'PENDING',
    "description" VARCHAR(1000) NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "handler_id" TEXT,
    "handle_note" VARCHAR(1000),
    "accepted_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    -- 处理结果是"调整食谱"时，指向重新交付的那一版
    "linked_delivery_id" TEXT,
    "reject_reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_recipe_aftersale_pkey" PRIMARY KEY ("id")
);

-- CreateTable：按星期的接单规则
CREATE TABLE "custom_recipe_weekday_rule" (
    -- 0 = 周日 … 6 = 周六（与 JS getDay() 一致，避免转换出错）
    "weekday" INTEGER NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    -- 留空表示用配置里的全局值
    "capacity" INTEGER,
    "delivery_capacity" INTEGER,
    "note" VARCHAR(100),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_recipe_weekday_rule_pkey" PRIMARY KEY ("weekday")
);

-- CreateTable：定制问卷字段
CREATE TABLE "custom_recipe_form_field" (
    "id" TEXT NOT NULL,
    -- BASIC / GOAL / ALLERGY / PREFERENCE / NOTE / ATTACHMENT
    "section_code" VARCHAR(32) NOT NULL,
    -- 字段码；有历史数据后不允许改，只能停用
    "key" VARCHAR(48) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    -- 受控白名单：SINGLE_CHOICE / MULTI_CHOICE / BOOLEAN / TEXT /
    -- TEXTAREA / DATE / ATTACHMENT / DERIVED_READONLY
    "type" VARCHAR(24) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "help_text" VARCHAR(200),
    "placeholder" VARCHAR(100),
    -- 指向 platform_option_set.code
    "option_set_code" VARCHAR(48),
    -- 条件显示，如 {"field":"hasFoodAllergy","equals":true}
    "visible_when" JSONB,
    "validation" JSONB,
    -- CORE:xxx = 写订单核心列（算法要用的强类型字段）；EXTRA = 写 order.answers
    "binding" VARCHAR(48) NOT NULL DEFAULT 'EXTRA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_recipe_form_field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_recipe_delivery_order_id_idx" ON "custom_recipe_delivery"("order_id");
CREATE INDEX "custom_recipe_delivery_recipe_id_idx" ON "custom_recipe_delivery"("recipe_id");
CREATE INDEX "custom_recipe_delivery_delivered_at_idx" ON "custom_recipe_delivery"("delivered_at");
-- 同一订单的版本号唯一 —— 这是"第几版"的可靠性来源
CREATE UNIQUE INDEX "custom_recipe_delivery_order_id_version_key" ON "custom_recipe_delivery"("order_id", "version");

CREATE INDEX "custom_recipe_aftersale_order_id_idx" ON "custom_recipe_aftersale"("order_id");
CREATE INDEX "custom_recipe_aftersale_status_idx" ON "custom_recipe_aftersale"("status");
CREATE INDEX "custom_recipe_aftersale_handler_id_idx" ON "custom_recipe_aftersale"("handler_id");

CREATE UNIQUE INDEX "custom_recipe_form_field_key_key" ON "custom_recipe_form_field"("key");
CREATE INDEX "custom_recipe_form_field_section_code_sort_order_idx" ON "custom_recipe_form_field"("section_code", "sort_order");

-- AddForeignKey
-- 订单删了，它的交付与售后记录一并删掉（同生共死）
ALTER TABLE "custom_recipe_delivery" ADD CONSTRAINT "custom_recipe_delivery_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "custom_recipe_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- 食谱被交付过就**不允许删**（RESTRICT）：删了会让顾客手里的方案指向空
ALTER TABLE "custom_recipe_delivery" ADD CONSTRAINT "custom_recipe_delivery_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custom_recipe_aftersale" ADD CONSTRAINT "custom_recipe_aftersale_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "custom_recipe_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- 交付记录被删时，售后单保留（只是不再指向具体版本）—— 售后痕迹比版本关联更重要
ALTER TABLE "custom_recipe_aftersale" ADD CONSTRAINT "custom_recipe_aftersale_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "custom_recipe_delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== 顺带补 4 列（都是 ADD COLUMN 且带默认值，对既有数据无影响）=====

-- 订单：配置化问卷里 binding=EXTRA 字段的回答
--
-- 为什么与核心列**双轨**：算法（过敏拦截、能量计算）依赖核心列是强类型的，
-- 全塞进 JSON 会让 `WHERE allergies && ARRAY['chicken']` 这类查询失效。
ALTER TABLE "custom_recipe_order" ADD COLUMN "answers" JSONB;
-- 下单时用的表单版本，便于回溯"当时问的是什么"
ALTER TABLE "custom_recipe_order" ADD COLUMN "form_schema_version" INTEGER;

-- 排期：当天的**交付**容量与已占用量
--
-- 与 capacity / booked_count（接单）分开：接单是收钱那一刻，
-- 交付是交出食谱那一天，对一个人来说这是两件事。
ALTER TABLE "custom_recipe_schedule" ADD COLUMN "delivery_capacity" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "custom_recipe_schedule" ADD COLUMN "delivery_count" INTEGER NOT NULL DEFAULT 0;
