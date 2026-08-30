# 南美对虾虾仁生产包准备状态

## 结论

- 用户已要求该原料同时进入本地开发库和生产库。
- 本地开发库已写入并验收通过。
- 本地/生产 DB 对齐已通过，alignment id：`5543a5b1ca65`。
- 生产包已生成并已执行：`south-american-shrimp-production-package`。
- 生产包只包含新增记录，不包含整库迁移、整库同步、改表或批量更新。
- 生产执行前备份已生成并校验通过：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-20260702-161706.dump`。
- 生产库执行前查重结果为 0：同 ID、同名 FOOD、`MEXT:10415` 营养档案、映射 ID 均不存在。
- 生产库执行后验收通过：同名 FOOD 为 1 条，`MEXT:10415` 营养档案为 1 条，采购 SKU 为 0 条。

## 本地写入结果

- 原料 ID：`b60e08c5-73c0-4219-ba91-9afff5c5268f`。
- 原料名称：`南美对虾虾仁`。
- 类型：`FOOD`。
- 主营养档案 ID：`3a11ef71-44f1-4b74-8e10-9c28e6e6b259`。
- 营养来源：MEXT `10415` / `whiteleg shrimp, raw`。
- 主映射 ID：`b8750796-28c7-44eb-a192-cec5437977de`。
- 采购 SKU：0 条。

## 营养审阅结论

- FEDIAF 2025 犬必需营养覆盖率：`95.65%`。
- 阻塞问题：无。
- 已知缺失项：氯、胆碱。
- 关键归一化字段已在本地库反查：
  - 蛋白质：`19.6 g/100g`
  - 赖氨酸：`1.6 g/100g`
  - 亚油酸：`0.047 g/100g`
  - 钙：`68 mg/100g`
  - 维生素 E：`2.536 IU/100g`

## 生产包内容

- `ingredient`：1 条。
- `nutrition_food`：1 条。
- `nutrition_food_mapping`：1 条。
- `ingredient_tag_assignment`：0 条。
- `procurement_sku`：0 条。

## 安全边界

- 本次不做全库迁移或整库同步。
- 本次不创建采购 SKU。
- 本次生产侧已执行受控生产包 `up.sql`。
- 如需回滚，只执行同一生产包中的 `down.sql`。
