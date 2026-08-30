# 南美对虾虾仁 sourceForms 元数据修正包

## 目的

- 修正 MEXT `10415` 南美对虾虾仁营养档案里的 `meta.sourceForms.*.canonicalValue`。
- 本次只修来源元数据，不修改实际营养计算字段。

## 修正范围

- `nutrition_food.nutrition_data`
- `ingredient.nutrition_profile`
- 目标 ID：
  - `nutrition_food`: `3a11ef71-44f1-4b74-8e10-9c28e6e6b259`
  - `ingredient`: `b60e08c5-73c0-4219-ba91-9afff5c5268f`

## 具体问题

原始导入代码已把 `mg` 正确换算成系统标准 `g` 写入实际营养字段，但 `sourceForms.canonicalValue` 仍保留了换算前数值。例如：

- 亚油酸实际值：`0.047 g`，元数据曾为 `47 g`。
- α-亚麻酸实际值：`0.003 g`，元数据曾为 `3 g`。
- 赖氨酸实际值：`1.6 g`，元数据曾为 `1600 g`。

## 安全边界

- 不新增、删除原料。
- 不修改实际营养字段。
- 不修改采购 SKU。
- 不做整库迁移或整库同步。
- 回滚 SQL 只恢复本次修正前的 sourceForms 元数据。
