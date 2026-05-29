# FEDIAF 2025 Migration 上线安全盘点

执行日期：2026-05-17

分支：`codex/fediaf-2025-dog-standard`

## 结论

当前分支可以在干净库上完整执行 `prisma migrate deploy`，但不能直接对已有的本地 `sevenkitchen` 数据库执行部署。

阻断原因有两类：

- 已应用 migration 的 checksum 与当前分支文件不一致。
- `sevenkitchen` 的 `_prisma_migrations` 中存在当前代码库没有的 migration：`202605110001_add_nutrition_governance`。

因此，针对已有数据库，下一步不能直接运行 `prisma migrate deploy`。需要先选择迁移历史处置方案。

## 只读检查命令

本地既有库：

```bash
DATABASE_URL=postgresql://postgres:***@localhost:5432/sevenkitchen bash scripts/check_migration_history.sh
DATABASE_URL=postgresql://postgres:***@localhost:5432/sevenkitchen npx prisma migrate status
```

干净验收库：

```bash
DATABASE_URL=postgresql://postgres:***@localhost:5432/sevenkitchen_fediaf_migrate_fixed_20260517 bash scripts/check_migration_history.sh
DATABASE_URL=postgresql://postgres:***@localhost:5432/sevenkitchen_fediaf_migrate_fixed_20260517 npx prisma migrate status
```

## 本地 `sevenkitchen` 结果

`check_migration_history.sh` 失败，发现 checksum mismatch：

- `20260109000000_phase9_order_status_optimization`
- `20260125192532_add_reimbursement_cost_details`
- `20260125205511_update_reimbursement_status_and_add_payment_proof`
- `20260125225305_remove_allergy_record_fields`
- `20260127183915_add_min_pot_weight_config`
- `20260131000000_add_favorite_recipe_table`

同时发现数据库中有本地缺失 migration：

- `202605110001_add_nutrition_governance`

`npx prisma migrate status` 也确认了分叉状态：

- last common migration：`20260130_add_is_custom_recipe`
- 当前分支有后续 pending migrations。
- 数据库里有代码库不存在的 `202605110001_add_nutrition_governance`。

`_prisma_migrations` 概况：

- active rows：31
- rolled back rows：3
- total rows：34

rolled back 记录：

- `20260109000000_phase9_order_status_optimization`，2 条 rolled back，另有 1 条 active。
- `20260131000000_add_favorite_recipe_table`，1 条 rolled back，另有 1 条 active。

## 干净验收库结果

`sevenkitchen_fediaf_migrate_fixed_20260517` 结果正常：

- `check_migration_history.sh`：通过。
- `npx prisma migrate status`：`Database schema is up to date!`

这说明当前分支的 migration 文件自身可以组成一条完整链路；风险来自已有数据库的历史记录，而不是 FEDIAF migration 本身。

## 可选处置方案

### 方案 A：干净环境重建

适用场景：测试、预发、可重建环境，或正式环境允许先导出数据再重建 schema。

做法：

1. 从当前分支全量执行 `prisma migrate deploy` 创建 schema。
2. 导入业务数据。
3. 执行 FEDIAF seed 和 audit。

优点：迁移历史最干净，后续维护成本最低。

风险：需要可靠的数据迁移/回填流程，不适合直接覆盖生产库。

### 方案 B：保留现有库，做 migration baseline/resolve

适用场景：已有库不能重建，需要沿用当前数据。

做法：

1. 先找回或补入 `202605110001_add_nutrition_governance` 对应 migration 文件。
2. 对 checksum mismatch 的历史 migration，确认当前库中的真实结构是否已经等价。
3. 对已经等价的 migration 使用 `prisma migrate resolve` 或等效基线化方案处理历史记录。
4. 再执行尚未应用的后续 migration。
5. 执行 FEDIAF seed 和 audit。

优点：保留现有数据。

风险：需要逐项核对结构，不能机械 resolve。处理错误会让 Prisma 历史继续失真。

### 方案 C：生产环境专用补丁

适用场景：目标生产库结构与本地库差异较大，且短期只需要上线 FEDIAF 标准管理。

做法：

1. 对生产库先运行 `check_migration_history.sh` 和 `migrate status`。
2. 根据生产库真实结构，编写最小 SQL 补丁，只创建 FEDIAF 标准表和必要索引。
3. 手动记录迁移状态或保留为环境专用 runbook。

优点：最小化本次上线影响面。

风险：长期会加剧 migration 历史分叉，需要后续治理。

## 推荐路径

本地/预发环境建议走方案 A，先用干净库完成端到端验收。

如果要部署到已有生产库，建议先执行方案 B 的第一步：找回 `202605110001_add_nutrition_governance`，再对 6 个 checksum mismatch migration 做结构核对。确认目标库真实结构后，再决定是否 baseline/resolve。
