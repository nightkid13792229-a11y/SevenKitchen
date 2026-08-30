# 南美对虾虾仁 sourceForms 生产修正执行清单

## 当前状态

- 本地修正已执行并验证通过。
- 生产修正包已上传并执行成功。
- 生产执行前备份已生成并校验通过。
- 生产执行后 `nutrition_food` 和 `ingredient` 两边 sourceForms 均已对齐。

## 修正包文件

目录：`south-american-shrimp-sourceform-correction-package`

- `manifest.json`
- `review-summary.md`
- `up.sql`
- `down.sql`

生产机执行时上传目录：`/tmp/sevenkitchen-standard-ingredient-import/south-american-shrimp-sourceform-correction-20260702-1757`
执行后临时目录已清理。

## 修正包内容摘要

- `up.sql`
  - 仅包含 2 条定点 `UPDATE`。
  - 修正 `nutrition_food.nutrition_data` 中 MEXT `10415` 的 `meta.sourceForms`。
  - 修正 `ingredient.nutrition_profile` 中 `南美对虾虾仁` 的 `meta.sourceForms`。
  - 不包含 `DROP`、`TRUNCATE`、`ALTER`、`DELETE`、`CREATE`、`INSERT`。
- `down.sql`
  - 只恢复本次修正前的 sourceForms 元数据。

## 文件校验值

```text
up.sql            fd9be44efc7f807332ad9dfd65390ff8b910499ca1444c9ab048efbcd600cbea
down.sql          47f826e70910ef7ce6bf27c9251b2f46ab0d79dc4b5e49ae74e06f19e31c9b26
manifest.json     35c22868b9dfb2e78fc3cc28654519c1e526ca0aaf23c7d2c892c6fa5499a849
review-summary.md a3e0ab287c8f48833052b7afc906ce79be3bf2e67c76e8a03be613c85bf69fe2
```

## 生产备份

- 备份文件：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-sourceform-correction-20260702-175701.dump`
- 备份清单：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-sourceform-correction-20260702-175701.dump.list`
- 备份 manifest：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-sourceform-correction-20260702-175701.dump.manifest.json`
- 备份大小：`57279684` bytes。
- 备份 SHA256：`888672b6dfef914d0894c7d035aa33aad6141a1a4e8d236a05fd106d17884f98`。
- `pg_restore --list` 表数据条目数：`87`。

## 执行前确认

- [x] 已确认这是南美对虾虾仁生产数据的元数据修正。
- [x] 已确认实际营养字段已经是正确换算后的数值。
- [x] 已确认本次只修正 `meta.sourceForms.*.canonicalValue`。
- [x] 已确认执行前生产库备份已完成。
- [x] 已确认执行 `up.sql` 是生产写入动作。

## 安全边界

- 已执行 `up.sql`。
- 已修正 18 个 sourceForms 字段。
- 不修改实际营养字段。
- 不新增、删除原料。
- 不创建采购 SKU。
- 不做全库迁移或整库同步。
