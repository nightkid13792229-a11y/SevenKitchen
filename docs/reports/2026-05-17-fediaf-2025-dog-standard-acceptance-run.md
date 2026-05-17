# FEDIAF 2025 犬标准入库验收执行记录

执行日期：2026-05-17

分支：`codex/fediaf-2025-dog-standard`

## 结论

FEDIAF 2025 犬标准数据闭环已在完整历史 migration 创建的干净库中通过：

- 全量 `prisma migrate deploy` 可在空库执行完成。
- seed 可写入 `1341` 条标准条目。
- 二次 seed 可按自然键保留 `1341` 条已有条目，未重复插入。
- audit 通过，确认 `46` 个营养素定义和 `1341` 条标准条目均符合预期。

## 执行库

本次主要验收库：

- `sevenkitchen_fediaf_migrate_fixed_20260517`：用于全量 migration + FEDIAF seed/audit 验证，通过。

前一轮曾创建的临时库仍保留用于排查记录：

- `sevenkitchen_fediaf_audit_20260517`
- `sevenkitchen_fediaf_audit_push_20260517`

## Migration 验证结果

命令：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen_fediaf_migrate_fixed_20260517 npx prisma migrate deploy
```

结果：通过。

本轮为跑通干净库迁移链，修复了若干历史迁移问题：

- `OrderStatus` 新 enum 值在同一事务内使用的问题。
- 早期迁移引用尚未创建的 `reimbursement`、`allergy_record`、`global_config`。
- 缺失的 `user` 基础表迁移。
- 缺失的 `ingredient`、健康档案、`global_config`、配送模板、标签等基础表迁移。
- 重复建表、重复外键、重复列添加的补缺迁移问题。

## FEDIAF Seed 验证结果

首次 seed：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen_fediaf_migrate_fixed_20260517 npm run seed:fediaf-2025-dog-standard
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
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen_fediaf_migrate_fixed_20260517 npm run audit:fediaf-2025-dog-standard
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

## Schema Drift 记录

`prisma migrate diff` 显示迁移后的数据库与当前 Prisma schema 仍存在跨业务历史漂移，主要涉及订单状态枚举、订单/食谱字段、若干旧索引/外键和字段类型。这些不属于本轮犬 FEDIAF 标准最小闭环，暂未纳入本次修改，避免把订单、采购、食谱运行时行为一起扩大变更。

## 上线注意

本轮为了修复干净库迁移链，修改了若干历史 migration。对于已经应用过这些 migration 的环境，直接部署会触发 Prisma migration checksum 差异，需要先盘点目标库 `_prisma_migrations` 状态，再制定 `migrate resolve`、基线化或环境专用修复方案。
