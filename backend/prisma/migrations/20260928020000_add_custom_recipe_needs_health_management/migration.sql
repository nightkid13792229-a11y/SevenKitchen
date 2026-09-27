-- 定制订单增加「是否需要健康管理」独立标记
--
-- 背景（2026-09-28）：顾客勾选"需要健康管理"时，小程序把 targetGoal
-- 直接改写成 HEALTH_SUPPORT，于是「减重 + 需要健康管理」这种组合
-- 会把减重目标**丢掉** —— 营养师和 AI 都看不到顾客其实要减重。
--
-- 老板口径：减重/维持/增重以顾客选的为准。两者必须分开记录。
--
-- 存量数据不回填为 true：那 4 张老单无法区分"顾客勾了健康管理"
-- 还是"顾客本来就选了健康管理这一项"，不臆断。

ALTER TABLE "custom_recipe_order"
  ADD COLUMN IF NOT EXISTS "needs_health_management" BOOLEAN NOT NULL DEFAULT false;
