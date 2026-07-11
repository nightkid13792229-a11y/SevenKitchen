# 南美对虾虾仁 sourceForms 生产修正结果

## 执行结果

- 执行状态：成功。
- 执行对象：`south-american-shrimp-sourceform-correction-package/up.sql`。
- 执行方式：生产机远端 `psql`，单事务执行。
- 生产机执行时上传目录：`/tmp/sevenkitchen-standard-ingredient-import/south-american-shrimp-sourceform-correction-20260702-1757`。
- 执行后临时目录已清理。
- 修正营养档案 ID：`3a11ef71-44f1-4b74-8e10-9c28e6e6b259`。
- 修正原料 ID：`b60e08c5-73c0-4219-ba91-9afff5c5268f`。

## 执行前防呆

- `up.sql` SHA256：`fd9be44efc7f807332ad9dfd65390ff8b910499ca1444c9ab048efbcd600cbea`。
- `up.sql` 仅包含 2 条定点 `UPDATE`。
- `up.sql` 未包含 `DROP`、`TRUNCATE`、`ALTER`、`DELETE`、`CREATE` 或 `INSERT`。
- 执行前备份存在：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-sourceform-correction-20260702-175701.dump`。
- 执行前 `nutrition_food` sourceForms 不一致字段：18 个。
- 执行前示例：
  - 亚油酸实际值：`0.047 g`，sourceForms 标准值：`47 g`。
  - 赖氨酸实际值：`1.6 g`，sourceForms 标准值：`1600 g`。

## 执行后验证

- `nutrition_food` sourceForms 不一致字段：0 个。
- `ingredient` sourceForms 不一致字段：0 个。
- 执行后示例：
  - 亚油酸实际值：`0.047 g`，sourceForms 标准值：`0.047 g`。
  - 赖氨酸实际值：`1.6 g`，sourceForms 标准值：`1.6 g`。

## 回滚

如需只回滚本次元数据修正，执行：

`south-american-shrimp-sourceform-correction-package/down.sql`

该回滚 SQL 只恢复本次修正前的 sourceForms 元数据，不删除原料、不删除营养档案、不修改实际营养字段。
