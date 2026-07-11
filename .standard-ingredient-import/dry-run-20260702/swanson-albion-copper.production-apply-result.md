# Swanson Albion 铜生产 Apply 结果

## 执行结果

- 执行状态：成功。
- 执行对象：`swanson-albion-copper-production-package/up.sql`。
- 执行方式：生产机远端 `psql`，事务包裹执行。
- 生产新增 ID：`69cf7ec3-e39c-4367-8994-46db8e6a9946`。
- 新增名称：`Swanson Albion 铜 2mg 片`。
- 类型：`SUPPLEMENT`。
- 品牌：`Swanson`。
- 型号：`Albion Copper, 2 mg, 300 tablets`。

## 执行前防呆

- `up.sql` SHA256：`5144eec933556eaa0bd0cf86b75cde63f2652d61ef9ce98beaa2349bf040d617`。
- 执行前精确同款数量：`0`。
- `up.sql` 仅包含 1 条 `INSERT INTO ingredient`。
- `up.sql` 未包含 `DROP`、`TRUNCATE`、`ALTER`、`UPDATE`、`DELETE` 或 `CREATE` 这类结构性/批量改动语句。
- 执行前备份存在：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-swanson-albion-copper-20260702-134925.dump`。

## 执行后验证

- 生产库按 ID 反查数量：`1`。
- 生产库按名称、类型、品牌、型号反查数量：`1`。
- 记录 ID 匹配：是。
- 包装证据存在：是。
- Supplement Facts 标签证据存在：是。
- 每份用量：`1 tablet`。
- 净含量：`300 tablets`。
- 铜含量：`2 mg`。
- 采购 SKU：`0` 条。
- 营养库映射：`0` 条。
- 标签分配：`0` 条。

## 回滚

如需回滚，仅执行生产包中的：

`swanson-albion-copper-production-package/down.sql`

该回滚 SQL 只删除 ID 为 `69cf7ec3-e39c-4367-8994-46db8e6a9946` 的 `ingredient` 记录。
