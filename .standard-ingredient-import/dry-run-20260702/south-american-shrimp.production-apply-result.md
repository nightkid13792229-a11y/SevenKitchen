# 南美对虾虾仁生产 Apply 结果

## 执行结果

- 执行状态：成功。
- 执行对象：`south-american-shrimp-production-package/up.sql`。
- 执行方式：生产机远端 `psql`，单事务执行。
- 生产机上传目录：`/tmp/sevenkitchen-standard-ingredient-import/south-american-shrimp-20260702-1617`。
- 新增原料 ID：`b60e08c5-73c0-4219-ba91-9afff5c5268f`。
- 新增原料名称：`南美对虾虾仁`。
- 新增营养档案 ID：`3a11ef71-44f1-4b74-8e10-9c28e6e6b259`。
- 新增营养映射 ID：`b8750796-28c7-44eb-a192-cec5437977de`。

## 执行前防呆

- `up.sql` SHA256：`2f7daa73e383aef55471d994e2e7add44a859f837955739a74fb39862fcce7f1`。
- 执行前原料 ID 记录：0 条。
- 执行前同名 `FOOD` 记录：0 条。
- 执行前 MEXT `10415` 营养档案：0 条。
- 执行前映射 ID 记录：0 条。
- 执行前相似虾类原料：0 条。
- `up.sql` 仅包含 3 条 `INSERT INTO`。
- `up.sql` 未包含 `DROP`、`TRUNCATE`、`ALTER`、`UPDATE`、`DELETE` 或 `CREATE`。
- 执行前备份存在：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-20260702-161706.dump`。

## 执行后验证

- 生产库按同名 `FOOD` 反查数量：`1`。
- 生产库按 MEXT `10415` 反查数量：`1`。
- 采购 SKU：`0` 条。
- 主映射存在：是。
- 主映射 `yieldRate`：`1`。
- 主映射 `isPrimary`：`true`。
- 营养档案状态：`VERIFIED`。
- 营养档案状态标签：`raw` / 生。
- 蛋白质：`19.6 g/100g`。
- 赖氨酸：`1.6 g/100g`。
- 亚油酸：`0.047 g/100g`。
- 维生素 E：`2.536 IU/100g`。
- 已知缺失项：氯、胆碱。

## 后续元数据修正

- 已执行 `south-american-shrimp-sourceform-correction-package/up.sql`。
- 修正内容：`meta.sourceForms.*.canonicalValue` 中 18 个 mg 到 g 换算后的来源元数据。
- 实际营养字段未变化。
- 修正结果详见 `south-american-shrimp-sourceform-correction.production-apply-result.md`。

## 回滚

如需回滚，仅执行生产包中的：

`south-american-shrimp-production-package/down.sql`

该回滚 SQL 只删除本次新增的 3 条记录：`nutrition_food_mapping`、`nutrition_food`、`ingredient`。
