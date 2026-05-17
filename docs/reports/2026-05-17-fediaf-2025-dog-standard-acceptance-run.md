# FEDIAF 2025 犬标准入库验收执行记录

执行日期：2026-05-17

分支：`codex/fediaf-2025-dog-standard`

## 结论

FEDIAF 2025 犬标准数据闭环已在干净 schema 验收库中通过：

- seed 可写入 `1341` 条标准条目。
- 二次 seed 可按自然键保留 `1341` 条已有条目，未重复插入。
- audit 通过，确认 `46` 个营养素定义和 `1341` 条标准条目均符合预期。

全量 `prisma migrate deploy` 在干净空库上暂未通过，阻断点是历史迁移 `20260109000000_phase9_order_status_optimization`，不是本轮 FEDIAF 标准迁移。

## 执行库

创建了两个本地临时数据库用于验收：

- `sevenkitchen_fediaf_audit_20260517`：用于全量 migration 验证，停在历史 enum 迁移失败状态。
- `sevenkitchen_fediaf_audit_push_20260517`：用于当前 schema + FEDIAF seed/audit 验证，通过。

## Migration 验证结果

命令：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen_fediaf_audit_20260517 npx prisma migrate deploy
```

结果：失败。

失败迁移：

```text
20260109000000_phase9_order_status_optimization
```

失败原因：

```text
ERROR: unsafe use of new value "PURCHASING" of enum type "OrderStatus"
HINT: New enum values must be committed before they can be used.
```

根因：该历史 migration 在同一个迁移事务中执行：

1. `ALTER TYPE "OrderStatus" ADD VALUE 'PURCHASING' BEFORE 'IN_PRODUCTION';`
2. 立即 `UPDATE "order" SET status = 'PURCHASING' ...`

PostgreSQL 18 不允许在提交前使用新 enum 值。

## FEDIAF Seed 验证结果

为绕过历史 migration 链路阻断、单独验证 FEDIAF 数据闭环，使用当前 Prisma schema 推送到干净库：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen_fediaf_audit_push_20260517 npx prisma db push --accept-data-loss
```

结果：通过。

首次 seed：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen_fediaf_audit_push_20260517 npm run seed:fediaf-2025-dog-standard
```

结果：

```text
Upserted 1341 standard entries
Preserved 0 existing entries by natural key
Deleted 0 obsolete unreviewed entries
III-3a: 225
III-3b: 225
III-3c: 225
VII-17a: 264
VII-17b: 132
VII-17c: 135
VII-17d: 135
```

首次 audit：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen_fediaf_audit_push_20260517 npm run audit:fediaf-2025-dog-standard
```

结果：

```text
Version: found, nutrients: 46/46, entries: 1341/1341
III-3a: 225
III-3b: 225
III-3c: 225
VII-17a: 264
VII-17b: 132
VII-17c: 135
VII-17d: 135
PASS: FEDIAF 2025 dog standard import matches the approved seed summary and spot checks.
```

## 幂等性验证

二次 seed：

```text
Upserted 1341 standard entries
Preserved 1341 existing entries by natural key
Deleted 0 obsolete unreviewed entries
```

二次 audit：通过。

## 后续处理建议

1. FEDIAF 标准数据本身可进入人工审核页面验收。
2. 在合并或上线前，需要单独处理历史 migration 链路问题。
3. 不建议直接修改已应用过的历史 migration，除非确认目标环境没有记录该 migration checksum。更稳妥的做法是先盘点实际部署库的迁移状态，再决定是否做迁移重建、基线化或环境专用修复。
