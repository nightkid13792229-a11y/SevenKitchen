# 本地开发库真实结构修正结果

## 目的

- 修正本地开发库中与当前 Prisma schema、生产库不一致的少量结构差异。
- 本次只作用于本地开发数据库，不修改生产库。
- 触发原因：DB alignment 检查已从“读取本地 schema 文件”升级为“读取真实数据库结构”。

## 修正范围

- `dog_breed.aliases`：补齐非空约束和默认空数组。
- `expense_bill_payment.payment_proof_urls`：补齐非空约束和默认空数组。
- `inventory_allocation.source_order_ids`：补齐非空约束和默认空数组。
- `nutrition_nutrient_definition.updated_at`：移除数据库默认值。
- `nutrition_standard_entry.updated_at`：移除数据库默认值。
- `nutrition_standard_version.updated_at`：移除数据库默认值。
- `purchase_record.actual_quantity`：补齐 `DECIMAL(18, 6)` 精度。
- `reimbursement.payment_proof_keys` / `payment_proof_urls`：统一默认空数组表达。

## 执行前检查

- `dog_breed.aliases` 空值：0。
- `expense_bill_payment.payment_proof_urls` 空值：0。
- `inventory_allocation.source_order_ids` 空值：0。
- `purchase_record` 行数：0。

## 执行结果

- 状态：成功。
- 执行对象：`local-db-live-schema-reconciliation.sql`。
- 执行环境：本地开发库 `sevenkitchen`。
- 执行方式：`psql` 单事务执行。

## 本地备份

- 备份文件：`/tmp/sevenkitchen-local-db-backups/pre-live-schema-reconciliation-20260702-183209.dump`
- 备份清单：`/tmp/sevenkitchen-local-db-backups/pre-live-schema-reconciliation-20260702-183209.dump.list`
- 备份大小：`3646642` bytes。
- 备份 SHA256：`29ba2177534ea19beeb431a531e029b916ddbf7b29bb2786fb165af14d2d13e7`。
- `pg_restore --list` 表数据条目数：`87`。

## 执行后验证

- 真实本地/生产只读 DB alignment：通过。
- Alignment ID：`963988492ba5`。
- 本地 schema hash：`f1b68f5fb9322d20e29501118fd2552fffed6725b72c10b23cc5bf204180dc4f`。
- 生产 schema hash：`f1b68f5fb9322d20e29501118fd2552fffed6725b72c10b23cc5bf204180dc4f`。
- 本地/生产 migration 数量：`115` / `115`。

## 剩余非阻塞差异

- `order` 行数不同：本地 `2`，生产 `292`。
- `inventory_ledger_entry` 行数不同：本地 `0`，生产 `338`。
- 这些是业务数据行数差异，不是结构差异，也不是生产包阻塞项。
