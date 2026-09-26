-- 车间完工自动扣减原料库存：总开关
--
-- 背景：设计文档（docs/02_Roles_and_Core_Flows.md 3.5「库存状态机」）明确了
-- 「出库：Kitchen 备料扣减库存」，但小程序车间端走的那条完工路径
-- （StaffProductionService.completeProductionTask）既不生成原料用量快照，
-- 也不触发扣减 —— 实际效果是**原料库存只增不减**。
--
-- 本次补上这条链路。但扣减一旦开启，库里的原料数字就会开始往下走：
-- 如果账面本来就和实际不符，第一次扣完会让人以为系统算错了。
-- 因此做成**默认关闭**的总开关：先盘点一次把账面对齐实际，再打开。
--
-- 只新增列且有默认值，不改动既有数据，可安全重跑。

ALTER TABLE "global_config"
    ADD COLUMN IF NOT EXISTS "auto_deduct_inventory_on_production" BOOLEAN NOT NULL DEFAULT false;
