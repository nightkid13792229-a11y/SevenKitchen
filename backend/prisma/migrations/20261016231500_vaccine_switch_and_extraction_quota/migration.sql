-- 上线前风险控制两件（2026-10-16）：疫苗板块应急开关（B4）+ 识别每日上限（B5）
--
-- ── B4：疫苗板块的应急开关 ──────────────────────────────────────────────
--
-- 在此之前疫苗板块**没有任何开关**：上线后万一发现接种建议算错了，
-- 唯一的办法是改代码 → 重新发版 → 等审核（几小时到一天 ✗）。
--
-- 做法：挂在**已有的 global_config 单例**上（不新建表、不新建一套机制）——
-- 后台 `PUT /api/v1/admin/global-config` 本来就能改这张表（admin-web 的
-- 「全局配置」页也在用它），小程序走一个新的公开只读接口
-- `GET /api/v1/health/vaccine-feature`。
--
-- 默认 true 是**故意的**：这个开关是"应急关停"用的，不是"灰度放量"用的。
-- 这一列加上去之后，线上行为必须一个字都不变 —— 默认 false 就等于
-- 部署那一刻自己把功能关了 ✗（老板没让关的东西不能自己关）。
-- 真正"宁可少一个功能也不要给错建议"的那条兜底在**小程序侧**：
-- 拉不到开关时一律按"关"处理（见 miniapp/src/utils/vaccine-feature.ts）。
ALTER TABLE "global_config"
  ADD COLUMN IF NOT EXISTS "vaccine_feature_enabled" BOOLEAN NOT NULL DEFAULT true;

-- 关掉疫苗板块时给顾客看的一句话（可空：空 = 不解释，板块直接不出现）
ALTER TABLE "global_config"
  ADD COLUMN IF NOT EXISTS "vaccine_feature_notice" VARCHAR(200);

-- ── B5：健康报告识别的全局每日上限 ─────────────────────────────────────
--
-- 识别每张都要调模型（2~3 秒），用量涨起来被刷就是纯亏。
-- 上限存在同一张单例配置表里 → 后台改一下即时生效，不用改代码、不用重启 ✓。
-- 0 = 不限量（真被上限挡住时的退路）。
ALTER TABLE "global_config"
  ADD COLUMN IF NOT EXISTS "health_extraction_daily_limit" INTEGER NOT NULL DEFAULT 500;

-- 每日用量计数：主键 =（日期, 用途），一行 = 一天的计数。
--
-- 为什么不用内存计数：重启就丢 ✗；为什么不用 Redis：本项目 REDIS_URL
-- 默认没配（.env 里是注释掉的），不能把"防刷"押在一个没开的组件上 ✗。
--
-- 计数只有两条**单语句原子操作**（见 health-extraction-quota.service.ts）：
--   ① 当天第一次 create（主键冲突 = 别人先建好了，转 ②）
--   ② updateMany(where: { used_count: { lt: 上限 } }, used_count + 1)
-- 返回 0 行 = 已经到上限 → 直接拒绝，且**不会**把计数加上去。
-- 没有"先读再写"，所以同一秒来多少请求都穿不过去 ✓。
CREATE TABLE IF NOT EXISTS "health_extraction_daily_usage" (
  "usage_date" DATE NOT NULL,
  "scope" VARCHAR(40) NOT NULL,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "health_extraction_daily_usage_pkey" PRIMARY KEY ("usage_date", "scope")
);
