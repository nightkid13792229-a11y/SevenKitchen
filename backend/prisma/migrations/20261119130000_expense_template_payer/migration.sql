-- 固定费用模板的默认付款方（设计文档 §5.4 / §6.4）。
--
-- Task 2 只给 expense_bill / expense_bill_payment 加了 payer_type，
-- 但模板新建/编辑时也要能选「公司账户 / 个人垫付」，生成的账单才能继承。
-- 纯结构变更，存量模板默认 PERSONAL，不改任何历史账单。

ALTER TABLE "expense_template" ADD COLUMN "payer_type" VARCHAR(10) NOT NULL DEFAULT 'PERSONAL',
ADD COLUMN "payer_user_id" VARCHAR(36);
