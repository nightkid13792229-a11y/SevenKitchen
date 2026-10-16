-- 定制单状态机（2026-10-16）· 食谱定制重构 批次 1.2
--
-- ## 这次改什么
--
-- ① `CustomRecipeStatus` 增加 `COMPLETED`（已完成）
-- ② 新增 `CustomRecipeSubStage`（内部子阶段）
-- ③ `custom_recipe_order` 加一列 `sub_stage` 承载子阶段
--
-- ## 为什么必须加 COMPLETED
--
-- 此前 `DELIVERED` 是**死胡同**：它在代码的流转表里的可流转列表是**空数组**，
-- 也就是说交货之后系统再也不会有任何动作。于是两件事无处安放：
--   · 顾客点「确认收到」→ 没有目标状态可去
--   · 交付后的售后 → 没有"已完成"这个阶段可以回来
--
-- 老板 2026-10-16 定了：交付后 **3 天**顾客未确认则自动完成
-- （天数落在 `custom_recipe_config.auto_complete_days`，可后台调）。
--
-- ## 为什么子阶段不直接做成主状态
--
-- 主状态每加一档，**三个端都要改文案与展示** ——
-- 2026-10-04 加「已取消」时就漏了两处半，顾客在列表里看到英文 `CANCELLED`。
-- 而子阶段**只影响后台工作台**：顾客侧永远只看到「制作中」这一档。
-- 这样后台想细分成 6 个环节都不用动前端。
--
-- ## 注意
--
-- Postgres 的 `ALTER TYPE ... ADD VALUE` 在事务里可以执行，
-- 但**同一事务内不能使用**新值 —— 本迁移只添加、不做数据回填，因此安全。
-- 历史订单的 `sub_stage` 留空（NULL），后台按主状态展示即可。

-- AlterEnum：主状态加一档「已完成」
--
-- ⚠️ `BEFORE 'CANCELLED'` 不能省。
-- Postgres 的枚举值有**隐式排序**，不加 BEFORE 会追加到末尾，
-- 而 schema.prisma 里声明的是 `COMPLETED` 在 `CANCELLED` **前面** ——
-- 两边顺序不一致就产生了 schema 漂移（`migrate diff` 会报，
-- 而 `ORDER BY status` 的结果也会与预期不同）。
-- 2026-10-16 实测踩到：第一版没写 BEFORE，验证时发现顺序是 CANCELLED 在前。
ALTER TYPE "CustomRecipeStatus" ADD VALUE 'COMPLETED' BEFORE 'CANCELLED';

-- CreateEnum：内部子阶段
CREATE TYPE "CustomRecipeSubStage" AS ENUM (
    'PENDING_ACCEPT',
    'ACCEPTED',
    'NEED_INFO',
    'DESIGNING',
    'IN_REVIEW',
    'READY_TO_DELIVER'
);

-- AlterTable：定制单挂上子阶段
--
-- 可空是刻意的：历史订单没有子阶段，不该被强行塞一个默认值
-- （那会让后台误以为"这些单都还在待接单"）。
ALTER TABLE "custom_recipe_order" ADD COLUMN "sub_stage" "CustomRecipeSubStage";
