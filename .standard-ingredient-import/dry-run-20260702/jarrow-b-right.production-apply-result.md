# Jarrow Formulas B-Right 生产 Apply 结果

## 执行结果

- 执行状态：成功。
- 执行对象：`jarrow-b-right-production-package/up.sql`。
- 执行方式：生产机远端 `psql`，事务包裹执行。
- 生产新增 ID：`814a9199-f944-4c8f-b651-61f6e4eea765`。
- 新增名称：`Jarrow Formulas B-Right B族维生素复合胶囊`。
- 类型：`SUPPLEMENT`。
- 品牌：`Jarrow Formulas`。
- 型号：`B-Right Optimized B-Complex, 100 veggie capsules`。

## 执行前防呆

- `up.sql` SHA256：`7dcdac5cd265749e625a4b2208e9119439263a498bf36729f9da780df1df34f3`。
- 执行前精确同款数量：`0`。
- `up.sql` 仅包含 1 条 `INSERT INTO ingredient`。
- 执行前备份存在：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-jarrow-b-right-20260702-124615.dump`。

## 执行后验证

- 生产库精确同款数量：`1`。
- 记录 ID 匹配：是。
- 包装证据存在：是。
- Supplement Facts 标签证据存在：是。
- 每份用量：`1 capsule`。
- 净含量：`100 veggie capsules`。
- 采购 SKU：`0` 条。
- 营养库映射：`0` 条。
- 标签分配：`0` 条。

## 回滚

如需回滚，仅执行生产包中的：

`jarrow-b-right-production-package/down.sql`

该回滚 SQL 只删除 ID 为 `814a9199-f944-4c8f-b651-61f6e4eea765` 的 `ingredient` 记录。
