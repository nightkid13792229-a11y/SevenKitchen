-- 生命阶段「已知晓」确认留痕
--
-- 背景：当狗狗的生命阶段与食谱适用阶段不一致时，小程序会提醒顾客；
-- 顾客点「我已知晓」后仍可继续下单。
--
-- 问题：此前这个确认**只存在于前端**（点完 showWarning=false 就没了），
-- 一旦狗狗因吃错生命阶段的粮出问题，我们拿不出"已经明确告知过顾客"的凭据。
--
-- 本迁移新增一张确认记录表，作为已尽告知义务的凭证：
-- 记录谁、哪只狗、哪张食谱、当时系统给出的结论、什么时候、从哪个页面确认。

CREATE TABLE "life_stage_acknowledgement" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    -- 确认时后端给出的匹配结论（MANUAL_MISMATCH / FALLBACK_ADULT / FALLBACK_FIRST）
    "match_type" TEXT NOT NULL,
    "dog_life_stage" TEXT,
    "recipe_life_stage" TEXT,
    -- 从哪个页面确认：order / diy / diy_sheet
    "source" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_stage_acknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "life_stage_acknowledgement_customer_id_acknowledged_at_idx"
    ON "life_stage_acknowledgement" ("customer_id", "acknowledged_at");

CREATE INDEX "life_stage_acknowledgement_dog_id_acknowledged_at_idx"
    ON "life_stage_acknowledgement" ("dog_id", "acknowledged_at");

CREATE INDEX "life_stage_acknowledgement_recipe_id_acknowledged_at_idx"
    ON "life_stage_acknowledgement" ("recipe_id", "acknowledged_at");
